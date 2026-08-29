import {
  GOOGLE_ADS_API_VERSION,
} from "./google-ads-account-verification";
import {
  convertGoogleAdsDemandGenAdDailyStatsToCanonicalRows,
  type GoogleAdsDemandGenAdCanonicalAd,
  type GoogleAdsDemandGenAdCanonicalAdGroup,
  type GoogleAdsDemandGenAdCanonicalCampaign,
  type GoogleAdsDemandGenAdDailyStatsRecord,
} from "./google-ads-demand-gen-ad-canonical-row";
import {
  normalizeGoogleAdsCustomerId,
  normalizeOptionalGoogleAdsCustomerId,
} from "./google-ads-oauth-config";
import {
  isValidYmd,
  type EtrylueNormalizedMediaRow,
} from "./types";

const GOOGLE_ADS_API_BASE_URL =
  "https://googleads.googleapis.com";

const MAX_ACCESS_TOKEN_LENGTH =
  20_000;

const MAX_DEVELOPER_TOKEN_LENGTH =
  10_000;

const MAX_NAME_LENGTH =
  2_000;

const MAX_PAGE_TOKEN_LENGTH =
  20_000;

export const GOOGLE_ADS_DEMAND_GEN_AD_STATS_REQUEST_TIMEOUT_MS =
  30_000;

export const GOOGLE_ADS_DEMAND_GEN_AD_STATS_MAX_RETRIES =
  3;

export const GOOGLE_ADS_DEMAND_GEN_AD_STATS_MAX_PAGES =
  1_000;

/*
 * GoogleAdsService.Search currently has a fixed
 * page size of 10,000 rows.
 *
 * This constant is therefore a response-boundary
 * guard, not an independently chosen request size.
 */
export const GOOGLE_ADS_DEMAND_GEN_AD_STATS_PAGE_SIZE =
  10_000;

const GOOGLE_ADS_DEMAND_GEN_AD_STATS_BASE_RETRY_DELAY_MS =
  1_000;

const GOOGLE_ADS_DEMAND_GEN_AD_STATS_MAX_RETRY_DELAY_MS =
  30_000;

export type GoogleAdsDemandGenAdStatsCollectorErrorCode =
  | "INVALID_INPUT"
  | "REQUEST_TIMEOUT"
  | "REQUEST_FAILED"
  | "API_HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "PAGINATION_LOOP"
  | "PAGE_LIMIT_EXCEEDED"
  | "RETRY_EXHAUSTED";

export class GoogleAdsDemandGenAdStatsCollectorError
  extends Error {
  readonly code:
    GoogleAdsDemandGenAdStatsCollectorErrorCode;

  readonly status:
    number | null;

  readonly retryCount:
    number;

  constructor(
    code:
      GoogleAdsDemandGenAdStatsCollectorErrorCode,
    message: string,
    options?: ErrorOptions & {
      status?: number | null;
      retryCount?: number;
    },
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsDemandGenAdStatsCollectorError";

    this.code =
      code;

    this.status =
      options?.status ?? null;

    this.retryCount =
      options?.retryCount ?? 0;
  }
}

export type GoogleAdsDemandGenAdStatsCollectorInput =
  Readonly<{
    accessToken: string;
    developerToken: string;
    targetCustomerId: unknown;
    loginCustomerId?: unknown;
    startDate: unknown;
    endDate: unknown;
  }>;

export type GoogleAdsDemandGenAdStatsCollectorDependencies =
  Readonly<{
    fetchImpl?: typeof fetch;

    sleepImpl?: (
      delayMs: number,
    ) => Promise<void>;

    randomImpl?: () => number;
  }>;

export type GoogleAdsDemandGenAdStatsCollectorOptions =
  Readonly<{
    requestTimeoutMs?: number;
    maxRetries?: number;
    maxPages?: number;
  }>;

export type GoogleAdsDemandGenAdStatsPageCursor =
  Readonly<{
    version: 1;
    pageIndex: number;
    page: string;
  }>;

export type GoogleAdsDemandGenAdStatsPageCollectorInput =
  GoogleAdsDemandGenAdStatsCollectorInput &
    Readonly<{
      cursor?: unknown;
    }>;

export type GoogleAdsDemandGenAdStatsSearchRequest =
  Readonly<{
    endpoint: string;
    method: "POST";
    headers:
      Readonly<Record<string, string>>;
    body: string;
  }>;

