#!/usr/bin/env python3
"""Offline safety and real child-process IPC tests; no PostgreSQL or network."""
import ast
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('handoff_harness',Path(__file__).with_name('meta_ads_materialization_handoff_harness.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class RpcModel:
    """Committed DB-response model only; never presented as SQL runtime proof."""
    def __init__(self,fixture):
        self.fixture=fixture;self.projections={};self.receipt=False;self.calls=[]

    def invoke(self,cluster,db,name,p):
        f=self.fixture;total=f['input']['checkpoint']['totalRows'];target=p['target_report_id']
        assert name in m.RPCS and p['page']==f['page']['envelope'] and p['expected_rows']==total
        assert p['target_report_ids']==f['input']['targetReportIds']
        self.calls.append((name,copy.deepcopy(p)))
        created=not self.receipt
        if name==m.RPCS[0]:
            self.receipt=True
            self.projections.setdefault(target,{'snapshot':m.h.uid('mock-handoff-'+target),'next':0,'done':False})
        state=self.projections[target];snapshot=state['snapshot']
        job=copy.deepcopy(f['input']['job'])
        job.update(raw_rows=total,normalized_rows=total,inserted_rows=total,progress=70)
        job['snapshot_ingestion_id']=self.projections.get(f['primary'],{}).get('snapshot')
        if name==m.RPCS[0]:
            return {'materialization':{'job':job,'snapshot_ingestion_id':snapshot,'expected_rows':total,
                        'next_row_index':state['next'],'idempotent':state['done']},
                    'handoff_created':created,'checkpoint':f['input']['checkpoint'],
                    'targets':[{'report_id':t,'previous_ingestion_id':m.h.uid(label+'-previous'),
                                'published_ingestion_id':m.h.uid(label+'-published')}
                               for t,label in sorted((m.h.uid(label),label) for label in m.h.report_labels('meta_ads'))],
                    'validation_batches':[{'job_id':job['id'],'batch_start':start,'batch_rows':min(2000,total-start),
                        'batch_max_row_index':min(start+2000,total)-1,'canonical_mismatch_rows':0,
                        'batch_content_fingerprint':'a'*64,'is_valid':True} for start in range(0,total,2000)]}
        assert p['snapshot_ingestion_id']==snapshot
        if name==m.RPCS[1]:
            start=p['batch_start'];assert start==state['next'] and p['batch_size']==2000
            end=min(total,start+2000);state['next']=end
            return {'job':job,'snapshot_ingestion_id':snapshot,'batch_start':start,'batch_end_exclusive':end,
                    'expected_batch_rows':end-start,'inserted_rows':end-start,'materialized_batch_rows':end-start,
                    'next_row_index':end,'complete':end==total,'idempotent':False}
        assert state['next']==total
        token=hashlib.sha256(f"{job['id']}:{target}:{snapshot}:{total}:0:{total-1}:0:{total-1}".encode()).hexdigest()
        done=state['done'];state['done']=True
        return {'job':job,'snapshot_ingestion_id':snapshot,'row_count':total,'staging_fingerprint':token,
                'materialized_fingerprint':token,'idempotent':done}


class HandoffHarness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture=json.loads(m.h.command([shutil.which('node'),'--import','tsx',m.EXPORT]))

    def test_inherited_harness_hashes_pinned(self):
        with patch.object(Path,'read_bytes',return_value=b'changed'):
            with self.assertRaisesRegex(RuntimeError,'PAGE_HARNESS_DRIFT'):m.load_page()
            with self.assertRaisesRegex(RuntimeError,'BASE_HARNESS_DRIFT'):m.page.load_base()

    def test_protected_path_rejected_before_resolve(self):
        with patch.object(Path,'resolve',side_effect=AssertionError('NO_RESOLVE')):
            with self.assertRaisesRegex(RuntimeError,'PROTECTED'):m.check_path(m.PROTECTED/'child')

    def test_prepare_has_no_database_calls_and_disabled_previews(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(m.h,'LocalCluster',side_effect=AssertionError('NO_DB')):
            target=Path(temp)/'prepared'
            fixture,baseline,sql,manifest=m.prepare(target)
            self.assertEqual(manifest['db_executions'],0);self.assertEqual(manifest['runtime'],'NOT_RUN')
            self.assertEqual(len(manifest['files']),16);self.assertEqual(manifest['fixture_rows'],[6,2001])
            self.assertEqual(len(sql),5)
            self.assertEqual(fixture['small']['input']['context'],baseline['context'])
            self.assertFalse((target/'runtime-result.json').exists())
            for file in target.glob('*.sql'):
                self.assertIn("RAISE EXCEPTION 'HARNESS_PREVIEW_NOT_EXECUTABLE'",file.read_text())
                self.assertTrue(file.read_text().rstrip().endswith('ROLLBACK;'))
            with self.assertRaisesRegex(RuntimeError,'OUTPUT_DIRECTORY_MUST_BE_NEW'):m.prepare(target)

    def test_fixture_large_uses_real_collector_and_checkpoint(self):
        f=self.fixture['large'];steps=f['page']['steps']
        self.assertEqual([len(s['pending']['pending']['rows']) for s in steps],[2000,1])
        self.assertEqual(f['input']['checkpoint']['totalRows'],2001)
        self.assertEqual(f['input']['checkpoint']['fetchedRows'],2001)
        self.assertEqual(f['input']['checkpoint'],steps[-1]['confirmed'])
        indexes=[r['row_index'] for s in steps for r in s['pending']['pending']['rows']]
        self.assertEqual(indexes,list(range(2001)))

    def test_staging_fingerprint_is_generated_not_a_frozen_ingestion_hash(self):
        table=m.h.load_authority()['tables']['public.media_sync_staging_rows']
        column=next(c for c in table['columns'] if c['name']=='row_fingerprint')
        self.assertEqual(column['generated'],'s')
        self.assertIn('digest',column['default_expression'])
        self.assertIn('sha256',column['default_expression'])

    def test_invalid_fixture_requires_changed_row_and_recomputed_hash(self):
        good={'rows':1,'invalid_cost':True,'generated_fingerprint_valid':True,'canonical_shape_valid':False}
        cluster=Mock();cluster.query.return_value=good
        m.inject_invalid_canonical_row(cluster,'mock',self.fixture['small'])
        for change in ({'rows':0},{'rows':2},{'invalid_cost':False},
                       {'generated_fingerprint_valid':False},{'canonical_shape_valid':True},
                       {'canonical_shape_valid':None}):
            with self.subTest(change=change):
                cluster.query.return_value=dict(good,**change)
                with self.assertRaisesRegex(RuntimeError,'INVALID_CANONICAL_FIXTURE_NOT_ESTABLISHED'):
                    m.inject_invalid_canonical_row(cluster,'mock',self.fixture['small'])

    def test_candidate_scope_and_rollback(self):
        sql=m.SQL_PATH.read_text()
        self.assertIn('CREATE TABLE public.meta_ads_materialization_handoffs',m.candidate_body(sql))
        with self.assertRaisesRegex(RuntimeError,'CANDIDATE_MUST_ROLLBACK'):m.candidate_body(sql.replace('ROLLBACK;','COMMIT;'))

    def test_rpc_allowlist_and_quoting(self):
        for name in ('','public.bad','x; DROP TABLE x',m.HELPER,'finalize_media_sync_job'):
            with self.assertRaisesRegex(RuntimeError,'RPC_NOT_ALLOWLISTED'):m.rpc_sql(name,{})
        self.assertIn("quote''; --",m.rpc_sql(m.RPCS[0],{'x':"quote'; --"}))

    def test_cli_excludes_external_database_options(self):
        tree=ast.parse(Path(m.__file__).read_text())
        options=[n.args[0].value for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)
                 and n.func.attr=='add_argument']
        self.assertEqual(options,['--prepare','--run-isolated','--pg-bin'])

    def test_runtime_requires_both_explicit_flags(self):
        for flags in (['--run-isolated'],['--pg-bin','/tmp']):
            with patch.object(sys,'argv',['h','--prepare','/tmp/unused']+flags),patch.object(m,'prepare',side_effect=AssertionError('NO_PREPARE')):
                with self.assertRaisesRegex(RuntimeError,'RUN_FLAG_AND_PG_BIN'):m.main()

    def test_root_runtime_rejected(self):
        if os.geteuid()==0:
            with self.assertRaisesRegex(RuntimeError,'POSTGRES_REQUIRES_NON_ROOT_USER'):m.h.LocalCluster(Path('/tmp'))

    def test_external_environment_not_inherited(self):
        for name in ('DATABASE_URL','PGHOST','SUPABASE_SERVICE_ROLE_KEY','MEDIA_CREDENTIAL_ENCRYPTION_KEY','NODE_OPTIONS'):
            self.assertNotIn(name,m.h.ENV)
        self.assertEqual(m.h.ENV['PGPASSFILE'],'/dev/null')

    def test_restart_checks_owned_cluster_before_command(self):
        cluster=Mock();cluster.verify.side_effect=RuntimeError('OWNERSHIP_REJECTED')
        with patch.object(m.h,'command') as command:
            with self.assertRaisesRegex(RuntimeError,'OWNERSHIP_REJECTED'):m.page.restart_owned_cluster(cluster)
            command.assert_not_called()

    def test_worker_scope_rejected_before_process(self):
        with patch.object(m.subprocess,'Popen',side_effect=AssertionError('NO_CHILD')):
            with self.assertRaisesRegex(RuntimeError,'TARGET_NOT_ALLOWLISTED'):m.run_worker(None,'mock',self.fixture['small'],target=m.h.uid('csv'))
            with self.assertRaisesRegex(RuntimeError,'FAULT_NOT_ALLOWLISTED'):m.run_worker(None,'mock',self.fixture['small'],stop_at='unknown')

    def test_database_errors_not_swallowed(self):
        with patch.object(m,'rpc',side_effect=RuntimeError('DATABASE_REJECTED')):
            with self.assertRaisesRegex(RuntimeError,'DATABASE_REJECTED'):m.run_worker(None,'mock',self.fixture['small'])

    def test_new_process_resumes_six_commit_boundaries(self):
        f=self.fixture['small']
        for fault in ('prepare_before','prepare_after','batch_before','batch_after','complete_before','complete_after'):
            with self.subTest(fault=fault):
                model=RpcModel(f)
                with patch.object(m,'rpc',side_effect=model.invoke):
                    self.assertEqual(m.run_worker(None,'mock',f,stop_at=fault),{'interrupted':fault})
                    result=m.run_worker(None,'mock',f)
                    self.assertTrue(result['materializationComplete'])
                    self.assertFalse(result['activationAllowed']);self.assertFalse(result['finalizationAllowed'])
                    self.assertEqual(sum(n==m.RPCS[1] for n,p in model.calls),1)
                    before=copy.deepcopy(model.projections)
                    self.assertTrue(m.run_worker(None,'mock',f)['completion']['idempotent'])
                    self.assertEqual(model.projections,before)

    def test_large_two_batches_across_fresh_processes(self):
        f=self.fixture['large'];model=RpcModel(f)
        with patch.object(m,'rpc',side_effect=model.invoke):
            first=m.run_worker(None,'mock',f);second=m.run_worker(None,'mock',f)
        self.assertFalse(first['materializationComplete']);self.assertEqual(first['nextRowIndex'],2000)
        self.assertTrue(second['materializationComplete']);self.assertEqual(second['nextRowIndex'],2001)
        self.assertEqual(first['snapshotIngestionId'],second['snapshotIngestionId'])
        self.assertEqual([p['batch_start'] for n,p in model.calls if n==m.RPCS[1]],[0,2000])

    def test_secondary_first_has_independent_snapshot(self):
        f=self.fixture['small'];model=RpcModel(f)
        with patch.object(m,'rpc',side_effect=model.invoke):
            secondary=m.run_worker(None,'mock',f,target=f['secondary'])
            self.assertIsNone(secondary['completion']['job']['snapshot_ingestion_id'])
            primary=m.run_worker(None,'mock',f)
            again=m.run_worker(None,'mock',f,target=f['secondary'])
        self.assertNotEqual(primary['snapshotIngestionId'],secondary['snapshotIngestionId'])
        self.assertEqual(again['completion']['job']['snapshot_ingestion_id'],primary['snapshotIngestionId'])


if __name__=='__main__':unittest.main(verbosity=2)
