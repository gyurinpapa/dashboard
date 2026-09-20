#!/usr/bin/env python3
"""Static / optional PostgreSQL parser checks only; never opens a database."""
import argparse
import hashlib
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
SQL=ROOT/'scripts/sql/create-meta-ads-completion-claim-fence.sql'
NAMES=['lock_meta_ads_completion_claim_v1','activate_meta_ads_claim_snapshot_v1','finalize_meta_ads_claim_job_v1']
PINS={
 'create-meta-ads-staging-contract.sql':'77700291945b9e68198f1c065c9fe8928bcd61584df0c8131d4307d4d2510531',
 'create-meta-ads-snapshot-materialization.sql':'3902332ee27eff683cff1e11276968c12784c50ac1037a08bb6574c186176dfa',
 'create-activate-meta-ads-snapshot-fanout.sql':'7bec4fe4761f4f2baaa11e572043fe4023cb8d01874eb15ea4294ee318a40427',
 'create-meta-ads-finalization-contract.sql':'a5247ad5f4f22b6e118efa7edaa4ad502973f0bfe3315068bd661bf0694f8bd0',
 'create-meta-ads-page-checkpoint-contract.sql':'7736da65d1bdb7e20f868ec1cf6783a843e2dfcca1b27c16ef4ce4c6f4374d6f',
 'create-meta-ads-materialization-handoff.sql':'b4a68489ddf97e7cad1da80b000b871fb02485ffab6c338b459d8ed0fb3b6164',
}
REQUIRED=[
 "p_finalizing IS NULL", "octet_length(p_payload::text)>524288",
 "p_payload-ARRAY['page','attempt_count','started_at','checkpoint_revision','checkpoint_digest','expected_rows'] <> '{}'::jsonb",
 "jsonb_typeof(p_payload->'attempt_count') IS DISTINCT FROM 'number'",
 "jsonb_typeof(p_payload->'started_at') IS DISTINCT FROM 'string'",
 "WHERE j.id=(p_payload#>>'{page,job_id}')::uuid FOR UPDATE;",
 "WHERE c.job_id=v_job.id FOR UPDATE;", "WHERE r.job_id=v_job.id FOR UPDATE;",
 "v_job.id IS NULL OR v_page.job_id IS NULL OR v_receipt.job_id IS NULL",
 "v_job.provider IS DISTINCT FROM 'meta_ads'", "v_job.data_level IS DISTINCT FROM 'creative'",
 "v_job.mode IS DISTINCT FROM 'snapshot_replace'",
 "v_receipt.page_envelope IS DISTINCT FROM p_payload->'page'",
 "v_page.scope_document IS DISTINCT FROM (v_receipt.page_envelope->>'scope_text')::jsonb",
 "v_page.scope IS DISTINCT FROM v_receipt.page_envelope->>'scope'",
 "v_page.storage_key IS DISTINCT FROM v_receipt.page_envelope->>'storage_key'",
 "v_page.collector_scope IS DISTINCT FROM v_receipt.page_envelope->>'collector_scope'",
 "v_receipt.checkpoint IS DISTINCT FROM v_page.checkpoint",
 "v_page.checkpoint->>'phase' IS DISTINCT FROM 'collected'",
 "v_page.checkpoint->'pending' IS DISTINCT FROM 'null'::jsonb",
 "v_page.checkpoint->'cursor' IS DISTINCT FROM 'null'::jsonb",
 "v_page.checkpoint->'revision' IS DISTINCT FROM p_payload->'checkpoint_revision'",
 "v_page.checkpoint->'digest' IS DISTINCT FROM p_payload->'checkpoint_digest'",
 "v_page.checkpoint->'totalRows' IS DISTINCT FROM to_jsonb(v_receipt.expected_rows)",
 "v_page.checkpoint->'nextRowIndex' IS DISTINCT FROM to_jsonb(v_receipt.expected_rows)",
 "p_payload->'expected_rows' IS DISTINCT FROM to_jsonb(v_receipt.expected_rows)",
 "v_job.attempt_count IS DISTINCT FROM (v_ident->>'attempt_count')::integer",
 "v_job.started_at IS DISTINCT FROM (v_ident->>'started_at')::timestamptz",
 "p_payload->'attempt_count' IS DISTINCT FROM v_ident->'attempt_count'",
 "(p_payload->>'started_at')::timestamptz IS DISTINCT FROM (v_ident->>'started_at')::timestamptz",
 "v_job_json->v_key IS DISTINCT FROM v_ident->v_key",
 "v_job.created_at IS DISTINCT FROM (v_ident->>'created_at')::timestamptz",
 "'id','workspace_id','advertiser_id','report_id','connection_id','created_by'",
 "'previous_ingestion_id','external_account_id','date_from','date_to'",
 "p.media_sync_job_id=v_job.id AND t.value->>'report_id'=p.report_id::text",
 "v_witness := public.lock_meta_ads_snapshot_fanout(v_base,p_finalizing);",
 "v_baselines IS DISTINCT FROM v_receipt.targets",
]

