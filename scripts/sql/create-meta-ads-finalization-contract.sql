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
  if pg_catalog.to_regprocedure('public.finalize_media_sync_job(jsonb)') is null or
     pg_catalog.md5(pg_catalog.pg_get_functiondef('public.finalize_media_sync_job(jsonb)'::regprocedure)) is distinct from 'fca01f2c6fa292c4f7cf8374255b6933' then
    raise exception 'META_BASELINE_DRIFT: finalize_media_sync_job';
  end if;
END;
$baseline_guard$;

CREATE OR REPLACE FUNCTION public.finalize_media_sync_job(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, current_ingestion_id uuid, published_ingestion_id uuid, row_count bigint, staging_fingerprint text, materialized_fingerprint text, finished_at timestamp with time zone, connection_id uuid, connection_last_sync_at timestamp with time zone, connection_updated boolean, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;
  v_connection public.media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_provider text;
  v_external_account_id text;
  v_date_from date;
  v_date_to date;
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_expected_rows bigint;

  v_completion_fingerprint text;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;
  v_previous_ingestion_before uuid;
  v_snapshot_ingestion_before uuid;
  v_raw_rows_before integer;
  v_normalized_rows_before integer;
  v_inserted_rows_before integer;
  v_failed_rows_before integer;
  v_error_detail_before jsonb;

  v_finished_at timestamptz;
  v_connection_updated boolean := false;
  v_idempotent boolean := false;
begin
/* META_ONLY_BEGIN:meta_atomic_finalize */
  if p_payload->>'provider' = 'meta_ads' then
    declare
      m_witness jsonb; m_job public.media_sync_jobs%rowtype; m_primary jsonb;
      m_finished timestamptz; m_last_sync timestamptz; m_updated boolean := false; m_idempotent boolean;
    begin
      m_witness := public.lock_meta_ads_snapshot_fanout(p_payload,true);
      select j.* into m_job from public.media_sync_jobs as j where j.id=(p_payload->>'job_id')::uuid;
      select value into m_primary from jsonb_array_elements(m_witness->'projections')
        where (value->>'report_id')::uuid=m_job.report_id;
      if m_primary is null then raise exception 'META_FINALIZE_PRIMARY_MISSING'; end if;
      m_idempotent := m_job.status='done';
      if not m_idempotent then
        m_finished := clock_timestamp();
        update public.media_sync_jobs as j set status='done',progress=100,finished_at=m_finished,error=null,updated_at=m_finished
          where j.id=m_job.id and j.status='processing' and j.finished_at is null returning j.* into m_job;
        if not found then raise exception 'META_FINALIZE_CONFLICT'; end if;
      end if;
      m_finished := m_job.finished_at;
      update public.media_connections as c set last_sync_at=m_finished,last_error=null,updated_at=clock_timestamp()
        where c.id=m_job.connection_id and (c.last_sync_at is null or c.last_sync_at<m_finished)
        returning c.last_sync_at into m_last_sync;
      m_updated := found;
      if not m_updated then select c.last_sync_at into m_last_sync from public.media_connections as c where c.id=m_job.connection_id; end if;
      if (to_jsonb(m_job)-array['status','progress','finished_at','error','updated_at']) is distinct from
         ((m_witness->'job')-array['status','progress','finished_at','error','updated_at'])
         then raise exception 'META_FINALIZE_EXECUTION_CHANGED'; end if;
      if exists(select 1 from jsonb_array_elements(m_witness->'projections') x(value)
        left join public.reports r on r.id=(x.value->>'report_id')::uuid
        where r.id is null or r.current_ingestion_id is distinct from (x.value->>'snapshot_ingestion_id')::uuid
          or r.published_ingestion_id is distinct from (x.value->>'published_ingestion_id')::uuid)
          then raise exception 'META_FINALIZE_POINTER_CHANGED'; end if;
      return query select to_jsonb(m_job),m_job.snapshot_ingestion_id,m_job.snapshot_ingestion_id,
        (m_primary->>'published_ingestion_id')::uuid,m_job.inserted_rows::bigint,
        m_primary->>'completion_token',m_primary->>'completion_token',m_finished,m_job.connection_id,
        m_last_sync,m_updated,m_idempotent;
      return;
    end;
  end if;
/* META_ONLY_END:meta_atomic_finalize */
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using message = 'MSF_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSF_INVALID_INPUT: invalid UUID input';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSF_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using message = 'MSF_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_provider := btrim(p_payload->>'provider');
    v_external_account_id := btrim(p_payload->>'external_account_id');
    v_date_from := (p_payload->>'date_from')::date;
    v_date_to := (p_payload->>'date_to')::date;
    v_previous_ingestion_id := nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using message = 'MSF_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0
     or (
       v_expected_rows = 0
       and v_provider <> 'naver_searchad'
     ) then
    raise exception using message = 'MSF_INVALID_INPUT: payload values are invalid';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using message = 'MSF_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status = 'done' then
    v_idempotent := true;
  elsif v_job.status = 'processing' then
    v_idempotent := false;
  else
    raise exception using message = 'MSF_JOB_NOT_PROCESSING: media sync job must be processing or already done';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using message = 'MSF_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.id <> v_job_id
     or v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to then
    raise exception using message = 'MSF_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  /*
   * V2-B downstream projection authority.
   *
   * Lock order is intentionally JOB FOR UPDATE -> PROJECTION FOR SHARE -> REPORT.
   * The projection owns the downstream previous/snapshot pointer binding.
   * The media_sync_job columns remain compatibility mirrors and the payload
   * pointer values remain request assertions; every copy must match exactly.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by is distinct from v_job.created_by
     or v_projection.previous_ingestion_id is distinct from v_job.previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_job.snapshot_ingestion_id
     or v_projection.previous_ingestion_id is distinct from v_previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report projection authority does not match the job and request';
  end if;

  v_previous_ingestion_id := v_projection.previous_ingestion_id;
  v_snapshot_ingestion_id := v_projection.snapshot_ingestion_id;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using message = 'MSF_SCOPE_MISMATCH: unsupported media sync mode';
  end if;

  if v_job.snapshot_ingestion_id is null then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: media sync job has no materialized snapshot';
  end if;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: final checkpoint counts do not match';
  end if;

  if v_idempotent then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.error is not null then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: completed job state is inconsistent';
    end if;
    v_finished_at := v_job.finished_at;
  end if;

  v_previous_ingestion_before := v_job.previous_ingestion_id;
  v_snapshot_ingestion_before := v_job.snapshot_ingestion_id;
  v_raw_rows_before := v_job.raw_rows;
  v_normalized_rows_before := v_job.normalized_rows;
  v_inserted_rows_before := v_job.inserted_rows;
  v_failed_rows_before := v_job.failed_rows;
  v_error_detail_before := v_job.error_detail;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using message = 'MSF_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;

  if v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: report current pointer does not use the materialized snapshot';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for update;

  if not found then
    raise exception using message = 'MSF_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> v_provider
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active' then
    raise exception using message = 'MSF_SCOPE_MISMATCH: media connection scope does not match the job';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id;

  if not found then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: active report ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count is distinct from v_expected_rows::integer
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: active report ingestion does not match the job';
  end if;

  /*
   * Constant-time finalization verification.
   *
   * prepare validates complete staging integrity. Every bounded materialization
   * batch then compares staging with report_rows exactly and advances
   * report_ingestions.row_count in the same transaction. Completion succeeds
   * only after that checkpoint reaches expected_rows and marks the API
   * ingestion successful.
   *
   * Re-reading all fresh staging/report_rows rows here would repeat work that
   * has already committed and can exceed the API role statement_timeout.
   */
  if v_ingestion.row_count
       is distinct from v_expected_rows::integer
     or v_ingestion.status <> 'success'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: completed materialization checkpoint is invalid';
  end if;

  /*
   * Contract-compatible deterministic completion token.
   * This is identical to the constant-time token returned by
   * complete_media_sync_snapshot_materialization().
   */
  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_expected_rows::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if not v_idempotent then
    /*
     * Macro 3-A3 execution-finalization authority.
     *
     * Finalization remains a single execution/job transition owned by the
     * primary projection compatibility binding. Before processing -> done,
     * every report projection for this job must already be independently
     * activated to its own projection-owned snapshot, and that snapshot
     * ingestion must be complete and successful.
     *
     * The job row is already locked FOR UPDATE above. Activation uses the
     * same job-first lock order, so this gate serializes against activation
     * for the same execution without changing report pointer ownership.
     */
    if exists (
      select 1
      from public.media_sync_report_projections as fp
      left join public.reports as fr
        on fr.id = fp.report_id
      left join public.report_ingestions as fi
        on fi.id = fp.snapshot_ingestion_id
      where fp.media_sync_job_id = v_job_id
        and (
          fp.workspace_id <> v_workspace_id
          or fp.advertiser_id <> v_advertiser_id
          or fp.created_by is distinct from v_job.created_by
          or fr.id is null
          or fr.workspace_id <> v_workspace_id
          or fr.advertiser_id is distinct from v_advertiser_id
          or fr.current_ingestion_id
               is distinct from fp.snapshot_ingestion_id
          or fi.id is null
          or fi.workspace_id <> v_workspace_id
          or fi.report_id <> fp.report_id
          or fi.kind <> 'api'
          or fi.status <> 'success'
          or fi.row_count is distinct from v_expected_rows::integer
          or fi.csv_path is not null
          or fi.error is not null
          or fi.created_by is distinct from v_job.created_by
        )
    ) then
      raise exception using
        message = 'MSF_PROJECTIONS_NOT_ACTIVE: every report projection must be activated before job finalization';
    end if;

    v_finished_at := pg_catalog.clock_timestamp();

    update public.media_sync_jobs as j
       set status = 'done',
           progress = 100,
           finished_at = v_finished_at,
           error = null,
           updated_at = v_finished_at
     where j.id = v_job_id
       and j.status = 'processing'
       and j.snapshot_ingestion_id = v_snapshot_ingestion_id
       and j.previous_ingestion_id is not distinct from v_previous_ingestion_id
       and j.finished_at is null;

    if not found then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: media sync job changed during finalization';
    end if;
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.error is not null
     or v_job.previous_ingestion_id is distinct from v_previous_ingestion_before
     or v_job.snapshot_ingestion_id is distinct from v_snapshot_ingestion_before
     or v_job.raw_rows is distinct from v_raw_rows_before
     or v_job.normalized_rows is distinct from v_normalized_rows_before
     or v_job.inserted_rows is distinct from v_inserted_rows_before
     or v_job.failed_rows is distinct from v_failed_rows_before
     or v_job.error_detail is distinct from v_error_detail_before then
    raise exception using message = 'MSF_FINALIZATION_CONFLICT: finalized job violates the contract';
  end if;

  v_finished_at := v_job.finished_at;

  if v_connection.last_sync_at is null
     or v_connection.last_sync_at < v_finished_at then
    update public.media_connections as c
       set last_sync_at = v_finished_at,
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
     where c.id = v_connection_id
       and c.workspace_id = v_workspace_id
       and c.advertiser_id = v_advertiser_id
       and c.provider = v_provider
       and c.external_account_id = v_external_account_id
       and c.status = 'active'
       and (
         c.last_sync_at is null
         or c.last_sync_at < v_finished_at
       )
     returning * into v_connection;

    if not found then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: media connection changed during finalization';
    end if;

    v_connection_updated := true;
  else
    v_connection_updated := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id is distinct from v_current_ingestion_before
     or v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id
     or v_report.published_ingestion_id is distinct from v_published_ingestion_before then
    raise exception using message = 'MSF_FINALIZATION_CONFLICT: report pointer changed during finalization';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_expected_rows,
    v_completion_fingerprint,
    v_completion_fingerprint,
    v_finished_at,
    v_connection.id,
    v_connection.last_sync_at,
    v_connection_updated,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.finalize_media_sync_job(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_media_sync_job(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_media_sync_job(jsonb) TO service_role;

ROLLBACK;
