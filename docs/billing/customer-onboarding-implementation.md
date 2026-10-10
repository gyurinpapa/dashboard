# Customer onboarding implementation candidate

Date: 2026-10-10 KST. Branch: feat/customer-onboarding-20261010. Production source baseline: 0be825b7bb8bccded06321b0d99927f15c60704e. This candidate is NOT deployed or installed in production.

## Implemented flow

- `/signup` retains the invite-only page unless CUSTOMER_ONBOARDING_ENABLED is exactly true and a permitted explicit origin is configured. Enabled form reuses PublicSiteShell and existing billing CSS; no packages added.
- Strict signup input permits email, password, contactName, companyName and tenantType only. IDs, role, app_metadata, arbitrary redirect destinations and extra properties are rejected.
- Same-origin POST, 4096-byte streamed body limit, persisted signup rate limits (5/email/hour, 20/platform client IP/hour), generic existing-account response, no credential logging.
- Auth admin creates only unconfirmed new users, with a fixed server-owned app_metadata version. No pre-existing account is overwritten or enrolled. Pending retry only resends confirmation; it does not replace passwords.
- Auth confirmation is sent through the existing SMTP using Supabase resend(signup). This exact admin-create/resend/redirect sequence still needs a real isolated Auth test; the earlier delivered owner magic link did not test new signup.
- `/onboarding` asks the authenticated customer to complete account preparation. Server verifies their token with Auth.getUser and never accepts a supplied user ID. SQL verifies email_confirmed_at independently.
- One transaction creates a company, profile, tenant, owner tenant membership, company workspace and admin workspace membership. The private cohort row is locked for idempotency. No company or workspace exists before verified provisioning succeeds.
- User metadata is not authority. Private cohort and company scope tables are inaccessible to user roles. The RLS helper accepts no arguments and derives its own user identity.
- Restrictive metadata policies apply only to the new cohort. Authority fields in scoped profiles cannot be changed. New customer members cannot become master. The original workspace owner function itself is unchanged.
- Invitations into new customer companies inherit that company's metadata scope. Existing legacy invite profile behavior remains. A server-only invite marker is added after existing invitation validation, before createUser.
- Unmarked new Auth signup is rejected to prevent bypassing the application registration flow. Existing users' logins do not trigger this INSERT check. Manual dashboard user creation must therefore use a supported application registration/invitation path after installation.

## Tests actually run

- 22 in-memory PostgreSQL/PGlite SQL checks: baseline guard, unmarked/forged signup, legacy invitation, pending denial, verified creation, scoped invite, idempotency, company/department/team/role/org-unit isolation, legacy metadata access, profile protection, master denial, RPC/table grants, server authorization, rollback/retry, rate limit, existing-account protection, legacy owner behavior.
- 13 mocked HTTP/contract checks: disabled by default, origin check, forged attributes, input/password validation, streamed body bound, unconfirmed creation, resend retry, existing user unchanged, rate limit, unverified/invalid token denial, server-verified user ID, production origin restrictions. Mock transport denies unknown requests; zero live Auth calls.
- Next.js webpack build passed with synthetic credentials targeting an invalid hostname. TypeScript check passed. No actual production secrets used in these checks.
- React review: server shell; only two small client forms; event-triggered requests; no mount-time account creation, polling, new SDK or global script; input labels, status/error announcements and disabled duplicate-submit controls.
- Report calculation/filter/share/PPT, media-sync/worker files, billing settlement/refund code and dependency files are unchanged.

Not yet verified: real Auth signup/confirmation redirect/session cookies, visual desktop/mobile checks, two browser sessions attempting cross-company report/API access, actual multi-session database concurrency, and public registration abuse controls under production traffic. No claim of complete public-release readiness.

## Isolated environment requirement

The existing billing test project kbqyszbuxojofugqfjbh was inspected read-only. Its public tables include test billing orders/charges and report/tenant/workspace fixtures, but no companies/profiles/departments/teams/roles/org_units. It is not an equivalent application Auth/onboarding test database. Do not run this production-baseline migration there or replace its payment fixtures.

The next gate is an isolated application-schema/Auth environment, seeded with synthetic users and current relevant schema/trigger/grant definitions. Keep real report data and production keys out. Only then run the real signup→email confirmation→provisioning→scope checks in Preview.

## Configuration (server-only flags)

- CUSTOMER_ONBOARDING_ENABLED=true only in the explicitly selected test environment after SQL installation.
- CUSTOMER_ONBOARDING_ORIGIN=the exact test deployment origin. Production value, after separate approval, is https://app.etrylue.com.
- CUSTOMER_ONBOARDING_DATABASE_URL must exactly equal that deployment's NEXT_PUBLIC_SUPABASE_URL. This is an explicit database selection check; do not point a testing deployment at production.
- Existing Supabase public/server keys must belong to the selected isolated project. Do not add or print key values in this document.
- Supabase redirect allowlist must include the chosen origin's `/onboarding` path; email confirmation remains enabled.

## Ordered release and rollback

1. Verify the isolated Auth and two-company UI/API flow. Do not treat synthetic tests as proof of live authentication.
2. Obtain explicit new production release approval. Deploy the invite-marker compatibility commit while public signup stays disabled; this works with the current legacy DB trigger.
3. Recheck production function/schema/grants and apply the reviewed customer SQL migration. It guards the old profile function body hash and requires the approved snapshot ACL restriction. Never apply before step 2, or invitation creation will be rejected.
4. Deploy the complete reviewed code and enable server flags only after migration verification. Run a bounded user-authorized acceptance check. No live payment or report gating is enabled by this candidate.
5. If public signup must be paused, disable CUSTOMER_ONBOARDING_ENABLED. Keep the DB boundaries and compatible invite-marker code. Do not roll back to code lacking that marker while the new Auth trigger is installed; do not delete customer accounts/company graphs as a rollback.

Billing '+ 신규 광고주' draft targets and expansion of payment-review eligibility remain a separate follow-up; this candidate does not enable checkout for every newly registered user or grant paid report rights.
