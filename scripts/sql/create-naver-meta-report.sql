-- Manual mixed reports deliberately do not enter report_media_connections:
-- that table is also the live legacy Naver worker fanout authority.
-- Keep its single-connection index and every existing worker RPC unchanged.
create table public.manual_report_media_connections (
  tenant_id uuid not null,
  workspace_id uuid not null,
  advertiser_id uuid not null,
  report_id uuid not null,
  connection_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(report_id, connection_id),
  foreign key(tenant_id,workspace_id,advertiser_id,report_id)
    references public.reports(tenant_id,workspace_id,advertiser_id,id) on delete cascade,
  foreign key(tenant_id,workspace_id,advertiser_id,connection_id)
    references public.media_connections(tenant_id,workspace_id,advertiser_id,id) on delete cascade
);
create index manual_report_media_connections_connection_idx on public.manual_report_media_connections(connection_id,report_id);
alter table public.manual_report_media_connections enable row level security;
revoke all on public.manual_report_media_connections from public,anon,authenticated;
grant select,insert,update,delete on public.manual_report_media_connections to service_role;

create function public.create_naver_meta_report_v1(
  p_workspace_id uuid,p_advertiser_id uuid,p_connection_ids uuid[],p_report_type_id uuid,p_title text,
  p_period_start date,p_period_end date,p_created_by uuid,p_meta jsonb
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog,public set lock_timeout = '3s'
as $$
declare
  v_meta_id uuid;
  v_count integer;
  v_result jsonb;
  v_meta jsonb;
  v_report public.reports%rowtype;
begin
  if current_user <> 'service_role' then raise exception 'API_REPORT_SCOPE_INVALID: service only'; end if;
  if p_connection_ids is null or cardinality(p_connection_ids) not between 2 and 16 or
     array_position(p_connection_ids,null) is not null or
     cardinality(p_connection_ids) <> (select count(distinct id) from unnest(p_connection_ids) id) or
     jsonb_typeof(p_meta) is distinct from 'object' or p_meta#>'{media_sync,auto_sync}' is not null or
     p_meta#>>'{public_identity,period_type}'='daily_sync' or
     not exists(select 1 from public.report_types where id=p_report_type_id and key='db') then
    raise exception 'API_REPORT_INVALID_INPUT: manual DB report requires one Meta and Naver';
  end if;
  perform 1 from public.media_connections where id=any(p_connection_ids) order by id for share;
  select count(*),min(id::text) filter(where provider='meta_ads')::uuid into v_count,v_meta_id
    from public.media_connections where id=any(p_connection_ids) and workspace_id=p_workspace_id and advertiser_id=p_advertiser_id
      and status='active' and nullif(credential_ciphertext,'') is not null and provider in ('naver_searchad','meta_ads');
  if v_count <> cardinality(p_connection_ids) or v_meta_id is null or
     (select count(*) from public.media_connections where id=any(p_connection_ids) and provider='meta_ads')<>1 or
     (select count(distinct (provider,external_account_id)) from public.media_connections where id=any(p_connection_ids))<>v_count then
    raise exception 'API_REPORT_INVALID_INPUT: invalid connection selection';
  end if;
  if not exists(select 1 from public.media_connections where id=v_meta_id and credential_version=1 and last_verified_at is not null
    and meta->'meta_ads_reporting'=jsonb_build_object('contract','meta_contact_snapshot_v1','enabled',true,
      'external_account_id',external_account_id,'currency','KRW','time_zone','Asia/Seoul','conversion_field','conversions',
      'conversion_action_type','contact_website','missing_conversion','zero_after_complete_reconciliation',
      'revenue','not_provided','attribution','platform_default','report_type','db')) then
    raise exception 'API_REPORT_INVALID_INPUT: Meta contact policy not approved';
  end if;
  v_meta := p_meta || jsonb_build_object('url_contract_version',2,'data_source',jsonb_build_object(
    'kind','api','mode','snapshot_replace','data_level','mixed','aggregation_contract','naver_meta_contact_v1'));
  -- Reuse the existing scoped creation authority, inside this same transaction.
  v_result := public.create_api_report_with_media_connections_v2(p_workspace_id,p_advertiser_id,array[v_meta_id],
    p_report_type_id,p_title,p_period_start,p_period_end,p_created_by,v_meta);
  select * into strict v_report from public.reports where id=(v_result->>'id')::uuid for update;
  v_meta := jsonb_set(v_report.meta,'{data_source}',((v_report.meta->'data_source')-'provider') ||
    jsonb_build_object('providers',jsonb_build_array('meta_ads','naver_searchad')),true);
  insert into public.manual_report_media_connections(tenant_id,workspace_id,advertiser_id,report_id,connection_id)
    select v_report.tenant_id,p_workspace_id,p_advertiser_id,v_report.id,id from unnest(p_connection_ids) id;
  delete from public.report_media_connections where report_id=v_report.id and connection_id=v_meta_id;
  update public.reports set meta=v_meta where id=v_report.id;
  return v_result || jsonb_build_object('meta',v_meta,'connection_ids',to_jsonb(p_connection_ids),
    'providers',jsonb_build_array('meta_ads','naver_searchad'),'connection_id',null,'provider',null);
end;
$$;
revoke all on function public.create_naver_meta_report_v1(uuid,uuid,uuid[],uuid,text,date,date,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_naver_meta_report_v1(uuid,uuid,uuid[],uuid,text,date,date,uuid,jsonb) to service_role;

-- Extend only the new manual Meta RPC; no legacy worker function is replaced.
-- The authenticated server rechecks run_sync permission before calling this service-only RPC.
create or replace function public.save_meta_ads_contact_snapshot_v1(p_payload jsonb)
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
  v_combined boolean;
  v_naver_ids uuid[];
  v_naver_count integer := 0;
  v_total integer;
  v_participant record;
  v_date date;
  v_partition record;
  v_actual bigint;
  v_participants jsonb := '[]'::jsonb;
  v_naver_audit jsonb := '[]'::jsonb;
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
      and meta#>>'{data_source,kind}'='api' and (meta#>>'{data_source,provider}'='meta_ads' or
        meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1')
    for update;
  if not found then raise exception 'META_CONTACT_REPORT_REQUIRED'; end if;
  v_combined := coalesce(r.meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1',false);
  if r.tenant_id is distinct from c.tenant_id or r.status not in ('draft','ready') or
     not exists(select 1 from public.report_types where id=r.report_type_id and key='db') or
     (not v_combined and r.meta#>'{data_source,providers}' is not null) or r.meta#>'{media_sync,auto_sync}' is not null or
     r.meta#>>'{media_sync,date_from}' is distinct from v_from::text or r.meta#>>'{media_sync,date_to}' is distinct from v_to::text or
     r.meta#>>'{media_sync,data_level}' is distinct from (case when v_combined then 'mixed' else 'creative' end) or r.meta#>>'{media_sync,mode}' is distinct from 'snapshot_replace' then
    raise exception 'META_CONTACT_REPORT_REQUIRED';
  end if;
  if r.updated_at is distinct from (p_payload->>'expected_report_updated_at')::timestamptz or
     r.current_ingestion_id is distinct from (p_payload->>'expected_current_ingestion_id')::uuid then
    raise exception 'META_CONTACT_CHANGED';
  end if;
  if v_combined then
    if r.meta#>'{data_source,providers}' is distinct from '["meta_ads","naver_searchad"]'::jsonb or
       r.meta#>'{data_source,provider}' is not null or r.meta->'url_contract_version' is distinct from '2'::jsonb or
       r.meta#>>'{public_identity,period_type}'='daily_sync' or
       v_policy->>'currency'<>'KRW' or v_policy->>'time_zone'<>'Asia/Seoul' or
       exists(select 1 from public.report_media_connections where report_id=r.id) then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
    perform 1 from public.manual_report_media_connections where report_id=r.id order by connection_id for share;
    select array_agg(mc.id order by mc.id) filter(where mc.provider='naver_searchad') into v_naver_ids
      from public.manual_report_media_connections m join public.media_connections mc on mc.id=m.connection_id
      where m.report_id=r.id and m.tenant_id=r.tenant_id and m.workspace_id=r.workspace_id and m.advertiser_id=r.advertiser_id
        and mc.tenant_id=r.tenant_id and mc.workspace_id=r.workspace_id and mc.advertiser_id=r.advertiser_id;
    if coalesce(cardinality(v_naver_ids),0) not between 1 and 15 or
       (select count(*) from public.manual_report_media_connections where report_id=r.id)<>cardinality(v_naver_ids)+1 or
       not exists(select 1 from public.manual_report_media_connections where report_id=r.id and connection_id=c.id) or
       (select count(distinct external_account_id) from public.media_connections where id=any(v_naver_ids))<>cardinality(v_naver_ids) then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
    for v_participant in select * from public.media_connections where id=any(v_naver_ids) order by id for share loop
      if v_participant.status<>'active' or nullif(v_participant.credential_ciphertext,'') is null then
        raise exception 'META_CONTACT_CHANGED';
      end if;
      v_actual := 0;
      for v_date in select d::date from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d loop
        -- Same account/date key used by the Naver fact writer, shared and nonblocking.
        if not pg_try_advisory_xact_lock_shared(hashtextextended(r.workspace_id::text||'|'||r.advertiser_id::text||
          '|naver_searchad|'||v_participant.external_account_id||'|'||v_date::text,0)) then
          raise exception 'NAVER_META_FACTS_CHANGED';
        end if;
        select * into v_partition from public.media_sync_fact_partitions where workspace_id=r.workspace_id
          and advertiser_id=r.advertiser_id and provider='naver_searchad' and external_account_id=v_participant.external_account_id
          and date=v_date for share;
        if not found or v_partition.source_connection_id<>v_participant.id then raise exception 'NAVER_META_COVERAGE_INCOMPLETE'; end if;
        if (select count(*) from public.media_sync_fact_rows f where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id
          and f.provider='naver_searchad' and f.external_account_id=v_participant.external_account_id and f.date=v_date
          and f.source_connection_id=v_participant.id and f.source_job_id=v_partition.source_job_id
          and f.row->>'provider'='naver_searchad' and f.row->>'external_account_id'=v_participant.external_account_id
          and f.row->>'date'=v_date::text)<>v_partition.row_count or
          (select count(*) from public.media_sync_fact_rows f where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id
          and f.provider='naver_searchad' and f.external_account_id=v_participant.external_account_id and f.date=v_date)<>v_partition.row_count then
          raise exception 'NAVER_META_FACTS_CHANGED';
        end if;
        v_actual := v_actual + v_partition.row_count;
        if v_actual+v_naver_count+v_count>50000 then raise exception 'NAVER_META_TOO_MANY_ROWS'; end if;
        v_naver_audit := v_naver_audit || jsonb_build_array(jsonb_build_object('connection_id',v_participant.id,'date',v_date,
          'source_job_id',v_partition.source_job_id,'updated_at',v_partition.updated_at,'row_count',v_partition.row_count));
      end loop;
      v_naver_count := v_naver_count+v_actual::integer;
      v_participants := v_participants || jsonb_build_array(jsonb_build_object('connection_id',v_participant.id,
        'provider','naver_searchad','external_account_id',v_participant.external_account_id,'row_count',v_actual));
    end loop;
  else
    perform 1 from public.report_media_connections where report_id=r.id and connection_id=c.id
      and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id and tenant_id=c.tenant_id for share;
    if not found or (select count(*) from public.report_media_connections where report_id=r.id) <> 1 then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
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

  v_total := v_count + v_naver_count;
  insert into public.report_ingestions(id,workspace_id,report_id,kind,status,row_count,created_by)
    values(v_snapshot,r.workspace_id,r.id,'api','success',v_total,(p_payload->>'user_id')::uuid);
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select r.workspace_id,r.id,r.advertiser_id,ordinality::integer-1,value,(value->>'date')::date,'Meta Ads','','Meta Ads',v_snapshot
    from jsonb_array_elements(p_payload->'rows') with ordinality;
  if v_combined then
    insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
      select r.workspace_id,r.id,r.advertiser_id,v_count+(row_number() over(order by f.date,f.external_account_id,f.row_key))::integer-1,
        f.row,f.date,f.channel,f.device,f.source,v_snapshot
      from public.media_sync_fact_rows f join public.media_connections mc on mc.id=any(v_naver_ids)
        and mc.external_account_id=f.external_account_id and mc.provider=f.provider
      where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id and f.provider='naver_searchad'
        and f.date between v_from and v_to;
    get diagnostics v_actual = row_count;
    if v_actual<>v_naver_count then raise exception 'NAVER_META_FACTS_CHANGED'; end if;
    -- Completed materialization records only: these never enter a worker queue.
    for v_row in select value from jsonb_array_elements(v_participants) loop
      insert into public.media_sync_jobs(id,workspace_id,advertiser_id,report_id,connection_id,provider,external_account_id,
        date_from,date_to,data_level,mode,status,progress,raw_rows,normalized_rows,inserted_rows,failed_rows,
        previous_ingestion_id,snapshot_ingestion_id,attempt_count,created_by,started_at,finished_at)
      values(gen_random_uuid(),r.workspace_id,r.advertiser_id,r.id,(v_row->>'connection_id')::uuid,'naver_searchad',v_row->>'external_account_id',
        v_from,v_to,'mixed','snapshot_replace','done',100,(v_row->>'row_count')::integer,(v_row->>'row_count')::integer,
        (v_row->>'row_count')::integer,0,r.current_ingestion_id,v_snapshot,1,(p_payload->>'user_id')::uuid,v_now,v_now);
    end loop;
  end if;
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
  if v_combined then
    update public.reports set meta=jsonb_set(meta,'{multi_media_snapshot}',jsonb_build_object(
      'contract','naver_meta_contact_v1','date_from',v_from,'date_to',v_to,'row_count',v_total,'saved_at',v_now,
      'ingestion_id',v_snapshot,'conversion_aggregation','sum_provider_attributed_conversions',
      'participants',v_participants||jsonb_build_array(jsonb_build_object('connection_id',c.id,'provider','meta_ads',
        'external_account_id',c.external_account_id,'row_count',v_count)), 'naver_partitions',v_naver_audit),true) where id=r.id;
  end if;
  update public.media_connections set last_sync_at=v_now,updated_at=v_now where id=c.id;
  -- Published pointers, report status, old snapshots and all other providers remain untouched.
  return jsonb_build_object('job',to_jsonb(j)-'error_detail','snapshot_ingestion_id',v_snapshot,'row_count',v_total);
end;
$$;
revoke all on function public.save_meta_ads_contact_snapshot_v1(jsonb) from public, anon, authenticated;
grant execute on function public.save_meta_ads_contact_snapshot_v1(jsonb) to service_role;
