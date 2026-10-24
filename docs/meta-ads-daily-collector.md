# Meta daily collection

`scripts/meta-ads-daily-collector.ts` runs as the independent Railway service
`etrylue-meta-daily-collector` (`c4e5a80f-8a14-48a5-90fc-066d4c570c97`) in
`wholesome-cat` / production. Cron `0 20 * * *` is 05:00 Asia/Seoul. Start command:
`node --import tsx scripts/meta-ads-daily-collector.ts`. Skip the Next.js build;
use RAILPACK and restart policy NEVER. Pin the reviewed Git commit. No public domain is required.

This service enqueues every eligible account in one transaction and exits. It does not
perform Meta API requests. A separate persistent service, `etrylue-meta-collection-worker`,
runs `node --import tsx scripts/meta-ads-collection-worker.ts`, with RAILPACK, the same
skip-build command, restart policy ON_FAILURE, and no cron or public domain.

Required environment variables:

- `META_DAILY_COLLECTOR_ENABLED=1`
- `META_DAILY_QUEUE_WORKER_ENABLED=1` on the queue worker.
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `MEDIA_CREDENTIAL_ENCRYPTION_KEY`: Railway references to the existing worker's variables.

`META_DAILY_CONNECTION_IDS` is no longer read. Accounts enroll through the report builder:
account ID, encrypted access token, history start date and explicit website-contact consent.
The authenticated setup endpoint verifies workspace/advertiser management access twice,
checks KRW / Asia/Seoul account access and reconciles the latest seven days of account and
ad/day Insights before atomically saving enrollment and queuing initial collection. A new
token replaces the stored token only after these checks succeed. OAuth login, other
currencies/time zones and purchase/revenue mappings are outside this release.

The enrollment and connection must agree on scope, credential fingerprint, policy and
start date. Credential changes require renewed validation. The migration preserves the
already approved Justin Catering account (1627158747387678), connection
6343cf79-a059-4c9c-9118-070dcc5c2e2b, backfill start 2026-09-01, without changing its
connection metadata, completed facts or report pointers.

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
execution. Transient API failures retry twice. The queue retries failed/partial work up to
three attempts with one/five-minute backoff; remaining history resumes on the next daily
batch. Missed pending tasks roll forward to yesterday. Workers claim with SKIP LOCKED;
one account failure does not stop other accounts. Queue keys include enrollment generation,
connection and target date. Repeated setup/enqueue is idempotent, and renewed configuration
cancels obsolete work. A successful target date is idempotent. A stale lease cannot commit. A connection
or policy change during collection rejects the write rather than accepting stale credentials.

`meta_ads_daily_enrollments`, `meta_ads_collection_queue`, `meta_ads_daily_runs` and
`meta_ads_daily_partitions` are service-role-only RLS tables. Enrollment generations fence
in-flight credential/configuration changes; public connection metadata contains no queue
lease, token, credential fingerprint or proof payload.
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
3. `supabase/migrations/20261024141551_meta_ads_common_onboarding.sql`

The materializer reuses the manual snapshot's strict scope, canonical-row validation,
Naver partition lineage and advisory-lock contract in a separate function; the existing
functions are not replaced. Naver facts, report mappings, queues, services, schedules and
published reports remain under their existing authority.

Validation: the isolated PostgreSQL 17/WASM suite in
`scripts/verify-meta-ads-contact-snapshot.ts` also calls `verify-meta-ads-daily.ts` and
`verify-meta-ads-onboarding.ts`. Set `META_TEST_PGLITE_MODULE` to a local PGlite module,
`NEXT_PUBLIC_SUPABASE_URL=https://fixture.invalid` and
`SUPABASE_SERVICE_ROLE_KEY=synthetic-test-key`, never production credentials.
The suite verifies leases, retries, zero-activity partitions, reconciliation rejection,
scope/role isolation, atomic rollback, idempotent snapshots and Naver coverage preservation.
It also exercises setup authorization and token renewal, then the real collector with
synthetic HTTP responses against PostgreSQL-backed queue/run/partition RPCs.

To pause new scheduled batches, set `META_DAILY_COLLECTOR_ENABLED=0` on the cron service.
To pause queued processing too, set `META_DAILY_QUEUE_WORKER_ENABLED=0` on the queue
worker and deploy its configuration. To pause one account, disable its enrollment or
`meta_ads_daily.enabled`. Do not modify
the existing Naver scheduler/worker. Review `meta_ads_daily_status` and the run table for
last success, coverage and safe failure codes. A failed Naver report can leave mixed report
projection waiting even when Meta account collection succeeds.
