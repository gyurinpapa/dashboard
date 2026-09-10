-- Etrylue Performance
-- Option B canonical fact -> snapshot projection.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- Bounded Naver canonical-fact materialization:
--   - source: media_sync_fact_rows, never media_sync_staging_rows
--   - deterministic order: (date, row_key)
--   - destination row_index: 0..expected_rows-1
--   - projection-owned snapshot ingestion
--   - atomic report_ingestions.row_count checkpoint
--   - exact bounded post-insert verification
--   - preserves current_ingestion_id / published_ingestion_id
--   - does not finish the media sync job
--   - does not update media_connections.last_sync_at
--   - zero-row projections intentionally skip this RPC

begin;

CREATE OR REPLACE FUNCTION public.materialize_naver_fact_snapshot_batch(
  p_payload jsonb
)
RETURNS TABLE(
  job jsonb,
  report_id uuid,
  snapshot_ingestion_id uuid,
  projection_start date,
  projection_end date,
  expected_rows bigint,
  batch_start bigint,
  batch_end_exclusive bigint,
  expected_batch_rows bigint,
  inserted_rows bigint,
  materialized_batch_rows bigint,
  next_row_index bigint,
  complete boolean,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
SET statement_timeout TO '2min'
AS $function$
#variable_conflict use_column
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
  v_batch_start bigint;
  v_batch_size bigint;
  v_batch_end_exclusive bigint;
  v_expected_batch_rows bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;

  v_source_batch_rows bigint;
  v_inserted_rows bigint := 0;
  v_materialized_batch_rows bigint;
  v_batch_mismatch_rows bigint;

  v_checkpoint_before bigint;
  v_next_row_index bigint;
  v_complete boolean := false;
  v_idempotent boolean := false;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_is_primary_projection boolean;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFB_INVALID_INPUT: payload must be a JSON object';
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
      message = 'MSFB_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or coalesce(p_payload->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_start', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_size', '') !~ '^[0-9]+$'
  then
    raise exception using
      message = 'MSFB_INVALID_INPUT: materialization inputs are invalid';
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
    v_batch_start := (p_payload->>'batch_start')::bigint;
    v_batch_size := (p_payload->>'batch_size')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSFB_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_projection_start > v_projection_end
     or v_expected_rows <= 0
     or v_expected_rows > 2147483647
     or v_batch_start < 0
     or v_batch_start >= v_expected_rows
     or v_batch_size <= 0
     or v_batch_size > 5000
  then
    raise exception using
      message = 'MSFB_INVALID_INPUT: materialization batch range is invalid';
  end if;

  v_batch_end_exclusive :=
    least(
      v_batch_start + v_batch_size,
      v_expected_rows
    );

  v_expected_batch_rows :=
    v_batch_end_exclusive - v_batch_start;

  /*
   * Lock order matches prepare:
   *   JOB -> REPORT -> PROJECTION -> INGESTION.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFB_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFB_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFB_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
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
      message = 'MSFB_SCOPE_MISMATCH: job scope is not projection-safe';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFB_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
  then
    raise exception using
      message = 'MSFB_SCOPE_MISMATCH: report scope does not match the job';
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
      message = 'MSFB_PERIOD_CHANGED: report projection period changed after prepare';
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
      message = 'MSFB_PROJECTION_NOT_FOUND: report projection was not prepared';
  end if;

  if v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id
     or v_projection.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFB_PROJECTION_CONFLICT: report projection authority is invalid';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_projection.previous_ingestion_id
  then
    raise exception using
      message = 'MSFB_POINTER_CHANGED: report current pointer changed after prepare';
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
      message = 'MSFB_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
  end if;

  /*
   * Revalidate durable report-period coverage without rescanning all fact JSON.
   * Exact fact-row count is revalidated by completion; each bounded batch
   * independently proves its own canonical source slice exists exactly.
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
      message = 'MSFB_FACT_COVERAGE_CHANGED: canonical partition authority changed after prepare';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSFB_INGESTION_NOT_FOUND: projection ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by
     or v_ingestion.row_count is null
     or v_ingestion.row_count < 0
     or v_ingestion.row_count > v_expected_rows
  then
    raise exception using
      message = 'MSFB_INGESTION_CONFLICT: projection ingestion checkpoint is invalid';
  end if;

  if v_ingestion.status = 'success'
     and v_ingestion.row_count is distinct from v_expected_rows::integer
  then
    raise exception using
      message = 'MSFB_INGESTION_CONFLICT: completed projection ingestion row count is invalid';
  end if;

  v_checkpoint_before := v_ingestion.row_count::bigint;

  if v_batch_start > v_checkpoint_before then
    raise exception using
      message = 'MSFB_CHECKPOINT_CONFLICT: batch start skips the ingestion checkpoint';
  end if;

  if v_checkpoint_before > v_batch_start
     and v_checkpoint_before < v_batch_end_exclusive
  then
    raise exception using
      message = 'MSFB_CHECKPOINT_CONFLICT: ingestion checkpoint falls inside the requested batch';
  end if;

  /*
   * Materialize the requested canonical slice first, then assign destination
   * row_index values relative to that slice. OFFSET/LIMIT are applied before
   * row_number(), preventing row-index double counting.
   */
  with bounded_source_base as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from public.media_sync_fact_rows as f
    where f.workspace_id = v_workspace_id
      and f.advertiser_id = v_advertiser_id
      and f.provider = 'naver_searchad'
      and f.external_account_id = v_external_account_id
      and f.date >= v_projection_start
      and f.date <= v_projection_end
    order by
      f.date,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  ),
  bounded_source as materialized (
    select
      b.workspace_id,
      b.advertiser_id,
      b.date,
      b.channel,
      b.device,
      b.source,
      b.row,
      b.row_key,
      (
        v_batch_start +
        row_number() over (
          order by b.date, b.row_key
        ) - 1
      )::integer as row_index
    from bounded_source_base as b
  )
  select count(*)::bigint
    into v_source_batch_rows
    from bounded_source;

  if v_source_batch_rows <> v_expected_batch_rows then
    raise exception using
      message = 'MSFB_FACT_SOURCE_INCOMPLETE: bounded canonical fact source is incomplete';
  end if;

  /*
   * If this exact range is already checkpointed, treat it as a replay and
   * verify only. Otherwise insert the range and atomically advance checkpoint.
   */
  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    with bounded_source_base as materialized (
      select
        f.workspace_id,
        f.advertiser_id,
        f.date,
        f.channel,
        f.device,
        f.source,
        f.row,
        f.row_key
      from public.media_sync_fact_rows as f
      where f.workspace_id = v_workspace_id
        and f.advertiser_id = v_advertiser_id
        and f.provider = 'naver_searchad'
        and f.external_account_id = v_external_account_id
        and f.date >= v_projection_start
        and f.date <= v_projection_end
      order by
        f.date,
        f.row_key
      offset v_batch_start
      limit v_expected_batch_rows
    ),
    bounded_source as materialized (
      select
        b.workspace_id,
        b.advertiser_id,
        b.date,
        b.channel,
        b.device,
        b.source,
        b.row,
        b.row_key,
        (
          v_batch_start +
          row_number() over (
            order by b.date, b.row_key
          ) - 1
        )::integer as row_index
      from bounded_source_base as b
    )
    insert into public.report_rows (
      workspace_id,
      report_id,
      advertiser_id,
      row_index,
      row,
      date,
      channel,
      device,
      source,
      ingestion_id
    )
    select
      s.workspace_id,
      v_report_id,
      s.advertiser_id,
      s.row_index,
      s.row,
      s.date,
      s.channel,
      s.device,
      s.source,
      v_snapshot_ingestion_id
    from bounded_source as s
    order by s.row_index
    on conflict (
      report_id,
      ingestion_id,
      row_index
    )
    where ingestion_id is not null
    do nothing;

    get diagnostics
      v_inserted_rows = row_count;
  else
    v_inserted_rows := 0;
  end if;

  /*
   * Exact bounded destination verification.
   */
  with bounded_source_base as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from public.media_sync_fact_rows as f
    where f.workspace_id = v_workspace_id
      and f.advertiser_id = v_advertiser_id
      and f.provider = 'naver_searchad'
      and f.external_account_id = v_external_account_id
      and f.date >= v_projection_start
      and f.date <= v_projection_end
    order by
      f.date,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  ),
  bounded_source as materialized (
    select
      b.workspace_id,
      b.advertiser_id,
      b.date,
      b.channel,
      b.device,
      b.source,
      b.row,
      b.row_key,
      (
        v_batch_start +
        row_number() over (
          order by b.date, b.row_key
        ) - 1
      )::integer as row_index
    from bounded_source_base as b
  )
  select
    count(r.id)::bigint,
    count(*) filter (
      where r.id is null
         or r.workspace_id <> s.workspace_id
         or r.report_id <> v_report_id
         or r.advertiser_id is distinct from s.advertiser_id
         or r.ingestion_id is distinct from v_snapshot_ingestion_id
         or r.row_index <> s.row_index
         or r.row is distinct from s.row
         or r.date is distinct from s.date
         or r.channel is distinct from s.channel
         or r.device is distinct from s.device
         or r.source is distinct from s.source
    )::bigint
    into
      v_materialized_batch_rows,
      v_batch_mismatch_rows
    from bounded_source as s
    left join public.report_rows as r
      on r.report_id = v_report_id
     and r.ingestion_id = v_snapshot_ingestion_id
     and r.row_index = s.row_index;

  if v_materialized_batch_rows <> v_expected_batch_rows
     or v_batch_mismatch_rows <> 0
  then
    raise exception using
      message = 'MSFB_MATERIALIZATION_CONFLICT: report_rows batch differs from canonical facts';
  end if;

  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    update public.report_ingestions as ri
       set row_count = v_batch_end_exclusive::integer,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count = v_batch_start::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSFB_CHECKPOINT_CONFLICT: processing checkpoint could not be advanced';
    end if;

    v_next_row_index := v_batch_end_exclusive;
    v_idempotent := false;
  else
    v_next_row_index := v_checkpoint_before;
    v_idempotent := true;
  end if;

  v_complete :=
    v_next_row_index >= v_expected_rows;

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
      message = 'MSFB_POINTER_CHANGED: report pointers changed during batch materialization';
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
    v_batch_start,
    v_batch_end_exclusive,
    v_expected_batch_rows,
    v_inserted_rows,
    v_materialized_batch_rows,
    v_next_row_index,
    v_complete,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.materialize_naver_fact_snapshot_batch(jsonb)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.materialize_naver_fact_snapshot_batch(jsonb)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.materialize_naver_fact_snapshot_batch(jsonb)
FROM anon;

REVOKE ALL ON FUNCTION
  public.materialize_naver_fact_snapshot_batch(jsonb)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.materialize_naver_fact_snapshot_batch(jsonb)
TO service_role;

notify pgrst, 'reload schema';

commit;

