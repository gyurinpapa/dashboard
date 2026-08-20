import {
  GOOGLE_ADS_API_VERSION,
} from "./google-ads-account-verification";
import {
  convertGoogleAdsKeywordDailyStatsToCanonicalRows,
  type GoogleAdsCanonicalAdGroup,
  type GoogleAdsCanonicalCampaign,
  type GoogleAdsCanonicalKeyword,
  type GoogleAdsKeywordDailyStatsRecord,
} from "./google-ads-canonical-row";
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

const MAX_ACCESS_TOKEN_LENGTH = 20_000;
const MAX_DEVELOPER_TOKEN_LENGTH = 10_000;
const MAX_NAME_LENGTH = 2_000;
const MAX_KEYWORD_LENGTH = 2_000;
const MAX_PAGE_TOKEN_LENGTH = 20_000;

export const GOOGLE_ADS_KEYWORD_STATS_REQUEST_TIMEOUT_MS =
  30_000;

export const GOOGLE_ADS_KEYWORD_STATS_MAX_RETRIES =
  3;

export const GOOGLE_ADS_KEYWORD_STATS_MAX_PAGES =
  1_000;

const GOOGLE_ADS_KEYWORD_STATS_BASE_RETRY_DELAY_MS =
  1_000;

const GOOGLE_ADS_KEYWORD_STATS_MAX_RETRY_DELAY_MS =
  30_000;

const RETRYABLE_GOOGLE_STATUSES =
  new Set([
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
    "INTERNAL",
    "UNKNOWN",
    "ABORTED",
  ]);

export type GoogleAdsKeywordStatsPageTokenErrorReason =
  | "EXPIRED_PAGE_TOKEN"
  | "INVALID_PAGE_TOKEN";

export type GoogleAdsKeywordStatsCollectorErrorCode =
  | "INVALID_INPUT"
  | "REQUEST_TIMEOUT"
  | "REQUEST_FAILED"
  | "API_HTTP_ERROR"
  | "PAGE_TOKEN_ERROR"
  | "INVALID_RESPONSE"
  | "PAGINATION_LOOP"
  | "PAGE_LIMIT_EXCEEDED"
  | "RETRY_EXHAUSTED";

export class GoogleAdsKeywordStatsCollectorError extends Error {
  readonly code:
    GoogleAdsKeywordStatsCollectorErrorCode;

  readonly status: number | null;
  readonly requestId: string | null;
  readonly googleStatus: string | null;
  readonly googleRequestError:
    GoogleAdsKeywordStatsPageTokenErrorReason |
    null;
  readonly retryCount: number;

  constructor(
    code:
      GoogleAdsKeywordStatsCollectorErrorCode,
    message: string,
    options?: {
      status?: number | null;
      requestId?: string | null;
      googleStatus?: string | null;
      googleRequestError?:
        GoogleAdsKeywordStatsPageTokenErrorReason |
        null;
      retryCount?: number;
    },
  ) {
    super(message);

    this.name =
      "GoogleAdsKeywordStatsCollectorError";

    this.code = code;
    this.status =
      options?.status ?? null;
    this.requestId =
      options?.requestId ?? null;
    this.googleStatus =
      options?.googleStatus ?? null;
    this.googleRequestError =
      options?.googleRequestError ?? null;
    this.retryCount =
      options?.retryCount ?? 0;
  }
}

export type GoogleAdsKeywordStatsCollectorInput =
  Readonly<{
    accessToken: string;
    developerToken: string;
    targetCustomerId: unknown;
    loginCustomerId?: unknown;
    startDate: unknown;
    endDate: unknown;
  }>;

export type GoogleAdsKeywordStatsCollectorDependencies =
  Readonly<{
    fetchImpl?: typeof fetch;
    sleepImpl?: (
      delayMs: number,
    ) => Promise<void>;
    randomImpl?: () => number;
  }>;

export type GoogleAdsKeywordStatsCollectorOptions =
  Readonly<{
    requestTimeoutMs?: number;
    maxRetries?: number;
    maxPages?: number;
  }>;

export type GoogleAdsKeywordStatsCollectionResult =
  Readonly<{
    rows: readonly EtrylueNormalizedMediaRow[];
    pageCount: number;
    requestCount: number;
    retryCount: number;
  }>;

