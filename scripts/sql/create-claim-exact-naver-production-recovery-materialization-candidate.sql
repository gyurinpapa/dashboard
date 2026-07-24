/*
 * Etrylue Performance
 * Exact materialization-only claim for the repaired Naver production recovery
 * candidate.
 *
 * This function is intentionally separate from
 * claim_exact_naver_production_recovery_candidate v3.
 *
 * Contract:
 * - validates one fixed repaired candidate and its immutable production state;
 * - performs no collector, staging, materialization, activation, or finalization;
 * - changes only the exact candidate lifecycle from cancelled to processing;
 * - preserves attempt_count, progress, counters, processing_checkpoint, and
 *   recovery without reconstruction.
 *
 * This file only defines the RPC. Applying it to Supabase and invoking it are
 * separate, explicitly prohibited steps at this stage.
 */

create or replace function public.claim_exact_naver_production_recovery_materialization_candidate(
  p_candidate_job_id uuid,
  p_source_job_id uuid,
  p_expected_candidate_updated_at timestamptz,
  p_expected_confirmation_token text,
  p_expected_staging_fingerprint text,
  p_expected_current_ingestion_id uuid,
  p_expected_published_ingestion_id uuid
)
returns setof public.media_sync_jobs
language plpgsql
security definer
set search_path = public, pg_catalog, extensions
as $$
declare
  v_expected_candidate_job_id constant uuid :=
    '4191baff-393f-4be8-bb38-31548d3ba051'::uuid;
  v_expected_source_job_id constant uuid :=
    '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'::uuid;
  v_expected_report_id constant uuid :=
    'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid;
  v_expected_workspace_id constant uuid :=
    '27b1556f-9d42-496f-bd7e-5a59ebee71d4'::uuid;
  v_expected_advertiser_id constant uuid :=
    'da51e71a-01ce-42fb-a937-7af0b5f47786'::uuid;
  v_expected_connection_id constant uuid :=
    'aba7d28f-ec85-49db-941a-fa5babe2af61'::uuid;
  v_expected_current_ingestion_id constant uuid :=
    '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid;
  v_expected_published_ingestion_id constant uuid :=
    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid;

  v_expected_candidate_updated_at constant timestamptz :=
    '2026-07-22 14:23:11.371149+00'::timestamptz;
  v_expected_source_job_updated_at constant timestamptz :=
    '2026-07-19 11:59:16.834+00'::timestamptz;

  v_expected_confirmation_token constant text :=
    '7aa3be46fb606536de8c3bc9540a311426da8b203508cebeef1d2e93fd8668d2';
  v_expected_staging_fingerprint constant text :=
    '1874890814e763dfe834ae0d97698157e707939ef5a213be8582a9bc264c35f1';
  v_expected_source_identity_digest constant text :=
    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40';
  v_expected_report_ingestions_descriptor_digest constant text :=
    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776';
  v_expected_current_canonical_sentinel_digest constant text :=
    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7';
  v_expected_published_canonical_sentinel_digest constant text :=
    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0';
  v_expected_original_confirmation_token constant text :=
    '31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127';
  v_expected_original_candidate_fingerprint constant text :=
    'f11def9d7faa36e7233878a5cb533c048c17225f519324de80c289f5d8e4ad28';

  v_expected_attempt_count constant bigint := 12;
  v_expected_source_job_rows constant bigint := 44500;
  v_expected_source_staging_rows constant bigint := 44514;
  v_expected_original_candidate_rows constant bigint := 45808;
  v_expected_excluded_rows constant bigint := 1204;
  v_expected_candidate_rows constant bigint := 44604;
  v_expected_keyword_rows constant bigint := 43310;
  v_expected_creative_rows constant bigint := 1244;
  v_expected_mixed_rows constant bigint := 50;
  v_expected_impressions constant numeric := 7075;
  v_expected_clicks constant numeric := 1183;
  v_expected_cost constant numeric := 113850;
  v_expected_conversions constant numeric := 67;
  v_expected_revenue constant numeric := 12729300;
  v_expected_report_ingestions_count constant bigint := 11;
  v_expected_current_descriptor_rows constant bigint := 118;
  v_expected_published_descriptor_rows constant bigint := 44514;
  v_expected_total_report_rows_for_token constant bigint := 359716;
  v_fingerprint_block_size constant bigint := 10000;

  v_candidate public.media_sync_jobs%rowtype;
  v_source public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_claimed public.media_sync_jobs%rowtype;

  v_checkpoint jsonb;
  v_collector jsonb;
  v_keyword jsonb;
  v_authoritative jsonb;
  v_recovery jsonb;
  v_error_detail_before jsonb;

  v_error_detail_key_count bigint;
  v_recovery_key_count bigint;
  v_recovery_key_names text[];

  v_required_unique_constraint_count bigint;
  v_required_unique_constraints_validated boolean;
  v_active_job_count bigint;

  v_candidate_rows bigint;
  v_candidate_min_row_index bigint;
  v_candidate_max_row_index bigint;
  v_candidate_distinct_row_indexes bigint;
  v_candidate_distinct_window_row_keys bigint;
  v_candidate_keyword_rows bigint;
  v_candidate_creative_rows bigint;
  v_candidate_mixed_rows bigint;
  v_candidate_invalid_fingerprint_rows bigint;
  v_candidate_scope_mismatch_rows bigint;
  v_candidate_canonical_mismatch_rows bigint;
  v_candidate_invalid_grain_rows bigint;
  v_candidate_overlap_rows bigint;
  v_candidate_impressions numeric;
  v_candidate_clicks numeric;
  v_candidate_cost numeric;
  v_candidate_conversions numeric;
  v_candidate_revenue numeric;
  v_candidate_fingerprint text;

  v_source_rows bigint;
  v_source_min_row_index bigint;
  v_source_max_row_index bigint;
  v_source_distinct_row_indexes bigint;
  v_source_distinct_window_row_keys bigint;
  v_source_invalid_fingerprint_rows bigint;
  v_source_identity_digest text;

  v_recalculated_confirmation_token text;

  v_report_ingestions_count bigint;
  v_report_ingestions_descriptor_digest text;
  v_current_descriptor_rows bigint;
  v_current_descriptor_status text;
  v_published_descriptor_rows bigint;
  v_published_descriptor_status text;

  v_current_sentinel_count bigint;
  v_current_sentinel_digest text;
  v_published_sentinel_count bigint;
  v_published_sentinel_digest text;

  v_now timestamptz;
