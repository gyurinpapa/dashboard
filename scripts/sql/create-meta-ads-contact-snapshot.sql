-- Additive, Meta-only bounded manual snapshot. No shared worker or function replacement.
-- The authenticated server rechecks run_sync permission before calling this service-only RPC.
create function public.save_meta_ads_contact_snapshot_v1(p_payload jsonb)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public
set lock_timeout = '3s'
as $$
declare
  c public.media_connections%rowtype;
  r public.reports%rowtype;
  j public.media_sync_jobs%rowtype;
  v_row jsonb;
  v_policy jsonb;
  v_proof jsonb;
  v_key text;
  v_from date;
  v_to date;
  v_count integer;
  v_missing integer;
  v_snapshot uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_sums jsonb;
begin
  if current_user <> 'service_role' then raise exception 'META_CONTACT_FORBIDDEN'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload) > 8388608 or
     p_payload->>'contract' is distinct from 'meta_contact_snapshot_v1' or
     jsonb_typeof(p_payload->'rows') is distinct from 'array' then
    raise exception 'META_CONTACT_INVALID_INPUT';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload)) <> 17 or exists (
    select 1 from jsonb_object_keys(p_payload) k where k not in
    ('contract','workspace_id','advertiser_id','report_id','connection_id','user_id','external_account_id',
     'expected_report_updated_at','expected_current_ingestion_id','expected_connection_updated_at','expected_last_verified_at',
     'date_from','date_to','policy','account_totals','page_count','rows')) then
    raise exception 'META_CONTACT_INVALID_INPUT';
  end if;
  foreach v_key in array array['workspace_id','advertiser_id','report_id','connection_id','user_id'] loop
    if coalesce(p_payload->>v_key,'') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception 'META_CONTACT_INVALID_INPUT';
    end if;
  end loop;
  v_from := (p_payload->>'date_from')::date; v_to := (p_payload->>'date_to')::date;
  v_count := jsonb_array_length(p_payload->'rows');
  if v_from is null or v_to is null or v_from > v_to or v_to-v_from >= 31 or v_count < 1 or v_count > 2500 or
     coalesce(p_payload->>'page_count','') !~ '^[1-5]$' then raise exception 'META_CONTACT_INVALID_INPUT'; end if;

  select * into c from public.media_connections
    where id=(p_payload->>'connection_id')::uuid and provider='meta_ads'
      and workspace_id=(p_payload->>'workspace_id')::uuid and advertiser_id=(p_payload->>'advertiser_id')::uuid
    for update;
  if not found then raise exception 'META_CONTACT_CHANGED'; end if;
  if c.status <> 'active' or c.credential_version <> 1 or nullif(c.credential_ciphertext,'') is null or
     c.last_verified_at is null or c.external_account_id is distinct from p_payload->>'external_account_id' or
     c.updated_at is distinct from (p_payload->>'expected_connection_updated_at')::timestamptz or
     c.last_verified_at is distinct from (p_payload->>'expected_last_verified_at')::timestamptz then
    raise exception 'META_CONTACT_CHANGED';
  end if;
  v_policy := c.meta->'meta_ads_reporting';
  if v_policy is distinct from p_payload->'policy' or jsonb_typeof(v_policy) is distinct from 'object' or
     (select count(*) from jsonb_object_keys(v_policy)) <> 11 or
     v_policy->>'contract' is distinct from 'meta_contact_snapshot_v1' or v_policy->'enabled' is distinct from 'true'::jsonb or
     v_policy->>'external_account_id' is distinct from c.external_account_id or
     v_policy->>'conversion_field' is distinct from 'conversions' or v_policy->>'conversion_action_type' is distinct from 'contact_website' or
     v_policy->>'missing_conversion' is distinct from 'zero_after_complete_reconciliation' or
     v_policy->>'revenue' is distinct from 'not_provided' or v_policy->>'attribution' is distinct from 'platform_default' or
     v_policy->>'report_type' is distinct from 'db' or coalesce(v_policy->>'currency','') !~ '^[A-Z]{3}$' or
     not exists (select 1 from pg_timezone_names where name=v_policy->>'time_zone') then
    raise exception 'META_CONTACT_POLICY_REQUIRED';
  end if;
  if v_to >= (v_now at time zone (v_policy->>'time_zone'))::date then raise exception 'META_CONTACT_INVALID_RANGE'; end if;

  select * into r from public.reports
    where id=(p_payload->>'report_id')::uuid and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id
      and meta#>>'{data_source,kind}'='api' and meta#>>'{data_source,provider}'='meta_ads'
    for update;
  if not found then raise exception 'META_CONTACT_REPORT_REQUIRED'; end if;
  if r.tenant_id is distinct from c.tenant_id or r.status not in ('draft','ready') or
     not exists(select 1 from public.report_types where id=r.report_type_id and key='db') or
     r.meta#>'{data_source,providers}' is not null or r.meta#>'{media_sync,auto_sync}' is not null or
     r.meta#>>'{media_sync,date_from}' is distinct from v_from::text or r.meta#>>'{media_sync,date_to}' is distinct from v_to::text or
     r.meta#>>'{media_sync,data_level}' is distinct from 'creative' or r.meta#>>'{media_sync,mode}' is distinct from 'snapshot_replace' then
    raise exception 'META_CONTACT_REPORT_REQUIRED';
  end if;
  if r.updated_at is distinct from (p_payload->>'expected_report_updated_at')::timestamptz or
     r.current_ingestion_id is distinct from (p_payload->>'expected_current_ingestion_id')::uuid then
    raise exception 'META_CONTACT_CHANGED';
  end if;
  perform 1 from public.report_media_connections where report_id=r.id and connection_id=c.id
    and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id and tenant_id=c.tenant_id for share;
  if not found or (select count(*) from public.report_media_connections where report_id=r.id) <> 1 then
    raise exception 'META_CONTACT_REPORT_REQUIRED';
  end if;
  if exists(select 1 from public.media_sync_jobs where (report_id=r.id or connection_id=c.id) and status in ('pending','processing')) then
    raise exception 'ACTIVE_JOB_ALREADY_EXISTS';
  end if;

  v_proof := p_payload->'account_totals';
  if jsonb_typeof(v_proof) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_proof)) <> 4 then
    raise exception 'META_CONTACT_RECONCILIATION_FAILED';
  end if;
  foreach v_key in array array['impressions','clicks','spend','website_contacts'] loop
    if coalesce(v_proof->>v_key,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
       (v_proof->>v_key)::numeric > 9007199254740991 then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
    if jsonb_typeof(v_row) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_row)) <> 31 or exists (
      select 1 from jsonb_object_keys(v_row) k where k not in
      ('date','report_date','day','ymd','channel','source','platform','device','campaign','campaign_name','group','group_name','adgroup_name',
       'creative','creative_name','impressions','clicks','cost','conversions','revenue','row_level','data_level','row_level_reason',
       'provider','ingestion_source','external_account_id','external_campaign_id','external_group_id','external_ad_id','external_creative_id','provider_meta')) then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    -- Only the exact normalized contract is persisted. No arbitrary API fields or credentials.
    if v_row->>'date' is null or (v_row->>'date')::date not between v_from and v_to or
       to_char((v_row->>'date')::date,'YYYY-MM-DD') is distinct from v_row->>'date' or
       v_row->>'report_date' is distinct from v_row->>'date' or v_row->>'day' is distinct from v_row->>'date' or
       v_row->>'ymd' is distinct from v_row->>'date' or v_row->>'channel' is distinct from 'Meta Ads' or
       v_row->>'source' is distinct from 'Meta Ads' or v_row->>'platform' is distinct from 'Meta Ads' or
       v_row->>'device' is distinct from '' or v_row->>'provider' is distinct from 'meta_ads' or
       v_row->>'ingestion_source' is distinct from 'api' or v_row->>'external_account_id' is distinct from c.external_account_id or
       v_row->>'row_level' is distinct from 'creative' or v_row->>'data_level' is distinct from 'creative' or
       v_row->>'row_level_reason' is distinct from 'meta_ads_ad_daily_insights' or
       v_row->>'external_creative_id' is distinct from v_row->>'external_ad_id' or v_row->'revenue' is distinct from 'null'::jsonb then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    foreach v_key in array array['external_campaign_id','external_group_id','external_ad_id'] loop
      if coalesce(v_row->>v_key,'') !~ '^[1-9][0-9]{0,29}$' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    end loop;
    foreach v_key in array array['campaign','group','creative'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'string' or length(v_row->>v_key) not between 1 and 2000 or
         (v_row->>v_key) ~ '[[:cntrl:]]' or v_row->>(v_key||'_name') is distinct from v_row->>v_key then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if v_row->>'adgroup_name' is distinct from v_row->>'group' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    foreach v_key in array array['impressions','clicks','cost','conversions'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'number' or
         coalesce(v_row->>v_key,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
         (v_row->>v_key)::numeric > 9007199254740991 or
         (v_key in ('impressions','clicks') and (v_row->>v_key)::numeric <> trunc((v_row->>v_key)::numeric)) then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if coalesce(v_row#>>'{provider_meta,conversion_value_source}','') not in ('reported','reconciled_absence') or
       (v_row#>>'{provider_meta,conversion_value_source}'='reconciled_absence' and (v_row->>'conversions')::numeric<>0) or
       v_row->'provider_meta' is distinct from jsonb_build_object('contract','meta_contact_snapshot_v1','api_version','v26.0',
         'level','ad','time_increment',1,'currency',v_policy->>'currency','time_zone',v_policy->>'time_zone',
         'conversion_field','conversions','conversion_action_type','contact_website',
         'conversion_value_source',v_row#>>'{provider_meta,conversion_value_source}','revenue_status','not_provided','attribution','platform_default') then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'rows') x group by x->>'date',x->>'external_ad_id' having count(*)>1) then
    raise exception 'META_CONTACT_DUPLICATE_ROW';
  end if;
  select jsonb_build_object('impressions',sum((x->>'impressions')::numeric),'clicks',sum((x->>'clicks')::numeric),
    'spend',sum((x->>'cost')::numeric),'website_contacts',sum((x->>'conversions')::numeric)),
    count(*) filter(where x#>>'{provider_meta,conversion_value_source}'='reconciled_absence')
    into v_sums,v_missing from jsonb_array_elements(p_payload->'rows') x;
  foreach v_key in array array['impressions','clicks','spend','website_contacts'] loop
    if (v_sums->>v_key)::numeric is distinct from (v_proof->>v_key)::numeric then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;

  insert into public.report_ingestions(id,workspace_id,report_id,kind,status,row_count,created_by)
    values(v_snapshot,r.workspace_id,r.id,'api','success',v_count,(p_payload->>'user_id')::uuid);
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select r.workspace_id,r.id,r.advertiser_id,ordinality::integer-1,value,(value->>'date')::date,'Meta Ads','','Meta Ads',v_snapshot
    from jsonb_array_elements(p_payload->'rows') with ordinality;
  insert into public.media_sync_jobs(id,workspace_id,advertiser_id,report_id,connection_id,provider,external_account_id,
    date_from,date_to,data_level,mode,status,progress,raw_rows,normalized_rows,inserted_rows,failed_rows,
    previous_ingestion_id,snapshot_ingestion_id,attempt_count,created_by,started_at,finished_at)
    values(v_job,r.workspace_id,r.advertiser_id,r.id,c.id,'meta_ads',c.external_account_id,v_from,v_to,'creative','snapshot_replace',
      'done',100,v_count,v_count,v_count,0,r.current_ingestion_id,v_snapshot,1,(p_payload->>'user_id')::uuid,v_now,v_now)
    returning * into j;
  update public.reports set current_ingestion_id=v_snapshot,last_ingested_at=v_now,last_ingestion_run_id=v_job::text,
    meta=jsonb_set(r.meta,'{meta_ads_snapshot}',jsonb_build_object('contract','meta_contact_snapshot_v1','policy',v_policy,
      'account_totals',v_proof,'row_count',v_count,'rows_with_reconciled_absence',v_missing,'page_count',(p_payload->>'page_count')::integer,
      'date_from',v_from,'date_to',v_to,'job_id',v_job,'ingestion_id',v_snapshot,'saved_at',v_now),true)
    where id=r.id;
  update public.media_connections set last_sync_at=v_now,updated_at=v_now where id=c.id;
  -- Published pointers, report status, old snapshots and all other providers remain untouched.
  return jsonb_build_object('job',to_jsonb(j)-'error_detail','snapshot_ingestion_id',v_snapshot,'row_count',v_count);
end;
$$;
revoke all on function public.save_meta_ads_contact_snapshot_v1(jsonb) from public, anon, authenticated;
grant execute on function public.save_meta_ads_contact_snapshot_v1(jsonb) to service_role;
