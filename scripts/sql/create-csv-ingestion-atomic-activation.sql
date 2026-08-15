-- Etrylue Performance
-- Stage 7 / CSV Atomic Replace
--
-- Purpose:
-- - persist the queue-time current ingestion baseline on ingestion_jobs
-- - allow at most one pending/processing CSV ingestion job per report
-- - activate a completely materialized CSV candidate only when the report
--   current pointer still matches the baseline captured before processing
--
-- Safety invariants:
-- - candidate report_rows are built alongside the existing current dataset
-- - current_ingestion_id changes only after candidate completeness validation
-- - published_ingestion_id is never changed by CSV activation
-- - queued activation binds the RPC request back to ingestion_jobs authority
-- - stale/concurrent candidates fail closed
-- - service_role only
--
-- This is a one-time schema/function migration.
-- It intentionally fails instead of silently accepting an unexpected
-- pre-existing column/index with the same contract name.

begin;

alter table public.ingestion_jobs
  add column previous_ingestion_id uuid;

comment on column public.ingestion_jobs.previous_ingestion_id is
  'The reports.current_ingestion_id baseline captured when a queued CSV ingestion job is created. Used for fail-closed CSV snapshot activation.';

create unique index ingestion_jobs_one_active_job_per_report_uidx
  on public.ingestion_jobs (report_id)
  where status in ('pending', 'processing');

