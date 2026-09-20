import {
  createMetaAdsCanonicalRowValidator,
  MetaAdsCanonicalError,
  type MetaAdsCanonicalContext,
  type MetaAdsCanonicalRowValidator,
  validateMetaAdsCanonicalContext,
} from "./meta-ads-canonical-row";
import type { EtrylueNormalizedMediaRow } from "./types";

export const META_ADS_STAGING_KEY_NAMESPACE = "meta_ads_ad_daily_v1" as const;

export type MetaAdsPreparedStagingRow = Readonly<{
  row_index: number;
  row_key: string;
  date: string;
  channel: string;
  device: "";
  source: string;
  row: EtrylueNormalizedMediaRow;
}>;

function key(row: EtrylueNormalizedMediaRow): string {
  // Names and metrics never participate in row identity.
  return JSON.stringify([
    META_ADS_STAGING_KEY_NAMESPACE, "meta_ads", "ad",
    row.external_account_id, row.external_campaign_id, row.external_group_id,
    row.external_ad_id, row.date,
  ]);
}

export function buildMetaAdsStagingRowKey(
  row: EtrylueNormalizedMediaRow,
  context: MetaAdsCanonicalContext,
): string {
  const validate: MetaAdsCanonicalRowValidator = createMetaAdsCanonicalRowValidator(context);
  validate(row);
  return key(row);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Preserve caller-assigned global indexes; never sort or restart a batch. */
export function prepareMetaAdsStagingBatch(input: Readonly<{
  context: MetaAdsCanonicalContext;
  rows: readonly EtrylueNormalizedMediaRow[];
  rowStartIndex: number;
}>): readonly MetaAdsPreparedStagingRow[] {
  if (!input || !Array.isArray(input.rows) || input.rows.length > 10_000 ||
      !Number.isSafeInteger(input.rowStartIndex) || input.rowStartIndex < 0 ||
      input.rowStartIndex > Number.MAX_SAFE_INTEGER - input.rows.length) {
    throw new MetaAdsCanonicalError("INVALID_INPUT", "Invalid Meta staging batch range.");
  }
  const validate: MetaAdsCanonicalRowValidator = createMetaAdsCanonicalRowValidator(input.context);
  const seen = new Set<string>();
  return deepFreeze(Array.from(input.rows, (row, index): MetaAdsPreparedStagingRow => {
    validate(row);
    const identity = JSON.stringify([row.external_account_id, row.external_ad_id, row.date]);
    if (seen.has(identity)) throw new MetaAdsCanonicalError("DUPLICATE_AD_DAY", "Duplicate ad/day in a batch.");
    seen.add(identity);
    return {
      row_index: input.rowStartIndex + index, row_key: key(row), date: row.date,
      channel: row.channel, source: row.source, device: "", row: structuredClone(row),
    };
  }));
}

/** Validate declared collection scope against the execution, including empty batches. */
export function assertMetaAdsStagingContextScope(
  context: MetaAdsCanonicalContext,
  job: { external_account_id: string; date_from: string; date_to: string },
): void {
  const validated = validateMetaAdsCanonicalContext(context);
  if (validated.externalAccountId !== job.external_account_id ||
      validated.dateFrom !== job.date_from || validated.dateTo !== job.date_to) {
    throw new MetaAdsCanonicalError("SCOPE_MISMATCH", "Meta context does not match execution scope.");
  }
}

/**
 * Prepare a COMPLETE offline canonical dataset, not an API traversal page.
 * rawRows === totalRows === rows.length after zero suppression. Repeated calls
 * create independent datasets; this does not append to a DB or resumable job.
 * Workspace/advertiser/report authorization remains outside this pure contract.
 */
export function prepareMetaAdsStagingRows(input: Readonly<{
  context: MetaAdsCanonicalContext;
  rows: readonly EtrylueNormalizedMediaRow[];
}>): Readonly<{
  rows: readonly MetaAdsPreparedStagingRow[];
  totalRows: number;
  rawRows: number;
}> {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.rows)) {
    throw new MetaAdsCanonicalError("INVALID_INPUT", "A complete canonical dataset is required.");
  }
  const validate: MetaAdsCanonicalRowValidator = createMetaAdsCanonicalRowValidator(input.context);
  const seen = new Set<string>();
  const validated = Array.from(input.rows, (row) => {
    validate(row);
    const naturalIdentity = JSON.stringify([row.external_account_id, row.external_ad_id, row.date]);
    if (seen.has(naturalIdentity)) {
      throw new MetaAdsCanonicalError("DUPLICATE_AD_DAY", "The staging dataset contains duplicate ad/day facts.");
    }
    seen.add(naturalIdentity);
    // Detach nested metadata before freezing; never freeze or mutate the caller.
    return structuredClone(row);
  });
  validated.sort((a, b) => {
    const left = JSON.stringify([a.date, a.external_account_id, a.external_ad_id]);
    const right = JSON.stringify([b.date, b.external_account_id, b.external_ad_id]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const rows = validated.map((row, index): MetaAdsPreparedStagingRow => ({
    row_index: index, row_key: key(row), date: row.date,
    channel: row.channel, device: "", source: row.source, row,
  }));
  return deepFreeze({ rows, totalRows: rows.length, rawRows: rows.length });
}
