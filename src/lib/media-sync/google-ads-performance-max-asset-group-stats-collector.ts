import {
  GOOGLE_ADS_API_VERSION,
} from "./google-ads-account-verification";
import {
  convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows,
  type GoogleAdsPerformanceMaxAssetGroupCanonicalAssetGroup,
  type GoogleAdsPerformanceMaxAssetGroupCanonicalCampaign,
  type GoogleAdsPerformanceMaxAssetGroupDailyStatsRecord,
} from "./google-ads-performance-max-asset-group-canonical-row";
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

const MAX_PAGE_TOKEN_LENGTH =
  20_000;

export const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_REQUEST_TIMEOUT_MS =
  30_000;

export const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_MAX_RETRIES =
  3;

export const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_MAX_PAGES =
  1_000;

export const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_PAGE_SIZE =
  10_000;

const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_BASE_RETRY_DELAY_MS =
  1_000;

const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_MAX_RETRY_DELAY_MS =
  30_000;

export type GoogleAdsPerformanceMaxAssetGroupStatsCollectorErrorCode =
  | "INVALID_INPUT"
  | "REQUEST_TIMEOUT"
  | "REQUEST_FAILED"
  | "API_HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "PAGINATION_LOOP"
  | "PAGE_LIMIT_EXCEEDED"
  | "RETRY_EXHAUSTED";

export class GoogleAdsPerformanceMaxAssetGroupStatsCollectorError
  extends Error {
  readonly code:
    GoogleAdsPerformanceMaxAssetGroupStatsCollectorErrorCode;

  readonly status:
    number | null;

  readonly retryCount:
    number;

  constructor(
    code:
      GoogleAdsPerformanceMaxAssetGroupStatsCollectorErrorCode,
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
      "GoogleAdsPerformanceMaxAssetGroupStatsCollectorError";

    this.code =
      code;

    this.status =
      options?.status ?? null;

    this.retryCount =
      options?.retryCount ?? 0;
  }
}

export type GoogleAdsPerformanceMaxAssetGroupStatsCollectorInput =
  Readonly<{
    accessToken: string;
    developerToken: string;
    targetCustomerId: unknown;
    loginCustomerId?: unknown;
    startDate: unknown;
    endDate: unknown;
  }>;

export type GoogleAdsPerformanceMaxAssetGroupStatsCollectorDependencies =
  Readonly<{
    fetchImpl?: typeof fetch;

    sleepImpl?: (
      delayMs: number,
    ) => Promise<void>;

    randomImpl?: () => number;
  }>;

export type GoogleAdsPerformanceMaxAssetGroupStatsCollectorOptions =
  Readonly<{
    requestTimeoutMs?: number;
    maxRetries?: number;
    maxPages?: number;
  }>;

export type GoogleAdsPerformanceMaxAssetGroupStatsPageCursor =
  Readonly<{
    version: 1;
    pageIndex: number;
    page: string;
  }>;

export type GoogleAdsPerformanceMaxAssetGroupStatsPageCollectorInput =
  GoogleAdsPerformanceMaxAssetGroupStatsCollectorInput &
    Readonly<{
      cursor?: unknown;
    }>;

export type GoogleAdsPerformanceMaxAssetGroupStatsSearchRequest =
  Readonly<{
    endpoint: string;
    method: "POST";
    headers:
      Readonly<Record<string, string>>;
    body: string;
  }>;

export type GoogleAdsPerformanceMaxAssetGroupStatsPageCollectionResult =
  Readonly<{
    rows:
      readonly EtrylueNormalizedMediaRow[];

    status:
      | "partial"
      | "completed";

    isComplete: boolean;

    cursor:
      GoogleAdsPerformanceMaxAssetGroupStatsPageCursor |
      null;

    pageCount: 1;

    completedPageCount: number;

    requestCount: number;

    retryCount: number;
  }>;

type ParsedPerformanceMaxAssetGroupStatsRow =
  Readonly<{
    campaign:
      GoogleAdsPerformanceMaxAssetGroupCanonicalCampaign;

    assetGroup:
      GoogleAdsPerformanceMaxAssetGroupCanonicalAssetGroup;

    record:
      GoogleAdsPerformanceMaxAssetGroupDailyStatsRecord;
  }>;

