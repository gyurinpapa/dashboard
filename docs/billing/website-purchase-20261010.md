# Website-first purchase flow — isolated candidate

## Baseline
- Fresh Production inspection: 464a84b2f0644758fe01ae47e507c405b2a1af52 / dpl_6x6VNgn2Hb4JNpU2A3JfQLQoQgtg READY.
- New worktree/branch: feat/website-purchase-20261010. No default branch mutation.
- Production password recovery/report-builder changes preserved verbatim.

## Customer journey
- Homepage header: login, signup, my service. Plans remain publicly readable.
- Production website auth/account/checkout links canonicalize to app for existing host-scoped sessions; app root returns to www homepage. Preview stays same-origin.
- Login and signup share homepage chrome. Login returns to the selected local path; unsafe redirects rejected. Password recovery preserved. Existing sessions skip login form.
- Signup stores normalized purchase selection in server-owned Auth app_metadata, so email opened on another browser retains the selection. Confirmation remains /onboarding, using existing Auth redirect configuration.
- New advertiser is the first explicit option, independent of existing advertisers. Registration workspace is checked against current permissions. Clients do not gain advertiser-creation authority through payment.
- New test purchase drafts persist in isolated payment DB before provider checkout. Server-derived target IDs are stable per user/order. Retries cannot overwrite draft name/owner/workspace.
- Only provider-verified active orders can explicitly prepare an advertiser. Preparation rechecks provider state and current membership, uses stable ID and is restricted to the onboarding test project. No production advertiser creation or paid-report enforcement.
- Account page lists only the caller's payment orders. Result screen provides status/refund/preparation actions.

## Test infrastructure
- Applied billing_test_purchase_drafts only to kbqyszbuxojofugqfjbh. Empty initially; RLS on; anon/authenticated denied; service_role SELECT/INSERT only, UPDATE denied.
- Ported existing onboarding candidate and invitation marker. Included deferred Auth profile-trigger correction already proven/applied in test DB. Candidate onboarding SQL is NOT applied again and is NOT production-approved.
- Existing Preview origin and branch settings reused; no secrets read, copied or logged.
- Fresh verified onboarding users may test only in Preview on lpwmxtnzpgyrhphwufsd. Production tester allowlist unchanged.

## Verification and limits
- TypeScript and targeted ESLint pass; redirect, selection persistence, stable per-user IDs, name validation, production-write rejection, foreign-workspace/client-role rejection verified without live network.
- No changes to report builder/reports/components/media-sync/worker/package dependencies relative to latest Production.
- Local webpack compilation passed; static collection lacked existing service-role env. Deployment build is the final build gate.
- Actual new signup email -> order -> test approval -> advertiser preparation -> cancellation remains an end-to-end acceptance test after Preview deployment. No full UI/PPT regression or live-payment claim.
- Production rollout requires a separate concrete release review: onboarding DB changes, canonical Auth redirects/settings, rollout scope, paid access and cancellation policy. Current candidate intentionally remains test-only.
