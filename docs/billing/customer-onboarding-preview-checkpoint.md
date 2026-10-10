# Preview setup checkpoint — 2026-10-10

## Payment Preview follow-up (supersedes earlier pending verification)

- User confirmed email delivery, session and own-company access. Actual HTTP checks rejected all-workspace listing, another company's media connections and advertiser PATCH (403).
- Onboarding test media_connections was absent. Applied onboarding_test_media_connections_readonly only to lpwmxtnzpgyrhphwufsd; empty table, RLS enabled, service_role SELECT only. User confirmed the connection cards display disconnected without the error.
- Test Auth provisioning required customer_onboarding_auth_metadata_order: deferred profile creation rereads final auth.users metadata. Already applied to test DB; any future production candidate must carry this correction. Production rollout remains unauthorized.
- Payment target reads now accept the exact onboarding test DB only with Preview, enabled onboarding and matching fixed origins. Production database path and existing read-only table/method boundary are retained.
- Boundary tests pass: seven unsafe configurations rejected; original production selection unchanged; writes/RPC/report reads blocked before network. TypeScript checked separately before deployment.
- User saved three payment credentials; their metadata is scoped to Preview + feat/customer-onboarding-20261010. Secret values were not printed. Credential validity and a new end-to-end payment for this onboarding account remain unverified until runtime testing.
- Payment records continue to use kbqyszbuxojofugqfjbh. No production deployment, report entitlement enforcement, scheduler change or live charge is included.

Production freshly verified unchanged: 0be825b7bb8bccded06321b0d99927f15c60704e / dpl_GM5uRabp2hf4tuJf6wK8uocoaowT READY.

Local candidate HEAD 1e8dd78 includes branch-only git.deploymentEnabled=false until configuration is complete. Terminal Git push lacked credentials; authorized GitHub connector uploaded all changed files atomically. Remote branch feat/customer-onboarding-20261010 at cfad050c4932d6937b1959457ba6e641ddc3c90d. Remote and local tree both f97ed3dba8c4007c474c94de6377afd57d7b71d0; remote uses one commit on production instead of local audit ancestry. Do not force-push divergent local history. Continue with an isolated checkout from remote head or use expected-head GitHub tree updates.

Vercel dashboard project: 7 new variables, ONLY Preview + exact branch. NEXT_PUBLIC_SUPABASE_URL and CUSTOMER_ONBOARDING_DATABASE_URL target lpwmxtnzpgyrhphwufsd; anon key belongs to that project. CUSTOMER_ONBOARDING_ENABLED=false, BILLING_REVIEW_ENABLED=false. SUPABASE_SERVICE_ROLE_KEY is a deliberately invalid Secret placeholder awaiting user replacement; OPENAI_API_KEY is an invalid Secret override preventing inherited external API use. No production/all-preview values changed. CUSTOMER_ONBOARDING_DATABASE_URL is a public endpoint string without credentials; Vercel name-based Needs Attention is not secret exposure.

No new Preview deployed yet. Blockers: user enters test service_role key in prepared Vercel branch-only edit form; then obtain actual Preview URL, configure exact Auth redirect/origin and test SMTP, enable signup only there and verify actual Auth email/session. Preserve deployment protection. Do not claim the signup flow passed before real Auth verification.

## Follow-up 2026-10-10 14:49 KST (supersedes setup status above)

- User replaced the branch-only service-role Secret; metadata update verified without reading its value.
- First disabled-signup Preview dpl_ABdpGQk4xkmcjgnWBkKBRv7StvuB reached READY at remote SHA cfad050c4932d6937b1959457ba6e641ddc3c90d.
- User saved SMTP credentials on lpwmxtnzpgyrhphwufsd. Reload verified custom SMTP on, smtp.resend.com:465, interval 60, stored password hidden. Actual email delivery remains untested.
- Test Auth Confirm email is ON; anonymous sign-in is OFF.
- Saved test Auth Site URL https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app and exact redirect /onboarding; UI confirmed one redirect.
- Set CUSTOMER_ONBOARDING_ORIGIN to that origin and CUSTOMER_ONBOARDING_ENABLED=true, ONLY Preview + feat/customer-onboarding-20261010.
- Started manual non-production deployment dpl_3127DvGh83unr4Si53j4us2TBSqh at the same SHA; last observed BUILDING. Deployment URL dashboard-l8m03zy27-gyurinpapas-projects.vercel.app.
- Actual server credential validity, Auth createUser/resend, delivered email, session and real-user company provisioning are still unverified. No production deployment or scheduler change performed.
- Deployment dpl_3127DvGh83unr4Si53j4us2TBSqh subsequently reached READY. Browser verified branch-alias /signup renders the company signup form (company, type, contact, email, 12+ password, send verification button). No form submission performed. Shared shell Report links still point to production app; direct the tester to the signup form and email-return flow only.

