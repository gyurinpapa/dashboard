-- OFFLINE CANDIDATE ONLY. Not a migration or deployment script.
-- Existing functions and ACLs remain unchanged. Direct old RPCs / privileged
-- SQL are outside this fence; a live worker must use only the new wrappers.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $guard$
DECLARE v_name text;
BEGIN
  IF to_regclass('public.meta_ads_page_checkpoints') IS NULL OR
     to_regclass('public.meta_ads_materialization_handoffs') IS NULL THEN
    RAISE EXCEPTION 'META_COMPLETION_DEPENDENCY_MISSING'; END IF;
  FOREACH v_name IN ARRAY ARRAY['lock_meta_ads_completion_claim_v1','activate_meta_ads_claim_snapshot_v1','finalize_meta_ads_claim_job_v1'] LOOP
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=v_name) THEN RAISE EXCEPTION 'META_COMPLETION_OBJECT_EXISTS'; END IF;
  END LOOP;
  IF to_regprocedure('public.lock_meta_ads_snapshot_fanout(jsonb,boolean)') IS NULL OR
     to_regprocedure('public.activate_meta_ads_snapshot_fanout(jsonb)') IS NULL OR
     to_regprocedure('public.finalize_media_sync_job(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'META_COMPLETION_DEPENDENCY_MISSING'; END IF;
END;
$guard$;

CREATE FUNCTION public.lock_meta_ads_completion_claim_v1(p_payload jsonb, p_finalizing boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_job public.media_sync_jobs%rowtype;
  v_page public.meta_ads_page_checkpoints%rowtype;
  v_receipt public.meta_ads_materialization_handoffs%rowtype;
  v_ident jsonb; v_job_json jsonb; v_key text; v_targets jsonb; v_base jsonb; v_witness jsonb; v_baselines jsonb;
BEGIN
  IF p_finalizing IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>524288
    OR NOT (p_payload ?& ARRAY['page','attempt_count','started_at','checkpoint_revision','checkpoint_digest','expected_rows'])
    OR p_payload-ARRAY['page','attempt_count','started_at','checkpoint_revision','checkpoint_digest','expected_rows'] <> '{}'::jsonb
    OR jsonb_typeof(p_payload->'page') IS DISTINCT FROM 'object'
    OR coalesce(p_payload#>>'{page,job_id}','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload->'attempt_count') IS DISTINCT FROM 'number'
    OR coalesce(p_payload->>'attempt_count','') !~ '^[1-9][0-9]{0,8}$'
    OR jsonb_typeof(p_payload->'started_at') IS DISTINCT FROM 'string'
    OR coalesce(p_payload->>'started_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    OR jsonb_typeof(p_payload->'expected_rows') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_payload->'checkpoint_revision') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_payload->'checkpoint_digest') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'META_COMPLETION_INPUT_INVALID'; END IF;
  -- LOCK_ORDER: job -> checkpoint -> receipt -> existing fanout locks.
  -- Both the claim check and downstream transition execute under this job lock.
  SELECT * INTO v_job FROM public.media_sync_jobs j WHERE j.id=(p_payload#>>'{page,job_id}')::uuid FOR UPDATE;
  SELECT * INTO v_page FROM public.meta_ads_page_checkpoints c WHERE c.job_id=v_job.id FOR UPDATE;
  SELECT * INTO v_receipt FROM public.meta_ads_materialization_handoffs r WHERE r.job_id=v_job.id FOR UPDATE;
  IF v_job.id IS NULL OR v_page.job_id IS NULL OR v_receipt.job_id IS NULL OR v_job.provider IS DISTINCT FROM 'meta_ads'
    OR v_job.data_level IS DISTINCT FROM 'creative' OR v_job.mode IS DISTINCT FROM 'snapshot_replace' THEN
    RAISE EXCEPTION 'META_COMPLETION_SCOPE_INVALID'; END IF;
  IF v_receipt.page_envelope IS DISTINCT FROM p_payload->'page'
    OR v_page.scope_document IS DISTINCT FROM (v_receipt.page_envelope->>'scope_text')::jsonb
    OR v_page.scope IS DISTINCT FROM v_receipt.page_envelope->>'scope'
    OR v_page.storage_key IS DISTINCT FROM v_receipt.page_envelope->>'storage_key'
    OR v_page.collector_scope IS DISTINCT FROM v_receipt.page_envelope->>'collector_scope'
    OR v_receipt.checkpoint IS DISTINCT FROM v_page.checkpoint
    OR v_page.checkpoint->>'phase' IS DISTINCT FROM 'collected'
    OR v_page.checkpoint->'pending' IS DISTINCT FROM 'null'::jsonb OR v_page.checkpoint->'cursor' IS DISTINCT FROM 'null'::jsonb
    OR v_page.checkpoint->'revision' IS DISTINCT FROM p_payload->'checkpoint_revision'
    OR v_page.checkpoint->'digest' IS DISTINCT FROM p_payload->'checkpoint_digest'
    OR v_page.checkpoint->'totalRows' IS DISTINCT FROM to_jsonb(v_receipt.expected_rows)
    OR v_page.checkpoint->'nextRowIndex' IS DISTINCT FROM to_jsonb(v_receipt.expected_rows)
    OR p_payload->'expected_rows' IS DISTINCT FROM to_jsonb(v_receipt.expected_rows) THEN
    RAISE EXCEPTION 'META_COMPLETION_RECEIPT_CHANGED'; END IF;
  v_ident := v_page.scope_document->'identity';
  -- No done/idempotent early return. A completed retry is claim-bound too.
  IF v_job.attempt_count IS DISTINCT FROM (v_ident->>'attempt_count')::integer
    OR v_job.started_at IS DISTINCT FROM (v_ident->>'started_at')::timestamptz
    OR p_payload->'attempt_count' IS DISTINCT FROM v_ident->'attempt_count'
    OR (p_payload->>'started_at')::timestamptz IS DISTINCT FROM (v_ident->>'started_at')::timestamptz THEN
    RAISE EXCEPTION 'META_COMPLETION_CLAIM_CHANGED'; END IF;
  v_job_json := to_jsonb(v_job);
  FOREACH v_key IN ARRAY ARRAY['id','workspace_id','advertiser_id','report_id','connection_id','created_by',
    'previous_ingestion_id','external_account_id','date_from','date_to'] LOOP
    IF v_job_json->v_key IS DISTINCT FROM v_ident->v_key THEN RAISE EXCEPTION 'META_COMPLETION_SCOPE_CHANGED'; END IF;
  END LOOP;
  IF v_job.created_at IS DISTINCT FROM (v_ident->>'created_at')::timestamptz THEN
    RAISE EXCEPTION 'META_COMPLETION_SCOPE_CHANGED'; END IF;
  -- Use DB projections and the saved published baselines, never caller targets
  -- or the primary mirror as authority for a secondary report.
  SELECT jsonb_agg(jsonb_build_object('report_id',p.report_id,'previous_ingestion_id',p.previous_ingestion_id,
    'snapshot_ingestion_id',p.snapshot_ingestion_id,'expected_rows',v_receipt.expected_rows,
    'published_ingestion_id',t.value->'published_ingestion_id') ORDER BY p.report_id)
  INTO v_targets FROM public.media_sync_report_projections p
  CROSS JOIN LATERAL jsonb_array_elements(v_receipt.targets) t
  WHERE p.media_sync_job_id=v_job.id AND t.value->>'report_id'=p.report_id::text;
  v_base := jsonb_build_object('job_id',v_job.id,'report_id',v_job.report_id,'workspace_id',v_job.workspace_id,
    'advertiser_id',v_job.advertiser_id,'connection_id',v_job.connection_id,'provider','meta_ads',
    'external_account_id',v_job.external_account_id,'date_from',v_job.date_from,'date_to',v_job.date_to,
    'previous_ingestion_id',v_job.previous_ingestion_id,'snapshot_ingestion_id',v_job.snapshot_ingestion_id,
    'expected_rows',v_receipt.expected_rows,'projections',v_targets);
  -- The existing helper locks connections/mappings/projections/reports/ingestions,
  -- verifies the exact mapped set, counters, snapshot completion and pointer state.
  v_witness := public.lock_meta_ads_snapshot_fanout(v_base,p_finalizing);
  SELECT jsonb_agg(jsonb_build_object('report_id',t.value->'report_id','previous_ingestion_id',t.value->'previous_ingestion_id',
    'published_ingestion_id',t.value->'published_ingestion_id') ORDER BY t.value->>'report_id')
  INTO v_baselines FROM jsonb_array_elements(v_witness->'projections') t;
  IF v_baselines IS DISTINCT FROM v_receipt.targets THEN RAISE EXCEPTION 'META_COMPLETION_TARGET_BASELINE_CHANGED'; END IF;
  RETURN v_base;
END;
$function$;
ALTER FUNCTION public.lock_meta_ads_completion_claim_v1(jsonb,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_meta_ads_completion_claim_v1(jsonb,boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.activate_meta_ads_claim_snapshot_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_base jsonb;
BEGIN
  v_base := public.lock_meta_ads_completion_claim_v1(p_payload,false);
  RETURN public.activate_meta_ads_snapshot_fanout(v_base);
END;
$function$;
ALTER FUNCTION public.activate_meta_ads_claim_snapshot_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.activate_meta_ads_claim_snapshot_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_meta_ads_claim_snapshot_v1(jsonb) TO service_role;

CREATE FUNCTION public.finalize_meta_ads_claim_job_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_base jsonb; v_result record;
BEGIN
  v_base := public.lock_meta_ads_completion_claim_v1(p_payload,true);
  SELECT * INTO STRICT v_result FROM public.finalize_media_sync_job(v_base);
  RETURN to_jsonb(v_result);
END;
$function$;
ALTER FUNCTION public.finalize_meta_ads_claim_job_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_meta_ads_claim_job_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_meta_ads_claim_job_v1(jsonb) TO service_role;
ROLLBACK;
