import {
  GOOGLE_ADS_API_VERSION,
} from "./google-ads-account-verification";
import {
  GoogleAdsAuthoritativeGrainError,
  resolveGoogleAdsCampaignAuthorityContract,
  type GoogleAdsAuthoritativeGrain,
  type GoogleAdsCampaignType,
  type GoogleAdsProductFamily,
} from "./google-ads-authoritative-grain";
import {
  normalizeGoogleAdsCustomerId,
  normalizeOptionalGoogleAdsCustomerId,
} from "./google-ads-oauth-config";

const GOOGLE_ADS_API_BASE_URL =
  "https://googleads.googleapis.com";

const MAX_ACCESS_TOKEN_LENGTH =
  20_000;

const MAX_DEVELOPER_TOKEN_LENGTH =
  10_000;

const MAX_PAGE_TOKEN_LENGTH =
  20_000;

const MAX_CAMPAIGN_NAME_LENGTH =
  2_000;

const MAX_CAMPAIGN_TYPE_LENGTH =
  200;

const MAX_CAMPAIGN_STATUS_LENGTH =
  200;

export const GOOGLE_ADS_ACCOUNT_INVENTORY_REQUEST_TIMEOUT_MS =
  30_000;

export const GOOGLE_ADS_ACCOUNT_INVENTORY_MAX_RETRIES =
  3;

export const GOOGLE_ADS_ACCOUNT_INVENTORY_MAX_PAGES =
  1_000;

const GOOGLE_ADS_ACCOUNT_INVENTORY_BASE_RETRY_DELAY_MS =
  1_000;

const GOOGLE_ADS_ACCOUNT_INVENTORY_MAX_RETRY_DELAY_MS =
  30_000;

export const GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY =
  [
    "SELECT",
    "  campaign.id,",
    "  campaign.name,",
    "  campaign.advertising_channel_type,",
    "  campaign.status",
    "FROM campaign",
    "WHERE campaign.status != 'REMOVED'",
    "ORDER BY campaign.id",
  ].join("\n");

export type GoogleAdsAccountInventoryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_RESPONSE"
  | "DUPLICATE_CAMPAIGN_ID"
  | "REQUEST_TIMEOUT"
  | "REQUEST_FAILED"
  | "API_HTTP_ERROR"
  | "PAGINATION_LOOP"
  | "PAGE_LIMIT_EXCEEDED"
  | "RETRY_EXHAUSTED";

export class GoogleAdsAccountInventoryError
  extends Error {
  readonly code:
    GoogleAdsAccountInventoryErrorCode;

  readonly status:
    number | null;

  readonly retryCount:
    number;

  constructor(
    code:
      GoogleAdsAccountInventoryErrorCode,
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
      "GoogleAdsAccountInventoryError";

    this.code =
      code;

    this.status =
      options?.status ?? null;

    this.retryCount =
      options?.retryCount ?? 0;
  }
}

type GoogleAdsAccountInventoryCampaignBase =
  Readonly<{
    campaignId: string;
    campaignName: string;
    campaignType: string;
    campaignStatus: string;
  }>;

export type GoogleAdsSupportedAccountInventoryCampaign =
  GoogleAdsAccountInventoryCampaignBase &
    Readonly<{
      supported: true;
      campaignType:
        GoogleAdsCampaignType;
      productFamily:
        GoogleAdsProductFamily;
      authoritativeGrain:
        GoogleAdsAuthoritativeGrain;
    }>;

export type GoogleAdsUnsupportedAccountInventoryCampaign =
  GoogleAdsAccountInventoryCampaignBase &
    Readonly<{
      supported: false;
      reason:
        "UNSUPPORTED_CAMPAIGN_TYPE";
    }>;

export type GoogleAdsAccountInventoryCampaign =
  | GoogleAdsSupportedAccountInventoryCampaign
  | GoogleAdsUnsupportedAccountInventoryCampaign;

export type GoogleAdsAccountInventoryClassification =
  Readonly<{
    campaigns:
      readonly GoogleAdsAccountInventoryCampaign[];
    supportedCampaigns:
      readonly GoogleAdsSupportedAccountInventoryCampaign[];
    unsupportedCampaigns:
      readonly GoogleAdsUnsupportedAccountInventoryCampaign[];
  }>;

