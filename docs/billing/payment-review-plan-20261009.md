# Etrylue public payment review preparation

## Verified baseline (2026-10-09 KST)

Vercel lookup of www.etrylue.com returned Production READY:
- Project dashboard / prj_lDzro0dEk4vJRaqjgIbTu8yepUDX
- Team team_ADwPfZGADl8I5pvYHxjtcyYx
- Deployment dpl_Gad9jkmb1LHhrk5JFAxhoxQmBuwJ
- SHA f1d6f980186ef14f1529d5ad24356aaaa09076c3
- Branch feat/pricing-public-20261006

New isolated worktree/branch feat/payment-review-20261009 starts at that exact SHA. No main modification, push or release. Existing billing test worktree/commits remain intact.

Source findings:
- HomeChrome already links /pricing from header/footer.
- /pricing and /billing/checkout already reuse PublicSiteShell and the homepage styling.
- Public checkout renders plan information only; no payment action is implemented there.
- Advertiser / workspace / company once prices are 39000 / 129000 / 349000 KRW including VAT, still explicitly provisional.
- Capacity limits are 1 / 5 / 20 advertisers, likewise provisional.
- Monthly mode is currently the default, despite monthly merchant setup being deferred.
- Terms are general service terms, not a finalized paid-service/refund agreement. No dedicated refund page exists in this source.
- HomeChrome has business information and customer contacts; no mail-order business registration number is present. This is a source finding, not proof of the business's current registration status.
- The isolated payment source explicitly rejects VERCEL_ENV=production and etrylue.com origins. Copying it unchanged cannot provide the public-site review path.
- It uses global Supabase app credentials/auth. Replacing those with test credentials would endanger the real app; never do this.

Public webpage fetch through search was unavailable; content findings above come from the exact verified deployment source, not a fresh browser rendering.

## Official review requirements checked

https://www.tosspayments.com/blog/articles/53711?from=category
https://docs.tosspayments.com/resources/faq
https://docs.tosspayments.com/guides/v2/payment-window/integration

Toss says to verify payment integration on the actual website, not only a test environment; test API keys can be used to prepare integration. Goods/prices, supply/refund guidance and reviewer access must be available. A preview link alone is not evidence the actual-site requirement is satisfied. Passing tests does not establish underwriting approval. The merchant's current application status has not been queried in this step.

## Concrete candidate flow

Homepage -> /pricing (once selected by default) -> /billing/checkout?scope=...&mode=once -> order confirmation/consent -> Toss test payment window -> API-only callback -> sanitized payment result.

Preserve PublicSiteShell, HomeHeader, HomeFooter, catalog quote function and existing visual rules. Load the SDK only when the payment button is pressed. Keep monthly selection informational and clearly state it is planned after general-payment review, rather than offering an unavailable recurring checkout. Show test/review status truthfully throughout; do not imply real charging or production entitlement activation.

Reuse the tested order verification/idempotency/reconciliation behavior, with an explicit review-only configuration boundary. Public review code must use separately named test credentials and isolated storage/auth; it must never replace the application's NEXT_PUBLIC_SUPABASE_URL, anon key, service-role key or normal login session. The current production-rejecting test guard must remain in force for its existing routes. Do not simply relax that guard or enable all test routes on the production app.

Design review must settle the smallest safe reuse mechanism before implementation (dedicated review route adapter versus an approved same-brand isolated checkout). A link to the protected Vercel Preview is not an acceptable completed solution: reviewers would encounter a Vercel login, and actual-site integration has not been established. Do not remove deployment protection globally or publish a bypass secret in a link.

No import of entitlement enforcement into reports/create, shared/read/export endpoints or workers. No report DB migration, scheduler change or live media API request is needed for the payment review milestone. No real keys, charging, billing subscription or payment analytics purchase events in this phase.

## Owner decisions required before review publication

First decision: confirm actual proposed once-payment prices and scope, or provide replacements. Proposed values below are existing displayed draft values, not an approved final commercial policy:

| Product | Scope / duration | Proposed price incl. VAT |
| --- | --- | --- |
| Advertiser | selected advertiser, 1 month | KRW 39,000 |
| Workspace | selected workspace, up to 5 advertisers, 1 month | KRW 129,000 |
| Company | selected company, up to 20 advertisers across workspaces, 1 month | KRW 349,000 |

Do not silently turn provisional prices into final prices. After price/scope confirmation, prepare paid-service delivery and refund terms as a reviewable proposal, verify the current business registration details, and include them in the final deployment approval bundle. Do not invent a registration number or apply blanket non-refund language. These business terms cannot be inferred from synthetic entitlement tests.

## Release evidence required

- Exact latest production baseline and narrowly scoped diff.
- Approved product/price/terms, displayed amount matches server quote.
- Dedicated test-only config rejects live keys and all production data stores.
- Reviewer can access the actual-site checkout without an unrelated Vercel account.
- Desktop/mobile success, cancellation and failure path; tampered amount/order/state rejected.
- Duplicate confirmation does not duplicate settlement; ambiguous result reconciles server-side.
- No card/secret/payment callback parameters in rendered analytics pages.
- Existing homepage shell/navigation and ordinary app behavior preserved.
- Concrete Preview/staged review, then separate approval for public production deployment.

Current result: read-only audit and isolated preparation branch complete; payment review implementation/publication is NOT complete, and no environment setting was changed.

