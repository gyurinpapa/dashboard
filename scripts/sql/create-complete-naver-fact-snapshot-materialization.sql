-- Etrylue Performance
-- Option B canonical fact -> snapshot projection.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- Complete one prepared Naver fact-backed snapshot ingestion.
--
-- This RPC:
--   - supports Naver Search Ads + snapshot_replace only
--   - does NOT compare projection expected_rows with chunk job row counts
--   - requires full durable partition coverage for the report projection period
--   - requires exact fact-row count == expected_rows
--   - requires report_ingestions.row_count == expected_rows
--   - allows authoritative zero-row snapshots
--   - marks only the projection-owned report_ingestion successful
--   - preserves current_ingestion_id / published_ingestion_id
--   - does not finish the media sync job
--   - does not update media_connections.last_sync_at

begin;

CREATE OR REPLACE FUNCTION public.complete_naver_fact_snapshot_materialization(
  p_payload jsonb
)
RETURNS TABLE(
  job jsonb,
  report_id uuid,
  snapshot_ingestion_id uuid,
  projection_start date,
  projection_end date,
  row_count bigint,
  completion_fingerprint text,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_snapshot_ingestion_id uuid;

  v_external_account_id text;

  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_is_primary_projection boolean;
  v_completion_fingerprint text;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFC_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFC_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or coalesce(p_payload->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$'
  then
    raise exception using
      message = 'MSFC_INVALID_INPUT: completion inputs are invalid';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;

    v_external_account_id := btrim(p_payload->>'external_account_id');

    v_projection_start := (p_payload->>'projection_start')::date;
    v_projection_end := (p_payload->>'projection_end')::date;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSFC_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_projection_start > v_projection_end
     or v_expected_rows < 0
     or v_expected_rows > 2147483647
  then
    raise exception using
      message = 'MSFC_INVALID_INPUT: completion values are invalid';
  end if;

  /*
   * Lock order:
   *   JOB -> REPORT -> PROJECTION -> INGESTION.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFC_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFC_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFC_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
  then
    raise exception using
      message = 'MSFC_SCOPE_MISMATCH: job scope is not projection-safe';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFC_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
  then
    raise exception using
      message = 'MSFC_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  if coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    )
       is distinct from v_projection_start
     or coalesce(
      v_report.draft_period_end,
      v_report.period_end,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_to}'
        ),
        ''
      )::date
    )
       is distinct from v_projection_end
  then
    raise exception using
      message = 'MSFC_PERIOD_CHANGED: report projection period changed during materialization';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;
  v_is_primary_projection := v_job.report_id = v_report_id;

  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFC_PROJECTION_NOT_FOUND: report projection was not prepared';
  end if;

  if v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id
     or v_projection.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFC_PROJECTION_CONFLICT: report projection authority is invalid';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_projection.previous_ingestion_id
  then
    raise exception using
      message = 'MSFC_POINTER_CHANGED: report current pointer changed before completion';
  end if;

  if v_is_primary_projection
     and (
       v_job.previous_ingestion_id
         is distinct from v_projection.previous_ingestion_id
       or v_job.snapshot_ingestion_id
         is distinct from v_snapshot_ingestion_id
     )
  then
    raise exception using
      message = 'MSFC_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
  end if;

  /*
   * Durable partition rows remain the zero-row-aware date authority.
   */
  v_expected_dates :=
    (v_projection_end - v_projection_start)::bigint + 1;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint
    into
      v_partition_dates,
      v_partition_rows
    from public.media_sync_fact_partitions as p
   where p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = 'naver_searchad'
     and p.external_account_id = v_external_account_id
     and p.date >= v_projection_start
     and p.date <= v_projection_end;

  if v_partition_dates <> v_expected_dates
     or v_partition_rows <> v_expected_rows
  then
    raise exception using
      message = 'MSFC_FACT_COVERAGE_CHANGED: canonical partition authority changed before completion';
  end if;

  /*
   * Recheck exact canonical row cardinality. This is intentionally a COUNT(*)
   * over the authoritative fact range, not a JSON rehash.
   */
  select count(*)::bigint
    into v_fact_rows
    from public.media_sync_fact_rows as f
   where f.workspace_id = v_workspace_id
     and f.advertiser_id = v_advertiser_id
     and f.provider = 'naver_searchad'
     and f.external_account_id = v_external_account_id
     and f.date >= v_projection_start
     and f.date <= v_projection_end;

  if v_fact_rows <> v_expected_rows then
    raise exception using
      message = 'MSFC_FACT_COUNT_MISMATCH: canonical fact row count changed before completion';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSFC_INGESTION_NOT_FOUND: projection ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by
     or v_ingestion.row_count is distinct from v_expected_rows::integer
  then
    raise exception using
      message = 'MSFC_MATERIALIZATION_INCOMPLETE: projection ingestion checkpoint is incomplete';
  end if;

  /*
   * Reject any impossible out-of-range destination row. Sequential bounded
   * batch verification plus row_count == expected_rows proves every expected
   * range was committed; this small indexed witness guards against extras.
   */
  if exists (
    select 1
      from public.report_rows as rr
     where rr.report_id = v_report_id
       and rr.ingestion_id = v_snapshot_ingestion_id
       and (
         rr.row_index < 0
         or rr.row_index >= v_expected_rows::integer
       )
     limit 1
  ) then
    raise exception using
      message = 'MSFC_MATERIALIZATION_CONFLICT: snapshot contains out-of-range report_rows';
  end if;

  if v_expected_rows = 0
     and exists (
       select 1
         from public.report_rows as rr
        where rr.report_id = v_report_id
          and rr.ingestion_id = v_snapshot_ingestion_id
        limit 1
     )
  then
    raise exception using
      message = 'MSFC_MATERIALIZATION_CONFLICT: zero-row snapshot contains report_rows';
  end if;

  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_projection_start::text || ':' ||
          v_projection_end::text || ':' ||
          v_expected_rows::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_ingestion.status = 'success' then
    v_idempotent := true;
  else
    update public.report_ingestions as ri
       set status = 'success',
           row_count = v_expected_rows::integer,
           error = null,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count = v_expected_rows::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSFC_COMPLETION_CONFLICT: snapshot ingestion could not be completed';
    end if;

    v_idempotent := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message = 'MSFC_POINTER_CHANGED: report pointers changed during completion';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_report_id,
    v_snapshot_ingestion_id,
    v_projection_start,
    v_projection_end,
    v_expected_rows,
    v_completion_fingerprint,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.complete_naver_fact_snapshot_materialization(jsonb)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.complete_naver_fact_snapshot_materialization(jsonb)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.complete_naver_fact_snapshot_materialization(jsonb)
FROM anon;

REVOKE ALL ON FUNCTION
  public.complete_naver_fact_snapshot_materialization(jsonb)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.complete_naver_fact_snapshot_materialization(jsonb)
TO service_role;

notify pgrst, 'reload schema';

commit;

