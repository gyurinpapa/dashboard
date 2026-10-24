-- Supplemental report projections: no changes to collector mappings, queues,
-- scheduler functions, source rows, or reports.current_ingestion_id.
create table public.daily_report_meta_connections (
  report_id uuid primary key,
  connection_id uuid not null,
  tenant_id uuid not null, workspace_id uuid not null, advertiser_id uuid not null,
  created_by uuid not null, created_at timestamptz not null default clock_timestamp(),
  foreign key(tenant_id,workspace_id,advertiser_id,report_id)
    references public.reports(tenant_id,workspace_id,advertiser_id,id) on delete cascade,
  foreign key(tenant_id,workspace_id,advertiser_id,connection_id)
    references public.media_connections(tenant_id,workspace_id,advertiser_id,id) on delete restrict
);
create index daily_report_meta_connections_connection_idx on public.daily_report_meta_connections(connection_id);
create index daily_report_meta_connections_report_scope_idx on public.daily_report_meta_connections(tenant_id,workspace_id,advertiser_id,report_id);
create index daily_report_meta_connections_connection_scope_idx on public.daily_report_meta_connections(tenant_id,workspace_id,advertiser_id,connection_id);
create table public.daily_report_meta_snapshots (
  report_id uuid not null references public.reports(id) on delete cascade,
  source_ingestion_id uuid not null references public.report_ingestions(id),
  fingerprint text not null,
  snapshot_ingestion_id uuid not null unique references public.report_ingestions(id),
  connection_id uuid not null references public.media_connections(id),
  start_date date not null, through_date date not null,
  source_rows integer not null, meta_rows integer not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(report_id,source_ingestion_id,fingerprint)
);
create index daily_report_meta_snapshots_source_idx on public.daily_report_meta_snapshots(source_ingestion_id);
create index daily_report_meta_snapshots_connection_idx on public.daily_report_meta_snapshots(connection_id);
alter table public.daily_report_meta_connections enable row level security;
alter table public.daily_report_meta_snapshots enable row level security;
revoke all on public.daily_report_meta_connections,public.daily_report_meta_snapshots from public,anon,authenticated;
grant select,insert on public.daily_report_meta_connections,public.daily_report_meta_snapshots to service_role;