type ParsedSearchPage =
  Readonly<{
    rows:
      readonly ParsedPerformanceMaxAssetGroupStatsRow[];

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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
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
  const normalized =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" &&
          Number.isSafeInteger(value)
        ? String(value)
        : "";

  if (
    !/^[1-9]\d*$/u.test(
      normalized,
    )
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  return normalized;
}

function normalizeResponseDate(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} exceeds the safe numeric range.`,
    );
  }

  return Number(parsed);
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
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return parsed;
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Performance Max asset-group nextPageToken is invalid.",
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      MAX_PAGE_TOKEN_LENGTH
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Performance Max asset-group nextPageToken is invalid.",
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Performance Max asset-group page cursor must be an object.",
    );
  }

  if (value.version !== 1) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Performance Max asset-group page cursor version is invalid.",
    );
  }

  if (
    typeof value.pageIndex !== "number" ||
    !Number.isSafeInteger(
      value.pageIndex,
    ) ||
    value.pageIndex < 1
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Performance Max asset-group page cursor index is invalid.",
    );
  }

  return {
    pageIndex:
      value.pageIndex,

    page:
      normalizeRequiredString(
        value.page,
        "cursor.page",
        MAX_PAGE_TOKEN_LENGTH,
      ),
  };
}

function normalizeCustomerIds(
  input:
    GoogleAdsPerformanceMaxAssetGroupStatsCollectorInput,
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Performance Max customer ID is invalid.",
      {
        cause:
          error,
      },
    );
  }
}

export function buildGoogleAdsPerformanceMaxAssetGroupStatsQuery(
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
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_INPUT",
      "startDate must not be later than endDate.",
    );
  }

  return [
    "SELECT",
    "  campaign.id,",
    "  campaign.name,",
    "  asset_group.id,",
    "  asset_group.name,",
    "  segments.date,",
    "  metrics.impressions,",
    "  metrics.clicks,",
    "  metrics.cost_micros,",
    "  metrics.conversions,",
    "  metrics.conversions_value",
    "FROM asset_group",
    `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    "  AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'",
    "  AND asset_group.status != 'REMOVED'",
    "ORDER BY campaign.id, asset_group.id, segments.date",
  ].join("\n");
}

export function buildGoogleAdsPerformanceMaxAssetGroupStatsSearchRequest(
  input:
    GoogleAdsPerformanceMaxAssetGroupStatsCollectorInput &
    Readonly<{
      pageToken?: unknown;
    }>,
): GoogleAdsPerformanceMaxAssetGroupStatsSearchRequest {
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
    buildGoogleAdsPerformanceMaxAssetGroupStatsQuery({
      startDate:
        input.startDate,
      endDate:
        input.endDate,
    });

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
      Authorization:
        `Bearer ${accessToken}`,
      "developer-token":
        developerToken,
      "content-type":
        "application/json",
    };

  if (loginCustomerId) {
    headers["login-customer-id"] =
      loginCustomerId;
  }

  return Object.freeze({
    endpoint:
      `${GOOGLE_ADS_API_BASE_URL}/${GOOGLE_ADS_API_VERSION}` +
      `/customers/${targetCustomerId}/googleAds:search`,

    method:
      "POST" as const,

    headers:
      Object.freeze(headers),

    body:
      JSON.stringify({
        query,
        ...(pageToken
          ? {
              pageToken,
            }
          : {}),
      }),
  });
}

function parseSearchPage(
  value: unknown,
): ParsedSearchPage {
  if (!isPlainObject(value)) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Performance Max asset-group search response must be an object.",
    );
  }

  const rawResults =
    value.results === undefined ||
    value.results === null
      ? []
      : value.results;

  if (!Array.isArray(rawResults)) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads Performance Max asset-group search results must be an array.",
    );
  }

  const rows:
    ParsedPerformanceMaxAssetGroupStatsRow[] = [];

  for (
    let rowIndex = 0;
    rowIndex < rawResults.length;
    rowIndex += 1
  ) {
    const rawRow =
      rawResults[rowIndex];

    if (!isPlainObject(rawRow)) {
      throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
        "INVALID_RESPONSE",
        `results[${rowIndex}] must be an object.`,
      );
    }

    const campaign =
      rawRow.campaign;

    const assetGroup =
      rawRow.assetGroup;

    const segments =
      rawRow.segments;

    const metrics =
      rawRow.metrics;

    if (
      !isPlainObject(campaign) ||
      !isPlainObject(assetGroup) ||
      !isPlainObject(segments) ||
      !isPlainObject(metrics)
    ) {
      throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
        "INVALID_RESPONSE",
        `results[${rowIndex}] is missing campaign, assetGroup, segments, or metrics.`,
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
        2_000,
      );

    const assetGroupId =
      normalizeId(
        assetGroup.id,
        `results[${rowIndex}].assetGroup.id`,
      );

    const assetGroupName =
      normalizeResponseString(
        assetGroup.name,
        `results[${rowIndex}].assetGroup.name`,
        2_000,
      );

    const date =
      normalizeResponseDate(
        segments.date,
        `results[${rowIndex}].segments.date`,
      );

    rows.push({
      campaign: {
        id:
          campaignId,
        name:
          campaignName,
      },

      assetGroup: {
        id:
          assetGroupId,
        campaignId,
        name:
          assetGroupName,
      },

      record: {
        date,
        assetGroupId,

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
    });
  }

  return {
    rows,
    nextPageToken:
      normalizePageToken(
        value.nextPageToken,
      ),
  };
}

