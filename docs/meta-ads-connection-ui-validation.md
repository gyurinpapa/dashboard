# Meta connection registration and status UI

Implementation parent: `09b2cf59b60eb172b32a386c4efc26e753a241f7` on `meta-ads-api`.

## Behavior

- The account card uses the existing authorized connections GET response. An empty, successfully loaded Meta list shows `○ 미연결`; loading and errors are distinct.
- Managers can register an account ID and opaque access token through the new Meta-only POST endpoint. Staff with read-only access cannot register.
- Registration reuses the existing server access resolver and AES-256-GCM credential codec. Workspace, advertiser and creator authority come from the resolver. `expectedWorkspaceId` is a stale-scope assertion, never an ownership source.
- Tokens bind to connection/workspace/advertiser/provider/account through existing AAD. The endpoint returns safe connection fields only, with `Cache-Control: no-store`; raw database errors are not logged or returned.
- Registered records have encrypted credentials, `status=active`, and **null** `connected_at`, `last_verified_at` and `last_sync_at`. Here `active` means registered, not verified. The card displays `인증 확인 필요` until verification exists.
- Registration performs no Meta request, account preflight, OAuth flow, metric-policy inference, job creation or sync. Existing Meta sync capability remains **false** and API report selection still excludes Meta.
- The endpoint inserts only. Existing credentials are never replaced by registration. Existing database unique constraints reject duplicates, including cross-advertiser ownership conflicts, with a generic 409 response.
- The token input is a password field, is cleared on submission, is absent from React state/browser storage, and is discarded when closing or changing scope. Scope changes unmount the card and abort its outstanding request; they cannot roll back an already completed server insert.

## Changed files

| File | Purpose |
| --- | --- |
| `app/report-builder/ReportBuilderClient.tsx` | Replace only the Meta connection card; separately label Meta report sync as unavailable. |
| `app/report-builder/MetaAdsConnectionCard.tsx` | Status, manager registration form, refresh, safe errors and scoped request lifetime. |
| `app/api/advertisers/[id]/media-connections/meta-ads/route.ts` | Wire the existing access resolver and an explicit safe insert projection. |
| `src/lib/media-sync/meta-ads-connection-registration.ts` | Strict request/scope validation, encryption, insert-only registration and safe DTO. |
| `src/lib/media-sync/meta-ads-connection-route.ts` | Testable HTTP handler, same-origin checks, bounded JSON input and redacted failures. |
| `src/lib/media-sync/meta-ads-connection-view.ts` | Client-safe connection status/error messages, independent of sync readiness. |
| `scripts/verify-meta-ads-connection-registration.tsx` | Network-blocked request, permission, encryption, mock persistence and rendered-card tests. |
| This document | Verification results and limits. |

The shared report-builder file is the only existing file modified. Naver/Google forms, shared GET/POST routes, CSV processing, worker gates, SQL, dependencies and deployment configuration are unchanged.

## Verification

- New registration/status contract: **84 cases PASS**, network attempts 0, DB executions 0, synthetic token/key only.
- Existing Meta credential contract: **84 cases PASS**, including Naver/Google codec compatibility.
- Existing connections GET policy **11/11**, Naver POST policy **20/20**, access policy **20/20** PASS.
- `tsc --noEmit --incremental false`: PASS.
- ESLint on all new TS/TSX files: PASS.
- Next.js production build in a separate source copy: PASS, synthetic environment and external network guard. No prebuilt synthetic output is deployed.
- `git diff --check`: PASS.
- Browser interaction verification: **NOT COMPLETED**. The browser rejected the isolated local fixture URL with `net::ERR_BLOCKED_BY_CLIENT`. The 84-case suite includes server-rendered card output; it does not prove clicks, token-input clearing or scope-change behavior in a live browser.

No real token was stored; no external database or Meta API was called. Authorization tests use the existing permission policy and mocked access resolver, not live Supabase Auth/JWT. Database insert, triggers and unique constraints were not exercised against PostgreSQL in this phase. The captured baseline metadata allows Meta, nullable verification timestamps and the existing account uniqueness indexes; this is static compatibility evidence only.

## Release boundary

This implementation can register credentials when deployed and explicitly submitted by an authorized manager. It does not verify them. A Preview update is separate from enabling production or sync. Production `main` must remain at its existing commit until separately approved.

Next verification: open the Preview `/report-builder` directly, confirm an empty Meta account card reads `미연결`, and inspect the form without entering a real token. The homepage's existing absolute report-builder link leads to Production.
