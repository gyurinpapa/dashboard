-- QUERY NAME:
-- create-prepare-exact-naver-brand-search-stale-reconciliation-recovery-candidate

begin;

/*
 * Etrylue Performance
 * Exact Naver BRAND_SEARCH stale-reconciliation recovery candidate preparation RPC
 *
 * Exact production source:
 * - source job: 7ef7b4ee-7786-4695-af1c-abb0f75fd553
 * - source staging: 45,844 contiguous rows
 * - failure boundary: STALE_PROCESSING_JOB / automatic stale recovery
 * - report pointers remain split: current 415e51eb-18b1-43d7-a4e6-6fabb5868792
 *   / published 4fa4e562-aa61-4178-9c27-fca63657b5ac
 *
 * Purpose:
 * - Revalidate the fixed failed source job and all 45,844 source staging rows.
 * - Recalculate the exact BRAND_SEARCH reconciliation preconditions without
 *   mutating the source.
 * - Create one isolated cancelled candidate and copy all 45,844 source rows in
 *   the same transaction.
 * - Seed a completed combined checkpoint immediately before reconciliation.
 *
 * Safety boundary:
 * - Never updates the source job.
 * - Never updates or deletes source staging.
 * - Never changes reports pointers or report_rows.
 * - Never calls claim, reconciliation, materialization, activation,
 *   finalization, or publish RPCs.
 * - Any failed assertion rolls back both the candidate job and copied rows.
 */

-- PostgreSQL identifiers are limited to 63 bytes.
-- Remove the accidentally truncated first deployment before creating the
-- corrected, stable RPC name below.
drop function if exists public.prepare_exact_naver_brand_search_stale_reconciliation_recovery_(jsonb);

