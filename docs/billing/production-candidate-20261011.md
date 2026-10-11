# Production-hosted test purchase candidate — web rollout not deployed

## Baseline and scope

Read-only audit on 2026-10-11 KST:
- Production `464a84b2f0644758fe01ae47e507c405b2a1af52`, deployment `dpl_6x6VNgn2Hb4JNpU2A3JfQLQoQgtg`, READY on app/www/apex.
- Tested Preview `746195da7066d3992c8e44246cfe717f91acbe6e`, deployment `dpl_541nAxQRnSm55LhiB3vKoDvapLAa`, READY.
- Preview is 9 commits ahead, 0 behind Production. Candidate worktree starts at Production and fast-forwards those reviewed commits.
- App DB: `rulcvpgvmmckacshkmfy`. Isolated onboarding DB: `lpwmxtnzpgyrhphwufsd`. Payment test DB: `kbqyszbuxojofugqfjbh`.
- Production has no customer private schema, provisioning RPC, or signup reservation RPC. The onboarding flags exist only on the tested Preview branch.
- Production daily activation body MD5 `17df92c196f28727c6602ab920a48940`; preparation `11fd8088ddb063dfa46be60b11a06a3c`. Both allow service_role and deny anon/authenticated execution. No snapshot ACL change is currently needed.
- Production report INSERT and the two API report creation RPCs deny authenticated access. Preserve these grants; they are necessary to prevent bypassing the server route.
- Compatibility branch `feat/payment-invite-compat-20261011`, GitHub commit `3a1e29db8923e050623f8eabb19f4f6f5280187c`: one trusted invite app_metadata line plus disabled automatic Git deployments. It has no customer UI, payment gate, or DB changes.

This candidate keeps Toss test keys, the fixed test merchant, once-only payments, and the isolated payment ledger. It does not implement live billing, monthly billing, a final price/refund policy, or restrictions on existing report viewing/editing/publishing/sharing/PPT/scheduled sync.

## Added production boundary

- Explicit server flag `BILLING_REVIEW_APP_ROLLOUT=production-test-v1`, plus production deployment, exact app DB, exact app origin, matching onboarding DB URL, and review enable flag.
- No new production behavior merely from deploying this code. Do not turn on the rollout flag before app/payment DB prerequisites exist.
- Confirmed users with server-owned customer app_metadata may use the test purchase flow after provisioning; legacy configured test-user IDs remain supported. No user-editable metadata grants authority. Target selection still verifies existing workspace roles.
- New production test-purchase advertisers receive `billing_review_managed=true` at server insertion. All pre-existing/manual advertisers keep false. Browser callers cannot add/change the marker; managed advertiser identity cannot be reassigned. Names remain editable under existing permissions.
- Existing advertisers reuse the authorized advertiser row, skip payment DB reads and client entitlement requests, and do not become blocked by payment-storage outages.
- Managed targets require a purchase draft tagged with the application project. Missing tagged draft denies access. Legacy isolated drafts are NOT backfilled, copied, or adopted.
- Direct create requests ignore client-supplied marker values. Managed lookup failures deny creation. Disabling signups does not disable existing managed-target checks.
- Reports/create keeps its original authorization and insertion logic. Daily workers, calculation/filter paths, shared reports, PPT paths, and dependency files are unchanged from Production.

## Ordered release — new approval required

