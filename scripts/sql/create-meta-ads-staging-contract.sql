-- Etrylue Performance — OFFLINE SQL CANDIDATE ONLY. NOT A DEPLOYMENT SCRIPT.
-- No production execution approved. This file intentionally ends in ROLLBACK.
-- Baseline: supplied DB export 2026-09-19T21:53:06Z, project ref unverified.
-- Sequence for a FUTURE approved isolated test transaction: staging ->
-- materialization -> atomic activation -> finalization. Standalone scripts
-- roll back; an isolated harness must load bodies together, never Production.
-- No table/index/RLS/trigger changes. Built-in and existing extensions only.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $baseline_guard$
BEGIN
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='assert_meta_ads_execution_scope') then
    raise exception 'META_NAME_ALREADY_EXISTS: assert_meta_ads_execution_scope';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='meta_ads_row_shape_valid') then
    raise exception 'META_NAME_ALREADY_EXISTS: meta_ads_row_shape_valid';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_meta_ads_canonical_row') then
    raise exception 'META_NAME_ALREADY_EXISTS: is_meta_ads_canonical_row';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='meta_ads_canonical_row_key') then
    raise exception 'META_NAME_ALREADY_EXISTS: meta_ads_canonical_row_key';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='summarize_meta_ads_staging_base') then
    raise exception 'META_NAME_ALREADY_EXISTS: summarize_meta_ads_staging_base';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validate_meta_ads_staging_batch_v1') then
    raise exception 'META_NAME_ALREADY_EXISTS: validate_meta_ads_staging_batch_v1';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_meta_ads_processing_checkpoint') then
    raise exception 'META_NAME_ALREADY_EXISTS: save_meta_ads_processing_checkpoint';
  end if;
END;
$baseline_guard$;
DO $baseline_guard$
BEGIN
  if pg_catalog.to_regprocedure('public.append_media_sync_staging_batch(jsonb)') is null or
     pg_catalog.md5(pg_catalog.pg_get_functiondef('public.append_media_sync_staging_batch(jsonb)'::regprocedure)) is distinct from '5cb5bf0aa17de04c7765457c8495d8d0' then
    raise exception 'META_BASELINE_DRIFT: append_media_sync_staging_batch';
  end if;
END;
$baseline_guard$;

CREATE FUNCTION public.assert_meta_ads_execution_scope(p_job public.media_sync_jobs, p_payload jsonb, p_allow_done boolean)
RETURNS void
LANGUAGE plpgsql volatile
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

begin
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
     or p_job.id is null or p_job.provider is distinct from 'meta_ads'
     or p_job.data_level is distinct from 'creative' or p_job.mode is distinct from 'snapshot_replace'
     or p_job.execution_contract is not null or p_job.automation_contract is not null
     or p_job.sync_segment_progress is not null or p_job.error is not null
     or p_job.attempt_count < 1 or p_job.started_at is null
     or not (p_job.status = 'processing' or (p_allow_done is true and p_job.status = 'done'))
     or (p_job.status = 'processing' and (p_job.finished_at is not null or p_job.progress not between 0 and 99))
     or (p_job.status = 'done' and (p_job.finished_at is null or p_job.progress <> 100))
     or p_job.id is distinct from (p_payload->>'job_id')::uuid
     or p_job.workspace_id is distinct from (p_payload->>'workspace_id')::uuid
     or p_job.advertiser_id is distinct from (p_payload->>'advertiser_id')::uuid
     or p_job.connection_id is distinct from (p_payload->>'connection_id')::uuid
     or p_job.provider is distinct from p_payload->>'provider'
     or p_job.external_account_id is distinct from p_payload->>'external_account_id'
     or p_job.date_from is distinct from (p_payload->>'date_from')::date
     or p_job.date_to is distinct from (p_payload->>'date_to')::date then
    raise exception 'META_EXECUTION_SCOPE_INVALID';
  end if;
end;
$function$;