export type GoogleAdsKeywordStatsSearchRequest =
  Readonly<{
    endpoint: string;
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
  }>;

type ParsedGoogleAdsKeywordStatsRow =
  Readonly<{
    campaign: GoogleAdsCanonicalCampaign;
    adGroup: GoogleAdsCanonicalAdGroup;
    keyword: GoogleAdsCanonicalKeyword;
    record: GoogleAdsKeywordDailyStatsRecord;
  }>;

type ParsedSearchResponse =
  Readonly<{
    rows:
      readonly ParsedGoogleAdsKeywordStatsRow[];
    nextPageToken: string | null;
  }>;

type KeywordGroup = {
  campaign: GoogleAdsCanonicalCampaign;
  adGroup: GoogleAdsCanonicalAdGroup;
  keyword: GoogleAdsCanonicalKeyword;
  records: GoogleAdsKeywordDailyStatsRecord[];
};

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeDate(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !isValidYmd(value)
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  return value;
}

function normalizeBoundedInteger(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function normalizeGoogleCustomerIds(
  input: {
    targetCustomerId: unknown;
    loginCustomerId?: unknown;
  },
): {
  targetCustomerId: string;
  loginCustomerId: string | null;
} {
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
  } catch {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads customer ID is invalid.",
    );
  }
}

function normalizeId(
  value: unknown,
  fieldName: string,
): string {
  let normalizedValue: string;

  if (typeof value === "string") {
    normalizedValue =
      value.trim();
  } else if (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  ) {
    normalizedValue =
      String(value);
  } else {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  if (
    !/^[1-9]\d*$/u.test(
      normalizedValue,
    )
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return normalizedValue;
}

function normalizeResponseString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (
    !normalizedValue ||
    normalizedValue.length > maxLength
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return normalizedValue;
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
      parsed = BigInt(value);
    } else if (
      typeof value === "string" &&
      /^\d+$/u.test(value.trim())
    ) {
      parsed =
        BigInt(value.trim());
    } else {
      throw new Error(
        "invalid integer",
      );
    }
  } catch {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  if (
    parsed >
    BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
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
    ) / 1_000_000
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
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return parsed;
}

function requireObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      `${fieldName} is missing or invalid.`,
    );
  }

  return value;
}

function parseGoogleAdsKeywordStatsRow(
  value: unknown,
  rowIndex: number,
): ParsedGoogleAdsKeywordStatsRow {
  const row =
    requireObject(
      value,
      `results[${rowIndex}]`,
    );

  const campaign =
    requireObject(
      row.campaign,
      `results[${rowIndex}].campaign`,
    );

  const adGroup =
    requireObject(
      row.adGroup,
      `results[${rowIndex}].adGroup`,
    );

  const criterion =
    requireObject(
      row.adGroupCriterion,
      `results[${rowIndex}].adGroupCriterion`,
    );

  const keyword =
    requireObject(
      criterion.keyword,
      `results[${rowIndex}].adGroupCriterion.keyword`,
    );

  const segments =
    requireObject(
      row.segments,
      `results[${rowIndex}].segments`,
    );

  const metrics =
    isPlainObject(row.metrics)
      ? row.metrics
      : {};

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

  const keywordId =
    normalizeId(
      criterion.criterionId,
      `results[${rowIndex}].adGroupCriterion.criterionId`,
    );

  const keywordText =
    normalizeResponseString(
      keyword.text,
      `results[${rowIndex}].adGroupCriterion.keyword.text`,
      MAX_KEYWORD_LENGTH,
    );

  const date =
    normalizeDate(
      segments.date,
      `results[${rowIndex}].segments.date`,
    );

  return {
    campaign: {
      id: campaignId,
      name: campaignName,
    },
    adGroup: {
      id: adGroupId,
      campaignId,
      name: adGroupName,
    },
    keyword: {
      id: keywordId,
      adGroupId,
      text: keywordText,
    },
    record: {
      date,
      keywordId,
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
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads nextPageToken is invalid.",
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      MAX_PAGE_TOKEN_LENGTH
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads nextPageToken is invalid.",
    );
  }

  return normalized;
}

