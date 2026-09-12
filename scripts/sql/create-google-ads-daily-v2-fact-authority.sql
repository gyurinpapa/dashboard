begin;

-- ============================================================
-- ETRYLUE DAILY REPORT V2
-- GOOGLE ADS EXACT-DAY CANONICAL FACT AUTHORITY
--
-- Additive only.
--
-- These RPCs are intentionally restricted to:
--   provider            = google_ads
--   execution_contract  = google_all_data_v1
--   automation_contract = daily_report_v2
--   mode                = snapshot_replace
--   date_from            = date_to
--
-- They do NOT:
-- - materialize report_rows
-- - create report_ingestions
-- - activate reports.current_ingestion_id
-- - change published_ingestion_id
-- - change media_connections.last_sync_at
-- ============================================================


-- ============================================================
-- 1. EXACT-DAY FACT REPLACEMENT
-- ============================================================

create or replace function
  public.replace_google_ads_daily_v2_fact_date(
    p_payload jsonb
  )
returns table(
  job jsonb,
  scope_date date,
  source_rows bigint,
  deleted_rows bigint,
  inserted_rows bigint,
  fact_rows bigint
)
language plpgsql
security definer
set search_path to
  'pg_catalog',
  'public',
  'extensions'
set statement_timeout to '2min'
as $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_connection public.media_connections%rowtype;

  v_job_id uuid;
  v_date date;

  v_checkpoint jsonb;
  v_collector jsonb;

  v_checkpoint_next_rows bigint;
  v_checkpoint_raw_rows bigint;
  v_checkpoint_normalized_rows bigint;
  v_checkpoint_inserted_rows bigint;
  v_collector_next_rows bigint;

  v_total_rows bigint := 0;
  v_distinct_row_indexes bigint := 0;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_distinct_row_keys bigint := 0;
  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_invalid_fingerprint_rows bigint := 0;
  v_invalid_row_rows bigint := 0;

  v_partition_source_job_id uuid;
  v_partition_source_job_created_at timestamptz;

  v_deleted_rows bigint := 0;
  v_inserted_rows bigint := 0;
  v_fact_rows bigint := 0;

  v_now timestamptz :=
    pg_catalog.clock_timestamp();
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(
       p_payload ->> 'job_id',
       ''
     ) !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_INPUT: job_id is invalid';
  end if;

  begin
    v_job_id :=
      (p_payload ->> 'job_id')::uuid;

    v_date :=
      nullif(
        btrim(
          p_payload ->> 'date'
        ),
        ''
      )::date;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_date is null then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_INPUT: date is required';
  end if;

  -- Same-job serialization.
  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_JOB_NOT_PROCESSING: job must remain processing';
  end if;

  if v_job.provider <> 'google_ads'
     or v_job.mode <> 'snapshot_replace'
     or v_job.execution_contract is distinct from
          'google_all_data_v1'
     or v_job.automation_contract is distinct from
          'daily_report_v2'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_UNSUPPORTED_JOB: Google Daily Report V2 ALL-DATA job is required';
  end if;

  if v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_JOB_STATE: fact replacement boundary has passed';
  end if;

  -- Daily Report V2 intentionally creates one provider job per exact date.
  if v_job.date_from <> v_job.date_to
     or v_date <> v_job.date_from
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_DATE_SCOPE_MISMATCH: exact one-day job authority is required';
  end if;

  -- Active connection remains account authority.
  select connection.*
  into v_connection
  from public.media_connections as connection
  where connection.id = v_job.connection_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <>
       v_job.workspace_id
     or v_connection.advertiser_id <>
       v_job.advertiser_id
     or v_connection.provider <>
       v_job.provider
     or v_connection.external_account_id <>
       v_job.external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_SCOPE_MISMATCH: active connection does not match the job';
  end if;

  -- ----------------------------------------------------------
  -- Durable Google ALL-DATA completion authority.
  -- ----------------------------------------------------------

  if jsonb_typeof(v_job.error_detail) <>
       'object'
     or jsonb_typeof(
       v_job.error_detail ->
         'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_NOT_COMPLETED: processing checkpoint is missing';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
      'processing_checkpoint';

  if jsonb_typeof(
       v_checkpoint -> 'collector'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_NOT_COMPLETED: collector checkpoint is missing';
  end if;

  v_collector :=
    v_checkpoint -> 'collector';

  if v_checkpoint ->> 'execution_contract'
       is distinct from 'google_all_data_v1'
     or v_checkpoint ->> 'complete'
       is distinct from 'true'
     or v_checkpoint ->> 'failed_rows'
       is distinct from '0'
     or v_collector ->> 'google_version'
       is distinct from '1'
     or v_collector ->> 'all_data_version'
       is distinct from '1'
     or v_collector ->> 'phase'
       is distinct from 'completed'
     or v_collector ->> 'complete'
       is distinct from 'true'
     or v_collector -> 'cursor'
       is distinct from 'null'::jsonb
     or v_checkpoint ->> 'date_window_index'
       is distinct from
          v_collector ->> 'date_window_index'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_NOT_COMPLETED: Google ALL-DATA terminal checkpoint is invalid';
  end if;

  begin
    v_checkpoint_next_rows :=
      (v_checkpoint ->>
        'next_row_index')::bigint;

    v_checkpoint_raw_rows :=
      (v_checkpoint ->>
        'raw_rows')::bigint;

    v_checkpoint_normalized_rows :=
      (v_checkpoint ->>
        'normalized_rows')::bigint;

    v_checkpoint_inserted_rows :=
      (v_checkpoint ->>
        'inserted_rows')::bigint;

    v_collector_next_rows :=
      (v_collector ->>
        'next_row_index')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_CHECKPOINT_INVALID: Google row counters are invalid';
  end;

  if v_checkpoint_next_rows < 0
     or v_checkpoint_raw_rows <>
          v_checkpoint_next_rows
     or v_checkpoint_normalized_rows <>
          v_checkpoint_next_rows
     or v_checkpoint_inserted_rows <>
          v_checkpoint_next_rows
     or v_collector_next_rows <>
          v_checkpoint_next_rows
     or v_job.raw_rows <>
          v_checkpoint_next_rows
     or v_job.normalized_rows <>
          v_checkpoint_next_rows
     or v_job.inserted_rows <>
          v_checkpoint_next_rows
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_CONFLICT: durable Google row boundary changed';
  end if;

  -- ----------------------------------------------------------
  -- Full persisted staging boundary witness.
  --
  -- This independently re-checks the same canonical boundary
  -- after the application staging summary and before destructive
  -- fact replacement.
  -- ----------------------------------------------------------

  select
    count(staging.id)::bigint,

    count(
      distinct staging.row_index
    )::bigint,

    min(staging.row_index)::bigint,

    max(staging.row_index)::bigint,

    count(
      distinct staging.row_key
    )::bigint,

    count(staging.id) filter (
      where staging.report_id <>
              v_job.report_id
         or staging.workspace_id <>
              v_job.workspace_id
         or staging.advertiser_id <>
              v_job.advertiser_id
         or staging.connection_id <>
              v_job.connection_id
         or staging.provider <>
              v_job.provider
         or staging.external_account_id <>
              v_job.external_account_id
         or staging.date_from <>
              v_job.date_from
         or staging.date_to <>
              v_job.date_to
         or staging.date <>
              v_date
    )::bigint,

    count(staging.id) filter (
      where btrim(
        staging.row_key
      ) = ''
    )::bigint,

    count(staging.id) filter (
      where staging.row_fingerprint
              is null
         or staging.row_fingerprint
              !~ '^[0-9a-f]{64}$'
         or staging.row_fingerprint
              is distinct from
                encode(
                  extensions.digest(
                    (staging.row)::text,
                    'sha256'
                  ),
                  'hex'
                )
    )::bigint,

    count(staging.id) filter (
      where jsonb_typeof(
        staging.row
      ) <> 'object'
    )::bigint

  into
    v_total_rows,
    v_distinct_row_indexes,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_keys,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_invalid_fingerprint_rows,
    v_invalid_row_rows

  from public.media_sync_staging_rows
    as staging

  where staging.job_id =
          v_job.id;

  if v_total_rows <>
       v_job.inserted_rows
     or v_distinct_row_indexes <>
          v_total_rows
     or v_distinct_row_keys <>
          v_total_rows
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_invalid_fingerprint_rows <> 0
     or v_invalid_row_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_STAGING_CHANGED: persisted staging authority is invalid';
  end if;

  if v_total_rows = 0 then
    if v_min_row_index is not null
       or v_max_row_index is not null
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_STAGING_CHANGED: zero-row staging contains row bounds';
    end if;
  else
    if v_min_row_index is distinct from 0
       or v_max_row_index
            is distinct from
              v_total_rows - 1
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_STAGING_CHANGED: staging row-index boundary changed';
    end if;
  end if;

  -- Serialize all jobs targeting the same canonical account/date.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_job.workspace_id::text
        || '|'
        || v_job.advertiser_id::text
        || '|'
        || v_job.provider
        || '|'
        || v_job.external_account_id
        || '|'
        || v_date::text,
      0
    )
  );

  -- Preserve newer canonical authority.
  select
    partition.source_job_id,
    partition.source_job_created_at
  into
    v_partition_source_job_id,
    v_partition_source_job_created_at
  from public.media_sync_fact_partitions
    as partition
  where partition.workspace_id =
          v_job.workspace_id
    and partition.advertiser_id =
          v_job.advertiser_id
    and partition.provider =
          v_job.provider
    and partition.external_account_id =
          v_job.external_account_id
    and partition.date =
          v_date
  for update;

  if found
     and (
       v_partition_source_job_created_at,
       v_partition_source_job_id
     ) > (
       v_job.created_at,
       v_job.id
     )
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_STALE_JOB: a newer job already owns this canonical date';
  end if;

  -- Exact date replacement. Zero-row replacement is valid.
  with deleted as (
    delete
    from public.media_sync_fact_rows
      as fact
    where fact.workspace_id =
            v_job.workspace_id
      and fact.advertiser_id =
            v_job.advertiser_id
      and fact.provider =
            v_job.provider
      and fact.external_account_id =
            v_job.external_account_id
      and fact.date =
            v_date
    returning
      fact.row_key,
      fact.row_fingerprint,
      fact.source_job_id,
      fact.created_at,
      fact.updated_at
  ),
  inserted as (
    insert into public.media_sync_fact_rows (
      workspace_id,
      advertiser_id,
      provider,
      external_account_id,
      row_key,
      date,
      channel,
      device,
      source,
      row,
      source_connection_id,
      source_report_id,
      source_job_id,
      source_job_created_at,
      created_at,
      updated_at
    )
    select
      staging.workspace_id,
      staging.advertiser_id,
      staging.provider,
      staging.external_account_id,
      staging.row_key,
      staging.date,
      staging.channel,
      staging.device,
      staging.source,
      staging.row,

      v_job.connection_id,
      v_job.report_id,
      v_job.id,
      v_job.created_at,

      coalesce(
        old_fact.created_at,
        v_now
      ),

      case
        when old_fact.row_key
               is not null
         and old_fact.row_fingerprint
               is not distinct from
                 staging.row_fingerprint
         and old_fact.source_job_id =
               v_job.id
          then old_fact.updated_at
        else v_now
      end

    from public.media_sync_staging_rows
      as staging

    left join deleted
      as old_fact
      on old_fact.row_key =
           staging.row_key

    where staging.job_id =
            v_job.id
      and staging.date =
            v_date

    returning id
  )

  select
    (
      select count(*)::bigint
      from deleted
    ),
    (
      select count(*)::bigint
      from inserted
    )

  into
    v_deleted_rows,
    v_inserted_rows;

  if v_inserted_rows <>
       v_total_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INSERT_COUNT_MISMATCH: fact insert count changed';
  end if;

  select count(fact.id)::bigint
  into v_fact_rows
  from public.media_sync_fact_rows
    as fact
  where fact.workspace_id =
          v_job.workspace_id
    and fact.advertiser_id =
          v_job.advertiser_id
    and fact.provider =
          v_job.provider
    and fact.external_account_id =
          v_job.external_account_id
    and fact.date =
          v_date;

  if v_fact_rows <>
       v_total_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_POSTCHECK_FAILED: canonical fact count changed';
  end if;

  insert into public.media_sync_fact_partitions (
    workspace_id,
    advertiser_id,
    provider,
    external_account_id,
    date,
    source_connection_id,
    source_report_id,
    source_job_id,
    source_job_created_at,
    row_count,
    updated_at
  )
  values (
    v_job.workspace_id,
    v_job.advertiser_id,
    v_job.provider,
    v_job.external_account_id,
    v_date,
    v_job.connection_id,
    v_job.report_id,
    v_job.id,
    v_job.created_at,
    v_total_rows,
    v_now
  )
  on conflict (
    workspace_id,
    advertiser_id,
    provider,
    external_account_id,
    date
  )
  do update
  set
    source_connection_id =
      excluded.source_connection_id,
    source_report_id =
      excluded.source_report_id,
    source_job_id =
      excluded.source_job_id,
    source_job_created_at =
      excluded.source_job_created_at,
    row_count =
      excluded.row_count,
    updated_at =
      excluded.updated_at
  where (
    public.media_sync_fact_partitions.source_job_created_at,
    public.media_sync_fact_partitions.source_job_id
  ) <= (
    excluded.source_job_created_at,
    excluded.source_job_id
  );

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_STALE_JOB: partition authority advanced concurrently';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_date,
    v_total_rows,
    v_deleted_rows,
    v_inserted_rows,
    v_fact_rows;
