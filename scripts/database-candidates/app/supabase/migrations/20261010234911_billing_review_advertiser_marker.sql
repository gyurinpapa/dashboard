-- REVIEW CANDIDATE ONLY: application DB rulcvpgvmmckacshkmfy, after customer-onboarding.sql.
-- Do not apply the payment-project migration in this database.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '8s';
do $guard$
begin
  if to_regprocedure('public.provision_etrylue_customer(uuid)') is null
    or not exists (select 1 from pg_proc where oid=to_regprocedure('public.activate_daily_report_v2_combined_snapshot(jsonb)')
      and md5(prosrc)='17df92c196f28727c6602ab920a48940') then
    raise exception 'APP_ROLLOUT_BASELINE_MISMATCH';
  end if;
end;
$guard$;

-- Constant false default preserves every existing advertiser; no backfill or customer reassignment.
alter table public.advertisers add column billing_review_managed boolean not null default false;
create function public.guard_billing_review_advertiser() returns trigger
language plpgsql set search_path=pg_catalog as $function$
begin
  if tg_op='INSERT' then
    if new.billing_review_managed and (current_user not in ('postgres','service_role')
      or current_setting('role',true) in ('anon','authenticated')) then
      raise exception 'BILLING_MARKER_SERVER_ONLY';
    end if;
  else
    if new.billing_review_managed is distinct from old.billing_review_managed then
      raise exception 'BILLING_MARKER_IMMUTABLE';
    end if;
    if old.billing_review_managed and
      (new.id,new.workspace_id,new.tenant_id,new.created_by) is distinct from
      (old.id,old.workspace_id,old.tenant_id,old.created_by) then
      raise exception 'BILLING_TARGET_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.guard_billing_review_advertiser() from public,anon,authenticated;
create trigger billing_review_advertiser_identity before insert or update on public.advertisers
for each row execute function public.guard_billing_review_advertiser();
commit;
