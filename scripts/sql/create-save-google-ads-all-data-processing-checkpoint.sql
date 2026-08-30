/*
 * Etrylue Performance
 * Google Ads ALL-DATA processing checkpoint RPC
 *
 * NEW RPC ONLY.
 *
 * - Does not replace the legacy Google keyword checkpoint RPC.
 * - Does not replace any Naver checkpoint RPC.
 * - google_ads + google_all_data_v1 only.
 * - processing jobs only.
 * - Existing media_sync_jobs columns only.
 * - Counts + processing_checkpoint are persisted atomically.
 * - Exact retry is allowed.
 * - Row, scope and phase regression fail closed.
 * - service_role execute only.
 */

create or replace function public.save_google_ads_all_data_processing_checkpoint(
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
  v_execution_contract text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_raw_rows bigint;
  v_normalized_rows bigint;
  v_inserted_rows bigint;
  v_failed_rows bigint;

  v_collector jsonb;

  v_google_version bigint;
  v_all_data_version bigint;
  v_phase text;
  v_phase_rank integer;

  v_date_window_index bigint;
  v_next_row_index bigint;
  v_complete boolean;
  v_cursor jsonb;

  v_has_product_routing boolean;
  v_product_route jsonb;
  v_product_index bigint;
  v_product_family text;

  v_cursor_version bigint;
  v_cursor_phase text;
  v_cursor_external_account_id text;
  v_cursor_date_window_index bigint;
  v_cursor_date_from date;
  v_cursor_date_to date;
  v_cursor_expected_row_start_index bigint;
  v_phase_cursor jsonb;

  v_existing_checkpoint jsonb;
  v_existing_collector jsonb;
  v_existing_execution_contract text;
  v_existing_phase text;
  v_existing_phase_rank integer;
  v_existing_date_window_index bigint;
  v_existing_next_row_index bigint;
  v_existing_complete boolean;
  v_existing_cursor jsonb;

  v_existing_has_product_routing boolean;
  v_existing_product_route jsonb;
  v_existing_product_index bigint;
  v_existing_product_family text;

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
      (p_payload ->> 'job_id')::uuid;

    v_report_id :=
      (p_payload ->> 'report_id')::uuid;

    v_workspace_id :=
      (p_payload ->> 'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload ->> 'advertiser_id')::uuid;

    v_connection_id :=
      (p_payload ->> 'connection_id')::uuid;

    v_provider :=
      nullif(
        btrim(
          p_payload ->> 'provider'
        ),
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
      (p_payload ->> 'date_from')::date;

    v_date_to :=
      (p_payload ->> 'date_to')::date;

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

    v_google_version :=
      (
        v_collector ->>
        'google_version'
      )::bigint;

    v_all_data_version :=
      (
        v_collector ->>
        'all_data_version'
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

    v_complete :=
      (
        v_collector ->>
        'complete'
      )::boolean;

    v_cursor :=
      nullif(
        v_collector ->
          'cursor',
        'null'::jsonb
      );

    v_has_product_routing :=
      v_collector ?
        'product_route'
      or v_collector ?
        'product_index'
      or v_collector ?
        'product_family';

    v_product_route :=
      v_collector ->
      'product_route';

    v_product_index :=
      case
        when jsonb_typeof(
          v_collector ->
          'product_index'
        ) = 'number'
        and (
          v_collector ->>
          'product_index'
        ) ~ '^[0-9]+$'
        then (
          v_collector ->>
          'product_index'
        )::bigint
        else null
      end;

    v_product_family :=
      nullif(
        btrim(
          v_collector ->>
          'product_family'
        ),
        ''
      );
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
     or v_execution_contract is null
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
     or jsonb_typeof(v_collector) <> 'object'
     or v_google_version <> 1
     or v_all_data_version <> 1
     or v_phase not in (
       'product_boundary',
       'keyword',
       'search_ad',
       'demand_gen_ad',
       'completed'
     )
     or v_date_window_index is null
     or v_date_window_index < 0
     or v_next_row_index is null
     or v_next_row_index < 0
     or v_complete is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;


  if v_has_product_routing then
    if not (
         v_collector ? 'product_route'
         and v_collector ? 'product_index'
         and v_collector ? 'product_family'
       )
       or jsonb_typeof(
            v_product_route
          ) <> 'array'
       or v_product_route not in (
            '[]'::jsonb,
            '["search"]'::jsonb,
            '["demand_gen"]'::jsonb,
            '["display"]'::jsonb,
            '["performance_max"]'::jsonb,
            '["search","demand_gen"]'::jsonb,
            '["search","display"]'::jsonb,
            '["search","performance_max"]'::jsonb,
            '["demand_gen","display"]'::jsonb,
            '["demand_gen","performance_max"]'::jsonb,
            '["display","performance_max"]'::jsonb,
            '["search","demand_gen","display"]'::jsonb,
            '["search","demand_gen","performance_max"]'::jsonb,
            '["search","display","performance_max"]'::jsonb,
            '["demand_gen","display","performance_max"]'::jsonb,
            '["search","demand_gen","display","performance_max"]'::jsonb
          )
       or v_product_index is null
       or v_product_index < 0
       or v_product_index >
            jsonb_array_length(
              v_product_route
            )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
    end if;

    if v_complete then
      if v_product_index <>
           jsonb_array_length(
             v_product_route
           )
         or v_product_family is not null
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    else
      if v_product_index >=
           jsonb_array_length(
             v_product_route
           )
         or v_product_family is distinct from
           (
             v_product_route ->>
             (
               v_product_index::integer
             )
           )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    end if;
  end if;

  if v_provider <> 'google_ads' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_execution_contract <>
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_CONFLICT';
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

  v_phase_rank :=
    case v_phase
      when 'product_boundary' then 0
      when 'keyword' then 1
      when 'demand_gen_ad' then 1
      when 'search_ad' then 2
      when 'completed' then 3
      else null
    end;

  if v_complete then
    if v_phase <> 'completed'
       or v_cursor is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
    end if;
  else
    if v_phase = 'product_boundary' then
      if not v_has_product_routing
         or v_cursor is not null
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    else
      if v_phase = 'completed'
         or jsonb_typeof(v_cursor) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;

      begin
      v_cursor_version :=
        (
          v_cursor ->>
          'version'
        )::bigint;

      v_cursor_phase :=
        nullif(
          btrim(
            v_cursor ->>
            'phase'
          ),
          ''
        );

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

      v_cursor_expected_row_start_index :=
        (
          v_cursor ->>
          'expectedRowStartIndex'
        )::bigint;

      v_phase_cursor :=
        v_cursor ->
        'phaseCursor';
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
    end;

    if v_cursor_version is distinct from 1
       or v_cursor_phase is distinct from
          v_phase
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
       or v_cursor_expected_row_start_index
          is distinct from
          v_next_row_index
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_SCOPE_MISMATCH';
    end if;

    if v_phase = 'keyword' then
      if jsonb_typeof(
           v_phase_cursor
         ) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    elsif v_phase = 'search_ad' then
      if v_phase_cursor is not null
         and jsonb_typeof(
           v_phase_cursor
         ) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    elsif v_phase = 'demand_gen_ad' then
      if jsonb_typeof(
        v_phase_cursor
      ) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    end if;
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

  if v_job.provider <> 'google_ads' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.execution_contract
       is distinct from
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_CONFLICT';
  end if;

  if v_job.report_id <>
       v_report_id
     or v_job.workspace_id <>
       v_workspace_id
     or v_job.advertiser_id <>
       v_advertiser_id
     or v_job.connection_id <>
       v_connection_id
     or v_job.provider <>
       v_provider
     or v_job.external_account_id <>
       v_external_account_id
     or v_job.date_from <>
       v_date_from
     or v_job.date_to <>
       v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_SCOPE_MISMATCH';
  end if;

  if v_raw_rows <
       v_job.raw_rows
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

  if v_job.error_detail is not null then
    if jsonb_typeof(
         v_job.error_detail
       ) <> 'object'
       or (
         v_job.error_detail -
         'processing_checkpoint'
       ) <> '{}'::jsonb
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;
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
       or (
         v_existing_checkpoint ->>
         'execution_contract'
       ) is distinct from
         'google_all_data_v1'
       or jsonb_typeof(
         v_existing_collector
       ) is distinct from
         'object'
       or (
         v_existing_collector ->>
         'google_version'
       ) is distinct from '1'
       or (
         v_existing_collector ->>
         'all_data_version'
       ) is distinct from '1'
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    begin
      v_existing_execution_contract :=
        v_existing_checkpoint ->>
        'execution_contract';

      v_existing_phase :=
        v_existing_collector ->>
        'phase';

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

      v_existing_complete :=
        (
          v_existing_checkpoint ->>
          'complete'
        )::boolean;

      v_existing_cursor :=
        nullif(
          v_existing_collector ->
            'cursor',
          'null'::jsonb
        );

      v_existing_has_product_routing :=
        v_existing_collector ?
          'product_route'
        or v_existing_collector ?
          'product_index'
        or v_existing_collector ?
          'product_family';

      v_existing_product_route :=
        v_existing_collector ->
        'product_route';

      v_existing_product_index :=
        case
          when jsonb_typeof(
            v_existing_collector ->
            'product_index'
          ) = 'number'
          and (
            v_existing_collector ->>
            'product_index'
          ) ~ '^[0-9]+$'
          then (
            v_existing_collector ->>
            'product_index'
          )::bigint
          else null
        end;

      v_existing_product_family :=
        nullif(
          btrim(
            v_existing_collector ->>
            'product_family'
          ),
          ''
        );
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_CONFLICT';
    end;


    if v_existing_has_product_routing then
      if not (
           v_existing_collector ? 'product_route'
           and v_existing_collector ? 'product_index'
           and v_existing_collector ? 'product_family'
         )
         or jsonb_typeof(
              v_existing_product_route
            ) <> 'array'
         or v_existing_product_route not in (
              '[]'::jsonb,
              '["search"]'::jsonb,
              '["demand_gen"]'::jsonb,
              '["display"]'::jsonb,
              '["performance_max"]'::jsonb,
              '["search","demand_gen"]'::jsonb,
              '["search","display"]'::jsonb,
              '["search","performance_max"]'::jsonb,
              '["demand_gen","display"]'::jsonb,
              '["demand_gen","performance_max"]'::jsonb,
              '["display","performance_max"]'::jsonb,
              '["search","demand_gen","display"]'::jsonb,
              '["search","demand_gen","performance_max"]'::jsonb,
              '["search","display","performance_max"]'::jsonb,
              '["demand_gen","display","performance_max"]'::jsonb,
              '["search","demand_gen","display","performance_max"]'::jsonb
            )
         or v_existing_product_index is null
         or v_existing_product_index < 0
         or v_existing_product_index >
              jsonb_array_length(
                v_existing_product_route
              )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_CONFLICT';
      end if;

      if v_existing_complete then
        if v_existing_product_index <>
             jsonb_array_length(
               v_existing_product_route
             )
           or v_existing_product_family is not null
        then
          raise exception using
            errcode = 'P0001',
            message = 'MSC_CHECKPOINT_CONFLICT';
        end if;
      else
        if v_existing_product_index >=
             jsonb_array_length(
               v_existing_product_route
             )
           or v_existing_product_family is distinct from
             (
               v_existing_product_route ->>
               (
                 v_existing_product_index::integer
               )
             )
        then
          raise exception using
            errcode = 'P0001',
            message = 'MSC_CHECKPOINT_CONFLICT';
        end if;
      end if;
    end if;

    v_existing_phase_rank :=
      case v_existing_phase
        when 'product_boundary' then 0
        when 'keyword' then 1
        when 'demand_gen_ad' then 1
        when 'search_ad' then 2
        when 'completed' then 3
        else null
      end;

    if v_existing_execution_contract
         is distinct from
         'google_all_data_v1'
       or v_existing_phase_rank is null
       or v_existing_date_window_index
          is null
       or v_existing_next_row_index
          is null
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
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;

    if v_has_product_routing <>
         v_existing_has_product_routing
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    if v_has_product_routing then
      if v_product_route is distinct from
           v_existing_product_route
         or v_product_index <
           v_existing_product_index
         or v_product_index >
           (
             v_existing_product_index +
             1
           )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;

      if v_product_index =
           v_existing_product_index
         and (
           v_phase_rank <
             v_existing_phase_rank
           or v_phase_rank >
             (
               v_existing_phase_rank +
               1
             )
         )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    else
      if v_phase_rank <
           v_existing_phase_rank
         or v_phase_rank >
           (
             v_existing_phase_rank +
             1
           )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    end if;

    if v_existing_complete then
      if not v_complete
         or v_phase <>
            v_existing_phase
         or v_next_row_index <>
            v_existing_next_row_index
         or v_cursor is distinct from
            v_existing_cursor
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    elsif v_phase_rank =
          v_existing_phase_rank
       and v_next_row_index =
          v_existing_next_row_index
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
    end if;
  else
    if v_existing_checkpoint is not null
       or v_job.raw_rows <> 0
       or v_job.normalized_rows <> 0
       or v_job.inserted_rows <> 0
       or v_job.failed_rows <> 0
       or v_phase = 'completed'
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

      'execution_contract',
        'google_all_data_v1',

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

          'all_data_version',
            1,

          'phase',
            v_phase,

          'date_window_index',
            v_date_window_index,

          'next_row_index',
            v_next_row_index,

          'complete',
            v_complete,

          'cursor',
            v_cursor
        ) ||
        case
          when v_has_product_routing then
            jsonb_build_object(
              'product_route',
                v_product_route,

              'product_index',
                v_product_index,

              'product_family',
                v_product_family
            )
          else
            '{}'::jsonb
        end
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

  where id =
      v_job_id
    and status =
      'processing'
    and execution_contract =
      'google_all_data_v1'

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
on function public.save_google_ads_all_data_processing_checkpoint(jsonb)
from public;

revoke all
on function public.save_google_ads_all_data_processing_checkpoint(jsonb)
from anon;

revoke all
on function public.save_google_ads_all_data_processing_checkpoint(jsonb)
from authenticated;

grant execute
on function public.save_google_ads_all_data_processing_checkpoint(jsonb)
to service_role;

comment on function public.save_google_ads_all_data_processing_checkpoint(jsonb)
is
  'Persists Google Ads google_all_data_v1 phase checkpoints atomically without modifying the legacy Google keyword or Naver checkpoint RPC contracts.';

notify pgrst, 'reload schema';
