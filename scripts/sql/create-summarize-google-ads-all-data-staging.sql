begin;

/*
 * Etrylue Performance
 * Google Ads ALL-DATA combined staging summary.
 *
 * This file is additive only.
 *
 * Existing legacy Google keyword summary RPCs remain unchanged.
 * Existing Naver combined summary RPCs remain unchanged.
 *
 * Large ALL-DATA snapshots use two independently bounded read-only RPCs:
 *
 * 1. summarize_google_ads_all_data_staging_base(jsonb)
 *    - structural row-index completeness only
 *
 * 2. validate_google_ads_all_data_staging_batch_v1(jsonb)
 *    - at most 2,000 persisted rows
 *    - scope
 *    - row key
 *    - fingerprint
 *    - canonical Search keyword / Search ad / Demand Gen ad contract
 *    - provider_meta authority
 *    - date-window summaries
 *
 * No KPI values are summed here.
 */


/*
 * Whole-job structural summary.
 *
 * Keep the aggregate index-friendly:
 * only job_id + row_index are required for the large staging scan.
 */
create or replace function
public.summarize_google_ads_all_data_staging_base(
  p_payload jsonb
)
returns table(
  job_id uuid,
  expected_rows bigint,
  total_rows bigint,
  min_row_index bigint,
  max_row_index bigint,
  distinct_row_indexes bigint,
  rows_in_expected_range bigint,
  missing_expected_rows bigint,
  out_of_range_rows bigint,
  scope_mismatch_rows bigint,
  blank_row_key_rows bigint,
  missing_fingerprint_rows bigint,
  date_window_count bigint,
  date_window_summaries jsonb
)
language plpgsql
security definer
set search_path to
  'pg_catalog',
  'public',
  'extensions'