## Price/scope approval and implemented candidate (2026-10-09)

The user explicitly confirmed all three once-payment prices and scope limits above at 06:37 KST. The once catalog version is now etrylue-once-20261009. Monthly amounts remain proposals and no monthly billing action is accepted by the review API.

Implemented same-origin review flow in this branch (supersedes the unresolved adapter choice above):
- Public pricing defaults to once and displays confirmed prices; public checkout reuses the original site shell.
- /billing/review/login and /api/billing/review/session use isolated Supabase Auth with their own HttpOnly/Secure/SameSite=Lax cookie name etrylue-review-auth. Passwords are never logged, stored by the app or put in URLs. The app's standard cookies/config are untouched.
- /api/billing/review/checkout, targets, callback, manage adapt the already-tested once-payment implementation from isolated source 999bcc6, preserving target ACL, immutable payment-key persistence, provider confirmation, idempotency keys, reconciliation, and the existing billing-test SQL RPC contracts. No duplicated payment implementation already existed in the production baseline.
- Review functions use ONLY dedicated BILLING_REVIEW_* configuration and the exact kbqyszbuxojofugqfjbh database. Live keys are rejected. Provider responses must match test merchant tetryluei6e. No monthly authorization/renewal endpoints.
- Existing isolated webhook can reconcile the shared isolated orders with the same test merchant. No webhook configuration or URL was changed; actual delivery for new review orders remains to be demonstrated.
- Callback is an API-only 303 redirect: paymentKey/state are never forwarded to a rendered page/analytics. Rendered result uses only order ID + coarse result state. No purchase analytics events added.
- Test SDK loads only on checkout submission. No runtime dependencies, fonts, images, report gates, worker changes or DB migrations were added to the deployed app. The two SQL files are reused local test fixtures, not migration auto-runs.

### Required review configuration (not set by this work)

Configure on dashboard's exact review Preview branch first; never copy or overwrite the ordinary app's Supabase values. After real Preview checks and separate production release approval, configure the corresponding review values for Production.

| Name | Value/source |
| --- | --- |
| BILLING_REVIEW_ENABLED | true only when the other review settings are ready |
| BILLING_REVIEW_ORIGIN | Exact HTTPS Preview origin; Production later https://www.etrylue.com |
| BILLING_REVIEW_SUPABASE_URL | https://kbqyszbuxojofugqfjbh.supabase.co |
| BILLING_REVIEW_ANON_KEY | Isolated project's anon/publishable key; user enters privately |
| BILLING_REVIEW_SERVICE_ROLE_KEY | Isolated project's server key; Secret, user enters privately |
| BILLING_REVIEW_USER_IDS | Allowlisted isolated reviewer Auth UUID(s) |
| BILLING_REVIEW_STATE_SECRET | Independent random secret, at least 32 characters |
| BILLING_REVIEW_TOSS_CLIENT_KEY | Correct merchant test_ck_ key |
| BILLING_REVIEW_TOSS_SECRET_KEY | Matching test_sk_ key; Secret, user enters privately |

No key value has been retrieved, copied from the existing deployment, printed or committed. Provision a dedicated reviewer identity and synthetic company/workspace/advertiser memberships without sharing the owner's password. Existing target scopes with active test purchases can conflict with a new overlapping order; provide separate review fixtures or explicitly refund that review account's own test order before retesting. Never cancel historical owner test orders silently.

### Candidate tests and remaining gates

scripts/verify-public-review.mjs runs actual review routes/services against PGlite PostgreSQL with synthetic Auth/provider responses, blocking other HTTP destinations. Fifteen scenarios passed, including all prices/scopes, production-DB fallback denial, live-key denial, ordinary cookie exclusion, login/logout cookie isolation, account allowlist, CSRF, server quote, target isolation, duplicate order/confirmation, callback tampering, wrong MID, ambiguous approval reconciliation, interrupted checkout, full refund/stale success, purchaser checks and sanitized redirects. No real provider transaction or hosted DB mutation was performed by these tests.

TypeScript, scoped ESLint and a webpack production build passed. Browser setup failed because the downloaded Chromium archive was invalid; no mobile/desktop pixel or interactive browser success is claimed. Next's pre-existing middleware deprecation warning remains; middleware was not changed.

This candidate is not yet merchant-review-ready: dedicated Preview configuration and actual browser test remain, and paid-service supply/refund terms plus business-registration status still require owner review before public release. Product price/scope approval alone is not approval to publish an unreviewed refund policy or launch charging.

Local HTTP verification subsequently passed seven checks against the running Next server with synthetic review config: pricing, once checkout, monthly informational checkout, reviewer login, unknown-order result, unauthenticated targets rejection, CSRF rejection. All five HTML responses include the existing business footer/navigation, and none includes an eagerly loaded Toss SDK script. This is HTTP/SSR evidence, not a browser click or mobile layout test. Initial separate-command connection attempts failed; running the server and probes in one process namespace resolved it without changing application code. Total current named backend/config/Auth checks=15, HTTP checks=7.

Refunded review orders offer an explicit new-order test action that clears only that exact review order's sessionStorage key. Interrupted checkouts return to the same pending order, avoiding silent duplicate orders. Server-rendered result still checks stored/provider-verified state rather than trusting the redirect's result label.
