#!/usr/bin/env python3
"""Offline preparation; optional NEW PostgreSQL 17.6 cluster only.

Same-claim process/DB restart, not reclaim or production integration. No database
is started by default. SQL previews fail before DDL. No host/URL/env-file options.
Uses the previous isolated harness unchanged, pinned before importing its code.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
BASE_PATH = ROOT / 'scripts/meta_ads_isolated_harness.py'
BASE_HASH = '64e4d2e45cacc255a531d519d61f3f22fe58ecd781d3208f22af80037dd1e55e'
SQL_PATH = ROOT / 'scripts/sql/create-meta-ads-page-checkpoint-contract.sql'
EXPORT = 'scripts/export-meta-ads-page-checkpoint-fixture.ts'
RPCS = ('load_meta_ads_page_checkpoint_v1', 'compare_and_set_meta_ads_page_checkpoint_v1', 'append_meta_ads_checkpoint_page_v1')
PROTECTED = Path('/Users/damon/Projects/dashboard')
NEW_FILES = ['src/lib/media-sync/meta-ads-page-checkpoint-repository.ts', str(SQL_PATH.relative_to(ROOT)),
             'scripts/verify-meta-ads-page-checkpoint-repository.ts', 'scripts/verify-meta-ads-page-checkpoint-sql-contract.ts',
             EXPORT, 'scripts/meta_ads_page_checkpoint_harness.py', 'scripts/verify_meta_ads_page_checkpoint_harness.py']


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def check_path(path):
    require(not path.absolute().is_relative_to(PROTECTED) and not path.resolve().is_relative_to(PROTECTED),
            'PROTECTED_REPOSITORY_FORBIDDEN')


def load_base():
    check_path(ROOT)
    require(hashlib.sha256(BASE_PATH.read_bytes()).hexdigest() == BASE_HASH, 'BASE_HARNESS_DRIFT')
    spec = importlib.util.spec_from_file_location('meta_page_base', BASE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


h = load_base()


def candidate_body(sql):
    require(sql.rstrip().endswith('ROLLBACK;'), 'CANDIDATE_MUST_ROLLBACK')
    require(sql.count('CREATE TABLE public.meta_ads_page_checkpoints (') == 1, 'NEW_TABLE_SCOPE')
    require(sql.count('CREATE FUNCTION public.') == 3, 'NEW_FUNCTION_SCOPE')
    return sql[sql.index('BEGIN;\n')+len('BEGIN;\n'):sql.rfind('ROLLBACK;')]


def prepare(directory):
    check_path(directory)
    require(not directory.exists(), 'OUTPUT_DIRECTORY_MUST_BE_NEW')
    require(h.command(['git','branch','--show-current']).strip() == 'meta-ads-api', 'META_BRANCH_REQUIRED')
    require(h.command(['git','rev-parse','HEAD']).strip() == h.BASE_SHA, 'REPOSITORY_HEAD_DRIFT')
    node = shutil.which('node')
    require(node is not None, 'NODE_REQUIRED')
    static = h.command([node,'--import','tsx','scripts/verify-meta-ads-page-checkpoint-sql-contract.ts'])
    require('META_PAGE_SQL_STATIC_CONTRACT=PASS' in static, 'STATIC_CONTRACT_REQUIRED')
    fixture = json.loads(h.command([node,'--import','tsx',EXPORT]))
    require(fixture['input']['job']['id'] == h.uid('meta_ads-job'), 'FIXTURE_IDENTITY_MISMATCH')
    authority = h.load_authority()
    baseline_fixture = h.export_fixture()
    require(fixture['input']['context'] == baseline_fixture['context'], 'FIXTURE_CONTEXT_MISMATCH')
    sql = {'bootstrap.sql':h.bootstrap_sql(authority), 'seed.sql':h.seed_sql(baseline_fixture),
           'existing-candidate.sql':h.candidate_sql(authority), 'page-candidate.sql':candidate_body(SQL_PATH.read_text())}
    directory.mkdir(mode=0o700, parents=True)
    for name, body in sql.items():
        (directory/name).write_text(h.preview(body))
    (directory/'page-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n')
    manifest = {'status':'PREPARE_ONLY','db_executions':0,'runtime':'NOT_RUN','postgres':'17.6',
                'base_harness_sha256':BASE_HASH,'base_commit':h.BASE_SHA,'branch':'meta-ads-api',
                'files':{name:h.sha((ROOT/name).read_bytes()) for name in NEW_FILES},
                'limitations':authority['limitations']+[
                    'Same-claim restart only; reclaim/claim transfer is rejected.',
                    'Fencing covers the new RPC path, not direct common RPC calls or privileged SQL.',
                    'No Meta API, Supabase REST/JWT, worker, materialization or production performance proof.']}
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return fixture, baseline_fixture, sql, manifest


def rpc_sql(name, payload):
    require(name in RPCS, 'RPC_NOT_ALLOWLISTED')
    # Every actual call is service_role; SQL identity guard is executed first as
    # postgres inside h.LocalCluster.query, on the same connection.
    return "SET ROLE service_role; SELECT jsonb_build_object('value',public."+name+'('+h.json_sql(payload)+'));'


def rpc(cluster, db, name, payload):
    result = cluster.query(db, rpc_sql(name,payload))
    require(isinstance(result,dict) and 'value' in result, 'RPC_RESULT_INVALID')
    return result['value']


def witness(cluster, db):
    return cluster.query(db,"SELECT jsonb_build_object('checkpoints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.job_id),'[]'::jsonb) FROM public.meta_ads_page_checkpoints c),"
                         "'staging',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.row_index),'[]'::jsonb) FROM public.media_sync_staging_rows s WHERE s.job_id="+h.literal(h.uid('meta_ads-job'))+"));")


def rejected(cluster, db, name, payload, marker):
    before = witness(cluster,db)
    cluster.query(db,rpc_sql(name,payload),expect_error=marker)
    require(witness(cluster,db)==before,'REJECTED_CALL_MUTATED_STATE')


def reseal_fixture_checkpoint(payload):
    """Synthetic ASCII-key fixture only, to test SQL beyond checksum rejection."""
    nxt=payload['next']
    text=json.dumps({'namespace':'meta_page_checkpoint_v1','body':{k:v for k,v in nxt.items() if k!='digest'}},
                    ensure_ascii=False,separators=(',',':'),sort_keys=True)
    nxt['digest']=h.sha(text.encode());payload['checkpoint_text']=text
    return payload


def run_worker(cluster, db, fixture, stop_at=None, wire_pages=None):
    node = shutil.which('node')
    require(node is not None,'NODE_REQUIRED')
    proc = subprocess.Popen([node,'--import','tsx',EXPORT,'--rpc-worker'],cwd=ROOT,env=h.ENV,
                            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout,selectors.EVENT_READ)
    try:
        proc.stdin.write(json.dumps({'input':fixture['input'],'wirePages':fixture['wirePages'] if wire_pages is None else wire_pages})+'\n')
        proc.stdin.flush()
        for _ in range(20):
            require(selector.select(30),'WORKER_IPC_TIMEOUT')
            line = proc.stdout.readline()
            require(bool(line),'WORKER_CLOSED_WITHOUT_RESULT')
            message = json.loads(line)
            require(message.get('type') in ('rpc','result','failure'),'WORKER_MESSAGE_INVALID')
            if message['type']=='result':
                proc.stdin.close()
                require(proc.wait(timeout=10)==0,'WORKER_EXIT_FAILED')
                return message['result']
            require(message['type']=='rpc','WORKER_FAILED')
            name=message['name']; payload=message['payload']
            require(name in RPCS and payload.get('job_id')==fixture['input']['job']['id'],'WORKER_RPC_SCOPE')
            if stop_at=='append_before_commit' and name==RPCS[2]:
                proc.kill(); proc.wait(timeout=10); return {'interrupted':stop_at}
            result=rpc(cluster,db,name,payload)
            phase=(payload.get('next') or {}).get('phase')
            stop = (stop_at=='pending_commit' and name==RPCS[1] and phase=='pending'
                    or stop_at=='append_commit' and name==RPCS[2]
                    or stop_at=='confirm_commit' and name==RPCS[1] and phase!='pending')
            if stop:
                proc.kill(); proc.wait(timeout=10); return {'interrupted':stop_at}
            proc.stdin.write(json.dumps({'id':message['id'],'data':result,'error':None})+'\n'); proc.stdin.flush()
        raise RuntimeError('WORKER_RPC_LIMIT')
    finally:
        selector.close()
        if proc.poll() is None:
            proc.kill(); proc.wait(timeout=10)
        for stream in (proc.stdin,proc.stdout,proc.stderr):
            stream.close()


def reset_meta(cluster, db):
    # Synthetic fixture only, through the same-session owned-cluster guard.
    key=h.literal(h.uid('meta_ads-job'))
    cluster.query(db,'BEGIN; DELETE FROM public.meta_ads_page_checkpoints WHERE job_id='+key+
                  '; DELETE FROM public.media_sync_staging_rows WHERE job_id='+key+'; COMMIT;')


def restart_owned_cluster(cluster):
    cluster.verify(h.DATABASES[1])
    h.command([cluster.pg_bin/'pg_ctl','-D',cluster.data,'-m','fast','-w','-t','20','restart','-l',cluster.root/'postgres.log'])
    cluster.verify(h.DATABASES[1])


def initialize_databases(cluster, sql):
    # Roles belong to the cluster, while schemas/grants/tables belong to each
    # database. Preserve the original bootstrap and create its exact roles once.
    # Never tolerate an unexpected pre-existing role or change its privileges.
    body=sql['bootstrap.sql']
    expected=[f'CREATE ROLE "{name}" NOLOGIN INHERIT '+
              ('BYPASSRLS' if name=='service_role' else 'NOBYPASSRLS')+';'
              for name in ('anon','authenticated','service_role','supabase_auth_admin','dashboard_user')]
    role_lines=[line for line in body.splitlines() if line.startswith('CREATE ROLE ')]
    require(role_lines==expected,'CLUSTER_ROLE_BOOTSTRAP_DRIFT')
    second='\n'.join(line for line in body.splitlines() if line not in expected)
    for db,bootstrap in zip(h.DATABASES,(body,second)):
        cluster.query(db,'BEGIN;\n'+bootstrap+'\n'+sql['seed.sql']+'\nCOMMIT;')
        cluster.query(db,'BEGIN;\n'+sql['existing-candidate.sql']+'\nCOMMIT;')


def runtime_suite(cluster, fixture, baseline_fixture, sql):
    baseline,candidate=h.DATABASES
    initialize_databases(cluster,sql)
    definition_sql="SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname NOT IN ("+','.join(h.literal(x) for x in RPCS)+');'
    definitions=cluster.query(candidate,definition_sql)
    cluster.query(candidate,'BEGIN;'+sql['page-candidate.sql']+'COMMIT;')
    require(cluster.query(candidate,definition_sql)==definitions,'EXISTING_FUNCTION_DEFINITION_OR_ACL_CHANGED')
    acl=cluster.query(candidate,"SELECT jsonb_build_object('rls',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.meta_ads_page_checkpoints'::regclass),'bad_table',(SELECT count(*) FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_table_privilege(r,'public.meta_ads_page_checkpoints','SELECT,INSERT,UPDATE,DELETE')),'bad_rpc',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r WHERE n.nspname='public' AND p.proname IN ("+','.join(h.literal(x) for x in RPCS)+") AND has_function_privilege(r,p.oid,'EXECUTE') IS DISTINCT FROM (r='service_role')));")
    require(acl=={'rls':True,'bad_table':0,'bad_rpc':0},'NEW_OBJECT_PRIVILEGE_SCOPE')
    for provider in ('naver_searchad','google_ads'):
        for db in (baseline,candidate):
            h.run_pipeline(cluster,db,baseline_fixture,provider)
        require(h.provider_witness(cluster,baseline,provider)==h.provider_witness(cluster,candidate,provider),'LEGACY_PROVIDER_CHANGED')
    common_before=h.database_witness(cluster,candidate)
    first=fixture['steps'][0]; cases=0
    require(rpc(cluster,candidate,RPCS[0],fixture['envelope']) is None,'INITIAL_NOT_EMPTY')
    changed=copy.deepcopy(first['prepare'])
    changed['next']['totalRows']=1;changed['next']['nextRowIndex']=1;changed['next']['fetchedRows']=1
    rejected(cluster,candidate,RPCS[1],reseal_fixture_checkpoint(changed),'META_PAGE_TRANSITION_INVALID');cases+=1
    changed=copy.deepcopy(first['prepare']);changed['checkpoint_text']='{}'
    rejected(cluster,candidate,RPCS[1],changed,'META_PAGE_CHECKPOINT_INVALID');cases+=1
    # Real COMMIT before IPC interruption, then a brand new Node process. No API
    # fixtures are supplied on pending recovery, so a refetch cannot succeed.
    for failure in ('pending_commit','append_before_commit','append_commit','confirm_commit'):
        reset_meta(cluster,candidate)
        require(run_worker(cluster,candidate,fixture,failure)=={'interrupted':failure},'FAULT_NOT_REACHED')
        if failure=='pending_commit':
            before=witness(cluster,candidate); restart_owned_cluster(cluster)
            require(witness(cluster,candidate)==before,'POSTGRES_RESTART_STATE_CHANGED')
        if failure=='confirm_commit':
            require(rpc(cluster,candidate,RPCS[0],fixture['envelope'])==first['confirmed'],'COMMITTED_CURSOR_LOST')
            result=run_worker(cluster,candidate,fixture)
            require(result['checkpoint']==fixture['steps'][1]['confirmed'],'RESUME_NEXT_PAGE_FAILED')
        else:
            result=run_worker(cluster,candidate,fixture,wire_pages=[])
            require(result['resumedPending'] and result['checkpoint']==first['confirmed'],'PENDING_REPLAY_FAILED')
        cases+=1
    reset_meta(cluster,candidate)
    # Two independent SQL sessions race from the same absent revision.
    barrier=threading.Barrier(2)
    def racer():
        barrier.wait(timeout=10)
        return rpc(cluster,candidate,RPCS[1],first['prepare'])
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(racer) for _ in range(2)]
        require(sorted(x.result(timeout=30) for x in futures)==[False,True],'CAS_RACE_NOT_SERIALIZED')
    cases+=1
    rejected(cluster,candidate,RPCS[1],first['confirm'],'META_PAGE_APPEND_NOT_CONFIRMED');cases+=1
    altered=copy.deepcopy(first['append']);altered['append_payload']['rows'][0]['row']['cost']=999
    rejected(cluster,candidate,RPCS[2],altered,'META_PAGE_APPEND_CONTENT_CONFLICT');cases+=1
    altered=copy.deepcopy(first['append']);altered['expected_revision']+=2
    rejected(cluster,candidate,RPCS[2],altered,'META_PAGE_APPEND_CONFLICT');cases+=1
    # A stale claim is rejected for all three RPCs, including readback.
    jobkey=h.literal(fixture['input']['job']['id'])
    cluster.query(candidate,'UPDATE public.media_sync_jobs SET attempt_count=2 WHERE id='+jobkey+';')
    for name,payload in zip(RPCS,(fixture['envelope'],first['confirm'],first['append'])):
        rejected(cluster,candidate,name,payload,'META_PAGE_CLAIM_INVALID');cases+=1
    newclaim=copy.deepcopy(fixture['envelope']);doc=json.loads(newclaim['scope_text']);doc['identity']['attempt_count']=2
    newclaim['scope_text']=json.dumps(doc,ensure_ascii=False,separators=(',',':'),sort_keys=True)
    newclaim['scope']=h.sha(newclaim['scope_text'].encode())
    rejected(cluster,candidate,RPCS[0],newclaim,'META_PAGE_SCOPE_DRIFT');cases+=1
    cluster.query(candidate,'UPDATE public.media_sync_jobs SET attempt_count=1 WHERE id='+jobkey+';')
    # Full transaction rollback after the append function has returned.
    before=witness(cluster,candidate)
    cluster.query(candidate,'BEGIN;'+rpc_sql(RPCS[2],first['append'])+"DO $$ BEGIN RAISE EXCEPTION 'META_PAGE_TEST_ROLLBACK'; END $$; COMMIT;",expect_error='META_PAGE_TEST_ROLLBACK')
    require(witness(cluster,candidate)==before,'APPEND_ROLLBACK_CHANGED_STATE');cases+=1
    replay=rpc(cluster,candidate,RPCS[2],first['append'])
    again=rpc(cluster,candidate,RPCS[2],first['append'])
    require(replay['inserted_rows']==2 and again['inserted_rows']==0 and again['duplicate_rows']==2,'EXACT_APPEND_REPLAY');cases+=1
    require(rpc(cluster,candidate,RPCS[1],first['confirm']) is True,'CONFIRM_FAILED')
    for step in fixture['steps'][1:]:
        result=run_worker(cluster,candidate,fixture)
        require(result['checkpoint']==step['confirmed'],'NEXT_PAGE_STATE_MISMATCH')
    before=witness(cluster,candidate)
    terminal=run_worker(cluster,candidate,fixture,wire_pages=[])
    require(terminal['alreadyComplete'] and terminal['canonicalStagingRows']==6 and not terminal['materializationAllowed'],'TERMINAL_REPLAY_INVALID')
    require(witness(cluster,candidate)==before,'TERMINAL_REPLAY_CHANGED_STATE');cases+=1
    reset_meta(cluster,candidate)
    empty=run_worker(cluster,candidate,fixture,wire_pages=[{'data':[]}])
    require(empty['checkpoint']==fixture['empty']['final'] and empty['emptyDatasetUnsupported']
            and not empty['readyForStagingValidation'] and not empty['materializationAllowed'],'EMPTY_DATASET_NOT_BLOCKED');cases+=1
    require(witness(cluster,candidate)['staging']==[],'EMPTY_DATASET_WROTE_STAGING')
    # Restore the successful six-row witness for a useful final result artifact.
    reset_meta(cluster,candidate)
    for step in fixture['steps']:
        require(run_worker(cluster,candidate,fixture)['checkpoint']==step['confirmed'],'FINAL_REPRODUCTION_FAILED')
    require(h.database_witness(cluster,candidate)==common_before,'COMMON_TABLES_OR_CSV_CHANGED')
    return {'status':'PASS','runtime_cases':cases,'same_claim_process_restart':True,'postgres_restart':True,
            'cas_two_sessions':True,'actual_rollback':True,'claim_transfer':'REJECTED','canonical_rows':6,
            'fetched_rows':7,'existing_definitions_acl':'UNCHANGED','naver_google_comparison':'PASS',
            'csv_and_common_tables_unchanged':True,'materialization':'DISABLED','live_meta_api_calls':0}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare',required=True,type=Path)
    parser.add_argument('--run-isolated',action='store_true')
    parser.add_argument('--pg-bin',type=Path)
    args=parser.parse_args()
    require(args.run_isolated==(args.pg_bin is not None),'RUN_FLAG_AND_PG_BIN_MUST_BE_SUPPLIED_TOGETHER')
    fixture,baseline_fixture,sql,manifest=prepare(args.prepare)
    print(json.dumps({'prepare':'PASS','db_executions':0,'runtime':'NOT_RUN','output':str(args.prepare.resolve())}),flush=True)
    if not args.run_isolated:
        return
    # Never relax the inherited non-root/exact-version/private-socket guards.
    cluster=h.LocalCluster(args.pg_bin)
    try:
        cluster.start()
        result=runtime_suite(cluster,fixture,baseline_fixture,sql)
        result['limitations']=manifest['limitations']
        (args.prepare/'runtime-result.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result),flush=True)
    finally:
        cluster.stop()


if __name__=='__main__':
    main()