as $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_execution_contract text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_total_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;
  v_rows_in_expected_range bigint := 0;
  v_missing_expected_rows bigint := 0;
  v_out_of_range_rows bigint := 0;

  /*
   * Full validation values are accumulated by the bounded validator.
   * These placeholders preserve one stable summary result contract.
   */
  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_missing_fingerprint_rows bigint := 0;

  v_date_window_count bigint := 0;
  v_date_window_summaries jsonb := '[]'::jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
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

    v_execution_contract :=
      nullif(
        btrim(
          p_payload ->> 'execution_contract'
        ),
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
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_execution_contract is null
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
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append_media_sync_staging_batch locks this same job FOR UPDATE.
   *
   * FOR SHARE serializes this read with an in-flight append and gives this
   * statement one stable staging authority boundary.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'google_ads'
     or v_provider <> 'google_ads'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.execution_contract <>
       'google_all_data_v1'
     or v_execution_contract <>
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.execution_contract <>
        v_execution_contract
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  /*
   * The completed ALL-DATA checkpoint saver atomically pins all successful
   * counters to nextRowIndex. The summary must use that exact durable row
   * boundary rather than inventing another authority.
   */
  if coalesce(v_job.raw_rows, -1) <>
       v_expected_rows
     or coalesce(v_job.normalized_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.inserted_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.failed_rows, -1) <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  /*
   * The unique (job_id, row_index) staging authority means count(*) also
   * represents the distinct persisted row-index count.
   */
  select
    count(*)::bigint,
    min(staging.row_index),
    max(staging.row_index),
    count(*)::bigint,

    count(*) filter (
      where staging.row_index >= 0
        and staging.row_index <
          v_expected_rows
    )::bigint,

    count(*) filter (
      where staging.row_index < 0
         or staging.row_index >=
            v_expected_rows
    )::bigint

  into
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_out_of_range_rows

  from public.media_sync_staging_rows
    as staging

  where staging.job_id =
    v_job_id;

  v_missing_expected_rows :=
    greatest(
      v_expected_rows -
        v_rows_in_expected_range,
      0
    );

  return query
  select
    v_job_id,
    v_expected_rows,
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_missing_expected_rows,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_date_window_count,
    v_date_window_summaries;
end;
$function$;


/*
 * Bounded persisted-row validator.
 *
 * Every call validates at most 2,000 rows ordered by row_index.
 * No KPI aggregation is performed.
 */
create or replace function
public.validate_google_ads_all_data_staging_batch_v1(
  p_payload jsonb
)
returns table(
  job_id uuid,
  after_row_index bigint,
  batch_size bigint,
  batch_rows bigint,
  batch_max_row_index bigint,
  scope_mismatch_rows bigint,
  blank_row_key_rows bigint,
  missing_fingerprint_rows bigint,
  canonical_mismatch_rows bigint,
  date_window_summaries jsonb
)
language plpgsql
security definer
set search_path to
  'pg_catalog',
  'public',
  'extensions'
as $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_execution_contract text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_validation_batch_size bigint := 2000;
  v_validation_after_row_index bigint := null;

  v_validation_batch_rows bigint := 0;
  v_validation_batch_max_row_index bigint := null;

  v_validation_batch_scope_mismatch_rows bigint := 0;
  v_validation_batch_blank_row_key_rows bigint := 0;
  v_validation_batch_missing_fingerprint_rows bigint := 0;
  v_validation_batch_canonical_mismatch_rows bigint := 0;

  v_validation_batch_date_window_summaries
    jsonb := '[]'::jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
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

    v_execution_contract :=
      nullif(
        btrim(
          p_payload ->> 'execution_contract'
        ),
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
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  begin
    v_validation_after_row_index :=
      case
        when not (
          p_payload ? 'after_row_index'
        )
        or p_payload -> 'after_row_index' =
           'null'::jsonb
        then null

        else (
          p_payload ->> 'after_row_index'
        )::bigint
      end;

    v_validation_batch_size :=
      (p_payload ->> 'batch_size')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_execution_contract is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_validation_after_row_index < 0
     or v_validation_batch_size is null
     or v_validation_batch_size < 1
     or v_validation_batch_size > 2000
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * Serialize one bounded read with an active append on the same job.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'google_ads'
     or v_provider <> 'google_ads'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.execution_contract <>
       'google_all_data_v1'
     or v_execution_contract <>
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.execution_contract <>
        v_execution_contract
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  if coalesce(v_job.raw_rows, -1) <>
       v_expected_rows
     or coalesce(v_job.normalized_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.inserted_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.failed_rows, -1) <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  with validation_batch as materialized (
    select
      staging.date_window_index,
      staging.row_index,

      staging.report_id,
      staging.workspace_id,
      staging.advertiser_id,
      staging.connection_id,

      staging.date_from,
      staging.date_to,

      staging.row_key,
      staging.date,

      staging.channel,
      staging.device,
      staging.source,

      staging.provider,
      staging.external_account_id,

      staging.row,
      staging.row_fingerprint

    from public.media_sync_staging_rows
      as staging

    where staging.job_id =
      v_job_id

      and (
        v_validation_after_row_index
          is null

        or staging.row_index >
          v_validation_after_row_index
      )

    order by staging.row_index

    limit v_validation_batch_size
  )

  select
    count(*)::bigint,

    max(staging.row_index),

    /*
     * Persisted outer scope.
     */
    count(*) filter (
      where staging.report_id <>
              v_report_id

         or staging.workspace_id <>
              v_workspace_id

         or staging.advertiser_id <>
              v_advertiser_id

         or staging.connection_id <>
              v_connection_id

         or staging.provider <>
              v_provider

         or staging.external_account_id <>
              v_external_account_id

         or staging.date_from <>
              v_date_from

         or staging.date_to <>
              v_date_to

         or staging.date <
              v_date_from

         or staging.date >
              v_date_to
    )::bigint,

    /*
     * Physical identity fields.
     */
    count(*) filter (
      where staging.row_key is null
         or length(
              btrim(staging.row_key)
            ) = 0
    )::bigint,

    count(*) filter (
      where staging.row_fingerprint
              is null

         or staging.row_fingerprint
              !~ '^[0-9a-f]{64}$'
    )::bigint,

    /*
     * Complete persisted canonical contract.
     *
     * The row key is rebuilt independently from canonical row +
     * provider_meta authority and compared to the stored key.
     */
    count(*) filter (
      where
        jsonb_typeof(staging.row) <>
          'object'

        or staging.row ->> 'date'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        or staging.row ->> 'report_date'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        or staging.row ->> 'day'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        or staging.row ->> 'ymd'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        /* Match the existing TypeScript nullable presentation-field mapping. */
        or nullif(btrim(staging.row ->> 'channel'), '')
             is distinct from
             staging.channel

        or nullif(btrim(staging.row ->> 'device'), '')
             is distinct from
             staging.device

        or nullif(btrim(staging.row ->> 'source'), '')
             is distinct from
             staging.source

        or staging.row ->> 'provider'
             is distinct from
             staging.provider

        or staging.row ->> 'external_account_id'
             is distinct from
             staging.external_account_id

        or staging.row ->> 'ingestion_source'
             is distinct from
             'api'

        or nullif(
             btrim(
               staging.row
                 ->> 'external_campaign_id'
             ),
             ''
           ) is null

        or nullif(
             btrim(
               staging.row
                 ->> 'external_group_id'
             ),
             ''
           ) is null

        or nullif(
             btrim(
               staging.row
                 ->> 'campaign'
             ),
             ''
           ) is null

        or nullif(
             btrim(
               staging.row
                 ->> 'group'
             ),
             ''
           ) is null

        or staging.row ->> 'row_level'
             is distinct from
             staging.row ->> 'data_level'

        /*
         * Provider authority metadata.
         */
        or jsonb_typeof(
             staging.row -> 'provider_meta'
           ) is distinct from
           'object'

        or staging.row
             #>> '{provider_meta,provider}'
             is distinct from
             'google_ads'

        or not (
          (
            staging.row #>> '{provider_meta,campaign_type}'
              is not distinct from 'SEARCH'
            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'search'
          )
          or
          (
            staging.row #>> '{provider_meta,campaign_type}'
              is not distinct from 'DEMAND_GEN'
            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'demand_gen'
          )
        )

        or staging.row
             #>> '{provider_meta,authoritative_grain}'
             is distinct from
             'ad'

        /*
         * Exactly one executable ALL-DATA canonical grain.
         */
        or not (
          (
            staging.row ->> 'row_level'
              is not distinct from
              'keyword'

            and staging.row ->> 'data_level'
              is not distinct from
              'keyword'

            and staging.row ->> 'row_level_reason'
              is not distinct from
              'google_ads_keyword_daily_stats'

            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'search'

            and nullif(
                  btrim(
                    staging.row
                      ->> 'external_keyword_id'
                  ),
                  ''
                ) is not null

            and nullif(
                  btrim(
                    coalesce(
                      staging.row
                        ->> 'external_creative_id',
                      ''
                    )
                  ),
                  ''
                ) is null

            and nullif(
                  btrim(
                    staging.row
                      ->> 'keyword'
                  ),
                  ''
                ) is not null

            and staging.row
                  #>> '{provider_meta,entity_type}'
                  is not distinct from
                  'keyword'

            and staging.row
                  #>> '{provider_meta,entity_id}'
                  is not distinct from
                  staging.row
                    ->> 'external_keyword_id'
          )

          or

          (
            staging.row ->> 'row_level'
              is not distinct from
              'creative'

            and staging.row ->> 'data_level'
              is not distinct from
              'creative'

            and (
              (
                staging.row #>> '{provider_meta,product_family}'
                  is not distinct from 'search'
                and staging.row ->> 'row_level_reason'
                  is not distinct from 'google_ads_search_ad_daily_stats'
              )
              or
              (
                staging.row #>> '{provider_meta,product_family}'
                  is not distinct from 'demand_gen'
                and staging.row ->> 'row_level_reason'
                  is not distinct from 'google_ads_demand_gen_ad_daily_stats'
              )
            )

            and nullif(
                  btrim(
                    staging.row
                      ->> 'external_creative_id'
                  ),
                  ''
                ) is not null

            and nullif(
                  btrim(
                    coalesce(
                      staging.row
                        ->> 'external_keyword_id',
                      ''
                    )
                  ),
                  ''
                ) is null

            and nullif(
                  btrim(
                    staging.row
                      ->> 'creative'
                  ),
                  ''
                ) is not null

            and staging.row
                  #>> '{provider_meta,entity_type}'
                  is not distinct from
                  'ad'

            and staging.row
                  #>> '{provider_meta,entity_id}'
                  is not distinct from
                  staging.row
                    ->> 'external_creative_id'
          )
        )

        /*
         * Exact persisted ALL-DATA product-specific row identity.
         *
         * array_to_json(text[]) emits the same compact JSON-array shape used
         * by JSON.stringify() in the TypeScript staging contract.
         */
        or staging.row_key
             is distinct from
             array_to_json(
               array[
                 'google_ads'::text,
                 staging.row #>> '{provider_meta,product_family}',

                 staging.row
                   #>> '{provider_meta,entity_type}',

                 staging.row
                   ->> 'external_account_id',

                 staging.row
                   ->> 'external_campaign_id',

                 staging.row
                   ->> 'external_group_id',

                 staging.row
                   #>> '{provider_meta,entity_id}',

                 staging.row
                   ->> 'date'
               ]::text[]
             )::text

        /*
         * Stored generated fingerprint must still represent the persisted
         * canonical JSON exactly.
         */
        or staging.row_fingerprint <>
             encode(
               extensions.digest(
                 staging.row::text,
                 'sha256'
               ),
               'hex'
             )
    )::bigint,

    /*
     * Per-batch date-window structural summaries.
     */
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date_window_index',
              windows.date_window_index,

            'row_count',
              windows.row_count,

            'min_row_index',
              windows.min_row_index,

            'max_row_index',
              windows.max_row_index,

            'min_date',
              windows.min_date,

            'max_date',
              windows.max_date
          )
          order by
            windows.date_window_index
        )

        from (
          select
            batch_rows.date_window_index,

            count(*)::bigint
              as row_count,

            min(batch_rows.row_index)
              as min_row_index,

            max(batch_rows.row_index)
              as max_row_index,

            min(batch_rows.date)::text
              as min_date,

            max(batch_rows.date)::text
              as max_date

          from validation_batch
            as batch_rows

          group by
            batch_rows.date_window_index
        ) as windows
      ),
      '[]'::jsonb
    )

  into
    v_validation_batch_rows,
    v_validation_batch_max_row_index,

    v_validation_batch_scope_mismatch_rows,
    v_validation_batch_blank_row_key_rows,
    v_validation_batch_missing_fingerprint_rows,
    v_validation_batch_canonical_mismatch_rows,

    v_validation_batch_date_window_summaries

  from validation_batch
    as staging;

  return query
  select
    v_job_id,
    v_validation_after_row_index,
    v_validation_batch_size,
    v_validation_batch_rows,
    v_validation_batch_max_row_index,

    v_validation_batch_scope_mismatch_rows,
    v_validation_batch_blank_row_key_rows,
    v_validation_batch_missing_fingerprint_rows,
    v_validation_batch_canonical_mismatch_rows,

    v_validation_batch_date_window_summaries;
