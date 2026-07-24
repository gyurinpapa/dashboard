/*
 * Etrylue Performance
 * Read-only post-repair safety verification for exact Naver recovery candidate
 *
 * SELECT only:
 * - no INSERT / UPDATE / DELETE
 * - no RPC
 * - no materialization / activation / finalization
 *
 * Large-volume contract:
 * - 44,514 is only the immutable keyword-source prefix boundary.
 * - Candidate total is read dynamically from job/checkpoint/live staging.
 * - No candidate-wide digest, string_agg, DISTINCT sort, or FULL OUTER JOIN.
 * - Candidate continuity relies on persisted unique constraints plus count/min/max.
 */
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

    'aba7d28f-ec85-49db-941a-fa5babe2af61'::uuid
      as connection_id,

    '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid
      as current_ingestion_id,

    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid
      as published_ingestion_id,

    '2026-07-21 20:57:08.806358+00'::timestamptz
      as expected_candidate_updated_at,

    '2026-07-19 11:59:16.834+00'::timestamptz
      as expected_source_job_updated_at,

    'f9598e3ffbc8ed84e7a93a679f89e624e321a3cad220c01375e110a9d09bc7ba'::text
      as expected_confirmation_token,

    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40'::text
      as expected_source_identity_digest,

    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776'::text
      as expected_report_ingestions_descriptor_digest,

    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7'::text
      as expected_current_sentinel_digest,

    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0'::text
      as expected_published_sentinel_digest,

    10::bigint
      as expected_candidate_attempt_count,

    44500::bigint
      as expected_source_job_rows,

    44514::bigint
      as source_boundary,

    359716::bigint
      as expected_total_report_rows,

    118::bigint
      as expected_current_report_rows,

    44514::bigint
      as expected_published_report_rows
),

candidate as (
  select
    job.*,

    job.error_detail -> 'processing_checkpoint'
      as checkpoint,

    job.error_detail #> '{processing_checkpoint,recovery}'
      as recovery

  from params as p

  left join public.media_sync_jobs as job
    on job.id = p.candidate_job_id
),

source_job as (
  select
    job.*

  from params as p

  left join public.media_sync_jobs as job
    on job.id = p.source_job_id
),

report_state as (
  select
    report.*

  from params as p

  left join public.reports as report
    on report.id = p.report_id
),

active_jobs as (
  select
    count(job.id)::bigint
      as active_job_count

  from params as p

  left join public.media_sync_jobs as job
    on job.report_id = p.report_id
   and job.status in ('pending', 'processing')
),

staging_unique_contract as (
  select
    count(*)::bigint
      as required_unique_constraint_count

  from pg_catalog.pg_constraint as constraint_record

  where constraint_record.conrelid =
        'public.media_sync_staging_rows'::regclass

    and constraint_record.contype = 'u'

    and constraint_record.conname in (
      'media_sync_staging_rows_job_row_index_unique',
      'media_sync_staging_rows_job_window_row_key_unique'
    )
),

/* Fixed and bounded: only the immutable 44,514-row source is digested. */
source_staging as (
  select
    count(row.id)::bigint
      as source_rows,

    min(row.row_index)::bigint
      as source_min_row_index,

    max(row.row_index)::bigint
      as source_max_row_index,

    count(row.id) filter (
      where row.row_fingerprint is null
         or row.row_fingerprint !~ '^[0-9a-f]{64}$'
         or row.row is null
         or row.row_fingerprint is distinct from
            encode(
              extensions.digest(row.row::text, 'sha256'),
              'hex'
            )
    )::bigint as source_invalid_fingerprint_rows,

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
    ) as source_identity_digest

  from params as p

  left join public.media_sync_staging_rows as row
    on row.job_id = p.source_job_id
),

/*
 * Dynamic candidate scan:
 * - no candidate-wide digest/string aggregation;
 * - no DISTINCT sort;
 * - no row JSON hash recomputation across the authoritative tail.
 */