function buildCanonicalRows(
  input: Readonly<{
    externalAccountId: string;
    parsed:
      readonly ParsedPerformanceMaxAssetGroupStatsRow[];
  }>,
): readonly EtrylueNormalizedMediaRow[] {
  const grouped =
    new Map<
      string,
      {
        campaign:
          GoogleAdsPerformanceMaxAssetGroupCanonicalCampaign;

        assetGroup:
          GoogleAdsPerformanceMaxAssetGroupCanonicalAssetGroup;

        records:
          GoogleAdsPerformanceMaxAssetGroupDailyStatsRecord[];
      }
    >();

  for (const row of input.parsed) {
    const key =
      `${row.campaign.id}\u0000${row.assetGroup.id}`;

    const existing =
      grouped.get(key);

    if (!existing) {
      grouped.set(
        key,
        {
          campaign:
            row.campaign,
          assetGroup:
            row.assetGroup,
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
      existing.assetGroup.name !==
        row.assetGroup.name
    ) {
      throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
        "INVALID_RESPONSE",
        "Google Ads Performance Max hierarchy changed within one collection page.",
      );
    }

    existing.records.push(
      row.record,
    );
  }

  const canonical:
    EtrylueNormalizedMediaRow[] = [];

  for (const group of grouped.values()) {
    canonical.push(
      ...convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows({
        externalAccountId:
          input.externalAccountId,
        campaign:
          group.campaign,
        assetGroup:
          group.assetGroup,
        records:
          group.records,
      }),
    );
  }

  canonical.sort(
    (
      left,
      right,
    ) => {
      const campaignCompare =
        String(
          left.external_campaign_id ??
            "",
        ).localeCompare(
          String(
            right.external_campaign_id ??
              "",
          ),
        );

      if (campaignCompare !== 0) {
        return campaignCompare;
      }

      const groupCompare =
        String(
          left.external_group_id ??
            "",
        ).localeCompare(
          String(
            right.external_group_id ??
              "",
          ),
        );

      if (groupCompare !== 0) {
        return groupCompare;
      }

      return left.date.localeCompare(
        right.date,
      );
    },
  );

  return canonical;
}

function isRetryableStatus(
  status: number,
): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function resolveRetryDelayMs(
  retryIndex: number,
  randomImpl: () => number,
): number {
  const exponential =
    Math.min(
      GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_BASE_RETRY_DELAY_MS *
        2 ** retryIndex,
      GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_MAX_RETRY_DELAY_MS,
    );

  const jitter =
    Math.floor(
      exponential *
      0.2 *
      Math.max(
        0,
        Math.min(
          1,
          randomImpl(),
        ),
      ),
    );

  return Math.min(
    GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_MAX_RETRY_DELAY_MS,
    exponential + jitter,
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

async function executeSearchPage(
  input: Readonly<{
    request:
      GoogleAdsPerformanceMaxAssetGroupStatsSearchRequest;

    requestTimeoutMs: number;
    maxRetries: number;

    fetchImpl:
      typeof fetch;

    sleepImpl:
      (delayMs: number) => Promise<void>;

    randomImpl:
      () => number;
  }>,
): Promise<Readonly<{
  page:
    ParsedSearchPage;

  requestCount: number;
  retryCount: number;
}>> {
  let retryCount =
    0;

  let requestCount =
    0;

  for (;;) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        input.requestTimeoutMs,
      );

    try {
      requestCount +=
        1;

      const response =
        await input.fetchImpl(
          input.request.endpoint,
          {
            method:
              input.request.method,

            headers:
              input.request.headers,

            body:
              input.request.body,

            signal:
              controller.signal,
          },
        );

      if (response.ok) {
        let json: unknown;

        try {
          json =
            await response.json();
        } catch (error) {
          throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
            "INVALID_RESPONSE",
            "Google Ads Performance Max asset-group search returned invalid JSON.",
            {
              cause:
                error,
              retryCount,
            },
          );
        }

        return {
          page:
            parseSearchPage(
              json,
            ),
          requestCount,
          retryCount,
        };
      }

      if (
        !isRetryableStatus(
          response.status,
        )
      ) {
        throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
          "API_HTTP_ERROR",
          `Google Ads Performance Max asset-group search returned HTTP ${response.status}.`,
          {
            status:
              response.status,
            retryCount,
          },
        );
      }

      if (
        retryCount >=
        input.maxRetries
      ) {
        throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
          "RETRY_EXHAUSTED",
          "Google Ads Performance Max asset-group search retry limit was reached.",
          {
            status:
              response.status,
            retryCount,
          },
        );
      }
    } catch (error) {
      if (
        error instanceof
        GoogleAdsPerformanceMaxAssetGroupStatsCollectorError
      ) {
        if (
          error.code ===
            "API_HTTP_ERROR" ||
          error.code ===
            "INVALID_RESPONSE" ||
          error.code ===
            "RETRY_EXHAUSTED"
        ) {
          throw error;
        }
      }

      if (
        controller.signal.aborted
      ) {
        if (
          retryCount >=
          input.maxRetries
        ) {
          throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
            "REQUEST_TIMEOUT",
            "Google Ads Performance Max asset-group search request timed out.",
            {
              cause:
                error,
              retryCount,
            },
          );
        }
      } else if (
        retryCount >=
        input.maxRetries
      ) {
        throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
          "REQUEST_FAILED",
          "Google Ads Performance Max asset-group search request failed.",
          {
            cause:
              error,
            retryCount,
          },
        );
      }
    } finally {
      clearTimeout(
        timeout,
      );
    }

    const delayMs =
      resolveRetryDelayMs(
        retryCount,
        input.randomImpl,
      );

    retryCount +=
      1;

    await input.sleepImpl(
      delayMs,
    );
  }
}

