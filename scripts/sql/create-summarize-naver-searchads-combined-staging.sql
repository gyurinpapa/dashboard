begin;

/*
 * Etrylue Performance
 * Naver Search Ads combined staging summary RPC
 *
 * This creates a NEW RPC.
 * The legacy public.summarize_media_sync_staging(jsonb) function remains unchanged.
 */

CREATE OR REPLACE FUNCTION public.summarize_naver_searchads_combined_staging(p_payload jsonb)
 RETURNS TABLE(job_id uuid, expected_rows bigint, total_rows bigint, min_row_index bigint, max_row_index bigint, distinct_row_indexes bigint, rows_in_expected_range bigint, missing_expected_rows bigint, out_of_range_rows bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, canonical_mismatch_rows bigint, date_window_count bigint, date_window_summaries jsonb, is_complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

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

  v_total_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;
  v_rows_in_expected_range bigint := 0;
  v_missing_expected_rows bigint := 0;
  v_out_of_range_rows bigint := 0;

  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_missing_fingerprint_rows bigint := 0;
  v_canonical_mismatch_rows bigint := 0;

  v_date_window_count bigint := 0;
  v_date_window_summaries jsonb := '[]'::jsonb;

  v_is_complete boolean := false;

  /*
   * Canonical JSON/fingerprint validation is intentionally processed in
   * bounded row_index ranges. This preserves the exact validation contract
   * while preventing one large digest/json statement from exceeding the
   * database statement timeout on large staging snapshots.
   */
  v_validation_batch_size bigint := 2000;
  v_validation_after_row_index bigint := null;
  v_validation_batch_rows bigint := 0;
  v_validation_batch_max_row_index bigint := null;
  v_validation_batch_canonical_mismatch_rows bigint := 0;
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
   * append RPC는 동일 job에 FOR UPDATE를 사용한다.
   * summary는 FOR SHARE를 사용하여 실행 중인 append와 직렬화하고,
   * 하나의 안정된 staging 상태를 검증한다.
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

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
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
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  /*
   * Fast whole-job summary.
   *
   * The job_id predicate uses the existing staging job indexes. Expensive
   * canonical JSON and SHA-256 verification is deliberately excluded here
   * and performed below in bounded batches.
   */
  select
    count(*)::bigint,

    min(staging.row_index),
    max(staging.row_index),

    count(
      distinct staging.row_index
    )::bigint,

    count(*) filter (
      where staging.row_index >= 0
        and staging.row_index <
          v_expected_rows
    )::bigint,

    count(*) filter (
      where staging.row_index < 0
         or staging.row_index >=
            v_expected_rows
    )::bigint,

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

    count(*) filter (
      where staging.row_key is null
         or length(
              btrim(staging.row_key)
            ) = 0
    )::bigint,

    count(*) filter (
      where staging.row_fingerprint is null
         or staging.row_fingerprint !~
              '^[0-9a-f]{64}$'
    )::bigint
  into
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows
  from public.media_sync_staging_rows
    as staging
  where staging.job_id = v_job_id;

  /*
   * Exact canonical/fingerprint validation, bounded to 2,000 rows per SQL
   * statement. Every persisted staging row is still checked exactly once.
   */
  v_validation_after_row_index := null;
  v_canonical_mismatch_rows := 0;

  loop
    with validation_batch as materialized (
      select
        staging.row_index,
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
      where staging.job_id = v_job_id
        and (
          v_validation_after_row_index is null
          or staging.row_index >
             v_validation_after_row_index
        )
      order by staging.row_index
      limit v_validation_batch_size
    )
    select
      count(*)::bigint,
      max(staging.row_index),
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

              or staging.row ->> 'channel'
                   is distinct from
                   staging.channel

              or staging.row ->> 'device'
                   is distinct from
                   staging.device

              or staging.row ->> 'source'
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

              /*
               * All combined rows share campaign/group identity and display names.
               */
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

              /*
               * Exactly one verified canonical grain is allowed per row.
               *
               * WEB_SITE    -> keyword
               * SHOPPING    -> creative (authoritative ad)
               * BRAND_SEARCH -> mixed (authoritative adgroup)
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
                    'naver_searchad_registered_keyword_daily_stats'

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
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
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
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_shopping_ad_daily_stats'

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
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
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
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_brand_search_adgroup_daily_stats'

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
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative_name',
                        ''
                      )
                    ),
                    ''
                  ) is null
                )
              )

              or staging.row_fingerprint <>
                   encode(
                     extensions.digest(
                       staging.row::text,
                       'sha256'
                     ),
                     'hex'
                   )
      )::bigint
    into
      v_validation_batch_rows,
      v_validation_batch_max_row_index,
      v_validation_batch_canonical_mismatch_rows
    from validation_batch
      as staging;

    exit when v_validation_batch_rows = 0;

    v_canonical_mismatch_rows :=
      v_canonical_mismatch_rows +
      v_validation_batch_canonical_mismatch_rows;

    if v_validation_batch_max_row_index is null
       or (
         v_validation_after_row_index is not null
         and v_validation_batch_max_row_index <=
             v_validation_after_row_index
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
    end if;

    v_validation_after_row_index :=
      v_validation_batch_max_row_index;
  end loop;

  v_missing_expected_rows :=
    greatest(
      v_expected_rows -
        v_rows_in_expected_range,
      0
    );

  select
    count(*)::bigint,
    coalesce(
      jsonb_agg(
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
      ),
      '[]'::jsonb
    )
  into
    v_date_window_count,
    v_date_window_summaries
  from (
    select
      staging.date_window_index,

      count(*)::bigint
        as row_count,

      min(staging.row_index)
        as min_row_index,

      max(staging.row_index)
        as max_row_index,

      min(staging.date)::text
        as min_date,

      max(staging.date)::text
        as max_date
    from public.media_sync_staging_rows
      as staging
    where staging.job_id = v_job_id
    group by
      staging.date_window_index
  ) as windows;

  v_is_complete :=
    v_total_rows =
      v_expected_rows

    and v_distinct_row_indexes =
      v_expected_rows

    and v_rows_in_expected_range =
      v_expected_rows

    and v_missing_expected_rows = 0

    and v_out_of_range_rows = 0

    and v_scope_mismatch_rows = 0

    and v_blank_row_key_rows = 0

    and v_missing_fingerprint_rows = 0

    and v_canonical_mismatch_rows = 0

    and (
      (
        v_expected_rows = 0
        and v_min_row_index is null
        and v_max_row_index is null
        and v_date_window_count = 0
      )
      or
      (
        v_expected_rows > 0
        and v_min_row_index = 0
        and v_max_row_index =
          v_expected_rows - 1
        and v_date_window_count > 0
      )
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
    v_canonical_mismatch_rows,
    v_date_window_count,
    v_date_window_summaries,
    v_is_complete;
end;
$function$;

revoke all
on function public.summarize_naver_searchads_combined_staging(jsonb)
from public;

revoke all
on function public.summarize_naver_searchads_combined_staging(jsonb)
from anon;

revoke all
on function public.summarize_naver_searchads_combined_staging(jsonb)
from authenticated;

grant execute
on function public.summarize_naver_searchads_combined_staging(jsonb)
to service_role;

comment on function public.summarize_naver_searchads_combined_staging(jsonb)
is
  'Validates combined Naver Search Ads keyword, SHOPPING creative, and BRAND_SEARCH mixed staging rows without changing the legacy keyword summary RPC.';

notify pgrst, 'reload schema';

commit;
