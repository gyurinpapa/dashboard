-- QUERY NAME:
-- create-reconcile-naver-searchads-brand-search-cross-grain-staging

begin;

/*
 * Etrylue Performance
 * Naver Search Ads BRAND_SEARCH cross-grain staging reconciliation
 *
 * Runtime boundary:
 *   completed keyword + authoritative checkpoint
 *   -> bounded reconciliation RPC calls
 *   -> combined staging summary
 *   -> materialization / activation / finalization
 *
 * Safety contract:
 * - every RPC call commits one bounded reconciliation step;
 * - the default step is 500 rows and the database statement must end
 *   within 60 seconds, before the upstream request boundary;
 * - in-progress state is stored only in
 *   media_sync_jobs.error_detail.processing_checkpoint.reconciliation_work;
 * - discovery, classification, source/retained validation, and every mutation
 *   write are bounded by p_payload.batch_size;
 * - the existing final reconciliation audit contract remains unchanged;
 * - materialization, activation, finalization, and publish are never called.
 */

create or replace function public.reconcile_naver_searchads_brand_search_cross_grain_staging(
  p_payload jsonb
)
returns table(
  job jsonb,
  reconciliation_kind text,
  reconciliation_version integer,
  changed boolean,
  already_reconciled boolean,
  source_rows bigint,
  excluded_rows bigint,
  retained_rows bigint,
  mixed_campaign_count bigint,
  matched_campaign_count bigint,
  remaining_overlap_rows bigint,
  excluded_impressions numeric,
  excluded_clicks numeric,
  excluded_cost numeric,
  excluded_conversions numeric,
  excluded_revenue numeric
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
set statement_timeout to '60s'
as $function$
declare
  v_kind constant text :=
    'brand_search_cross_grain_dedup_v1';

  v_version constant integer :=
    1;

  v_default_batch_size constant integer :=
    500;

  v_min_batch_size constant integer :=
    100;

  v_max_batch_size constant integer :=
    10000;

  v_job public.media_sync_jobs%rowtype;
  v_updated_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;
  v_batch_size integer;

  v_checkpoint jsonb;
  v_reconciliation jsonb;
  v_work jsonb;
  v_error_detail jsonb;
  v_now timestamptz :=
    pg_catalog.clock_timestamp();

  v_work_phase text;
  v_work_started_at timestamptz;
  v_cursor bigint := 0;
  v_validated_rows bigint := 0;

  v_source_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;

  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_invalid_fingerprint_rows bigint := 0;
  v_canonical_mismatch_rows bigint := 0;

  v_source_scope_mismatch_rows bigint := 0;
  v_source_blank_row_key_rows bigint := 0;
  v_source_invalid_fingerprint_rows bigint := 0;
  v_source_canonical_mismatch_rows bigint := 0;

  v_retained_scope_mismatch_rows bigint := 0;
  v_retained_blank_row_key_rows bigint := 0;
  v_retained_invalid_fingerprint_rows bigint := 0;
  v_retained_canonical_mismatch_rows bigint := 0;

  v_batch_rows bigint := 0;
  v_batch_min_row_index bigint := null;
  v_batch_max_row_index bigint := null;
  v_batch_scope_mismatch_rows bigint := 0;
  v_batch_blank_row_key_rows bigint := 0;
  v_batch_invalid_fingerprint_rows bigint := 0;
  v_batch_canonical_mismatch_rows bigint := 0;
  v_batch_remaining_overlap_rows bigint := 0;

  v_excluded_rows bigint := 0;
  v_retained_rows bigint := 0;

  v_mixed_campaign_count bigint := 0;
  v_matched_campaign_count bigint := 0;
  v_remaining_overlap_rows bigint := 0;

  v_excluded_impressions numeric := 0;
  v_excluded_clicks numeric := 0;
  v_excluded_cost numeric := 0;
  v_excluded_conversions numeric := 0;
  v_excluded_revenue numeric := 0;

  v_reindex_offset bigint := 0;
  v_reindex_required_rows bigint := 0;
  v_first_excluded_row_index bigint := null;
  v_shifted_rows bigint := 0;
  v_deleted_rows bigint := 0;
  v_reindexed_rows bigint := 0;
  v_batch_end bigint := 0;
  v_mixed_campaign_ids jsonb := '[]'::jsonb;
  v_matched_campaign_ids jsonb := '[]'::jsonb;
  v_batch_excluded_rows bigint := 0;
  v_batch_reindex_rows bigint := 0;
  v_batch_first_excluded_row_index bigint := null;
  v_batch_excluded_impressions numeric := 0;
  v_batch_excluded_clicks numeric := 0;
  v_batch_excluded_cost numeric := 0;
  v_batch_excluded_conversions numeric := 0;
  v_batch_excluded_revenue numeric := 0;
  v_affected_rows bigint := 0;

  v_existing_source_rows bigint;
  v_existing_excluded_rows bigint;
  v_existing_retained_rows bigint;
  v_existing_mixed_campaign_count bigint;
  v_existing_matched_campaign_count bigint;
  v_existing_excluded_impressions numeric;
  v_existing_excluded_clicks numeric;
  v_existing_excluded_cost numeric;
  v_existing_excluded_conversions numeric;
  v_existing_excluded_revenue numeric;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;

    v_batch_size :=
      coalesce(
        nullif(
          btrim(p_payload ->> 'batch_size'),
          ''
        )::integer,
        v_default_batch_size
      );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_date_from > v_date_to
     or v_batch_size < v_min_batch_size
     or v_batch_size > v_max_batch_size
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_INVALID_INPUT';
  end if;

  /*
   * Every append/checkpoint/reconciliation operation serializes through the
   * same job row. The lock exists only for the current bounded RPC call.
   */
  select media_job.*
  into v_job
  from public.media_sync_jobs as media_job
  where media_job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_SCOPE_MISMATCH';
  end if;

  if v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_INVALID_JOB';
  end if;

  if jsonb_typeof(v_job.error_detail) <> 'object'
     or jsonb_typeof(
       v_job.error_detail -> 'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_CHECKPOINT_NOT_COMPLETED';
  end if;

  v_checkpoint :=
    v_job.error_detail -> 'processing_checkpoint';

  if v_checkpoint #>> '{collector,phase}'
       is distinct from 'completed'
     or v_checkpoint #>> '{collector,keyword,complete}'
       is distinct from 'true'
     or v_checkpoint #>> '{collector,authoritative,complete}'
       is distinct from 'true'
     or v_checkpoint #>> '{failed_rows}'
       is distinct from '0'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_CHECKPOINT_NOT_COMPLETED';
  end if;

  v_reconciliation :=
    v_checkpoint -> 'reconciliation';

  /*
   * Idempotent completed response. This path intentionally performs only
   * bounded structural checks because the retained rows were already fully
   * batch-validated before the audit was committed.
   */
  if v_reconciliation is not null
     and v_reconciliation <> 'null'::jsonb
  then
    if jsonb_typeof(v_reconciliation) <> 'object'
       or v_reconciliation ->> 'kind'
          is distinct from v_kind
       or v_reconciliation ->> 'version'
          is distinct from v_version::text
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    begin
      v_existing_source_rows :=
        (v_reconciliation ->> 'source_rows')::bigint;
      v_existing_excluded_rows :=
        (v_reconciliation ->> 'excluded_rows')::bigint;
      v_existing_retained_rows :=
        (v_reconciliation ->> 'retained_rows')::bigint;
      v_existing_mixed_campaign_count :=
        (v_reconciliation ->> 'mixed_campaign_count')::bigint;
      v_existing_matched_campaign_count :=
        (v_reconciliation ->> 'matched_campaign_count')::bigint;
      v_existing_excluded_impressions :=
        (v_reconciliation ->> 'excluded_impressions')::numeric;
      v_existing_excluded_clicks :=
        (v_reconciliation ->> 'excluded_clicks')::numeric;
      v_existing_excluded_cost :=
        (v_reconciliation ->> 'excluded_cost')::numeric;
      v_existing_excluded_conversions :=
        (v_reconciliation ->> 'excluded_conversions')::numeric;
      v_existing_excluded_revenue :=
        (v_reconciliation ->> 'excluded_revenue')::numeric;
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_RECONCILIATION_CONFLICT';
    end;

    if v_existing_source_rows < 0
       or v_existing_excluded_rows < 0
       or v_existing_retained_rows < 0
       or v_existing_source_rows -
          v_existing_excluded_rows <>
          v_existing_retained_rows
       or v_existing_mixed_campaign_count < 0
       or v_existing_matched_campaign_count < 0
       or v_existing_matched_campaign_count >
          v_existing_mixed_campaign_count
       or v_expected_rows <> v_existing_retained_rows
       or v_job.raw_rows <> v_existing_retained_rows
       or v_job.normalized_rows <> v_existing_retained_rows
       or v_job.inserted_rows <> v_existing_retained_rows
       or v_checkpoint #>> '{raw_rows}'
          is distinct from v_existing_retained_rows::text
       or v_checkpoint #>> '{normalized_rows}'
          is distinct from v_existing_retained_rows::text
       or v_checkpoint #>> '{inserted_rows}'
          is distinct from v_existing_retained_rows::text
       or v_checkpoint #>> '{collector,next_row_index}'
          is distinct from v_existing_retained_rows::text
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select
      count(staging.id)::bigint,
      min(staging.row_index),
      max(staging.row_index),
      count(distinct staging.row_index)::bigint,
      count(staging.id) filter (
        where staging.report_id <> v_report_id
           or staging.workspace_id <> v_workspace_id
           or staging.advertiser_id <> v_advertiser_id
           or staging.connection_id <> v_connection_id
           or staging.provider <> v_provider
           or staging.external_account_id <>
              v_external_account_id
           or staging.date_from <> v_date_from
           or staging.date_to <> v_date_to
           or staging.date < v_date_from
           or staging.date > v_date_to
      )::bigint,
      count(staging.id) filter (
        where btrim(staging.row_key) = ''
      )::bigint
    into
      v_source_rows,
      v_min_row_index,
      v_max_row_index,
      v_distinct_row_indexes,
      v_scope_mismatch_rows,
      v_blank_row_key_rows
    from public.media_sync_staging_rows as staging
    where staging.job_id = v_job_id;

    select count(*)::bigint
    into v_remaining_overlap_rows
    from public.media_sync_staging_rows as keyword_row
    where keyword_row.job_id = v_job_id
      and keyword_row.row ->> 'row_level' = 'keyword'
      and keyword_row.row ->> 'data_level' = 'keyword'
      and keyword_row.row ->> 'row_level_reason' =
          'naver_searchad_registered_keyword_daily_stats'
      and keyword_row.row #>> '{provider_meta,campaign_type}' =
          'BRAND_SEARCH'
      and exists (
        select 1
        from public.media_sync_staging_rows as mixed_row
        where mixed_row.job_id = v_job_id
          and mixed_row.row ->> 'row_level' = 'mixed'
          and mixed_row.row ->> 'data_level' = 'mixed'
          and mixed_row.row ->> 'row_level_reason' =
              'naver_searchad_brand_search_adgroup_daily_stats'
          and mixed_row.row #>> '{provider_meta,campaign_type}' =
              'BRAND_SEARCH'
          and mixed_row.row #>> '{provider_meta,authoritative_grain}' =
              'adgroup'
          and nullif(
                btrim(
                  mixed_row.row ->> 'external_campaign_id'
                ),
                ''
              ) =
              nullif(
                btrim(
                  keyword_row.row ->> 'external_campaign_id'
                ),
                ''
              )
      );

    if v_source_rows <> v_existing_retained_rows
       or v_distinct_row_indexes <> v_existing_retained_rows
       or (
         v_existing_retained_rows = 0
         and (
           v_min_row_index is not null
           or v_max_row_index is not null
         )
       )
       or (
         v_existing_retained_rows > 0
         and (
           v_min_row_index <> 0
           or v_max_row_index <>
              v_existing_retained_rows - 1
         )
       )
       or v_scope_mismatch_rows <> 0
       or v_blank_row_key_rows <> 0
       or v_remaining_overlap_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    return query
    select
      to_jsonb(v_job),
      v_kind,
      v_version,
      false,
      true,
      v_existing_source_rows,
      v_existing_excluded_rows,
      v_existing_retained_rows,
      v_existing_mixed_campaign_count,
      v_existing_matched_campaign_count,
      v_remaining_overlap_rows,
      v_existing_excluded_impressions,
      v_existing_excluded_clicks,
      v_existing_excluded_cost,
      v_existing_excluded_conversions,
      v_existing_excluded_revenue;

    return;
  end if;

  if v_job.raw_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.inserted_rows <> v_expected_rows
     or v_checkpoint #>> '{raw_rows}'
        is distinct from v_expected_rows::text
     or v_checkpoint #>> '{normalized_rows}'
        is distinct from v_expected_rows::text
     or v_checkpoint #>> '{inserted_rows}'
        is distinct from v_expected_rows::text
     or v_checkpoint #>> '{collector,next_row_index}'
        is distinct from v_expected_rows::text
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_CHECKPOINT_NOT_COMPLETED';
  end if;

  v_work :=
    v_checkpoint -> 'reconciliation_work';

  if v_work is null
     or v_work = 'null'::jsonb
  then
    v_work_started_at := v_now;
    v_work_phase := 'source_validation';
    v_cursor := 0;
    v_validated_rows := 0;
    v_source_rows := v_expected_rows;
    v_retained_rows := v_expected_rows;

    v_work :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'phase', v_work_phase,
        'source_rows', v_source_rows,
        'excluded_rows', 0,
        'retained_rows', v_retained_rows,
        'mixed_campaign_count', 0,
        'matched_campaign_count', 0,
        'excluded_impressions', 0,
        'excluded_clicks', 0,
        'excluded_cost', 0,
        'excluded_conversions', 0,
        'excluded_revenue', 0,
        'cursor', v_cursor,
        'validated_rows', v_validated_rows,
        'source_scope_mismatch_rows', 0,
        'source_blank_row_key_rows', 0,
        'source_invalid_fingerprint_rows', 0,
        'source_canonical_mismatch_rows', 0,
        'retained_scope_mismatch_rows', 0,
        'retained_blank_row_key_rows', 0,
        'retained_invalid_fingerprint_rows', 0,
        'retained_canonical_mismatch_rows', 0,
        'batch_size', v_batch_size,
        'started_at', to_jsonb(v_work_started_at),
        'updated_at', to_jsonb(v_now)
      );
  else
    if jsonb_typeof(v_work) <> 'object'
       or v_work ->> 'kind' is distinct from v_kind
       or v_work ->> 'version' is distinct from v_version::text
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    begin
      v_work_phase :=
        v_work ->> 'phase';
      v_work_started_at :=
        (v_work ->> 'started_at')::timestamptz;
      v_source_rows :=
        (v_work ->> 'source_rows')::bigint;
      v_excluded_rows :=
        (v_work ->> 'excluded_rows')::bigint;
      v_retained_rows :=
        (v_work ->> 'retained_rows')::bigint;
      v_mixed_campaign_count :=
        (v_work ->> 'mixed_campaign_count')::bigint;
      v_matched_campaign_count :=
        (v_work ->> 'matched_campaign_count')::bigint;
      v_excluded_impressions :=
        (v_work ->> 'excluded_impressions')::numeric;
      v_excluded_clicks :=
        (v_work ->> 'excluded_clicks')::numeric;
      v_excluded_cost :=
        (v_work ->> 'excluded_cost')::numeric;
      v_excluded_conversions :=
        (v_work ->> 'excluded_conversions')::numeric;
      v_excluded_revenue :=
        (v_work ->> 'excluded_revenue')::numeric;
      v_cursor :=
        (v_work ->> 'cursor')::bigint;
      v_validated_rows :=
        (v_work ->> 'validated_rows')::bigint;
      v_source_scope_mismatch_rows :=
        (v_work ->> 'source_scope_mismatch_rows')::bigint;
      v_source_blank_row_key_rows :=
        (v_work ->> 'source_blank_row_key_rows')::bigint;
      v_source_invalid_fingerprint_rows :=
        (v_work ->> 'source_invalid_fingerprint_rows')::bigint;
      v_source_canonical_mismatch_rows :=
        (v_work ->> 'source_canonical_mismatch_rows')::bigint;
      v_retained_scope_mismatch_rows :=
        (v_work ->> 'retained_scope_mismatch_rows')::bigint;
      v_retained_blank_row_key_rows :=
        (v_work ->> 'retained_blank_row_key_rows')::bigint;
      v_retained_invalid_fingerprint_rows :=
        (v_work ->> 'retained_invalid_fingerprint_rows')::bigint;
      v_retained_canonical_mismatch_rows :=
        (v_work ->> 'retained_canonical_mismatch_rows')::bigint;
      v_reindex_required_rows :=
        coalesce(nullif(v_work ->> 'reindex_required_rows', '')::bigint, 0);
      v_first_excluded_row_index :=
        nullif(v_work ->> 'first_excluded_row_index', '')::bigint;
      v_reindex_offset :=
        coalesce(nullif(v_work ->> 'reindex_offset', '')::bigint, 0);
      v_shifted_rows :=
        coalesce(nullif(v_work ->> 'shifted_rows', '')::bigint, 0);
      v_deleted_rows :=
        coalesce(nullif(v_work ->> 'deleted_rows', '')::bigint, 0);
      v_reindexed_rows :=
        coalesce(nullif(v_work ->> 'reindexed_rows', '')::bigint, 0);
      v_mixed_campaign_ids :=
        coalesce(v_work -> 'mixed_campaign_ids', '[]'::jsonb);
      v_matched_campaign_ids :=
        coalesce(v_work -> 'matched_campaign_ids', '[]'::jsonb);
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_RECONCILIATION_CONFLICT';
    end;

    if v_work_phase not in (
         'source_validation',
         'mutation',
         'mutation_discover',
         'mutation_classify',
         'mutation_shift',
         'mutation_delete',
         'mutation_reindex',
         'mutation_verify',
         'retained_validation',
         'finalization'
       )
       or v_work_started_at is null
       or v_source_rows < 0
       or v_excluded_rows < 0
       or v_retained_rows < 0
       or v_source_rows - v_excluded_rows <> v_retained_rows
       or v_mixed_campaign_count < 0
       or v_matched_campaign_count < 0
       or v_matched_campaign_count > v_mixed_campaign_count
       or v_cursor < 0
       or v_validated_rows < 0
       or v_cursor <> v_validated_rows
       or v_reindex_required_rows < 0
       or v_shifted_rows < 0
       or v_deleted_rows < 0
       or v_reindexed_rows < 0
       or v_shifted_rows > v_reindex_required_rows
       or v_deleted_rows > v_excluded_rows
       or v_reindexed_rows > v_reindex_required_rows
       or jsonb_typeof(v_mixed_campaign_ids) <> 'array'
       or jsonb_typeof(v_matched_campaign_ids) <> 'array'
       or jsonb_array_length(v_mixed_campaign_ids) <> v_mixed_campaign_count
       or jsonb_array_length(v_matched_campaign_ids) <> v_matched_campaign_count
       or (
         v_work_phase in (
           'mutation_shift',
           'mutation_delete',
           'mutation_reindex',
           'mutation_verify'
         )
         and (
           v_excluded_rows <= 0
           or v_first_excluded_row_index is null
           or v_first_excluded_row_index < 0
           or v_first_excluded_row_index >= v_source_rows
           or v_reindex_offset <> v_source_rows + 1
           or v_reindex_required_rows <>
              v_retained_rows - v_first_excluded_row_index
         )
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;
  end if;

  /*
   * Phase 1: validate source rows in bounded row_index batches.
   */
  if v_work_phase = 'source_validation' then
    if v_expected_rows <> v_source_rows
       or v_retained_rows <> v_source_rows
       or v_excluded_rows <> 0
       or v_cursor > v_source_rows
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.*
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id
        and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    )
    select
      count(batch.id)::bigint,
      min(batch.row_index),
      max(batch.row_index),
      count(batch.id) filter (
        where batch.report_id <> v_report_id
           or batch.workspace_id <> v_workspace_id
           or batch.advertiser_id <> v_advertiser_id
           or batch.connection_id <> v_connection_id
           or batch.provider <> v_provider
           or batch.external_account_id <>
              v_external_account_id
           or batch.date_from <> v_date_from
           or batch.date_to <> v_date_to
           or batch.date < v_date_from
           or batch.date > v_date_to
      )::bigint,
      count(batch.id) filter (
        where btrim(batch.row_key) = ''
      )::bigint,
      count(batch.id) filter (
        where batch.row_fingerprint is null
           or batch.row_fingerprint !~ '^[0-9a-f]{64}$'
           or batch.row_fingerprint is distinct from
              encode(
                extensions.digest(
                  pg_catalog.convert_to(
                    batch.row::text,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              )
      )::bigint,
      count(batch.id) filter (
        where jsonb_typeof(batch.row) <> 'object'
           or coalesce(batch.row ->> 'date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'report_date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'day', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'ymd', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'channel', '') <>
              coalesce(batch.channel, '')
           or coalesce(batch.row ->> 'device', '') <>
              coalesce(batch.device, '')
           or coalesce(batch.row ->> 'source', '') <>
              coalesce(batch.source, '')
           or coalesce(batch.row ->> 'provider', '') <>
              'naver_searchad'
           or coalesce(
                batch.row ->> 'external_account_id',
                ''
              ) <> v_external_account_id
           or coalesce(
                batch.row ->> 'ingestion_source',
                ''
              ) <> 'api'
      )::bigint
    into
      v_batch_rows,
      v_batch_min_row_index,
      v_batch_max_row_index,
      v_batch_scope_mismatch_rows,
      v_batch_blank_row_key_rows,
      v_batch_invalid_fingerprint_rows,
      v_batch_canonical_mismatch_rows
    from batch;

    if v_batch_rows > 0
       and (
         v_batch_min_row_index <> v_cursor
         or v_batch_max_row_index <>
            v_cursor + v_batch_rows - 1
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_cursor :=
      v_cursor + v_batch_rows;
    v_validated_rows :=
      v_validated_rows + v_batch_rows;
    v_source_scope_mismatch_rows :=
      v_source_scope_mismatch_rows +
      v_batch_scope_mismatch_rows;
    v_source_blank_row_key_rows :=
      v_source_blank_row_key_rows +
      v_batch_blank_row_key_rows;
    v_source_invalid_fingerprint_rows :=
      v_source_invalid_fingerprint_rows +
      v_batch_invalid_fingerprint_rows;
    v_source_canonical_mismatch_rows :=
      v_source_canonical_mismatch_rows +
      v_batch_canonical_mismatch_rows;

    if v_cursor > v_source_rows
       or v_validated_rows <> v_cursor
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_STAGING_CHANGED';
    end if;

    if v_cursor = v_source_rows then
      /*
       * The unique (job_id, row_index) contract plus every bounded batch's
       * contiguous min/max proof establishes the complete 0..N-1 range.
       * Recounting and count(distinct) across the whole staging set here made
       * an otherwise bounded step scale with multi-million-row jobs.
       */
      if v_source_scope_mismatch_rows <> 0
         or v_source_blank_row_key_rows <> 0
         or v_source_invalid_fingerprint_rows <> 0
         or v_source_canonical_mismatch_rows <> 0
      then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_STAGING_CHANGED';
      end if;

      v_work_phase :=
        'mutation';
      v_cursor := 0;
      v_validated_rows := 0;
    elsif v_batch_rows = 0 then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_work :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'phase', v_work_phase,
        'source_rows', v_source_rows,
        'excluded_rows', 0,
        'retained_rows', v_source_rows,
        'mixed_campaign_count', 0,
        'matched_campaign_count', 0,
        'excluded_impressions', 0,
        'excluded_clicks', 0,
        'excluded_cost', 0,
        'excluded_conversions', 0,
        'excluded_revenue', 0,
        'cursor', v_cursor,
        'validated_rows', v_validated_rows,
        'source_scope_mismatch_rows',
          v_source_scope_mismatch_rows,
        'source_blank_row_key_rows',
          v_source_blank_row_key_rows,
        'source_invalid_fingerprint_rows',
          v_source_invalid_fingerprint_rows,
        'source_canonical_mismatch_rows',
          v_source_canonical_mismatch_rows,
        'retained_scope_mismatch_rows', 0,
        'retained_blank_row_key_rows', 0,
        'retained_invalid_fingerprint_rows', 0,
        'retained_canonical_mismatch_rows', 0,
        'batch_size', v_batch_size,
        'started_at', to_jsonb(v_work_started_at),
        'updated_at', to_jsonb(v_now)
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{saved_at}',
        to_jsonb(v_now),
        true
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{reconciliation_work}',
        v_work,
        true
      );

    v_error_detail :=
      jsonb_set(
        v_job.error_detail,
        '{processing_checkpoint}',
        v_checkpoint,
        true
      );

    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail,
        updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '40001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select media_job.*
    into v_updated_job
    from public.media_sync_jobs as media_job
    where media_job.id = v_job_id;

    return query
    select
      to_jsonb(v_updated_job),
      v_kind,
      v_version,
      false,
      false,
      v_source_rows,
      0::bigint,
      v_source_rows,
      0::bigint,
      0::bigint,
      0::bigint,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric;

    return;
  end if;

  /* Phase 2a: initialize bounded discovery from the legacy mutation state. */
  if v_work_phase = 'mutation' then
    if v_expected_rows <> v_source_rows
       or v_cursor <> 0
       or v_validated_rows <> 0
       or v_source_scope_mismatch_rows <> 0
       or v_source_blank_row_key_rows <> 0
       or v_source_invalid_fingerprint_rows <> 0
       or v_source_canonical_mismatch_rows <> 0
    then
      raise exception using errcode = 'P0001', message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    v_work_phase := 'mutation_discover';
    v_cursor := 0;
    v_validated_rows := 0;
    v_excluded_rows := 0;
    v_retained_rows := v_source_rows;
    v_mixed_campaign_count := 0;
    v_matched_campaign_count := 0;
    v_excluded_impressions := 0;
    v_excluded_clicks := 0;
    v_excluded_cost := 0;
    v_excluded_conversions := 0;
    v_excluded_revenue := 0;
    v_reindex_required_rows := 0;
    v_first_excluded_row_index := null;
    v_reindex_offset := 0;
    v_shifted_rows := 0;
    v_deleted_rows := 0;
    v_reindexed_rows := 0;
    v_mixed_campaign_ids := '[]'::jsonb;
    v_matched_campaign_ids := '[]'::jsonb;

    v_work := jsonb_build_object(
      'kind', v_kind, 'version', v_version, 'phase', v_work_phase,
      'source_rows', v_source_rows, 'excluded_rows', v_excluded_rows,
      'retained_rows', v_retained_rows,
      'mixed_campaign_count', v_mixed_campaign_count,
      'matched_campaign_count', v_matched_campaign_count,
      'excluded_impressions', v_excluded_impressions,
      'excluded_clicks', v_excluded_clicks,
      'excluded_cost', v_excluded_cost,
      'excluded_conversions', v_excluded_conversions,
      'excluded_revenue', v_excluded_revenue,
      'cursor', v_cursor, 'validated_rows', v_validated_rows,
      'source_scope_mismatch_rows', v_source_scope_mismatch_rows,
      'source_blank_row_key_rows', v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows', v_source_invalid_fingerprint_rows,
      'source_canonical_mismatch_rows', v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows', 0,
      'retained_blank_row_key_rows', 0,
      'retained_invalid_fingerprint_rows', 0,
      'retained_canonical_mismatch_rows', 0,
      'reindex_required_rows', v_reindex_required_rows,
      'first_excluded_row_index', to_jsonb(v_first_excluded_row_index),
      'reindex_offset', v_reindex_offset,
      'shifted_rows', v_shifted_rows,
      'deleted_rows', v_deleted_rows,
      'reindexed_rows', v_reindexed_rows,
      'mixed_campaign_ids', v_mixed_campaign_ids,
      'matched_campaign_ids', v_matched_campaign_ids,
      'batch_size', v_batch_size,
      'started_at', to_jsonb(v_work_started_at),
      'updated_at', to_jsonb(v_now)
    );

    v_checkpoint := jsonb_set(v_checkpoint, '{saved_at}', to_jsonb(v_now), true);
    v_checkpoint := jsonb_set(v_checkpoint, '{reconciliation_work}', v_work, true);
    v_error_detail := jsonb_set(v_job.error_detail, '{processing_checkpoint}', v_checkpoint, true);

    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail, updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 1 then
      raise exception using errcode = '40001', message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id = v_job_id;
    return query select to_jsonb(v_updated_job), v_kind, v_version, false, false,
      v_source_rows, 0::bigint, v_source_rows, 0::bigint, 0::bigint,
      0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  /* Phase 2b: discover authoritative BRAND_SEARCH campaign IDs in bounded batches. */
  if v_work_phase = 'mutation_discover' then
    if v_expected_rows <> v_source_rows
       or v_excluded_rows <> 0
       or v_retained_rows <> v_source_rows
       or v_cursor > v_source_rows
    then
      raise exception using errcode = 'P0001', message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.*
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    ),
    all_ids as (
      select value as campaign_id
      from jsonb_array_elements_text(v_mixed_campaign_ids)
      union
      select nullif(btrim(batch.row ->> 'external_campaign_id'), '') as campaign_id
      from batch
      where batch.row ->> 'row_level' = 'mixed'
        and batch.row ->> 'data_level' = 'mixed'
        and batch.row ->> 'row_level_reason' =
            'naver_searchad_brand_search_adgroup_daily_stats'
        and batch.row #>> '{provider_meta,campaign_type}' = 'BRAND_SEARCH'
        and batch.row #>> '{provider_meta,authoritative_grain}' = 'adgroup'
        and nullif(btrim(batch.row ->> 'external_campaign_id'), '') is not null
    )
    select
      (select count(*)::bigint from batch),
      (select min(batch.row_index)::bigint from batch),
      (select max(batch.row_index)::bigint from batch),
      coalesce(
        (select jsonb_agg(all_ids.campaign_id order by all_ids.campaign_id) from all_ids),
        '[]'::jsonb
      )
    into v_batch_rows, v_batch_min_row_index, v_batch_max_row_index, v_mixed_campaign_ids;

    if v_batch_rows > 0 and (
         v_batch_min_row_index <> v_cursor
         or v_batch_max_row_index <> v_cursor + v_batch_rows - 1
       )
    then
      raise exception using errcode = 'P0001', message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_cursor := v_cursor + v_batch_rows;
    v_validated_rows := v_cursor;
    v_mixed_campaign_count := jsonb_array_length(v_mixed_campaign_ids);

    if v_cursor = v_source_rows then
      v_work_phase := 'mutation_classify';
      v_cursor := 0;
      v_validated_rows := 0;
    elsif v_batch_rows = 0 then
      raise exception using errcode = 'P0001', message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_work := jsonb_build_object(
      'kind', v_kind, 'version', v_version, 'phase', v_work_phase,
      'source_rows', v_source_rows, 'excluded_rows', 0,
      'retained_rows', v_source_rows,
      'mixed_campaign_count', v_mixed_campaign_count,
      'matched_campaign_count', 0,
      'excluded_impressions', 0, 'excluded_clicks', 0,
      'excluded_cost', 0, 'excluded_conversions', 0, 'excluded_revenue', 0,
      'cursor', v_cursor, 'validated_rows', v_validated_rows,
      'source_scope_mismatch_rows', v_source_scope_mismatch_rows,
      'source_blank_row_key_rows', v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows', v_source_invalid_fingerprint_rows,
      'source_canonical_mismatch_rows', v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows', 0,
      'retained_blank_row_key_rows', 0,
      'retained_invalid_fingerprint_rows', 0,
      'retained_canonical_mismatch_rows', 0,
      'reindex_required_rows', 0,
      'first_excluded_row_index', to_jsonb(null::bigint),
      'reindex_offset', 0,
      'shifted_rows', 0, 'deleted_rows', 0, 'reindexed_rows', 0,
      'mixed_campaign_ids', v_mixed_campaign_ids,
      'matched_campaign_ids', '[]'::jsonb,
      'batch_size', v_batch_size,
      'started_at', to_jsonb(v_work_started_at), 'updated_at', to_jsonb(v_now)
    );

    v_checkpoint := jsonb_set(v_checkpoint, '{saved_at}', to_jsonb(v_now), true);
    v_checkpoint := jsonb_set(v_checkpoint, '{reconciliation_work}', v_work, true);
    v_error_detail := jsonb_set(v_job.error_detail, '{processing_checkpoint}', v_checkpoint, true);
    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail, updated_at = v_now
    where media_job.id = v_job_id and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 1 then raise exception using errcode='40001', message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job), v_kind, v_version, false, false,
      v_source_rows, 0::bigint, v_source_rows, v_mixed_campaign_count, 0::bigint,
      0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  /* Phase 2c: classify exact exclusions and metrics in bounded batches. */
  if v_work_phase = 'mutation_classify' then
    if v_expected_rows <> v_source_rows or v_cursor > v_source_rows
       or v_mixed_campaign_count <> jsonb_array_length(v_mixed_campaign_ids)
    then
      raise exception using errcode='P0001', message='NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.* from public.media_sync_staging_rows as staging
      where staging.job_id=v_job_id and staging.row_index>=v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    ),
    mixed_ids as materialized (
      select value as campaign_id from jsonb_array_elements_text(v_mixed_campaign_ids)
    ),
    classified as materialized (
      select batch.*,
        nullif(btrim(batch.row ->> 'external_campaign_id'),'') as campaign_id,
        (
          batch.row ->> 'row_level'='keyword'
          and batch.row ->> 'data_level'='keyword'
          and batch.row ->> 'row_level_reason'='naver_searchad_registered_keyword_daily_stats'
          and batch.row #>> '{provider_meta,campaign_type}'='BRAND_SEARCH'
          and exists (
            select 1 from mixed_ids
            where mixed_ids.campaign_id=nullif(btrim(batch.row ->> 'external_campaign_id'),'')
          )
        ) as excluded
      from batch
    ),
    stats as (
      select min(classified.row_index) filter(where classified.excluded)::bigint as batch_first
      from classified
    ),
    all_matched as (
      select value as campaign_id from jsonb_array_elements_text(v_matched_campaign_ids)
      union
      select classified.campaign_id from classified
      where classified.excluded and classified.campaign_id is not null
    )
    select
      (select count(*)::bigint from classified),
      (select min(row_index)::bigint from classified),
      (select max(row_index)::bigint from classified),
      (select count(*) filter(where excluded)::bigint from classified),
      (select batch_first from stats),
      (
        select count(*) filter(
          where not classified.excluded
            and classified.row_index >= coalesce(v_first_excluded_row_index, stats.batch_first)
        )::bigint
        from classified cross join stats
      ),
      coalesce((select sum(coalesce((row ->> 'impressions')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'clicks')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'cost')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'conversions')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'revenue')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select jsonb_agg(all_matched.campaign_id order by all_matched.campaign_id) from all_matched),'[]'::jsonb)
    into
      v_batch_rows, v_batch_min_row_index, v_batch_max_row_index,
      v_batch_excluded_rows, v_batch_first_excluded_row_index,
      v_batch_reindex_rows,
      v_batch_excluded_impressions, v_batch_excluded_clicks,
      v_batch_excluded_cost, v_batch_excluded_conversions,
      v_batch_excluded_revenue, v_matched_campaign_ids;

    if v_batch_rows>0 and (
      v_batch_min_row_index<>v_cursor or v_batch_max_row_index<>v_cursor+v_batch_rows-1
    ) then raise exception using errcode='P0001', message='NSBGR_STAGING_CHANGED'; end if;

    if v_first_excluded_row_index is null and v_batch_first_excluded_row_index is not null then
      v_first_excluded_row_index := v_batch_first_excluded_row_index;
    end if;
    v_excluded_rows := v_excluded_rows + v_batch_excluded_rows;
    v_retained_rows := v_source_rows - v_excluded_rows;
    v_reindex_required_rows := v_reindex_required_rows + v_batch_reindex_rows;
    v_excluded_impressions := v_excluded_impressions + v_batch_excluded_impressions;
    v_excluded_clicks := v_excluded_clicks + v_batch_excluded_clicks;
    v_excluded_cost := v_excluded_cost + v_batch_excluded_cost;
    v_excluded_conversions := v_excluded_conversions + v_batch_excluded_conversions;
    v_excluded_revenue := v_excluded_revenue + v_batch_excluded_revenue;
    v_matched_campaign_count := jsonb_array_length(v_matched_campaign_ids);
    v_cursor := v_cursor + v_batch_rows;
    v_validated_rows := v_cursor;

    if v_cursor=v_source_rows then
      if v_excluded_rows<0 or v_retained_rows<0
         or v_excluded_rows+v_retained_rows<>v_source_rows
         or v_matched_campaign_count>v_mixed_campaign_count
         or (
           v_excluded_rows=0 and (v_first_excluded_row_index is not null or v_reindex_required_rows<>0)
         )
         or (
           v_excluded_rows>0 and (
             v_first_excluded_row_index is null
             or v_reindex_required_rows<>v_retained_rows-v_first_excluded_row_index
           )
         )
      then raise exception using errcode='P0001', message='NSBGR_RECONCILIATION_CONFLICT'; end if;

      if v_excluded_rows=0 then
        v_work_phase:='retained_validation'; v_cursor:=0; v_validated_rows:=0; v_reindex_offset:=0;
      else
        v_work_phase:='mutation_shift'; v_cursor:=v_first_excluded_row_index; v_validated_rows:=v_cursor;
        v_reindex_offset:=v_source_rows+1;
      end if;
    elsif v_batch_rows=0 then
      raise exception using errcode='P0001', message='NSBGR_STAGING_CHANGED';
    end if;

    v_work:=jsonb_build_object(
      'kind',v_kind,'version',v_version,'phase',v_work_phase,
      'source_rows',v_source_rows,'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,
      'mixed_campaign_count',v_mixed_campaign_count,'matched_campaign_count',v_matched_campaign_count,
      'excluded_impressions',v_excluded_impressions,'excluded_clicks',v_excluded_clicks,
      'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,
      'excluded_revenue',v_excluded_revenue,'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,
      'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,
      'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,
      'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,
      'first_excluded_row_index',to_jsonb(v_first_excluded_row_index),
      'reindex_offset',v_reindex_offset,'shifted_rows',0,'deleted_rows',0,'reindexed_rows',0,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now)
    );
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now
    where media_job.id=v_job_id and media_job.status='processing' and media_job.updated_at=v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;
    if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,false,false,
      v_source_rows,v_excluded_rows,v_retained_rows,v_mixed_campaign_count,v_matched_campaign_count,
      v_excluded_rows,v_excluded_impressions,v_excluded_clicks,v_excluded_cost,
      v_excluded_conversions,v_excluded_revenue;
    return;
  end if;

  /* Phase 2d: shift one bounded original row-index range to temporary indexes. */
  if v_work_phase='mutation_shift' then
    if v_expected_rows<>v_source_rows or v_cursor<v_first_excluded_row_index or v_cursor>v_source_rows
       or v_shifted_rows>v_reindex_required_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    v_batch_end:=least(v_cursor+v_batch_size::bigint,v_source_rows);
    with mixed_ids as materialized (
      select value as campaign_id from jsonb_array_elements_text(v_mixed_campaign_ids)
    ), targets as materialized (
      select staging.id from public.media_sync_staging_rows as staging
      where staging.job_id=v_job_id and staging.row_index>=v_cursor and staging.row_index<v_batch_end
        and not (
          staging.row ->> 'row_level'='keyword' and staging.row ->> 'data_level'='keyword'
          and staging.row ->> 'row_level_reason'='naver_searchad_registered_keyword_daily_stats'
          and staging.row #>> '{provider_meta,campaign_type}'='BRAND_SEARCH'
          and exists(select 1 from mixed_ids where mixed_ids.campaign_id=nullif(btrim(staging.row ->> 'external_campaign_id'),''))
        )
    )
    update public.media_sync_staging_rows as staging set row_index=staging.row_index+v_reindex_offset
    from targets where staging.id=targets.id;
    get diagnostics v_affected_rows=row_count;
    v_shifted_rows:=v_shifted_rows+v_affected_rows; v_cursor:=v_batch_end; v_validated_rows:=v_cursor;
    if v_shifted_rows>v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    if v_cursor=v_source_rows then
      if v_shifted_rows<>v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
      v_work_phase:='mutation_delete';v_cursor:=0;v_validated_rows:=0;
    end if;
    v_work:=jsonb_build_object(
      'kind',v_kind,'version',v_version,'phase',v_work_phase,'source_rows',v_source_rows,
      'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,
      'mixed_campaign_count',v_mixed_campaign_count,'matched_campaign_count',v_matched_campaign_count,
      'excluded_impressions',v_excluded_impressions,'excluded_clicks',v_excluded_clicks,
      'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,'excluded_revenue',v_excluded_revenue,
      'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,
      'reindex_offset',v_reindex_offset,'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now
    where media_job.id=v_job_id and media_job.status='processing' and media_job.updated_at=v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,false,false,v_source_rows,v_excluded_rows,v_retained_rows,
      v_mixed_campaign_count,v_matched_campaign_count,v_excluded_rows-v_deleted_rows,
      v_excluded_impressions,v_excluded_clicks,v_excluded_cost,v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /* Phase 2e: delete one bounded batch of exact cross-grain rows. */
  if v_work_phase='mutation_delete' then
    if v_expected_rows<>v_source_rows or v_shifted_rows<>v_reindex_required_rows or v_deleted_rows>v_excluded_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    with mixed_ids as materialized(select value as campaign_id from jsonb_array_elements_text(v_mixed_campaign_ids)),
    targets as materialized(
      select staging.id from public.media_sync_staging_rows as staging
      where staging.job_id=v_job_id and staging.row_index<v_reindex_offset
        and staging.row ->> 'row_level'='keyword' and staging.row ->> 'data_level'='keyword'
        and staging.row ->> 'row_level_reason'='naver_searchad_registered_keyword_daily_stats'
        and staging.row #>> '{provider_meta,campaign_type}'='BRAND_SEARCH'
        and exists(select 1 from mixed_ids where mixed_ids.campaign_id=nullif(btrim(staging.row ->> 'external_campaign_id'),''))
      order by staging.row_index,staging.row_key,staging.id limit v_batch_size)
    delete from public.media_sync_staging_rows as staging using targets where staging.id=targets.id;
    get diagnostics v_affected_rows=row_count;
    if v_affected_rows=0 and v_deleted_rows<v_excluded_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    v_deleted_rows:=v_deleted_rows+v_affected_rows;v_cursor:=v_deleted_rows;v_validated_rows:=v_cursor;
    if v_deleted_rows>v_excluded_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    if v_deleted_rows=v_excluded_rows then v_work_phase:='mutation_reindex';v_cursor:=0;v_validated_rows:=0;end if;
    v_work:=jsonb_build_object('kind',v_kind,'version',v_version,'phase',v_work_phase,'source_rows',v_source_rows,
      'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,'mixed_campaign_count',v_mixed_campaign_count,
      'matched_campaign_count',v_matched_campaign_count,'excluded_impressions',v_excluded_impressions,
      'excluded_clicks',v_excluded_clicks,'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,
      'excluded_revenue',v_excluded_revenue,'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,'reindex_offset',v_reindex_offset,
      'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now where media_job.id=v_job_id and media_job.status='processing'
      and media_job.updated_at=v_job.updated_at and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,v_deleted_rows>0,false,v_source_rows,v_excluded_rows,v_retained_rows,
      v_mixed_campaign_count,v_matched_campaign_count,v_excluded_rows-v_deleted_rows,v_excluded_impressions,v_excluded_clicks,
      v_excluded_cost,v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /* Phase 2f: restore one bounded batch from temporary indexes. */
  if v_work_phase='mutation_reindex' then
    if v_expected_rows<>v_source_rows or v_deleted_rows<>v_excluded_rows or v_reindexed_rows>v_reindex_required_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    with selected as materialized(
      select staging.id,row_number() over(order by staging.row_index,staging.row_key,staging.id)::bigint as batch_rank
      from public.media_sync_staging_rows as staging where staging.job_id=v_job_id and staging.row_index>=v_reindex_offset
      order by staging.row_index,staging.row_key,staging.id limit v_batch_size),
    targets as materialized(select selected.id,v_first_excluded_row_index+v_reindexed_rows+selected.batch_rank-1 as new_row_index from selected)
    update public.media_sync_staging_rows as staging set row_index=targets.new_row_index from targets where staging.id=targets.id;
    get diagnostics v_affected_rows=row_count;
    if v_affected_rows=0 and v_reindexed_rows<v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    v_reindexed_rows:=v_reindexed_rows+v_affected_rows;v_cursor:=v_reindexed_rows;v_validated_rows:=v_cursor;
    if v_reindexed_rows>v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    if v_reindexed_rows=v_reindex_required_rows then v_work_phase:='mutation_verify';v_cursor:=0;v_validated_rows:=0;end if;
    v_work:=jsonb_build_object('kind',v_kind,'version',v_version,'phase',v_work_phase,'source_rows',v_source_rows,
      'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,'mixed_campaign_count',v_mixed_campaign_count,
      'matched_campaign_count',v_matched_campaign_count,'excluded_impressions',v_excluded_impressions,
      'excluded_clicks',v_excluded_clicks,'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,
      'excluded_revenue',v_excluded_revenue,'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,'reindex_offset',v_reindex_offset,
      'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now where media_job.id=v_job_id and media_job.status='processing'
      and media_job.updated_at=v_job.updated_at and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,true,false,v_source_rows,v_excluded_rows,v_retained_rows,
      v_mixed_campaign_count,v_matched_campaign_count,0::bigint,v_excluded_impressions,v_excluded_clicks,v_excluded_cost,
      v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /* Phase 2g: verify bounded mutation before retained validation. */
  if v_work_phase='mutation_verify' then
    if v_expected_rows<>v_source_rows or v_shifted_rows<>v_reindex_required_rows
       or v_deleted_rows<>v_excluded_rows or v_reindexed_rows<>v_reindex_required_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    /*
     * The following retained-validation phase rechecks every surviving row in
     * bounded row_index batches. Avoid a full-table recount and correlated
     * BRAND_SEARCH overlap scan at this transition.
     */
    v_work_phase:='retained_validation';v_cursor:=0;v_validated_rows:=0;
    v_work:=jsonb_build_object('kind',v_kind,'version',v_version,'phase',v_work_phase,
      'source_rows',(v_work ->> 'source_rows')::bigint,'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,
      'mixed_campaign_count',v_mixed_campaign_count,'matched_campaign_count',v_matched_campaign_count,
      'excluded_impressions',v_excluded_impressions,'excluded_clicks',v_excluded_clicks,'excluded_cost',v_excluded_cost,
      'excluded_conversions',v_excluded_conversions,'excluded_revenue',v_excluded_revenue,'cursor',0,'validated_rows',0,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,'reindex_offset',v_reindex_offset,
      'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{raw_rows}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{normalized_rows}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{inserted_rows}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{failed_rows}',to_jsonb(0),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{collector,next_row_index}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set raw_rows=v_retained_rows,normalized_rows=v_retained_rows,
      inserted_rows=v_retained_rows,failed_rows=0,error_detail=v_error_detail,updated_at=v_now
    where media_job.id=v_job_id and media_job.status='processing' and media_job.updated_at=v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,true,false,(v_work ->> 'source_rows')::bigint,
      v_excluded_rows,v_retained_rows,v_mixed_campaign_count,v_matched_campaign_count,0::bigint,
      v_excluded_impressions,v_excluded_clicks,v_excluded_cost,v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /*
   * Phase 3: validate retained rows in bounded row_index batches.
   */
  if v_work_phase = 'retained_validation' then
    if v_expected_rows <> v_retained_rows
       or v_cursor > v_retained_rows
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.*
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id
        and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    )
    select
      count(batch.id)::bigint,
      min(batch.row_index),
      max(batch.row_index),
      count(batch.id) filter (
        where batch.report_id <> v_report_id
           or batch.workspace_id <> v_workspace_id
           or batch.advertiser_id <> v_advertiser_id
           or batch.connection_id <> v_connection_id
           or batch.provider <> v_provider
           or batch.external_account_id <>
              v_external_account_id
           or batch.date_from <> v_date_from
           or batch.date_to <> v_date_to
           or batch.date < v_date_from
           or batch.date > v_date_to
      )::bigint,
      count(batch.id) filter (
        where btrim(batch.row_key) = ''
      )::bigint,
      count(batch.id) filter (
        where batch.row_fingerprint is null
           or batch.row_fingerprint !~ '^[0-9a-f]{64}$'
           or batch.row_fingerprint is distinct from
              encode(
                extensions.digest(
                  pg_catalog.convert_to(
                    batch.row::text,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              )
      )::bigint,
      count(batch.id) filter (
        where jsonb_typeof(batch.row) <> 'object'
           or coalesce(batch.row ->> 'date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'report_date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'day', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'ymd', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'channel', '') <>
              coalesce(batch.channel, '')
           or coalesce(batch.row ->> 'device', '') <>
              coalesce(batch.device, '')
           or coalesce(batch.row ->> 'source', '') <>
              coalesce(batch.source, '')
           or coalesce(batch.row ->> 'provider', '') <>
              'naver_searchad'
           or coalesce(
                batch.row ->> 'external_account_id',
                ''
              ) <> v_external_account_id
           or coalesce(
                batch.row ->> 'ingestion_source',
                ''
              ) <> 'api'
      )::bigint
    into
      v_batch_rows,
      v_batch_min_row_index,
      v_batch_max_row_index,
      v_batch_scope_mismatch_rows,
      v_batch_blank_row_key_rows,
      v_batch_invalid_fingerprint_rows,
      v_batch_canonical_mismatch_rows
    from batch;

    if v_batch_rows > 0
       and (
         v_batch_min_row_index <> v_cursor
         or v_batch_max_row_index <>
            v_cursor + v_batch_rows - 1
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    select count(*)::bigint
    into v_batch_remaining_overlap_rows
    from (
      select staging.row
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id
        and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    ) as retained_batch
    where retained_batch.row ->> 'row_level' = 'keyword'
      and retained_batch.row ->> 'data_level' = 'keyword'
      and retained_batch.row ->> 'row_level_reason' =
          'naver_searchad_registered_keyword_daily_stats'
      and retained_batch.row #>> '{provider_meta,campaign_type}' =
          'BRAND_SEARCH'
      and exists (
        select 1
        from jsonb_array_elements_text(
          v_mixed_campaign_ids
        ) as mixed_campaign(campaign_id)
        where mixed_campaign.campaign_id =
          nullif(
            btrim(
              retained_batch.row ->> 'external_campaign_id'
            ),
            ''
          )
      );

    if v_batch_remaining_overlap_rows <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    v_cursor :=
      v_cursor + v_batch_rows;
    v_validated_rows :=
      v_validated_rows + v_batch_rows;
    v_retained_scope_mismatch_rows :=
      v_retained_scope_mismatch_rows +
      v_batch_scope_mismatch_rows;
    v_retained_blank_row_key_rows :=
      v_retained_blank_row_key_rows +
      v_batch_blank_row_key_rows;
    v_retained_invalid_fingerprint_rows :=
      v_retained_invalid_fingerprint_rows +
      v_batch_invalid_fingerprint_rows;
    v_retained_canonical_mismatch_rows :=
      v_retained_canonical_mismatch_rows +
      v_batch_canonical_mismatch_rows;

    if v_cursor > v_retained_rows
       or v_validated_rows <> v_cursor
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    if v_cursor = v_retained_rows then
      if v_retained_scope_mismatch_rows <> 0
         or v_retained_blank_row_key_rows <> 0
         or v_retained_invalid_fingerprint_rows <> 0
         or v_retained_canonical_mismatch_rows <> 0
      then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_POSTCONDITION_FAILED';
      end if;

      v_work_phase :=
        'finalization';
      v_cursor := 0;
      v_validated_rows := 0;
    elsif v_batch_rows = 0 then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    v_work :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'phase', v_work_phase,
        'source_rows',
          (v_work ->> 'source_rows')::bigint,
        'excluded_rows', v_excluded_rows,
        'retained_rows', v_retained_rows,
        'mixed_campaign_count', v_mixed_campaign_count,
        'matched_campaign_count', v_matched_campaign_count,
        'excluded_impressions', v_excluded_impressions,
        'excluded_clicks', v_excluded_clicks,
        'excluded_cost', v_excluded_cost,
        'excluded_conversions', v_excluded_conversions,
        'excluded_revenue', v_excluded_revenue,
        'cursor', v_cursor,
        'validated_rows', v_validated_rows,
        'source_scope_mismatch_rows',
          v_source_scope_mismatch_rows,
        'source_blank_row_key_rows',
          v_source_blank_row_key_rows,
        'source_invalid_fingerprint_rows',
          v_source_invalid_fingerprint_rows,
        'source_canonical_mismatch_rows',
          v_source_canonical_mismatch_rows,
        'retained_scope_mismatch_rows',
          v_retained_scope_mismatch_rows,
        'retained_blank_row_key_rows',
          v_retained_blank_row_key_rows,
        'retained_invalid_fingerprint_rows',
          v_retained_invalid_fingerprint_rows,
        'retained_canonical_mismatch_rows',
          v_retained_canonical_mismatch_rows,
        'reindex_required_rows', v_reindex_required_rows,
        'first_excluded_row_index', v_first_excluded_row_index,
        'reindex_offset', v_reindex_offset,
        'shifted_rows', v_shifted_rows,
        'deleted_rows', v_deleted_rows,
        'reindexed_rows', v_reindexed_rows,
        'mixed_campaign_ids', v_mixed_campaign_ids,
        'matched_campaign_ids', v_matched_campaign_ids,
        'batch_size', v_batch_size,
        'started_at', to_jsonb(v_work_started_at),
        'updated_at', to_jsonb(v_now)
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{saved_at}',
        to_jsonb(v_now),
        true
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{reconciliation_work}',
        v_work,
        true
      );

    v_error_detail :=
      jsonb_set(
        v_job.error_detail,
        '{processing_checkpoint}',
        v_checkpoint,
        true
      );

    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail,
        updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '40001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select media_job.*
    into v_updated_job
    from public.media_sync_jobs as media_job
    where media_job.id = v_job_id;

    return query
    select
      to_jsonb(v_updated_job),
      v_kind,
      v_version,
      v_excluded_rows > 0,
      false,
      (v_work ->> 'source_rows')::bigint,
      v_excluded_rows,
      v_retained_rows,
      v_mixed_campaign_count,
      v_matched_campaign_count,
      0::bigint,
      v_excluded_impressions,
      v_excluded_clicks,
      v_excluded_cost,
      v_excluded_conversions,
      v_excluded_revenue;

    return;
  end if;

  /*
   * Phase 4: commit the unchanged final reconciliation audit contract.
   */
  if v_work_phase = 'finalization' then
    if v_expected_rows <> v_retained_rows
       or v_cursor <> 0
       or v_validated_rows <> 0
       or v_source_scope_mismatch_rows <> 0
       or v_source_blank_row_key_rows <> 0
       or v_source_invalid_fingerprint_rows <> 0
       or v_source_canonical_mismatch_rows <> 0
       or v_retained_scope_mismatch_rows <> 0
       or v_retained_blank_row_key_rows <> 0
       or v_retained_invalid_fingerprint_rows <> 0
       or v_retained_canonical_mismatch_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    /*
     * Source and retained validation already proved every row in bounded
     * batches, including the absence of a remaining BRAND_SEARCH overlap.
     * Finalization therefore commits only that completed proof instead of
     * rescanning the entire staging set under a 60-second statement timeout.
     */
    v_remaining_overlap_rows := 0;

    v_reconciliation :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'source_rows',
          (v_work ->> 'source_rows')::bigint,
        'excluded_rows', v_excluded_rows,
        'retained_rows', v_retained_rows,
        'mixed_campaign_count', v_mixed_campaign_count,
        'matched_campaign_count', v_matched_campaign_count,
        'excluded_impressions', v_excluded_impressions,
        'excluded_clicks', v_excluded_clicks,
        'excluded_cost', v_excluded_cost,
        'excluded_conversions', v_excluded_conversions,
        'excluded_revenue', v_excluded_revenue,
        'applied_at', to_jsonb(v_now)
      );

    v_checkpoint :=
      v_checkpoint - 'reconciliation_work';

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{saved_at}',
        to_jsonb(v_now),
        true
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{reconciliation}',
        v_reconciliation,
        true
      );

    v_error_detail :=
      jsonb_set(
        v_job.error_detail,
        '{processing_checkpoint}',
        v_checkpoint,
        true
      );

    update public.media_sync_jobs as media_job
    set raw_rows = v_retained_rows,
        normalized_rows = v_retained_rows,
        inserted_rows = v_retained_rows,
        failed_rows = 0,
        error_detail = v_error_detail,
        updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '40001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select media_job.*
    into v_updated_job
    from public.media_sync_jobs as media_job
    where media_job.id = v_job_id;

    if not found
       or v_updated_job.status <> 'processing'
       or v_updated_job.snapshot_ingestion_id is not null
       or v_updated_job.finished_at is not null
       or v_updated_job.raw_rows <> v_retained_rows
       or v_updated_job.normalized_rows <> v_retained_rows
       or v_updated_job.inserted_rows <> v_retained_rows
       or v_updated_job.failed_rows <> 0
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,phase}'
            is distinct from 'completed'
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,next_row_index}'
            is distinct from v_retained_rows::text
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,keyword,complete}'
            is distinct from 'true'
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,authoritative,complete}'
            is distinct from 'true'
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,reconciliation,kind}'
            is distinct from v_kind
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,reconciliation,version}'
            is distinct from v_version::text
       or v_updated_job.error_detail
            #> '{processing_checkpoint,reconciliation_work}'
            is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    return query
    select
      to_jsonb(v_updated_job),
      v_kind,
      v_version,
      v_excluded_rows > 0,
      false,
      (v_reconciliation ->> 'source_rows')::bigint,
      v_excluded_rows,
      v_retained_rows,
      v_mixed_campaign_count,
      v_matched_campaign_count,
      v_remaining_overlap_rows,
      v_excluded_impressions,
      v_excluded_clicks,
      v_excluded_cost,
      v_excluded_conversions,
      v_excluded_revenue;

    return;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'NSBGR_RECONCILIATION_CONFLICT';
end;
$function$;

alter function
  public.reconcile_naver_searchads_brand_search_cross_grain_staging(jsonb)
owner to postgres;

revoke all
on function public.reconcile_naver_searchads_brand_search_cross_grain_staging(jsonb)
from public;

revoke all
on function public.reconcile_naver_searchads_brand_search_cross_grain_staging(jsonb)
from anon;

revoke all
on function public.reconcile_naver_searchads_brand_search_cross_grain_staging(jsonb)
from authenticated;

grant execute
on function public.reconcile_naver_searchads_brand_search_cross_grain_staging(jsonb)
to service_role;

commit;
