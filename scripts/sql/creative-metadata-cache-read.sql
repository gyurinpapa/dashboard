-- Isolated candidate add-on. No migration or production execution authorization.
BEGIN;
DO $$ BEGIN
 IF current_setting('etrylue.creative_cache_sandbox',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'SANDBOX_ONLY_NOT_A_PRODUCTION_MIGRATION';END IF;
END $$;
CREATE FUNCTION public.read_creative_metadata_cache_v1(p_account_key text,p_keys text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET statement_timeout='2000ms' AS $$
BEGIN
 IF p_account_key IS NULL OR p_account_key !~ '^[0-9a-f]{64}$' OR p_keys IS NULL OR cardinality(p_keys) NOT BETWEEN 1 AND 20
 OR EXISTS(SELECT 1 FROM unnest(p_keys) k WHERE k IS NULL OR k !~ '^[0-9a-f]{64}$')
 OR (SELECT count(DISTINCT k) FROM unnest(p_keys) k)<>cardinality(p_keys) THEN RAISE EXCEPTION 'INVALID_CACHE_INPUT';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('key',cache_key,'metadata',payload,'expiresAt',floor(extract(epoch FROM expires_at)*1000)) ORDER BY cache_key),'[]'::jsonb)
 FROM etrylue_creative_cache_v1.entries WHERE account_key=p_account_key AND cache_key=ANY(p_keys) AND expires_at>statement_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.read_creative_metadata_cache_v1(text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_creative_metadata_cache_v1(text,text[]) TO service_role;
COMMIT;
