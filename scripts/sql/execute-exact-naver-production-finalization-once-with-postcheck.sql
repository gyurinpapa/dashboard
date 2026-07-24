/*
 * Etrylue Performance
 *
 * ONE-TIME EXACT PRODUCTION FINALIZATION
 *
 * Exact candidate:
 *   4191baff-393f-4be8-bb38-31548d3ba051
 *
 * Exact active snapshot:
 *   38d08585-0b71-4147-a3bb-e15ebc9caa08
 *
 * Exact operation:
 * 1. Revalidate the committed activation state.
 * 2. Revalidate the constant-time finalization RPC contract.
 * 3. Call finalize_media_sync_job() exactly once.
 * 4. Require a non-idempotent finalization.
 * 5. Require candidate status=done and progress=100.
 * 6. Require connection.last_sync_at=job.finished_at.
 * 7. Preserve current/published pointers.
 * 8. Preserve ingestion descriptors and protected candidate fields.
 * 9. Verify that this transaction did not write staging/report_rows/
 *    report_ingestions/reports.
 *
 * Explicitly forbidden:
 * - no collector
 * - no staging mutation
 * - no materialization
 * - no activation
 * - no report pointer update
 * - no published pointer update
 * - no report_rows scan
 * - no staging rows scan
 *
 * Failure contract:
 * - any exception rolls back the finalization;
 * - after a client/network ambiguity, never rerun immediately;
 * - inspect the committed state read-only first.
 */

begin isolation level serializable;

set local lock_timeout = '10s';
set local statement_timeout = '5min';


drop table if exists
  pg_temp.exact_naver_finalization_result;


create temporary table
exact_naver_finalization_result (
  all_checks_passed boolean not null,

  finalization_calls integer not null,
  activation_calls integer not null,
  materialization_calls integer not null,

  exact_activation_prestate_ok boolean not null,
  finalization_function_contract_ok boolean not null,
  candidate_finalized_exactly_once boolean not null,
  candidate_protected_state_unchanged boolean not null,

  report_pointers_unchanged boolean not null,
  published_pointer_unchanged boolean not null,

  connection_updated_exactly boolean not null,
  connection_protected_state_unchanged boolean not null,

  source_job_unchanged boolean not null,
  snapshot_ingestion_unchanged boolean not null,
  report_ingestions_unchanged boolean not null,

  staging_untouched_by_transaction boolean not null,
  report_rows_untouched_by_transaction boolean not null,
  reports_untouched_by_transaction boolean not null,
  report_ingestions_untouched_by_transaction boolean not null,

  no_staging_scan_performed boolean not null,
  no_report_rows_scan_performed boolean not null,

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

  snapshot_row_count bigint not null,

  reconstructed_error_detail_digest text not null,
  rpc_staging_fingerprint text not null,
  rpc_materialized_fingerprint text not null,

  rpc_finished_at timestamptz not null,
  rpc_connection_last_sync_at timestamptz not null,
  rpc_idempotent boolean not null,

  active_jobs_before bigint not null,
  active_jobs_after bigint not null,

  staging_write_delta bigint not null,
  report_rows_write_delta bigint not null,
  reports_write_delta bigint not null,
  report_ingestions_write_delta bigint not null
)
on commit preserve rows;


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

  v_candidate_updated_at constant timestamptz :=
    '2026-07-23 07:22:38.139071+00'::timestamptz;

  v_expected_rows constant bigint :=
    44604;

  v_expected_attempt_count constant bigint :=
    12;

  v_reconstructed_error_detail_digest constant text :=
    'd0f1b0a5f155b075537b4d7d7638bd7afca8e1b72df4dd077a37ec1db5d9d059';

  v_confirmation_token constant text :=
    '7aa3be46fb606536de8c3bc9540a311426da8b203508cebeef1d2e93fd8668d2';

  v_repaired_staging_fingerprint constant text :=
    '1874890814e763dfe834ae0d97698157e707939ef5a213be8582a9bc264c35f1';

  v_completion_fingerprint constant text :=
    '4a27de20e074e156fef2eb2309076e46c511f590d60dcc1b36d8767cb93dffe8';


  v_candidate_before public.media_sync_jobs%rowtype;
  v_candidate_after public.media_sync_jobs%rowtype;

  v_source_before public.media_sync_jobs%rowtype;
  v_source_after public.media_sync_jobs%rowtype;

  v_report_before public.reports%rowtype;
  v_report_after public.reports%rowtype;

  v_snapshot_before public.report_ingestions%rowtype;
  v_snapshot_after public.report_ingestions%rowtype;

  v_connection_before public.media_connections%rowtype;
  v_connection_after public.media_connections%rowtype;

  v_finalization record;

  v_function_definition text;

  v_public_update_count bigint;
  v_job_update_count bigint;
  v_connection_update_count bigint;
  v_insert_count bigint;
  v_delete_count bigint;
  v_truncate_count bigint;

  v_actual_error_detail_digest text;

  v_report_ingestions_count_before bigint;
  v_report_ingestions_count_after bigint;

  v_report_ingestions_digest_before text;
  v_report_ingestions_digest_after text;

  v_active_jobs_before bigint;
  v_active_jobs_after bigint;

  v_staging_writes_before bigint;
  v_staging_writes_after bigint;

  v_report_rows_writes_before bigint;
  v_report_rows_writes_after bigint;

  v_reports_writes_before bigint;
  v_reports_writes_after bigint;

  v_report_ingestions_writes_before bigint;
  v_report_ingestions_writes_after bigint;

  v_staging_write_delta bigint;
  v_report_rows_write_delta bigint;
  v_reports_write_delta bigint;
  v_report_ingestions_write_delta bigint;

  v_finalization_calls integer := 0;

  v_finalization_function_contract_ok boolean;
  v_candidate_finalized_exactly_once boolean;
  v_candidate_protected_state_unchanged boolean;

  v_report_pointers_unchanged boolean;
  v_published_pointer_unchanged boolean;

  v_connection_updated_exactly boolean;
  v_connection_protected_state_unchanged boolean;

  v_source_job_unchanged boolean;
  v_snapshot_ingestion_unchanged boolean;
  v_report_ingestions_unchanged boolean;

  v_staging_untouched boolean;
  v_report_rows_untouched boolean;
  v_reports_untouched boolean;
  v_report_ingestions_untouched boolean;