create function public.attach_daily_report_meta_v1(p_report_id uuid,p_connection_ids uuid[],p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare r public.reports%rowtype; c public.media_connections%rowtype; v_existing uuid[]; v_new uuid[]; v_attached uuid;
begin
  if current_user<>'service_role' then raise exception 'DAILY_META_FORBIDDEN'; end if;
  if p_user_id is null or cardinality(p_connection_ids) not between 1 and 16 or p_connection_ids is null or
    array_position(p_connection_ids,null) is not null or
    cardinality(p_connection_ids)<>(select count(distinct id) from unnest(p_connection_ids) id) then
    raise exception 'DAILY_META_INVALID_SELECTION'; end if;
  -- Add-only. Existing source mappings and the automation contract never change.
  select * into r from public.reports where id=p_report_id for update;
  if not found or r.status not in ('draft','ready') then raise exception 'DAILY_META_REPORT_REQUIRED'; end if;
  if (select count(*) from public.media_connections where id=any(p_connection_ids) and tenant_id=r.tenant_id
    and workspace_id=r.workspace_id and advertiser_id=r.advertiser_id and status='active'
    and nullif(credential_ciphertext,'') is not null)<>cardinality(p_connection_ids) then
    raise exception 'DAILY_META_SCOPE_MISMATCH'; end if;
  select coalesce(array_agg(connection_id),'{}'::uuid[]) into v_existing from (
    select connection_id from public.report_media_connections where report_id=r.id
    union select connection_id from public.manual_report_media_connections where report_id=r.id
    union select connection_id from public.daily_report_meta_connections where report_id=r.id
  ) m;
  select coalesce(array_agg(id),'{}'::uuid[]) into v_new from unnest(p_connection_ids) id where not(id=any(v_existing));
  if cardinality(v_new)=0 then return jsonb_build_object('status','unchanged'); end if;
  if cardinality(v_new)<>1 or r.meta#>>'{data_source,kind}' is distinct from 'api' or
    r.meta#>>'{data_source,provider}' is distinct from 'naver_searchad' or
    r.meta#>>'{public_identity,period_type}' is distinct from 'daily_sync' or
    r.meta#>>'{media_sync,auto_sync,contract}' is distinct from 'daily_report_v2' or
    r.meta#>>'{media_sync,auto_sync,start_date}' is distinct from r.meta#>>'{public_identity,period_key}' or
    not exists(select 1 from public.report_types where id=r.report_type_id and key='db') or
    (select count(*) from public.report_media_connections where report_id=r.id)<>1 or
    not exists(select 1 from public.report_media_connections m join public.media_connections n on n.id=m.connection_id
      where m.report_id=r.id and n.provider='naver_searchad' and n.tenant_id=r.tenant_id
      and n.workspace_id=r.workspace_id and n.advertiser_id=r.advertiser_id) then
    raise exception 'DAILY_META_UNSUPPORTED_REPORT'; end if;
  select * into c from public.media_connections where id=v_new[1] and provider='meta_ads';
  if not found or c.credential_version<>1 or c.last_verified_at is null or
    c.meta->'meta_ads_reporting' is distinct from jsonb_build_object('contract','meta_contact_snapshot_v1','enabled',true,
      'external_account_id',c.external_account_id,'currency','KRW','time_zone','Asia/Seoul','conversion_field','conversions',
      'conversion_action_type','contact_website','missing_conversion','zero_after_complete_reconciliation',
      'revenue','not_provided','attribution','platform_default','report_type','db') or
    c.meta#>>'{meta_ads_daily,contract}' is distinct from 'meta_daily_v1' or
    c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb or
    (c.meta#>>'{meta_ads_daily,start_date}')::date>(r.meta#>>'{public_identity,period_key}')::date then
    raise exception 'DAILY_META_POLICY_REQUIRED'; end if;
  select connection_id into v_attached from public.daily_report_meta_connections where report_id=r.id;
  if found and v_attached<>c.id then raise exception 'DAILY_META_ALREADY_ATTACHED'; end if;
  insert into public.daily_report_meta_connections(report_id,connection_id,tenant_id,workspace_id,advertiser_id,created_by)
    values(r.id,c.id,r.tenant_id,r.workspace_id,r.advertiser_id,p_user_id);
  update public.reports set meta=jsonb_set(coalesce(meta,'{}'::jsonb),'{daily_meta_attachment}',
    jsonb_build_object('contract','daily_meta_attachment_v1','connection_id',c.id),true) where id=r.id;
  return jsonb_build_object('status','attached','connection_id',c.id);
end; $$;

create function public.resolve_daily_report_meta_snapshot_v1(p_report_id uuid,p_source_ingestion_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare r public.reports%rowtype; c public.media_connections%rowtype; m public.daily_report_meta_connections%rowtype;
  s public.daily_report_v2_snapshot_runs%rowtype; cached public.daily_report_meta_snapshots%rowtype;
  v_days integer; v_meta_rows integer; v_source_rows integer; v_inserted integer; v_audit jsonb; v_rows jsonb;
  v_fingerprint text; v_snapshot uuid:=gen_random_uuid();
begin
  if current_user<>'service_role' then raise exception 'DAILY_META_FORBIDDEN'; end if;
  select * into m from public.daily_report_meta_connections where report_id=p_report_id;
  if not found then return jsonb_build_object('status','unattached','snapshot_ingestion_id',p_source_ingestion_id); end if;
  -- Serialize only this new projection; never lock a Naver queue or source report.
  perform pg_advisory_xact_lock(hashtextextended('daily_meta_projection|'||p_report_id::text,0));
  select * into r from public.reports where id=m.report_id and tenant_id=m.tenant_id
    and workspace_id=m.workspace_id and advertiser_id=m.advertiser_id;
  if not found or r.current_ingestion_id is distinct from p_source_ingestion_id or
    r.meta#>>'{data_source,provider}' is distinct from 'naver_searchad' or
    r.meta#>>'{public_identity,period_type}' is distinct from 'daily_sync' or
    r.meta#>>'{media_sync,auto_sync,contract}' is distinct from 'daily_report_v2' or
    not exists(select 1 from public.report_types where id=r.report_type_id and key='db') then
    raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  select * into s from public.daily_report_v2_snapshot_runs where report_id=r.id and workspace_id=r.workspace_id
    and advertiser_id=r.advertiser_id and snapshot_ingestion_id=p_source_ingestion_id and status='activated';
  if not found or s.start_date::text is distinct from r.meta#>>'{public_identity,period_key}' then
    raise exception 'DAILY_META_SOURCE_NOT_READY'; end if;
  select * into c from public.media_connections where id=m.connection_id and tenant_id=r.tenant_id
    and workspace_id=r.workspace_id and advertiser_id=r.advertiser_id and provider='meta_ads';
  if not found then raise exception 'DAILY_META_SCOPE_MISMATCH'; end if;
  -- Copy all partitions from one MVCC statement; a collector correction cannot mix versions.
  select count(*),coalesce(sum(row_count),0),jsonb_agg(jsonb_build_object('date',date,'hash',content_hash) order by date),
    coalesce(jsonb_agg(rows order by date),'[]'::jsonb)
    into v_days,v_meta_rows,v_audit,v_rows from public.meta_ads_daily_partitions
    where connection_id=c.id and tenant_id=r.tenant_id and workspace_id=r.workspace_id and advertiser_id=r.advertiser_id
      and date between s.start_date and s.through_date and policy=c.meta->'meta_ads_reporting';
  if v_days<>s.through_date-s.start_date+1 then raise exception 'DAILY_META_COVERAGE_INCOMPLETE'; end if;
  v_fingerprint:=md5(jsonb_build_object('source',p_source_ingestion_id,'connection',c.id,'partitions',v_audit,
    'policy',c.meta->'meta_ads_reporting')::text);
  select * into cached from public.daily_report_meta_snapshots where report_id=r.id
    and source_ingestion_id=p_source_ingestion_id and fingerprint=v_fingerprint;
  if found then return jsonb_build_object('status','ready','snapshot_ingestion_id',cached.snapshot_ingestion_id,
    'source_rows',cached.source_rows,'meta_rows',cached.meta_rows,'through_date',cached.through_date); end if;
  select count(*) into v_source_rows from public.report_rows where report_id=r.id and ingestion_id=p_source_ingestion_id;
  if v_source_rows<>s.expected_rows or v_source_rows+v_meta_rows>150000 or not exists(
    select 1 from public.report_ingestions where id=p_source_ingestion_id and report_id=r.id and workspace_id=r.workspace_id
      and kind='api' and status='success' and row_count=v_source_rows) or exists(
    select 1 from public.report_rows where report_id=r.id and ingestion_id=p_source_ingestion_id
      and (workspace_id<>r.workspace_id or advertiser_id is distinct from r.advertiser_id or
        row->>'provider' is distinct from 'naver_searchad')) then raise exception 'DAILY_META_SOURCE_INVALID'; end if;
  insert into public.report_ingestions(id,workspace_id,report_id,kind,status,row_count,created_by)
    values(v_snapshot,r.workspace_id,r.id,'api','success',v_source_rows+v_meta_rows,m.created_by);
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select workspace_id,report_id,advertiser_id,(row_number() over(order by row_index))::integer-1,
      row,date,channel,device,source,v_snapshot from public.report_rows where report_id=r.id and ingestion_id=p_source_ingestion_id;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_source_rows then raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select r.workspace_id,r.id,r.advertiser_id,v_source_rows+(row_number() over(order by day_ord,row_ord))::integer-1,
      x,(x->>'date')::date,'Meta Ads','','Meta Ads',v_snapshot
    from jsonb_array_elements(v_rows) with ordinality d(day_rows,day_ord)
    cross join lateral jsonb_array_elements(day_rows) with ordinality a(x,row_ord);
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_meta_rows then raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  if (select current_ingestion_id from public.reports where id=r.id) is distinct from p_source_ingestion_id then
    raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  insert into public.daily_report_meta_snapshots(report_id,source_ingestion_id,fingerprint,snapshot_ingestion_id,
    connection_id,start_date,through_date,source_rows,meta_rows)
    values(r.id,p_source_ingestion_id,v_fingerprint,v_snapshot,c.id,s.start_date,s.through_date,v_source_rows,v_meta_rows);
  return jsonb_build_object('status','ready','snapshot_ingestion_id',v_snapshot,
    'source_rows',v_source_rows,'meta_rows',v_meta_rows,'through_date',s.through_date);
end; $$;
revoke all on function public.attach_daily_report_meta_v1(uuid,uuid[],uuid),
  public.resolve_daily_report_meta_snapshot_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.attach_daily_report_meta_v1(uuid,uuid[],uuid),
  public.resolve_daily_report_meta_snapshot_v1(uuid,uuid) to service_role;
