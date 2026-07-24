/*
 * Etrylue Performance
 *
 * ONE-TIME ATOMIC STALE RESCUE + SNAPSHOT ACTIVATION
 *
 * Exact candidate:
 *   4191baff-393f-4be8-bb38-31548d3ba051
 *
 * Exact operation:
 * 1. Revalidate the exact stale-recovered candidate.
 * 2. Revalidate repaired staging and materialized snapshot.
 * 3. Reconstruct the approved recovery/checkpoint contract.
 * 4. Restore only the candidate lifecycle required for activation.
 * 5. Call activate_media_sync_snapshot() exactly once.
 * 6. Move only reports.current_ingestion_id.
 * 7. Preserve reports.published_ingestion_id.
 * 8. Preserve the rescued candidate state after activation.
 * 9. Perform postcheck in the same transaction.
 *
 * Explicitly forbidden:
 * - no collector
 * - no staging mutation
 * - no materialization
 * - no finalization
 * - no connection last_sync update
 *
 * Failure contract:
 * - any exception rolls back both rescue and activation;
 * - after an ambiguous client/network failure, do not rerun;
 * - inspect current state read-only first.
 */

begin isolation level serializable;

set local lock_timeout = '10s';
set local statement_timeout = '10min';


drop table if exists
  pg_temp.exact_stale_rescue_activation_result;

drop view if exists
  pg_temp.exact_stale_rescue_integrity;


create temporary table
exact_stale_rescue_activation_result (
  all_checks_passed boolean not null,

  rescue_updates integer not null,
  activation_calls integer not null,
  finalization_calls integer not null,

  exact_stale_candidate_revalidated boolean not null,
  reconstructed_checkpoint_applied boolean not null,
  candidate_rescued_and_preserved boolean not null,

  current_pointer_changed_only boolean not null,
  published_pointer_unchanged boolean not null,

  source_job_unchanged boolean not null,
  connection_unchanged boolean not null,
  snapshot_ingestion_unchanged boolean not null,
  report_ingestions_unchanged boolean not null,
  report_rows_unchanged boolean not null,
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
  candidate_finished_at timestamptz,
  candidate_updated_at timestamptz,
  candidate_error text,

  snapshot_report_rows bigint not null,
  keyword_rows bigint not null,
  creative_rows bigint not null,
  mixed_rows bigint not null,

  impressions numeric not null,
  clicks numeric not null,
  cost numeric not null,
  conversions numeric not null,
  revenue numeric not null,

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
  rpc_idempotent boolean not null
)
on commit preserve rows;


/*
 * Reusable integrity view.
 *
 * All staging and snapshot scopes are filtered before row_index joins.
 * Other jobs with the same row_index cannot enter the comparison.
 */
create temporary view
exact_stale_rescue_integrity
as
with
params as (
  select
    '4191baff-393f-4be8-bb38-31548d3ba051'::uuid
      as candidate_job_id,

    '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'::uuid
      as source_job_id,

    'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid
      as report_id,

    '27b1556f-9d42-496f-bd7e-5a59ebee71d4'::uuid
      as workspace_id,

    'da51e71a-01ce-42fb-a937-7af0b5f47786'::uuid
      as advertiser_id,

    '38d08585-0b71-4147-a3bb-e15ebc9caa08'::uuid
      as snapshot_ingestion_id
),

