/*
 * Etrylue Performance
 * Google Ads keyword processing checkpoint RPC
 *
 * NEW RPC ONLY.
 *
 * - Does not replace save_media_sync_processing_checkpoint.
 * - Does not replace save_naver_searchads_combined_processing_checkpoint.
 * - google_ads only.
 * - processing jobs only.
 * - service_role execute only.
 * - v1 keeps one fixed date_window_index once persistence begins.
 */

create or replace function public.save_google_ads_keyword_processing_checkpoint(
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

  v_date_from date;
  v_date_to date;

  v_raw_rows bigint;
  v_normalized_rows bigint;
  v_inserted_rows bigint;
  v_failed_rows bigint;

  v_collector jsonb;

  v_google_version bigint;
  v_phase text;

  v_date_window_index bigint;
  v_next_row_index bigint;
  v_completed_page_count bigint;

  v_complete boolean;
  v_cursor jsonb;

  v_cursor_version bigint;
  v_cursor_external_account_id text;
  v_cursor_date_window_index bigint;
  v_cursor_date_from date;
  v_cursor_date_to date;

  v_page_cursor jsonb;
  v_page_token text;
  v_page_version bigint;
  v_page_index bigint;
  v_page text;

  v_existing_checkpoint jsonb;
  v_existing_collector jsonb;
  v_existing_date_window_index bigint;
  v_existing_next_row_index bigint;
  v_existing_completed_page_count bigint;
  v_existing_complete boolean;
  v_existing_cursor jsonb;

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

    v_date_from :=
      (
        p_payload ->> 'date_from'
      )::date;

    v_date_to :=
      (
        p_payload ->> 'date_to'
      )::date;

    v_raw_rows :=
      (
        p_payload ->> 'raw_rows'
      )::bigint;

    v_normalized_rows :=
      (
        p_payload ->> 'normalized_rows'
      )::bigint;

    v_inserted_rows :=
      (
        p_payload ->> 'inserted_rows'
      )::bigint;

    v_failed_rows :=
      (
        p_payload ->> 'failed_rows'
      )::bigint;

    v_collector :=
      p_payload ->
      'collector';

    v_google_version :=
      (
        v_collector ->>
        'google_version'
      )::bigint;

    v_phase :=
      nullif(
        btrim(
          v_collector ->>
          'phase'
        ),
        ''
      );

    v_date_window_index :=
      (
        v_collector ->>
        'date_window_index'
      )::bigint;

    v_next_row_index :=
      (
        v_collector ->>
        'next_row_index'
      )::bigint;

    v_completed_page_count :=
      (
        v_collector ->>
        'completed_page_count'
      )::bigint;

    v_complete :=
      (
        v_collector ->>
        'complete'
      )::boolean;

    v_cursor :=
      v_collector ->
      'cursor';
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

     or v_date_from is null
     or v_date_to is null
     or v_date_from > v_date_to

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

     or v_google_version is distinct from 1

     or v_phase is distinct from 'keyword'

     or v_date_window_index is null
     or v_date_window_index < 0

     or v_next_row_index is null
     or v_next_row_index < 0

     or v_completed_page_count is null
     or v_completed_page_count < 1

     or v_complete is null

     or not (v_collector ? 'cursor')
     or coalesce(
       jsonb_typeof(v_cursor),
       ''
     ) not in (
       'object',
       'null'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  if v_provider <> 'google_ads' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_raw_rows <> v_normalized_rows
     or v_raw_rows <> v_inserted_rows
     or v_inserted_rows <> v_next_row_index
     or v_failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  if v_complete then
    if jsonb_typeof(v_cursor) <> 'null' then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_COUNTS';
    end if;
  else
    if jsonb_typeof(v_cursor) <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_COUNTS';
    end if;

    begin
      v_cursor_version :=
        (
          v_cursor ->>
          'version'
        )::bigint;

      v_cursor_external_account_id :=
        nullif(
          btrim(
            v_cursor ->>
            'externalAccountId'
          ),
          ''
        );

      v_cursor_date_window_index :=
        (
          v_cursor ->>
          'dateWindowIndex'
        )::bigint;

      v_cursor_date_from :=
        (
          v_cursor ->>
          'dateFrom'
        )::date;

      v_cursor_date_to :=
        (
          v_cursor ->>
          'dateTo'
        )::date;

      v_page_cursor :=
        v_cursor ->
        'page';

      v_page_version :=
        (
          v_page_cursor ->>
          'version'
        )::bigint;

      v_page_index :=
        (
          v_page_cursor ->>
          'pageIndex'
        )::bigint;

      v_page_token :=
        nullif(
          btrim(
            v_page_cursor ->>
            'page'
          ),
          ''
        );
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
    end;

    if v_cursor_version
         is distinct from 1
       or v_cursor_external_account_id
         is distinct from
          v_external_account_id
       or v_cursor_date_window_index
         is distinct from
          v_date_window_index
       or v_cursor_date_from
         is distinct from
          v_date_from
       or v_cursor_date_to
         is distinct from
          v_date_to
       or v_page_version
         is distinct from 1
       or v_page_index
         is distinct from
          v_completed_page_count
       or v_page_token is null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_SCOPE_MISMATCH';
    end if;
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
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_SCOPE_MISMATCH';
  end if;

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

  if jsonb_typeof(
       v_existing_checkpoint
     ) = 'object'
  then
    v_existing_collector :=
      v_existing_checkpoint ->
      'collector';

    if (
      v_existing_checkpoint ->>
      'version'
    ) is distinct from '1'
       or jsonb_typeof(
         v_existing_collector
       ) is distinct from 'object'
       or (
         v_existing_collector ->>
         'google_version'
       ) is distinct from '1'
       or (
         v_existing_collector ->>
         'phase'
       ) is distinct from 'keyword'
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    begin
      v_existing_date_window_index :=
        (
          v_existing_checkpoint ->>
          'date_window_index'
        )::bigint;

      v_existing_next_row_index :=
        (
          v_existing_checkpoint ->>
          'next_row_index'
        )::bigint;

      v_existing_completed_page_count :=
        (
          v_existing_collector ->>
          'completed_page_count'
        )::bigint;

      v_existing_complete :=
        (
          v_existing_checkpoint ->>
          'complete'
        )::boolean;

      v_existing_cursor :=
        v_existing_collector ->
        'cursor';
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_CONFLICT';
    end;

    if v_existing_date_window_index is null
       or v_existing_next_row_index is null
       or v_existing_completed_page_count is null
       or v_existing_complete is null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    if v_date_window_index <>
         v_existing_date_window_index
       or v_next_row_index <
         v_existing_next_row_index
       or v_completed_page_count <
         v_existing_completed_page_count
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;

    if v_existing_complete then
      if not v_complete
         or v_next_row_index <>
            v_existing_next_row_index
         or v_completed_page_count <>
            v_existing_completed_page_count
         or v_cursor is distinct from
            v_existing_cursor
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    elsif v_next_row_index =
            v_existing_next_row_index
       and v_completed_page_count =
            v_existing_completed_page_count
    then
      if v_complete <>
           v_existing_complete
         or v_cursor is distinct from
            v_existing_cursor
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    elsif v_completed_page_count <>
            (
              v_existing_completed_page_count +
              1
            )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;
  else
    if v_job.inserted_rows <> 0
       or v_completed_page_count <> 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;
  end if;

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

      'next_row_index',
        v_next_row_index,

      'raw_rows',
        v_raw_rows,

      'normalized_rows',
        v_normalized_rows,

      'inserted_rows',
        v_inserted_rows,

      'failed_rows',
        v_failed_rows,

      'complete',
        v_complete,

      'collector',
        jsonb_build_object(
          'google_version',
            1,

          'phase',
            'keyword',

          'completed_page_count',
            v_completed_page_count,

          'cursor',
            v_cursor
        )
    );

  update public.media_sync_jobs
  set
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
on function public.save_google_ads_keyword_processing_checkpoint(jsonb)
from public;

revoke all
on function public.save_google_ads_keyword_processing_checkpoint(jsonb)
from anon;

revoke all
on function public.save_google_ads_keyword_processing_checkpoint(jsonb)
from authenticated;

grant execute
on function public.save_google_ads_keyword_processing_checkpoint(jsonb)
to service_role;

comment on function public.save_google_ads_keyword_processing_checkpoint(jsonb)
is
  'Persists Google Ads keyword page checkpoints without changing Naver checkpoint RPC contracts.';

notify pgrst, 'reload schema';
