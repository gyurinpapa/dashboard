#!/usr/bin/env python3
"""Offline tests only. Child Node workers have all network transports blocked."""
import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('page_harness',Path(__file__).with_name('meta_ads_page_checkpoint_harness.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class PageHarness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import shutil
        cls.fixture=json.loads(m.h.command([shutil.which('node'),'--import','tsx',m.EXPORT]))

    def test_base_hash_pinned(self):
        with patch.object(Path,'read_bytes',return_value=b'changed'):
            with self.assertRaisesRegex(RuntimeError,'BASE_HARNESS_DRIFT'):m.load_base()

    def test_runtime_bootstrap_creates_cluster_roles_once(self):
        import re
        body=m.h.bootstrap_sql(m.h.load_authority())
        calls=[];roles=set()
        class StopAfterInitialization(Exception):pass
        class ClusterRoleModel:
            def query(self,db,sql):
                if 'SELECT jsonb_object_agg' in sql:raise StopAfterInitialization()
                calls.append((db,sql))
                for name in re.findall(r'CREATE ROLE "([a-z_]+)"',sql):
                    if name in roles:raise RuntimeError('ROLE_ALREADY_EXISTS:'+name)
                    roles.add(name)
        sql={'bootstrap.sql':body,'seed.sql':'SELECT 1; -- seed sentinel',
             'existing-candidate.sql':'SELECT 2; -- candidate sentinel'}
        with self.assertRaises(StopAfterInitialization):m.runtime_suite(ClusterRoleModel(),{}, {},sql)
        self.assertEqual(len(calls),4)
        self.assertEqual(roles,{'anon','authenticated','service_role','supabase_auth_admin','dashboard_user'})
        first,second=calls[0][1],calls[2][1]
        self.assertEqual(first.count('CREATE ROLE '),5);self.assertNotIn('CREATE ROLE ',second)
        # Every database-local statement and seed must still be present, in order.
        strip=lambda text:'\n'.join(line for line in text.splitlines() if not line.startswith('CREATE ROLE '))
        self.assertEqual(strip(first),second)
        for db,text in calls:
            self.assertIn(db,m.h.DATABASES)
            self.assertTrue(text.startswith('BEGIN;\n') and text.endswith('\nCOMMIT;'))
        self.assertIn('CREATE SCHEMA auth;',second)
        self.assertIn('GRANT USAGE ON SCHEMA',second)

    def test_role_bootstrap_drift_rejected_before_sql(self):
        from unittest.mock import Mock
        body=m.h.bootstrap_sql(m.h.load_authority())
        for changed in (body.replace('"service_role" NOLOGIN INHERIT BYPASSRLS','"service_role" LOGIN INHERIT BYPASSRLS'),
                        body+'\nCREATE ROLE "unexpected" NOLOGIN;',
                        '\n'.join(line for line in body.splitlines() if not line.startswith('CREATE ROLE "anon"'))):
            cluster=Mock()
            with self.assertRaisesRegex(RuntimeError,'CLUSTER_ROLE_BOOTSTRAP_DRIFT'):
                m.initialize_databases(cluster,{'bootstrap.sql':changed})
            cluster.query.assert_not_called()

    def test_database_initialization_failure_is_not_swallowed(self):
        from unittest.mock import Mock
        cluster=Mock();cluster.query.side_effect=RuntimeError('FIXTURE_INITIALIZATION_FAILED')
        with self.assertRaisesRegex(RuntimeError,'FIXTURE_INITIALIZATION_FAILED'):
            m.initialize_databases(cluster,{'bootstrap.sql':m.h.bootstrap_sql(m.h.load_authority()),
                                         'seed.sql':'SELECT 1;','existing-candidate.sql':'SELECT 2;'})
        self.assertEqual(cluster.query.call_count,1)

    def test_protected_directory_rejected(self):
        for name in ('/Users/damon/Projects/dashboard','/Users/damon/Projects/dashboard/child'):
            with self.assertRaisesRegex(RuntimeError,'PROTECTED'):m.check_path(Path(name))

    def test_prepare_has_zero_db_calls(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(m.h,'LocalCluster',side_effect=AssertionError('DB_FORBIDDEN')):
            target=Path(temp)/'prepared'
            fixture,baseline,sql,manifest=m.prepare(target)
            self.assertEqual(manifest['db_executions'],0);self.assertEqual(manifest['runtime'],'NOT_RUN')
            self.assertEqual(len(manifest['files']),7)
            self.assertEqual(fixture['input']['context'],baseline['context'])
            self.assertEqual(len(sql),4)
            for file in target.glob('*.sql'):
                preview=file.read_text()
                self.assertIn("RAISE EXCEPTION 'HARNESS_PREVIEW_NOT_EXECUTABLE'",preview)
                self.assertTrue(preview.rstrip().endswith('ROLLBACK;'))
            self.assertFalse((target/'runtime-result.json').exists())
            with self.assertRaisesRegex(RuntimeError,'OUTPUT_DIRECTORY_MUST_BE_NEW'):m.prepare(target)

    def test_sql_no_commit_candidate(self):
        text=m.SQL_PATH.read_text()
        self.assertIn('CREATE TABLE public.meta_ads_page_checkpoints',m.candidate_body(text))
        with self.assertRaisesRegex(RuntimeError,'CANDIDATE_MUST_ROLLBACK'):m.candidate_body(text.replace('ROLLBACK;','COMMIT;'))

    def test_rpc_allowlist_and_quoting(self):
        for name in ('public.bad','x; DROP TABLE x','',m.RPCS[0]+' '):
            with self.assertRaisesRegex(RuntimeError,'RPC_NOT_ALLOWLISTED'):m.rpc_sql(name,{})
        sql=m.rpc_sql(m.RPCS[0],{'test':"quote'; --"})
        self.assertTrue(sql.startswith('SET ROLE service_role;'))
        self.assertIn("quote''; --",sql)

    def test_argv_has_no_external_db_options(self):
        tree=ast.parse(Path(m.__file__).read_text())
        options=[n.args[0].value for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)
                 and n.func.attr=='add_argument']
        self.assertEqual(options,['--prepare','--run-isolated','--pg-bin'])

    def test_run_requires_both_flags(self):
        with patch.object(sys,'argv',['h','--prepare','/tmp/not-created','--run-isolated']),patch.object(m,'prepare',side_effect=AssertionError('NO_PREPARE')):
            with self.assertRaisesRegex(RuntimeError,'RUN_FLAG_AND_PG_BIN'):m.main()

    def test_same_session_guard_retained(self):
        text=m.BASE_PATH.read_text()
        self.assertIn('POSTGRES_REQUIRES_NON_ROOT_USER',text)
        self.assertIn('HARNESS_TARGET_REJECTED',text)
        self.assertIn("result[\"listen\"] == \"\"",text)
        self.assertIn('self.verify(db)',text)
        self.assertIn('PGSERVICEFILE',text)

    def test_clean_child_environment(self):
        for name in ('DATABASE_URL','PGHOST','SUPABASE_SERVICE_ROLE_KEY','MEDIA_CREDENTIAL_ENCRYPTION_KEY','NODE_OPTIONS'):
            self.assertNotIn(name,m.h.ENV)
        self.assertEqual(m.h.ENV['PGPASSFILE'],'/dev/null')

    def test_root_runtime_rejected_without_start(self):
        if os.geteuid()==0:
            with self.assertRaisesRegex(RuntimeError,'POSTGRES_REQUIRES_NON_ROOT_USER'):
                m.h.LocalCluster(Path('/tmp'))

    def test_worker_restarts_using_mock_rpc(self):
        state={'checkpoint':None,'rows':{}}
        def fake_rpc(cluster,db,name,p):
            for k,v in self.fixture['envelope'].items():self.assertEqual(p[k],v)
            if name==m.RPCS[0]:return copy.deepcopy(state['checkpoint'])
            if name==m.RPCS[1]:
                if p['expected_revision'] != (state['checkpoint']['revision'] if state['checkpoint'] else None):return False
                state['checkpoint']=copy.deepcopy(p['next']);return True
            self.assertEqual(name,m.RPCS[2]);self.assertEqual(p['pending_id'],state['checkpoint']['pending']['id'])
            rows=p['append_payload']['rows'];self.assertEqual(rows,state['checkpoint']['pending']['rows'])
            inserted=0
            for row in rows:
                idx=row['row_index']
                if idx in state['rows']:self.assertEqual(state['rows'][idx],row)
                else:state['rows'][idx]=copy.deepcopy(row);inserted+=1
            return {'submitted_rows':len(rows),'inserted_rows':inserted,'duplicate_rows':len(rows)-inserted,
                    'first_row_index':rows[0]['row_index'],'last_row_index':rows[-1]['row_index']}
        class FakeProcessCluster:pass
        cluster=FakeProcessCluster()
        with patch.object(m,'rpc',side_effect=fake_rpc):
            for fault in ('pending_commit','append_before_commit','append_commit','confirm_commit'):
                state['checkpoint']=None;state['rows']={}
                self.assertEqual(m.run_worker(cluster,'mock',self.fixture,fault),{'interrupted':fault})
                if fault=='confirm_commit':
                    self.assertEqual(state['checkpoint'],self.fixture['steps'][0]['confirmed'])
                    result=m.run_worker(cluster,'mock',self.fixture)
                    self.assertEqual(result['checkpoint'],self.fixture['steps'][1]['confirmed'])
                else:
                    result=m.run_worker(cluster,'mock',self.fixture,wire_pages=[])
                    self.assertTrue(result['resumedPending'])
                    self.assertEqual(result['checkpoint'],self.fixture['steps'][0]['confirmed'])
            state['checkpoint']=None;state['rows']={}
            for step in self.fixture['steps']:
                self.assertEqual(m.run_worker(cluster,'mock',self.fixture)['checkpoint'],step['confirmed'])
            self.assertEqual(len(state['rows']),6)
            self.assertTrue(m.run_worker(cluster,'mock',self.fixture,wire_pages=[])['alreadyComplete'])
            state['checkpoint']=None;state['rows']={}
            empty=m.run_worker(cluster,'mock',self.fixture,wire_pages=[{'data':[]}])
            self.assertEqual(empty['checkpoint'],self.fixture['empty']['final'])
            self.assertTrue(empty['emptyDatasetUnsupported'])
            self.assertFalse(empty['materializationAllowed'])
            self.assertEqual(state['rows'],{})

    def test_restart_checks_owned_cluster_first(self):
        from unittest.mock import Mock
        cluster=Mock();cluster.verify.side_effect=RuntimeError('REJECTED')
        with patch.object(m.h,'command') as command:
            with self.assertRaisesRegex(RuntimeError,'REJECTED'):m.restart_owned_cluster(cluster)
            command.assert_not_called()


if __name__=='__main__':
    unittest.main(verbosity=2)
