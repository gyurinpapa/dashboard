-- Etrylue Performance
-- Daily Report V2 coherent combined snapshot foundation.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- Scope:
--   - additive provider-neutral durable snapshot-run authority
--   - one prepared combined snapshot per report/through_date
--   - exact mapped supported participant set: Naver + Google
--   - all participating connections must be active
--   - duplicate provider/external-account fact scopes fail closed
--   - complete durable fact partitions are required for every participant
--   - report_ingestions remains the snapshot payload/checkpoint store
--   - current_ingestion_id / published_ingestion_id are never changed here
--   - media_sync_jobs are never changed here
--   - media_connections are never changed here
--   - materialization / completion / activation are intentionally NOT added here

begin;

create table if not exists public.daily_report_v2_snapshot_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null,
  advertiser_id uuid not null,
  report_id uuid not null,
  start_date date not null,
  through_date date not null,
  previous_ingestion_id uuid null,
  snapshot_ingestion_id uuid not null,
  participant_contract jsonb not null,
  participant_count integer not null,
  expected_rows integer not null,
  status text not null,
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),

  constraint daily_report_v2_snapshot_runs_date_order_chk
    check (start_date <= through_date),

  constraint daily_report_v2_snapshot_runs_participant_count_chk
    check (participant_count > 0),

  constraint daily_report_v2_snapshot_runs_expected_rows_chk
    check (expected_rows >= 0),

  constraint daily_report_v2_snapshot_runs_participant_contract_chk
    check (jsonb_typeof(participant_contract) = 'array'),

  constraint daily_report_v2_snapshot_runs_status_chk
    check (
      status in (
        'prepared',
        'materializing',
        'ready',
        'activated'
      )
    ),

  constraint daily_report_v2_snapshot_runs_report_fk
    foreign key (report_id)
    references public.reports(id)
    on delete cascade,

  constraint daily_report_v2_snapshot_runs_previous_ingestion_fk
    foreign key (previous_ingestion_id)
    references public.report_ingestions(id)
    on delete restrict,

  constraint daily_report_v2_snapshot_runs_snapshot_ingestion_fk
    foreign key (snapshot_ingestion_id)
    references public.report_ingestions(id)
    on delete restrict
);

create unique index if not exists
  daily_report_v2_snapshot_runs_report_through_uidx
on public.daily_report_v2_snapshot_runs (
  report_id,
  through_date
);

create unique index if not exists
  daily_report_v2_snapshot_runs_snapshot_ingestion_uidx
on public.daily_report_v2_snapshot_runs (
  snapshot_ingestion_id
);

create unique index if not exists
  daily_report_v2_snapshot_runs_one_open_per_report_uidx
on public.daily_report_v2_snapshot_runs (
  report_id
)
where status in (
  'prepared',
  'materializing',
  'ready'
);

create index if not exists
  daily_report_v2_snapshot_runs_scope_idx
on public.daily_report_v2_snapshot_runs (
  workspace_id,
  advertiser_id,
  report_id,
  through_date
);

alter table public.daily_report_v2_snapshot_runs
  owner to postgres;

revoke all
  on table public.daily_report_v2_snapshot_runs
  from public;

revoke all
  on table public.daily_report_v2_snapshot_runs
  from anon;

revoke all
  on table public.daily_report_v2_snapshot_runs
  from authenticated;

grant select
  on table public.daily_report_v2_snapshot_runs
  to service_role;