export type GoogleAdsDemandGenAdStatsPageCollectionResult =
  Readonly<{
    rows:
      readonly EtrylueNormalizedMediaRow[];

    status:
      | "partial"
      | "completed";

    isComplete: boolean;

    cursor:
      GoogleAdsDemandGenAdStatsPageCursor |
      null;

    pageCount: 1;

    completedPageCount: number;

    requestCount: number;

    retryCount: number;
  }>;

type ParsedGoogleAdsDemandGenAdStatsRow =
  Readonly<{
    campaign:
      GoogleAdsDemandGenAdCanonicalCampaign;

    adGroup:
      GoogleAdsDemandGenAdCanonicalAdGroup;

    ad:
      GoogleAdsDemandGenAdCanonicalAd;

    record:
      GoogleAdsDemandGenAdDailyStatsRecord;
  }>;

type ParsedSearchPage =
  Readonly<{
    rows:
      readonly ParsedGoogleAdsDemandGenAdStatsRow[];

    nextPageToken:
      string | null;
  }>;

type NormalizedPageCursor =
  Readonly<{
    pageIndex: number;
    page: string | null;
  }>;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > maxLength
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeResponseString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > maxLength
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeId(
  value: unknown,
  fieldName: string,
): string {
  let normalized: string;

  if (typeof value === "string") {
    normalized =
      value.trim();
  } else if (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  ) {
    normalized =
      String(value);
  } else {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  if (
    !/^[1-9]\d*$/u.test(
      normalized,
    )
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeDate(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    normalizeResponseString(
      value,
      fieldName,
      10,
    );

  if (!isValidYmd(normalized)) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeInputDate(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    normalizeRequiredString(
      value,
      fieldName,
      10,
    );

  if (!isValidYmd(normalized)) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  return normalized;
}

function normalizeBoundedInteger(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function parseNonNegativeIntegerLike(
  value: unknown,
  fieldName: string,
): number {
  if (
    value === undefined ||
    value === null
  ) {
    return 0;
  }

  let parsed: bigint;

  try {
    if (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
    ) {
      parsed =
        BigInt(value);
    } else if (
      typeof value === "string" &&
      /^\d+$/u.test(
        value.trim(),
      )
    ) {
      parsed =
        BigInt(
          value.trim(),
        );
    } else {
      throw new Error(
        "invalid integer",
      );
    }
  } catch {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  if (
    parsed >
    BigInt(
      Number.MAX_SAFE_INTEGER,
    )
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} exceeds the safe numeric range.`,
    );
  }

  return Number(parsed);
}

function parseCostMicros(
  value: unknown,
): number {
  return (
    parseNonNegativeIntegerLike(
      value,
      "metrics.costMicros",
    ) /
    1_000_000
  );
}

function parseNonNegativeNumber(
  value: unknown,
  fieldName: string,
): number {
  if (
    value === undefined ||
    value === null
  ) {
    return 0;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim()
        ? Number(
            value,
          )
        : Number.NaN;

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return parsed;
}

function normalizePageToken(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Demand Gen ad nextPageToken is invalid.",
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      MAX_PAGE_TOKEN_LENGTH
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Demand Gen ad nextPageToken is invalid.",
    );
  }

  return normalized;
}

function normalizeCursor(
  value: unknown,
): NormalizedPageCursor {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      pageIndex:
        0,
      page:
        null,
    };
  }

  if (!isPlainObject(value)) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Demand Gen ad page cursor must be an object.",
    );
  }

  if (value.version !== 1) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Demand Gen ad page cursor version is invalid.",
    );
  }

  if (
    typeof value.pageIndex !==
      "number" ||
    !Number.isSafeInteger(
      value.pageIndex,
    ) ||
    value.pageIndex < 1
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Demand Gen ad page cursor index is invalid.",
    );
  }

  const page =
    normalizeRequiredString(
      value.page,
      "cursor.page",
      MAX_PAGE_TOKEN_LENGTH,
    );

  return {
    pageIndex:
      value.pageIndex,
    page,
  };
}

function normalizeCustomerIds(
  input:
    GoogleAdsDemandGenAdStatsCollectorInput,
): Readonly<{
  targetCustomerId: string;
  loginCustomerId: string | null;
}> {
  try {
    return {
      targetCustomerId:
        normalizeGoogleAdsCustomerId(
          input.targetCustomerId,
          "targetCustomerId",
        ),

      loginCustomerId:
        normalizeOptionalGoogleAdsCustomerId(
          input.loginCustomerId,
          "loginCustomerId",
        ),
    };
  } catch (error) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Demand Gen ad customer ID is invalid.",
      {
        cause:
          error,
      },
    );
  }
}

export function buildGoogleAdsDemandGenAdStatsQuery(
  input: Readonly<{
    startDate: unknown;
    endDate: unknown;
  }>,
): string {
  const startDate =
    normalizeInputDate(
      input.startDate,
      "startDate",
    );

  const endDate =
    normalizeInputDate(
      input.endDate,
      "endDate",
    );

  if (
    startDate >
    endDate
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      "startDate must not be later than endDate.",
    );
  }

  return [
    "SELECT",
    "  campaign.id,",
    "  campaign.name,",
    "  ad_group.id,",
    "  ad_group.name,",
    "  ad_group_ad.ad.id,",
    "  segments.date,",
    "  metrics.impressions,",
    "  metrics.clicks,",
    "  metrics.cost_micros,",
    "  metrics.conversions,",
    "  metrics.conversions_value",
    "FROM ad_group_ad",
    `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    "  AND campaign.advertising_channel_type = 'DEMAND_GEN'",
    "ORDER BY campaign.id, ad_group.id, ad_group_ad.ad.id, segments.date",
  ].join("\n");
}

export function buildGoogleAdsDemandGenAdStatsSearchRequest(
  input:
    GoogleAdsDemandGenAdStatsCollectorInput &
    Readonly<{
      pageToken?: unknown;
    }>,
): GoogleAdsDemandGenAdStatsSearchRequest {
  const accessToken =
    normalizeRequiredString(
      input.accessToken,
      "accessToken",
      MAX_ACCESS_TOKEN_LENGTH,
    );

  const developerToken =
    normalizeRequiredString(
      input.developerToken,
      "developerToken",
      MAX_DEVELOPER_TOKEN_LENGTH,
    );

  const {
    targetCustomerId,
    loginCustomerId,
  } =
    normalizeCustomerIds(
      input,
    );

  const query =
    buildGoogleAdsDemandGenAdStatsQuery(
      {
        startDate:
          input.startDate,
        endDate:
          input.endDate,
      },
    );

  const pageToken =
    input.pageToken === undefined ||
    input.pageToken === null ||
    input.pageToken === ""
      ? null
      : normalizeRequiredString(
          input.pageToken,
          "pageToken",
          MAX_PAGE_TOKEN_LENGTH,
        );

  const headers:
    Record<string, string> = {
      Accept:
        "application/json",

      Authorization:
        `Bearer ${accessToken}`,

      "Content-Type":
        "application/json",

      "developer-token":
        developerToken,
    };

  if (loginCustomerId) {
    headers[
      "login-customer-id"
    ] =
      loginCustomerId;
  }

  const body:
    Record<string, unknown> = {
      query,
    };

  if (pageToken) {
    body.pageToken =
      pageToken;
  }

  return Object.freeze({
    endpoint:
      `${GOOGLE_ADS_API_BASE_URL}/${GOOGLE_ADS_API_VERSION}` +
      `/customers/${targetCustomerId}/googleAds:search`,

    method:
      "POST",

    headers:
      Object.freeze(
        headers,
      ),

    body:
      JSON.stringify(
        body,
      ),
  });
}

function parseSearchRow(
  value: unknown,
  rowIndex: number,
): ParsedGoogleAdsDemandGenAdStatsRow {
  if (!isPlainObject(value)) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `results[${rowIndex}] must be an object.`,
    );
  }

  const campaign =
    value.campaign;

  const adGroup =
    value.adGroup;

  const adGroupAd =
    value.adGroupAd;

  const segments =
    value.segments;

  const metrics =
    value.metrics;

  if (
    !isPlainObject(campaign) ||
    !isPlainObject(adGroup) ||
    !isPlainObject(adGroupAd) ||
    !isPlainObject(segments) ||
    !isPlainObject(metrics)
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `results[${rowIndex}] has an invalid Google Ads resource shape.`,
    );
  }

  const ad =
    adGroupAd.ad;

  if (!isPlainObject(ad)) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      `results[${rowIndex}].adGroupAd.ad is invalid.`,
    );
  }

  const campaignId =
    normalizeId(
      campaign.id,
      `results[${rowIndex}].campaign.id`,
    );

  const campaignName =
    normalizeResponseString(
      campaign.name,
      `results[${rowIndex}].campaign.name`,
      MAX_NAME_LENGTH,
    );

  const adGroupId =
    normalizeId(
      adGroup.id,
      `results[${rowIndex}].adGroup.id`,
    );

  const adGroupName =
    normalizeResponseString(
      adGroup.name,
      `results[${rowIndex}].adGroup.name`,
      MAX_NAME_LENGTH,
    );

  const adId =
    normalizeId(
      ad.id,
      `results[${rowIndex}].adGroupAd.ad.id`,
    );

  const date =
    normalizeDate(
      segments.date,
      `results[${rowIndex}].segments.date`,
    );

  return {
    campaign: {
      id:
        campaignId,
      name:
        campaignName,
    },

    adGroup: {
      id:
        adGroupId,
      campaignId,
      name:
        adGroupName,
    },

    ad: {
      id:
        adId,
      adGroupId,
    },

    record: {
      date,
      adId,

      impressions:
        parseNonNegativeIntegerLike(
          metrics.impressions,
          `results[${rowIndex}].metrics.impressions`,
        ),

      clicks:
        parseNonNegativeIntegerLike(
          metrics.clicks,
          `results[${rowIndex}].metrics.clicks`,
        ),

      cost:
        parseCostMicros(
          metrics.costMicros,
        ),

      conversions:
        parseNonNegativeNumber(
          metrics.conversions,
          `results[${rowIndex}].metrics.conversions`,
        ),

      revenue:
        parseNonNegativeNumber(
          metrics.conversionsValue,
          `results[${rowIndex}].metrics.conversionsValue`,
        ),
    },
  };
}

