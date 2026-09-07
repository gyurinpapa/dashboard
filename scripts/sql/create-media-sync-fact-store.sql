-- Etrylue Performance
-- Option B canonical historical media fact store.
--
-- Architecture:
--
--   authoritative provider collection
--     -> temporary media_sync_staging_rows
--     -> canonical media_sync_fact_rows
--     -> existing snapshot projection
--     -> current/published report pointers
--
-- Important:
-- - report_rows / report_ingestions semantics are unchanged.
-- - current_ingestion_id / published_ingestion_id are untouched.
-- - report_id, connection_id and job_id are lineage only.
-- - fact natural identity is:
--     workspace_id
--     + advertiser_id
--     + provider
--     + external_account_id
--     + row_key
-- - current Naver replacement partition is one exact account/date.
-- - zero-row authoritative dates are valid replacements.
-- - partial or unreconciled jobs can never replace facts.
-- - Naver only for the initial replacement RPC.
-- - no Google behavior changes in this migration.

begin;

create table public.media_sync_fact_rows (
  id uuid
    primary key
    default gen_random_uuid(),

  workspace_id uuid
    not null
    references public.workspaces(id)
    on delete cascade,

  advertiser_id uuid
    not null
    references public.advertisers(id)
    on delete cascade,

  provider text
    not null,

  external_account_id text
    not null,

  row_key text
    not null,

  date date
    not null,

  channel text,
  device text,
  source text,

  row jsonb
    not null,

  row_fingerprint text
    generated always as (
      encode(
        extensions.digest(
          (row)::text,
          'sha256'
        ),
        'hex'
      )
    ) stored,

  /*
   * Operational lineage only.
   *
   * Deliberately no FK to report / connection / job:
   * deleting or replacing an operational projection must not delete
   * canonical account history or trigger a mass SET NULL rewrite.
   */
  source_connection_id uuid
    not null,

  source_report_id uuid
    not null,

  source_job_id uuid
    not null,

  /*
   * Prevent an older completed job from overwriting a date already
   * replaced by a newer job.
   */
  source_job_created_at timestamptz
    not null,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint media_sync_fact_rows_provider_check
    check (
      provider = any (
        array[
          'naver_searchad'::text,
          'google_ads'::text,
          'meta_ads'::text
        ]
      )
    ),

  constraint media_sync_fact_rows_external_account_not_blank
    check (
      length(btrim(external_account_id)) > 0
    ),

  constraint media_sync_fact_rows_row_key_not_blank
    check (
      length(btrim(row_key)) > 0
    ),

  constraint media_sync_fact_rows_row_object_check
    check (
      jsonb_typeof(row) = 'object'::text
    )
);

create unique index
  media_sync_fact_rows_identity_unique
on public.media_sync_fact_rows (
  workspace_id,
  advertiser_id,
  provider,
  external_account_id,
  row_key
);

create index
  media_sync_fact_rows_replacement_scope_index
on public.media_sync_fact_rows (
  workspace_id,
  advertiser_id,
  provider,
  external_account_id,
  date
);

create index
  media_sync_fact_rows_retention_date_index
on public.media_sync_fact_rows (
  workspace_id,
  date
);

create index
  media_sync_fact_rows_source_job_index
on public.media_sync_fact_rows (
  source_job_id
);


/*
 * Durable canonical partition authority.
 *
 * A fact date may legitimately contain zero rows after authoritative
 * omission. Fact rows therefore cannot themselves be the ownership marker.
 *
 * This table records the latest successfully replaced account/date even
 * when canonical row_count = 0.
 */
create table public.media_sync_fact_partitions (
  workspace_id uuid
    not null
    references public.workspaces(id)
    on delete cascade,

  advertiser_id uuid
    not null
    references public.advertisers(id)
    on delete cascade,

  provider text
    not null,

  external_account_id text
    not null,

  date date
    not null,

  source_connection_id uuid
    not null,

  source_report_id uuid
    not null,

  source_job_id uuid
    not null,

  source_job_created_at timestamptz
    not null,

  row_count bigint
    not null,

  updated_at timestamptz
    not null
    default now(),

  primary key (
    workspace_id,
    advertiser_id,
    provider,
    external_account_id,
    date
  ),

  constraint media_sync_fact_partitions_provider_check
    check (
      provider = any (
        array[
          'naver_searchad'::text,
          'google_ads'::text,
          'meta_ads'::text
        ]
      )
    ),

  constraint media_sync_fact_partitions_external_account_not_blank
    check (
      length(btrim(external_account_id)) > 0
    ),

  constraint media_sync_fact_partitions_row_count_check
    check (
      row_count >= 0
    )
);

