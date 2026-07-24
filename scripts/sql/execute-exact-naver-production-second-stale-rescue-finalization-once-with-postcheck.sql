/*
 * Etrylue Performance
 *
 * ONE-TIME ATOMIC SECOND-STALE RESCUE + EXACT FINALIZATION
 *
 * Candidate:
 *   4191baff-393f-4be8-bb38-31548d3ba051
 *
 * Active snapshot:
 *   38d08585-0b71-4147-a3bb-e15ebc9caa08
 *
 * Exact operation:
 * 1. Revalidate the second automatic stale-recovery state.
 * 2. Revalidate the already-active snapshot and report pointers.
 * 3. Reconstruct the approved processing checkpoint.
 * 4. Restore the candidate to processing/99.
 * 5. Call finalize_media_sync_job() exactly once in the same transaction.
 * 6. Require non-idempotent finalization.
 * 7. Require done/100 and connection.last_sync_at update.
 * 8. Preserve current/published pointers.
 * 9. Preserve staging, report_rows, report_ingestions and protected state.
 *
 * Explicitly forbidden:
 * - no collector
 * - no staging mutation
 * - no materialization
 * - no activation
 * - no reports update
 * - no published pointer update
 *
 * Failure contract:
 * - any exception rolls back both rescue and finalization;
 * - after a client/network ambiguity, do not rerun;
 * - inspect current state read-only first.
 */

begin isolation level serializable;

set local lock_timeout = '10s';
set local statement_timeout = '10min';


drop table if exists
  pg_temp.exact_second_stale_finalization_result;

drop view if exists
  pg_temp.exact_second_stale_finalization_integrity;


create temporary table
exact_second_stale_finalization_result (
  all_checks_passed boolean not null,

  rescue_updates integer not null,
  finalization_calls integer not null,
  activation_calls integer not null,
  materialization_calls integer not null,

  exact_second_stale_prestate_ok boolean not null,
  reconstructed_checkpoint_applied boolean not null,
  finalization_function_contract_ok boolean not null,

  candidate_finalized_exactly_once boolean not null,
  candidate_protected_state_unchanged boolean not null,

  report_unchanged boolean not null,
  report_pointers_unchanged boolean not null,
  published_pointer_unchanged boolean not null,

  connection_updated_exactly boolean not null,
  connection_protected_state_unchanged boolean not null,

  source_job_unchanged boolean not null,
  snapshot_ingestion_unchanged boolean not null,
  report_ingestions_unchanged boolean not null,
  staging_and_snapshot_unchanged boolean not null,

  candidate_job_id uuid not null,
  previous_ingestion_id uuid not null,
  snapshot_ingestion_id uuid not null,
  current_ingestion_id uuid not null,
  published_ingestion_id uuid not null,

  candidate_status text not null,
  candidate_progress integer not null,
  candidate_attempt_count bigint not null,
  candidate_started_at timestamptz,
  candidate_finished_at timestamptz not null,
  candidate_updated_at timestamptz not null,
  candidate_error text,

  connection_id uuid not null,
  connection_last_sync_at timestamptz not null,
  connection_updated_at timestamptz not null,
  connection_last_error text,
  connection_updated boolean not null,

  candidate_staging_rows bigint not null,
  snapshot_report_rows bigint not null,

  missing_materialized_rows bigint not null,
  extra_materialized_rows bigint not null,
  mismatched_materialized_rows bigint not null,

  candidate_staging_fingerprint text not null,
  snapshot_content_fingerprint text not null,

  reconstructed_recovery_digest text not null,
  reconstructed_checkpoint_digest text not null,
  reconstructed_error_detail_digest text not null,

  rpc_staging_fingerprint text not null,
  rpc_materialized_fingerprint text not null,

  rpc_finished_at timestamptz not null,
  rpc_connection_last_sync_at timestamptz not null,
  rpc_idempotent boolean not null,

  active_jobs_before bigint not null,
  active_jobs_after bigint not null
)
on commit preserve rows;


/*
 * Read-only staging/snapshot integrity view.
 *
 * Both sides are scoped before joining on row_index.
 */
create temporary view
exact_second_stale_finalization_integrity
as
with
params as (
  select
    '4191baff-393f-4be8-bb38-31548d3ba051'::uuid
      as candidate_job_id,

    'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid
      as report_id,

    '27b1556f-9d42-496f-bd7e-5a59ebee71d4'::uuid
      as workspace_id,

    'da51e71a-01ce-42fb-a937-7af0b5f47786'::uuid
      as advertiser_id,

    '38d08585-0b71-4147-a3bb-e15ebc9caa08'::uuid
      as snapshot_ingestion_id
),

candidate_scope as (
  select staging.*
  from public.media_sync_staging_rows
    as staging

  cross join params

  where staging.job_id =
    params.candidate_job_id
),

snapshot_scope as (
  select report_row.*
  from public.report_rows
    as report_row

  cross join params

  where report_row.report_id =
      params.report_id

    and report_row.ingestion_id =
      params.snapshot_ingestion_id
),

