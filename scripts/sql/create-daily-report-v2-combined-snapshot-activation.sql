-- Etrylue Performance
-- Daily Report V2 provider-neutral coherent combined snapshot activation.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- Contract:
--   - activation authority: daily_report_v2_snapshot_runs
--   - only ready -> activated may move reports.current_ingestion_id
--   - exact retry of activated + current snapshot is idempotent
--   - reports.published_ingestion_id is preserved exactly
--   - compact canonical source_fingerprint is revalidated before pointer move
--   - candidate report_ingestion must already be success with exact row_count
--   - no media_sync_jobs/media_connections/report_projection ownership
--   - no connection last_sync ownership
--   - no full fact-row rescan

begin;

create or replace function
  public.activate_daily_report_v2_combined_snapshot(
    p_payload jsonb
  )
returns table(
  run_id uuid,
  report_id uuid,
  previous_ingestion_id uuid,
  snapshot_ingestion_id uuid,
  current_ingestion_id uuid,
  published_ingestion_id uuid,
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

  v_source_fingerprint text;

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
        'DRV2SA_INVALID_INPUT: activation payload is invalid';
  end if;

  begin
    v_run_id :=
      (p_payload->>'run_id')::uuid;
  exception
    when others then
      raise exception using
        message =
          'DRV2SA_INVALID_INPUT: run_id could not be parsed';
  end;

  /*
   * Discover report id without locking, then use the authoritative lock order:
   * REPORT FOR UPDATE -> RUN FOR UPDATE -> INGESTION FOR SHARE.
   */
  select r.report_id
    into v_report_id
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found then
    raise exception using
      message =
        'DRV2SA_RUN_NOT_FOUND: combined snapshot run was not found';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2SA_REPORT_NOT_FOUND: report was not found';
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
        'DRV2SA_RUN_CONFLICT: run identity changed before lock';
  end if;

  if v_run.status not in (
       'ready',
       'activated'
     )
  then
    raise exception using
      message =
        'DRV2SA_RUN_NOT_READY: combined snapshot run is not ready for activation';
  end if;

  if v_run.workspace_id <> v_report.workspace_id
     or v_run.advertiser_id
          is distinct from v_report.advertiser_id
     or v_run.created_by
          is distinct from v_report.created_by
  then
    raise exception using
      message =
        'DRV2SA_SCOPE_MISMATCH: run and report scope differ';
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
        'DRV2SA_INVALID_REPORT: report no longer matches Daily Report V2 contract';
  end if;

  if v_run.source_fingerprint is null
     or v_run.source_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      message =
        'DRV2SA_SOURCE_FINGERPRINT_MISSING: ready run lacks a valid source fingerprint';
  end if;

  /*
   * Exact pointer-state contract:
   *   ready     -> report must still point to previous ingestion
   *   activated -> report must already point to snapshot ingestion
   */
  if v_run.status = 'ready' then
    if v_report.current_ingestion_id
         is distinct from v_run.previous_ingestion_id
    then
      raise exception using
        message =
          'DRV2SA_ACTIVATION_CONFLICT: ready run no longer owns the report baseline pointer';
    end if;

    v_idempotent :=
      false;
  else
    if v_report.current_ingestion_id
         is distinct from v_run.snapshot_ingestion_id
    then
      raise exception using
        message =
          'DRV2SA_ACTIVATION_CONFLICT: activated run is not the report current snapshot';
    end if;

    v_idempotent :=
      true;
  end if;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  /*
   * Freeze the exact canonical partition generations through pointer CAS.
   *
   * Naver and Google replacement both acquire FOR UPDATE on the same
   * account/date partition row before replacing canonical fact rows.
   * Holding FOR SHARE here therefore blocks a concurrent generation change
   * until this activation transaction commits or rolls back.
   *
   * All participant/date partitions already exist for a ready run.
   * Missing rows still fail closed via the stored source_fingerprint check.
   */
  perform 1
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
    join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = p.provider
     and fp.external_account_id = btrim(p.external_account_id)
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
   order by
     fp.provider,
     fp.external_account_id,
     fp.date
   for share of fp;

  /*
   * Revalidate the compact durable canonical source generation.
   * This uses only frozen participant scopes + partition metadata.
   * It intentionally does not rescan media_sync_fact_rows.
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

  if v_source_fingerprint
       is distinct from v_run.source_fingerprint
  then
    raise exception using
      message =
        'DRV2SA_SOURCE_GENERATION_CHANGED: canonical partition generation changed before activation';
  end if;

  select ri.*
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_run.snapshot_ingestion_id
   for share;

  if not found then
    raise exception using
      message =
        'DRV2SA_INGESTION_NOT_FOUND: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_run.workspace_id
     or v_ingestion.report_id <> v_run.report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count
          is distinct from v_run.expected_rows
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by
          is distinct from v_run.created_by
  then
    raise exception using
      message =
        'DRV2SA_INGESTION_INVALID: snapshot ingestion is not activation-safe';
  end if;

  if not v_idempotent then
    /*
     * Atomic CAS:
     *   current = previous -> snapshot
     * published participates only as a preservation assertion.
     */
    update public.reports as r
       set current_ingestion_id =
             v_run.snapshot_ingestion_id
     where r.id = v_run.report_id
       and r.workspace_id = v_run.workspace_id
       and r.advertiser_id
             is not distinct from v_run.advertiser_id
       and r.current_ingestion_id
             is not distinct from v_run.previous_ingestion_id
       and r.published_ingestion_id
             is not distinct from v_published_ingestion_before;

    if not found then
      raise exception using
        message =
          'DRV2SA_ACTIVATION_CONFLICT: report pointer changed during activation';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set status = 'activated',
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'ready'
       and r.snapshot_ingestion_id =
             v_run.snapshot_ingestion_id
       and r.previous_ingestion_id
             is not distinct from v_run.previous_ingestion_id
       and r.source_fingerprint =
             v_run.source_fingerprint;

    if not found then
      raise exception using
        message =
          'DRV2SA_RUN_STATE_CONFLICT: ready run could not enter activated state';
    end if;

    v_run.status :=
      'activated';
  end if;

  /*
   * Exact postconditions.
   * Any failure raises inside this same transaction and rolls back pointer/run.
   */
  select r.*
    into v_report
    from public.reports as r
   where r.id = v_run.report_id;

  if not found
     or v_report.current_ingestion_id
          is distinct from v_run.snapshot_ingestion_id
     or v_report.published_ingestion_id
          is distinct from v_published_ingestion_before
  then
    raise exception using
      message =
        'DRV2SA_POSTCONDITION_FAILED: report pointers violate activation contract';
  end if;

  select r.*
    into v_run
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found
     or v_run.status <> 'activated'
     or v_run.source_fingerprint
          is distinct from v_source_fingerprint
  then
    raise exception using
      message =
        'DRV2SA_POSTCONDITION_FAILED: run state violates activation contract';
  end if;

  if v_ingestion.status <> 'success'
     or v_ingestion.row_count
          is distinct from v_run.expected_rows
  then
    raise exception using
      message =
        'DRV2SA_POSTCONDITION_FAILED: ingestion state violates activation contract';
  end if;

  return query
  select
    v_run.id,
    v_run.report_id,
    v_run.previous_ingestion_id,
    v_run.snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_ingestion.row_count::bigint,
    v_source_fingerprint,
    v_run.status,
    v_idempotent;
end;
$function$;

alter function
  public.activate_daily_report_v2_combined_snapshot(jsonb)
  owner to postgres;

revoke all
  on function
    public.activate_daily_report_v2_combined_snapshot(jsonb)
  from public;

revoke all
  on function
    public.activate_daily_report_v2_combined_snapshot(jsonb)
  from anon;

revoke all
  on function
    public.activate_daily_report_v2_combined_snapshot(jsonb)
  from authenticated;

grant execute
  on function
    public.activate_daily_report_v2_combined_snapshot(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
