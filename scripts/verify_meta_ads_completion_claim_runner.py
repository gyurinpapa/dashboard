#!/usr/bin/env python3
"""Runner verification. No PostgreSQL process or external API is started."""
import argparse
import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('resume-meta-ads-completion-claim-test.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)


class RunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.payload=r.load_payload()

    def test_embedded_payload_integrity(self):
        self.assertEqual(len(self.payload['files']),59)
        self.assertEqual(set(self.payload['files']),set(r.ALLOWLIST))
        with patch.object(r,'PAYLOAD_SHA','0'*64):
            with self.assertRaisesRegex(RuntimeError,'PAYLOAD_HASH_MISMATCH'):r.load_payload()

    def test_missing_or_wrong_scope_refused_before_write(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            data={'files':{'src/new.ts':{'base_sha256':None,'sha256':r.sha(b'new'),'data':base64.b64encode(b'new').decode()},
                           'src/existing.ts':{'base_sha256':r.sha(b'old'),'sha256':r.sha(b'new'),'data':base64.b64encode(b'new').decode()}}}
            with self.assertRaisesRegex(RuntimeError,'FRESH_BASE_DRIFT'):r.apply_payload(root,data)
            self.assertFalse((root/'src/new.ts').exists())

    def test_apply_is_exact_and_not_overwrite_mode(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'src').mkdir();(root/'src/existing.ts').write_bytes(b'old')
            data={'files':{'src/existing.ts':{'base_sha256':r.sha(b'old'),'sha256':r.sha(b'new'),'data':base64.b64encode(b'new').decode()}}}
            r.apply_payload(root,data);self.assertEqual((root/'src/existing.ts').read_bytes(),b'new')
            with self.assertRaisesRegex(RuntimeError,'FRESH_BASE_DRIFT'):r.apply_payload(root,data)

    def test_symlink_parent_and_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as a,tempfile.TemporaryDirectory() as b:
            root=Path(a);(root/'src').symlink_to(b)
            with self.assertRaisesRegex(RuntimeError,'SYMLINK_SOURCE_PATH'):r.child_file(root,'src/x')
            for name in ('../x','/tmp/x','src/../x'):
                with self.assertRaisesRegex(RuntimeError,'UNSAFE_CHILD_PATH'):r.child_file(root,name)

    def test_protected_path_rejected_before_resolve(self):
        with patch.object(Path,'resolve',side_effect=AssertionError('MUST_NOT_RESOLVE')):
            with self.assertRaisesRegex(RuntimeError,'PROTECTED'):r.resolve_directory(r.PROTECTED/'child')

    def test_git_metadata_indirection_rejected_before_git(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'.git').symlink_to(r.PROTECTED)
            with patch.object(r,'git_output',side_effect=AssertionError('MUST_NOT_CALL_GIT')):
                with self.assertRaisesRegex(RuntimeError,'SOURCE_GIT_DIR_SCOPE'):r.verify_source(root,self.payload)

    def test_external_environment_removed(self):
        with patch.dict(os.environ,{'DATABASE_URL':'forbidden','NODE_OPTIONS':'--require=forbidden','GIT_DIR':'forbidden'}):
            env=r.clean_env(Path('/fixture/tools'))
            self.assertNotIn('DATABASE_URL',env);self.assertNotIn('NODE_OPTIONS',env);self.assertNotIn('GIT_DIR',env)
            self.assertEqual(env['GIT_ALLOW_PROTOCOL'],'file')
            self.assertEqual(env['GIT_CONFIG_GLOBAL'],'/dev/null')

    def test_offline_prepare_with_minimal_dependencies(self):
        # Test only preparation, on Linux too. The public --run Mac/non-root gate
        # and the harness root guard are unchanged and are never bypassed for DB.
        r.verify_source(ROOT,self.payload)
        before={p:r.sha((ROOT/p).read_bytes()) for p in self.payload['files']}
        with tempfile.TemporaryDirectory(prefix='meta-runner-unit-') as temp:
            root=Path(temp);bin_dir=root/'bin';bin_dir.mkdir()
            (bin_dir/'python3').symlink_to(sys.executable)
            (bin_dir/'node').symlink_to(shutil.which('node'))
            deps=root/'fixture-tools/node_modules';deps.mkdir(parents=True)
            for name in ('tsx','esbuild'):
                shutil.copytree(ROOT/'node_modules'/name,deps/name)
            packages=list((ROOT/'node_modules/@esbuild').iterdir())
            for package in packages:
                if package.is_dir():shutil.copytree(package,deps/'@esbuild'/package.name)
            args=argparse.Namespace(run=False)
            r.execute(args,self.payload,(root,root,ROOT,root/'unused-pg-bin',bin_dir,deps))
            outputs=list(root.glob('etrylue-meta-claim-db-*/results/manifest.json'))
            self.assertEqual(len(outputs),1)
            manifest=json.loads(outputs[0].read_text())
            self.assertEqual(manifest['db_executions'],0)
            self.assertEqual(manifest['runtime'],'NOT_RUN')
            self.assertFalse((outputs[0].parent/'runtime-result.json').exists())
        self.assertEqual(before,{p:r.sha((ROOT/p).read_bytes()) for p in self.payload['files']})


if __name__=='__main__':unittest.main(verbosity=2)