1. Recheck current Production SHA, Auth trigger fingerprint (`6a1282e030f4ca80893e0fc98bdc692f`), snapshot fingerprints/grants, and report INSERT/RPC grants.
2. Release ONLY the compatibility branch: invite registration adds the trusted invite marker. Public customer signup remains disabled. Verify a disposable invitation using an authorized account. This must precede the Auth trigger migration, or existing invitations will fail.
3. Apply `scripts/sql/customer-onboarding.sql` to the application DB only. It changes Auth insertion to a deferred trigger and creates customer company/role boundaries. Never apply the isolated baseline, ACL correction, or empty media-connection fixture scripts to Production. Verify the profile function against the tested SQL and provisioning grants before enabling signups.
4. Apply the single app migration under `scripts/database-candidates/app/supabase/migrations` to the application DB only. Apply the single payment migration under the separate `payment` directory to the payment test DB only. These directories are intentionally separate projects; do not combine/mass-push their migrations.
5. Prepare the full candidate with production credentials already belonging to the production app. Set CUSTOMER_ONBOARDING_DATABASE_URL to that same production URL, CUSTOMER_ONBOARDING_ORIGIN to `https://app.etrylue.com`, and CUSTOMER_ONBOARDING_ENABLED to true only after DB verification. Do not copy Preview Auth keys, test accounts, report types, reports, or purchases into Production.
6. Keep the existing BILLING_REVIEW_* payment DB configuration and test-only Toss keys. Set the new rollout flag only at the explicitly approved activation stage. Use a staged production build before domain promotion; a normal Preview pointed at the app DB is not a safe substitute.
7. Check production Auth redirect allowlist for `/onboarding` and `/reset-password`, email confirmation, and SMTP delivery without exposing credentials. These production Auth/SMTP checks are NOT yet completed.
8. Verify www login/session/logout → app checkout → signup/email confirmation → own workspace → test purchase → advertiser creation → CSV draft → full test refund/denial → repurchase/allow. Recheck a legacy account, invite, report, share, PPT and Naver scheduler state. Then review final deployment approval for exact commit/config/migrations.

## Pause / rollback

- Pause new signup with CUSTOMER_ONBOARDING_ENABLED=false. Keep customer isolation schema and invitation-compatible code.
- To pause test payments, BILLING_REVIEW_ENABLED=false makes managed creation fail closed while legacy advertiser creation stays independent.
- Once any managed advertiser exists, do NOT remove the rollout flag, marker column/trigger, or server gate, and do not roll back to pre-gate code: that would remove enforcement. Keep the last compatible release and disable the affected entry point instead.
- Do not delete customer graphs or copy test credits as rollback. No worker settings, provider tokens, existing report references, or snapshot functions need changes.

## Evidence and limitations

Earlier Preview user/API checks: no-entitlement direct creation returned 403 ENTITLEMENT_REQUIRED and created zero reports; active purchase created CSV traffic draft `3d21f42e-6a80-444a-8ff6-3075a18ff042` under its correct advertiser/workspace. Repurchase unlocked Step2 and displayed active access without another purchase button.

Candidate checks use synthetic credentials/network interception and local PostgreSQL-compatible PGlite, not production API writes: actual POST handler in production/Preview configurations, legacy storage-outage independence, role/workspace denial, live-key/monthly rejection, marker/source SQL, prior onboarding/HTTP/site-session tests, TypeScript and build.

Completed candidate validation:
- 10 actual POST-handler scenarios in each of production and Preview modes, with every outbound call intercepted (20 total). Forged request-body marker cannot bypass the gate. Legacy creation has zero billing reads.
- 22 existing onboarding SQL checks; 13 existing HTTP/contract checks; existing website-purchase, onboarding billing boundary, entitlement, and site-session tests passed.
- New production opt-in/storage-outage and SQL marker/source tests passed.
- TypeScript, targeted lint, full Next.js webpack build with synthetic credentials, and whitespace validation passed.
- Protected worker/media-sync/calculation/share/PPT/dependency paths have no diff against the production SHA.
- No candidate migration, hosted database mutation, deployment, provider call, or credential change was performed during this implementation turn. Earlier test fixtures remain confined to their test projects.

Remaining: production-domain cross-host session behavior, real staged candidate UI, actual PostgreSQL 17 migration rehearsal/concurrency, cross-database refund-vs-create race behavior, and full existing share/PPT regression acceptance. No claim of production release readiness before these gates. Payment entitlement lookup and report creation are in different databases and are not an atomic transaction.

## Invite compatibility predeployment verification — 2026-10-11 UTC

