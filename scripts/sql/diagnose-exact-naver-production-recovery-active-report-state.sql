/*
 * Etrylue Performance
 * Read-only diagnostic for active_report_state_ok=false.
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
    '48401e55-55e5-4722-ba58-1ad2338eda04'::uuid as current_ingestion_id,
    '6d74227e-8d3b-4782-b041-6915d1cc3b89'::uuid as published_ingestion_id,

    359716::bigint as expected_total_report_rows,
    118::bigint as expected_current_report_rows,
    44514::bigint as expected_published_report_rows,
    11::bigint as expected_report_ingestions_count,

    '117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776'::text
      as expected_report_ingestions_descriptor_digest,

    '05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7'::text
      as expected_current_sentinel_digest,

    '1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0'::text
      as expected_published_sentinel_digest
),

report_state as (
  select report.*
  from params as p
  left join public.reports as report
    on report.id = p.report_id
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
            to_jsonb(r)::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as sentinel_digest,

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'row_index', r.row_index,
          'ingestion_id', r.ingestion_id,
          'date', r.date,
          'channel', r.channel,
          'device', r.device,
          'source', r.source,
          'full_row_digest',
            encode(
              extensions.digest(
                to_jsonb(r)::text,
                'sha256'
              ),
              'hex'
            ),
          'canonical_row_digest',
            encode(
              extensions.digest(
                coalesce(r.row, '{}'::jsonb)::text,
                'sha256'
              ),
              'hex'
            )
        )
        order by r.row_index, r.id
      ) filter (where r.id is not null),
      '[]'::jsonb
    ) as sentinel_rows

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
            to_jsonb(r)::text || E'\n',
            ''
            order by r.row_index, r.id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) as sentinel_digest,

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'row_index', r.row_index,
          'ingestion_id', r.ingestion_id,
          'date', r.date,
          'channel', r.channel,
          'device', r.device,
          'source', r.source,
          'full_row_digest',
            encode(
              extensions.digest(
                to_jsonb(r)::text,
                'sha256'
              ),
              'hex'
            ),
          'canonical_row_digest',
            encode(
              extensions.digest(
                coalesce(r.row, '{}'::jsonb)::text,
                'sha256'
              ),
              'hex'
            )
        )
        order by r.row_index, r.id
      ) filter (where r.id is not null),
      '[]'::jsonb
    ) as sentinel_rows

  from params as p

  left join public.report_rows as r
    on r.report_id = p.report_id
   and r.ingestion_id = p.published_ingestion_id
   and r.row_index in (0, 22256, 44513)
)

select
  report_state.current_ingestion_id,
  p.current_ingestion_id as expected_current_ingestion_id,

  report_state.published_ingestion_id,
  p.published_ingestion_id as expected_published_ingestion_id,

  report_state.current_ingestion_id = p.current_ingestion_id
    as current_pointer_ok,

  report_state.published_ingestion_id = p.published_ingestion_id
    as published_pointer_ok,

  report_rows_state.total_report_rows,
  p.expected_total_report_rows,

  report_rows_state.total_report_rows =
    p.expected_total_report_rows
      as total_report_rows_ok,

  report_rows_state.current_report_rows,
  p.expected_current_report_rows,

  report_rows_state.current_report_rows =
    p.expected_current_report_rows
      as current_report_rows_ok,

  report_rows_state.published_report_rows,
  p.expected_published_report_rows,

  report_rows_state.published_report_rows =
    p.expected_published_report_rows
      as published_report_rows_ok,

  report_ingestions_state.report_ingestions_count,
  p.expected_report_ingestions_count,

  report_ingestions_state.report_ingestions_count =
    p.expected_report_ingestions_count
      as report_ingestions_count_ok,

  report_ingestions_state.descriptor_digest,
  p.expected_report_ingestions_descriptor_digest,

  report_ingestions_state.descriptor_digest =
    p.expected_report_ingestions_descriptor_digest
      as descriptor_digest_ok,

  current_sentinels.sentinel_count
    as current_sentinel_count,

  3::bigint as expected_current_sentinel_count,

  current_sentinels.sentinel_count = 3
    as current_sentinel_count_ok,

  current_sentinels.sentinel_digest
    as current_sentinel_digest,

  p.expected_current_sentinel_digest,

  current_sentinels.sentinel_digest =
    p.expected_current_sentinel_digest
      as current_sentinel_digest_ok,

  published_sentinels.sentinel_count
    as published_sentinel_count,

  3::bigint as expected_published_sentinel_count,

  published_sentinels.sentinel_count = 3
    as published_sentinel_count_ok,

  published_sentinels.sentinel_digest
    as published_sentinel_digest,

  p.expected_published_sentinel_digest,

  published_sentinels.sentinel_digest =
    p.expected_published_sentinel_digest
      as published_sentinel_digest_ok,

  (
    report_state.current_ingestion_id = p.current_ingestion_id
    and report_state.published_ingestion_id = p.published_ingestion_id
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
        p.expected_current_sentinel_digest
    and published_sentinels.sentinel_count = 3
    and published_sentinels.sentinel_digest =
        p.expected_published_sentinel_digest
  ) as active_report_state_ok_recalculated,

  current_sentinels.sentinel_rows
    as current_sentinel_rows,

  published_sentinels.sentinel_rows
    as published_sentinel_rows

from params as p
cross join report_state
cross join report_rows_state
cross join report_ingestions_state
cross join current_sentinels
cross join published_sentinels;