/*
 * Etrylue Performance
 * Read-only diagnostic for the 174 published/source staging mismatches.
 *
 * Purpose:
 * - classify exactly which persisted fields differ;
 * - distinguish report-semantic differences from provider metadata differences;
 * - produce bounded samples and per-key counts.
 *
 * SELECT only:
 * - no INSERT / UPDATE / DELETE
 * - no RPC
 * - no materialization / activation / finalization
 */
with
params as (
  select
    'ea413950-4068-41e8-9ced-8355020d7e7d'::uuid
      as report_id,

    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid
      as published_ingestion_id,

    '9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7'::uuid
      as source_job_id,

    44514::bigint
      as expected_rows
),

published_rows as materialized (
  select
    r.id,
    r.workspace_id,
    r.report_id,
    r.advertiser_id,
    r.row_index,
    r.row,
    r.date,
    r.channel,
    r.device,
    r.source,
    r.ingestion_id,
    r.created_at
  from params as p
  join public.report_rows as r
    on r.report_id = p.report_id
   and r.ingestion_id = p.published_ingestion_id
),

source_rows as materialized (
  select
    s.id,
    s.job_id,
    s.workspace_id,
    s.report_id,
    s.advertiser_id,
    s.connection_id,
    s.provider,
    s.external_account_id,
    s.date_window_index,
    s.date_from,
    s.date_to,
    s.row_index,
    s.row_key,
    s.date,
    s.channel,
    s.device,
    s.source,
    s.row,
    s.row_fingerprint,
    s.created_at
  from params as p
  join public.media_sync_staging_rows as s
    on s.job_id = p.source_job_id
),

joined as materialized (
  select
    coalesce(published.row_index, source.row_index)
      as row_index,

    published.id
      as published_id,

    source.id
      as source_id,

    published.workspace_id
      as published_workspace_id,

    source.workspace_id
      as source_workspace_id,

    published.report_id
      as published_report_id,

    source.report_id
      as source_report_id,

    published.advertiser_id
      as published_advertiser_id,

    source.advertiser_id
      as source_advertiser_id,

    published.date
      as published_date,

    source.date
      as source_date,

    published.channel
      as published_channel,

    source.channel
      as source_channel,

    published.device
      as published_device,

    source.device
      as source_device,

    published.source
      as published_source,

    source.source
      as source_source,

    published.row
      as published_row,

    source.row
      as source_row,

    source.row_key,
    source.row_fingerprint,

    published.created_at
      as published_created_at,

    source.created_at
      as source_created_at,

    published.id is null
      as published_missing,

    source.id is null
      as source_missing,

    published.workspace_id is distinct from source.workspace_id
      as workspace_mismatch,

    published.report_id is distinct from source.report_id
      as report_mismatch,

    published.advertiser_id is distinct from source.advertiser_id
      as advertiser_mismatch,

    published.date is distinct from source.date
      as date_mismatch,

    published.channel is distinct from source.channel
      as channel_mismatch,

    published.device is distinct from source.device
      as device_mismatch,

    published.source is distinct from source.source
      as source_mismatch,

    published.row is distinct from source.row
      as row_json_mismatch,

    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(published.row, '{}'::jsonb)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as published_row_digest,

    source.row_fingerprint
      as source_row_digest,

    jsonb_build_object(
      'date', published.row -> 'date',
      'report_date', published.row -> 'report_date',
      'day', published.row -> 'day',
      'ymd', published.row -> 'ymd',
      'channel', published.row -> 'channel',
      'device', published.row -> 'device',
      'source', published.row -> 'source',
      'platform', published.row -> 'platform',
      'campaign', published.row -> 'campaign',
      'campaign_name', published.row -> 'campaign_name',
      'group', published.row -> 'group',
      'group_name', published.row -> 'group_name',
      'adgroup_name', published.row -> 'adgroup_name',
      'keyword', published.row -> 'keyword',
      'keyword_name', published.row -> 'keyword_name',
      'creative', published.row -> 'creative',
      'creative_name', published.row -> 'creative_name',
      'rank', published.row -> 'rank',
      'impressions', published.row -> 'impressions',
      'clicks', published.row -> 'clicks',
      'cost', published.row -> 'cost',
      'conversions', published.row -> 'conversions',
      'revenue', published.row -> 'revenue',
      'row_level', published.row -> 'row_level',
      'data_level', published.row -> 'data_level',
      'row_level_reason', published.row -> 'row_level_reason',
      'ingestion_source', published.row -> 'ingestion_source',
      'provider', published.row -> 'provider',
      'external_account_id', published.row -> 'external_account_id',
      'external_campaign_id', published.row -> 'external_campaign_id',
      'external_group_id', published.row -> 'external_group_id',
      'external_keyword_id', published.row -> 'external_keyword_id',
      'external_creative_id', published.row -> 'external_creative_id'
    ) as published_semantic_projection,

    jsonb_build_object(
      'date', source.row -> 'date',
      'report_date', source.row -> 'report_date',
      'day', source.row -> 'day',
      'ymd', source.row -> 'ymd',
      'channel', source.row -> 'channel',
      'device', source.row -> 'device',
      'source', source.row -> 'source',
      'platform', source.row -> 'platform',
      'campaign', source.row -> 'campaign',
      'campaign_name', source.row -> 'campaign_name',
      'group', source.row -> 'group',
      'group_name', source.row -> 'group_name',
      'adgroup_name', source.row -> 'adgroup_name',
      'keyword', source.row -> 'keyword',
      'keyword_name', source.row -> 'keyword_name',
      'creative', source.row -> 'creative',
      'creative_name', source.row -> 'creative_name',
      'rank', source.row -> 'rank',
      'impressions', source.row -> 'impressions',
      'clicks', source.row -> 'clicks',
      'cost', source.row -> 'cost',
      'conversions', source.row -> 'conversions',
      'revenue', source.row -> 'revenue',
      'row_level', source.row -> 'row_level',
      'data_level', source.row -> 'data_level',
      'row_level_reason', source.row -> 'row_level_reason',
      'ingestion_source', source.row -> 'ingestion_source',
      'provider', source.row -> 'provider',
      'external_account_id', source.row -> 'external_account_id',
      'external_campaign_id', source.row -> 'external_campaign_id',
      'external_group_id', source.row -> 'external_group_id',
      'external_keyword_id', source.row -> 'external_keyword_id',
      'external_creative_id', source.row -> 'external_creative_id'
    ) as source_semantic_projection

  from published_rows as published
  full join source_rows as source
    on source.row_index = published.row_index
),

