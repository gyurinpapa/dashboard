-- REVIEW CANDIDATE ONLY. Requires separate production approval.
-- Does not execute, replace or recreate either snapshot function.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '8s';

do $guard$
declare
  preparation regprocedure := to_regprocedure('public.prepare_daily_report_v2_combined_snapshot(jsonb)');
  activation regprocedure := to_regprocedure('public.activate_daily_report_v2_combined_snapshot(jsonb)');
begin
  if preparation is null or activation is null then
    raise exception 'SNAPSHOT_FUNCTION_MISSING';
  end if;
  if not exists (
    select 1 from pg_proc where oid = preparation
      and md5(prosrc) = '11fd8088ddb063dfa46be60b11a06a3c'
      and pg_get_userbyid(proowner) = 'postgres' and prosecdef
  ) or not exists (
    select 1 from pg_proc where oid = activation
      and md5(prosrc) = '17df92c196f28727c6602ab920a48940'
      and pg_get_userbyid(proowner) = 'postgres' and prosecdef
  ) then
    raise exception 'SNAPSHOT_FUNCTION_BASELINE_CHANGED';
  end if;
  if not has_function_privilege('service_role', preparation, 'EXECUTE')
     or not has_function_privilege('service_role', activation, 'EXECUTE')
     or has_function_privilege('anon', activation, 'EXECUTE')
     or has_function_privilege('authenticated', activation, 'EXECUTE') then
    raise exception 'SNAPSHOT_EXECUTION_BASELINE_CHANGED';
  end if;
end;
$guard$;

revoke execute on function public.prepare_daily_report_v2_combined_snapshot(jsonb)
  from public, anon, authenticated;

do $verify$
begin
  if has_function_privilege('anon', 'public.prepare_daily_report_v2_combined_snapshot(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.prepare_daily_report_v2_combined_snapshot(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.prepare_daily_report_v2_combined_snapshot(jsonb)', 'EXECUTE') then
    raise exception 'SNAPSHOT_EXECUTION_VERIFICATION_FAILED';
  end if;
end;
$verify$;
commit;
