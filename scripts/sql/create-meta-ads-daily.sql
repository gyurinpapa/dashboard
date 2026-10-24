-- Independent Meta account collector. No changes to Naver queues, mappings or functions.
create table public.meta_ads_daily_runs (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.media_connections(id),
  target_date date not null, start_date date not null, connection_updated_at timestamptz not null,
  lease uuid not null, lease_until timestamptz not null,
  status text not null check(status in ('processing','done','partial','failed')),
  attempts integer not null default 1, error_code text,
  started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
  unique(connection_id,target_date), unique(id,connection_id)
);
create table public.meta_ads_daily_partitions (
  connection_id uuid not null, tenant_id uuid not null, workspace_id uuid not null, advertiser_id uuid not null,
  date date not null, run_id uuid not null, rows jsonb not null check(jsonb_typeof(rows)='array'),
  row_count integer not null check(row_count between 0 and 2500 and row_count=jsonb_array_length(rows)),
  content_hash text not null, policy jsonb not null, proof jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(connection_id,date),
  foreign key(tenant_id,workspace_id,advertiser_id,connection_id)
    references public.media_connections(tenant_id,workspace_id,advertiser_id,id) on delete restrict,
  foreign key(run_id,connection_id) references public.meta_ads_daily_runs(id,connection_id) on delete restrict
);
alter table public.meta_ads_daily_runs enable row level security;
alter table public.meta_ads_daily_partitions enable row level security;
revoke all on public.meta_ads_daily_runs,public.meta_ads_daily_partitions from public,anon,authenticated;
grant select,insert,update,delete on public.meta_ads_daily_runs,public.meta_ads_daily_partitions to service_role;

