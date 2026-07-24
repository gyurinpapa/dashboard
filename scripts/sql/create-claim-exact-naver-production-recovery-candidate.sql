-- scripts/sql/create-claim-exact-naver-production-recovery-candidate.sql
--
-- Exact-ID claim contract for one isolated Naver production recovery candidate.
--
-- v3 safety contract:
-- - Supports repeated bounded authoritative partial resume.
-- - Requires one explicit cancelled candidate and exact updated_at.
-- - Requires the authoritative checkpoint, job counters, and actual staging rows
--   to agree exactly before every claim.
-- - Keeps the original 44,514 keyword rows fixed.
-- - Allows only contiguous creative/mixed authoritative rows after row 44,513.
-- - Never uses the generic pending-job claim.
-- - Never modifies staging, report_rows, reports, or the source job.

create or replace function public.claim_exact_naver_production_recovery_candidate(
  p_candidate_job_id uuid,
  p_source_job_id uuid,
  p_expected_candidate_updated_at timestamptz,
  p_expected_current_ingestion_id uuid,
  p_expected_published_ingestion_id uuid
)
returns setof public.media_sync_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_candidate public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;

  v_active_job_count bigint;

  v_next_row_index bigint;
  v_checkpoint_inserted_rows bigint;

  v_staging_rows bigint;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_distinct_row_indexes bigint;
  v_distinct_row_keys bigint;

  v_keyword_rows bigint;
  v_creative_rows bigint;
  v_mixed_rows bigint;
  v_unexpected_row_levels bigint;

  v_invalid_fingerprint_rows bigint;
  v_date_range_violation_rows bigint;
