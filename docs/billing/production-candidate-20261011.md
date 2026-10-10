# Production-hosted test purchase candidate — not deployed

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