candidate_staging as (
  select
    count(row.id)::bigint
      as candidate_rows,

    min(row.row_index)::bigint
      as candidate_min_row_index,

    max(row.row_index)::bigint
      as candidate_max_row_index,

    count(row.id) filter (
      where row.row_fingerprint is null
         or row.row_fingerprint !~ '^[0-9a-f]{64}$'
         or row.row is null
    )::bigint as candidate_invalid_fingerprint_rows,

    count(row.id) filter (
      where row.report_id is distinct from p.report_id
         or row.workspace_id is distinct from p.workspace_id
         or row.advertiser_id is distinct from p.advertiser_id
         or row.connection_id is distinct from p.connection_id
         or row.provider is distinct from 'naver_searchad'
         or row.external_account_id is distinct from candidate.external_account_id
         or row.date_from is distinct from candidate.date_from
         or row.date_to is distinct from candidate.date_to
    )::bigint as candidate_scope_mismatch_rows,

    count(row.id) filter (
      where row.row_index < p.source_boundary
    )::bigint as candidate_prefix_rows,

    count(row.id) filter (
      where row.row_index >= p.source_boundary
    )::bigint as candidate_tail_rows

  from params as p

  cross join candidate

  left join public.media_sync_staging_rows as row
    on row.job_id = p.candidate_job_id

  group by
    p.report_id,
    p.workspace_id,
    p.advertiser_id,
    p.connection_id,
    p.source_boundary,
    candidate.external_account_id,
    candidate.date_from,
    candidate.date_to
),

/* Exact comparison is bounded to the immutable source prefix only. */
candidate_prefix_comparison as (
  select
    count(source_row.id) filter (
      where candidate_row.id is null

         or candidate_row.report_id is distinct from source_row.report_id
         or candidate_row.workspace_id is distinct from source_row.workspace_id
         or candidate_row.advertiser_id is distinct from source_row.advertiser_id
         or candidate_row.connection_id is distinct from source_row.connection_id
         or candidate_row.provider is distinct from source_row.provider
         or candidate_row.external_account_id is distinct from source_row.external_account_id
         or candidate_row.date_window_index is distinct from source_row.date_window_index
         or candidate_row.date_from is distinct from source_row.date_from
         or candidate_row.date_to is distinct from source_row.date_to
         or candidate_row.row_key is distinct from source_row.row_key
         or candidate_row.date is distinct from source_row.date
         or candidate_row.channel is distinct from source_row.channel
         or candidate_row.device is distinct from source_row.device
         or candidate_row.source is distinct from source_row.source
         or candidate_row.row is distinct from source_row.row
         or candidate_row.row_fingerprint is distinct from source_row.row_fingerprint
    )::bigint as candidate_prefix_mismatch_rows

  from params as p

  left join public.media_sync_staging_rows as source_row
    on source_row.job_id = p.source_job_id

  left join public.media_sync_staging_rows as candidate_row
    on candidate_row.job_id = p.candidate_job_id
   and candidate_row.row_index = source_row.row_index
),

report_rows_state as (
  select
    count(row.id)::bigint
      as total_report_rows,

    count(row.id) filter (
      where row.ingestion_id = p.current_ingestion_id
    )::bigint as current_report_rows,

    count(row.id) filter (
      where row.ingestion_id = p.published_ingestion_id
    )::bigint as published_report_rows

  from params as p

  left join public.report_rows as row
    on row.report_id = p.report_id
),

report_ingestions_state as (
  select
    count(ingestion.id) filter (
      where ingestion.id = p.current_ingestion_id
    )::bigint as current_descriptor_count,

    max(ingestion.row_count) filter (
      where ingestion.id = p.current_ingestion_id
    )::bigint as current_descriptor_rows,

    max(ingestion.status::text) filter (
      where ingestion.id = p.current_ingestion_id
    ) as current_descriptor_status,

    count(ingestion.id) filter (
      where ingestion.id = p.current_ingestion_id
        and ingestion.error is not null
    )::bigint as current_descriptor_error_count,

    count(ingestion.id) filter (
      where ingestion.id = p.published_ingestion_id
    )::bigint as published_descriptor_count,

    max(ingestion.row_count) filter (
      where ingestion.id = p.published_ingestion_id
    )::bigint as published_descriptor_rows,

    max(ingestion.status::text) filter (
      where ingestion.id = p.published_ingestion_id
    ) as published_descriptor_status,

    count(ingestion.id) filter (
      where ingestion.id = p.published_ingestion_id
        and ingestion.error is not null
    )::bigint as published_descriptor_error_count,

    encode(
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
          ) filter (where ingestion.id is not null),
          '[]'::jsonb
        )::text,
        'sha256'
      ),
      'hex'
    ) as report_ingestions_descriptor_digest

  from params as p

  left join public.report_ingestions as ingestion
    on ingestion.report_id = p.report_id
),

