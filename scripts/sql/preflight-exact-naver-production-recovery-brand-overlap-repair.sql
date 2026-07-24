/*
 * Etrylue Performance
 * Exact read-only preflight before one-time Brand Search cross-grain repair.
 *
 * SELECT only:
 * - no INSERT / UPDATE / DELETE
 * - no RPC
 * - no materialization / activation / finalization
 *
 * Exact target:
 * - candidate job: 4191baff-393f-4be8-bb38-31548d3ba051
 * - current completed candidate: 45,808 rows
 * - remove only 1,204 overlapping BRAND_SEARCH keyword rows
 * - projected repaired candidate: 44,604 rows
 */
with
params as (
  select
    '4191baff-393f-4be8-bb38-31548d3ba051'::uuid as candidate_job_id,
    '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'::uuid as source_job_id,
    'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid as report_id,
    '27b1556f-9d42-496f-bd7e-5a59ebee71d4'::uuid as workspace_id,
    'da51e71a-01ce-42fb-a937-7af0b5f47786'::uuid as advertiser_id,
    'aba7d28f-ec85-49db-941a-fa5babe2af61'::uuid as connection_id,

    '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid as current_ingestion_id,
    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid as published_ingestion_id,

    '2026-07-22 00:27:59.363+00'::timestamptz
      as expected_candidate_updated_at,

    '2026-07-19 11:59:16.834+00'::timestamptz
      as expected_source_job_updated_at,

    '31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127'::text
      as expected_confirmation_token,

    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40'::text
      as expected_source_identity_digest,

    'f11def9d7faa36e7233878a5cb533c048c17225f519324de80c289f5d8e4ad28'::text
      as expected_candidate_fingerprint,

    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776'::text
      as expected_report_ingestions_descriptor_digest,

    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7'::text
      as expected_current_sentinel_digest,

    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0'::text
      as expected_published_sentinel_digest,

    12::bigint as expected_attempt_count,
    44500::bigint as expected_source_job_rows,
    44514::bigint as expected_source_staging_rows,
    45808::bigint as expected_candidate_rows,
    1204::bigint as expected_excluded_rows,
    44604::bigint as expected_repaired_rows,

    43310::bigint as expected_repaired_keyword_rows,
    1244::bigint as expected_repaired_creative_rows,
    50::bigint as expected_repaired_mixed_rows,

    9707::numeric as expected_before_impressions,
    2275::numeric as expected_before_clicks,
    113850::numeric as expected_before_cost,
    132::numeric as expected_before_conversions,
    20368600::numeric as expected_before_revenue,

    2632::numeric as expected_excluded_impressions,
    1092::numeric as expected_excluded_clicks,
    0::numeric as expected_excluded_cost,
    65::numeric as expected_excluded_conversions,
    7639300::numeric as expected_excluded_revenue,

    7075::numeric as expected_after_impressions,
    1183::numeric as expected_after_clicks,
    113850::numeric as expected_after_cost,
    67::numeric as expected_after_conversions,
    12729300::numeric as expected_after_revenue,

    359716::bigint as expected_total_report_rows,
    118::bigint as expected_current_report_rows,
    44514::bigint as expected_published_report_rows,
    11::bigint as expected_report_ingestions_count,
    10000::bigint as fingerprint_block_size
),

candidate as (
  select
    job.*,
    job.error_detail -> 'processing_checkpoint' as checkpoint,
    job.error_detail #> '{processing_checkpoint,recovery}' as recovery
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

unique_contract as (
  select
    count(*)::bigint as required_unique_constraint_count,
    coalesce(bool_and(c.convalidated), false)
      as required_unique_constraints_validated
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.media_sync_staging_rows'::regclass
    and c.contype = 'u'
    and c.conname in (
      'media_sync_staging_rows_job_row_index_unique',
      'media_sync_staging_rows_job_window_row_key_unique'
    )
),

source_staging as (
  select
    count(s.id)::bigint as source_rows,
    min(s.row_index)::bigint as source_min_row_index,
    max(s.row_index)::bigint as source_max_row_index,

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
    )::bigint as source_invalid_fingerprint_rows,

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
    ) as source_identity_digest
  from params as p
  left join public.media_sync_staging_rows as s
    on s.job_id = p.source_job_id
),

mixed_campaigns as materialized (
  select distinct
    nullif(btrim(s.row ->> 'external_campaign_id'), '') as campaign_id
  from params as p
  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id
  where s.row ->> 'row_level' = 'mixed'
    and s.row ->> 'data_level' = 'mixed'
    and s.row ->> 'row_level_reason' =
        'naver_searchad_brand_search_adgroup_daily_stats'
    and nullif(btrim(s.row ->> 'external_campaign_id'), '') is not null
),

