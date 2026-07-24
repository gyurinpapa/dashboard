/*
 * Etrylue Performance
 * Read-only outcome check after Supabase "Failed to fetch".
 *
 * Purpose:
 * - determine whether the one-time atomic repair COMMITTED or ROLLED BACK;
 * - never re-run the repair based on a browser/network error alone;
 * - return the new repaired token when the transaction committed.
 *
 * SELECT only:
 * - no INSERT / UPDATE / DELETE
 * - no RPC
 * - no materialization / activation / finalization
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

    '2026-07-22 00:27:59.363+00'::timestamptz
      as original_candidate_updated_at,

    '31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127'::text
      as original_confirmation_token,

    'f11def9d7faa36e7233878a5cb533c048c17225f519324de80c289f5d8e4ad28'::text
      as original_candidate_fingerprint,

    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40'::text
      as expected_source_identity_digest,

    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776'::text
      as expected_report_ingestions_descriptor_digest,

    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7'::text
      as expected_current_canonical_sentinel_digest,

    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0'::text
      as expected_published_canonical_sentinel_digest,

    12::bigint as expected_attempt_count,

    45808::bigint as original_candidate_rows,
    1204::bigint as original_overlap_rows,

    44604::bigint as repaired_candidate_rows,
    43310::bigint as repaired_keyword_rows,
    1244::bigint as repaired_creative_rows,
    50::bigint as repaired_mixed_rows,

    7075::numeric as repaired_impressions,
    1183::numeric as repaired_clicks,
    113850::numeric as repaired_cost,
    67::numeric as repaired_conversions,
    12729300::numeric as repaired_revenue,

    359716::bigint as expected_total_report_rows,
    118::bigint as expected_current_report_rows,
    44514::bigint as expected_published_report_rows,
    11::bigint as expected_report_ingestions_count,

    44514::bigint as expected_source_staging_rows,
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

mixed_campaigns as materialized (
  select distinct
    nullif(
      btrim(s.row ->> 'external_campaign_id'),
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
      btrim(s.row ->> 'external_campaign_id'),
      ''
    ) is not null
),

candidate_scan as (
  select
    count(s.id)::bigint as candidate_rows,
    min(s.row_index)::bigint as min_row_index,
    max(s.row_index)::bigint as max_row_index,
    count(distinct s.row_index)::bigint
      as distinct_row_indexes,

    count(s.id) filter (
      where s.row ->> 'row_level' = 'keyword'
    )::bigint as keyword_rows,

    count(s.id) filter (
      where s.row ->> 'row_level' = 'creative'
    )::bigint as creative_rows,

    count(s.id) filter (
      where s.row ->> 'row_level' = 'mixed'
    )::bigint as mixed_rows,

    count(s.id) filter (
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

    count(s.id) filter (
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

    count(s.id) filter (
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
    ) as revenue
  from params as p
  cross join candidate
  left join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id
  group by
    p.report_id,
    p.workspace_id,
    p.advertiser_id,
    p.connection_id,
    candidate.external_account_id,
    candidate.date_from,
    candidate.date_to
),

overlap_scan as (
  select count(s.id)::bigint as overlap_rows
  from params as p
  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id
  where s.row ->> 'row_level' = 'keyword'
    and s.row ->> 'data_level' = 'keyword'
    and s.row ->> 'row_level_reason' =
        'naver_searchad_registered_keyword_daily_stats'
    and s.row #>> '{provider_meta,campaign_type}' =
        'BRAND_SEARCH'
    and exists (
      select 1
      from mixed_campaigns as m
      where m.campaign_id =
        nullif(
          btrim(
            s.row ->> 'external_campaign_id'
          ),
          ''
        )
    )
),

candidate_fingerprint_blocks as (
  select
    (
      s.row_index /
      p.fingerprint_block_size
    )::bigint as block_index,

    count(*)::bigint as block_rows,
    min(s.row_index)::bigint as block_min_row_index,
    max(s.row_index)::bigint as block_max_row_index,

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
  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id
  group by
    (
      s.row_index /
      p.fingerprint_block_size
    )::bigint
),

candidate_fingerprint as (
  select
    coalesce(
      sum(block.block_rows),
      0
    )::bigint as fingerprint_rows,

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
  from candidate_fingerprint_blocks as block
),

source_staging as (
  select
    count(s.id)::bigint as source_rows,
    min(s.row_index)::bigint as min_row_index,
    max(s.row_index)::bigint as max_row_index,

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
              order by
                s.row_index,
                s.row_key
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as source_identity_digest
  from params as p
  left join public.media_sync_staging_rows as s
    on s.job_id = p.source_job_id
),

report_rows_state as (
  select
    count(r.id)::bigint as total_report_rows,

    count(r.id) filter (
      where r.ingestion_id =
        p.current_ingestion_id
    )::bigint as current_report_rows,

    count(r.id) filter (
      where r.ingestion_id =
        p.published_ingestion_id
    )::bigint as published_report_rows
  from params as p
  left join public.report_rows as r
    on r.report_id = p.report_id
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
    ) as descriptor_digest
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
      and candidate.advertiser_id = p.advertiser_id
      and candidate.connection_id = p.connection_id
      and candidate.provider = 'naver_searchad'
      and candidate.status = 'cancelled'
      and candidate.progress = 99
      and candidate.attempt_count =
          p.expected_attempt_count
      and candidate.updated_at >
          p.original_candidate_updated_at
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
    ) as repaired_candidate_state_ok,

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
          'true',
      false
    ) as repaired_checkpoint_ok,

    coalesce(
      candidate.recovery ->> 'contract_version' =
          '2'
      and candidate.recovery ->> 'repair_kind' =
          'brand_search_cross_grain_dedup_v1'
      and candidate.recovery
          ->> 'repair_excluded_rows' =
          p.original_overlap_rows::text
      and candidate.recovery
          ->> 'repair_repaired_rows' =
          p.repaired_candidate_rows::text
      and candidate.recovery
          ->> 'repair_original_confirmation_token' =
          p.original_confirmation_token
      and candidate.recovery
          ->> 'confirmation_token'
          ~ '^[0-9a-f]{64}$'
      and candidate.recovery
          ->> 'confirmation_token'
          <> p.original_confirmation_token
      and candidate.recovery
          ->> 'repair_repaired_staging_fingerprint'
          ~ '^[0-9a-f]{64}$'
      and candidate.recovery
          ->> 'repair_repaired_staging_fingerprint' =
          candidate_fingerprint.candidate_fingerprint,
      false
    ) as repaired_recovery_contract_ok,

    coalesce(
      candidate_scan.candidate_rows =
          p.repaired_candidate_rows
      and candidate_scan.min_row_index = 0
      and candidate_scan.max_row_index =
          p.repaired_candidate_rows - 1
      and candidate_scan.distinct_row_indexes =
          p.repaired_candidate_rows
      and candidate_scan.keyword_rows =
          p.repaired_keyword_rows
      and candidate_scan.creative_rows =
          p.repaired_creative_rows
      and candidate_scan.mixed_rows =
          p.repaired_mixed_rows
      and candidate_scan.invalid_fingerprint_rows = 0
      and candidate_scan.scope_mismatch_rows = 0
      and candidate_scan.canonical_mismatch_rows = 0
      and overlap_scan.overlap_rows = 0
      and candidate_scan.impressions =
          p.repaired_impressions
      and candidate_scan.clicks =
          p.repaired_clicks
      and candidate_scan.cost =
          p.repaired_cost
      and candidate_scan.conversions =
          p.repaired_conversions
      and candidate_scan.revenue =
          p.repaired_revenue
      and candidate_fingerprint.fingerprint_rows =
          p.repaired_candidate_rows,
      false
    ) as repaired_staging_ok,

    coalesce(
      candidate.status = 'cancelled'
      and candidate.progress = 99
      and candidate.attempt_count =
          p.expected_attempt_count
      and candidate.updated_at =
          p.original_candidate_updated_at
      and candidate.raw_rows =
          p.original_candidate_rows
      and candidate.normalized_rows =
          p.original_candidate_rows
      and candidate.inserted_rows =
          p.original_candidate_rows
      and candidate.failed_rows = 0
      and candidate.snapshot_ingestion_id is null
      and candidate.recovery
          ->> 'confirmation_token' =
          p.original_confirmation_token
      and candidate_scan.candidate_rows =
          p.original_candidate_rows
      and candidate_scan.min_row_index = 0
      and candidate_scan.max_row_index =
          p.original_candidate_rows - 1
      and candidate_scan.distinct_row_indexes =
          p.original_candidate_rows
      and overlap_scan.overlap_rows =
          p.original_overlap_rows
      and candidate_fingerprint.fingerprint_rows =
          p.original_candidate_rows
      and candidate_fingerprint.candidate_fingerprint =
          p.original_candidate_fingerprint,
      false
    ) as original_state_unchanged_ok,

    coalesce(
      source_job.id = p.source_job_id
      and source_job.status = 'failed'
      and source_job.snapshot_ingestion_id is null
      and source_staging.source_rows =
          p.expected_source_staging_rows
      and source_staging.min_row_index = 0
      and source_staging.max_row_index =
          p.expected_source_staging_rows - 1
      and source_staging.source_identity_digest =
          p.expected_source_identity_digest,
      false
    ) as source_unchanged_ok,

    coalesce(
      report_state.current_ingestion_id =
          p.current_ingestion_id
      and report_state.published_ingestion_id =
          p.published_ingestion_id
      and active_jobs.active_job_count = 0
      and report_rows_state.total_report_rows =
          p.expected_total_report_rows
      and report_rows_state.current_report_rows =
          p.expected_current_report_rows
      and report_rows_state.published_report_rows =
          p.expected_published_report_rows
      and report_ingestions_state.report_ingestions_count =
          p.expected_report_ingestions_count
      and report_ingestions_state.descriptor_digest =
          p.expected_report_ingestions_descriptor_digest
      and current_sentinels.sentinel_count = 3
      and current_sentinels.sentinel_digest =
          p.expected_current_canonical_sentinel_digest
      and published_sentinels.sentinel_count = 3
      and published_sentinels.sentinel_digest =
          p.expected_published_canonical_sentinel_digest,
      false
    ) as active_report_state_unchanged_ok,

    candidate.updated_at
      as candidate_updated_at,

    candidate.recovery ->> 'confirmation_token'
      as stored_confirmation_token,

    candidate.recovery
      ->> 'repair_repaired_staging_fingerprint'
      as stored_repaired_staging_fingerprint,

    candidate_scan.*,
    overlap_scan.overlap_rows,
    candidate_fingerprint.fingerprint_rows,
    candidate_fingerprint.candidate_fingerprint,
    active_jobs.active_job_count,
    report_state.current_ingestion_id,
    report_state.published_ingestion_id,
    report_rows_state.total_report_rows,
    report_rows_state.current_report_rows,
    report_rows_state.published_report_rows,
    report_ingestions_state.report_ingestions_count,
    report_ingestions_state.descriptor_digest

  from params as p
  cross join candidate
  cross join source_job
  cross join report_state
  cross join active_jobs
  cross join candidate_scan
  cross join overlap_scan
  cross join candidate_fingerprint
  cross join source_staging
  cross join report_rows_state
  cross join report_ingestions_state
  cross join current_sentinels
  cross join published_sentinels
)

select
  case
    when repaired_candidate_state_ok
     and repaired_checkpoint_ok
     and repaired_recovery_contract_ok
     and repaired_staging_ok
     and source_unchanged_ok
     and active_report_state_unchanged_ok
      then 'repair_committed'

    when original_state_unchanged_ok
     and source_unchanged_ok
     and active_report_state_unchanged_ok
      then 'repair_not_committed'

    else 'ambiguous_stop'
  end as repair_transaction_outcome,

  (
    repaired_candidate_state_ok
    and repaired_checkpoint_ok
    and repaired_recovery_contract_ok
    and repaired_staging_ok
    and source_unchanged_ok
    and active_report_state_unchanged_ok
  ) as repair_committed_ok,

  (
    original_state_unchanged_ok
    and source_unchanged_ok
    and active_report_state_unchanged_ok
  ) as repair_not_committed_ok,

  array_remove(
    array[
      case
        when not repaired_candidate_state_ok
        then 'repaired_candidate_state_ok'
      end,
      case
        when not repaired_checkpoint_ok
        then 'repaired_checkpoint_ok'
      end,
      case
        when not repaired_recovery_contract_ok
        then 'repaired_recovery_contract_ok'
      end,
      case
        when not repaired_staging_ok
        then 'repaired_staging_ok'
      end,
      case
        when not source_unchanged_ok
        then 'source_unchanged_ok'
      end,
      case
        when not active_report_state_unchanged_ok
        then 'active_report_state_unchanged_ok'
      end
    ],
    null
  ) as failed_committed_checks,

  array_remove(
    array[
      case
        when not original_state_unchanged_ok
        then 'original_state_unchanged_ok'
      end,
      case
        when not source_unchanged_ok
        then 'source_unchanged_ok'
      end,
      case
        when not active_report_state_unchanged_ok
        then 'active_report_state_unchanged_ok'
      end
    ],
    null
  ) as failed_not_committed_checks,

  repaired_candidate_state_ok,
  repaired_checkpoint_ok,
  repaired_recovery_contract_ok,
  repaired_staging_ok,
  original_state_unchanged_ok,
  source_unchanged_ok,
  active_report_state_unchanged_ok,

  candidate_updated_at,
  stored_confirmation_token,
  stored_repaired_staging_fingerprint,

  candidate_rows,
  min_row_index,
  max_row_index,
  distinct_row_indexes,
  keyword_rows,
  creative_rows,
  mixed_rows,
  overlap_rows,

  impressions,
  clicks,
  cost,
  conversions,
  revenue,

  fingerprint_rows,
  candidate_fingerprint,

  active_job_count,
  current_ingestion_id,
  published_ingestion_id,
  total_report_rows,
  current_report_rows,
  published_report_rows,
  report_ingestions_count,
  descriptor_digest

from checks;