begin
  if p_candidate_job_id is null
     or p_source_job_id is null
     or p_expected_candidate_updated_at is null
     or p_expected_current_ingestion_id is null
     or p_expected_published_ingestion_id is null then
    raise exception
      using
        errcode = '22023',
        message = 'All exact recovery claim inputs are required.';
  end if;

  select job.*
  into v_candidate
  from public.media_sync_jobs as job
  where job.id = p_candidate_job_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'P0002',
        message = 'The exact recovery candidate was not found.';
  end if;

  if v_candidate.provider <> 'naver_searchad'
     or v_candidate.status <> 'cancelled'
     or v_candidate.updated_at is distinct from p_expected_candidate_updated_at
     or v_candidate.error is not null
     or v_candidate.started_at is not null
     or v_candidate.finished_at is not null
     or v_candidate.snapshot_ingestion_id is not null
     or v_candidate.attempt_count < 0 then
    raise exception
      using
        errcode = '55000',
        message = 'The exact recovery candidate lifecycle state is invalid.';
  end if;

  if v_candidate.error_detail
       #>> '{processing_checkpoint,recovery,source_job_id}'
       is distinct from p_source_job_id::text
     or v_candidate.error_detail
       #>> '{processing_checkpoint,collector,phase}'
       is distinct from 'authoritative'
     or v_candidate.error_detail
       #>> '{processing_checkpoint,collector,keyword,complete}'
       is distinct from 'true'
     or v_candidate.error_detail
       #>> '{processing_checkpoint,collector,authoritative,complete}'
       is distinct from 'false' then
    raise exception
      using
        errcode = '55000',
        message = 'The exact recovery candidate checkpoint phase is invalid.';
  end if;

  begin
    v_next_row_index :=
      (
        v_candidate.error_detail
          #>> '{processing_checkpoint,collector,next_row_index}'
      )::bigint;

    v_checkpoint_inserted_rows :=
      (
        v_candidate.error_detail
          #>> '{processing_checkpoint,inserted_rows}'
      )::bigint;
  exception
    when others then
      raise exception
        using
          errcode = '22023',
          message = 'The exact recovery candidate checkpoint counters are invalid.';
  end;

  if v_candidate.raw_rows <> v_candidate.normalized_rows
     or v_candidate.raw_rows <> v_candidate.inserted_rows
     or v_candidate.failed_rows <> 0
     or v_candidate.progress < 0
     or v_candidate.progress > 99
     or v_candidate.inserted_rows < 44514
     or v_checkpoint_inserted_rows <> v_candidate.inserted_rows
     or v_next_row_index <> v_candidate.inserted_rows then
    raise exception
      using
        errcode = '55000',
        message = 'The exact recovery candidate counters are invalid.';
  end if;

  select
    count(*)::bigint,
    min(staging.row_index)::bigint,
    max(staging.row_index)::bigint,
    count(distinct staging.row_index)::bigint,
    count(distinct staging.row_key)::bigint,

    count(*) filter (
      where staging.row ->> 'row_level' = 'keyword'
    )::bigint,

    count(*) filter (
      where staging.row ->> 'row_level' = 'creative'
    )::bigint,

    count(*) filter (
      where staging.row ->> 'row_level' = 'mixed'
    )::bigint,

    count(*) filter (
      where staging.row ->> 'row_level'
        not in ('keyword', 'creative', 'mixed')
         or staging.row ->> 'row_level' is null
    )::bigint,

    count(*) filter (
      where staging.row_fingerprint is null
         or staging.row_fingerprint !~ '^[0-9a-f]{64}$'
    )::bigint,

    count(*) filter (
      where staging.date < v_candidate.date_from
         or staging.date > v_candidate.date_to
    )::bigint

  into
    v_staging_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_distinct_row_keys,
    v_keyword_rows,
    v_creative_rows,
    v_mixed_rows,
    v_unexpected_row_levels,
    v_invalid_fingerprint_rows,
    v_date_range_violation_rows

  from public.media_sync_staging_rows as staging
  where staging.job_id = v_candidate.id;

  if v_staging_rows <> v_candidate.inserted_rows
     or v_min_row_index <> 0
     or v_max_row_index <> v_candidate.inserted_rows - 1
     or v_distinct_row_indexes <> v_candidate.inserted_rows
     or v_distinct_row_keys <> v_candidate.inserted_rows
     or v_keyword_rows <> 44514
     or v_creative_rows + v_mixed_rows <> v_candidate.inserted_rows - 44514
     or v_unexpected_row_levels <> 0
     or v_invalid_fingerprint_rows <> 0
     or v_date_range_violation_rows <> 0 then
    raise exception
      using
        errcode = '55000',
        message = 'The exact recovery candidate staging rows are invalid.';
  end if;

  select report.*
  into v_report
  from public.reports as report
  where report.id = v_candidate.report_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'P0002',
        message = 'The recovery report was not found.';
  end if;

  if v_report.workspace_id is distinct from v_candidate.workspace_id
     or v_report.advertiser_id is distinct from v_candidate.advertiser_id
     or v_report.current_ingestion_id
          is distinct from p_expected_current_ingestion_id
     or v_report.published_ingestion_id
          is distinct from p_expected_published_ingestion_id then
    raise exception
      using
        errcode = '40001',
        message = 'The recovery report scope or pointers changed.';
  end if;

  select count(*)::bigint
  into v_active_job_count
  from public.media_sync_jobs as active_job
  where active_job.report_id = v_candidate.report_id
    and active_job.id <> v_candidate.id
    and active_job.status in ('pending', 'processing');

  if v_active_job_count <> 0 then
    raise exception
      using
        errcode = '55000',
        message = 'Another active media sync job exists for the recovery report.';
  end if;

  return query
  update public.media_sync_jobs as job
  set
    status = 'processing',
    started_at = now(),
    finished_at = null,
    updated_at = now(),
    attempt_count = job.attempt_count + 1,
    error = null,
    error_detail = jsonb_build_object(
      'processing_checkpoint',
      job.error_detail -> 'processing_checkpoint'
    )
  where job.id = v_candidate.id
    and job.status = 'cancelled'
    and job.updated_at = p_expected_candidate_updated_at
  returning job.*;

  if not found then
    raise exception
      using
        errcode = '40001',
        message = 'The exact recovery candidate could not be claimed atomically.';
  end if;
end;
$function$;

revoke all
on function public.claim_exact_naver_production_recovery_candidate(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
from public;

revoke all
on function public.claim_exact_naver_production_recovery_candidate(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
from anon;

revoke all
on function public.claim_exact_naver_production_recovery_candidate(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
from authenticated;

grant execute
on function public.claim_exact_naver_production_recovery_candidate(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
to service_role;