export type GoogleAdsAccountInventoryCollectorInput =
  Readonly<{
    accessToken: string;
    developerToken: string;
    targetCustomerId: unknown;
    loginCustomerId?: unknown;
  }>;

export type GoogleAdsAccountInventoryCollectorDependencies =
  Readonly<{
    fetchImpl?: typeof fetch;
    sleepImpl?: (
      delayMs: number,
    ) => Promise<void>;
    randomImpl?: () => number;
  }>;

export type GoogleAdsAccountInventoryCollectorOptions =
  Readonly<{
    requestTimeoutMs?: number;
    maxRetries?: number;
    maxPages?: number;
  }>;

export type GoogleAdsAccountInventorySearchRequest =
  Readonly<{
    endpoint: string;
    method: "POST";
    headers:
      Readonly<Record<string, string>>;
    body: string;
  }>;

type ParsedGoogleAdsAccountInventorySearchPage =
  Readonly<{
    rows: readonly unknown[];
    nextPageToken: string | null;
  }>;

export type GoogleAdsAccountInventoryCollectionResult =
  GoogleAdsAccountInventoryClassification &
    Readonly<{
      pageCount: number;
      requestCount: number;
      retryCount: number;
    }>;

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

function normalizeRequiredInputString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsAccountInventoryError(
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
    throw new GoogleAdsAccountInventoryError(
      "INVALID_INPUT",
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
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_INPUT",
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function normalizeCampaignId(
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
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  if (
    !/^[1-9]\d*$/u.test(
      normalized,
    )
  ) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeRequiredResponseString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsAccountInventoryError(
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
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeCampaignType(
  value: unknown,
  fieldName: string,
): string {
  return normalizeRequiredResponseString(
    value,
    fieldName,
    MAX_CAMPAIGN_TYPE_LENGTH,
  )
    .toUpperCase()
    .replace(
      /[\s-]+/gu,
      "_",
    );
}

function normalizeCampaignStatus(
  value: unknown,
  fieldName: string,
): string {
  return normalizeRequiredResponseString(
    value,
    fieldName,
    MAX_CAMPAIGN_STATUS_LENGTH,
  )
    .toUpperCase()
    .replace(
      /[\s-]+/gu,
      "_",
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
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      "Google Ads inventory nextPageToken is invalid.",
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      MAX_PAGE_TOKEN_LENGTH
  ) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      "Google Ads inventory nextPageToken is invalid.",
    );
  }

  return normalized;
}

function parseCampaign(
  value: unknown,
  rowIndex: number,
): GoogleAdsAccountInventoryCampaign {
  if (!isPlainObject(value)) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      `results[${rowIndex}] must be an object.`,
    );
  }

  if (!isPlainObject(value.campaign)) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      `results[${rowIndex}].campaign is missing or invalid.`,
    );
  }

  const campaign =
    value.campaign;

  const campaignId =
    normalizeCampaignId(
      campaign.id,
      `results[${rowIndex}].campaign.id`,
    );

  const campaignName =
    normalizeRequiredResponseString(
      campaign.name,
      `results[${rowIndex}].campaign.name`,
      MAX_CAMPAIGN_NAME_LENGTH,
    );

  const campaignType =
    normalizeCampaignType(
      campaign.advertisingChannelType,
      `results[${rowIndex}].campaign.advertisingChannelType`,
    );

  const campaignStatus =
    normalizeCampaignStatus(
      campaign.status,
      `results[${rowIndex}].campaign.status`,
    );

  try {
    const contract =
      resolveGoogleAdsCampaignAuthorityContract(
        campaignType,
      );

    return Object.freeze({
      campaignId,
      campaignName,
      campaignType:
        contract.campaignType,
      campaignStatus,
      supported: true,
      productFamily:
        contract.productFamily,
      authoritativeGrain:
        contract.authoritativeGrain,
    });
  } catch (error) {
    if (
      error instanceof
        GoogleAdsAuthoritativeGrainError &&
      error.code ===
        "UNSUPPORTED_CAMPAIGN_TYPE"
    ) {
      return Object.freeze({
        campaignId,
        campaignName,
        campaignType,
        campaignStatus,
        supported: false,
        reason:
          "UNSUPPORTED_CAMPAIGN_TYPE",
      });
    }

    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      `results[${rowIndex}].campaign.advertisingChannelType could not be classified.`,
      {
        cause: error,
      },
    );
  }
}