classified_rows as materialized (
  select
    s.id,
    s.row_index,
    s.date_window_index,
    s.row_key,
    s.row_fingerprint,
    s.row,

    (
      s.row_index < p.expected_source_staging_rows
      and s.row ->> 'row_level' = 'keyword'
      and s.row ->> 'data_level' = 'keyword'
      and s.row ->> 'row_level_reason' =
          'naver_searchad_registered_keyword_daily_stats'
      and s.row #>> '{provider_meta,campaign_type}' = 'BRAND_SEARCH'
      and exists (
        select 1
        from mixed_campaigns as m
        where m.campaign_id =
          nullif(btrim(s.row ->> 'external_campaign_id'), '')
      )
    ) as excluded
  from params as p
  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id
),

candidate_scan as (
  select
    count(*)::bigint as candidate_rows,
    min(c.row_index)::bigint as min_row_index,
    max(c.row_index)::bigint as max_row_index,
    count(*) filter (where c.excluded)::bigint as excluded_rows,
    count(*) filter (where not c.excluded)::bigint as repaired_rows,

    count(*) filter (
      where not c.excluded
        and c.row ->> 'row_level' = 'keyword'
    )::bigint as repaired_keyword_rows,

    count(*) filter (
      where not c.excluded
        and c.row ->> 'row_level' = 'creative'
    )::bigint as repaired_creative_rows,

    count(*) filter (
      where not c.excluded
        and c.row ->> 'row_level' = 'mixed'
    )::bigint as repaired_mixed_rows,

    count(*) filter (
      where c.row_fingerprint is null
         or c.row_fingerprint !~ '^[0-9a-f]{64}$'
         or c.row is null
         or c.row_fingerprint is distinct from
            encode(
              extensions.digest(
                pg_catalog.convert_to(c.row::text, 'UTF8'),
                'sha256'
              ),
              'hex'
            )
    )::bigint as invalid_fingerprint_rows,

    coalesce(sum((c.row ->> 'impressions')::numeric), 0)
      as before_impressions,
    coalesce(sum((c.row ->> 'clicks')::numeric), 0)
      as before_clicks,
    coalesce(sum((c.row ->> 'cost')::numeric), 0)
      as before_cost,
    coalesce(sum((c.row ->> 'conversions')::numeric), 0)
      as before_conversions,
    coalesce(sum((c.row ->> 'revenue')::numeric), 0)
      as before_revenue,

    coalesce(sum((c.row ->> 'impressions')::numeric)
      filter (where c.excluded), 0) as excluded_impressions,
    coalesce(sum((c.row ->> 'clicks')::numeric)
      filter (where c.excluded), 0) as excluded_clicks,
    coalesce(sum((c.row ->> 'cost')::numeric)
      filter (where c.excluded), 0) as excluded_cost,
    coalesce(sum((c.row ->> 'conversions')::numeric)
      filter (where c.excluded), 0) as excluded_conversions,
    coalesce(sum((c.row ->> 'revenue')::numeric)
      filter (where c.excluded), 0) as excluded_revenue,

    count(distinct nullif(btrim(c.row ->> 'external_campaign_id'), ''))
      filter (where c.excluded)::bigint as matched_campaign_count
  from classified_rows as c
),

unexpected_overlap as (
  select count(*)::bigint as unexpected_overlap_rows
  from params as p
  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id
  where s.row_index < p.expected_source_staging_rows
    and exists (
      select 1
      from mixed_campaigns as m
      where m.campaign_id =
        nullif(btrim(s.row ->> 'external_campaign_id'), '')
    )
    and not (
      s.row ->> 'row_level' = 'keyword'
      and s.row ->> 'data_level' = 'keyword'
      and s.row ->> 'row_level_reason' =
          'naver_searchad_registered_keyword_daily_stats'
      and s.row #>> '{provider_meta,campaign_type}' = 'BRAND_SEARCH'
    )
),

matched_campaigns as (
  select distinct
    nullif(btrim(c.row ->> 'external_campaign_id'), '') as campaign_id
  from classified_rows as c
  where c.excluded
),

mixed_only_campaigns as (
  select count(*)::bigint as mixed_only_campaign_count
  from mixed_campaigns as m
  where not exists (
    select 1
    from matched_campaigns as matched
    where matched.campaign_id = m.campaign_id
  )
),

