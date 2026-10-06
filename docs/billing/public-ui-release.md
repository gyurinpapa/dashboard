# Public pricing UI release — 2026-10-06

Authorized by the user's request to connect the existing site and deploy before payment tests.

Base: Production 4c01771c356d44e8cb31b4c7b740e6fab34781c3, rechecked before implementation.
Release branch: feat/pricing-public-20261006 (separate worktree; main untouched).

Scope: homepage header/footer pricing links, shared original homepage chrome/background/logo/contact CTA, public pricing and plan-details pages. Prices and caps are explicitly marked as planned, with payment unavailable.

No checkout SDK, payment APIs, billing database migration, cron or worker is part of this release. The separate feat/billing-test-20261006 branch retains the unconnected test candidate. Before resuming test work, base on the new Production SHA and port only the test-specific changes; do not overwrite the public navigation and release notices.

Existing report APIs/calculations/filters/access controls/sharing/PPT, middleware, Vercel configuration, Naver scheduler, Google Ads authentication and package dependencies are unchanged. The operational daily shared-snapshot database policy is untouched.

Rollback target: dpl_28hr71wz5nzESzZ97TbKF56zco7c. No data migration accompanies rollout or rollback.
