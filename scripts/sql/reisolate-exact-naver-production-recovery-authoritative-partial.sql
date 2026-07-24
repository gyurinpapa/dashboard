/*
 * Etrylue Performance
 * Exact one-time Naver Search Ads authoritative partial re-isolation repair
 *
 * Purpose:
 * - Repair only the reduced recovery metadata of one exact cancelled candidate.
 * - Restore the original preparation contract fields from immutable live facts.
 * - Preserve the verified 44,514-row keyword source only as an exact prefix.
 * - Allow the candidate total to grow dynamically through authoritative partial runs.
 * - Refresh the confirmation token atomically against the new candidate updated_at.
 *
 * Large-volume contract:
 * - 44,514 is the immutable source-prefix boundary, not a candidate-total limit.
 * - Candidate total rows are read from the exact observed job/checkpoint/live staging state; 45,614 is a one-time recovery guard, not a future ingestion limit.
 * - No candidate-wide string_agg, JSON aggregate, fingerprint digest, or two-sided exhaustive join.
 * - Candidate continuity uses the unique (job_id, row_index) contract plus count/min/max.
 * - Source/candidate exact comparison is bounded to the fixed 44,514-row prefix only.
 *
 * Exact target:
 * - report_id: ea413950-4068-41e8-9ced-8355020d7e7d
 * - candidate_job_id: 4191baff-393f-4be8-bb38-31548d3ba051
 * - source_job_id: 9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7
 *
 * Write boundary when this file is eventually executed:
 * - exactly one UPDATE against public.media_sync_jobs
 * - only candidate.status, candidate.started_at, candidate.error_detail, and candidate.updated_at change
 * - no new job
 * - no staging-row write
 * - no report/report_rows/report_ingestions write
 * - no claim, materialization, activation, or finalization RPC
 *
 * One-time behavior:
 * - The current candidate must match the exact processing/missing-recovery shape.
 * - After re-isolation that shape no longer matches, so a second execution fails.
 * - Any failed assertion raises an exception and rolls back the transaction.
 */

begin;

set local lock_timeout = '10s';
set local statement_timeout = '10min';

/*
 * The DO block performs all preflight checks, one exact UPDATE, and postflight
 * checks inside the same transaction.
 */
