# Approved refund policy release — 2026-10-11

User approved: 7 days (168 hours) after approval, full refund regardless of use; afterward and before period end, remaining-period refund, no cancellation penalty, round fractional KRW upward. Duplicate billing / inability to provide service: full refund after manual investigation, statutory rights preserved. One calendar month, not a fixed 30-day divisor. Approval includes implementation, final production deployment and Mac VS Code source synchronization. Live payment keys and recurring billing are still excluded.

## Source and protected scope

Production rechecked: 7d85261a3e531cf0c9fa3472838dacae286dbdc0 / dpl_D5TfgtcvTYHncuA5a4AaCjXQBjVt READY. New GitHub branch feat/refund-policy-20261011 starts at that exact SHA. Local equivalent parent 207875c has the exact same tree a77dc4d519c9b7dca178e139cf76fdfd88ab0e8d. Earlier production audit notes carried forward. No default branch, worker, scheduler, Ads, calculation, filter, share/PPT or dependency changes.

## Implementation

- Public /refund policy with homepage chrome; links in footer, pricing, checkout consent, order result and terms. Static server component, no new library/SDK.
- Test-only payment DB kbqyszbuxojofugqfjbh: billing_test_refund_requests, server-only read grants, no client policies, no historical backfill. New service-only reservation fixes authoritative clock/amount under existing order lock. Ownership, single cycle, paid state, approval/time/amount invariants checked. Client cannot provide amount or timestamp. Table changes only via RPCs.
- Provider cancellation uses fixed cancelAmount and policy-refund-charge idempotency key; fresh provider reconciliation before cancellation; timeout/failure recovery verifies the provider again; unresolved result is an error, never successful UI confirmation.
- Settlement preserves original validations and monotonic DONE behavior. Existing webhook compatibility retained: duplicate partial-cancel messages cannot downgrade a confirmed policy refund. Unknown/mismatched partial refunds remain review. Confirmed refund expires only that order; other coverage and existing authorization remain in existing gate logic. No advertiser/report deletion.
- Special/email requests remain reviewed support operations, not a public arbitrary-time/amount refund endpoint. No new operator refund permission introduced. Before live keys, support processing and provider/ledger verification need explicit live-readiness acceptance.
- Policy applies to test implementation today. Actual charges remain disabled by test_ck_/test_sk_ validation and test MID verification.

## Verification before application

- PGlite SQL: 29 assertions, full/prorated/rounded amounts, immutable retry time/amount, ownership rejection, non-fixture report schema refusal, provider DONE/partial mismatch, stale webhook monotonicity, expiry, monthly rejection, RLS and service-only ACL. Fixtures only, no hosted DB writes.
- Actual server manage implementation: 8 intercepted scenarios (full, partial, completed duplicate, provider timeout after success, failed provider, foreign user, merchant mismatch, key mismatch), plus invalid balance checks. No real provider requests.
- Estimate boundaries: 168-hour full refund; later proportional calculation; expiry and missing dates fail closed.
- Existing production boundary and 10 actual report-create handler scenarios pass; all external calls intercepted. Legacy accounts perform no payment lookup.
- Changed runtime TS/TSX ESLint and TypeScript passed. Final full Next webpack build passed after JSX parallel-read cleanup; /refund is statically prerendered. Existing middleware deprecation warning unchanged.
- PostgreSQL multi-session refund concurrency and hosted authenticated partial-refund UI not claimed. Cross-app/payment DB report-create transaction still not atomic, unchanged.

## Mac synchronization

scripts/macos/sync-production-worktree.sh accepts the exact final production SHA. It verifies repository origin, fetches that commit, creates a separate detached worktree, refuses mismatched/nonclean existing targets, verifies source and opens VS Code. No checkout/reset/clean on the existing repository, no main/default push. This cloud runtime has no Mac execution capability. User must execute it and report PRODUCTION_SOURCE_SYNC_VERIFIED before Mac sync can be marked completed.

## Preview and apply-time correction

Preview dpl_HkrBBBzFBEkWBProh67pBEcb9X95, SHA 03cd986a3d7a4c4db2eb8ae2716ebd49c9a364b3 READY, build 54 seconds. Browser confirms complete /refund policy and shared homepage header/footer/CTA. First DB apply was rejected by the reports-table safety guard: payment sandbox contains the previously installed, empty synthetic reports fixture. Read-only inspection confirms reports_count=0, no report_rows, no onboarding private schema, unchanged settlement hash/order rows, no refund table installed. Guard refined to allow only the exact annotated synthetic fixture, while rejecting production report_rows, snapshot activation, onboarding private schema and unannotated/other reports tables. Retest includes rejection of a non-fixture reports table. No existing fixture was removed or changed. Final commit changes only SQL/test/audit from the Preview-tested web source.

## Approved payment DB application

Applied billing_test_refund_policy_20261011 to kbqyszbuxojofugqfjbh after the corrected 29-assertion SQL test passed. PostgreSQL post-apply: orders 6, ordered row hash 52da0f9caa435c86f83f17ad2225b55f; charges hash fc3f405f8c958470b5f474335f7a514b; both unchanged from immediately preceding baseline. Refund requests=0. No real or test payment cancellation was executed by this release. New functions postgres-owned, search_path empty, service_role execute true, anon/authenticated false; table RLS enabled, client SELECT false, direct service UPDATE false. Function body hashes: settle efe545bd29d626c00cc8ad76f2b0a8a3, request 7485d7c162592414433a1c90161ee89c, settle_refund 40db4b6cf80b9a78e46c3eb3a0c36cd4.

Security advisor: informational RLS-without-policy on server-only tables is intentional; no public policy added. Existing payment-sandbox Auth leaked-password warning is outside this refund change and was not altered. References: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Production app read-only protection check: 16 legacy advertisers, 0 managed, no refund table. Prepare MD5 11fd8088ddb063dfa46be60b11a06a3c and activation MD5 17df92c196f28727c6602ab920a48940 unchanged. No application DB migration. Preview raw HTTP returned Vercel's protection surface; authenticated browser rendered the actual policy, shared chrome and footer successfully. Final production build uses the same Preview-tested runtime source; only SQL/tests/audit changed afterward.
