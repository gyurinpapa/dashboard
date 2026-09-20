-- OFFLINE CANDIDATE ONLY. Not a migration, deployment, or standalone runtime test.
-- Existing staging/page/materialization SQL candidates are dependencies, unchanged.
-- Same claim only. No activation, finalization, reclaim, worker or live API wiring.
-- Fencing applies to these RPCs, not privileged SQL or direct common RPC calls.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $guard$
DECLARE v_name text;
BEGIN
  IF to_regclass('public.meta_ads_materialization_handoffs') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('lock_meta_ads_materialization_handoff_v1',
      'prepare_meta_ads_materialization_handoff_v1','materialize_meta_ads_handoff_batch_v1',
      'complete_meta_ads_materialization_handoff_v1')) THEN RAISE EXCEPTION 'META_HANDOFF_OBJECT_EXISTS'; END IF;
  IF to_regclass('public.meta_ads_page_checkpoints') IS NULL THEN RAISE EXCEPTION 'META_HANDOFF_DEPENDENCY_MISSING'; END IF;
  FOREACH v_name IN ARRAY array['load_meta_ads_page_checkpoint_v1','summarize_meta_ads_staging_base',
    'validate_meta_ads_staging_batch_v1','save_meta_ads_processing_checkpoint',
    'prepare_media_sync_snapshot_materialization','materialize_media_sync_snapshot_batch',
    'complete_media_sync_snapshot_materialization'] LOOP
    IF to_regprocedure('public.'||v_name||'(jsonb)') IS NULL THEN RAISE EXCEPTION 'META_HANDOFF_DEPENDENCY_MISSING'; END IF;
  END LOOP;
END;
$guard$;

