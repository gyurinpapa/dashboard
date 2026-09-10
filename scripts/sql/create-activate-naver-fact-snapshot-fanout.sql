-- Etrylue Performance
-- Option B canonical fact -> snapshot projection.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- Atomically activate every prepared Naver fact-backed report projection
-- for one media-sync job.
--
-- Why this RPC exists:
--   - fanout reports can have different projection periods and row counts
--   - per-report activation in separate transactions can leave partial fanout
--   - this RPC validates the exact projection set, then moves every current
--     pointer in one database transaction or moves none
--
-- Contract:
--   - Naver Search Ads + snapshot_replace only
--   - exact payload projection set == DB projection set
--   - all reports must be uniformly at previous pointers OR uniformly at
--     snapshot pointers; mixed state fails closed
--   - each ingestion must already be success with its own expected_rows
--   - each projection period must match stored report authority with the job.date_to MTD cap
--   - durable fact partitions + fact row count are revalidated per report
--   - published_ingestion_id is never changed
--   - media_sync_jobs state is never changed
--   - media_connections state is never changed
--   - retry after a fully committed activation is idempotent

begin;

CREATE OR REPLACE FUNCTION public.activate_naver_fact_snapshot_fanout(
  p_payload jsonb
)
RETURNS TABLE(
  job jsonb,
  projection_count bigint,
  primary_report_id uuid,
  primary_previous_ingestion_id uuid,
  primary_snapshot_ingestion_id uuid,
  primary_current_ingestion_id uuid,
  primary_published_ingestion_id uuid,
  primary_row_count bigint,
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
  v_previous_ingestion_id uuid;
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

  v_previous_state_count bigint := 0;
  v_snapshot_state_count bigint := 0;

  v_primary_report_id uuid;
  v_primary_previous_ingestion_id uuid;
  v_primary_snapshot_ingestion_id uuid;
  v_primary_current_ingestion_id uuid;
  v_primary_published_ingestion_id uuid;
  v_primary_row_count bigint;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFX_INVALID_INPUT: payload must be a JSON object';
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
      message = 'MSFX_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or jsonb_typeof(p_payload->'projections') <> 'array'
     or jsonb_array_length(p_payload->'projections') = 0
  then
    raise exception using
      message = 'MSFX_INVALID_INPUT: external account and non-empty projections are required';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_payload->'projections') as item(value)
     where jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value->>'report_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or (
          item.value ? 'previous_ingestion_id'
          and item.value->'previous_ingestion_id' <> 'null'::jsonb
          and coalesce(item.value->>'previous_ingestion_id', '') !~*
               '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
        or coalesce(item.value->>'snapshot_ingestion_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(item.value->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'expected_rows', '') !~ '^[0-9]+$'
  ) then
    raise exception using
      message = 'MSFX_INVALID_INPUT: projection payload is invalid';
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
        message = 'MSFX_INVALID_INPUT: payload value could not be parsed';
  end;

  /*
   * Job-first lock keeps the projection set stable against prepare and
   * finalization for this execution.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFX_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFX_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFX_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
     or v_job.snapshot_ingestion_id is null
  then
    raise exception using
      message = 'MSFX_SCOPE_MISMATCH: job scope is not projection-safe';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for share;

  if not found then
    raise exception using
      message = 'MSFX_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> 'naver_searchad'
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      message = 'MSFX_SCOPE_MISMATCH: media connection does not match the job';
  end if;

  select
    jsonb_array_length(p_payload->'projections')::bigint,
    count(distinct (item.value->>'report_id'))::bigint
    into
      v_payload_projection_count,
      v_payload_distinct_report_count
    from jsonb_array_elements(p_payload->'projections') as item(value);

  if v_payload_projection_count <> v_payload_distinct_report_count then
    raise exception using
      message = 'MSFX_PROJECTION_SET_CONFLICT: duplicate report projection payload';
  end if;

  select count(*)::bigint
    into v_db_projection_count
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id;

  if v_db_projection_count = 0
     or v_db_projection_count <> v_payload_projection_count
  then
    raise exception using
      message = 'MSFX_PROJECTION_SET_CONFLICT: payload projection set does not match DB projection set';
  end if;

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
      message = 'MSFX_PROJECTION_SET_CONFLICT: DB projection is missing from payload';
  end if;

  /*
   * Validate and lock every target report in deterministic report_id order.
   * No pointer is updated in this pass.
   */
  for v_projection_payload in
    select item.value
      from jsonb_array_elements(p_payload->'projections') as item(value)
     order by item.value->>'report_id'
  loop
    begin
      v_report_id :=
        (v_projection_payload->>'report_id')::uuid;

      v_previous_ingestion_id :=
        nullif(v_projection_payload->>'previous_ingestion_id', '')::uuid;

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
          message = 'MSFX_INVALID_INPUT: projection payload value could not be parsed';
    end;

    if v_projection_start > v_projection_end
       or v_expected_rows < 0
       or v_expected_rows > 2147483647
    then
      raise exception using
        message = 'MSFX_INVALID_INPUT: projection values are invalid';
    end if;

    select *
      into v_projection
      from public.media_sync_report_projections as p
     where p.media_sync_job_id = v_job_id
       and p.report_id = v_report_id
     for share;

    if not found then
      raise exception using
        message = 'MSFX_PROJECTION_SET_CONFLICT: report projection was not prepared';
    end if;

    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.previous_ingestion_id
            is distinct from v_previous_ingestion_id
       or v_projection.snapshot_ingestion_id
            is distinct from v_snapshot_ingestion_id
       or v_projection.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFX_PROJECTION_CONFLICT: projection authority does not match the request';
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
        message = 'MSFX_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
    end if;

    select *
      into v_report
      from public.reports as r
     where r.id = v_report_id
     for update;

    if not found then
      raise exception using
        message = 'MSFX_REPORT_NOT_FOUND: projection report was not found';
    end if;

    if v_report.workspace_id <> v_workspace_id
       or v_report.advertiser_id is distinct from v_advertiser_id
    then
      raise exception using
        message = 'MSFX_SCOPE_MISMATCH: projection report scope does not match the job';
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
       or (
         coalesce(
           v_report.draft_period_end,
           v_report.period_end,
           nullif(
             btrim(
               v_report.meta #>> '{media_sync,date_to}'
             ),
             ''
           )::date
         ) is null
         or least(
           coalesce(
             v_report.draft_period_end,
             v_report.period_end,
             nullif(
               btrim(
                 v_report.meta #>> '{media_sync,date_to}'
               ),
               ''
             )::date
           ),
           v_job.date_to
         ) is distinct from v_projection_end
       )
    then
      raise exception using
        message = 'MSFX_PERIOD_CHANGED: report projection period changed before fanout activation';
    end if;

    if v_report.current_ingestion_id
         is not distinct from v_previous_ingestion_id
    then
      v_previous_state_count :=
        v_previous_state_count + 1;
    elsif v_report.current_ingestion_id
            is not distinct from v_snapshot_ingestion_id
    then
      v_snapshot_state_count :=
        v_snapshot_state_count + 1;
    else
      raise exception using
        message = 'MSFX_ACTIVATION_CONFLICT: report current pointer is neither previous nor snapshot';
    end if;

    select *
      into v_ingestion
      from public.report_ingestions as ri
     where ri.id = v_snapshot_ingestion_id
     for share;

    if not found then
      raise exception using
        message = 'MSFX_INGESTION_NOT_FOUND: projection ingestion was not found';
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
        message = 'MSFX_SNAPSHOT_INVALID: completed projection ingestion is invalid';
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
        message = 'MSFX_FACT_COVERAGE_CHANGED: canonical partition authority changed before fanout activation';
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
        message = 'MSFX_FACT_COUNT_MISMATCH: canonical fact row count changed before fanout activation';
    end if;

    if v_report_id = v_job.report_id then
      v_primary_report_id := v_report_id;
      v_primary_previous_ingestion_id := v_previous_ingestion_id;
      v_primary_snapshot_ingestion_id := v_snapshot_ingestion_id;
      v_primary_published_ingestion_id := v_report.published_ingestion_id;
      v_primary_row_count := v_expected_rows;
    end if;
  end loop;

  if v_primary_report_id is null
     or v_primary_snapshot_ingestion_id is null
  then
    raise exception using
      message = 'MSFX_PROJECTION_SET_CONFLICT: primary report projection is missing';
  end if;

  if v_previous_state_count > 0
     and v_snapshot_state_count > 0
  then
    raise exception using
      message = 'MSFX_PARTIAL_FANOUT_STATE: fanout reports are partially activated';
  end if;

  if v_snapshot_state_count = v_payload_projection_count then
    v_idempotent := true;
  elsif v_previous_state_count = v_payload_projection_count then
    v_idempotent := false;
  else
    raise exception using
      message = 'MSFX_ACTIVATION_CONFLICT: fanout pointer state is inconsistent';
  end if;

  /*
   * All updates below are in this same function transaction. Any failure
   * rolls back every report pointer update.
   */
  if not v_idempotent then
    for v_projection_payload in
      select item.value
        from jsonb_array_elements(p_payload->'projections') as item(value)
       order by item.value->>'report_id'
    loop
      v_report_id :=
        (v_projection_payload->>'report_id')::uuid;

      v_previous_ingestion_id :=
        nullif(v_projection_payload->>'previous_ingestion_id', '')::uuid;

      v_snapshot_ingestion_id :=
        (v_projection_payload->>'snapshot_ingestion_id')::uuid;

      update public.reports as r
         set current_ingestion_id = v_snapshot_ingestion_id
       where r.id = v_report_id
         and r.workspace_id = v_workspace_id
         and r.advertiser_id is not distinct from v_advertiser_id
         and r.current_ingestion_id is not distinct from v_previous_ingestion_id;

      if not found then
        raise exception using
          message = 'MSFX_ACTIVATION_CONFLICT: report pointer changed during atomic fanout activation';
      end if;
    end loop;
  end if;

  /*
   * Exact post-activation witness for every report.
   */
  for v_projection_payload in
    select item.value
      from jsonb_array_elements(p_payload->'projections') as item(value)
     order by item.value->>'report_id'
  loop
    v_report_id :=
      (v_projection_payload->>'report_id')::uuid;

    v_snapshot_ingestion_id :=
      (v_projection_payload->>'snapshot_ingestion_id')::uuid;

    select *
      into v_report
      from public.reports as r
     where r.id = v_report_id;

    if not found
       or v_report.current_ingestion_id
            is distinct from v_snapshot_ingestion_id
    then
      raise exception using
        message = 'MSFX_ACTIVATION_CONFLICT: report pointer failed atomic fanout activation postcheck';
    end if;

    if v_report_id = v_job.report_id then
      v_primary_current_ingestion_id :=
        v_report.current_ingestion_id;

      if v_report.published_ingestion_id
           is distinct from v_primary_published_ingestion_id
      then
        raise exception using
          message = 'MSFX_PUBLISHED_POINTER_CHANGED: primary published pointer changed during activation';
      end if;
    end if;
  end loop;

  if v_primary_current_ingestion_id
       is distinct from v_primary_snapshot_ingestion_id
  then
    raise exception using
      message = 'MSFX_ACTIVATION_CONFLICT: primary report did not activate its snapshot';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'processing'
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
  then
    raise exception using
      message = 'MSFX_JOB_STATE_CHANGED: protected media sync job state changed unexpectedly';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_payload_projection_count,
    v_primary_report_id,
    v_primary_previous_ingestion_id,
    v_primary_snapshot_ingestion_id,
    v_primary_current_ingestion_id,
    v_primary_published_ingestion_id,
    v_primary_row_count,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.activate_naver_fact_snapshot_fanout(jsonb)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.activate_naver_fact_snapshot_fanout(jsonb)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.activate_naver_fact_snapshot_fanout(jsonb)
FROM anon;

REVOKE ALL ON FUNCTION
  public.activate_naver_fact_snapshot_fanout(jsonb)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.activate_naver_fact_snapshot_fanout(jsonb)
TO service_role;

notify pgrst, 'reload schema';

commit;