mismatches as materialized (
  select
    joined.*,

    (
      joined.workspace_mismatch
      or joined.report_mismatch
      or joined.advertiser_mismatch
      or joined.date_mismatch
      or joined.channel_mismatch
      or joined.device_mismatch
      or joined.source_mismatch
    ) as top_level_mismatch,

    joined.published_semantic_projection
      is distinct from
    joined.source_semantic_projection
      as semantic_projection_mismatch

  from joined

  where joined.published_missing
     or joined.source_missing
     or joined.workspace_mismatch
     or joined.report_mismatch
     or joined.advertiser_mismatch
     or joined.date_mismatch
     or joined.channel_mismatch
     or joined.device_mismatch
     or joined.source_mismatch
     or joined.row_json_mismatch
),

summary as (
  select
    count(*)::bigint as mismatch_rows,

    count(*) filter (
      where published_missing
    )::bigint as published_missing_rows,

    count(*) filter (
      where source_missing
    )::bigint as source_missing_rows,

    count(*) filter (
      where workspace_mismatch
    )::bigint as workspace_mismatch_rows,

    count(*) filter (
      where report_mismatch
    )::bigint as report_mismatch_rows,

    count(*) filter (
      where advertiser_mismatch
    )::bigint as advertiser_mismatch_rows,

    count(*) filter (
      where date_mismatch
    )::bigint as date_mismatch_rows,

    count(*) filter (
      where channel_mismatch
    )::bigint as channel_mismatch_rows,

    count(*) filter (
      where device_mismatch
    )::bigint as device_mismatch_rows,

    count(*) filter (
      where source_mismatch
    )::bigint as source_mismatch_rows,

    count(*) filter (
      where row_json_mismatch
    )::bigint as row_json_mismatch_rows,

    count(*) filter (
      where semantic_projection_mismatch
    )::bigint as semantic_projection_mismatch_rows,

    count(*) filter (
      where top_level_mismatch
    )::bigint as top_level_mismatch_rows,

    count(*) filter (
      where row_json_mismatch
        and not semantic_projection_mismatch
    )::bigint as metadata_only_row_json_mismatch_rows,

    count(*) filter (
      where top_level_mismatch
        and not row_json_mismatch
    )::bigint as top_level_only_mismatch_rows,

    count(*) filter (
      where row_json_mismatch
        and not top_level_mismatch
    )::bigint as row_json_only_mismatch_rows,

    count(*) filter (
      where row_json_mismatch
        and top_level_mismatch
    )::bigint as row_json_and_top_level_mismatch_rows,

    count(*) filter (
      where published_row_digest
        is distinct from source_row_digest
    )::bigint as published_digest_vs_source_fingerprint_mismatch_rows

  from mismatches
),