candidate_fingerprint_blocks as (
  select
    (c.row_index / p.fingerprint_block_size)::bigint as block_index,
    count(*)::bigint as block_rows,
    min(c.row_index)::bigint as block_min_row_index,
    max(c.row_index)::bigint as block_max_row_index,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              c.row_index::text || ':' || c.row_fingerprint,
              E'\n'
              order by c.row_index
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
  join classified_rows as c
    on true
  group by
    (c.row_index / p.fingerprint_block_size)::bigint
),

candidate_fingerprint as (
  select
    count(*)::bigint as block_count,
    coalesce(sum(b.block_rows), 0)::bigint as fingerprint_rows,

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
    ) as candidate_fingerprint
  from candidate_fingerprint_blocks as b
),

report_rows_state as (
  select
    count(r.id)::bigint as total_report_rows,
    count(r.id) filter (
      where r.ingestion_id = p.current_ingestion_id
    )::bigint as current_report_rows,
    count(r.id) filter (
      where r.ingestion_id = p.published_ingestion_id
    )::bigint as published_report_rows
  from params as p
  left join public.report_rows as r
    on r.report_id = p.report_id
),

report_ingestions_state as (
  select
    count(ri.id)::bigint as report_ingestions_count,

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
    ) as descriptor_digest
  from params as p
  left join public.report_ingestions as ri
    on ri.report_id = p.report_id
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
            order by r.row_index, r.id
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
   and r.ingestion_id = p.current_ingestion_id
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
            order by r.row_index, r.id
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
   and r.ingestion_id = p.published_ingestion_id
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
      and candidate.attempt_count = p.expected_attempt_count
      and candidate.updated_at = p.expected_candidate_updated_at
      and candidate.raw_rows = p.expected_candidate_rows
      and candidate.normalized_rows = p.expected_candidate_rows
      and candidate.inserted_rows = p.expected_candidate_rows
      and candidate.failed_rows = 0
      and candidate.error is null
      and candidate.started_at is null
      and candidate.finished_at is null
      and candidate.snapshot_ingestion_id is null
      and candidate.previous_ingestion_id = p.current_ingestion_id,
      false
    ) as candidate_state_ok,

    coalesce(
      candidate.checkpoint #>> '{version}' = '1'
      and candidate.checkpoint #>> '{collector,combined_version}' = '1'
      and candidate.checkpoint #>> '{collector,phase}' = 'completed'
      and candidate.checkpoint #>> '{collector,next_row_index}' =
          p.expected_candidate_rows::text
      and candidate.checkpoint #>> '{inserted_rows}' =
          p.expected_candidate_rows::text
      and candidate.checkpoint #>> '{collector,keyword,complete}' = 'true'
      and candidate.checkpoint #>> '{collector,authoritative,complete}' = 'true',
      false
    ) as completed_checkpoint_ok,

    coalesce(
      candidate.recovery ->> 'confirmation_token' =
        p.expected_confirmation_token,
      false
    ) as old_confirmation_token_ok,

    coalesce(
      source_job.id = p.source_job_id
      and source_job.status = 'failed'
      and source_job.updated_at = p.expected_source_job_updated_at
      and source_job.raw_rows = p.expected_source_job_rows
      and source_job.normalized_rows = p.expected_source_job_rows
      and source_job.inserted_rows = p.expected_source_job_rows
      and source_job.failed_rows = 0
      and source_job.snapshot_ingestion_id is null,
      false
    ) as source_job_ok,

    coalesce(
      source_staging.source_rows = p.expected_source_staging_rows
      and source_staging.source_min_row_index = 0
      and source_staging.source_max_row_index =
          p.expected_source_staging_rows - 1
      and source_staging.source_invalid_fingerprint_rows = 0
      and source_staging.source_identity_digest =
          p.expected_source_identity_digest,
      false
    ) as source_staging_ok,

    coalesce(
      candidate_scan.candidate_rows = p.expected_candidate_rows
      and candidate_scan.min_row_index = 0
      and candidate_scan.max_row_index = p.expected_candidate_rows - 1
      and candidate_scan.excluded_rows = p.expected_excluded_rows
      and candidate_scan.repaired_rows = p.expected_repaired_rows
      and candidate_scan.repaired_keyword_rows =
          p.expected_repaired_keyword_rows
      and candidate_scan.repaired_creative_rows =
          p.expected_repaired_creative_rows
      and candidate_scan.repaired_mixed_rows =
          p.expected_repaired_mixed_rows
      and candidate_scan.invalid_fingerprint_rows = 0
      and candidate_scan.matched_campaign_count = 3,
      false
    ) as repair_scope_ok,

    coalesce(
      candidate_scan.before_impressions = p.expected_before_impressions
      and candidate_scan.before_clicks = p.expected_before_clicks
      and candidate_scan.before_cost = p.expected_before_cost
      and candidate_scan.before_conversions = p.expected_before_conversions
      and candidate_scan.before_revenue = p.expected_before_revenue
      and candidate_scan.excluded_impressions =
          p.expected_excluded_impressions
      and candidate_scan.excluded_clicks = p.expected_excluded_clicks
      and candidate_scan.excluded_cost = p.expected_excluded_cost
      and candidate_scan.excluded_conversions =
          p.expected_excluded_conversions
      and candidate_scan.excluded_revenue = p.expected_excluded_revenue
      and candidate_scan.before_impressions -
          candidate_scan.excluded_impressions =
          p.expected_after_impressions
      and candidate_scan.before_clicks -
          candidate_scan.excluded_clicks =
          p.expected_after_clicks
      and candidate_scan.before_cost -
          candidate_scan.excluded_cost =
          p.expected_after_cost
      and candidate_scan.before_conversions -
          candidate_scan.excluded_conversions =
          p.expected_after_conversions
      and candidate_scan.before_revenue -
          candidate_scan.excluded_revenue =
          p.expected_after_revenue,
      false
    ) as projected_metrics_ok,

    coalesce(
      (select count(*) from mixed_campaigns) = 5
      and mixed_only_campaigns.mixed_only_campaign_count = 2
      and unexpected_overlap.unexpected_overlap_rows = 0,
      false
    ) as campaign_boundary_ok,

    coalesce(
      candidate_fingerprint.fingerprint_rows =
          p.expected_candidate_rows
      and candidate_fingerprint.candidate_fingerprint =
          p.expected_candidate_fingerprint,
      false
    ) as current_candidate_fingerprint_ok,

    coalesce(
      report_state.current_ingestion_id = p.current_ingestion_id
      and report_state.published_ingestion_id = p.published_ingestion_id
      and active_jobs.active_job_count = 0,
      false
    ) as pointer_and_isolation_ok,

    coalesce(
      unique_contract.required_unique_constraint_count = 2
      and unique_contract.required_unique_constraints_validated,
      false
    ) as unique_contract_ok,

    coalesce(
      report_rows_state.total_report_rows = p.expected_total_report_rows
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
          p.expected_current_sentinel_digest
      and published_sentinels.sentinel_count = 3
      and published_sentinels.sentinel_digest =
          p.expected_published_sentinel_digest,
      false
    ) as active_report_state_ok,

    candidate.updated_at as candidate_updated_at,
    candidate_scan.*,
    mixed_only_campaigns.mixed_only_campaign_count,
    unexpected_overlap.unexpected_overlap_rows,
    candidate_fingerprint.candidate_fingerprint,
    source_staging.source_identity_digest,
    report_rows_state.*,
    report_ingestions_state.report_ingestions_count,
    report_ingestions_state.descriptor_digest
  from params as p
  cross join candidate
  cross join source_job
  cross join report_state
  cross join active_jobs
  cross join unique_contract
  cross join source_staging
  cross join candidate_scan
  cross join mixed_only_campaigns
  cross join unexpected_overlap
  cross join candidate_fingerprint
  cross join report_rows_state
  cross join report_ingestions_state
  cross join current_sentinels
  cross join published_sentinels
)