export function classifyGoogleAdsAccountInventoryRows(
  value: unknown,
): GoogleAdsAccountInventoryClassification {
  if (!Array.isArray(value)) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_INPUT",
      "Google Ads account inventory rows must be an array.",
    );
  }

  const campaigns:
    GoogleAdsAccountInventoryCampaign[] = [];

  const supportedCampaigns:
    GoogleAdsSupportedAccountInventoryCampaign[] = [];

  const unsupportedCampaigns:
    GoogleAdsUnsupportedAccountInventoryCampaign[] = [];

  const seenCampaignIds =
    new Set<string>();

  value.forEach(
    (
      row,
      rowIndex,
    ) => {
      const campaign =
        parseCampaign(
          row,
          rowIndex,
        );

      if (
        seenCampaignIds.has(
          campaign.campaignId,
        )
      ) {
        throw new GoogleAdsAccountInventoryError(
          "DUPLICATE_CAMPAIGN_ID",
          `Google Ads account inventory repeated campaign ${campaign.campaignId}.`,
        );
      }

      seenCampaignIds.add(
        campaign.campaignId,
      );

      campaigns.push(
        campaign,
      );

      if (campaign.supported) {
        supportedCampaigns.push(
          campaign,
        );
      } else {
        unsupportedCampaigns.push(
          campaign,
        );
      }
    },
  );

  return Object.freeze({
    campaigns:
      Object.freeze(
        campaigns,
      ),

    supportedCampaigns:
      Object.freeze(
        supportedCampaigns,
      ),

    unsupportedCampaigns:
      Object.freeze(
        unsupportedCampaigns,
      ),
  });
}

export function buildGoogleAdsAccountInventorySearchRequest(
  input:
    GoogleAdsAccountInventoryCollectorInput &
    Readonly<{
      pageToken?: unknown;
    }>,
): GoogleAdsAccountInventorySearchRequest {
  const accessToken =
    normalizeRequiredInputString(
      input.accessToken,
      "accessToken",
      MAX_ACCESS_TOKEN_LENGTH,
    );

  const developerToken =
    normalizeRequiredInputString(
      input.developerToken,
      "developerToken",
      MAX_DEVELOPER_TOKEN_LENGTH,
    );

  let targetCustomerId: string;
  let loginCustomerId: string | null;

  try {
    targetCustomerId =
      normalizeGoogleAdsCustomerId(
        input.targetCustomerId,
        "targetCustomerId",
      );

    loginCustomerId =
      normalizeOptionalGoogleAdsCustomerId(
        input.loginCustomerId,
        "loginCustomerId",
      );
  } catch (error) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_INPUT",
      "Google Ads inventory customer ID is invalid.",
      {
        cause: error,
      },
    );
  }

  const pageToken =
    input.pageToken === undefined ||
    input.pageToken === null ||
    input.pageToken === ""
      ? null
      : normalizeRequiredInputString(
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
      query:
        GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
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

function parseSearchResponse(
  value: unknown,
): ParsedGoogleAdsAccountInventorySearchPage {
  if (!isPlainObject(value)) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      "Google Ads account inventory search response must be an object.",
    );
  }

  const rawResults =
    value.results === undefined
      ? []
      : value.results;

  if (!Array.isArray(rawResults)) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_RESPONSE",
      "Google Ads account inventory search results must be an array.",
    );
  }

  return Object.freeze({
    rows:
      Object.freeze(
        [...rawResults],
      ),

    nextPageToken:
      normalizePageToken(
        value.nextPageToken,
      ),
  });
}

async function executeSearchPage(
  request:
    GoogleAdsAccountInventorySearchRequest,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number,
): Promise<
  ParsedGoogleAdsAccountInventorySearchPage