function parseSearchResponse(
  value: unknown,
): ParsedSearchPage {
  if (!isPlainObject(value)) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Demand Gen ad response must be an object.",
    );
  }

  const rawResults =
    value.results === undefined
      ? []
      : value.results;

  if (!Array.isArray(rawResults)) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Demand Gen ad results must be an array.",
    );
  }

  return Object.freeze({
    rows:
      Object.freeze(
        rawResults.map(
          (
            row,
            rowIndex,
          ) =>
            parseSearchRow(
              row,
              rowIndex,
            ),
        ),
      ),

    nextPageToken:
      normalizePageToken(
        value.nextPageToken,
      ),
  });
}

function toCanonicalRows(
  externalAccountId: string,
  rows:
    readonly ParsedGoogleAdsDemandGenAdStatsRow[],
): EtrylueNormalizedMediaRow[] {
  type Group = {
    campaign:
      GoogleAdsDemandGenAdCanonicalCampaign;

    adGroup:
      GoogleAdsDemandGenAdCanonicalAdGroup;

    ad:
      GoogleAdsDemandGenAdCanonicalAd;

    records:
      GoogleAdsDemandGenAdDailyStatsRecord[];
  };

  const groups =
    new Map<string, Group>();

  for (const row of rows) {
    const key =
      JSON.stringify([
        row.campaign.id,
        row.adGroup.id,
        row.ad.id,
      ]);

    const existing =
      groups.get(
        key,
      );

    if (!existing) {
      groups.set(
        key,
        {
          campaign:
            row.campaign,
          adGroup:
            row.adGroup,
          ad:
            row.ad,
          records: [
            row.record,
          ],
        },
      );

      continue;
    }

    if (
      existing.campaign.name !==
        row.campaign.name ||
      existing.adGroup.name !==
        row.adGroup.name
    ) {
      throw new GoogleAdsDemandGenAdStatsCollectorError(
        "INVALID_RESPONSE",
        "Google Ads Demand Gen ad response repeated an entity with inconsistent names.",
      );
    }

    existing.records.push(
      row.record,
    );
  }

  const canonicalRows:
    EtrylueNormalizedMediaRow[] = [];

  for (
    const group
    of groups.values()
  ) {
    canonicalRows.push(
      ...convertGoogleAdsDemandGenAdDailyStatsToCanonicalRows(
        {
          externalAccountId,

          campaign:
            group.campaign,

          adGroup:
            group.adGroup,

          ad:
            group.ad,

          records:
            group.records,
        },
      ),
    );
  }

  canonicalRows.sort(
    (
      left,
      right,
    ) => {
      const leftKey =
        [
          left.external_campaign_id ?? "",
          left.external_group_id ?? "",
          left.external_creative_id ?? "",
          left.date,
        ].join("\u0000");

      const rightKey =
        [
          right.external_campaign_id ?? "",
          right.external_group_id ?? "",
          right.external_creative_id ?? "",
          right.date,
        ].join("\u0000");

      return leftKey.localeCompare(
        rightKey,
      );
    },
  );

  return canonicalRows;
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name ===
      "AbortError"
  );
}

