/*
 * Etrylue Performance
 * Atomic Naver sync segment transition
 *
 * Purpose:
 * - Atomically advance sync_segment_progress.
 * - For a non-final segment, atomically reset the Naver combined
 *   processing checkpoint to the next keyword window.
 * - For the final segment, preserve the completed checkpoint so the
 *   existing reconciliation/materialization lifecycle can continue.
 *
 * This RPC does not change:
 * - job progress
 * - row counts
 * - snapshot pointers
 * - status
 * - connection state
 */

create or replace function
public.transition_naver_media_sync_segment(
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
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_progress jsonb;
  v_next_progress jsonb;

  v_existing_progress jsonb;
  v_checkpoint jsonb;
  v_collector jsonb;

  v_expected_current_index bigint;
  v_expected_completed_count bigint;
  v_expected_total_count bigint;
  v_expected_complete boolean;

  v_next_current_index bigint;
  v_next_completed_count bigint;
  v_next_total_count bigint;
  v_next_complete boolean;

  v_checkpoint_index bigint;
  v_checkpoint_phase text;
  v_checkpoint_next_row_index bigint;
  v_checkpoint_inserted_rows bigint;
  v_checkpoint_failed_rows bigint;

  v_expected_total_from_dates bigint;

  v_next_checkpoint jsonb;
  v_next_error_detail jsonb;

  v_is_exact_replay boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
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
      (
        p_payload ->> 'date_from'
      )::date;

    v_date_to :=
      (
        p_payload ->> 'date_to'
      )::date;

    v_expected_progress :=
      p_payload -> 'expected_progress';

    v_next_progress :=
      p_payload -> 'next_progress';
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_date_to < v_date_from
     or jsonb_typeof(v_expected_progress) <> 'object'
     or jsonb_typeof(v_next_progress) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_INPUT';
  end if;

  select *
  into v_job
  from public.media_sync_jobs
  where id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing'
     or v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_JOB_NOT_PROCESSING';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_SCOPE_MISMATCH';
  end if;

  if v_job.provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_UNSUPPORTED_PROVIDER';
  end if;

  begin
    if v_expected_progress ->> 'contract'
         is distinct from 'sync_segment_v1'
       or (
         v_expected_progress ->> 'version'
       )::bigint is distinct from 1
       or (
         v_expected_progress ->> 'segmentDays'
       )::bigint is distinct from 7
       or (
         v_expected_progress ->> 'dateFrom'
       )::date is distinct from v_job.date_from
       or (
         v_expected_progress ->> 'dateTo'
       )::date is distinct from v_job.date_to
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_PROGRESS';
    end if;

    if v_next_progress ->> 'contract'
         is distinct from 'sync_segment_v1'
       or (
         v_next_progress ->> 'version'
       )::bigint is distinct from 1
       or (
         v_next_progress ->> 'segmentDays'
       )::bigint is distinct from 7
       or (
         v_next_progress ->> 'dateFrom'
       )::date is distinct from v_job.date_from
       or (
         v_next_progress ->> 'dateTo'
       )::date is distinct from v_job.date_to
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_PROGRESS';
    end if;

    v_expected_current_index :=
      (
        v_expected_progress ->> 'currentIndex'
      )::bigint;

    v_expected_completed_count :=
      (
        v_expected_progress ->> 'completedCount'
      )::bigint;

    v_expected_total_count :=
      (
        v_expected_progress ->> 'totalCount'
      )::bigint;

    v_expected_complete :=
      (
        v_expected_progress ->> 'complete'
      )::boolean;

    if v_next_progress -> 'currentIndex' =
         'null'::jsonb
    then
      v_next_current_index :=
        null;
    else
      v_next_current_index :=
        (
          v_next_progress ->> 'currentIndex'
        )::bigint;
    end if;

    v_next_completed_count :=
      (
        v_next_progress ->> 'completedCount'
      )::bigint;

    v_next_total_count :=
      (
        v_next_progress ->> 'totalCount'
      )::bigint;

    v_next_complete :=
      (
        v_next_progress ->> 'complete'
      )::boolean;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_PROGRESS';
  end;

  v_expected_total_from_dates :=
    ceil(
      (
        (
          v_job.date_to -
          v_job.date_from +
          1
        )::numeric
      ) /
      7::numeric
    )::bigint;

  if v_expected_total_count
       is distinct from
       v_expected_total_from_dates
     or v_next_total_count
       is distinct from
       v_expected_total_count
     or v_expected_completed_count is null
     or v_expected_current_index is null
     or v_expected_complete is null
     or v_next_completed_count is null
     or v_next_complete is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_PROGRESS';
  end if;

  if v_expected_complete
     or v_expected_completed_count < 0
     or v_expected_completed_count >=
        v_expected_total_count
     or v_expected_current_index <>
        v_expected_completed_count
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_PROGRESS';
  end if;

  if v_next_completed_count <>
       v_expected_completed_count + 1
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_TRANSITION';
  end if;

  if v_next_complete then
    if v_next_completed_count <>
         v_next_total_count
       or v_next_current_index is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_TRANSITION';
    end if;
  else
    if v_next_completed_count >=
         v_next_total_count
       or v_next_current_index is null
       or v_next_current_index <>
          v_next_completed_count
       or v_next_current_index <>
          v_expected_current_index + 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_TRANSITION';
    end if;
  end if;

  v_existing_progress :=
    v_job.sync_segment_progress;

  if v_existing_progress =
       v_next_progress
  then
    v_is_exact_replay :=
      true;
  elsif v_existing_progress is distinct from
        v_expected_progress
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_PROGRESS_MISMATCH';
  end if;

  if jsonb_typeof(v_job.error_detail) <>
       'object'
     or jsonb_typeof(
       v_job.error_detail ->
       'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_CHECKPOINT_MISSING';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
    'processing_checkpoint';

  v_collector :=
    v_checkpoint ->
    'collector';

  if jsonb_typeof(v_collector) <>
       'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_CHECKPOINT_INVALID';
  end if;

  if not v_is_exact_replay then
    begin
      v_checkpoint_index :=
        (
          v_collector ->>
          'date_window_index'
        )::bigint;

      v_checkpoint_phase :=
        v_collector ->>
        'phase';

      v_checkpoint_next_row_index :=
        (
          v_collector ->>
          'next_row_index'
        )::bigint;

      v_checkpoint_inserted_rows :=
        (
          v_checkpoint ->>
          'inserted_rows'
        )::bigint;

      v_checkpoint_failed_rows :=
        (
          v_checkpoint ->>
          'failed_rows'
        )::bigint;
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MNST_CHECKPOINT_INVALID';
    end;

    if v_checkpoint_phase
         is distinct from 'completed'
       or v_checkpoint_index
         is distinct from
         v_expected_current_index
       or v_checkpoint_next_row_index
         is distinct from
         v_job.inserted_rows
       or v_checkpoint_inserted_rows
         is distinct from
         v_job.inserted_rows
       or v_checkpoint_failed_rows
         is distinct from 0
       or v_collector #>>
          '{keyword,complete}'
          is distinct from 'true'
       or v_collector #>>
          '{authoritative,complete}'
          is distinct from 'true'
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_CHECKPOINT_NOT_COMPLETED';
    end if;
  end if;

  if v_next_complete then
    if v_is_exact_replay then
      if v_collector #>>
           '{phase}'
           is distinct from 'completed'
         or (
           v_collector ->>
           'date_window_index'
         )::bigint is distinct from
           v_expected_current_index
      then
        raise exception using
          errcode = 'P0001',
          message = 'MNST_REPLAY_MISMATCH';
      end if;

      return next v_job;
      return;
    end if;

    update public.media_sync_jobs
    set
      sync_segment_progress =
        v_next_progress,

      updated_at =
        statement_timestamp()

    where id = v_job_id
      and status = 'processing'
      and snapshot_ingestion_id is null
      and finished_at is null

    returning *
    into v_job;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_JOB_NOT_PROCESSING';
    end if;

    return next v_job;
    return;
  end if;

  v_next_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          statement_timestamp()
        ),

      'date_window_index',
        v_next_current_index,

      'raw_rows',
        v_job.raw_rows,

      'normalized_rows',
        v_job.normalized_rows,

      'inserted_rows',
        v_job.inserted_rows,

      'failed_rows',
        0,

      'collector',
        jsonb_build_object(
          'discovered_keywords',
            0,

          'completed_keywords',
            0,

          'stats_requests_attempted',
            0,

          'stats_requests_succeeded',
            0,

          'retry_count',
            0,

          'date_window_index',
            v_next_current_index,

          'cursor',
            null,

          'combined_version',
            1,

          'phase',
            'keyword',

          'next_row_index',
            v_job.inserted_rows,

          'keyword',
            jsonb_build_object(
              'complete',
                false,

              'cursor',
                null,

              'counts',
                jsonb_build_object(
                  'discovered',
                    0,

                  'completed',
                    0,

                  'statsRequestsAttempted',
                    0,

                  'statsRequestsSucceeded',
                    0,

                  'retryCount',
                    0
                )
            ),

          'authoritative',
            jsonb_build_object(
              'complete',
                false,

              'cursor',
                null,

              'counts',
                jsonb_build_object(
                  'discovered',
                    0,

                  'completed',
                    0,

                  'statsRequestsAttempted',
                    0,

                  'statsRequestsSucceeded',
                    0,

                  'retryCount',
                    0
                )
            )
        )
    );

  if v_is_exact_replay then
    if (
      v_checkpoint - 'saved_at'
    ) is distinct from
      (
        v_next_checkpoint -
        'saved_at'
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_REPLAY_MISMATCH';
    end if;

    return next v_job;
    return;
  end if;

  v_next_error_detail :=
    jsonb_set(
      v_job.error_detail,
      '{processing_checkpoint}',
      v_next_checkpoint,
      true
    );

  update public.media_sync_jobs
  set
    sync_segment_progress =
      v_next_progress,

    error_detail =
      v_next_error_detail,

    updated_at =
      statement_timestamp()

  where id = v_job_id
    and status = 'processing'
    and snapshot_ingestion_id is null
    and finished_at is null

  returning *
  into v_job;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_JOB_NOT_PROCESSING';
  end if;

  return next v_job;
end;
$function$;

revoke all
on function
  public.transition_naver_media_sync_segment(jsonb)
from public;

revoke all
on function
  public.transition_naver_media_sync_segment(jsonb)
from anon;

revoke all
on function
  public.transition_naver_media_sync_segment(jsonb)
from authenticated;

grant execute
on function
  public.transition_naver_media_sync_segment(jsonb)
to service_role;

comment on function
  public.transition_naver_media_sync_segment(jsonb)
is
  'Atomically advances sync_segment_v1 and resets the Naver combined checkpoint for the next segment, while preserving the completed checkpoint on the final segment.';

notify pgrst, 'reload schema';