end;
$function$;


/*
 * service_role only.
 */
revoke all
on function
  public.summarize_google_ads_all_data_staging_base(jsonb)
from public;

revoke all
on function
  public.summarize_google_ads_all_data_staging_base(jsonb)
from anon;

revoke all
on function
  public.summarize_google_ads_all_data_staging_base(jsonb)
from authenticated;

grant execute
on function
  public.summarize_google_ads_all_data_staging_base(jsonb)
to service_role;


revoke all
on function
  public.validate_google_ads_all_data_staging_batch_v1(jsonb)
from public;

revoke all
on function
  public.validate_google_ads_all_data_staging_batch_v1(jsonb)
from anon;

revoke all
on function
  public.validate_google_ads_all_data_staging_batch_v1(jsonb)
from authenticated;

grant execute
on function
  public.validate_google_ads_all_data_staging_batch_v1(jsonb)
to service_role;


comment on function
public.summarize_google_ads_all_data_staging_base(jsonb)
is
  'Loads structural Google Ads ALL-DATA staging completeness fields without KPI aggregation.';


comment on function
public.validate_google_ads_all_data_staging_batch_v1(jsonb)
is
  'Validates at most 2,000 Google Ads ALL-DATA Search and Demand Gen staging rows for scope, row-key identity, fingerprint, canonical JSON, provider authority, and date windows.';


notify pgrst, 'reload schema';

commit;
