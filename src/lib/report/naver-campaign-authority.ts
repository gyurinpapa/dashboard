/** Campaign totals are summary rows; keyword/ad rows remain available for detail tabs. */
type Row = Record<string, any>;
const REASON = 'naver_searchad_campaign_daily_stats_v1';
const FIELDS = ['impressions', 'clicks', 'cost', 'conversions', 'revenue'] as const;
export const NAVER_CAMPAIGN_AUTHORITY_META_KEY = 'campaign_daily_authority_v1';

function scope(row: Row): string | null {
  if (row.provider !== 'naver_searchad') return null;
  const values = [row.external_account_id, row.external_campaign_id, row.date];
  if (values.some(value => typeof value !== 'string' || !value.trim())) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  const timestamp = Date.parse(`${row.date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== row.date) return null;
  return JSON.stringify(values);
}

/** The carrier keeps the original detail metrics intact in staging, facts and snapshots. */
function authorityFromCarrier(row: Row): Row | null {
  const stats = row.provider_meta?.[NAVER_CAMPAIGN_AUTHORITY_META_KEY];
  if (!scope(row) || row.provider_meta?.campaign_type !== 'WEB_SITE' ||
      stats?.version !== 1 || stats.campaign_id !== row.external_campaign_id ||
      stats.date !== row.date ||
      !FIELDS.every(field => typeof stats[field] === 'number' && Number.isFinite(stats[field]) && stats[field] >= 0)) return null;
  return {
    ...row,
    ...Object.fromEntries(FIELDS.map(field => [field, stats[field]])),
    spend: stats.cost, ad_cost: stats.cost,
    row_level: 'unknown', data_level: 'unknown', row_level_reason: REASON,
    group: '', group_name: '', adgroup_name: '', external_group_id: '',
    keyword: '', keyword_name: '', external_keyword_id: '',
    creative: '', creative_name: '', external_creative_id: '', device: '',
    provider_meta: { ...row.provider_meta, entity_type: 'campaign', authoritative_grain: 'campaign' },
  };
}

function isAuthority(row: Row): boolean {
  return row.row_level_reason === REASON && row.row_level === 'unknown' &&
    row.provider_meta?.entity_type === 'campaign' &&
    row.provider_meta?.authoritative_grain === 'campaign' &&
    FIELDS.every(field => typeof row[field] === 'number' && Number.isFinite(row[field]) && row[field] >= 0);
}

/** Apply only explicit, unique authority rows, scoped to account/campaign/day. */
export function selectNaverCampaignAuthority<T extends Row>(legacyRows: T[], allRows: T[]): T[] {
  const authorities = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const source of allRows) {
    const row = (authorityFromCarrier(source) ?? source) as T;
    const key = scope(row);
    if (!key || !isAuthority(row)) continue;
    if (authorities.has(key)) ambiguous.add(key);
    else authorities.set(key, row);
  }
  for (const key of ambiguous) authorities.delete(key);
  const result = legacyRows.filter(row => {
    if (row.row_level_reason === REASON && row.provider === 'naver_searchad') return false;
    const key = scope(row);
    return !key || !authorities.has(key);
  });
  result.push(...authorities.values());
  return result;
}