async function executeSearchPage(
  request:
    GoogleAdsDemandGenAdStatsSearchRequest,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number,
): Promise<ParsedSearchPage> {
  const abortController =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        abortController.abort();
      },
      requestTimeoutMs,
    );

  try {
    let response: Response;

    try {
      response =
        await fetchImpl(
          request.endpoint,
          {
            method:
              request.method,

            headers:
              request.headers,

            body:
              request.body,

            signal:
              abortController.signal,
          },
        );
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(
          error,
        )
      ) {
        throw new GoogleAdsDemandGenAdStatsCollectorError(
          "REQUEST_TIMEOUT",
          "Google Ads Demand Gen ad request timed out.",
          {
            cause:
              error,
          },
        );
      }

      throw new GoogleAdsDemandGenAdStatsCollectorError(
        "REQUEST_FAILED",
        "Google Ads Demand Gen ad request failed.",
        {
          cause:
            error,
        },
      );
    }

    if (!response.ok) {
      throw new GoogleAdsDemandGenAdStatsCollectorError(
        "API_HTTP_ERROR",
        "Google Ads Demand Gen ad request returned an unsuccessful response.",
        {
          status:
            response.status,
        },
      );
    }

    let body: unknown;

    try {
      body =
        await response.json();
    } catch (error) {
      throw new GoogleAdsDemandGenAdStatsCollectorError(
        "INVALID_RESPONSE",
        "Google Ads Demand Gen ad request returned invalid JSON.",
        {
          cause:
            error,
        },
      );
    }

    return parseSearchResponse(
      body,
    );
  } finally {
    clearTimeout(
      timeoutId,
    );
  }
}

