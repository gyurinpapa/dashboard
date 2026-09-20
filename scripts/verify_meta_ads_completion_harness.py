#!/usr/bin/env python3
"""Offline completion harness tests; no database started."""
import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock,patch
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('completion',Path(__file__).with_name('meta_ads_completion_harness.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class CompletionHarness(unittest.TestCase):
    def test_base_pin(self):
        with patch.object(Path,'read_bytes',return_value=b'changed'):
            with self.assertRaisesRegex(RuntimeError,'HANDOFF_HARNESS_DRIFT'):m.load_base()

    def test_rpc_scope(self):
        for name in ('append_media_sync_staging_batch','x; DROP TABLE x',''):
            with self.assertRaisesRegex(RuntimeError,'RPC_NOT_ALLOWLISTED'):m.rpc_sql(name,{})
        self.assertIn("quote''",m.rpc_sql(m.RPCS[0],{'x':"quote'"}))

    def test_no_external_database_arguments(self):
        tree=ast.parse(Path(m.__file__).read_text())
        self.assertEqual([n.args[0].value for n in ast.walk(tree) if isinstance(n,ast.Call) and
            isinstance(n.func,ast.Attribute) and n.func.attr=='add_argument'],['--prepare','--run-isolated','--pg-bin'])

    def test_both_runtime_flags_required(self):
        for flags in (['--run-isolated'],['--pg-bin','/tmp']):
            with patch.object(sys,'argv',['h','--prepare','/tmp/unused']+flags),patch.object(m,'prepare',side_effect=AssertionError('NO_PREPARE')):
                with self.assertRaisesRegex(RuntimeError,'RUN_FLAG_AND_PG_BIN'):m.main()

    def test_root_guard_retained(self):
        if os.geteuid()==0:
            with self.assertRaisesRegex(RuntimeError,'POSTGRES_REQUIRES_NON_ROOT_USER'):m.h.LocalCluster(Path('/tmp'))

    def test_prepare_no_db(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(m.h,'LocalCluster',side_effect=AssertionError('NO_DB')):
            target=Path(temp)/'new';_,_,_,manifest=m.prepare(target)
            self.assertEqual(manifest['db_executions'],0);self.assertEqual(manifest['runtime'],'NOT_RUN')
            self.assertEqual(len(manifest['files']),18)
            self.assertFalse((target/'runtime-result.json').exists())

    def test_transition_comparison_limits_exact_ids_and_fields(self):
        p={'job_id':'job','connection_id':'connection','projections':[{'report_id':'primary'},{'report_id':'secondary'}]}
        before={'common':{'reports':[{'id':'primary','current_ingestion_id':'old','published_ingestion_id':'published'},
                                   {'id':'csv','current_ingestion_id':'csv-old'}],
                          'media_sync_jobs':[{'id':'job','status':'processing','inserted_rows':6}],
                          'media_connections':[{'id':'connection','last_sync_at':None}]},'page':{'rows':[1]},'handoffs':[1]}
        activated=copy.deepcopy(before);activated['common']['reports'][0]['current_ingestion_id']='new'
        m.unchanged_except_transition(before,activated,p)
        final=copy.deepcopy(activated);final['common']['media_sync_jobs'][0]['status']='done'
        final['common']['media_connections'][0]['last_sync_at']='timestamp'
        m.unchanged_except_transition(activated,final,p,final=True)
        for table,field in (('reports','published_ingestion_id'),('media_sync_jobs','inserted_rows')):
            bad=copy.deepcopy(final);bad['common'][table][0][field]='bad'
            with self.assertRaisesRegex(RuntimeError,'UNEXPECTED_TRANSITION_MUTATION'):m.unchanged_except_transition(activated,bad,p,final=True)
        bad=copy.deepcopy(activated);bad['common']['reports'][1]['current_ingestion_id']='bad'
        with self.assertRaisesRegex(RuntimeError,'UNEXPECTED_TRANSITION_MUTATION'):m.unchanged_except_transition(before,bad,p)
        bad=copy.deepcopy(final);bad['page']['rows']=[2]
        with self.assertRaisesRegex(RuntimeError,'UNEXPECTED_TRANSITION_MUTATION'):m.unchanged_except_transition(activated,bad,p,final=True)

    def test_rejection_must_preserve_state(self):
        cluster=Mock()
        with patch.object(m.m,'witness',side_effect=[{'state':1},{'state':2}]):
            with self.assertRaisesRegex(RuntimeError,'FAILED_TRANSITION_MUTATED_STATE'):m.failure(cluster,'mock','SELECT 1','marker')
        cluster.query.assert_called_once_with('mock','SELECT 1',expect_error='marker')

    def test_database_failure_not_swallowed(self):
        cluster=Mock();cluster.query.side_effect=RuntimeError('DB_FAILED')
        with patch.object(m.m,'witness',return_value={}):
            with self.assertRaisesRegex(RuntimeError,'DB_FAILED'):m.failure(cluster,'mock','SELECT 1','marker')

if __name__=='__main__':unittest.main(verbosity=2)
