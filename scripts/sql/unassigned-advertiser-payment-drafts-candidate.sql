-- ISOLATED PAYMENT CANDIDATE ONLY. Additive; never alter existing purchase drafts/orders.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $$ begin
  if current_setting('etrylue.registration_candidate',true) is distinct from 'isolated-candidate-only'
    or to_regclass('public.billing_test_orders') is null or to_regclass('public.report_rows') is not null
    or to_regnamespace('etrylue_customer_private') is not null
    or to_regprocedure('public.activate_daily_report_v2_combined_snapshot(jsonb)') is not null then
    raise exception 'ISOLATED_PAYMENT_CANDIDATE_REQUIRED'; end if;
end $$;
create table public.billing_test_registration_drafts (
  order_id uuid primary key,
  user_id uuid not null,
  target_id uuid not null unique,
  company_id uuid not null,
  tenant_id uuid not null,
  app_project text not null check(app_project='lpwmxtnzpgyrhphwufsd'),
  name text not null check(length(btrim(name)) between 1 and 100 and name=btrim(name) and name !~ '[[:cntrl:]]'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.billing_test_registration_drafts enable row level security;
revoke all on public.billing_test_registration_drafts from public,anon,authenticated,service_role;
grant select,insert on public.billing_test_registration_drafts to service_role;
commit;
