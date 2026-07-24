/*
 * Etrylue Performance
 * Read-only validation after exact Naver authoritative completed boundary
 *
 * SELECT only:
 * - no INSERT / UPDATE / DELETE
 * - no RPC
 * - no materialization / activation / finalization
 *
 * Large-volume contract:
 * - 44,514 is only the immutable keyword-source prefix boundary.
 * - Candidate total is read dynamically from job/checkpoint/live staging.
 * - Candidate metrics and structural checks use one aggregate scan.
 * - Candidate fingerprint uses fixed-size 10,000-row blocks; no candidate-wide
 *   string_agg, JSON aggregate, or FULL OUTER JOIN.
 * - Duplicate row-key checks use the persisted unique contract plus an indexed
 *   EXISTS/HAVING safety scan.
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

    '2026-07-22 00:16:40.562+00'::timestamptz
      as previous_candidate_updated_at,

    '2026-07-19 11:59:16.834+00'::timestamptz
      as expected_source_job_updated_at,

    '31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127'::text
      as expected_confirmation_token,

    'ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40'::text
      as expected_source_identity_digest,

    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776'::text
      as expected_report_ingestions_descriptor_digest,

    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7'::text
      as expected_current_sentinel_digest,

    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0'::text
      as expected_published_sentinel_digest,

    12::bigint
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
      as expected_published_report_rows,

    10000::bigint
      as fingerprint_block_size
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
      as required_unique_constraint_count,

    coalesce(
      bool_and(constraint_record.convalidated),
      false
    ) as required_unique_constraints_validated

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
    count(s.id)::bigint
      as source_rows,

    min(s.row_index)::bigint
      as source_min_row_index,

    max(s.row_index)::bigint
      as source_max_row_index,

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
              order by s.row_index asc, s.row_key asc
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

/*
 * One dynamic candidate scan for continuity, scope, grain, canonical shape,
 * fingerprint validity, and metric totals.
 */
