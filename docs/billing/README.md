# Etrylue billing — isolated test candidate, not production ready

Baseline: web Production `4c01771c356d44e8cb31b4c7b740e6fab34781c3`, rechecked 2026-10-06.
Branch: `feat/billing-test-20261006`. This work does not authorize live payments or production deployment.

## Implemented boundary

- `/pricing`: three review plans, one-month single payment vs monthly recurring; VAT-inclusive draft catalog in `src/lib/billing/catalog.ts`.
- `/billing/checkout`: authorized target selection, test consent, SDK loaded only after an explicit payment click and server-created order.
- Server quotes only; no client-provided amount/owner accepted. Allowlisted test users only.
- `POST /api/billing/checkout`, API-only callback, server-backed result page, management actions, verified payment webhook.
- Test one-off approval and billing-key issuance/first charge adapters; AES-256-GCM encrypted billing keys, per-order AAD.
- Atomic order/charge settlement, overlapping scope purchase guard, unique charge per renewal cycle, stable provider idempotency keys, read-only reconciliation after ambiguous errors.
- Cancel-next-renewal, test full refund, conservative partial-refund review state. Stale success does not restore refunded access.
- KST calendar-month periods, anchored month-end clamping. Manual due-renewal test endpoint only; **no automatic schedule registered**.
- Separate billing records are not read by existing report/access paths. This candidate DOES NOT impose a paywall, change legacy access, enforce ongoing advertiser caps, or modify report data.
- No purchase analytics event yet. Existing GTM/layout untouched. Provider auth/payment keys land only at an API endpoint that redirects to a clean order URL with `no-referrer`; no HTML/analytics on the callback.

Only existing source edit: one feature-gated pricing navigation link in `app/page.tsx`. All other changes are new billing files/tests/docs. No dependency or lockfile changes.

## Guards and test setup

UI review requires no credentials and never calls the payment provider. `BILLING_UI_PREVIEW=true` shows the home pricing link on non-production builds. `/pricing` can be viewed directly.

Payment APIs default to HTTP 503, including before auth/database access. They require ALL of:

| Variable | Purpose |
|---|---|
| `BILLING_TEST_ENABLED=true` | Explicit opt-in; forbidden when `VERCEL_ENV=production` |
| `BILLING_TEST_PROJECT_REF` | Isolated Supabase project, 20 lowercase letters; production reference is hard-blocked |
| `NEXT_PUBLIC_SUPABASE_URL` | Must exactly match the isolated project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Isolated project's public auth key |
| `SUPABASE_SERVICE_ROLE_KEY` | Isolated project's server key |
| `BILLING_TEST_ORIGIN` | Exact preview HTTPS origin or `http://localhost:3000`; all etrylue.com hosts blocked |
| `BILLING_TEST_USER_IDS` | Comma-separated test account UUIDs |
| `TOSS_TEST_CLIENT_KEY`, `TOSS_TEST_SECRET_KEY` | General-payment API individual test keys (`test_ck_`, `test_sk_`) |
| `TOSS_BILLING_TEST_CLIENT_KEY`, `TOSS_BILLING_TEST_SECRET_KEY` | Separate billing merchant test keys |
| `BILLING_TEST_STATE_SECRET` | Independent random secret, minimum 32 characters |
| `BILLING_TEST_ENCRYPTION_KEY` | Independent 32-byte random key, 64 hex characters; retain securely for decryption |
| `BILLING_TEST_WEBHOOK_TOKEN` | Independent random secret, minimum 32 characters |

Never paste secret values into chat, logs or source. Never copy production environment files. Isolated test auth/schema fixtures must provide existing `workspaces`, `workspace_members`, `advertisers`, `tenants`, `tenant_members` tables using synthetic data. Test purchase authority is intentionally narrow: workspace admin/director or company owner; true-master expansion and production billing-role policy are not yet enabled.

`sql/billing/test-only.sql` is NOT an automatic migration. It requires `SET etrylue.billing_test_install='isolated-tests-only'` and refuses a database containing reports. Apply only to an isolated test project after confirming its identity. There are no changes to the production daily activation function or existing migration history.

Test webhook: configure `PAYMENT_STATUS_CHANGED` on the appropriate TEST merchant to the private URL `/api/billing/webhook?token=<server-secret>`. General payment webhooks do not have the payout HMAC signature; this handler treats the event as a hint and independently retrieves the provider payment. Protect/redact the URL in access logs. Unknown non-billing orders are ignored. Unsupported event types, including billing-key deletion, are not yet handled.

The recurring `renew` action on `/api/billing/manage` is an authenticated, same-origin manual test runner. It never schedules itself, never catches up old months automatically, and blocks renewal after cancellation. Failure does not extend paid-through. A pending/ambiguous charge blocks a new overlapping purchase and cancellation until reconciliation/manual review; this is intentionally conservative and requires operational recovery before live use.

## Validation

```sh
node --import tsx --test scripts/verify-billing-test.ts
npx eslint src/lib/billing app/pricing app/billing app/api/billing scripts/verify-billing-test.ts
npx tsc --noEmit
```

SQL tests use a separately installed `@electric-sql/pglite`, not an app dependency:

```sh
PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-billing-sql.mjs
```

2026-10-06 results: 7 application tests passed; 13 SQL checks passed on PostgreSQL 18.3 / PGlite 0.5.8. Build passed with synthetic placeholder Supabase config and billing disabled. No test used production data, Google Ads, Naver, real payment credentials or real charges.

SQL evidence covers opt-in installation, rejection with existing report rows, anon permissions/RLS, duplicate creation, parent/child overlap, amount mismatch, duplicate settlement, reversed success/refund delivery, partial refunds, due-date/cancellation guards, renewal reservation, and old-period protection. PGlite is single-session; this is NOT a real PostgreSQL 17.6 multi-session concurrency result.

## Remaining before live operation

1. Isolated Supabase/auth fixtures and Toss TEST keys; complete actual browser → Toss → callback → DB → webhook/refund round trips on desktop and iPhone. Verify key contract/product compatibility and idempotency retention experimentally.
2. Final prices/caps, paid feature scope, billing roles, target transfer/deletion behavior, refund policy, recurring consent/terms, existing customer preservation, scope upgrades, and merchant review requirements. Current figures are marked review-only in UI.
3. A separate durable recurring scheduler, persistent failure classification/backoff/recovery, billing-key deletion handling, operator reconciliation, notifications, rate limiting and retention. Existing Naver worker/cron must remain untouched. No broad automated retries until policy is approved.
4. Recheck DB/RLS on PostgreSQL 17.6 with multi-session tests. Add entitlement checks only at specifically approved product boundaries after legacy/access/share/PPT regression validation.
5. Production-specific schema/credentials/rollout design and explicit new deployment approval. Hard production guards in this candidate must not be bypassed by simply changing environment variables. Do not promote this preview as live billing.

## Official integration references reviewed

- https://docs.tosspayments.com/guides/v2/payment-window/integration
- https://docs.tosspayments.com/guides/v2/billing/integration
- https://docs.tosspayments.com/guides/v2/webhook
- https://docs.tosspayments.com/reference/using-api/webhook-events

This adapter uses the API individual-key v2 `payment()` interface. The documentation labels the general integrated payment window as the older product; verify the selected merchant product before final integration. No application or paid provider contract was submitted by the agent.