begin
  if p_candidate_job_id is distinct from v_expected_candidate_job_id
     or p_source_job_id is distinct from v_expected_source_job_id
     or p_expected_candidate_updated_at is distinct from
        v_expected_candidate_updated_at
     or lower(btrim(coalesce(p_expected_confirmation_token, ''))) <>
        v_expected_confirmation_token
     or lower(btrim(coalesce(p_expected_staging_fingerprint, ''))) <>
        v_expected_staging_fingerprint
     or p_expected_current_ingestion_id is distinct from
        v_expected_current_ingestion_id
     or p_expected_published_ingestion_id is distinct from
        v_expected_published_ingestion_id
  then
    raise exception using
      errcode = '22023',
      message = 'EMC_INVALID_INPUT';
  end if;

  select job.*
  into v_candidate
  from public.media_sync_jobs as job
  where job.id = v_expected_candidate_job_id
  for update;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'EMC_CANDIDATE_NOT_FOUND';
  end if;

  select job.*
  into v_source
  from public.media_sync_jobs as job
  where job.id = v_expected_source_job_id
  for share;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'EMC_SOURCE_NOT_FOUND';
  end if;

  select report.*
  into v_report
  from public.reports as report
  where report.id = v_expected_report_id
  for update;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'EMC_REPORT_NOT_FOUND';
  end if;

  if v_candidate.id is distinct from v_expected_candidate_job_id
     or v_candidate.report_id is distinct from v_expected_report_id
     or v_candidate.workspace_id is distinct from v_expected_workspace_id
     or v_candidate.advertiser_id is distinct from v_expected_advertiser_id
     or v_candidate.connection_id is distinct from v_expected_connection_id
     or v_candidate.provider is distinct from 'naver_searchad'
     or v_candidate.status is distinct from 'cancelled'
     or v_candidate.progress is distinct from 99
     or v_candidate.attempt_count is distinct from v_expected_attempt_count
     or v_candidate.updated_at is distinct from v_expected_candidate_updated_at
     or v_candidate.raw_rows is distinct from v_expected_candidate_rows
     or v_candidate.normalized_rows is distinct from v_expected_candidate_rows
     or v_candidate.inserted_rows is distinct from v_expected_candidate_rows
     or v_candidate.failed_rows is distinct from 0
     or v_candidate.previous_ingestion_id is distinct from
        v_expected_current_ingestion_id
     or v_candidate.snapshot_ingestion_id is not null
     or v_candidate.error is not null
     or v_candidate.started_at is not null
     or v_candidate.finished_at is not null
     or jsonb_typeof(v_candidate.error_detail) is distinct from 'object'
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_CANDIDATE_STATE_MISMATCH';
  end if;

  select count(*)::bigint
  into v_error_detail_key_count
  from jsonb_object_keys(v_candidate.error_detail);

  if v_error_detail_key_count <> 1
     or not (v_candidate.error_detail ? 'processing_checkpoint')
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_ERROR_DETAIL_CONTRACT_MISMATCH';
  end if;

  v_checkpoint :=
    v_candidate.error_detail -> 'processing_checkpoint';
  v_collector :=
    v_checkpoint -> 'collector';
  v_keyword :=
    v_collector -> 'keyword';
  v_authoritative :=
    v_collector -> 'authoritative';
  v_recovery :=
    v_checkpoint -> 'recovery';

  if jsonb_typeof(v_checkpoint) is distinct from 'object'
     or jsonb_typeof(v_collector) is distinct from 'object'
     or jsonb_typeof(v_keyword) is distinct from 'object'
     or jsonb_typeof(v_authoritative) is distinct from 'object'
     or v_checkpoint #>> '{version}' <> '1'
     or v_collector #>> '{combined_version}' <> '1'
     or v_collector #>> '{phase}' <> 'completed'
     or v_collector #>> '{next_row_index}' <>
        v_expected_candidate_rows::text
     or v_checkpoint #>> '{raw_rows}' <>
        v_expected_candidate_rows::text
     or v_checkpoint #>> '{normalized_rows}' <>
        v_expected_candidate_rows::text
     or v_checkpoint #>> '{inserted_rows}' <>
        v_expected_candidate_rows::text
     or v_checkpoint #>> '{failed_rows}' <> '0'
     or v_keyword #>> '{complete}' <> 'true'
     or v_authoritative #>> '{complete}' <> 'true'
     or v_checkpoint ->> 'saved_at' <>
        (to_jsonb(v_expected_candidate_updated_at) #>> '{}')
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_CHECKPOINT_MISMATCH';
  end if;

  if jsonb_typeof(v_recovery) is distinct from 'object' then
    raise exception using
      errcode = '55000',
      message = 'EMC_RECOVERY_CONTRACT_MISMATCH';
  end if;

  select
    count(key_name)::bigint,
    coalesce(
      array_agg(key_name order by key_name),
      array[]::text[]
    )
  into
    v_recovery_key_count,
    v_recovery_key_names
  from jsonb_object_keys(v_recovery) as recovery_key(key_name);

  if v_recovery_key_count <> 28
     or v_recovery_key_names is distinct from
        array[
          'approved_clicks',
          'approved_conversions',
          'approved_cost',
          'approved_impressions',
          'approved_revenue',
          'confirmation_token',
          'contract_version',
          'expected_current_ingestion_id',
          'expected_published_ingestion_id',
          'isolated',
          'keyword_counts_derived_from_staging',
          'prepared_at',
          'repair_applied_at',
          'repair_excluded_rows',
          'repair_fingerprint_algorithm',
          'repair_kind',
          'repair_matched_campaign_count',
          'repair_mixed_only_campaign_count',
          'repair_original_candidate_fingerprint',
          'repair_original_confirmation_token',
          'repair_repaired_rows',
          'repair_repaired_staging_fingerprint',
          'repair_source_candidate_rows',
          'request_counts_reconstructed',
          'source_identity_digest',
          'source_job_id',
          'source_job_updated_at',
          'source_staging_rows'
        ]::text[]
     or v_recovery ->> 'contract_version' <> '2'
     or v_recovery ->> 'source_job_id' <>
        v_expected_source_job_id::text
     or v_recovery ->> 'source_job_updated_at' <>
        (to_jsonb(v_expected_source_job_updated_at) #>> '{}')
     or v_recovery ->> 'source_staging_rows' <>
        v_expected_source_staging_rows::text
     or v_recovery ->> 'source_identity_digest' <>
        v_expected_source_identity_digest
     or v_recovery ->> 'keyword_counts_derived_from_staging' <> 'true'
     or v_recovery ->> 'request_counts_reconstructed' <> 'false'
     or v_recovery ->> 'prepared_at' <>
        (to_jsonb(v_candidate.created_at) #>> '{}')
     or v_recovery ->> 'expected_current_ingestion_id' <>
        v_expected_current_ingestion_id::text
     or v_recovery ->> 'expected_published_ingestion_id' <>
        v_expected_published_ingestion_id::text
     or v_recovery ->> 'isolated' <> 'true'
     or v_recovery ->> 'repair_kind' <>
        'brand_search_cross_grain_dedup_v1'
     or v_recovery ->> 'repair_applied_at' <>
        (to_jsonb(v_expected_candidate_updated_at) #>> '{}')
     or v_recovery ->> 'repair_source_candidate_rows' <>
        v_expected_original_candidate_rows::text
     or v_recovery ->> 'repair_excluded_rows' <>
        v_expected_excluded_rows::text
     or v_recovery ->> 'repair_repaired_rows' <>
        v_expected_candidate_rows::text
     or v_recovery ->> 'repair_matched_campaign_count' <> '3'
     or v_recovery ->> 'repair_mixed_only_campaign_count' <> '2'
     or v_recovery ->> 'repair_original_candidate_fingerprint' <>
        v_expected_original_candidate_fingerprint
     or v_recovery ->> 'repair_repaired_staging_fingerprint' <>
        v_expected_staging_fingerprint
     or v_recovery ->> 'repair_fingerprint_algorithm' <>
        'chunked_sha256_v1:block_size=10000'
     or v_recovery ->> 'repair_original_confirmation_token' <>
        v_expected_original_confirmation_token
     or v_recovery ->> 'approved_impressions' <>
        v_expected_impressions::text
     or v_recovery ->> 'approved_clicks' <>
        v_expected_clicks::text
     or v_recovery ->> 'approved_cost' <>
        v_expected_cost::text
     or v_recovery ->> 'approved_conversions' <>
        v_expected_conversions::text
     or v_recovery ->> 'approved_revenue' <>
        v_expected_revenue::text
     or v_recovery ->> 'confirmation_token' <>
        v_expected_confirmation_token
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_RECOVERY_CONTRACT_MISMATCH';
  end if;

  if v_source.id is distinct from v_expected_source_job_id
     or v_source.report_id is distinct from v_expected_report_id
     or v_source.workspace_id is distinct from v_expected_workspace_id
     or v_source.advertiser_id is distinct from v_expected_advertiser_id
     or v_source.connection_id is distinct from v_expected_connection_id
     or v_source.provider is distinct from 'naver_searchad'
     or v_source.status is distinct from 'failed'
     or v_source.updated_at is distinct from v_expected_source_job_updated_at
     or v_source.raw_rows is distinct from v_expected_source_job_rows
     or v_source.normalized_rows is distinct from v_expected_source_job_rows
     or v_source.inserted_rows is distinct from v_expected_source_job_rows
     or v_source.failed_rows is distinct from 0
     or v_source.snapshot_ingestion_id is not null
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_SOURCE_STATE_MISMATCH';
  end if;

  if v_report.id is distinct from v_expected_report_id
     or v_report.workspace_id is distinct from v_expected_workspace_id
     or v_report.advertiser_id is distinct from v_expected_advertiser_id
     or v_report.current_ingestion_id is distinct from
        v_expected_current_ingestion_id
     or v_report.published_ingestion_id is distinct from
        v_expected_published_ingestion_id
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_REPORT_POINTER_MISMATCH';
  end if;

  select count(job.id)::bigint
  into v_active_job_count
  from public.media_sync_jobs as job
  where job.report_id = v_expected_report_id
    and job.status in ('pending', 'processing');

  if v_active_job_count <> 0 then
    raise exception using
      errcode = '55000',
      message = 'EMC_ACTIVE_JOB_EXISTS';
  end if;

  select
    count(*)::bigint,
    coalesce(bool_and(constraint_record.convalidated), false)
  into
    v_required_unique_constraint_count,
    v_required_unique_constraints_validated
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
        'public.media_sync_staging_rows'::regclass
    and constraint_record.contype = 'u'
    and constraint_record.conname in (
      'media_sync_staging_rows_job_row_index_unique',
      'media_sync_staging_rows_job_window_row_key_unique'
    );

  if v_required_unique_constraint_count <> 2
     or not v_required_unique_constraints_validated
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_STAGING_UNIQUE_CONTRACT_MISMATCH';
  end if;

  /*
   * Locks are read locks only. This function never inserts, updates, or deletes
   * staging rows.
   */
  perform 1
  from public.media_sync_staging_rows as row
  where row.job_id in (
    v_expected_candidate_job_id,
    v_expected_source_job_id
  )
  for share;

  with
  mixed_campaigns as materialized (
    select distinct
      nullif(
        btrim(row.row ->> 'external_campaign_id'),
        ''
      ) as campaign_id
    from public.media_sync_staging_rows as row
    where row.job_id = v_expected_candidate_job_id
      and row.row ->> 'row_level' = 'mixed'
      and row.row ->> 'data_level' = 'mixed'
      and row.row ->> 'row_level_reason' =
          'naver_searchad_brand_search_adgroup_daily_stats'
      and nullif(
        btrim(row.row ->> 'external_campaign_id'),
        ''
      ) is not null
  ),
  candidate_blocks as materialized (
    select
      (
        row.row_index /
        v_fingerprint_block_size
      )::bigint as block_index,
      count(*)::bigint as block_rows,
      min(row.row_index)::bigint as block_min_row_index,
      max(row.row_index)::bigint as block_max_row_index,
      count(*) filter (
        where row.row ->> 'row_level' = 'keyword'
      )::bigint as keyword_rows,
      count(*) filter (
        where row.row ->> 'row_level' = 'creative'
      )::bigint as creative_rows,
      count(*) filter (
        where row.row ->> 'row_level' = 'mixed'
      )::bigint as mixed_rows,
      count(*) filter (
        where row.row_fingerprint is null
           or row.row_fingerprint !~ '^[0-9a-f]{64}$'
           or row.row is null
           or row.row_fingerprint is distinct from
              encode(
                extensions.digest(
                  pg_catalog.convert_to(
                    row.row::text,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              )
      )::bigint as invalid_fingerprint_rows,
      count(*) filter (
        where row.report_id is distinct from v_expected_report_id
           or row.workspace_id is distinct from v_expected_workspace_id
           or row.advertiser_id is distinct from
              v_expected_advertiser_id
           or row.connection_id is distinct from
              v_expected_connection_id
           or row.provider is distinct from 'naver_searchad'
           or row.external_account_id is distinct from
              v_candidate.external_account_id
           or row.date_from is distinct from v_candidate.date_from
           or row.date_to is distinct from v_candidate.date_to
           or row.date < v_candidate.date_from
           or row.date > v_candidate.date_to
      )::bigint as scope_mismatch_rows,
      count(*) filter (
        where jsonb_typeof(row.row) is distinct from 'object'
           or coalesce(row.row ->> 'date', '') <> row.date::text
           or coalesce(row.row ->> 'report_date', '') <>
              row.date::text
           or coalesce(row.row ->> 'day', '') <> row.date::text
           or coalesce(row.row ->> 'ymd', '') <> row.date::text
           or coalesce(row.row ->> 'channel', '') <>
              coalesce(row.channel, '')
           or coalesce(row.row ->> 'device', '') <>
              coalesce(row.device, '')
           or coalesce(row.row ->> 'source', '') <>
              coalesce(row.source, '')
           or coalesce(row.row ->> 'provider', '') <>
              'naver_searchad'
           or coalesce(
                row.row ->> 'external_account_id',
                ''
              ) <> v_candidate.external_account_id
           or coalesce(
                row.row ->> 'ingestion_source',
                ''
              ) <> 'api'
           or btrim(row.row_key) = ''
      )::bigint as canonical_mismatch_rows,
      count(*) filter (
        where not coalesce(
          (
            (
              row.row ->> 'row_level' = 'keyword'
              and row.row ->> 'data_level' = 'keyword'
              and row.row ->> 'row_level_reason' =
                  'naver_searchad_registered_keyword_daily_stats'
            )
            or
            (
              row.row ->> 'row_level' = 'creative'
              and row.row ->> 'data_level' = 'creative'
              and row.row ->> 'row_level_reason' =
                  'naver_searchad_shopping_ad_daily_stats'
            )
            or
            (
              row.row ->> 'row_level' = 'mixed'
              and row.row ->> 'data_level' = 'mixed'
              and row.row ->> 'row_level_reason' =
                  'naver_searchad_brand_search_adgroup_daily_stats'
            )
          ),
          false
        )
      )::bigint as invalid_grain_rows,
      count(*) filter (
        where row.row ->> 'row_level' = 'keyword'
          and row.row ->> 'data_level' = 'keyword'
          and row.row ->> 'row_level_reason' =
              'naver_searchad_registered_keyword_daily_stats'
          and row.row #>> '{provider_meta,campaign_type}' =
              'BRAND_SEARCH'
          and exists (
            select 1
            from mixed_campaigns as mixed_campaign
            where mixed_campaign.campaign_id =
              nullif(
                btrim(row.row ->> 'external_campaign_id'),
                ''
              )
          )
      )::bigint as overlap_rows,
      coalesce(
        sum(
          case
            when jsonb_typeof(row.row -> 'impressions') = 'number'
            then (row.row ->> 'impressions')::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as impressions,
      coalesce(
        sum(
          case
            when jsonb_typeof(row.row -> 'clicks') = 'number'
            then (row.row ->> 'clicks')::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as clicks,
      coalesce(
        sum(
          case
            when jsonb_typeof(row.row -> 'cost') = 'number'
            then (row.row ->> 'cost')::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as cost,
      coalesce(
        sum(
          case
            when jsonb_typeof(row.row -> 'conversions') = 'number'
            then (row.row ->> 'conversions')::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as conversions,
      coalesce(
        sum(
          case
            when jsonb_typeof(row.row -> 'revenue') = 'number'
            then (row.row ->> 'revenue')::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as revenue,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
            coalesce(
              string_agg(
                row.row_index::text || ':' ||
                row.row_fingerprint,
                E'\n'
                order by row.row_index
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as block_digest
    from public.media_sync_staging_rows as row
    where row.job_id = v_expected_candidate_job_id
    group by
      (
        row.row_index /
        v_fingerprint_block_size
      )::bigint
  ),
  candidate_summary as (
    select
      coalesce(sum(block.block_rows), 0)::bigint as candidate_rows,
      min(block.block_min_row_index)::bigint as min_row_index,
      max(block.block_max_row_index)::bigint as max_row_index,
      coalesce(sum(block.keyword_rows), 0)::bigint as keyword_rows,
      coalesce(sum(block.creative_rows), 0)::bigint as creative_rows,
      coalesce(sum(block.mixed_rows), 0)::bigint as mixed_rows,
      coalesce(sum(block.invalid_fingerprint_rows), 0)::bigint
        as invalid_fingerprint_rows,
      coalesce(sum(block.scope_mismatch_rows), 0)::bigint
        as scope_mismatch_rows,
      coalesce(sum(block.canonical_mismatch_rows), 0)::bigint
        as canonical_mismatch_rows,
      coalesce(sum(block.invalid_grain_rows), 0)::bigint
        as invalid_grain_rows,
      coalesce(sum(block.overlap_rows), 0)::bigint as overlap_rows,
      coalesce(sum(block.impressions), 0::numeric) as impressions,
      coalesce(sum(block.clicks), 0::numeric) as clicks,
      coalesce(sum(block.cost), 0::numeric) as cost,
      coalesce(sum(block.conversions), 0::numeric) as conversions,
      coalesce(sum(block.revenue), 0::numeric) as revenue,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
            'chunked_sha256_v1:block_size=10000' ||
            E'\n' ||
            coalesce(
              string_agg(
                block.block_index::text || ':' ||
                block.block_rows::text || ':' ||
                block.block_min_row_index::text || ':' ||
                block.block_max_row_index::text || ':' ||
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
      ) as candidate_fingerprint
    from candidate_blocks as block
  )
  select
    summary.candidate_rows,
    summary.min_row_index,
    summary.max_row_index,
    summary.keyword_rows,
    summary.creative_rows,
    summary.mixed_rows,
    summary.invalid_fingerprint_rows,
    summary.scope_mismatch_rows,
    summary.canonical_mismatch_rows,
    summary.invalid_grain_rows,
    summary.overlap_rows,
    summary.impressions,
    summary.clicks,
    summary.cost,
    summary.conversions,
    summary.revenue,
    summary.candidate_fingerprint
  into
    v_candidate_rows,
    v_candidate_min_row_index,
    v_candidate_max_row_index,
    v_candidate_keyword_rows,
    v_candidate_creative_rows,
    v_candidate_mixed_rows,
    v_candidate_invalid_fingerprint_rows,
    v_candidate_scope_mismatch_rows,
    v_candidate_canonical_mismatch_rows,
    v_candidate_invalid_grain_rows,
    v_candidate_overlap_rows,
    v_candidate_impressions,
    v_candidate_clicks,
    v_candidate_cost,
    v_candidate_conversions,
    v_candidate_revenue,
    v_candidate_fingerprint
  from candidate_summary as summary;

  select
    count(distinct row.row_index)::bigint,
    count(
      distinct (
        row.date_window_index,
        row.row_key
      )
    )::bigint
  into
    v_candidate_distinct_row_indexes,
    v_candidate_distinct_window_row_keys
  from public.media_sync_staging_rows as row
  where row.job_id = v_expected_candidate_job_id;

  if v_candidate_rows <> v_expected_candidate_rows
     or v_candidate_min_row_index <> 0
     or v_candidate_max_row_index <> v_expected_candidate_rows - 1
     or v_candidate_distinct_row_indexes <> v_expected_candidate_rows
     or v_candidate_distinct_window_row_keys <> v_expected_candidate_rows
     or v_candidate_keyword_rows <> v_expected_keyword_rows
     or v_candidate_creative_rows <> v_expected_creative_rows
     or v_candidate_mixed_rows <> v_expected_mixed_rows
     or v_candidate_invalid_fingerprint_rows <> 0
     or v_candidate_scope_mismatch_rows <> 0
     or v_candidate_canonical_mismatch_rows <> 0
     or v_candidate_invalid_grain_rows <> 0
     or v_candidate_overlap_rows <> 0
     or v_candidate_impressions <> v_expected_impressions
     or v_candidate_clicks <> v_expected_clicks
     or v_candidate_cost <> v_expected_cost
     or v_candidate_conversions <> v_expected_conversions
     or v_candidate_revenue <> v_expected_revenue
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_STAGING_CONTRACT_MISMATCH';
  end if;

  if v_candidate_fingerprint is distinct from
       v_expected_staging_fingerprint
     or v_recovery ->> 'repair_repaired_staging_fingerprint' is distinct from
        v_candidate_fingerprint
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_STAGING_FINGERPRINT_MISMATCH';
  end if;

  select
    count(*)::bigint,
    min(row.row_index)::bigint,
    max(row.row_index)::bigint,
    count(distinct row.row_index)::bigint,
    count(
      distinct (
        row.date_window_index,
        row.row_key
      )
    )::bigint,
    count(*) filter (
      where row.row_fingerprint is null
         or row.row_fingerprint !~ '^[0-9a-f]{64}$'
         or row.row is null
         or row.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(
                  row.row::text,
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            )
    )::bigint,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
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
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_source_rows,
    v_source_min_row_index,
    v_source_max_row_index,
    v_source_distinct_row_indexes,
    v_source_distinct_window_row_keys,
    v_source_invalid_fingerprint_rows,
    v_source_identity_digest
  from public.media_sync_staging_rows as row
  where row.job_id = v_expected_source_job_id;

  if v_source_rows <> v_expected_source_staging_rows
     or v_source_min_row_index <> 0
     or v_source_max_row_index <> v_expected_source_staging_rows - 1
     or v_source_distinct_row_indexes <> v_expected_source_staging_rows
     or v_source_distinct_window_row_keys <>
        v_expected_source_staging_rows
     or v_source_invalid_fingerprint_rows <> 0
     or v_source_identity_digest is distinct from
        v_expected_source_identity_digest
     or v_recovery ->> 'source_identity_digest' is distinct from
        v_source_identity_digest
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_SOURCE_STAGING_MISMATCH';
  end if;

  v_recalculated_confirmation_token :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'version=2' || E'\n' ||
          'candidate_job_id=' ||
            v_candidate.id::text || E'\n' ||
          'source_job_id=' ||
            v_expected_source_job_id::text || E'\n' ||
          'expected_candidate_updated_at=' ||
            (to_jsonb(v_candidate.updated_at) #>> '{}') || E'\n' ||
          'report_id=' ||
            v_expected_report_id::text || E'\n' ||
          'workspace_id=' ||
            v_expected_workspace_id::text || E'\n' ||
          'advertiser_id=' ||
            v_expected_advertiser_id::text || E'\n' ||
          'connection_id=' ||
            v_expected_connection_id::text || E'\n' ||
          'current_ingestion_id=' ||
            v_expected_current_ingestion_id::text || E'\n' ||
          'published_ingestion_id=' ||
            v_expected_published_ingestion_id::text || E'\n' ||
          'checkpoint_phase=completed' || E'\n' ||
          'checkpoint_next_row_index=' ||
            v_expected_candidate_rows::text || E'\n' ||
          'candidate_rows=' ||
            v_candidate_rows::text || E'\n' ||
          'source_rows=' ||
            v_source_rows::text || E'\n' ||
          'source_identity_digest=' ||
            v_source_identity_digest || E'\n' ||
          'repair_kind=brand_search_cross_grain_dedup_v1' || E'\n' ||
          'repair_source_rows=' ||
            v_expected_original_candidate_rows::text || E'\n' ||
          'repair_excluded_rows=' ||
            v_expected_excluded_rows::text || E'\n' ||
          'repaired_staging_fingerprint=' ||
            v_candidate_fingerprint || E'\n' ||
          'total_report_rows=' ||
            v_expected_total_report_rows_for_token::text || E'\n' ||
          'current_report_rows=' ||
            v_expected_current_descriptor_rows::text || E'\n' ||
          'published_report_rows=' ||
            v_expected_published_descriptor_rows::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_recalculated_confirmation_token is distinct from
       v_expected_confirmation_token
     or v_recovery ->> 'confirmation_token' is distinct from
        v_recalculated_confirmation_token
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_CONFIRMATION_TOKEN_MISMATCH';
  end if;

  select
    count(ingestion.id)::bigint,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
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
            ) filter (
              where ingestion.id is not null
            ),
            '[]'::jsonb
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    max(ingestion.row_count) filter (
      where ingestion.id = v_expected_current_ingestion_id
    )::bigint,
    max(ingestion.status) filter (
      where ingestion.id = v_expected_current_ingestion_id
    ),
    max(ingestion.row_count) filter (
      where ingestion.id = v_expected_published_ingestion_id
    )::bigint,
    max(ingestion.status) filter (
      where ingestion.id = v_expected_published_ingestion_id
    )
  into
    v_report_ingestions_count,
    v_report_ingestions_descriptor_digest,
    v_current_descriptor_rows,
    v_current_descriptor_status,
    v_published_descriptor_rows,
    v_published_descriptor_status
  from public.report_ingestions as ingestion
  where ingestion.report_id = v_expected_report_id;

  if v_report_ingestions_count <> v_expected_report_ingestions_count
     or v_report_ingestions_descriptor_digest is distinct from
        v_expected_report_ingestions_descriptor_digest
     or v_current_descriptor_rows <> v_expected_current_descriptor_rows
     or v_current_descriptor_status is distinct from 'success'
     or v_published_descriptor_rows <>
        v_expected_published_descriptor_rows
     or v_published_descriptor_status is distinct from 'success'
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_REPORT_INGESTIONS_DESCRIPTOR_MISMATCH';
  end if;

  select
    count(row.id)::bigint,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              row.row::text || E'\n',
              ''
              order by row.row_index, row.id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_current_sentinel_count,
    v_current_sentinel_digest
  from public.report_rows as row
  where row.report_id = v_expected_report_id
    and row.ingestion_id = v_expected_current_ingestion_id
    and row.row_index in (0, 58, 117);

  select
    count(row.id)::bigint,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              row.row::text || E'\n',
              ''
              order by row.row_index, row.id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_published_sentinel_count,
    v_published_sentinel_digest
  from public.report_rows as row
  where row.report_id = v_expected_report_id
    and row.ingestion_id = v_expected_published_ingestion_id
    and row.row_index in (0, 22256, 44513);

  if v_current_sentinel_count <> 3
     or v_current_sentinel_digest is distinct from
        v_expected_current_canonical_sentinel_digest
     or v_published_sentinel_count <> 3
     or v_published_sentinel_digest is distinct from
        v_expected_published_canonical_sentinel_digest
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_CANONICAL_SENTINEL_MISMATCH';
  end if;

  /* Re-check the active queue immediately before the one allowed UPDATE. */
  select count(job.id)::bigint
  into v_active_job_count
  from public.media_sync_jobs as job
  where job.report_id = v_expected_report_id
    and job.status in ('pending', 'processing');

  if v_active_job_count <> 0 then
    raise exception using
      errcode = '55000',
      message = 'EMC_ACTIVE_JOB_EXISTS';
  end if;

  v_error_detail_before :=
    v_candidate.error_detail;
  v_now :=
    statement_timestamp();

  begin
    update public.media_sync_jobs as job
    set
      status = 'processing',
      started_at = v_now,
      finished_at = null,
      updated_at = v_now,
      error = null,
      snapshot_ingestion_id = null
    where job.id = v_expected_candidate_job_id
      and job.status = 'cancelled'
      and job.updated_at = v_expected_candidate_updated_at
      and job.progress = 99
      and job.attempt_count = v_expected_attempt_count
      and job.started_at is null
      and job.finished_at is null
      and job.snapshot_ingestion_id is null
      and job.error is null
      and job.error_detail is not distinct from v_error_detail_before
    returning job.*
    into v_claimed;
  exception
    when unique_violation then
      raise exception using
        errcode = '55000',
        message = 'EMC_ACTIVE_JOB_EXISTS';
  end;

  if v_claimed.id is null then
    raise exception using
      errcode = '55000',
      message = 'EMC_JOB_STATE_CHANGED';
  end if;

  if v_claimed.id is distinct from v_candidate.id
     or v_claimed.workspace_id is distinct from v_candidate.workspace_id
     or v_claimed.advertiser_id is distinct from v_candidate.advertiser_id
     or v_claimed.report_id is distinct from v_candidate.report_id
     or v_claimed.connection_id is distinct from v_candidate.connection_id
     or v_claimed.provider is distinct from v_candidate.provider
     or v_claimed.external_account_id is distinct from
        v_candidate.external_account_id
     or v_claimed.date_from is distinct from v_candidate.date_from
     or v_claimed.date_to is distinct from v_candidate.date_to
     or v_claimed.data_level is distinct from v_candidate.data_level
     or v_claimed.mode is distinct from v_candidate.mode
     or v_claimed.progress is distinct from v_candidate.progress
     or v_claimed.raw_rows is distinct from v_candidate.raw_rows
     or v_claimed.normalized_rows is distinct from v_candidate.normalized_rows
     or v_claimed.inserted_rows is distinct from v_candidate.inserted_rows
     or v_claimed.failed_rows is distinct from v_candidate.failed_rows
     or v_claimed.previous_ingestion_id is distinct from
        v_candidate.previous_ingestion_id
     or v_claimed.snapshot_ingestion_id is not null
     or v_claimed.attempt_count is distinct from v_candidate.attempt_count
     or v_claimed.error is not null
     or v_claimed.error_detail is distinct from v_error_detail_before
     or v_claimed.created_by is distinct from v_candidate.created_by
     or v_claimed.created_at is distinct from v_candidate.created_at
     or v_claimed.status is distinct from 'processing'
     or v_claimed.started_at is distinct from v_now
     or v_claimed.finished_at is not null
     or v_claimed.updated_at is distinct from v_now
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_LIFECYCLE_TRANSITION_MISMATCH';
  end if;

  select count(job.id)::bigint
  into v_active_job_count
  from public.media_sync_jobs as job
  where job.report_id = v_expected_report_id
    and job.status in ('pending', 'processing');

  if v_active_job_count <> 1
     or not exists (
       select 1
       from public.media_sync_jobs as job
       where job.id = v_expected_candidate_job_id
         and job.report_id = v_expected_report_id
         and job.status = 'processing'
     )
  then
    raise exception using
      errcode = '55000',
      message = 'EMC_POST_CLAIM_ACTIVE_SCOPE_MISMATCH';
  end if;

  return next v_claimed;
  return;
end;
$$;

revoke all on function
  public.claim_exact_naver_production_recovery_materialization_candidate(
    uuid,
    uuid,
    timestamptz,
    text,
    text,
    uuid,
    uuid
  )
from public;

revoke all on function
  public.claim_exact_naver_production_recovery_materialization_candidate(
    uuid,
    uuid,
    timestamptz,
    text,
    text,
    uuid,
    uuid
  )
from anon;

revoke all on function
  public.claim_exact_naver_production_recovery_materialization_candidate(
    uuid,
    uuid,
    timestamptz,
    text,
    text,
    uuid,
    uuid
  )
from authenticated;

grant execute on function
  public.claim_exact_naver_production_recovery_materialization_candidate(
    uuid,
    uuid,
    timestamptz,
    text,
    text,
    uuid,
    uuid
  )
to service_role;