do $repair$
declare
  v_candidate_id constant uuid :=
    '4191baff-393f-4be8-bb38-31548d3ba051';

  v_source_job_id constant uuid :=
    '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7';

  v_report_id constant uuid :=
    'ea413950-4068-41e8-9ced-8355020d7e7d';

  v_workspace_id constant uuid :=
    '27b1556f-9d42-496f-bd7e-5a59ebee71d4';

  v_advertiser_id constant uuid :=
    'da51e71a-01ce-42fb-a937-7af0b5f47786';

  v_connection_id constant uuid :=
    'aba7d28f-ec85-49db-941a-fa5babe2af61';

  v_current_ingestion_id constant uuid :=
    '48401e55-55e5-4722-ba58-1ad2338eda04';

  v_published_ingestion_id constant uuid :=
    '6d74227e-8d3b-4782-b041-6915d1cc3b89';

  v_expected_candidate_updated_at constant timestamptz :=
    '2026-07-21 20:36:36.598013+00';

  v_expected_candidate_started_at constant timestamptz :=
    '2026-07-21 20:35:38.750339+00';

  v_expected_source_job_updated_at constant timestamptz :=
    '2026-07-19 11:59:16.834+00';


  v_expected_source_identity_digest constant text :=
    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40';

  v_expected_candidate_attempt_count constant bigint := 10;
  v_expected_source_job_rows constant bigint := 44500;
  v_source_boundary constant bigint := 44514;
  v_expected_total_report_rows constant bigint := 359716;
  v_expected_current_report_rows constant bigint := 118;
  v_expected_published_report_rows constant bigint := 44514;

  v_candidate public.media_sync_jobs%rowtype;
  v_candidate_after public.media_sync_jobs%rowtype;
  v_source_job public.media_sync_jobs%rowtype;
  v_source_job_after public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_report_after public.reports%rowtype;

  v_checkpoint jsonb;
  v_recovery jsonb;
  v_repaired_recovery jsonb;
  v_repaired_checkpoint jsonb;
  v_repaired_error_detail jsonb;

  v_candidate_expected_rows bigint;
  v_authoritative_tail_rows bigint;
  v_required_unique_constraint_count bigint;
  v_active_job_count bigint;

  v_source_rows bigint;
  v_source_min_row_index bigint;
  v_source_max_row_index bigint;
  v_source_invalid_fingerprint_rows bigint;
  v_source_identity_digest text;

  v_candidate_rows bigint;
  v_candidate_min_row_index bigint;
  v_candidate_max_row_index bigint;
  v_candidate_invalid_fingerprint_rows bigint;
  v_candidate_scope_mismatch_rows bigint;
  v_candidate_prefix_rows bigint;
  v_candidate_prefix_mismatch_rows bigint;
  v_candidate_tail_rows bigint;

  v_source_post_rows bigint;
  v_source_post_identity_digest text;
  v_candidate_post_rows bigint;
  v_candidate_post_min_row_index bigint;
  v_candidate_post_max_row_index bigint;

  v_total_report_rows bigint;
  v_current_report_rows bigint;
  v_published_report_rows bigint;

  v_current_descriptor_count bigint;
  v_current_descriptor_rows bigint;
  v_current_descriptor_status text;
  v_current_descriptor_error_count bigint;

  v_published_descriptor_count bigint;
  v_published_descriptor_rows bigint;
  v_published_descriptor_status text;
  v_published_descriptor_error_count bigint;

  v_report_ingestions_digest_before text;
  v_report_ingestions_digest_after text;

  v_current_sentinel_count_before bigint;
  v_current_sentinel_digest_before text;
  v_current_sentinel_count_after bigint;
  v_current_sentinel_digest_after text;

  v_published_sentinel_count_before bigint;
  v_published_sentinel_digest_before text;
  v_published_sentinel_count_after bigint;
  v_published_sentinel_digest_after text;

  v_repair_time timestamptz;
  v_confirmation_source text;
  v_new_confirmation_token text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'repair_exact_naver_production_recovery_candidate_checkpoint:' ||
      v_candidate_id::text,
      0
    )
  );

  /*
   * append_media_sync_staging_batch serializes appends through the owning job
   * row. Holding the exact candidate row FOR UPDATE therefore freezes its
   * staging scope without locking up to millions of staging rows individually.
   */
  select job.*
  into v_candidate
  from public.media_sync_jobs as job
  where job.id = v_candidate_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'RECOVERY_REISOLATION_CANDIDATE_NOT_FOUND';
  end if;

  if v_candidate.report_id is distinct from v_report_id
     or v_candidate.workspace_id is distinct from v_workspace_id
     or v_candidate.advertiser_id is distinct from v_advertiser_id
     or v_candidate.connection_id is distinct from v_connection_id
     or v_candidate.provider is distinct from 'naver_searchad'
     or v_candidate.status is distinct from 'processing'
     or v_candidate.progress is distinct from 99
     or v_candidate.raw_rows is distinct from 45614
     or v_candidate.raw_rows < v_source_boundary
     or v_candidate.normalized_rows is distinct from v_candidate.raw_rows
     or v_candidate.inserted_rows is distinct from v_candidate.raw_rows
     or v_candidate.failed_rows is distinct from 0
     or v_candidate.previous_ingestion_id is distinct from
        v_current_ingestion_id
     or v_candidate.snapshot_ingestion_id is not null
     or v_candidate.attempt_count is distinct from
        v_expected_candidate_attempt_count
     or v_candidate.error is not null
     or v_candidate.started_at is distinct from
        v_expected_candidate_started_at
     or v_candidate.finished_at is not null
     or v_candidate.created_at is null
     or v_candidate.updated_at is distinct from
        v_expected_candidate_updated_at
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_CANDIDATE_STATE_MISMATCH';
  end if;

  v_candidate_expected_rows := v_candidate.raw_rows;
  v_authoritative_tail_rows :=
    v_candidate_expected_rows - v_source_boundary;

  if v_authoritative_tail_rows < 0 then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_CANDIDATE_ROW_BOUNDARY_MISMATCH';
  end if;

  if v_candidate.error_detail is null
     or jsonb_typeof(v_candidate.error_detail) <> 'object'
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_ERROR_DETAIL_INVALID';
  end if;

  if (
    select count(*)
    from jsonb_object_keys(v_candidate.error_detail)
  ) <> 1
     or not (v_candidate.error_detail ? 'processing_checkpoint')
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_ERROR_DETAIL_SHAPE_MISMATCH';
  end if;

  v_checkpoint :=
    v_candidate.error_detail -> 'processing_checkpoint';

  if v_checkpoint is null
     or jsonb_typeof(v_checkpoint) <> 'object'
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_CHECKPOINT_INVALID';
  end if;

  if v_checkpoint #>> '{version}' <> '1'
     or v_checkpoint #>> '{collector,combined_version}' <> '1'
     or v_checkpoint #>> '{collector,phase}' <> 'authoritative'
     or v_checkpoint #>> '{collector,next_row_index}' <>
        v_candidate_expected_rows::text
     or v_checkpoint #>> '{raw_rows}' <>
        v_candidate_expected_rows::text
     or v_checkpoint #>> '{normalized_rows}' <>
        v_candidate_expected_rows::text
     or v_checkpoint #>> '{inserted_rows}' <>
        v_candidate_expected_rows::text
     or v_checkpoint #>> '{failed_rows}' <> '0'
     or v_checkpoint #>> '{collector,keyword,complete}' <> 'true'
     or v_checkpoint #>> '{collector,authoritative,complete}' <> 'false'
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_CHECKPOINT_STATE_MISMATCH';
  end if;

  v_recovery :=
    v_checkpoint -> 'recovery';

  if v_recovery is not null then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_RECOVERY_ALREADY_PRESENT';
  end if;

  select job.*
  into v_source_job
  from public.media_sync_jobs as job
  where job.id = v_source_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'RECOVERY_REISOLATION_SOURCE_JOB_NOT_FOUND';
  end if;

  if v_source_job.report_id is distinct from v_report_id
     or v_source_job.workspace_id is distinct from v_workspace_id
     or v_source_job.advertiser_id is distinct from v_advertiser_id
     or v_source_job.connection_id is distinct from v_connection_id
     or v_source_job.provider is distinct from 'naver_searchad'
     or v_source_job.status is distinct from 'failed'
     or v_source_job.progress is distinct from 0
     or v_source_job.raw_rows is distinct from v_expected_source_job_rows
     or v_source_job.normalized_rows is distinct from
        v_expected_source_job_rows
     or v_source_job.inserted_rows is distinct from
        v_expected_source_job_rows
     or v_source_job.failed_rows is distinct from 0
     or v_source_job.snapshot_ingestion_id is not null
     or v_source_job.error is distinct from 'DATABASE_ERROR'
     or v_source_job.updated_at is distinct from
        v_expected_source_job_updated_at
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_SOURCE_JOB_STATE_MISMATCH';
  end if;

  select report.*
  into v_report
  from public.reports as report
  where report.id = v_report_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'RECOVERY_REISOLATION_REPORT_NOT_FOUND';
  end if;

  if v_report.workspace_id is distinct from v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
     or v_report.current_ingestion_id is distinct from
        v_current_ingestion_id
     or v_report.published_ingestion_id is distinct from
        v_published_ingestion_id
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_REPORT_STATE_MISMATCH';
  end if;

  select count(*)::bigint
  into v_active_job_count
  from public.media_sync_jobs as active_job
  where active_job.report_id = v_report_id
    and active_job.status in ('pending', 'processing');

  if v_active_job_count <> 1
     or not exists (
       select 1
       from public.media_sync_jobs as active_candidate
       where active_candidate.id = v_candidate_id
         and active_candidate.report_id = v_report_id
         and active_candidate.status = 'processing'
     )
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_ACTIVE_JOB_SCOPE_MISMATCH';
  end if;

  /*
   * The continuity proof below relies on the two persisted unique identities.
   * This schema guard prevents a hidden assumption if the table contract ever
   * changes before this exact one-time repair is run.
   */
  select count(*)::bigint
  into v_required_unique_constraint_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
        'public.media_sync_staging_rows'::regclass
    and constraint_record.contype = 'u'
    and constraint_record.conname in (
      'media_sync_staging_rows_job_row_index_unique',
      'media_sync_staging_rows_job_window_row_key_unique'
    );

  if v_required_unique_constraint_count <> 2 then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_STAGING_UNIQUE_CONTRACT_MISMATCH';
  end if;

  /*
   * Source digest work is deliberately bounded to the immutable 44,514-row
   * keyword source. It is never calculated across the dynamic candidate tail.
   */
  select
    count(*)::bigint,
    min(row.row_index)::bigint,
    max(row.row_index)::bigint,
    count(*) filter (
      where row.row_fingerprint is null
         or row.row_fingerprint !~ '^[0-9a-f]{64}$'
         or row.row is null
         or row.row_fingerprint is distinct from
            encode(
              extensions.digest(row.row::text, 'sha256'),
              'hex'
            )
    )::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            '[' ||
            row.row_index::text || ',' ||
            row.date_window_index::text || ',' ||
            to_json(row.date::text)::text || ',' ||
            to_json(row.row_key)::text || ',' ||
            to_json(row.row_fingerprint)::text ||
            E']\n',
            ''
            order by row.row_index asc, row.row_key asc
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_source_rows,
    v_source_min_row_index,
    v_source_max_row_index,
    v_source_invalid_fingerprint_rows,
    v_source_identity_digest
  from public.media_sync_staging_rows as row
  where row.job_id = v_source_job_id;

  if v_source_rows <> v_source_boundary
     or v_source_min_row_index <> 0
     or v_source_max_row_index <> v_source_boundary - 1
     or v_source_invalid_fingerprint_rows <> 0
     or v_source_identity_digest is distinct from
        v_expected_source_identity_digest
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_SOURCE_STAGING_MISMATCH';
  end if;

  /*
   * Candidate validation is dynamic and large-volume safe:
   * - no candidate-wide digest/string aggregation;
   * - no distinct sort for identities already enforced by unique constraints;
   * - count/min/max prove a gap-free 0..N-1 sequence under unique row_index;
   * - only lightweight scalar/scope checks scan the candidate.
   */
  select
    count(*)::bigint,
    min(row.row_index)::bigint,
    max(row.row_index)::bigint,
    count(*) filter (
      where row.row_fingerprint is null
         or row.row_fingerprint !~ '^[0-9a-f]{64}$'
         or row.row is null
    )::bigint,
    count(*) filter (
      where row.report_id is distinct from v_report_id
         or row.workspace_id is distinct from v_workspace_id
         or row.advertiser_id is distinct from v_advertiser_id
         or row.connection_id is distinct from v_connection_id
         or row.provider is distinct from 'naver_searchad'
         or row.external_account_id is distinct from
            v_candidate.external_account_id
         or row.date_from is distinct from v_candidate.date_from
         or row.date_to is distinct from v_candidate.date_to
    )::bigint,
    count(*) filter (
      where row.row_index < v_source_boundary
    )::bigint,
    count(*) filter (
      where row.row_index >= v_source_boundary
    )::bigint
  into
    v_candidate_rows,
    v_candidate_min_row_index,
    v_candidate_max_row_index,
    v_candidate_invalid_fingerprint_rows,
    v_candidate_scope_mismatch_rows,
    v_candidate_prefix_rows,
    v_candidate_tail_rows
  from public.media_sync_staging_rows as row
  where row.job_id = v_candidate_id;

  if v_candidate_rows <> v_candidate_expected_rows
     or v_candidate_min_row_index <> 0
     or v_candidate_max_row_index <> v_candidate_expected_rows - 1
     or v_candidate_invalid_fingerprint_rows <> 0
     or v_candidate_scope_mismatch_rows <> 0
     or v_candidate_prefix_rows <> v_source_boundary
     or v_candidate_tail_rows <> v_authoritative_tail_rows
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_CANDIDATE_STAGING_MISMATCH';
  end if;

  /*
   * Exact source comparison is intentionally bounded to the original prefix.
   * The authoritative tail is valid additional data and is never compared to
   * or constrained by the 44,514-row source total.
   */
  select count(*)::bigint
  into v_candidate_prefix_mismatch_rows
  from public.media_sync_staging_rows as source_row
  left join public.media_sync_staging_rows as candidate_row
    on candidate_row.job_id = v_candidate_id
   and candidate_row.row_index = source_row.row_index
  where source_row.job_id = v_source_job_id
    and (
      candidate_row.id is null
      or candidate_row.report_id is distinct from source_row.report_id
      or candidate_row.workspace_id is distinct from source_row.workspace_id
      or candidate_row.advertiser_id is distinct from
         source_row.advertiser_id
      or candidate_row.connection_id is distinct from
         source_row.connection_id
      or candidate_row.provider is distinct from source_row.provider
      or candidate_row.external_account_id is distinct from
         source_row.external_account_id
      or candidate_row.date_window_index is distinct from
         source_row.date_window_index
      or candidate_row.date_from is distinct from source_row.date_from
      or candidate_row.date_to is distinct from source_row.date_to
      or candidate_row.row_key is distinct from source_row.row_key
      or candidate_row.date is distinct from source_row.date
      or candidate_row.channel is distinct from source_row.channel
      or candidate_row.device is distinct from source_row.device
      or candidate_row.source is distinct from source_row.source
      or candidate_row.row is distinct from source_row.row
      or candidate_row.row_fingerprint is distinct from
         source_row.row_fingerprint
    );

  if v_candidate_prefix_mismatch_rows <> 0 then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_SOURCE_PREFIX_MISMATCH';
  end if;

  select
    count(*)::bigint,
    count(*) filter (
      where row.ingestion_id = v_report.current_ingestion_id
    )::bigint,
    count(*) filter (
      where row.ingestion_id = v_report.published_ingestion_id
    )::bigint
  into
    v_total_report_rows,
    v_current_report_rows,
    v_published_report_rows
  from public.report_rows as row
  where row.report_id = v_report_id;

  if v_total_report_rows <> v_expected_total_report_rows
     or v_current_report_rows <> v_expected_current_report_rows
     or v_published_report_rows <> v_expected_published_report_rows
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_REPORT_ROWS_MISMATCH';
  end if;

  select
    count(*) filter (
      where ingestion.id = v_current_ingestion_id
    )::bigint,
    max(ingestion.row_count) filter (
      where ingestion.id = v_current_ingestion_id
    )::bigint,
    max(ingestion.status::text) filter (
      where ingestion.id = v_current_ingestion_id
    ),
    count(*) filter (
      where ingestion.id = v_current_ingestion_id
        and ingestion.error is not null
    )::bigint,
    count(*) filter (
      where ingestion.id = v_published_ingestion_id
    )::bigint,
    max(ingestion.row_count) filter (
      where ingestion.id = v_published_ingestion_id
    )::bigint,
    max(ingestion.status::text) filter (
      where ingestion.id = v_published_ingestion_id
    ),
    count(*) filter (
      where ingestion.id = v_published_ingestion_id
        and ingestion.error is not null
    )::bigint
  into
    v_current_descriptor_count,
    v_current_descriptor_rows,
    v_current_descriptor_status,
    v_current_descriptor_error_count,
    v_published_descriptor_count,
    v_published_descriptor_rows,
    v_published_descriptor_status,
    v_published_descriptor_error_count
  from public.report_ingestions as ingestion
  where ingestion.report_id = v_report_id;

  if v_current_descriptor_count <> 1
     or v_current_descriptor_rows <> v_expected_current_report_rows
     or v_current_descriptor_status <> 'success'
     or v_current_descriptor_error_count <> 0
     or v_published_descriptor_count <> 1
     or v_published_descriptor_rows <> v_expected_published_report_rows
     or v_published_descriptor_status <> 'success'
     or v_published_descriptor_error_count <> 0
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_INGESTION_METADATA_MISMATCH';
  end if;

  select encode(
    extensions.digest(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ingestion.id,
            'row_count', ingestion.row_count,
            'status', ingestion.status,
            'error', ingestion.error,
            'updated_at', ingestion.updated_at
          )
          order by ingestion.id
        ),
        '[]'::jsonb
      )::text,
      'sha256'
    ),
    'hex'
  )
  into v_report_ingestions_digest_before
  from public.report_ingestions as ingestion
  where ingestion.report_id = v_report_id;

  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            to_jsonb(row)::text || E'\n',
            ''
            order by row.row_index, row.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_current_sentinel_count_before,
    v_current_sentinel_digest_before
  from public.report_rows as row
  where row.report_id = v_report_id
    and row.ingestion_id = v_current_ingestion_id
    and row.row_index in (0, 58, 117);

  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            to_jsonb(row)::text || E'\n',
            ''
            order by row.row_index, row.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_published_sentinel_count_before,
    v_published_sentinel_digest_before
  from public.report_rows as row
  where row.report_id = v_report_id
    and row.ingestion_id = v_published_ingestion_id
    and row.row_index in (0, 22256, 44513);

  if v_current_sentinel_count_before <> 3
     or v_published_sentinel_count_before <> 3
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_REPORT_ROW_SENTINEL_MISMATCH';
  end if;

  v_repair_time := statement_timestamp();

  v_confirmation_source :=
    'version=1' || E'\n' ||
    'candidate_job_id=' || v_candidate.id::text || E'\n' ||
    'source_job_id=' || v_source_job.id::text || E'\n' ||
    'expected_candidate_updated_at=' ||
      (to_jsonb(v_repair_time) #>> '{}') || E'\n' ||
    'report_id=' || v_candidate.report_id::text || E'\n' ||
    'workspace_id=' || v_candidate.workspace_id::text || E'\n' ||
    'advertiser_id=' || v_candidate.advertiser_id::text || E'\n' ||
    'connection_id=' || v_candidate.connection_id::text || E'\n' ||
    'current_ingestion_id=' || v_report.current_ingestion_id::text || E'\n' ||
    'published_ingestion_id=' ||
      v_report.published_ingestion_id::text || E'\n' ||
    'checkpoint_phase=authoritative' || E'\n' ||
    'checkpoint_next_row_index=' || v_candidate_expected_rows::text || E'\n' ||
    'checkpoint_total_rows=' || v_candidate_expected_rows::text || E'\n' ||
    'candidate_rows=' || v_candidate_rows::text || E'\n' ||
    'base_rows=' || v_source_rows::text || E'\n' ||
    'base_identity_digest=' || v_source_identity_digest || E'\n' ||
    'total_report_rows=' || v_total_report_rows::text || E'\n' ||
    'current_report_rows=' || v_current_report_rows::text || E'\n' ||
    'published_report_rows=' || v_published_report_rows::text;

  v_new_confirmation_token :=
    encode(
      extensions.digest(v_confirmation_source, 'sha256'),
      'hex'
    );

  v_repaired_recovery :=
    jsonb_build_object(
      'contract_version', 1,
      'source_job_id', v_source_job.id,
      'source_job_updated_at', to_jsonb(v_source_job.updated_at),
      'source_staging_rows', v_source_rows,
      'source_identity_digest', v_source_identity_digest,
      'keyword_counts_derived_from_staging', true,
      'request_counts_reconstructed', false,
      'prepared_at', to_jsonb(v_candidate.created_at),
      'confirmation_token', v_new_confirmation_token,
      'expected_current_ingestion_id', v_current_ingestion_id,
      'expected_published_ingestion_id', v_published_ingestion_id,
      'isolated', true
    );

  v_repaired_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{recovery}',
      v_repaired_recovery,
      true
    );

  v_repaired_error_detail :=
    jsonb_build_object(
      'processing_checkpoint',
      v_repaired_checkpoint
    );

  update public.media_sync_jobs as job
  set
    status = 'cancelled',
    started_at = null,
    error_detail = v_repaired_error_detail,
    updated_at = v_repair_time
  where job.id = v_candidate_id
    and job.status = 'processing'
    and job.attempt_count = v_expected_candidate_attempt_count
    and job.updated_at = v_expected_candidate_updated_at
    and job.started_at = v_expected_candidate_started_at
    and job.finished_at is null
    and job.snapshot_ingestion_id is null
    and job.error is null
    and job.raw_rows = v_candidate_expected_rows
    and job.normalized_rows = v_candidate_expected_rows
    and job.inserted_rows = v_candidate_expected_rows
    and job.error_detail is not distinct from v_candidate.error_detail
  returning job.*
  into v_candidate_after;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'RECOVERY_REISOLATION_UPDATE_NOT_APPLIED';
  end if;

  if (
    to_jsonb(v_candidate_after)
      - 'status'
      - 'started_at'
      - 'error_detail'
      - 'updated_at'
  ) is distinct from (
    to_jsonb(v_candidate)
      - 'status'
      - 'started_at'
      - 'error_detail'
      - 'updated_at'
  )
     or v_candidate_after.status is distinct from 'cancelled'
     or v_candidate_after.started_at is not null
     or v_candidate_after.error_detail is distinct from
        v_repaired_error_detail
     or v_candidate_after.updated_at is distinct from v_repair_time
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_UPDATE_SCOPE_BREACHED';
  end if;

  select job.*
  into v_source_job_after
  from public.media_sync_jobs as job
  where job.id = v_source_job_id;

  select report.*
  into v_report_after
  from public.reports as report
  where report.id = v_report_id;

  if to_jsonb(v_source_job_after) is distinct from to_jsonb(v_source_job)
     or v_report_after.workspace_id is distinct from v_report.workspace_id
     or v_report_after.advertiser_id is distinct from v_report.advertiser_id
     or v_report_after.current_ingestion_id is distinct from
        v_report.current_ingestion_id
     or v_report_after.published_ingestion_id is distinct from
        v_report.published_ingestion_id
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_EXTERNAL_STATE_CHANGED';
  end if;

  select
    count(*)::bigint,
    min(row.row_index)::bigint,
    max(row.row_index)::bigint
  into
    v_candidate_post_rows,
    v_candidate_post_min_row_index,
    v_candidate_post_max_row_index
  from public.media_sync_staging_rows as row
  where row.job_id = v_candidate_id;

  if v_candidate_post_rows <> v_candidate_rows
     or v_candidate_post_min_row_index is distinct from
        v_candidate_min_row_index
     or v_candidate_post_max_row_index is distinct from
        v_candidate_max_row_index
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_CANDIDATE_STAGING_CHANGED';
  end if;

  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            '[' ||
            row.row_index::text || ',' ||
            row.date_window_index::text || ',' ||
            to_json(row.date::text)::text || ',' ||
            to_json(row.row_key)::text || ',' ||
            to_json(row.row_fingerprint)::text ||
            E']\n',
            ''
            order by row.row_index asc, row.row_key asc
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_source_post_rows,
    v_source_post_identity_digest
  from public.media_sync_staging_rows as row
  where row.job_id = v_source_job_id;

  if v_source_post_rows <> v_source_rows
     or v_source_post_identity_digest is distinct from
        v_source_identity_digest
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_SOURCE_STAGING_CHANGED';
  end if;

  select encode(
    extensions.digest(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ingestion.id,
            'row_count', ingestion.row_count,
            'status', ingestion.status,
            'error', ingestion.error,
            'updated_at', ingestion.updated_at
          )
          order by ingestion.id
        ),
        '[]'::jsonb
      )::text,
      'sha256'
    ),
    'hex'
  )
  into v_report_ingestions_digest_after
  from public.report_ingestions as ingestion
  where ingestion.report_id = v_report_id;

  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            to_jsonb(row)::text || E'\n',
            ''
            order by row.row_index, row.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_current_sentinel_count_after,
    v_current_sentinel_digest_after
  from public.report_rows as row
  where row.report_id = v_report_id
    and row.ingestion_id = v_current_ingestion_id
    and row.row_index in (0, 58, 117);

  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            to_jsonb(row)::text || E'\n',
            ''
            order by row.row_index, row.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_published_sentinel_count_after,
    v_published_sentinel_digest_after
  from public.report_rows as row
  where row.report_id = v_report_id
    and row.ingestion_id = v_published_ingestion_id
    and row.row_index in (0, 22256, 44513);

  if v_report_ingestions_digest_after is distinct from
       v_report_ingestions_digest_before
     or v_current_sentinel_count_after <> v_current_sentinel_count_before
     or v_current_sentinel_digest_after is distinct from
        v_current_sentinel_digest_before
     or v_published_sentinel_count_after <>
        v_published_sentinel_count_before
     or v_published_sentinel_digest_after is distinct from
        v_published_sentinel_digest_before
  then
    raise exception using
      errcode = '55000',
      message = 'RECOVERY_REISOLATION_REPORT_SENTINEL_CHANGED';
  end if;

  raise notice 'authoritative partial re-isolation repair passed: true';
  raise notice 'candidate job id: %', v_candidate_after.id;
  raise notice 'candidate attempt count preserved: %',
    v_candidate_after.attempt_count;
  raise notice 'dynamic candidate rows: %', v_candidate_rows;
  raise notice 'immutable source prefix rows: %', v_source_rows;
  raise notice 'authoritative tail rows: %', v_authoritative_tail_rows;
  raise notice 'new candidate updated_at: %', v_candidate_after.updated_at;
  raise notice 'new exact confirmation token: %', v_new_confirmation_token;
  raise notice 'source staging unchanged: true';
  raise notice 'candidate staging unchanged: true';
  raise notice 'report pointers unchanged: true';
  raise notice 'report_ingestions descriptor digest unchanged: true';
  raise notice 'active report_rows sentinels unchanged: true';
  raise notice 'materialization called: false';
  raise notice 'activation called: false';
  raise notice 'finalization called: false';
