-- Etrylue Performance — OFFLINE SQL CANDIDATE ONLY. NOT A DEPLOYMENT SCRIPT.
-- No production execution approved. This file intentionally ends in ROLLBACK.
-- Baseline: supplied DB export 2026-09-19T21:53:06Z, project ref unverified.
-- Sequence for a FUTURE approved isolated test transaction: staging ->
-- materialization -> atomic activation -> finalization. Standalone scripts
-- roll back; an isolated harness must load bodies together, never Production.
-- No table/index/RLS/trigger changes. Built-in and existing extensions only.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $baseline_guard$
BEGIN
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='lock_meta_ads_snapshot_fanout') then
    raise exception 'META_NAME_ALREADY_EXISTS: lock_meta_ads_snapshot_fanout';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='activate_meta_ads_snapshot_fanout') then
    raise exception 'META_NAME_ALREADY_EXISTS: activate_meta_ads_snapshot_fanout';
  end if;
END;
$baseline_guard$;

CREATE FUNCTION public.lock_meta_ads_snapshot_fanout(p_payload jsonb, p_finalizing boolean)
RETURNS jsonb
LANGUAGE plpgsql volatile
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

declare
  m_job public.media_sync_jobs%rowtype; m_connection public.media_connections%rowtype;
  m_projection public.media_sync_report_projections%rowtype; m_report public.reports%rowtype;
  m_ingestion public.report_ingestions%rowtype; m_mapping public.report_media_connections%rowtype;
  m_targets jsonb; m_target jsonb; m_results jsonb := '[]'::jsonb;
  m_expected integer; m_count integer; m_mapped integer := 0;
  m_previous integer := 0; m_active integer := 0; m_token text;
