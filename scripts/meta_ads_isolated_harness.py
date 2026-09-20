#!/usr/bin/env python3
"""Prepare offline, or explicitly run against a NEW private PostgreSQL cluster.

No URL/host/database/password/env-file option exists. Preparation never starts
PostgreSQL. SQL previews deliberately raise before any DDL. Runtime creates its
own socket/data directory and verifies the backend before each SQL submission.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
AUTHORITY = ROOT / "scripts/fixtures/meta-ads-isolated-db-authority.json"
AUTHORITY_SHA = "83c82dd460c2e8344359efdbdb3c1dabfbabf0e3052a33bf6438e3d16808c985"
CANDIDATES = ["create-meta-ads-staging-contract.sql", "create-meta-ads-snapshot-materialization.sql",
              "create-activate-meta-ads-snapshot-fanout.sql", "create-meta-ads-finalization-contract.sql"]
CANDIDATE_HASHES = ["77700291945b9e68198f1c065c9fe8928bcd61584df0c8131d4307d4d2510531",
                    "3902332ee27eff683cff1e11276968c12784c50ac1037a08bb6574c186176dfa",
                    "7bec4fe4761f4f2baaa11e572043fe4023cb8d01874eb15ea4294ee318a40427",
                    "a5247ad5f4f22b6e118efa7edaa4ad502973f0bfe3315068bd661bf0694f8bd0"]
BASE_SHA = "f714e95a374592a0f7581a2d82132ab043fab35e"
DATABASES = ("meta_ads_isolated_baseline", "meta_ads_isolated_candidate")
FIXED_TIME = "2026-09-19T00:00:00+00:00"
ENV = {"PATH": os.defpath, "LC_ALL": "C", "PGCONNECT_TIMEOUT": "5",
       "PGPASSFILE": "/dev/null", "PGSERVICEFILE": "/dev/null"}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def ident(s):
    return '"' + s.replace('"', '""') + '"'


def literal(s):
    return "'" + str(s).replace("'", "''") + "'"


def qualified(s):
    return ".".join(ident(p) for p in s.split("."))


def json_sql(value):
    return literal(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def uid(label):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://meta-fixture.invalid/" + label))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def command(argv, *, stdin=None, timeout=60, cwd=ROOT):
    result = subprocess.run([str(a) for a in argv], input=stdin, text=True, capture_output=True,
                            cwd=cwd, env=ENV, timeout=timeout, check=False)
    require(result.returncode == 0, f"LOCAL_COMMAND_FAILED: {Path(argv[0]).name}: {result.stderr[-5000:]}")
    return result.stdout


def load_authority():
    require(sha(AUTHORITY.read_bytes()) == AUTHORITY_SHA, "AUTHORITY_FILE_DRIFT")
    data = json.loads(AUTHORITY.read_text())
    require((len(data["tables"]), len(data["baseline_functions"]), len(data["helper_functions"])) == (25, 17, 12),
            "AUTHORITY_OBJECT_COUNT")
    for f in list(data["baseline_functions"].values()) + list(data["helper_functions"].values()):
        encoded = f["definition"].encode()
        require(hashlib.md5(encoded).hexdigest() == f["definition_md5"] and len(encoded) == f["definition_bytes"],
                "FUNCTION_EVIDENCE_CORRUPT")
    return data


def export_fixture():
    node = shutil.which("node")
    require(node is not None, "NODE_REQUIRED_FOR_OFFLINE_ADAPTER_EXPORT")
    text = command([node, "--import", "tsx", "scripts/export-meta-ads-isolated-fixture.ts"])
    fixture = json.loads(text)
    require(fixture["total_rows"] == 6 and len(fixture["rows"]) == 6, "FIXTURE_COUNT")
    return fixture


def candidate_sql(authority):
    out = []
    replaced = set()
    for name, expected_hash in zip(CANDIDATES, CANDIDATE_HASHES):
        path = ROOT / "scripts/sql" / name
        require(sha(path.read_bytes()) == expected_hash, "CANDIDATE_FILE_DRIFT:" + name)
        sql = path.read_text()
        require(sql.rstrip().endswith("ROLLBACK;"), "CANDIDATE_MUST_ROLLBACK")
        # Preserve all guards/privileges; remove only this file's transaction wrapper.
        start = sql.index("BEGIN;\n") + len("BEGIN;\n")
        body = sql[start:sql.rfind("ROLLBACK;")]
        definitions = re.findall(r"(CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\$function\$;)", body)
        for definition, function_name in definitions:
            original = authority["baseline_functions"][f"public.{function_name}(jsonb)"]["definition"]
            restored = re.sub(r"/\* META_ONLY_BEGIN:(\w+) \*/[\s\S]*?/\* META_ONLY_END:\1 \*/\n?", "", definition)
            require(restored.rstrip().removesuffix(";").rstrip() == original.rstrip().removesuffix(";").rstrip(),
                    "NON_META_FUNCTION_BODY_DRIFT:" + function_name)
            replaced.add(function_name)
        out.append(body)
    require(len(replaced) == 5, "COMMON_FUNCTION_COUNT")
    return "\n".join(out)


PRIVILEGES = {"a": "INSERT", "r": "SELECT", "w": "UPDATE", "d": "DELETE", "D": "TRUNCATE",
              "x": "REFERENCES", "t": "TRIGGER", "m": "MAINTAIN", "X": "EXECUTE"}


def acl_sql(kind, target, acl, owner):
    # Export contains only simple role names. Reject unsupported ACL syntax.
    require(acl is not None and acl.startswith("{") and acl.endswith("}"), "ACL_EVIDENCE_REQUIRED")
    lines = [f"REVOKE ALL ON {kind} {target} FROM PUBLIC;"]
    for entry in acl[1:-1].split(","):
        match = re.fullmatch(r"([a-z_0-9]*)=([arwdDxtmX*]+)/([a-z_0-9]+)", entry)
        require(match is not None, "UNSUPPORTED_ACL")
        role, perms, _grantor = match.groups()
        role_sql = ident(role) if role else "PUBLIC"
        for letter, option in re.findall(r"([arwdDxtmX])(\*?)", perms):
            lines.append(f"GRANT {PRIVILEGES[letter]} ON {kind} {target} TO {role_sql}" +
                         (" WITH GRANT OPTION" if option else "") + ";")
    return lines


def bootstrap_sql(data):
    out = ["SET search_path=pg_catalog;", "CREATE SCHEMA extensions;", "CREATE EXTENSION pgcrypto WITH SCHEMA extensions VERSION '1.3';",
           "CREATE SCHEMA auth;", "CREATE SCHEMA meta_harness;"]
    # These are local NOLOGIN stand-ins; no Supabase login, JWT or OAuth service.
    for role in ["anon", "authenticated", "service_role", "supabase_auth_admin", "dashboard_user"]:
        out.append(f"CREATE ROLE {ident(role)} NOLOGIN INHERIT " + ("BYPASSRLS" if role == "service_role" else "NOBYPASSRLS") + ";")
    out += ["GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role, supabase_auth_admin, dashboard_user;",
            "GRANT USAGE ON SCHEMA meta_harness TO service_role;"]
    for name, table in data["tables"].items():
        require(table["relation_kind"] == "r" and not table.get("inheritance", []) and not table.get("rules", []), "UNSUPPORTED_RELATION")
        columns = []
        for c in table["columns"]:
            require(not c["identity"] and c["column_acl"] is None, "UNSUPPORTED_COLUMN_METADATA")
            definition = ident(c["name"]) + " " + c["type"]
            if c["generated"]:
                require(c["generated"] == "s", "UNSUPPORTED_GENERATION")
                definition += " GENERATED ALWAYS AS (" + c["default_expression"] + ") STORED"
            elif c["default_expression"] is not None:
                definition += " DEFAULT " + c["default_expression"]
            if c["not_null"]:
                definition += " NOT NULL"
            columns.append(definition)
        out.append(f"CREATE TABLE {qualified(name)} (" + ",\n".join(columns) + ");")
        out.append(f"ALTER TABLE {qualified(name)} OWNER TO {ident(table['owner'])};")
    # Cyclic FK graphs are supported by creating all tables and unique keys first.
    for fk_pass in (False, True):
        for name, table in data["tables"].items():
            for constraint in table["constraints"]:
                if (constraint["kind"] == "f") != fk_pass:
                    continue
                require(constraint["validated"], "UNVALIDATED_CONSTRAINT")
                out.append(f"ALTER TABLE {qualified(name)} ADD CONSTRAINT {ident(constraint['name'])} {constraint['definition']};")
    for name, table in data["tables"].items():
        constraint_indexes = {c["name"] for c in table["constraints"] if c["kind"] in ("p", "u", "x")}
        for index in table["indexes"]:
            require(index["valid"] and index["ready"], "INVALID_INDEX")
            match = re.match(r'CREATE (?:UNIQUE )?INDEX (\w+) ON ', index["definition"])
            require(match is not None, "UNSUPPORTED_INDEX_DEFINITION")
            if match[1] not in constraint_indexes:
                out.append(index["definition"] + ";")
    for f in list(data["helper_functions"].values()) + list(data["baseline_functions"].values()):
        out.append(f["definition"].rstrip().removesuffix(";") + ";")
        owner = f["owner"] or "postgres"
        out.append(f"ALTER FUNCTION {f['identity']} OWNER TO {ident(owner)};")
        if f["acl"] is not None:
            out += acl_sql("FUNCTION", f["identity"], f["acl"], owner)
        else:
            # Explicitly scoped fixture assumption for three helper ACLs only.
            out += [f"REVOKE ALL ON FUNCTION {f['identity']} FROM PUBLIC;",
                    f"GRANT EXECUTE ON FUNCTION {f['identity']} TO service_role;"]
    for name, table in data["tables"].items():
        out += acl_sql("TABLE", qualified(name), table["acl"], table["owner"])
        if table["rls_enabled"]:
            out.append(f"ALTER TABLE {qualified(name)} ENABLE ROW LEVEL SECURITY;")
        if table["rls_forced"]:
            out.append(f"ALTER TABLE {qualified(name)} FORCE ROW LEVEL SECURITY;")
        for p in table["policies"]:
            cmd = {"r": "SELECT", "a": "INSERT", "w": "UPDATE", "d": "DELETE", "*": "ALL"}[p["command"]]
            role_sql = ",".join("PUBLIC" if r == "PUBLIC" else ident(r) for r in p["roles"])
            sql = f"CREATE POLICY {ident(p['name'])} ON {qualified(name)} AS " + ("PERMISSIVE" if p["permissive"] else "RESTRICTIVE") + f" FOR {cmd} TO {role_sql}"
            if p["using"] is not None:
                sql += " USING (" + p["using"] + ")"
            if p["with_check"] is not None:
                sql += " WITH CHECK (" + p["with_check"] + ")"
            out.append(sql + ";")
        for t in table["user_triggers"]:
            require(t["enabled"] == "O", "UNSUPPORTED_TRIGGER_STATE")
            out.append(t["trigger_definition"] + ";")
    return "\n".join(out)


def insert_sql(table, values):
    keys = list(values)
    def value(v):
        if v is None:
            return "NULL"
        if isinstance(v, (dict, list)):
            return json_sql(v)
        if isinstance(v, bool):
            return "true" if v else "false"
        if isinstance(v, (int, float)):
            return str(v)
        return literal(v)
    return f"INSERT INTO {qualified(table)} (" + ",".join(map(ident, keys)) + ") VALUES (" + ",".join(value(values[k]) for k in keys) + ");"


def report_labels(provider):
    return ["meta-primary", "meta-secondary"] if provider == "meta_ads" else [provider]


def payload(provider, fixture, label=None):
    return {"job_id": uid(provider + "-job"), "report_id": uid(label or report_labels(provider)[0]),
            "workspace_id": uid("workspace"), "advertiser_id": uid("advertiser"), "connection_id": uid(provider + "-connection"),
            "provider": provider, "external_account_id": fixture["context"]["externalAccountId"],
            "date_from": fixture["context"]["dateFrom"], "date_to": fixture["context"]["dateTo"],
            "expected_rows": fixture["total_rows"], "previous_ingestion_id": uid((label or report_labels(provider)[0]) + "-previous")}


def seed_sql(fixture):
    out = [insert_sql("public.companies", {"id": uid("company"), "name": "000", "is_locked": True}),
           insert_sql("auth.users", {"id": uid("user"), "raw_user_meta_data": {"name": "Synthetic Meta Fixture"}}),
           insert_sql("public.tenants", {"id": uid("tenant"), "name": "Meta fixture", "slug": "meta-fixture-tenant", "tenant_type": "agency", "created_by": uid("user")}),
           insert_sql("public.workspaces", {"id": uid("workspace"), "name": "Meta fixture", "created_by": uid("user"), "tenant_id": uid("tenant")}),
           insert_sql("public.advertisers", {"id": uid("advertiser"), "workspace_id": uid("workspace"), "name": "Meta fixture", "created_by": uid("user")}),
           insert_sql("public.report_types", {"id": uid("report-type"), "key": "traffic", "name": "Fixture traffic"})]
    for provider in ("meta_ads", "naver_searchad", "google_ads", "csv"):
        for label in report_labels(provider):
            out.append(insert_sql("public.reports", {"id": uid(label), "workspace_id": uid("workspace"), "report_type_id": uid("report-type"),
                "title": label, "created_by": uid("user"), "advertiser_id": uid("advertiser"),
                "period_start": fixture["context"]["dateFrom"], "period_end": fixture["context"]["dateTo"],
                "meta": {"data_source": {"kind": "csv" if provider == "csv" else "api"}},
                "current_ingestion_id": uid(label + "-previous"), "published_ingestion_id": uid(label + "-published")}))
            for suffix in ("previous", "published"):
                snapshot = uid(label + "-" + suffix)
                out.append(insert_sql("public.report_ingestions", {"id": snapshot, "workspace_id": uid("workspace"), "report_id": uid(label),
                    "kind": "csv" if provider == "csv" else "api", "status": "success", "row_count": 1, "created_by": uid("user")}))
                out.append(insert_sql("public.report_rows", {"id": uid(label + "-" + suffix + "-row"), "workspace_id": uid("workspace"),
                    "report_id": uid(label), "advertiser_id": uid("advertiser"), "row_index": 0, "ingestion_id": snapshot,
                    "row": {"fixture_sentinel": label + "-" + suffix}, "date": fixture["context"]["dateFrom"]}))
        if provider == "csv":
            continue
        out.append(insert_sql("public.media_connections", {"id": uid(provider + "-connection"), "workspace_id": uid("workspace"),
            "advertiser_id": uid("advertiser"), "provider": provider, "external_account_id": fixture["context"]["externalAccountId"],
            "credential_ciphertext": "SYNTHETIC_UNUSED_NEVER_DECRYPT", "created_by": uid("user")}))
        for label in report_labels(provider):
            out.append(insert_sql("public.report_media_connections", {"tenant_id": uid("tenant"), "workspace_id": uid("workspace"),
                "advertiser_id": uid("advertiser"), "report_id": uid(label), "connection_id": uid(provider + "-connection")}))
        common = payload(provider, fixture)
        job = {k: v for k, v in common.items() if k not in ("job_id", "expected_rows")}
        job.update(id=common["job_id"], data_level="creative" if provider == "meta_ads" else "keyword", status="processing",
                   created_by=uid("user"), attempt_count=1, started_at=FIXED_TIME, created_at=FIXED_TIME,
                   error_detail={"fixture_marker": "preserve"})
        out.append(insert_sql("public.media_sync_jobs", job))
    return "\n".join(out)


def preview(sql):
    return "-- NON-EXECUTABLE REVIEW PREVIEW. Use the guarded Python runner only.\nDO $$ BEGIN RAISE EXCEPTION 'HARNESS_PREVIEW_NOT_EXECUTABLE'; END $$;\nBEGIN;\n" + sql + "\nROLLBACK;\n"


def prepare(directory):
    protected = Path('/Users/damon/Projects/dashboard')
    require(not directory.resolve().is_relative_to(protected), "PROTECTED_REPOSITORY_FORBIDDEN")
    require(not directory.exists(), "OUTPUT_DIRECTORY_MUST_BE_NEW")
    data = load_authority()
    fixture = export_fixture()
    sql = {"bootstrap.sql": bootstrap_sql(data), "seed.sql": seed_sql(fixture), "candidate.sql": candidate_sql(data)}
    directory.mkdir(parents=True, mode=0o700)
    for name, body in sql.items():
        (directory / name).write_text(preview(body))
    (directory / "fixture.json").write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n")
    manifest = {"mode": "PREPARE_ONLY", "db_executions": 0, "postgres_version_required": "17.6", "pgcrypto_version": "1.3",
                "tables": 25, "baseline_functions": 17, "helpers": 12, "source_project_ref_verified": False,
                "runtime_tests": "NOT_RUN", "limitations": data["limitations"],
                "scenarios": ["Meta canonical/staging/snapshot/atomic fanout/finalization", "Naver/Google common RPC baseline comparison",
                              "CSV and previous/published snapshots preserved", "scope/target rejection", "actual transaction rollback",
                              "discarded activation response and exact retry", "two-session locking", "JS/PostgreSQL row key and jsonb fingerprint parity"],
                "files": {p.name: sha(p.read_bytes()) for p in directory.iterdir() if p.is_file()}}
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return data, fixture, sql, manifest


class LocalCluster:
    def __init__(self, pg_bin):
        require(not pg_bin.absolute().is_relative_to(Path('/Users/damon/Projects/dashboard')), "PROTECTED_REPOSITORY_FORBIDDEN")
        self.pg_bin = pg_bin.resolve(strict=True)
        require(os.geteuid() != 0, "POSTGRES_REQUIRES_NON_ROOT_USER; preparation remains available")
        for name in ("postgres", "initdb", "pg_ctl", "psql"):
            exe = self.pg_bin / name
            require(exe.is_file() and os.access(exe, os.X_OK), "POSTGRES_BINARY_MISSING:" + name)
            version = command([exe, "--version"])
            require(re.search(r"\b17\.6(?:\s|$)", version) is not None, "EXACT_POSTGRES_17_6_REQUIRED")
        self.root = Path(tempfile.mkdtemp(prefix="meta-ads-pg-", dir="/tmp")).resolve()
        self.data = self.root / "data"
        self.sock = self.root / "socket"
        self.sock.mkdir(mode=0o700)
        self.started = False
        self.system_id = None

    def start(self):
        command([self.pg_bin / "initdb", "-D", self.data, "-U", "postgres", "--encoding=UTF8", "--locale=C", "--auth-local=trust", "--auth-host=reject"])
        # The only trust-authenticated socket is inside our private mode-0700 directory.
        with (self.data / "postgresql.conf").open("a") as f:
            f.write("\nlisten_addresses=''\nunix_socket_directories=" + literal(self.sock) +
                    "\nunix_socket_permissions=0700\nport=55439\nmax_connections=12\nshared_buffers='64MB'\ntimezone='UTC'\n")
        self.started = True
        command([self.pg_bin / "pg_ctl", "-D", self.data, "-l", self.root / "postgres.log", "-w", "-t", "20", "start"])
        self.verify("postgres")
        for db in DATABASES:
            self.raw("postgres", "CREATE DATABASE " + ident(db) + " TEMPLATE template0;")

    def argv(self, db):
        require(db in DATABASES or db == "postgres", "DATABASE_NOT_ALLOWLISTED")
        return [str(self.pg_bin / "psql"), "-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1",
                "-h", str(self.sock), "-p", "55439", "-U", "postgres", "-d", db]

    def raw(self, db, sql, timeout=60, expect_error=None):
        result = subprocess.run(self.argv(db), input=sql, text=True, capture_output=True, env=ENV, timeout=timeout)
        if expect_error is not None:
            require(result.returncode != 0 and expect_error in result.stderr, "EXPECTED_DB_REJECTION_MISSING:" + expect_error + ":" + result.stderr[-1200:])
            return None
        require(result.returncode == 0, "ISOLATED_SQL_FAILED:" + result.stderr[-6000:])
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        return json.loads(lines[-1]) if lines and lines[-1][0] in '{["' else result.stdout.strip()

    def verify(self, db):
        require(self.started and self.data.parent == self.root and self.sock.parent == self.root, "CLUSTER_NOT_OWNED")
        pid_lines = (self.data / "postmaster.pid").read_text().splitlines()
        require(Path(pid_lines[1]).resolve() == self.data.resolve(), "POSTMASTER_PATH_MISMATCH")
        result = self.raw(db, "SELECT json_build_object('directory',current_setting('data_directory'),'listen',current_setting('listen_addresses'),"
            "'socket',current_setting('unix_socket_directories'),'version',current_setting('server_version_num'),'database',current_database(),"
            "'system_id',(SELECT system_identifier::text FROM pg_control_system()),'port',current_setting('port'),'peer',inet_server_addr());")
        require(result["directory"] == str(self.data) and result["socket"] == str(self.sock) and result["listen"] == "" and
                result["version"] == "170006" and result["database"] == db and result["peer"] is None and result["port"] == "55439", "LOCAL_SERVER_IDENTITY_REJECTED")
        if self.system_id is None:
            self.system_id = result["system_id"]
        require(result["system_id"] == self.system_id, "CLUSTER_ID_CHANGED")

    def query(self, db, sql, *, expect_error=None):
        self.verify(db)
        # Same-session guard also protects the gap between verification and execution.
        guard = "DO $guard$ BEGIN IF current_setting('data_directory')<>" + literal(self.data) + \
            " OR current_setting('listen_addresses')<>'' OR current_database()<>" + literal(db) + \
            " OR (SELECT system_identifier::text FROM pg_control_system())<>" + literal(self.system_id) + \
            " THEN RAISE EXCEPTION 'HARNESS_TARGET_REJECTED'; END IF; END $guard$;\n"
        return self.raw(db, "SET search_path=pg_catalog; SET lock_timeout='2s'; SET statement_timeout='15s';\n" + guard + sql, expect_error=expect_error)

    def stop(self):
        if self.started:
            command([self.pg_bin / "pg_ctl", "-D", self.data, "-m", "fast", "-w", "-t", "20", "stop"])
            self.started = False
        # Only delete the exact fresh directory we created, after successful stop.
        require(self.root.parent == Path("/tmp").resolve() and self.root.name.startswith("meta-ads-pg-"), "CLEANUP_SCOPE_REJECTED")
        shutil.rmtree(self.root)


def rpc_sql(name, p, scalar=False):
    require(re.fullmatch(r"[a-z_][a-z0-9_]*", name) is not None, "RPC_NAME_INVALID")
    call = f"public.{name}({json_sql(p)})"
    return "SET ROLE service_role; SELECT " + (call if scalar else f"to_jsonb(r) FROM {call} r") + ";"


def materialize_processing_batch(cluster, db, batch):
    result = cluster.query(db, rpc_sql("materialize_media_sync_snapshot_batch", batch))
    expected_next = min(batch["batch_start"] + batch["batch_size"], batch["expected_rows"])
    require(result["next_row_index"] == expected_next, "MATERIALIZATION_CHECKPOINT_NOT_ADVANCED")
    # A processing snapshot rejects an old offset, even if its rows already exist.
    # After a lost response, prepare returns the committed checkpoint for resume.
    assert_failure_unchanged(cluster, db, rpc_sql("materialize_media_sync_snapshot_batch", batch),
                             "MSMM_MATERIALIZATION_CONFLICT: batch start does not match the processing checkpoint")
    prepared = cluster.query(db, rpc_sql("prepare_media_sync_snapshot_materialization", batch))
    require(prepared["snapshot_ingestion_id"] == batch["snapshot_ingestion_id"] and
            prepared["next_row_index"] == expected_next, "MATERIALIZATION_RESUME_CHECKPOINT_MISMATCH")


def run_pipeline(cluster, db, fixture, provider, activate=True, batch_size=2):
    p = payload(provider, fixture)
    rows = copy.deepcopy(fixture["rows"])
    for row in rows:
        row.pop("jsonb_text", None)
        row.pop("fingerprint", None)
        if provider != "meta_ads":
            row["row"].update(provider=provider, row_level="keyword", data_level="keyword", row_level_reason="fixture_common_rpc")
            row["row"].pop("provider_meta", None)
            row["row_key"] = provider + ":fixture:" + str(row["row_index"])
    inserted = 0
    for start in range(0, len(rows), 2000):
        submitted = dict(p, date_window_index=0, rows=rows[start:start+2000])
        first = cluster.query(db, rpc_sql("append_media_sync_staging_batch", submitted))
        inserted += first["inserted_rows"]
        if start == 0:
            replay = cluster.query(db, rpc_sql("append_media_sync_staging_batch", submitted))
            require(replay["inserted_rows"] == 0, "APPEND_REPLAY_FAILURE")
    require(inserted == fixture["total_rows"], "APPEND_COUNT_FAILURE")
    if provider == "meta_ads":
        summary = cluster.query(db, rpc_sql("summarize_meta_ads_staging_base", p, True))
        require(summary["is_structurally_complete"] is True, "META_SUMMARY_INCOMPLETE")
        for start in range(0, len(rows), 2000):
            validation = cluster.query(db, rpc_sql("validate_meta_ads_staging_batch_v1", dict(p, batch_start=start, batch_size=2000), True))
            require(validation["canonical_mismatch_rows"] == 0 and validation["is_valid"] is True, "META_CANONICAL_INVALID")
        cluster.query(db, rpc_sql("save_meta_ads_processing_checkpoint", p))
    else:
        cluster.query(db, "UPDATE public.media_sync_jobs SET raw_rows=6, normalized_rows=6, inserted_rows=6 WHERE id=" + literal(p["job_id"]) + ";")
    targets = []
    for label in report_labels(provider):
        q = payload(provider, fixture, label)
        prepared = cluster.query(db, rpc_sql("prepare_media_sync_snapshot_materialization", q))
        q["snapshot_ingestion_id"] = prepared["snapshot_ingestion_id"]
        for start in range(0, fixture["total_rows"], batch_size):
            batch = dict(q, batch_start=start, batch_size=batch_size)
            materialize_processing_batch(cluster, db, batch)
        complete = cluster.query(db, rpc_sql("complete_media_sync_snapshot_materialization", q))
        # Exact replay is supported only after the ingestion status is success.
        completed_state = database_witness(cluster, db)
        for start in range(0, fixture["total_rows"], batch_size):
            duplicate = cluster.query(db, rpc_sql("materialize_media_sync_snapshot_batch",
                                                 dict(q, batch_start=start, batch_size=batch_size)))
            require(duplicate["inserted_rows"] == 0 and duplicate["idempotent"] is True,
                    "COMPLETED_MATERIALIZATION_REPLAY_FAILURE")
        require(database_witness(cluster, db) == completed_state, "COMPLETED_REPLAY_CHANGED_STATE")
        n = fixture["total_rows"]
        token = sha(f"{q['job_id']}:{q['report_id']}:{q['snapshot_ingestion_id']}:{n}:0:{n-1}:0:{n-1}".encode())
        require(complete["staging_fingerprint"] == token and complete["materialized_fingerprint"] == token, "COMPLETION_TOKEN_PARITY")
        targets.append(dict(q, published_ingestion_id=uid(label + "-published")))
        if provider != "meta_ads" and activate:
            cluster.query(db, rpc_sql("activate_media_sync_snapshot", q))
            cluster.query(db, rpc_sql("finalize_media_sync_job", q))
    return dict(targets[0], projections=[{k: t[k] for k in ("report_id", "previous_ingestion_id", "snapshot_ingestion_id", "expected_rows", "published_ingestion_id")} for t in targets])


def provider_witness(cluster, db, provider):
    job = literal(uid(provider + "-job"))
    return cluster.query(db, "SELECT jsonb_build_object('job',(SELECT to_jsonb(j)-ARRAY['snapshot_ingestion_id','created_at','updated_at','finished_at'] FROM public.media_sync_jobs j WHERE id=" + job + "),"
        "'staging',(SELECT jsonb_agg(jsonb_build_object('index',s.row_index,'key',s.row_key,'row',s.row,'hash',s.row_fingerprint) ORDER BY s.row_index) FROM public.media_sync_staging_rows s WHERE s.job_id=" + job + "),"
        "'rows',(SELECT jsonb_agg(r.row ORDER BY r.row_index) FROM public.report_rows r JOIN public.media_sync_report_projections p ON p.snapshot_ingestion_id=r.ingestion_id WHERE p.media_sync_job_id=" + job + "),"
        "'active',(SELECT bool_and(r.current_ingestion_id=p.snapshot_ingestion_id) FROM public.media_sync_report_projections p JOIN public.reports r ON r.id=p.report_id WHERE p.media_sync_job_id=" + job + "));" )


def database_witness(cluster, db):
    tables = ["reports", "report_ingestions", "report_rows", "media_sync_jobs", "media_sync_report_projections", "media_connections", "report_media_connections"]
    pairs = []
    for table in tables:
        pairs += [literal(table), f"(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public.{table} t)"]
    return cluster.query(db, "SELECT jsonb_build_object(" + ",".join(pairs) + ");")


def assert_failure_unchanged(cluster, db, sql, marker):
    before = database_witness(cluster, db)
    cluster.query(db, sql, expect_error=marker)
    require(database_witness(cluster, db) == before, "FAILED_TRANSACTION_CHANGED_STATE:" + marker)


def timezone_policy_check(cluster, db, fixture):
    # Compare the optimized predicate with the original full-validator API and
    # the exact server catalog, including values accepted by neither path.
    cases = ["Asia/Seoul", "UTC", "Etc/GMT+3", "Invalid/Zone", "asia/seoul", "UTC+01", "", None, 7]
    names = cluster.query(db, "SELECT jsonb_agg(tz.name) FROM pg_catalog.pg_timezone_names tz;")
    p = payload("meta_ads", fixture)
    for zone in cases:
        row = copy.deepcopy(fixture["rows"][0]["row"])
        row["provider_meta"]["time_zone"] = zone
        args = ",".join([json_sql(row), literal(p["external_account_id"]),
                         literal(p["date_from"]) + "::date", literal(p["date_to"]) + "::date"])
        got = cluster.query(db, "SELECT jsonb_build_object('full',public.is_meta_ads_canonical_row(" + args + "),"
            "'bulk',public.meta_ads_row_shape_valid(" + args + ") AND coalesce((" + json_sql(row) +
            " #>> '{provider_meta,time_zone}')=ANY(ARRAY(SELECT tz.name FROM pg_catalog.pg_timezone_names tz)),false));")
        expected = isinstance(zone, str) and zone in names
        require(got == {"full": expected, "bulk": expected}, "TIMEZONE_POLICY_PARITY:" + str(zone))
    for zone in ("Invalid/Zone", "asia/seoul", None, 7):
        rows = [{k: v for k, v in copy.deepcopy(entry).items() if k not in ("jsonb_text", "fingerprint")}
                for entry in fixture["rows"]]
        rows[-1]["row"]["provider_meta"]["time_zone"] = zone
        staged_sql = "SELECT jsonb_agg(to_jsonb(s) ORDER BY s.row_index) FROM public.media_sync_staging_rows s WHERE s.job_id=" + literal(p["job_id"]) + ";"
        before = cluster.query(db, staged_sql)
        assert_failure_unchanged(cluster, db, rpc_sql("append_media_sync_staging_batch", dict(p, date_window_index=0, rows=rows)),
                                 "META_CANONICAL_ROW_INVALID")
        require(cluster.query(db, staged_sql) == before, "INVALID_TIMEZONE_APPENDED_ROWS")
    return {"parity_cases": len(cases), "invalid_append_cases": 4}


def runtime_suite(cluster, fixture, sql, performance_rows=2001):
    baseline, candidate = DATABASES
    # Roles are cluster-wide: define them once, preserving the rest of each DB.
    for db in DATABASES:
        body = sql["bootstrap.sql"]
        if db == candidate:
            body = "\n".join(line for line in body.splitlines() if not line.startswith("CREATE ROLE "))
        cluster.query(db, "BEGIN;\n" + body + "\nCOMMIT;")
        authority = load_authority()
        expected = {f['identity']: f['definition_md5'] for f in
                    list(authority['baseline_functions'].values()) + list(authority['helper_functions'].values())}
        expressions = []
        for identity, digest in expected.items():
            expressions.append(f"md5(pg_get_functiondef({literal(identity)}::regprocedure))={literal(digest)}")
        restored = cluster.query(db, "SELECT json_build_object('exact'," + " AND ".join(expressions) + ");")
        require(restored['exact'] is True, "RESTORED_FUNCTION_DEFINITION_DRIFT")
        cluster.query(db, "BEGIN;\n" + sql["seed.sql"] + "\nCOMMIT;")
    cluster.query(candidate, "BEGIN;\n" + sql["candidate.sql"] + "\nCOMMIT;")
    acl = cluster.query(candidate, "SELECT json_build_object('bad',count(*)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
        "WHERE n.nspname='public' AND (p.proname LIKE '%meta_ads%' OR p.proname IN ('append_media_sync_staging_batch','prepare_media_sync_snapshot_materialization',"
        "'materialize_media_sync_snapshot_batch','complete_media_sync_snapshot_materialization','finalize_media_sync_job')) "
        "AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'));")
    require(acl['bad'] == 0, "CANDIDATE_RPC_PRIVILEGE_DRIFT")
    # Identical synthetic inputs through original and candidate common RPCs.
    for provider in ("naver_searchad", "google_ads"):
        for db in DATABASES:
            run_pipeline(cluster, db, fixture, provider)
        require(provider_witness(cluster, baseline, provider) == provider_witness(cluster, candidate, provider), "LEGACY_RPC_REGRESSION:" + provider)
    before_meta = database_witness(cluster, candidate)
    for entry in fixture["rows"]:
        got = cluster.query(candidate, "SELECT jsonb_build_object('text'," + json_sql(entry["row"]) + "::text,'key',public.meta_ads_canonical_row_key(" + json_sql(entry["row"]) + "),'hash',encode(extensions.digest(" + json_sql(entry["row"]) + "::text,'sha256'),'hex'));")
        require(got == {"text": entry["jsonb_text"], "key": entry["row_key"], "hash": entry["fingerprint"]}, "JS_POSTGRES_FINGERPRINT_PARITY")
    for vector in fixture["jsonb_edge_vectors"]:
        got = cluster.query(candidate, "SELECT jsonb_build_object('text'," + json_sql(vector["row"]) + "::text,'hash',encode(extensions.digest(" + json_sql(vector["row"]) + "::text,'sha256'),'hex'));")
        require(got == {"text": vector["text"], "hash": vector["fingerprint"]}, "JSONB_EDGE_PARITY")
    timezone_checks = timezone_policy_check(cluster, candidate, fixture)
    p = run_pipeline(cluster, candidate, fixture, "meta_ads", activate=False)
    assert_failure_unchanged(cluster, candidate, rpc_sql("finalize_media_sync_job", p), "META_FANOUT_PARTIAL_OR_NOT_ACTIVE")
    negatives = []
    for field, value in [("workspace_id", uid("wrong")), ("advertiser_id", uid("wrong")), ("external_account_id", "wrong"), ("date_to", "2026-10-01")]:
        negatives.append((dict(p, **{field: value}), "META_EXECUTION_SCOPE_INVALID"))
    negatives.append((dict(p, expected_rows=7), "META_FANOUT_EXECUTION_INVALID"))
    negatives.append((dict(p, projections=p["projections"][:1]), "META_FANOUT_TARGET_SET_INVALID"))
    negatives.append((dict(p, projections=[p["projections"][0], p["projections"][0]]), "META_FANOUT_TARGET_SET_INVALID"))
    wrong = copy.deepcopy(p); wrong["projections"][1]["published_ingestion_id"] = uid("wrong")
    negatives.append((wrong, "META_FANOUT_PUBLISHED_BASELINE_CHANGED"))
    for invalid, marker in negatives:
        assert_failure_unchanged(cluster, candidate, rpc_sql("activate_meta_ads_snapshot_fanout", invalid, True), marker)
    # Real database failure after the first report UPDATE, with original triggers enabled.
    second = sorted(t["report_id"] for t in p["projections"])[1]
    fault = "CREATE FUNCTION meta_harness.fail_second_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=" + literal(second) + "::uuid THEN RAISE EXCEPTION 'HARNESS_SECOND_REPORT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER meta_harness_fail_second BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION meta_harness.fail_second_report();"
    cluster.query(candidate, fault)
    assert_failure_unchanged(cluster, candidate, rpc_sql("activate_meta_ads_snapshot_fanout", p, True), "HARNESS_SECOND_REPORT_FAILURE")
    cluster.query(candidate, "DROP TRIGGER meta_harness_fail_second ON public.reports; DROP FUNCTION meta_harness.fail_second_report();")
    assert_failure_unchanged(cluster, candidate, "BEGIN;" + rpc_sql("activate_meta_ads_snapshot_fanout", p, True) + "DO $$ BEGIN RAISE EXCEPTION 'HARNESS_AFTER_ALL_FAILURE'; END $$;COMMIT;", "HARNESS_AFTER_ALL_FAILURE")
    concurrency_check(cluster, candidate, p)
    # Commit succeeds; caller deliberately discards its result, then retries.
    cluster.query(candidate, rpc_sql("activate_meta_ads_snapshot_fanout", p, True))
    activated = database_witness(cluster, candidate)
    retry = cluster.query(candidate, rpc_sql("activate_meta_ads_snapshot_fanout", p, True))
    require(retry["idempotent"] is True and database_witness(cluster, candidate) == activated, "ACTIVATION_EXACT_RETRY")
    mutation = "BEGIN; DELETE FROM public.report_media_connections WHERE report_id=" + literal(p["projections"][1]["report_id"]) + ";"
    assert_failure_unchanged(cluster, candidate, mutation + rpc_sql("finalize_media_sync_job", p) + "COMMIT;", "META_FANOUT_MAPPING_SET_CHANGED")
    final = cluster.query(candidate, rpc_sql("finalize_media_sync_job", p))
    require(final["job"]["status"] == "done" and final["job"]["raw_rows"] == 6 and final["job"]["failed_rows"] == 0 and final["connection_updated"] is True, "META_FINALIZATION")
    finished = database_witness(cluster, candidate)
    again = cluster.query(candidate, rpc_sql("finalize_media_sync_job", p))
    require(again["idempotent"] is True and again["connection_updated"] is False and database_witness(cluster, candidate) == finished, "FINALIZATION_EXACT_RETRY")
    # Preserve every pre-existing row and published ingestion; only Meta report
    # current pointers and its job/connection are expected to change.
    old_rows = {r["id"]: r for r in before_meta["report_rows"]}
    new_rows = {r["id"]: r for r in finished["report_rows"]}
    require(all(new_rows.get(k) == v for k, v in old_rows.items()), "PREEXISTING_ROWS_CHANGED")
    for old in before_meta["reports"]:
        new = next(r for r in finished["reports"] if r["id"] == old["id"])
        require(new["published_ingestion_id"] == old["published_ingestion_id"], "PUBLISHED_CHANGED")
        if old["id"] not in {uid("meta-primary"), uid("meta-secondary")}:
            require(new == old, "LEGACY_OR_CSV_REPORT_CHANGED")
    performance = {"rows": 0, "status": "NOT_RUN"}
    if performance_rows:
        # Baseline DB has never processed its Meta fixture. Install the same
        # candidates only AFTER legacy A/B comparison is finished.
        cluster.query(baseline, "BEGIN;" + sql["candidate.sql"] + "COMMIT;")
        large = copy.deepcopy(fixture)
        large["total_rows"] = performance_rows
        large["rows"] = []
        for index in range(performance_rows):
            row = copy.deepcopy(fixture["rows"][0])
            ad = "fixture-ad-" + str(index)
            row["row"].update(external_ad_id=ad, external_creative_id=ad)
            row["row"]["provider_meta"]["entity_id"] = ad
            row["row_index"] = index
            row["row_key"] = json.dumps(["meta_ads_ad_daily_v1", "meta_ads", "ad", row["row"]["external_account_id"],
                row["row"]["external_campaign_id"], row["row"]["external_group_id"], ad, row["date"]], ensure_ascii=False, separators=(",", ":"))
            large["rows"].append(row)
        started = time.monotonic()
        large_payload = run_pipeline(cluster, baseline, large, "meta_ads", activate=False, batch_size=2000)
        cluster.query(baseline, rpc_sql("activate_meta_ads_snapshot_fanout", large_payload, True))
        large_final = cluster.query(baseline, rpc_sql("finalize_media_sync_job", large_payload))
        require(large_final["job"]["raw_rows"] == performance_rows and large_final["row_count"] == performance_rows, "LARGE_FIXTURE_ROW_COUNT")
        performance = {"rows": performance_rows, "status": "PASS", "wall_seconds": round(time.monotonic()-started, 3),
                       "production_latency_equivalence": False, "materialization_batch_size": 2000}
    return {"status": "PASS", "meta_rows": 6, "projections": 2, "negative_activation_cases": len(negatives),
            "legacy_common_rpc_comparison": ["naver_searchad", "google_ads"], "csv_sentinels_preserved": True,
            "actual_sql_rollback": True, "two_session_locking": True, "fingerprint_parity": True,
            "processing_stale_batch_rejected": True, "materialization_resume_checkpoint": True,
            "completed_batch_replay_unchanged": True,
            "timezone_policy": timezone_checks,
            "performance": performance, "full_provider_collector_and_csv_worker": "OUT_OF_SCOPE"}


def concurrency_check(cluster, db, p):
    cluster.verify(db)
    # A holds the job lock. Observe A in pg_stat_activity before starting B;
    # synchronization does not assume a fixed startup delay.
    sql = "SET application_name='meta_harness_holder'; BEGIN; SELECT id FROM public.media_sync_jobs WHERE id=" + literal(p["job_id"]) + " FOR UPDATE; SELECT pg_sleep(5); ROLLBACK;"
    holder = subprocess.Popen(cluster.argv(db), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    try:
        holder.stdin.write(sql); holder.stdin.close()
        deadline = time.monotonic() + 3
        observed = False
        while time.monotonic() < deadline:
            seen = cluster.query(db, "SELECT json_build_object('ready',EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='meta_harness_holder' AND wait_event='PgSleep'));")
            if seen["ready"]:
                observed = True
                break
            time.sleep(0.05)
        require(observed, "LOCK_HOLDER_NOT_OBSERVED")
        assert_failure_unchanged(cluster, db, rpc_sql("activate_meta_ads_snapshot_fanout", p, True), "lock timeout")
        holder.wait(timeout=8)
        require(holder.returncode == 0, "LOCK_HOLDER_FAILED")
    finally:
        if holder.poll() is None:
            holder.terminate(); holder.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", type=Path, required=True, help="New output directory for non-executable SQL previews")
    parser.add_argument("--run-isolated", action="store_true", help="Explicitly start a fresh temporary private cluster and run SQL")
    parser.add_argument("--pg-bin", type=Path, help="Directory containing PostgreSQL 17.6 binaries; no installation is performed")
    parser.add_argument("--performance-rows", type=int, choices=(0, 2001, 100000), default=2001,
                        help="Optional isolated synthetic scale fixture; default tests the 2000-row boundary")
    args = parser.parse_args()
    require(args.run_isolated == (args.pg_bin is not None), "RUN_FLAG_AND_PG_BIN_MUST_BE_SUPPLIED_TOGETHER")
    require(not ROOT.is_relative_to(Path('/Users/damon/Projects/dashboard')), "PROTECTED_REPOSITORY_FORBIDDEN")
    require(command(["git", "rev-parse", "HEAD"]).strip() == BASE_SHA, "REPOSITORY_HEAD_DRIFT")
    require(command(["git", "branch", "--show-current"]).strip() == "meta-ads-api", "META_BRANCH_REQUIRED")
    _, fixture, sql, manifest = prepare(args.prepare.resolve())
    print(json.dumps({"prepare": "PASS", "db_executions": 0, "output": str(args.prepare.resolve())}), flush=True)
    if not args.run_isolated:
        return
    cluster = LocalCluster(args.pg_bin)
    try:
        cluster.start()
        result = runtime_suite(cluster, fixture, sql, args.performance_rows)
        result["limitations"] = manifest["limitations"]
        (args.prepare / "runtime-result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result), flush=True)
    finally:
        cluster.stop()


if __name__ == "__main__":
    main()