function parseSearchResponse(
  value: unknown,
): ParsedSearchResponse {
  if (!isPlainObject(value)) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads keyword search response must be an object.",
    );
  }

  const rawResults =
    value.results === undefined
      ? []
      : value.results;

  if (!Array.isArray(rawResults)) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads keyword search results must be an array.",
    );
  }

  return {
    rows:
      rawResults.map(
        (
          row,
          rowIndex,
        ) =>
          parseGoogleAdsKeywordStatsRow(
            row,
            rowIndex,
          ),
      ),
    nextPageToken:
      normalizePageToken(
        value.nextPageToken,
      ),
  };
}

function parseGoogleErrorStatus(
  value: unknown,
): string | null {
  if (
    !isPlainObject(value) ||
    !isPlainObject(value.error) ||
    typeof value.error.status !==
      "string"
  ) {
    return null;
  }

  const status =
    value.error.status.trim();

  return status || null;
}

function parseGooglePageTokenRequestError(
  value: unknown,
):
  GoogleAdsKeywordStatsPageTokenErrorReason |
  null {
  if (
    !isPlainObject(value) ||
    !isPlainObject(value.error) ||
    !Array.isArray(
      value.error.details,
    )
  ) {
    return null;
  }

  for (
    const detail of
    value.error.details
  ) {
    if (
      !isPlainObject(detail) ||
      !Array.isArray(
        detail.errors,
      )
    ) {
      continue;
    }

    for (
      const googleError of
      detail.errors
    ) {
      if (
        !isPlainObject(
          googleError,
        ) ||
        !isPlainObject(
          googleError.errorCode,
        ) ||
        typeof googleError
          .errorCode
          .requestError !==
          "string"
      ) {
        continue;
      }

      const requestError =
        googleError
          .errorCode
          .requestError
          .trim();

      if (
        requestError ===
          "EXPIRED_PAGE_TOKEN" ||
        requestError ===
          "INVALID_PAGE_TOKEN"
      ) {
        return requestError;
      }
    }
  }

  return null;
}

function parseRetryAfterMs(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const normalized =
    value.trim();

  if (!/^\d+$/u.test(normalized)) {
    return null;
  }

  const seconds =
    Number(normalized);

  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0
  ) {
    return null;
  }

  return Math.min(
    seconds * 1_000,
    GOOGLE_ADS_KEYWORD_STATS_MAX_RETRY_DELAY_MS,
  );
}

function isRetryableFailure(
  error:
    GoogleAdsKeywordStatsCollectorError,
): boolean {
  if (
    error.code ===
      "PAGE_TOKEN_ERROR"
  ) {
    return false;
  }

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

  if (
    error.googleStatus &&
    RETRYABLE_GOOGLE_STATUSES.has(
      error.googleStatus,
    )
  ) {
    return true;
  }

  if (error.status === 429) {
    return true;
  }

  if (
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  ) {
    return true;
  }

  if (
    error.status === 500 &&
    error.googleStatus !== "DATA_LOSS"
  ) {
    return true;
  }

  return (
    error.status === 409 &&
    error.googleStatus === "ABORTED"
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
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      "randomImpl must return a number from 0 inclusive to 1 exclusive.",
    );
  }

  return value;
}

function calculateRetryDelayMs(
  retryIndex: number,
  retryAfterMs: number | null,
  randomImpl: () => number,
): number {
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }

  const base =
    Math.min(
      GOOGLE_ADS_KEYWORD_STATS_BASE_RETRY_DELAY_MS *
        2 ** retryIndex,
      GOOGLE_ADS_KEYWORD_STATS_MAX_RETRY_DELAY_MS,
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
    GOOGLE_ADS_KEYWORD_STATS_MAX_RETRY_DELAY_MS,
  );
}

async function defaultSleep(
  delayMs: number,
): Promise<void> {
  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        delayMs,
      );
    },
  );
}