> {
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
        throw new GoogleAdsAccountInventoryError(
          "REQUEST_TIMEOUT",
          "Google Ads account inventory request timed out.",
          {
            cause: error,
          },
        );
      }

      throw new GoogleAdsAccountInventoryError(
        "REQUEST_FAILED",
        "Google Ads account inventory request failed.",
        {
          cause: error,
        },
      );
    }

    if (!response.ok) {
      throw new GoogleAdsAccountInventoryError(
        "API_HTTP_ERROR",
        "Google Ads account inventory returned an unsuccessful response.",
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
      if (
        abortController.signal.aborted ||
        isAbortError(
          error,
        )
      ) {
        throw new GoogleAdsAccountInventoryError(
          "REQUEST_TIMEOUT",
          "Google Ads account inventory response timed out.",
          {
            cause: error,
          },
        );
      }

      throw new GoogleAdsAccountInventoryError(
        "INVALID_RESPONSE",
        "Google Ads account inventory returned invalid JSON.",
        {
          cause: error,
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
    GoogleAdsAccountInventoryError,
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
    !Number.isFinite(
      value,
    ) ||
    value < 0 ||
    value >= 1
  ) {
    throw new GoogleAdsAccountInventoryError(
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
      GOOGLE_ADS_ACCOUNT_INVENTORY_BASE_RETRY_DELAY_MS *
        2 ** retryIndex,

      GOOGLE_ADS_ACCOUNT_INVENTORY_MAX_RETRY_DELAY_MS,
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
    GOOGLE_ADS_ACCOUNT_INVENTORY_MAX_RETRY_DELAY_MS,
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

export async function collectGoogleAdsAccountInventory(
  input:
    GoogleAdsAccountInventoryCollectorInput,
  dependencies:
    GoogleAdsAccountInventoryCollectorDependencies = {},
  options:
    GoogleAdsAccountInventoryCollectorOptions = {},
): Promise<
  GoogleAdsAccountInventoryCollectionResult
> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsAccountInventoryError(
      "INVALID_INPUT",
      "Google Ads account inventory input is required.",
    );
  }

  const requestTimeoutMs =
    normalizeBoundedInteger(
      options.requestTimeoutMs ??
        GOOGLE_ADS_ACCOUNT_INVENTORY_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs",
      1,
      300_000,
    );

  const maxRetries =
    normalizeBoundedInteger(
      options.maxRetries ??
        GOOGLE_ADS_ACCOUNT_INVENTORY_MAX_RETRIES,
      "maxRetries",
      0,
      10,
    );

  const maxPages =
    normalizeBoundedInteger(
      options.maxPages ??
        GOOGLE_ADS_ACCOUNT_INVENTORY_MAX_PAGES,
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

  const rawRows:
    unknown[] = [];

  const seenPageTokens =
    new Set<string>();

  let nextPageToken:
    string | null = null;

  let pageCount =
    0;

  let requestCount =
    0;

  let retryCount =
    0;

  for (;;) {
    const request =
      buildGoogleAdsAccountInventorySearchRequest(
        {
          ...input,

          pageToken:
            nextPageToken,
        },
      );

    let page:
      ParsedGoogleAdsAccountInventorySearchPage |
      null =
        null;

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
              GoogleAdsAccountInventoryError
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
          throw new GoogleAdsAccountInventoryError(
            "RETRY_EXHAUSTED",
            "Google Ads account inventory retry limit was reached.",
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
          throw new GoogleAdsAccountInventoryError(
            "REQUEST_FAILED",
            "Google Ads account inventory retry delay failed.",
            {
              cause:
                sleepError,
            },
          );
        }
      }
    }

    if (!page) {
      throw new GoogleAdsAccountInventoryError(
        "INVALID_RESPONSE",
        "Google Ads account inventory page was not produced.",
      );
    }

    pageCount +=
      1;

    rawRows.push(
      ...page.rows,
    );

    if (
      page.nextPageToken ===
      null
    ) {
      break;
    }

    if (
      seenPageTokens.has(
        page.nextPageToken,
      )
    ) {
      throw new GoogleAdsAccountInventoryError(
        "PAGINATION_LOOP",
        "Google Ads account inventory repeated a page token.",
      );
    }

    seenPageTokens.add(
      page.nextPageToken,
    );

    if (
      pageCount >=
      maxPages
    ) {
      throw new GoogleAdsAccountInventoryError(
        "PAGE_LIMIT_EXCEEDED",
        "Google Ads account inventory exceeded the bounded page limit.",
      );
    }

    nextPageToken =
      page.nextPageToken;
  }

  const classification =
    classifyGoogleAdsAccountInventoryRows(
      rawRows,
    );

  return Object.freeze({
    ...classification,

    pageCount,
    requestCount,
    retryCount,
  });
}