alter table public.media_sync_fact_partitions
  enable row level security;

revoke all
on table public.media_sync_fact_partitions
from public, anon, authenticated, service_role;

grant select
on table public.media_sync_fact_partitions
to service_role;

/*
 * Browser clients do not read or mutate canonical facts directly.
 *
 * Existing report/UI routes remain unchanged.
 * Server-side service_role may read facts later for projections.
 * Every canonical mutation goes through a SECURITY DEFINER RPC.
 */
alter table public.media_sync_fact_rows
  enable row level security;

revoke all
on table public.media_sync_fact_rows
from public, anon, authenticated, service_role;

grant select
on table public.media_sync_fact_rows
to service_role;


/*
 * Replace exactly one authoritative Naver account/date partition.
 *
 * Why one date:
 * - the accepted replacement identity boundary is account + date;
 * - a seven-day collection can therefore be projected as seven bounded
 *   atomic replacements after the entire job is authoritative;
 * - hundreds of thousands of rows do not need one giant delete/insert
 *   transaction;
 * - each committed partition is independently authoritative.
 *
 * Zero source rows are intentionally valid:
 * a date that previously had non-zero rows may later become completely
 * absent after authoritative zero omission. The completed collector +
 * completed reconciliation checkpoint is the authority that makes such
 * deletion safe.
 */