create or replace function public.claim_meta_ads_daily_run_v1(p_connection_id uuid,p_target_date date,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare c public.media_connections%rowtype; r public.meta_ads_daily_runs%rowtype; v_start date; v_collect date; v_now timestamptz:=clock_timestamp();
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if p_lease is null or p_target_date is distinct from (v_now at time zone 'Asia/Seoul')::date-1 then
    raise exception 'META_DAILY_INVALID_RANGE'; end if;
  select * into c from public.media_connections where id=p_connection_id and provider='meta_ads' for update;
  if not found or c.status<>'active' or c.credential_version<>1 or nullif(c.credential_ciphertext,'') is null or
    c.last_verified_at is null or c.meta#>>'{meta_ads_daily,contract}' is distinct from 'meta_daily_v1' or
    c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb or
    c.meta#>>'{meta_ads_daily,time_zone}' is distinct from 'Asia/Seoul' or
    c.meta#>>'{meta_ads_daily,schedule}' is distinct from '0 20 * * *' or
    c.meta#>'{meta_ads_daily,lookback_days}' is distinct from '7'::jsonb or
    c.meta#>>'{meta_ads_reporting,contract}' is distinct from 'meta_contact_snapshot_v1' or
    c.meta#>'{meta_ads_reporting,enabled}' is distinct from 'true'::jsonb or
    c.meta#>>'{meta_ads_reporting,currency}' is distinct from 'KRW' or
    c.meta#>>'{meta_ads_reporting,time_zone}' is distinct from 'Asia/Seoul' then
    raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  v_start:=(c.meta#>>'{meta_ads_daily,start_date}')::date;
  if v_start is null or v_start>p_target_date or p_target_date-v_start>3660 then raise exception 'META_DAILY_INVALID_RANGE'; end if;
  if exists(select 1 from public.meta_ads_daily_runs where connection_id=c.id and status='processing' and lease_until>v_now) then
    return jsonb_build_object('claimed',false,'reason','leased'); end if;
  select * into r from public.meta_ads_daily_runs where connection_id=c.id and target_date=p_target_date for update;
  if found and r.status='done' and r.start_date=v_start then return jsonb_build_object('claimed',false,'reason','already_done'); end if;
  insert into public.meta_ads_daily_runs(connection_id,target_date,start_date,connection_updated_at,lease,lease_until,status)
    values(c.id,p_target_date,v_start,c.updated_at,p_lease,v_now+interval '20 minutes','processing')
    on conflict(connection_id,target_date) do update set lease=excluded.lease,lease_until=excluded.lease_until,
      start_date=excluded.start_date,connection_updated_at=excluded.connection_updated_at,status='processing',
      attempts=meta_ads_daily_runs.attempts+1,error_code=null,started_at=v_now,finished_at=null returning * into r;
  select min(d::date) into v_collect from generate_series(v_start::timestamp,p_target_date::timestamp,interval '1 day') d
    where not exists(select 1 from public.meta_ads_daily_partitions p where p.connection_id=c.id and p.date=d::date and p.policy=c.meta->'meta_ads_reporting');
  return jsonb_build_object('claimed',true,'run_id',r.id,'connection_updated_at',c.updated_at,
    'collection_start',greatest(v_start,least(coalesce(v_collect,p_target_date-6),p_target_date-6)));
end; $$;
revoke all on function public.claim_meta_ads_daily_run_v1(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.claim_meta_ads_daily_run_v1(uuid,date,uuid) to service_role;

create or replace function public.replace_meta_ads_daily_window_v1(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare c public.media_connections%rowtype; r public.meta_ads_daily_runs%rowtype;
  v_from date; v_to date; v_policy jsonb; v_row jsonb; v_key text; v_proof jsonb; v_sums jsonb;
  v_date date; v_rows jsonb; v_count integer; v_evidence text; v_now timestamptz:=clock_timestamp();
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>8388608 or
    jsonb_typeof(p_payload->'rows') is distinct from 'array' or
    (select count(*) from jsonb_object_keys(p_payload))<>11 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
    ('connection_id','run_id','lease','expected_connection_updated_at','date_from','date_to','policy','rows','totals','evidence','page_count')) then
    raise exception 'META_DAILY_INVALID_INPUT'; end if;
  select * into c from public.media_connections where id=(p_payload->>'connection_id')::uuid and provider='meta_ads' for update;
  if not found or c.status<>'active' or c.credential_version<>1 or c.last_verified_at is null or
    nullif(c.credential_ciphertext,'') is null or c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb or
    c.updated_at is distinct from (p_payload->>'expected_connection_updated_at')::timestamptz then raise exception 'META_CONTACT_CHANGED'; end if;
  select * into r from public.meta_ads_daily_runs where id=(p_payload->>'run_id')::uuid and connection_id=c.id for update;
  if not found or r.status<>'processing' or r.lease is distinct from (p_payload->>'lease')::uuid or r.lease_until<=v_now or
    r.connection_updated_at is distinct from c.updated_at then raise exception 'META_DAILY_LEASE_LOST'; end if;
  v_from:=(p_payload->>'date_from')::date; v_to:=(p_payload->>'date_to')::date;
  v_count:=jsonb_array_length(p_payload->'rows'); v_evidence:=p_payload->>'evidence';
  if v_from is null or v_to is null or v_from>v_to or v_to-v_from>=7 or v_from<r.start_date or v_to>r.target_date or
    v_to>=(v_now at time zone 'Asia/Seoul')::date or v_count>2500 or coalesce(p_payload->>'page_count','')!~'^[1-5]$' or
    coalesce(v_evidence,'') not in ('reported','omitted_on_complete_insights','no_data') then raise exception 'META_DAILY_INVALID_RANGE'; end if;
  v_policy:=c.meta->'meta_ads_reporting';
  if v_policy is distinct from p_payload->'policy' or v_policy is distinct from jsonb_build_object(
    'contract','meta_contact_snapshot_v1','enabled',true,'external_account_id',c.external_account_id,'currency','KRW','time_zone','Asia/Seoul',
    'conversion_field','conversions','conversion_action_type','contact_website','missing_conversion','zero_after_complete_reconciliation',
    'revenue','not_provided','attribution','platform_default','report_type','db') then raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  v_proof:=p_payload->'totals';
  if jsonb_typeof(v_proof) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_proof))<>4 then
    raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  foreach v_key in array array['impressions','clicks','spend','website_contacts'] loop
    if coalesce(v_proof->>v_key,'')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or (v_proof->>v_key)::numeric>9007199254740991 then
      raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
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
  select jsonb_build_object('impressions',coalesce(sum((x->>'impressions')::numeric),0),
    'clicks',coalesce(sum((x->>'clicks')::numeric),0),'spend',coalesce(sum((x->>'cost')::numeric),0),
    'website_contacts',coalesce(sum((x->>'conversions')::numeric),0)) into v_sums from jsonb_array_elements(p_payload->'rows') x;
  foreach v_key in array array['impressions','clicks','spend','website_contacts'] loop
    if (v_sums->>v_key)::numeric is distinct from (v_proof->>v_key)::numeric then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;
  if (v_evidence='no_data' and v_count<>0) or (v_evidence<>'reported' and (v_proof->>'website_contacts')::numeric<>0) then
    raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  for v_date in select d::date from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d loop
    select coalesce(jsonb_agg(x order by x->>'external_ad_id'),'[]'::jsonb) into v_rows
      from jsonb_array_elements(p_payload->'rows') x where x->>'date'=v_date::text;
    insert into public.meta_ads_daily_partitions(connection_id,tenant_id,workspace_id,advertiser_id,date,run_id,rows,row_count,content_hash,policy,proof,updated_at)
      values(c.id,c.tenant_id,c.workspace_id,c.advertiser_id,v_date,r.id,v_rows,jsonb_array_length(v_rows),md5(v_rows::text||v_policy::text),v_policy,
        jsonb_build_object('date_from',v_from,'date_to',v_to,'account_totals',v_proof,'evidence',v_evidence,
          'page_count',(p_payload->>'page_count')::integer,'complete',true),v_now)
      on conflict(connection_id,date) do update set run_id=excluded.run_id,rows=excluded.rows,row_count=excluded.row_count,
        content_hash=excluded.content_hash,policy=excluded.policy,proof=excluded.proof,updated_at=excluded.updated_at;
  end loop;
  return jsonb_build_object('row_count',v_count,'day_count',v_to-v_from+1);
end; $$;
revoke all on function public.replace_meta_ads_daily_window_v1(jsonb) from public,anon,authenticated;
grant execute on function public.replace_meta_ads_daily_window_v1(jsonb) to service_role;

create or replace function public.finish_meta_ads_daily_run_v1(p_run_id uuid,p_lease uuid,p_error text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare r public.meta_ads_daily_runs%rowtype; c public.media_connections%rowtype; v_id uuid;
  v_status text; v_missing integer; v_through date; v_now timestamptz:=clock_timestamp(); v_view jsonb;
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if p_error is not null and (length(p_error)>100 or p_error!~'^[A-Z_]+$') then raise exception 'META_DAILY_INVALID_INPUT'; end if;
  select connection_id into v_id from public.meta_ads_daily_runs where id=p_run_id;
  select * into c from public.media_connections where id=v_id for update;
  select * into r from public.meta_ads_daily_runs where id=p_run_id for update;
  if not found or r.status<>'processing' or r.lease is distinct from p_lease or r.lease_until<=v_now then raise exception 'META_DAILY_LEASE_LOST'; end if;
  if c.updated_at is distinct from r.connection_updated_at or c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb then
    update public.meta_ads_daily_runs set status='failed',error_code='META_CONTACT_CHANGED',finished_at=v_now where id=r.id;
    return jsonb_build_object('status','failed','error_code','META_CONTACT_CHANGED'); end if;
  select count(*),min(d::date)-1 into v_missing,v_through from generate_series(r.start_date::timestamp,r.target_date::timestamp,interval '1 day') d
    where not exists(select 1 from public.meta_ads_daily_partitions p where p.connection_id=c.id and p.date=d::date and p.policy=c.meta->'meta_ads_reporting');
  if v_missing=0 then v_through:=r.target_date; end if;
  v_status:=case when p_error is not null then 'failed' when v_missing>0 then 'partial' else 'done' end;
  update public.meta_ads_daily_runs set status=v_status,error_code=p_error,finished_at=v_now where id=r.id;
  v_view:=jsonb_build_object('status',v_status,'last_attempt_at',v_now,'target_date',r.target_date,
    'through_date',case when v_through>=r.start_date then v_through else null end,'start_date',r.start_date,'missing_days',v_missing,
    'last_success_at',case when v_status='done' then to_jsonb(v_now) else c.meta#>'{meta_ads_daily_status,last_success_at}' end,'error_code',p_error);
  update public.media_connections set meta=jsonb_set(meta,'{meta_ads_daily_status}',v_view,true),updated_at=v_now,
    last_sync_at=case when v_status='done' then v_now else last_sync_at end where id=c.id;
  return v_view;
end; $$;
revoke all on function public.finish_meta_ads_daily_run_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_meta_ads_daily_run_v1(uuid,uuid,text) to service_role;
