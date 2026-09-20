-- OFFLINE CANDIDATE ONLY. Not a migration or deployment script.
-- Dependency: the previously verified Meta staging SQL candidate, unchanged.
-- Same-claim process restart only. No reclaim, worker, counters or activation.
-- Checksum text is decoded and compared, not treated as authorization.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $guard$
BEGIN
  IF to_regclass('public.meta_ads_page_checkpoints') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('load_meta_ads_page_checkpoint_v1',
      'compare_and_set_meta_ads_page_checkpoint_v1','append_meta_ads_checkpoint_page_v1')) THEN
    RAISE EXCEPTION 'META_PAGE_OBJECT_ALREADY_EXISTS';
  END IF;
  IF to_regprocedure('public.append_media_sync_staging_batch(jsonb)') IS NULL
    OR to_regprocedure('public.meta_ads_row_shape_valid(jsonb,text,date,date)') IS NULL
    OR to_regprocedure('public.meta_ads_canonical_row_key(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'META_PAGE_DEPENDENCY_MISSING';
  END IF;
END;
$guard$;

CREATE TABLE public.meta_ads_page_checkpoints (
  job_id uuid PRIMARY KEY REFERENCES public.media_sync_jobs(id) ON DELETE CASCADE,
  storage_key text NOT NULL CHECK (storage_key ~ '^[a-f0-9]{64}$'),
  scope text NOT NULL CHECK (scope ~ '^[a-f0-9]{64}$'),
  scope_document jsonb NOT NULL CHECK (jsonb_typeof(scope_document)='object'),
  collector_scope text NOT NULL CHECK (collector_scope ~ '^[a-f0-9]{64}$'),
  checkpoint jsonb NOT NULL CHECK (jsonb_typeof(checkpoint)='object' AND octet_length(checkpoint::text)<=33554432),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.meta_ads_page_checkpoints OWNER TO postgres;
ALTER TABLE public.meta_ads_page_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_page_checkpoints FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_ads_page_checkpoints FROM PUBLIC, anon, authenticated, service_role;
-- No direct service_role table writes. Only the three restricted functions below.

CREATE FUNCTION public.load_meta_ads_page_checkpoint_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  j public.media_sync_jobs%rowtype; stored public.meta_ads_page_checkpoints%rowtype;
  doc jsonb; ident jsonb; ctx jsonb; opts jsonb; policy jsonb; k text; value numeric;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100663296
    OR jsonb_typeof(p_payload->'scope_text') IS DISTINCT FROM 'string'
    OR octet_length(p_payload->>'scope_text')>65536
    OR jsonb_typeof(p_payload->'collector_text') IS DISTINCT FROM 'string'
    OR octet_length(p_payload->>'collector_text')>65536 THEN RAISE EXCEPTION 'META_PAGE_INPUT_INVALID'; END IF;
  doc := (p_payload->>'scope_text')::jsonb;
  IF doc->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(doc->'identity') IS DISTINCT FROM 'object'
    OR jsonb_typeof(doc->'context') IS DISTINCT FROM 'object'
    OR jsonb_typeof(doc->'options') IS DISTINCT FROM 'object'
    OR doc-array['version','identity','context','options'] <> '{}'::jsonb
    OR encode(extensions.digest(convert_to(p_payload->>'scope_text','UTF8'),'sha256'),'hex') IS DISTINCT FROM p_payload->>'scope'
    OR p_payload->>'storage_key' IS DISTINCT FROM encode(extensions.digest(
      convert_to('meta_page_checkpoint_store_v1:'||((p_payload->>'job_id')::uuid)::text,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'META_PAGE_SCOPE_INVALID';
  END IF;
  ident := doc->'identity'; ctx := doc->'context'; opts := doc->'options';
  IF NOT (ident ?& array['id','workspace_id','advertiser_id','report_id','connection_id','created_by',
    'external_account_id','date_from','date_to','previous_ingestion_id','created_at','attempt_count','started_at'])
    OR ident-array['id','workspace_id','advertiser_id','report_id','connection_id','created_by',
    'external_account_id','date_from','date_to','previous_ingestion_id','created_at','attempt_count','started_at'] <> '{}'::jsonb
    OR ident->>'id' IS DISTINCT FROM p_payload->>'job_id' THEN RAISE EXCEPTION 'META_PAGE_SCOPE_INVALID'; END IF;
  -- Lock order is always job -> checkpoint -> staging. The job lock covers a
  -- missing checkpoint too, serializing initialization without an advisory lock.
  SELECT * INTO j FROM public.media_sync_jobs WHERE id=(p_payload->>'job_id')::uuid FOR UPDATE;
  IF j.id IS NULL OR j.provider IS DISTINCT FROM 'meta_ads' OR j.status IS DISTINCT FROM 'processing'
    OR j.data_level IS DISTINCT FROM 'creative' OR j.mode IS DISTINCT FROM 'snapshot_replace'
    OR j.finished_at IS NOT NULL OR j.error IS NOT NULL OR j.failed_rows<>0
    OR j.execution_contract IS NOT NULL OR j.automation_contract IS NOT NULL OR j.sync_segment_progress IS NOT NULL
    OR j.attempt_count<1 OR j.started_at IS NULL
    OR j.attempt_count IS DISTINCT FROM (ident->>'attempt_count')::integer
    OR j.started_at IS DISTINCT FROM (ident->>'started_at')::timestamptz THEN RAISE EXCEPTION 'META_PAGE_CLAIM_INVALID'; END IF;
  IF j.workspace_id IS DISTINCT FROM (ident->>'workspace_id')::uuid
    OR j.advertiser_id IS DISTINCT FROM (ident->>'advertiser_id')::uuid
    OR j.report_id IS DISTINCT FROM (ident->>'report_id')::uuid
    OR j.connection_id IS DISTINCT FROM (ident->>'connection_id')::uuid
    OR j.created_by IS DISTINCT FROM (ident->>'created_by')::uuid
    OR j.created_at IS DISTINCT FROM (ident->>'created_at')::timestamptz
    OR j.previous_ingestion_id IS DISTINCT FROM (ident->>'previous_ingestion_id')::uuid
    OR j.external_account_id IS DISTINCT FROM ident->>'external_account_id'
    OR j.date_from IS DISTINCT FROM (ident->>'date_from')::date OR j.date_to IS DISTINCT FROM (ident->>'date_to')::date
    OR j.raw_rows<>j.normalized_rows OR j.raw_rows<>j.inserted_rows THEN RAISE EXCEPTION 'META_PAGE_SCOPE_INVALID'; END IF;
  IF j.snapshot_ingestion_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.media_sync_report_projections p
    WHERE p.media_sync_job_id=j.id) THEN RAISE EXCEPTION 'META_PAGE_STAGING_FROZEN'; END IF;
  IF NOT (opts ?& array['pageSize','maxPages','maxRecords','maxRetries','requestTimeoutMs','maxResponseBytes'])
    OR opts-array['pageSize','maxPages','maxRecords','maxRetries','requestTimeoutMs','maxResponseBytes'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'META_PAGE_OPTIONS_INVALID'; END IF;
  FOR k IN SELECT jsonb_object_keys(opts) LOOP
    IF jsonb_typeof(opts->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'META_PAGE_OPTIONS_INVALID'; END IF;
    value := (opts->>k)::numeric;
    IF value<>trunc(value) OR value<(CASE WHEN k='maxRetries' THEN 0 WHEN k='maxResponseBytes' THEN 128 ELSE 1 END)
      OR value>(CASE k WHEN 'pageSize' THEN 2000 WHEN 'maxPages' THEN 1000 WHEN 'maxRecords' THEN 100000
      WHEN 'maxRetries' THEN 3 WHEN 'requestTimeoutMs' THEN 30000 ELSE 8388608 END) THEN RAISE EXCEPTION 'META_PAGE_OPTIONS_INVALID'; END IF;
  END LOOP;
  IF NOT (ctx ?& array['apiVersion','level','timeIncrement','breakdowns','actionBreakdowns','externalAccountId','dateFrom','dateTo','currency','timeZone','metricPolicy'])
    OR ctx-array['apiVersion','level','timeIncrement','breakdowns','actionBreakdowns','externalAccountId','dateFrom','dateTo','currency','timeZone','metricPolicy'] <> '{}'::jsonb
    OR ctx->>'externalAccountId' IS DISTINCT FROM j.external_account_id
    OR ctx->>'dateFrom' IS DISTINCT FROM j.date_from::text OR ctx->>'dateTo' IS DISTINCT FROM j.date_to::text
    OR ctx->>'apiVersion' IS DISTINCT FROM 'v26.0' OR ctx->>'level' IS DISTINCT FROM 'ad'
    OR ctx->'timeIncrement' IS DISTINCT FROM '1'::jsonb OR ctx->'breakdowns' IS DISTINCT FROM '[]'::jsonb
    OR ctx->'actionBreakdowns' IS DISTINCT FROM '[]'::jsonb
    OR ctx->>'currency' IS NULL OR ctx->>'currency' !~ '^[A-Z]{3}$'
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=ctx->>'timeZone')
    OR jsonb_typeof(ctx->'metricPolicy') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'META_PAGE_CONTEXT_INVALID'; END IF;
  policy := ctx->'metricPolicy';
  IF NOT (policy ?& array['conversionActionType','revenueActionType','actionReportTime','attributionWindows'])
    OR policy-array['conversionActionType','revenueActionType','actionReportTime','attributionWindows'] <> '{}'::jsonb
    OR jsonb_typeof(policy->'attributionWindows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'META_PAGE_POLICY_INVALID'; END IF;
  FOREACH k IN ARRAY array['conversionActionType','revenueActionType','actionReportTime'] LOOP
    IF jsonb_typeof(policy->k) IS DISTINCT FROM 'string' OR length(policy->>k) NOT BETWEEN 1 AND 2000
      OR btrim(policy->>k) IS DISTINCT FROM policy->>k OR policy->>k ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'META_PAGE_POLICY_INVALID'; END IF;
  END LOOP;
  IF jsonb_array_length(policy->'attributionWindows')=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'attributionWindows') x WHERE jsonb_typeof(x.value)<>'string'
      OR length(x.value#>>'{}') NOT BETWEEN 1 AND 2000 OR btrim(x.value#>>'{}') IS DISTINCT FROM x.value#>>'{}'
      OR x.value#>>'{}' ~ '[[:cntrl:]]')
    OR (SELECT count(DISTINCT x.value) FROM jsonb_array_elements(policy->'attributionWindows') x)<>jsonb_array_length(policy->'attributionWindows') THEN
    RAISE EXCEPTION 'META_PAGE_POLICY_INVALID'; END IF;
  IF (p_payload->>'collector_text')::jsonb IS DISTINCT FROM jsonb_build_object('context',ctx,
      'pageSize',opts->'pageSize','maxPages',opts->'maxPages','maxRecords',opts->'maxRecords')
    OR encode(extensions.digest(convert_to(p_payload->>'collector_text','UTF8'),'sha256'),'hex') IS DISTINCT FROM p_payload->>'collector_scope' THEN
    RAISE EXCEPTION 'META_PAGE_SCOPE_INVALID'; END IF;
  SELECT * INTO stored FROM public.meta_ads_page_checkpoints WHERE job_id=j.id FOR UPDATE;
  IF stored.job_id IS NULL THEN
    IF j.inserted_rows<>0 OR EXISTS(SELECT 1 FROM public.media_sync_staging_rows WHERE job_id=j.id) THEN
      RAISE EXCEPTION 'META_PAGE_CHECKPOINT_MISSING'; END IF;
    RETURN NULL;
  END IF;
  IF stored.storage_key IS DISTINCT FROM p_payload->>'storage_key' OR stored.scope IS DISTINCT FROM p_payload->>'scope'
    OR stored.scope_document IS DISTINCT FROM doc OR stored.collector_scope IS DISTINCT FROM p_payload->>'collector_scope'
    OR j.inserted_rows>(stored.checkpoint->>'totalRows')::integer THEN RAISE EXCEPTION 'META_PAGE_SCOPE_DRIFT'; END IF;
  RETURN stored.checkpoint;
END;
$function$;
ALTER FUNCTION public.load_meta_ads_page_checkpoint_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.load_meta_ads_page_checkpoint_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_meta_ads_page_checkpoint_v1(jsonb) TO service_role;

CREATE FUNCTION public.compare_and_set_meta_ads_page_checkpoint_v1(p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  old jsonb; nxt jsonb; doc jsonb; ctx jsonb; opts jsonb; pend jsonb; cur jsonb; expected jsonb;
  item jsonb; k text; amount numeric; idx integer; n integer; total integer; fetched integer; pages integer;
  stage_count bigint; stage_min bigint; stage_max bigint; j_id uuid; tz_names text[]; row_authority jsonb;
BEGIN
  old := public.load_meta_ads_page_checkpoint_v1(p_payload); -- retains both locks until transaction end
  j_id := (p_payload->>'job_id')::uuid;
  IF NOT (p_payload ? 'expected_revision') THEN RAISE EXCEPTION 'META_PAGE_REVISION_INVALID'; END IF;
  IF old IS NULL THEN
    IF p_payload->'expected_revision' IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
    old := jsonb_build_object('version',1,'scope',p_payload->>'scope','revision',0,'phase','collecting',
      'nextRowIndex',0,'totalRows',0,'fetchedRows',0,'completedPages',0,'cursor',NULL,'pending',NULL);
  ELSE
    IF jsonb_typeof(p_payload->'expected_revision') IS DISTINCT FROM 'number'
      OR p_payload->'expected_revision' IS DISTINCT FROM old->'revision' THEN RETURN false; END IF;
  END IF;
  nxt := p_payload->'next'; doc := (p_payload->>'scope_text')::jsonb; ctx := doc->'context'; opts := doc->'options';
  IF jsonb_typeof(nxt) IS DISTINCT FROM 'object' OR octet_length(nxt::text)>33554432
    OR NOT (nxt ?& array['version','scope','revision','digest','phase','nextRowIndex','totalRows','fetchedRows','completedPages','cursor','pending'])
    OR nxt-array['version','scope','revision','digest','phase','nextRowIndex','totalRows','fetchedRows','completedPages','cursor','pending'] <> '{}'::jsonb
    OR jsonb_typeof(p_payload->'checkpoint_text') IS DISTINCT FROM 'string'
    OR octet_length(p_payload->>'checkpoint_text')>33554432
    OR (p_payload->>'checkpoint_text')::jsonb IS DISTINCT FROM jsonb_build_object('namespace','meta_page_checkpoint_v1','body',nxt-'digest')
    OR encode(extensions.digest(convert_to(p_payload->>'checkpoint_text','UTF8'),'sha256'),'hex') IS DISTINCT FROM nxt->>'digest'
    OR nxt->'version' IS DISTINCT FROM '1'::jsonb OR nxt->>'scope' IS DISTINCT FROM p_payload->>'scope' THEN
    RAISE EXCEPTION 'META_PAGE_CHECKPOINT_INVALID'; END IF;
  FOREACH k IN ARRAY array['revision','nextRowIndex','totalRows','fetchedRows','completedPages'] LOOP
    IF jsonb_typeof(nxt->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'META_PAGE_COUNTER_INVALID'; END IF;
    amount := (nxt->>k)::numeric;
    IF amount<0 OR amount>100000 OR amount<>trunc(amount) THEN RAISE EXCEPTION 'META_PAGE_COUNTER_INVALID'; END IF;
  END LOOP;
  IF (nxt->>'revision')::integer<>(old->>'revision')::integer+1
    OR nxt->'nextRowIndex' IS DISTINCT FROM nxt->'totalRows'
    OR (nxt->>'totalRows')::integer>(nxt->>'fetchedRows')::integer
    OR (nxt->>'fetchedRows')::integer>(opts->>'maxRecords')::integer
    OR (nxt->>'completedPages')::integer>(opts->>'maxPages')::integer THEN RAISE EXCEPTION 'META_PAGE_TRANSITION_INVALID'; END IF;
  SELECT count(*),min(s.row_index),max(s.row_index) INTO stage_count,stage_min,stage_max
    FROM public.media_sync_staging_rows s WHERE s.job_id=j_id;
  IF stage_count>0 AND (stage_min<>0 OR stage_max<>stage_count-1) THEN RAISE EXCEPTION 'META_PAGE_STAGING_GAP'; END IF;
  IF old->>'phase'='collecting' THEN
    IF nxt->>'phase' IS DISTINCT FROM 'pending' OR nxt-array['revision','digest','phase','pending'] IS DISTINCT FROM old-array['revision','digest','phase','pending']
      OR stage_count<>(old->>'totalRows')::integer THEN RAISE EXCEPTION 'META_PAGE_TRANSITION_INVALID'; END IF;
    pend := nxt->'pending';
    IF jsonb_typeof(pend) IS DISTINCT FROM 'object' OR NOT (pend ?& array['id','rows','nextCursor','fetchedRows','completedPageCount'])
      OR pend-array['id','rows','nextCursor','fetchedRows','completedPageCount'] <> '{}'::jsonb
      OR jsonb_typeof(pend->'rows') IS DISTINCT FROM 'array'
      OR jsonb_typeof(pend->'fetchedRows') IS DISTINCT FROM 'number'
      OR jsonb_typeof(pend->'completedPageCount') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_payload->'pending_text') IS DISTINCT FROM 'string'
      OR octet_length(p_payload->>'pending_text')>33554432
      OR (p_payload->>'pending_text')::jsonb IS DISTINCT FROM jsonb_build_object('namespace','meta_prepared_page_v1',
        'scope',p_payload->>'scope','baseRevision',old->'revision','rowStartIndex',old->'nextRowIndex','page',pend-'id')
      OR encode(extensions.digest(convert_to(p_payload->>'pending_text','UTF8'),'sha256'),'hex') IS DISTINCT FROM pend->>'id' THEN
      RAISE EXCEPTION 'META_PAGE_PENDING_INVALID'; END IF;
    n := jsonb_array_length(pend->'rows'); amount := (pend->>'fetchedRows')::numeric;
    pages := (old->>'completedPages')::integer+1;
    IF amount<>trunc(amount) OR amount<n OR amount>(opts->>'pageSize')::integer
      OR (pend->>'completedPageCount')::numeric<>pages OR pages>(opts->>'maxPages')::integer
      OR (old->>'fetchedRows')::integer+amount>(opts->>'maxRecords')::integer THEN RAISE EXCEPTION 'META_PAGE_PENDING_INVALID'; END IF;
    cur := pend->'nextCursor'; fetched := (old->>'fetchedRows')::integer+amount::integer;
    IF cur <> 'null'::jsonb THEN
      IF jsonb_typeof(cur) IS DISTINCT FROM 'object' OR NOT (cur ?& array['version','scope','after','pageIndex','seenCursors','seenRows'])
        OR cur-array['version','scope','after','pageIndex','seenCursors','seenRows'] <> '{}'::jsonb
        OR cur->'version' IS DISTINCT FROM '1'::jsonb OR cur->>'scope' IS DISTINCT FROM p_payload->>'collector_scope'
        OR cur->'pageIndex' IS DISTINCT FROM to_jsonb(pages) OR pages>=(opts->>'maxPages')::integer
        OR jsonb_typeof(cur->'after') IS DISTINCT FROM 'string' OR length(cur->>'after') NOT BETWEEN 1 AND 4096
        OR cur->>'after' !~ '^[A-Za-z0-9_.~+/=-]+$'
        OR jsonb_typeof(cur->'seenCursors') IS DISTINCT FROM 'array' OR jsonb_typeof(cur->'seenRows') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'META_PAGE_CURSOR_INVALID'; END IF;
      FOREACH k IN ARRAY array['seenCursors','seenRows'] LOOP
        IF jsonb_array_length(cur->k)<>(CASE WHEN k='seenRows' THEN fetched ELSE pages END)
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(cur->k) x WHERE jsonb_typeof(x.value)<>'string' OR x.value#>>'{}' !~ '^[a-f0-9]{64}$')
          OR (SELECT count(DISTINCT x.value) FROM jsonb_array_elements(cur->k) x)<>jsonb_array_length(cur->k)
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(old->'cursor','null'::jsonb)->k,'[]'::jsonb)) WITH ORDINALITY x(value,pos)
            WHERE cur->k->(x.pos::integer-1) IS DISTINCT FROM x.value) THEN RAISE EXCEPTION 'META_PAGE_CURSOR_INVALID'; END IF;
      END LOOP;
      IF cur->'seenCursors'->>(pages-1) IS DISTINCT FROM encode(extensions.digest(convert_to(cur->>'after','UTF8'),'sha256'),'hex') THEN
        RAISE EXCEPTION 'META_PAGE_CURSOR_INVALID'; END IF;
    END IF;
    SELECT array_agg(name) INTO tz_names FROM pg_catalog.pg_timezone_names;
    idx := (old->>'nextRowIndex')::integer;
    FOR item IN SELECT value FROM jsonb_array_elements(pend->'rows') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& array['row_index','row_key','date','channel','device','source','row'])
        OR item-array['row_index','row_key','date','channel','device','source','row'] <> '{}'::jsonb
        OR item->'row_index' IS DISTINCT FROM to_jsonb(idx)
        OR NOT public.meta_ads_row_shape_valid(item->'row',ctx->>'externalAccountId',(ctx->>'dateFrom')::date,(ctx->>'dateTo')::date)
        OR NOT coalesce((item#>>'{row,provider_meta,time_zone}')=any(tz_names),false)
        OR item->>'row_key' IS DISTINCT FROM public.meta_ads_canonical_row_key(item->'row')
        OR item->>'date' IS DISTINCT FROM item#>>'{row,date}' OR item->>'device' IS DISTINCT FROM ''
        OR item->>'channel' IS DISTINCT FROM 'Meta Ads' OR item->>'source' IS DISTINCT FROM 'Meta Ads' THEN
        RAISE EXCEPTION 'META_PAGE_ROW_INVALID'; END IF;
      row_authority := (item#>'{row,provider_meta}')-'entity_id';
      IF row_authority->>'currency' IS DISTINCT FROM ctx->>'currency' OR row_authority->>'time_zone' IS DISTINCT FROM ctx->>'timeZone'
        OR row_authority->'metric_policy' IS DISTINCT FROM jsonb_build_object('conversion_action_type',ctx#>'{metricPolicy,conversionActionType}',
          'revenue_action_type',ctx#>'{metricPolicy,revenueActionType}','action_report_time',ctx#>'{metricPolicy,actionReportTime}',
          'attribution_windows',ctx#>'{metricPolicy,attributionWindows}') THEN RAISE EXCEPTION 'META_PAGE_CONTEXT_DRIFT'; END IF;
      k := encode(extensions.digest(convert_to(array_to_json(array[item#>>'{row,external_account_id}',item#>>'{row,external_ad_id}',item->>'date'])::text,'UTF8'),'sha256'),'hex');
      IF coalesce(old#>'{cursor,seenRows}','[]'::jsonb) ? k
        OR (cur<>'null'::jsonb AND NOT ((cur->'seenRows') ? k)) THEN RAISE EXCEPTION 'META_PAGE_ROW_DUPLICATE'; END IF;
      idx := idx+1;
    END LOOP;
    IF (SELECT count(DISTINCT (x.value#>>'{row,external_ad_id}',x.value->>'date')) FROM jsonb_array_elements(pend->'rows') x)<>n THEN
      RAISE EXCEPTION 'META_PAGE_ROW_DUPLICATE'; END IF;
  ELSIF old->>'phase'='pending' THEN
    pend := old->'pending'; n := jsonb_array_length(pend->'rows'); total := (old->>'totalRows')::integer+n;
    expected := (old-array['revision','digest','phase','pending','cursor','totalRows','nextRowIndex','fetchedRows','completedPages']) ||
      jsonb_build_object('revision',(old->>'revision')::integer+1,'phase',CASE WHEN pend->'nextCursor'<>'null'::jsonb THEN 'collecting'
      WHEN total>0 THEN 'collected' ELSE 'empty' END,'pending',NULL,'cursor',pend->'nextCursor','totalRows',total,'nextRowIndex',total,
      'fetchedRows',(old->>'fetchedRows')::integer+(pend->>'fetchedRows')::integer,'completedPages',pend->'completedPageCount');
    IF nxt-'digest' IS DISTINCT FROM expected OR p_payload->'pending_text' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'META_PAGE_TRANSITION_INVALID'; END IF;
    IF stage_count<>total OR EXISTS(SELECT 1 FROM jsonb_array_elements(pend->'rows') x
      LEFT JOIN public.media_sync_staging_rows s ON s.job_id=j_id AND s.row_index=(x.value->>'row_index')::bigint
      WHERE s.id IS NULL OR s.row IS DISTINCT FROM x.value->'row' OR s.row_key IS DISTINCT FROM x.value->>'row_key'
        OR s.date::text IS DISTINCT FROM x.value->>'date' OR s.channel IS DISTINCT FROM x.value->>'channel'
        OR s.device IS DISTINCT FROM x.value->>'device' OR s.source IS DISTINCT FROM x.value->>'source'
        OR s.row_fingerprint IS DISTINCT FROM encode(extensions.digest(convert_to(s.row::text,'UTF8'),'sha256'),'hex')) THEN
      RAISE EXCEPTION 'META_PAGE_APPEND_NOT_CONFIRMED'; END IF;
  ELSE RAISE EXCEPTION 'META_PAGE_TERMINAL_IMMUTABLE'; END IF;
  INSERT INTO public.meta_ads_page_checkpoints AS target(job_id,storage_key,scope,scope_document,collector_scope,checkpoint)
    VALUES(j_id,p_payload->>'storage_key',p_payload->>'scope',doc,p_payload->>'collector_scope',nxt)
    ON CONFLICT(job_id) DO UPDATE SET checkpoint=excluded.checkpoint,updated_at=statement_timestamp();
  RETURN true;
END;
$function$;
ALTER FUNCTION public.compare_and_set_meta_ads_page_checkpoint_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compare_and_set_meta_ads_page_checkpoint_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compare_and_set_meta_ads_page_checkpoint_v1(jsonb) TO service_role;

CREATE FUNCTION public.append_meta_ads_checkpoint_page_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE state jsonb; request jsonb; doc jsonb; ident jsonb; answer record;
BEGIN
  state := public.load_meta_ads_page_checkpoint_v1(p_payload);
  IF state IS NULL OR state->>'phase' IS DISTINCT FROM 'pending'
    OR p_payload->'expected_revision' IS DISTINCT FROM state->'revision'
    OR p_payload->>'pending_id' IS DISTINCT FROM state#>>'{pending,id}' THEN RAISE EXCEPTION 'META_PAGE_APPEND_CONFLICT'; END IF;
  request := p_payload->'append_payload'; doc := (p_payload->>'scope_text')::jsonb; ident := doc->'identity';
  IF jsonb_array_length(state#>'{pending,rows}')=0 OR request IS DISTINCT FROM jsonb_build_object(
    'job_id',ident->'id','report_id',ident->'report_id','workspace_id',ident->'workspace_id','advertiser_id',ident->'advertiser_id',
    'connection_id',ident->'connection_id','provider','meta_ads','external_account_id',ident->'external_account_id',
    'date_from',ident->'date_from','date_to',ident->'date_to','date_window_index',0,'rows',state#>'{pending,rows}') THEN
    RAISE EXCEPTION 'META_PAGE_APPEND_CONTENT_CONFLICT'; END IF;
  -- Job/claim and pending revision locks are retained across the existing RPC.
  -- Exceptions roll back the entire statement; never swallow append failures.
  SELECT * INTO STRICT answer FROM public.append_media_sync_staging_batch(request);
  RETURN to_jsonb(answer);
END;
$function$;
ALTER FUNCTION public.append_meta_ads_checkpoint_page_v1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.append_meta_ads_checkpoint_page_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_meta_ads_checkpoint_page_v1(jsonb) TO service_role;
ROLLBACK;
