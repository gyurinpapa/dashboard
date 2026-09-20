#!/usr/bin/env python3
"""Explicit opt-in private PG17.6 fixture test; no live credentials/API/worker."""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'scripts/meta_ads_completion_harness.py'
PIN='f71a728dd5199b60891b1914fe3d23d8ba57b4c7cdcc45a61e967208950c9f28'
SQL=ROOT/'scripts/sql/create-meta-ads-completion-claim-fence.sql'
SQL_PIN='66a4a9ec04119e8984b742c683dc083cae4d8bc741b95e67f2392d1b9f37a3a4'

def load_base():
    if hashlib.sha256(BASE.read_bytes()).hexdigest()!=PIN:raise RuntimeError('COMPLETION_HARNESS_DRIFT')
    spec=importlib.util.spec_from_file_location('claim_completion',BASE)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

c=load_base();m=c.m;h=c.h;require=h.require
RPCS=('activate_meta_ads_claim_snapshot_v1','finalize_meta_ads_claim_job_v1')
HELPER='lock_meta_ads_completion_claim_v1'
FILES=('scripts/sql/create-meta-ads-completion-claim-fence.sql','scripts/verify_meta_ads_completion_claim_sql.py',
       'scripts/meta_ads_completion_claim_harness.py','scripts/verify_meta_ads_completion_claim_harness.py')

def candidate_body(text):
    require(h.sha(text.encode())==SQL_PIN,'CLAIM_SQL_DRIFT')
    require(text.rstrip().endswith('ROLLBACK;') and '\nCOMMIT;' not in text,'CANDIDATE_MUST_ROLLBACK')
    return text[text.index('BEGIN;\n')+len('BEGIN;\n'):text.rfind('ROLLBACK;')]

def prepare(directory):
    # Validate new candidate before the inherited preparation can write previews.
    body=candidate_body(SQL.read_text())
    fixture,baseline,sql,manifest=c.prepare(directory)
    static=h.command([sys.executable,'-B','scripts/verify_meta_ads_completion_claim_sql.py'])
    require(json.loads(static)['static_contract']=='PASS','CLAIM_STATIC_CHECK_FAILED')
    sql['claim-candidate.sql']=body
    (directory/'claim-candidate.sql').write_text(h.preview(body))
    manifest['files'].update({name:h.sha((ROOT/name).read_bytes()) for name in FILES})
    manifest['completion_harness_sha256']=PIN
    manifest['claim_fence']='NEW_RPCS_ONLY'
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return fixture,baseline,sql,manifest

def payload(fixture):
    j=fixture['input']['job'];cp=fixture['input']['checkpoint']
    return {'page':copy.deepcopy(fixture['page']['envelope']),'attempt_count':j['attempt_count'],
            'started_at':j['started_at'],'checkpoint_revision':cp['revision'],
            'checkpoint_digest':cp['digest'],'expected_rows':cp['totalRows']}

def rpc_sql(name,p):
    require(name in RPCS,'RPC_NOT_ALLOWLISTED')
    return h.rpc_sql(name,p,True)

def rejected(cluster,db,name,p,marker='META_COMPLETION_CLAIM_CHANGED'):
    c.failure(cluster,db,rpc_sql(name,p),marker)

def claim_changes(cluster,db,p):
    # Changes live only inside a failing transaction, so originals are restored
    # by PostgreSQL rollback, including trigger-maintained timestamps.
    key=h.literal(p['page']['job_id']);count=0
    for assignment in ('attempt_count=attempt_count+1',"started_at=started_at+interval '1 microsecond'"):
        for name in RPCS:
            c.failure(cluster,db,'BEGIN; UPDATE public.media_sync_jobs SET '+assignment+' WHERE id='+key+';'+
                rpc_sql(name,p)+'COMMIT;','META_COMPLETION_CLAIM_CHANGED');count+=1
    return count

def two_sessions(cluster,db,name,p):
    barrier=threading.Barrier(2)
    def call():
        barrier.wait(timeout=10);return cluster.query(db,rpc_sql(name,p))
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(call) for _ in range(2)]
        results=[f.result(timeout=40) for f in futures]
    require(sorted(r['idempotent'] for r in results)==[False,True],'CLAIM_RPC_RACE_NOT_SERIALIZED')
    return results

