# Unassigned advertiser integration candidate — 2026-10-14

This supersedes the earlier lifecycle/storage-only checkpoint for implementation progress. This is a Preview-only test candidate, not a production release. Do not promote this build to Production: registrationEnabled deliberately requires the isolated app project, explicit test opt-in and this feature branch.

## Decisions and behavior

- New advertiser checkout asks only for advertiser name. Client-supplied workspace IDs are rejected on this new purchase path; existing target purchases retain their old path.
- Payment ledger and app data remain in separate databases. A new immutable payment draft freezes buyer/company/tenant/name/advertiser identity. Existing draft/order tables are not altered.
- Only matched, server-verified test merchant payments may create a private app registration. Redirects and browser payloads cannot authorize access. Duplicate callbacks, registration-storage failures and refunds are handled idempotently.
- Before manager assignment, no real advertiser/report exists for the registration and there is no service start/end. The buyer sees an unassigned pending entry.
- Authorized managers assign within the registration's company/tenant. The designated true master still requires the existing email + actual master membership combination. Buyer destination access is checked; assignment does not silently grant memberships.
- Assignment inserts the stable advertiser ID and starts one calendar month in a single app transaction. Subsequent retries do not restart the clock.
- New-version entitlement requires both the app registration's valid assignment period and an active matching payment ledger entry. The original approval-based date in the compatibility payment ledger is never shown as the new service period. Other independently valid legacy entitlements remain valid.
- Cancellation in the payment ledger blocks access even before app reconciliation catches up. Refund reservation blocks the new entitlement before a provider cancellation request. Confirmed refunds never delete the advertiser/reports.
- New managed advertisers fail closed if the test feature is later disabled in the existing isolated Preview.

## Implemented paths

- Existing checkout/callback/manage/targets/creation-access functions branch only for the new catalog version / explicit test feature.
- New `/api/billing/registrations` GET/POST derives actor from authentication, uses no-store responses, rejects client authority/price fields, authorizes reading before any provider work, reconciles before assignment, and delegates atomic authorization to the reviewed RPC.
- `/billing/registrations` shows scoped pending entries and only eligible destinations. Buyer and manager access are independently checked on writes.
- Checkout, account, result, management controls and refund disclosure distinguish waiting, usable, refund-pending and refunded states. Existing UI behavior remains the default when the feature is off.
- The Toss SDK loader is reused. No new runtime dependency or global script is added. No analytics/GA purchase event is added here.

## Isolated tests

- 97 actual SQL scenarios on embedded PostgreSQL 17.5 and 18.6: ACL/RLS, ownership, pagination/destinations, no partial assignment, retries, refund ordering, preservation of synthetic legacy rows/constraints.
- 31 actual API/service/Supabase SDK scenarios on two synthetic embedded databases: name-only checkout, state/origin/price rejection, payment-to-registration failure recovery, pending-to-assigned entitlement with delayed start, scoped assignment, prorated refund and replay. Also verifies the original workspace checkout/prepare/entitlement path and zero registration RPCs on that legacy path when disabled.
- 12 actual-component scenarios with mocked hooks/fetch/payment SDK: lookup failures, selector removal, legacy selector preservation, payload separation, double-submit guard, no SDK after failed order creation, waiting/refund messages.
- The prior pure lifecycle test has 37 scenarios. Test tooling is temporary: TypeScript 5.9.3, Supabase SDK 2.97.0, PGlite 0.3.14 / 0.5.9, installed with pinned versions and ignore-scripts outside application dependencies.

These are not real card payments, browser visual QA, real multi-session lock tests, or hosted PostgREST validation. All provider/network requests in flow tests are intercepted and unknown URLs throw. Production/Railway/Google/Naver credentials and jobs are untouched.

## Hosted test application completed

- App project lpwmxtnzpgyrhphwufsd: migration unassigned_advertiser_registration_test_only applied after exact project/metadata checks. The default-false marker and private registry/eight service-only RPCs exist. RLS, invoker permissions, service execution and denial for anon/authenticated were checked on hosted PostgreSQL 17.11. Registration rows remain zero; no hosted test purchase/advertiser was created by this application.
- Payment project kbqyszbuxojofugqfjbh: migration unassigned_advertiser_payment_drafts_test_only added the new immutable draft table. RLS and service SELECT/INSERT-only access were checked. New draft rows remain zero.
- Existing app test advertisers: 4 rows, business-row hash e38b6f787198772f855c916ab6471713 unchanged. Memberships: 2 rows, hash 3cfea94e5e5cabba78d20a8a2ab7fe5d unchanged.
- Existing payment orders: 7 rows, selected immutable/business-state hash 4daa6ba89bad919ac3e07f2cb6825049 unchanged; charge rows remain 7. No existing order, charge, refund or old draft was updated by these migrations.
- Branch-only Preview configuration was created for feat/unassigned-advertiser-20261014. Public test project keys/config were validated, a fresh private state signer was stored without displaying its value, and inherited production service credentials were masked with test-only placeholders. Production variables and old Preview branch scopes were not edited.
- Three private placeholders require direct user replacement: SUPABASE_SERVICE_ROLE_KEY (app test project), BILLING_REVIEW_SERVICE_ROLE_KEY (payment test project), BILLING_REVIEW_TOSS_SECRET_KEY (Toss test secret). The placeholder for the Toss secret intentionally fails providerKeys; the new checkout cannot open until correct test configuration is supplied.
- Stable Preview origin: https://dashboard-git-feat-unassigned-adver-af8f36-gyurinpapas-projects.vercel.app . A first Preview build passed TypeScript and Next compilation; final source/config build status must be checked separately.

