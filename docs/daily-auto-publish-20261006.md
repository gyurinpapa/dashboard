# Daily Report V2: published data follows successful daily activation

Status: APPROVED AND APPLIED to production on 2026-10-06 KST.

Migration: daily_report_v2_published_snapshot_on_activation.
Approved implementation commit: 727fd5693a1b0717132b997889456e9599ea9948.
The bounded transaction verified the baseline function/ACL and no active daily runs/jobs, replaced only the reviewed function, and verified the candidate hash/ACL before commit. Supabase returned success.
Post-commit read-only verification: candidate hash matches; postgres owner and service_role-only execution preserved; both daily reports' current/published pointers, status and share-token/meta hashes unchanged. No sync, activation call, manual publication, report-row rewrite, Vercel deploy or Railway configuration change was performed.
Next natural successful activation remains pending for end-to-end production confirmation. The already-completed 2026-10-06 run was not republished.

Base: Vercel production 4c01771c356d44e8cb31b4c7b740e6fab34781c3, verified 2026-10-06 KST.
Branch: fix/daily-published-snapshot-20261006.

## Scope

Change only public.activate_daily_report_v2_combined_snapshot(jsonb).
A new ready -> activated run advances both current_ingestion_id and published_ingestion_id atomically only if the report is already ready/published, has a nonblank share token, and explicitly matches enabled Daily Report V2 API automation.
Existing source fingerprint, ingestion success/count, ownership, row locks and compare-and-swap guards remain intact. No new data queries, rows, calculations, jobs or provider calls are added.

Drafts, first publication, ordinary reports, CSV reports, failed or unfinished runs, disabled automation and exact retries retain their previous behavior. Share token, canonical identity, published image batch, title, filters, periods and published_at are not changed. An already activated pre-upgrade run is deliberately not republished by a retry.

Current scope at review: 2 enabled, already-published ready daily reports. The rule applies to future qualifying daily reports too. Google Ads auth/API and scheduler configurations remain untouched.

## Validation

- 22 synthetic SQL runtime cases PASS on PostgreSQL 17.5 (PGlite 0.4.0), including late-error atomic rollback, row/data preservation, source drift, scope mismatch, unfinished/failed ingestion, first publication, draft, retry, and RPC execute permissions.
- Same 22 cases PASS on PostgreSQL 18.3 (PGlite 0.5.8).
- Existing activation static checks PASS.
- Existing combined snapshot orchestrator checks PASS; no live database/provider calls.
- Existing live function body equals the base repository SQL body byte-for-byte.
- Runtime harness uses synthetic minimal tables and an in-memory engine. It does not simulate multi-session lock contention, complete production RLS/triggers or the browser/PPT flow. Existing lock order and application code are unchanged.
- Production is PostgreSQL 17.6; exact platform runtime confirmation remains a post-approval step.
- No runtime package/dependency or client JavaScript was added. PGlite was installed outside the project solely for verification.

Reproduce (separate temporary test installation):

```sh
npm install --prefix /tmp/etrylue-daily-pg-test --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.4.0
ETRYLUE_PGLITE_ROOT=/tmp/etrylue-daily-pg-test/node_modules/@electric-sql/pglite node scripts/verify-daily-report-v2-auto-publish.mjs
node scripts/verify-daily-report-v2-combined-snapshot-activation.mjs
node --import tsx scripts/verify-daily-report-v2-combined-snapshot-orchestrator.ts
```

## Production application after explicit approval

This is a database function change. A Vercel Preview cannot validate it against an unchanged production database; do not apply production SQL merely to enable Preview testing. No Vercel/Railway deploy or scheduler restart is needed.

1. Read-only recheck function body, owner/ACL, current run state and report pointers. Record them. Existing body md5: 802edd18da3a976cbce43daefca2cfec. Owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
2. Apply the candidate function in one short transaction, with lock_timeout 2s and statement_timeout 8s. Before replacing it, assert the existing prosrc md5 is the reviewed baseline; abort on drift. Use the SQL file's existing transaction; insert precondition immediately after BEGIN. Avoid retries during an active activation.
3. Before COMMIT verify prosrc md5 is 17df92c196f28727c6602ab920a48940 and owner/ACL are unchanged. No activation RPC invocation, snapshot pointer update, manual sync or backfill is part of installation.
4. Read-only verify definition and report pointers after commit. On the next new successful daily activation verify current=published, run=activated, exact expected count and unchanged share identity. Automatic publication is not retroactive: today's completed snapshot needs the existing explicit publish flow if immediate sharing is desired.

Rollback: restore the original function definition from base commit 4c01771c356d44e8cb31b4c7b740e6fab34781c3 using the same bounded transaction and expected candidate-body precondition. This restores future activation policy, but does not rewind any successfully published data pointers. No report rows are deleted or rewritten.