def reclaim_race(cluster,db,name,p):
    # A commits a changed claim while holding the job lock; B is first blocked,
    # then must reject the old claim after A commits. Every statement goes via
    # LocalCluster.query, retaining ownership and same-session target guards.
    key=h.literal(p['page']['job_id'])
    before=m.witness(cluster,db)
    holder_sql="SET application_name='meta_claim_reclaimer'; BEGIN; UPDATE public.media_sync_jobs SET attempt_count=attempt_count+1 WHERE id="+key+"; SELECT pg_sleep(4); COMMIT; SELECT jsonb_build_object('committed',true);"
    with ThreadPoolExecutor(max_workers=1) as pool:
        holder=pool.submit(cluster.query,db,holder_sql)
        deadline=time.monotonic()+3;seen=False
        while time.monotonic()<deadline:
            result=cluster.query(db,"SELECT jsonb_build_object('ready',EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='meta_claim_reclaimer' AND wait_event='PgSleep'));")
            if result['ready']:seen=True;break
            time.sleep(0.02)
        require(seen,'RECLAIM_HOLDER_NOT_OBSERVED')
        # No witness query is put ahead of B's lock attempt after readiness.
        cluster.query(db,rpc_sql(name,p),expect_error='lock timeout')
        require(holder.result(timeout=10)=={'committed':True},'RECLAIM_COMMIT_FAILED')
    changed=m.witness(cluster,db)
    rejected(cluster,db,name,p)
    require(m.witness(cluster,db)==changed,'STALE_RETRY_MUTATED_STATE')
    # Fixture reset only; never an operational reclaim/resume strategy.
    old=next(j for j in before['common']['media_sync_jobs'] if j['id']==p['page']['job_id'])
    cluster.query(db,'UPDATE public.media_sync_jobs SET attempt_count='+str(old['attempt_count'])+', updated_at='+
        h.literal(old['updated_at'])+'::timestamptz WHERE id='+key+';')
    require(m.witness(cluster,db)==before,'FIXTURE_CLAIM_RESET_DRIFT')