## Hosted Preview preparation

1. Inspect latest Production and this branch head. Build a Preview in dashboard/team_ADwPfZGADl8I5pvYHxjtcyYx; verify the exact commit. No production target or aliases.
2. App test project is lpwmxtnzpgyrhphwufsd; payment test project is kbqyszbuxojofugqfjbh. Metadata inspection found the app test project on PostgreSQL 17.11, no report_rows/daily activation function and no prior registration schema. It lacks billing_review_managed; the strictly guarded test preflight adds only that default-false marker. Existing business columns are not changed.
3. Review/run the preflight and registration storage candidate ONLY against the verified app test project, and the additive registration-drafts candidate ONLY against the payment test project, with the explicit session opt-in. The app candidate rejects production daily/report storage. Do not use these files as production migrations.
4. Scope all new Vercel overrides to Preview + feat/unassigned-advertiser-20261014. Keep existing branch settings intact. Required new flags are UNASSIGNED_ADVERTISER_TEST=assignment-start-20261014 and UNASSIGNED_ADVERTISER_TEST_ORIGIN=<stable branch Preview origin>. CUSTOMER_ONBOARDING_ORIGIN and BILLING_REVIEW_ORIGIN must equal it. Existing review/onboarding switches and URL bindings must point to the respective test projects.
5. Secret service keys and the Toss test secret must be entered directly by the user where needed; never retrieve production secrets or put keys into chat. A new state-signing secret can be generated and stored without output. Public anon/client keys may be reused only after checking their test project/prefix.
6. Rebuild with the scoped config; perform browser login, test payment, manager assignment, refund and UI verification before any new production proposal.

## Still required before a live offer

- Real multi-session assignment/refund contention and hosted end-to-end tests.
- A finite assignment waiting/cancellation policy. Do not silently hold payment indefinitely or add an automatic refund schedule.
- Production migration guards/approval and a separately reviewed production feature activation mechanism. This candidate cannot enable the new path on Production.
- Update the Toss reply/PPT to the final service-start policy after the actual corrected flow is captured. Existing edited email text still describes approval-based service dates; do not claim the new version is already live or the final PPT is attached.

## 2026-10-15: automatic account preparation before a new test purchase

- User-reported failure: a confirmed new customer had a trusted onboarding account record but no profile, tenant membership or provisioned_at. Checkout returned REGISTRATION_ACCOUNT_REQUIRED and incorrectly asked the customer to perform a separate company-preparation step.
- The isolated new-advertiser POST now validates the advertiser name, reads identity, and invokes the existing provision_etrylue_customer RPC only when both profile and tenant memberships are absent. It then reads the server identity again before creating the immutable payment draft. Existing/partial identities are not rewritten. Read-only target lookups remain read-only.
- The separate registration transport additionally permits only that exact reviewed provisioning RPC; appReadDb remains GET/HEAD-only. The feature still requires the exact test project, Preview branch and origin configuration. No Production activation or DB function change is included.
- The unchanged provisioning transaction checks the trusted signup account, confirmed email and identity conflicts under a row lock. It creates the customer's isolated internal organization, not a purchased advertiser or an entitlement. The advertiser remains unassigned until a matched server-verified payment, with service starting only at manager assignment.
- SQL function body MD5 remains 70d1bd40ab986d66b33b61734aef1a94. Hosted test execution checked profile/tenant/admin membership and idempotent retry, then explicitly rolled back; the buyer's profile remained absent and provisioned_at remained null afterward. No hosted purchase, provider request, account password change or persisted provisioning was performed by that test.
- Flow suite: 41 passing scenarios, including confirmed signup automatic preparation, no provisioning on target GET/invalid origin/invalid name, no prepayment advertiser/service, no repeated preparation on retry, and failed unverified/missing/conflicting identity without payment orders. The provisioning body in this synthetic HTTP harness is a stand-in; the unchanged real SQL function was independently checked by the hosted rollback test.
- UI suite: 14 passing scenarios. Exceptional account errors now explain that checkout did not start, without asking the customer to prepare a company manually.
- User entered the three branch-scoped private values and previous redeploy dpl_3WRq5Sr2CPMVRVBNaCayH9H1bUZz reached READY at e50b5e3. Values were not retrieved. A subsequent user screenshot confirmed the new name-only form, but payment was blocked before account preparation. This fix still requires a new READY Preview and the buyer's retry; do not claim a successful payment/assignment/refund yet.