export async function collectGoogleAdsPerformanceMaxAssetGroupStatsPage(
  input:
    GoogleAdsPerformanceMaxAssetGroupStatsPageCollectorInput,
  dependencies:
    GoogleAdsPerformanceMaxAssetGroupStatsCollectorDependencies = {},
  options:
    GoogleAdsPerformanceMaxAssetGroupStatsCollectorOptions = {},
): Promise<
  GoogleAdsPerformanceMaxAssetGroupStatsPageCollectionResult
> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads Performance Max asset-group collector input is required.",
    );
  }

  const requestTimeoutMs =
    options.requestTimeoutMs ===
      undefined
      ? GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_REQUEST_TIMEOUT_MS
      : normalizeBoundedInteger(
          options.requestTimeoutMs,
          "requestTimeoutMs",
          1,
          120_000,
        );

  const maxRetries =
    options.maxRetries ===
      undefined
      ? GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_MAX_RETRIES
      : normalizeBoundedInteger(
          options.maxRetries,
          "maxRetries",
          0,
          10,
        );

  const maxPages =
    options.maxPages ===
      undefined
      ? GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_STATS_MAX_PAGES
      : normalizeBoundedInteger(
          options.maxPages,
          "maxPages",
          1,
          10_000,
        );

  const cursor =
    normalizeCursor(
      input.cursor,
    );

  const {
    targetCustomerId,
  } =
    normalizeCustomerIds(
      input,
    );

  const request =
    buildGoogleAdsPerformanceMaxAssetGroupStatsSearchRequest({
      ...input,
      pageToken:
        cursor.page,
    });

  const executed =
    await executeSearchPage({
      request,
      requestTimeoutMs,
      maxRetries,

      fetchImpl:
        dependencies.fetchImpl ??
        fetch,

      sleepImpl:
        dependencies.sleepImpl ??
        defaultSleep,

      randomImpl:
        dependencies.randomImpl ??
        Math.random,
    });

  const completedPageCount =
    cursor.pageIndex +
    1;

  if (
    executed.page.nextPageToken &&
    completedPageCount >= maxPages
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "PAGE_LIMIT_EXCEEDED",
      "Google Ads Performance Max asset-group search exceeded the bounded page limit.",
      {
        retryCount:
          executed.retryCount,
      },
    );
  }

  if (
    cursor.page &&
    executed.page.nextPageToken ===
      cursor.page
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupStatsCollectorError(
      "PAGINATION_LOOP",
      "Google Ads Performance Max asset-group search repeated the current page token.",
      {
        retryCount:
          executed.retryCount,
      },
    );
  }

  const rows =
    buildCanonicalRows({
      externalAccountId:
        targetCustomerId,
      parsed:
        executed.page.rows,
    });

  const nextCursor:
    GoogleAdsPerformanceMaxAssetGroupStatsPageCursor |
    null =
    executed.page.nextPageToken
      ? {
          version:
            1,
          pageIndex:
            completedPageCount,
          page:
            executed.page.nextPageToken,
        }
      : null;

  return Object.freeze({
    rows,

    status:
      nextCursor
        ? "partial"
        : "completed",

    isComplete:
      nextCursor === null,

    cursor:
      nextCursor,

    pageCount:
      1 as const,

    completedPageCount,

    requestCount:
      executed.requestCount,

    retryCount:
      executed.retryCount,
  });
}