create or replace function public.prepare_daily_report_v2_combined_snapshot(
  p_payload jsonb
)
returns table(
  run_id uuid,
  report_id uuid,
  previous_ingestion_id uuid,
  snapshot_ingestion_id uuid,
  start_date date,
  through_date date,
  participant_contract jsonb,
  participant_count integer,
  expected_rows integer,
  status text,
  idempotent boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_report public.reports%rowtype;
  v_existing public.daily_report_v2_snapshot_runs%rowtype;

  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_created_by uuid;

  v_start_date date;
  v_through_date date;

  v_expected_dates bigint;

  v_participant_count bigint;
  v_distinct_fact_scope_count bigint;
  v_inactive_participant_count bigint;
  v_complete_participant_count bigint;

  v_participant_contract jsonb;
  v_expected_rows bigint;

  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_run_id uuid;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      message =
        'DRV2S_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'created_by', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'start_date', '') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or coalesce(p_payload->>'through_date', '') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then
    raise exception using
      message =
        'DRV2S_INVALID_INPUT: payload values are invalid';
  end if;

  begin
    v_report_id :=
      (p_payload->>'report_id')::uuid;

    v_workspace_id :=
      (p_payload->>'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload->>'advertiser_id')::uuid;

    v_created_by :=
      (p_payload->>'created_by')::uuid;

    v_start_date :=
      (p_payload->>'start_date')::date;

    v_through_date :=
      (p_payload->>'through_date')::date;
  exception
    when others then
      raise exception using
        message =
          'DRV2S_INVALID_INPUT: payload values could not be parsed';
  end;

  if v_start_date > v_through_date then
    raise exception using
      message =
        'DRV2S_INVALID_INPUT: start_date exceeds through_date';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2S_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
     or v_report.created_by is distinct from v_created_by
  then
    raise exception using
      message =
        'DRV2S_SCOPE_MISMATCH: report scope does not match request';
  end if;

  if v_report.status not in ('draft', 'ready')
     or v_report.meta #>> '{data_source,kind}' <> 'api'
     or v_report.meta #>> '{public_identity,source_type}' <> 'api'
     or v_report.meta #>> '{public_identity,period_type}' <> 'daily_sync'
     or v_report.meta #>> '{public_identity,period_key}' <> v_start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,enabled}' <> 'true'
     or v_report.meta #>> '{media_sync,auto_sync,contract}' <> 'daily_report_v2'
     or v_report.meta #>> '{media_sync,auto_sync,start_date}' <> v_start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,scope}' <>
          'all_mapped_supported_media'
  then
    raise exception using
      message =
        'DRV2S_INVALID_REPORT: report does not match Daily Report V2 canonical contract';
  end if;

  if v_report.period_start is not null
     or v_report.period_end is not null
     or v_report.draft_period_start is not null
     or v_report.draft_period_end is not null
  then
    raise exception using
      message =
        'DRV2S_INVALID_REPORT: daily_sync report must not retain fixed-range authority';
  end if;

  select run.*
    into v_existing
    from public.daily_report_v2_snapshot_runs as run
   where run.report_id = v_report_id
     and run.through_date = v_through_date
   for update;

  if found then
    if v_existing.workspace_id <> v_workspace_id
       or v_existing.advertiser_id <> v_advertiser_id
       or v_existing.start_date <> v_start_date
       or v_existing.created_by <> v_created_by
    then
      raise exception using
        message =
          'DRV2S_RUN_CONFLICT: existing run scope differs';
    end if;

    if v_existing.status = 'activated' then
      if v_report.current_ingestion_id
           is distinct from v_existing.snapshot_ingestion_id
      then
        raise exception using
          message =
            'DRV2S_POINTER_CONFLICT: activated run is not current';
      end if;
    else
      if v_report.current_ingestion_id
           is distinct from v_existing.previous_ingestion_id
      then
        raise exception using
          message =
            'DRV2S_POINTER_CONFLICT: report current pointer changed after prepare';
      end if;
    end if;

    v_idempotent := true;

    return query
    select
      v_existing.id,
      v_existing.report_id,
      v_existing.previous_ingestion_id,
      v_existing.snapshot_ingestion_id,
      v_existing.start_date,
      v_existing.through_date,
      v_existing.participant_contract,
      v_existing.participant_count,
      v_existing.expected_rows,
      v_existing.status,
      v_idempotent;

    return;
  end if;

  if exists (
    select 1
      from public.daily_report_v2_snapshot_runs as open_run
     where open_run.report_id = v_report_id
       and open_run.status in (
         'prepared',
         'materializing',
         'ready'
       )
  ) then
    raise exception using
      message =
        'DRV2S_OPEN_RUN_CONFLICT: another combined snapshot run is still open';
  end if;

  v_expected_dates :=
    (v_through_date - v_start_date)::bigint + 1;

  with mapped_supported as (
    select
      c.id as connection_id,
      c.provider,
      c.external_account_id,
      c.status
    from public.report_media_connections as mapping
    join public.media_connections as c
      on c.id = mapping.connection_id
    where mapping.report_id = v_report_id
      and mapping.workspace_id = v_workspace_id
      and mapping.advertiser_id = v_advertiser_id
      and c.workspace_id = v_workspace_id
      and c.advertiser_id = v_advertiser_id
      and c.provider in (
        'naver_searchad',
        'google_ads'
      )
  ),
  participant_coverage as (
    select
      m.connection_id,
      m.provider,
      m.external_account_id,
      m.status,
      count(p.date)::bigint as covered_dates,
      coalesce(sum(p.row_count), 0)::bigint as row_count
    from mapped_supported as m
    left join public.media_sync_fact_partitions as p
      on p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = m.provider
     and p.external_account_id = m.external_account_id
     and p.date >= v_start_date
     and p.date <= v_through_date
    group by
      m.connection_id,
      m.provider,
      m.external_account_id,
      m.status
  )
  select
    count(*)::bigint,
    count(
      distinct (
        pc.provider,
        pc.external_account_id
      )
    )::bigint,
    count(*) filter (
      where pc.status <> 'active'
    )::bigint,
    count(*) filter (
      where pc.covered_dates = v_expected_dates
    )::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'connection_id', pc.connection_id,
          'provider', pc.provider,
          'external_account_id', pc.external_account_id,
          'expected_rows', pc.row_count
        )
        order by
          case pc.provider
            when 'naver_searchad' then 0
            when 'google_ads' then 1
            else 99
          end,
          pc.external_account_id,
          pc.connection_id
      ),
      '[]'::jsonb
    ),
    coalesce(sum(pc.row_count), 0)::bigint
    into
      v_participant_count,
      v_distinct_fact_scope_count,
      v_inactive_participant_count,
      v_complete_participant_count,
      v_participant_contract,
      v_expected_rows
    from participant_coverage as pc;

  if v_participant_count = 0 then
    raise exception using
      message =
        'DRV2S_NO_PARTICIPANTS: no mapped supported media participate';
  end if;

  if v_distinct_fact_scope_count <> v_participant_count then
    raise exception using
      message =
        'DRV2S_DUPLICATE_FACT_SCOPE: multiple mappings target the same provider/account fact scope';
  end if;

  if v_inactive_participant_count <> 0 then
    raise exception using
      message =
        'DRV2S_INACTIVE_PARTICIPANT: every participating connection must be active';
  end if;

  if v_complete_participant_count <> v_participant_count then
    raise exception using
      message =
        'DRV2S_FACT_COVERAGE_INCOMPLETE: every participant must have contiguous durable partitions through target';
  end if;

  if v_expected_rows > 2147483647 then
    raise exception using
      message =
        'DRV2S_ROW_CAPACITY_EXCEEDED: combined snapshot exceeds report_rows row_index capacity';
  end if;

  v_previous_ingestion_id :=
    v_report.current_ingestion_id;

  insert into public.report_ingestions (
    workspace_id,
    report_id,
    kind,
    status,
    csv_path,
    row_count,
    error,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_workspace_id,
    v_report_id,
    'api',
    'processing',
    null,
    0,
    null,
    v_created_by,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  )
  returning id
    into v_snapshot_ingestion_id;

  insert into public.daily_report_v2_snapshot_runs (
    workspace_id,
    advertiser_id,
    report_id,
    start_date,
    through_date,
    previous_ingestion_id,
    snapshot_ingestion_id,
    participant_contract,
    participant_count,
    expected_rows,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_workspace_id,
    v_advertiser_id,
    v_report_id,
    v_start_date,
    v_through_date,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_participant_contract,
    v_participant_count::integer,
    v_expected_rows::integer,
    'prepared',
    v_created_by,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  )
  returning id
    into v_run_id;

  if v_report.current_ingestion_id
       is distinct from v_previous_ingestion_id
  then
    raise exception using
      message =
        'DRV2S_POINTER_CONFLICT: report current pointer changed during prepare';
  end if;

  return query
  select
    v_run_id,
    v_report_id,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_start_date,
    v_through_date,
    v_participant_contract,
    v_participant_count::integer,
    v_expected_rows::integer,
    'prepared'::text,
    false;
end;
$function$;

alter function public.prepare_daily_report_v2_combined_snapshot(jsonb)
  owner to postgres;

revoke all
  on function public.prepare_daily_report_v2_combined_snapshot(jsonb)
  from public;

grant execute
  on function public.prepare_daily_report_v2_combined_snapshot(jsonb)
  to service_role;

commit;
