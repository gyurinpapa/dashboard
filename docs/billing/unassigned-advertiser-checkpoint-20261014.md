# Unassigned advertiser implementation checkpoint — 2026-10-14

Status: inactive lifecycle and DB storage candidates. NOT rollout-ready. No hosted database schema, checkout route, UI or environment variable has been changed by this checkpoint.

## User decisions

- New advertiser checkout asks for advertiser name, without a workspace selector.
- A verified purchase stays unassigned until an authorized manager assigns a workspace.
- Report use starts after assignment, with one calendar month from assignment completion.
- Preserve all existing advertisers, orders, report calculations, workspace access, exports and scheduled ingestion.

## Verified baseline

Production commit at inspection: `0194862fa767cac548a436703677d1ef7a9a8e87`. This includes the separately deployed Naver summary change and must not be replaced with the earlier checkout-only release.

`advertisers.workspace_id` and `reports.workspace_id` are NOT NULL. Existing create/list/update APIs authorize by workspace membership. The current entitlement check matches purchase draft/order workspace as well as advertiser ID. Changing the selector alone, assigning null workspaces to existing tables, or changing only advertiser.workspace_id would break these contracts.

## Implemented here

An isolated, currently unreferenced lifecycle module defines the new registration state and authorization boundary. It reuses the existing calendar-month calculation. No production import activates it. A temporary compiler executes the actual module for 37 deterministic scenarios, with no external API or database requests.

The follow-up storage candidate adds a private registration table and seven service-only SECURITY INVOKER RPCs: record, assign, reserve_refund, confirm_refund, provider_state, get and list. All public/anon/authenticated execution privileges are explicitly revoked. The table has RLS enabled and is inaccessible to browser roles. No existing table/function/policy is replaced. The candidate refuses installation without a session opt-in and refuses a database containing report_rows or the production daily snapshot activation function. It is intentionally not a deployable production migration.

Registration stores the verified buyer/company/tenant/order/advertiser identity with no workspace or service dates. Assignment locks the registration, checks fresh company/tenant/workspace roles, inserts the stable advertiser and starts the calendar month in the same transaction. A matching retry returns the original timestamp. Insert/finalization failures roll back both writes. Refund reservation locks the same registration and freezes amount/time before a provider call. Cancellation delivery cannot resurrect a refund or turn a reserved partial refund into manual review merely because the webhook arrived first.

The designated true master keeps the existing combined identity + actual master membership requirement. Other-company ordinary administrators and a role named master alone are denied. Even a true master may assign only into the registration's company and tenant. Assignment never grants workspace membership: the buyer must already have the destination role that the existing builder allows (admin/director/staff); otherwise it raises BUYER_DESTINATION_ACCESS_REQUIRED. The future UI must show that actionable prerequisite rather than silently widening permissions.

Pending-list reads use a bounded keyset cursor, scoped to buyer, authorized company/tenant managers or the verified true master. Assigned registrations are omitted. get authorizes its actor separately.

## Local storage verification

`scripts/verify-unassigned-advertiser-storage.cjs` executes the actual candidate SQL against fresh, synthetic in-memory PostgreSQL databases. 91 scenarios pass on PostgreSQL 17.5 (PGlite 0.3.14) and 18.6 (PGlite 0.5.9). Tests include identity conflicts, cross-company/tenant denial, true-master identity checks, list pagination, actual anon/authenticated execution failures, both before-insert and after-insert rollback failures, refund retries and reordered cancellation events, unchanged synthetic legacy advertiser/report rows, RLS and unchanged NOT NULL constraints.

These are single-session embedded PostgreSQL tests. They do not establish real multi-session lock behavior, hosted PostgREST compatibility, exact production 17.6 behavior, payment-provider integration or browser flow completion. No hosted test/production database was modified, and no provider API was called. The production DB reads were metadata-only.

The PGlite packages were installed in temporary tooling directories with pinned versions and ignore-scripts, outside application dependencies. To rerun, install either pinned PGlite version in a temporary directory and set ETRYLUE_TEST_PGLITE to its package directory before running the script. The default SQL path is scripts/sql/unassigned-advertiser-storage-candidate.sql; ETRYLUE_REGISTRATION_SQL can point to a local candidate during development.

The candidate preserves same-destination retry identity, rejects a second destination, prevents other-company/tenant assignments, requires verified payment, denies staff/client assignment, blocks use during refund reservation, prevents stale DONE from reviving refunds, and starts the calendar month at the supplied transaction timestamp. No existing catalog price or legacy refund function is modified.

The manager authority object MUST come from fresh server DB reads, never a request body or user_metadata. The module is not a substitute for authentication, RLS, row locks, verified provider reconciliation, or persistence. Designated platform-master authority requires its existing combined identity/membership check; the string `master` alone is deliberately insufficient.

## Policy candidate needing final rollout review

Before assignment, refund in full because service has not become available. After assignment, retain the existing payment-approval-based 168-hour guarantee, then prorate remaining service duration from actual assignment start, rounding fractional won upward. This is candidate behavior, not an assertion that public policy or production behavior has changed.

## Required next work before any deployment

1. Complete the private registration candidate's hosted-schema/ACL review, real multi-session tests and eventual guarded production migration generation. The current candidate is deliberately isolated-only. Reuse the server-derived stable advertiser ID; do not alter legacy advertiser/report NOT NULL constraints.
2. Idempotent server-verified payment registration, company identity resolution without client workspace input, and cross-database recovery between the isolated payment DB and app DB. No successful redirect alone may grant access.
3. Connect the tested assignment transaction to the authenticated server API and durable payment reconciliation/outbox. The RPC must not be exposed through a route before actor identity and provider evidence are correctly derived on the server. Failed or interrupted cross-database work must remain unusable and safely retryable. No automatic company membership widening.
4. Entitlement lookup for the new version must follow stable advertiser identity after assignment, while keeping legacy order matching unchanged. Reconciliation and duplicate webhooks must never move the service start back to payment approval.
5. Checkout without selector, buyer pending list, manager assignment UI, result/account status and version-specific service/refund disclosures. New UI must not become visible before the full backend path exists.
6. SQL isolation/ACL/concurrency tests, UI tests and Preview with isolated test configuration. No test migration against production or existing payment-test data as a substitute for an isolated test.
7. Reconfirm latest Production SHA, prepare a complete reviewable diff, and obtain fresh production approval only after all checks pass.

Open issue: define a finite assignment waiting/cancellation policy before live billing. Do not silently introduce automatic refunds, indefinite fund holding, or modify already purchased service dates.

Toss submission PPT remains pending the corrected complete purchase flow; a lifecycle test is not evidence of successful checkout.