def runtime_suite(cluster,fixture,baseline,sql):
    handoff=m.runtime_suite(cluster,fixture,baseline,sql)
    db=h.DATABASES[1];small=fixture['small'];p=payload(small);legacy_p=c.payload(cluster,db,small)
    defs="SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname NOT IN ("+','.join(h.literal(n) for n in (*RPCS,HELPER))+');'
    before_defs=cluster.query(db,defs)
    cluster.query(db,'BEGIN;'+sql['claim-candidate.sql']+'COMMIT;')
    require(cluster.query(db,defs)==before_defs,'EXISTING_DEFINITIONS_OR_ACL_CHANGED')
    acl=cluster.query(db,"SELECT jsonb_build_object('bad',count(*)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r WHERE n.nspname='public' AND p.proname IN ("+
        ','.join(h.literal(n) for n in (*RPCS,HELPER))+") AND has_function_privilege(r,p.oid,'EXECUTE') IS DISTINCT FROM (r='service_role' AND p.proname<>"+h.literal(HELPER)+");")
    require(acl=={'bad':0},'CLAIM_RPC_PRIVILEGE_SCOPE');cases=0
    for name in RPCS:
        for delta,marker in (({'attempt_count':2},'META_COMPLETION_CLAIM_CHANGED'),
                             ({'started_at':'2026-09-19T00:00:00.000001Z'},'META_COMPLETION_CLAIM_CHANGED'),
                             ({'checkpoint_digest':'0'*64},'META_COMPLETION_RECEIPT_CHANGED'),
                             ({'checkpoint_revision':p['checkpoint_revision']+1},'META_COMPLETION_RECEIPT_CHANGED'),
                             ({'expected_rows':7},'META_COMPLETION_RECEIPT_CHANGED'),
                             ({'projections':[]},'META_COMPLETION_INPUT_INVALID')):
            rejected(cluster,db,name,dict(p,**delta),marker);cases+=1
    cases+=claim_changes(cluster,db,p)
    rejected(cluster,db,RPCS[1],p,'META_FANOUT_PARTIAL_OR_NOT_ACTIVE');cases+=1
    for table,column,value,marker in (
        ('meta_ads_page_checkpoints','checkpoint',"jsonb_set(checkpoint,'{digest}','\"changed\"'::jsonb)",'META_COMPLETION_RECEIPT_CHANGED'),
        ('meta_ads_materialization_handoffs','expected_rows','7','META_COMPLETION_RECEIPT_CHANGED')):
        mutation='BEGIN; UPDATE public.'+table+' SET '+column+'='+value+' WHERE job_id='+h.literal(p['page']['job_id'])+';'
        c.failure(cluster,db,mutation+rpc_sql(RPCS[0],p)+'COMMIT;',marker);cases+=1
    second=legacy_p['projections'][1]['report_id']
    trigger="CREATE FUNCTION meta_harness.claim_fail_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id="+h.literal(second)+"::uuid THEN RAISE EXCEPTION 'CLAIM_SECOND_REPORT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER meta_claim_fail_report BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION meta_harness.claim_fail_report();"
    cluster.query(db,trigger)
    rejected(cluster,db,RPCS[0],p,'CLAIM_SECOND_REPORT_FAILURE');cases+=1
    cluster.query(db,'DROP TRIGGER meta_claim_fail_report ON public.reports; DROP FUNCTION meta_harness.claim_fail_report();')
    reclaim_race(cluster,db,RPCS[0],p);cases+=1
    for name in RPCS:
        c.failure(cluster,db,'BEGIN;'+rpc_sql(name,p)+"DO $$ BEGIN RAISE EXCEPTION 'CLAIM_ROLLBACK'; END $$; COMMIT;",'CLAIM_ROLLBACK');cases+=1
        before=m.witness(cluster,db);results=two_sessions(cluster,db,name,p);after=m.witness(cluster,db)
        c.unchanged_except_transition(before,after,legacy_p,final=name==RPCS[1]);cases+=1
        m.page.restart_owned_cluster(cluster)
        retry=cluster.query(db,rpc_sql(name,p))
        require(retry['idempotent'] is True and m.witness(cluster,db)==after,'CLAIM_RESTART_REPLAY_CHANGED');cases+=1
        if name==RPCS[0]:
            for target in legacy_p['projections']:
                r=next(r for r in after['common']['reports'] if r['id']==target['report_id'])
                require(r['current_ingestion_id']==target['snapshot_ingestion_id'] and r['published_ingestion_id']==target['published_ingestion_id'],'CLAIM_ACTIVATION_POINTER')
            cases+=claim_changes(cluster,db,p)
            # Existing finalizer derives targets from DB, so the fence must also
            # enforce the receipt's published baseline on this finalizing path.
            mutation='BEGIN; UPDATE public.reports SET published_ingestion_id=null WHERE id='+h.literal(second)+';'
            c.failure(cluster,db,mutation+rpc_sql(RPCS[1],p)+'COMMIT;','META_COMPLETION_TARGET_BASELINE_CHANGED');cases+=1
            reclaim_race(cluster,db,RPCS[1],p);cases+=1
        else:
            first=next(r for r in results if r['idempotent'] is False);j=first['job']
            require(j['status']=='done' and j['progress']==100 and j['finished_at'] is not None and
                [j[k] for k in ('raw_rows','normalized_rows','inserted_rows','failed_rows')]==[6,6,6,0] and
                first['connection_last_sync_at']==j['finished_at'] and first['connection_updated'] is True and
                retry['connection_updated'] is False,'CLAIM_FINALIZATION_INVALID')
            cases+=claim_changes(cluster,db,p)
            rejected(cluster,db,RPCS[1],dict(p,attempt_count=2));cases+=1
    require(cluster.query(db,defs)==before_defs,'FINAL_EXISTING_DEFINITIONS_CHANGED')
    return {'status':'PASS','handoff':handoff,'claim_runtime_cases':cases,'meta_job_status':'done','progress':100,
            'canonical_rows':6,'projections':2,'materialized_rows':12,'same_claim_completion':True,
            'stale_claim_activation_rejected':True,'stale_claim_finalization_rejected':True,'done_replay_claim_checked':True,
            'reclaim_race_rejected':True,'two_session_transitions':True,'actual_rollback':True,'postgres_restart_replay':True,
            'published_baseline_preserved':True,'csv_legacy_and_unrelated_fields_unchanged':True,
            'existing_definitions_acl':'UNCHANGED','execution_scope':'ISOLATED_FIXTURE_ONLY','live_meta_api_calls':0,'live_worker':'DISABLED'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare',required=True,type=Path)
    parser.add_argument('--run-isolated',action='store_true')
    parser.add_argument('--pg-bin',type=Path)
    args=parser.parse_args()
    require(args.run_isolated==(args.pg_bin is not None),'RUN_FLAG_AND_PG_BIN_MUST_BE_SUPPLIED_TOGETHER')
    fixture,baseline,sql,manifest=prepare(args.prepare)
    print(json.dumps({'prepare':'PASS','db_executions':0,'runtime':'NOT_RUN','output':str(args.prepare)}),flush=True)
    if not args.run_isolated:return
    cluster=h.LocalCluster(args.pg_bin)
    try:
        cluster.start();result=runtime_suite(cluster,fixture,baseline,sql)
        result['limitations']=h.load_authority()['limitations']+[
            'Claim transfer is rejected, not implemented as supported recovery.',
            'Fence applies only to the new wrappers; direct old RPCs and privileged SQL remain outside it.',
            'No live Meta API, REST/JWT, live worker, deployment or production performance proof.']
        (args.prepare/'runtime-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
    finally:cluster.stop()

if __name__=='__main__':main()
