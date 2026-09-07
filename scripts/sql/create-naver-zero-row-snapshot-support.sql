-- Etrylue Performance
-- Option B / Naver authoritative zero-row snapshot support.
--
-- Generated from exact Production lifecycle RPC bodies captured READ ONLY.
-- Scope:
--   - Naver Search Ads only may use expected_rows = 0.
--   - Google Ads keeps the existing positive-row contract.
--   - CSV paths are untouched.
--   - published_ingestion_id semantics are unchanged.
--
-- LOCAL IMPLEMENTATION CANDIDATE ONLY.
-- DO NOT APPLY TO PRODUCTION without separate verification and approval.

begin;

CREATE OR REPLACE FUNCTION public.prepare_media_sync_snapshot_materialization(p_payload jsonb)
RETURNS TABLE(
  job jsonb,
  snapshot_ingestion_id uuid,
  expected_rows bigint,
  next_row_index bigint,
  idempotent boolean
)
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

  if v_expected_rows = 0
     and v_provider <> 'naver_searchad' then
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


  /*
   * Naver combined staging authority.
   *
   * Immediately before materialization, the Naver worker has already:
   *
   * 1) loaded a row-index-only whole-job base summary,
   * 2) validated every staging row in bounded 2,000-row batches,
   * 3) verified scope / row key / fingerprint / canonical grain,
   * 4) loaded the base summary again,
   * 5) rejected the result if the before/after summaries differ.
   *
   * append_media_sync_staging_batch() serializes on the same job row and
   * staging append is service-role authority only. Once any snapshot or
   * projection is established, append refuses further writes.
   *
   * Repeating the complete heap validation here therefore adds another O(n)
   * scan after the exact combined validation has already succeeded.
   *
   * For Naver keep only indexed boundary witnesses. Because:
   *
   * - (job_id, row_index) is unique,
   * - combined validation already proved totalRows = expectedRows,
   * - combined validation already proved min = 0 / max = expectedRows - 1,
   * - an additional successful append cannot create another in-range
   *   row_index after that complete set exists,
   *
   * any newly inserted row would necessarily move the maximum boundary and
   * fail this check.
   *
   * Google keeps the legacy complete validation below unchanged.
   */
  if v_provider = 'naver_searchad' then
    select s.row_index
      into v_min_row_index
      from public.media_sync_staging_rows as s
     where s.job_id = v_job_id
     order by s.row_index asc
     limit 1;

    select s.row_index
      into v_max_row_index
      from public.media_sync_staging_rows as s
     where s.job_id = v_job_id
     order by s.row_index desc
     limit 1;

    if v_expected_rows = 0 then
      if v_min_row_index is not null
         or v_max_row_index is not null then
        raise exception using
          message =
            'MSMM_STAGING_INCOMPLETE: authoritative zero-row Naver staging is not empty';
      end if;
    elsif v_min_row_index is distinct from 0
       or v_max_row_index
            is distinct from
            v_expected_rows - 1 then
      raise exception using
        message =
          'MSMM_STAGING_INCOMPLETE: Naver staging boundary authority changed after combined validation';
    end if;

    /*
     * Preserve the local variables' validated semantic values.
     * No full staging scan is required on this Naver branch.
     */
    v_total_rows :=
      v_expected_rows;

    v_distinct_row_indexes :=
      v_expected_rows;

    v_rows_in_expected_range :=
      v_expected_rows;

    v_scope_mismatch_rows := 0;
    v_blank_row_key_rows := 0;
    v_missing_fingerprint_rows := 0;
    v_canonical_mismatch_rows := 0;
    v_oversized_row_index_rows := 0;

  else
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
            or coalesce(
                 s.row->>'external_account_id',
                 ''
               ) <> v_external_account_id
            or coalesce(
                 s.row->>'ingestion_source',
                 ''
               ) <> 'api'
            or encode(
                 extensions.digest(
                   pg_catalog.convert_to(
                     s.row::text,
                     'UTF8'
                   ),
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
        message =
          'MSMM_STAGING_INCOMPLETE: staging completeness verification failed';
    end if;
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
$function$;

ALTER FUNCTION public.prepare_media_sync_snapshot_materialization(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_media_sync_snapshot_materialization(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prepare_media_sync_snapshot_materialization(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_media_sync_snapshot_materialization(p_payload jsonb)
RETURNS TABLE(
  job jsonb,
  snapshot_ingestion_id uuid,
  row_count bigint,
  staging_fingerprint text,
  materialized_fingerprint text,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_completion_fingerprint text;

  v_is_primary_projection boolean;

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
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~*
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

    v_snapshot_ingestion_id :=
      (p_payload->>'snapshot_ingestion_id')::uuid;

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
     or v_expected_rows < 0
     or (
       v_expected_rows = 0
       and v_provider <> 'naver_searchad'
     ) then
    raise exception using
      message = 'MSMM_INVALID_INPUT: completion payload values are invalid';
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
     or v_job.mode <> 'snapshot_replace'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: completion execution scope does not match the job';
  end if;

  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  /*
   * Macro 3-A1 projection completion authority.
   *
   * The selected projection owns target report previous/snapshot identity.
   * Job mirrors are checked only for the legacy primary projection.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by
          is distinct from v_job.created_by
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report projection authority does not match the request';
  end if;

  if v_is_primary_projection
     and (
       v_projection.previous_ingestion_id
         is distinct from v_job.previous_ingestion_id
       or v_projection.snapshot_ingestion_id
         is distinct from v_job.snapshot_ingestion_id
     ) then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: primary projection no longer matches job compatibility mirrors';
  end if;

  v_previous_ingestion_id :=
    v_projection.previous_ingestion_id;

  v_snapshot_ingestion_id :=
    v_projection.snapshot_ingestion_id;

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
     or v_report.advertiser_id
          is distinct from v_advertiser_id
     or v_report.current_ingestion_id
          is distinct from v_previous_ingestion_id then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report pointer no longer matches the materialization baseline';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion does not match the job';
  end if;

  /*
   * Constant-time staging completion verification.
   *
   * prepare_media_sync_snapshot_materialization() already validates complete
   * staging coverage and canonical row integrity before creating or resuming
   * the snapshot ingestion. Every bounded batch then compares its exact
   * report_rows range with staging and advances report_ingestions.row_count
   * in the same transaction. The sequential checkpoint guard prevents skipped
   * ranges, and a failed batch cannot commit its checkpoint.
   *
   * Therefore completion must not rescan all freshly inserted staging rows.
   * Fresh staging rows are not yet all-visible, so even an Index Only Scan can
   * perform one heap fetch per row and exceed the API role statement_timeout.
   */
  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_STAGING_INCOMPLETE: staging checkpoint counts are incomplete';
  end if;

  /*
   * Constant-time materialization completion verification.
   *
   * Each bounded batch exactly compares report_rows with staging and advances
   * report_ingestions.row_count in the same transaction. Sequential checkpoint
   * enforcement prevents skipped ranges, and a failed batch cannot commit a
   * checkpoint. Therefore row_count = expected_rows proves that every bounded
   * range from 0 through expected_rows - 1 was committed and verified.
   *
   * Do not rescan all newly inserted report_rows here. Fresh rows are not yet
   * all-visible, so even an Index Only Scan performs one heap fetch per row and
   * can exceed the API role's statement_timeout.
   */
  if v_ingestion.row_count
       is distinct from v_expected_rows::integer then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: materialization checkpoint is incomplete';
  end if;

  /*
   * Contract-compatible deterministic completion token.
   * No full JSON rehash or ordered string aggregation is performed here.
   */
  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_expected_rows::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: completed ingestion row count is invalid';
    end if;

    v_idempotent := true;
  else
    update public.report_ingestions as ri
       set status = 'success',
           row_count = v_expected_rows::integer,
           error = null,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count =
             v_expected_rows::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion could not be completed';
    end if;

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
      message = 'MSMM_POINTER_CHANGED: report ingestion pointer changed during completion';
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
    v_completion_fingerprint,
    v_completion_fingerprint,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.complete_media_sync_snapshot_materialization(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_media_sync_snapshot_materialization(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_media_sync_snapshot_materialization(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_media_sync_snapshot(p_payload jsonb)
RETURNS TABLE(
  job jsonb,
  previous_ingestion_id uuid,
  snapshot_ingestion_id uuid,
  current_ingestion_id uuid,
  published_ingestion_id uuid,
  row_count bigint,
  staging_fingerprint text,
  materialized_fingerprint text,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
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

  v_is_primary_projection boolean;

  v_completion_fingerprint text;

  v_published_ingestion_before uuid;
  v_job_status_before text;
  v_job_progress_before integer;
  v_job_finished_at_before timestamptz;
  v_job_error_before text;
  v_job_error_detail_before jsonb;
  v_job_snapshot_before uuid;
  v_job_updated_at_before timestamptz;

  v_idempotent boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using message = 'MSA_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSA_INVALID_INPUT: invalid UUID input';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSA_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using message = 'MSA_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_provider := btrim(p_payload->>'provider');
    v_external_account_id := btrim(p_payload->>'external_account_id');
    v_date_from := (p_payload->>'date_from')::date;
    v_date_to := (p_payload->>'date_to')::date;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
    v_previous_ingestion_id := nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;
  exception
    when others then
      raise exception using message = 'MSA_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0
     or (
       v_expected_rows = 0
       and v_provider <> 'naver_searchad'
     ) then
    raise exception using message = 'MSA_INVALID_INPUT: payload values are invalid';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using message = 'MSA_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using message = 'MSA_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using message = 'MSA_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  if v_job.id <> v_job_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to then
    raise exception using message = 'MSA_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  /*
   * V2-B downstream projection authority.
   *
   * Lock order is intentionally JOB FOR UPDATE -> PROJECTION FOR SHARE -> REPORT.
   * The projection owns the downstream previous/snapshot pointer binding.
   * The media_sync_job columns remain compatibility mirrors and the payload
   * pointer values remain request assertions; every copy must match exactly.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using message = 'MSA_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by is distinct from v_job.created_by
     or v_projection.previous_ingestion_id is distinct from v_previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSA_SCOPE_MISMATCH: report projection authority does not match the job and request';
  end if;

  if v_is_primary_projection
     and (
       v_projection.previous_ingestion_id is distinct from v_job.previous_ingestion_id
       or v_projection.snapshot_ingestion_id is distinct from v_job.snapshot_ingestion_id
     ) then
    raise exception using message = 'MSA_SCOPE_MISMATCH: primary report projection compatibility mirrors do not match the job';
  end if;

  v_previous_ingestion_id := v_projection.previous_ingestion_id;
  v_snapshot_ingestion_id := v_projection.snapshot_ingestion_id;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using message = 'MSA_SCOPE_MISMATCH: unsupported media sync mode';
  end if;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSA_SNAPSHOT_INVALID: processing checkpoint counts do not match';
  end if;

  v_job_status_before := v_job.status;
  v_job_progress_before := v_job.progress;
  v_job_finished_at_before := v_job.finished_at;
  v_job_error_before := v_job.error;
  v_job_error_detail_before := v_job.error_detail;
  v_job_snapshot_before := v_job.snapshot_ingestion_id;
  v_job_updated_at_before := v_job.updated_at;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using message = 'MSA_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using message = 'MSA_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  v_published_ingestion_before := v_report.published_ingestion_id;

  if v_report.current_ingestion_id is not distinct from v_snapshot_ingestion_id then
    v_idempotent := true;
  elsif v_report.current_ingestion_id is not distinct from v_previous_ingestion_id then
    v_idempotent := false;
  else
    raise exception using message = 'MSA_ACTIVATION_CONFLICT: current ingestion pointer no longer matches the job baseline';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id;

  if not found then
    raise exception using message = 'MSA_SNAPSHOT_NOT_MATERIALIZED: report ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count is distinct from v_expected_rows::integer
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using message = 'MSA_SNAPSHOT_INVALID: report ingestion does not match the materialized job';
  end if;

  /*
   * Constant-time activation verification.
   *
   * prepare validates complete staging integrity. Every bounded materialization
   * batch then compares staging with report_rows exactly and advances
   * report_ingestions.row_count in the same transaction. Completion succeeds
   * only after that checkpoint reaches expected_rows and marks the API
   * ingestion successful.
   *
   * Re-reading all fresh staging/report_rows rows here would repeat work that
   * has already committed and can exceed the API role statement_timeout.
   */
  if v_ingestion.row_count
       is distinct from v_expected_rows::integer
     or v_ingestion.status <> 'success'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSA_SNAPSHOT_INVALID: completed materialization checkpoint is invalid';
  end if;

  /*
   * Contract-compatible deterministic completion token.
   * This is identical to the constant-time token returned by
   * complete_media_sync_snapshot_materialization().
   */
  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_expected_rows::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if not v_idempotent then
    update public.reports as r
       set current_ingestion_id = v_snapshot_ingestion_id
     where r.id = v_report_id
       and r.current_ingestion_id is not distinct from v_previous_ingestion_id
       and r.published_ingestion_id is not distinct from v_published_ingestion_before;

    if not found then
      raise exception using message = 'MSA_ACTIVATION_CONFLICT: report pointer changed during activation';
    end if;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id
     or v_report.published_ingestion_id is distinct from v_published_ingestion_before then
    raise exception using message = 'MSA_ACTIVATION_CONFLICT: report pointers violate the activation contract';
  end if;

  if v_job.status is distinct from v_job_status_before
     or v_job.progress is distinct from v_job_progress_before
     or v_job.finished_at is distinct from v_job_finished_at_before
     or v_job.error is distinct from v_job_error_before
     or v_job.error_detail is distinct from v_job_error_detail_before
     or v_job.snapshot_ingestion_id is distinct from v_job_snapshot_before
     or v_job.updated_at is distinct from v_job_updated_at_before then
    raise exception using message = 'MSA_JOB_STATE_CHANGED: protected media sync job state changed unexpectedly';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_expected_rows,
    v_completion_fingerprint,
    v_completion_fingerprint,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.activate_media_sync_snapshot(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.activate_media_sync_snapshot(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activate_media_sync_snapshot(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_media_sync_job(p_payload jsonb)
RETURNS TABLE(
  job jsonb,
  snapshot_ingestion_id uuid,
  current_ingestion_id uuid,
  published_ingestion_id uuid,
  row_count bigint,
  staging_fingerprint text,
  materialized_fingerprint text,
  finished_at timestamptz,
  connection_id uuid,
  connection_last_sync_at timestamptz,
  connection_updated boolean,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;
  v_connection public.media_connections%rowtype;
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
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_expected_rows bigint;

  v_completion_fingerprint text;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;
  v_previous_ingestion_before uuid;
  v_snapshot_ingestion_before uuid;
  v_raw_rows_before integer;
  v_normalized_rows_before integer;
  v_inserted_rows_before integer;
  v_failed_rows_before integer;
  v_error_detail_before jsonb;

  v_finished_at timestamptz;
  v_connection_updated boolean := false;
  v_idempotent boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using message = 'MSF_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSF_INVALID_INPUT: invalid UUID input';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSF_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using message = 'MSF_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_provider := btrim(p_payload->>'provider');
    v_external_account_id := btrim(p_payload->>'external_account_id');
    v_date_from := (p_payload->>'date_from')::date;
    v_date_to := (p_payload->>'date_to')::date;
    v_previous_ingestion_id := nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using message = 'MSF_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0
     or (
       v_expected_rows = 0
       and v_provider <> 'naver_searchad'
     ) then
    raise exception using message = 'MSF_INVALID_INPUT: payload values are invalid';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using message = 'MSF_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status = 'done' then
    v_idempotent := true;
  elsif v_job.status = 'processing' then
    v_idempotent := false;
  else
    raise exception using message = 'MSF_JOB_NOT_PROCESSING: media sync job must be processing or already done';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using message = 'MSF_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.id <> v_job_id
     or v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to then
    raise exception using message = 'MSF_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  /*
   * V2-B downstream projection authority.
   *
   * Lock order is intentionally JOB FOR UPDATE -> PROJECTION FOR SHARE -> REPORT.
   * The projection owns the downstream previous/snapshot pointer binding.
   * The media_sync_job columns remain compatibility mirrors and the payload
   * pointer values remain request assertions; every copy must match exactly.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by is distinct from v_job.created_by
     or v_projection.previous_ingestion_id is distinct from v_job.previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_job.snapshot_ingestion_id
     or v_projection.previous_ingestion_id is distinct from v_previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report projection authority does not match the job and request';
  end if;

  v_previous_ingestion_id := v_projection.previous_ingestion_id;
  v_snapshot_ingestion_id := v_projection.snapshot_ingestion_id;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using message = 'MSF_SCOPE_MISMATCH: unsupported media sync mode';
  end if;

  if v_job.snapshot_ingestion_id is null then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: media sync job has no materialized snapshot';
  end if;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: final checkpoint counts do not match';
  end if;

  if v_idempotent then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.error is not null then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: completed job state is inconsistent';
    end if;
    v_finished_at := v_job.finished_at;
  end if;

  v_previous_ingestion_before := v_job.previous_ingestion_id;
  v_snapshot_ingestion_before := v_job.snapshot_ingestion_id;
  v_raw_rows_before := v_job.raw_rows;
  v_normalized_rows_before := v_job.normalized_rows;
  v_inserted_rows_before := v_job.inserted_rows;
  v_failed_rows_before := v_job.failed_rows;
  v_error_detail_before := v_job.error_detail;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using message = 'MSF_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;

  if v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: report current pointer does not use the materialized snapshot';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for update;

  if not found then
    raise exception using message = 'MSF_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> v_provider
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active' then
    raise exception using message = 'MSF_SCOPE_MISMATCH: media connection scope does not match the job';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id;

  if not found then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: active report ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count is distinct from v_expected_rows::integer
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: active report ingestion does not match the job';
  end if;

  /*
   * Constant-time finalization verification.
   *
   * prepare validates complete staging integrity. Every bounded materialization
   * batch then compares staging with report_rows exactly and advances
   * report_ingestions.row_count in the same transaction. Completion succeeds
   * only after that checkpoint reaches expected_rows and marks the API
   * ingestion successful.
   *
   * Re-reading all fresh staging/report_rows rows here would repeat work that
   * has already committed and can exceed the API role statement_timeout.
   */
  if v_ingestion.row_count
       is distinct from v_expected_rows::integer
     or v_ingestion.status <> 'success'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: completed materialization checkpoint is invalid';
  end if;

  /*
   * Contract-compatible deterministic completion token.
   * This is identical to the constant-time token returned by
   * complete_media_sync_snapshot_materialization().
   */
  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_expected_rows::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if not v_idempotent then
    /*
     * Macro 3-A3 execution-finalization authority.
     *
     * Finalization remains a single execution/job transition owned by the
     * primary projection compatibility binding. Before processing -> done,
     * every report projection for this job must already be independently
     * activated to its own projection-owned snapshot, and that snapshot
     * ingestion must be complete and successful.
     *
     * The job row is already locked FOR UPDATE above. Activation uses the
     * same job-first lock order, so this gate serializes against activation
     * for the same execution without changing report pointer ownership.
     */
    if exists (
      select 1
      from public.media_sync_report_projections as fp
      left join public.reports as fr
        on fr.id = fp.report_id
      left join public.report_ingestions as fi
        on fi.id = fp.snapshot_ingestion_id
      where fp.media_sync_job_id = v_job_id
        and (
          fp.workspace_id <> v_workspace_id
          or fp.advertiser_id <> v_advertiser_id
          or fp.created_by is distinct from v_job.created_by
          or fr.id is null
          or fr.workspace_id <> v_workspace_id
          or fr.advertiser_id is distinct from v_advertiser_id
          or fr.current_ingestion_id
               is distinct from fp.snapshot_ingestion_id
          or fi.id is null
          or fi.workspace_id <> v_workspace_id
          or fi.report_id <> fp.report_id
          or fi.kind <> 'api'
          or fi.status <> 'success'
          or fi.row_count is distinct from v_expected_rows::integer
          or fi.csv_path is not null
          or fi.error is not null
          or fi.created_by is distinct from v_job.created_by
        )
    ) then
      raise exception using
        message = 'MSF_PROJECTIONS_NOT_ACTIVE: every report projection must be activated before job finalization';
    end if;

    v_finished_at := pg_catalog.clock_timestamp();

    update public.media_sync_jobs as j
       set status = 'done',
           progress = 100,
           finished_at = v_finished_at,
           error = null,
           updated_at = v_finished_at
     where j.id = v_job_id
       and j.status = 'processing'
       and j.snapshot_ingestion_id = v_snapshot_ingestion_id
       and j.previous_ingestion_id is not distinct from v_previous_ingestion_id
       and j.finished_at is null;

    if not found then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: media sync job changed during finalization';
    end if;
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.error is not null
     or v_job.previous_ingestion_id is distinct from v_previous_ingestion_before
     or v_job.snapshot_ingestion_id is distinct from v_snapshot_ingestion_before
     or v_job.raw_rows is distinct from v_raw_rows_before
     or v_job.normalized_rows is distinct from v_normalized_rows_before
     or v_job.inserted_rows is distinct from v_inserted_rows_before
     or v_job.failed_rows is distinct from v_failed_rows_before
     or v_job.error_detail is distinct from v_error_detail_before then
    raise exception using message = 'MSF_FINALIZATION_CONFLICT: finalized job violates the contract';
  end if;

  v_finished_at := v_job.finished_at;

  if v_connection.last_sync_at is null
     or v_connection.last_sync_at < v_finished_at then
    update public.media_connections as c
       set last_sync_at = v_finished_at,
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
     where c.id = v_connection_id
       and c.workspace_id = v_workspace_id
       and c.advertiser_id = v_advertiser_id
       and c.provider = v_provider
       and c.external_account_id = v_external_account_id
       and c.status = 'active'
       and (
         c.last_sync_at is null
         or c.last_sync_at < v_finished_at
       )
     returning * into v_connection;

    if not found then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: media connection changed during finalization';
    end if;

    v_connection_updated := true;
  else
    v_connection_updated := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id is distinct from v_current_ingestion_before
     or v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id
     or v_report.published_ingestion_id is distinct from v_published_ingestion_before then
    raise exception using message = 'MSF_FINALIZATION_CONFLICT: report pointer changed during finalization';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_expected_rows,
    v_completion_fingerprint,
    v_completion_fingerprint,
    v_finished_at,
    v_connection.id,
    v_connection.last_sync_at,
    v_connection_updated,
    v_idempotent;
end;
$function$;

ALTER FUNCTION public.finalize_media_sync_job(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_media_sync_job(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalize_media_sync_job(jsonb) TO service_role;

commit;
