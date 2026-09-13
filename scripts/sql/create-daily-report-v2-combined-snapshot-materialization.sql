-- Etrylue Performance
-- Daily Report V2 provider-neutral coherent combined snapshot materialization.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- Contract:
--   - durable run authority: daily_report_v2_snapshot_runs
--   - frozen participant scope: participant_contract
--   - durable source coverage: media_sync_fact_partitions
--   - source rows: media_sync_fact_rows
--   - deterministic combined order:
--       (date, provider, external_account_id, row_key)
--   - bounded checkpoint: report_ingestions.row_count
--   - materialize/complete never move current/published report pointers
--   - materialize/complete never own provider job or connection freshness
--   - partition-generation fingerprint prevents a multi-batch snapshot from
--     silently mixing canonical fact generations
--   - zero-row combined snapshots skip batch insertion and complete directly

begin;

alter table public.daily_report_v2_snapshot_runs
  add column if not exists source_fingerprint text null;

do $block$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint as c
     where c.conrelid =
             'public.daily_report_v2_snapshot_runs'::regclass
       and c.conname =
             'daily_report_v2_snapshot_runs_source_fingerprint_chk'
  ) then
    alter table public.daily_report_v2_snapshot_runs
      add constraint
        daily_report_v2_snapshot_runs_source_fingerprint_chk
      check (
        source_fingerprint is null
        or source_fingerprint ~ '^[0-9a-f]{64}$'
      );
  end if;
end;
$block$;

create or replace function
  public.materialize_daily_report_v2_combined_snapshot_batch(
    p_payload jsonb
  )