end;
$repair$;

/*
 * Post-repair result row.
 * This SELECT recalculates the refreshed exact token from the repaired target
 * state inside the still-open transaction. Candidate totals remain dynamic.
 */
with
candidate as (
  select
    job.*,
    job.error_detail -> 'processing_checkpoint' as checkpoint,
    job.error_detail #> '{processing_checkpoint,recovery}' as recovery
  from public.media_sync_jobs as job
  where job.id = '4191baff-393f-4be8-bb38-31548d3ba051'::uuid
),
report_state as (
  select
    report.current_ingestion_id,
    report.published_ingestion_id
  from public.reports as report
  where report.id = 'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid
),
candidate_staging_state as (
  select
    count(*)::bigint as candidate_rows,
    min(row.row_index)::bigint as min_row_index,
    max(row.row_index)::bigint as max_row_index
  from public.media_sync_staging_rows as row
  where row.job_id = '4191baff-393f-4be8-bb38-31548d3ba051'::uuid
),
source_staging_state as (
  select
    count(*)::bigint as source_rows,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            '[' ||
            row.row_index::text || ',' ||
            row.date_window_index::text || ',' ||
            to_json(row.date::text)::text || ',' ||
            to_json(row.row_key)::text || ',' ||
            to_json(row.row_fingerprint)::text ||
            E']\n',
            ''
            order by row.row_index, row.row_key
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as source_identity_digest
  from public.media_sync_staging_rows as row
  where row.job_id = '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'::uuid
),
report_rows_state as (
  select
    count(*)::bigint as total_report_rows,
    count(*) filter (
      where row.ingestion_id =
        '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid
    )::bigint as current_report_rows,
    count(*) filter (
      where row.ingestion_id =
        '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid
    )::bigint as published_report_rows
  from public.report_rows as row
  where row.report_id = 'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid
),
confirmation as (
  select encode(
    extensions.digest(
      'version=1' || E'\n' ||
      'candidate_job_id=' || candidate.id::text || E'\n' ||
      'source_job_id=' ||
        (candidate.recovery ->> 'source_job_id') || E'\n' ||
      'expected_candidate_updated_at=' ||
        (to_jsonb(candidate.updated_at) #>> '{}') || E'\n' ||
      'report_id=' || candidate.report_id::text || E'\n' ||
      'workspace_id=' || candidate.workspace_id::text || E'\n' ||
      'advertiser_id=' || candidate.advertiser_id::text || E'\n' ||
      'connection_id=' || candidate.connection_id::text || E'\n' ||
      'current_ingestion_id=' || report_state.current_ingestion_id::text ||
        E'\n' ||
      'published_ingestion_id=' ||
        report_state.published_ingestion_id::text || E'\n' ||
      'checkpoint_phase=' ||
        (candidate.checkpoint #>> '{collector,phase}') || E'\n' ||
      'checkpoint_next_row_index=' ||
        (candidate.checkpoint #>> '{collector,next_row_index}') || E'\n' ||
      'checkpoint_total_rows=' ||
        (candidate.checkpoint #>> '{inserted_rows}') || E'\n' ||
      'candidate_rows=' || candidate_staging_state.candidate_rows::text ||
        E'\n' ||
      'base_rows=' || source_staging_state.source_rows::text || E'\n' ||
      'base_identity_digest=' ||
        source_staging_state.source_identity_digest || E'\n' ||
      'total_report_rows=' || report_rows_state.total_report_rows::text ||
        E'\n' ||
      'current_report_rows=' ||
        report_rows_state.current_report_rows::text || E'\n' ||
      'published_report_rows=' ||
        report_rows_state.published_report_rows::text,
      'sha256'
    ),
    'hex'
  ) as recalculated_confirmation_token
  from candidate
  cross join report_state
  cross join candidate_staging_state
  cross join source_staging_state
  cross join report_rows_state
)
select
  candidate.id as candidate_job_id,
  candidate.status as candidate_status,
  candidate.attempt_count as candidate_attempt_count,
  candidate.updated_at as candidate_updated_at,

  candidate.checkpoint #>> '{collector,phase}' as checkpoint_phase,
  candidate.checkpoint #>> '{collector,next_row_index}'
    as checkpoint_next_row_index,

  candidate_staging_state.candidate_rows,
  candidate_staging_state.min_row_index as candidate_min_row_index,
  candidate_staging_state.max_row_index as candidate_max_row_index,
  source_staging_state.source_rows as source_prefix_rows,
  candidate_staging_state.candidate_rows - source_staging_state.source_rows
    as authoritative_tail_rows,

  candidate.recovery ->> 'contract_version'
    as recovery_contract_version,
  candidate.recovery ->> 'source_job_id'
    as recovery_source_job_id,
  candidate.recovery ->> 'source_job_updated_at'
    as recovery_source_job_updated_at,
  candidate.recovery ->> 'source_staging_rows'
    as recovery_source_staging_rows,
  candidate.recovery ->> 'source_identity_digest'
    as recovery_source_identity_digest,
  candidate.recovery ->> 'prepared_at'
    as recovery_prepared_at,
  candidate.recovery ->> 'isolated'
    as recovery_isolated,

  candidate.recovery ->> 'confirmation_token'
    as stored_confirmation_token,
  confirmation.recalculated_confirmation_token,

  (
    candidate.recovery ->> 'confirmation_token' =
      confirmation.recalculated_confirmation_token
  ) as confirmation_token_matches,

  (
    candidate.status = 'cancelled'
    and candidate.attempt_count = 10
    and candidate.snapshot_ingestion_id is null
    and candidate.started_at is null
    and candidate.finished_at is null
    and candidate.error is null
    and candidate.raw_rows = candidate_staging_state.candidate_rows
    and candidate.normalized_rows = candidate_staging_state.candidate_rows
    and candidate.inserted_rows = candidate_staging_state.candidate_rows
    and candidate_staging_state.min_row_index = 0
    and candidate_staging_state.max_row_index =
        candidate_staging_state.candidate_rows - 1
    and candidate.checkpoint #>> '{collector,phase}' = 'authoritative'
    and (
      candidate.checkpoint #>> '{collector,next_row_index}'
    )::bigint = candidate_staging_state.candidate_rows
    and (
      candidate.checkpoint #>> '{inserted_rows}'
    )::bigint = candidate_staging_state.candidate_rows
    and candidate.recovery ->> 'contract_version' = '1'
    and candidate.recovery ->> 'source_job_id' =
      '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'
    and candidate.recovery ->> 'source_staging_rows' =
      source_staging_state.source_rows::text
    and candidate.recovery ->> 'source_identity_digest' =
      source_staging_state.source_identity_digest
    and candidate.recovery ->> 'isolated' = 'true'
    and source_staging_state.source_rows = 44514
    and source_staging_state.source_identity_digest =
      'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40'
    and candidate.recovery ->> 'confirmation_token' =
      confirmation.recalculated_confirmation_token
  ) as repair_postconditions_ok

from candidate
cross join candidate_staging_state
cross join source_staging_state
cross join confirmation;

commit;
