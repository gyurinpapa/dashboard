/*
 * Etrylue Performance
 * ONE-TIME ATOMIC REPAIR
 *
 * Exact operation:
 * - candidate job ID remains unchanged
 * - source job and source staging remain unchanged
 * - remove only 1,204 overlapping BRAND_SEARCH keyword rows
 * - preserve all creative rows and all authoritative mixed rows
 * - compact remaining candidate row_index to 0..44,603
 * - update only the candidate job checkpoint/counters/recovery contract
 *
 * Sentinel contract:
 * - hashes canonical report_rows.row JSON only;
 * - excludes row UUID, ingestion UUID, created_at, and other storage metadata.
 *
 * Explicitly forbidden:
 * - no materialization RPC
 * - no activation RPC
 * - no finalization RPC
 * - no reports update
 * - no report_rows mutation
 * - no report_ingestions mutation
 * - no source job or source staging mutation
 *
 * DO NOT EXECUTE until:
 * 1) the static contract fixture passes;
 * 2) the read-only preflight returns safe_to_execute_exact_brand_overlap_repair=true.
 */

begin;

set local lock_timeout = '5s';
set local statement_timeout = '600s';

create temporary table exact_naver_brand_overlap_repair_result (
  repaired boolean not null,
  candidate_job_id uuid not null,
  previous_candidate_updated_at timestamptz not null,
  repaired_candidate_updated_at timestamptz not null,
  previous_confirmation_token text not null,
  repaired_confirmation_token text not null,
  original_candidate_rows bigint not null,
  excluded_rows bigint not null,
  repaired_candidate_rows bigint not null,
  keyword_rows bigint not null,
  creative_rows bigint not null,
  mixed_rows bigint not null,
  total_impressions numeric not null,
  total_clicks numeric not null,
  total_cost numeric not null,
  total_conversions numeric not null,
  total_revenue numeric not null,
  repaired_staging_fingerprint text not null,
  current_ingestion_id uuid not null,
  published_ingestion_id uuid not null,
  materialization_called boolean not null,
  activation_called boolean not null,
  finalization_called boolean not null
) on commit drop;

do $repair$
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

  v_current_ingestion_id constant uuid :=
    '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid;

  v_published_ingestion_id constant uuid :=
    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid;

  v_expected_candidate_updated_at constant timestamptz :=
    '2026-07-22 00:27:59.363+00'::timestamptz;

  v_expected_source_job_updated_at constant timestamptz :=
    '2026-07-19 11:59:16.834+00'::timestamptz;

  v_expected_confirmation_token constant text :=
    '31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127';

  v_expected_source_identity_digest constant text :=
    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40';

  v_expected_candidate_fingerprint constant text :=
    'f11def9d7faa36e7233878a5cb533c048c17225f519324de80c289f5d8e4ad28';

  v_expected_report_ingestions_descriptor_digest constant text :=
    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776';

  v_expected_current_sentinel_digest constant text :=
    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7';

  v_expected_published_sentinel_digest constant text :=
    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0';

  v_expected_attempt_count constant bigint := 12;
  v_expected_source_job_rows constant bigint := 44500;
  v_expected_source_staging_rows constant bigint := 44514;
  v_expected_candidate_rows constant bigint := 45808;
  v_expected_excluded_rows constant bigint := 1204;
  v_expected_repaired_rows constant bigint := 44604;

  v_expected_keyword_rows constant bigint := 43310;
  v_expected_creative_rows constant bigint := 1244;
  v_expected_mixed_rows constant bigint := 50;

  v_expected_before_impressions constant numeric := 9707;
  v_expected_before_clicks constant numeric := 2275;
  v_expected_before_cost constant numeric := 113850;
  v_expected_before_conversions constant numeric := 132;
  v_expected_before_revenue constant numeric := 20368600;

  v_expected_excluded_impressions constant numeric := 2632;
  v_expected_excluded_clicks constant numeric := 1092;
  v_expected_excluded_cost constant numeric := 0;
  v_expected_excluded_conversions constant numeric := 65;
  v_expected_excluded_revenue constant numeric := 7639300;

  v_expected_after_impressions constant numeric := 7075;
  v_expected_after_clicks constant numeric := 1183;
  v_expected_after_cost constant numeric := 113850;
  v_expected_after_conversions constant numeric := 67;
  v_expected_after_revenue constant numeric := 12729300;

  v_expected_total_report_rows constant bigint := 359716;
  v_expected_current_report_rows constant bigint := 118;
  v_expected_published_report_rows constant bigint := 44514;
  v_expected_report_ingestions_count constant bigint := 11;

  v_fingerprint_block_size constant bigint := 10000;

  v_candidate public.media_sync_jobs%rowtype;
  v_source_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;

  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reindex_offset bigint;

  v_active_job_count bigint;
  v_unique_constraint_count bigint;
  v_unique_constraints_validated boolean;

  v_source_rows bigint;
  v_source_min_row_index bigint;
  v_source_max_row_index bigint;
  v_source_invalid_fingerprint_rows bigint;
  v_source_identity_digest text;

  v_candidate_rows bigint;
  v_candidate_min_row_index bigint;
  v_candidate_max_row_index bigint;
  v_candidate_distinct_row_indexes bigint;
  v_candidate_invalid_fingerprint_rows bigint;

  v_excluded_rows bigint;
  v_repaired_rows bigint;
  v_matched_campaign_count bigint;
  v_mixed_campaign_count bigint;
  v_mixed_only_campaign_count bigint;
  v_unexpected_overlap_rows bigint;

  v_before_impressions numeric;
  v_before_clicks numeric;
  v_before_cost numeric;
  v_before_conversions numeric;
  v_before_revenue numeric;

  v_excluded_impressions numeric;
  v_excluded_clicks numeric;
  v_excluded_cost numeric;
  v_excluded_conversions numeric;
  v_excluded_revenue numeric;

  v_keyword_rows bigint;
  v_creative_rows bigint;
  v_mixed_rows bigint;
  v_scope_mismatch_rows bigint;
  v_canonical_mismatch_rows bigint;
  v_overlap_rows_after bigint;

  v_after_impressions numeric;
  v_after_clicks numeric;
  v_after_cost numeric;
  v_after_conversions numeric;
  v_after_revenue numeric;

  v_pre_fingerprint_rows bigint;
  v_pre_fingerprint text;
  v_repaired_fingerprint_rows bigint;
  v_repaired_fingerprint text;

  v_report_rows_count bigint;
  v_current_report_rows bigint;
  v_published_report_rows bigint;
  v_report_ingestions_count bigint;
  v_report_ingestions_descriptor_digest text;
  v_current_sentinel_count bigint;
  v_current_sentinel_digest text;
  v_published_sentinel_count bigint;
  v_published_sentinel_digest text;

  v_checkpoint jsonb;
  v_recovery jsonb;
  v_repaired_confirmation_token text;
  v_updated_rows bigint;
