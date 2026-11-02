-- The application role deliberately has SELECT-only access to canonical Naver facts.
-- FOR SHARE additionally requires UPDATE privilege. The shared transaction advisory
-- lock immediately before this read already excludes the fact writer, which takes
-- an exclusive advisory lock for the same workspace/advertiser/provider/account/date.
-- Remove only this redundant row lock; preserve validation, grants, and atomic saves.
do $migration$
declare
  v_definition text;
  v_before constant text := $before$select * into v_partition from public.media_sync_fact_partitions where workspace_id=r.workspace_id
          and advertiser_id=r.advertiser_id and provider='naver_searchad' and external_account_id=v_participant.external_account_id
          and date=v_date for share;$before$;
  v_after constant text := $after$select * into v_partition from public.media_sync_fact_partitions where workspace_id=r.workspace_id
          and advertiser_id=r.advertiser_id and provider='naver_searchad' and external_account_id=v_participant.external_account_id
          and date=v_date;$after$;
begin
  select pg_get_functiondef('public.save_meta_ads_contact_snapshot_v1(jsonb)'::regprocedure)
    into v_definition;
  if position('pg_try_advisory_xact_lock_shared' in v_definition)=0
     or (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 then
    raise exception 'Unexpected save_meta_ads_contact_snapshot_v1 definition; inspect before applying';
  end if;
  execute replace(v_definition,v_before,v_after);
end;
$migration$;
