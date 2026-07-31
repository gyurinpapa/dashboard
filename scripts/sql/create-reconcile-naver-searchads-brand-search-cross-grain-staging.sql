begin;

/*
 * Etrylue Performance
 * Naver Search Ads BRAND_SEARCH cross-grain staging reconciliation
 *
 * Runtime boundary:
 *   completed keyword + authoritative checkpoint
 *   -> this reconciliation RPC
 *   -> combined staging summary
 *   -> materialization / activation / finalization
 *
 * The RPC mutates only:
 * - public.media_sync_staging_rows for the claimed processing job;
 * - the same public.media_sync_jobs row counters and processing checkpoint.
 *
 * It never calls a materialization, activation, finalization, or publish RPC.
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

  v_checkpoint jsonb;
  v_reconciliation jsonb;
  v_error_detail jsonb;
  v_now timestamptz :=
    pg_catalog.clock_timestamp();

  v_source_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;

  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_invalid_fingerprint_rows bigint := 0;
  v_canonical_mismatch_rows bigint := 0;

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
  v_affected_rows bigint := 0;
  v_preservation_mismatch_rows bigint := 0;

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
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_INVALID_INPUT';
  end if;

  /*
   * Every append/checkpoint operation serializes through the same job row.
   * FOR UPDATE therefore closes the staging writer boundary before any scan.
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
   * Idempotent response after a committed first call whose client response was
   * lost. The audit record is the source of the original/excluded counts;
   * persisted staging and completed checkpoint are revalidated before return.
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
       or v_existing_excluded_impressions < 0
       or v_existing_excluded_clicks < 0
       or v_existing_excluded_cost < 0
       or v_existing_excluded_conversions < 0
       or v_existing_excluded_revenue < 0
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
      )::bigint,

      count(staging.id) filter (
        where staging.row_fingerprint is null
           or staging.row_fingerprint !~ '^[0-9a-f]{64}$'
           or staging.row_fingerprint is distinct from
              encode(
                extensions.digest(
                  pg_catalog.convert_to(
                    staging.row::text,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              )
      )::bigint,

      count(staging.id) filter (
        where jsonb_typeof(staging.row) <> 'object'
           or coalesce(staging.row ->> 'date', '') <>
              staging.date::text
           or coalesce(staging.row ->> 'report_date', '') <>
              staging.date::text
           or coalesce(staging.row ->> 'day', '') <>
              staging.date::text
           or coalesce(staging.row ->> 'ymd', '') <>
              staging.date::text
           or coalesce(staging.row ->> 'channel', '') <>
              coalesce(staging.channel, '')
           or coalesce(staging.row ->> 'device', '') <>
              coalesce(staging.device, '')
           or coalesce(staging.row ->> 'source', '') <>
              coalesce(staging.source, '')
           or coalesce(staging.row ->> 'provider', '') <>
              'naver_searchad'
           or coalesce(
                staging.row ->> 'external_account_id',
                ''
              ) <> v_external_account_id
           or coalesce(
                staging.row ->> 'ingestion_source',
                ''
              ) <> 'api'
      )::bigint
    into
      v_source_rows,
      v_min_row_index,
      v_max_row_index,
      v_distinct_row_indexes,
      v_scope_mismatch_rows,
      v_blank_row_key_rows,
      v_invalid_fingerprint_rows,
      v_canonical_mismatch_rows
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
       or v_invalid_fingerprint_rows <> 0
       or v_canonical_mismatch_rows <> 0
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
    )::bigint,

    count(staging.id) filter (
      where staging.row_fingerprint is null
         or staging.row_fingerprint !~ '^[0-9a-f]{64}$'
         or staging.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(
                  staging.row::text,
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            )
    )::bigint,

    count(staging.id) filter (
      where jsonb_typeof(staging.row) <> 'object'
         or coalesce(staging.row ->> 'date', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'report_date', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'day', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'ymd', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'channel', '') <>
            coalesce(staging.channel, '')
         or coalesce(staging.row ->> 'device', '') <>
            coalesce(staging.device, '')
         or coalesce(staging.row ->> 'source', '') <>
            coalesce(staging.source, '')
         or coalesce(staging.row ->> 'provider', '') <>
            'naver_searchad'
         or coalesce(
              staging.row ->> 'external_account_id',
              ''
            ) <> v_external_account_id
         or coalesce(
              staging.row ->> 'ingestion_source',
              ''
            ) <> 'api'
    )::bigint
  into
    v_source_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_invalid_fingerprint_rows,
    v_canonical_mismatch_rows
  from public.media_sync_staging_rows as staging
  where staging.job_id = v_job_id;

  if v_source_rows <> v_expected_rows
     or v_distinct_row_indexes <> v_expected_rows
     or (
       v_expected_rows = 0
       and (
         v_min_row_index is not null
         or v_max_row_index is not null
       )
     )
     or (
       v_expected_rows > 0
       and (
         v_min_row_index <> 0
         or v_max_row_index <> v_expected_rows - 1
       )
     )
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_invalid_fingerprint_rows <> 0
     or v_canonical_mismatch_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_STAGING_CHANGED';
  end if;

  drop table if exists pg_temp.nsbgr_mixed_campaigns;
  drop table if exists pg_temp.nsbgr_row_map;

  create temporary table nsbgr_mixed_campaigns
  on commit drop
  as
  select distinct
    nullif(
      btrim(
        staging.row ->> 'external_campaign_id'
      ),
      ''
    ) as campaign_id
  from public.media_sync_staging_rows as staging
  where staging.job_id = v_job_id
    and staging.row ->> 'row_level' = 'mixed'
    and staging.row ->> 'data_level' = 'mixed'
    and staging.row ->> 'row_level_reason' =
        'naver_searchad_brand_search_adgroup_daily_stats'
    and staging.row #>> '{provider_meta,campaign_type}' =
        'BRAND_SEARCH'
    and staging.row #>> '{provider_meta,authoritative_grain}' =
        'adgroup'
    and nullif(
          btrim(
            staging.row ->> 'external_campaign_id'
          ),
          ''
        ) is not null;

  select count(*)::bigint
  into v_mixed_campaign_count
  from pg_temp.nsbgr_mixed_campaigns;

  create temporary table nsbgr_row_map
  on commit drop
  as
  with classified as (
    select
      staging.id as staging_id,
      staging.row_index as old_row_index,
      staging.row_key,
      staging.row_fingerprint,
      staging.date_window_index,
      nullif(
        btrim(
          staging.row ->> 'external_campaign_id'
        ),
        ''
      ) as campaign_id,
      staging.row,

      (
        staging.row ->> 'row_level' = 'keyword'
        and staging.row ->> 'data_level' = 'keyword'
        and staging.row ->> 'row_level_reason' =
            'naver_searchad_registered_keyword_daily_stats'
        and staging.row #>> '{provider_meta,campaign_type}' =
            'BRAND_SEARCH'
        and exists (
          select 1
          from pg_temp.nsbgr_mixed_campaigns as mixed_campaign
          where mixed_campaign.campaign_id =
            nullif(
              btrim(
                staging.row ->> 'external_campaign_id'
              ),
              ''
            )
        )
      ) as excluded
    from public.media_sync_staging_rows as staging
    where staging.job_id = v_job_id
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
    on kept.staging_id =
       classified.staging_id;

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
    v_excluded_impressions,
    v_excluded_clicks,
    v_excluded_cost,
    v_excluded_conversions,
    v_excluded_revenue
  from pg_temp.nsbgr_row_map as row_map;

  if v_excluded_rows < 0
     or v_retained_rows < 0
     or v_reindex_required_rows < 0
     or v_reindex_required_rows >
        v_retained_rows
     or v_excluded_rows + v_retained_rows <>
        v_source_rows
     or v_matched_campaign_count >
        v_mixed_campaign_count
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_RECONCILIATION_CONFLICT';
  end if;

  if v_excluded_rows > 0 then
    /*
     * Move persisted indexes into a disjoint range first. This avoids an
     * immediate unique conflict on (job_id, row_index) while compacting.
     */
    v_reindex_offset :=
      v_source_rows + 1;

    update public.media_sync_staging_rows as staging
    set row_index =
      staging.row_index + v_reindex_offset
    from pg_temp.nsbgr_row_map as row_map
    where staging.id = row_map.staging_id
      and not row_map.excluded
      and row_map.old_row_index is distinct from
          row_map.new_row_index;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> v_reindex_required_rows then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    delete from public.media_sync_staging_rows as staging
    using pg_temp.nsbgr_row_map as row_map
    where staging.id = row_map.staging_id
      and row_map.excluded;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> v_excluded_rows then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    update public.media_sync_staging_rows as staging
    set row_index =
      row_map.new_row_index
    from pg_temp.nsbgr_row_map as row_map
    where staging.id = row_map.staging_id
      and not row_map.excluded
      and row_map.old_row_index is distinct from
          row_map.new_row_index;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> v_reindex_required_rows then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;
  end if;

  select count(*)::bigint
  into v_preservation_mismatch_rows
  from public.media_sync_staging_rows as staging
  join pg_temp.nsbgr_row_map as row_map
    on row_map.staging_id = staging.id
  where staging.job_id = v_job_id
    and not row_map.excluded
    and (
      staging.row_key is distinct from
        row_map.row_key
      or staging.row_fingerprint is distinct from
        row_map.row_fingerprint
      or staging.date_window_index is distinct from
        row_map.date_window_index
      or staging.row is distinct from
        row_map.row
      or staging.row_index is distinct from
        row_map.new_row_index
    );

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
    )::bigint,

    count(staging.id) filter (
      where staging.row_fingerprint is null
         or staging.row_fingerprint !~ '^[0-9a-f]{64}$'
         or staging.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(
                  staging.row::text,
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            )
    )::bigint,

    count(staging.id) filter (
      where jsonb_typeof(staging.row) <> 'object'
         or coalesce(staging.row ->> 'date', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'report_date', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'day', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'ymd', '') <>
            staging.date::text
         or coalesce(staging.row ->> 'channel', '') <>
            coalesce(staging.channel, '')
         or coalesce(staging.row ->> 'device', '') <>
            coalesce(staging.device, '')
         or coalesce(staging.row ->> 'source', '') <>
            coalesce(staging.source, '')
         or coalesce(staging.row ->> 'provider', '') <>
            'naver_searchad'
         or coalesce(
              staging.row ->> 'external_account_id',
              ''
            ) <> v_external_account_id
         or coalesce(
              staging.row ->> 'ingestion_source',
              ''
            ) <> 'api'
    )::bigint
  into
    v_source_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_invalid_fingerprint_rows,
    v_canonical_mismatch_rows
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

  if v_preservation_mismatch_rows <> 0
     or v_source_rows <> v_retained_rows
     or v_distinct_row_indexes <> v_retained_rows
     or (
       v_retained_rows = 0
       and (
         v_min_row_index is not null
         or v_max_row_index is not null
       )
     )
     or (
       v_retained_rows > 0
       and (
         v_min_row_index <> 0
         or v_max_row_index <> v_retained_rows - 1
       )
     )
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_invalid_fingerprint_rows <> 0
     or v_canonical_mismatch_rows <> 0
     or v_remaining_overlap_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_POSTCONDITION_FAILED';
  end if;

  v_reconciliation :=
    jsonb_build_object(
      'kind', v_kind,
      'version', v_version,
      'source_rows', v_expected_rows,
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
    jsonb_set(
      v_checkpoint,
      '{saved_at}',
      to_jsonb(v_now),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{raw_rows}',
      to_jsonb(v_retained_rows),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{normalized_rows}',
      to_jsonb(v_retained_rows),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{inserted_rows}',
      to_jsonb(v_retained_rows),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{failed_rows}',
      to_jsonb(0),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{collector,next_row_index}',
      to_jsonb(v_retained_rows),
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
    v_expected_rows,
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
end;
$function$;

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