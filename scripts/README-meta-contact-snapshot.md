# Meta website-contact manual snapshots

This path is separate from the offline v1 Meta worker contracts. It supports a single
Meta connection on a DB-acquisition (`report_types.key = db`) API report. It does not
enable the shared queue worker, an automatic scheduler, multi-provider reports,
commerce revenue, or publishing.

## Authority and data

- A server-managed `media_connections.meta.meta_ads_reporting` policy must match
  `MetaAdsContactPolicy`, including the external account, currency and time zone.
- The existing report creation/entitlement flow and saved sync-period UI are used.
  The authenticated `run_sync` route resolves the report mapping, then dispatches
  Meta requests to `handleMetaAdsContactSync`. Other providers retain their path.
- Every request fetches account metadata, an independent account aggregate, and
  all ad/day pages (up to 5 pages / 2,500 rows / 31 completed days). Attribution
  parameters remain omitted, matching the validated platform-default requests.
- Only `conversions.contact_website` supplies conversions. `contact_total`,
  `actions` and generic custom pixel actions are never added or substituted.
- A missing per-ad contact value becomes zero only after the complete dataset
  matches all four account totals. Missing account-level contact totals, empty
  datasets, incomplete pages and mismatches block saving. No missing days are invented.
- Revenue is JSON null with `revenue_status: not_provided`. This is a contact-only
  DB-acquisition contract; it does not claim zero revenue or support commerce.
- Permissions and report/credential state are checked again before committing.

## Database

`create-meta-ads-contact-snapshot.sql` adds only
`save_meta_ads_contact_snapshot_v1(jsonb)`. It is SECURITY INVOKER, service-role
only, and grants no browser access. The function locks the Meta connection and
Meta report, compares timestamps/current snapshot, verifies the single mapping,
validates the exact row contract, recomputes totals, and commits ingestion, rows,
a completed job and the current draft pointer together. It does not create a
pending job. Published pointers, status and previous snapshots stay intact.

No shared SQL functions, Naver schedules, worker code, environment variables or
dependency locks are changed. Do not install the older offline Meta SQL candidates
as part of this path. Disable new manual requests by setting this connection's
`meta_ads_reporting.enabled` false; existing snapshots remain readable.

The read-only diagnostic export intentionally keeps its legacy `UNCONFIRMED` /
`report_data_saved: false` fields: that operation neither sets policy nor saves a
report. A successful manual sync returns `report_data_saved: true` and a done job.

## Verification

Run `node --import tsx scripts/verify-meta-ads-contact-snapshot.ts` with
`META_TEST_PGLITE_MODULE` pointing to an isolated PostgreSQL 17 PGlite ES module.
It uses only synthetic fixtures, including transaction rollback, stale baseline,
scope/permission/mapping failures, duplicate concurrent submissions, retained
published/Naver pointers and the 2,500-row maximum. PGlite is a test-environment
dependency; do not add it to the deployed application.

Before claiming live end-to-end completion, create an eligible Meta-only report
through the normal authenticated UI, save September 2026 as its sync period and
run the manual sync. Verify 268 rows, 328907 impressions, 19088 clicks, 2975872 KRW,
8 contacts and campaign contacts 4/1/3 against the accepted diagnostic evidence.
These are expected check values, not rows to fabricate or insert.
