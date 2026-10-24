-- Daily Meta facts -> atomic draft snapshot. Published pointers and Naver facts remain unchanged.
create or replace function public.materialize_meta_ads_daily_report_v1(p_report_id uuid,p_connection_id uuid,p_target_date date)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public
set lock_timeout = '3s'
as $$
declare
  p_payload jsonb; v_meta_audit jsonb; v_fingerprint text; v_pre_count integer;
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
  -- Lock the connection before report/partitions, matching every Meta writer.
  select * into c from public.media_connections where id=p_connection_id and provider='meta_ads' for update;
  if not found or c.status<>'active' or c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb then
    raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  select * into r from public.reports where id=p_report_id and tenant_id=c.tenant_id and workspace_id=c.workspace_id
    and advertiser_id=c.advertiser_id and status in ('draft','ready') and meta#>>'{data_source,kind}'='api'
    and (meta#>>'{data_source,provider}'='meta_ads' or meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1') for update;
  if not found then return jsonb_build_object('status','ineligible'); end if;
  if coalesce(r.meta#>>'{media_sync,date_from}','')!~'^\d{4}-\d{2}-\d{2}$' or
     coalesce(r.meta#>>'{media_sync,date_to}','')!~'^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('status','period_required'); end if;
  v_from:=(r.meta#>>'{media_sync,date_from}')::date; v_to:=(r.meta#>>'{media_sync,date_to}')::date;
  if p_target_date is null or p_target_date>=(v_now at time zone 'Asia/Seoul')::date or
    v_from>v_to or v_to-v_from>=31 then raise exception 'META_CONTACT_INVALID_RANGE'; end if;
  if v_to>p_target_date then return jsonb_build_object('status','period_not_completed'); end if;
  -- A mapping is required before even writing a waiting status.
  v_combined:=coalesce(r.meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1',false);
  if (v_combined and not exists(select 1 from public.manual_report_media_connections where report_id=r.id and connection_id=c.id
      and tenant_id=c.tenant_id and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id)) or
    (not v_combined and not exists(select 1 from public.report_media_connections where report_id=r.id and connection_id=c.id
      and tenant_id=c.tenant_id and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id)) then
    raise exception 'META_CONTACT_REPORT_REQUIRED'; end if;
  select count(*),coalesce(jsonb_agg(jsonb_build_object('date',date,'content_hash',content_hash) order by date),'[]'::jsonb)
    into v_pre_count,v_meta_audit from public.meta_ads_daily_partitions where connection_id=c.id and tenant_id=c.tenant_id
      and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id and date between v_from and v_to and policy=c.meta->'meta_ads_reporting';
  if v_pre_count<>v_to-v_from+1 then
    update public.reports set meta=jsonb_set(meta,'{meta_ads_daily_projection}',jsonb_build_object('status','waiting_meta',
      'date_from',v_from,'date_to',v_to,'checked_at',v_now),true) where id=r.id;
    return jsonb_build_object('status','waiting_meta'); end if;
  if v_combined and exists(select 1 from public.manual_report_media_connections m join public.media_connections n on n.id=m.connection_id
    cross join generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d
    where m.report_id=r.id and n.provider='naver_searchad' and not exists(select 1 from public.media_sync_fact_partitions p
      where p.workspace_id=r.workspace_id and p.advertiser_id=r.advertiser_id and p.provider='naver_searchad'
        and p.external_account_id=n.external_account_id and p.source_connection_id=n.id and p.date=d::date)) then
    update public.reports set meta=jsonb_set(meta,'{meta_ads_daily_projection}',jsonb_build_object('status','waiting_naver',
      'date_from',v_from,'date_to',v_to,'checked_at',v_now),true) where id=r.id;
    return jsonb_build_object('status','waiting_naver'); end if;
  select coalesce(jsonb_agg(x order by p.date,x->>'external_ad_id'),'[]'::jsonb),jsonb_build_object(
    'impressions',coalesce(coalesce(sum((x->>'impressions')::numeric),0),0),'clicks',coalesce(coalesce(sum((x->>'clicks')::numeric),0),0),
    'spend',coalesce(coalesce(sum((x->>'cost')::numeric),0),0),'website_contacts',coalesce(coalesce(sum((x->>'conversions')::numeric),0),0))
    into v_row,v_proof from public.meta_ads_daily_partitions p cross join lateral jsonb_array_elements(p.rows) x
      where p.connection_id=c.id and p.date between v_from and v_to;
  p_payload:=jsonb_build_object('contract','meta_contact_snapshot_v1','workspace_id',r.workspace_id,'advertiser_id',r.advertiser_id,
    'report_id',r.id,'connection_id',c.id,'user_id',r.created_by,'external_account_id',c.external_account_id,
    'expected_report_updated_at',r.updated_at,'expected_current_ingestion_id',r.current_ingestion_id,
    'expected_connection_updated_at',c.updated_at,'expected_last_verified_at',c.last_verified_at,
    'date_from',v_from,'date_to',v_to,'policy',c.meta->'meta_ads_reporting','account_totals',v_proof,'page_count',1,'rows',v_row);

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
  if v_from is null or v_to is null or v_from > v_to or v_to-v_from >= 31 or v_count < 0 or v_count > 25000 or
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
  select jsonb_build_object('impressions',coalesce(sum((x->>'impressions')::numeric),0),'clicks',coalesce(sum((x->>'clicks')::numeric),0),
    'spend',coalesce(sum((x->>'cost')::numeric),0),'website_contacts',coalesce(sum((x->>'conversions')::numeric),0)),
    count(*) filter(where x#>>'{provider_meta,conversion_value_source}'='reconciled_absence')
    into v_sums,v_missing from jsonb_array_elements(p_payload->'rows') x;
  foreach v_key in array array['impressions','clicks','spend','website_contacts'] loop
    if (v_sums->>v_key)::numeric is distinct from (v_proof->>v_key)::numeric then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;

  v_fingerprint:=md5(jsonb_build_object('meta',v_meta_audit,'naver',v_naver_audit,'policy',v_policy,
    'date_from',v_from,'date_to',v_to,'participants',v_participants)::text);
  if r.meta#>>'{meta_ads_daily_projection,fingerprint}'=v_fingerprint and
    r.meta#>>'{meta_ads_daily_projection,ingestion_id}'=r.current_ingestion_id::text then
    return jsonb_build_object('status','unchanged','snapshot_ingestion_id',r.current_ingestion_id); end if;
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
      'account_totals',v_proof,'row_count',v_count,'rows_with_reconciled_absence',v_missing,'source','meta_ads_daily_partitions',
      'date_from',v_from,'date_to',v_to,'job_id',v_job,'ingestion_id',v_snapshot,'saved_at',v_now),true)
    where id=r.id;
  if v_combined then
    update public.reports set meta=jsonb_set(meta,'{multi_media_snapshot}',jsonb_build_object(
      'contract','naver_meta_contact_v1','date_from',v_from,'date_to',v_to,'row_count',v_total,'saved_at',v_now,
      'ingestion_id',v_snapshot,'conversion_aggregation','sum_provider_attributed_conversions',
      'participants',v_participants||jsonb_build_array(jsonb_build_object('connection_id',c.id,'provider','meta_ads',
        'external_account_id',c.external_account_id,'row_count',v_count)), 'naver_partitions',v_naver_audit),true) where id=r.id;
  end if;
  update public.reports set meta=jsonb_set(meta,'{meta_ads_daily_projection}',jsonb_build_object(
    'contract','meta_daily_v1','status','updated','date_from',v_from,'date_to',v_to,'fingerprint',v_fingerprint,
    'ingestion_id',v_snapshot,'updated_at',v_now,'partitions',v_meta_audit),true) where id=r.id;
  -- Published pointers, report status, old snapshots and all other providers remain untouched.
  return jsonb_build_object('status','updated','snapshot_ingestion_id',v_snapshot,'row_count',v_total);
end;
$$;
revoke all on function public.materialize_meta_ads_daily_report_v1(uuid,uuid,date) from public, anon, authenticated;
grant execute on function public.materialize_meta_ads_daily_report_v1(uuid,uuid,date) to service_role;