- Release candidate remains GitHub `3a1e29db8923e050623f8eabb19f4f6f5280187c`, tree `2ab4c5ecd5f9d271c72f563c50fa8274863395bb`.
- GitHub comparison against production `464a84b2f0644758fe01ae47e507c405b2a1af52` confirms exactly one server metadata line and the Git auto-deployment disable configuration; no deletion.
- `scripts/verify-invite-compat.ts` imports the actual route from the current working directory. Its 25 synthetic scenarios passed against the compatibility checkout: supported/fallback roles, body authority forgery, missing/expired/accepted/master invites, existing users/members, lookup failures, Auth failure, and cleanup of only the newly created Auth user after downstream write failures.
- Every fetch is intercepted; no live Auth account, database write, invitation email, or payment was created. An initial fixture used a non-UUID Auth ID; corrected it to a synthetic UUID so the SDK's delete-user validation exercises the intended cleanup request.
- Compatibility checkout full `npm run build -- --webpack` passed, including TypeScript, with synthetic credentials and onboarding/billing disabled. Existing middleware naming deprecation warning remains.
- Hosted invitation acceptance, SMTP delivery and concurrent invitation requests are not established by these tests. No production deployment, production DB migration, or environment change performed.
- Next release decision: explicitly approve only the compatibility commit for production before the separately reviewed onboarding/database rollout. Reconfirm current production before any deployment.

## Approved compatibility-only production deployment — 2026-10-11

User explicitly approved the compatibility-only release after predeployment verification. Rechecked previous production SHA `464a84b2f0644758fe01ae47e507c405b2a1af52` immediately before deployment.

- New production SHA: `3a1e29db8923e050623f8eabb19f4f6f5280187c`.
- Deployment: `dpl_J5RC3QskGnggUiV3k4R2L71FMonz`, production READY, no alias error.
- URL: `https://dashboard-iubu3yc3y-gyurinpapas-projects.vercel.app`.
- Vercel confirms app/www/apex aliases on this deployment; app domain resolves to the exact approved SHA.
- Post-deploy HTTP: homepage and app login 200; apex redirects to www then 200.
- Empty JSON POST to invite registration returns 400 TOKEN_REQUIRED before invitation lookup or account creation, as expected.
- No DB migration, environment modification, real invite/account creation, payment, Railway operation, or default branch push/merge.
- These smoke checks do not establish real invitation completion, report/PPT end-to-end behavior, or runtime log cleanliness. Those were not exercised in this release.
- Full payment/onboarding candidate is still not released. Next priority: read-only production prerequisite check for the separately reviewed onboarding DB migration; approval required before applying it.

## Production onboarding prerequisite inspection — 2026-10-11 KST

Read-only transactions only on production `rulcvpgvmmckacshkmfy` and onboarding test `lpwmxtnzpgyrhphwufsd`; no DDL, user writes, Auth calls or scheduler actions.

Confirmed production web remains `3a1e29db8923e050623f8eabb19f4f6f5280187c` READY. PostgreSQL 17.6. Private customer schema, provision/reservation RPCs and customer_* policies are absent; no naming collision. Default company `000` has exactly one row. All five proposed restrictive-policy target tables have RLS enabled.

Profile trigger function MD5 remains `6a1282e030f4ca80893e0fc98bdc692f`, owner postgres. Auth profile trigger is still the original immediate AFTER INSERT trigger. Existing other Auth trigger calls a no-op `handle_new_user()`. Workspace owner insertion and tenant membership provision function bodies match test DB exactly (MD5 `2f78bd0c869a564c6852652fabb3d711` and `19239a15c4f567ec7cb52d5ae496f880`). Required NOT NULL columns/defaults in six provisioning tables match test DB.

Snapshot prepare MD5 `11fd8088ddb063dfa46be60b11a06a3c`, activate MD5 `17df92c196f28727c6602ab920a48940`; both postgres-owned, service_role execute allowed, anon/authenticated denied. Authenticated reports INSERT remains denied; both existing API-report-creation RPCs deny authenticated execution.

The proposed `scripts/sql/customer-onboarding.sql` installs private registration tables/service-only RPCs, changes the Auth profile trigger to deferred trusted-marker dispatch, and adds customer-scope restrictions. It does not backfill existing accounts or modify report rows, calculations or scheduler functions. New unmarked Auth account creation would deliberately be rejected after installation; current production source account creation is the marked invitation route. Dashboard/manual account creation and external Auth providers were not exercised and must not be assumed compatible.

No prerequisite mismatch found in the inspected objects. This is not a PostgreSQL 17.6 migration rehearsal, live invite acceptance, concurrent lock test, or full production UI/PPT verification. Apply-time baseline checks, short lock/statement timeouts and post-apply inspection remain necessary. Separate explicit approval required for this exact onboarding SQL; payment-marker/origin SQL and full web rollout are outside that approval.

