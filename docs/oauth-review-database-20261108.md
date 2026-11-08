# OAuth review database baseline

Target Supabase project: `nzudapumgzscfklgvsxw` (`etrylue-oauth-review`).
This file must never be applied to the production project.

The SQL snapshot in `scripts/sql/oauth-review-schema-only-baseline.sql` was generated from schema metadata on 2026-11-08 for the application at commit `2fd4a1ce7e22da4ae1ec06d83836337e6d8d8889`.

It creates 49 empty tables, 88 application functions, constraints, indexes, policies and application triggers. It contains no production rows, auth users, OAuth credentials, cron schedules, storage objects or worker deployments. An empty-database guard rejects applying it over existing application tables.

Existing table and function grants are preserved explicitly. RLS is enabled on every application table. Tables that previously exposed SELECT through anon/authenticated retain that read visibility through explicit SELECT policies. Previously server-only tables remain server-only. Functions with no fixed search path are pinned to public and pg_catalog. No security-definer function grants access to PUBLIC or anon.

## Remaining deployment work

- Apply and verify the migration on the isolated database.
- Create a reviewer-controlled test login through the app's normal onboarding flow.
- Configure Auth site URL and redirect allowlist for https://oauth-review.etrylue.com.
- Set an independent MEDIA_CREDENTIAL_ENCRYPTION_KEY in the review Vercel project.
- Confirm current Google Ads API authentication requirements and adapt only the review branch if needed.
- Deploy the review branch after all required configuration is present.
- Demonstrate the real English Google OAuth grant flow and functionality using Google Ads test account 381-339-6758 under test manager 930-429-2762.

Production configuration is outside this baseline's scope.