select
  (
    candidate_state_ok
    and completed_checkpoint_ok
    and old_confirmation_token_ok
    and source_job_ok
    and source_staging_ok
    and repair_scope_ok
    and projected_metrics_ok
    and campaign_boundary_ok
    and current_candidate_fingerprint_ok
    and pointer_and_isolation_ok
    and unique_contract_ok
    and active_report_state_ok
  ) as safe_to_execute_exact_brand_overlap_repair,

  array_remove(
    array[
      case when not candidate_state_ok
        then 'candidate_state_ok' end,
      case when not completed_checkpoint_ok
        then 'completed_checkpoint_ok' end,
      case when not old_confirmation_token_ok
        then 'old_confirmation_token_ok' end,
      case when not source_job_ok
        then 'source_job_ok' end,
      case when not source_staging_ok
        then 'source_staging_ok' end,
      case when not repair_scope_ok
        then 'repair_scope_ok' end,
      case when not projected_metrics_ok
        then 'projected_metrics_ok' end,
      case when not campaign_boundary_ok
        then 'campaign_boundary_ok' end,
      case when not current_candidate_fingerprint_ok
        then 'current_candidate_fingerprint_ok' end,
      case when not pointer_and_isolation_ok
        then 'pointer_and_isolation_ok' end,
      case when not unique_contract_ok
        then 'unique_contract_ok' end,
      case when not active_report_state_ok
        then 'active_report_state_ok' end
    ],
    null
  ) as failed_checks,

  *
from checks;