create or replace function
  public.replace_naver_searchads_fact_date(
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
  v_reconciliation jsonb;

  v_retained_rows bigint;
  v_remaining_overlap_rows bigint;

  v_min_row_index bigint;
  v_max_row_index bigint;

  v_source_rows bigint := 0;
  v_distinct_row_keys bigint := 0;
  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_invalid_fingerprint_rows bigint := 0;
  v_invalid_row_rows bigint := 0;

  v_partition_source_job_id uuid;
  v_partition_source_job_created_at timestamptz;
  v_partition_row_count bigint;

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
        'MSFR_INVALID_INPUT: payload must be a JSON object';
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
        'MSFR_INVALID_INPUT: job_id is invalid';
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
          'MSFR_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_date is null then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INVALID_INPUT: date is required';
  end if;

  /*
   * Same-job serialization.
   */
  select media_job.*
  into v_job
  from public.media_sync_jobs as media_job
  where media_job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_JOB_NOT_PROCESSING: job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad' then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_UNSUPPORTED_PROVIDER: initial fact replacement supports only Naver Search Ads';
  end if;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_MODE_MISMATCH: job mode must remain snapshot_replace';
  end if;

  /*
   * Fact replacement belongs before existing snapshot materialization.
   *
   * Once snapshot_ingestion_id exists the worker must resume the existing
   * projection path instead of replaying canonical replacement.
   */
  if v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INVALID_JOB_STATE: fact replacement boundary has passed';
  end if;

  if v_date < v_job.date_from
     or v_date > v_job.date_to
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_DATE_SCOPE_MISMATCH: date is outside the job window';
  end if;

  /*
   * Active connection remains the account authority.
   */
  select connection.*
  into v_connection
  from public.media_connections as connection
  where connection.id = v_job.connection_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_job.workspace_id
     or v_connection.advertiser_id <> v_job.advertiser_id
     or v_connection.provider <> v_job.provider
     or v_connection.external_account_id <>
        v_job.external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_SCOPE_MISMATCH: active connection does not match the job';
  end if;

  /*
   * Destructive replacement authority:
   *
   * completed keyword collector
   * + completed authoritative collector
   * + completed cross-grain reconciliation
   *
   * This gate is what makes zero-row replacement safe.
   */
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
        'MSFR_CHECKPOINT_NOT_COMPLETED: processing checkpoint is missing';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
      'processing_checkpoint';

  if v_checkpoint #>>
       '{collector,phase}'
       is distinct from 'completed'
     or v_checkpoint #>>
       '{collector,keyword,complete}'
       is distinct from 'true'
     or v_checkpoint #>>
       '{collector,authoritative,complete}'
       is distinct from 'true'
     or v_checkpoint #>>
       '{failed_rows}'
       is distinct from '0'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_CHECKPOINT_NOT_COMPLETED: authoritative collectors are incomplete';
  end if;

  v_reconciliation :=
    v_checkpoint ->
      'reconciliation';

  if jsonb_typeof(v_reconciliation) <>
       'object'
     or v_reconciliation ->> 'kind'
        is distinct from
          'brand_search_cross_grain_dedup_v1'
     or v_reconciliation ->> 'version'
        is distinct from '1'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_RECONCILIATION_NOT_COMPLETED: reconciliation authority is missing';
  end if;

  begin
    v_retained_rows :=
      (v_reconciliation ->>
        'retained_rows')::bigint;

    v_remaining_overlap_rows :=
      (v_reconciliation ->>
        'remaining_overlap_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'MSFR_RECONCILIATION_INVALID: reconciliation counts are invalid';
  end;

  if v_retained_rows < 0
     or v_remaining_overlap_rows <> 0
     or v_job.raw_rows <> v_retained_rows
     or v_job.normalized_rows <> v_retained_rows
     or v_job.inserted_rows <> v_retained_rows
     or v_checkpoint #>>
          '{raw_rows}'
        is distinct from
          v_retained_rows::text
     or v_checkpoint #>>
          '{normalized_rows}'
        is distinct from
          v_retained_rows::text
     or v_checkpoint #>>
          '{inserted_rows}'
        is distinct from
          v_retained_rows::text
     or v_checkpoint #>>
          '{collector,next_row_index}'
        is distinct from
          v_retained_rows::text
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_RECONCILIATION_CONFLICT: retained staging authority changed';
  end if;

  /*
   * Cheap post-reconciliation boundary witness.
   *
   * Reconciliation has already fully validated/reindexed retained rows.
   * Any later append would necessarily move this unique row_index boundary.
   *
   * Zero rows are explicitly valid.
   */
  if v_retained_rows = 0 then
    if exists (
      select 1
      from public.media_sync_staging_rows
      where job_id = v_job.id
      limit 1
    ) then
      raise exception using
        errcode = 'P0001',
        message =
          'MSFR_STAGING_CHANGED: zero-row authority no longer matches staging';
    end if;
  else
    select staging.row_index
    into v_min_row_index
    from public.media_sync_staging_rows
      as staging
    where staging.job_id = v_job.id
    order by staging.row_index asc
    limit 1;

    select staging.row_index
    into v_max_row_index
    from public.media_sync_staging_rows
      as staging
    where staging.job_id = v_job.id
    order by staging.row_index desc
    limit 1;

    if v_min_row_index is distinct from 0
       or v_max_row_index
          is distinct from
            v_retained_rows - 1
    then
      raise exception using
        errcode = 'P0001',
        message =
          'MSFR_STAGING_CHANGED: retained staging boundary changed';
    end if;
  end if;

  /*
   * Serialize every job targeting the same canonical account/date.
   * The job-row lock alone cannot serialize two distinct jobs.
   */
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

  /*
   * Validate only the date partition that is about to be replaced.
   * The whole retained staging set was already reconciled above.
   */
  select
    count(staging.id)::bigint,

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
    v_source_rows,
    v_distinct_row_keys,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_invalid_fingerprint_rows,
    v_invalid_row_rows

  from public.media_sync_staging_rows
    as staging

  where staging.job_id = v_job.id
    and staging.date = v_date;

  if v_source_rows <>
       v_distinct_row_keys
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_invalid_fingerprint_rows <> 0
     or v_invalid_row_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_DATE_STAGING_INVALID: date partition failed canonical validation';
  end if;

  /*
   * Durable partition ownership.
   *
   * Advisory locking serializes concurrent jobs targeting the same date.
   * The partition table then preserves latest-job authority even when the
   * authoritative result contains zero fact rows.
   */
  select
    partition.source_job_id,
    partition.source_job_created_at,
    partition.row_count
  into
    v_partition_source_job_id,
    v_partition_source_job_created_at,
    v_partition_row_count
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
        'MSFR_STALE_JOB: a newer job already owns this canonical date';
  end if;

  /*
   * Exact date-partition replacement.
   *
   * DELETE and INSERT are one database transaction.
   * If any validation or insert fails, the old partition is restored
   * automatically by PostgreSQL rollback.
   *
   * Completely omitted/zero dates naturally execute as:
   *   delete old partition
   *   insert zero rows
   */
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
       v_source_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INSERT_COUNT_MISMATCH: inserted fact count does not match authoritative date rows';
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
       v_source_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_POSTCHECK_FAILED: canonical fact count does not match authoritative date rows';
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
    v_source_rows,
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
        'MSFR_STALE_JOB: partition authority advanced concurrently';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_date,
    v_source_rows,
    v_deleted_rows,
    v_inserted_rows,
    v_fact_rows;
end;
$function$;

revoke all
on function
  public.replace_naver_searchads_fact_date(jsonb)
from public;

revoke all
on function
  public.replace_naver_searchads_fact_date(jsonb)
from anon;

revoke all
on function
  public.replace_naver_searchads_fact_date(jsonb)
from authenticated;

grant execute
on function
  public.replace_naver_searchads_fact_date(jsonb)
to service_role;

notify pgrst, 'reload schema';

commit;
