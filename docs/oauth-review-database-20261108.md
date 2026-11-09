# OAuth review database baseline

Target Supabase project: `nzudapumgzscfklgvsxw` (`etrylue-oauth-review`).
This file must never be applied to the production project.

The SQL snapshot in `scripts/sql/oauth-review-schema-only-baseline.sql` was generated from schema metadata on 2026-11-08 for the application at commit `2fd4a1ce7e22da4ae1ec06d83836337e6d8d8889`.

It creates 49 empty tables, 88 application functions, constraints, indexes, policies and application triggers. It contains no production rows, auth users, OAuth credentials, cron schedules, storage objects or worker deployments. An empty-database guard rejects applying it over existing application tables.

Existing table and function grants are preserved explicitly. RLS is enabled on every application table. Tables that previously exposed SELECT through anon/authenticated retain that read visibility through explicit SELECT policies. Previously server-only tables remain server-only. Functions with no fixed search path are pinned to public and pg_catalog. No security-definer function grants access to PUBLIC or anon.

## Applied state on 2026-11-08

- Vercel review environment: SUPABASE_SERVICE_ROLE_KEY saved as Secret for Production; public URL and publishable key also configured.
- Applied: oauth_review_empty_tables_locked (49 tables), oauth_review_functions_01 (11 functions), and owner-trigger search-path pinning.
- Verified: all 49 tables are empty and RLS-enabled; all 11 installed functions deny anonymous execution.
- Not applied: remaining functions, constraints, indexes, policies, application triggers and grants. The connector's additional confirmation repeatedly returned status expired, including when retried after notifying the user. This is not a database SQL error and no completion is claimed.
- Do not reapply the empty-database baseline to this partial state. After reviewing and approving, use scripts/sql/oauth-review-complete-baseline.sql to finish the schema in one transaction. It contains CREATE OR REPLACE FUNCTION definitions and does not invoke those functions.
- No review app deployment has occurred; automatic builds remain disabled.

## Remaining deployment work

- Database schema completed manually and independently verified on 2026-11-09; see the completion checkpoint below.
- Create a reviewer-controlled test login through the app's normal onboarding flow.
- Configure Auth site URL and redirect allowlist for https://oauth-review.etrylue.com.
- Set an independent MEDIA_CREDENTIAL_ENCRYPTION_KEY in the review Vercel project.
- Confirm current Google Ads API authentication requirements and adapt only the review branch if needed.
- Deploy the review branch after all required configuration is present.
- Demonstrate the real English Google OAuth grant flow and functionality using Google Ads test account 381-339-6758 under test manager 930-429-2762.

Production configuration is outside this baseline's scope.

## Resume checkpoint (2026-11-09, Asia/Seoul)

- Reopened the actual blank browser tab at the review Vercel project; overview rendered and still showed No Production Deployment.
- Confirmed Supabase is ACTIVE_HEALTHY and the locked tables still exist.
- Added 8 function definitions through three smaller migrations: oauth_review_functions_02a_locked, oauth_review_functions_remaining_01_locked, oauth_review_functions_remaining_02_locked.
- Verified 19 application functions now exist and 0 are executable by anon. All function execution grants remain locked pending final schema completion.
- The next batch, oauth_review_functions_remaining_03_locked, returned status expired / INVALID_ARGUMENT from the connector confirmation. It did not succeed. No retry was issued.
- 69 function definitions plus constraints, indexes, policies, triggers and final grants remain. The complete-baseline SQL remains suitable because it replaces definitions without invoking them; do not use the empty-database bootstrap on this partially applied database.
- No app source changes, credential changes, production changes, or deployments were made during this resume.

## Manual completion verified (2026-11-09, Asia/Seoul)

This checkpoint supersedes the partial-schema state above.

- The user executed the guarded one-time completion script in the Supabase SQL Editor for review project nzudapumgzscfklgvsxw. The screenshot shows a successful result row.
- Independent read-only catalog checks confirmed 49 tables, 88 application functions, 202 constraints, 31 policies, and 22 application triggers.
- All 49 application tables have RLS enabled. No application SECURITY DEFINER function is executable by anon. There are 0 Auth users.
- Security advisors returned only informational rls_enabled_no_policy notices for 33 tables, and no warnings or errors. Server-only tables intentionally have no client policies.
- This manual SQL execution did not add a Supabase migration-history row. Do not replay either the empty-database bootstrap or the one-time completion script against the completed schema.
- The manual script SHA-256 is e6908f424d4642e5c705551b4cf4efab7d35fd0d905cb3d23586d8925d1df47e. It includes preflight checks, a single transaction, final catalog checks, and the OAUTH_REVIEW_DB_READY result.
- App source confirms signup emailRedirectTo is the request origin followed by /onboarding. Configure the review Auth Site URL and this exact redirect before testing signup.
- App source requires MEDIA_CREDENTIAL_ENCRYPTION_KEY to be canonical base64 encoding of exactly 32 bytes. A fresh independent review-only key is still required.
- Auth configuration and the review deployment are not yet verified complete. No production configuration was changed.