## Approved onboarding DB application — 2026-10-11 10:51 KST

User explicitly approved only onboarding/company isolation. Applied exact `scripts/sql/customer-onboarding.sql` to production `rulcvpgvmmckacshkmfy` as migration `20261011015127_customer_onboarding_company_isolation`. First tool request failed with expired requestState; read-only reinspection confirmed no schema/history/data change before retry. Second request succeeded; migration history verified.

Post-apply function body MD5s exactly match local approved SQL: profile trigger b67b7351c777c8a4141c7740b766d166; my_company af77589be95a75723385f267807a2a99; guard_profile a41822e7e2e1e73cb420058b4cd6bf3f; guard_membership b0a1901121d2146cff1ef0fa643a24c0; provision 70d1bd40ab986d66b33b61734aef1a94; reserve f22048eaa1cdf01409d73cf3d2e466ea. All owned by postgres. Provision/reserve service_role executable and denied to anon/authenticated. Private helper grants and deferred/enabled Auth trigger match intended configuration.

Before/after exact row counts and ordered row-content hashes unchanged: profiles 30 / d5610c9f2008951e810bfa785ce33380; workspaces 7 / 85ffbc03207147eb1ba56ac3cc347d37; memberships 16 / 71006a6c81ceba5bfe6a0e1af5f26f7d; reports 27 / 5c0f449091a6f771311372975bbeda1f. These are report-record hashes, not scans of all report_rows. Snapshot prepare/activate function hashes, owners and ACL unchanged. Authenticated direct report INSERT still denied.

All three new private tables are empty, RLS enabled, anon/authenticated SELECT denied. Five restrictive company policies and two identity/role guard triggers present. Security advisor reports informational RLS-without-policy findings for the three private tables: intentional deny-by-default design, accessed via reviewed privileged functions; no permissive client policy added. Other project advisory findings were not resolved by this scoped change. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

No web deployment or environment change, no payment marker/origin migration, no actual signup/invitation/payment, no Railway/scheduler modification. Production web remains compatibility commit 3a1e29d. Actual hosted signup/invite end-to-end and full report/PPT remain untested after this migration. Do not roll web back to a pre-marker invitation implementation while this Auth trigger is installed.

## Payment-marker/source prerequisites — 2026-10-11 KST

Read-only inspection of production app and payment test databases. Application PostgreSQL 17.6: onboarding provision RPC installed; protected activation hash 17df92c196f28727c6602ab920a48940 unchanged; billing_review_managed column and guard function absent. All four required identity columns exist as UUID. Existing advertisers: 16, row-content hash 9223e78896da7f5f6c8927b5f862fde1. No billing-test order/draft tables in app DB.

Existing advertiser tenant trigger derives tenant_id from workspace; it is not replaced by the candidate. New marker default false preserves legacy/manual advertisers. Candidate application code checks that flag before accessing payment DB, and marks only verified new-purchase creation true. This code is not yet deployed.

Payment test PostgreSQL 17.11: onboarding private schema absent; billing_test_orders and billing_test_purchase_drafts exist; app_project column absent. Drafts: 2, hash 9f1897563a5263e65b5b0e6e7f3335e1; test orders: 6. Existing draft PK/unique/check constraints present; no custom draft triggers. Candidate origin column is nullable, so existing Preview drafts remain NULL; no historical order/draft migration into production app is performed.

No application DB or payment DB mutation performed. Reviewed files remain the app marker migration 20261010234911 and payment source migration 20261010234925. Apply separately to their explicitly named databases only after new approval. DDL installation alone does not enable signup, checkout, entitlement enforcement, live keys or recurring billing. Actual production-hosted purchase flow and apply-time locks remain unverified.

## Approved marker/source DB application — 2026-10-11 KST

User approved both previously specified DB changes. Rechecked prerequisites and baseline hashes, then sequentially applied exact reviewed files using apply_migration: `billing_review_advertiser_marker` to production app `rulcvpgvmmckacshkmfy`, followed by `billing_review_draft_origin` to payment test `kbqyszbuxojofugqfjbh`. Both succeeded.

