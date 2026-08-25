CREATE OR REPLACE FUNCTION public.prepare_media_sync_snapshot_materialization(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, expected_rows bigint, next_row_index bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_connection public.media_connections%rowtype;
  v_ingestion public.report_ingestions%rowtype;
  v_projection public.media_sync_report_projections%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;
  v_expected_rows bigint;

  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_next_row_index bigint;

  v_is_primary_projection boolean;

  v_total_rows bigint;
  v_distinct_row_indexes bigint;
  v_rows_in_expected_range bigint;
  v_scope_mismatch_rows bigint;
  v_blank_row_key_rows bigint;
  v_missing_fingerprint_rows bigint;
  v_canonical_mismatch_rows bigint;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_oversized_row_index_rows bigint;


  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id :=
      (p_payload->>'job_id')::uuid;

    v_report_id :=
      (p_payload->>'report_id')::uuid;

    v_workspace_id :=
      (p_payload->>'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload->>'advertiser_id')::uuid;

    v_connection_id :=
      (p_payload->>'connection_id')::uuid;

    v_provider :=
      btrim(p_payload->>'provider');

    v_external_account_id :=
      btrim(p_payload->>'external_account_id');

    v_date_from :=
      (p_payload->>'date_from')::date;

    v_date_to :=
      (p_payload->>'date_to')::date;

    v_expected_rows :=
      (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSMM_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0 then
    raise exception using
      message = 'MSMM_INVALID_INPUT: payload values are invalid';
  end if;

  if v_expected_rows = 0 then
    raise exception using
      message = 'MSMM_EMPTY_STAGING: zero-row snapshots are not materialized';
  end if;

  if v_expected_rows > 2147483647 then
    raise exception using
      message = 'MSMM_INVALID_INPUT: expected_rows exceeds report_rows row_index capacity';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSMM_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using
      message = 'MSMM_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
     or v_job.mode <> 'snapshot_replace' then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: execution scope does not match the request';
  end if;

  /*
   * Macro 3-A1 compatibility rule.
   *
   * job.report_id remains a legacy primary-projection mirror only.
   * It no longer decides which report may consume this execution's canonical
   * staging dataset.
   */
  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_STAGING_INCOMPLETE: processing checkpoint counts do not match staging';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  if v_is_primary_projection
     and v_report.current_ingestion_id
           is distinct from v_job.previous_ingestion_id then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: primary report current pointer no longer matches the job compatibility baseline';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> v_provider
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active' then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: connection scope does not match the job';
  end if;

  select
    count(*)::bigint,
    count(distinct s.row_index)::bigint,

    count(*) filter (
      where s.row_index >= 0
        and s.row_index < v_expected_rows
    )::bigint,

    count(*) filter (
      where s.report_id <> v_job.report_id
         or s.workspace_id <> v_workspace_id
         or s.advertiser_id <> v_advertiser_id
         or s.connection_id <> v_connection_id
         or s.provider <> v_provider
         or s.external_account_id <> v_external_account_id
         or s.date_from <> v_date_from
         or s.date_to <> v_date_to
         or s.date < v_date_from
         or s.date > v_date_to
    )::bigint,

    count(*) filter (
      where btrim(s.row_key) = ''
    )::bigint,

    count(*) filter (
      where s.row_fingerprint is null
         or s.row_fingerprint !~ '^[0-9a-f]{64}$'
    )::bigint,

    count(*) filter (
      where case
        when v_provider = 'naver_searchad' then false
        else (
          jsonb_typeof(s.row) <> 'object'
          or coalesce(s.row->>'date', '') <> s.date::text
          or coalesce(s.row->>'report_date', '') <> s.date::text
          or coalesce(s.row->>'day', '') <> s.date::text
          or coalesce(s.row->>'ymd', '') <> s.date::text
          or coalesce(s.row->>'channel', '') <> coalesce(s.channel, '')
          or coalesce(s.row->>'device', '') <> coalesce(s.device, '')
          or coalesce(s.row->>'source', '') <> coalesce(s.source, '')
          or coalesce(s.row->>'provider', '') <> v_provider
          or coalesce(s.row->>'external_account_id', '') <> v_external_account_id
          or coalesce(s.row->>'ingestion_source', '') <> 'api'
          or encode(
               extensions.digest(
                 pg_catalog.convert_to(s.row::text, 'UTF8'),
                 'sha256'
               ),
               'hex'
             ) <> s.row_fingerprint
        )
      end
    )::bigint,

    min(s.row_index),
    max(s.row_index),

    count(*) filter (
      where s.row_index > 2147483647
    )::bigint
  into
    v_total_rows,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_canonical_mismatch_rows,
    v_min_row_index,
    v_max_row_index,
    v_oversized_row_index_rows
  from public.media_sync_staging_rows as s
  where s.job_id = v_job_id;

  if v_total_rows <> v_expected_rows
     or v_distinct_row_indexes <> v_expected_rows
     or v_rows_in_expected_range <> v_expected_rows
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_missing_fingerprint_rows <> 0
     or v_canonical_mismatch_rows <> 0
     or v_min_row_index <> 0
     or v_max_row_index <> v_expected_rows - 1
     or v_oversized_row_index_rows <> 0 then
    raise exception using
      message = 'MSMM_STAGING_INCOMPLETE: staging completeness verification failed';
  end if;

  /*
   * Macro 3-A1 projection-first materialization ownership.
   *
   * - (job_id, report_id) identifies the target projection.
   * - an existing projection owns previous/snapshot ingestion identity.
   * - a new projection takes its previous pointer from the target report and
   *   allocates its own snapshot ingestion.
   * - job previous/snapshot columns remain fail-closed compatibility mirrors
   *   only for the legacy primary projection (job.report_id).
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for update;

  if found then
    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.created_by
            is distinct from v_job.created_by then
      raise exception using
        message = 'MSMM_PROJECTION_CONFLICT: existing report projection scope is invalid';
    end if;

    v_previous_ingestion_id :=
      v_projection.previous_ingestion_id;

    v_snapshot_ingestion_id :=
      v_projection.snapshot_ingestion_id;

    if v_report.current_ingestion_id
         is distinct from v_previous_ingestion_id then
      raise exception using
        message = 'MSMM_POINTER_CHANGED: target report current pointer no longer matches the projection baseline';
    end if;

    if v_is_primary_projection
       and (
         v_projection.previous_ingestion_id
           is distinct from v_job.previous_ingestion_id
         or v_projection.snapshot_ingestion_id
           is distinct from v_job.snapshot_ingestion_id
       ) then
      raise exception using
        message = 'MSMM_PROJECTION_CONFLICT: primary projection no longer matches job compatibility mirrors';
    end if;
  else
    v_previous_ingestion_id :=
      v_report.current_ingestion_id;

    if v_is_primary_projection
       and v_previous_ingestion_id
             is distinct from v_job.previous_ingestion_id then
      raise exception using
        message = 'MSMM_POINTER_CHANGED: primary projection baseline no longer matches the job compatibility mirror';
    end if;

    if v_is_primary_projection
       and v_job.snapshot_ingestion_id is not null then
      /*
       * Compatibility recovery for a legacy primary execution whose snapshot
       * mirror already exists but whose projection row is absent.
       */
      v_snapshot_ingestion_id :=
        v_job.snapshot_ingestion_id;
    else
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
        v_job.created_by,
        pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp()
      )
      returning id
        into v_snapshot_ingestion_id;
    end if;

    begin
      insert into public.media_sync_report_projections (
        media_sync_job_id,
        workspace_id,
        advertiser_id,
        report_id,
        previous_ingestion_id,
        snapshot_ingestion_id,
        created_by
      )
      values (
        v_job_id,
        v_workspace_id,
        v_advertiser_id,
        v_report_id,
        v_previous_ingestion_id,
        v_snapshot_ingestion_id,
        v_job.created_by
      )
      returning *
        into v_projection;
    exception
      when unique_violation then
        raise exception using
          message = 'MSMM_PROJECTION_CONFLICT: report projection identity is already bound';
    end;

    if v_is_primary_projection
       and v_job.snapshot_ingestion_id is null then
      update public.media_sync_jobs as j
         set snapshot_ingestion_id =
               v_snapshot_ingestion_id,
             updated_at =
               pg_catalog.clock_timestamp()
       where j.id = v_job_id
         and j.status = 'processing'
         and j.snapshot_ingestion_id is null;

      if not found then
        raise exception using
          message = 'MSMM_MATERIALIZATION_CONFLICT: primary job snapshot compatibility mirror could not be recorded';
      end if;
    end if;
  end if;

  /*
   * The snapshot ingestion is projection-owned for both primary and additional
   * report projections. Validate it after the projection identity is fixed.
   */
  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: projection snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: projection snapshot ingestion does not match the target report';
  end if;

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: completed projection snapshot row count is invalid';
    end if;

    v_next_row_index :=
      v_expected_rows;

    v_idempotent := true;
  else
    if v_ingestion.row_count is null
       or v_ingestion.row_count < 0
       or v_ingestion.row_count > v_expected_rows then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: projection snapshot checkpoint is invalid';
    end if;

    v_next_row_index :=
      v_ingestion.row_count::bigint;

    v_idempotent := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report ingestion pointer changed unexpectedly';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_expected_rows,
    v_next_row_index,
    v_idempotent;
end;
$function$