create or replace function public.activate_csv_ingestion_snapshot(
  p_payload jsonb
)
returns table(
  previous_ingestion_id uuid,
  candidate_ingestion_id uuid,
  current_ingestion_id uuid,
  published_ingestion_id uuid,
  row_count bigint,
  min_row_index bigint,
  max_row_index bigint,
  distinct_row_indexes bigint,
  idempotent boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_job public.ingestion_jobs%rowtype;
  v_report public.reports%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_previous_ingestion_id uuid;
  v_candidate_ingestion_id uuid;
  v_expected_rows bigint;

  v_row_count bigint;
  v_distinct_row_indexes bigint;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_scope_mismatch_rows bigint;

  v_published_ingestion_before uuid;
  v_idempotent boolean := false;
begin
  /*
   * Payload contract.
   *
   * job_id is optional because the synchronous replace path does not create
   * ingestion_jobs. When job_id is supplied, the queued-job authority is
   * validated and locked before the report pointer can be changed.
   */
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'CIA_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'candidate_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'CIA_INVALID_INPUT: invalid UUID input';
  end if;

  if p_payload ? 'job_id'
     and (
       p_payload->'job_id' = 'null'::jsonb
       or coalesce(p_payload->>'job_id', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) then
    raise exception using
      message = 'CIA_INVALID_INPUT: job_id is invalid';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'CIA_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using
      message = 'CIA_INVALID_INPUT: expected_rows must be a positive integer';
  end if;

  begin
    v_job_id := nullif(p_payload->>'job_id', '')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_previous_ingestion_id :=
      nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_candidate_ingestion_id :=
      (p_payload->>'candidate_ingestion_id')::uuid;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'CIA_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_expected_rows <= 0 then
    raise exception using
      message = 'CIA_INVALID_INPUT: expected_rows must be greater than zero';
  end if;

  /*
   * Optional queued-job authority.
   *
   * Lock order for queued activation is JOB FOR UPDATE -> REPORT FOR UPDATE.
   * The stored previous_ingestion_id is authority; the payload value is an
   * assertion and must match it exactly.
   */
  if v_job_id is not null then
    select *
      into v_job
      from public.ingestion_jobs as j
     where j.id = v_job_id
     for update;

    if not found then
      raise exception using
        message = 'CIA_JOB_NOT_FOUND: ingestion job was not found';
    end if;

    if v_job.status <> 'processing' then
      raise exception using
        message = 'CIA_JOB_NOT_PROCESSING: ingestion job must remain processing';
    end if;

    if v_job.mode <> 'queue'
       or v_job.id <> v_candidate_ingestion_id
       or v_job.report_id <> v_report_id
       or v_job.workspace_id <> v_workspace_id
       or v_job.previous_ingestion_id is distinct from v_previous_ingestion_id then
      raise exception using
        message = 'CIA_SCOPE_MISMATCH: queued ingestion job authority does not match the request';
    end if;

    if v_job.valid_rows <> v_expected_rows
       or v_job.inserted_rows <> v_expected_rows then
      raise exception using
        message = 'CIA_CANDIDATE_INVALID: queued ingestion job counts do not match the candidate';
    end if;
  end if;

  /*
   * REPORT is the activation authority.
   *
   * The row lock serializes pointer-changing operations for this report.
   * published_ingestion_id is captured before activation and must remain
   * exactly unchanged.
   */
  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message = 'CIA_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id then
    raise exception using
      message = 'CIA_SCOPE_MISMATCH: report workspace does not match the request';
  end if;

  if v_job_id is not null
     and v_report.advertiser_id is distinct from v_job.advertiser_id then
    raise exception using
      message = 'CIA_SCOPE_MISMATCH: report advertiser does not match the queued ingestion job';
  end if;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  /*
   * Activation authority:
   *
   * 1. Already pointing to the candidate:
   *    valid idempotent retry.
   *
   * 2. Still pointing to the baseline captured before candidate creation:
   *    activation may proceed.
   *
   * 3. Anything else:
   *    a newer/different ingestion changed the report, therefore fail closed.
   */
  if v_report.current_ingestion_id
       is not distinct from v_candidate_ingestion_id then
    v_idempotent := true;
  elsif v_report.current_ingestion_id
       is not distinct from v_previous_ingestion_id then
    v_idempotent := false;
  else
    raise exception using
      message = 'CIA_ACTIVATION_CONFLICT: current ingestion pointer no longer matches the candidate baseline';
  end if;

  /*
   * Candidate completeness verification.
   *
   * report_rows uniqueness is owned by:
   *   (report_id, ingestion_id, row_index)
   *
   * A valid completed CSV candidate therefore requires:
   * - exact expected row count
   * - row_index count exactly equal to expected rows
   * - contiguous range 0 .. expected_rows - 1
   * - exact report workspace/advertiser scope
   */
  select
    count(*)::bigint,
    count(distinct rr.row_index)::bigint,
    min(rr.row_index)::bigint,
    max(rr.row_index)::bigint,
    count(*) filter (
      where rr.workspace_id
              is distinct from v_report.workspace_id
         or rr.advertiser_id
              is distinct from v_report.advertiser_id
    )::bigint
    into
      v_row_count,
      v_distinct_row_indexes,
      v_min_row_index,
      v_max_row_index,
      v_scope_mismatch_rows
    from public.report_rows as rr
   where rr.report_id = v_report_id
     and rr.ingestion_id = v_candidate_ingestion_id;

  if v_row_count <> v_expected_rows
     or v_distinct_row_indexes <> v_expected_rows
     or v_min_row_index is distinct from 0::bigint
     or v_max_row_index
          is distinct from (v_expected_rows - 1)
     or v_scope_mismatch_rows <> 0 then
    raise exception using
      message = 'CIA_CANDIDATE_INVALID: CSV candidate rows are incomplete or out of scope';
  end if;

  /*
   * Atomic activation.
   *
   * published_ingestion_id participates in the conditional update only as a
   * preservation assertion. This RPC never writes the published pointer.
   */
  if not v_idempotent then
    update public.reports as r
       set current_ingestion_id = v_candidate_ingestion_id
     where r.id = v_report_id
       and r.current_ingestion_id
             is not distinct from v_previous_ingestion_id
       and r.published_ingestion_id
             is not distinct from v_published_ingestion_before;

    if not found then
      raise exception using
        message = 'CIA_ACTIVATION_CONFLICT: report pointer changed during activation';
    end if;
  end if;

  /*
   * Post-activation verification.
   */
  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_candidate_ingestion_id
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before then
    raise exception using
      message = 'CIA_ACTIVATION_CONFLICT: report pointers violate the CSV activation contract';
  end if;

  return query
  select
    v_previous_ingestion_id,
    v_candidate_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_row_count,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_idempotent;
end;
$function$;

revoke all
  on function public.activate_csv_ingestion_snapshot(jsonb)
  from public;

revoke all
  on function public.activate_csv_ingestion_snapshot(jsonb)
  from anon;

revoke all
  on function public.activate_csv_ingestion_snapshot(jsonb)
  from authenticated;

grant execute
  on function public.activate_csv_ingestion_snapshot(jsonb)
  to service_role;

commit;