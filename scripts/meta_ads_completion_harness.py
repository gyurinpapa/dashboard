#!/usr/bin/env python3
"""New private fixture cluster only: page checkpoint through finalization.
No live Meta API, external database, live worker, credentials or deployment.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
PIN='35ad02d83d8e51fb1c75d3e726389e8bcc2162704d791c133faceaa900e0369c'
BASE=ROOT/'scripts/meta_ads_materialization_handoff_harness.py'

def load_base():
    if hashlib.sha256(BASE.read_bytes()).hexdigest()!=PIN:raise RuntimeError('HANDOFF_HARNESS_DRIFT')
    spec=importlib.util.spec_from_file_location('completion_handoff',BASE)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

m=load_base();h=m.h;require=h.require
RPCS=('activate_meta_ads_snapshot_fanout','finalize_media_sync_job')
FILES=('scripts/meta_ads_completion_harness.py','scripts/verify_meta_ads_completion_harness.py')

def prepare(directory):
    fixture,baseline,sql,manifest=m.prepare(directory)
    manifest['files'].update({name:h.sha((ROOT/name).read_bytes()) for name in FILES})
    manifest.update(meta_activation='FIXTURE_ONLY_ON_EXPLICIT_RUN',meta_finalization='FIXTURE_ONLY_ON_EXPLICIT_RUN',
                    handoff_harness_sha256=PIN)
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return fixture,baseline,sql,manifest

def rpc_sql(name,p):
    require(name in RPCS,'RPC_NOT_ALLOWLISTED')
    return h.rpc_sql(name,p,scalar=name==RPCS[0])

def payload(cluster,db,fixture):
    job=fixture['input']['job'];key=h.literal(job['id'])
    targets=cluster.query(db,"SELECT jsonb_agg(jsonb_build_object('report_id',p.report_id,'previous_ingestion_id',p.previous_ingestion_id,"
        "'snapshot_ingestion_id',p.snapshot_ingestion_id,'expected_rows',r.expected_rows,'published_ingestion_id',t.value->'published_ingestion_id') ORDER BY p.report_id) "
        "FROM public.media_sync_report_projections p JOIN public.meta_ads_materialization_handoffs r ON r.job_id=p.media_sync_job_id "
        "CROSS JOIN LATERAL jsonb_array_elements(r.targets) t WHERE p.media_sync_job_id="+key+" AND t.value->>'report_id'=p.report_id::text;")
    require(isinstance(targets,list) and [t['report_id'] for t in targets]==fixture['input']['targetReportIds'],'TARGET_AUTHORITY_INVALID')
    primary=next(t for t in targets if t['report_id']==job['report_id'])
    return dict({k:job[k] for k in ('report_id','workspace_id','advertiser_id','connection_id','provider','external_account_id','date_from','date_to')},
                job_id=job['id'],previous_ingestion_id=primary['previous_ingestion_id'],snapshot_ingestion_id=primary['snapshot_ingestion_id'],
                expected_rows=fixture['input']['checkpoint']['totalRows'],projections=targets)

def unchanged_except_transition(before,after,p,final=False):
    # Compare every row and every other field, including published pointers,
    # staging, receipt, mappings, CSV and legacy data. Only named fixture IDs
    # may change the fields belonging to the specific transition.
    left=copy.deepcopy(before);right=copy.deepcopy(after)
    targets={t['report_id'] for t in p['projections']}
    for doc in (left,right):
        for row in doc['common']['reports']:
            if not final and row['id'] in targets:
                for key in ('current_ingestion_id','updated_at'):row.pop(key,None)
        if final:
            for row in doc['common']['media_sync_jobs']:
                if row['id']==p['job_id']:
                    for key in ('status','progress','finished_at','error','updated_at'):row.pop(key,None)
            for row in doc['common']['media_connections']:
                if row['id']==p['connection_id']:
                    for key in ('last_sync_at','last_error','updated_at'):row.pop(key,None)
        # database_witness orders by serialized row, whose allowed fields change.
        for rows in doc['common'].values():rows.sort(key=lambda r:json.dumps(r,sort_keys=True))
    require(left==right,'UNEXPECTED_TRANSITION_MUTATION')

def failure(cluster,db,sql,marker):
    before=m.witness(cluster,db);cluster.query(db,sql,expect_error=marker)
    require(m.witness(cluster,db)==before,'FAILED_TRANSITION_MUTATED_STATE')

def runtime_suite(cluster,fixture,baseline,sql):
    handoff=m.runtime_suite(cluster,fixture,baseline,sql)
    db=h.DATABASES[1];p=payload(cluster,db,fixture['small']);cases=0
    failure(cluster,db,rpc_sql(RPCS[1],p),'META_FANOUT_PARTIAL_OR_NOT_ACTIVE');cases+=1
    for invalid,marker in ((dict(p,projections=p['projections'][:1]),'META_FANOUT_TARGET_SET_INVALID'),
                           (dict(p,expected_rows=7),'META_FANOUT_EXECUTION_INVALID')):
        failure(cluster,db,rpc_sql(RPCS[0],invalid),marker);cases+=1
    bad=copy.deepcopy(p);bad['projections'][1]['published_ingestion_id']=h.uid('wrong')
    failure(cluster,db,rpc_sql(RPCS[0],bad),'META_FANOUT_PUBLISHED_BASELINE_CHANGED');cases+=1
    # Raise on the second UPDATE to prove all-report atomicity with real triggers.
    second=p['projections'][1]['report_id']
    cluster.query(db,"CREATE FUNCTION meta_harness.completion_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id="+
        h.literal(second)+"::uuid THEN RAISE EXCEPTION 'COMPLETION_SECOND_REPORT'; END IF; RETURN NEW; END $$; "
        "CREATE TRIGGER meta_harness_completion_fail BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION meta_harness.completion_fail_second();")
    failure(cluster,db,rpc_sql(RPCS[0],p),'COMPLETION_SECOND_REPORT');cases+=1
    cluster.query(db,'DROP TRIGGER meta_harness_completion_fail ON public.reports; DROP FUNCTION meta_harness.completion_fail_second();')
    failure(cluster,db,'BEGIN;'+rpc_sql(RPCS[0],p)+"DO $$ BEGIN RAISE EXCEPTION 'COMPLETION_ROLLBACK'; END $$; COMMIT;",'COMPLETION_ROLLBACK');cases+=1
    before=m.witness(cluster,db)
    cluster.query(db,rpc_sql(RPCS[0],p)) # Deliberately discard committed response.
    activated=m.witness(cluster,db);unchanged_except_transition(before,activated,p)
    for target in p['projections']:
        report=next(r for r in activated['common']['reports'] if r['id']==target['report_id'])
        require(report['current_ingestion_id']==target['snapshot_ingestion_id'] and
                report['published_ingestion_id']==target['published_ingestion_id'],'ACTIVATION_POINTER_INVALID')
    cases+=1
    m.page.restart_owned_cluster(cluster)
    retry=cluster.query(db,rpc_sql(RPCS[0],p))
    require(retry['idempotent'] is True and m.witness(cluster,db)==activated,'ACTIVATION_RESTART_REPLAY_CHANGED');cases+=1
    mutation='BEGIN; DELETE FROM public.report_media_connections WHERE report_id='+h.literal(second)+';'
    failure(cluster,db,mutation+rpc_sql(RPCS[1],p)+'COMMIT;','META_FANOUT_MAPPING_SET_CHANGED');cases+=1
    failure(cluster,db,'BEGIN;'+rpc_sql(RPCS[1],p)+"DO $$ BEGIN RAISE EXCEPTION 'COMPLETION_ROLLBACK'; END $$; COMMIT;",'COMPLETION_ROLLBACK');cases+=1
    # Finalization must also be atomic if connection update fails after job UPDATE.
    cluster.query(db,"CREATE FUNCTION meta_harness.completion_fail_connection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id="+
        h.literal(p['connection_id'])+"::uuid THEN RAISE EXCEPTION 'COMPLETION_CONNECTION_FAILURE'; END IF; RETURN NEW; END $$; "
        "CREATE TRIGGER meta_harness_completion_connection BEFORE UPDATE ON public.media_connections FOR EACH ROW EXECUTE FUNCTION meta_harness.completion_fail_connection();")
    failure(cluster,db,rpc_sql(RPCS[1],p),'COMPLETION_CONNECTION_FAILURE');cases+=1
    cluster.query(db,'DROP TRIGGER meta_harness_completion_connection ON public.media_connections; DROP FUNCTION meta_harness.completion_fail_connection();')
    final=cluster.query(db,rpc_sql(RPCS[1],p));finished=m.witness(cluster,db)
    unchanged_except_transition(activated,finished,p,final=True)
    job=final['job']
    require(job['status']=='done' and job['progress']==100 and job['finished_at'] is not None and job['error'] is None
            and [job[k] for k in ('raw_rows','normalized_rows','inserted_rows','failed_rows')]==[6,6,6,0]
            and final['connection_updated'] is True and final['connection_last_sync_at']==job['finished_at'],'FINALIZATION_INVALID');cases+=1
    m.page.restart_owned_cluster(cluster)
    again=cluster.query(db,rpc_sql(RPCS[1],p))
    require(again['idempotent'] is True and again['connection_updated'] is False and m.witness(cluster,db)==finished,
            'FINALIZATION_RESTART_REPLAY_CHANGED');cases+=1
    return {'status':'PASS','handoff':handoff,'completion_runtime_cases':cases,'meta_job_status':'done','progress':100,
            'canonical_rows':6,'projections':2,'materialized_rows':12,'published_pointers_preserved':True,
            'csv_legacy_and_unrelated_fields_unchanged':True,'activation_rollback':True,'finalization_rollback':True,
            'activation_restart_replay':True,'finalization_restart_replay':True,'connection_sync_matches_finished':True,
            'execution_scope':'ISOLATED_FIXTURE_ONLY','live_meta_api_calls':0,'live_worker':'DISABLED'}

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
        result['limitations']=[x for x in manifest['limitations'] if not x.startswith('No real Meta API')]+[
            'Activation/finalization are PostgreSQL fixture proofs only; no live API, REST/JWT, worker, deployment or production performance proof.',
            'Existing activation/finalization RPCs do not add handoff claim fencing; no claim-transfer safety claim.']
        (args.prepare/'runtime-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
    finally:cluster.stop()

if __name__=='__main__':main()
