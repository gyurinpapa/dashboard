/*
 * Etrylue Performance
 * Naver Search Ads production recovery candidate preparation RPC
 *
 * Purpose:
 * - Revalidate one explicitly supplied failed source job and its 44,514
 *   verified keyword staging rows.
 * - Create one isolated cancelled recovery candidate and copy the source
 *   staging rows into the new job scope in the same transaction.
 * - Seed a combined processing checkpoint at the authoritative boundary so
 *   a later exact-ID claim can resume after completed keyword staging.
 *
 * Safety:
 * - This function never changes the source job or source staging rows.
 * - This function never changes reports pointers or report_rows.
 * - This function never claims a job and never calls materialization,
 *   activation, or finalization RPCs.
 * - Any failed assertion raises an exception and rolls back the candidate job
 *   and all copied candidate staging rows.
 * - The candidate is created as cancelled so the global worker claim RPC
 *   cannot claim it before isolated validation and a later exact-ID cutover.
 */

create or replace function public.prepare_naver_searchads_production_recovery_candidate(
  p_payload jsonb
)
returns table (
  source_job_id uuid,
  candidate_job_id uuid,
  candidate_status text,

  report_id uuid,
  workspace_id uuid,
  advertiser_id uuid,
  connection_id uuid,

  candidate_rows bigint,
  candidate_phase text,
  candidate_next_row_index bigint,

  source_identity_digest text,
  candidate_identity_digest text,

  current_ingestion_id uuid,
  published_ingestion_id uuid,

  source_unchanged boolean,
  report_pointers_unchanged boolean,
  candidate_ready_for_isolated_validation boolean,
  candidate_claimed boolean,
  materialization_called boolean,
  activation_called boolean,
  finalization_called boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
set statement_timeout to '10min'
as $function$
declare
  v_source_job public.media_sync_jobs%rowtype;
  v_source_job_after public.media_sync_jobs%rowtype;
  v_candidate_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_report_after public.reports%rowtype;
  v_connection public.media_connections%rowtype;

  v_source_job_id uuid;
  v_expected_source_job_updated_at timestamptz;

  v_expected_report_id uuid;
  v_expected_workspace_id uuid;
  v_expected_advertiser_id uuid;
  v_expected_connection_id uuid;

  v_expected_current_ingestion_id uuid;
  v_expected_published_ingestion_id uuid;

  v_expected_date_from date;
  v_expected_date_to date;

  v_expected_source_job_rows bigint;
  v_expected_source_staging_rows bigint;
  v_expected_keyword_entities bigint;
  v_expected_identity_digest text;

  v_source_rows bigint;
  v_source_min_row_index bigint;
  v_source_max_row_index bigint;
  v_source_distinct_row_indexes bigint;
  v_source_duplicate_row_indexes bigint;
  v_source_distinct_row_keys bigint;
  v_source_duplicate_row_keys bigint;
  v_source_invalid_fingerprint_rows bigint;
  v_source_fingerprint_mismatch_rows bigint;
  v_source_scope_mismatch_rows bigint;
  v_source_date_range_violation_rows bigint;
  v_source_date_window_mismatch_rows bigint;
  v_source_keyword_rows bigint;
  v_source_creative_rows bigint;
  v_source_mixed_rows bigint;
  v_source_distinct_dates bigint;
  v_source_distinct_keyword_entities bigint;
  v_source_keyword_coverage_mismatch_rows bigint;
  v_source_canonical_mismatch_rows bigint;
  v_source_row_key_mismatch_rows bigint;

  v_source_identity_digest text;
  v_source_post_rows bigint;
  v_source_post_identity_digest text;

  v_candidate_id uuid;
  v_candidate_rows bigint;
  v_candidate_min_row_index bigint;
  v_candidate_max_row_index bigint;
  v_candidate_distinct_row_indexes bigint;
  v_candidate_distinct_row_keys bigint;
  v_candidate_exact_mismatch_rows bigint;
  v_candidate_identity_digest text;

  v_keyword_cursor jsonb;
  v_processing_checkpoint jsonb;

  v_existing_candidate_id uuid;
  v_active_job_id uuid;
  v_now timestamptz;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_INVALID_INPUT';
  end if;

  begin
    v_source_job_id :=
      nullif(
        btrim(p_payload ->> 'source_job_id'),
        ''
      )::uuid;

    v_expected_source_job_updated_at :=
      nullif(
        btrim(
          p_payload ->>
          'expected_source_job_updated_at'
        ),
        ''
      )::timestamptz;

    v_expected_report_id :=
      nullif(
        btrim(p_payload ->> 'expected_report_id'),
        ''
      )::uuid;

    v_expected_workspace_id :=
      nullif(
        btrim(p_payload ->> 'expected_workspace_id'),
        ''
      )::uuid;

    v_expected_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'expected_advertiser_id'),
        ''
      )::uuid;

    v_expected_connection_id :=
      nullif(
        btrim(p_payload ->> 'expected_connection_id'),
        ''
      )::uuid;

    v_expected_current_ingestion_id :=
      nullif(
        btrim(
          p_payload ->>
          'expected_current_ingestion_id'
        ),
        ''
      )::uuid;

    v_expected_published_ingestion_id :=
      nullif(
        btrim(
          p_payload ->>
          'expected_published_ingestion_id'
        ),
        ''
      )::uuid;

    v_expected_date_from :=
      nullif(
        btrim(p_payload ->> 'expected_date_from'),
        ''
      )::date;

    v_expected_date_to :=
      nullif(
        btrim(p_payload ->> 'expected_date_to'),
        ''
      )::date;

    v_expected_source_job_rows :=
      (p_payload ->> 'expected_source_job_rows')::bigint;

    v_expected_source_staging_rows :=
      (p_payload ->> 'expected_source_staging_rows')::bigint;

    v_expected_keyword_entities :=
      (p_payload ->> 'expected_keyword_entities')::bigint;

    v_expected_identity_digest :=
      lower(
        nullif(
          btrim(
            p_payload ->>
            'expected_identity_digest'
          ),
          ''
        )
      );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'PRC_INVALID_INPUT';
  end;

  if v_source_job_id is null
     or v_expected_source_job_updated_at is null
     or v_expected_report_id is null
     or v_expected_workspace_id is null
     or v_expected_advertiser_id is null
     or v_expected_connection_id is null
     or v_expected_current_ingestion_id is null
     or v_expected_published_ingestion_id is null
     or v_expected_date_from is null
     or v_expected_date_to is null
     or v_expected_date_from > v_expected_date_to
     or v_expected_source_job_rows <> 44500
     or v_expected_source_staging_rows <> 44514
     or v_expected_keyword_entities <> 22257
     or v_expected_identity_digest is null
     or v_expected_identity_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_INVALID_INPUT';
  end if;

  /*
   * Serialize exact retries for this source job without blocking unrelated
   * reports or worker jobs.
   */
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'prepare_naver_searchads_production_recovery_candidate:' ||
      v_source_job_id::text,
      0
    )
  );

  select job.*
  into v_source_job
  from public.media_sync_jobs as job
  where job.id = v_source_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_JOB_NOT_FOUND';
  end if;

  if v_source_job.report_id <> v_expected_report_id
     or v_source_job.workspace_id <> v_expected_workspace_id
     or v_source_job.advertiser_id <> v_expected_advertiser_id
     or v_source_job.connection_id <> v_expected_connection_id
     or v_source_job.provider <> 'naver_searchad'
     or v_source_job.date_from <> v_expected_date_from
     or v_source_job.date_to <> v_expected_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_SCOPE_MISMATCH';
  end if;

  if v_source_job.updated_at is distinct from
       v_expected_source_job_updated_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_JOB_CHANGED';
  end if;

  if v_source_job.status <> 'failed'
     or v_source_job.progress <> 0
     or v_source_job.raw_rows <> v_expected_source_job_rows
     or v_source_job.normalized_rows <> v_expected_source_job_rows
     or v_source_job.inserted_rows <> v_expected_source_job_rows
     or v_source_job.failed_rows <> 0
     or v_source_job.snapshot_ingestion_id is not null
     or v_source_job.error <> 'DATABASE_ERROR'
     or v_source_job.error_detail is null
     or jsonb_typeof(v_source_job.error_detail) <> 'object'
     or v_source_job.error_detail ->> 'name' <>
        'MediaSyncWorkerOrchestrationError'
     or v_source_job.error_detail ->> 'code' <> 'STAGING_FAILED'
     or v_source_job.error_detail ->> 'stage' <> 'STAGING_FAILED'
     or v_source_job.error_detail ->> 'cause_name' <>
        'MediaSyncStagingSummaryError'
     or v_source_job.error_detail ->> 'cause_code' <>
        'DATABASE_ERROR'
     or v_source_job.error_detail ? 'processing_checkpoint'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_FAILURE_CONTRACT_MISMATCH';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(
          v_source_job.error_detail -> 'nested_causes'
        ) = 'array'
        then v_source_job.error_detail -> 'nested_causes'
        else '[]'::jsonb
      end
    ) as cause(value)
    where cause.value ->> 'name' =
          'MediaSyncStagingSummaryError'
      and cause.value ->> 'code' = 'DATABASE_ERROR'
      and cause.value ->> 'message' =
          'The media sync staging summary could not be loaded.'
  )
  or not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(
          v_source_job.error_detail -> 'nested_causes'
        ) = 'array'
        then v_source_job.error_detail -> 'nested_causes'
        else '[]'::jsonb
      end
    ) as cause(value)
    where cause.value ->> 'code' = '57014'
      and cause.value ->> 'message' =
          'canceling statement due to statement timeout'
  )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_TIMEOUT_CAUSE_MISMATCH';
  end if;

  select report.*
  into v_report
  from public.reports as report
  where report.id = v_expected_report_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_REPORT_NOT_FOUND';
  end if;

  if v_report.workspace_id <> v_expected_workspace_id
     or v_report.advertiser_id <> v_expected_advertiser_id
     or v_report.current_ingestion_id is distinct from
        v_expected_current_ingestion_id
     or v_report.published_ingestion_id is distinct from
        v_expected_published_ingestion_id
     or v_source_job.previous_ingestion_id is distinct from
        v_report.current_ingestion_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_REPORT_STATE_MISMATCH';
  end if;

  select connection.*
  into v_connection
  from public.media_connections as connection
  where connection.id = v_expected_connection_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_CONNECTION_NOT_FOUND';
  end if;

  if v_connection.workspace_id <> v_expected_workspace_id
     or v_connection.advertiser_id <> v_expected_advertiser_id
     or v_connection.provider <> 'naver_searchad'
     or v_connection.external_account_id <>
        v_source_job.external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_CONNECTION_STATE_MISMATCH';
  end if;

  select active_job.id
  into v_active_job_id
  from public.media_sync_jobs as active_job
  where active_job.report_id = v_expected_report_id
    and active_job.status in ('pending', 'processing')
  order by active_job.created_at asc, active_job.id asc
  limit 1;

  if v_active_job_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_ACTIVE_JOB_EXISTS';
  end if;

  select candidate.id
  into v_existing_candidate_id
  from public.media_sync_jobs as candidate
  where candidate.report_id = v_expected_report_id
    and candidate.status = 'cancelled'
    and candidate.error_detail #>>
        '{processing_checkpoint,recovery,source_job_id}' =
        v_source_job_id::text
  order by candidate.created_at asc, candidate.id asc
  limit 1;

  if v_existing_candidate_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_CANDIDATE_ALREADY_EXISTS';
  end if;

  /*
   * Lock all existing source rows. The source failed job lock prevents the
   * normal append RPC from changing this scope, and these row locks prevent
   * updates or deletes while validation and copying are in progress.
   */
  perform 1
  from public.media_sync_staging_rows as source_row
  where source_row.job_id = v_source_job_id
  order by source_row.row_index, source_row.row_key
  for share;

  begin
    with source_rows as (
      select row.*
      from public.media_sync_staging_rows as row
      where row.job_id = v_source_job_id
    ),
    keyword_coverage as (
      select
        source_rows.row ->> 'external_keyword_id'
          as external_keyword_id,
        count(*)::bigint as row_count,
        count(distinct source_rows.date)::bigint
          as distinct_date_count,
        min(source_rows.date) as min_date,
        max(source_rows.date) as max_date
      from source_rows
      group by source_rows.row ->> 'external_keyword_id'
    )
    select
      count(*)::bigint,
      min(source_rows.row_index)::bigint,
      max(source_rows.row_index)::bigint,
      count(distinct source_rows.row_index)::bigint,
      (
        count(*) - count(distinct source_rows.row_index)
      )::bigint,
      count(distinct source_rows.row_key)::bigint,
      (
        count(*) - count(distinct source_rows.row_key)
      )::bigint,
      count(*) filter (
        where source_rows.row_fingerprint is null
           or source_rows.row_fingerprint !~ '^[0-9a-f]{64}$'
      )::bigint,
      count(*) filter (
        where source_rows.row_fingerprint is distinct from
          encode(
            extensions.digest(
              source_rows.row::text,
              'sha256'
            ),
            'hex'
          )
      )::bigint,
      count(*) filter (
        where source_rows.report_id <> v_source_job.report_id
           or source_rows.workspace_id <> v_source_job.workspace_id
           or source_rows.advertiser_id <> v_source_job.advertiser_id
           or source_rows.connection_id <> v_source_job.connection_id
           or source_rows.provider <> v_source_job.provider
           or source_rows.external_account_id <>
              v_source_job.external_account_id
           or source_rows.date_from <> v_source_job.date_from
           or source_rows.date_to <> v_source_job.date_to
      )::bigint,
      count(*) filter (
        where source_rows.date < v_source_job.date_from
           or source_rows.date > v_source_job.date_to
      )::bigint,
      count(*) filter (
        where source_rows.date_window_index <> 0
      )::bigint,
      count(*) filter (
        where source_rows.row ->> 'row_level' = 'keyword'
      )::bigint,
      count(*) filter (
        where source_rows.row ->> 'row_level' = 'creative'
      )::bigint,
      count(*) filter (
        where source_rows.row ->> 'row_level' = 'mixed'
      )::bigint,
      count(distinct source_rows.date)::bigint,
      count(
        distinct nullif(
          btrim(
            source_rows.row ->> 'external_keyword_id'
          ),
          ''
        )
      )::bigint,
      (
        select count(*)::bigint
        from keyword_coverage
        where keyword_coverage.external_keyword_id is null
           or btrim(keyword_coverage.external_keyword_id) = ''
           or keyword_coverage.row_count <> 2
           or keyword_coverage.distinct_date_count <> 2
           or keyword_coverage.min_date <> v_expected_date_from
           or keyword_coverage.max_date <> v_expected_date_to
      ),
      count(*) filter (
        where jsonb_typeof(source_rows.row) <> 'object'
           or source_rows.row ->> 'date' <>
              source_rows.date::text
           or source_rows.row ->> 'report_date' <>
              source_rows.date::text
           or source_rows.row ->> 'day' <>
              source_rows.date::text
           or source_rows.row ->> 'ymd' <>
              source_rows.date::text
           or source_rows.channel is distinct from
              source_rows.row ->> 'channel'
           or source_rows.device is distinct from
              source_rows.row ->> 'device'
           or source_rows.source is distinct from
              source_rows.row ->> 'source'
           or source_rows.row ->> 'provider' <>
              'naver_searchad'
           or source_rows.row ->> 'external_account_id' <>
              v_source_job.external_account_id
           or source_rows.row ->> 'ingestion_source' <> 'api'
           or source_rows.row ->> 'row_level' <> 'keyword'
           or source_rows.row ->> 'data_level' <> 'keyword'
           or source_rows.row ->> 'row_level_reason' <>
              'naver_searchad_registered_keyword_daily_stats'
           or nullif(
                btrim(
                  source_rows.row ->> 'external_campaign_id'
                ),
                ''
              ) is null
           or nullif(
                btrim(
                  source_rows.row ->> 'external_group_id'
                ),
                ''
              ) is null
           or nullif(
                btrim(
                  source_rows.row ->> 'external_keyword_id'
                ),
                ''
              ) is null
           or nullif(
                btrim(source_rows.row ->> 'campaign'),
                ''
              ) is null
           or nullif(
                btrim(source_rows.row ->> 'group'),
                ''
              ) is null
           or nullif(
                btrim(source_rows.row ->> 'keyword'),
                ''
              ) is null
           or nullif(
                btrim(
                  source_rows.row ->> 'external_creative_id'
                ),
                ''
              ) is not null
           or nullif(
                btrim(source_rows.row ->> 'external_ad_id'),
                ''
              ) is not null
      )::bigint,
      count(*) filter (
        where source_rows.row_key::jsonb is distinct from
          jsonb_build_array(
            source_rows.provider,
            source_rows.external_account_id,
            source_rows.row ->> 'external_campaign_id',
            source_rows.row ->> 'external_group_id',
            source_rows.row ->> 'external_keyword_id',
            source_rows.row ->> 'date'
          )
      )::bigint
    into
      v_source_rows,
      v_source_min_row_index,
      v_source_max_row_index,
      v_source_distinct_row_indexes,
      v_source_duplicate_row_indexes,
      v_source_distinct_row_keys,
      v_source_duplicate_row_keys,
      v_source_invalid_fingerprint_rows,
      v_source_fingerprint_mismatch_rows,
      v_source_scope_mismatch_rows,
      v_source_date_range_violation_rows,
      v_source_date_window_mismatch_rows,
      v_source_keyword_rows,
      v_source_creative_rows,
      v_source_mixed_rows,
      v_source_distinct_dates,
      v_source_distinct_keyword_entities,
      v_source_keyword_coverage_mismatch_rows,
      v_source_canonical_mismatch_rows,
      v_source_row_key_mismatch_rows
    from source_rows;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'PRC_SOURCE_STAGING_INVALID';
  end;

  if v_source_rows <> v_expected_source_staging_rows
     or v_source_min_row_index <> 0
     or v_source_max_row_index <>
        v_expected_source_staging_rows - 1
     or v_source_distinct_row_indexes <>
        v_expected_source_staging_rows
     or v_source_duplicate_row_indexes <> 0
     or v_source_distinct_row_keys <>
        v_expected_source_staging_rows
     or v_source_duplicate_row_keys <> 0
     or v_source_invalid_fingerprint_rows <> 0
     or v_source_fingerprint_mismatch_rows <> 0
     or v_source_scope_mismatch_rows <> 0
     or v_source_date_range_violation_rows <> 0
     or v_source_date_window_mismatch_rows <> 0
     or v_source_keyword_rows <>
        v_expected_source_staging_rows
     or v_source_creative_rows <> 0
     or v_source_mixed_rows <> 0
     or v_source_distinct_dates <> 2
     or v_source_distinct_keyword_entities <>
        v_expected_keyword_entities
     or v_source_keyword_coverage_mismatch_rows <> 0
     or v_source_canonical_mismatch_rows <> 0
     or v_source_row_key_mismatch_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_STAGING_CONTRACT_MISMATCH';
  end if;

  select encode(
    extensions.digest(
      coalesce(
        string_agg(
          '[' ||
          source_row.row_index::text || ',' ||
          source_row.date_window_index::text || ',' ||
          to_json(source_row.date::text)::text || ',' ||
          to_json(source_row.row_key)::text || ',' ||
          to_json(source_row.row_fingerprint)::text ||
          E']\n',
          '' order by
            source_row.row_index asc,
            source_row.row_key asc
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
  into v_source_identity_digest
  from public.media_sync_staging_rows as source_row
  where source_row.job_id = v_source_job_id;

  if v_source_identity_digest is distinct from
       v_expected_identity_digest
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_IDENTITY_DIGEST_MISMATCH';
  end if;

  v_now := statement_timestamp();
  v_candidate_id := gen_random_uuid();

  v_keyword_cursor :=
    jsonb_build_object(
      'version', 1,
      'dateWindowIndex', 0,
      'dateFrom', v_source_job.date_from::text,
      'dateTo', v_source_job.date_to::text,
      'campaignBaseSearchId', null,
      'campaignId', null,
      'adgroupBaseSearchId', null,
      'adgroupId', null,
      'keywordBaseSearchId', null,
      'keywordChunkIndex', 0,
      'keywordIndexInChunk', 0,
      'lastCompletedKeywordId', null,
      'completedKeywordCount', v_expected_keyword_entities,
      'discoveredKeywordCount', v_expected_keyword_entities
    );

  v_processing_checkpoint :=
    jsonb_build_object(
      'version', 1,
      'saved_at', to_jsonb(v_now),
      'date_window_index', 0,
      'raw_rows', v_expected_source_staging_rows,
      'normalized_rows', v_expected_source_staging_rows,
      'inserted_rows', v_expected_source_staging_rows,
      'failed_rows', 0,
      'collector',
        jsonb_build_object(
          'discovered_keywords', v_expected_keyword_entities,
          'completed_keywords', v_expected_keyword_entities,
          'stats_requests_attempted', 0,
          'stats_requests_succeeded', 0,
          'retry_count', 0,
          'date_window_index', 0,
          'cursor', v_keyword_cursor,
          'combined_version', 1,
          'phase', 'authoritative',
          'next_row_index', v_expected_source_staging_rows,
          'keyword',
            jsonb_build_object(
              'complete', true,
              'cursor', v_keyword_cursor,
              'counts',
                jsonb_build_object(
                  'discovered', v_expected_keyword_entities,
                  'completed', v_expected_keyword_entities,
                  'statsRequestsAttempted', 0,
                  'statsRequestsSucceeded', 0,
                  'retryCount', 0
                )
            ),
          'authoritative',
            jsonb_build_object(
              'complete', false,
              'cursor', null,
              'counts',
                jsonb_build_object(
                  'discovered', 0,
                  'completed', 0,
                  'statsRequestsAttempted', 0,
                  'statsRequestsSucceeded', 0,
                  'retryCount', 0
                )
            )
        ),
      'recovery',
        jsonb_build_object(
          'contract_version', 1,
          'source_job_id', v_source_job.id,
          'source_job_updated_at',
            to_jsonb(v_source_job.updated_at),
          'source_staging_rows',
            v_expected_source_staging_rows,
          'source_identity_digest',
            v_source_identity_digest,
          'keyword_counts_derived_from_staging', true,
          'request_counts_reconstructed', false,
          'prepared_at', to_jsonb(v_now)
        )
    );

  insert into public.media_sync_jobs (
    id,
    workspace_id,
    advertiser_id,
    report_id,
    connection_id,
    provider,
    external_account_id,
    date_from,
    date_to,
    data_level,
    mode,
    status,
    progress,
    raw_rows,
    normalized_rows,
    inserted_rows,
    failed_rows,
    previous_ingestion_id,
    snapshot_ingestion_id,
    attempt_count,
    error,
    error_detail,
    created_by,
    created_at,
    started_at,
    finished_at,
    updated_at
  )
  values (
    v_candidate_id,
    v_source_job.workspace_id,
    v_source_job.advertiser_id,
    v_source_job.report_id,
    v_source_job.connection_id,
    v_source_job.provider,
    v_source_job.external_account_id,
    v_source_job.date_from,
    v_source_job.date_to,
    v_source_job.data_level,
    v_source_job.mode,
    'cancelled',
    99,
    v_expected_source_staging_rows,
    v_expected_source_staging_rows,
    v_expected_source_staging_rows,
    0,
    v_report.current_ingestion_id,
    null,
    0,
    null,
    jsonb_build_object(
      'processing_checkpoint',
      v_processing_checkpoint
    ),
    v_source_job.created_by,
    v_now,
    null,
    null,
    v_now
  )
  returning *
  into v_candidate_job;

  insert into public.media_sync_staging_rows (
    job_id,
    report_id,
    workspace_id,
    advertiser_id,
    connection_id,
    provider,
    external_account_id,
    date_window_index,
    date_from,
    date_to,
    row_index,
    row_key,
    date,
    channel,
    device,
    source,
    row
  )
  select
    v_candidate_id,
    source_row.report_id,
    source_row.workspace_id,
    source_row.advertiser_id,
    source_row.connection_id,
    source_row.provider,
    source_row.external_account_id,
    source_row.date_window_index,
    source_row.date_from,
    source_row.date_to,
    source_row.row_index,
    source_row.row_key,
    source_row.date,
    source_row.channel,
    source_row.device,
    source_row.source,
    source_row.row
  from public.media_sync_staging_rows as source_row
  where source_row.job_id = v_source_job_id
  order by source_row.row_index asc, source_row.row_key asc;

  select
    count(*)::bigint,
    min(candidate_row.row_index)::bigint,
    max(candidate_row.row_index)::bigint,
    count(distinct candidate_row.row_index)::bigint,
    count(distinct candidate_row.row_key)::bigint
  into
    v_candidate_rows,
    v_candidate_min_row_index,
    v_candidate_max_row_index,
    v_candidate_distinct_row_indexes,
    v_candidate_distinct_row_keys
  from public.media_sync_staging_rows as candidate_row
  where candidate_row.job_id = v_candidate_id;

  select count(*)::bigint
  into v_candidate_exact_mismatch_rows
  from public.media_sync_staging_rows as source_row
  full outer join public.media_sync_staging_rows as candidate_row
    on candidate_row.job_id = v_candidate_id
   and candidate_row.row_index = source_row.row_index
  where source_row.job_id = v_source_job_id
    and (
      candidate_row.id is null
      or candidate_row.report_id <> source_row.report_id
      or candidate_row.workspace_id <> source_row.workspace_id
      or candidate_row.advertiser_id <> source_row.advertiser_id
      or candidate_row.connection_id <> source_row.connection_id
      or candidate_row.provider <> source_row.provider
      or candidate_row.external_account_id <>
         source_row.external_account_id
      or candidate_row.date_window_index <>
         source_row.date_window_index
      or candidate_row.date_from <> source_row.date_from
      or candidate_row.date_to <> source_row.date_to
      or candidate_row.row_key <> source_row.row_key
      or candidate_row.date <> source_row.date
      or candidate_row.channel is distinct from source_row.channel
      or candidate_row.device is distinct from source_row.device
      or candidate_row.source is distinct from source_row.source
      or candidate_row.row is distinct from source_row.row
      or candidate_row.row_fingerprint is distinct from
         source_row.row_fingerprint
    );

  if v_candidate_rows <> v_expected_source_staging_rows
     or v_candidate_min_row_index <> 0
     or v_candidate_max_row_index <>
        v_expected_source_staging_rows - 1
     or v_candidate_distinct_row_indexes <>
        v_expected_source_staging_rows
     or v_candidate_distinct_row_keys <>
        v_expected_source_staging_rows
     or v_candidate_exact_mismatch_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_CANDIDATE_COPY_MISMATCH';
  end if;

  select encode(
    extensions.digest(
      coalesce(
        string_agg(
          '[' ||
          candidate_row.row_index::text || ',' ||
          candidate_row.date_window_index::text || ',' ||
          to_json(candidate_row.date::text)::text || ',' ||
          to_json(candidate_row.row_key)::text || ',' ||
          to_json(candidate_row.row_fingerprint)::text ||
          E']\n',
          '' order by
            candidate_row.row_index asc,
            candidate_row.row_key asc
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
  into v_candidate_identity_digest
  from public.media_sync_staging_rows as candidate_row
  where candidate_row.job_id = v_candidate_id;

  if v_candidate_identity_digest is distinct from
       v_source_identity_digest
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_CANDIDATE_IDENTITY_DIGEST_MISMATCH';
  end if;

  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            '[' ||
            source_row.row_index::text || ',' ||
            source_row.date_window_index::text || ',' ||
            to_json(source_row.date::text)::text || ',' ||
            to_json(source_row.row_key)::text || ',' ||
            to_json(source_row.row_fingerprint)::text ||
            E']\n',
            '' order by
              source_row.row_index asc,
              source_row.row_key asc
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
  from public.media_sync_staging_rows as source_row
  where source_row.job_id = v_source_job_id;

  select job.*
  into v_source_job_after
  from public.media_sync_jobs as job
  where job.id = v_source_job_id;

  select report.*
  into v_report_after
  from public.reports as report
  where report.id = v_expected_report_id;

  if v_source_job_after.id is null
     or v_source_job_after.updated_at is distinct from
        v_source_job.updated_at
     or v_source_job_after.status is distinct from
        v_source_job.status
     or v_source_job_after.raw_rows is distinct from
        v_source_job.raw_rows
     or v_source_job_after.normalized_rows is distinct from
        v_source_job.normalized_rows
     or v_source_job_after.inserted_rows is distinct from
        v_source_job.inserted_rows
     or v_source_job_after.error is distinct from
        v_source_job.error
     or v_source_job_after.error_detail is distinct from
        v_source_job.error_detail
     or v_source_post_rows <> v_source_rows
     or v_source_post_identity_digest is distinct from
        v_source_identity_digest
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_SOURCE_CHANGED_DURING_PREPARATION';
  end if;

  if v_report_after.id is null
     or v_report_after.current_ingestion_id is distinct from
        v_report.current_ingestion_id
     or v_report_after.published_ingestion_id is distinct from
        v_report.published_ingestion_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_REPORT_POINTER_CHANGED_DURING_PREPARATION';
  end if;

  if v_candidate_job.status <> 'cancelled'
     or v_candidate_job.progress <> 99
     or v_candidate_job.raw_rows <>
        v_expected_source_staging_rows
     or v_candidate_job.normalized_rows <>
        v_expected_source_staging_rows
     or v_candidate_job.inserted_rows <>
        v_expected_source_staging_rows
     or v_candidate_job.failed_rows <> 0
     or v_candidate_job.previous_ingestion_id is distinct from
        v_report.current_ingestion_id
     or v_candidate_job.snapshot_ingestion_id is not null
     or v_candidate_job.attempt_count <> 0
     or v_candidate_job.error is not null
     or v_candidate_job.started_at is not null
     or v_candidate_job.finished_at is not null
     or jsonb_typeof(v_candidate_job.error_detail) <> 'object'
     or (
       select count(*)
       from jsonb_object_keys(v_candidate_job.error_detail)
     ) <> 1
     or not (
       v_candidate_job.error_detail ?
       'processing_checkpoint'
     )
     or v_candidate_job.error_detail #>>
        '{processing_checkpoint,collector,phase}' <>
        'authoritative'
     or (
       v_candidate_job.error_detail #>>
       '{processing_checkpoint,collector,next_row_index}'
     )::bigint <> v_expected_source_staging_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRC_CANDIDATE_JOB_CONTRACT_MISMATCH';
  end if;

  return query
  select
    v_source_job.id,
    v_candidate_job.id,
    v_candidate_job.status,

    v_candidate_job.report_id,
    v_candidate_job.workspace_id,
    v_candidate_job.advertiser_id,
    v_candidate_job.connection_id,

    v_candidate_rows,
    'authoritative'::text,
    v_expected_source_staging_rows,

    v_source_identity_digest,
    v_candidate_identity_digest,

    v_report.current_ingestion_id,
    v_report.published_ingestion_id,

    true,
    true,
    true,
    false,
    false,
    false,
    false;
end;
$function$;

revoke all
on function public.prepare_naver_searchads_production_recovery_candidate(jsonb)
from public;

revoke all
on function public.prepare_naver_searchads_production_recovery_candidate(jsonb)
from anon;

revoke all
on function public.prepare_naver_searchads_production_recovery_candidate(jsonb)
from authenticated;

grant execute
on function public.prepare_naver_searchads_production_recovery_candidate(jsonb)
to service_role;

comment on function public.prepare_naver_searchads_production_recovery_candidate(jsonb)
is
  'Atomically prepares an isolated cancelled Naver Search Ads recovery candidate from one explicitly verified failed keyword-staging source job without claiming, materializing, activating, finalizing, or changing report pointers.';

notify pgrst, 'reload schema';
