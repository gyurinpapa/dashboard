# Isolated billing test preparation — 2026-10-06

Base: production f1d6f980186ef14f1529d5ad24356aaaa09076c3.
Local branch: feat/billing-isolated-20261006.

This branch ports the existing test candidate onto the public pricing release. Shared homepage chrome and pricing remain intact. Checkout only exposes the test form when isolated configuration and the selected test merchant keys validate. Production environment, production database reference, Etrylue public domains and live key prefixes are rejected.

## Verified
- Fresh production deployment dpl_Gad9jkmb1LHhrk5JFAxhoxQmBuwJ was READY at the base SHA.
- Only production Supabase project was listed; no database branches were listed.
- Existing dashboard Preview shares production Supabase environment entries. Do not use its inherited configuration for payment testing.
- No Toss or billing variables were registered in inspected Vercel metadata; secret values were not decrypted.
- Seven Node tests and thirteen synthetic SQL checks passed (PGlite PostgreSQL 18.3).
- Next.js production build passed with synthetic Supabase placeholders.
- Existing report, scheduler, sharing, PPT and membership source files are unchanged. Actual full UI regression has not been rerun.

## Pending, not completed
- User chooses the Supabase organization; tool requires organization selection and cost confirmation before project creation.
- Create a separate test Supabase project and separate Vercel project. Use a Preview deployment; the code intentionally rejects VERCEL_ENV=production even in a separate project.
- Provision synthetic auth and target memberships only. Do not clone production customer data, credentials, workers or schedules.
- Apply test-only SQL exclusively to the isolated database after schema review.
- Enter Toss test API credentials through secure environment configuration, separately for once and monthly modes. Never put keys in chat or git.
- Configure allowlisted test users, exact callback origin, state/encryption/webhook secrets.
- Verify browser checkout, server confirmation, retry/webhook idempotency, refund and recurring authorization against Toss test APIs.

No new cloud project, SQL installation, provider transaction, production deployment or production environment change has occurred for this preparation. Monthly renewal is a manual test path; an automatic production scheduler and live entitlement enforcement are not implemented. Prices remain proposals.

## Cloud test database installed — 2026-10-06
User approved displayed additional USD 10/month MICRO cost and created the project through secure browser handoff.
Project: etrylue-billing-test (kbqyszbuxojofugqfjbh), Tokyo, ACTIVE_HEALTHY, PostgreSQL 17.11.
Preflight: public tables empty, auth users zero. Production is a separate project; no production SQL writes.
Applied migrations: isolated_billing_test_schema; restrict_auto_rls_event_trigger_execution.
Verified two billing tables have RLS, no anon/authenticated SELECT, service_role access; all four billing functions deny anon/authenticated EXECUTE and allow service_role.
Supabase-generated public.rls_auto_enable had broad EXECUTE; revoked PUBLIC/anon/authenticated execution on this test project only.
Still pending: synthetic membership fixtures and test user, separate Vercel deployment/env, Toss test keys and actual checkout verification. Earlier pending-install statements above are superseded only for these installed billing objects.