function isRetryableFailure(
  error:
    GoogleAdsDemandGenAdStatsCollectorError,
): boolean {
  if (
    error.code ===
      "REQUEST_TIMEOUT" ||
    error.code ===
      "REQUEST_FAILED"
  ) {
    return true;
  }

  if (
    error.code !==
      "API_HTTP_ERROR"
  ) {
    return false;
  }

  return (
    error.status === 429 ||
    error.status === 500 ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  );
}

function normalizeRandomValue(
  randomImpl: () => number,
): number {
  const value =
    randomImpl();

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 1
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      "randomImpl must return a number from 0 inclusive to 1 exclusive.",
    );
  }

  return value;
}

function calculateRetryDelayMs(
  retryIndex: number,
  randomImpl: () => number,
): number {
  const base =
    Math.min(
      GOOGLE_ADS_DEMAND_GEN_AD_STATS_BASE_RETRY_DELAY_MS *
        2 ** retryIndex,

      GOOGLE_ADS_DEMAND_GEN_AD_STATS_MAX_RETRY_DELAY_MS,
    );

  const jitter =
    Math.floor(
      base *
        0.2 *
        normalizeRandomValue(
          randomImpl,
        ),
    );

  return Math.min(
    base + jitter,
    GOOGLE_ADS_DEMAND_GEN_AD_STATS_MAX_RETRY_DELAY_MS,
  );
}

async function defaultSleep(
  delayMs: number,
): Promise<void> {
  await new Promise<void>(
    resolve => {
      setTimeout(
        resolve,
        delayMs,
      );
    },
  );
}

export async function collectGoogleAdsDemandGenAdStatsPage(
  input:
    GoogleAdsDemandGenAdStatsPageCollectorInput,
  dependencies:
    GoogleAdsDemandGenAdStatsCollectorDependencies = {},
  options:
    GoogleAdsDemandGenAdStatsCollectorOptions = {},
): Promise<
  GoogleAdsDemandGenAdStatsPageCollectionResult
> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Demand Gen ad page collector input is required.",
    );
  }

  const {
    targetCustomerId,
  } =
    normalizeCustomerIds(
      input,
    );

  /*
   * Preserve the full request validation contract
   * before any fetch occurs.
   */
  buildGoogleAdsDemandGenAdStatsSearchRequest(
    input,
  );

  const requestTimeoutMs =
    normalizeBoundedInteger(
      options.requestTimeoutMs ??
        GOOGLE_ADS_DEMAND_GEN_AD_STATS_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs",
      1,
      60_000,
    );

  const maxRetries =
    normalizeBoundedInteger(
      options.maxRetries ??
        GOOGLE_ADS_DEMAND_GEN_AD_STATS_MAX_RETRIES,
      "maxRetries",
      0,
      10,
    );

  const maxPages =
    normalizeBoundedInteger(
      options.maxPages ??
        GOOGLE_ADS_DEMAND_GEN_AD_STATS_MAX_PAGES,
      "maxPages",
      1,
      10_000,
    );

  const cursorState =
    normalizeCursor(
      input.cursor,
    );

  if (
    cursorState.pageIndex >=
    maxPages
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "PAGE_LIMIT_EXCEEDED",
      "Google Ads Demand Gen ad request exceeded the bounded page limit.",
    );
  }

  const fetchImpl =
    dependencies.fetchImpl ??
    fetch;

  const sleepImpl =
    dependencies.sleepImpl ??
    defaultSleep;

  const randomImpl =
    dependencies.randomImpl ??
    Math.random;

  const request =
    buildGoogleAdsDemandGenAdStatsSearchRequest(
      {
        accessToken:
          input.accessToken,

        developerToken:
          input.developerToken,

        targetCustomerId:
          input.targetCustomerId,

        loginCustomerId:
          input.loginCustomerId,

        startDate:
          input.startDate,

        endDate:
          input.endDate,

        pageToken:
          cursorState.page,
      },
    );

  let page:
    ParsedSearchPage |
    null =
      null;

  let requestCount =
    0;

  let retryCount =
    0;

  let pageRetryCount =
    0;

  for (;;) {
    requestCount +=
      1;

    try {
      page =
        await executeSearchPage(
          request,
          fetchImpl,
          requestTimeoutMs,
        );

      break;
    } catch (error) {
      if (
        !(
          error instanceof
            GoogleAdsDemandGenAdStatsCollectorError
        )
      ) {
        throw error;
      }

      if (
        !isRetryableFailure(
          error,
        )
      ) {
        throw error;
      }

      if (
        pageRetryCount >=
        maxRetries
      ) {
        throw new GoogleAdsDemandGenAdStatsCollectorError(
          "RETRY_EXHAUSTED",
          "Google Ads Demand Gen ad retry limit was reached.",
          {
            status:
              error.status,

            retryCount,
          },
        );
      }

      const delayMs =
        calculateRetryDelayMs(
          pageRetryCount,
          randomImpl,
        );

      pageRetryCount +=
        1;

      retryCount +=
        1;

      try {
        await sleepImpl(
          delayMs,
        );
      } catch (sleepError) {
        throw new GoogleAdsDemandGenAdStatsCollectorError(
          "REQUEST_FAILED",
          "Google Ads Demand Gen ad retry delay failed.",
          {
            cause:
              sleepError,

            retryCount,
          },
        );
      }
    }
  }

  if (!page) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Demand Gen ad page was not produced.",
    );
  }

  const completedPageCount =
    cursorState.pageIndex +
    1;

  if (
    page.nextPageToken &&
    page.nextPageToken ===
      cursorState.page
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "PAGINATION_LOOP",
      "Google Ads Demand Gen ad request repeated the current page token.",
    );
  }

  if (
    page.nextPageToken &&
    completedPageCount >=
      maxPages
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "PAGE_LIMIT_EXCEEDED",
      "Google Ads Demand Gen ad request exceeded the bounded page limit.",
    );
  }

  if (
    page.rows.length >
    GOOGLE_ADS_DEMAND_GEN_AD_STATS_PAGE_SIZE
  ) {
    throw new GoogleAdsDemandGenAdStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Demand Gen ad page exceeded the fixed page row limit.",
    );
  }

  const canonicalRows =
    toCanonicalRows(
      targetCustomerId,
      page.rows,
    );

  const cursor:
    GoogleAdsDemandGenAdStatsPageCursor |
    null =
      page.nextPageToken
        ? Object.freeze({
            version:
              1 as const,

            pageIndex:
              completedPageCount,

            page:
              page.nextPageToken,
          })
        : null;

  return Object.freeze({
    rows:
      Object.freeze(
        canonicalRows,
      ),

    status:
      cursor
        ? "partial"
        : "completed",

    isComplete:
      cursor === null,

    cursor,

    pageCount:
      1 as const,

    completedPageCount,

    requestCount,

    retryCount,
  });
}