begin
  /*
   * Lock exact mutable rows.
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
   * Exact committed activation prestate.
   */
  v_actual_error_detail_digest :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_candidate_before.error_detail::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );


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
        'processing'

     or v_candidate_before.progress is distinct from
        99

     or v_candidate_before.attempt_count is distinct from
        v_expected_attempt_count

     or v_candidate_before.started_at is distinct from
        v_candidate_started_at

     or v_candidate_before.finished_at is not null

     or v_candidate_before.updated_at is distinct from
        v_candidate_updated_at

     or v_candidate_before.error is not null

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

     or v_actual_error_detail_digest is distinct from
        v_reconstructed_error_detail_digest

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,version}'
        is distinct from
          '1'

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,collector,combined_version}'
        is distinct from
          '1'

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,collector,phase}'
        is distinct from
          'completed'

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,collector,next_row_index}'
        is distinct from
          v_expected_rows::text

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,collector,keyword,complete}'
        is distinct from
          'true'

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,collector,authoritative,complete}'
        is distinct from
          'true'

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,recovery,confirmation_token}'
        is distinct from
          v_confirmation_token

     or v_candidate_before.error_detail
          #>> '{processing_checkpoint,recovery,repair_repaired_staging_fingerprint}'
        is distinct from
          v_repaired_staging_fingerprint

     or v_candidate_before.error_detail
          #>> '{stale_recovery_rescue,contract_version}'
        is distinct from
          '1'

     or v_candidate_before.error_detail
          #>> '{stale_recovery_rescue,rescue_kind}'
        is distinct from
          'exact_materialized_snapshot_activation'
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_FINALIZATION_CANDIDATE_PRESTATE_MISMATCH';
  end if;


  if v_report_before.workspace_id is distinct from
       v_workspace_id

     or v_report_before.advertiser_id is distinct from
        v_advertiser_id

     or v_report_before.current_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_report_before.published_ingestion_id is distinct from
        v_published_ingestion_id
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_FINALIZATION_REPORT_PRESTATE_MISMATCH';
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
        'EXACT_FINALIZATION_SNAPSHOT_PRESTATE_MISMATCH';
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

     or (
       v_connection_before.last_sync_at is not null

       and v_connection_before.last_sync_at >=
         pg_catalog.clock_timestamp()
     )
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_FINALIZATION_CONNECTION_PRESTATE_MISMATCH';
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

     or v_source_before.error is distinct from
        'DATABASE_ERROR'
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_FINALIZATION_SOURCE_PRESTATE_MISMATCH';
  end if;


  select
    count(*)::bigint
  into
    v_active_jobs_before
  from public.media_sync_jobs as job
  where job.report_id =
      v_report_id

    and job.status in (
      'pending',
      'processing'
    );


  if v_active_jobs_before <> 1

     or not exists (
       select 1
       from public.media_sync_jobs as active_job
       where active_job.id =
           v_candidate_job_id

         and active_job.report_id =
           v_report_id

         and active_job.status =
           'processing'
     )
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_FINALIZATION_ACTIVE_JOB_PRESTATE_MISMATCH';
  end if;


  /*
   * Verify the registered finalization function remains constant-time
   * and has only the approved public table UPDATE statements.
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
  into v_insert_count
  from regexp_matches(
    v_function_definition,
    'insert[[:space:]]+into',
    'g'
  );


  select count(*)::bigint
  into v_delete_count
  from regexp_matches(
    v_function_definition,
    'delete[[:space:]]+from',
    'g'
  );


  select count(*)::bigint
  into v_truncate_count
  from regexp_matches(
    v_function_definition,
    'truncate([[:space:]]+table)?',
    'g'
  );


  v_finalization_function_contract_ok :=
    v_public_update_count =
      2

    and v_job_update_count =
      1

    and v_connection_update_count =
      1

    and v_insert_count =
      0

    and v_delete_count =
      0

    and v_truncate_count =
      0

    and v_function_definition !~
      'from[[:space:]]+public\.report_rows'

    and v_function_definition !~
      'from[[:space:]]+public\.media_sync_staging_rows'

    and v_function_definition !~
      '(insert[[:space:]]+into|update|delete[[:space:]]+from)'
      '[[:space:]]+public\.(reports|report_rows|report_ingestions|media_sync_staging_rows)'

    and v_function_definition !~
      'materialize_media_sync_snapshot[[:space:]]*\('

    and v_function_definition !~
      'activate_media_sync_snapshot[[:space:]]*\('

    and v_function_definition !~
      'string_agg[[:space:]]*\('

    and v_function_definition !~
      'generate_series[[:space:]]*\(';


  if not v_finalization_function_contract_ok then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_FINALIZATION_FUNCTION_CONTRACT_CHANGED';
  end if;


  /*
   * Small descriptor only: this report currently has a small number of
   * ingestion descriptor rows. No report_rows or staging scan is used.
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

  from public.report_ingestions as ingestion

  where ingestion.report_id =
    v_report_id;


  /*
   * Capture current-transaction write counters before the RPC.
   */
  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.media_sync_staging_rows'::regclass
    ),
    0
  )::bigint
  into v_staging_writes_before;


  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.report_rows'::regclass
    ),
    0
  )::bigint
  into v_report_rows_writes_before;


  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.reports'::regclass
    ),
    0
  )::bigint
  into v_reports_writes_before;


  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.report_ingestions'::regclass
    ),
    0
  )::bigint
  into v_report_ingestions_writes_before;


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
        v_candidate_before.id,

      'report_id',
        v_candidate_before.report_id,

      'workspace_id',
        v_candidate_before.workspace_id,

      'advertiser_id',
        v_candidate_before.advertiser_id,

      'connection_id',
        v_candidate_before.connection_id,

      'provider',
        v_candidate_before.provider,

      'external_account_id',
        v_candidate_before.external_account_id,

      'date_from',
        v_candidate_before.date_from,

      'date_to',
        v_candidate_before.date_to,

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
        'EXACT_FINALIZATION_RPC_RESULT_MISMATCH';
  end if;


  /*
   * Load committed-in-transaction post-finalization state.
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
      v_candidate_before.updated_at

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
        v_candidate_before
      ) - array[
        'status',
        'progress',
        'finished_at',
        'error',
        'updated_at'
      ]::text[]
    );


  v_report_pointers_unchanged :=
    to_jsonb(
      v_report_after
    ) =
      to_jsonb(
        v_report_before
      )

    and v_report_after.current_ingestion_id =
      v_snapshot_ingestion_id

    and v_report_after.published_ingestion_id =
      v_published_ingestion_id;


  v_published_pointer_unchanged :=
    v_report_after.published_ingestion_id =
      v_report_before.published_ingestion_id

    and v_report_after.published_ingestion_id =
      v_published_ingestion_id;


  v_connection_updated_exactly :=
    v_connection_after.last_sync_at =
      v_candidate_after.finished_at

    and v_connection_after.last_sync_at =
      v_finalization.connection_last_sync_at

    and v_connection_after.last_error is null

    and v_connection_after.updated_at >=
      v_candidate_after.finished_at

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
        'EXACT_FINALIZATION_PROTECTED_STATE_MISMATCH';
  end if;


  /*
   * Recheck report ingestion descriptors.
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

  from public.report_ingestions as ingestion

  where ingestion.report_id =
    v_report_id;


  v_report_ingestions_unchanged :=
    v_report_ingestions_count_after =
      v_report_ingestions_count_before

    and v_report_ingestions_digest_after =
      v_report_ingestions_digest_before;


  /*
   * Capture current-transaction write counters after finalization.
   */
  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.media_sync_staging_rows'::regclass
    ),
    0
  )::bigint
  into v_staging_writes_after;


  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.report_rows'::regclass
    ),
    0
  )::bigint
  into v_report_rows_writes_after;


  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.reports'::regclass
    ),
    0
  )::bigint
  into v_reports_writes_after;


  select coalesce(
    (
      select
        stats.n_tup_ins +
        stats.n_tup_upd +
        stats.n_tup_del

      from pg_catalog.pg_stat_xact_user_tables as stats

      where stats.relid =
        'public.report_ingestions'::regclass
    ),
    0
  )::bigint
  into v_report_ingestions_writes_after;


  v_staging_write_delta :=
    v_staging_writes_after -
    v_staging_writes_before;


  v_report_rows_write_delta :=
    v_report_rows_writes_after -
    v_report_rows_writes_before;


  v_reports_write_delta :=
    v_reports_writes_after -
    v_reports_writes_before;


  v_report_ingestions_write_delta :=
    v_report_ingestions_writes_after -
    v_report_ingestions_writes_before;


  v_staging_untouched :=
    v_staging_write_delta =
      0;


  v_report_rows_untouched :=
    v_report_rows_write_delta =
      0;


  v_reports_untouched :=
    v_reports_write_delta =
      0;


  v_report_ingestions_untouched :=
    v_report_ingestions_write_delta =
      0;


  select
    count(*)::bigint
  into
    v_active_jobs_after
  from public.media_sync_jobs as job
  where job.report_id =
      v_report_id

    and job.status in (
      'pending',
      'processing'
    );


  if not v_report_ingestions_unchanged

     or not v_staging_untouched

     or not v_report_rows_untouched

     or not v_reports_untouched

     or not v_report_ingestions_untouched

     or v_active_jobs_after <>
        0
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_FINALIZATION_TRANSACTION_POSTCHECK_FAILED';
  end if;


  insert into
    exact_naver_finalization_result (
      all_checks_passed,

      finalization_calls,
      activation_calls,
      materialization_calls,

      exact_activation_prestate_ok,
      finalization_function_contract_ok,
      candidate_finalized_exactly_once,
      candidate_protected_state_unchanged,

      report_pointers_unchanged,
      published_pointer_unchanged,

      connection_updated_exactly,
      connection_protected_state_unchanged,

      source_job_unchanged,
      snapshot_ingestion_unchanged,
      report_ingestions_unchanged,

      staging_untouched_by_transaction,
      report_rows_untouched_by_transaction,
      reports_untouched_by_transaction,
      report_ingestions_untouched_by_transaction,

      no_staging_scan_performed,
      no_report_rows_scan_performed,

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

      snapshot_row_count,

      reconstructed_error_detail_digest,
      rpc_staging_fingerprint,
      rpc_materialized_fingerprint,

      rpc_finished_at,
      rpc_connection_last_sync_at,
      rpc_idempotent,

      active_jobs_before,
      active_jobs_after,

      staging_write_delta,
      report_rows_write_delta,
      reports_write_delta,
      report_ingestions_write_delta
    )

  values (
    true,

    v_finalization_calls,
    0,
    0,

    true,
    v_finalization_function_contract_ok,
    v_candidate_finalized_exactly_once,
    v_candidate_protected_state_unchanged,

    v_report_pointers_unchanged,
    v_published_pointer_unchanged,

    v_connection_updated_exactly,
    v_connection_protected_state_unchanged,

    v_source_job_unchanged,
    v_snapshot_ingestion_unchanged,
    v_report_ingestions_unchanged,

    v_staging_untouched,
    v_report_rows_untouched,
    v_reports_untouched,
    v_report_ingestions_untouched,

    true,
    true,

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

    v_snapshot_after.row_count::bigint,

    v_actual_error_detail_digest,
    v_finalization.staging_fingerprint,
    v_finalization.materialized_fingerprint,

    v_finalization.finished_at,
    v_finalization.connection_last_sync_at,
    v_finalization.idempotent,

    v_active_jobs_before,
    v_active_jobs_after,

    v_staging_write_delta,
    v_report_rows_write_delta,
    v_reports_write_delta,
    v_report_ingestions_write_delta
  );
end;
$exact_finalization$;


commit;


select *
from exact_naver_finalization_result;