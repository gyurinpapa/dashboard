/*
 * Etrylue Performance
 * Naver Search Ads combined processing checkpoint RPC
 *
 * Purpose:
 * - Preserve the existing public.save_media_sync_processing_checkpoint(jsonb)
 *   legacy keyword contract unchanged.
 * - Persist the additive keyword + authoritative combined checkpoint state.
 * - Allow exact retry while rejecting scope/count/phase regression.
 *
 * This script creates a NEW RPC only.
 * It does not replace or drop the legacy RPC.
 */

create or replace function public.save_naver_searchads_combined_processing_checkpoint(
  p_payload jsonb
)
returns setof public.media_sync_jobs
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_raw_rows bigint;
  v_normalized_rows bigint;
  v_inserted_rows bigint;
  v_failed_rows bigint;

  v_collector jsonb;

  v_discovered_keywords bigint;
  v_completed_keywords bigint;
  v_stats_requests_attempted bigint;
  v_stats_requests_succeeded bigint;
  v_retry_count bigint;
  v_date_window_index bigint;
  v_cursor jsonb;

  v_combined_version bigint;
  v_phase text;
  v_next_row_index bigint;

  v_keyword jsonb;
  v_keyword_complete boolean;
  v_keyword_cursor jsonb;
  v_keyword_counts jsonb;
  v_keyword_discovered bigint;
  v_keyword_completed bigint;
  v_keyword_stats_attempted bigint;
  v_keyword_stats_succeeded bigint;
  v_keyword_retry_count bigint;

  v_authoritative jsonb;
  v_authoritative_complete boolean;
  v_authoritative_cursor jsonb;
  v_authoritative_counts jsonb;
  v_authoritative_discovered bigint;
  v_authoritative_completed bigint;
  v_authoritative_stats_attempted bigint;
  v_authoritative_stats_succeeded bigint;
  v_authoritative_retry_count bigint;

  v_existing_checkpoint jsonb;
  v_existing_collector jsonb;
  v_existing_phase text;
  v_existing_phase_rank integer;
  v_requested_phase_rank integer;
  v_existing_next_row_index bigint;
  v_existing_date_window_index bigint;
  v_existing_keyword jsonb;
  v_existing_keyword_counts jsonb;
  v_existing_authoritative jsonb;
  v_existing_authoritative_counts jsonb;
  v_existing_keyword_complete boolean;
  v_existing_authoritative_complete boolean;
  v_existing_keyword_discovered bigint;
  v_existing_keyword_completed bigint;
  v_existing_keyword_stats_attempted bigint;
  v_existing_keyword_stats_succeeded bigint;
  v_existing_keyword_retry_count bigint;
  v_existing_authoritative_discovered bigint;
  v_existing_authoritative_completed bigint;
  v_existing_authoritative_stats_attempted bigint;
  v_existing_authoritative_stats_succeeded bigint;
  v_existing_authoritative_retry_count bigint;

  v_progress integer;
  v_checkpoint jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
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

    v_raw_rows :=
      (p_payload ->> 'raw_rows')::bigint;

    v_normalized_rows :=
      (p_payload ->> 'normalized_rows')::bigint;

    v_inserted_rows :=
      (p_payload ->> 'inserted_rows')::bigint;

    v_failed_rows :=
      (p_payload ->> 'failed_rows')::bigint;

    v_collector :=
      p_payload -> 'collector';

    v_discovered_keywords :=
      (
        v_collector ->>
        'discovered_keywords'
      )::bigint;

    v_completed_keywords :=
      (
        v_collector ->>
        'completed_keywords'
      )::bigint;

    v_stats_requests_attempted :=
      (
        v_collector ->>
        'stats_requests_attempted'
      )::bigint;

    v_stats_requests_succeeded :=
      (
        v_collector ->>
        'stats_requests_succeeded'
      )::bigint;

    v_retry_count :=
      (
        v_collector ->>
        'retry_count'
      )::bigint;

    v_date_window_index :=
      (
        v_collector ->>
        'date_window_index'
      )::bigint;

    v_cursor :=
      v_collector ->
      'cursor';

    v_combined_version :=
      (
        v_collector ->>
        'combined_version'
      )::bigint;

    v_phase :=
      nullif(
        btrim(
          v_collector ->>
          'phase'
        ),
        ''
      );

    v_next_row_index :=
      (
        v_collector ->>
        'next_row_index'
      )::bigint;

    v_keyword :=
      v_collector ->
      'keyword';

    v_keyword_complete :=
      (
        v_keyword ->>
        'complete'
      )::boolean;

    v_keyword_cursor :=
      v_keyword ->
      'cursor';

    v_keyword_counts :=
      v_keyword ->
      'counts';

    v_keyword_discovered :=
      (
        v_keyword_counts ->>
        'discovered'
      )::bigint;

    v_keyword_completed :=
      (
        v_keyword_counts ->>
        'completed'
      )::bigint;

    v_keyword_stats_attempted :=
      (
        v_keyword_counts ->>
        'statsRequestsAttempted'
      )::bigint;

    v_keyword_stats_succeeded :=
      (
        v_keyword_counts ->>
        'statsRequestsSucceeded'
      )::bigint;

    v_keyword_retry_count :=
      (
        v_keyword_counts ->>
        'retryCount'
      )::bigint;

    v_authoritative :=
      v_collector ->
      'authoritative';

    v_authoritative_complete :=
      (
        v_authoritative ->>
        'complete'
      )::boolean;

    v_authoritative_cursor :=
      v_authoritative ->
      'cursor';

    v_authoritative_counts :=
      v_authoritative ->
      'counts';

    v_authoritative_discovered :=
      (
        v_authoritative_counts ->>
        'discovered'
      )::bigint;

    v_authoritative_completed :=
      (
        v_authoritative_counts ->>
        'completed'
      )::bigint;

    v_authoritative_stats_attempted :=
      (
        v_authoritative_counts ->>
        'statsRequestsAttempted'
      )::bigint;

    v_authoritative_stats_succeeded :=
      (
        v_authoritative_counts ->>
        'statsRequestsSucceeded'
      )::bigint;

    v_authoritative_retry_count :=
      (
        v_authoritative_counts ->>
        'retryCount'
      )::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null

     or v_raw_rows is null
     or v_raw_rows < 0

     or v_normalized_rows is null
     or v_normalized_rows < 0

     or v_inserted_rows is null
     or v_inserted_rows < 0

     or v_failed_rows is null
     or v_failed_rows <> 0

     or v_collector is null
     or jsonb_typeof(v_collector) <> 'object'

     or v_discovered_keywords is null
     or v_discovered_keywords < 0

     or v_completed_keywords is null
     or v_completed_keywords < 0

     or v_stats_requests_attempted is null
     or v_stats_requests_attempted < 0

     or v_stats_requests_succeeded is null
     or v_stats_requests_succeeded < 0

     or v_retry_count is null
     or v_retry_count < 0

     or v_date_window_index is null
     or v_date_window_index < 0

     or v_cursor is null
     or jsonb_typeof(v_cursor) <> 'object'

     or v_combined_version <> 1

     or v_phase not in (
       'keyword',
       'authoritative',
       'completed'
     )

     or v_next_row_index is null
     or v_next_row_index < 0

     or v_keyword is null
     or jsonb_typeof(v_keyword) <> 'object'
     or not (v_keyword ? 'complete')
     or jsonb_typeof(
       v_keyword -> 'complete'
     ) <> 'boolean'
     or not (v_keyword ? 'cursor')
     or coalesce(
       jsonb_typeof(v_keyword_cursor),
       ''
     ) not in (
       'object',
       'null'
     )
     or v_keyword_counts is null
     or jsonb_typeof(v_keyword_counts) <> 'object'

     or v_keyword_discovered is null
     or v_keyword_discovered < 0

     or v_keyword_completed is null
     or v_keyword_completed < 0

     or v_keyword_stats_attempted is null
     or v_keyword_stats_attempted < 0

     or v_keyword_stats_succeeded is null
     or v_keyword_stats_succeeded < 0

     or v_keyword_retry_count is null
     or v_keyword_retry_count < 0

     or v_authoritative is null
     or jsonb_typeof(v_authoritative) <> 'object'
     or not (v_authoritative ? 'complete')
     or jsonb_typeof(
       v_authoritative -> 'complete'
     ) <> 'boolean'
     or not (v_authoritative ? 'cursor')
     or coalesce(
       jsonb_typeof(v_authoritative_cursor),
       ''
     ) not in (
       'object',
       'null'
     )
     or v_authoritative_counts is null
     or jsonb_typeof(v_authoritative_counts) <> 'object'

     or v_authoritative_discovered is null
     or v_authoritative_discovered < 0

     or v_authoritative_completed is null
     or v_authoritative_completed < 0

     or v_authoritative_stats_attempted is null
     or v_authoritative_stats_attempted < 0

     or v_authoritative_stats_succeeded is null
     or v_authoritative_stats_succeeded < 0

     or v_authoritative_retry_count is null
     or v_authoritative_retry_count < 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  if v_provider <> 'naver_searchad' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_completed_keywords >
       v_discovered_keywords
     or v_stats_requests_succeeded >
       v_stats_requests_attempted
     or v_inserted_rows >
       v_normalized_rows
     or v_failed_rows >
       v_raw_rows

     or v_keyword_completed >
       v_keyword_discovered
     or v_keyword_stats_succeeded >
       v_keyword_stats_attempted

     or v_authoritative_completed >
       v_authoritative_discovered
     or v_authoritative_stats_succeeded >
       v_authoritative_stats_attempted

     or v_raw_rows <>
       v_normalized_rows
     or v_raw_rows <>
       v_inserted_rows
     or v_inserted_rows <>
       v_next_row_index

     or v_discovered_keywords <>
       v_keyword_discovered
     or v_completed_keywords <>
       v_keyword_completed

     or v_stats_requests_attempted <>
       (
         v_keyword_stats_attempted +
         v_authoritative_stats_attempted
       )

     or v_stats_requests_succeeded <>
       (
         v_keyword_stats_succeeded +
         v_authoritative_stats_succeeded
       )

     or v_retry_count <>
       (
         v_keyword_retry_count +
         v_authoritative_retry_count
       )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  if (
       jsonb_typeof(v_keyword_cursor) = 'null'
       and v_cursor <> '{}'::jsonb
     )
     or (
       jsonb_typeof(v_keyword_cursor) = 'object'
       and v_cursor <> v_keyword_cursor
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  if (
       v_phase = 'keyword'
       and (
         v_keyword_complete
         or v_authoritative_complete
       )
     )
     or (
       v_phase = 'authoritative'
       and (
         not v_keyword_complete
         or v_authoritative_complete
       )
     )
     or (
       v_phase = 'completed'
       and (
         not v_keyword_complete
         or not v_authoritative_complete
       )
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_SCOPE_MISMATCH';
  end if;

  /*
   * Overall stored counts can never move backwards.
   * Exact retry remains valid because equal values are allowed.
   */
  if v_raw_rows < v_job.raw_rows
     or v_normalized_rows <
        v_job.normalized_rows
     or v_inserted_rows <
        v_job.inserted_rows
     or v_failed_rows <
        v_job.failed_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_REGRESSION';
  end if;

  v_existing_checkpoint :=
    v_job.error_detail ->
    'processing_checkpoint';

  v_existing_collector :=
    v_existing_checkpoint ->
    'collector';

  /*
   * Preserve the existing legacy regression guards.
   */
  if jsonb_typeof(
       v_existing_checkpoint
     ) = 'object'
  then
    if v_discovered_keywords <
         coalesce(
           (
             v_existing_collector ->>
             'discovered_keywords'
           )::bigint,
           0
         )

       or v_completed_keywords <
         coalesce(
           (
             v_existing_collector ->>
             'completed_keywords'
           )::bigint,
           0
         )

       or v_stats_requests_attempted <
         coalesce(
           (
             v_existing_collector ->>
             'stats_requests_attempted'
           )::bigint,
           0
         )

       or v_stats_requests_succeeded <
         coalesce(
           (
             v_existing_collector ->>
             'stats_requests_succeeded'
           )::bigint,
           0
         )

       or v_retry_count <
         coalesce(
           (
             v_existing_collector ->>
             'retry_count'
           )::bigint,
           0
         )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;
  end if;

  /*
   * Combined-to-combined resume adds strict phase, row-index, and
   * per-phase collector regression guards.
   *
   * A legacy checkpoint can safely transition into the first combined
   * checkpoint because it has no combined_version field.
   */
  if jsonb_typeof(
       v_existing_collector
     ) = 'object'
     and (
       v_existing_collector ->>
       'combined_version'
     ) = '1'
  then
    begin
      v_existing_phase :=
        v_existing_collector ->>
        'phase';

      v_existing_next_row_index :=
        (
          v_existing_collector ->>
          'next_row_index'
        )::bigint;

      v_existing_date_window_index :=
        (
          v_existing_collector ->>
          'date_window_index'
        )::bigint;

      v_existing_keyword :=
        v_existing_collector ->
        'keyword';

      v_existing_keyword_complete :=
        (
          v_existing_keyword ->>
          'complete'
        )::boolean;

      v_existing_keyword_counts :=
        v_existing_keyword ->
        'counts';

      v_existing_keyword_discovered :=
        (
          v_existing_keyword_counts ->>
          'discovered'
        )::bigint;

      v_existing_keyword_completed :=
        (
          v_existing_keyword_counts ->>
          'completed'
        )::bigint;

      v_existing_keyword_stats_attempted :=
        (
          v_existing_keyword_counts ->>
          'statsRequestsAttempted'
        )::bigint;

      v_existing_keyword_stats_succeeded :=
        (
          v_existing_keyword_counts ->>
          'statsRequestsSucceeded'
        )::bigint;

      v_existing_keyword_retry_count :=
        (
          v_existing_keyword_counts ->>
          'retryCount'
        )::bigint;

      v_existing_authoritative :=
        v_existing_collector ->
        'authoritative';

      v_existing_authoritative_complete :=
        (
          v_existing_authoritative ->>
          'complete'
        )::boolean;

      v_existing_authoritative_counts :=
        v_existing_authoritative ->
        'counts';

      v_existing_authoritative_discovered :=
        (
          v_existing_authoritative_counts ->>
          'discovered'
        )::bigint;

      v_existing_authoritative_completed :=
        (
          v_existing_authoritative_counts ->>
          'completed'
        )::bigint;

      v_existing_authoritative_stats_attempted :=
        (
          v_existing_authoritative_counts ->>
          'statsRequestsAttempted'
        )::bigint;

      v_existing_authoritative_stats_succeeded :=
        (
          v_existing_authoritative_counts ->>
          'statsRequestsSucceeded'
        )::bigint;

      v_existing_authoritative_retry_count :=
        (
          v_existing_authoritative_counts ->>
          'retryCount'
        )::bigint;
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
    end;

    v_existing_phase_rank :=
      case v_existing_phase
        when 'keyword' then 0
        when 'authoritative' then 1
        when 'completed' then 2
        else -1
      end;

    v_requested_phase_rank :=
      case v_phase
        when 'keyword' then 0
        when 'authoritative' then 1
        when 'completed' then 2
        else -1
      end;

    if v_existing_phase_rank < 0
       or v_requested_phase_rank <
          v_existing_phase_rank

       or v_date_window_index <>
          v_existing_date_window_index

       or v_next_row_index <
          v_existing_next_row_index

       or (
         v_existing_keyword_complete
         and not v_keyword_complete
       )

       or (
         v_existing_authoritative_complete
         and not v_authoritative_complete
       )

       or v_keyword_discovered <
          v_existing_keyword_discovered

       or v_keyword_completed <
          v_existing_keyword_completed

       or v_keyword_stats_attempted <
          v_existing_keyword_stats_attempted

       or v_keyword_stats_succeeded <
          v_existing_keyword_stats_succeeded

       or v_keyword_retry_count <
          v_existing_keyword_retry_count

       or v_authoritative_discovered <
          v_existing_authoritative_discovered

       or v_authoritative_completed <
          v_existing_authoritative_completed

       or v_authoritative_stats_attempted <
          v_existing_authoritative_stats_attempted

       or v_authoritative_stats_succeeded <
          v_existing_authoritative_stats_succeeded

       or v_authoritative_retry_count <
          v_existing_authoritative_retry_count
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;
  end if;

  /*
   * Keep the legacy progress calculation unchanged.
   * Processing state can never reach 100.
   */
  if v_discovered_keywords = 0 then
    v_progress := 0;
  else
    v_progress :=
      least(
        99,
        floor(
          (
            v_completed_keywords::numeric *
            100
          ) /
          v_discovered_keywords::numeric
        )::integer
      );
  end if;

  v_progress :=
    greatest(
      v_job.progress,
      v_progress
    );

  v_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          statement_timestamp()
        ),

      'date_window_index',
        v_date_window_index,

      'raw_rows',
        v_raw_rows,

      'normalized_rows',
        v_normalized_rows,

      'inserted_rows',
        v_inserted_rows,

      'failed_rows',
        v_failed_rows,

      'collector',
        jsonb_build_object(
          /*
           * Legacy keyword fields remain byte-compatible in shape.
           */
          'discovered_keywords',
            v_discovered_keywords,

          'completed_keywords',
            v_completed_keywords,

          'stats_requests_attempted',
            v_stats_requests_attempted,

          'stats_requests_succeeded',
            v_stats_requests_succeeded,

          'retry_count',
            v_retry_count,

          'date_window_index',
            v_date_window_index,

          'cursor',
            v_cursor,

          /*
           * Combined phase state is additive.
           */
          'combined_version',
            1,

          'phase',
            v_phase,

          'next_row_index',
            v_next_row_index,

          'keyword',
            jsonb_build_object(
              'complete',
                v_keyword_complete,

              'cursor',
                v_keyword_cursor,

              'counts',
                jsonb_build_object(
                  'discovered',
                    v_keyword_discovered,

                  'completed',
                    v_keyword_completed,

                  'statsRequestsAttempted',
                    v_keyword_stats_attempted,

                  'statsRequestsSucceeded',
                    v_keyword_stats_succeeded,

                  'retryCount',
                    v_keyword_retry_count
                )
            ),

          'authoritative',
            jsonb_build_object(
              'complete',
                v_authoritative_complete,

              'cursor',
                v_authoritative_cursor,

              'counts',
                jsonb_build_object(
                  'discovered',
                    v_authoritative_discovered,

                  'completed',
                    v_authoritative_completed,

                  'statsRequestsAttempted',
                    v_authoritative_stats_attempted,

                  'statsRequestsSucceeded',
                    v_authoritative_stats_succeeded,

                  'retryCount',
                    v_authoritative_retry_count
                )
            )
        )
    );

  update public.media_sync_jobs
  set
    progress =
      v_progress,

    raw_rows =
      v_raw_rows,

    normalized_rows =
      v_normalized_rows,

    inserted_rows =
      v_inserted_rows,

    failed_rows =
      v_failed_rows,

    error =
      null,

    error_detail =
      jsonb_set(
        coalesce(
          error_detail,
          '{}'::jsonb
        ),
        '{processing_checkpoint}',
        v_checkpoint,
        true
      ),

    updated_at =
      statement_timestamp()
  where id = v_job_id
    and status = 'processing'
  returning *
  into v_job;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  return next v_job;
end;
$function$;

revoke all
on function public.save_naver_searchads_combined_processing_checkpoint(jsonb)
from public;

revoke all
on function public.save_naver_searchads_combined_processing_checkpoint(jsonb)
from anon;

revoke all
on function public.save_naver_searchads_combined_processing_checkpoint(jsonb)
from authenticated;

grant execute
on function public.save_naver_searchads_combined_processing_checkpoint(jsonb)
to service_role;

comment on function public.save_naver_searchads_combined_processing_checkpoint(jsonb)
is
  'Persists Naver Search Ads keyword + authoritative combined processing checkpoints without changing the legacy keyword checkpoint RPC.';

notify pgrst, 'reload schema';