candidate_summary as (
  select
    count(*)::bigint
      as candidate_rows,

    min(staging.row_index)::bigint
      as candidate_min_row_index,

    max(staging.row_index)::bigint
      as candidate_max_row_index,

    count(
      distinct staging.row_index
    )::bigint
      as candidate_distinct_row_indexes,

    count(
      distinct (
        staging.date_window_index,
        staging.row_key
      )
    )::bigint
      as candidate_distinct_window_row_keys,

    count(*) filter (
      where staging.row is null

         or staging.row_fingerprint is null

         or staging.row_fingerprint
            !~ '^[0-9a-f]{64}$'

         or staging.row_fingerprint
            is distinct from encode(
              extensions.digest(
                pg_catalog.convert_to(
                  staging.row::text,
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            )
    )::bigint
      as candidate_invalid_rows

  from candidate_scope as staging
),

candidate_blocks as (
  select
    (
      staging.row_index / 10000
    )::bigint
      as block_index,

    count(*)::bigint
      as block_rows,

    min(staging.row_index)::bigint
      as block_min_row_index,

    max(staging.row_index)::bigint
      as block_max_row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              staging.row_index::text ||
              ':' ||
              staging.row_fingerprint,
              E'\n'
              order by staging.row_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as block_digest

  from candidate_scope as staging

  group by
    (
      staging.row_index / 10000
    )::bigint
),

candidate_fingerprint as (
  select
    coalesce(
      sum(block.block_rows),
      0
    )::bigint
      as candidate_fingerprint_rows,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'chunked_sha256_v1:block_size=10000' ||
          E'\n' ||
          coalesce(
            string_agg(
              block.block_index::text ||
              ':' ||
              block.block_rows::text ||
              ':' ||
              block.block_min_row_index::text ||
              ':' ||
              block.block_max_row_index::text ||
              ':' ||
              block.block_digest,
              E'\n'
              order by block.block_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as candidate_staging_fingerprint

  from candidate_blocks as block
),

snapshot_summary as (
  select
    count(*)::bigint
      as snapshot_rows,

    min(report_row.row_index)::bigint
      as snapshot_min_row_index,

    max(report_row.row_index)::bigint
      as snapshot_max_row_index,

    count(
      distinct report_row.row_index
    )::bigint
      as snapshot_distinct_row_indexes

  from snapshot_scope as report_row
),

snapshot_hashed_rows as (
  select
    report_row.row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          report_row.row::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as row_fingerprint

  from snapshot_scope as report_row
),

snapshot_blocks as (
  select
    (
      report_row.row_index / 10000
    )::bigint
      as block_index,

    count(*)::bigint
      as block_rows,

    min(report_row.row_index)::bigint
      as block_min_row_index,

    max(report_row.row_index)::bigint
      as block_max_row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              report_row.row_index::text ||
              ':' ||
              report_row.row_fingerprint,
              E'\n'
              order by report_row.row_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as block_digest

  from snapshot_hashed_rows as report_row

  group by
    (
      report_row.row_index / 10000
    )::bigint
),

snapshot_fingerprint as (
  select
    coalesce(
      sum(block.block_rows),
      0
    )::bigint
      as snapshot_fingerprint_rows,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'chunked_sha256_v1:block_size=10000' ||
          E'\n' ||
          coalesce(
            string_agg(
              block.block_index::text ||
              ':' ||
              block.block_rows::text ||
              ':' ||
              block.block_min_row_index::text ||
              ':' ||
              block.block_max_row_index::text ||
              ':' ||
              block.block_digest,
              E'\n'
              order by block.block_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as snapshot_content_fingerprint

  from snapshot_blocks as block
),

comparison_summary as (
  select
    count(*) filter (
      where staging.row_index is not null
        and report_row.row_index is null
    )::bigint
      as missing_materialized_rows,

    count(*) filter (
      where staging.row_index is null
        and report_row.row_index is not null
    )::bigint
      as extra_materialized_rows,

    count(*) filter (
      where staging.row_index is not null
        and report_row.row_index is not null

        and (
          report_row.workspace_id
            is distinct from
            params.workspace_id

          or report_row.advertiser_id
            is distinct from
            params.advertiser_id

          or report_row.date
            is distinct from
            staging.date

          or report_row.channel
            is distinct from
            staging.channel

          or report_row.device
            is distinct from
            staging.device

          or report_row.source
            is distinct from
            staging.source

          or report_row.row
            is distinct from
            staging.row
        )
    )::bigint
      as mismatched_materialized_rows

  from candidate_scope as staging

  full outer join snapshot_scope as report_row
    on report_row.row_index =
       staging.row_index

  cross join params
)

select
  candidate_summary.*,
  candidate_fingerprint.*,
  snapshot_summary.*,
  snapshot_fingerprint.*,
  comparison_summary.*

from candidate_summary
cross join candidate_fingerprint
cross join snapshot_summary
cross join snapshot_fingerprint
cross join comparison_summary;


/*
 * Exact rescue + finalization transaction.
 */
do $exact_finalization$
declare
  v_candidate_job_id constant uuid :=
    '4191baff-393f-4be8-bb38-31548d3ba051'::uuid;

  v_source_job_id constant uuid :=
    '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'::uuid;

  v_report_id constant uuid :=
    'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid;

  v_workspace_id constant uuid :=
    '27b1556f-9d42-496f-bd7e-5a59ebee71d4'::uuid;

  v_advertiser_id constant uuid :=
    'da51e71a-01ce-42fb-a937-7af0b5f47786'::uuid;

  v_connection_id constant uuid :=
    'aba7d28f-ec85-49db-941a-fa5babe2af61'::uuid;

  v_previous_ingestion_id constant uuid :=
    '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid;

  v_snapshot_ingestion_id constant uuid :=
    '38d08585-0b71-4147-a3bb-e15ebc9caa08'::uuid;

  v_published_ingestion_id constant uuid :=
    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid;

  v_candidate_started_at constant timestamptz :=
    '2026-07-22 15:54:47.859002+00'::timestamptz;

  v_candidate_created_at constant timestamptz :=
    '2026-07-20 09:42:12.950518+00'::timestamptz;

  v_second_stale_recovered_at constant timestamptz :=
    '2026-07-23 08:22:48.323+00'::timestamptz;

  v_report_updated_at constant timestamptz :=
    '2026-07-23 07:22:11.116358+00'::timestamptz;

  v_connection_last_sync_at constant timestamptz :=
    '2026-07-18 01:42:18.497659+00'::timestamptz;

  v_connection_updated_at constant timestamptz :=
    '2026-07-18 01:42:18.512662+00'::timestamptz;

  v_repair_applied_at constant timestamptz :=
    '2026-07-22 14:23:11.371149+00'::timestamptz;

  v_source_job_updated_at constant timestamptz :=
    '2026-07-19 11:59:16.834+00'::timestamptz;

  v_expected_rows constant bigint :=
    44604;

  v_expected_attempt_count constant bigint :=
    12;

  v_source_staging_rows constant bigint :=
    44514;

  v_original_candidate_rows constant bigint :=
    45808;

  v_excluded_rows constant bigint :=
    1204;

  v_confirmation_token constant text :=
    '7aa3be46fb606536de8c3bc9540a311426da8b203508cebeef1d2e93fd8668d2';

  v_original_confirmation_token constant text :=
    '31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127';

  v_repaired_fingerprint constant text :=
    '1874890814e763dfe834ae0d97698157e707939ef5a213be8582a9bc264c35f1';

  v_original_candidate_fingerprint constant text :=
    'f11def9d7faa36e7233878a5cb533c048c17225f519324de80c289f5d8e4ad28';

  v_source_identity_digest constant text :=
    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40';

  v_expected_recovery_digest constant text :=
    'bb5d8cd70f7d2ba70ffc01c011f5d91de1207b5c1c477d42985be44135b7bbb1';

  v_expected_checkpoint_digest constant text :=
    '3aa9b21cd6309f0a6d4afa0e8ea724fdf776ebd3acde494e2167b71335ea0528';

  v_expected_error_detail_digest constant text :=
    'd0f1b0a5f155b075537b4d7d7638bd7afca8e1b72df4dd077a37ec1db5d9d059';

  v_completion_fingerprint constant text :=
    '4a27de20e074e156fef2eb2309076e46c511f590d60dcc1b36d8767cb93dffe8';


  v_candidate_before public.media_sync_jobs%rowtype;
  v_candidate_rescued public.media_sync_jobs%rowtype;
  v_candidate_after public.media_sync_jobs%rowtype;

  v_source_before public.media_sync_jobs%rowtype;
  v_source_after public.media_sync_jobs%rowtype;

  v_report_before public.reports%rowtype;
  v_report_after public.reports%rowtype;

  v_snapshot_before public.report_ingestions%rowtype;
  v_snapshot_after public.report_ingestions%rowtype;

  v_connection_before public.media_connections%rowtype;
  v_connection_after public.media_connections%rowtype;

  v_integrity_before record;
  v_integrity_after record;

  v_finalization record;

  v_expected_second_stale_error_detail jsonb;
  v_first_stale_error_detail jsonb;

  v_recovery jsonb;
  v_checkpoint jsonb;
  v_reconstructed_error_detail jsonb;

  v_actual_recovery_digest text;
  v_actual_checkpoint_digest text;
  v_actual_error_detail_digest text;

  v_function_definition text;

  v_public_update_count bigint;
  v_job_update_count bigint;
  v_connection_update_count bigint;
  v_forbidden_dml_count bigint;

  v_report_ingestions_count_before bigint;
  v_report_ingestions_count_after bigint;

  v_report_ingestions_digest_before text;
  v_report_ingestions_digest_after text;

  v_active_jobs_before bigint;
  v_active_jobs_after bigint;

  v_rescue_updates integer := 0;
  v_finalization_calls integer := 0;

  v_finalization_function_contract_ok boolean;

  v_candidate_finalized_exactly_once boolean;
  v_candidate_protected_state_unchanged boolean;

  v_report_unchanged boolean;
  v_report_pointers_unchanged boolean;
  v_published_pointer_unchanged boolean;

  v_connection_updated_exactly boolean;
  v_connection_protected_state_unchanged boolean;

  v_source_job_unchanged boolean;
  v_snapshot_ingestion_unchanged boolean;
  v_report_ingestions_unchanged boolean;
  v_staging_and_snapshot_unchanged boolean;
begin
  /*
   * Lock exact mutable rows before rescue.
   */
  select job.*
  into strict v_candidate_before
  from public.media_sync_jobs as job
  where job.id =
    v_candidate_job_id
  for update;


  select job.*
  into strict v_source_before
  from public.media_sync_jobs as job
  where job.id =
    v_source_job_id
  for share;


  select report.*
  into strict v_report_before
  from public.reports as report
  where report.id =
    v_report_id
  for update;


  select ingestion.*
  into strict v_snapshot_before
  from public.report_ingestions as ingestion
  where ingestion.id =
    v_snapshot_ingestion_id
  for share;


  select connection.*
  into strict v_connection_before
  from public.media_connections as connection
  where connection.id =
    v_connection_id
  for update;


  /*
   * Exact second stale payload currently stored on the candidate.
   */
  v_expected_second_stale_error_detail :=
    jsonb_build_object(
      'code',
        'STALE_PROCESSING_JOB',

      'stage',
        'stale_recovery',

      'cutoff',
        '2026-07-23T07:22:48.041Z',

      'source',
        'automatic_recovery',

      'message',
        'Media sync processing job exceeded the stale processing threshold and was recovered automatically.',

      'stale_ms',
        3600000,

      'recovered_at',
        '2026-07-23T08:22:48.323Z'
    );


  /*
   * First stale payload retained by the approved reconstruction contract.
   */
  v_first_stale_error_detail :=
    jsonb_build_object(
      'code',
        'STALE_PROCESSING_JOB',

      'stage',
        'stale_recovery',

      'cutoff',
        '2026-07-22T16:17:28.519Z',

      'source',
        'automatic_recovery',

      'message',
        'Media sync processing job exceeded the stale processing threshold and was recovered automatically.',

      'stale_ms',
        3600000,

      'recovered_at',
        '2026-07-22T17:17:28.681Z'
    );


  /*
   * Exact second stale candidate prestate.
   */
  if v_candidate_before.report_id is distinct from
       v_report_id

     or v_candidate_before.workspace_id is distinct from
        v_workspace_id

     or v_candidate_before.advertiser_id is distinct from
        v_advertiser_id

     or v_candidate_before.connection_id is distinct from
        v_connection_id

     or v_candidate_before.provider is distinct from
        'naver_searchad'

     or v_candidate_before.external_account_id is distinct from
        '703575'

     or v_candidate_before.date_from is distinct from
        '2026-05-01'::date

     or v_candidate_before.date_to is distinct from
        '2026-05-02'::date

     or v_candidate_before.data_level is distinct from
        'mixed'

     or v_candidate_before.mode is distinct from
        'snapshot_replace'

     or v_candidate_before.status is distinct from
        'failed'

     or v_candidate_before.progress is distinct from
        0

     or v_candidate_before.attempt_count is distinct from
        v_expected_attempt_count

     or v_candidate_before.created_at is distinct from
        v_candidate_created_at

     or v_candidate_before.started_at is distinct from
        v_candidate_started_at

     or v_candidate_before.finished_at is distinct from
        v_second_stale_recovered_at

     or v_candidate_before.updated_at is distinct from
        v_second_stale_recovered_at

     or v_candidate_before.error is distinct from
        'STALE_PROCESSING_JOB'

     or v_candidate_before.error_detail is distinct from
        v_expected_second_stale_error_detail

     or v_candidate_before.previous_ingestion_id is distinct from
        v_previous_ingestion_id

     or v_candidate_before.snapshot_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_candidate_before.raw_rows is distinct from
        v_expected_rows

     or v_candidate_before.normalized_rows is distinct from
        v_expected_rows

     or v_candidate_before.inserted_rows is distinct from
        v_expected_rows

     or v_candidate_before.failed_rows is distinct from
        0
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_FINALIZATION_PRESTATE_MISMATCH';
  end if;


  /*
   * Already-committed activation state.
   */
  if v_report_before.workspace_id is distinct from
       v_workspace_id

     or v_report_before.advertiser_id is distinct from
        v_advertiser_id

     or v_report_before.current_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_report_before.published_ingestion_id is distinct from
        v_published_ingestion_id

     or v_report_before.updated_at is distinct from
        v_report_updated_at
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_REPORT_PRESTATE_MISMATCH';
  end if;


  if v_snapshot_before.workspace_id is distinct from
       v_workspace_id

     or v_snapshot_before.report_id is distinct from
        v_report_id

     or v_snapshot_before.kind is distinct from
        'api'

     or v_snapshot_before.status is distinct from
        'success'

     or v_snapshot_before.row_count is distinct from
        v_expected_rows::integer

     or v_snapshot_before.csv_path is not null

     or v_snapshot_before.error is not null

     or v_snapshot_before.created_by is distinct from
        v_candidate_before.created_by
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_SNAPSHOT_PRESTATE_MISMATCH';
  end if;


  if v_connection_before.workspace_id is distinct from
       v_workspace_id

     or v_connection_before.advertiser_id is distinct from
        v_advertiser_id

     or v_connection_before.provider is distinct from
        'naver_searchad'

     or v_connection_before.external_account_id is distinct from
        '703575'

     or v_connection_before.status is distinct from
        'active'

     or v_connection_before.last_sync_at is distinct from
        v_connection_last_sync_at

     or v_connection_before.last_error is not null

     or v_connection_before.updated_at is distinct from
        v_connection_updated_at
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_CONNECTION_PRESTATE_MISMATCH';
  end if;


  if v_source_before.report_id is distinct from
       v_report_id

     or v_source_before.workspace_id is distinct from
        v_workspace_id

     or v_source_before.advertiser_id is distinct from
        v_advertiser_id

     or v_source_before.connection_id is distinct from
        v_connection_id

     or v_source_before.provider is distinct from
        'naver_searchad'

     or v_source_before.status is distinct from
        'failed'

     or v_source_before.updated_at is distinct from
        v_source_job_updated_at

     or v_source_before.error is distinct from
        'DATABASE_ERROR'
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_SOURCE_PRESTATE_MISMATCH';
  end if;


  select count(*)::bigint
  into v_active_jobs_before
  from public.media_sync_jobs as job
  where job.report_id =
      v_report_id

    and job.status in (
      'pending',
      'processing'
    );


  if v_active_jobs_before <> 0 then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_ACTIVE_JOB_EXISTS';
  end if;


  /*
   * Revalidate candidate staging and active snapshot.
   */
  select integrity.*
  into strict v_integrity_before
  from exact_second_stale_finalization_integrity
    as integrity;


  if v_integrity_before.candidate_rows <>
       v_expected_rows

     or v_integrity_before.candidate_min_row_index <>
        0

     or v_integrity_before.candidate_max_row_index <>
        v_expected_rows - 1

     or v_integrity_before.candidate_distinct_row_indexes <>
        v_expected_rows

     or v_integrity_before.candidate_distinct_window_row_keys <>
        v_expected_rows

     or v_integrity_before.candidate_invalid_rows <>
        0

     or v_integrity_before.candidate_fingerprint_rows <>
        v_expected_rows

     or v_integrity_before.candidate_staging_fingerprint <>
        v_repaired_fingerprint

     or v_integrity_before.snapshot_rows <>
        v_expected_rows

     or v_integrity_before.snapshot_min_row_index <>
        0

     or v_integrity_before.snapshot_max_row_index <>
        v_expected_rows - 1

     or v_integrity_before.snapshot_distinct_row_indexes <>
        v_expected_rows

     or v_integrity_before.snapshot_fingerprint_rows <>
        v_expected_rows

     or v_integrity_before.snapshot_content_fingerprint <>
        v_repaired_fingerprint

     or v_integrity_before.missing_materialized_rows <>
        0

     or v_integrity_before.extra_materialized_rows <>
        0

     or v_integrity_before.mismatched_materialized_rows <>
        0
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_INTEGRITY_PRECHECK_FAILED';
  end if;


  /*
   * Reconstruct the exact approved recovery/checkpoint contract.
   */
  v_recovery :=
    jsonb_build_object(
      'contract_version',
        2,

      'source_job_id',
        v_source_job_id,

      'source_job_updated_at',
        to_jsonb(
          v_source_job_updated_at
        ),

      'source_staging_rows',
        v_source_staging_rows,

      'source_identity_digest',
        v_source_identity_digest,

      'keyword_counts_derived_from_staging',
        true,

      'request_counts_reconstructed',
        false,

      'prepared_at',
        to_jsonb(
          v_candidate_created_at
        ),

      'expected_current_ingestion_id',
        v_previous_ingestion_id,

      'expected_published_ingestion_id',
        v_published_ingestion_id,

      'isolated',
        true,

      'repair_kind',
        'brand_search_cross_grain_dedup_v1',

      'repair_applied_at',
        to_jsonb(
          v_repair_applied_at
        ),

      'repair_source_candidate_rows',
        v_original_candidate_rows,

      'repair_excluded_rows',
        v_excluded_rows,

      'repair_repaired_rows',
        v_expected_rows,

      'repair_matched_campaign_count',
        3,

      'repair_mixed_only_campaign_count',
        2,

      'repair_original_candidate_fingerprint',
        v_original_candidate_fingerprint,

      'repair_repaired_staging_fingerprint',
        v_repaired_fingerprint,

      'repair_fingerprint_algorithm',
        'chunked_sha256_v1:block_size=10000',

      'repair_original_confirmation_token',
        v_original_confirmation_token,

      'approved_impressions',
        7075,

      'approved_clicks',
        1183,

      'approved_cost',
        113850,

      'approved_conversions',
        67,

      'approved_revenue',
        12729300,

      'confirmation_token',
        v_confirmation_token
    );


  v_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          v_repair_applied_at
        ),

      'raw_rows',
        v_expected_rows,

      'normalized_rows',
        v_expected_rows,

      'inserted_rows',
        v_expected_rows,

      'failed_rows',
        0,

      'collector',
        jsonb_build_object(
          'combined_version',
            1,

          'phase',
            'completed',

          'next_row_index',
            v_expected_rows,

          'keyword',
            jsonb_build_object(
              'complete',
              true
            ),

          'authoritative',
            jsonb_build_object(
              'complete',
              true
            )
        ),

      'recovery',
        v_recovery
    );


  v_reconstructed_error_detail :=
    jsonb_build_object(
      'processing_checkpoint',
        v_checkpoint,

      'stale_recovery_rescue',
        jsonb_build_object(
          'contract_version',
            1,

          'rescue_kind',
            'exact_materialized_snapshot_activation',

          'original_error_detail',
            v_first_stale_error_detail,

          'snapshot_ingestion_id',
            v_snapshot_ingestion_id,

          'expected_current_ingestion_id',
            v_previous_ingestion_id,

          'expected_published_ingestion_id',
            v_published_ingestion_id
        )
    );


  v_actual_recovery_digest :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_recovery::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );


  v_actual_checkpoint_digest :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_checkpoint::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );


  v_actual_error_detail_digest :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_reconstructed_error_detail::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );


  if (
       select count(*)::bigint
       from jsonb_object_keys(
         v_recovery
       )
     ) <> 28

     or v_actual_recovery_digest <>
        v_expected_recovery_digest

     or v_actual_checkpoint_digest <>
        v_expected_checkpoint_digest

     or v_actual_error_detail_digest <>
        v_expected_error_detail_digest
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_RECONSTRUCTION_MISMATCH';
  end if;


  /*
   * Verify the registered finalization RPC contract before mutation.
   */
  select
    lower(
      pg_catalog.pg_get_functiondef(
        'public.finalize_media_sync_job(jsonb)'::regprocedure
      )
    )
  into strict
    v_function_definition;


  select count(*)::bigint
  into v_public_update_count
  from regexp_matches(
    v_function_definition,
    'update[[:space:]]+public\.',
    'g'
  );


  select count(*)::bigint
  into v_job_update_count
  from regexp_matches(
    v_function_definition,
    'update[[:space:]]+public\.media_sync_jobs',
    'g'
  );


  select count(*)::bigint
  into v_connection_update_count
  from regexp_matches(
    v_function_definition,
    'update[[:space:]]+public\.media_connections',
    'g'
  );


  select count(*)::bigint
  into v_forbidden_dml_count
  from regexp_matches(
    v_function_definition,
    '(insert[[:space:]]+into|update|delete[[:space:]]+from|truncate([[:space:]]+table)?)'
    '[[:space:]]+public\.(reports|report_rows|report_ingestions|media_sync_staging_rows)',
    'g'
  );


  v_finalization_function_contract_ok :=
    v_public_update_count =
      2

    and v_job_update_count =
      1

    and v_connection_update_count =
      1

    and v_forbidden_dml_count =
      0

    and v_function_definition !~
      'materialize_media_sync_snapshot[[:space:]]*\('

    and v_function_definition !~
      'activate_media_sync_snapshot[[:space:]]*\(';


  if not v_finalization_function_contract_ok then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_FINALIZATION_FUNCTION_CHANGED';
  end if;


  /*
   * Preserve report_ingestions descriptor state.
   */
  select
    count(*)::bigint,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            jsonb_agg(
              to_jsonb(ingestion)
              order by ingestion.id
            ),
            '[]'::jsonb
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )

  into
    v_report_ingestions_count_before,
    v_report_ingestions_digest_before

  from public.report_ingestions
    as ingestion

  where ingestion.report_id =
    v_report_id;


  /*
   * Rescue second stale state.
   *
   * The candidate row lock remains held until finalization and COMMIT.
   */
  update public.media_sync_jobs as job
  set
    status =
      'processing',

    progress =
      99,

    finished_at =
      null,

    error =
      null,

    error_detail =
      v_reconstructed_error_detail,

    updated_at =
      pg_catalog.clock_timestamp()

  where job.id =
      v_candidate_job_id

    and job.status =
      'failed'

    and job.progress =
      0

    and job.attempt_count =
      v_expected_attempt_count

    and job.started_at =
      v_candidate_started_at

    and job.finished_at =
      v_second_stale_recovered_at

    and job.updated_at =
      v_second_stale_recovered_at

    and job.error =
      'STALE_PROCESSING_JOB'

    and job.error_detail
      is not distinct from
      v_expected_second_stale_error_detail

    and job.previous_ingestion_id =
      v_previous_ingestion_id

    and job.snapshot_ingestion_id =
      v_snapshot_ingestion_id

    and job.raw_rows =
      v_expected_rows

    and job.normalized_rows =
      v_expected_rows

    and job.inserted_rows =
      v_expected_rows

    and job.failed_rows =
      0

  returning job.*
  into v_candidate_rescued;


  get diagnostics
    v_rescue_updates = row_count;


  if v_rescue_updates <> 1 then
    raise exception using
      errcode = '40001',
      message =
        'EXACT_SECOND_STALE_RESCUE_UPDATE_FAILED';
  end if;


  if v_candidate_rescued.status is distinct from
       'processing'

     or v_candidate_rescued.progress is distinct from
        99

     or v_candidate_rescued.attempt_count is distinct from
        v_expected_attempt_count

     or v_candidate_rescued.started_at is distinct from
        v_candidate_started_at

     or v_candidate_rescued.finished_at is not null

     or v_candidate_rescued.error is not null

     or v_candidate_rescued.error_detail is distinct from
        v_reconstructed_error_detail

     or v_candidate_rescued.snapshot_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_candidate_rescued.updated_at <=
        v_second_stale_recovered_at
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_RESCUE_RESULT_INVALID';
  end if;


  /*
   * Exact finalization RPC — exactly one invocation.
   */
  v_finalization_calls :=
    v_finalization_calls + 1;


  select finalization.*
  into strict v_finalization
  from public.finalize_media_sync_job(
    jsonb_build_object(
      'job_id',
        v_candidate_rescued.id,

      'report_id',
        v_candidate_rescued.report_id,

      'workspace_id',
        v_candidate_rescued.workspace_id,

      'advertiser_id',
        v_candidate_rescued.advertiser_id,

      'connection_id',
        v_candidate_rescued.connection_id,

      'provider',
        v_candidate_rescued.provider,

      'external_account_id',
        v_candidate_rescued.external_account_id,

      'date_from',
        v_candidate_rescued.date_from,

      'date_to',
        v_candidate_rescued.date_to,

      'previous_ingestion_id',
        v_previous_ingestion_id,

      'snapshot_ingestion_id',
        v_snapshot_ingestion_id,

      'expected_rows',
        v_expected_rows
    )
  ) as finalization;


  if v_finalization_calls <> 1

     or v_finalization.snapshot_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_finalization.current_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_finalization.published_ingestion_id is distinct from
        v_published_ingestion_id

     or v_finalization.row_count is distinct from
        v_expected_rows

     or v_finalization.staging_fingerprint is distinct from
        v_completion_fingerprint

     or v_finalization.materialized_fingerprint is distinct from
        v_completion_fingerprint

     or v_finalization.staging_fingerprint is distinct from
        v_finalization.materialized_fingerprint

     or v_finalization.finished_at is null

     or v_finalization.connection_id is distinct from
        v_connection_id

     or v_finalization.connection_last_sync_at is distinct from
        v_finalization.finished_at

     or v_finalization.connection_updated is distinct from
        true

     or v_finalization.idempotent is distinct from
        false
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_FINALIZATION_RPC_MISMATCH';
  end if;


  /*
   * Read final state in the same transaction.
   */
  select job.*
  into strict v_candidate_after
  from public.media_sync_jobs as job
  where job.id =
    v_candidate_job_id;


  select job.*
  into strict v_source_after
  from public.media_sync_jobs as job
  where job.id =
    v_source_job_id;


  select report.*
  into strict v_report_after
  from public.reports as report
  where report.id =
    v_report_id;


  select ingestion.*
  into strict v_snapshot_after
  from public.report_ingestions as ingestion
  where ingestion.id =
    v_snapshot_ingestion_id;


  select connection.*
  into strict v_connection_after
  from public.media_connections as connection
  where connection.id =
    v_connection_id;


  v_candidate_finalized_exactly_once :=
    v_candidate_after.status =
      'done'

    and v_candidate_after.progress =
      100

    and v_candidate_after.attempt_count =
      v_expected_attempt_count

    and v_candidate_after.started_at =
      v_candidate_started_at

    and v_candidate_after.finished_at is not null

    and v_candidate_after.finished_at =
      v_finalization.finished_at

    and v_candidate_after.updated_at =
      v_candidate_after.finished_at

    and v_candidate_after.updated_at >
      v_candidate_rescued.updated_at

    and v_candidate_after.error is null

    and v_candidate_after.previous_ingestion_id =
      v_previous_ingestion_id

    and v_candidate_after.snapshot_ingestion_id =
      v_snapshot_ingestion_id

    and v_candidate_after.raw_rows =
      v_expected_rows

    and v_candidate_after.normalized_rows =
      v_expected_rows

    and v_candidate_after.inserted_rows =
      v_expected_rows

    and v_candidate_after.failed_rows =
      0

    and v_candidate_after.error_detail =
      v_reconstructed_error_detail

    and to_jsonb(
      v_candidate_after
    ) =
      v_finalization.job;


  v_candidate_protected_state_unchanged :=
    (
      to_jsonb(
        v_candidate_after
      ) - array[
        'status',
        'progress',
        'finished_at',
        'error',
        'updated_at'
      ]::text[]
    ) = (
      to_jsonb(
        v_candidate_rescued
      ) - array[
        'status',
        'progress',
        'finished_at',
        'error',
        'updated_at'
      ]::text[]
    );


  v_report_unchanged :=
    to_jsonb(
      v_report_after
    ) =
      to_jsonb(
        v_report_before
      );


  v_report_pointers_unchanged :=
    v_report_after.current_ingestion_id =
      v_snapshot_ingestion_id

    and v_report_after.current_ingestion_id =
      v_report_before.current_ingestion_id

    and v_report_after.published_ingestion_id =
      v_published_ingestion_id

    and v_report_after.published_ingestion_id =
      v_report_before.published_ingestion_id;


  v_published_pointer_unchanged :=
    v_report_after.published_ingestion_id =
      v_published_ingestion_id

    and v_report_after.published_ingestion_id =
      v_report_before.published_ingestion_id;


  v_connection_updated_exactly :=
    v_connection_after.last_sync_at =
      v_candidate_after.finished_at

    and v_connection_after.last_sync_at =
      v_finalization.connection_last_sync_at

    and v_connection_after.last_error is null

    and v_connection_after.updated_at >=
      v_candidate_after.finished_at

    and v_connection_after.last_sync_at >
      v_connection_before.last_sync_at

    and v_finalization.connection_updated =
      true;


  v_connection_protected_state_unchanged :=
    (
      to_jsonb(
        v_connection_after
      ) - array[
        'last_sync_at',
        'last_error',
        'updated_at'
      ]::text[]
    ) = (
      to_jsonb(
        v_connection_before
      ) - array[
        'last_sync_at',
        'last_error',
        'updated_at'
      ]::text[]
    );


  v_source_job_unchanged :=
    to_jsonb(
      v_source_after
    ) =
      to_jsonb(
        v_source_before
      );


  v_snapshot_ingestion_unchanged :=
    to_jsonb(
      v_snapshot_after
    ) =
      to_jsonb(
        v_snapshot_before
      );


  if not v_candidate_finalized_exactly_once

     or not v_candidate_protected_state_unchanged

     or not v_report_unchanged

     or not v_report_pointers_unchanged

     or not v_published_pointer_unchanged

     or not v_connection_updated_exactly

     or not v_connection_protected_state_unchanged

     or not v_source_job_unchanged

     or not v_snapshot_ingestion_unchanged
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_FINALIZATION_PROTECTED_STATE_MISMATCH';
  end if;


  /*
   * Recheck ingestion descriptors.
   */
  select
    count(*)::bigint,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            jsonb_agg(
              to_jsonb(ingestion)
              order by ingestion.id
            ),
            '[]'::jsonb
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )

  into
    v_report_ingestions_count_after,
    v_report_ingestions_digest_after

  from public.report_ingestions
    as ingestion

  where ingestion.report_id =
    v_report_id;


  v_report_ingestions_unchanged :=
    v_report_ingestions_count_after =
      v_report_ingestions_count_before

    and v_report_ingestions_digest_after =
      v_report_ingestions_digest_before;


  /*
   * Recheck candidate staging and active snapshot.
   */
  select integrity.*
  into strict v_integrity_after
  from exact_second_stale_finalization_integrity
    as integrity;


  v_staging_and_snapshot_unchanged :=
    to_jsonb(
      v_integrity_after
    ) =
      to_jsonb(
        v_integrity_before
    )

    and v_integrity_after.candidate_staging_fingerprint =
      v_repaired_fingerprint

    and v_integrity_after.snapshot_content_fingerprint =
      v_repaired_fingerprint

    and v_integrity_after.missing_materialized_rows =
      0

    and v_integrity_after.extra_materialized_rows =
      0

    and v_integrity_after.mismatched_materialized_rows =
      0;


  select count(*)::bigint
  into v_active_jobs_after
  from public.media_sync_jobs as job
  where job.report_id =
      v_report_id

    and job.status in (
      'pending',
      'processing'
    );


  if not v_report_ingestions_unchanged

     or not v_staging_and_snapshot_unchanged

     or v_active_jobs_after <>
        0
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_SECOND_STALE_FINALIZATION_POSTCHECK_FAILED';
  end if;


  insert into
    exact_second_stale_finalization_result (
      all_checks_passed,

      rescue_updates,
      finalization_calls,
      activation_calls,
      materialization_calls,

      exact_second_stale_prestate_ok,
      reconstructed_checkpoint_applied,
      finalization_function_contract_ok,

      candidate_finalized_exactly_once,
      candidate_protected_state_unchanged,

      report_unchanged,
      report_pointers_unchanged,
      published_pointer_unchanged,

      connection_updated_exactly,
      connection_protected_state_unchanged,

      source_job_unchanged,
      snapshot_ingestion_unchanged,
      report_ingestions_unchanged,
      staging_and_snapshot_unchanged,

      candidate_job_id,
      previous_ingestion_id,
      snapshot_ingestion_id,
      current_ingestion_id,
      published_ingestion_id,

      candidate_status,
      candidate_progress,
      candidate_attempt_count,
      candidate_started_at,
      candidate_finished_at,
      candidate_updated_at,
      candidate_error,

      connection_id,
      connection_last_sync_at,
      connection_updated_at,
      connection_last_error,
      connection_updated,

      candidate_staging_rows,
      snapshot_report_rows,

      missing_materialized_rows,
      extra_materialized_rows,
      mismatched_materialized_rows,

      candidate_staging_fingerprint,
      snapshot_content_fingerprint,

      reconstructed_recovery_digest,
      reconstructed_checkpoint_digest,
      reconstructed_error_detail_digest,

      rpc_staging_fingerprint,
      rpc_materialized_fingerprint,

      rpc_finished_at,
      rpc_connection_last_sync_at,
      rpc_idempotent,

      active_jobs_before,
      active_jobs_after
    )

  values (
    true,

    v_rescue_updates,
    v_finalization_calls,
    0,
    0,

    true,
    true,
    v_finalization_function_contract_ok,

    v_candidate_finalized_exactly_once,
    v_candidate_protected_state_unchanged,

    v_report_unchanged,
    v_report_pointers_unchanged,
    v_published_pointer_unchanged,

    v_connection_updated_exactly,
    v_connection_protected_state_unchanged,

    v_source_job_unchanged,
    v_snapshot_ingestion_unchanged,
    v_report_ingestions_unchanged,
    v_staging_and_snapshot_unchanged,

    v_candidate_job_id,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_report_after.current_ingestion_id,
    v_report_after.published_ingestion_id,

    v_candidate_after.status,
    v_candidate_after.progress,
    v_candidate_after.attempt_count,
    v_candidate_after.started_at,
    v_candidate_after.finished_at,
    v_candidate_after.updated_at,
    v_candidate_after.error,

    v_connection_after.id,
    v_connection_after.last_sync_at,
    v_connection_after.updated_at,
    v_connection_after.last_error,
    v_finalization.connection_updated,

    v_integrity_after.candidate_rows,
    v_integrity_after.snapshot_rows,

    v_integrity_after.missing_materialized_rows,
    v_integrity_after.extra_materialized_rows,
    v_integrity_after.mismatched_materialized_rows,

    v_integrity_after.candidate_staging_fingerprint,
    v_integrity_after.snapshot_content_fingerprint,

    v_actual_recovery_digest,
    v_actual_checkpoint_digest,
    v_actual_error_detail_digest,

    v_finalization.staging_fingerprint,
    v_finalization.materialized_fingerprint,

    v_finalization.finished_at,
    v_finalization.connection_last_sync_at,
    v_finalization.idempotent,

    v_active_jobs_before,
    v_active_jobs_after
  );
end;
$exact_finalization$;


commit;


select *
from exact_second_stale_finalization_result;