returns table(
  run_id uuid,
  report_id uuid,
  snapshot_ingestion_id uuid,
  expected_rows bigint,
  batch_start bigint,
  batch_end_exclusive bigint,
  expected_batch_rows bigint,
  inserted_rows bigint,
  materialized_batch_rows bigint,
  next_row_index bigint,
  complete boolean,
  status text,
  idempotent boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
set statement_timeout to '2min'
as $function$
#variable_conflict use_column
declare
  v_run public.daily_report_v2_snapshot_runs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_run_id uuid;
  v_report_id uuid;

  v_batch_start bigint;
  v_batch_size bigint;
  v_batch_end_exclusive bigint;
  v_expected_batch_rows bigint;

  v_expected_dates bigint;

  v_participant_rows bigint;
  v_distinct_fact_scopes bigint;
  v_invalid_participants bigint;
  v_participant_expected_rows bigint;
  v_bad_coverage bigint;

  v_source_fingerprint text;

  v_checkpoint_before bigint;
  v_source_batch_rows bigint;
  v_inserted_rows bigint := 0;
  v_materialized_batch_rows bigint;
  v_batch_mismatch_rows bigint;
  v_next_row_index bigint;
  v_complete boolean;
  v_idempotent boolean := false;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'run_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'batch_start', '') !~
       '^[0-9]+$'
     or coalesce(p_payload->>'batch_size', '') !~
       '^[0-9]+$'
  then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: materialization values are invalid';
  end if;

  begin
    v_run_id :=
      (p_payload->>'run_id')::uuid;

    v_batch_start :=
      (p_payload->>'batch_start')::bigint;

    v_batch_size :=
      (p_payload->>'batch_size')::bigint;
  exception
    when others then
      raise exception using
        message =
          'DRV2SM_INVALID_INPUT: materialization values could not be parsed';
  end;

  if v_batch_start < 0
     or v_batch_size <= 0
     or v_batch_size > 5000
  then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: materialization batch range is invalid';
  end if;

  /*
   * Read the report id without locking, then lock REPORT -> RUN -> INGESTION.
   * This matches prepare's report-first authority and avoids run/report
   * lock-order inversion.
   */
  select r.report_id
    into v_report_id
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found then
    raise exception using
      message =
        'DRV2SM_RUN_NOT_FOUND: combined snapshot run was not found';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message =
        'DRV2SM_REPORT_NOT_FOUND: report was not found';
  end if;

  select r.*
    into v_run
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id
   for update;

  if not found
     or v_run.report_id <> v_report_id
  then
    raise exception using
      message =
        'DRV2SM_RUN_CONFLICT: run identity changed before lock';
  end if;

  if v_run.status not in (
       'prepared',
       'materializing',
       'ready'
     )
  then
    raise exception using
      message =
        'DRV2SM_RUN_NOT_MATERIALIZABLE: run is not materializable';
  end if;

  if v_run.workspace_id <> v_report.workspace_id
     or v_run.advertiser_id
          is distinct from v_report.advertiser_id
     or v_run.created_by
          is distinct from v_report.created_by
  then
    raise exception using
      message =
        'DRV2SM_SCOPE_MISMATCH: run and report scope differ';
  end if;

  if v_report.status not in ('draft', 'ready')
     or v_report.meta #>> '{data_source,kind}' <> 'api'
     or v_report.meta #>> '{public_identity,source_type}' <> 'api'
     or v_report.meta #>> '{public_identity,period_type}' <>
          'daily_sync'
     or v_report.meta #>> '{public_identity,period_key}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,enabled}' <>
          'true'
     or v_report.meta #>> '{media_sync,auto_sync,contract}' <>
          'daily_report_v2'
     or v_report.meta #>> '{media_sync,auto_sync,start_date}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,scope}' <>
          'all_mapped_supported_media'
     or v_report.period_start is not null
     or v_report.period_end is not null
     or v_report.draft_period_start is not null
     or v_report.draft_period_end is not null
  then
    raise exception using
      message =
        'DRV2SM_INVALID_REPORT: report no longer matches Daily Report V2 contract';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_run.previous_ingestion_id
  then
    raise exception using
      message =
        'DRV2SM_POINTER_CONFLICT: current ingestion changed after prepare';
  end if;

  if v_run.expected_rows <= 0 then
    raise exception using
      message =
        'DRV2SM_ZERO_ROW_RUN: zero-row run must complete without batch materialization';
  end if;

  if v_batch_start >= v_run.expected_rows then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: batch_start exceeds combined snapshot range';
  end if;

  v_batch_end_exclusive :=
    least(
      v_batch_start + v_batch_size,
      v_run.expected_rows::bigint
    );

  v_expected_batch_rows :=
    v_batch_end_exclusive - v_batch_start;

  /*
   * Validate frozen participant contract.
   */
  with participants as (
    select
      p.connection_id,
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  )
  select
    count(*)::bigint,
    count(
      distinct (
        provider,
        external_account_id
      )
    )::bigint,
    count(*) filter (
      where connection_id is null
         or provider not in (
              'naver_searchad',
              'google_ads'
            )
         or external_account_id is null
         or external_account_id = ''
         or expected_rows is null
         or expected_rows < 0
    )::bigint,
    coalesce(sum(expected_rows), 0)::bigint
    into
      v_participant_rows,
      v_distinct_fact_scopes,
      v_invalid_participants,
      v_participant_expected_rows
    from participants;

  if v_participant_rows <>
       v_run.participant_count::bigint
     or v_distinct_fact_scopes <>
          v_participant_rows
     or v_invalid_participants <> 0
     or v_participant_expected_rows <>
          v_run.expected_rows::bigint
  then
    raise exception using
      message =
        'DRV2SM_PARTICIPANT_CONTRACT_CONFLICT: frozen participant contract is invalid';
  end if;

  v_expected_dates :=
    (v_run.through_date - v_run.start_date)::bigint + 1;

  /*
   * Every frozen participant must still own every durable date partition and
   * the same participant-level row cardinality captured at prepare.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  coverage as (
    select
      pc.provider,
      pc.external_account_id,
      pc.expected_rows,
      count(fp.date)::bigint as covered_dates,
      coalesce(sum(fp.row_count), 0)::bigint as partition_rows
    from participants as pc
    left join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
    group by
      pc.provider,
      pc.external_account_id,
      pc.expected_rows
  )
  select count(*)::bigint
    into v_bad_coverage
    from coverage
   where covered_dates <> v_expected_dates
      or partition_rows <> expected_rows;

  if v_bad_coverage <> 0 then
    raise exception using
      message =
        'DRV2SM_FACT_COVERAGE_CHANGED: durable partition coverage changed after prepare';
  end if;

  /*
   * Freeze/verify exact partition generation. This is intentionally based on
   * compact partition metadata, not the full fact JSON payload.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  scoped_partitions as (
    select
      fp.provider,
      fp.external_account_id,
      fp.date,
      fp.source_job_id,
      fp.source_job_created_at,
      fp.row_count
    from participants as pc
    join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
  )
  select
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              jsonb_build_array(
                provider,
                external_account_id,
                date::text,
                source_job_id::text,
                extract(
                  epoch from source_job_created_at
                )::text,
                row_count
              )::text,
              E'\n'
              order by
                date,
                provider,
                external_account_id,
                source_job_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_source_fingerprint
    from scoped_partitions;

  if v_run.source_fingerprint is null then
    if v_run.status <> 'prepared' then
      raise exception using
        message =
          'DRV2SM_SOURCE_FINGERPRINT_CONFLICT: non-prepared run lacks source fingerprint';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set source_fingerprint = v_source_fingerprint,
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'prepared'
       and r.source_fingerprint is null;

    if not found then
      raise exception using
        message =
          'DRV2SM_SOURCE_FINGERPRINT_CONFLICT: source fingerprint could not be frozen';
    end if;

    v_run.source_fingerprint :=
      v_source_fingerprint;
  elsif v_run.source_fingerprint
          is distinct from v_source_fingerprint
  then
    raise exception using
      message =
        'DRV2SM_SOURCE_GENERATION_CHANGED: canonical partition generation changed during snapshot build';
  end if;

  select ri.*
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_run.snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2SM_INGESTION_NOT_FOUND: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_run.workspace_id
     or v_ingestion.report_id <> v_run.report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in (
          'processing',
          'success'
        )
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by
          is distinct from v_run.created_by
     or v_ingestion.row_count is null
     or v_ingestion.row_count < 0
     or v_ingestion.row_count >
          v_run.expected_rows
  then
    raise exception using
      message =
        'DRV2SM_INGESTION_CONFLICT: snapshot ingestion is invalid';
  end if;

  if v_run.status = 'ready'
     and (
       v_ingestion.status <> 'success'
       or v_ingestion.row_count
            is distinct from v_run.expected_rows
     )
  then
    raise exception using
      message =
        'DRV2SM_READY_CONFLICT: ready run does not own a successful ingestion';
  end if;

  if v_run.status in (
       'prepared',
       'materializing'
     )
     and v_ingestion.status <> 'processing'
  then
    raise exception using
      message =
        'DRV2SM_PROCESSING_CONFLICT: open run ingestion is not processing';
  end if;

  v_checkpoint_before :=
    v_ingestion.row_count::bigint;

  if v_run.status = 'prepared'
     and v_checkpoint_before <> 0
  then
    raise exception using
      message =
        'DRV2SM_CHECKPOINT_CONFLICT: prepared run has a nonzero checkpoint';
  end if;

  if v_batch_start > v_checkpoint_before then
    raise exception using
      message =
        'DRV2SM_CHECKPOINT_CONFLICT: batch start skips the ingestion checkpoint';
  end if;

  if v_checkpoint_before > v_batch_start
     and v_checkpoint_before < v_batch_end_exclusive
  then
    raise exception using
      message =
        'DRV2SM_CHECKPOINT_CONFLICT: checkpoint falls inside requested batch';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  /*
   * Prove the exact bounded canonical source slice exists.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  bounded_source as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.provider,
      f.external_account_id,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from participants as pc
    join public.media_sync_fact_rows as f
      on f.workspace_id = v_run.workspace_id
     and f.advertiser_id = v_run.advertiser_id
     and f.provider = pc.provider
     and f.external_account_id = pc.external_account_id
     and f.date >= v_run.start_date
     and f.date <= v_run.through_date
    order by
      f.date,
      f.provider,
      f.external_account_id,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  )
  select count(*)::bigint
    into v_source_batch_rows
    from bounded_source;

  if v_source_batch_rows <>
       v_expected_batch_rows
  then
    raise exception using
      message =
        'DRV2SM_FACT_SOURCE_INCOMPLETE: bounded canonical source is incomplete';
  end if;

  /*
   * New range: insert exact rows and then atomically advance checkpoint.
   * Already-checkpointed range: verify only.
   */
  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    with participants as (
      select
        p.provider,
        btrim(p.external_account_id) as external_account_id
      from jsonb_to_recordset(v_run.participant_contract)
        as p(
          connection_id uuid,
          provider text,
          external_account_id text,
          expected_rows bigint
        )
    ),
    bounded_source_base as materialized (
      select
        f.workspace_id,
        f.advertiser_id,
        f.date,
        f.provider,
        f.external_account_id,
        f.channel,
        f.device,
        f.source,
        f.row,
        f.row_key
      from participants as pc
      join public.media_sync_fact_rows as f
        on f.workspace_id = v_run.workspace_id
       and f.advertiser_id = v_run.advertiser_id
       and f.provider = pc.provider
       and f.external_account_id = pc.external_account_id
       and f.date >= v_run.start_date
       and f.date <= v_run.through_date
      order by
        f.date,
        f.provider,
        f.external_account_id,
        f.row_key
      offset v_batch_start
      limit v_expected_batch_rows
    ),
    bounded_source as materialized (
      select
        b.workspace_id,
        b.advertiser_id,
        b.date,
        b.channel,
        b.device,
        b.source,
        b.row,
        (
          v_batch_start +
          row_number() over (
            order by
              b.date,
              b.provider,
              b.external_account_id,
              b.row_key
          ) - 1
        )::integer as row_index
      from bounded_source_base as b
    )
    insert into public.report_rows (
      workspace_id,
      report_id,
      advertiser_id,
      row_index,
      row,
      date,
      channel,
      device,
      source,
      ingestion_id
    )
    select
      s.workspace_id,
      v_run.report_id,
      s.advertiser_id,
      s.row_index,
      s.row,
      s.date,
      s.channel,
      s.device,
      s.source,
      v_run.snapshot_ingestion_id
    from bounded_source as s
    order by s.row_index
    on conflict (
      report_id,
      ingestion_id,
      row_index
    )
    where ingestion_id is not null
    do nothing;

    get diagnostics
      v_inserted_rows = row_count;
  else
    v_inserted_rows := 0;
  end if;

  /*
   * Exact bounded destination verification.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  bounded_source_base as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.provider,
      f.external_account_id,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from participants as pc
    join public.media_sync_fact_rows as f
      on f.workspace_id = v_run.workspace_id
     and f.advertiser_id = v_run.advertiser_id
     and f.provider = pc.provider
     and f.external_account_id = pc.external_account_id
     and f.date >= v_run.start_date
     and f.date <= v_run.through_date
    order by
      f.date,
      f.provider,
      f.external_account_id,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  ),
  bounded_source as materialized (
    select
      b.workspace_id,
      b.advertiser_id,
      b.date,
      b.channel,
      b.device,
      b.source,
      b.row,
      (
        v_batch_start +
        row_number() over (
          order by
            b.date,
            b.provider,
            b.external_account_id,
            b.row_key
        ) - 1
      )::integer as row_index
    from bounded_source_base as b
  )
  select
    count(rr.id)::bigint,
    count(*) filter (
      where rr.id is null
         or rr.workspace_id <> s.workspace_id
         or rr.report_id <> v_run.report_id
         or rr.advertiser_id
              is distinct from s.advertiser_id
         or rr.ingestion_id
              is distinct from v_run.snapshot_ingestion_id
         or rr.row_index <> s.row_index
         or rr.row is distinct from s.row
         or rr.date is distinct from s.date
         or rr.channel is distinct from s.channel
         or rr.device is distinct from s.device
         or rr.source is distinct from s.source
    )::bigint
    into
      v_materialized_batch_rows,
      v_batch_mismatch_rows
    from bounded_source as s
    left join public.report_rows as rr
      on rr.report_id = v_run.report_id
     and rr.ingestion_id = v_run.snapshot_ingestion_id
     and rr.row_index = s.row_index;

  if v_materialized_batch_rows <>
       v_expected_batch_rows
     or v_batch_mismatch_rows <> 0
  then
    raise exception using
      message =
        'DRV2SM_MATERIALIZATION_CONFLICT: report_rows batch differs from frozen canonical facts';
  end if;

  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    update public.report_ingestions as ri
       set row_count =
             v_batch_end_exclusive::integer,
           updated_at =
             pg_catalog.clock_timestamp()
     where ri.id = v_run.snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count =
             v_batch_start::integer
       and ri.error is null;

    if not found then
      raise exception using
        message =
          'DRV2SM_CHECKPOINT_CONFLICT: processing checkpoint could not be advanced';
    end if;

    v_next_row_index :=
      v_batch_end_exclusive;

    v_idempotent :=
      false;
  else
    v_next_row_index :=
      v_checkpoint_before;

    v_idempotent :=
      true;
  end if;

  if v_run.status = 'prepared' then
    update public.daily_report_v2_snapshot_runs as r
       set status = 'materializing',
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'prepared'
       and r.source_fingerprint =
             v_source_fingerprint;

    if not found then
      raise exception using
        message =
          'DRV2SM_RUN_STATE_CONFLICT: prepared run could not enter materializing';
    end if;

    v_run.status :=
      'materializing';
  end if;

  v_complete :=
    v_next_row_index >=
      v_run.expected_rows::bigint;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_run.report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message =
        'DRV2SM_POINTER_CHANGED: report pointers changed during materialization';
  end if;

  return query
  select
    v_run.id,
    v_run.report_id,
    v_run.snapshot_ingestion_id,
    v_run.expected_rows::bigint,
    v_batch_start,
    v_batch_end_exclusive,
    v_expected_batch_rows,
    v_inserted_rows,
    v_materialized_batch_rows,
    v_next_row_index,
    v_complete,
    v_run.status,
    v_idempotent;
end;
$function$;

alter function
  public.materialize_daily_report_v2_combined_snapshot_batch(jsonb)
  owner to postgres;

revoke all
  on function
    public.materialize_daily_report_v2_combined_snapshot_batch(jsonb)
  from public;

revoke all
  on function
    public.materialize_daily_report_v2_combined_snapshot_batch(jsonb)
  from anon;

revoke all
  on function
    public.materialize_daily_report_v2_combined_snapshot_batch(jsonb)
  from authenticated;

grant execute
  on function
    public.materialize_daily_report_v2_combined_snapshot_batch(jsonb)
  to service_role;


create or replace function
  public.complete_daily_report_v2_combined_snapshot(
    p_payload jsonb
  )
returns table(
  run_id uuid,
  report_id uuid,
  snapshot_ingestion_id uuid,
  row_count bigint,
  source_fingerprint text,
  status text,
  idempotent boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
#variable_conflict use_column
declare
  v_run public.daily_report_v2_snapshot_runs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_run_id uuid;
  v_report_id uuid;

  v_expected_dates bigint;

  v_participant_rows bigint;
  v_distinct_fact_scopes bigint;
  v_invalid_participants bigint;
  v_participant_expected_rows bigint;
  v_bad_coverage bigint;

  v_source_fingerprint text;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or coalesce(p_payload->>'run_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message =
        'DRV2SC_INVALID_INPUT: completion payload is invalid';
  end if;

  begin
    v_run_id :=
      (p_payload->>'run_id')::uuid;
  exception
    when others then
      raise exception using
        message =
          'DRV2SC_INVALID_INPUT: run_id could not be parsed';
  end;

  select r.report_id
    into v_report_id
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found then
    raise exception using
      message =
        'DRV2SC_RUN_NOT_FOUND: combined snapshot run was not found';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message =
        'DRV2SC_REPORT_NOT_FOUND: report was not found';
  end if;

  select r.*
    into v_run
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id
   for update;

  if not found
     or v_run.report_id <> v_report_id
  then
    raise exception using
      message =
        'DRV2SC_RUN_CONFLICT: run identity changed before lock';
  end if;

  if v_run.status not in (
       'prepared',
       'materializing',
       'ready'
     )
  then
    raise exception using
      message =
        'DRV2SC_RUN_NOT_COMPLETABLE: run is not completable';
  end if;

  if v_run.workspace_id <> v_report.workspace_id
     or v_run.advertiser_id
          is distinct from v_report.advertiser_id
     or v_run.created_by
          is distinct from v_report.created_by
  then
    raise exception using
      message =
        'DRV2SC_SCOPE_MISMATCH: run and report scope differ';
  end if;

  if v_report.status not in ('draft', 'ready')
     or v_report.meta #>> '{data_source,kind}' <> 'api'
     or v_report.meta #>> '{public_identity,source_type}' <> 'api'
     or v_report.meta #>> '{public_identity,period_type}' <>
          'daily_sync'
     or v_report.meta #>> '{public_identity,period_key}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,enabled}' <>
          'true'
     or v_report.meta #>> '{media_sync,auto_sync,contract}' <>
          'daily_report_v2'
     or v_report.meta #>> '{media_sync,auto_sync,start_date}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,scope}' <>
          'all_mapped_supported_media'
     or v_report.period_start is not null
     or v_report.period_end is not null
     or v_report.draft_period_start is not null
     or v_report.draft_period_end is not null
  then
    raise exception using
      message =
        'DRV2SC_INVALID_REPORT: report no longer matches Daily Report V2 contract';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_run.previous_ingestion_id
  then
    raise exception using
      message =
        'DRV2SC_POINTER_CONFLICT: current ingestion changed after prepare';
  end if;

  with participants as (
    select
      p.connection_id,
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  )
  select
    count(*)::bigint,
    count(
      distinct (
        provider,
        external_account_id
      )
    )::bigint,
    count(*) filter (
      where connection_id is null
         or provider not in (
              'naver_searchad',
              'google_ads'
            )
         or external_account_id is null
         or external_account_id = ''
         or expected_rows is null
         or expected_rows < 0
    )::bigint,
    coalesce(sum(expected_rows), 0)::bigint
    into
      v_participant_rows,
      v_distinct_fact_scopes,
      v_invalid_participants,
      v_participant_expected_rows
    from participants;

  if v_participant_rows <>
       v_run.participant_count::bigint
     or v_distinct_fact_scopes <>
          v_participant_rows
     or v_invalid_participants <> 0
     or v_participant_expected_rows <>
          v_run.expected_rows::bigint
  then
    raise exception using
      message =
        'DRV2SC_PARTICIPANT_CONTRACT_CONFLICT: frozen participant contract is invalid';
  end if;

  v_expected_dates :=
    (v_run.through_date - v_run.start_date)::bigint + 1;

  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  coverage as (
    select
      pc.provider,
      pc.external_account_id,
      pc.expected_rows,
      count(fp.date)::bigint as covered_dates,
      coalesce(sum(fp.row_count), 0)::bigint as partition_rows
    from participants as pc
    left join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
    group by
      pc.provider,
      pc.external_account_id,
      pc.expected_rows
  )
  select count(*)::bigint
    into v_bad_coverage
    from coverage
   where covered_dates <> v_expected_dates
      or partition_rows <> expected_rows;

  if v_bad_coverage <> 0 then
    raise exception using
      message =
        'DRV2SC_FACT_COVERAGE_CHANGED: durable partition coverage changed before completion';
  end if;

  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  scoped_partitions as (
    select
      fp.provider,
      fp.external_account_id,
      fp.date,
      fp.source_job_id,
      fp.source_job_created_at,
      fp.row_count
    from participants as pc
    join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
  )
  select
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              jsonb_build_array(
                provider,
                external_account_id,
                date::text,
                source_job_id::text,
                extract(
                  epoch from source_job_created_at
                )::text,
                row_count
              )::text,
              E'\n'
              order by
                date,
                provider,
                external_account_id,
                source_job_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_source_fingerprint
    from scoped_partitions;

  if v_run.source_fingerprint is null then
    if v_run.expected_rows <> 0
       or v_run.status <> 'prepared'
    then
      raise exception using
        message =
          'DRV2SC_SOURCE_FINGERPRINT_CONFLICT: nonzero/open run was never materialized';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set source_fingerprint = v_source_fingerprint,
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'prepared'
       and r.expected_rows = 0
       and r.source_fingerprint is null;

    if not found then
      raise exception using
        message =
          'DRV2SC_SOURCE_FINGERPRINT_CONFLICT: zero-row source fingerprint could not be frozen';
    end if;

    v_run.source_fingerprint :=
      v_source_fingerprint;
  elsif v_run.source_fingerprint
          is distinct from v_source_fingerprint
  then
    raise exception using
      message =
        'DRV2SC_SOURCE_GENERATION_CHANGED: canonical partition generation changed before completion';
  end if;

  select ri.*
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_run.snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2SC_INGESTION_NOT_FOUND: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_run.workspace_id
     or v_ingestion.report_id <> v_run.report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in (
          'processing',
          'success'
        )
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by
          is distinct from v_run.created_by
     or v_ingestion.row_count
          is distinct from v_run.expected_rows
  then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_INCOMPLETE: ingestion checkpoint is incomplete';
  end if;

  if v_run.expected_rows > 0
     and v_run.status = 'prepared'
  then
    raise exception using
      message =
        'DRV2SC_RUN_NOT_MATERIALIZED: nonzero run never entered materializing';
  end if;

  if v_run.status = 'ready'
     and v_ingestion.status <> 'success'
  then
    raise exception using
      message =
        'DRV2SC_READY_CONFLICT: ready run does not own a successful ingestion';
  end if;

  if v_run.status in (
       'prepared',
       'materializing'
     )
     and v_ingestion.status <> 'processing'
  then
    raise exception using
      message =
        'DRV2SC_PROCESSING_CONFLICT: open run ingestion is not processing';
  end if;

  /*
   * Partition row_count is compact durable authority, but completion still
   * needs one bounded witness that the canonical fact source has no row beyond
   * expected_rows. This closes both:
   *   - N expected partition rows but N+1 canonical fact rows
   *   - authoritative zero-row partition with an impossible hidden fact row
   *
   * OFFSET expected_rows + LIMIT 1 is bounded and avoids a full fact rescan.
   */
  if exists (
    with participants as (
      select
        p.provider,
        btrim(p.external_account_id) as external_account_id
      from jsonb_to_recordset(v_run.participant_contract)
        as p(
          connection_id uuid,
          provider text,
          external_account_id text,
          expected_rows bigint
        )
    )
    select 1
      from participants as pc
      join public.media_sync_fact_rows as f
        on f.workspace_id = v_run.workspace_id
       and f.advertiser_id = v_run.advertiser_id
       and f.provider = pc.provider
       and f.external_account_id = pc.external_account_id
       and f.date >= v_run.start_date
       and f.date <= v_run.through_date
     order by
       f.date,
       f.provider,
       f.external_account_id,
       f.row_key
     offset v_run.expected_rows
     limit 1
  ) then
    raise exception using
      message =
        'DRV2SC_FACT_SOURCE_EXTRA_ROWS: canonical fact source exceeds frozen expected_rows';
  end if;

  /*
   * Sequential exact batch verification + atomic row_count checkpoint proves
   * every expected destination range was committed. Only bounded indexed
   * witnesses are used here; no full fresh report_rows rescan.
   */
  if exists (
    select 1
      from public.report_rows as rr
     where rr.report_id = v_run.report_id
       and rr.ingestion_id = v_run.snapshot_ingestion_id
       and (
         rr.row_index < 0
         or rr.row_index >= v_run.expected_rows
       )
     limit 1
  ) then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_CONFLICT: snapshot contains out-of-range report_rows';
  end if;

  if v_run.expected_rows = 0
     and exists (
       select 1
         from public.report_rows as rr
        where rr.report_id = v_run.report_id
          and rr.ingestion_id = v_run.snapshot_ingestion_id
        limit 1
     )
  then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_CONFLICT: zero-row snapshot contains report_rows';
  end if;

  if v_run.expected_rows > 0
     and (
       not exists (
         select 1
           from public.report_rows as rr
          where rr.report_id = v_run.report_id
            and rr.ingestion_id = v_run.snapshot_ingestion_id
            and rr.row_index = 0
       )
       or not exists (
         select 1
           from public.report_rows as rr
          where rr.report_id = v_run.report_id
            and rr.ingestion_id = v_run.snapshot_ingestion_id
            and rr.row_index =
                  v_run.expected_rows - 1
       )
     )
  then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_CONFLICT: snapshot endpoint witnesses are missing';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  if v_run.status = 'ready' then
    v_idempotent :=
      true;
  else
    update public.report_ingestions as ri
       set status = 'success',
           row_count = v_run.expected_rows,
           error = null,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_run.snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count = v_run.expected_rows
       and ri.error is null;

    if not found then
      raise exception using
        message =
          'DRV2SC_COMPLETION_CONFLICT: snapshot ingestion could not be completed';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set status = 'ready',
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status in (
         'prepared',
         'materializing'
       )
       and r.source_fingerprint =
             v_source_fingerprint;

    if not found then
      raise exception using
        message =
          'DRV2SC_COMPLETION_CONFLICT: snapshot run could not enter ready state';
    end if;

    v_run.status :=
      'ready';

    v_idempotent :=
      false;
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_run.report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message =
        'DRV2SC_POINTER_CHANGED: report pointers changed during completion';
  end if;

  return query
  select
    v_run.id,
    v_run.report_id,
    v_run.snapshot_ingestion_id,
    v_run.expected_rows::bigint,
    v_source_fingerprint,
    v_run.status,
    v_idempotent;
end;
$function$;

alter function
  public.complete_daily_report_v2_combined_snapshot(jsonb)
  owner to postgres;

revoke all
  on function
    public.complete_daily_report_v2_combined_snapshot(jsonb)
  from public;

revoke all
  on function
    public.complete_daily_report_v2_combined_snapshot(jsonb)
  from anon;

revoke all
  on function
    public.complete_daily_report_v2_combined_snapshot(jsonb)
  from authenticated;

grant execute
  on function
    public.complete_daily_report_v2_combined_snapshot(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