ALTER FUNCTION public.assert_meta_ads_execution_scope(public.media_sync_jobs, jsonb, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_meta_ads_execution_scope(public.media_sync_jobs, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_meta_ads_execution_scope(public.media_sync_jobs, jsonb, boolean) TO service_role;

-- Shape validation is catalog-free. Batch callers must additionally compare
-- every row's time_zone against a server-derived name array, loaded once per RPC.
CREATE FUNCTION public.meta_ads_row_shape_valid(p_row jsonb, p_account text, p_from date, p_to date)
RETURNS boolean
LANGUAGE plpgsql stable
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

declare
  m_key text; m_value numeric; m_any boolean := false;
  m_meta jsonb; m_policy jsonb; m_day date;
  m_keys text[] := array['date','report_date','day','ymd','channel','source','platform','device',
    'campaign','campaign_name','group','group_name','adgroup_name','creative','creative_name',
    'impressions','clicks','cost','conversions','revenue','row_level','data_level','row_level_reason',
    'provider','ingestion_source','external_account_id','external_campaign_id','external_group_id',
    'external_ad_id','external_creative_id','provider_meta'];
begin
  if jsonb_typeof(p_row) is distinct from 'object' or not (p_row ?& m_keys)
     or p_row - m_keys <> '{}'::jsonb then return false; end if;
  foreach m_key in array m_keys loop
    if m_key = any(array['impressions','clicks','cost','conversions','revenue']) then
      if jsonb_typeof(p_row->m_key) is distinct from 'number' then return false; end if;
      m_value := (p_row->>m_key)::numeric;
      if m_value < 0 or m_value > 9007199254740991 or
         (m_key = any(array['impressions','clicks']) and m_value <> trunc(m_value)) then return false; end if;
      m_any := m_any or m_value > 0;
    elsif m_key <> 'provider_meta' then
      if jsonb_typeof(p_row->m_key) is distinct from 'string' or
         length(p_row->>m_key)>2000 or (p_row->>m_key) ~ '[[:cntrl:]]' or
         (m_key <> 'device' and (btrim(p_row->>m_key) = '' or btrim(p_row->>m_key) <> p_row->>m_key)) then return false; end if;
    end if;
  end loop;
  if not m_any or p_row->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  m_day := (p_row->>'date')::date;
  if m_day < p_from or m_day > p_to or m_day::text <> p_row->>'date'
     or p_row->>'provider' <> 'meta_ads' or p_row->>'external_account_id' is distinct from p_account
     or p_row->>'ingestion_source' <> 'api' or p_row->>'row_level' <> 'creative'
     or p_row->>'data_level' <> 'creative' or p_row->>'row_level_reason' <> 'meta_ads_ad_daily_insights'
     or p_row->>'device' <> '' or p_row->>'channel' <> 'Meta Ads'
     or p_row->>'source' <> 'Meta Ads' or p_row->>'platform' <> 'Meta Ads'
     or p_row->>'report_date' <> p_row->>'date' or p_row->>'day' <> p_row->>'date' or p_row->>'ymd' <> p_row->>'date'
     or p_row->>'campaign_name' <> p_row->>'campaign' or p_row->>'group_name' <> p_row->>'group'
     or p_row->>'adgroup_name' <> p_row->>'group' or p_row->>'creative_name' <> p_row->>'creative'
     or p_row->>'external_creative_id' <> p_row->>'external_ad_id' then return false; end if;
  m_meta := p_row->'provider_meta'; m_policy := m_meta->'metric_policy';
  if jsonb_typeof(m_meta) is distinct from 'object' or jsonb_typeof(m_policy) is distinct from 'object'
     or m_meta->>'currency' is null or m_meta->>'currency' !~ '^[A-Z]{3}$'
     or jsonb_typeof(m_meta->'time_zone') is distinct from 'string'
     or not (m_policy ?& array['conversion_action_type','revenue_action_type','action_report_time','attribution_windows'])
     or m_policy - array['conversion_action_type','revenue_action_type','action_report_time','attribution_windows'] <> '{}'::jsonb then return false; end if;
  foreach m_key in array array['conversion_action_type','revenue_action_type','action_report_time'] loop
    if jsonb_typeof(m_policy->m_key) is distinct from 'string' or btrim(m_policy->>m_key) = ''
       or btrim(m_policy->>m_key) <> m_policy->>m_key then return false; end if;
  end loop;
  if jsonb_typeof(m_policy->'attribution_windows') is distinct from 'array' then return false; end if;
  if jsonb_array_length(m_policy->'attribution_windows')=0 or exists(
    select 1 from jsonb_array_elements(m_policy->'attribution_windows') x(value)
    where jsonb_typeof(x.value) <> 'string' or btrim(x.value #>> '{}')='' or btrim(x.value #>> '{}') <> x.value #>> '{}'
  ) or (select count(*) <> count(distinct x.value) from jsonb_array_elements(m_policy->'attribution_windows') x(value)) then return false; end if;
  return m_meta = jsonb_build_object('provider','meta_ads','api_version','v26.0',
    'authoritative_grain','ad','entity_type','ad','entity_id',p_row->>'external_ad_id',
    'level','ad','time_increment',1,'breakdowns','[]'::jsonb,'action_breakdowns','[]'::jsonb,
    'currency',m_meta->>'currency','time_zone',m_meta->>'time_zone','metric_policy',m_policy);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  return false;
end;
$function$;

ALTER FUNCTION public.meta_ads_row_shape_valid(jsonb, text, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.meta_ads_row_shape_valid(jsonb, text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_ads_row_shape_valid(jsonb, text, date, date) TO service_role;

-- Preserve the four-argument full validator for independent single-row callers.
CREATE FUNCTION public.is_meta_ads_canonical_row(p_row jsonb, p_account text, p_from date, p_to date)
RETURNS boolean
LANGUAGE plpgsql stable
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if not public.meta_ads_row_shape_valid(p_row,p_account,p_from,p_to) then return false; end if;
  return exists(select 1 from pg_catalog.pg_timezone_names tz where tz.name=p_row #>> '{provider_meta,time_zone}');
end;
$function$;

ALTER FUNCTION public.is_meta_ads_canonical_row(jsonb, text, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_meta_ads_canonical_row(jsonb, text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_meta_ads_canonical_row(jsonb, text, date, date) TO service_role;

CREATE FUNCTION public.meta_ads_canonical_row_key(p_row jsonb)
RETURNS text
LANGUAGE plpgsql immutable
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

begin
  return array_to_json(array['meta_ads_ad_daily_v1','meta_ads','ad',p_row->>'external_account_id',
    p_row->>'external_campaign_id',p_row->>'external_group_id',p_row->>'external_ad_id',p_row->>'date'])::text;
end;
$function$;

ALTER FUNCTION public.meta_ads_canonical_row_key(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.meta_ads_canonical_row_key(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_ads_canonical_row_key(jsonb) TO service_role;

CREATE FUNCTION public.summarize_meta_ads_staging_base(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql volatile
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

declare
  m_job public.media_sync_jobs%rowtype; m_count bigint; m_min bigint; m_max bigint;
  m_scope bigint; m_blank bigint; m_missing_hash bigint; m_unique bigint; m_natural bigint;
  m_first_date date; m_last_date date; m_expected bigint; m_windows bigint;
begin
  select * into m_job from public.media_sync_jobs where id=(p_payload->>'job_id')::uuid for share;
  perform public.assert_meta_ads_execution_scope(m_job,p_payload,false);
  m_expected := (p_payload->>'expected_rows')::bigint;
  if m_expected is null or m_expected not between 1 and 2147483647 then raise exception 'META_EXPECTED_ROWS_INVALID'; end if;
  select count(*),min(s.row_index),max(s.row_index),count(distinct s.row_index),
    count(distinct (s.external_account_id,s.row->>'external_ad_id',s.date)),
    count(*) filter(where s.report_id is distinct from m_job.report_id or s.workspace_id is distinct from m_job.workspace_id
      or s.advertiser_id is distinct from m_job.advertiser_id or s.connection_id is distinct from m_job.connection_id
      or s.provider is distinct from 'meta_ads' or s.external_account_id is distinct from m_job.external_account_id
      or s.date_from is distinct from m_job.date_from or s.date_to is distinct from m_job.date_to
      or s.date not between m_job.date_from and m_job.date_to or s.date_window_index <> 0),
    count(*) filter(where s.row_key is null or btrim(s.row_key)=''),
    count(*) filter(where s.row_fingerprint is null or s.row_fingerprint !~ '^[0-9a-f]{64}$'),
    min(s.date),max(s.date),count(distinct s.date_window_index)
  into m_count,m_min,m_max,m_unique,m_natural,m_scope,m_blank,m_missing_hash,m_first_date,m_last_date,m_windows
  from public.media_sync_staging_rows s where s.job_id=m_job.id;
  return jsonb_build_object('job_id',m_job.id,'expected_rows',m_expected,'total_rows',m_count,
    'min_row_index',m_min,'max_row_index',m_max,'distinct_row_indexes',m_unique,
    'duplicate_ad_day_rows',m_count-m_natural,'scope_mismatch_rows',m_scope,'blank_row_key_rows',m_blank,
    'missing_fingerprint_rows',m_missing_hash,'date_window_count',m_windows,
    'min_date',m_first_date,'max_date',m_last_date,
    'is_structurally_complete',m_count=m_expected and m_unique=m_expected and m_natural=m_expected
      and m_min=0 and m_max=m_expected-1 and m_scope=0 and m_blank=0 and m_missing_hash=0 and m_windows=1,
    'canonical_validation','REQUIRES_BOUNDED_VALIDATION');
end;
$function$;

ALTER FUNCTION public.summarize_meta_ads_staging_base(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.summarize_meta_ads_staging_base(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.summarize_meta_ads_staging_base(jsonb) TO service_role;

CREATE FUNCTION public.validate_meta_ads_staging_batch_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql volatile
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

declare
  m_job public.media_sync_jobs%rowtype; m_start bigint; m_size integer; m_expected bigint;
  m_count bigint; m_bad bigint; m_max bigint; m_digest text; m_authority jsonb; m_timezone_names text[];
begin
  select * into m_job from public.media_sync_jobs where id=(p_payload->>'job_id')::uuid for share;
  perform public.assert_meta_ads_execution_scope(m_job,p_payload,false);
  m_start := (p_payload->>'batch_start')::bigint; m_size := (p_payload->>'batch_size')::integer;
  m_expected := (p_payload->>'expected_rows')::bigint;
  if m_expected is null or m_expected not between 1 and 2147483647 or m_start is null or m_start<0 or m_start>=m_expected
     or m_size is null or m_size not between 1 and 2000 then raise exception 'META_VALIDATION_RANGE_INVALID'; end if;
  select (s.row->'provider_meta') - 'entity_id' into m_authority from public.media_sync_staging_rows s
    where s.job_id=m_job.id and s.row_index=0;
  select array_agg(tz.name) into m_timezone_names from pg_catalog.pg_timezone_names tz;
  select count(*), max(s.row_index), count(*) filter(where
      not public.meta_ads_row_shape_valid(s.row,m_job.external_account_id,m_job.date_from,m_job.date_to)
      or not coalesce((s.row #>> '{provider_meta,time_zone}')=any(m_timezone_names),false)
      or s.row_key is distinct from public.meta_ads_canonical_row_key(s.row)
      or (s.row->'provider_meta') - 'entity_id' is distinct from m_authority
      or s.row_fingerprint is distinct from encode(extensions.digest(convert_to(s.row::text,'UTF8'),'sha256'),'hex')
      or s.date::text is distinct from s.row->>'date' or s.device is distinct from ''
      or s.channel is distinct from 'Meta Ads' or s.source is distinct from 'Meta Ads'),
    encode(extensions.digest(convert_to(string_agg(s.row_index::text||':'||s.row_fingerprint,',' order by s.row_index),'UTF8'),'sha256'),'hex')
  into m_count,m_max,m_bad,m_digest from public.media_sync_staging_rows s
  where s.job_id=m_job.id and s.row_index>=m_start and s.row_index<least(m_start+m_size,m_expected);
  return jsonb_build_object('job_id',m_job.id,'batch_start',m_start,'batch_rows',m_count,'batch_max_row_index',m_max,
    'canonical_mismatch_rows',m_bad,'batch_content_fingerprint',m_digest,
    'is_valid',m_count=least(m_size::bigint,m_expected-m_start) and m_bad=0 and m_authority is not null);
end;
$function$;

ALTER FUNCTION public.validate_meta_ads_staging_batch_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_meta_ads_staging_batch_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_meta_ads_staging_batch_v1(jsonb) TO service_role;

CREATE FUNCTION public.save_meta_ads_processing_checkpoint(p_payload jsonb)
RETURNS SETOF public.media_sync_jobs
LANGUAGE plpgsql volatile
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$

declare m_job public.media_sync_jobs%rowtype; m_summary jsonb; m_expected integer;
begin
  select * into m_job from public.media_sync_jobs where id=(p_payload->>'job_id')::uuid for update;
  perform public.assert_meta_ads_execution_scope(m_job,p_payload,false);
  if m_job.snapshot_ingestion_id is not null or exists(select 1 from public.media_sync_report_projections where media_sync_job_id=m_job.id)
     then raise exception 'META_STAGING_FROZEN'; end if;
  m_summary := public.summarize_meta_ads_staging_base(p_payload);
  if (m_summary->>'is_structurally_complete')::boolean is distinct from true then raise exception 'META_STAGING_INCOMPLETE'; end if;
  m_expected := (m_summary->>'total_rows')::integer;
  if m_job.raw_rows > m_expected or m_job.normalized_rows > m_expected or m_job.inserted_rows > m_expected
     or m_job.failed_rows <> 0 then raise exception 'META_CHECKPOINT_REGRESSION'; end if;
  -- Preserve error_detail and all execution/snapshot authority. No keyword collector.
  update public.media_sync_jobs set raw_rows=m_expected,normalized_rows=m_expected,inserted_rows=m_expected,
    progress=greatest(progress,70),updated_at=statement_timestamp()
    where id=m_job.id and status='processing' returning * into m_job;
  return next m_job;
end;
$function$;

ALTER FUNCTION public.save_meta_ads_processing_checkpoint(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_meta_ads_processing_checkpoint(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_meta_ads_processing_checkpoint(jsonb) TO service_role;



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

  /*
   * Staging becomes immutable once snapshot materialization has started.
   *
   * The job row lock above serializes append and prepare transactions.
   * After prepare commits, either the primary snapshot mirror or a report
   * projection proves that materialization authority has been established.
   */
  if v_job.snapshot_ingestion_id is not null
     or exists (
       select 1
       from public.media_sync_report_projections as projection
       where projection.media_sync_job_id = v_job_id
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_JOB_NOT_PROCESSING';
  end if;

/* META_ONLY_BEGIN:scope */
  if v_job.provider = 'meta_ads' or v_provider = 'meta_ads' then
    perform public.assert_meta_ads_execution_scope(v_job, p_payload, false);
    declare
      m_item jsonb; m_authority jsonb; m_incoming_authority jsonb; m_timezone_names text[];
    begin
      if jsonb_typeof(p_payload->'rows') is distinct from 'array' then raise exception 'META_ROWS_INVALID'; end if;
      if jsonb_array_length(p_payload->'rows') not between 1 and 10000
         or (p_payload->>'date_window_index')::bigint is distinct from 0 then raise exception 'META_BATCH_INVALID'; end if;
      select (s.row->'provider_meta') - 'entity_id' into m_authority
        from public.media_sync_staging_rows s where s.job_id=v_job.id order by s.row_index limit 1;
      select array_agg(tz.name) into m_timezone_names from pg_catalog.pg_timezone_names tz;
      for m_item in select value from jsonb_array_elements(p_payload->'rows') loop
        if not public.meta_ads_row_shape_valid(m_item->'row',v_job.external_account_id,v_job.date_from,v_job.date_to)
           or not coalesce((m_item #>> '{row,provider_meta,time_zone}')=any(m_timezone_names),false)
           or m_item->>'row_key' is distinct from public.meta_ads_canonical_row_key(m_item->'row')
           or m_item->>'date' is distinct from m_item->'row'->>'date'
           or m_item->>'channel' is distinct from 'Meta Ads' or m_item->>'source' is distinct from 'Meta Ads'
           or m_item->>'device' is distinct from '' then raise exception 'META_CANONICAL_ROW_INVALID'; end if;
        m_incoming_authority := (m_item->'row'->'provider_meta') - 'entity_id';
        if m_authority is null then m_authority := m_incoming_authority; end if;
        if m_authority is distinct from m_incoming_authority then raise exception 'META_CONTEXT_DRIFT'; end if;
      end loop;
    end;
  end if;
  if v_job.provider is distinct from 'meta_ads' or v_provider is distinct from 'meta_ads' then
/* META_ONLY_END:scope */
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
/* META_ONLY_BEGIN:provider_end */
  end if;
/* META_ONLY_END:provider_end */

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

ALTER FUNCTION public.append_media_sync_staging_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.append_media_sync_staging_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_media_sync_staging_batch(jsonb) TO service_role;

ROLLBACK;