source_scope as (
  select staging.*
  from public.media_sync_staging_rows
    as staging

  cross join params

  where staging.job_id =
    params.source_job_id
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

source_summary as (
  select
    count(*)::bigint
      as source_rows,

    min(source.row_index)::bigint
      as source_min_row_index,

    max(source.row_index)::bigint
      as source_max_row_index,

    count(*) filter (
      where source.row is null

         or source.row_fingerprint is null

         or source.row_fingerprint
            !~ '^[0-9a-f]{64}$'

         or source.row_fingerprint
            is distinct from encode(
              extensions.digest(
                pg_catalog.convert_to(
                  source.row::text,
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            )
    )::bigint
      as source_invalid_rows,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              '[' ||
              source.row_index::text ||
              ',' ||
              source.date_window_index::text ||
              ',' ||
              to_json(
                source.date::text
              )::text ||
              ',' ||
              to_json(
                source.row_key
              )::text ||
              ',' ||
              to_json(
                source.row_fingerprint
              )::text ||
              E']\n',
              ''
              order by
                source.row_index,
                source.row_key
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as source_identity_digest

  from source_scope as source
),

candidate_summary as (
  select
    count(*)::bigint
      as candidate_rows,

    min(candidate.row_index)::bigint
      as candidate_min_row_index,

    max(candidate.row_index)::bigint
      as candidate_max_row_index,

    count(
      distinct candidate.row_index
    )::bigint
      as candidate_distinct_row_indexes,

    count(
      distinct (
        candidate.date_window_index,
        candidate.row_key
      )
    )::bigint
      as candidate_distinct_window_row_keys,

    count(*) filter (
      where candidate.row ->> 'row_level' =
        'keyword'
    )::bigint
      as keyword_rows,

    count(*) filter (
      where candidate.row ->> 'row_level' =
        'creative'
    )::bigint
      as creative_rows,

    count(*) filter (
      where candidate.row ->> 'row_level' =
        'mixed'
    )::bigint
      as mixed_rows,

    coalesce(
      sum(
        (
          candidate.row ->> 'impressions'
        )::numeric
      ),
      0
    ) as impressions,

    coalesce(
      sum(
        (
          candidate.row ->> 'clicks'
        )::numeric
      ),
      0
    ) as clicks,

    coalesce(
      sum(
        (
          candidate.row ->> 'cost'
        )::numeric
      ),
      0
    ) as cost,

    coalesce(
      sum(
        (
          candidate.row ->> 'conversions'
        )::numeric
      ),
      0
    ) as conversions,

    coalesce(
      sum(
        (
          candidate.row ->> 'revenue'
        )::numeric
      ),
      0
    ) as revenue

  from candidate_scope as candidate
),

candidate_blocks as (
  select
    (
      candidate.row_index / 10000
    )::bigint
      as block_index,

    count(*)::bigint
      as block_rows,

    min(candidate.row_index)::bigint
      as block_min_row_index,

    max(candidate.row_index)::bigint
      as block_max_row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              candidate.row_index::text ||
              ':' ||
              candidate.row_fingerprint,
              E'\n'
              order by candidate.row_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as block_digest

  from candidate_scope as candidate

  group by
    (
      candidate.row_index / 10000
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

    min(snapshot.row_index)::bigint
      as snapshot_min_row_index,

    max(snapshot.row_index)::bigint
      as snapshot_max_row_index,

    count(
      distinct snapshot.row_index
    )::bigint
      as snapshot_distinct_row_indexes,

    count(*) filter (
      where snapshot.row ->> 'row_level' =
        'keyword'
    )::bigint
      as snapshot_keyword_rows,

    count(*) filter (
      where snapshot.row ->> 'row_level' =
        'creative'
    )::bigint
      as snapshot_creative_rows,

    count(*) filter (
      where snapshot.row ->> 'row_level' =
        'mixed'
    )::bigint
      as snapshot_mixed_rows,

    coalesce(
      sum(
        (
          snapshot.row ->> 'impressions'
        )::numeric
      ),
      0
    ) as snapshot_impressions,

    coalesce(
      sum(
        (
          snapshot.row ->> 'clicks'
        )::numeric
      ),
      0
    ) as snapshot_clicks,

    coalesce(
      sum(
        (
          snapshot.row ->> 'cost'
        )::numeric
      ),
      0
    ) as snapshot_cost,

    coalesce(
      sum(
        (
          snapshot.row ->> 'conversions'
        )::numeric
      ),
      0
    ) as snapshot_conversions,

    coalesce(
      sum(
        (
          snapshot.row ->> 'revenue'
        )::numeric
      ),
      0
    ) as snapshot_revenue

  from snapshot_scope as snapshot
),

snapshot_hashed_rows as (
  select
    snapshot.row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          snapshot.row::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as row_fingerprint

  from snapshot_scope as snapshot
),

snapshot_blocks as (
  select
    (
      snapshot.row_index / 10000
    )::bigint
      as block_index,

    count(*)::bigint
      as block_rows,

    min(snapshot.row_index)::bigint
      as block_min_row_index,

    max(snapshot.row_index)::bigint
      as block_max_row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              snapshot.row_index::text ||
              ':' ||
              snapshot.row_fingerprint,
              E'\n'
              order by snapshot.row_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as block_digest

  from snapshot_hashed_rows as snapshot

  group by
    (
      snapshot.row_index / 10000
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
      where candidate.row_index is not null
        and snapshot.row_index is null
    )::bigint
      as missing_materialized_rows,

    count(*) filter (
      where candidate.row_index is null
        and snapshot.row_index is not null
    )::bigint
      as extra_materialized_rows,

    count(*) filter (
      where candidate.row_index is not null
        and snapshot.row_index is not null

        and (
          snapshot.workspace_id
            is distinct from
            params.workspace_id

          or snapshot.advertiser_id
            is distinct from
            params.advertiser_id

          or snapshot.date
            is distinct from
            candidate.date

          or snapshot.channel
            is distinct from
            candidate.channel

          or snapshot.device
            is distinct from
            candidate.device

          or snapshot.source
            is distinct from
            candidate.source

          or snapshot.row
            is distinct from
            candidate.row
        )
    )::bigint
      as mismatched_materialized_rows

  from candidate_scope as candidate

  full outer join snapshot_scope as snapshot
    on snapshot.row_index =
       candidate.row_index

  cross join params
)

select
  source_summary.*,
  candidate_summary.*,
  candidate_fingerprint.*,
  snapshot_summary.*,
  snapshot_fingerprint.*,
  comparison_summary.*

from source_summary
cross join candidate_summary
cross join candidate_fingerprint
cross join snapshot_summary
cross join snapshot_fingerprint
cross join comparison_summary;


/*
 * Rescue and activation transaction.
 */
do $exact_activation$
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

  v_published_ingestion_id constant uuid :=
    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid;

  v_snapshot_ingestion_id constant uuid :=
    '38d08585-0b71-4147-a3bb-e15ebc9caa08'::uuid;

  v_claimed_at constant timestamptz :=
    '2026-07-22 15:54:47.859002+00'::timestamptz;

  v_stale_recovered_at constant timestamptz :=
    '2026-07-22 17:17:28.681+00'::timestamptz;

  v_repair_applied_at constant timestamptz :=
    '2026-07-22 14:23:11.371149+00'::timestamptz;

  v_candidate_created_at constant timestamptz :=
    '2026-07-20 09:42:12.950518+00'::timestamptz;

  v_source_job_updated_at constant timestamptz :=
    '2026-07-19 11:59:16.834+00'::timestamptz;

  v_expected_report_updated_at constant timestamptz :=
    '2026-07-18 01:42:18.234344+00'::timestamptz;

  v_expected_rows constant bigint :=
    44604;

  v_source_job_rows constant bigint :=
    44500;

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

  v_reconstructed_recovery_digest constant text :=
    'bb5d8cd70f7d2ba70ffc01c011f5d91de1207b5c1c477d42985be44135b7bbb1';

  v_reconstructed_checkpoint_digest constant text :=
    '3aa9b21cd6309f0a6d4afa0e8ea724fdf776ebd3acde494e2167b71335ea0528';

  v_reconstructed_error_detail_digest constant text :=
    'd0f1b0a5f155b075537b4d7d7638bd7afca8e1b72df4dd077a37ec1db5d9d059';

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
  v_activation record;

  v_expected_stale_error_detail jsonb;
  v_recovery jsonb;
  v_checkpoint jsonb;
  v_reconstructed_error_detail jsonb;

  v_recomputed_confirmation_token text;
  v_actual_recovery_digest text;
  v_actual_checkpoint_digest text;
  v_actual_error_detail_digest text;

  v_report_ingestions_count_before bigint;
  v_report_ingestions_count_after bigint;
  v_report_ingestions_digest_before text;
  v_report_ingestions_digest_after text;

  v_report_rows_count_before bigint;
  v_report_rows_count_after bigint;

  v_active_jobs_before bigint;
  v_active_jobs_after bigint;
  v_candidate_active_jobs_after bigint;

  v_rescue_updates integer := 0;
  v_activation_calls integer := 0;

  v_current_pointer_changed_only boolean;
  v_published_pointer_unchanged boolean;
  v_candidate_rescued_and_preserved boolean;
  v_source_job_unchanged boolean;
  v_connection_unchanged boolean;
  v_snapshot_ingestion_unchanged boolean;
  v_report_ingestions_unchanged boolean;
  v_report_rows_unchanged boolean;
  v_staging_and_snapshot_unchanged boolean;
begin
  /*
   * Lock exact mutable rows before any rescue or activation.
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
  for share;


  v_expected_stale_error_detail :=
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
   * Exact stale candidate prestate.
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
        12

     or v_candidate_before.created_at is distinct from
        v_candidate_created_at

     or v_candidate_before.started_at is distinct from
        v_claimed_at

     or v_candidate_before.finished_at is distinct from
        v_stale_recovered_at

     or v_candidate_before.updated_at is distinct from
        v_stale_recovered_at

     or v_candidate_before.error is distinct from
        'STALE_PROCESSING_JOB'

     or v_candidate_before.error_detail is distinct from
        v_expected_stale_error_detail

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
        'EXACT_STALE_RESCUE_CANDIDATE_PRESTATE_MISMATCH';
  end if;


  /*
   * Report pointer prestate.
   */
  if v_report_before.workspace_id is distinct from
       v_workspace_id

     or v_report_before.advertiser_id is distinct from
        v_advertiser_id

     or v_report_before.current_ingestion_id is distinct from
        v_previous_ingestion_id

     or v_report_before.published_ingestion_id is distinct from
        v_published_ingestion_id

     or v_report_before.updated_at is distinct from
        v_expected_report_updated_at
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_REPORT_PRESTATE_MISMATCH';
  end if;


  /*
   * Source job remains immutable.
   */
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

     or v_source_before.raw_rows is distinct from
        v_source_job_rows

     or v_source_before.normalized_rows is distinct from
        v_source_job_rows

     or v_source_before.inserted_rows is distinct from
        v_source_job_rows

     or v_source_before.failed_rows is distinct from
        0

     or v_source_before.snapshot_ingestion_id is not null
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_SOURCE_PRESTATE_MISMATCH';
  end if;


  /*
   * Materialized ingestion prestate.
   */
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
        'EXACT_STALE_RESCUE_SNAPSHOT_PRESTATE_MISMATCH';
  end if;


  if v_connection_before.workspace_id is distinct from
       v_workspace_id

     or v_connection_before.advertiser_id is distinct from
        v_advertiser_id

     or v_connection_before.provider is distinct from
        'naver_searchad'

     or v_connection_before.status is distinct from
        'active'
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_CONNECTION_PRESTATE_MISMATCH';
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
        'EXACT_STALE_RESCUE_ACTIVE_JOB_ALREADY_EXISTS';
  end if;


  /*
   * Full staging/source/snapshot integrity immediately before rescue.
   */
  select integrity.*
  into strict v_integrity_before
  from exact_stale_rescue_integrity
    as integrity;


  if v_integrity_before.source_rows <>
       v_source_staging_rows

     or v_integrity_before.source_min_row_index <>
        0

     or v_integrity_before.source_max_row_index <>
        v_source_staging_rows - 1

     or v_integrity_before.source_invalid_rows <>
        0

     or v_integrity_before.source_identity_digest <>
        v_source_identity_digest

     or v_integrity_before.candidate_rows <>
        v_expected_rows

     or v_integrity_before.candidate_min_row_index <>
        0

     or v_integrity_before.candidate_max_row_index <>
        v_expected_rows - 1

     or v_integrity_before.candidate_distinct_row_indexes <>
        v_expected_rows

     or v_integrity_before.candidate_distinct_window_row_keys <>
        v_expected_rows

     or v_integrity_before.keyword_rows <>
        43310

     or v_integrity_before.creative_rows <>
        1244

     or v_integrity_before.mixed_rows <>
        50

     or v_integrity_before.impressions <>
        7075

     or v_integrity_before.clicks <>
        1183

     or v_integrity_before.cost <>
        113850

     or v_integrity_before.conversions <>
        67

     or v_integrity_before.revenue <>
        12729300

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

     or v_integrity_before.snapshot_keyword_rows <>
        43310

     or v_integrity_before.snapshot_creative_rows <>
        1244

     or v_integrity_before.snapshot_mixed_rows <>
        50

     or v_integrity_before.snapshot_impressions <>
        7075

     or v_integrity_before.snapshot_clicks <>
        1183

     or v_integrity_before.snapshot_cost <>
        113850

     or v_integrity_before.snapshot_conversions <>
        67

     or v_integrity_before.snapshot_revenue <>
        12729300

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
        'EXACT_STALE_RESCUE_INTEGRITY_PRECHECK_FAILED';
  end if;


  /*
   * Recompute exact repaired confirmation token.
   */
  v_recomputed_confirmation_token :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'version=2' ||
          E'\n' ||

          'candidate_job_id=' ||
          v_candidate_job_id::text ||
          E'\n' ||

          'source_job_id=' ||
          v_source_job_id::text ||
          E'\n' ||

          'expected_candidate_updated_at=' ||
          (
            to_jsonb(
              v_repair_applied_at
            ) #>> '{}'
          ) ||
          E'\n' ||

          'report_id=' ||
          v_report_id::text ||
          E'\n' ||

          'workspace_id=' ||
          v_workspace_id::text ||
          E'\n' ||

          'advertiser_id=' ||
          v_advertiser_id::text ||
          E'\n' ||

          'connection_id=' ||
          v_connection_id::text ||
          E'\n' ||

          'current_ingestion_id=' ||
          v_previous_ingestion_id::text ||
          E'\n' ||

          'published_ingestion_id=' ||
          v_published_ingestion_id::text ||
          E'\n' ||

          'checkpoint_phase=completed' ||
          E'\n' ||

          'checkpoint_next_row_index=' ||
          v_expected_rows::text ||
          E'\n' ||

          'candidate_rows=' ||
          v_expected_rows::text ||
          E'\n' ||

          'source_rows=' ||
          v_source_staging_rows::text ||
          E'\n' ||

          'source_identity_digest=' ||
          v_source_identity_digest ||
          E'\n' ||

          'repair_kind=brand_search_cross_grain_dedup_v1' ||
          E'\n' ||

          'repair_source_rows=' ||
          v_original_candidate_rows::text ||
          E'\n' ||

          'repair_excluded_rows=' ||
          v_excluded_rows::text ||
          E'\n' ||

          'repaired_staging_fingerprint=' ||
          v_repaired_fingerprint ||
          E'\n' ||

          'total_report_rows=359716' ||
          E'\n' ||

          'current_report_rows=118' ||
          E'\n' ||

          'published_report_rows=44514',

          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_recomputed_confirmation_token <>
     v_confirmation_token
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_CONFIRMATION_TOKEN_MISMATCH';
  end if;


  /*
   * Reconstruct approved recovery contract.
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
            v_expected_stale_error_detail,

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
        v_reconstructed_recovery_digest

     or v_actual_checkpoint_digest <>
        v_reconstructed_checkpoint_digest

     or v_actual_error_detail_digest <>
        v_reconstructed_error_detail_digest
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_RECONSTRUCTION_MISMATCH';
  end if;


  /*
   * Capture protected table state before rescue/activation.
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


  select count(*)::bigint
  into v_report_rows_count_before
  from public.report_rows
    as report_row
  where report_row.report_id =
    v_report_id;


  /*
   * Exact rescue UPDATE.
   *
   * Only lifecycle fields overwritten by stale recovery are restored.
   * Staging, snapshot, report pointers and attempt_count remain unchanged.
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
      12

    and job.started_at =
      v_claimed_at

    and job.finished_at =
      v_stale_recovered_at

    and job.updated_at =
      v_stale_recovered_at

    and job.error =
      'STALE_PROCESSING_JOB'

    and job.error_detail
      is not distinct from
      v_expected_stale_error_detail

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
        'EXACT_STALE_RESCUE_UPDATE_FAILED';
  end if;


  if v_candidate_rescued.status is distinct from
       'processing'

     or v_candidate_rescued.progress is distinct from
        99

     or v_candidate_rescued.attempt_count is distinct from
        12

     or v_candidate_rescued.started_at is distinct from
        v_claimed_at

     or v_candidate_rescued.finished_at is not null

     or v_candidate_rescued.error is not null

     or v_candidate_rescued.error_detail is distinct from
        v_reconstructed_error_detail

     or v_candidate_rescued.snapshot_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_candidate_rescued.updated_at <=
        v_stale_recovered_at

     or (
       to_jsonb(
         v_candidate_rescued
       ) - array[
         'status',
         'progress',
         'finished_at',
         'error',
         'error_detail',
         'updated_at'
       ]::text[]
     ) <> (
       to_jsonb(
         v_candidate_before
       ) - array[
         'status',
         'progress',
         'finished_at',
         'error',
         'error_detail',
         'updated_at'
       ]::text[]
     )
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_RESULT_INVALID';
  end if;


  /*
   * Exact activation RPC — exactly one call.
   */
  v_activation_calls :=
    v_activation_calls + 1;


  select activation.*
  into strict v_activation
  from public.activate_media_sync_snapshot(
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
  ) as activation;


  if v_activation_calls <> 1

     or v_activation.previous_ingestion_id is distinct from
        v_previous_ingestion_id

     or v_activation.snapshot_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_activation.current_ingestion_id is distinct from
        v_snapshot_ingestion_id

     or v_activation.published_ingestion_id is distinct from
        v_published_ingestion_id

     or v_activation.row_count is distinct from
        v_expected_rows

     or v_activation.idempotent is distinct from
        false

     or v_activation.staging_fingerprint is null

     or v_activation.materialized_fingerprint is null

     or v_activation.staging_fingerprint
        !~ '^[0-9a-f]{64}$'

     or v_activation.materialized_fingerprint
        !~ '^[0-9a-f]{64}$'

     or v_activation.staging_fingerprint is distinct from
        v_activation.materialized_fingerprint
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_ACTIVATION_RESULT_MISMATCH';
  end if;


  /*
   * Read exact post-activation state.
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


  v_current_pointer_changed_only :=
    v_report_before.current_ingestion_id =
      v_previous_ingestion_id

    and v_report_after.current_ingestion_id =
      v_snapshot_ingestion_id

    and v_report_after.updated_at >
      v_report_before.updated_at

    and (
      to_jsonb(
        v_report_after
      ) - array[
        'current_ingestion_id',
        'updated_at'
      ]::text[]
    ) = (
      to_jsonb(
        v_report_before
      ) - array[
        'current_ingestion_id',
        'updated_at'
      ]::text[]
    );


  v_published_pointer_unchanged :=
    v_report_after.published_ingestion_id =
      v_published_ingestion_id

    and v_report_after.published_ingestion_id =
      v_report_before.published_ingestion_id;


  v_candidate_rescued_and_preserved :=
    to_jsonb(
      v_candidate_after
    ) =
    to_jsonb(
      v_candidate_rescued
    )

    and v_candidate_after.status =
      'processing'

    and v_candidate_after.progress =
      99

    and v_candidate_after.attempt_count =
      12

    and v_candidate_after.finished_at is null

    and v_candidate_after.error is null

    and v_candidate_after.error_detail =
      v_reconstructed_error_detail

    and v_candidate_after.snapshot_ingestion_id =
      v_snapshot_ingestion_id;


  v_source_job_unchanged :=
    to_jsonb(
      v_source_after
    ) =
    to_jsonb(
      v_source_before
    );


  v_connection_unchanged :=
    to_jsonb(
      v_connection_after
    ) =
    to_jsonb(
      v_connection_before
    );


  v_snapshot_ingestion_unchanged :=
    to_jsonb(
      v_snapshot_after
    ) =
    to_jsonb(
      v_snapshot_before
    );


  if not v_current_pointer_changed_only

     or not v_published_pointer_unchanged

     or not v_candidate_rescued_and_preserved

     or not v_source_job_unchanged

     or not v_connection_unchanged

     or not v_snapshot_ingestion_unchanged
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_PROTECTED_STATE_CHANGED';
  end if;


  /*
   * Protected table postchecks.
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


  select count(*)::bigint
  into v_report_rows_count_after
  from public.report_rows
    as report_row
  where report_row.report_id =
    v_report_id;


  v_report_rows_unchanged :=
    v_report_rows_count_after =
      v_report_rows_count_before;


  /*
   * Full staging/source/snapshot integrity after activation.
   */
  select integrity.*
  into strict v_integrity_after
  from exact_stale_rescue_integrity
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


  select
    count(*)::bigint,

    count(*) filter (
      where job.id =
        v_candidate_job_id
    )::bigint

  into
    v_active_jobs_after,
    v_candidate_active_jobs_after

  from public.media_sync_jobs as job

  where job.report_id =
      v_report_id

    and job.status in (
      'pending',
      'processing'
    );


  if not v_report_ingestions_unchanged

     or not v_report_rows_unchanged

     or not v_staging_and_snapshot_unchanged

     or v_active_jobs_after <>
        1

     or v_candidate_active_jobs_after <>
        1
  then
    raise exception using
      errcode = '55000',
      message =
        'EXACT_STALE_RESCUE_POSTCHECK_FAILED';
  end if;


  insert into
    exact_stale_rescue_activation_result (
      all_checks_passed,

      rescue_updates,
      activation_calls,
      finalization_calls,

      exact_stale_candidate_revalidated,
      reconstructed_checkpoint_applied,
      candidate_rescued_and_preserved,

      current_pointer_changed_only,
      published_pointer_unchanged,

      source_job_unchanged,
      connection_unchanged,
      snapshot_ingestion_unchanged,
      report_ingestions_unchanged,
      report_rows_unchanged,
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

      snapshot_report_rows,
      keyword_rows,
      creative_rows,
      mixed_rows,

      impressions,
      clicks,
      cost,
      conversions,
      revenue,

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
      rpc_idempotent
    )
  values (
    true,

    v_rescue_updates,
    v_activation_calls,
    0,

    true,
    true,
    v_candidate_rescued_and_preserved,

    v_current_pointer_changed_only,
    v_published_pointer_unchanged,

    v_source_job_unchanged,
    v_connection_unchanged,
    v_snapshot_ingestion_unchanged,
    v_report_ingestions_unchanged,
    v_report_rows_unchanged,
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

    v_integrity_after.snapshot_rows,
    v_integrity_after.keyword_rows,
    v_integrity_after.creative_rows,
    v_integrity_after.mixed_rows,

    v_integrity_after.impressions,
    v_integrity_after.clicks,
    v_integrity_after.cost,
    v_integrity_after.conversions,
    v_integrity_after.revenue,

    v_integrity_after.missing_materialized_rows,
    v_integrity_after.extra_materialized_rows,
    v_integrity_after.mismatched_materialized_rows,

    v_integrity_after.candidate_staging_fingerprint,
    v_integrity_after.snapshot_content_fingerprint,

    v_actual_recovery_digest,
    v_actual_checkpoint_digest,
    v_actual_error_detail_digest,

    v_activation.staging_fingerprint,
    v_activation.materialized_fingerprint,
    v_activation.idempotent
  );
end;
$exact_activation$;


commit;


select *
from exact_stale_rescue_activation_result;