candidate_scan as (
  select
    count(s.id)::bigint
      as candidate_rows,

    min(s.row_index)::bigint
      as candidate_min_row_index,

    max(s.row_index)::bigint
      as candidate_max_row_index,

    count(s.id) filter (
      where s.row_index < p.source_boundary
    )::bigint as candidate_prefix_rows,

    count(s.id) filter (
      where s.row_index >= p.source_boundary
    )::bigint as candidate_tail_rows,

    count(s.id) filter (
      where s.row_index < p.source_boundary
        and s.row ->> 'row_level' = 'keyword'
        and s.row ->> 'data_level' = 'keyword'
    )::bigint as prefix_keyword_rows,

    count(s.id) filter (
      where s.row_index < p.source_boundary
        and not coalesce(
          (
            s.row ->> 'row_level' = 'keyword'
            and s.row ->> 'data_level' = 'keyword'
          ),
          false
        )
    )::bigint as prefix_nonkeyword_rows,

    count(s.id) filter (
      where s.row_index >= p.source_boundary
        and s.row ->> 'row_level' = 'keyword'
    )::bigint as tail_keyword_rows,

    count(s.id) filter (
      where s.row_index >= p.source_boundary
        and s.row ->> 'row_level' = 'creative'
        and s.row ->> 'data_level' = 'creative'
    )::bigint as tail_creative_rows,

    count(s.id) filter (
      where s.row_index >= p.source_boundary
        and s.row ->> 'row_level' = 'mixed'
        and s.row ->> 'data_level' = 'mixed'
    )::bigint as tail_mixed_rows,

    count(s.id) filter (
      where s.row_index >= p.source_boundary
        and coalesce(s.row ->> 'row_level', '') not in (
          'creative',
          'mixed'
        )
    )::bigint as tail_other_rows,

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
                pg_catalog.convert_to(s.row::text, 'UTF8'),
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
         or s.external_account_id is distinct from candidate.external_account_id
         or s.date_from is distinct from candidate.date_from
         or s.date_to is distinct from candidate.date_to
         or s.date < candidate.date_from
         or s.date > candidate.date_to
    )::bigint as scope_mismatch_rows,

    count(s.id) filter (
      where jsonb_typeof(s.row) is distinct from 'object'
         or coalesce(s.row ->> 'date', '') <> s.date::text
         or coalesce(s.row ->> 'report_date', '') <> s.date::text
         or coalesce(s.row ->> 'day', '') <> s.date::text
         or coalesce(s.row ->> 'ymd', '') <> s.date::text
         or coalesce(s.row ->> 'channel', '') <> coalesce(s.channel, '')
         or coalesce(s.row ->> 'device', '') <> coalesce(s.device, '')
         or coalesce(s.row ->> 'source', '') <> coalesce(s.source, '')
         or coalesce(s.row ->> 'provider', '') <> 'naver_searchad'
         or coalesce(s.row ->> 'external_account_id', '') <>
            coalesce(candidate.external_account_id, '')
         or coalesce(s.row ->> 'ingestion_source', '') <> 'api'
         or length(btrim(coalesce(s.row_key, ''))) = 0
    )::bigint as canonical_mismatch_rows,

    count(s.id) filter (
      where jsonb_typeof(s.row -> 'impressions') is distinct from 'number'
         or jsonb_typeof(s.row -> 'clicks') is distinct from 'number'
         or jsonb_typeof(s.row -> 'cost') is distinct from 'number'
         or jsonb_typeof(s.row -> 'conversions') is distinct from 'number'
         or jsonb_typeof(s.row -> 'revenue') is distinct from 'number'
         or case
              when jsonb_typeof(s.row -> 'impressions') = 'number'
              then (s.row ->> 'impressions')::numeric < 0
              else true
            end
         or case
              when jsonb_typeof(s.row -> 'clicks') = 'number'
              then (s.row ->> 'clicks')::numeric < 0
              else true
            end
         or case
              when jsonb_typeof(s.row -> 'cost') = 'number'
              then (s.row ->> 'cost')::numeric < 0
              else true
            end
         or case
              when jsonb_typeof(s.row -> 'conversions') = 'number'
              then (s.row ->> 'conversions')::numeric < 0
              else true
            end
         or case
              when jsonb_typeof(s.row -> 'revenue') = 'number'
              then (s.row ->> 'revenue')::numeric < 0
              else true
            end
    )::bigint as invalid_metric_rows,

    count(s.id) filter (
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

    coalesce(
      sum(
        case
          when jsonb_typeof(s.row -> 'impressions') = 'number'
          then (s.row ->> 'impressions')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as total_impressions,

    coalesce(
      sum(
        case
          when jsonb_typeof(s.row -> 'clicks') = 'number'
          then (s.row ->> 'clicks')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as total_clicks,

    coalesce(
      sum(
        case
          when jsonb_typeof(s.row -> 'cost') = 'number'
          then (s.row ->> 'cost')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as total_cost,

    coalesce(
      sum(
        case
          when jsonb_typeof(s.row -> 'conversions') = 'number'
          then (s.row ->> 'conversions')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as total_conversions,

    coalesce(
      sum(
        case
          when jsonb_typeof(s.row -> 'revenue') = 'number'
          then (s.row ->> 'revenue')::numeric
          else 0::numeric
        end
      ),
      0::numeric
    ) as total_revenue

  from params as p

  cross join candidate

  left join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id

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

grain_metrics as (
  select
    coalesce(
      jsonb_object_agg(
        grain.row_level,
        jsonb_build_object(
          'rows', grain.row_count,
          'impressions', grain.impressions,
          'clicks', grain.clicks,
          'cost', grain.cost,
          'conversions', grain.conversions,
          'revenue', grain.revenue
        )
        order by grain.row_level
      ),
      '{}'::jsonb
    ) as metrics_by_grain

  from (
    select
      coalesce(s.row ->> 'row_level', '<missing>')
        as row_level,

      count(*)::bigint
        as row_count,

      coalesce(sum(
        case when jsonb_typeof(s.row -> 'impressions') = 'number'
          then (s.row ->> 'impressions')::numeric
          else 0::numeric end
      ), 0::numeric) as impressions,

      coalesce(sum(
        case when jsonb_typeof(s.row -> 'clicks') = 'number'
          then (s.row ->> 'clicks')::numeric
          else 0::numeric end
      ), 0::numeric) as clicks,

      coalesce(sum(
        case when jsonb_typeof(s.row -> 'cost') = 'number'
          then (s.row ->> 'cost')::numeric
          else 0::numeric end
      ), 0::numeric) as cost,

      coalesce(sum(
        case when jsonb_typeof(s.row -> 'conversions') = 'number'
          then (s.row ->> 'conversions')::numeric
          else 0::numeric end
      ), 0::numeric) as conversions,

      coalesce(sum(
        case when jsonb_typeof(s.row -> 'revenue') = 'number'
          then (s.row ->> 'revenue')::numeric
          else 0::numeric end
      ), 0::numeric) as revenue

    from params as p

    join public.media_sync_staging_rows as s
      on s.job_id = p.candidate_job_id

    group by
      coalesce(s.row ->> 'row_level', '<missing>')
  ) as grain
),

grain_reason_counts as (
  select
    coalesce(
      jsonb_object_agg(
        reason.row_level_reason,
        reason.row_count
        order by reason.row_level_reason
      ),
      '{}'::jsonb
    ) as rows_by_reason

  from (
    select
      coalesce(s.row ->> 'row_level_reason', '<missing>')
        as row_level_reason,

      count(*)::bigint
        as row_count

    from params as p

    join public.media_sync_staging_rows as s
      on s.job_id = p.candidate_job_id

    group by
      coalesce(s.row ->> 'row_level_reason', '<missing>')
  ) as reason
),

/* Persisted duplicate rows should be impossible, but verify the live candidate. */
duplicate_scan as (
  select
    exists (
      select 1

      from public.media_sync_staging_rows as s

      where s.job_id = p.candidate_job_id

      group by
        s.date_window_index,
        s.row_key

      having count(*) > 1

      limit 1
    ) as duplicate_row_key_detected,

    exists (
      select 1

      from public.media_sync_staging_rows as s

      where s.job_id = p.candidate_job_id

      group by
        s.date_window_index,
        s.row_key

      having min(s.row_fingerprint)
             is distinct from
             max(s.row_fingerprint)

      limit 1
    ) as fingerprint_conflict_detected

  from params as p
),

/*
 * Scalable deterministic validation fingerprint:
 * - each string_agg is bounded to 10,000 rows;
 * - only block digests are concatenated for the final digest.
 */
fingerprint_blocks as (
  select
    (s.row_index / p.fingerprint_block_size)::bigint
      as block_index,

    count(*)::bigint
      as block_rows,

    min(s.row_index)::bigint
      as block_min_row_index,

    max(s.row_index)::bigint
      as block_max_row_index,

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

  from params as p

  join public.media_sync_staging_rows as s
    on s.job_id = p.candidate_job_id

  group by
    (s.row_index / p.fingerprint_block_size)::bigint
),

candidate_fingerprint as (
  select
    'chunked_sha256_v1:block_size=10000'::text
      as fingerprint_algorithm,

    count(*)::bigint
      as fingerprint_block_count,

    coalesce(sum(block.block_rows), 0)::bigint
      as fingerprint_rows,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          'chunked_sha256_v1:block_size=10000' || E'\n' ||
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
    ) as completed_staging_fingerprint

  from fingerprint_blocks as block
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

report_ingestions_state as (
  select
    count(ingestion.id)::bigint
      as report_ingestions_count,

    coalesce(sum(ingestion.row_count), 0)::bigint
      as total_report_rows_metadata_count,

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
          candidate_scan.candidate_rows::text || E'\n' ||
        'base_rows=' ||
          source_staging.source_rows::text || E'\n' ||
        'base_identity_digest=' ||
          source_staging.source_identity_digest || E'\n' ||
        'total_report_rows=' ||
          p.expected_total_report_rows::text || E'\n' ||
        'current_report_rows=' ||
          p.expected_current_report_rows::text || E'\n' ||
        'published_report_rows=' ||
          p.expected_published_report_rows::text,
        'sha256'
      ),
      'hex'
    ) as recalculated_confirmation_token

  from params as p

  cross join candidate
  cross join report_state
  cross join candidate_scan
  cross join source_staging
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
      and candidate.raw_rows > p.source_boundary
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
    ) as candidate_completed_isolation_ok,

    coalesce(
      candidate.updated_at > p.previous_candidate_updated_at,
      false
    ) as candidate_updated_after_completion_ok,

    coalesce(
      candidate.checkpoint #>> '{version}' = '1'
      and candidate.checkpoint #>> '{collector,combined_version}' = '1'
      and candidate.checkpoint #>> '{collector,phase}' = 'completed'
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
        'true',
      false
    ) as completed_checkpoint_ok,

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
      and candidate.recovery ->> 'source_job_id' = p.source_job_id::text
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
      and report_state.published_ingestion_id = p.published_ingestion_id,
      false
    ) as report_pointer_state_ok,

    coalesce(
      active_jobs.active_job_count = 0,
      false
    ) as no_active_jobs_ok,

    coalesce(
      staging_unique_contract.required_unique_constraint_count = 2
      and staging_unique_contract.required_unique_constraints_validated,
      false
    ) as staging_unique_contract_ok,

    coalesce(
      source_staging.source_rows = p.source_boundary
      and source_staging.source_min_row_index = 0
      and source_staging.source_max_row_index = p.source_boundary - 1
      and source_staging.source_invalid_fingerprint_rows = 0
      and source_staging.source_identity_digest =
        p.expected_source_identity_digest,
      false
    ) as source_prefix_base_ok,

    coalesce(
      candidate_scan.candidate_rows = candidate.raw_rows
      and candidate_scan.candidate_min_row_index = 0
      and candidate_scan.candidate_max_row_index = candidate.raw_rows - 1
      and candidate_scan.candidate_prefix_rows = p.source_boundary
      and candidate_scan.candidate_tail_rows =
        candidate.raw_rows - p.source_boundary
      and candidate_scan.prefix_keyword_rows = p.source_boundary
      and candidate_scan.prefix_nonkeyword_rows = 0
      and candidate_scan.tail_keyword_rows = 0
      and candidate_scan.tail_creative_rows + candidate_scan.tail_mixed_rows =
        candidate_scan.candidate_tail_rows
      and candidate_scan.tail_other_rows = 0
      and candidate_scan.keyword_rows +
          candidate_scan.creative_rows +
          candidate_scan.mixed_rows =
        candidate_scan.candidate_rows
      and candidate_scan.invalid_fingerprint_rows = 0
      and candidate_scan.scope_mismatch_rows = 0
      and candidate_scan.canonical_mismatch_rows = 0
      and candidate_scan.invalid_metric_rows = 0
      and candidate_scan.invalid_grain_rows = 0,
      false
    ) as completed_staging_structure_ok,

    coalesce(
      not duplicate_scan.duplicate_row_key_detected
      and not duplicate_scan.fingerprint_conflict_detected,
      false
    ) as duplicate_and_conflict_free_ok,

    coalesce(
      candidate_prefix_comparison.candidate_prefix_mismatch_rows = 0,
      false
    ) as source_prefix_exact_match_ok,

    coalesce(
      candidate_fingerprint.fingerprint_rows = candidate_scan.candidate_rows
      and candidate_fingerprint.fingerprint_block_count =
        ((candidate_scan.candidate_rows + p.fingerprint_block_size - 1) /
          p.fingerprint_block_size)
      and candidate_fingerprint.completed_staging_fingerprint ~
        '^[0-9a-f]{64}$',
      false
    ) as completed_staging_fingerprint_ok,

    coalesce(
      /*
       * expected_total_report_rows is the exact public.report_rows baseline.
       * It must not be compared with sum(report_ingestions.row_count).
       * The pre-completion descriptor digest below covers every
       * report_ingestions id/row_count/status/error/updated_at value.
       */
      report_ingestions_state.current_descriptor_count = 1
      and report_ingestions_state.current_descriptor_rows =
        p.expected_current_report_rows
      and report_ingestions_state.current_descriptor_status = 'success'
      and report_ingestions_state.current_descriptor_error_count = 0
      and report_ingestions_state.published_descriptor_count = 1
      and report_ingestions_state.published_descriptor_rows =
        p.expected_published_report_rows
      and report_ingestions_state.published_descriptor_status = 'success'
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
      and report_state.current_ingestion_id = p.current_ingestion_id
      and report_state.published_ingestion_id = p.published_ingestion_id,
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

    recovery_keys.key_count
      as recovery_key_count,

    recovery_keys.key_names
      as recovery_key_names,

    candidate.recovery
      as repaired_recovery,

    candidate.recovery ->> 'confirmation_token'
      as stored_confirmation_token,

    confirmation.recalculated_confirmation_token,

    source_job.status
      as source_job_status,

    source_job.updated_at
      as source_job_updated_at,

    active_jobs.active_job_count,

    staging_unique_contract.required_unique_constraint_count,
    staging_unique_contract.required_unique_constraints_validated,

    source_staging.source_rows,
    source_staging.source_min_row_index,
    source_staging.source_max_row_index,
    source_staging.source_invalid_fingerprint_rows,
    source_staging.source_identity_digest,

    candidate_scan.candidate_rows,
    candidate_scan.candidate_min_row_index,
    candidate_scan.candidate_max_row_index,
    candidate_scan.candidate_prefix_rows,
    candidate_scan.candidate_tail_rows,
    candidate_scan.prefix_keyword_rows,
    candidate_scan.prefix_nonkeyword_rows,
    candidate_scan.tail_keyword_rows,
    candidate_scan.tail_creative_rows,
    candidate_scan.tail_mixed_rows,
    candidate_scan.tail_other_rows,
    candidate_scan.keyword_rows,
    candidate_scan.creative_rows,
    candidate_scan.mixed_rows,
    candidate_scan.invalid_fingerprint_rows,
    candidate_scan.scope_mismatch_rows,
    candidate_scan.canonical_mismatch_rows,
    candidate_scan.invalid_metric_rows,
    candidate_scan.invalid_grain_rows,
    candidate_scan.total_impressions,
    candidate_scan.total_clicks,
    candidate_scan.total_cost,
    candidate_scan.total_conversions,
    candidate_scan.total_revenue,

    grain_metrics.metrics_by_grain,
    grain_reason_counts.rows_by_reason,

    duplicate_scan.duplicate_row_key_detected,
    duplicate_scan.fingerprint_conflict_detected,

    candidate_prefix_comparison.candidate_prefix_mismatch_rows,

    candidate_fingerprint.fingerprint_algorithm,
    candidate_fingerprint.fingerprint_block_count,
    candidate_fingerprint.fingerprint_rows,
    candidate_fingerprint.completed_staging_fingerprint,

    report_state.current_ingestion_id,
    report_state.published_ingestion_id,

    report_ingestions_state.report_ingestions_count,
    report_ingestions_state.total_report_rows_metadata_count,
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
  cross join candidate_scan
  cross join grain_metrics
  cross join grain_reason_counts
  cross join duplicate_scan
  cross join candidate_prefix_comparison
  cross join candidate_fingerprint
  cross join report_ingestions_state
  cross join current_sentinels
  cross join published_sentinels
  cross join recovery_keys
  cross join confirmation
)

select
  (
    candidate_scope_ok
    and candidate_completed_isolation_ok
    and candidate_updated_after_completion_ok
    and completed_checkpoint_ok
    and recovery_contract_ok
    and confirmation_token_ok
    and source_job_state_ok
    and report_pointer_state_ok
    and no_active_jobs_ok
    and staging_unique_contract_ok
    and source_prefix_base_ok
    and completed_staging_structure_ok
    and duplicate_and_conflict_free_ok
    and source_prefix_exact_match_ok
    and completed_staging_fingerprint_ok
    and ingestion_metadata_unchanged_ok
    and active_report_rows_unchanged_ok
    and no_materialization_activation_finalization_trace_ok
  ) as completed_staging_read_only_validation_passed,

  array_remove(
    array[
      case when not candidate_scope_ok
        then 'candidate_scope_ok' end,
      case when not candidate_completed_isolation_ok
        then 'candidate_completed_isolation_ok' end,
      case when not candidate_updated_after_completion_ok
        then 'candidate_updated_after_completion_ok' end,
      case when not completed_checkpoint_ok
        then 'completed_checkpoint_ok' end,
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
      case when not completed_staging_structure_ok
        then 'completed_staging_structure_ok' end,
      case when not duplicate_and_conflict_free_ok
        then 'duplicate_and_conflict_free_ok' end,
      case when not source_prefix_exact_match_ok
        then 'source_prefix_exact_match_ok' end,
      case when not completed_staging_fingerprint_ok
        then 'completed_staging_fingerprint_ok' end,
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
  candidate_completed_isolation_ok,
  candidate_updated_after_completion_ok,
  completed_checkpoint_ok,
  recovery_contract_ok,
  confirmation_token_ok,
  source_job_state_ok,
  report_pointer_state_ok,
  no_active_jobs_ok,
  staging_unique_contract_ok,
  source_prefix_base_ok,
  completed_staging_structure_ok,
  duplicate_and_conflict_free_ok,
  source_prefix_exact_match_ok,
  completed_staging_fingerprint_ok,
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
  candidate_tail_rows as authoritative_tail_rows,
  candidate_min_row_index,
  candidate_max_row_index,

  keyword_rows,
  creative_rows,
  mixed_rows,
  prefix_keyword_rows,
  prefix_nonkeyword_rows,
  tail_keyword_rows,
  tail_creative_rows,
  tail_mixed_rows,
  tail_other_rows,

  invalid_fingerprint_rows,
  scope_mismatch_rows,
  canonical_mismatch_rows,
  invalid_metric_rows,
  invalid_grain_rows,

  duplicate_row_key_detected,
  fingerprint_conflict_detected,
  candidate_prefix_mismatch_rows,

  total_impressions,
  total_clicks,
  total_cost,
  total_conversions,
  total_revenue,
  metrics_by_grain,
  rows_by_reason,

  fingerprint_algorithm,
  fingerprint_block_count,
  fingerprint_rows,
  completed_staging_fingerprint,

  source_job_status,
  source_job_updated_at,
  active_job_count,
  required_unique_constraint_count,
  required_unique_constraints_validated,

  source_rows,
  source_min_row_index,
  source_max_row_index,
  source_invalid_fingerprint_rows,
  source_identity_digest,

  current_ingestion_id,
  published_ingestion_id,

  report_ingestions_count,
  total_report_rows_metadata_count,
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