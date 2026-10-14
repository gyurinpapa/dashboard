import { fetchNaverSearchAdsCampaignPage, fetchNaverSearchAdsEntityDailyStats, NaverSearchAdsApiError } from './naver-searchads-api';
import type { NaverSearchAdsCredentials } from './connection-credentials';
import type { MediaSyncJobRecord } from './types';

export type CampaignDailyAuthority = {
  version: 1; campaign_id: string; date: string;
  impressions: number; clicks: number; cost: number; conversions: number; revenue: number;
  observed_at: string;
};

async function readWithRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await read(); }
    catch (error) {
      const transient = error instanceof NaverSearchAdsApiError &&
        (error.code === 'REQUEST_TIMEOUT' || error.code === 'NETWORK_ERROR' || error.status === 429 || (error.status ?? 0) >= 500);
      if (!transient || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

/** Reject incomplete daily responses; a missing date is not evidence of zero activity. */
export async function collectNaverCampaignAuthority(
  input: { credentials: NaverSearchAdsCredentials; dateFrom: string; dateTo: string },
  dependencies = { campaigns: fetchNaverSearchAdsCampaignPage, stats: fetchNaverSearchAdsEntityDailyStats },
): Promise<CampaignDailyAuthority[]> {
  const campaigns = new Map<string, string | null>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await readWithRetry(() => dependencies.campaigns({ credentials: input.credentials, baseSearchId: cursor, recordSize: 1000 }));
    for (const campaign of page.records) {
      if (campaigns.has(campaign.id)) throw new Error('Duplicate Naver campaign in authority discovery.');
      campaigns.set(campaign.id, campaign.campaignType);
    }
    cursor = page.nextBaseSearchId;
    if (cursor && cursors.has(cursor)) throw new Error('Naver campaign discovery cursor did not advance.');
    if (cursor) cursors.add(cursor);
  } while (cursor);

  const dates: string[] = [];
  for (let day = input.dateFrom; day <= input.dateTo;) {
    dates.push(day);
    day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  const result: CampaignDailyAuthority[] = [];
  // Only WEB_SITE used registered keyword totals as summary authority. Other products
  // retain their existing grain and brand-search contract cost handling.
  for (const [campaignId, type] of campaigns) {
    if (type !== 'WEB_SITE') continue;
    for (let offset = 0; offset < dates.length; offset += 31) {
      const window = dates.slice(offset, offset + 31);
      const response = await readWithRetry(() => dependencies.stats({ credentials: input.credentials, entityId: campaignId,
        entityType: 'campaign', dateFrom: window[0], dateTo: window[window.length - 1] }));
      const observedAt = new Date().toISOString();
      const seen = new Set<string>();
      for (const row of response.records) {
        if (!window.includes(row.date) || seen.has(row.date) || row.entityId !== campaignId ||
            row.entityType !== 'campaign' || row.periodStart !== row.date || row.periodEnd !== row.date)
          throw new Error('Invalid Naver campaign daily authority scope.');
        const metrics = [row.impCnt, row.clkCnt, row.salesAmt, row.ccnt, row.convAmt];
        if (metrics.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0))
          throw new Error('Incomplete Naver campaign daily authority metrics.');
        seen.add(row.date);
        result.push({ version: 1, campaign_id: campaignId, date: row.date, observed_at: observedAt,
          impressions: row.impCnt!, clicks: row.clkCnt!, cost: row.salesAmt!, conversions: row.ccnt!, revenue: row.convAmt! });
      }
      if (seen.size !== window.length) throw new Error('Incomplete Naver campaign daily authority dates.');
    }
  }
  return result;
}

/** Freeze source totals before fact projection; no detail rows or checkpoint counts change. */
export async function enrichNaverCampaignAuthority(input: {
  job: MediaSyncJobRecord; expectedRows: number; credentials: NaverSearchAdsCredentials;
}): Promise<void> {
  const { getSupabaseAdmin } = await import('../supabase/admin');
  const db = getSupabaseAdmin();
  const existing = await db.from('media_sync_staging_rows').select('id')
    .eq('job_id', input.job.id).not('row->provider_meta->campaign_daily_authority_v1', 'is', null).limit(1);
  if (existing.error) throw new Error('Unable to inspect Naver campaign authority staging.');
  if (existing.data?.length) return; // The atomic enrichment already completed on an earlier claim.
  const stats = await collectNaverCampaignAuthority({ credentials: input.credentials,
    dateFrom: input.job.date_from, dateTo: input.job.date_to });
  const applied = await db.rpc('enrich_naver_campaign_daily_authority', {
    p_job_id: input.job.id, p_started_at: input.job.started_at,
    p_expected_rows: input.expectedRows, p_stats: stats,
  });
  if (applied.error) throw new Error('Unable to persist complete Naver campaign authority staging.');
}