Post-apply: all 16 existing advertisers have billing_review_managed=false (managed count 0). Hash of preexisting columns unchanged: 9223e78896da7f5f6c8927b5f862fde1. Column is NOT NULL boolean DEFAULT false. Guard body MD5 8fb89382f296accabc98179546d95ba1 matches approved file; postgres owner, SECURITY INVOKER, search_path pg_catalog, anon/authenticated execution denied, BEFORE INSERT OR UPDATE trigger installed. Protected activation function hash/owner/ACL unchanged.

Payment draft app_project is nullable text, with exact two-project check constraint; both existing drafts remain NULL. Hash of existing draft columns unchanged: 9f1897563a5263e65b5b0e6e7f3335e1 (2 rows). Test orders unchanged: 6 rows, full ordered row hash c2980059b5a0056577bcb68c3e41d74a. No data backfill or reclassification.

Only these two migrations were applied. No web deployment, environment flags, Auth account creation, payment request, recurring billing activation or scheduler changes. Constraints/functions were inspected after application; no production synthetic write test was performed. Next priority is preparation of the existing reviewed web candidate and exact production settings for production-hosted TEST purchases, followed by separate release approval.


## Final web/config inspection — 2026-10-11 15:26+ KST

Production remains 3a1e29db8923e050623f8eabb19f4f6f5280187c READY. Current release code matches the previously compiled remote candidate 76df428219ec61f6265857f60eac3adf4e9699b3; subsequent local changes are audit documentation and the isolated invite verifier only. Invitation marker/vercel settings identical to deployed compatibility source. Protected worker/media-sync/share/PPT/dependency paths have no changes. No new library dependency.

Read-only Vercel metadata confirms production BILLING_REVIEW_ENABLED=true, origin=https://app.etrylue.com, payment database URL=https://kbqyszbuxojofugqfjbh.supabase.co; existing test credentials/state secret/service key are registered. Secret values were not decrypted or retrieved; validity of registered credentials requires the approved deployed flow. CUSTOMER_ONBOARDING_* and BILLING_REVIEW_APP_ROLLOUT are not registered for production. Branch-specific Preview variables are not copied.

Read-only production Supabase dashboard observations: project report-system/rulcvpgvmmckacshkmfy, Site URL https://app.etrylue.com; redirect allowlist includes https://app.etrylue.com/** and explicit reset-password, so onboarding is permitted without modifying existing redirects. Email provider enabled, new signup allowed, anonymous sign-in disabled, Confirm email enabled. Custom SMTP enabled with smtp.resend.com:465, Etrylue Performance sender name, 60-second minimum interval. Confirmation template uses .ConfirmationURL. No SMTP password or API key revealed. No Auth setting or template changed. Actual delivery to a new production recipient is unverified.

Final targeted synthetic verifications passed: production opt-in/database/origin/test-key boundary; 10 actual POST report-create cases covering active/legacy/refunded/expired/outage/foreign-workspace/client/API; 13 signup HTTP/contract cases; site-session CORS/auth/logout/outage cases; website purchase transitions and user-bound draft IDs; production-shape SQL provisioning and own-company isolation. All network intercepted. Full Next webpack build, TypeScript and static generation passed again with synthetic credentials and activation disabled. Existing middleware naming warning remains.

Exact proposed production-only Config additions, AFTER separately approved DB prerequisites (now applied):
- CUSTOMER_ONBOARDING_DATABASE_URL=https://rulcvpgvmmckacshkmfy.supabase.co
- CUSTOMER_ONBOARDING_ORIGIN=https://app.etrylue.com
- CUSTOMER_ONBOARDING_ENABLED=true
- BILLING_REVIEW_APP_ROLLOUT=production-test-v1

Approval scope for next step: add these four non-secret Production settings, create a production build of this reviewed web candidate, verify staged public responses where possible, then assign www/app domains and verify deployed flow. Reuse existing production app credentials and test-only payment credentials; no live keys or monthly billing. Existing 16 legacy advertisers retain unrestricted creation, no paid-status backfill. New purchase-created advertisers enforce entitlement in UI and server after exact rollout opt-in. No new migration requested in this step.

Hosted signup email delivery, cross-domain session truth, production-target test purchase/rebuy/refund and full authenticated report/PPT flows remain post-release verification, not established by local tests. Production release/new settings require explicit new user approval under the original handoff. Credentials and configuration were not mutated in this inspection.