end;
$function$;


-- ============================================================
-- 2. FACT-ONLY JOB COMPLETION
-- ============================================================

create or replace function
  public.complete_google_ads_daily_v2_fact_only_job(
    p_payload jsonb
  )
returns table(
  job jsonb,
  covered_dates bigint,
  partition_rows bigint,
  fact_rows bigint,
  idempotent boolean
)
language plpgsql
security definer
set search_path to
  'pg_catalog',
  'public',
  'extensions'
set statement_timeout to '2min'
as $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_job_id uuid;

  v_checkpoint jsonb;
  v_collector jsonb;

  v_covered_dates bigint := 0;
  v_partition_rows bigint := 0;
  v_fact_rows bigint := 0;
  v_bad_lineage bigint := 0;

  v_now timestamptz :=
    pg_catalog.clock_timestamp();

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_INVALID_INPUT: payload must be a JSON object';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(
          p_payload ->> 'job_id'
        ),
        ''
      )::uuid;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_INVALID_INPUT: job_id is invalid';
  end;

  if v_job_id is null then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_INVALID_INPUT: job_id is required';
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.provider <> 'google_ads'
     or v_job.mode <> 'snapshot_replace'
     or v_job.execution_contract is distinct from
          'google_all_data_v1'
     or v_job.automation_contract is distinct from
          'daily_report_v2'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_UNSUPPORTED_JOB: Google Daily Report V2 ALL-DATA job is required';
  end if;

  if v_job.date_from <> v_job.date_to then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_DATE_SCOPE_MISMATCH: exact one-day job authority is required';
  end if;

  if v_job.snapshot_ingestion_id is not null then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_SNAPSHOT_EXISTS: fact-only completion cannot own a snapshot';
  end if;

  if v_job.status = 'done' then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.failed_rows <> 0
       or v_job.error is not null
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_COMPLETION_CONFLICT: invalid done/null-snapshot state';
    end if;

    v_idempotent := true;

  elsif v_job.status = 'processing' then
    if v_job.finished_at is not null
       or v_job.failed_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_INVALID_JOB_STATE: processing job is not eligible';
    end if;

    v_idempotent := false;

  else
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_JOB_NOT_PROCESSING: job must be processing or already done';
  end if;

  if v_job.raw_rows <>
       v_job.inserted_rows
     or v_job.normalized_rows <>
          v_job.inserted_rows
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_JOB_COUNT_CONFLICT: Google row counts changed';
  end if;

  -- Durable completion witness is retained even after status=done.
  if jsonb_typeof(v_job.error_detail) <>
       'object'
     or jsonb_typeof(
       v_job.error_detail ->
         'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_CHECKPOINT_NOT_COMPLETED: processing checkpoint is missing';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
      'processing_checkpoint';

  if jsonb_typeof(
       v_checkpoint -> 'collector'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_CHECKPOINT_NOT_COMPLETED: collector checkpoint is missing';
  end if;

  v_collector :=
    v_checkpoint -> 'collector';

  if v_checkpoint ->> 'execution_contract'
       is distinct from 'google_all_data_v1'
     or v_checkpoint ->> 'complete'
       is distinct from 'true'
     or v_checkpoint ->> 'failed_rows'
       is distinct from '0'
     or v_collector ->> 'google_version'
       is distinct from '1'
     or v_collector ->> 'all_data_version'
       is distinct from '1'
     or v_collector ->> 'phase'
       is distinct from 'completed'
     or v_collector ->> 'complete'
       is distinct from 'true'
     or v_collector -> 'cursor'
       is distinct from 'null'::jsonb
     or v_checkpoint ->> 'next_row_index'
       is distinct from
          v_job.inserted_rows::text
     or v_collector ->> 'next_row_index'
       is distinct from
          v_job.inserted_rows::text
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_CHECKPOINT_CONFLICT: durable Google completion authority changed';
  end if;

  -- Same canonical account/date lock used by replacement.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_job.workspace_id::text
        || '|'
        || v_job.advertiser_id::text
        || '|'
        || v_job.provider
        || '|'
        || v_job.external_account_id
        || '|'
        || v_job.date_from::text,
      0
    )
  );

  select
    count(*)::bigint,
    coalesce(
      sum(p.row_count),
      0
    )::bigint,

    count(*) filter (
      where p.source_connection_id
              is distinct from
                v_job.connection_id
         or p.source_report_id
              is distinct from
                v_job.report_id
         or p.source_job_id
              is distinct from
                v_job.id
         or p.source_job_created_at
              is distinct from
                v_job.created_at
    )::bigint

  into
    v_covered_dates,
    v_partition_rows,
    v_bad_lineage

  from public.media_sync_fact_partitions
    as p

  where p.workspace_id =
          v_job.workspace_id
    and p.advertiser_id =
          v_job.advertiser_id
    and p.provider =
          v_job.provider
    and p.external_account_id =
          v_job.external_account_id
    and p.date =
          v_job.date_from;

  if v_covered_dates <> 1
     or v_bad_lineage <> 0
     or v_partition_rows <>
          v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_PARTITION_AUTHORITY_CONFLICT: exact job/date ownership is required';
  end if;

  select
    count(*)::bigint,

    count(*) filter (
      where f.source_connection_id
              is distinct from
                v_job.connection_id
         or f.source_report_id
              is distinct from
                v_job.report_id
         or f.source_job_id
              is distinct from
                v_job.id
         or f.source_job_created_at
              is distinct from
                v_job.created_at
    )::bigint

  into
    v_fact_rows,
    v_bad_lineage

  from public.media_sync_fact_rows
    as f

  where f.workspace_id =
          v_job.workspace_id
    and f.advertiser_id =
          v_job.advertiser_id
    and f.provider =
          v_job.provider
    and f.external_account_id =
          v_job.external_account_id
    and f.date =
          v_job.date_from;

  if v_bad_lineage <> 0
     or v_fact_rows <>
          v_partition_rows
     or v_fact_rows <>
          v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_FACT_AUTHORITY_CONFLICT: canonical facts do not match the job';
  end if;

  if not v_idempotent then
    update public.media_sync_jobs
      as j
    set
      status = 'done',
      progress = 100,
      finished_at = v_now,
      error = null,
      updated_at = v_now
    where j.id = v_job.id
      and j.status = 'processing'
      and j.snapshot_ingestion_id is null
      and j.finished_at is null
      and j.failed_rows = 0
      and j.automation_contract =
            'daily_report_v2'
      and j.execution_contract =
            'google_all_data_v1';

    if not found then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_COMPLETION_CONFLICT: job changed during completion';
    end if;
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job.id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.snapshot_ingestion_id
          is not null
     or v_job.failed_rows <> 0
     or v_job.error is not null
     or v_job.provider <> 'google_ads'
     or v_job.execution_contract
          is distinct from
            'google_all_data_v1'
     or v_job.automation_contract
          is distinct from
            'daily_report_v2'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_POSTCONDITION_FAILED: fact-only completion contract failed';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_covered_dates,
    v_partition_rows,
    v_fact_rows,
    v_idempotent;
end;
$function$;


-- ============================================================
-- 3. SECURITY
-- ============================================================

revoke all
on function
  public.replace_google_ads_daily_v2_fact_date(jsonb)
from public, anon, authenticated;

grant execute
on function
  public.replace_google_ads_daily_v2_fact_date(jsonb)
to service_role;

revoke all
on function
  public.complete_google_ads_daily_v2_fact_only_job(jsonb)
from public, anon, authenticated;

grant execute
on function
  public.complete_google_ads_daily_v2_fact_only_job(jsonb)
to service_role;

notify pgrst, 'reload schema';

commit;