export function buildGoogleAdsKeywordStatsQuery(
  input: {
    startDate: unknown;
    endDate: unknown;
  },
): string {
  const startDate =
    normalizeDate(
      input.startDate,
      "startDate",
    );

  const endDate =
    normalizeDate(
      input.endDate,
      "endDate",
    );

  if (startDate > endDate) {
    throw new GoogleAdsKeywordStatsCollectorError(
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
    "  ad_group_criterion.criterion_id,",
    "  ad_group_criterion.keyword.text,",
    "  segments.date,",
    "  metrics.impressions,",
    "  metrics.clicks,",
    "  metrics.cost_micros,",
    "  metrics.conversions,",
    "  metrics.conversions_value",
    "FROM keyword_view",
    `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    "ORDER BY campaign.id, ad_group.id, ad_group_criterion.criterion_id, segments.date",
  ].join("\n");
}

export function buildGoogleAdsKeywordStatsSearchRequest(
  input: GoogleAdsKeywordStatsCollectorInput & {
    pageToken?: unknown;
  },
): GoogleAdsKeywordStatsSearchRequest {
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
    normalizeGoogleCustomerIds(
      input,
    );

  const query =
    buildGoogleAdsKeywordStatsQuery(
      {
        startDate:
          input.startDate,
        endDate:
          input.endDate,
      },
    );

  const pageToken =
    input.pageToken ===
        undefined ||
      input.pageToken ===
        null ||
      input.pageToken === ""
      ? null
      : normalizeRequiredString(
          input.pageToken,
          "pageToken",
          MAX_PAGE_TOKEN_LENGTH,
        );

  const headers:
    Record<string, string> = {
      Accept: "application/json",
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
    ] = loginCustomerId;
  }

  const body:
    Record<string, unknown> = {
      query,
    };

  if (pageToken) {
    body.pageToken =
      pageToken;
  }

  return {
    endpoint:
      `${GOOGLE_ADS_API_BASE_URL}/${GOOGLE_ADS_API_VERSION}` +
      `/customers/${targetCustomerId}/googleAds:search`,
    method: "POST",
    headers,
    body:
      JSON.stringify(body),
  };
}

async function executeSearchPage(
  request:
    GoogleAdsKeywordStatsSearchRequest,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number,
): Promise<ParsedSearchResponse> {
  const abortController =
    new AbortController();

  const timeoutId =
    setTimeout(() => {
      abortController.abort();
    }, requestTimeoutMs);

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
            cache:
              "no-store",
            signal:
              abortController.signal,
          },
        );
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(error)
      ) {
        throw new GoogleAdsKeywordStatsCollectorError(
          "REQUEST_TIMEOUT",
          "Google Ads keyword search request timed out.",
        );
      }

      throw new GoogleAdsKeywordStatsCollectorError(
        "REQUEST_FAILED",
        "Google Ads keyword search request failed.",
      );
    }

    const requestId =
      response.headers.get(
        "request-id",
      );

    if (!response.ok) {
      let errorBody:
        unknown = null;

      try {
        errorBody =
          await response.json();
      } catch (error) {
        if (
          abortController.signal.aborted ||
          isAbortError(error)
        ) {
          throw new GoogleAdsKeywordStatsCollectorError(
            "REQUEST_TIMEOUT",
            "Google Ads keyword search error response timed out.",
            {
              status:
                response.status,
              requestId,
            },
          );
        }
      }

      const googleStatus =
        parseGoogleErrorStatus(
          errorBody,
        );

      const googleRequestError =
        parseGooglePageTokenRequestError(
          errorBody,
        );

      if (googleRequestError) {
        throw new GoogleAdsKeywordStatsCollectorError(
          "PAGE_TOKEN_ERROR",
          "Google Ads keyword search page token is expired or invalid.",
          {
            status:
              response.status,
            requestId,
            googleStatus,
            googleRequestError,
          },
        );
      }

      throw new GoogleAdsKeywordStatsCollectorError(
        "API_HTTP_ERROR",
        "Google Ads keyword search returned an unsuccessful response.",
        {
          status:
            response.status,
          requestId,
          googleStatus,
        },
      );
    }

    let body: unknown;

    try {
      body =
        await response.json();
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(error)
      ) {
        throw new GoogleAdsKeywordStatsCollectorError(
          "REQUEST_TIMEOUT",
          "Google Ads keyword search response timed out.",
          {
            status:
              response.status,
            requestId,
          },
        );
      }

      throw new GoogleAdsKeywordStatsCollectorError(
        "INVALID_RESPONSE",
        "Google Ads keyword search returned invalid JSON.",
        {
          status:
            response.status,
          requestId,
        },
      );
    }

    return parseSearchResponse(
      body,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function groupRows(
  rows:
    readonly ParsedGoogleAdsKeywordStatsRow[],
): Map<string, KeywordGroup> {
  const groups =
    new Map<
      string,
      KeywordGroup
    >();

  const seenDailyRows =
    new Set<string>();

  for (const row of rows) {
    const groupKey =
      JSON.stringify([
        row.campaign.id,
        row.adGroup.id,
        row.keyword.id,
      ]);

    const dailyKey =
      JSON.stringify([
        row.campaign.id,
        row.adGroup.id,
        row.keyword.id,
        row.record.date,
      ]);

    if (
      seenDailyRows.has(
        dailyKey,
      )
    ) {
      throw new GoogleAdsKeywordStatsCollectorError(
        "INVALID_RESPONSE",
        "Google Ads keyword search returned a duplicate keyword/date row.",
      );
    }

    seenDailyRows.add(
      dailyKey,
    );

    const existing =
      groups.get(
        groupKey,
      );

    if (!existing) {
      groups.set(
        groupKey,
        {
          campaign:
            row.campaign,
          adGroup:
            row.adGroup,
          keyword:
            row.keyword,
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
        row.adGroup.name ||
      existing.keyword.text !==
        row.keyword.text
    ) {
      throw new GoogleAdsKeywordStatsCollectorError(
        "INVALID_RESPONSE",
        "Google Ads keyword hierarchy changed within one collection result.",
      );
    }

    existing.records.push(
      row.record,
    );
  }

  return groups;
}

function toCanonicalRows(
  targetCustomerId: string,
  parsedRows:
    readonly ParsedGoogleAdsKeywordStatsRow[],
): EtrylueNormalizedMediaRow[] {
  const groups =
    groupRows(
      parsedRows,
    );

  const groupKeys =
    Array.from(
      groups.keys(),
    ).sort();

  const canonicalRows:
    EtrylueNormalizedMediaRow[] = [];

  for (
    const groupKey of
    groupKeys
  ) {
    const group =
      groups.get(
        groupKey,
      );

    if (!group) {
      continue;
    }

    canonicalRows.push(
      ...convertGoogleAdsKeywordDailyStatsToCanonicalRows(
        {
          externalAccountId:
            targetCustomerId,
          campaign:
            group.campaign,
          adGroup:
            group.adGroup,
          keyword:
            group.keyword,
          records:
            group.records,
        },
      ),
    );
  }

  return canonicalRows;
}

export const GOOGLE_ADS_KEYWORD_STATS_PAGE_SIZE =
  10_000;

export type GoogleAdsKeywordStatsPageCursor =
  Readonly<{
    version: 1;
    pageIndex: number;
    page: string;
  }>;

export type GoogleAdsKeywordStatsPageCollectorInput =
  GoogleAdsKeywordStatsCollectorInput &
    Readonly<{
      cursor?: unknown;
    }>;

export type GoogleAdsKeywordStatsPageCollectionResult =
  Readonly<{
    rows:
      readonly EtrylueNormalizedMediaRow[];
    status:
      | "partial"
      | "completed";
    isComplete: boolean;
    cursor:
      GoogleAdsKeywordStatsPageCursor |
      null;
    pageCount: 1;
    completedPageCount: number;
    requestCount: number;
    retryCount: number;
  }>;

type NormalizedGoogleAdsKeywordStatsPageCursor = {
  pageIndex: number;
  page: string | null;
};

function normalizeGoogleAdsKeywordStatsPageCursor(
  value: unknown,
): NormalizedGoogleAdsKeywordStatsPageCursor {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      pageIndex: 0,
      page: null,
    };
  }

  if (!isPlainObject(value)) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads keyword page cursor must be an object.",
    );
  }

  if (value.version !== 1) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads keyword page cursor version is invalid.",
    );
  }

  if (
    typeof value.pageIndex !== "number" ||
    !Number.isSafeInteger(
      value.pageIndex,
    ) ||
    value.pageIndex < 1
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads keyword page cursor index is invalid.",
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

/**
 * Executes exactly one GoogleAdsService.Search page.
 *
 * This is additive to the existing full-pagination collector.
 * collectGoogleAdsKeywordStats() keeps its established behavior.
 *
 * The returned cursor is an opaque resume boundary for the next page.
 * The cursor intentionally uses the key `page` rather than persisting
 * OAuth/developer credential material.
 */
export async function collectGoogleAdsKeywordStatsPage(
  input:
    GoogleAdsKeywordStatsPageCollectorInput,
  dependencies:
    GoogleAdsKeywordStatsCollectorDependencies = {},
  options:
    GoogleAdsKeywordStatsCollectorOptions = {},
): Promise<
  GoogleAdsKeywordStatsPageCollectionResult
> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads keyword page collector input is required.",
    );
  }

  const {
    targetCustomerId,
  } =
    normalizeGoogleCustomerIds(
      input,
    );

  /*
   * Preserve the existing request validation contract before any fetch.
   */
  buildGoogleAdsKeywordStatsSearchRequest(
    input,
  );

  const requestTimeoutMs =
    normalizeBoundedInteger(
      options.requestTimeoutMs ??
        GOOGLE_ADS_KEYWORD_STATS_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs",
      1,
      60_000,
    );

  const maxRetries =
    normalizeBoundedInteger(
      options.maxRetries ??
        GOOGLE_ADS_KEYWORD_STATS_MAX_RETRIES,
      "maxRetries",
      0,
      10,
    );

  const maxPages =
    normalizeBoundedInteger(
      options.maxPages ??
        GOOGLE_ADS_KEYWORD_STATS_MAX_PAGES,
      "maxPages",
      1,
      10_000,
    );

  const cursorState =
    normalizeGoogleAdsKeywordStatsPageCursor(
      input.cursor,
    );

  if (
    cursorState.pageIndex >=
    maxPages
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "PAGE_LIMIT_EXCEEDED",
      "Google Ads keyword search exceeded the bounded page limit.",
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
    buildGoogleAdsKeywordStatsSearchRequest(
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
    ParsedSearchResponse |
    null = null;

  let requestCount =
    0;

  let retryCount =
    0;

  let pageRetryCount =
    0;

  for (;;) {
    requestCount += 1;

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
          GoogleAdsKeywordStatsCollectorError
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
        throw new GoogleAdsKeywordStatsCollectorError(
          "RETRY_EXHAUSTED",
          "Google Ads keyword search retry limit was reached.",
          {
            status:
              error.status,
            requestId:
              error.requestId,
            googleStatus:
              error.googleStatus,
            retryCount,
          },
        );
      }

      const delayMs =
        calculateRetryDelayMs(
          pageRetryCount,
          null,
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
      } catch {
        throw new GoogleAdsKeywordStatsCollectorError(
          "REQUEST_FAILED",
          "Google Ads keyword search retry delay failed.",
          {
            retryCount,
          },
        );
      }
    }
  }

  if (!page) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads keyword search page was not produced.",
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
    throw new GoogleAdsKeywordStatsCollectorError(
      "PAGINATION_LOOP",
      "Google Ads keyword search repeated the current page token.",
    );
  }

  if (
    page.nextPageToken &&
    completedPageCount >=
      maxPages
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "PAGE_LIMIT_EXCEEDED",
      "Google Ads keyword search exceeded the bounded page limit.",
    );
  }

  const canonicalRows =
    toCanonicalRows(
      targetCustomerId,
      page.rows,
    );

  if (
    canonicalRows.length >
    GOOGLE_ADS_KEYWORD_STATS_PAGE_SIZE
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_RESPONSE",
      "Google Ads keyword search page exceeded the fixed page row limit.",
    );
  }

  const cursor:
    GoogleAdsKeywordStatsPageCursor |
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

export async function collectGoogleAdsKeywordStats(
  input:
    GoogleAdsKeywordStatsCollectorInput,
  dependencies:
    GoogleAdsKeywordStatsCollectorDependencies = {},
  options:
    GoogleAdsKeywordStatsCollectorOptions = {},
): Promise<GoogleAdsKeywordStatsCollectionResult> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsKeywordStatsCollectorError(
      "INVALID_INPUT",
      "Google Ads keyword collector input is required.",
    );
  }

  const {
    targetCustomerId,
  } =
    normalizeGoogleCustomerIds(
      input,
    );

  buildGoogleAdsKeywordStatsSearchRequest(
    input,
  );

  const requestTimeoutMs =
    normalizeBoundedInteger(
      options.requestTimeoutMs ??
        GOOGLE_ADS_KEYWORD_STATS_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs",
      1,
      60_000,
    );

  const maxRetries =
    normalizeBoundedInteger(
      options.maxRetries ??
        GOOGLE_ADS_KEYWORD_STATS_MAX_RETRIES,
      "maxRetries",
      0,
      10,
    );

  const maxPages =
    normalizeBoundedInteger(
      options.maxPages ??
        GOOGLE_ADS_KEYWORD_STATS_MAX_PAGES,
      "maxPages",
      1,
      10_000,
    );

  const fetchImpl =
    dependencies.fetchImpl ??
    fetch;

  const sleepImpl =
    dependencies.sleepImpl ??
    defaultSleep;

  const randomImpl =
    dependencies.randomImpl ??
    Math.random;

  let nextPageToken:
    string | null = null;

  const seenPageTokens =
    new Set<string>();

  const parsedRows:
    ParsedGoogleAdsKeywordStatsRow[] = [];

  let pageCount = 0;
  let requestCount = 0;
  let retryCount = 0;

  for (;;) {
    const request =
      buildGoogleAdsKeywordStatsSearchRequest(
        {
          ...input,
          pageToken:
            nextPageToken,
        },
      );

    let page:
      ParsedSearchResponse |
      null = null;

    let pageRetryCount =
      0;

    for (;;) {
      requestCount += 1;

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
            GoogleAdsKeywordStatsCollectorError
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
          throw new GoogleAdsKeywordStatsCollectorError(
            "RETRY_EXHAUSTED",
            "Google Ads keyword search retry limit was reached.",
            {
              status:
                error.status,
              requestId:
                error.requestId,
              googleStatus:
                error.googleStatus,
              retryCount,
            },
          );
        }

        const retryAfterMs =
          error.code ===
            "API_HTTP_ERROR"
            ? null
            : null;

        let serverRetryAfterMs:
          number | null = null;

        if (
          error.code ===
          "API_HTTP_ERROR"
        ) {
          /*
           * Retry-After is intentionally read from the next response
           * boundary only through executeSearchPage's HTTP response.
           * At this stage the generic error contract does not retain
           * arbitrary headers or response bodies.
           */
          serverRetryAfterMs =
            retryAfterMs;
        }

        const delayMs =
          calculateRetryDelayMs(
            pageRetryCount,
            serverRetryAfterMs,
            randomImpl,
          );

        pageRetryCount += 1;
        retryCount += 1;

        try {
          await sleepImpl(
            delayMs,
          );
        } catch {
          throw new GoogleAdsKeywordStatsCollectorError(
            "REQUEST_FAILED",
            "Google Ads keyword search retry delay failed.",
            {
              retryCount,
            },
          );
        }
      }
    }

    if (!page) {
      throw new GoogleAdsKeywordStatsCollectorError(
        "INVALID_RESPONSE",
        "Google Ads keyword search page was not produced.",
      );
    }

    pageCount += 1;

    parsedRows.push(
      ...page.rows,
    );

    if (
      !page.nextPageToken
    ) {
      break;
    }

    if (
      seenPageTokens.has(
        page.nextPageToken,
      )
    ) {
      throw new GoogleAdsKeywordStatsCollectorError(
        "PAGINATION_LOOP",
        "Google Ads keyword search repeated a page token.",
      );
    }

    seenPageTokens.add(
      page.nextPageToken,
    );

    if (
      pageCount >= maxPages
    ) {
      throw new GoogleAdsKeywordStatsCollectorError(
        "PAGE_LIMIT_EXCEEDED",
        "Google Ads keyword search exceeded the bounded page limit.",
      );
    }

    nextPageToken =
      page.nextPageToken;
  }

  return Object.freeze({
    rows:
      Object.freeze(
        toCanonicalRows(
          targetCustomerId,
          parsedRows,
        ),
      ),
    pageCount,
    requestCount,
    retryCount,
  });
}
