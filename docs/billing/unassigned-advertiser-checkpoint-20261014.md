# Unassigned advertiser implementation checkpoint — 2026-10-14

Status: lifecycle candidate only. NOT rollout-ready. No checkout route, UI, DB schema or environment variable has been changed by this checkpoint.

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

The candidate preserves same-destination retry identity, rejects a second destination, prevents other-company/tenant assignments, requires verified payment, denies staff/client assignment, blocks use during refund reservation, prevents stale DONE from reviving refunds, and starts the calendar month at the supplied transaction timestamp. No existing catalog price or legacy refund function is modified.

The manager authority object MUST come from fresh server DB reads, never a request body or user_metadata. The module is not a substitute for authentication, RLS, row locks, verified provider reconciliation, or persistence. Designated platform-master authority requires its existing combined identity/membership check; the string `master` alone is deliberately insufficient.

## Policy candidate needing final rollout review

Before assignment, refund in full because service has not become available. After assignment, retain the existing payment-approval-based 168-hour guarantee, then prorate remaining service duration from actual assignment start, rounding fractional won upward. This is candidate behavior, not an assertion that public policy or production behavior has changed.

## Required next work before any deployment

1. A private registration record with immutable buyer/company/tenant/order/advertiser identity and no workspace before assignment. Reuse the server-derived stable advertiser ID. Do not alter legacy advertiser/report NOT NULL constraints.
2. Idempotent server-verified payment registration, company identity resolution without client workspace input, and cross-database recovery between the isolated payment DB and app DB. No successful redirect alone may grant access.
3. Durable assignment transaction/outbox: authorize fresh actor/source/destination/buyer access, lock registration, prevent refund/assignment races, create the advertiser once, finalize the service start once. Failed or interrupted assignment must remain unusable and safely retryable. No automatic company membership widening.
4. Entitlement lookup for the new version must follow stable advertiser identity after assignment, while keeping legacy order matching unchanged. Reconciliation and duplicate webhooks must never move the service start back to payment approval.
5. Checkout without selector, buyer pending list, manager assignment UI, result/account status and version-specific service/refund disclosures. New UI must not become visible before the full backend path exists.
6. SQL isolation/ACL/concurrency tests, UI tests and Preview with isolated test configuration. No test migration against production or existing payment-test data as a substitute for an isolated test.
7. Reconfirm latest Production SHA, prepare a complete reviewable diff, and obtain fresh production approval only after all checks pass.

Open issue: define a finite assignment waiting/cancellation policy before live billing. Do not silently introduce automatic refunds, indefinite fund holding, or modify already purchased service dates.

Toss submission PPT remains pending the corrected complete purchase flow; a lifecycle test is not evidence of successful checkout.
