import type { SupabaseClient } from '@supabase/supabase-js';

import { TTL_MS } from '../cache/contract';
import type { CacheStore, Claim } from '../cache/contract';
import { fail } from './http';

const MIN_REFRESH_AHEAD_MS = 5 * 60 * 1000;
const MAX_REFRESH_AHEAD_MS = TTL_MS - MIN_REFRESH_AHEAD_MS;

export function createSupabaseDueCacheStore(
  client: Pick<SupabaseClient, 'rpc'>,
  refreshAheadMs: number,
): CacheStore {
  if (
    !Number.isSafeInteger(refreshAheadMs) ||
    refreshAheadMs < MIN_REFRESH_AHEAD_MS ||
    refreshAheadMs > MAX_REFRESH_AHEAD_MS
  ) {
    fail('INVALID_INPUT');
  }

  return {
    async claim(input, signal) {
      if (signal.aborted) fail('ABORTED');

      const { data, error } = await client
        .rpc('claim_creative_metadata_cache_due_v1', {
          p_account_key: input.accountKey,
          p_keys: [...input.keys],
          p_max_requests: input.maxRequests,
          p_refresh_ahead_ms: refreshAheadMs,
        })
        .abortSignal(signal);

      if (signal.aborted) fail('ABORTED');
      if (error || !data) fail('DEPENDENCY_ERROR');

      return data as Claim;
    },

    async finish(input, signal) {
      if (signal.aborted) fail('ABORTED');

      const { data, error } = await client
        .rpc('finish_creative_metadata_cache_v1', {
          p_account_key: input.accountKey,
          p_token: input.token,
          p_entries: input.entries,
          p_outcome: input.outcome,
        })
        .abortSignal(signal);

      if (signal.aborted) fail('ABORTED');
      if (error || typeof data !== 'boolean') fail('DEPENDENCY_ERROR');

      return data;
    },
  };
}
