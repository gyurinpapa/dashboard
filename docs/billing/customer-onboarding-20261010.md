# Public onboarding prerequisite review — 2026-10-10 KST

## Approved production application — 12:28 KST

User explicitly approved the narrowly scoped ACL change. Immediately before application, both function hashes, ownership, SECURITY DEFINER attributes and effective privileges matched the reviewed baseline. Applied the exact reviewed SQL through Supabase apply_migration to production rulcvpgvmmckacshkmfy.

- Migration: 20261010032809 / restrict_daily_snapshot_prepare_execute; success confirmed and migration history read back.
- Preparation after: anon=false, authenticated=false, service_role=true; ACL `{postgres=X/postgres,service_role=X/postgres}`.
- Preparation body MD5 remains 11fd8088ddb063dfa46be60b11a06a3c.
- Activation remains anon=false, authenticated=false, service_role=true; body MD5 remains 17df92c196f28727c6602ab920a48940.
- Both functions retain postgres ownership and SECURITY DEFINER.
- Neither function was invoked. No report-row DML, scheduler setting change, Vercel/Railway deployment or Google Ads call was performed.
- This confirms the privilege change and unchanged function definitions, not a newly observed natural scheduler run.

The review-stage statements below describe the state before this approved application. Public signup remains unimplemented/disabled at the application endpoint. Next: resume isolated verified-email customer provisioning and company/workspace isolation implementation.

## Confirmed baseline

- Production alias lookup: www.etrylue.com, deployment dpl_GM5uRabp2hf4tuJf6wK8uocoaowT, READY, SHA 0be825b7bb8bccded06321b0d99927f15c60704e.
- New isolated worktree/branch: etrylue-customer-onboarding-v2 / feat/customer-onboarding-20261010, created directly from that production SHA. Main untouched.
- Production Supabase report-system: rulcvpgvmmckacshkmfy. Custom SMTP enabled after a fresh dashboard reload. Resend smtp.resend.com:465. One existing-owner magic-link send succeeded; user screenshot confirmed delivery to Gmail inbox from Etrylue Performance <noreply@auth.etrylue.com>. Link redemption and public signup are untested.
- Public signup route still returns 410; no signup application code changed.
- Existing profile creation assigns company 000. Workspace owner trigger assigns master. Neither is suitable for unqualified public onboarding.
- Reports, advertisers, workspaces, workspace_members, tenant_members: RLS enabled; authenticated direct table SELECT/INSERT/UPDATE privileges absent. Tenants: RLS enabled with no policies in the inspected result, so table grants alone do not establish access.

## Blocking execution privilege found (read-only inspection)

`public.prepare_daily_report_v2_combined_snapshot(jsonb)`:

- SECURITY DEFINER, owner postgres.
- Effective EXECUTE: anon=true, authenticated=true, service_role=true.
- ACL: postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres.
- Body MD5: 11fd8088ddb063dfa46be60b11a06a3c.
- Body validates supplied report/workspace/advertiser/creator IDs, dates, stored report contract and source coverage; it does not bind the caller's auth.uid() to workspace membership. Supplied IDs are not authorization.
- It can create preparation/ingestion records when its business preconditions pass. No live invocation or exploit attempt was made. No data leak or misuse is claimed.

Activation function remains protected: anon=false, authenticated=false, service_role=true; owner postgres; body MD5 17df92c196f28727c6602ab920a48940. The previously approved automatic published-snapshot behavior is preserved.

Current production-source preparation repository uses getSupabaseAdmin(), which constructs its client with SUPABASE_SERVICE_ROLE_KEY. The original installation SQL revokes PUBLIC but does not explicitly revoke existing anon/authenticated grants. That omission can retain individual grants; the historical cause of the current ACL is not established. Railway's live deployed revision was not independently inspected in this pass.

## Concrete minimal candidate

`scripts/sql/restrict-daily-snapshot-prepare-execute.sql`:

- Checks both existing function body hashes, owners and SECURITY DEFINER flags before mutation.
- Requires existing service_role execution on both functions and existing protection of activation.
- Revokes preparation EXECUTE only from PUBLIC, anon and authenticated.
- Does not replace/create/call either function, alter source rows, modify grants to service_role, or change scheduler settings.
- Effective-privilege checks run before commit; inherited permissions cause rollback.
- Transaction-local lock timeout 2 seconds, statement timeout 8 seconds.

## Isolated verification

PGlite 0.3.14 installed only in a temporary test-tool directory, with no application dependencies or lockfile changes. Synthetic functions and rows only; no network/database/API calls from tests.

10 checks passed: baseline mismatch; absent server grant; activation exposure; no invocation by ACL script; anon denial; authenticated denial; server execution retained; function body/owner and activation ACL preservation; idempotency; inherited-grant rollback.

Run:

```sh
PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-onboarding-snapshot-acl.mjs
```

These are ACL regression tests, not complete signup/isolation or live scheduler tests.

## Release boundary and next action

No production database mutation, deployment, live payment, report restriction, new account, public signup enablement, Railway change or Google Ads operation in this implementation pass.

Obtain explicit approval for this specific production EXECUTE-permission change before applying it. Recheck the guarded baseline and record effective permissions/body hashes after application. Do not force a daily run as a test. Then resume the isolated onboarding implementation: server-owned cohort, verified-email provisioning, atomic own company/tenant/workspace, scoped metadata restrictions and immutable profile authority. The public signup UI and new-advertiser checkout are not implemented by this candidate.
