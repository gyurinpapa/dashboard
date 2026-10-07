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

## Preview and target fixtures — 2026-10-07
- Separate Vercel project: etrylue-billing-test, prj_1zmM5OX1wv0keFRTtaUFjKEmf61E.
- Preview dpl_2PgrEGCxaKAx1FSXgSWt7aniGUSr is READY, remote branch feat/billing-once-20261007 at f59273a0198176550b68c3252a54b44bb5a0d734. Its tree matches local b078dcd.
- Earlier dpl_4uCqz72GNGSWzeS5LU8G67UfVZdG targeted Production and was blocked by the build guard. No successful production payment deployment.
- Preview-only Supabase variable names registered; secret values were not read. BILLING_TEST_ENABLED remains disabled. Browser homepage → pricing → once checkout rendered the shared chrome and preparation notice.
- Installed isolated_billing_synthetic_target_fixtures on kbqyszbuxojofugqfjbh only, from sql/billing/test-target-fixtures.sql. The schema was first exercised in a rollback transaction with count and access assertions.
- Two synthetic companies/workspaces/advertisers each; memberships empty, Auth users zero, orders and charges zero. RLS enabled; anon/authenticated access revoked; server SELECT only for the five fixture tables.
- Security advisor reports only seven informational RLS-without-policy findings, expected for server-only tables. No browser table policies were added.
- Next: user enters general MID etryluei6e test client/secret keys directly into this Vercel project's Preview secrets. Create a separate Auth test account through the dashboard, then explicitly bind its UUID to fixture A and the server allowlist. Fixture B stays unassigned for isolation checks.
- Exact callback origin, state/webhook secrets, authenticated checkout/confirmation/refund tests are still pending. Billing keys/monthly contract remain deferred until general screening approval. No live keys, customer copies, production DB writes, scheduler changes or new dependencies.

## Test account configured — 2026-10-07 21:53 KST
- User entered TOSS_TEST_CLIENT_KEY and TOSS_TEST_SECRET_KEY; verified both names are Preview Secrets, without revealing or validating values.
- One user-created Auth account is email-confirmed and password-configured. Bound only that account to company A owner and workspace A admin; verified one matching membership each and zero workspace B memberships, orders zero.
- Saved Preview Config variables BILLING_TEST_USER_IDS (single verified account) and BILLING_TEST_ORIGIN=https://etrylue-billing-test-git-feat-billi-4960f4-gyurinpapas-projects.vercel.app. Branch alias renders the expected homepage.
- Still pending: user enters independently generated BILLING_TEST_STATE_SECRET and BILLING_TEST_WEBHOOK_TOKEN, then enable test flag, redeploy Preview, and verify authenticated targets and Toss test flow. No test order or payment has been attempted. Production unchanged.

## Enabled Preview — 2026-10-07 22:04 KST
- Verified user-added STATE_SECRET and WEBHOOK_TOKEN are Preview Secrets; values not revealed. Webhook provider registration is not yet done.
- Set BILLING_TEST_ENABLED=true in Preview only. Deployed unchanged remote f59273a as dpl_HjjKDqY1XnSyVMfNHQyoMXQS6kA6, READY in 42s; source branch feat/billing-once-20261007.
- Stable branch alias now renders once checkout test notice and test form. Its server-side testConfig/providerKeys checks pass; this does not establish Toss credential validity or correct MID.
- Logged-out request shows test login link, no selectable targets, and disabled checkout button. No real credentials read; authenticated target lookup and payment flow still need the user's test login.
- Last counts: orders 0, charges 0, company and workspace memberships 1 each. No production changes.

## First general test payment verified — 2026-10-07 22:20 KST
- User completed KakaoPay QR authentication from the once/advertiser checkout. Toss screen explicitly showed test mode.
- Order 52b5c647-9f11-456b-8930-98a102cd6bf0: amount KRW 39000, order active, charge done, approved_at 2026-10-07T13:17:19Z, paid_until 2026-11-07T13:17:19Z. Payment-key presence checked without revealing its value.
- Read-only database count: total orders 1, total charges 1, completed charges for this order 1. No duplicate record in this observed flow; repeated-callback/concurrency behavior is not newly proven by this count.
- User PC screenshot shows test payment confirmed, KRW 39000 VAT included, verified status, and period end 2026-11-07 22:17:19 KST; these match server state. Shared header remains visible.
- Next priority: test full cancellation and verify provider reconciliation moves both charge/order to refunded. Webhook registration/delivery, duplicate callback/reconciliation trials, broader ACL checks and monthly flow remain unverified. No production entitlement or live payment enabled.

## Full cancellation and result copy — 2026-10-07 22:22 KST
- User exercised full test cancellation. Read-only DB confirms order and charge refunded; paid_until=2026-10-07T13:20:49.152043Z. PC screenshot shows refund state and matching KST end time.
- User requested a more specific message instead of the red generic success notice. Local result UI now derives action-specific status text from the existing server order state; confirmed messages use mint, unresolved/errors keep warning color. No new requests, dependencies, payment/permission mutations, or report changes.
- Scoped ESLint and TypeScript noEmit pass. This copy change is committed locally only; Preview deployment and visual verification remain pending.