row_key_differences as materialized (
  select
    mismatch.row_index,
    key_record.key_name

  from mismatches as mismatch

  cross join lateral (
    select key_name
    from (
      select
        jsonb_object_keys(
          coalesce(mismatch.published_row, '{}'::jsonb)
        ) as key_name

      union

      select
        jsonb_object_keys(
          coalesce(mismatch.source_row, '{}'::jsonb)
        ) as key_name
    ) as keys
  ) as key_record

  where mismatch.published_row -> key_record.key_name
        is distinct from
        mismatch.source_row -> key_record.key_name
),

row_key_difference_counts as (
  select
    coalesce(
      jsonb_object_agg(
        key_count.key_name,
        key_count.difference_rows
        order by key_count.key_name
      ),
      '{}'::jsonb
    ) as differing_json_keys

  from (
    select
      difference.key_name,
      count(*)::bigint as difference_rows

    from row_key_differences as difference

    group by difference.key_name
  ) as key_count
),

provider_meta_key_differences as materialized (
  select
    mismatch.row_index,
    key_record.key_name

  from mismatches as mismatch

  cross join lateral (
    select key_name
    from (
      select
        jsonb_object_keys(
          case
            when jsonb_typeof(
              mismatch.published_row -> 'provider_meta'
            ) = 'object'
            then mismatch.published_row -> 'provider_meta'
            else '{}'::jsonb
          end
        ) as key_name

      union

      select
        jsonb_object_keys(
          case
            when jsonb_typeof(
              mismatch.source_row -> 'provider_meta'
            ) = 'object'
            then mismatch.source_row -> 'provider_meta'
            else '{}'::jsonb
          end
        ) as key_name
    ) as keys
  ) as key_record

  where (
    mismatch.published_row
      #> array['provider_meta', key_record.key_name]
  ) is distinct from (
    mismatch.source_row
      #> array['provider_meta', key_record.key_name]
  )
),

provider_meta_key_difference_counts as (
  select
    coalesce(
      jsonb_object_agg(
        key_count.key_name,
        key_count.difference_rows
        order by key_count.key_name
      ),
      '{}'::jsonb
    ) as differing_provider_meta_keys

  from (
    select
      difference.key_name,
      count(*)::bigint as difference_rows

    from provider_meta_key_differences as difference

    group by difference.key_name
  ) as key_count
),

reason_groups as (
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'row_level_reason',
            reason_group.row_level_reason,
          'campaign_type',
            reason_group.campaign_type,
          'date',
            reason_group.row_date,
          'rows',
            reason_group.row_count,
          'semantic_projection_mismatch_rows',
            reason_group.semantic_projection_mismatch_rows,
          'metadata_only_rows',
            reason_group.metadata_only_rows
        )
        order by
          reason_group.row_level_reason,
          reason_group.campaign_type,
          reason_group.row_date
      ),
      '[]'::jsonb
    ) as mismatch_groups

  from (
    select
      coalesce(
        mismatch.published_row ->> 'row_level_reason',
        mismatch.source_row ->> 'row_level_reason',
        '<missing>'
      ) as row_level_reason,

      coalesce(
        mismatch.published_row
          #>> '{provider_meta,campaign_type}',
        mismatch.source_row
          #>> '{provider_meta,campaign_type}',
        '<missing>'
      ) as campaign_type,

      coalesce(
        mismatch.published_date,
        mismatch.source_date
      ) as row_date,

      count(*)::bigint as row_count,

      count(*) filter (
        where mismatch.semantic_projection_mismatch
      )::bigint as semantic_projection_mismatch_rows,

      count(*) filter (
        where mismatch.row_json_mismatch
          and not mismatch.semantic_projection_mismatch
      )::bigint as metadata_only_rows

    from mismatches as mismatch

    group by
      coalesce(
        mismatch.published_row ->> 'row_level_reason',
        mismatch.source_row ->> 'row_level_reason',
        '<missing>'
      ),
      coalesce(
        mismatch.published_row
          #>> '{provider_meta,campaign_type}',
        mismatch.source_row
          #>> '{provider_meta,campaign_type}',
        '<missing>'
      ),
      coalesce(
        mismatch.published_date,
        mismatch.source_date
      )
  ) as reason_group
),

