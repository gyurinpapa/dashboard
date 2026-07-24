/*
 * Etrylue Performance
 * Optimized exact read-only postcheck after committed Brand Search repair.
 *
 * Why optimized:
 * - the previous deep postcheck repeated several full scans and exceeded the
 *   Supabase SQL Editor upstream timeout;
 * - this version performs one bounded block scan of the 44,604-row candidate,
 *   one simple count/range scan of the immutable 44,514-row source, and only
 *   indexed/small-table checks for pointers, descriptors, and sentinels;
 * - the candidate fingerprint is still recalculated exactly in 10,000-row
 *   blocks and the confirmation token is recalculated from that fingerprint.
 *
 * SELECT only:
 * - no INSERT / UPDATE / DELETE
 * - no RPC
 * - no materialization
 * - no activation
 * - no finalization
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

    '2026-07-22 14:23:11.371149+00'::timestamptz
      as repaired_candidate_updated_at,

    '2026-07-19 11:59:16.834+00'::timestamptz
      as source_job_updated_at,

    '31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127'::text
      as original_confirmation_token,

    '7aa3be46fb606536de8c3bc9540a311426da8b203508cebeef1d2e93fd8668d2'::text
      as repaired_confirmation_token,

    'f11def9d7faa36e7233878a5cb533c048c17225f519324de80c289f5d8e4ad28'::text
      as original_candidate_fingerprint,

    '1874890814e763dfe834ae0d97698157e707939ef5a213be8582a9bc264c35f1'::text
      as repaired_staging_fingerprint,

    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40'::text
      as source_identity_digest,

    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776'::text
      as report_ingestions_descriptor_digest,

    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7'::text
      as current_canonical_sentinel_digest,

    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0'::text
      as published_canonical_sentinel_digest,

    12::bigint as expected_attempt_count,

    44500::bigint as expected_source_job_rows,
    44514::bigint as expected_source_staging_rows,

    45808::bigint as original_candidate_rows,
    1204::bigint as excluded_rows,
    44604::bigint as repaired_candidate_rows,

    43310::bigint as repaired_keyword_rows,
    1244::bigint as repaired_creative_rows,
    50::bigint as repaired_mixed_rows,

    7075::numeric as repaired_impressions,
    1183::numeric as repaired_clicks,
    113850::numeric as repaired_cost,
    67::numeric as repaired_conversions,
    12729300::numeric as repaired_revenue,

    118::bigint as expected_current_report_rows,
    44514::bigint as expected_published_report_rows,
    11::bigint as expected_report_ingestions_count,

    10000::bigint as fingerprint_block_size
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
  select job.*
  from params as p
  left join public.media_sync_jobs as job
    on job.id = p.source_job_id
),

report_state as (
  select report.*
  from params as p
  left join public.reports as report
    on report.id = p.report_id
),

active_jobs as (
  select count(job.id)::bigint as active_job_count
  from params as p
  left join public.media_sync_jobs as job
    on job.report_id = p.report_id
   and job.status in ('pending', 'processing')
),

staging_unique_contract as (
  select
    count(*)::bigint
      as required_unique_constraint_count,

    coalesce(
      bool_and(constraint_record.convalidated),
      false
    ) as required_unique_constraints_validated

  from pg_catalog.pg_constraint
    as constraint_record

  where constraint_record.conrelid =
        'public.media_sync_staging_rows'::regclass
    and constraint_record.contype = 'u'
    and constraint_record.conname in (
      'media_sync_staging_rows_job_row_index_unique',
      'media_sync_staging_rows_job_window_row_key_unique'
    )
),

source_staging_state as (
  select
    count(s.id)::bigint as source_rows,
    min(s.row_index)::bigint as min_row_index,
    max(s.row_index)::bigint as max_row_index

  from params as p

  left join public.media_sync_staging_rows as s
    on s.job_id = p.source_job_id
),

mixed_campaigns as materialized (
  select distinct
    nullif(
      btrim(
        s.row ->> 'external_campaign_id'
      ),
      ''
    ) as campaign_id

  from params as p

  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id

  where s.row ->> 'row_level' = 'mixed'
    and s.row ->> 'data_level' = 'mixed'
    and s.row ->> 'row_level_reason' =
        'naver_searchad_brand_search_adgroup_daily_stats'
    and nullif(
      btrim(
        s.row ->> 'external_campaign_id'
      ),
      ''
    ) is not null
),

candidate_blocks as materialized (
  select
    (
      s.row_index /
      p.fingerprint_block_size
    )::bigint as block_index,

    count(*)::bigint as block_rows,
    min(s.row_index)::bigint as block_min_row_index,
    max(s.row_index)::bigint as block_max_row_index,

    count(*) filter (
      where s.row ->> 'row_level' = 'keyword'
    )::bigint as keyword_rows,

    count(*) filter (
      where s.row ->> 'row_level' = 'creative'
    )::bigint as creative_rows,

    count(*) filter (
      where s.row ->> 'row_level' = 'mixed'
    )::bigint as mixed_rows,

    count(*) filter (
      where s.row_fingerprint is null
         or s.row_fingerprint !~ '^[0-9a-f]{64}$'
         or s.row is null
         or s.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(
                  s.row::text,
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            )
    )::bigint as invalid_fingerprint_rows,

    count(*) filter (
      where s.report_id is distinct from p.report_id
         or s.workspace_id is distinct from p.workspace_id
         or s.advertiser_id is distinct from p.advertiser_id
         or s.connection_id is distinct from p.connection_id
         or s.provider is distinct from 'naver_searchad'
         or s.external_account_id is distinct from
            candidate.external_account_id
         or s.date_from is distinct from candidate.date_from
         or s.date_to is distinct from candidate.date_to
         or s.date < candidate.date_from
         or s.date > candidate.date_to
    )::bigint as scope_mismatch_rows,

    count(*) filter (
      where jsonb_typeof(s.row) is distinct from 'object'
         or coalesce(s.row ->> 'date', '') <>
            s.date::text
         or coalesce(s.row ->> 'report_date', '') <>
            s.date::text
         or coalesce(s.row ->> 'day', '') <>
            s.date::text
         or coalesce(s.row ->> 'ymd', '') <>
            s.date::text
         or coalesce(s.row ->> 'channel', '') <>
            coalesce(s.channel, '')
         or coalesce(s.row ->> 'device', '') <>
            coalesce(s.device, '')
         or coalesce(s.row ->> 'source', '') <>
            coalesce(s.source, '')
         or coalesce(s.row ->> 'provider', '') <>
            'naver_searchad'
         or coalesce(
              s.row ->> 'external_account_id',
              ''
            ) <> candidate.external_account_id
         or coalesce(
              s.row ->> 'ingestion_source',
              ''
            ) <> 'api'
         or btrim(s.row_key) = ''
    )::bigint as canonical_mismatch_rows,

    count(*) filter (
      where not coalesce(
        (
          (
            s.row ->> 'row_level' = 'keyword'
            and s.row ->> 'data_level' = 'keyword'
            and s.row ->> 'row_level_reason' =
                'naver_searchad_registered_keyword_daily_stats'
          )
          or
          (
            s.row ->> 'row_level' = 'creative'
            and s.row ->> 'data_level' = 'creative'
            and s.row ->> 'row_level_reason' =
                'naver_searchad_shopping_ad_daily_stats'
          )
          or
          (
            s.row ->> 'row_level' = 'mixed'
            and s.row ->> 'data_level' = 'mixed'
            and s.row ->> 'row_level_reason' =
                'naver_searchad_brand_search_adgroup_daily_stats'
          )
        ),
        false
      )
    )::bigint as invalid_grain_rows,

    count(*) filter (
      where s.row ->> 'row_level' = 'keyword'
        and s.row ->> 'data_level' = 'keyword'
        and s.row ->> 'row_level_reason' =
            'naver_searchad_registered_keyword_daily_stats'
        and s.row #>> '{provider_meta,campaign_type}' =
            'BRAND_SEARCH'
        and exists (
          select 1
          from mixed_campaigns as mixed_campaign
          where mixed_campaign.campaign_id =
            nullif(
              btrim(
                s.row ->> 'external_campaign_id'
              ),
              ''
            )
        )
    )::bigint as overlap_rows,

    coalesce(
      sum(
        case
          when jsonb_typeof(
            s.row -> 'impressions'
          ) = 'number'
          then (s.row ->> 'impressions')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as impressions,

    coalesce(
      sum(
        case
          when jsonb_typeof(
            s.row -> 'clicks'
          ) = 'number'
          then (s.row ->> 'clicks')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as clicks,

    coalesce(
      sum(
        case
          when jsonb_typeof(
            s.row -> 'cost'
          ) = 'number'
          then (s.row ->> 'cost')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as cost,

    coalesce(
      sum(
        case
          when jsonb_typeof(
            s.row -> 'conversions'
          ) = 'number'
          then (s.row ->> 'conversions')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as conversions,

    coalesce(
      sum(
        case
          when jsonb_typeof(
            s.row -> 'revenue'
          ) = 'number'
          then (s.row ->> 'revenue')::numeric
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
              s.row_index::text || ':' ||
              s.row_fingerprint,
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

  from params as p

  cross join candidate

  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id

  group by
    (
      s.row_index /
      p.fingerprint_block_size
    )::bigint,
    p.report_id,
    p.workspace_id,
    p.advertiser_id,
    p.connection_id,
    candidate.external_account_id,
    candidate.date_from,
    candidate.date_to
),

candidate_summary as (
  select
    count(*)::bigint as block_count,

    coalesce(
      sum(block.block_rows),
      0
    )::bigint as candidate_rows,

    min(block.block_min_row_index)::bigint
      as min_row_index,

    max(block.block_max_row_index)::bigint
      as max_row_index,

    coalesce(
      sum(block.keyword_rows),
      0
    )::bigint as keyword_rows,

    coalesce(
      sum(block.creative_rows),
      0
    )::bigint as creative_rows,

    coalesce(
      sum(block.mixed_rows),
      0
    )::bigint as mixed_rows,

    coalesce(
      sum(block.invalid_fingerprint_rows),
      0
    )::bigint as invalid_fingerprint_rows,

    coalesce(
      sum(block.scope_mismatch_rows),
      0
    )::bigint as scope_mismatch_rows,

    coalesce(
      sum(block.canonical_mismatch_rows),
      0
    )::bigint as canonical_mismatch_rows,

    coalesce(
      sum(block.invalid_grain_rows),
      0
    )::bigint as invalid_grain_rows,

    coalesce(
      sum(block.overlap_rows),
      0
    )::bigint as overlap_rows,

    coalesce(
      sum(block.impressions),
      0::numeric
    ) as impressions,

    coalesce(
      sum(block.clicks),
      0::numeric
    ) as clicks,

    coalesce(
      sum(block.cost),
      0::numeric
    ) as cost,

    coalesce(
      sum(block.conversions),
      0::numeric
    ) as conversions,

    coalesce(
      sum(block.revenue),
      0::numeric
    ) as revenue,

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
),

recovery_keys as (
  select
    count(key_name)::bigint as key_count,

    coalesce(
      array_agg(
        key_name
        order by key_name
      ),
      array[]::text[]
    ) as key_names

  from candidate

  left join lateral jsonb_object_keys(
    case
      when jsonb_typeof(candidate.recovery) =
           'object'
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
        pg_catalog.convert_to(
          'version=2' || E'\n' ||
          'candidate_job_id=' ||
            candidate.id::text || E'\n' ||
          'source_job_id=' ||
            p.source_job_id::text || E'\n' ||
          'expected_candidate_updated_at=' ||
            (
              to_jsonb(candidate.updated_at)
              #>> '{}'
            ) || E'\n' ||
          'report_id=' ||
            p.report_id::text || E'\n' ||
          'workspace_id=' ||
            p.workspace_id::text || E'\n' ||
          'advertiser_id=' ||
            p.advertiser_id::text || E'\n' ||
          'connection_id=' ||
            p.connection_id::text || E'\n' ||
          'current_ingestion_id=' ||
            p.current_ingestion_id::text || E'\n' ||
          'published_ingestion_id=' ||
            p.published_ingestion_id::text || E'\n' ||
          'checkpoint_phase=completed' || E'\n' ||
          'checkpoint_next_row_index=' ||
            p.repaired_candidate_rows::text ||
            E'\n' ||
          'candidate_rows=' ||
            candidate_summary.candidate_rows::text ||
            E'\n' ||
          'source_rows=' ||
            source_staging_state.source_rows::text ||
            E'\n' ||
          'source_identity_digest=' ||
            p.source_identity_digest ||
            E'\n' ||
          'repair_kind=brand_search_cross_grain_dedup_v1' ||
            E'\n' ||
          'repair_source_rows=' ||
            p.original_candidate_rows::text ||
            E'\n' ||
          'repair_excluded_rows=' ||
            p.excluded_rows::text ||
            E'\n' ||
          'repaired_staging_fingerprint=' ||
            candidate_summary.candidate_fingerprint ||
            E'\n' ||
          'total_report_rows=359716' ||
            E'\n' ||
          'current_report_rows=' ||
            p.expected_current_report_rows::text ||
            E'\n' ||
          'published_report_rows=' ||
            p.expected_published_report_rows::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as recalculated_confirmation_token

  from params as p
  cross join candidate
  cross join candidate_summary
  cross join source_staging_state
),

report_ingestions_state as (
  select
    count(ingestion.id)::bigint
      as report_ingestions_count,

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
          ) filter (
            where ingestion.id is not null
          ),
          '[]'::jsonb
        )::text,
        'sha256'
      ),
      'hex'
    ) as descriptor_digest,

    max(ingestion.row_count) filter (
      where ingestion.id =
        p.current_ingestion_id
    )::bigint as current_descriptor_rows,

    max(ingestion.status) filter (
      where ingestion.id =
        p.current_ingestion_id
    ) as current_descriptor_status,

    max(ingestion.row_count) filter (
      where ingestion.id =
        p.published_ingestion_id
    )::bigint as published_descriptor_rows,

    max(ingestion.status) filter (
      where ingestion.id =
        p.published_ingestion_id
    ) as published_descriptor_status

  from params as p

  left join public.report_ingestions as ingestion
    on ingestion.report_id = p.report_id
),

current_sentinels as (
  select
    count(r.id)::bigint as sentinel_count,

    encode(
      extensions.digest(
        coalesce(
          string_agg(
            r.row::text || E'\n',
            ''
            order by
              r.row_index,
              r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as sentinel_digest

  from params as p

  left join public.report_rows as r
    on r.report_id = p.report_id
   and r.ingestion_id =
       p.current_ingestion_id
   and r.row_index in (0, 58, 117)
),

published_sentinels as (
  select
    count(r.id)::bigint as sentinel_count,

    encode(
      extensions.digest(
        coalesce(
          string_agg(
            r.row::text || E'\n',
            ''
            order by
              r.row_index,
              r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as sentinel_digest

  from params as p

  left join public.report_rows as r
    on r.report_id = p.report_id
   and r.ingestion_id =
       p.published_ingestion_id
   and r.row_index in (0, 22256, 44513)
),

checks as (
  select
    coalesce(
      candidate.id = p.candidate_job_id
      and candidate.report_id = p.report_id
      and candidate.workspace_id = p.workspace_id
      and candidate.advertiser_id =
          p.advertiser_id
      and candidate.connection_id =
          p.connection_id
      and candidate.provider = 'naver_searchad'
      and candidate.status = 'cancelled'
      and candidate.progress = 99
      and candidate.attempt_count =
          p.expected_attempt_count
      and candidate.updated_at =
          p.repaired_candidate_updated_at
      and candidate.raw_rows =
          p.repaired_candidate_rows
      and candidate.normalized_rows =
          p.repaired_candidate_rows
      and candidate.inserted_rows =
          p.repaired_candidate_rows
      and candidate.failed_rows = 0
      and candidate.previous_ingestion_id =
          p.current_ingestion_id
      and candidate.snapshot_ingestion_id is null
      and candidate.error is null
      and candidate.started_at is null
      and candidate.finished_at is null,
      false
    ) as candidate_state_ok,

    coalesce(
      candidate.checkpoint #>> '{version}' = '1'
      and candidate.checkpoint
          #>> '{collector,combined_version}' = '1'
      and candidate.checkpoint
          #>> '{collector,phase}' = 'completed'
      and candidate.checkpoint
          #>> '{collector,next_row_index}' =
          p.repaired_candidate_rows::text
      and candidate.checkpoint
          #>> '{raw_rows}' =
          p.repaired_candidate_rows::text
      and candidate.checkpoint
          #>> '{normalized_rows}' =
          p.repaired_candidate_rows::text
      and candidate.checkpoint
          #>> '{inserted_rows}' =
          p.repaired_candidate_rows::text
      and candidate.checkpoint
          #>> '{failed_rows}' = '0'
      and candidate.checkpoint
          #>> '{collector,keyword,complete}' =
          'true'
      and candidate.checkpoint
          #>> '{collector,authoritative,complete}' =
          'true'
      and candidate.checkpoint ->> 'saved_at' =
          (
            to_jsonb(
              p.repaired_candidate_updated_at
            )
            #>> '{}'
          ),
      false
    ) as checkpoint_ok,

    coalesce(
      jsonb_typeof(candidate.recovery) =
          'object'
      and recovery_keys.key_count = 28
      and candidate.recovery
          ->> 'contract_version' = '2'
      and candidate.recovery
          ->> 'source_job_id' =
          p.source_job_id::text
      and candidate.recovery
          ->> 'source_job_updated_at' =
          (
            to_jsonb(p.source_job_updated_at)
            #>> '{}'
          )
      and candidate.recovery
          ->> 'source_staging_rows' =
          p.expected_source_staging_rows::text
      and candidate.recovery
          ->> 'source_identity_digest' =
          p.source_identity_digest
      and candidate.recovery
          ->> 'keyword_counts_derived_from_staging' =
          'true'
      and candidate.recovery
          ->> 'request_counts_reconstructed' =
          'false'
      and candidate.recovery
          ->> 'prepared_at' =
          (
            to_jsonb(candidate.created_at)
            #>> '{}'
          )
      and candidate.recovery
          ->> 'expected_current_ingestion_id' =
          p.current_ingestion_id::text
      and candidate.recovery
          ->> 'expected_published_ingestion_id' =
          p.published_ingestion_id::text
      and candidate.recovery
          ->> 'isolated' = 'true'
      and candidate.recovery
          ->> 'repair_kind' =
          'brand_search_cross_grain_dedup_v1'
      and candidate.recovery
          ->> 'repair_applied_at' =
          (
            to_jsonb(
              p.repaired_candidate_updated_at
            )
            #>> '{}'
          )
      and candidate.recovery
          ->> 'repair_source_candidate_rows' =
          p.original_candidate_rows::text
      and candidate.recovery
          ->> 'repair_excluded_rows' =
          p.excluded_rows::text
      and candidate.recovery
          ->> 'repair_repaired_rows' =
          p.repaired_candidate_rows::text
      and candidate.recovery
          ->> 'repair_matched_campaign_count' =
          '3'
      and candidate.recovery
          ->> 'repair_mixed_only_campaign_count' =
          '2'
      and candidate.recovery
          ->> 'repair_original_candidate_fingerprint' =
          p.original_candidate_fingerprint
      and candidate.recovery
          ->> 'repair_repaired_staging_fingerprint' =
          p.repaired_staging_fingerprint
      and candidate.recovery
          ->> 'repair_fingerprint_algorithm' =
          'chunked_sha256_v1:block_size=10000'
      and candidate.recovery
          ->> 'repair_original_confirmation_token' =
          p.original_confirmation_token
      and candidate.recovery
          ->> 'approved_impressions' =
          p.repaired_impressions::text
      and candidate.recovery
          ->> 'approved_clicks' =
          p.repaired_clicks::text
      and candidate.recovery
          ->> 'approved_cost' =
          p.repaired_cost::text
      and candidate.recovery
          ->> 'approved_conversions' =
          p.repaired_conversions::text
      and candidate.recovery
          ->> 'approved_revenue' =
          p.repaired_revenue::text
      and candidate.recovery
          ->> 'confirmation_token' =
          p.repaired_confirmation_token,
      false
    ) as recovery_contract_ok,

    coalesce(
      candidate_summary.candidate_rows =
          p.repaired_candidate_rows
      and candidate_summary.min_row_index = 0
      and candidate_summary.max_row_index =
          p.repaired_candidate_rows - 1
      and candidate_summary.keyword_rows =
          p.repaired_keyword_rows
      and candidate_summary.creative_rows =
          p.repaired_creative_rows
      and candidate_summary.mixed_rows =
          p.repaired_mixed_rows
      and candidate_summary.invalid_fingerprint_rows = 0
      and candidate_summary.scope_mismatch_rows = 0
      and candidate_summary.canonical_mismatch_rows = 0
      and candidate_summary.invalid_grain_rows = 0
      and candidate_summary.overlap_rows = 0
      and candidate_summary.impressions =
          p.repaired_impressions
      and candidate_summary.clicks =
          p.repaired_clicks
      and candidate_summary.cost =
          p.repaired_cost
      and candidate_summary.conversions =
          p.repaired_conversions
      and candidate_summary.revenue =
          p.repaired_revenue
      and candidate_summary.candidate_fingerprint =
          p.repaired_staging_fingerprint
      and candidate.recovery
          ->> 'repair_repaired_staging_fingerprint' =
          candidate_summary.candidate_fingerprint,
      false
    ) as repaired_staging_and_fingerprint_ok,

    coalesce(
      confirmation.recalculated_confirmation_token =
          p.repaired_confirmation_token
      and candidate.recovery
          ->> 'confirmation_token' =
          confirmation.recalculated_confirmation_token,
      false
    ) as confirmation_token_ok,

    coalesce(
      source_job.id = p.source_job_id
      and source_job.report_id = p.report_id
      and source_job.workspace_id = p.workspace_id
      and source_job.advertiser_id =
          p.advertiser_id
      and source_job.connection_id =
          p.connection_id
      and source_job.provider = 'naver_searchad'
      and source_job.status = 'failed'
      and source_job.updated_at =
          p.source_job_updated_at
      and source_job.raw_rows =
          p.expected_source_job_rows
      and source_job.normalized_rows =
          p.expected_source_job_rows
      and source_job.inserted_rows =
          p.expected_source_job_rows
      and source_job.failed_rows = 0
      and source_job.snapshot_ingestion_id is null
      and source_staging_state.source_rows =
          p.expected_source_staging_rows
      and source_staging_state.min_row_index = 0
      and source_staging_state.max_row_index =
          p.expected_source_staging_rows - 1,
      false
    ) as source_state_unchanged_ok,

    coalesce(
      report_state.current_ingestion_id =
          p.current_ingestion_id
      and report_state.published_ingestion_id =
          p.published_ingestion_id
      and active_jobs.active_job_count = 0
      and report_ingestions_state.report_ingestions_count =
          p.expected_report_ingestions_count
      and report_ingestions_state.descriptor_digest =
          p.report_ingestions_descriptor_digest
      and report_ingestions_state.current_descriptor_rows =
          p.expected_current_report_rows
      and report_ingestions_state.current_descriptor_status =
          'success'
      and report_ingestions_state.published_descriptor_rows =
          p.expected_published_report_rows
      and report_ingestions_state.published_descriptor_status =
          'success'
      and current_sentinels.sentinel_count = 3
      and current_sentinels.sentinel_digest =
          p.current_canonical_sentinel_digest
      and published_sentinels.sentinel_count = 3
      and published_sentinels.sentinel_digest =
          p.published_canonical_sentinel_digest,
      false
    ) as active_report_state_unchanged_ok,

    coalesce(
      staging_unique_contract.required_unique_constraint_count =
          2
      and staging_unique_contract.required_unique_constraints_validated,
      false
    ) as staging_unique_contract_ok,

    coalesce(
      candidate.status = 'cancelled'
      and candidate.progress = 99
      and candidate.snapshot_ingestion_id is null
      and candidate.started_at is null
      and candidate.finished_at is null
      and active_jobs.active_job_count = 0
      and report_state.current_ingestion_id =
          p.current_ingestion_id
      and report_state.published_ingestion_id =
          p.published_ingestion_id
      and report_ingestions_state.report_ingestions_count =
          p.expected_report_ingestions_count
      and report_ingestions_state.descriptor_digest =
          p.report_ingestions_descriptor_digest,
      false
    ) as no_materialization_activation_finalization_trace_ok,

    candidate.status as candidate_status,
    candidate.progress as candidate_progress,
    candidate.attempt_count as candidate_attempt_count,
    candidate.updated_at as candidate_updated_at,

    candidate.recovery ->> 'confirmation_token'
      as stored_confirmation_token,

    confirmation.recalculated_confirmation_token,

    candidate.recovery
      ->> 'repair_repaired_staging_fingerprint'
      as stored_repaired_staging_fingerprint,

    candidate_summary.candidate_fingerprint
      as recalculated_repaired_staging_fingerprint,

    recovery_keys.key_count as recovery_key_count,
    recovery_keys.key_names as recovery_key_names,

    candidate_summary.*,

    source_staging_state.source_rows,
    source_staging_state.min_row_index
      as source_min_row_index,
    source_staging_state.max_row_index
      as source_max_row_index,

    active_jobs.active_job_count,
    report_state.current_ingestion_id,
    report_state.published_ingestion_id,

    report_ingestions_state.report_ingestions_count,
    report_ingestions_state.descriptor_digest,
    report_ingestions_state.current_descriptor_rows,
    report_ingestions_state.current_descriptor_status,
    report_ingestions_state.published_descriptor_rows,
    report_ingestions_state.published_descriptor_status

  from params as p
  cross join candidate
  cross join source_job
  cross join report_state
  cross join active_jobs
  cross join staging_unique_contract
  cross join source_staging_state
  cross join candidate_summary
  cross join recovery_keys
  cross join confirmation
  cross join report_ingestions_state
  cross join current_sentinels
  cross join published_sentinels
)

select
  (
    candidate_state_ok
    and checkpoint_ok
    and recovery_contract_ok
    and repaired_staging_and_fingerprint_ok
    and confirmation_token_ok
    and source_state_unchanged_ok
    and active_report_state_unchanged_ok
    and staging_unique_contract_ok
    and no_materialization_activation_finalization_trace_ok
  ) as optimized_repair_postcheck_passed,

  array_remove(
    array[
      case when not candidate_state_ok
        then 'candidate_state_ok' end,

      case when not checkpoint_ok
        then 'checkpoint_ok' end,

      case when not recovery_contract_ok
        then 'recovery_contract_ok' end,

      case when not repaired_staging_and_fingerprint_ok
        then 'repaired_staging_and_fingerprint_ok' end,

      case when not confirmation_token_ok
        then 'confirmation_token_ok' end,

      case when not source_state_unchanged_ok
        then 'source_state_unchanged_ok' end,

      case when not active_report_state_unchanged_ok
        then 'active_report_state_unchanged_ok' end,

      case when not staging_unique_contract_ok
        then 'staging_unique_contract_ok' end,

      case when not no_materialization_activation_finalization_trace_ok
        then 'no_materialization_activation_finalization_trace_ok' end
    ],
    null
  ) as failed_checks,

  candidate_state_ok,
  checkpoint_ok,
  recovery_contract_ok,
  repaired_staging_and_fingerprint_ok,
  confirmation_token_ok,
  source_state_unchanged_ok,
  active_report_state_unchanged_ok,
  staging_unique_contract_ok,
  no_materialization_activation_finalization_trace_ok,

  candidate_status,
  candidate_progress,
  candidate_attempt_count,
  candidate_updated_at,

  stored_confirmation_token,
  recalculated_confirmation_token,

  stored_repaired_staging_fingerprint,
  recalculated_repaired_staging_fingerprint,

  recovery_key_count,
  recovery_key_names,

  block_count,
  candidate_rows,
  min_row_index,
  max_row_index,

  keyword_rows,
  creative_rows,
  mixed_rows,
  overlap_rows,

  invalid_fingerprint_rows,
  scope_mismatch_rows,
  canonical_mismatch_rows,
  invalid_grain_rows,

  impressions,
  clicks,
  cost,
  conversions,
  revenue,

  source_rows,
  source_min_row_index,
  source_max_row_index,

  active_job_count,
  current_ingestion_id,
  published_ingestion_id,

  report_ingestions_count,
  descriptor_digest,
  current_descriptor_rows,
  current_descriptor_status,
  published_descriptor_rows,
  published_descriptor_status

from checks;