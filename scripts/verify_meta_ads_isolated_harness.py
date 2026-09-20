#!/usr/bin/env python3
"""Offline unit verification of target guards and generation. Starts no DB."""
import importlib.util
import ast
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("harness", Path(__file__).with_name("meta_ads_isolated_harness.py"))
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class OfflineHarness(unittest.TestCase):
    def test_all_harness_rpc_names_can_be_serialized(self):
        tree = ast.parse(Path(h.__file__).read_text())
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Name) and node.func.id == "rpc_sql"]
        names = set()
        for call in calls:
            self.assertIsInstance(call.args[0], ast.Constant)
            name = call.args[0].value
            names.add(name)
            for scalar in (False, True):
                sql = h.rpc_sql(name, {"fixture": "quote'; --"}, scalar)
                self.assertIn("public." + name + "(", sql)
        self.assertIn("validate_meta_ads_staging_batch_v1", names)
        self.assertIn("activate_meta_ads_snapshot_fanout", names)
        authority = h.load_authority()
        definitions = h.bootstrap_sql(authority) + h.candidate_sql(authority)
        for name in names:
            self.assertIn("FUNCTION public." + name + "(", definitions)

    def test_rpc_names_reject_non_identifiers(self):
        for name in ("", "1rpc", "public.rpc", "rpc;select 1", "rpc--", "rpc/*x*/",
                     "rpc()", '"rpc"', "rpc name", "rpc\n", "메타_v1"):
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, "RPC_NAME_INVALID"):
                h.rpc_sql(name, {})

    def test_processing_retry_uses_committed_checkpoint(self):
        batch = {"batch_start": 4, "batch_size": 2, "expected_rows": 6, "snapshot_ingestion_id": "snapshot"}
        calls = []
        class FakeCluster:
            def query(self, db, sql, expect_error=None):
                calls.append((sql, expect_error))
                if "prepare_media_sync_snapshot_materialization" in sql:
                    return {"snapshot_ingestion_id": "snapshot", "next_row_index": 6}
                if expect_error:
                    self.asserted_marker = expect_error
                    return None
                return {"next_row_index": 6}
        cluster = FakeCluster()
        with patch.object(h, "database_witness", return_value={"unchanged": True}):
            h.materialize_processing_batch(cluster, "baseline", batch)
        self.assertEqual(len(calls), 3)
        self.assertIn("batch start does not match the processing checkpoint", calls[1][1])
        self.assertIn("prepare_media_sync_snapshot_materialization", calls[2][0])

    def test_processing_retry_rejects_changed_state_and_wrong_resume(self):
        batch = {"batch_start": 0, "batch_size": 2, "expected_rows": 6, "snapshot_ingestion_id": "snapshot"}
        from unittest.mock import Mock
        cluster = Mock()
        cluster.query.side_effect = [{"next_row_index": 2}, None]
        with patch.object(h, "database_witness", side_effect=[{"rows": 2}, {"rows": 4}]):
            with self.assertRaisesRegex(RuntimeError, "FAILED_TRANSACTION_CHANGED_STATE"):
                h.materialize_processing_batch(cluster, "baseline", batch)
        for prepared in ({"snapshot_ingestion_id": "other", "next_row_index": 2},
                         {"snapshot_ingestion_id": "snapshot", "next_row_index": 0}):
            cluster.query.side_effect = [{"next_row_index": 2}, None, prepared]
            with patch.object(h, "database_witness", return_value={}):
                with self.assertRaisesRegex(RuntimeError, "MATERIALIZATION_RESUME_CHECKPOINT_MISMATCH"):
                    h.materialize_processing_batch(cluster, "baseline", batch)

    def test_evidence_and_previews(self):
        data = h.load_authority()
        self.assertEqual(len(data["tables"]), 25)
        sql = h.bootstrap_sql(data)
        self.assertEqual(sql.count("CREATE TABLE "), 25)
        self.assertEqual(sql.count("CREATE OR REPLACE FUNCTION "), 29)
        expected_triggers = sum(len(t["user_triggers"]) for t in data["tables"].values())
        self.assertEqual(sql.count("CREATE TRIGGER "), expected_triggers)
        self.assertNotIn("DISABLE TRIGGER", sql)
        self.assertNotIn("session_replication_role", sql)
        for name, table in data["tables"].items():
            for c in table["constraints"]:
                self.assertIn(c["definition"] + ";", sql)
            for trigger in table["user_triggers"]:
                self.assertIn(trigger["trigger_definition"] + ";", sql)
        self.assertIn("GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED", sql)
        preview = h.preview(sql)
        self.assertLess(preview.index("RAISE EXCEPTION 'HARNESS_PREVIEW_NOT_EXECUTABLE'"), preview.index("CREATE TABLE"))
        self.assertTrue(preview.endswith("ROLLBACK;\n"))
        h.candidate_sql(data)

    def test_authority_tampering(self):
        with patch.object(Path, "read_bytes", return_value=b"modified"):
            with self.assertRaisesRegex(RuntimeError, "AUTHORITY_FILE_DRIFT"):
                h.load_authority()

    def test_sql_quoting(self):
        self.assertEqual(h.literal("a';DROP TABLE x;--"), "'a'';DROP TABLE x;--'")
        self.assertEqual(h.ident('a"b'), '"a""b"')
        with self.assertRaisesRegex(RuntimeError, "RPC_NAME_INVALID"):
            h.rpc_sql("x;select pg_sleep(1)", {})

    def test_environment_is_not_inherited(self):
        with patch.dict(os.environ, {"PGHOST": "production.invalid", "DATABASE_URL": "postgres://production.invalid/db", "PGSERVICE": "production"}):
            self.assertNotIn("PGHOST", h.ENV)
            self.assertNotIn("DATABASE_URL", h.ENV)
            self.assertNotIn("PGSERVICE", h.ENV)
            self.assertEqual(h.ENV["PGPASSFILE"], "/dev/null")

    def fake_cluster(self, directory):
        c = object.__new__(h.LocalCluster)
        c.pg_bin = Path("/not-executed")
        c.root = directory
        c.data = directory / "data"
        c.sock = directory / "socket"
        c.data.mkdir(); c.sock.mkdir()
        (c.data / "postmaster.pid").write_text("12345\n" + str(c.data) + "\n")
        c.started = True
        c.system_id = "123456789"
        return c

    def test_backend_identity_rejections(self):
        with tempfile.TemporaryDirectory(prefix="meta-harness-unit-") as directory:
            c = self.fake_cluster(Path(directory))
            valid = {"directory": str(c.data), "socket": str(c.sock), "listen": "", "version": "170006",
                     "database": h.DATABASES[0], "peer": None, "port": "55439", "system_id": "123456789"}
            with patch.object(c, "raw", return_value=valid):
                c.verify(h.DATABASES[0])
            mutations = {"directory": "/production", "socket": "/tmp/other", "listen": "127.0.0.1",
                         "version": "170007", "database": "postgres", "peer": "127.0.0.1", "port": "5432", "system_id": "987654321"}
            for key, value in mutations.items():
                with self.subTest(key=key), patch.object(c, "raw", return_value={**valid, key: value}):
                    with self.assertRaises(RuntimeError):
                        c.verify(h.DATABASES[0])
            with self.assertRaisesRegex(RuntimeError, "DATABASE_NOT_ALLOWLISTED"):
                c.argv("production")
            argv = c.argv(h.DATABASES[0])
            self.assertIn("-X", argv)
            self.assertEqual(argv[argv.index("-h")+1], str(c.sock))

    def test_same_session_guard_before_sql(self):
        with tempfile.TemporaryDirectory(prefix="meta-harness-unit-") as directory:
            c = self.fake_cluster(Path(directory))
            with patch.object(c, "verify") as verify, patch.object(c, "raw", return_value={}) as raw:
                c.query(h.DATABASES[0], "SELECT 42;")
                verify.assert_called_once_with(h.DATABASES[0])
                sql = raw.call_args.args[1]
                self.assertLess(sql.index("HARNESS_TARGET_REJECTED"), sql.index("SELECT 42"))
                self.assertIn("pg_control_system()", sql)
                self.assertIn(str(c.data), sql)

    def test_prepare_is_non_database(self):
        with tempfile.TemporaryDirectory(prefix="meta-harness-unit-") as directory:
            output = Path(directory) / "prepared"
            # Actual offline adapter export is permitted; every subprocess is
            # inspected so a future prepare-mode DB invocation fails this test.
            real_command = h.command
            def node_only(argv, **kwargs):
                self.assertEqual(Path(argv[0]).name, "node")
                self.assertIn("scripts/export-meta-ads-isolated-fixture.ts", argv)
                return real_command(argv, **kwargs)
            with patch.object(h, "command", side_effect=node_only), patch.object(h.LocalCluster, "start", side_effect=AssertionError("DB_START_FORBIDDEN")):
                _, fixture, _, manifest = h.prepare(output)
            self.assertEqual(fixture["total_rows"], 6)
            self.assertEqual(manifest["db_executions"], 0)
            self.assertEqual(manifest["runtime_tests"], "NOT_RUN")
            for name, digest in manifest["files"].items():
                self.assertEqual(h.sha((output / name).read_bytes()), digest)
            with self.assertRaisesRegex(RuntimeError, "OUTPUT_DIRECTORY_MUST_BE_NEW"):
                h.prepare(output)

    def test_protected_directory_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "PROTECTED_REPOSITORY_FORBIDDEN"):
            h.prepare(Path("/Users/damon/Projects/dashboard/never-create"))
        with self.assertRaisesRegex(RuntimeError, "PROTECTED_REPOSITORY_FORBIDDEN"):
            h.LocalCluster(Path("/Users/damon/Projects/dashboard/bin"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