begin
  -- LOCK_ORDER: job -> connection -> mappings -> projections -> reports -> ingestions.
  -- The same helper is used by Meta activation AND finalization.
  select * into m_job from public.media_sync_jobs where id=(p_payload->>'job_id')::uuid for update;
  perform public.assert_meta_ads_execution_scope(m_job,p_payload,p_finalizing);
  m_expected := (p_payload->>'expected_rows')::integer;
  if not (p_payload ?& array['report_id','previous_ingestion_id','snapshot_ingestion_id','expected_rows'])
     or m_expected is null or m_expected<=0 or m_job.raw_rows is distinct from m_expected
     or m_job.normalized_rows is distinct from m_expected or m_job.inserted_rows is distinct from m_expected
     or m_job.failed_rows<>0 or m_job.snapshot_ingestion_id is null
     or (p_payload->>'report_id')::uuid is distinct from m_job.report_id
     or (p_payload->>'previous_ingestion_id')::uuid is distinct from m_job.previous_ingestion_id
     or (p_payload->>'snapshot_ingestion_id')::uuid is distinct from m_job.snapshot_ingestion_id
     then raise exception 'META_FANOUT_EXECUTION_INVALID'; end if;
  select * into m_connection from public.media_connections where id=m_job.connection_id for update;
  if not found or m_connection.status is distinct from 'active'
     or m_connection.workspace_id is distinct from m_job.workspace_id
     or m_connection.advertiser_id is distinct from m_job.advertiser_id
     or m_connection.provider is distinct from 'meta_ads'
     or m_connection.external_account_id is distinct from m_job.external_account_id
     then raise exception 'META_FANOUT_CONNECTION_INVALID'; end if;
  -- Connection FOR UPDATE also conflicts with FK key-share checks for new mappings.
  for m_mapping in select * from public.report_media_connections
    where connection_id=m_job.connection_id order by report_id for share loop
    if m_mapping.workspace_id is distinct from m_job.workspace_id
       or m_mapping.advertiser_id is distinct from m_job.advertiser_id
       or m_mapping.tenant_id is distinct from m_connection.tenant_id
       then raise exception 'META_FANOUT_MAPPING_SCOPE_INVALID'; end if;
    m_mapped := m_mapped+1;
  end loop;
  perform 1 from public.media_sync_report_projections where media_sync_job_id=m_job.id order by report_id for share;
  select count(*) into m_count from public.media_sync_report_projections where media_sync_job_id=m_job.id;
  if m_count=0 or m_count<>m_mapped
     or not exists(select 1 from public.media_sync_report_projections where media_sync_job_id=m_job.id and report_id=m_job.report_id)
     or exists(
    select 1 from public.report_media_connections m where m.connection_id=m_job.connection_id
    and not exists(select 1 from public.media_sync_report_projections p where p.media_sync_job_id=m_job.id and p.report_id=m.report_id)
  ) then raise exception 'META_FANOUT_MAPPING_SET_CHANGED'; end if;
  if p_finalizing then
    -- The DB projection set is finalization authority. Snapshot IDs are never
    -- taken from the primary mirror for secondary reports.
    select jsonb_agg(jsonb_build_object('report_id',p.report_id,'previous_ingestion_id',p.previous_ingestion_id,
      'snapshot_ingestion_id',p.snapshot_ingestion_id,'expected_rows',m_expected) order by p.report_id)
    into m_targets from public.media_sync_report_projections p where p.media_sync_job_id=m_job.id;
  else
    m_targets := p_payload->'projections';
    if jsonb_typeof(m_targets) is distinct from 'array' then raise exception 'META_FANOUT_TARGETS_INVALID'; end if;
    if jsonb_array_length(m_targets)<>m_count or
       (select count(distinct (x.value->>'report_id')::uuid) from jsonb_array_elements(m_targets) x(value))<>m_count
       then raise exception 'META_FANOUT_TARGET_SET_INVALID'; end if;
    if exists(select 1 from public.media_sync_report_projections p where p.media_sync_job_id=m_job.id
      and not exists(select 1 from jsonb_array_elements(m_targets) x(value) where (x.value->>'report_id')::uuid=p.report_id))
      then raise exception 'META_FANOUT_TARGET_SET_INVALID'; end if;
  end if;
  for m_target in select value from jsonb_array_elements(m_targets) order by (value->>'report_id')::uuid loop
    select * into m_projection from public.media_sync_report_projections
      where media_sync_job_id=m_job.id and report_id=(m_target->>'report_id')::uuid;
    if not found or not (m_target ?& array['report_id','previous_ingestion_id','snapshot_ingestion_id','expected_rows'])
       or m_projection.previous_ingestion_id is not distinct from m_projection.snapshot_ingestion_id
       or m_projection.workspace_id is distinct from m_job.workspace_id
       or m_projection.advertiser_id is distinct from m_job.advertiser_id
       or m_projection.created_by is distinct from m_job.created_by
       or m_projection.previous_ingestion_id is distinct from (m_target->>'previous_ingestion_id')::uuid
       or m_projection.snapshot_ingestion_id is distinct from (m_target->>'snapshot_ingestion_id')::uuid
       or (m_target->>'expected_rows')::integer is distinct from m_expected
       then raise exception 'META_FANOUT_PROJECTION_AUTHORITY_INVALID'; end if;
    if m_projection.report_id=m_job.report_id and
       (m_projection.previous_ingestion_id is distinct from m_job.previous_ingestion_id
        or m_projection.snapshot_ingestion_id is distinct from m_job.snapshot_ingestion_id)
       then raise exception 'META_FANOUT_PRIMARY_MIRROR_INVALID'; end if;
    select * into m_report from public.reports where id=m_projection.report_id for update;
    if not found or m_report.workspace_id is distinct from m_job.workspace_id
       or m_report.advertiser_id is distinct from m_job.advertiser_id
       or m_report.tenant_id is distinct from m_connection.tenant_id
       or m_report.meta #>> '{data_source,kind}' is distinct from 'api'
       or coalesce(m_report.draft_period_start,m_report.period_start,
         nullif(btrim(m_report.meta #>> '{media_sync,date_from}'),'')::date) is distinct from m_job.date_from
       or coalesce(m_report.draft_period_end,m_report.period_end,
         nullif(btrim(m_report.meta #>> '{media_sync,date_to}'),'')::date) is distinct from m_job.date_to
       then raise exception 'META_FANOUT_REPORT_SCOPE_OR_PERIOD_INVALID'; end if;
    -- This first Meta snapshot contains one connection's canonical dataset.
    -- Combined multi-media reports need a separate combined projection contract.
    if exists(select 1 from public.report_media_connections m where m.report_id=m_report.id
      and m.connection_id<>m_job.connection_id) then raise exception 'META_FANOUT_MULTI_CONNECTION_REPORT_UNSUPPORTED'; end if;
    if not p_finalizing and (not (m_target ? 'published_ingestion_id') or
       m_report.published_ingestion_id is distinct from (m_target->>'published_ingestion_id')::uuid)
       then raise exception 'META_FANOUT_PUBLISHED_BASELINE_CHANGED'; end if;
    if m_report.current_ingestion_id is not distinct from m_projection.snapshot_ingestion_id then
      m_active := m_active+1;
    elsif m_report.current_ingestion_id is not distinct from m_projection.previous_ingestion_id then
      m_previous := m_previous+1;
    else raise exception 'META_FANOUT_CURRENT_POINTER_CONFLICT'; end if;
    select * into m_ingestion from public.report_ingestions where id=m_projection.snapshot_ingestion_id for share;
    if not found or m_ingestion.report_id is distinct from m_report.id
       or m_ingestion.workspace_id is distinct from m_job.workspace_id
       or m_ingestion.created_by is distinct from m_job.created_by or m_ingestion.kind is distinct from 'api'
       or m_ingestion.status is distinct from 'success' or m_ingestion.row_count is distinct from m_expected
       or m_ingestion.csv_path is not null or m_ingestion.error is not null
       then raise exception 'META_FANOUT_SNAPSHOT_INCOMPLETE'; end if;
    m_token := encode(extensions.digest(convert_to(m_job.id::text||':'||m_report.id::text||':'||m_ingestion.id::text||':'||
      m_expected::text||':0:'||(m_expected-1)::text||':0:'||(m_expected-1)::text,'UTF8'),'sha256'),'hex');
    m_results := m_results || jsonb_build_array(jsonb_build_object('report_id',m_report.id,
      'previous_ingestion_id',m_projection.previous_ingestion_id,'snapshot_ingestion_id',m_projection.snapshot_ingestion_id,
      'published_ingestion_id',m_report.published_ingestion_id,'expected_rows',m_expected,'completion_token',m_token));
  end loop;
  if (m_previous>0 and m_active>0) or (p_finalizing and m_active<>m_count)
     then raise exception 'META_FANOUT_PARTIAL_OR_NOT_ACTIVE'; end if;
  return jsonb_build_object('job',to_jsonb(m_job),'projections',m_results,'projection_count',m_count,
    'all_active',m_active=m_count,'connection_last_sync_at',m_connection.last_sync_at);
end;
$function$;

ALTER FUNCTION public.lock_meta_ads_snapshot_fanout(jsonb, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_meta_ads_snapshot_fanout(jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_meta_ads_snapshot_fanout(jsonb, boolean) TO service_role;

CREATE FUNCTION public.activate_meta_ads_snapshot_fanout(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql volatile
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

declare m_witness jsonb; m_item jsonb; m_job public.media_sync_jobs%rowtype;
begin
  m_witness := public.lock_meta_ads_snapshot_fanout(p_payload,false);
  -- VALIDATE_ALL_BEFORE_FIRST_UPDATE: every target is locked and validated.
  if not (m_witness->>'all_active')::boolean then
    for m_item in select value from jsonb_array_elements(m_witness->'projections') order by (value->>'report_id')::uuid loop
      update public.reports set current_ingestion_id=(m_item->>'snapshot_ingestion_id')::uuid
        where id=(m_item->>'report_id')::uuid
          and current_ingestion_id is not distinct from (m_item->>'previous_ingestion_id')::uuid
          and published_ingestion_id is not distinct from (m_item->>'published_ingestion_id')::uuid;
      if not found then raise exception 'META_FANOUT_UPDATE_CONFLICT'; end if;
    end loop;
  end if;
  -- A later exception rolls back ALL writes in this RPC. No exception handler
  -- swallows a failure, and no finalization or connection update occurs here.
  if exists(select 1 from jsonb_array_elements(m_witness->'projections') x(value)
    left join public.reports r on r.id=(x.value->>'report_id')::uuid
    where r.id is null or r.current_ingestion_id is distinct from (x.value->>'snapshot_ingestion_id')::uuid
      or r.published_ingestion_id is distinct from (x.value->>'published_ingestion_id')::uuid)
    then raise exception 'META_FANOUT_POSTCHECK_FAILED'; end if;
  select * into m_job from public.media_sync_jobs where id=(p_payload->>'job_id')::uuid;
  if to_jsonb(m_job) is distinct from m_witness->'job' then raise exception 'META_FANOUT_JOB_CHANGED'; end if;
  return jsonb_build_object('job',to_jsonb(m_job),'projection_count',m_witness->'projection_count',
    'projections',m_witness->'projections','idempotent',m_witness->'all_active');
end;
$function$;

ALTER FUNCTION public.activate_meta_ads_snapshot_fanout(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.activate_meta_ads_snapshot_fanout(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_meta_ads_snapshot_fanout(jsonb) TO service_role;

ROLLBACK;
