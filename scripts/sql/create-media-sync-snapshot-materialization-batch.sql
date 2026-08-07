-- Etrylue Performance
-- Canonical bounded media sync snapshot materialization batch RPC.
--
-- Production source-of-truth for:
--   public.materialize_media_sync_snapshot_batch(jsonb)
--
-- Important:
-- - bounded staging-driven post-insert verification
-- - atomic report_ingestions.row_count checkpoint advance
-- - never changes current_ingestion_id / published_ingestion_id
-- - service_role only

begin;

CREATE OR REPLACE FUNCTION public.materialize_media_sync_snapshot_batch(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, batch_start bigint, batch_end_exclusive bigint, expected_batch_rows bigint, inserted_rows bigint, materialized_batch_rows bigint, next_row_index bigint, complete boolean, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_snapshot_ingestion_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;
  v_batch_start bigint;
  v_batch_size bigint;
  v_batch_end_exclusive bigint;
  v_expected_batch_rows bigint;

  v_existing_batch_rows bigint;
  v_inserted_rows bigint;
  v_materialized_batch_rows bigint;
  v_batch_mismatch_rows bigint;

  v_next_row_index bigint;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_complete boolean := false;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: payload must be a JSON object';
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
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_start', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_size', '') !~ '^[0-9]+$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: numeric materialization inputs are invalid';
  end if;

  begin
    v_job_id :=
      (p_payload->>'job_id')::uuid;

    v_report_id :=
      (p_payload->>'report_id')::uuid;

    v_workspace_id :=
      (p_payload->>'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload->>'advertiser_id')::uuid;

    v_connection_id :=
      (p_payload->>'connection_id')::uuid;

    v_snapshot_ingestion_id :=
      (p_payload->>'snapshot_ingestion_id')::uuid;

    v_provider :=
      btrim(p_payload->>'provider');

    v_external_account_id :=
      btrim(p_payload->>'external_account_id');

    v_date_from :=
      (p_payload->>'date_from')::date;

    v_date_to :=
      (p_payload->>'date_to')::date;

    v_expected_rows :=
      (p_payload->>'expected_rows')::bigint;

    v_batch_start :=
      (p_payload->>'batch_start')::bigint;

    v_batch_size :=
      (p_payload->>'batch_size')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSMM_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows <= 0
     or v_batch_start < 0
     or v_batch_start >= v_expected_rows
     or v_batch_size <= 0
     or v_batch_size > 5000 then
    raise exception using
      message = 'MSMM_INVALID_INPUT: materialization batch range is invalid';
  end if;

  v_batch_end_exclusive :=
    least(
      v_batch_start + v_batch_size,
      v_expected_rows
    );

  v_expected_batch_rows :=
    v_batch_end_exclusive - v_batch_start;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSMM_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad' then
    raise exception using
      message = 'MSMM_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
     or v_job.mode <> 'snapshot_replace'
     or v_job.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: batch scope does not match the job';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id
          is distinct from v_advertiser_id
     or v_report.current_ingestion_id
          is distinct from v_job.previous_ingestion_id then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report pointer no longer matches the materialization baseline';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion does not match the job';
  end if;

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: completed ingestion row count is invalid';
    end if;

    v_complete := true;
  else
    if v_ingestion.row_count is null
       or v_ingestion.row_count < 0
       or v_ingestion.row_count > v_expected_rows then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: processing snapshot checkpoint is invalid';
    end if;

    if v_batch_start <>
         v_ingestion.row_count::bigint then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: batch start does not match the processing checkpoint';
    end if;
  end if;

  select count(*)::bigint
    into v_existing_batch_rows
    from public.report_rows as r
   where r.report_id = v_report_id
     and r.ingestion_id = v_snapshot_ingestion_id
     and r.row_index >= v_batch_start::integer
     and r.row_index < v_batch_end_exclusive::integer;

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
    s.report_id,
    s.advertiser_id,
    s.row_index::integer,
    s.row,
    s.date,
    s.channel,
    s.device,
    s.source,
    v_snapshot_ingestion_id
  from public.media_sync_staging_rows as s
  where s.job_id = v_job_id
    and s.row_index >= v_batch_start
    and s.row_index < v_batch_end_exclusive
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

  /*
   * Verify from the bounded staging range outward.
   *
   * The destination-driven form can choose the broad
   * (report_id, ingestion_id) index and filter row_index only after scanning
   * many rows from the growing snapshot. Keep verification proportional to the
   * current batch by materializing the bounded staging rows first and doing one
   * exact destination lookup per row.
   */
  with bounded_staging as materialized (
    select
      s.id,
      s.workspace_id,
      s.report_id,
      s.advertiser_id,
      s.row_index,
      s.row,
      s.date,
      s.channel,
      s.device,
      s.source
    from public.media_sync_staging_rows as s
    where s.job_id = v_job_id
      and s.row_index >= v_batch_start
      and s.row_index < v_batch_end_exclusive
  )
  select
    count(r.id)::bigint,

    count(*) filter (
      where r.id is null
         or r.workspace_id <> s.workspace_id
         or r.report_id <> s.report_id
         or r.advertiser_id
              is distinct from s.advertiser_id
         or r.ingestion_id
              is distinct from v_snapshot_ingestion_id
         or r.row_index <> s.row_index::integer
         or r.row is distinct from s.row
         or r.date is distinct from s.date
         or r.channel is distinct from s.channel
         or r.device is distinct from s.device
         or r.source is distinct from s.source
    )::bigint
  into
    v_materialized_batch_rows,
    v_batch_mismatch_rows
  from bounded_staging as s
  left join lateral (
    select
      r.id,
      r.workspace_id,
      r.report_id,
      r.advertiser_id,
      r.ingestion_id,
      r.row_index,
      r.row,
      r.date,
      r.channel,
      r.device,
      r.source
    from public.report_rows as r
    where r.report_id = v_report_id
      and r.ingestion_id = v_snapshot_ingestion_id
      and r.row_index = s.row_index::integer
    limit 1
  ) as r
    on true;

  if v_materialized_batch_rows <> v_expected_batch_rows
     or v_batch_mismatch_rows <> 0 then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: materialized batch differs from staging';
  end if;

  if v_existing_batch_rows = v_expected_batch_rows
     and v_inserted_rows = 0 then
    v_idempotent := true;
  else
    v_idempotent := false;
  end if;

  /*
   * Atomically advance the processing checkpoint only after the complete
   * bounded range has been inserted and exactly verified.
   *
   * Because this update is in the same transaction as the batch insert and
   * comparison, a failed or timed-out batch cannot leave row_count ahead of
   * committed report_rows.
   *
   * Completed snapshots are exact-retried from row 0 and therefore do not
   * mutate the already-final row_count.
   */
  if v_ingestion.status = 'processing' then
    update public.report_ingestions as ri
       set row_count =
             v_batch_end_exclusive::integer,
           updated_at =
             pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count =
             v_batch_start::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: processing checkpoint could not be advanced';
    end if;
  end if;

  v_next_row_index :=
    v_batch_end_exclusive;

  v_complete :=
    v_next_row_index >= v_expected_rows;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report ingestion pointer changed during batch materialization';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
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

revoke all on function
  public.materialize_media_sync_snapshot_batch(jsonb)
from public;

revoke all on function
  public.materialize_media_sync_snapshot_batch(jsonb)
from anon;

revoke all on function
  public.materialize_media_sync_snapshot_batch(jsonb)
from authenticated;

grant execute on function
  public.materialize_media_sync_snapshot_batch(jsonb)
to service_role;

notify pgrst, 'reload schema';

commit;
