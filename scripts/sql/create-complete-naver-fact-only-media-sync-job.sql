-- Etrylue Performance
-- Option B: Naver fact-only chunk completion.
-- Local candidate only. Does not touch snapshots, report rows/pointers,
-- report ingestions, or media_connections.last_sync_at.

begin;

create or replace function public.complete_naver_searchads_fact_only_job(
  p_payload jsonb
)
returns table(
  job jsonb,
  covered_dates bigint,
  partition_rows bigint,
  fact_rows bigint,
  idempotent boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
set statement_timeout to '2min'
as $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_job_id uuid;
  v_date date;
  v_expected_dates bigint;
  v_covered_dates bigint := 0;
  v_partition_rows bigint := 0;
  v_fact_rows bigint := 0;
  v_bad_lineage bigint := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_idempotent boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_INVALID_INPUT: payload must be a JSON object';
  end if;

  begin
    v_job_id := nullif(btrim(p_payload ->> 'job_id'), '')::uuid;
  exception when others then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_INVALID_INPUT: job_id is invalid';
  end;

  if v_job_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_INVALID_INPUT: job_id is required';
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_UNSUPPORTED_JOB: Naver snapshot_replace is required';
  end if;

  if v_job.snapshot_ingestion_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_SNAPSHOT_EXISTS: fact-only completion cannot own a snapshot';
  end if;

  if v_job.status = 'done' then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.failed_rows <> 0
       or v_job.error is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSFC_COMPLETION_CONFLICT: invalid done/null-snapshot state';
    end if;
    v_idempotent := true;
  elsif v_job.status = 'processing' then
    if v_job.finished_at is not null
       or v_job.failed_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSFC_INVALID_JOB_STATE: processing job is not eligible';
    end if;
  else
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_JOB_NOT_PROCESSING: job must be processing or already done';
  end if;

  if v_job.date_to < v_job.date_from then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_DATE_WINDOW_INVALID: job date window is invalid';
  end if;

  if v_job.raw_rows <> v_job.inserted_rows
     or v_job.normalized_rows <> v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_JOB_COUNT_CONFLICT: reconciled job counts changed';
  end if;

  v_expected_dates := (v_job.date_to - v_job.date_from + 1)::bigint;

  -- Use the same account/date advisory-lock key as fact replacement.
  for v_date in
    select d::date
    from generate_series(
      v_job.date_from::timestamp,
      v_job.date_to::timestamp,
      interval '1 day'
    ) as d
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_job.workspace_id::text || '|' ||
        v_job.advertiser_id::text || '|' ||
        v_job.provider || '|' ||
        v_job.external_account_id || '|' ||
        v_date::text,
        0
      )
    );
  end loop;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint,
    count(*) filter (
      where p.source_connection_id is distinct from v_job.connection_id
         or p.source_report_id is distinct from v_job.report_id
         or p.source_job_id is distinct from v_job.id
         or p.source_job_created_at is distinct from v_job.created_at
    )::bigint
  into v_covered_dates, v_partition_rows, v_bad_lineage
  from public.media_sync_fact_partitions as p
  where p.workspace_id = v_job.workspace_id
    and p.advertiser_id = v_job.advertiser_id
    and p.provider = v_job.provider
    and p.external_account_id = v_job.external_account_id
    and p.date between v_job.date_from and v_job.date_to;

  if v_covered_dates <> v_expected_dates
     or v_bad_lineage <> 0
     or v_partition_rows <> v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_PARTITION_AUTHORITY_CONFLICT: exact job-date ownership is required';
  end if;

  select
    count(*)::bigint,
    count(*) filter (
      where f.source_connection_id is distinct from v_job.connection_id
         or f.source_report_id is distinct from v_job.report_id
         or f.source_job_id is distinct from v_job.id
         or f.source_job_created_at is distinct from v_job.created_at
    )::bigint
  into v_fact_rows, v_bad_lineage
  from public.media_sync_fact_rows as f
  where f.workspace_id = v_job.workspace_id
    and f.advertiser_id = v_job.advertiser_id
    and f.provider = v_job.provider
    and f.external_account_id = v_job.external_account_id
    and f.date between v_job.date_from and v_job.date_to;

  if v_bad_lineage <> 0
     or v_fact_rows <> v_partition_rows
     or v_fact_rows <> v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_FACT_AUTHORITY_CONFLICT: canonical facts do not match the chunk';
  end if;

  if not v_idempotent then
    update public.media_sync_jobs as j
    set status = 'done',
        progress = 100,
        finished_at = v_now,
        error = null,
        updated_at = v_now
    where j.id = v_job.id
      and j.status = 'processing'
      and j.snapshot_ingestion_id is null
      and j.finished_at is null
      and j.failed_rows = 0;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'MSFC_COMPLETION_CONFLICT: job changed during completion';
    end if;
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job.id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.snapshot_ingestion_id is not null
     or v_job.failed_rows <> 0
     or v_job.error is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_POSTCONDITION_FAILED: fact-only completion contract failed';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_covered_dates,
    v_partition_rows,
    v_fact_rows,
    v_idempotent;
end;
$function$;

revoke all on function
  public.complete_naver_searchads_fact_only_job(jsonb)
from public, anon, authenticated;

grant execute on function
  public.complete_naver_searchads_fact_only_job(jsonb)
to service_role;

commit;