sample_rows as (
  select
    mismatch.row_index,

    coalesce(
      mismatch.published_date,
      mismatch.source_date
    ) as row_date,

    coalesce(
      mismatch.published_row ->> 'campaign',
      mismatch.source_row ->> 'campaign',
      ''
    ) as campaign,

    coalesce(
      mismatch.published_row ->> 'group',
      mismatch.source_row ->> 'group',
      ''
    ) as ad_group,

    coalesce(
      mismatch.published_row ->> 'keyword',
      mismatch.source_row ->> 'keyword',
      ''
    ) as keyword,

    coalesce(
      mismatch.published_row ->> 'creative',
      mismatch.source_row ->> 'creative',
      ''
    ) as creative,

    coalesce(
      mismatch.published_row ->> 'row_level_reason',
      mismatch.source_row ->> 'row_level_reason',
      '<missing>'
    ) as row_level_reason,

    mismatch.top_level_mismatch,
    mismatch.row_json_mismatch,
    mismatch.semantic_projection_mismatch,

    mismatch.published_row_digest,
    mismatch.source_row_digest,

    coalesce(
      (
        select jsonb_agg(
          difference.key_name
          order by difference.key_name
        )
        from row_key_differences as difference
        where difference.row_index = mismatch.row_index
      ),
      '[]'::jsonb
    ) as differing_json_keys,

    coalesce(
      (
        select jsonb_agg(
          difference.key_name
          order by difference.key_name
        )
        from provider_meta_key_differences as difference
        where difference.row_index = mismatch.row_index
      ),
      '[]'::jsonb
    ) as differing_provider_meta_keys,

    mismatch.published_row,
    mismatch.source_row

  from mismatches as mismatch

  order by mismatch.row_index

  limit 30
),

samples as (
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'row_index', sample.row_index,
          'date', sample.row_date,
          'campaign', sample.campaign,
          'group', sample.ad_group,
          'keyword', sample.keyword,
          'creative', sample.creative,
          'row_level_reason', sample.row_level_reason,
          'top_level_mismatch', sample.top_level_mismatch,
          'row_json_mismatch', sample.row_json_mismatch,
          'semantic_projection_mismatch',
            sample.semantic_projection_mismatch,
          'published_row_digest',
            sample.published_row_digest,
          'source_row_digest',
            sample.source_row_digest,
          'differing_json_keys',
            sample.differing_json_keys,
          'differing_provider_meta_keys',
            sample.differing_provider_meta_keys,
          'published_row',
            sample.published_row,
          'source_row',
            sample.source_row
        )
        order by sample.row_index
      ),
      '[]'::jsonb
    ) as mismatch_samples

  from sample_rows as sample
),

base_counts as (
  select
    (select count(*)::bigint from published_rows)
      as published_rows,

    (select count(*)::bigint from source_rows)
      as source_rows,

    (select min(row_index)::bigint from published_rows)
      as published_min_row_index,

    (select max(row_index)::bigint from published_rows)
      as published_max_row_index,

    (select min(row_index)::bigint from source_rows)
      as source_min_row_index,

    (select max(row_index)::bigint from source_rows)
      as source_max_row_index
)

select
  base_counts.published_rows,
  base_counts.source_rows,
  base_counts.published_min_row_index,
  base_counts.published_max_row_index,
  base_counts.source_min_row_index,
  base_counts.source_max_row_index,

  (
    base_counts.published_rows = p.expected_rows
    and base_counts.source_rows = p.expected_rows
    and base_counts.published_min_row_index = 0
    and base_counts.published_max_row_index =
        p.expected_rows - 1
    and base_counts.source_min_row_index = 0
    and base_counts.source_max_row_index =
        p.expected_rows - 1
  ) as base_ranges_ok,

  summary.*,

  (
    summary.semantic_projection_mismatch_rows = 0
    and summary.top_level_mismatch_rows = 0
  ) as mismatches_are_provider_metadata_only,

  row_key_difference_counts.differing_json_keys,
  provider_meta_key_difference_counts.differing_provider_meta_keys,
  reason_groups.mismatch_groups,
  samples.mismatch_samples

from params as p
cross join base_counts
cross join summary
cross join row_key_difference_counts
cross join provider_meta_key_difference_counts
cross join reason_groups
cross join samples;