current_sentinels as (
  select
    count(row.id)::bigint
      as current_sentinel_count,

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
    ) as current_sentinel_digest

  from params as p

  left join public.report_rows as row
    on row.report_id = p.report_id
   and row.ingestion_id = p.current_ingestion_id
   and row.row_index in (0, 58, 117)
),

published_sentinels as (
  select
    count(row.id)::bigint
      as published_sentinel_count,

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
    ) as published_sentinel_digest

  from params as p

  left join public.report_rows as row
    on row.report_id = p.report_id
   and row.ingestion_id = p.published_ingestion_id
   and row.row_index in (0, 22256, 44513)
),

recovery_keys as (
  select
    coalesce(
      array_agg(key_name order by key_name),
      array[]::text[]
    ) as key_names,

    count(*)::bigint
      as key_count

  from candidate

  left join lateral jsonb_object_keys(
    case
      when jsonb_typeof(candidate.recovery) = 'object'
        then candidate.recovery
      else '{}'::jsonb
    end
  ) as key_name
    on true
),

confirmation as (
  select
    encode(
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
        'current_ingestion_id=' ||
          report_state.current_ingestion_id::text || E'\n' ||
        'published_ingestion_id=' ||
          report_state.published_ingestion_id::text || E'\n' ||
        'checkpoint_phase=' ||
          (candidate.checkpoint #>> '{collector,phase}') || E'\n' ||
        'checkpoint_next_row_index=' ||
          (candidate.checkpoint #>> '{collector,next_row_index}') || E'\n' ||
        'checkpoint_total_rows=' ||
          (candidate.checkpoint #>> '{inserted_rows}') || E'\n' ||
        'candidate_rows=' ||
          candidate_staging.candidate_rows::text || E'\n' ||
        'base_rows=' ||
          source_staging.source_rows::text || E'\n' ||
        'base_identity_digest=' ||
          source_staging.source_identity_digest || E'\n' ||
        'total_report_rows=' ||
          report_rows_state.total_report_rows::text || E'\n' ||
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
  cross join candidate_staging
  cross join source_staging
  cross join report_rows_state
),

checks as (
  select
    coalesce(
      candidate.id = p.candidate_job_id
      and candidate.report_id = p.report_id
      and candidate.workspace_id = p.workspace_id
      and candidate.advertiser_id = p.advertiser_id
      and candidate.connection_id = p.connection_id
      and candidate.provider = 'naver_searchad',
      false
    ) as candidate_scope_ok,

    coalesce(
      candidate.status = 'cancelled'
      and candidate.progress = 99
      and candidate.raw_rows >= p.source_boundary
      and candidate.normalized_rows = candidate.raw_rows
      and candidate.inserted_rows = candidate.raw_rows
      and candidate.failed_rows = 0
      and candidate.previous_ingestion_id = p.current_ingestion_id
      and candidate.snapshot_ingestion_id is null
      and candidate.attempt_count = p.expected_candidate_attempt_count
      and candidate.error is null
      and candidate.started_at is null
      and candidate.finished_at is null
      and candidate.created_at is not null,
      false
    ) as candidate_isolation_state_ok,

    coalesce(
      candidate.updated_at = p.expected_candidate_updated_at,
      false
    ) as candidate_updated_at_ok,

    coalesce(
      candidate.checkpoint #>> '{version}' = '1'
      and candidate.checkpoint #>> '{collector,combined_version}' = '1'
      and candidate.checkpoint #>> '{collector,phase}' = 'authoritative'
      and candidate.checkpoint #>> '{collector,next_row_index}' =
        candidate.raw_rows::text
      and candidate.checkpoint #>> '{raw_rows}' =
        candidate.raw_rows::text
      and candidate.checkpoint #>> '{normalized_rows}' =
        candidate.raw_rows::text
      and candidate.checkpoint #>> '{inserted_rows}' =
        candidate.raw_rows::text
      and candidate.checkpoint #>> '{failed_rows}' = '0'
      and candidate.checkpoint #>> '{collector,keyword,complete}' = 'true'
      and candidate.checkpoint #>> '{collector,authoritative,complete}' =
        'false',
      false
    ) as checkpoint_contract_ok,

    coalesce(
      jsonb_typeof(candidate.recovery) = 'object'
      and recovery_keys.key_count = 12
      and recovery_keys.key_names =
        array[
          'confirmation_token',
          'contract_version',
          'expected_current_ingestion_id',
          'expected_published_ingestion_id',
          'isolated',
          'keyword_counts_derived_from_staging',
          'prepared_at',
          'request_counts_reconstructed',
          'source_identity_digest',
          'source_job_id',
          'source_job_updated_at',
          'source_staging_rows'
        ]::text[]
      and candidate.recovery ->> 'contract_version' = '1'
      and candidate.recovery ->> 'source_job_id' =
        p.source_job_id::text
      and candidate.recovery ->> 'source_job_updated_at' =
        (to_jsonb(source_job.updated_at) #>> '{}')
      and candidate.recovery ->> 'source_staging_rows' =
        source_staging.source_rows::text
      and candidate.recovery ->> 'source_identity_digest' =
        source_staging.source_identity_digest
      and candidate.recovery ->> 'keyword_counts_derived_from_staging' =
        'true'
      and candidate.recovery ->> 'request_counts_reconstructed' =
        'false'
      and candidate.recovery ->> 'prepared_at' =
        (to_jsonb(candidate.created_at) #>> '{}')
      and candidate.recovery ->> 'expected_current_ingestion_id' =
        p.current_ingestion_id::text
      and candidate.recovery ->> 'expected_published_ingestion_id' =
        p.published_ingestion_id::text
      and candidate.recovery ->> 'isolated' = 'true',
      false
    ) as recovery_contract_ok,

    coalesce(
      candidate.recovery ->> 'confirmation_token' =
        p.expected_confirmation_token
      and confirmation.recalculated_confirmation_token =
        p.expected_confirmation_token
      and candidate.recovery ->> 'confirmation_token' =
        confirmation.recalculated_confirmation_token,
      false
    ) as confirmation_token_ok,

    coalesce(
      source_job.id = p.source_job_id
      and source_job.report_id = p.report_id
      and source_job.workspace_id = p.workspace_id
      and source_job.advertiser_id = p.advertiser_id
      and source_job.connection_id = p.connection_id
      and source_job.provider = 'naver_searchad'
      and source_job.status = 'failed'
      and source_job.progress = 0
      and source_job.raw_rows = p.expected_source_job_rows
      and source_job.normalized_rows = p.expected_source_job_rows
      and source_job.inserted_rows = p.expected_source_job_rows
      and source_job.failed_rows = 0
      and source_job.snapshot_ingestion_id is null
      and source_job.error = 'DATABASE_ERROR'
      and source_job.updated_at = p.expected_source_job_updated_at,
      false
    ) as source_job_state_ok,

    coalesce(
      report_state.id = p.report_id
      and report_state.workspace_id = p.workspace_id
      and report_state.advertiser_id = p.advertiser_id
      and report_state.current_ingestion_id = p.current_ingestion_id
      and report_state.published_ingestion_id =
        p.published_ingestion_id,
      false
    ) as report_pointer_state_ok,

    coalesce(
      active_jobs.active_job_count = 0,
      false
    ) as no_active_jobs_ok,

    coalesce(
      staging_unique_contract.required_unique_constraint_count = 2,
      false
    ) as staging_unique_contract_ok,

    coalesce(
      source_staging.source_rows = p.source_boundary
      and source_staging.source_min_row_index = 0
      and source_staging.source_max_row_index =
        p.source_boundary - 1
      and source_staging.source_invalid_fingerprint_rows = 0
      and source_staging.source_identity_digest =
        p.expected_source_identity_digest,
      false
    ) as source_prefix_base_ok,

    coalesce(
      candidate_staging.candidate_rows = candidate.raw_rows
      and candidate_staging.candidate_min_row_index = 0
      and candidate_staging.candidate_max_row_index =
        candidate.raw_rows - 1
      and candidate_staging.candidate_invalid_fingerprint_rows = 0
      and candidate_staging.candidate_scope_mismatch_rows = 0
      and candidate_staging.candidate_prefix_rows =
        p.source_boundary
      and candidate_staging.candidate_tail_rows =
        candidate.raw_rows - p.source_boundary,
      false
    ) as candidate_dynamic_staging_ok,

    coalesce(
      candidate_prefix_comparison.candidate_prefix_mismatch_rows = 0,
      false
    ) as source_prefix_exact_match_ok,

    coalesce(
      report_rows_state.total_report_rows =
        p.expected_total_report_rows
      and report_rows_state.current_report_rows =
        p.expected_current_report_rows
      and report_rows_state.published_report_rows =
        p.expected_published_report_rows,
      false
    ) as report_rows_baseline_ok,

    coalesce(
      report_ingestions_state.current_descriptor_count = 1
      and report_ingestions_state.current_descriptor_rows =
        p.expected_current_report_rows
      and report_ingestions_state.current_descriptor_status =
        'success'
      and report_ingestions_state.current_descriptor_error_count = 0
      and report_ingestions_state.published_descriptor_count = 1
      and report_ingestions_state.published_descriptor_rows =
        p.expected_published_report_rows
      and report_ingestions_state.published_descriptor_status =
        'success'
      and report_ingestions_state.published_descriptor_error_count = 0
      and report_ingestions_state.report_ingestions_descriptor_digest =
        p.expected_report_ingestions_descriptor_digest,
      false
    ) as ingestion_metadata_unchanged_ok,

    coalesce(
      current_sentinels.current_sentinel_count = 3
      and current_sentinels.current_sentinel_digest =
        p.expected_current_sentinel_digest
      and published_sentinels.published_sentinel_count = 3
      and published_sentinels.published_sentinel_digest =
        p.expected_published_sentinel_digest,
      false
    ) as active_report_rows_unchanged_ok,

    coalesce(
      candidate.snapshot_ingestion_id is null
      and candidate.status = 'cancelled'
      and candidate.started_at is null
      and candidate.finished_at is null
      and candidate.error is null
      and report_state.current_ingestion_id =
        p.current_ingestion_id
      and report_state.published_ingestion_id =
        p.published_ingestion_id,
      false
    ) as no_materialization_activation_finalization_trace_ok,

    candidate.status
      as candidate_status,

    candidate.progress
      as candidate_progress,

    candidate.attempt_count
      as candidate_attempt_count,

    candidate.updated_at
      as candidate_updated_at,

    candidate.raw_rows
      as candidate_job_rows,

    candidate.checkpoint #>> '{collector,phase}'
      as checkpoint_phase,

    candidate.checkpoint #>> '{collector,next_row_index}'
      as checkpoint_next_row_index,

    candidate.checkpoint #>> '{collector,authoritative,complete}'
      as authoritative_complete,

    candidate.recovery
      as repaired_recovery,

    recovery_keys.key_count
      as recovery_key_count,

    recovery_keys.key_names
      as recovery_key_names,

    candidate.recovery ->> 'confirmation_token'
      as stored_confirmation_token,

    confirmation.recalculated_confirmation_token,

    source_job.status
      as source_job_status,

    source_job.updated_at
      as source_job_updated_at,

    active_jobs.active_job_count,

    staging_unique_contract.required_unique_constraint_count,

    source_staging.source_rows,
    source_staging.source_min_row_index,
    source_staging.source_max_row_index,
    source_staging.source_invalid_fingerprint_rows,
    source_staging.source_identity_digest,

    candidate_staging.candidate_rows,
    candidate_staging.candidate_min_row_index,
    candidate_staging.candidate_max_row_index,
    candidate_staging.candidate_invalid_fingerprint_rows,
    candidate_staging.candidate_scope_mismatch_rows,
    candidate_staging.candidate_prefix_rows,
    candidate_staging.candidate_tail_rows,

    candidate_prefix_comparison.candidate_prefix_mismatch_rows,

    report_state.current_ingestion_id,
    report_state.published_ingestion_id,

    report_rows_state.total_report_rows,
    report_rows_state.current_report_rows,
    report_rows_state.published_report_rows,

    report_ingestions_state.current_descriptor_count,
    report_ingestions_state.current_descriptor_rows,
    report_ingestions_state.current_descriptor_status,
    report_ingestions_state.current_descriptor_error_count,

    report_ingestions_state.published_descriptor_count,
    report_ingestions_state.published_descriptor_rows,
    report_ingestions_state.published_descriptor_status,
    report_ingestions_state.published_descriptor_error_count,

    report_ingestions_state.report_ingestions_descriptor_digest,

    current_sentinels.current_sentinel_count,
    current_sentinels.current_sentinel_digest,

    published_sentinels.published_sentinel_count,
    published_sentinels.published_sentinel_digest

  from params as p

  cross join candidate
  cross join source_job
  cross join report_state
  cross join active_jobs
  cross join staging_unique_contract
  cross join source_staging
  cross join candidate_staging
  cross join candidate_prefix_comparison
  cross join report_rows_state
  cross join report_ingestions_state
  cross join current_sentinels
  cross join published_sentinels
  cross join recovery_keys
  cross join confirmation
)

select
  (
    candidate_scope_ok
    and candidate_isolation_state_ok
    and candidate_updated_at_ok
    and checkpoint_contract_ok
    and recovery_contract_ok
    and confirmation_token_ok
    and source_job_state_ok
    and report_pointer_state_ok
    and no_active_jobs_ok
    and staging_unique_contract_ok
    and source_prefix_base_ok
    and candidate_dynamic_staging_ok
    and source_prefix_exact_match_ok
    and report_rows_baseline_ok
    and ingestion_metadata_unchanged_ok
    and active_report_rows_unchanged_ok
    and no_materialization_activation_finalization_trace_ok
  ) as safe_to_resume_authoritative,

  array_remove(
    array[
      case when not candidate_scope_ok
        then 'candidate_scope_ok' end,
      case when not candidate_isolation_state_ok
        then 'candidate_isolation_state_ok' end,
      case when not candidate_updated_at_ok
        then 'candidate_updated_at_ok' end,
      case when not checkpoint_contract_ok
        then 'checkpoint_contract_ok' end,
      case when not recovery_contract_ok
        then 'recovery_contract_ok' end,
      case when not confirmation_token_ok
        then 'confirmation_token_ok' end,
      case when not source_job_state_ok
        then 'source_job_state_ok' end,
      case when not report_pointer_state_ok
        then 'report_pointer_state_ok' end,
      case when not no_active_jobs_ok
        then 'no_active_jobs_ok' end,
      case when not staging_unique_contract_ok
        then 'staging_unique_contract_ok' end,
      case when not source_prefix_base_ok
        then 'source_prefix_base_ok' end,
      case when not candidate_dynamic_staging_ok
        then 'candidate_dynamic_staging_ok' end,
      case when not source_prefix_exact_match_ok
        then 'source_prefix_exact_match_ok' end,
      case when not report_rows_baseline_ok
        then 'report_rows_baseline_ok' end,
      case when not ingestion_metadata_unchanged_ok
        then 'ingestion_metadata_unchanged_ok' end,
      case when not active_report_rows_unchanged_ok
        then 'active_report_rows_unchanged_ok' end,
      case when not no_materialization_activation_finalization_trace_ok
        then 'no_materialization_activation_finalization_trace_ok' end
    ],
    null
  ) as failed_checks,

  candidate_scope_ok,
  candidate_isolation_state_ok,
  candidate_updated_at_ok,
  checkpoint_contract_ok,
  recovery_contract_ok,
  confirmation_token_ok,
  source_job_state_ok,
  report_pointer_state_ok,
  no_active_jobs_ok,
  staging_unique_contract_ok,
  source_prefix_base_ok,
  candidate_dynamic_staging_ok,
  source_prefix_exact_match_ok,
  report_rows_baseline_ok,
  ingestion_metadata_unchanged_ok,
  active_report_rows_unchanged_ok,
  no_materialization_activation_finalization_trace_ok,

  candidate_status,
  candidate_progress,
  candidate_attempt_count,
  candidate_updated_at,
  candidate_job_rows,
  checkpoint_phase,
  checkpoint_next_row_index,
  authoritative_complete,

  recovery_key_count,
  recovery_key_names,
  repaired_recovery,

  stored_confirmation_token,
  recalculated_confirmation_token,

  candidate_rows,
  candidate_prefix_rows,
  candidate_tail_rows
    as authoritative_tail_rows,
  candidate_min_row_index,
  candidate_max_row_index,
  candidate_invalid_fingerprint_rows,
  candidate_scope_mismatch_rows,

  source_job_status,
  source_job_updated_at,
  active_job_count,
  required_unique_constraint_count,

  source_rows,
  source_min_row_index,
  source_max_row_index,
  source_invalid_fingerprint_rows,
  source_identity_digest,
  candidate_prefix_mismatch_rows,

  current_ingestion_id,
  published_ingestion_id,

  total_report_rows,
  current_report_rows,
  published_report_rows,

  current_descriptor_count,
  current_descriptor_rows,
  current_descriptor_status,
  current_descriptor_error_count,

  published_descriptor_count,
  published_descriptor_rows,
  published_descriptor_status,
  published_descriptor_error_count,

  report_ingestions_descriptor_digest,

  current_sentinel_count,
  current_sentinel_digest,

  published_sentinel_count,
  published_sentinel_digest

from checks;