def verify(sql):
    plain=re.sub(r'--[^\n]*','',sql)
    assert plain.strip().startswith('BEGIN;') and plain.strip().endswith('ROLLBACK;')
    assert not re.search(r'\b(COMMIT|INSERT|UPDATE\s+public\.|DELETE|CREATE OR REPLACE|CREATE TABLE|ALTER TABLE|EXCEPTION WHEN)\b',plain,re.I)
    assert "SET LOCAL lock_timeout = '2s';" in plain and "SET LOCAL statement_timeout = '15s';" in plain
    assert re.findall(r'CREATE FUNCTION public\.(\w+)\(',plain)==NAMES
    blocks=re.findall(r'CREATE FUNCTION public\.(\w+)\([^;]+?AS \$function\$([\s\S]*?)\$function\$;',plain)
    assert [b[0] for b in blocks]==NAMES
    assert plain.count("RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER")==3
    assert plain.count("SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'")==3
    for i,name in enumerate(NAMES):
        signature=name+('(jsonb,boolean)' if i==0 else '(jsonb)')
        assert 'ALTER FUNCTION public.'+signature+' OWNER TO postgres;' in plain
        assert 'REVOKE ALL ON FUNCTION public.'+signature+' FROM PUBLIC, anon, authenticated'+(', service_role;' if i==0 else ';') in plain
    assert re.findall(r'GRANT EXECUTE ON FUNCTION public\.(\w+)\(jsonb\) TO service_role;',plain)==NAMES[1:]
    assert plain.count('GRANT ')==2 and plain.count('REVOKE ')==3 and plain.count('ALTER ')==3
    helper=blocks[0][1]
    for item in REQUIRED:assert item in helper,item
    order=['SELECT * INTO v_job','SELECT * INTO v_page','SELECT * INTO v_receipt',
           "RAISE EXCEPTION 'META_COMPLETION_CLAIM_CHANGED'",'v_witness := public.lock_meta_ads_snapshot_fanout',
           "RAISE EXCEPTION 'META_COMPLETION_TARGET_BASELINE_CHANGED'",'RETURN v_base;']
    assert all(t in helper for t in order)
    positions=[helper.index(t) for t in order];assert positions==sorted(positions)
    assert re.findall(r'\bRETURN\b',helper)==['RETURN']
    expected=[('false','RETURN public.activate_meta_ads_snapshot_fanout(v_base);'),
              ('true','SELECT * INTO STRICT v_result FROM public.finalize_media_sync_job(v_base);')]
    for (_,body),(flag,call) in zip(blocks[1:],expected):
        fence=f'v_base := public.lock_meta_ads_completion_claim_v1(p_payload,{flag});'
        assert fence in body and call in body and body.index(fence)<body.index(call)
    assert re.findall(r'public\.(\w+)\(',''.join(b[1] for b in blocks))==[
        'lock_meta_ads_snapshot_fanout','lock_meta_ads_completion_claim_v1','activate_meta_ads_snapshot_fanout',
        'lock_meta_ads_completion_claim_v1','finalize_media_sync_job']


def parse_sql(sql):
    from pglast import parser
    assert parser.get_postgresql_version()[0]==17
    parser.parse_sql_json(sql)
    blocks=json.loads(parser.parse_plpgsql_json(sql));assert len(blocks)==4
    count=0
    def walk(value):
        nonlocal count
        if isinstance(value,dict):
            if 'PLpgSQL_expr' in value:
                e=value['PLpgSQL_expr'];query=e['query'];mode=e['parseMode']
                if mode==2:query='SELECT '+query
                elif mode==3:query='SELECT '+query.split(':=',1)[1]
                else:assert mode==0
                parser.parse_sql_json(query);count+=1
            for child in value.values():walk(child)
        elif isinstance(value,list):
            for child in value:walk(child)
    walk(blocks)
    return count


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--postgres-parser',action='store_true');args=p.parse_args()
    for name,digest in PINS.items():assert hashlib.sha256((ROOT/'scripts/sql'/name).read_bytes()).hexdigest()==digest,name
    sql=SQL.read_text();verify(sql);cases=0
    changes=[(text,'false') for text in REQUIRED]+[
        ('ROLLBACK;','COMMIT;'),('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'),
        ("SET LOCAL lock_timeout = '2s';","SET LOCAL lock_timeout = '0';"),
        ("SET LOCAL statement_timeout = '15s';","SET LOCAL statement_timeout = '0';"),
        ('OWNER TO postgres;','OWNER TO service_role;'),('TO service_role;','TO authenticated;'),
        ('FROM PUBLIC, anon, authenticated, service_role;','FROM PUBLIC;'),
        ("'extensions', 'pg_temp'","'extensions'"),
        ('lock_meta_ads_completion_claim_v1(p_payload,false);',"lock_meta_ads_completion_claim_v1(p_payload,true);"),
        ('lock_meta_ads_completion_claim_v1(p_payload,true);',"lock_meta_ads_completion_claim_v1(p_payload,false);"),
        ('RETURN v_base;',"RETURN p_payload;"),
    ]
    for old,new in changes:
        assert old in sql
        try:verify(sql.replace(old,new,1))
        except AssertionError:cases+=1
        else:raise AssertionError('UNDETECTED_MUTATION:'+old)
    for injected in ('GRANT EXECUTE ON FUNCTION public.lock_meta_ads_completion_claim_v1(jsonb,boolean) TO service_role;',
                     "UPDATE public.media_sync_jobs SET status='done';"):
        try:verify(sql.replace('ROLLBACK;',injected+'\nROLLBACK;'))
        except AssertionError:cases+=1
        else:raise AssertionError('UNDETECTED_SCOPE_EXPANSION')
    result={'static_contract':'PASS','mutation_rejections':cases,'new_functions':3,'public_rpcs':2,'new_tables':0,
            'existing_sql_hashes':'UNCHANGED','db_executions':0,'sql_runtime':'NOT_TESTED'}
    if args.postgres_parser:result.update(postgres_parser='PASS',embedded_expressions=parse_sql(sql))
    print(json.dumps(result))

if __name__=='__main__':main()
