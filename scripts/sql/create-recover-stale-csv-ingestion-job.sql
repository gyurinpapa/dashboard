begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.recover_stale_csv_ingestion_job(
  p_job_id uuid,
  p_cutoff timestamptz
)
returns table(
  job_id uuid,
  report_id uuid,
  recovered boolean,
  final_status text,
  candidate_referenced boolean,
  candidate_is_current boolean,
  deleted_candidate_rows bigint
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_job public.ingestion_jobs%rowtype;
  v_report public.reports%rowtype;

  v_now timestamptz := clock_timestamp();
  v_candidate_referenced boolean := false;
  v_candidate_is_current boolean := false;
  v_deleted_candidate_rows bigint := 0;

  v_ingestion_meta jsonb;
  v_meta_owner_job_id text;
begin
  if p_job_id is null then
    raise exception using
      message = 'CSR_INVALID_INPUT: p_job_id is required';
  end if;

  if p_cutoff is null or p_cutoff >= v_now then
    raise exception using
      message = 'CSR_INVALID_INPUT: p_cutoff must be earlier than the current time';
  end if;

  /*
   * Lock order is JOB FOR UPDATE -> REPORT FOR UPDATE, matching CSV activation.
   * The stale decision and pointer classification therefore cannot race with
   * activate_csv_ingestion_snapshot for the same queued job.
   */
  select *
    into v_job
    from public.ingestion_jobs as j
   where j.id = p_job_id
   for update;

  if not found then
    return query
    select
      p_job_id,
      null::uuid,
      false,
      null::text,
      false,
      false,
      0::bigint;
    return;
  end if;

  if v_job.status <> 'processing'
     or v_job.updated_at >= p_cutoff then
    return query
    select
      v_job.id,
      v_job.report_id,
      false,
      v_job.status,
      false,
      false,
      0::bigint;
    return;
  end if;

  if v_job.mode <> 'queue' then
    raise exception using
      message = 'CSR_SCOPE_MISMATCH: stale recovery only supports queued CSV ingestion jobs';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_job.report_id
   for update;

  if not found then
    raise exception using
      message = 'CSR_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_job.workspace_id
     or v_report.advertiser_id is distinct from v_job.advertiser_id then
    raise exception using
      message = 'CSR_SCOPE_MISMATCH: report scope does not match the stale ingestion job';
  end if;

  v_candidate_is_current :=
    v_report.current_ingestion_id is not distinct from v_job.id;

  v_candidate_referenced :=
    v_candidate_is_current
    or v_report.published_ingestion_id is not distinct from v_job.id;

  if v_candidate_referenced then
    update public.ingestion_jobs as j
       set status = 'done',
           progress = 100,
           error = null,
           error_detail = null,
           finished_at = v_now,
           updated_at = v_now
     where j.id = v_job.id
       and j.status = 'processing';

    if not found then
      raise exception using
        message = 'CSR_JOB_STATE_CHANGED: stale ingestion job changed before recovery';
    end if;

    if v_candidate_is_current then
      v_ingestion_meta :=
        coalesce(v_report.meta->'ingestion', '{}'::jsonb);

      v_meta_owner_job_id :=
        coalesce(
          nullif(v_ingestion_meta->>'job_id', ''),
          nullif(v_ingestion_meta->>'ingestion_id', '')
        );

      if v_meta_owner_job_id = v_job.id::text then
        update public.reports as r
           set meta =
                 coalesce(r.meta, '{}'::jsonb)
                 || jsonb_build_object(
                      'ingestion',
                      v_ingestion_meta
                      || jsonb_build_object(
                           'status', 'done',
                           'progress', 100,
                           'error', null,
                           'finished_at', v_now,
                           'in_flight_inserts', 0
                         )
                    ),
               updated_at = v_now
         where r.id = v_report.id;
      end if;
    end if;

    return query
    select
      v_job.id,
      v_job.report_id,
      true,
      'done'::text,
      true,
      v_candidate_is_current,
      0::bigint;
    return;
  end if;

  delete from public.report_rows as rr
   where rr.report_id = v_job.report_id
     and rr.ingestion_id = v_job.id;

  get diagnostics v_deleted_candidate_rows = row_count;

  update public.ingestion_jobs as j
     set status = 'failed',
         progress = 100,
         error = 'STALE_PROCESSING_JOB',
         error_detail = jsonb_build_object(
           'code', 'STALE_PROCESSING_JOB',
           'message', 'CSV ingestion processing job exceeded the stale processing threshold before activation.',
           'stage', 'stale_recovery',
           'source', 'automatic_recovery',
           'cutoff', p_cutoff,
           'recovered_at', v_now
         ),
         finished_at = v_now,
         updated_at = v_now
   where j.id = v_job.id
     and j.status = 'processing';

  if not found then
    raise exception using
      message = 'CSR_JOB_STATE_CHANGED: stale ingestion job changed before recovery';
  end if;

  v_ingestion_meta :=
    coalesce(v_report.meta->'ingestion', '{}'::jsonb);

  v_meta_owner_job_id :=
    coalesce(
      nullif(v_ingestion_meta->>'job_id', ''),
      nullif(v_ingestion_meta->>'ingestion_id', '')
    );

  if v_meta_owner_job_id = v_job.id::text then
    update public.reports as r
       set meta =
             coalesce(r.meta, '{}'::jsonb)
             || jsonb_build_object(
                  'ingestion',
                  v_ingestion_meta
                  || jsonb_build_object(
                       'status', 'failed',
                       'progress', 100,
                       'error', 'STALE_PROCESSING_JOB',
                       'finished_at', v_now,
                       'in_flight_inserts', 0
                     )
                ),
           updated_at = v_now
     where r.id = v_report.id;
  end if;

  return query
  select
    v_job.id,
    v_job.report_id,
    true,
    'failed'::text,
    false,
    false,
    v_deleted_candidate_rows;
end;
$function$;

revoke all
  on function public.recover_stale_csv_ingestion_job(uuid, timestamptz)
  from public;

revoke all
  on function public.recover_stale_csv_ingestion_job(uuid, timestamptz)
  from anon;

revoke all
  on function public.recover_stale_csv_ingestion_job(uuid, timestamptz)
  from authenticated;

grant execute
  on function public.recover_stale_csv_ingestion_job(uuid, timestamptz)
  to service_role;

commit;

-- READ ONLY postflight — 1 Result Set
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  position(
    'Lock order is JOB FOR UPDATE -> REPORT FOR UPDATE'
    in pg_get_functiondef(p.oid)
  ) > 0 as activation_lock_order_preserved,
  position(
    'v_candidate_referenced'
    in pg_get_functiondef(p.oid)
  ) > 0 as pointer_classification_present,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'recover_stale_csv_ingestion_job'
  and pg_get_function_identity_arguments(p.oid) =
      'p_job_id uuid, p_cutoff timestamp with time zone';
