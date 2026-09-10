-- Etrylue Performance
-- Option B canonical fact -> snapshot projection.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- This prepare RPC:
--   - supports Naver Search Ads + snapshot_replace only
--   - treats job.date_from/date_to as fact replacement range only
--   - derives projection range from report draft period -> period
--   - requires the current chunk to have been replaced into canonical facts
--   - requires complete durable fact-partition coverage for the report period
--   - allows authoritative zero-row projections
--   - creates/resumes projection-owned report_ingestions
--   - creates/resumes media_sync_report_projections
--   - preserves current_ingestion_id / published_ingestion_id
--   - does not materialize report_rows
--   - does not finish the media sync job
--   - does not update media_connections.last_sync_at

begin;

CREATE OR REPLACE FUNCTION public.prepare_naver_fact_snapshot_materialization(
  p_payload jsonb
)
RETURNS TABLE(
  job jsonb,
  report_id uuid,
  previous_ingestion_id uuid,
  snapshot_ingestion_id uuid,
  projection_start date,
  projection_end date,
  expected_rows bigint,
  next_row_index bigint,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_connection public.media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_external_account_id text;

  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_job_expected_dates bigint;
  v_job_owned_dates bigint;
  v_job_partition_rows bigint;

  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_is_primary_projection boolean;
  v_next_row_index bigint;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFP_INVALID_INPUT: payload must be a JSON object';
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
  then
    raise exception using
      message = 'MSFP_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = '' then
    raise exception using
      message = 'MSFP_INVALID_INPUT: external_account_id is required';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_external_account_id := btrim(p_payload->>'external_account_id');
  exception
    when others then
      raise exception using
        message = 'MSFP_INVALID_INPUT: payload value could not be parsed';
  end;

  /*
   * Lock order:
   *   JOB -> REPORT -> CONNECTION -> PROJECTION/INGESTION.
   *
   * The job remains processing throughout prepare.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFP_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFP_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFP_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
  then
    raise exception using
      message = 'MSFP_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  if v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
  then
    raise exception using
      message = 'MSFP_JOB_INVALID: processing checkpoint is not projection-safe';
  end if;

  /*
   * Require the current chunk itself to have reached canonical fact storage.
   * Projection-period partitions may legitimately belong to older chunk jobs,
   * but every date owned by this job must now point to this exact job lineage.
   */
  v_job_expected_dates :=
    (v_job.date_to - v_job.date_from)::bigint + 1;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint
    into
      v_job_owned_dates,
      v_job_partition_rows
    from public.media_sync_fact_partitions as p
   where p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = 'naver_searchad'
     and p.external_account_id = v_external_account_id
     and p.date >= v_job.date_from
     and p.date <= v_job.date_to
     and p.source_connection_id = v_job.connection_id
     and p.source_report_id = v_job.report_id
     and p.source_job_id = v_job.id
     and p.source_job_created_at = v_job.created_at;

  if v_job_owned_dates <> v_job_expected_dates
     or v_job_partition_rows is distinct from v_job.inserted_rows::bigint
  then
    raise exception using
      message = 'MSFP_FACT_REPLACEMENT_INCOMPLETE: current job chunk is not fully committed to canonical facts';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message = 'MSFP_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
  then
    raise exception using
      message = 'MSFP_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  /*
   * Current projection authority:
   *   draft_period_start -> period_start -> meta.media_sync.date_from
   *   draft_period_end   -> period_end   -> meta.media_sync.date_to
   *
   * Job chunk dates are never a fallback for report period authority.
 * job.date_to only bounds an in-progress report's execution end for MTD.
   */
  v_projection_start :=
    coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    );

  v_projection_end :=
    coalesce(
      v_report.draft_period_end,
      v_report.period_end,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_to}'
        ),
        ''
      )::date
    );

  /*
   * Preserve the stored report period.
   * Only the execution projection end is bounded to the canonical
   * daily job authority for an in-progress month.
   */
  if v_projection_end is not null then
    v_projection_end :=
      least(
        v_projection_end,
        v_job.date_to
      );
  end if;

  if v_projection_start is null
     or v_projection_end is null
     or v_projection_start > v_projection_end
  then
    raise exception using
      message = 'MSFP_PERIOD_INVALID: report projection period is missing or invalid';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for share;

  if not found then
    raise exception using
      message = 'MSFP_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> 'naver_searchad'
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      message = 'MSFP_SCOPE_MISMATCH: media connection does not match the job';
  end if;

  /*
   * Durable date ownership is authoritative even for zero-row dates.
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

  if v_partition_dates <> v_expected_dates then
    raise exception using
      message = 'MSFP_FACT_COVERAGE_INCOMPLETE: canonical date partitions are incomplete';
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

  if v_fact_rows <> v_partition_rows then
    raise exception using
      message = 'MSFP_FACT_COUNT_MISMATCH: fact rows do not match durable partition authority';
  end if;

  v_expected_rows := v_fact_rows;

  if v_expected_rows > 2147483647 then
    raise exception using
      message = 'MSFP_INVALID_INPUT: expected rows exceed report_rows row_index capacity';
  end if;

  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  if v_is_primary_projection
     and v_report.current_ingestion_id
           is distinct from v_job.previous_ingestion_id
  then
    raise exception using
      message = 'MSFP_POINTER_CHANGED: primary report pointer no longer matches job baseline';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;

  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for update;

  if found then
    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFP_PROJECTION_CONFLICT: existing projection scope is invalid';
    end if;

    v_previous_ingestion_id := v_projection.previous_ingestion_id;
    v_snapshot_ingestion_id := v_projection.snapshot_ingestion_id;

    if v_report.current_ingestion_id
         is distinct from v_previous_ingestion_id
    then
      raise exception using
        message = 'MSFP_POINTER_CHANGED: target report pointer no longer matches projection baseline';
    end if;

    if v_is_primary_projection
       and (
         v_job.previous_ingestion_id
           is distinct from v_previous_ingestion_id
         or v_job.snapshot_ingestion_id
           is distinct from v_snapshot_ingestion_id
       )
    then
      raise exception using
        message = 'MSFP_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
    end if;
  else
    v_previous_ingestion_id := v_report.current_ingestion_id;

    if v_is_primary_projection
       and v_previous_ingestion_id
             is distinct from v_job.previous_ingestion_id
    then
      raise exception using
        message = 'MSFP_POINTER_CHANGED: primary projection baseline no longer matches job mirror';
    end if;

    insert into public.report_ingestions (
      workspace_id,
      report_id,
      kind,
      status,
      csv_path,
      row_count,
      error,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_workspace_id,
      v_report_id,
      'api',
      'processing',
      null,
      0,
      null,
      v_job.created_by,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    )
    returning id into v_snapshot_ingestion_id;

    begin
      insert into public.media_sync_report_projections (
        media_sync_job_id,
        workspace_id,
        advertiser_id,
        report_id,
        previous_ingestion_id,
        snapshot_ingestion_id,
        created_by
      )
      values (
        v_job_id,
        v_workspace_id,
        v_advertiser_id,
        v_report_id,
        v_previous_ingestion_id,
        v_snapshot_ingestion_id,
        v_job.created_by
      )
      returning * into v_projection;
    exception
      when unique_violation then
        raise exception using
          message = 'MSFP_PROJECTION_CONFLICT: projection identity is already bound';
    end;

    if v_is_primary_projection then
      if v_job.snapshot_ingestion_id is null then
        update public.media_sync_jobs as j
           set snapshot_ingestion_id = v_snapshot_ingestion_id,
               updated_at = pg_catalog.clock_timestamp()
         where j.id = v_job_id
           and j.status = 'processing'
           and j.snapshot_ingestion_id is null;

        if not found then
          raise exception using
            message = 'MSFP_PROJECTION_CONFLICT: primary snapshot mirror could not be recorded';
        end if;
      elsif v_job.snapshot_ingestion_id
              is distinct from v_snapshot_ingestion_id
      then
        raise exception using
          message = 'MSFP_PROJECTION_CONFLICT: primary snapshot mirror conflicts with projection';
      end if;
    end if;
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSFP_INGESTION_NOT_FOUND: projection ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFP_INGESTION_CONFLICT: projection ingestion is invalid';
  end if;

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer
    then
      raise exception using
        message = 'MSFP_INGESTION_CONFLICT: completed ingestion row count is invalid';
    end if;

    v_next_row_index := v_expected_rows;
    v_idempotent := true;
  else
    if v_ingestion.row_count is null
       or v_ingestion.row_count < 0
       or v_ingestion.row_count > v_expected_rows
    then
      raise exception using
        message = 'MSFP_INGESTION_CONFLICT: processing ingestion checkpoint is invalid';
    end if;

    v_next_row_index := v_ingestion.row_count::bigint;
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
      message = 'MSFP_POINTER_CHANGED: report pointers changed during prepare';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_report_id,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_projection_start,
    v_projection_end,
    v_expected_rows,
    v_next_row_index,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.prepare_naver_fact_snapshot_materialization(jsonb)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.prepare_naver_fact_snapshot_materialization(jsonb)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.prepare_naver_fact_snapshot_materialization(jsonb)
FROM anon;

REVOKE ALL ON FUNCTION
  public.prepare_naver_fact_snapshot_materialization(jsonb)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.prepare_naver_fact_snapshot_materialization(jsonb)
TO service_role;

notify pgrst, 'reload schema';

commit;