CREATE TABLE public.meta_ads_materialization_handoffs (
  job_id uuid PRIMARY KEY REFERENCES public.media_sync_jobs(id) ON DELETE CASCADE,
  page_envelope jsonb NOT NULL CHECK (jsonb_typeof(page_envelope)='object' AND octet_length(page_envelope::text)<=262144),
  checkpoint jsonb NOT NULL CHECK (jsonb_typeof(checkpoint)='object' AND octet_length(checkpoint::text)<=65536),
  expected_rows integer NOT NULL CHECK (expected_rows BETWEEN 1 AND 100000),
  validation_batches jsonb NOT NULL CHECK (jsonb_typeof(validation_batches)='array' AND octet_length(validation_batches::text)<=65536),
  targets jsonb NOT NULL CHECK (jsonb_typeof(targets)='array' AND octet_length(targets::text)<=262144),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.meta_ads_materialization_handoffs OWNER TO postgres;
ALTER TABLE public.meta_ads_materialization_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_materialization_handoffs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_ads_materialization_handoffs FROM PUBLIC, anon, authenticated, service_role;
-- Immutable receipt: no direct role access and no UPDATE/DELETE path in these functions.

CREATE FUNCTION public.lock_meta_ads_materialization_handoff_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_page jsonb; v_ident jsonb; v_state jsonb; v_ids jsonb := '[]'::jsonb;
  v_targets jsonb := '[]'::jsonb; v_target jsonb; v_projection_json jsonb := 'null'::jsonb;
  v_job public.media_sync_jobs%rowtype; v_checkpoint public.meta_ads_page_checkpoints%rowtype;
  v_handoff public.meta_ads_materialization_handoffs%rowtype;
  v_connection public.media_connections%rowtype; v_mapping public.report_media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype; v_report public.reports%rowtype;
  v_expected integer; v_report_id uuid; v_base jsonb; v_existing boolean;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>524288
    OR NOT (p_payload ?& array['page','checkpoint_revision','checkpoint_digest','expected_rows','target_report_ids','target_report_id'])
    OR p_payload-array['page','checkpoint_revision','checkpoint_digest','expected_rows','target_report_ids','target_report_id',
      'snapshot_ingestion_id','batch_start','batch_size'] <> '{}'::jsonb THEN RAISE EXCEPTION 'META_HANDOFF_INPUT_INVALID'; END IF;
  v_page := p_payload->'page';
  IF jsonb_typeof(v_page) IS DISTINCT FROM 'object' OR octet_length(v_page::text)>262144
    OR NOT (v_page ?& array['job_id','storage_key','scope','scope_text','collector_scope','collector_text'])
    OR v_page-array['job_id','storage_key','scope','scope_text','collector_scope','collector_text'] <> '{}'::jsonb
    OR coalesce(v_page->>'job_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR coalesce(p_payload->>'target_report_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload->'expected_rows') IS DISTINCT FROM 'number'
    OR coalesce(p_payload->>'expected_rows','') !~ '^[1-9][0-9]{0,5}$'
    OR jsonb_typeof(p_payload->'checkpoint_revision') IS DISTINCT FROM 'number'
    OR coalesce(p_payload->>'checkpoint_revision','') !~ '^[1-9][0-9]{0,3}$'
    OR coalesce(p_payload->>'checkpoint_digest','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_payload->'target_report_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'META_HANDOFF_INPUT_INVALID'; END IF;
  v_expected := (p_payload->>'expected_rows')::integer;
  v_report_id := (p_payload->>'target_report_id')::uuid;
  IF v_expected NOT BETWEEN 1 AND 100000 OR jsonb_array_length(p_payload->'target_report_ids') NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'target_report_ids') x
      WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'string'
        OR x.value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'META_HANDOFF_BOUNDS_INVALID'; END IF;
  -- LOCK_ORDER: job -> checkpoint -> handoff -> connection -> mappings -> projections -> reports -> ingestions.
  -- Existing append/prepare serialize through the same job lock. All multi-row
  -- target locks are in report_id order, consistent with the Meta fanout path.
  SELECT * INTO v_job FROM public.media_sync_jobs j WHERE j.id=(v_page->>'job_id')::uuid FOR UPDATE;
  SELECT * INTO v_checkpoint FROM public.meta_ads_page_checkpoints c WHERE c.job_id=v_job.id FOR UPDATE;
  SELECT * INTO v_handoff FROM public.meta_ads_materialization_handoffs h WHERE h.job_id=v_job.id FOR UPDATE;
  v_existing := v_handoff.job_id IS NOT NULL;
  IF v_job.id IS NULL OR v_checkpoint.job_id IS NULL OR v_job.provider IS DISTINCT FROM 'meta_ads'
    OR v_job.status IS DISTINCT FROM 'processing' OR v_job.data_level IS DISTINCT FROM 'creative'
    OR v_job.mode IS DISTINCT FROM 'snapshot_replace' OR v_job.finished_at IS NOT NULL OR v_job.error IS NOT NULL
    OR v_job.failed_rows IS DISTINCT FROM 0 OR v_job.progress NOT BETWEEN 0 AND 99
    OR v_job.execution_contract IS NOT NULL OR v_job.automation_contract IS NOT NULL OR v_job.sync_segment_progress IS NOT NULL THEN
    RAISE EXCEPTION 'META_HANDOFF_JOB_INVALID'; END IF;
  v_ident := v_checkpoint.scope_document->'identity';
  IF v_job.attempt_count IS DISTINCT FROM (v_ident->>'attempt_count')::integer
    OR v_job.started_at IS DISTINCT FROM (v_ident->>'started_at')::timestamptz
    OR v_job.id IS DISTINCT FROM (v_ident->>'id')::uuid
    OR v_job.workspace_id IS DISTINCT FROM (v_ident->>'workspace_id')::uuid
    OR v_job.advertiser_id IS DISTINCT FROM (v_ident->>'advertiser_id')::uuid
    OR v_job.report_id IS DISTINCT FROM (v_ident->>'report_id')::uuid
    OR v_job.connection_id IS DISTINCT FROM (v_ident->>'connection_id')::uuid
    OR v_job.created_by IS DISTINCT FROM (v_ident->>'created_by')::uuid
    OR v_job.created_at IS DISTINCT FROM (v_ident->>'created_at')::timestamptz
    OR v_job.previous_ingestion_id IS DISTINCT FROM (v_ident->>'previous_ingestion_id')::uuid
    OR v_job.external_account_id IS DISTINCT FROM v_ident->>'external_account_id'
    OR v_job.date_from IS DISTINCT FROM (v_ident->>'date_from')::date
    OR v_job.date_to IS DISTINCT FROM (v_ident->>'date_to')::date THEN RAISE EXCEPTION 'META_HANDOFF_CLAIM_OR_SCOPE_CHANGED'; END IF;
  IF v_existing THEN
    IF v_handoff.page_envelope IS DISTINCT FROM v_page
      OR v_handoff.checkpoint IS DISTINCT FROM v_checkpoint.checkpoint
      OR v_handoff.expected_rows IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'META_HANDOFF_RECEIPT_CHANGED'; END IF;
    -- Never reopen the collecting-only loader after projection creation.
    v_state := v_handoff.checkpoint;
    IF NOT EXISTS(SELECT 1 FROM public.media_sync_report_projections p WHERE p.media_sync_job_id=v_job.id) THEN
      RAISE EXCEPTION 'META_HANDOFF_PROJECTION_MISSING'; END IF;
  ELSE
    -- This checks the original envelope/context/options and rejects pre-existing
    -- snapshots/projections without a receipt, before any counters or writes.
    v_state := public.load_meta_ads_page_checkpoint_v1(v_page);
  END IF;
  IF v_state IS NULL OR v_state->>'phase' IS DISTINCT FROM 'collected'
    OR v_state->'cursor' IS DISTINCT FROM 'null'::jsonb OR v_state->'pending' IS DISTINCT FROM 'null'::jsonb
    OR v_state->'revision' IS DISTINCT FROM p_payload->'checkpoint_revision'
    OR v_state->>'digest' IS DISTINCT FROM p_payload->>'checkpoint_digest'
    OR v_state->'totalRows' IS DISTINCT FROM to_jsonb(v_expected)
    OR v_state->'nextRowIndex' IS DISTINCT FROM to_jsonb(v_expected) THEN RAISE EXCEPTION 'META_HANDOFF_CHECKPOINT_INVALID'; END IF;
  -- Page append persists rows but not counters. Initial prepare sets counters
  -- only after its locked canonical validation. Resume requires exact counters.
  IF v_job.raw_rows IS NULL OR v_job.raw_rows<0 OR v_job.raw_rows>v_expected
    OR v_job.raw_rows IS DISTINCT FROM v_job.normalized_rows OR v_job.raw_rows IS DISTINCT FROM v_job.inserted_rows
    OR (v_existing AND v_job.raw_rows IS DISTINCT FROM v_expected) THEN RAISE EXCEPTION 'META_HANDOFF_COUNTERS_INVALID'; END IF;
  SELECT * INTO v_connection FROM public.media_connections c WHERE c.id=v_job.connection_id FOR UPDATE;
  IF NOT FOUND OR v_connection.status IS DISTINCT FROM 'active' OR v_connection.provider IS DISTINCT FROM 'meta_ads'
    OR v_connection.workspace_id IS DISTINCT FROM v_job.workspace_id
    OR v_connection.advertiser_id IS DISTINCT FROM v_job.advertiser_id
    OR v_connection.external_account_id IS DISTINCT FROM v_job.external_account_id THEN RAISE EXCEPTION 'META_HANDOFF_CONNECTION_INVALID'; END IF;
  -- Connection FOR UPDATE also conflicts with FK key-share for new mappings.
  FOR v_mapping IN SELECT * FROM public.report_media_connections m WHERE m.connection_id=v_job.connection_id ORDER BY m.report_id FOR SHARE LOOP
    IF v_mapping.workspace_id IS DISTINCT FROM v_job.workspace_id OR v_mapping.advertiser_id IS DISTINCT FROM v_job.advertiser_id
      OR v_mapping.tenant_id IS DISTINCT FROM v_connection.tenant_id THEN RAISE EXCEPTION 'META_HANDOFF_MAPPING_INVALID'; END IF;
    v_ids := v_ids || jsonb_build_array(v_mapping.report_id);
  END LOOP;
  IF v_ids IS DISTINCT FROM p_payload->'target_report_ids' OR NOT (v_ids ? v_job.report_id::text)
    OR NOT (v_ids ? v_report_id::text) THEN RAISE EXCEPTION 'META_HANDOFF_TARGET_SET_CHANGED'; END IF;
  FOR v_projection IN SELECT * FROM public.media_sync_report_projections p WHERE p.media_sync_job_id=v_job.id ORDER BY p.report_id FOR UPDATE LOOP
    IF NOT (v_ids ? v_projection.report_id::text) OR v_projection.workspace_id IS DISTINCT FROM v_job.workspace_id
      OR v_projection.advertiser_id IS DISTINCT FROM v_job.advertiser_id OR v_projection.created_by IS DISTINCT FROM v_job.created_by
      OR v_projection.snapshot_ingestion_id IS NULL THEN RAISE EXCEPTION 'META_HANDOFF_PROJECTION_INVALID'; END IF;
    IF v_projection.report_id=v_job.report_id AND (v_projection.previous_ingestion_id IS DISTINCT FROM v_job.previous_ingestion_id
      OR v_projection.snapshot_ingestion_id IS DISTINCT FROM v_job.snapshot_ingestion_id) THEN RAISE EXCEPTION 'META_HANDOFF_PRIMARY_MIRROR_INVALID'; END IF;
    IF v_projection.report_id=v_report_id THEN v_projection_json := to_jsonb(v_projection); END IF;
  END LOOP;
  IF v_job.snapshot_ingestion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media_sync_report_projections p
    WHERE p.media_sync_job_id=v_job.id AND p.report_id=v_job.report_id AND p.snapshot_ingestion_id=v_job.snapshot_ingestion_id) THEN
    RAISE EXCEPTION 'META_HANDOFF_PRIMARY_MIRROR_INVALID'; END IF;
  FOR v_report IN SELECT * FROM public.reports r
    WHERE r.id IN (SELECT (x.value#>>'{}')::uuid FROM jsonb_array_elements(v_ids) x) ORDER BY r.id FOR UPDATE LOOP
    IF v_report.workspace_id IS DISTINCT FROM v_job.workspace_id OR v_report.advertiser_id IS DISTINCT FROM v_job.advertiser_id
      OR v_report.tenant_id IS DISTINCT FROM v_connection.tenant_id OR v_report.meta#>>'{data_source,kind}' IS DISTINCT FROM 'api'
      OR coalesce(v_report.draft_period_start,v_report.period_start,nullif(btrim(v_report.meta#>>'{media_sync,date_from}'),'')::date) IS DISTINCT FROM v_job.date_from
      OR coalesce(v_report.draft_period_end,v_report.period_end,nullif(btrim(v_report.meta#>>'{media_sync,date_to}'),'')::date) IS DISTINCT FROM v_job.date_to THEN
      RAISE EXCEPTION 'META_HANDOFF_REPORT_INVALID'; END IF;
    IF EXISTS(SELECT 1 FROM public.report_media_connections m WHERE m.report_id=v_report.id AND m.connection_id<>v_job.connection_id) THEN
      RAISE EXCEPTION 'META_HANDOFF_MULTI_CONNECTION_UNSUPPORTED'; END IF;
    IF v_report.id=v_job.report_id AND v_report.current_ingestion_id IS DISTINCT FROM v_job.previous_ingestion_id THEN
      RAISE EXCEPTION 'META_HANDOFF_POINTER_CHANGED'; END IF;
    IF EXISTS(SELECT 1 FROM public.media_sync_report_projections p WHERE p.media_sync_job_id=v_job.id AND p.report_id=v_report.id
      AND p.previous_ingestion_id IS DISTINCT FROM v_report.current_ingestion_id) THEN RAISE EXCEPTION 'META_HANDOFF_POINTER_CHANGED'; END IF;
    v_target := jsonb_build_object('report_id',v_report.id,'previous_ingestion_id',v_report.current_ingestion_id,
      'published_ingestion_id',v_report.published_ingestion_id);
    v_targets := v_targets || jsonb_build_array(v_target);
  END LOOP;
  IF jsonb_array_length(v_targets)<>jsonb_array_length(v_ids)
    OR (v_existing AND v_handoff.targets IS DISTINCT FROM v_targets) THEN RAISE EXCEPTION 'META_HANDOFF_TARGET_BASELINE_CHANGED'; END IF;
  v_base := jsonb_build_object('job_id',v_job.id,'report_id',v_report_id,'workspace_id',v_job.workspace_id,
    'advertiser_id',v_job.advertiser_id,'connection_id',v_job.connection_id,'provider','meta_ads',
    'external_account_id',v_job.external_account_id,'date_from',v_job.date_from,'date_to',v_job.date_to,'expected_rows',v_expected);
  RETURN jsonb_build_object('existing',v_existing,'job',to_jsonb(v_job),'checkpoint',v_state,
    'base_payload',v_base,'targets',v_targets,'projection',v_projection_json,
    'validation_batches',v_handoff.validation_batches);
END;
$function$;
ALTER FUNCTION public.lock_meta_ads_materialization_handoff_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_meta_ads_materialization_handoff_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
-- Owner-only helper. Expose only the three bounded wrappers below.

CREATE FUNCTION public.prepare_meta_ads_materialization_handoff_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_locked jsonb; v_base jsonb; v_validation_payload jsonb; v_before jsonb; v_after jsonb;
  v_batch jsonb; v_batches jsonb := '[]'::jsonb; v_context jsonb; v_authority jsonb;
  v_start integer := 0; v_expected integer; v_new boolean; v_answer record; v_saved record;
BEGIN
  IF p_payload ?| array['snapshot_ingestion_id','batch_start','batch_size'] THEN RAISE EXCEPTION 'META_HANDOFF_PREPARE_INPUT_INVALID'; END IF;
  v_locked := public.lock_meta_ads_materialization_handoff_v1(p_payload);
  v_base := v_locked->'base_payload'; v_expected := (v_base->>'expected_rows')::integer;
  v_new := NOT (v_locked->>'existing')::boolean;
  IF v_new THEN
    -- Validation uses the job's primary compatibility identity; projection
    -- destination is selected separately and may be a secondary report.
    v_validation_payload := v_base || jsonb_build_object('report_id',v_locked#>'{job,report_id}');
    v_before := public.summarize_meta_ads_staging_base(v_validation_payload);
    IF v_before->'is_structurally_complete' IS DISTINCT FROM 'true'::jsonb
      OR v_before->'total_rows' IS DISTINCT FROM to_jsonb(v_expected) THEN RAISE EXCEPTION 'META_HANDOFF_STAGING_INCOMPLETE'; END IF;
    v_context := ((p_payload#>>'{page,scope_text}')::jsonb)->'context';
    SELECT s.row->'provider_meta' INTO v_authority FROM public.media_sync_staging_rows s
      WHERE s.job_id=(v_base->>'job_id')::uuid AND s.row_index=0;
    IF v_authority->>'currency' IS DISTINCT FROM v_context->>'currency'
      OR v_authority->>'time_zone' IS DISTINCT FROM v_context->>'timeZone'
      OR v_authority->'metric_policy' IS DISTINCT FROM jsonb_build_object(
        'conversion_action_type',v_context#>'{metricPolicy,conversionActionType}',
        'revenue_action_type',v_context#>'{metricPolicy,revenueActionType}',
        'action_report_time',v_context#>'{metricPolicy,actionReportTime}',
        'attribution_windows',v_context#>'{metricPolicy,attributionWindows}') THEN RAISE EXCEPTION 'META_HANDOFF_CONTEXT_CHANGED'; END IF;
    -- Recompute authoritative hashes while the job lock blocks ordinary append.
    -- Large datasets may hit the existing timeout: fail/rollback, never extend it.
    WHILE v_start<v_expected LOOP
      v_batch := public.validate_meta_ads_staging_batch_v1(v_validation_payload || jsonb_build_object('batch_start',v_start,'batch_size',2000));
      IF v_batch->'is_valid' IS DISTINCT FROM 'true'::jsonb OR v_batch->'canonical_mismatch_rows' IS DISTINCT FROM '0'::jsonb
        OR v_batch->'batch_start' IS DISTINCT FROM to_jsonb(v_start)
        OR v_batch->'batch_rows' IS DISTINCT FROM to_jsonb(least(2000,v_expected-v_start))
        OR v_batch->'batch_max_row_index' IS DISTINCT FROM to_jsonb(least(v_start+2000,v_expected)-1)
        OR coalesce(v_batch->>'batch_content_fingerprint','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'META_HANDOFF_VALIDATION_FAILED'; END IF;
      v_batches := v_batches || jsonb_build_array(v_batch);
      v_start := v_start+2000;
    END LOOP;
    v_after := public.summarize_meta_ads_staging_base(v_validation_payload);
    IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'META_HANDOFF_STAGING_CHANGED'; END IF;
    SELECT * INTO STRICT v_saved FROM public.save_meta_ads_processing_checkpoint(v_validation_payload);
    IF v_saved.raw_rows IS DISTINCT FROM v_expected OR v_saved.normalized_rows IS DISTINCT FROM v_expected
      OR v_saved.inserted_rows IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'META_HANDOFF_COUNTER_SAVE_FAILED'; END IF;
    INSERT INTO public.meta_ads_materialization_handoffs(job_id,page_envelope,checkpoint,expected_rows,validation_batches,targets)
      VALUES((v_base->>'job_id')::uuid,p_payload->'page',v_locked->'checkpoint',v_expected,v_batches,v_locked->'targets');
  ELSE
    v_batches := v_locked->'validation_batches';
  END IF;
  -- No exception swallowing/commit: receipt, counters and the first projection
  -- either all commit, or all roll back with this statement.
  SELECT * INTO STRICT v_answer FROM public.prepare_media_sync_snapshot_materialization(v_base);
  RETURN jsonb_build_object('materialization',to_jsonb(v_answer),'handoff_created',v_new,
    'checkpoint',v_locked->'checkpoint','targets',v_locked->'targets','validation_batches',v_batches);
END;
$function$;
ALTER FUNCTION public.prepare_meta_ads_materialization_handoff_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_meta_ads_materialization_handoff_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_meta_ads_materialization_handoff_v1(jsonb) TO service_role;

CREATE FUNCTION public.materialize_meta_ads_handoff_batch_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_locked jsonb; v_base jsonb; v_answer record; v_start integer;
BEGIN
  IF jsonb_typeof(p_payload->'batch_start') IS DISTINCT FROM 'number'
    OR coalesce(p_payload->>'batch_start','') !~ '^[0-9]{1,6}$'
    OR p_payload->'batch_size' IS DISTINCT FROM '2000'::jsonb
    OR jsonb_typeof(p_payload->'snapshot_ingestion_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'META_HANDOFF_BATCH_INPUT_INVALID'; END IF;
  v_locked := public.lock_meta_ads_materialization_handoff_v1(p_payload);
  v_base := v_locked->'base_payload'; v_start := (p_payload->>'batch_start')::integer;
  IF v_locked->'existing' IS DISTINCT FROM 'true'::jsonb OR v_locked->'projection' IS NOT DISTINCT FROM 'null'::jsonb
    OR v_locked#>'{projection,snapshot_ingestion_id}' IS DISTINCT FROM p_payload->'snapshot_ingestion_id'
    OR v_start>=(v_base->>'expected_rows')::integer OR mod(v_start,2000)<>0 THEN RAISE EXCEPTION 'META_HANDOFF_BATCH_SCOPE_INVALID'; END IF;
  SELECT * INTO STRICT v_answer FROM public.materialize_media_sync_snapshot_batch(v_base || jsonb_build_object(
    'snapshot_ingestion_id',v_locked#>'{projection,snapshot_ingestion_id}','batch_start',v_start,'batch_size',2000));
  RETURN to_jsonb(v_answer);
END;
$function$;
ALTER FUNCTION public.materialize_meta_ads_handoff_batch_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.materialize_meta_ads_handoff_batch_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_meta_ads_handoff_batch_v1(jsonb) TO service_role;

CREATE FUNCTION public.complete_meta_ads_materialization_handoff_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_locked jsonb; v_answer record;
BEGIN
  IF p_payload ?| array['batch_start','batch_size'] OR jsonb_typeof(p_payload->'snapshot_ingestion_id') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'META_HANDOFF_COMPLETE_INPUT_INVALID'; END IF;
  v_locked := public.lock_meta_ads_materialization_handoff_v1(p_payload);
  IF v_locked->'existing' IS DISTINCT FROM 'true'::jsonb OR v_locked->'projection' IS NOT DISTINCT FROM 'null'::jsonb
    OR v_locked#>'{projection,snapshot_ingestion_id}' IS DISTINCT FROM p_payload->'snapshot_ingestion_id' THEN
    RAISE EXCEPTION 'META_HANDOFF_COMPLETE_SCOPE_INVALID'; END IF;
  SELECT * INTO STRICT v_answer FROM public.complete_media_sync_snapshot_materialization(v_locked->'base_payload' ||
    jsonb_build_object('snapshot_ingestion_id',v_locked#>'{projection,snapshot_ingestion_id}'));
  RETURN to_jsonb(v_answer);
END;
$function$;
ALTER FUNCTION public.complete_meta_ads_materialization_handoff_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_meta_ads_materialization_handoff_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_meta_ads_materialization_handoff_v1(jsonb) TO service_role;
ROLLBACK;
