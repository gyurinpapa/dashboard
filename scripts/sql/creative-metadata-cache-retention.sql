-- ISOLATED ADD-ON CANDIDATE ONLY. NOT A PRODUCTION MIGRATION.
-- Original claim/finish RPCs and cache-schema.sql are unchanged.
BEGIN;
DO $$ BEGIN
 IF current_setting('etrylue.creative_cache_sandbox',true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'SANDBOX_ONLY_NOT_A_PRODUCTION_MIGRATION';
 END IF;
END $$;

CREATE FUNCTION public.prune_creative_metadata_cache_v1(
 p_after_account_key text DEFAULT NULL,
 p_account_limit integer DEFAULT 50,
 p_entry_limit integer DEFAULT 500
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
 SET search_path='' SET lock_timeout='500ms' SET statement_timeout='2000ms'
AS $$
DECLARE
 keys text[]; k text; a etrylue_creative_cache_v1.accounts%rowtype;
 n timestamptz; scanned integer:=0; skipped integer:=0; active integer:=0;
 removed_entries integer:=0; removed_accounts integer:=0; changed integer:=0;
 next_key text; more boolean:=false;
BEGIN
 IF (p_after_account_key IS NOT NULL AND p_after_account_key !~ '^[0-9a-f]{64}$')
  OR p_account_limit IS NULL OR p_account_limit NOT BETWEEN 1 AND 100
  OR p_entry_limit IS NULL OR p_entry_limit NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'INVALID_RETENTION_INPUT';
 END IF;
 -- Bounded keyset page, including one lookahead key; no full-table expiry scan.
 SELECT coalesce(array_agg(q.account_key ORDER BY q.account_key),'{}'::text[]) INTO keys
 FROM (SELECT account_key FROM etrylue_creative_cache_v1.accounts
       WHERE account_key>coalesce(p_after_account_key,'')
       ORDER BY account_key LIMIT p_account_limit+1) q;
 more:=cardinality(keys)>p_account_limit;
 FOREACH k IN ARRAY keys[1:p_account_limit] LOOP
  -- Resume before unprocessed accounts when the global delete budget is spent.
  IF removed_entries>=p_entry_limit THEN more:=true;EXIT;END IF;
  scanned:=scanned+1; next_key:=k;
  -- Same account-first lock order as claim/finish. Do not wait for active writers.
  SELECT * INTO a FROM etrylue_creative_cache_v1.accounts
   WHERE account_key=k FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN skipped:=skipped+1;CONTINUE;END IF;
  n:=clock_timestamp();
  IF a.lease_until>n THEN active:=active+1;CONTINUE;END IF;
  -- Preserve all material on an account whose shared cooldown still applies.
  IF a.next_allowed_at>n THEN CONTINUE;END IF;
  IF removed_entries<p_entry_limit THEN
   DELETE FROM etrylue_creative_cache_v1.entries e
   WHERE (e.account_key,e.cache_key) IN (
    SELECT x.account_key,x.cache_key FROM etrylue_creative_cache_v1.entries x
    WHERE x.account_key=k AND x.expires_at<n-interval '24 hours'
    ORDER BY x.expires_at,x.cache_key
    LIMIT least(100,p_entry_limit-removed_entries)
    FOR UPDATE SKIP LOCKED
   );
   GET DIAGNOSTICS changed=ROW_COUNT;
   removed_entries:=removed_entries+changed;
  END IF;
  -- No last-access claim: window_start is the actual last budget-window anchor.
  -- A seven-day-old anchor, expired lease/cooldown and no entries are all required.
  -- Never delete a current hourly reservation to make room for new API calls.
  IF a.window_start<n-interval '7 days'
   AND NOT EXISTS(SELECT 1 FROM etrylue_creative_cache_v1.entries WHERE account_key=k) THEN
   DELETE FROM etrylue_creative_cache_v1.accounts WHERE account_key=k;
   GET DIAGNOSTICS changed=ROW_COUNT;
   removed_accounts:=removed_accounts+changed;
  END IF;
 END LOOP;
 RETURN jsonb_build_object(
  'scannedAccounts',scanned,'skippedLockedAccounts',skipped,'activeLeaseAccounts',active,
  'deletedEntries',removed_entries,'deletedAccounts',removed_accounts,
  'nextCursor',CASE WHEN more THEN next_key ELSE NULL END,
  'sweepComplete',NOT more
 );
END;
$$;
-- Backend only. Existing browser table/RPC grants remain revoked.
GRANT DELETE ON etrylue_creative_cache_v1.accounts TO service_role;
REVOKE ALL ON FUNCTION public.prune_creative_metadata_cache_v1(text,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_creative_metadata_cache_v1(text,integer,integer)
 TO service_role;
COMMIT;
