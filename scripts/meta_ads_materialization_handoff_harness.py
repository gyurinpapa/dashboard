#!/usr/bin/env python3
"""Prepare offline; opt in to a NEW private PostgreSQL 17.6 fixture cluster.

No production database/API, credentials, activation/finalization of Meta, or
worker gate. Existing harnesses are hash-pinned and retain their non-root guard.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import selectors
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
PAGE_PATH = ROOT/'scripts/meta_ads_page_checkpoint_harness.py'
PAGE_HASH = '27110bd63e7617703465cc11f893df20dd82396c4b78765cb2e977b7a7dddf3c'
PROTECTED = Path('/Users/damon/Projects/dashboard')
SQL_PATH = ROOT/'scripts/sql/create-meta-ads-materialization-handoff.sql'
EXPORT = 'scripts/export-meta-ads-materialization-handoff-fixture.ts'
RPCS = ('prepare_meta_ads_materialization_handoff_v1','materialize_meta_ads_handoff_batch_v1',
        'complete_meta_ads_materialization_handoff_v1')
HELPER = 'lock_meta_ads_materialization_handoff_v1'
FILES = ['src/lib/media-sync/meta-ads-materialization-handoff-contract.ts',
         'src/lib/media-sync/meta-ads-materialization-handoff-repository.ts',
         'scripts/verify-meta-ads-materialization-handoff-contract.ts',
         'scripts/verify-meta-ads-materialization-handoff-repository.ts',
         'scripts/verify-meta-ads-materialization-handoff-sql-contract.ts',
         str(SQL_PATH.relative_to(ROOT)), EXPORT,
         'scripts/meta_ads_materialization_handoff_harness.py',
         'scripts/verify_meta_ads_materialization_handoff_harness.py']


def require(ok, message):
    if not ok: raise RuntimeError(message)


def check_path(path):
    require(not path.absolute().is_relative_to(PROTECTED), 'PROTECTED_REPOSITORY_FORBIDDEN')
    require(not path.resolve().is_relative_to(PROTECTED), 'PROTECTED_REPOSITORY_FORBIDDEN')


def load_page():
    check_path(ROOT)
    require(hashlib.sha256(PAGE_PATH.read_bytes()).hexdigest()==PAGE_HASH, 'PAGE_HARNESS_DRIFT')
    spec=importlib.util.spec_from_file_location('meta_handoff_page',PAGE_PATH)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


page=load_page()
h=page.h


def candidate_body(sql):
    require(sql.rstrip().endswith('ROLLBACK;') and '\nCOMMIT;' not in sql, 'CANDIDATE_MUST_ROLLBACK')
    require(sql.count('CREATE TABLE public.meta_ads_materialization_handoffs (')==1
            and sql.count('CREATE FUNCTION public.')==4, 'NEW_OBJECT_SCOPE')
    return sql[sql.index('BEGIN;\n')+len('BEGIN;\n'):sql.rfind('ROLLBACK;')]


def prepare(directory):
    check_path(directory)
    _,baseline,sql,manifest=page.prepare(directory)
    node=shutil.which('node');require(node is not None,'NODE_REQUIRED')
    static=h.command([node,'--import','tsx','scripts/verify-meta-ads-materialization-handoff-sql-contract.ts'])
    require('META_HANDOFF_SQL_STATIC_CONTRACT=PASS' in static,'STATIC_CONTRACT_REQUIRED')
    fixture=json.loads(h.command([node,'--import','tsx',EXPORT]))
    for label,total in (('small',6),('large',2001)):
        f=fixture[label]
        require(f['input']['job']['id']==h.uid('meta_ads-job') and f['input']['context']==baseline['context']
                and f['input']['checkpoint']['totalRows']==total,'FIXTURE_SCOPE_MISMATCH')
        require(f['input']['targetReportIds']==sorted(h.uid(x) for x in h.report_labels('meta_ads')),'TARGET_SCOPE_MISMATCH')
    sql['handoff-candidate.sql']=candidate_body(SQL_PATH.read_text())
    (directory/'handoff-candidate.sql').write_text(h.preview(sql['handoff-candidate.sql']))
    (directory/'handoff-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n')
    manifest['files'].update({name:h.sha((ROOT/name).read_bytes()) for name in FILES})
    manifest.update(page_harness_sha256=PAGE_HASH,fixture_rows=[6,2001],meta_activation='DISABLED',
        limitations=h.load_authority()['limitations']+[
            'Same-claim restart only; reclaim/claim transfer is rejected.',
            'Fencing covers new Meta RPCs, not direct common RPC calls or privileged SQL.',
            'No real Meta API, Supabase REST/JWT, live worker, Meta activation/finalization or production performance proof.'])
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return fixture,baseline,sql,manifest


def rpc_sql(name,payload):
    require(name in RPCS,'RPC_NOT_ALLOWLISTED')
    return 'SET ROLE service_role; SELECT jsonb_build_object(\'value\',public.'+name+'('+h.json_sql(payload)+'));'


def rpc(cluster,db,name,payload):
    result=cluster.query(db,rpc_sql(name,payload))
    require(isinstance(result,dict) and 'value' in result,'RPC_RESULT_INVALID')
    return result['value']


def run_worker(cluster,db,fixture,target=None,stop_at=None):
    require(stop_at in (None,'prepare_before','prepare_after','batch_before','batch_after','complete_before','complete_after'),
            'FAULT_NOT_ALLOWLISTED')
    target=target or fixture['primary']
    require(target in fixture['input']['targetReportIds'],'TARGET_NOT_ALLOWLISTED')
    node=shutil.which('node');require(node is not None,'NODE_REQUIRED')
    proc=subprocess.Popen([node,'--import','tsx',EXPORT,'--rpc-worker'],cwd=ROOT,env=h.ENV,
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    selector=selectors.DefaultSelector();selector.register(proc.stdout,selectors.EVENT_READ)
    try:
        proc.stdin.write(json.dumps({'input':fixture['input'],'targetReportId':target})+'\n');proc.stdin.flush()
        for sequence in range(1,5):
            require(selector.select(30),'WORKER_IPC_TIMEOUT')
            line=proc.stdout.readline();require(bool(line),'WORKER_CLOSED_WITHOUT_RESULT')
            message=json.loads(line)
            if message.get('type')=='result':
                proc.stdin.close();require(proc.wait(timeout=10)==0,'WORKER_EXIT_FAILED')
                return message['result']
            require(message.get('type')=='rpc' and message.get('id')==sequence,'WORKER_MESSAGE_INVALID')
            name=message['name'];p=message['payload']
            require(name in RPCS and p.get('page')==fixture['page']['envelope']
                    and p.get('target_report_id')==target and p.get('target_report_ids')==fixture['input']['targetReportIds']
                    and p.get('expected_rows')==fixture['input']['checkpoint']['totalRows'],'WORKER_RPC_SCOPE')
            phase=('prepare','batch','complete')[RPCS.index(name)]
            if stop_at==phase+'_before':
                proc.kill();proc.wait(timeout=10);return {'interrupted':stop_at}
            result=rpc(cluster,db,name,p)
            if stop_at==phase+'_after':
                proc.kill();proc.wait(timeout=10);return {'interrupted':stop_at}
            proc.stdin.write(json.dumps({'id':sequence,'data':result,'error':None})+'\n');proc.stdin.flush()
        raise RuntimeError('WORKER_RPC_LIMIT')
    finally:
        selector.close()
        if proc.poll() is None:proc.kill();proc.wait(timeout=10)
        for stream in (proc.stdin,proc.stdout,proc.stderr):stream.close()


def witness(cluster,db):
    return {'common':h.database_witness(cluster,db),'page':page.witness(cluster,db),
        'handoffs':cluster.query(db,"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.job_id),'[]'::jsonb) FROM public.meta_ads_materialization_handoffs t;")}


def rejected(cluster,db,name,payload,marker):
    before=witness(cluster,db)
    cluster.query(db,rpc_sql(name,payload),expect_error=marker)
    require(witness(cluster,db)==before,'REJECTED_HANDOFF_MUTATED_STATE')


def inject_invalid_canonical_row(cluster,db,fixture):
    # row_fingerprint is GENERATED ALWAYS: a valid cost such as 999 merely
    # recalculates that hash. Use an invalid canonical value, retaining the
    # actual generated-column behavior and verifying the mutation took effect.
    job=fixture['input']['job']
    sql="WITH changed AS (UPDATE public.media_sync_staging_rows SET row=jsonb_set(row,'{cost}','-1'::jsonb) WHERE job_id="+\
        h.literal(job['id'])+" AND row_index=0 RETURNING row,row_fingerprint) SELECT jsonb_build_object('rows',count(*),"+\
        "'invalid_cost',coalesce(bool_and(row->'cost'='-1'::jsonb),false),"+\
        "'generated_fingerprint_valid',coalesce(bool_and(row_fingerprint IS NOT DISTINCT FROM "+\
        "encode(extensions.digest(convert_to(row::text,'UTF8'),'sha256'),'hex')),false),"+\
        "'canonical_shape_valid',bool_or(public.meta_ads_row_shape_valid(row,"+h.literal(job['external_account_id'])+","+\
        h.literal(job['date_from'])+"::date,"+h.literal(job['date_to'])+"::date))) FROM changed;"
    require(cluster.query(db,sql)=={'rows':1,'invalid_cost':True,'generated_fingerprint_valid':True,
                                   'canonical_shape_valid':False},'INVALID_CANONICAL_FIXTURE_NOT_ESTABLISHED')


def load_staging(cluster,db,fixture):
    p=fixture['page']
    for step in p['steps']:
        require(page.rpc(cluster,db,page.RPCS[1],step['prepare']) is True,'PAGE_PREPARE_FAILED')
        if step['pending']['pending']['rows']:
            result=page.rpc(cluster,db,page.RPCS[2],step['append'])
            require(result['inserted_rows']==len(step['pending']['pending']['rows']),'PAGE_APPEND_FAILED')
        require(page.rpc(cluster,db,page.RPCS[1],step['confirm']) is True,'PAGE_CONFIRM_FAILED')
    require(page.rpc(cluster,db,page.RPCS[0],p['envelope'])==p['final'],'STAGING_CHECKPOINT_MISMATCH')


def reset_materialization(cluster,db,fixture,clear_staging=False):
    # Only synthetic Meta fixture IDs, always under LocalCluster's ownership guard.
    key=h.literal(fixture['input']['job']['id'])
    snapshots=cluster.query(db,"SELECT coalesce(jsonb_agg(p.snapshot_ingestion_id),'[]'::jsonb) FROM public.media_sync_report_projections p WHERE p.media_sync_job_id="+key+';')
    snap_sql=','.join(h.literal(s) for s in snapshots) or 'NULL'
    sql='BEGIN; UPDATE public.media_sync_jobs SET raw_rows=0,normalized_rows=0,inserted_rows=0,failed_rows=0,progress=0,'+\
        "status='processing',attempt_count=1,error=null,finished_at=null,snapshot_ingestion_id=null WHERE id="+key+';'
    sql+='DELETE FROM public.meta_ads_materialization_handoffs WHERE job_id='+key+';'
    sql+='DELETE FROM public.report_rows WHERE ingestion_id IN ('+snap_sql+');'
    sql+='DELETE FROM public.media_sync_report_projections WHERE media_sync_job_id='+key+';'
    sql+='DELETE FROM public.report_ingestions WHERE id IN ('+snap_sql+');'
    if clear_staging:
        sql+='DELETE FROM public.meta_ads_page_checkpoints WHERE job_id='+key+';'
        sql+='DELETE FROM public.media_sync_staging_rows WHERE job_id='+key+';'
    cluster.query(db,sql+'COMMIT;')


def protected_witness(cluster,db):
    # All report pointers, connection timestamps, mappings and original sentinels.
    data=cluster.query(db,"SELECT jsonb_build_object('reports',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.reports t),"
        "'connections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.media_connections t),"
        "'mappings',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.report_media_connections t),"
        "'sentinels',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.report_rows t WHERE t.row ? 'fixture_sentinel'));" )
    return {'data':data,'legacy':{p:h.provider_witness(cluster,db,p) for p in ('naver_searchad','google_ads')}}


def verify_materialized(cluster,db,fixture):
    key=h.literal(fixture['input']['job']['id']);total=fixture['input']['checkpoint']['totalRows']
    result=cluster.query(db,"SELECT jsonb_build_object('projections',(SELECT count(*) FROM public.media_sync_report_projections p WHERE p.media_sync_job_id="+key+"),"
        "'ingestions',(SELECT count(*) FROM public.media_sync_report_projections p JOIN public.report_ingestions i ON i.id=p.snapshot_ingestion_id WHERE p.media_sync_job_id="+key+" AND i.status='success' AND i.row_count="+str(total)+"),"
        "'rows',(SELECT count(*) FROM public.media_sync_report_projections p JOIN public.report_rows r ON r.ingestion_id=p.snapshot_ingestion_id WHERE p.media_sync_job_id="+key+"),"
        "'mismatches',(SELECT count(*) FROM public.media_sync_report_projections p JOIN public.media_sync_staging_rows s ON s.job_id=p.media_sync_job_id "
        "LEFT JOIN public.report_rows r ON r.ingestion_id=p.snapshot_ingestion_id AND r.row_index=s.row_index WHERE p.media_sync_job_id="+key+
        " AND (r.id IS NULL OR r.row IS DISTINCT FROM s.row)),"
        "'job',(SELECT jsonb_build_object('status',j.status,'progress',j.progress,'raw',j.raw_rows,'finished',j.finished_at) FROM public.media_sync_jobs j WHERE j.id="+key+"));")
    require(result=={'projections':2,'ingestions':2,'rows':2*total,'mismatches':0,
                     'job':{'status':'processing','progress':70,'raw':total,'finished':None}},'MATERIALIZATION_WITNESS_INVALID')


def runtime_suite(cluster,fixture,baseline_fixture,sql):
    baseline,candidate=h.DATABASES
    page.initialize_databases(cluster,sql)
    for db in h.DATABASES:cluster.query(db,'BEGIN;'+sql['page-candidate.sql']+'COMMIT;')
    excluded=','.join(h.literal(n) for n in (*RPCS,HELPER))
    definition_sql="SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname NOT IN ("+excluded+');'
    definitions=cluster.query(candidate,definition_sql)
    cluster.query(candidate,'BEGIN;'+sql['handoff-candidate.sql']+'COMMIT;')
    require(cluster.query(candidate,definition_sql)==definitions,'EXISTING_DEFINITIONS_OR_ACL_CHANGED')
    acl=cluster.query(candidate,"SELECT jsonb_build_object('rls',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.meta_ads_materialization_handoffs'::regclass),"
        "'bad_table',(SELECT count(*) FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_table_privilege(r,'public.meta_ads_materialization_handoffs','SELECT,INSERT,UPDATE,DELETE')),"
        "'bad_rpc',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r "
        "WHERE n.nspname='public' AND p.proname IN ("+excluded+") AND has_function_privilege(r,p.oid,'EXECUTE') IS DISTINCT FROM (r='service_role' AND p.proname<>"+h.literal(HELPER)+")));")
    require(acl=={'rls':True,'bad_table':0,'bad_rpc':0},'NEW_PRIVILEGE_SCOPE_INVALID')
    for provider in ('naver_searchad','google_ads'):
        for db in h.DATABASES:h.run_pipeline(cluster,db,baseline_fixture,provider)
        require(h.provider_witness(cluster,baseline,provider)==h.provider_witness(cluster,candidate,provider),'LEGACY_PROVIDER_CHANGED')
    protected=protected_witness(cluster,candidate)
    small=fixture['small'];load_staging(cluster,candidate,small)
    p=small['preparePayload'];key=h.literal(small['input']['job']['id']);cases=0
    for change,marker in [({'checkpoint_digest':'0'*64},'META_HANDOFF_CHECKPOINT_INVALID'),
                          ({'checkpoint_revision':p['checkpoint_revision']+2},'META_HANDOFF_CHECKPOINT_INVALID'),
                          ({'expected_rows':7},'META_HANDOFF_CHECKPOINT_INVALID'),
                          ({'target_report_ids':[small['primary']]},'META_HANDOFF_TARGET_SET_CHANGED'),
                          ({'target_report_ids':list(reversed(p['target_report_ids']))},'META_HANDOFF_TARGET_SET_CHANGED'),
                          ({'target_report_id':h.uid('csv')},'META_HANDOFF_TARGET_SET_CHANGED'),
                          ({'secret':'forbidden'},'META_HANDOFF_INPUT_INVALID')]:
        rejected(cluster,candidate,RPCS[0],dict(p,**change),marker);cases+=1
    # Invalid canonical content must fail even with a correctly regenerated hash.
    inject_invalid_canonical_row(cluster,candidate,small)
    rejected(cluster,candidate,RPCS[0],p,'META_HANDOFF_VALIDATION_FAILED');cases+=1
    original=small['page']['steps'][0]['pending']['pending']['rows'][0]['row']
    cluster.query(candidate,'UPDATE public.media_sync_staging_rows SET row='+h.json_sql(original)+' WHERE job_id='+key+' AND row_index=0;')
    # First prepare's receipt/counters/snapshot must all roll back together.
    before=witness(cluster,candidate)
    cluster.query(candidate,'BEGIN;'+rpc_sql(RPCS[0],p)+"DO $$ BEGIN RAISE EXCEPTION 'META_HANDOFF_TEST_ROLLBACK'; END $$; COMMIT;",expect_error='META_HANDOFF_TEST_ROLLBACK')
    require(witness(cluster,candidate)==before,'PREPARE_ROLLBACK_CHANGED_STATE');cases+=1
    # Independent sessions race. Exactly one creates the durable receipt/snapshot.
    barrier=threading.Barrier(2)
    def racer():
        barrier.wait(timeout=10);return rpc(cluster,candidate,RPCS[0],p)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(racer) for _ in range(2)];results=[f.result(timeout=45) for f in futures]
    require(sorted(x['handoff_created'] for x in results)==[False,True]
            and len({x['materialization']['snapshot_ingestion_id'] for x in results})==1,'PREPARE_RACE_NOT_SERIALIZED');cases+=1
    snapshot=results[0]['materialization']['snapshot_ingestion_id']
    batch=dict(p,snapshot_ingestion_id=snapshot,batch_start=0,batch_size=2000)
    complete=dict(p,snapshot_ingestion_id=snapshot)
    rejected(cluster,candidate,RPCS[2],complete,'MSMM_MATERIALIZATION_CONFLICT');cases+=1
    rejected(cluster,candidate,RPCS[1],dict(batch,snapshot_ingestion_id=h.uid('wrong')),'META_HANDOFF_BATCH_SCOPE_INVALID');cases+=1
    cluster.query(candidate,'UPDATE public.media_sync_jobs SET attempt_count=2 WHERE id='+key+';')
    for name,payload in zip(RPCS,(p,batch,complete)):
        rejected(cluster,candidate,name,payload,'META_HANDOFF_CLAIM_OR_SCOPE_CHANGED');cases+=1
    cluster.query(candidate,'UPDATE public.media_sync_jobs SET attempt_count=1 WHERE id='+key+';')
    report=h.literal(small['secondary'])
    before=witness(cluster,candidate)
    cluster.query(candidate,'BEGIN; UPDATE public.reports SET published_ingestion_id=null WHERE id='+report+';'+
                  rpc_sql(RPCS[0],p)+'COMMIT;',expect_error='META_HANDOFF_TARGET_BASELINE_CHANGED')
    require(witness(cluster,candidate)==before,'POINTER_DRIFT_ROLLBACK_CHANGED_STATE');cases+=1
    for name,payload in ((RPCS[1],batch),(RPCS[2],complete)):
        before=witness(cluster,candidate)
        cluster.query(candidate,'BEGIN;'+rpc_sql(name,payload)+"DO $$ BEGIN RAISE EXCEPTION 'META_HANDOFF_TEST_ROLLBACK'; END $$; COMMIT;",expect_error='META_HANDOFF_TEST_ROLLBACK')
        require(witness(cluster,candidate)==before,'BATCH_OR_COMPLETE_ROLLBACK_CHANGED_STATE');cases+=1
        rpc(cluster,candidate,name,payload)
        if name==RPCS[1]:
            rejected(cluster,candidate,name,payload,'batch start does not match the processing checkpoint');cases+=1
    before=witness(cluster,candidate)
    require(rpc(cluster,candidate,RPCS[2],complete)['idempotent'] is True,'COMPLETE_REPLAY_FAILED')
    require(witness(cluster,candidate)==before,'COMPLETE_REPLAY_MUTATED_STATE');cases+=1
    for fault in ('prepare_before','prepare_after','batch_before','batch_after','complete_before','complete_after'):
        reset_materialization(cluster,candidate,small)
        require(run_worker(cluster,candidate,small,stop_at=fault)=={'interrupted':fault},'FAULT_NOT_REACHED')
        if fault=='batch_after':
            before=witness(cluster,candidate);page.restart_owned_cluster(cluster)
            require(witness(cluster,candidate)==before,'POSTGRES_RESTART_CHANGED_STATE')
        result=run_worker(cluster,candidate,small)
        require(result['materializationComplete'] and not result['activationAllowed'] and not result['finalizationAllowed'],'PROCESS_RESUME_FAILED');cases+=1
    # Actual 2,001-row checkpoint: exactly two batches across fresh processes and DB restart.
    reset_materialization(cluster,candidate,small,clear_staging=True)
    large=fixture['large'];started=time.monotonic();load_staging(cluster,candidate,large)
    first=run_worker(cluster,candidate,large)
    require(not first['materializationComplete'] and first['nextRowIndex']==2000,'LARGE_FIRST_BATCH_INVALID')
    page.restart_owned_cluster(cluster)
    second=run_worker(cluster,candidate,large)
    require(second['materializationComplete'] and second['nextRowIndex']==2001
            and first['snapshotIngestionId']==second['snapshotIngestionId'],'LARGE_RESUME_INVALID')
    wall=round(time.monotonic()-started,3);cases+=1
    # Reproduce useful six-row, two-projection final evidence without activation.
    reset_materialization(cluster,candidate,large,clear_staging=True);load_staging(cluster,candidate,small)
    for target in (small['secondary'],small['primary']):
        require(run_worker(cluster,candidate,small,target)['materializationComplete'],'FINAL_MATERIALIZATION_FAILED')
    verify_materialized(cluster,candidate,small);cases+=1
    before=witness(cluster,candidate)
    require(run_worker(cluster,candidate,small)['completion']['idempotent'],'FINAL_REPLAY_FAILED')
    require(witness(cluster,candidate)==before,'FINAL_REPLAY_CHANGED_STATE')
    final_protected=protected_witness(cluster,candidate)
    require(final_protected==protected,'CSV_LEGACY_POINTER_OR_CONNECTION_CHANGED')
    require(cluster.query(candidate,definition_sql)==definitions,'FINAL_DEFINITIONS_CHANGED')
    return {'status':'PASS','runtime_cases':cases,'same_claim_process_restart':True,'postgres_restart':True,
            'prepare_two_sessions':True,'actual_rollback':True,'claim_transfer':'REJECTED','canonical_rows':6,'fetched_rows':7,
            'projections':2,'exact_materialized_rows':12,'existing_definitions_acl':'UNCHANGED','naver_google_comparison':'PASS',
            'csv_legacy_and_pointers_unchanged':True,'meta_job_status':'processing','meta_activation':'DISABLED',
            'meta_finalization':'DISABLED','live_meta_api_calls':0,
            'performance':{'rows':2001,'status':'PASS','wall_seconds':wall,'materialization_batch_size':2000,'production_latency_equivalence':False}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare',required=True,type=Path)
    parser.add_argument('--run-isolated',action='store_true')
    parser.add_argument('--pg-bin',type=Path)
    args=parser.parse_args()
    require(args.run_isolated==(args.pg_bin is not None),'RUN_FLAG_AND_PG_BIN_MUST_BE_SUPPLIED_TOGETHER')
    fixture,baseline,sql,manifest=prepare(args.prepare)
    print(json.dumps({'prepare':'PASS','db_executions':0,'runtime':'NOT_RUN','output':str(args.prepare.resolve())}),flush=True)
    if not args.run_isolated:return
    cluster=h.LocalCluster(args.pg_bin)
    try:
        cluster.start();result=runtime_suite(cluster,fixture,baseline,sql);result['limitations']=manifest['limitations']
        (args.prepare/'runtime-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
    finally:cluster.stop()


if __name__=='__main__':main()
