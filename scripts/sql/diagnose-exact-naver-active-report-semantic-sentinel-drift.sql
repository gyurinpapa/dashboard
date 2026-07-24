/*
 * Etrylue Performance
 * Read-only semantic diagnostic for active report sentinel drift.
 *
 * Purpose:
 * - determine whether the old whole-row sentinel digest drift is semantic
 *   report data change or only non-semantic column drift;
 * - compare the published 44,514 rows exactly with the immutable source staging;
 * - verify the current 118-row active snapshot against approved metric totals.
 *
 * SELECT only:
 * - no INSERT / UPDATE / DELETE
 * - no RPC
 * - no materialization / activation / finalization
 */
with
params as (
  select
    'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid as report_id,

    '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid
      as current_ingestion_id,

    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid
      as published_ingestion_id,

    '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'::uuid
      as source_job_id,

    118::bigint as expected_current_rows,
    44514::bigint as expected_published_rows,

    7075::numeric as expected_current_impressions,
    1183::numeric as expected_current_clicks,
    113850::numeric as expected_current_cost,
    67::numeric as expected_current_conversions,
    12729300::numeric as expected_current_revenue,

    2632::numeric as expected_published_impressions,
    1092::numeric as expected_published_clicks,
    0::numeric as expected_published_cost,
    65::numeric as expected_published_conversions,
    7639300::numeric as expected_published_revenue
),

report_rows_columns as (
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'ordinal_position', column_record.ordinal_position,
          'column_name', column_record.column_name,
          'data_type', column_record.data_type,
          'is_nullable', column_record.is_nullable,
          'column_default', column_record.column_default
        )
        order by column_record.ordinal_position
      ),
      '[]'::jsonb
    ) as columns
  from information_schema.columns as column_record
  where column_record.table_schema = 'public'
    and column_record.table_name = 'report_rows'
),

current_rows as materialized (
  select r.*
  from params as p
  join public.report_rows as r
    on r.report_id = p.report_id
   and r.ingestion_id = p.current_ingestion_id
),

published_rows as materialized (
  select r.*
  from params as p
  join public.report_rows as r
    on r.report_id = p.report_id
   and r.ingestion_id = p.published_ingestion_id
),

source_rows as materialized (
  select s.*
  from params as p
  join public.media_sync_staging_rows as s
    on s.job_id = p.source_job_id
),

current_summary as (
  select
    count(*)::bigint as row_count,
    min(r.row_index)::bigint as min_row_index,
    max(r.row_index)::bigint as max_row_index,
    count(distinct r.row_index)::bigint as distinct_row_indexes,

    count(*) filter (
      where jsonb_typeof(r.row) is distinct from 'object'
         or coalesce(r.row ->> 'date', '') <> r.date::text
         or coalesce(r.row ->> 'channel', '') <>
            coalesce(r.channel, '')
         or coalesce(r.row ->> 'device', '') <>
            coalesce(r.device, '')
         or coalesce(r.row ->> 'source', '') <>
            coalesce(r.source, '')
    )::bigint as canonical_mismatch_rows,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'impressions') = 'number'
        then (r.row ->> 'impressions')::numeric
        else 0::numeric
      end
    ), 0::numeric) as impressions,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'clicks') = 'number'
        then (r.row ->> 'clicks')::numeric
        else 0::numeric
      end
    ), 0::numeric) as clicks,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'cost') = 'number'
        then (r.row ->> 'cost')::numeric
        else 0::numeric
      end
    ), 0::numeric) as cost,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'conversions') = 'number'
        then (r.row ->> 'conversions')::numeric
        else 0::numeric
      end
    ), 0::numeric) as conversions,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'revenue') = 'number'
        then (r.row ->> 'revenue')::numeric
        else 0::numeric
      end
    ), 0::numeric) as revenue
  from current_rows as r
),

