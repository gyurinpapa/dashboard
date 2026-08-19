-- Etrylue Performance
-- Google Ads H-4O corrective v2: restore grain-neutral append staging RPC
-- Production baseline pg_get_functiondef MD5: d90ce68348f56334be61a3c943501ceb
-- Expected post-mutation pg_get_functiondef MD5: 1e863518f6a472a6cd940fd8df998e38
-- Keep provider allowlist: naver_searchad + google_ads.
-- Keep Google keyword-only enforcement in the TypeScript staging boundary.
-- IMPORTANT: Production mutation SQL. Execute only after a fresh read-only drift gate.

begin;

CREATE OR REPLACE FUNCTION public.append_media_sync_staging_batch(p_payload jsonb)
 RETURNS TABLE(submitted_rows bigint, inserted_rows bigint, duplicate_rows bigint, first_row_index bigint, last_row_index bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
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
  v_date_window_index integer;

  v_submitted_rows bigint := 0;
  v_inserted_rows bigint := 0;
  v_duplicate_rows bigint := 0;
  v_first_row_index bigint := null;
  v_last_row_index bigint := null;

  v_has_invalid_input boolean := false;
  v_has_internal_duplicate boolean := false;
  v_has_existing_scope_mismatch boolean := false;
  v_has_duplicate_conflict boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(btrim(p_payload ->> 'job_id'), '')::uuid;

    v_report_id :=
      nullif(btrim(p_payload ->> 'report_id'), '')::uuid;

    v_workspace_id :=
      nullif(btrim(p_payload ->> 'workspace_id'), '')::uuid;

    v_advertiser_id :=
      nullif(btrim(p_payload ->> 'advertiser_id'), '')::uuid;

    v_connection_id :=
      nullif(btrim(p_payload ->> 'connection_id'), '')::uuid;

    v_provider :=
      nullif(btrim(p_payload ->> 'provider'), '');

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(btrim(p_payload ->> 'date_from'), '')::date;

    v_date_to :=
      nullif(btrim(p_payload ->> 'date_to'), '')::date;

    v_date_window_index :=
      (p_payload ->> 'date_window_index')::integer;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_date_window_index is null
     or v_date_window_index < 0
     or v_date_from > v_date_to
     or not (p_payload ? 'rows')
     or jsonb_typeof(p_payload -> 'rows') <> 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider not in (
       'naver_searchad',
       'google_ads'
     )
     or v_provider not in (
       'naver_searchad',
       'google_ads'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_UNSUPPORTED_PROVIDER';
  end if;

  if (v_report_id is not null and v_job.report_id <> v_report_id)
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
      message = 'MSS_SCOPE_MISMATCH';
  end if;

  v_report_id := v_job.report_id;

  v_submitted_rows :=
    jsonb_array_length(p_payload -> 'rows');

  if v_submitted_rows = 0 then
    return query
    select
      0::bigint,
      0::bigint,
      0::bigint,
      null::bigint,
      null::bigint;

    return;
  end if;

  with input_rows as (
    select
      input.ordinality,

      input.item ->> 'row_index'
        as row_index_text,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key,

      input.item ->> 'date'
        as date_text,

      input.item -> 'channel'
        as channel_json,

      input.item -> 'device'
        as device_json,

      input.item -> 'source'
        as source_json,

      input.item -> 'row'
        as row_json
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) with ordinality as input(
      item,
      ordinality
    )
  )
  select exists (
    select 1
    from input_rows
    where row_index_text is null
       or row_index_text !~ '^[0-9]+$'
       or row_key is null
       or date_text is null
       or date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or row_json is null
       or jsonb_typeof(row_json) <> 'object'
       or (
         channel_json is not null
         and jsonb_typeof(channel_json) not in (
           'string',
           'null'
         )
       )
       or (
         device_json is not null
         and jsonb_typeof(device_json) not in (
           'string',
           'null'
         )
       )
       or (
         source_json is not null
         and jsonb_typeof(source_json) not in (
           'string',
           'null'
         )
       )
  )
  into v_has_invalid_input;

  if v_has_invalid_input then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  begin
    with input_rows as (
      select
        (input.item ->> 'row_index')::bigint
          as row_index,

        nullif(
          btrim(input.item ->> 'row_key'),
          ''
        ) as row_key,

        (input.item ->> 'date')::date
          as row_date,

        case
          when input.item -> 'channel' is null
            or jsonb_typeof(
              input.item -> 'channel'
            ) = 'null'
          then null
          else input.item ->> 'channel'
        end as channel,

        case
          when input.item -> 'device' is null
            or jsonb_typeof(
              input.item -> 'device'
            ) = 'null'
          then null
          else input.item ->> 'device'
        end as device,

        case
          when input.item -> 'source' is null
            or jsonb_typeof(
              input.item -> 'source'
            ) = 'null'
          then null
          else input.item ->> 'source'
        end as source,

        input.item -> 'row'
          as row_json
      from jsonb_array_elements(
        p_payload -> 'rows'
      ) as input(item)
    )
    select
      min(row_index),
      max(row_index)
    into
      v_first_row_index,
      v_last_row_index
    from input_rows;

    if v_first_row_index is null
       or v_first_row_index < 0
       or v_last_row_index is null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_INVALID_INPUT';
    end if;

    with input_rows as (
      select
        (input.item ->> 'row_index')::bigint
          as row_index,

        nullif(
          btrim(input.item ->> 'row_key'),
          ''
        ) as row_key,

        (input.item ->> 'date')::date
          as row_date
      from jsonb_array_elements(
        p_payload -> 'rows'
      ) as input(item)
    )
    select exists (
      select 1
      from input_rows
      where row_date < v_date_from
         or row_date > v_date_to
    )
    into v_has_invalid_input;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_INVALID_INPUT';
  end;

  if v_has_invalid_input then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  with input_rows as (
    select
      (input.item ->> 'row_index')::bigint
        as row_index,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) as input(item)
  ),
  duplicate_row_indexes as (
    select row_index
    from input_rows
    group by row_index
    having count(*) > 1
  ),
  duplicate_row_keys as (
    select row_key
    from input_rows
    group by row_key
    having count(*) > 1
  )
  select
    exists(
      select 1
      from duplicate_row_indexes
    )
    or exists(
      select 1
      from duplicate_row_keys
    )
  into v_has_internal_duplicate;

  if v_has_internal_duplicate then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_DUPLICATE_CONFLICT';
  end if;

  /*
   * Existing rows for one job are written only while the same job row is
   * locked above, and every append validates the payload against that job.
   * Therefore one earliest existing row is the authoritative persisted-scope
   * witness for the job.
   *
   * The previous implementation scanned every staging row for the job on
   * every 100-row append. That made total work grow quadratically and caused
   * PostgreSQL statement timeout after tens of thousands of rows.
   *
   * This indexed probe is O(log n) through the unique (job_id, row_index)
   * index while preserving fail-closed scope validation. Duplicate retries
   * and row fingerprint conflicts remain validated below against both unique
   * identities.
   */
  select exists (
    select 1
    from (
      select
        existing.report_id,
        existing.workspace_id,
        existing.advertiser_id,
        existing.connection_id,
        existing.provider,
        existing.external_account_id,
        existing.date_from,
        existing.date_to
      from public.media_sync_staging_rows as existing
      where existing.job_id = v_job_id
      order by existing.row_index
      limit 1
    ) as existing_scope
    where existing_scope.report_id <> v_report_id
       or existing_scope.workspace_id <> v_workspace_id
       or existing_scope.advertiser_id <> v_advertiser_id
       or existing_scope.connection_id <> v_connection_id
       or existing_scope.provider <> v_provider
       or existing_scope.external_account_id <>
          v_external_account_id
       or existing_scope.date_from <> v_date_from
       or existing_scope.date_to <> v_date_to
  )
  into v_has_existing_scope_mismatch;

  if v_has_existing_scope_mismatch then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SCOPE_MISMATCH';
  end if;

  with input_rows as (
    select
      (input.item ->> 'row_index')::bigint
        as row_index,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key,

      (input.item ->> 'date')::date
        as row_date,

      case
        when input.item -> 'channel' is null
          or jsonb_typeof(
            input.item -> 'channel'
          ) = 'null'
        then null
        else input.item ->> 'channel'
      end as channel,

      case
        when input.item -> 'device' is null
          or jsonb_typeof(
            input.item -> 'device'
          ) = 'null'
        then null
        else input.item ->> 'device'
      end as device,

      case
        when input.item -> 'source' is null
          or jsonb_typeof(
            input.item -> 'source'
          ) = 'null'
        then null
        else input.item ->> 'source'
      end as source,

      input.item -> 'row'
        as row_json,

      encode(
        digest(
          (input.item -> 'row')::text,
          'sha256'
        ),
        'hex'
      ) as row_fingerprint
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) as input(item)
  ),
  compared as (
    select
      incoming.*,

      by_index.id
        as by_index_id,

      by_key.id
        as by_key_id,

      by_index.date_window_index
        as by_index_date_window_index,

      by_index.row_key
        as by_index_row_key,

      by_index.date
        as by_index_date,

      by_index.channel
        as by_index_channel,

      by_index.device
        as by_index_device,

      by_index.source
        as by_index_source,

      by_index.row_fingerprint
        as by_index_fingerprint,

      by_key.row_index
        as by_key_row_index,

      by_key.date
        as by_key_date,

      by_key.channel
        as by_key_channel,

      by_key.device
        as by_key_device,

      by_key.source
        as by_key_source,

      by_key.row_fingerprint
        as by_key_fingerprint
    from input_rows as incoming

    left join public.media_sync_staging_rows
      as by_index
      on by_index.job_id = v_job_id
     and by_index.row_index =
        incoming.row_index

    left join public.media_sync_staging_rows
      as by_key
      on by_key.job_id = v_job_id
     and by_key.date_window_index =
        v_date_window_index
     and by_key.row_key =
        incoming.row_key
  )
  select exists (
    select 1
    from compared
    where
      (
        by_index_id is not null
        and (
          by_index_date_window_index <>
            v_date_window_index
          or by_index_row_key <>
            row_key
          or by_index_date <>
            row_date
          or by_index_channel is distinct from
            channel
          or by_index_device is distinct from
            device
          or by_index_source is distinct from
            source
          or by_index_fingerprint <>
            row_fingerprint
        )
      )
      or
      (
        by_key_id is not null
        and (
          by_key_row_index <>
            row_index
          or by_key_date <>
            row_date
          or by_key_channel is distinct from
            channel
          or by_key_device is distinct from
            device
          or by_key_source is distinct from
            source
          or by_key_fingerprint <>
            row_fingerprint
        )
      )
      or
      (
        by_index_id is not null
        and by_key_id is not null
        and by_index_id <> by_key_id
      )
      or
      (
        by_index_id is null
        and by_key_id is not null
      )
      or
      (
        by_index_id is not null
        and by_key_id is null
      )
  )
  into v_has_duplicate_conflict;

  if v_has_duplicate_conflict then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_DUPLICATE_CONFLICT';
  end if;

  with input_rows as (
    select
      (input.item ->> 'row_index')::bigint
        as row_index,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key,

      (input.item ->> 'date')::date
        as row_date,

      case
        when input.item -> 'channel' is null
          or jsonb_typeof(
            input.item -> 'channel'
          ) = 'null'
        then null
        else input.item ->> 'channel'
      end as channel,

      case
        when input.item -> 'device' is null
          or jsonb_typeof(
            input.item -> 'device'
          ) = 'null'
        then null
        else input.item ->> 'device'
      end as device,

      case
        when input.item -> 'source' is null
          or jsonb_typeof(
            input.item -> 'source'
          ) = 'null'
        then null
        else input.item ->> 'source'
      end as source,

      input.item -> 'row'
        as row_json
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) as input(item)
  ),
  new_rows as (
    select incoming.*
    from input_rows as incoming
    left join public.media_sync_staging_rows
      as existing
      on existing.job_id = v_job_id
     and existing.row_index =
        incoming.row_index
    where existing.id is null
  ),
  inserted as (
    insert into public.media_sync_staging_rows (
      job_id,
      report_id,
      workspace_id,
      advertiser_id,
      connection_id,
      provider,
      external_account_id,
      date_window_index,
      date_from,
      date_to,
      row_index,
      row_key,
      date,
      channel,
      device,
      source,
      row
    )
    select
      v_job_id,
      v_report_id,
      v_workspace_id,
      v_advertiser_id,
      v_connection_id,
      v_provider,
      v_external_account_id,
      v_date_window_index,
      v_date_from,
      v_date_to,
      incoming.row_index,
      incoming.row_key,
      incoming.row_date,
      incoming.channel,
      incoming.device,
      incoming.source,
      incoming.row_json
    from new_rows as incoming
    returning id
  )
  select count(*)::bigint
  into v_inserted_rows
  from inserted;

  v_duplicate_rows :=
    v_submitted_rows - v_inserted_rows;

  return query
  select
    v_submitted_rows,
    v_inserted_rows,
    v_duplicate_rows,
    v_first_row_index,
    v_last_row_index;

exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_DUPLICATE_CONFLICT';

  when check_violation
    or not_null_violation
    or invalid_text_representation
    or numeric_value_out_of_range
    or datetime_field_overflow
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
end;
$function$;

revoke all on function public.append_media_sync_staging_batch(jsonb) from public;
revoke all on function public.append_media_sync_staging_batch(jsonb) from anon;
revoke all on function public.append_media_sync_staging_batch(jsonb) from authenticated;
grant execute on function public.append_media_sync_staging_batch(jsonb) to service_role;

commit;
