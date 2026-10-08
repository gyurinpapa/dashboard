# Isolated entitlement assessment — 2026-10-08

## Approved policy and implementation boundary

User approved restricting only new report creation when entitlement is absent/expired; existing reports, reads, filters, sharing, PPT and automatic collection remain unchanged. Production enforcement is NOT authorized by this implementation step.

Added a test-only GET /api/billing/entitlement?advertiser=<uuid> assessment endpoint. It returns assessmentOnly=true and enforced=false. Production/environment/database/test-user guards are reused. Existing provisional billing target ACL (workspace admin/director) is checked before reading target grants. It is NOT a replacement for the existing report-create authorization and is not yet a staff/client flow.

Eligible grants belong to the selected target, regardless of purchaser. The response exposes only eligibility and expiry, never payer, order, payment keys or other grants. Active unexpired grants must match stored workspace/company context. Workspace/company provisional capacity is counted from current server data. Refund/expiry cannot grant access; duplicate grants do not add months. Storage failures return an error instead of a false eligibility decision. No provider API calls, DB mutations, client JS, dependencies or migrations added.

No report route imports this endpoint or helper. Neither report enforcement nor UI status display has been deployed. Pricing/capacity constants remain provisional; don't reuse them as a final commercial policy.

## Evidence carried forward

- Production was rechecked on 2026-10-08: dpl_Gad9jkmb1LHhrk5JFAxhoxQmBuwJ, READY, f1d6f980186ef14f1529d5ad24356aaaa09076c3.
- Test webhook originally rejected with provider HTTP 401; unauthenticated endpoint redirected to Vercel /sso-api. Deployment protection stayed enabled.
- User generated a test-project automation bypass and registered test webhook Etrylue 테스트 결제 상태 v2 at 20:09 KST with PAYMENT_STATUS_CHANGED and both application token and Vercel bypass query parameters. No secret values recorded here.
- Provider screenshots show successful cancellation delivery 20:11:12 and approval delivery 20:18:56. User reported deleting the old webhook.
- Read-only isolated DB confirms second order refunded and expired at 20:11:12.800794; third order 81146f51-8b70-48b8-8844-04fd38873183 active, KRW 39000, one cycle, approved 20:18:56, paid until 2026-11-08 20:18:56 KST.
- These prove the observed isolated KakaoPay once-payment and webhook flows, not production readiness, monthly billing, or every payment method.

## Remaining work

- Deployed Preview real-login verification remains pending; synthetic authenticated route verification below is complete.
- Preview publishing must respect existing exact-branch build guard; local branch is not automatically deployable. Do not relax the guard or overwrite remote ancestry.
- Before production enforcement, review target ownership changes, catalog limits, existing-customer exemptions, overlapping purchases/renewals and company billing administrator succession. No price is final.
- A later report-create integration must run AFTER existing ACL, validate advertiser/workspace from the server, preserve legacy customers explicitly and fail closed only within the approved rollout cohort. Shared/read/export/worker paths must not depend on billing.
- No changes to Naver scheduler, Google credentials/API, Railway or production DB policy.

## Authenticated synthetic integration — 2026-10-08 21:23 KST onward

Added scripts/verify-billing-entitlement-integration.mjs. Runs the actual route, actor, sbAuth, Supabase SSR/client and Next request-cookie context with synthetic cookies; all external HTTP is intercepted. Only GET/HEAD to a synthetic Supabase origin are allowed. No actual account credentials, provider calls, remote DB queries or mutations.

Eleven cases pass: signed out; invalid auth; tester allowlist; eligible target purchased by another user with no private order fields in response; same-company other workspace denied before billing lookup; membership revocation and provisional staff/client denial; owner-only membership cannot bypass workspace ACL; invalid target; refund/expiry; workspace/company coverage; storage failures including HEAD capacity queries returning errors rather than eligibility. All responses checked for no-store. The source remains assessment-only, with enforced=false.

This establishes synthetic authenticated route behavior, not real Supabase token verification, deployed HTTP/browser behavior or final report ACL parity. Staff/client denial is intentional for the existing provisional test target API; do not install this provisional policy into report creation. No production code paths or deployment settings changed.