published_summary as (
  select
    count(*)::bigint as row_count,
    min(r.row_index)::bigint as min_row_index,
    max(r.row_index)::bigint as max_row_index,
    count(distinct r.row_index)::bigint as distinct_row_indexes,

    count(*) filter (
      where jsonb_typeof(r.row) is distinct from 'object'
         or coalesce(r.row ->> 'date', '') <> r.date::text
         or coalesce(r.row ->> 'channel', '') <>
            coalesce(r.channel, '')
         or coalesce(r.row ->> 'device', '') <>
            coalesce(r.device, '')
         or coalesce(r.row ->> 'source', '') <>
            coalesce(r.source, '')
    )::bigint as canonical_mismatch_rows,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'impressions') = 'number'
        then (r.row ->> 'impressions')::numeric
        else 0::numeric
      end
    ), 0::numeric) as impressions,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'clicks') = 'number'
        then (r.row ->> 'clicks')::numeric
        else 0::numeric
      end
    ), 0::numeric) as clicks,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'cost') = 'number'
        then (r.row ->> 'cost')::numeric
        else 0::numeric
      end
    ), 0::numeric) as cost,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'conversions') = 'number'
        then (r.row ->> 'conversions')::numeric
        else 0::numeric
      end
    ), 0::numeric) as conversions,

    coalesce(sum(
      case
        when jsonb_typeof(r.row -> 'revenue') = 'number'
        then (r.row ->> 'revenue')::numeric
        else 0::numeric
      end
    ), 0::numeric) as revenue
  from published_rows as r
),

published_source_comparison as (
  select
    count(*)::bigint as compared_rows,

    count(*) filter (
      where s.id is null
         or r.workspace_id is distinct from s.workspace_id
         or r.report_id is distinct from s.report_id
         or r.advertiser_id is distinct from s.advertiser_id
         or r.row_index is distinct from s.row_index
         or r.row is distinct from s.row
         or r.date is distinct from s.date
         or r.channel is distinct from s.channel
         or r.device is distinct from s.device
         or r.source is distinct from s.source
    )::bigint as mismatch_rows,

    count(*) filter (
      where s.id is null
    )::bigint as missing_source_rows
  from published_rows as r
  left join source_rows as s
    on s.row_index = r.row_index
),

source_missing_from_published as (
  select count(*)::bigint as missing_published_rows
  from source_rows as s
  left join published_rows as r
    on r.row_index = s.row_index
  where r.id is null
),

