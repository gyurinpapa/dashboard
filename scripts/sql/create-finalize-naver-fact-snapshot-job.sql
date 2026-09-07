-- Etrylue Performance
-- Option B canonical fact -> snapshot projection.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- Finalize one Naver fact-backed media-sync execution only after every
-- projection for the job is independently activated.
--
-- This RPC:
--   - supports Naver Search Ads + snapshot_replace only
--   - accepts the complete fanout projection contract as payload
--   - requires payload projection set == DB projection set exactly
--   - validates each report's current period, active snapshot ingestion,
--     durable partition coverage, and canonical fact cardinality
--   - never compares a report projection row count with the chunk job row count
--   - marks the media_sync_job done only after all projections validate
--   - updates media_connections.last_sync_at only for full snapshot completion
--   - preserves published_ingestion_id
--   - preserves job previous/snapshot mirrors and row-count lineage
--   - supports idempotent done retry

begin;

CREATE OR REPLACE FUNCTION public.finalize_naver_fact_snapshot_job(
  p_payload jsonb
)
RETURNS TABLE(
  job jsonb,
  finished_at timestamptz,
  connection_id uuid,
  connection_last_sync_at timestamptz,
  connection_updated boolean,
  projection_count bigint,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_connection public.media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_external_account_id text;

  v_projection_payload jsonb;
  v_report_id uuid;
  v_snapshot_ingestion_id uuid;
  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_payload_projection_count bigint;
  v_payload_distinct_report_count bigint;
  v_db_projection_count bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_finished_at timestamptz;
  v_connection_updated boolean := false;
  v_idempotent boolean := false;

  v_previous_ingestion_before uuid;
  v_snapshot_ingestion_before uuid;
  v_raw_rows_before integer;
  v_normalized_rows_before integer;
  v_inserted_rows_before integer;
  v_failed_rows_before integer;
  v_error_detail_before jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFF_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFF_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or jsonb_typeof(p_payload->'projections') <> 'array'
     or jsonb_array_length(p_payload->'projections') = 0
  then
    raise exception using
      message = 'MSFF_INVALID_INPUT: external account and non-empty projections are required';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_payload->'projections') as item(value)
     where jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value->>'report_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(item.value->>'snapshot_ingestion_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(item.value->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'expected_rows', '') !~ '^[0-9]+$'
  ) then
    raise exception using
      message = 'MSFF_INVALID_INPUT: projection payload is invalid';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_external_account_id := btrim(p_payload->>'external_account_id');
  exception
    when others then
      raise exception using
        message = 'MSFF_INVALID_INPUT: payload value could not be parsed';
  end;

  /*
   * Job-first locking serializes prepare / activation / finalization for this
   * execution and prevents projection-set growth after the exact-set gate.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFF_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status = 'done' then
    v_idempotent := true;
  elsif v_job.status = 'processing' then
    v_idempotent := false;
  else
    raise exception using
      message = 'MSFF_JOB_NOT_FINALIZABLE: media sync job must be processing or already done';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFF_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
     or v_job.snapshot_ingestion_id is null
  then
    raise exception using
      message = 'MSFF_SCOPE_MISMATCH: job scope is not full-projection safe';
  end if;

  if v_idempotent then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.error is not null
    then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: completed job state is inconsistent';
    end if;
  else
    if v_job.finished_at is not null then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: processing job already has finished_at';
    end if;
  end if;

  v_previous_ingestion_before := v_job.previous_ingestion_id;
  v_snapshot_ingestion_before := v_job.snapshot_ingestion_id;
  v_raw_rows_before := v_job.raw_rows;
  v_normalized_rows_before := v_job.normalized_rows;
  v_inserted_rows_before := v_job.inserted_rows;
  v_failed_rows_before := v_job.failed_rows;
  v_error_detail_before := v_job.error_detail;

  select
    jsonb_array_length(p_payload->'projections')::bigint,
    count(distinct (item.value->>'report_id'))::bigint
    into
      v_payload_projection_count,
      v_payload_distinct_report_count
    from jsonb_array_elements(p_payload->'projections') as item(value);

  if v_payload_projection_count <> v_payload_distinct_report_count then
    raise exception using
      message = 'MSFF_PROJECTION_SET_CONFLICT: duplicate report projection payload';
  end if;

  select count(*)::bigint
    into v_db_projection_count
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id;

  if v_db_projection_count = 0
     or v_db_projection_count <> v_payload_projection_count
  then
    raise exception using
      message = 'MSFF_PROJECTION_SET_CONFLICT: payload projection set does not match DB projection set';
  end if;

  /*
   * Validate every payload projection independently. Different fanout reports
   * may have different period ranges and row counts.
   */
  for v_projection_payload in
    select item.value
      from jsonb_array_elements(p_payload->'projections') as item(value)
  loop
    begin
      v_report_id :=
        (v_projection_payload->>'report_id')::uuid;

      v_snapshot_ingestion_id :=
        (v_projection_payload->>'snapshot_ingestion_id')::uuid;

      v_projection_start :=
        (v_projection_payload->>'projection_start')::date;

      v_projection_end :=
        (v_projection_payload->>'projection_end')::date;

      v_expected_rows :=
        (v_projection_payload->>'expected_rows')::bigint;
    exception
      when others then
        raise exception using
          message = 'MSFF_INVALID_INPUT: projection payload value could not be parsed';
    end;

    if v_projection_start > v_projection_end
       or v_expected_rows < 0
       or v_expected_rows > 2147483647
    then
      raise exception using
        message = 'MSFF_INVALID_INPUT: projection values are invalid';
    end if;

    select *
      into v_projection
      from public.media_sync_report_projections as p
     where p.media_sync_job_id = v_job_id
       and p.report_id = v_report_id
     for share;

    if not found then
      raise exception using
        message = 'MSFF_PROJECTION_SET_CONFLICT: projection payload report was not prepared';
    end if;

    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.snapshot_ingestion_id
            is distinct from v_snapshot_ingestion_id
       or v_projection.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFF_PROJECTION_CONFLICT: projection authority is invalid';
    end if;

    if v_report_id = v_job.report_id
       and (
         v_projection.previous_ingestion_id
           is distinct from v_job.previous_ingestion_id
         or v_projection.snapshot_ingestion_id
           is distinct from v_job.snapshot_ingestion_id
       )
    then
      raise exception using
        message = 'MSFF_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
    end if;

    select *
      into v_report
      from public.reports as r
     where r.id = v_report_id
     for share;

    if not found then
      raise exception using
        message = 'MSFF_REPORT_NOT_FOUND: projection report was not found';
    end if;

    if v_report.workspace_id <> v_workspace_id
       or v_report.advertiser_id is distinct from v_advertiser_id
       or v_report.current_ingestion_id
            is distinct from v_snapshot_ingestion_id
    then
      raise exception using
        message = 'MSFF_PROJECTION_NOT_ACTIVE: report does not use its projection snapshot';
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
        message = 'MSFF_PERIOD_CHANGED: projection report period changed before finalization';
    end if;

    select *
      into v_ingestion
      from public.report_ingestions as ri
     where ri.id = v_snapshot_ingestion_id
     for share;

    if not found then
      raise exception using
        message = 'MSFF_INGESTION_NOT_FOUND: active projection ingestion was not found';
    end if;

    if v_ingestion.workspace_id <> v_workspace_id
       or v_ingestion.report_id <> v_report_id
       or v_ingestion.kind <> 'api'
       or v_ingestion.status <> 'success'
       or v_ingestion.row_count is distinct from v_expected_rows::integer
       or v_ingestion.csv_path is not null
       or v_ingestion.error is not null
       or v_ingestion.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFF_SNAPSHOT_INVALID: active projection ingestion is invalid';
    end if;

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
        message = 'MSFF_FACT_COVERAGE_CHANGED: canonical partition authority changed before finalization';
    end if;

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
        message = 'MSFF_FACT_COUNT_MISMATCH: canonical fact row count changed before finalization';
    end if;
  end loop;

  /*
   * Exact-set defense in the opposite direction: every DB projection must have
   * exactly one payload entry.
   */
  if exists (
    select 1
      from public.media_sync_report_projections as p
     where p.media_sync_job_id = v_job_id
       and not exists (
         select 1
           from jsonb_array_elements(p_payload->'projections') as item(value)
          where item.value->>'report_id' = p.report_id::text
       )
  ) then
    raise exception using
      message = 'MSFF_PROJECTION_SET_CONFLICT: DB projection is missing from payload';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for update;

  if not found then
    raise exception using
      message = 'MSFF_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> 'naver_searchad'
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      message = 'MSFF_SCOPE_MISMATCH: media connection does not match the job';
  end if;

  if not v_idempotent then
    v_finished_at := pg_catalog.clock_timestamp();

    update public.media_sync_jobs as j
       set status = 'done',
           progress = 100,
           finished_at = v_finished_at,
           error = null,
           updated_at = v_finished_at
     where j.id = v_job_id
       and j.status = 'processing'
       and j.finished_at is null
       and j.snapshot_ingestion_id is not distinct from v_snapshot_ingestion_before
       and j.previous_ingestion_id is not distinct from v_previous_ingestion_before
       and j.raw_rows is not distinct from v_raw_rows_before
       and j.normalized_rows is not distinct from v_normalized_rows_before
       and j.inserted_rows is not distinct from v_inserted_rows_before
       and j.failed_rows is not distinct from v_failed_rows_before
       and j.error_detail is not distinct from v_error_detail_before;

    if not found then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: media sync job changed during finalization';
    end if;
  else
    v_finished_at := v_job.finished_at;
  end if;

  /*
   * Full projection completion owns connection freshness. Fact-only chunk
   * completion intentionally does not update this field.
   */
  if v_connection.last_sync_at is null
     or v_connection.last_sync_at < v_finished_at
  then
    update public.media_connections as c
       set last_sync_at = v_finished_at,
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
     where c.id = v_connection_id
       and c.workspace_id = v_workspace_id
       and c.advertiser_id = v_advertiser_id
       and c.provider = 'naver_searchad'
       and c.external_account_id = v_external_account_id
       and c.status = 'active'
       and (
         c.last_sync_at is null
         or c.last_sync_at < v_finished_at
       )
    returning *
      into v_connection;

    if not found then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: media connection changed during finalization';
    end if;

    v_connection_updated := true;
  else
    v_connection_updated := false;
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.error is not null
     or v_job.previous_ingestion_id
          is distinct from v_previous_ingestion_before
     or v_job.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_before
     or v_job.raw_rows is distinct from v_raw_rows_before
     or v_job.normalized_rows is distinct from v_normalized_rows_before
     or v_job.inserted_rows is distinct from v_inserted_rows_before
     or v_job.failed_rows is distinct from v_failed_rows_before
     or v_job.error_detail is distinct from v_error_detail_before
  then
    raise exception using
      message = 'MSFF_FINALIZATION_CONFLICT: finalized job violates the protected-state contract';
  end if;

  v_finished_at := v_job.finished_at;

  return query
  select
    to_jsonb(v_job),
    v_finished_at,
    v_connection.id,
    v_connection.last_sync_at,
    v_connection_updated,
    v_db_projection_count,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.finalize_naver_fact_snapshot_job(jsonb)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.finalize_naver_fact_snapshot_job(jsonb)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.finalize_naver_fact_snapshot_job(jsonb)
FROM anon;

REVOKE ALL ON FUNCTION
  public.finalize_naver_fact_snapshot_job(jsonb)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.finalize_naver_fact_snapshot_job(jsonb)
TO service_role;

notify pgrst, 'reload schema';

commit;

