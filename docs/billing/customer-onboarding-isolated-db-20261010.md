# Isolated onboarding database — 2026-10-10

Target: etrylue-onboarding-test / lpwmxtnzpgyrhphwufsd / Tokyo / PostgreSQL 17.11. User approved Micro costs and created project manually. Production rulcvpgvmmckacshkmfy and billing test kbqyszbuxojofugqfjbh were not modified in this step.

## Applied

- onboarding_isolated_application_baseline: 18 public tables, actual relevant production columns, constraints, indexes, policies, grants, and 10 trigger/helper definitions. Definitions only; no production customer rows, credentials or media connections.
- customer_onboarding_isolated_candidate: exact scripts/sql/customer-onboarding.sql, no relaxed profile hash guard.
- onboarding_test_restore_exact_function_acl: corrected the baseline generator's PUBLIC ACL substring matching mistake for five functions. Revoked PUBLIC/anon/authenticated execution to match production. Corrected baseline file too. No production ACL changes. Set the test-only daily sentinel search_path.

Fixture source: scripts/fixtures/customer-schema-baseline-20261010.json, catalog read-only on production. scripts/sql/customer-onboarding-test-baseline.sql is ISOLATED TEST ONLY, not a production migration.

Differences by design: report_ingestions retains its original table definition but no anon/authenticated grants in this test environment. Only synthetic legacy company name 000 is seeded, using a generated ID. The daily prepare function is a raising, service-only TEST SENTINEL for the onboarding migration's ACL prerequisite. Actual snapshot functions, scheduler, cron, workers, external connections, report rows and live credentials are absent. This is a scoped application-schema fixture, not a complete production clone.

## Verified

- Local PGlite: full extracted baseline plus unmodified onboarding migration installs; actual production triggers create a single admin workspace; repeated provision returns identical IDs; authenticated own-company read returns one row.
- Hosted PostgreSQL: synthetic Auth inserts (not real Auth API), unconfirmed provisioning denied; simulated confirmation permits independent company/tenant/workspace creation for two users; admin/owner memberships and idempotency correct; own company only readable; direct workspace_members read denied as in production grants. All test writes rolled back.
- Initial hosted test incorrectly expected direct membership reads to be allowed; observed production grant denies them. Test corrected to require denial, without granting extra access. Server-route membership authorization still needs Preview end-to-end verification.
- Persistent post-test state checked: Auth users 0, workspaces 0, reports 0, pending customer accounts 0, companies 1 (synthetic 000).
- Both onboarding public RPCs deny anon/authenticated and allow service_role.
- Security Advisor rerun after ACL correction: no SECURITY DEFINER executable warnings remain. Five inherited mutable search_path warnings remain on existing non-definer helper/trigger definitions; retained to keep the production fixture faithful. Ten no-policy RLS INFO notices reflect server-only/deny-by-default tables, not a reason to grant public access.

Advisory references:
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Next gate

Branch-scoped Vercel Preview configured with THIS test project's credentials, signup flags and exact redirect origin; test-only SMTP configuration; actual new signup confirmation email, session restoration, two-company UI/API authorization. No real signup email, Auth API flow, Preview deployment, production release or paid-report gating was performed in this step. Do not reuse production Supabase keys or change existing billing test fixtures. No claim of full UI/PPT regression or production signup readiness.

