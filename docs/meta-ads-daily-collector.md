# Meta daily collection

`scripts/meta-ads-daily-collector.ts` runs as the independent Railway service
`etrylue-meta-daily-collector` (`c4e5a80f-8a14-48a5-90fc-066d4c570c97`) in
`wholesome-cat` / production. Cron `0 20 * * *` is 05:00 Asia/Seoul. Start command:
`node --import tsx scripts/meta-ads-daily-collector.ts`. Skip the Next.js build;
use RAILPACK and restart policy NEVER. Pin the reviewed Git commit. No public domain is required.

Required environment variables:

- `META_DAILY_COLLECTOR_ENABLED=1`
- `META_DAILY_CONNECTION_IDS`: comma-separated approved connection UUIDs (maximum 16).
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `MEDIA_CREDENTIAL_ENCRYPTION_KEY`: Railway references to the existing worker's variables.

Both the environment allowlist and the connection's `meta_ads_daily` server configuration
must enable collection. Initial authorized account: Justin Catering, account 1627158747387678,
connection 6343cf79-a059-4c9c-9118-070dcc5c2e2b, backfill start 2026-09-01.

```json
{"contract":"meta_daily_v1","enabled":true,"start_date":"2026-09-01","time_zone":"Asia/Seoul","schedule":"0 20 * * *","lookback_days":7}
```

The account's existing `meta_contact_snapshot_v1` policy must also remain approved.
Tokens stay encrypted at rest and are decrypted only in the server process. Logs contain
safe codes, scoped IDs, dates and counts; never provider response bodies or credentials.

The target date is frozen to yesterday in Seoul. SQL discovers the earliest missing day;
the runner collects that history and rechecks the last seven days for late attribution.
Requests cover up to seven days, five pages / 2,500 ad-day rows per window, and twelve
windows per run. A ten-minute collection budget and a twenty-minute database lease bound
execution. Transient API failures retry twice. Partial/failed runs resume on the next
invocation; a successful target date is idempotent. A stale lease cannot commit. A connection
or policy change during collection rejects the write rather than accepting stale credentials.

`meta_ads_daily_runs` and `meta_ads_daily_partitions` are service-role-only RLS tables.
Each partition stores the exact validated canonical rows, row count, content hash, policy,
run lineage, complete response evidence and reconciliation window. Account and ad/day
delivery and website-contact totals must match. `contact_total` is never added to
`contact_website`; revenue remains null.

An omitted website-contact value is interpreted as zero only under the approved policy,
after fully reading account and ad-level responses, matching delivery totals, and confirming
there are no positive ad-level website contacts. The audit records
`omitted_on_complete_insights`, separately from `reported`. Both empty responses produce
`no_data` partitions. Incomplete pages, malformed values and mismatches never become zero.
The existing read-only diagnostics and manual snapshot contract remain unchanged.

After collection, mapped Meta-only and Naver/Meta DB reports with saved, completed periods
of up to 31 days are refreshed atomically from durable facts. Every selected date and provider
must be complete. Missing coverage returns `waiting_meta` or `waiting_naver` and preserves
the current draft pointer. A content/lineage fingerprint skips unchanged snapshots.
Empty verified periods can produce zero-row snapshots. Published pointers never change.
Reports without a saved period are skipped. This does not enroll reports in the legacy
`daily_report_v2` scheduler or change their fixed reporting period.

Apply the additive migrations in this order:

1. `scripts/sql/create-meta-ads-daily.sql`
2. `scripts/sql/materialize-meta-ads-daily.sql`

The materializer reuses the manual snapshot's strict scope, canonical-row validation,
Naver partition lineage and advisory-lock contract in a separate function; the existing
functions are not replaced. Naver facts, report mappings, queues, services, schedules and
published reports remain under their existing authority.

Validation: the isolated PostgreSQL 17/WASM suite in
`scripts/verify-meta-ads-contact-snapshot.ts` also calls `verify-meta-ads-daily.ts`.
Set `META_TEST_PGLITE_MODULE` to a local PGlite module, never a production database URL.
The suite verifies leases, retries, zero-activity partitions, reconciliation rejection,
scope/role isolation, atomic rollback, idempotent snapshots and Naver coverage preservation.

To pause only this collector, set its `META_DAILY_COLLECTOR_ENABLED` to `0` and redeploy
this service, or disable the approved account's `meta_ads_daily.enabled`. Do not modify
the existing Naver scheduler/worker. Review `meta_ads_daily_status` and the run table for
last success, coverage and safe failure codes. A failed Naver report can leave mixed report
projection waiting even when Meta account collection succeeds.