create or replace function public.prepare_exact_naver_brand_search_stale_recovery_candidate(
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

  source_rows bigint,
  candidate_rows bigint,
  excluded_rows bigint,
  retained_rows bigint,
  reindex_required_rows bigint,
  mixed_campaign_count bigint,
  matched_campaign_count bigint,

  source_identity_digest text,
  candidate_identity_digest text,
  confirmation_token text,

  current_ingestion_id uuid,
  published_ingestion_id uuid,

  candidate_phase text,
  candidate_next_row_index bigint,

  source_unchanged boolean,
  report_pointers_unchanged boolean,
  candidate_ready_for_reconciliation boolean,
  candidate_claimed boolean,
  reconciliation_called boolean,
  materialization_called boolean,
  activation_called boolean,
  finalization_called boolean,
  publish_called boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
set statement_timeout to '60s'
as $function$
declare
  v_preparation_kind constant text :=
    'exact_naver_brand_search_stale_reconciliation_recovery_v1';
  v_preparation_version constant integer := 1;
  v_identity_algorithm constant text :=
    'chunked_sha256_v1:block_size=10000';
  v_identity_block_size constant bigint := 10000;

  v_expected_source_job_id constant uuid :=
    '7ef7b4ee-7786-4695-af1c-abb0f75fd553';
  v_expected_source_job_created_at constant timestamptz :=
    '2026-08-02 14:10:37.410403+00';
  v_expected_source_job_started_at constant timestamptz :=
    '2026-08-02 18:44:11.206135+00';
  v_expected_source_job_updated_at constant timestamptz :=
    '2026-08-02 19:44:11.627+00';
  v_expected_source_job_finished_at constant timestamptz :=
    '2026-08-02 19:44:11.627+00';

  v_expected_report_id constant uuid :=
    'ea413950-4068-41e8-9ced-8355020d7e7d';
  v_expected_workspace_id constant uuid :=
    '27b1556f-9d42-496f-bd7e-5a59ebee71d4';
  v_expected_advertiser_id constant uuid :=
    'da51e71a-01ce-42fb-a937-7af0b5f47786';
  v_expected_connection_id constant uuid :=
    'aba7d28f-ec85-49db-941a-fa5babe2af61';
  v_expected_external_account_id constant text :=
    '703575';

  v_expected_date_from constant date :=
    '2026-05-01';
  v_expected_date_to constant date :=
    '2026-05-02';

  v_expected_current_ingestion_id constant uuid :=
    '415e51eb-18b1-43d7-a4e6-6fabb5868792';
  v_expected_published_ingestion_id constant uuid :=
    '4fa4e562-aa61-4178-9c27-fca63657b5ac';
  v_expected_report_updated_at constant timestamptz :=
    '2026-08-02 13:58:52.559392+00';

  v_expected_attempt_count constant bigint := 469;
  v_expected_source_rows constant bigint := 45844;
  v_expected_excluded_rows constant bigint := 1204;
  v_expected_retained_rows constant bigint := 44640;
  v_expected_reindex_required_rows constant bigint := 1330;
  v_expected_mixed_campaign_count constant bigint := 5;
  v_expected_matched_campaign_count constant bigint := 3;

  v_expected_excluded_min_row_index constant bigint := 43310;
  v_expected_excluded_max_row_index constant bigint := 44513;
  v_expected_reindex_min_old_row_index constant bigint := 44514;
  v_expected_reindex_max_old_row_index constant bigint := 45843;

  v_expected_excluded_impressions constant numeric := 2632;
  v_expected_excluded_clicks constant numeric := 1092;
  v_expected_excluded_cost constant numeric := 0;
  v_expected_excluded_conversions constant numeric := 65;
  v_expected_excluded_revenue constant numeric := 7639300;

  v_expected_source_identity_digest constant text :=
    '3b28ccb42d52dcde46b9da44bb8043573b8966b6ecdd3a7a0655d0ac88dfef49';
  v_expected_source_error_detail_digest constant text :=
    '4413183c727a9919f25b8da09d3f3991fb69c3cd0e5b7e6b53da25711ba790c1';
  v_expected_confirmation_token constant text :=
    '97284ee9d16df6415c7fba27cb8da05dec4f0b98c2c567dae7bd297fbfa4d92d';

  v_supplied_source_identity_digest text;
  v_supplied_confirmation_token text;
  v_recalculated_confirmation_token text;

  v_source_job public.media_sync_jobs%rowtype;
  v_source_job_after public.media_sync_jobs%rowtype;
  v_candidate_job public.media_sync_jobs%rowtype;
  v_candidate_job_after public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_report_after public.reports%rowtype;
  v_connection public.media_connections%rowtype;

  v_active_job_id uuid;
  v_existing_candidate_id uuid;
  v_candidate_id uuid;
  v_now timestamptz;

  v_source_rows bigint := 0;
  v_source_min_row_index bigint;
  v_source_max_row_index bigint;
  v_source_distinct_row_indexes bigint := 0;
  v_source_duplicate_row_indexes bigint := 0;
  v_source_distinct_window_row_keys bigint := 0;
  v_source_duplicate_window_row_keys bigint := 0;
  v_source_blank_row_key_rows bigint := 0;
  v_source_conflicting_row_keys bigint := 0;
  v_source_invalid_fingerprint_rows bigint := 0;
  v_source_scope_mismatch_rows bigint := 0;
  v_source_date_range_mismatch_rows bigint := 0;
  v_source_canonical_mismatch_rows bigint := 0;
  v_source_invalid_grain_rows bigint := 0;
  v_source_date_window_count bigint := 0;
  v_source_date_window_index bigint := 0;
  v_source_distinct_dates bigint := 0;
  v_source_keyword_entity_count bigint := 0;
  v_source_authoritative_entity_count bigint := 0;

  v_source_identity_digest text;
  v_source_error_detail_digest text;
  v_source_post_rows bigint := 0;
  v_source_post_identity_digest text;

  v_excluded_rows bigint := 0;
  v_retained_rows bigint := 0;
  v_reindex_required_rows bigint := 0;
  v_mixed_campaign_count bigint := 0;
  v_matched_campaign_count bigint := 0;
  v_excluded_min_row_index bigint;
  v_excluded_max_row_index bigint;
  v_reindex_min_old_row_index bigint;
  v_reindex_max_old_row_index bigint;
  v_excluded_impressions numeric := 0;
  v_excluded_clicks numeric := 0;
  v_excluded_cost numeric := 0;
  v_excluded_conversions numeric := 0;
  v_excluded_revenue numeric := 0;

  v_candidate_rows bigint := 0;
  v_candidate_min_row_index bigint;
  v_candidate_max_row_index bigint;
  v_candidate_distinct_row_indexes bigint := 0;
  v_candidate_distinct_window_row_keys bigint := 0;
  v_candidate_exact_mismatch_rows bigint := 0;
  v_candidate_identity_digest text;

  v_recovery jsonb;
  v_processing_checkpoint jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_INVALID_INPUT';
  end if;

  begin
    v_supplied_source_identity_digest :=
      lower(
        nullif(
          btrim(
            p_payload ->> 'expected_source_identity_digest'
          ),
          ''
        )
      );

    v_supplied_confirmation_token :=
      lower(
        nullif(
          btrim(
            p_payload ->> 'confirmation_token'
          ),
          ''
        )
      );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'ENBGSR_INVALID_INPUT';
  end;

  if v_supplied_source_identity_digest is null
     or v_supplied_source_identity_digest !~ '^[0-9a-f]{64}$'
     or v_supplied_confirmation_token is null
     or v_supplied_confirmation_token !~ '^[0-9a-f]{64}$'
     or (
       select count(*)
       from jsonb_object_keys(p_payload)
     ) <> 2
     or not (p_payload ? 'expected_source_identity_digest')
     or not (p_payload ? 'confirmation_token')
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_INVALID_INPUT';
  end if;

  if v_supplied_source_identity_digest is distinct from
       v_expected_source_identity_digest
     or v_supplied_confirmation_token is distinct from
       v_expected_confirmation_token
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_EXACT_CONFIRMATION_INPUT_MISMATCH';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_preparation_kind || ':' ||
      v_expected_report_id::text || ':' ||
      v_expected_source_job_id::text,
      0
    )
  );

  select job.*
  into v_source_job
  from public.media_sync_jobs as job
  where job.id = v_expected_source_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_SOURCE_JOB_NOT_FOUND';
  end if;

  if v_source_job.id is distinct from v_expected_source_job_id
     or v_source_job.report_id is distinct from v_expected_report_id
     or v_source_job.workspace_id is distinct from v_expected_workspace_id
     or v_source_job.advertiser_id is distinct from v_expected_advertiser_id
     or v_source_job.connection_id is distinct from v_expected_connection_id
     or v_source_job.provider is distinct from 'naver_searchad'
     or v_source_job.external_account_id is distinct from
        v_expected_external_account_id
     or v_source_job.date_from is distinct from v_expected_date_from
     or v_source_job.date_to is distinct from v_expected_date_to
     or v_source_job.mode is distinct from 'snapshot_replace'
     or v_source_job.created_at is distinct from
        v_expected_source_job_created_at
     or v_source_job.started_at is distinct from
        v_expected_source_job_started_at
     or v_source_job.updated_at is distinct from
        v_expected_source_job_updated_at
     or v_source_job.finished_at is distinct from
        v_expected_source_job_finished_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_SOURCE_SCOPE_OR_TIMESTAMP_MISMATCH';
  end if;

  if v_source_job.status is distinct from 'failed'
     or v_source_job.progress is distinct from 0
     or v_source_job.attempt_count is distinct from
        v_expected_attempt_count
     or v_source_job.raw_rows is distinct from
        v_expected_source_rows
     or v_source_job.normalized_rows is distinct from
        v_expected_source_rows
     or v_source_job.inserted_rows is distinct from
        v_expected_source_rows
     or v_source_job.failed_rows is distinct from 0
     or v_source_job.snapshot_ingestion_id is not null
     or v_source_job.error is distinct from 'STALE_PROCESSING_JOB'
     or v_source_job.error_detail is null
     or jsonb_typeof(v_source_job.error_detail) <> 'object'
     or v_source_job.error_detail ->> 'code' is distinct from
        'STALE_PROCESSING_JOB'
     or v_source_job.error_detail ->> 'stage' is distinct from
        'stale_recovery'
     or v_source_job.error_detail ->> 'source' is distinct from
        'automatic_recovery'
     or v_source_job.error_detail ->> 'message' is distinct from
        'Media sync processing job exceeded the stale processing threshold and was recovered automatically.'
     or v_source_job.error_detail ->> 'stale_ms' is distinct from
        '3600000'
     or v_source_job.error_detail ->> 'cutoff' is distinct from
        '2026-08-02T18:44:11.465Z'
     or v_source_job.error_detail ->> 'recovered_at' is distinct from
        '2026-08-02T19:44:11.627Z'
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_SOURCE_FAILURE_CONTRACT_MISMATCH';
  end if;

  v_source_error_detail_digest :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_source_job.error_detail::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_source_error_detail_digest is distinct from
       v_expected_source_error_detail_digest
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_SOURCE_ERROR_DETAIL_DIGEST_MISMATCH';
  end if;

  select report.*
  into v_report
  from public.reports as report
  where report.id = v_expected_report_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_REPORT_NOT_FOUND';
  end if;

  if v_report.workspace_id is distinct from v_expected_workspace_id
     or v_report.advertiser_id is distinct from v_expected_advertiser_id
     or v_report.current_ingestion_id is distinct from
        v_expected_current_ingestion_id
     or v_report.published_ingestion_id is distinct from
        v_expected_published_ingestion_id
     or v_report.updated_at is distinct from v_expected_report_updated_at
     or v_source_job.previous_ingestion_id is distinct from
        v_report.current_ingestion_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_REPORT_STATE_MISMATCH';
  end if;

  select connection.*
  into v_connection
  from public.media_connections as connection
  where connection.id = v_expected_connection_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_CONNECTION_NOT_FOUND';
  end if;

  if v_connection.workspace_id is distinct from v_expected_workspace_id
     or v_connection.advertiser_id is distinct from
        v_expected_advertiser_id
     or v_connection.provider is distinct from 'naver_searchad'
     or v_connection.external_account_id is distinct from
        v_expected_external_account_id
     or v_connection.status is distinct from 'active'
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_CONNECTION_STATE_MISMATCH';
  end if;

  select active_job.id
  into v_active_job_id
  from public.media_sync_jobs as active_job
  where active_job.report_id = v_expected_report_id
    and active_job.status in ('pending', 'processing')
  order by active_job.created_at, active_job.id
  limit 1;

  if v_active_job_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_ACTIVE_JOB_EXISTS';
  end if;

  select candidate.id
  into v_existing_candidate_id
  from public.media_sync_jobs as candidate
  where candidate.report_id = v_expected_report_id
    and candidate.error_detail #>>
        '{processing_checkpoint,recovery,preparation_kind}' =
        v_preparation_kind
    and candidate.error_detail #>>
        '{processing_checkpoint,recovery,source_job_id}' =
        v_expected_source_job_id::text
  order by candidate.created_at, candidate.id
  limit 1;

  if v_existing_candidate_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_CANDIDATE_ALREADY_EXISTS';
  end if;

  perform 1
  from public.media_sync_staging_rows as source_row
  where source_row.job_id = v_expected_source_job_id
  order by source_row.row_index, source_row.row_key, source_row.id
  for share;

  begin
    with source_rows as materialized (
      select source_row.*
      from public.media_sync_staging_rows as source_row
      where source_row.job_id = v_expected_source_job_id
    ),
    conflicting_row_keys as (
      select count(*)::bigint as conflicting_row_keys
      from (
        select
          source_rows.date_window_index,
          source_rows.row_key
        from source_rows
        group by
          source_rows.date_window_index,
          source_rows.row_key
        having count(*) > 1
           or count(distinct source_rows.row_fingerprint) > 1
      ) as conflicts
    )
    select
      count(*)::bigint,
      min(source_rows.row_index)::bigint,
      max(source_rows.row_index)::bigint,
      count(distinct source_rows.row_index)::bigint,
      (
        count(*) - count(distinct source_rows.row_index)
      )::bigint,
      count(
        distinct (
          source_rows.date_window_index,
          source_rows.row_key
        )
      )::bigint,
      (
        count(*) -
        count(
          distinct (
            source_rows.date_window_index,
            source_rows.row_key
          )
        )
      )::bigint,
      count(*) filter (
        where source_rows.row_key is null
           or btrim(source_rows.row_key) = ''
      )::bigint,
      (
        select conflicting_row_keys
        from conflicting_row_keys
      ),
      count(*) filter (
        where source_rows.row_fingerprint is null
           or source_rows.row_fingerprint !~ '^[0-9a-f]{64}$'
           or source_rows.row is null
           or source_rows.row_fingerprint is distinct from
              encode(
                extensions.digest(
                  pg_catalog.convert_to(
                    source_rows.row::text,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              )
      )::bigint,
      count(*) filter (
        where source_rows.report_id is distinct from
              v_expected_report_id
           or source_rows.workspace_id is distinct from
              v_expected_workspace_id
           or source_rows.advertiser_id is distinct from
              v_expected_advertiser_id
           or source_rows.connection_id is distinct from
              v_expected_connection_id
           or source_rows.provider is distinct from
              'naver_searchad'
           or source_rows.external_account_id is distinct from
              v_expected_external_account_id
           or source_rows.date_from is distinct from
              v_expected_date_from
           or source_rows.date_to is distinct from
              v_expected_date_to
      )::bigint,
      count(*) filter (
        where source_rows.date < v_expected_date_from
           or source_rows.date > v_expected_date_to
      )::bigint,
      count(*) filter (
        where jsonb_typeof(source_rows.row) <> 'object'
           or coalesce(source_rows.row ->> 'date', '') <>
              source_rows.date::text
           or coalesce(source_rows.row ->> 'report_date', '') <>
              source_rows.date::text
           or coalesce(source_rows.row ->> 'day', '') <>
              source_rows.date::text
           or coalesce(source_rows.row ->> 'ymd', '') <>
              source_rows.date::text
           or coalesce(source_rows.row ->> 'channel', '') <>
              coalesce(source_rows.channel, '')
           or coalesce(source_rows.row ->> 'device', '') <>
              coalesce(source_rows.device, '')
           or coalesce(source_rows.row ->> 'source', '') <>
              coalesce(source_rows.source, '')
           or coalesce(source_rows.row ->> 'provider', '') <>
              'naver_searchad'
           or coalesce(
                source_rows.row ->> 'external_account_id',
                ''
              ) <> v_expected_external_account_id
           or coalesce(
                source_rows.row ->> 'ingestion_source',
                ''
              ) <> 'api'
      )::bigint,
      count(*) filter (
        where not (
          (
            source_rows.row ->> 'row_level' = 'keyword'
            and source_rows.row ->> 'data_level' = 'keyword'
            and source_rows.row ->> 'row_level_reason' =
                'naver_searchad_registered_keyword_daily_stats'
          )
          or (
            source_rows.row ->> 'row_level' = 'creative'
            and source_rows.row ->> 'data_level' = 'creative'
            and source_rows.row ->> 'row_level_reason' =
                'naver_searchad_shopping_ad_daily_stats'
          )
          or (
            source_rows.row ->> 'row_level' = 'mixed'
            and source_rows.row ->> 'data_level' = 'mixed'
            and source_rows.row ->> 'row_level_reason' =
                'naver_searchad_brand_search_adgroup_daily_stats'
          )
        )
      )::bigint,
      count(distinct source_rows.date_window_index)::bigint,
      min(source_rows.date_window_index)::bigint,
      count(distinct source_rows.date)::bigint,
      count(
        distinct jsonb_build_array(
          source_rows.row ->> 'row_level_reason',
          source_rows.row ->> 'external_campaign_id',
          source_rows.row ->> 'external_group_id',
          source_rows.row ->> 'external_keyword_id'
        )::text
      ) filter (
        where source_rows.row ->> 'row_level' = 'keyword'
      )::bigint,
      count(
        distinct jsonb_build_array(
          source_rows.row ->> 'row_level_reason',
          source_rows.row ->> 'external_campaign_id',
          source_rows.row ->> 'external_group_id',
          coalesce(
            source_rows.row ->> 'external_creative_id',
            source_rows.row ->> 'external_ad_id',
            ''
          ),
          source_rows.row #>>
            '{provider_meta,authoritative_grain}'
        )::text
      ) filter (
        where source_rows.row ->> 'row_level' in ('creative', 'mixed')
      )::bigint
    into
      v_source_rows,
      v_source_min_row_index,
      v_source_max_row_index,
      v_source_distinct_row_indexes,
      v_source_duplicate_row_indexes,
      v_source_distinct_window_row_keys,
      v_source_duplicate_window_row_keys,
      v_source_blank_row_key_rows,
      v_source_conflicting_row_keys,
      v_source_invalid_fingerprint_rows,
      v_source_scope_mismatch_rows,
      v_source_date_range_mismatch_rows,
      v_source_canonical_mismatch_rows,
      v_source_invalid_grain_rows,
      v_source_date_window_count,
      v_source_date_window_index,
      v_source_distinct_dates,
      v_source_keyword_entity_count,
      v_source_authoritative_entity_count
    from source_rows;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'ENBGSR_SOURCE_STAGING_SCAN_FAILED';
  end;

  if v_source_rows <> v_expected_source_rows
     or v_source_min_row_index <> 0
     or v_source_max_row_index <> v_expected_source_rows - 1
     or v_source_distinct_row_indexes <> v_expected_source_rows
     or v_source_duplicate_row_indexes <> 0
     or v_source_distinct_window_row_keys <> v_expected_source_rows
     or v_source_duplicate_window_row_keys <> 0
     or v_source_blank_row_key_rows <> 0
     or v_source_conflicting_row_keys <> 0
     or v_source_invalid_fingerprint_rows <> 0
     or v_source_scope_mismatch_rows <> 0
     or v_source_date_range_mismatch_rows <> 0
     or v_source_canonical_mismatch_rows <> 0
     or v_source_invalid_grain_rows <> 0
     or v_source_date_window_count <> 1
     or v_source_date_window_index is null
     or v_source_distinct_dates <> 2
     or v_source_keyword_entity_count <= 0
     or v_source_authoritative_entity_count <= 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_SOURCE_STAGING_CONTRACT_MISMATCH';
  end if;

  drop table if exists pg_temp.enbgr_mixed_campaigns;
  drop table if exists pg_temp.enbgr_row_map;

  create temporary table enbgr_mixed_campaigns
  on commit drop
  as
  select distinct
    nullif(
      btrim(
        source_row.row ->> 'external_campaign_id'
      ),
      ''
    ) as campaign_id
  from public.media_sync_staging_rows as source_row
  where source_row.job_id = v_expected_source_job_id
    and source_row.row ->> 'row_level' = 'mixed'
    and source_row.row ->> 'data_level' = 'mixed'
    and source_row.row ->> 'row_level_reason' =
        'naver_searchad_brand_search_adgroup_daily_stats'
    and source_row.row #>> '{provider_meta,campaign_type}' =
        'BRAND_SEARCH'
    and source_row.row #>> '{provider_meta,authoritative_grain}' =
        'adgroup'
    and nullif(
          btrim(
            source_row.row ->> 'external_campaign_id'
          ),
          ''
        ) is not null;

  select count(*)::bigint
  into v_mixed_campaign_count
  from pg_temp.enbgr_mixed_campaigns;

  create temporary table enbgr_row_map
  on commit drop
  as
  with classified as (
    select
      source_row.id as staging_id,
      source_row.row_index as old_row_index,
      source_row.row_key,
      source_row.row_fingerprint,
      source_row.date_window_index,
      nullif(
        btrim(
          source_row.row ->> 'external_campaign_id'
        ),
        ''
      ) as campaign_id,
      source_row.row,
      (
        source_row.row ->> 'row_level' = 'keyword'
        and source_row.row ->> 'data_level' = 'keyword'
        and source_row.row ->> 'row_level_reason' =
            'naver_searchad_registered_keyword_daily_stats'
        and source_row.row #>> '{provider_meta,campaign_type}' =
            'BRAND_SEARCH'
        and exists (
          select 1
          from pg_temp.enbgr_mixed_campaigns as mixed_campaign
          where mixed_campaign.campaign_id =
            nullif(
              btrim(
                source_row.row ->> 'external_campaign_id'
              ),
              ''
            )
        )
      ) as excluded
    from public.media_sync_staging_rows as source_row
    where source_row.job_id = v_expected_source_job_id
  ),
  kept as (
    select
      classified.staging_id,
      (
        row_number() over (
          order by
            classified.old_row_index,
            classified.row_key,
            classified.staging_id
        ) - 1
      )::bigint as new_row_index
    from classified
    where not classified.excluded
  )
  select
    classified.staging_id,
    classified.old_row_index,
    classified.row_key,
    classified.row_fingerprint,
    classified.date_window_index,
    classified.campaign_id,
    classified.row,
    classified.excluded,
    kept.new_row_index
  from classified
  left join kept
    on kept.staging_id = classified.staging_id;

  begin
    select
      count(*) filter (
        where row_map.excluded
      )::bigint,
      count(*) filter (
        where not row_map.excluded
      )::bigint,
      count(*) filter (
        where not row_map.excluded
          and row_map.old_row_index is distinct from
              row_map.new_row_index
      )::bigint,
      count(distinct row_map.campaign_id) filter (
        where row_map.excluded
      )::bigint,
      min(row_map.old_row_index) filter (
        where row_map.excluded
      )::bigint,
      max(row_map.old_row_index) filter (
        where row_map.excluded
      )::bigint,
      min(row_map.old_row_index) filter (
        where not row_map.excluded
          and row_map.old_row_index is distinct from
              row_map.new_row_index
      )::bigint,
      max(row_map.old_row_index) filter (
        where not row_map.excluded
          and row_map.old_row_index is distinct from
              row_map.new_row_index
      )::bigint,
      coalesce(
        sum(
          coalesce(
            (row_map.row ->> 'impressions')::numeric,
            0
          )
        ) filter (
          where row_map.excluded
        ),
        0
      ),
      coalesce(
        sum(
          coalesce(
            (row_map.row ->> 'clicks')::numeric,
            0
          )
        ) filter (
          where row_map.excluded
        ),
        0
      ),
      coalesce(
        sum(
          coalesce(
            (row_map.row ->> 'cost')::numeric,
            0
          )
        ) filter (
          where row_map.excluded
        ),
        0
      ),
      coalesce(
        sum(
          coalesce(
            (row_map.row ->> 'conversions')::numeric,
            0
          )
        ) filter (
          where row_map.excluded
        ),
        0
      ),
      coalesce(
        sum(
          coalesce(
            (row_map.row ->> 'revenue')::numeric,
            0
          )
        ) filter (
          where row_map.excluded
        ),
        0
      )
    into
      v_excluded_rows,
      v_retained_rows,
      v_reindex_required_rows,
      v_matched_campaign_count,
      v_excluded_min_row_index,
      v_excluded_max_row_index,
      v_reindex_min_old_row_index,
      v_reindex_max_old_row_index,
      v_excluded_impressions,
      v_excluded_clicks,
      v_excluded_cost,
      v_excluded_conversions,
      v_excluded_revenue
    from pg_temp.enbgr_row_map as row_map;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'ENBGSR_RECONCILIATION_PRECOMPUTE_FAILED';
  end;

  if v_source_rows <> v_expected_source_rows
     or v_excluded_rows <> v_expected_excluded_rows
     or v_retained_rows <> v_expected_retained_rows
     or v_excluded_rows + v_retained_rows <> v_source_rows
     or v_reindex_required_rows <>
        v_expected_reindex_required_rows
     or v_mixed_campaign_count <>
        v_expected_mixed_campaign_count
     or v_matched_campaign_count <>
        v_expected_matched_campaign_count
     or v_excluded_min_row_index <>
        v_expected_excluded_min_row_index
     or v_excluded_max_row_index <>
        v_expected_excluded_max_row_index
     or v_reindex_min_old_row_index <>
        v_expected_reindex_min_old_row_index
     or v_reindex_max_old_row_index <>
        v_expected_reindex_max_old_row_index
     or v_excluded_impressions <>
        v_expected_excluded_impressions
     or v_excluded_clicks <>
        v_expected_excluded_clicks
     or v_excluded_cost <>
        v_expected_excluded_cost
     or v_excluded_conversions <>
        v_expected_excluded_conversions
     or v_excluded_revenue <>
        v_expected_excluded_revenue
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_RECONCILIATION_PRECOMPUTE_MISMATCH';
  end if;

  with identity_blocks as (
    select
      (
        source_row.row_index / v_identity_block_size
      )::bigint as block_index,
      count(*)::bigint as block_rows,
      min(source_row.row_index)::bigint as block_min_row_index,
      max(source_row.row_index)::bigint as block_max_row_index,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
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
                  source_row.row_index,
                  source_row.row_key,
                  source_row.id
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as block_digest
    from public.media_sync_staging_rows as source_row
    where source_row.job_id = v_expected_source_job_id
    group by (
      source_row.row_index / v_identity_block_size
    )::bigint
  )
  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_identity_algorithm || E'\n' ||
        coalesce(
          string_agg(
            identity_blocks.block_index::text || ':' ||
            identity_blocks.block_rows::text || ':' ||
            identity_blocks.block_min_row_index::text || ':' ||
            identity_blocks.block_max_row_index::text || ':' ||
            identity_blocks.block_digest,
            E'\n' order by identity_blocks.block_index
          ),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  into v_source_identity_digest
  from identity_blocks;

  if v_source_identity_digest is distinct from
       v_expected_source_identity_digest
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_SOURCE_IDENTITY_DIGEST_MISMATCH';
  end if;

  v_recalculated_confirmation_token :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'version=1' || E'\n' ||
          'preparation_kind=' || v_preparation_kind || E'\n' ||
          'source_job_id=' ||
            v_expected_source_job_id::text || E'\n' ||
          'source_created_at=' ||
            (to_jsonb(v_source_job.created_at) #>> '{}') || E'\n' ||
          'source_updated_at=' ||
            (to_jsonb(v_source_job.updated_at) #>> '{}') || E'\n' ||
          'source_finished_at=' ||
            (to_jsonb(v_source_job.finished_at) #>> '{}') || E'\n' ||
          'source_attempt_count=' ||
            v_source_job.attempt_count::text || E'\n' ||
          'source_error=' ||
            v_source_job.error || E'\n' ||
          'source_error_detail_digest=' ||
            v_source_error_detail_digest || E'\n' ||
          'report_id=' || v_expected_report_id::text || E'\n' ||
          'workspace_id=' || v_expected_workspace_id::text || E'\n' ||
          'advertiser_id=' || v_expected_advertiser_id::text || E'\n' ||
          'connection_id=' || v_expected_connection_id::text || E'\n' ||
          'external_account_id=' ||
            v_expected_external_account_id || E'\n' ||
          'date_from=' || v_expected_date_from::text || E'\n' ||
          'date_to=' || v_expected_date_to::text || E'\n' ||
          'current_ingestion_id=' ||
            v_expected_current_ingestion_id::text || E'\n' ||
          'published_ingestion_id=' ||
            v_expected_published_ingestion_id::text || E'\n' ||
          'report_updated_at=' ||
            (to_jsonb(v_report.updated_at) #>> '{}') || E'\n' ||
          'source_rows=' || v_expected_source_rows::text || E'\n' ||
          'excluded_rows=' || v_expected_excluded_rows::text || E'\n' ||
          'retained_rows=' || v_expected_retained_rows::text || E'\n' ||
          'reindex_required_rows=' ||
            v_expected_reindex_required_rows::text || E'\n' ||
          'mixed_campaign_count=' ||
            v_expected_mixed_campaign_count::text || E'\n' ||
          'matched_campaign_count=' ||
            v_expected_matched_campaign_count::text || E'\n' ||
          'excluded_impressions=' ||
            v_expected_excluded_impressions::text || E'\n' ||
          'excluded_clicks=' ||
            v_expected_excluded_clicks::text || E'\n' ||
          'excluded_cost=' ||
            v_expected_excluded_cost::text || E'\n' ||
          'excluded_conversions=' ||
            v_expected_excluded_conversions::text || E'\n' ||
          'excluded_revenue=' ||
            v_expected_excluded_revenue::text || E'\n' ||
          'identity_algorithm=' || v_identity_algorithm || E'\n' ||
          'source_identity_digest=' || v_source_identity_digest,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_recalculated_confirmation_token is distinct from
       v_expected_confirmation_token
     or v_recalculated_confirmation_token is distinct from
       v_supplied_confirmation_token
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_CONFIRMATION_TOKEN_MISMATCH';
  end if;

  v_now := pg_catalog.statement_timestamp();
  v_candidate_id := gen_random_uuid();

  v_recovery :=
    jsonb_build_object(
      'contract_version', 1,
      'preparation_kind', v_preparation_kind,
      'preparation_version', v_preparation_version,
      'source_job_id', v_source_job.id,
      'source_job_created_at', to_jsonb(v_source_job.created_at),
      'source_job_started_at', to_jsonb(v_source_job.started_at),
      'source_job_updated_at', to_jsonb(v_source_job.updated_at),
      'source_job_finished_at', to_jsonb(v_source_job.finished_at),
      'source_attempt_count', v_source_job.attempt_count,
      'source_status', v_source_job.status,
      'source_error', v_source_job.error,
      'source_error_detail_digest', v_source_error_detail_digest,
      'source_error_code', 'STALE_PROCESSING_JOB',
      'source_error_stage', 'stale_recovery',
      'source_error_source', 'automatic_recovery',
      'source_stale_ms', 3600000,
      'source_staging_rows', v_expected_source_rows,
      'source_min_row_index', 0,
      'source_max_row_index', v_expected_source_rows - 1,
      'source_identity_digest', v_source_identity_digest,
      'candidate_identity_digest', v_source_identity_digest,
      'identity_algorithm', v_identity_algorithm,
      'source_current_ingestion_id',
        v_expected_current_ingestion_id,
      'source_published_ingestion_id',
        v_expected_published_ingestion_id,
      'expected_source_rows', v_expected_source_rows,
      'expected_excluded_rows', v_expected_excluded_rows,
      'expected_retained_rows', v_expected_retained_rows,
      'expected_reindex_rows',
        v_expected_reindex_required_rows,
      'expected_mixed_campaign_count',
        v_expected_mixed_campaign_count,
      'expected_matched_campaign_count',
        v_expected_matched_campaign_count,
      'expected_excluded_metrics',
        jsonb_build_object(
          'impressions', v_expected_excluded_impressions,
          'clicks', v_expected_excluded_clicks,
          'cost', v_expected_excluded_cost,
          'conversions', v_expected_excluded_conversions,
          'revenue', v_expected_excluded_revenue
        ),
      'collector_counts_derived_from_staging', true,
      'request_counts_reconstructed', false,
      'confirmation_token', v_recalculated_confirmation_token,
      'isolated', true,
      'prepared_at', to_jsonb(v_now)
    );

  v_processing_checkpoint :=
    jsonb_build_object(
      'version', 1,
      'saved_at', to_jsonb(v_now),
      'date_window_index', v_source_date_window_index,
      'raw_rows', v_expected_source_rows,
      'normalized_rows', v_expected_source_rows,
      'inserted_rows', v_expected_source_rows,
      'failed_rows', 0,
      'collector',
        jsonb_build_object(
          'discovered_keywords', v_source_keyword_entity_count,
          'completed_keywords', v_source_keyword_entity_count,
          'stats_requests_attempted', 0,
          'stats_requests_succeeded', 0,
          'retry_count', 0,
          'date_window_index', v_source_date_window_index,
          'cursor', jsonb_build_object(),
          'combined_version', 1,
          'phase', 'completed',
          'next_row_index', v_expected_source_rows,
          'keyword',
            jsonb_build_object(
              'complete', true,
              'cursor', null,
              'counts',
                jsonb_build_object(
                  'discovered', v_source_keyword_entity_count,
                  'completed', v_source_keyword_entity_count,
                  'statsRequestsAttempted', 0,
                  'statsRequestsSucceeded', 0,
                  'retryCount', 0
                )
            ),
          'authoritative',
            jsonb_build_object(
              'complete', true,
              'cursor', null,
              'counts',
                jsonb_build_object(
                  'discovered', v_source_authoritative_entity_count,
                  'completed', v_source_authoritative_entity_count,
                  'statsRequestsAttempted', 0,
                  'statsRequestsSucceeded', 0,
                  'retryCount', 0
                )
            )
        ),
      'recovery', v_recovery
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
    v_expected_source_rows,
    v_expected_source_rows,
    v_expected_source_rows,
    0,
    v_report.current_ingestion_id,
    null,
    0,
    null,
    jsonb_build_object(
      'processing_checkpoint', v_processing_checkpoint
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
  where source_row.job_id = v_expected_source_job_id
  order by
    source_row.row_index,
    source_row.row_key,
    source_row.id;

  select
    count(*)::bigint,
    min(candidate_row.row_index)::bigint,
    max(candidate_row.row_index)::bigint,
    count(distinct candidate_row.row_index)::bigint,
    count(
      distinct (
        candidate_row.date_window_index,
        candidate_row.row_key
      )
    )::bigint
  into
    v_candidate_rows,
    v_candidate_min_row_index,
    v_candidate_max_row_index,
    v_candidate_distinct_row_indexes,
    v_candidate_distinct_window_row_keys
  from public.media_sync_staging_rows as candidate_row
  where candidate_row.job_id = v_candidate_id;

  select count(*)::bigint
  into v_candidate_exact_mismatch_rows
  from (
    select
      source_row.row_index,
      source_row.report_id,
      source_row.workspace_id,
      source_row.advertiser_id,
      source_row.connection_id,
      source_row.provider,
      source_row.external_account_id,
      source_row.date_window_index,
      source_row.date_from,
      source_row.date_to,
      source_row.row_key,
      source_row.date,
      source_row.channel,
      source_row.device,
      source_row.source,
      source_row.row,
      source_row.row_fingerprint
    from public.media_sync_staging_rows as source_row
    where source_row.job_id = v_expected_source_job_id
  ) as source_row
  full outer join (
    select
      candidate_row.row_index,
      candidate_row.report_id,
      candidate_row.workspace_id,
      candidate_row.advertiser_id,
      candidate_row.connection_id,
      candidate_row.provider,
      candidate_row.external_account_id,
      candidate_row.date_window_index,
      candidate_row.date_from,
      candidate_row.date_to,
      candidate_row.row_key,
      candidate_row.date,
      candidate_row.channel,
      candidate_row.device,
      candidate_row.source,
      candidate_row.row,
      candidate_row.row_fingerprint
    from public.media_sync_staging_rows as candidate_row
    where candidate_row.job_id = v_candidate_id
  ) as candidate_row
    on candidate_row.row_index = source_row.row_index
  where source_row.row_index is null
     or candidate_row.row_index is null
     or candidate_row.report_id is distinct from source_row.report_id
     or candidate_row.workspace_id is distinct from source_row.workspace_id
     or candidate_row.advertiser_id is distinct from source_row.advertiser_id
     or candidate_row.connection_id is distinct from source_row.connection_id
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
        source_row.row_fingerprint;

  if v_candidate_rows <> v_expected_source_rows
     or v_candidate_min_row_index <> 0
     or v_candidate_max_row_index <> v_expected_source_rows - 1
     or v_candidate_distinct_row_indexes <> v_expected_source_rows
     or v_candidate_distinct_window_row_keys <>
        v_expected_source_rows
     or v_candidate_exact_mismatch_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_CANDIDATE_COPY_MISMATCH';
  end if;

  with identity_blocks as (
    select
      (
        candidate_row.row_index / v_identity_block_size
      )::bigint as block_index,
      count(*)::bigint as block_rows,
      min(candidate_row.row_index)::bigint as block_min_row_index,
      max(candidate_row.row_index)::bigint as block_max_row_index,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
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
                  candidate_row.row_index,
                  candidate_row.row_key,
                  candidate_row.id
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as block_digest
    from public.media_sync_staging_rows as candidate_row
    where candidate_row.job_id = v_candidate_id
    group by (
      candidate_row.row_index / v_identity_block_size
    )::bigint
  )
  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_identity_algorithm || E'\n' ||
        coalesce(
          string_agg(
            identity_blocks.block_index::text || ':' ||
            identity_blocks.block_rows::text || ':' ||
            identity_blocks.block_min_row_index::text || ':' ||
            identity_blocks.block_max_row_index::text || ':' ||
            identity_blocks.block_digest,
            E'\n' order by identity_blocks.block_index
          ),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  into v_candidate_identity_digest
  from identity_blocks;

  if v_candidate_identity_digest is distinct from
       v_source_identity_digest
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_CANDIDATE_IDENTITY_DIGEST_MISMATCH';
  end if;

  with identity_blocks as (
    select
      (
        source_row.row_index / v_identity_block_size
      )::bigint as block_index,
      count(*)::bigint as block_rows,
      min(source_row.row_index)::bigint as block_min_row_index,
      max(source_row.row_index)::bigint as block_max_row_index,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
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
                  source_row.row_index,
                  source_row.row_key,
                  source_row.id
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as block_digest
    from public.media_sync_staging_rows as source_row
    where source_row.job_id = v_expected_source_job_id
    group by (
      source_row.row_index / v_identity_block_size
    )::bigint
  ),
  identity_summary as (
    select
      coalesce(sum(identity_blocks.block_rows), 0)::bigint as rows,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
            v_identity_algorithm || E'\n' ||
            coalesce(
              string_agg(
                identity_blocks.block_index::text || ':' ||
                identity_blocks.block_rows::text || ':' ||
                identity_blocks.block_min_row_index::text || ':' ||
                identity_blocks.block_max_row_index::text || ':' ||
                identity_blocks.block_digest,
                E'\n' order by identity_blocks.block_index
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as digest
    from identity_blocks
  )
  select
    identity_summary.rows,
    identity_summary.digest
  into
    v_source_post_rows,
    v_source_post_identity_digest
  from identity_summary;

  select job.*
  into v_source_job_after
  from public.media_sync_jobs as job
  where job.id = v_expected_source_job_id;

  select report.*
  into v_report_after
  from public.reports as report
  where report.id = v_expected_report_id;

  select job.*
  into v_candidate_job_after
  from public.media_sync_jobs as job
  where job.id = v_candidate_id;

  if v_source_job_after.id is null
     or to_jsonb(v_source_job_after) is distinct from
        to_jsonb(v_source_job)
     or v_source_post_rows <> v_source_rows
     or v_source_post_identity_digest is distinct from
        v_source_identity_digest
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_SOURCE_CHANGED_DURING_PREPARATION';
  end if;

  if v_report_after.id is null
     or v_report_after.current_ingestion_id is distinct from
        v_report.current_ingestion_id
     or v_report_after.published_ingestion_id is distinct from
        v_report.published_ingestion_id
     or v_report_after.updated_at is distinct from
        v_report.updated_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_REPORT_CHANGED_DURING_PREPARATION';
  end if;

  if v_candidate_job_after.id is null
     or v_candidate_job_after.status is distinct from 'cancelled'
     or v_candidate_job_after.progress is distinct from 99
     or v_candidate_job_after.raw_rows is distinct from
        v_expected_source_rows
     or v_candidate_job_after.normalized_rows is distinct from
        v_expected_source_rows
     or v_candidate_job_after.inserted_rows is distinct from
        v_expected_source_rows
     or v_candidate_job_after.failed_rows is distinct from 0
     or v_candidate_job_after.previous_ingestion_id is distinct from
        v_expected_current_ingestion_id
     or v_candidate_job_after.snapshot_ingestion_id is not null
     or v_candidate_job_after.attempt_count is distinct from 0
     or v_candidate_job_after.error is not null
     or v_candidate_job_after.started_at is not null
     or v_candidate_job_after.finished_at is not null
     or jsonb_typeof(v_candidate_job_after.error_detail) <> 'object'
     or (
       select count(*)
       from jsonb_object_keys(v_candidate_job_after.error_detail)
     ) <> 1
     or not (
       v_candidate_job_after.error_detail ? 'processing_checkpoint'
     )
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,collector,phase}' is distinct from
        'completed'
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,collector,keyword,complete}' is distinct from
        'true'
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,collector,authoritative,complete}' is distinct from
        'true'
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,collector,next_row_index}' is distinct from
        v_expected_source_rows::text
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,raw_rows}' is distinct from
        v_expected_source_rows::text
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,normalized_rows}' is distinct from
        v_expected_source_rows::text
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,inserted_rows}' is distinct from
        v_expected_source_rows::text
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,failed_rows}' is distinct from '0'
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,recovery,source_job_id}' is distinct from
        v_expected_source_job_id::text
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,recovery,source_identity_digest}' is distinct from
        v_source_identity_digest
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,recovery,candidate_identity_digest}' is distinct from
        v_candidate_identity_digest
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,recovery,confirmation_token}' is distinct from
        v_recalculated_confirmation_token
     or v_candidate_job_after.error_detail #>>
        '{processing_checkpoint,recovery,isolated}' is distinct from
        'true'
  then
    raise exception using
      errcode = 'P0001',
      message = 'ENBGSR_CANDIDATE_JOB_CONTRACT_MISMATCH';
  end if;

  return query
  select
    v_source_job.id,
    v_candidate_job_after.id,
    v_candidate_job_after.status,

    v_candidate_job_after.report_id,
    v_candidate_job_after.workspace_id,
    v_candidate_job_after.advertiser_id,
    v_candidate_job_after.connection_id,

    v_source_rows,
    v_candidate_rows,
    v_excluded_rows,
    v_retained_rows,
    v_reindex_required_rows,
    v_mixed_campaign_count,
    v_matched_campaign_count,

    v_source_identity_digest,
    v_candidate_identity_digest,
    v_recalculated_confirmation_token,

    v_report.current_ingestion_id,
    v_report.published_ingestion_id,

    'completed'::text,
    v_expected_source_rows,

    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false;
end;
$function$;

alter function public.prepare_exact_naver_brand_search_stale_recovery_candidate(jsonb)
owner to postgres;

revoke all
on function public.prepare_exact_naver_brand_search_stale_recovery_candidate(jsonb)
from public;

revoke all
on function public.prepare_exact_naver_brand_search_stale_recovery_candidate(jsonb)
from anon;

revoke all
on function public.prepare_exact_naver_brand_search_stale_recovery_candidate(jsonb)
from authenticated;

grant execute
on function public.prepare_exact_naver_brand_search_stale_recovery_candidate(jsonb)
to service_role;

comment on function public.prepare_exact_naver_brand_search_stale_recovery_candidate(jsonb)
is
  'Atomically prepares one exact isolated cancelled Naver BRAND_SEARCH stale-reconciliation recovery candidate from source job 7ef7b4ee-7786-4695-af1c-abb0f75fd553 without mutating the source, report pointers, report_rows, or invoking any downstream lifecycle RPC.';

notify pgrst, 'reload schema';

commit;