#!/usr/bin/env python3
"""Offline harness verification; SQL runtime remains untested here."""
import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock,patch
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('claim_harness',Path(__file__).with_name('meta_ads_completion_claim_harness.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ClaimHarness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture=json.loads(m.h.command([shutil.which('node'),'--import','tsx',m.m.EXPORT]))['small']

    def test_base_hash_pinned(self):
        with patch.object(Path,'read_bytes',return_value=b'changed'):
            with self.assertRaisesRegex(RuntimeError,'COMPLETION_HARNESS_DRIFT'):m.load_base()

    def test_candidate_hash_and_rollback(self):
        text=m.SQL.read_text();self.assertIn('CREATE FUNCTION',m.candidate_body(text))
        with self.assertRaisesRegex(RuntimeError,'CLAIM_SQL_DRIFT'):m.candidate_body(text.replace('ROLLBACK;','COMMIT;'))

    def test_rpc_allowlist_excludes_old_paths_and_helper(self):
        for name in (*m.c.RPCS,m.HELPER,'bad;DROP TABLE x',''):
            with self.assertRaisesRegex(RuntimeError,'RPC_NOT_ALLOWLISTED'):m.rpc_sql(name,{})
        self.assertIn("quote''",m.rpc_sql(m.RPCS[0],{'test':"quote'"}))

    def test_original_claim_payload_copied(self):
        p=m.payload(self.fixture);j=self.fixture['input']['job']
        self.assertEqual(p['attempt_count'],j['attempt_count']);self.assertEqual(p['started_at'],j['started_at'])
        self.assertEqual(set(p),{'page','attempt_count','started_at','checkpoint_revision','checkpoint_digest','expected_rows'})
        p['page']['job_id']='changed';self.assertEqual(self.fixture['page']['envelope']['job_id'],j['id'])

    def test_prepare_no_db_and_disabled_previews(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(m.h,'LocalCluster',side_effect=AssertionError('NO_DB')):
            target=Path(temp)/'new';_,_,sql,manifest=m.prepare(target)
            self.assertEqual(manifest['db_executions'],0);self.assertEqual(manifest['runtime'],'NOT_RUN')
            self.assertEqual(len(manifest['files']),22);self.assertEqual(len(sql),6)
            for path in target.glob('*.sql'):
                self.assertIn("RAISE EXCEPTION 'HARNESS_PREVIEW_NOT_EXECUTABLE'",path.read_text())
                self.assertTrue(path.read_text().rstrip().endswith('ROLLBACK;'))
            self.assertFalse((target/'runtime-result.json').exists())

    def test_cli_has_no_external_database(self):
        tree=ast.parse(Path(m.__file__).read_text())
        self.assertEqual([n.args[0].value for n in ast.walk(tree) if isinstance(n,ast.Call) and
            isinstance(n.func,ast.Attribute) and n.func.attr=='add_argument'],['--prepare','--run-isolated','--pg-bin'])

    def test_pair_flags_before_prepare(self):
        for flags in (['--run-isolated'],['--pg-bin','/tmp']):
            with patch.object(sys,'argv',['h','--prepare','/tmp/unused']+flags),patch.object(m,'prepare',side_effect=AssertionError('NO_PREPARE')):
                with self.assertRaisesRegex(RuntimeError,'RUN_FLAG_AND_PG_BIN'):m.main()

    def test_root_runtime_guard(self):
        if os.geteuid()==0:
            with self.assertRaisesRegex(RuntimeError,'POSTGRES_REQUIRES_NON_ROOT_USER'):m.h.LocalCluster(Path('/tmp'))

    def test_protected_directory(self):
        with patch.object(Path,'resolve',side_effect=AssertionError('NO_RESOLVE')):
            with self.assertRaisesRegex(RuntimeError,'PROTECTED'):m.m.check_path(Path('/Users/damon/Projects/dashboard/child'))

    def test_claim_changes_use_failing_transactions(self):
        p=m.payload(self.fixture)
        with patch.object(m.c,'failure') as fail:
            self.assertEqual(m.claim_changes(None,'mock',p),4)
        for call in fail.call_args_list:
            sql,marker=call.args[2:]
            self.assertTrue(sql.startswith('BEGIN; UPDATE') and sql.endswith('COMMIT;'))
            self.assertEqual(marker,'META_COMPLETION_CLAIM_CHANGED')

    def test_concurrent_results_must_have_one_initial_write(self):
        lock=threading.Lock();calls=[]
        def query(db,sql):
            with lock:
                calls.append(sql);return {'idempotent':len(calls)>1}
        cluster=Mock();cluster.query.side_effect=query
        self.assertEqual(len(m.two_sessions(cluster,'mock',m.RPCS[0],m.payload(self.fixture))),2)
        cluster.query.side_effect=lambda db,sql:{'idempotent':False}
        with self.assertRaisesRegex(RuntimeError,'RACE_NOT_SERIALIZED'):m.two_sessions(cluster,'mock',m.RPCS[0],m.payload(self.fixture))

    def test_reclaim_race_observes_block_then_rejects_committed_claim(self):
        p=m.payload(self.fixture);release=threading.Event();started=threading.Event();errors=[]
        state={'common':{'media_sync_jobs':[{'id':p['page']['job_id'],'attempt_count':1,'updated_at':'2026-09-19T00:00:00Z'}]}}
        class Model:
            def query(self,db,sql,expect_error=None):
                if sql.startswith('SET application_name='):
                    started.set();assert release.wait(5)
                    state['common']['media_sync_jobs'][0]['attempt_count']=2
                    return {'committed':True}
                if 'pg_stat_activity' in sql:
                    assert started.wait(5);return {'ready':True}
                if sql.startswith('UPDATE public.media_sync_jobs'):
                    state['common']['media_sync_jobs'][0]['attempt_count']=1;return None
                if expect_error:
                    errors.append(expect_error)
                    if expect_error=='lock timeout':release.set()
                    else:assert state['common']['media_sync_jobs'][0]['attempt_count']==2
                    return None
                raise AssertionError('UNEXPECTED_SQL')
        with patch.object(m.m,'witness',side_effect=lambda *args:copy.deepcopy(state)):
            m.reclaim_race(Model(),'mock',m.RPCS[0],p)
        self.assertEqual(errors,['lock timeout','META_COMPLETION_CLAIM_CHANGED'])
        self.assertEqual(state['common']['media_sync_jobs'][0]['attempt_count'],1)

    def test_database_rejection_not_swallowed(self):
        cluster=Mock();cluster.query.side_effect=RuntimeError('DATABASE_REJECTED')
        with patch.object(m.m,'witness',return_value={}):
            with self.assertRaisesRegex(RuntimeError,'DATABASE_REJECTED'):m.rejected(cluster,'mock',m.RPCS[0],m.payload(self.fixture))

if __name__=='__main__':unittest.main(verbosity=2)