begin
  select job.*
    into v_candidate
    from public.media_sync_jobs as job
   where job.id = v_candidate_job_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'EXACT_REPAIR_CANDIDATE_NOT_FOUND';
  end if;

  if v_candidate.report_id <> v_report_id
     or v_candidate.workspace_id <> v_workspace_id
     or v_candidate.advertiser_id <> v_advertiser_id
     or v_candidate.connection_id <> v_connection_id
     or v_candidate.provider <> 'naver_searchad'
     or v_candidate.status <> 'cancelled'
     or v_candidate.progress <> 99
     or v_candidate.attempt_count <> v_expected_attempt_count
     or v_candidate.updated_at is distinct from
        v_expected_candidate_updated_at
     or v_candidate.raw_rows <> v_expected_candidate_rows
     or v_candidate.normalized_rows <> v_expected_candidate_rows
     or v_candidate.inserted_rows <> v_expected_candidate_rows
     or v_candidate.failed_rows <> 0
     or v_candidate.previous_ingestion_id is distinct from
        v_current_ingestion_id
     or v_candidate.snapshot_ingestion_id is not null
     or v_candidate.error is not null
     or v_candidate.started_at is not null
     or v_candidate.finished_at is not null then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_CANDIDATE_STATE_MISMATCH';
  end if;

  if v_candidate.error_detail
       #>> '{processing_checkpoint,collector,phase}'
       is distinct from 'completed'
     or v_candidate.error_detail
       #>> '{processing_checkpoint,collector,next_row_index}'
       is distinct from v_expected_candidate_rows::text
     or v_candidate.error_detail
       #>> '{processing_checkpoint,inserted_rows}'
       is distinct from v_expected_candidate_rows::text
     or v_candidate.error_detail
       #>> '{processing_checkpoint,collector,keyword,complete}'
       is distinct from 'true'
     or v_candidate.error_detail
       #>> '{processing_checkpoint,collector,authoritative,complete}'
       is distinct from 'true'
     or v_candidate.error_detail
       #>> '{processing_checkpoint,recovery,confirmation_token}'
       is distinct from v_expected_confirmation_token then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_COMPLETED_CHECKPOINT_MISMATCH';
  end if;

  select report.*
    into v_report
    from public.reports as report
   where report.id = v_report_id
   for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'EXACT_REPAIR_REPORT_NOT_FOUND';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
     or v_report.current_ingestion_id is distinct from
        v_current_ingestion_id
     or v_report.published_ingestion_id is distinct from
        v_published_ingestion_id then
    raise exception using
      errcode = '40001',
      message = 'EXACT_REPAIR_REPORT_POINTER_CHANGED';
  end if;

  select job.*
    into v_source_job
    from public.media_sync_jobs as job
   where job.id = v_source_job_id
   for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'EXACT_REPAIR_SOURCE_JOB_NOT_FOUND';
  end if;

  if v_source_job.report_id <> v_report_id
     or v_source_job.workspace_id <> v_workspace_id
     or v_source_job.advertiser_id <> v_advertiser_id
     or v_source_job.connection_id <> v_connection_id
     or v_source_job.provider <> 'naver_searchad'
     or v_source_job.status <> 'failed'
     or v_source_job.updated_at is distinct from
        v_expected_source_job_updated_at
     or v_source_job.raw_rows <> v_expected_source_job_rows
     or v_source_job.normalized_rows <> v_expected_source_job_rows
     or v_source_job.inserted_rows <> v_expected_source_job_rows
     or v_source_job.failed_rows <> 0
     or v_source_job.snapshot_ingestion_id is not null then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_SOURCE_JOB_STATE_MISMATCH';
  end if;

  select count(*)::bigint
    into v_active_job_count
    from public.media_sync_jobs as active_job
   where active_job.report_id = v_report_id
     and active_job.status in ('pending', 'processing');

  if v_active_job_count <> 0 then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_ACTIVE_JOB_EXISTS';
  end if;

  select
    count(*)::bigint,
    coalesce(bool_and(c.convalidated), false)
  into
    v_unique_constraint_count,
    v_unique_constraints_validated
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.media_sync_staging_rows'::regclass
    and c.contype = 'u'
    and c.conname in (
      'media_sync_staging_rows_job_row_index_unique',
      'media_sync_staging_rows_job_window_row_key_unique'
    );

  if v_unique_constraint_count <> 2
     or not v_unique_constraints_validated then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_STAGING_UNIQUE_CONTRACT_MISSING';
  end if;

  /*
   * Lock only this candidate's staging rows.
   * No generic worker or other job is claimed.
   */
  perform 1
    from public.media_sync_staging_rows as s
   where s.job_id = v_candidate_job_id
   order by s.row_index
   for update;

  select
    count(s.id)::bigint,
    min(s.row_index)::bigint,
    max(s.row_index)::bigint,
    count(s.id) filter (
      where s.row_fingerprint is null
         or s.row_fingerprint !~ '^[0-9a-f]{64}$'
         or s.row is null
         or s.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(s.row::text, 'UTF8'),
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
              s.row_index::text || ',' ||
              s.date_window_index::text || ',' ||
              to_json(s.date::text)::text || ',' ||
              to_json(s.row_key)::text || ',' ||
              to_json(s.row_fingerprint)::text ||
              E']\n',
              ''
              order by s.row_index, s.row_key
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
    v_source_invalid_fingerprint_rows,
    v_source_identity_digest
  from public.media_sync_staging_rows as s
  where s.job_id = v_source_job_id;

  if v_source_rows <> v_expected_source_staging_rows
     or v_source_min_row_index <> 0
     or v_source_max_row_index <>
        v_expected_source_staging_rows - 1
     or v_source_invalid_fingerprint_rows <> 0
     or v_source_identity_digest <>
        v_expected_source_identity_digest then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_SOURCE_STAGING_CHANGED';
  end if;

  create temporary table exact_repair_mixed_campaigns
  on commit drop
  as
  select distinct
    nullif(btrim(s.row ->> 'external_campaign_id'), '') as campaign_id
  from public.media_sync_staging_rows as s
  where s.job_id = v_candidate_job_id
    and s.row ->> 'row_level' = 'mixed'
    and s.row ->> 'data_level' = 'mixed'
    and s.row ->> 'row_level_reason' =
        'naver_searchad_brand_search_adgroup_daily_stats'
    and nullif(btrim(s.row ->> 'external_campaign_id'), '') is not null;

  select count(*)::bigint
    into v_mixed_campaign_count
    from exact_repair_mixed_campaigns;

  create temporary table exact_repair_row_map
  on commit drop
  as
  with classified as (
    select
      s.id as staging_id,
      s.row_index as old_row_index,
      s.row_key,
      s.row_fingerprint,
      nullif(btrim(s.row ->> 'external_campaign_id'), '') as campaign_id,
      s.row,

      (
        s.row_index < v_expected_source_staging_rows
        and s.row ->> 'row_level' = 'keyword'
        and s.row ->> 'data_level' = 'keyword'
        and s.row ->> 'row_level_reason' =
            'naver_searchad_registered_keyword_daily_stats'
        and s.row #>> '{provider_meta,campaign_type}' = 'BRAND_SEARCH'
        and exists (
          select 1
          from exact_repair_mixed_campaigns as m
          where m.campaign_id =
            nullif(btrim(s.row ->> 'external_campaign_id'), '')
        )
      ) as excluded
    from public.media_sync_staging_rows as s
    where s.job_id = v_candidate_job_id
  ),

  kept as (
    select
      c.staging_id,
      (
        row_number() over (
          order by c.old_row_index, c.row_key
        ) - 1
      )::bigint as new_row_index
    from classified as c
    where not c.excluded
  )

  select
    c.staging_id,
    c.old_row_index,
    c.row_key,
    c.row_fingerprint,
    c.campaign_id,
    c.row,
    c.excluded,
    kept.new_row_index
  from classified as c
  left join kept
    on kept.staging_id = c.staging_id;

  select
    count(*)::bigint,
    min(m.old_row_index)::bigint,
    max(m.old_row_index)::bigint,
    count(distinct m.old_row_index)::bigint,
    count(*) filter (where m.excluded)::bigint,
    count(*) filter (where not m.excluded)::bigint,
    count(distinct m.campaign_id)
      filter (where m.excluded)::bigint,

    count(*) filter (
      where m.row_fingerprint is null
         or m.row_fingerprint !~ '^[0-9a-f]{64}$'
         or m.row is null
         or m.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(m.row::text, 'UTF8'),
                'sha256'
              ),
              'hex'
            )
    )::bigint,

    coalesce(sum((m.row ->> 'impressions')::numeric), 0),
    coalesce(sum((m.row ->> 'clicks')::numeric), 0),
    coalesce(sum((m.row ->> 'cost')::numeric), 0),
    coalesce(sum((m.row ->> 'conversions')::numeric), 0),
    coalesce(sum((m.row ->> 'revenue')::numeric), 0),

    coalesce(sum((m.row ->> 'impressions')::numeric)
      filter (where m.excluded), 0),
    coalesce(sum((m.row ->> 'clicks')::numeric)
      filter (where m.excluded), 0),
    coalesce(sum((m.row ->> 'cost')::numeric)
      filter (where m.excluded), 0),
    coalesce(sum((m.row ->> 'conversions')::numeric)
      filter (where m.excluded), 0),
    coalesce(sum((m.row ->> 'revenue')::numeric)
      filter (where m.excluded), 0)
  into
    v_candidate_rows,
    v_candidate_min_row_index,
    v_candidate_max_row_index,
    v_candidate_distinct_row_indexes,
    v_excluded_rows,
    v_repaired_rows,
    v_matched_campaign_count,
    v_candidate_invalid_fingerprint_rows,
    v_before_impressions,
    v_before_clicks,
    v_before_cost,
    v_before_conversions,
    v_before_revenue,
    v_excluded_impressions,
    v_excluded_clicks,
    v_excluded_cost,
    v_excluded_conversions,
    v_excluded_revenue
  from exact_repair_row_map as m;

  select count(*)::bigint
    into v_mixed_only_campaign_count
    from exact_repair_mixed_campaigns as m
   where not exists (
     select 1
       from exact_repair_row_map as row_map
      where row_map.excluded
        and row_map.campaign_id = m.campaign_id
   );

  select count(*)::bigint
    into v_unexpected_overlap_rows
    from public.media_sync_staging_rows as s
   where s.job_id = v_candidate_job_id
     and s.row_index < v_expected_source_staging_rows
     and exists (
       select 1
         from exact_repair_mixed_campaigns as m
        where m.campaign_id =
          nullif(btrim(s.row ->> 'external_campaign_id'), '')
     )
     and not (
       s.row ->> 'row_level' = 'keyword'
       and s.row ->> 'data_level' = 'keyword'
       and s.row ->> 'row_level_reason' =
           'naver_searchad_registered_keyword_daily_stats'
       and s.row #>> '{provider_meta,campaign_type}' = 'BRAND_SEARCH'
     );

  if v_candidate_rows <> v_expected_candidate_rows
     or v_candidate_min_row_index <> 0
     or v_candidate_max_row_index <>
        v_expected_candidate_rows - 1
     or v_candidate_distinct_row_indexes <>
        v_expected_candidate_rows
     or v_excluded_rows <> v_expected_excluded_rows
     or v_repaired_rows <> v_expected_repaired_rows
     or v_matched_campaign_count <> 3
     or v_mixed_campaign_count <> 5
     or v_mixed_only_campaign_count <> 2
     or v_unexpected_overlap_rows <> 0
     or v_candidate_invalid_fingerprint_rows <> 0 then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_OVERLAP_SCOPE_MISMATCH';
  end if;

  if v_before_impressions <> v_expected_before_impressions
     or v_before_clicks <> v_expected_before_clicks
     or v_before_cost <> v_expected_before_cost
     or v_before_conversions <> v_expected_before_conversions
     or v_before_revenue <> v_expected_before_revenue
     or v_excluded_impressions <> v_expected_excluded_impressions
     or v_excluded_clicks <> v_expected_excluded_clicks
     or v_excluded_cost <> v_expected_excluded_cost
     or v_excluded_conversions <> v_expected_excluded_conversions
     or v_excluded_revenue <> v_expected_excluded_revenue
     or v_before_impressions - v_excluded_impressions <>
        v_expected_after_impressions
     or v_before_clicks - v_excluded_clicks <>
        v_expected_after_clicks
     or v_before_cost - v_excluded_cost <>
        v_expected_after_cost
     or v_before_conversions - v_excluded_conversions <>
        v_expected_after_conversions
     or v_before_revenue - v_excluded_revenue <>
        v_expected_after_revenue then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_METRIC_PARITY_MISMATCH';
  end if;

  create temporary table exact_repair_pre_fingerprint_blocks
  on commit drop
  as
  select
    (s.row_index / v_fingerprint_block_size)::bigint as block_index,
    count(*)::bigint as block_rows,
    min(s.row_index)::bigint as block_min_row_index,
    max(s.row_index)::bigint as block_max_row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              s.row_index::text || ':' || s.row_fingerprint,
              E'\n'
              order by s.row_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as block_digest
  from public.media_sync_staging_rows as s
  where s.job_id = v_candidate_job_id
  group by
    (s.row_index / v_fingerprint_block_size)::bigint;

  select
    coalesce(sum(b.block_rows), 0)::bigint,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'chunked_sha256_v1:block_size=10000' || E'\n' ||
          coalesce(
            string_agg(
              b.block_index::text || ':' ||
              b.block_rows::text || ':' ||
              b.block_min_row_index::text || ':' ||
              b.block_max_row_index::text || ':' ||
              b.block_digest,
              E'\n'
              order by b.block_index
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
    v_pre_fingerprint_rows,
    v_pre_fingerprint
  from exact_repair_pre_fingerprint_blocks as b;

  if v_pre_fingerprint_rows <> v_expected_candidate_rows
     or v_pre_fingerprint <> v_expected_candidate_fingerprint then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_PRE_FINGERPRINT_MISMATCH';
  end if;

  /*
   * Verify active report state immediately before mutation.
   */
  select
    count(r.id)::bigint,
    count(r.id) filter (
      where r.ingestion_id = v_current_ingestion_id
    )::bigint,
    count(r.id) filter (
      where r.ingestion_id = v_published_ingestion_id
    )::bigint
  into
    v_report_rows_count,
    v_current_report_rows,
    v_published_report_rows
  from public.report_rows as r
  where r.report_id = v_report_id;

  select
    count(ri.id)::bigint,
    encode(
      extensions.digest(
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', ri.id,
              'row_count', ri.row_count,
              'status', ri.status,
              'error', ri.error,
              'updated_at', ri.updated_at
            )
            order by ri.id
          ) filter (where ri.id is not null),
          '[]'::jsonb
        )::text,
        'sha256'
      ),
      'hex'
    )
  into
    v_report_ingestions_count,
    v_report_ingestions_descriptor_digest
  from public.report_ingestions as ri
  where ri.report_id = v_report_id;

  select
    count(r.id)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            r.row::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_current_sentinel_count,
    v_current_sentinel_digest
  from public.report_rows as r
  where r.report_id = v_report_id
    and r.ingestion_id = v_current_ingestion_id
    and r.row_index in (0, 58, 117);

  select
    count(r.id)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            r.row::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_published_sentinel_count,
    v_published_sentinel_digest
  from public.report_rows as r
  where r.report_id = v_report_id
    and r.ingestion_id = v_published_ingestion_id
    and r.row_index in (0, 22256, 44513);

  if v_report_rows_count <> v_expected_total_report_rows
     or v_current_report_rows <> v_expected_current_report_rows
     or v_published_report_rows <> v_expected_published_report_rows
     or v_report_ingestions_count <>
        v_expected_report_ingestions_count
     or v_report_ingestions_descriptor_digest <>
        v_expected_report_ingestions_descriptor_digest
     or v_current_sentinel_count <> 3
     or v_current_sentinel_digest <>
        v_expected_current_sentinel_digest
     or v_published_sentinel_count <> 3
     or v_published_sentinel_digest <>
        v_expected_published_sentinel_digest then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_ACTIVE_REPORT_BASELINE_CHANGED';
  end if;

  /*
   * Atomic staging repair.
   *
   * First move all row indexes into a disjoint positive range so the persisted
   * (job_id, row_index) unique constraint cannot conflict during compaction.
   */
  v_reindex_offset := v_expected_candidate_rows + 1;

  update public.media_sync_staging_rows as s
     set row_index = s.row_index + v_reindex_offset
   where s.job_id = v_candidate_job_id;

  get diagnostics v_updated_rows = row_count;

  if v_updated_rows <> v_expected_candidate_rows then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_OFFSET_UPDATE_COUNT_MISMATCH';
  end if;

  delete from public.media_sync_staging_rows as s
  using exact_repair_row_map as m
  where s.id = m.staging_id
    and m.excluded;

  get diagnostics v_updated_rows = row_count;

  if v_updated_rows <> v_expected_excluded_rows then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_DELETE_COUNT_MISMATCH';
  end if;

  update public.media_sync_staging_rows as s
     set row_index = m.new_row_index
    from exact_repair_row_map as m
   where s.id = m.staging_id
     and not m.excluded;

  get diagnostics v_updated_rows = row_count;

  if v_updated_rows <> v_expected_repaired_rows then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_COMPACTION_COUNT_MISMATCH';
  end if;

  /*
   * Exact post-mutation candidate validation before the job contract is updated.
   */
  select
    count(s.id)::bigint,
    min(s.row_index)::bigint,
    max(s.row_index)::bigint,
    count(distinct s.row_index)::bigint,

    count(s.id) filter (
      where s.row ->> 'row_level' = 'keyword'
    )::bigint,

    count(s.id) filter (
      where s.row ->> 'row_level' = 'creative'
    )::bigint,

    count(s.id) filter (
      where s.row ->> 'row_level' = 'mixed'
    )::bigint,

    count(s.id) filter (
      where s.report_id <> v_report_id
         or s.workspace_id <> v_workspace_id
         or s.advertiser_id <> v_advertiser_id
         or s.connection_id <> v_connection_id
         or s.provider <> 'naver_searchad'
         or s.external_account_id <> v_candidate.external_account_id
         or s.date_from <> v_candidate.date_from
         or s.date_to <> v_candidate.date_to
         or s.date < v_candidate.date_from
         or s.date > v_candidate.date_to
    )::bigint,

    count(s.id) filter (
      where jsonb_typeof(s.row) <> 'object'
         or coalesce(s.row ->> 'date', '') <> s.date::text
         or coalesce(s.row ->> 'report_date', '') <> s.date::text
         or coalesce(s.row ->> 'day', '') <> s.date::text
         or coalesce(s.row ->> 'ymd', '') <> s.date::text
         or coalesce(s.row ->> 'channel', '') <> coalesce(s.channel, '')
         or coalesce(s.row ->> 'device', '') <> coalesce(s.device, '')
         or coalesce(s.row ->> 'source', '') <> coalesce(s.source, '')
         or coalesce(s.row ->> 'provider', '') <> 'naver_searchad'
         or coalesce(s.row ->> 'external_account_id', '') <>
            v_candidate.external_account_id
         or coalesce(s.row ->> 'ingestion_source', '') <> 'api'
         or btrim(s.row_key) = ''
         or s.row_fingerprint is null
         or s.row_fingerprint !~ '^[0-9a-f]{64}$'
         or s.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(s.row::text, 'UTF8'),
                'sha256'
              ),
              'hex'
            )
    )::bigint,

    coalesce(sum((s.row ->> 'impressions')::numeric), 0),
    coalesce(sum((s.row ->> 'clicks')::numeric), 0),
    coalesce(sum((s.row ->> 'cost')::numeric), 0),
    coalesce(sum((s.row ->> 'conversions')::numeric), 0),
    coalesce(sum((s.row ->> 'revenue')::numeric), 0)
  into
    v_candidate_rows,
    v_candidate_min_row_index,
    v_candidate_max_row_index,
    v_candidate_distinct_row_indexes,
    v_keyword_rows,
    v_creative_rows,
    v_mixed_rows,
    v_scope_mismatch_rows,
    v_canonical_mismatch_rows,
    v_after_impressions,
    v_after_clicks,
    v_after_cost,
    v_after_conversions,
    v_after_revenue
  from public.media_sync_staging_rows as s
  where s.job_id = v_candidate_job_id;

  select count(*)::bigint
    into v_overlap_rows_after
    from public.media_sync_staging_rows as s
   where s.job_id = v_candidate_job_id
     and s.row ->> 'row_level' = 'keyword'
     and s.row ->> 'data_level' = 'keyword'
     and s.row ->> 'row_level_reason' =
         'naver_searchad_registered_keyword_daily_stats'
     and s.row #>> '{provider_meta,campaign_type}' = 'BRAND_SEARCH'
     and exists (
       select 1
         from exact_repair_mixed_campaigns as m
        where m.campaign_id =
          nullif(btrim(s.row ->> 'external_campaign_id'), '')
     );

  if v_candidate_rows <> v_expected_repaired_rows
     or v_candidate_min_row_index <> 0
     or v_candidate_max_row_index <>
        v_expected_repaired_rows - 1
     or v_candidate_distinct_row_indexes <>
        v_expected_repaired_rows
     or v_keyword_rows <> v_expected_keyword_rows
     or v_creative_rows <> v_expected_creative_rows
     or v_mixed_rows <> v_expected_mixed_rows
     or v_scope_mismatch_rows <> 0
     or v_canonical_mismatch_rows <> 0
     or v_overlap_rows_after <> 0
     or v_after_impressions <> v_expected_after_impressions
     or v_after_clicks <> v_expected_after_clicks
     or v_after_cost <> v_expected_after_cost
     or v_after_conversions <> v_expected_after_conversions
     or v_after_revenue <> v_expected_after_revenue then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_POST_STAGING_VALIDATION_FAILED';
  end if;

  create temporary table exact_repair_post_fingerprint_blocks
  on commit drop
  as
  select
    (s.row_index / v_fingerprint_block_size)::bigint as block_index,
    count(*)::bigint as block_rows,
    min(s.row_index)::bigint as block_min_row_index,
    max(s.row_index)::bigint as block_max_row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              s.row_index::text || ':' || s.row_fingerprint,
              E'\n'
              order by s.row_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as block_digest
  from public.media_sync_staging_rows as s
  where s.job_id = v_candidate_job_id
  group by
    (s.row_index / v_fingerprint_block_size)::bigint;

  select
    coalesce(sum(b.block_rows), 0)::bigint,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'chunked_sha256_v1:block_size=10000' || E'\n' ||
          coalesce(
            string_agg(
              b.block_index::text || ':' ||
              b.block_rows::text || ':' ||
              b.block_min_row_index::text || ':' ||
              b.block_max_row_index::text || ':' ||
              b.block_digest,
              E'\n'
              order by b.block_index
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
    v_repaired_fingerprint_rows,
    v_repaired_fingerprint
  from exact_repair_post_fingerprint_blocks as b;

  if v_repaired_fingerprint_rows <> v_expected_repaired_rows
     or v_repaired_fingerprint is null
     or v_repaired_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_POST_FINGERPRINT_INVALID';
  end if;

  v_repaired_confirmation_token :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'version=2' || E'\n' ||
          'candidate_job_id=' || v_candidate_job_id::text || E'\n' ||
          'source_job_id=' || v_source_job_id::text || E'\n' ||
          'expected_candidate_updated_at=' ||
            (to_jsonb(v_now) #>> '{}') || E'\n' ||
          'report_id=' || v_report_id::text || E'\n' ||
          'workspace_id=' || v_workspace_id::text || E'\n' ||
          'advertiser_id=' || v_advertiser_id::text || E'\n' ||
          'connection_id=' || v_connection_id::text || E'\n' ||
          'current_ingestion_id=' ||
            v_current_ingestion_id::text || E'\n' ||
          'published_ingestion_id=' ||
            v_published_ingestion_id::text || E'\n' ||
          'checkpoint_phase=completed' || E'\n' ||
          'checkpoint_next_row_index=' ||
            v_expected_repaired_rows::text || E'\n' ||
          'candidate_rows=' ||
            v_expected_repaired_rows::text || E'\n' ||
          'source_rows=' ||
            v_expected_source_staging_rows::text || E'\n' ||
          'source_identity_digest=' ||
            v_source_identity_digest || E'\n' ||
          'repair_kind=brand_search_cross_grain_dedup_v1' || E'\n' ||
          'repair_source_rows=' ||
            v_expected_candidate_rows::text || E'\n' ||
          'repair_excluded_rows=' ||
            v_expected_excluded_rows::text || E'\n' ||
          'repaired_staging_fingerprint=' ||
            v_repaired_fingerprint || E'\n' ||
          'total_report_rows=' ||
            v_expected_total_report_rows::text || E'\n' ||
          'current_report_rows=' ||
            v_expected_current_report_rows::text || E'\n' ||
          'published_report_rows=' ||
            v_expected_published_report_rows::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  v_recovery :=
    jsonb_build_object(
      'contract_version', 2,
      'source_job_id', v_source_job_id,
      'source_job_updated_at', to_jsonb(v_source_job.updated_at),
      'source_staging_rows', v_source_rows,
      'source_identity_digest', v_source_identity_digest,
      'keyword_counts_derived_from_staging', true,
      'request_counts_reconstructed', false,
      'prepared_at', to_jsonb(v_candidate.created_at),
      'expected_current_ingestion_id', v_current_ingestion_id,
      'expected_published_ingestion_id', v_published_ingestion_id,
      'isolated', true,

      'repair_kind', 'brand_search_cross_grain_dedup_v1',
      'repair_applied_at', to_jsonb(v_now),
      'repair_source_candidate_rows', v_expected_candidate_rows,
      'repair_excluded_rows', v_expected_excluded_rows,
      'repair_repaired_rows', v_expected_repaired_rows,
      'repair_matched_campaign_count', v_matched_campaign_count,
      'repair_mixed_only_campaign_count', v_mixed_only_campaign_count,
      'repair_original_candidate_fingerprint',
        v_expected_candidate_fingerprint,
      'repair_repaired_staging_fingerprint',
        v_repaired_fingerprint,
      'repair_fingerprint_algorithm',
        'chunked_sha256_v1:block_size=10000',
      'repair_original_confirmation_token',
        v_expected_confirmation_token,

      'approved_impressions', v_expected_after_impressions,
      'approved_clicks', v_expected_after_clicks,
      'approved_cost', v_expected_after_cost,
      'approved_conversions', v_expected_after_conversions,
      'approved_revenue', v_expected_after_revenue,

      'confirmation_token', v_repaired_confirmation_token
    );

  v_checkpoint :=
    v_candidate.error_detail -> 'processing_checkpoint';

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
      to_jsonb(v_expected_repaired_rows),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{normalized_rows}',
      to_jsonb(v_expected_repaired_rows),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{inserted_rows}',
      to_jsonb(v_expected_repaired_rows),
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
      '{collector,phase}',
      to_jsonb('completed'::text),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{collector,next_row_index}',
      to_jsonb(v_expected_repaired_rows),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{collector,keyword,complete}',
      to_jsonb(true),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{collector,authoritative,complete}',
      to_jsonb(true),
      true
    );

  v_checkpoint :=
    jsonb_set(
      v_checkpoint,
      '{recovery}',
      v_recovery,
      true
    );

  update public.media_sync_jobs as job
     set raw_rows = v_expected_repaired_rows,
         normalized_rows = v_expected_repaired_rows,
         inserted_rows = v_expected_repaired_rows,
         failed_rows = 0,
         progress = 99,
         status = 'cancelled',
         started_at = null,
         finished_at = null,
         snapshot_ingestion_id = null,
         error = null,
         error_detail = jsonb_build_object(
           'processing_checkpoint',
           v_checkpoint
         ),
         updated_at = v_now
   where job.id = v_candidate_job_id
     and job.status = 'cancelled'
     and job.updated_at = v_expected_candidate_updated_at
     and job.snapshot_ingestion_id is null;

  get diagnostics v_updated_rows = row_count;

  if v_updated_rows <> 1 then
    raise exception using
      errcode = '40001',
      message = 'EXACT_REPAIR_CANDIDATE_JOB_UPDATE_FAILED';
  end if;

  select job.*
    into v_candidate
    from public.media_sync_jobs as job
   where job.id = v_candidate_job_id;

  if v_candidate.status <> 'cancelled'
     or v_candidate.progress <> 99
     or v_candidate.attempt_count <> v_expected_attempt_count
     or v_candidate.updated_at is distinct from v_now
     or v_candidate.raw_rows <> v_expected_repaired_rows
     or v_candidate.normalized_rows <> v_expected_repaired_rows
     or v_candidate.inserted_rows <> v_expected_repaired_rows
     or v_candidate.failed_rows <> 0
     or v_candidate.snapshot_ingestion_id is not null
     or v_candidate.error is not null
     or v_candidate.started_at is not null
     or v_candidate.finished_at is not null
     or v_candidate.error_detail
          #>> '{processing_checkpoint,collector,phase}'
          is distinct from 'completed'
     or v_candidate.error_detail
          #>> '{processing_checkpoint,collector,next_row_index}'
          is distinct from v_expected_repaired_rows::text
     or v_candidate.error_detail
          #>> '{processing_checkpoint,collector,authoritative,complete}'
          is distinct from 'true'
     or v_candidate.error_detail
          #>> '{processing_checkpoint,recovery,contract_version}'
          is distinct from '2'
     or v_candidate.error_detail
          #>> '{processing_checkpoint,recovery,confirmation_token}'
          is distinct from v_repaired_confirmation_token
     or v_candidate.error_detail
          #>> '{processing_checkpoint,recovery,repair_repaired_staging_fingerprint}'
          is distinct from v_repaired_fingerprint then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_FINAL_CANDIDATE_CONTRACT_INVALID';
  end if;

  /*
   * Recheck pointers and immutable active report state after the staging/job
   * mutation. No materialization descriptor or report row may appear.
   */
  select report.*
    into v_report
    from public.reports as report
   where report.id = v_report_id;

  if v_report.current_ingestion_id is distinct from
       v_current_ingestion_id
     or v_report.published_ingestion_id is distinct from
       v_published_ingestion_id then
    raise exception using
      errcode = '40001',
      message = 'EXACT_REPAIR_POINTER_CHANGED_DURING_REPAIR';
  end if;

  select
    count(r.id)::bigint,
    count(r.id) filter (
      where r.ingestion_id = v_current_ingestion_id
    )::bigint,
    count(r.id) filter (
      where r.ingestion_id = v_published_ingestion_id
    )::bigint
  into
    v_report_rows_count,
    v_current_report_rows,
    v_published_report_rows
  from public.report_rows as r
  where r.report_id = v_report_id;

  select
    count(ri.id)::bigint,
    encode(
      extensions.digest(
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', ri.id,
              'row_count', ri.row_count,
              'status', ri.status,
              'error', ri.error,
              'updated_at', ri.updated_at
            )
            order by ri.id
          ) filter (where ri.id is not null),
          '[]'::jsonb
        )::text,
        'sha256'
      ),
      'hex'
    )
  into
    v_report_ingestions_count,
    v_report_ingestions_descriptor_digest
  from public.report_ingestions as ri
  where ri.report_id = v_report_id;

  if v_report_rows_count <> v_expected_total_report_rows
     or v_current_report_rows <> v_expected_current_report_rows
     or v_published_report_rows <> v_expected_published_report_rows
     or v_report_ingestions_count <>
        v_expected_report_ingestions_count
     or v_report_ingestions_descriptor_digest <>
        v_expected_report_ingestions_descriptor_digest then
    raise exception using
      errcode = '55000',
      message = 'EXACT_REPAIR_ACTIVE_REPORT_STATE_CHANGED';
  end if;

  insert into exact_naver_brand_overlap_repair_result (
    repaired,
    candidate_job_id,
    previous_candidate_updated_at,
    repaired_candidate_updated_at,
    previous_confirmation_token,
    repaired_confirmation_token,
    original_candidate_rows,
    excluded_rows,
    repaired_candidate_rows,
    keyword_rows,
    creative_rows,
    mixed_rows,
    total_impressions,
    total_clicks,
    total_cost,
    total_conversions,
    total_revenue,
    repaired_staging_fingerprint,
    current_ingestion_id,
    published_ingestion_id,
    materialization_called,
    activation_called,
    finalization_called
  )
  values (
    true,
    v_candidate_job_id,
    v_expected_candidate_updated_at,
    v_now,
    v_expected_confirmation_token,
    v_repaired_confirmation_token,
    v_expected_candidate_rows,
    v_expected_excluded_rows,
    v_expected_repaired_rows,
    v_keyword_rows,
    v_creative_rows,
    v_mixed_rows,
    v_after_impressions,
    v_after_clicks,
    v_after_cost,
    v_after_conversions,
    v_after_revenue,
    v_repaired_fingerprint,
    v_current_ingestion_id,
    v_published_ingestion_id,
    false,
    false,
    false
  );
end;
$repair$;

select *
from exact_naver_brand_overlap_repair_result;

commit;