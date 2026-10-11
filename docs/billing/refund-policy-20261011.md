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

- PGlite SQL: 28 assertions, full/prorated/rounded amounts, immutable retry time/amount, ownership rejection, provider DONE/partial mismatch, stale webhook monotonicity, expiry, monthly rejection, RLS and service-only ACL. Fixtures only, no hosted DB writes.
- Actual server manage implementation: 8 intercepted scenarios (full, partial, completed duplicate, provider timeout after success, failed provider, foreign user, merchant mismatch, key mismatch), plus invalid balance checks. No real provider requests.
- Estimate boundaries: 168-hour full refund; later proportional calculation; expiry and missing dates fail closed.
- Existing production boundary and 10 actual report-create handler scenarios pass; all external calls intercepted. Legacy accounts perform no payment lookup.
- Changed runtime TS/TSX ESLint and TypeScript passed. Final full Next webpack build passed after JSX parallel-read cleanup; /refund is statically prerendered. Existing middleware deprecation warning unchanged.
- PostgreSQL multi-session refund concurrency and hosted authenticated partial-refund UI not claimed. Cross-app/payment DB report-create transaction still not atomic, unchanged.

## Mac synchronization

scripts/macos/sync-production-worktree.sh accepts the exact final production SHA. It verifies repository origin, fetches that commit, creates a separate detached worktree, refuses mismatched/nonclean existing targets, verifies source and opens VS Code. No checkout/reset/clean on the existing repository, no main/default push. This cloud runtime has no Mac execution capability. User must execute it and report PRODUCTION_SOURCE_SYNC_VERIFIED before Mac sync can be marked completed.
