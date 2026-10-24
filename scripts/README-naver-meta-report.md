# Naver + Meta manual DB-acquisition report

The Builder keeps both checkbox selections and creates a single report through the existing authorization and billing gate. `create_naver_meta_report_v1` accepts one approved Meta account and 1–15 distinct active Naver accounts in the same advertiser/workspace/tenant. Meta-only and Naver-only creation continue through their existing paths. Google is unchanged.

Mixed reports use `data_source.aggregation_contract = naver_meta_contact_v1`, `data_level = mixed`, and `manual_report_media_connections`. The legacy `report_media_connections` table, its single-report index, scheduler, fanout, and worker functions are unchanged. A mixed report never becomes a legacy Naver fanout target. The new creation RPC reuses the scoped V2 creation function within one transaction, moves the temporary Meta mapping into the dedicated manual table, and returns all selected connections.

For a completed period of at most 31 days, the manual sync first checks Naver date coverage, then collects and reconciles fresh Meta ad/day data. The service-only save RPC atomically copies completed Naver fact partitions and the verified Meta rows into one immutable report snapshot. The existing report aggregation reads both providers. Meta conversions remain `conversions.contact_website`, with no `contact_total` duplication and no fabricated revenue. Combined conversions are a sum of platform-attributed counts, not deduplicated people.

The RPC takes nonblocking shared advisory locks using the existing Naver writer's exact account/date keys, verifies partition lineage and row counts (including legitimate zero-row dates), and caps the combined snapshot at 50,000 rows. Missing coverage, concurrent collection, stale settings/credentials, mismatched scopes, or late insertion failure leave the previous snapshot intact. Completed job records describe materialization per provider; no pending worker job is created. Only the Meta connection's `last_sync_at` changes. Existing Naver facts, source report pointers, and all published pointers remain unchanged.

Mixed reports use fixed-period manual sync. Daily automation is excluded in the editor and rejected by the report update endpoint. Naver's existing automatic collection continues independently; a manual refresh includes its latest completed partitions. A range with missing Naver dates is blocked rather than treating missing data as zero. Meta's existing limit of 2,500 ad/day rows and five pages remains in effect.

## Validation and rollout

`verify-meta-ads-contact-snapshot.ts` uses synthetic provider responses and isolated PostgreSQL 17/WASM to exercise both the existing single-Meta path and mixed creation, permissions, scope, missing/zero dates, atomic rollback, repeated refresh, combined totals, per-media totals, and legacy isolation. It never contacts a provider or production database.

Apply `scripts/sql/create-naver-meta-report.sql` once before releasing the app. The migration adds only the manual mapping table and creation RPC and replaces the newly introduced `save_meta_ads_contact_snapshot_v1`; no legacy shared RPC is replaced. Keep `main` and Railway unchanged. Deploy the exact reviewed commit to Vercel. No existing report is converted, created, published, or synchronized by this migration.
