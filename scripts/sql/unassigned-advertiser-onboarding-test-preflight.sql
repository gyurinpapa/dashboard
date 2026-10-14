-- ONLY for the existing onboarding test project lpwmxtnzpgyrhphwufsd.
-- Run through a project-scoped authenticated operation, after verifying that exact ref.
begin;
set local lock_timeout='2s';set local statement_timeout='8s';
do $$ begin
  if current_setting('etrylue.registration_candidate',true) is distinct from 'isolated-candidate-only'
    or to_regclass('public.report_rows') is not null
    or to_regprocedure('public.activate_daily_report_v2_combined_snapshot(jsonb)') is not null
    or (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.provision_etrylue_customer(uuid)'))
      is distinct from '70d1bd40ab986d66b33b61734aef1a94' then
    raise exception 'ONBOARDING_TEST_BASELINE_REQUIRED'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='advertisers'
    and column_name='billing_review_managed') then raise exception 'MARKER_ALREADY_PRESENT_REVIEW_REQUIRED'; end if;
end $$;
alter table public.advertisers add column billing_review_managed boolean not null default false;
commit;