current_sentinels as (
  select
    count(r.id)::bigint as sentinel_count,

    encode(
      extensions.digest(
        coalesce(
          string_agg(
            to_jsonb(r)::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as whole_row_digest,

    encode(
      extensions.digest(
        coalesce(
          string_agg(
            (
              to_jsonb(r)
              - array[
                  'created_at',
                  'updated_at',
                  'inserted_at',
                  'modified_at'
                ]::text[]
            )::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as without_common_timestamp_columns_digest,

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
    ) as canonical_row_only_digest,

    coalesce(
      jsonb_agg(
        to_jsonb(r)
        order by r.row_index, r.id
      ) filter (where r.id is not null),
      '[]'::jsonb
    ) as complete_sentinel_rows
  from current_rows as r
  where r.row_index in (0, 58, 117)
),

published_sentinels as (
  select
    count(r.id)::bigint as sentinel_count,

    encode(
      extensions.digest(
        coalesce(
          string_agg(
            to_jsonb(r)::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as whole_row_digest,

    encode(
      extensions.digest(
        coalesce(
          string_agg(
            (
              to_jsonb(r)
              - array[
                  'created_at',
                  'updated_at',
                  'inserted_at',
                  'modified_at'
                ]::text[]
            )::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as without_common_timestamp_columns_digest,

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
    ) as canonical_row_only_digest,

    coalesce(
      jsonb_agg(
        to_jsonb(r)
        order by r.row_index, r.id
      ) filter (where r.id is not null),
      '[]'::jsonb
    ) as complete_sentinel_rows
  from published_rows as r
  where r.row_index in (0, 22256, 44513)
)

select
  report_rows_columns.columns as report_rows_columns,

  current_summary.row_count as current_rows,
  current_summary.min_row_index as current_min_row_index,
  current_summary.max_row_index as current_max_row_index,
  current_summary.distinct_row_indexes
    as current_distinct_row_indexes,
  current_summary.canonical_mismatch_rows
    as current_canonical_mismatch_rows,
  current_summary.impressions as current_impressions,
  current_summary.clicks as current_clicks,
  current_summary.cost as current_cost,
  current_summary.conversions as current_conversions,
  current_summary.revenue as current_revenue,

  (
    current_summary.row_count = p.expected_current_rows
    and current_summary.min_row_index = 0
    and current_summary.max_row_index =
        p.expected_current_rows - 1
    and current_summary.distinct_row_indexes =
        p.expected_current_rows
    and current_summary.canonical_mismatch_rows = 0
    and current_summary.impressions =
        p.expected_current_impressions
    and current_summary.clicks =
        p.expected_current_clicks
    and current_summary.cost =
        p.expected_current_cost
    and current_summary.conversions =
        p.expected_current_conversions
    and current_summary.revenue =
        p.expected_current_revenue
  ) as current_semantic_snapshot_ok,

  published_summary.row_count as published_rows,
  published_summary.min_row_index as published_min_row_index,
  published_summary.max_row_index as published_max_row_index,
  published_summary.distinct_row_indexes
    as published_distinct_row_indexes,
  published_summary.canonical_mismatch_rows
    as published_canonical_mismatch_rows,
  published_summary.impressions as published_impressions,
  published_summary.clicks as published_clicks,
  published_summary.cost as published_cost,
  published_summary.conversions as published_conversions,
  published_summary.revenue as published_revenue,

  (
    published_summary.row_count = p.expected_published_rows
    and published_summary.min_row_index = 0
    and published_summary.max_row_index =
        p.expected_published_rows - 1
    and published_summary.distinct_row_indexes =
        p.expected_published_rows
    and published_summary.canonical_mismatch_rows = 0
    and published_summary.impressions =
        p.expected_published_impressions
    and published_summary.clicks =
        p.expected_published_clicks
    and published_summary.cost =
        p.expected_published_cost
    and published_summary.conversions =
        p.expected_published_conversions
    and published_summary.revenue =
        p.expected_published_revenue
  ) as published_semantic_snapshot_ok,

  published_source_comparison.compared_rows,
  published_source_comparison.mismatch_rows
    as published_source_mismatch_rows,
  published_source_comparison.missing_source_rows,
  source_missing_from_published.missing_published_rows,

  (
    published_source_comparison.compared_rows =
        p.expected_published_rows
    and published_source_comparison.mismatch_rows = 0
    and published_source_comparison.missing_source_rows = 0
    and source_missing_from_published.missing_published_rows = 0
  ) as published_exactly_matches_source_staging,

  current_sentinels.sentinel_count
    as current_sentinel_count,
  current_sentinels.whole_row_digest
    as current_whole_row_digest,
  current_sentinels.without_common_timestamp_columns_digest
    as current_without_common_timestamp_columns_digest,
  current_sentinels.canonical_row_only_digest
    as current_canonical_row_only_digest,
  current_sentinels.complete_sentinel_rows
    as current_complete_sentinel_rows,

  published_sentinels.sentinel_count
    as published_sentinel_count,
  published_sentinels.whole_row_digest
    as published_whole_row_digest,
  published_sentinels.without_common_timestamp_columns_digest
    as published_without_common_timestamp_columns_digest,
  published_sentinels.canonical_row_only_digest
    as published_canonical_row_only_digest,
  published_sentinels.complete_sentinel_rows
    as published_complete_sentinel_rows

from params as p
cross join report_rows_columns
cross join current_summary
cross join published_summary
cross join published_source_comparison
cross join source_missing_from_published
cross join current_sentinels
cross join published_sentinels;