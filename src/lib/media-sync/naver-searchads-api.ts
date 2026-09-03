import { createHmac } from "node:crypto";

import type { NaverSearchAdsCredentials } from "./connection-credentials";

const NAVER_SEARCH_ADS_API_BASE_URL =
  "https://api.searchad.naver.com";

const NAVER_SEARCH_ADS_CAMPAIGNS_URI =
  "/ncc/campaigns";

const NAVER_SEARCH_ADS_ADGROUPS_URI =
  "/ncc/adgroups";

const NAVER_SEARCH_ADS_KEYWORDS_URI =
  "/ncc/keywords";

const NAVER_SEARCH_ADS_ADS_URI =
  "/ncc/ads";

const NAVER_SEARCH_ADS_STATS_URI =
  "/stats";

const NAVER_SEARCH_ADS_GET_METHOD =
  "GET";

const NAVER_SEARCH_ADS_REQUEST_TIMEOUT_MS =
  10_000;

const DEFAULT_LIST_RECORD_SIZE = 100;
const MAX_LIST_RECORD_SIZE = 1000;

const NAVER_SEARCH_ADS_DAILY_STATS_TIME_INCREMENT =
  1;

const MIN_NAVER_SEARCH_ADS_STATS_BATCH_SIZE =
  2;

const MAX_NAVER_SEARCH_ADS_STATS_BATCH_SIZE =
  5;

const NAVER_SEARCH_ADS_ENTITY_STATS_FIELDS = [
  "impCnt",
  "clkCnt",
  "salesAmt",
  "ccnt",
  "convAmt",
] as const;

const NAVER_SEARCH_ADS_KEYWORD_STATS_FIELDS = [
  ...NAVER_SEARCH_ADS_ENTITY_STATS_FIELDS,
  "avgRnk",
] as const;

export type NaverSearchAdsApiErrorCode =
  | "INVALID_INPUT"
  | "REQUEST_TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class NaverSearchAdsApiError extends Error {
  readonly code: NaverSearchAdsApiErrorCode;
  readonly status: number | null;

  constructor(
    code: NaverSearchAdsApiErrorCode,
    message: string,
    options?: ErrorOptions & {
      status?: number | null;
    },
  ) {
    super(message, options);

    this.name = "NaverSearchAdsApiError";
    this.code = code;
    this.status = options?.status ?? null;
  }
}

export type ValidateNaverSearchAdsCredentialsResult = {
  ok: boolean;
  status: number;
};

export type NaverSearchAdsListSelector =
  | "NEXT"
  | "PREVIOUS";

export type NaverSearchAdsCampaignRecord = {
  id: string;
  name: string;
  campaignType: string | null;
  status: string | null;
  statusReason: string | null;
  userLock: boolean | null;
};

export type NaverSearchAdsAdgroupRecord = {
  id: string;
  campaignId: string;
  name: string;
  adgroupType: string | null;
  status: string | null;
  statusReason: string | null;
  userLock: boolean | null;
};

export type NaverSearchAdsKeywordRecord = {
  id: string;
  adgroupId: string;
  keyword: string;
  inspectStatus: string | null;
  status: string | null;
  statusReason: string | null;
  userLock: boolean | null;
  bidAmount: number | null;
  useGroupBidAmount: boolean | null;
};

export type NaverSearchAdsAdRecord = {
  id: string;
  adgroupId: string;
  type: string;
  inspectStatus: string | null;
  status: string | null;
  statusReason: string | null;
  userLock: boolean | null;
  referenceKey: string | null;
};

export type NaverSearchAdsStatsEntityType =
  | "campaign"
  | "adgroup"
  | "keyword"
  | "ad";

export type NaverSearchAdsEntityDailyStatsRecord = {
  entityId: string;
  entityType: NaverSearchAdsStatsEntityType;
  date: string;
  periodStart: string;
  periodEnd: string;
  impCnt: number | null;
  clkCnt: number | null;
  salesAmt: number | null;
  ccnt: number | null;
  convAmt: number | null;
};

export type NaverSearchAdsEntityDailyStatsResult = {
  entityId: string;
  entityType: NaverSearchAdsStatsEntityType;
  dateFrom: string;
  dateTo: string;
  records: NaverSearchAdsEntityDailyStatsRecord[];
};

export type FetchNaverSearchAdsEntityDailyStatsInput = {
  credentials: NaverSearchAdsCredentials;
  entityId: string;
  entityType: NaverSearchAdsStatsEntityType;
  dateFrom: string;
  dateTo: string;
};

export type FetchNaverSearchAdsEntityDailyStatsBatchInput = {
  credentials: NaverSearchAdsCredentials;
  entityIds: string[];
  entityType: NaverSearchAdsStatsEntityType;
  dateFrom: string;
  dateTo: string;
};

export type NaverSearchAdsEntityDailyStatsBatchResult = {
  entityType: NaverSearchAdsStatsEntityType;
  dateFrom: string;
  dateTo: string;
  results: NaverSearchAdsEntityDailyStatsResult[];
};

export type NaverSearchAdsKeywordDailyStatsRecord = {
  keywordId: string;
  date: string;
  periodStart: string;
  periodEnd: string;
  impCnt: number | null;
  clkCnt: number | null;
  salesAmt: number | null;
  ccnt: number | null;
  convAmt: number | null;
  avgRnk: number | null;
};

export type NaverSearchAdsKeywordDailyStatsResult = {
  keywordId: string;
  dateFrom: string;
  dateTo: string;
  records: NaverSearchAdsKeywordDailyStatsRecord[];
};

export type FetchNaverSearchAdsKeywordDailyStatsInput = {
  credentials: NaverSearchAdsCredentials;
  keywordId: string;
  dateFrom: string;
  dateTo: string;
};

export type NaverSearchAdsSafeResponseShape = {
  kind:
    | "null"
    | "array"
    | "object"
    | "string"
    | "number"
    | "boolean"
    | "undefined"
    | "other";
  keys: string[];
  itemCount: number | null;
  firstItemKind:
    | "null"
    | "array"
    | "object"
    | "string"
    | "number"
    | "boolean"
    | "undefined"
    | "other"
    | null;
  firstItemKeys: string[];
};

export type NaverSearchAdsKeywordDailyStatsBatchShapeResult = {
  keywordCount: number;
  dateFrom: string;
  dateTo: string;
  responseShape: NaverSearchAdsSafeResponseShape;
  topLevelChildShapes: Record<
    string,
    NaverSearchAdsSafeResponseShape
  >;
};

export type ProbeNaverSearchAdsKeywordDailyStatsBatchShapeInput = {
  credentials: NaverSearchAdsCredentials;
  keywordIds: readonly string[];
  dateFrom: string;
  dateTo: string;
};

export type ProbeNaverSearchAdsKeywordStatsIdsShapeInput = {
  credentials: NaverSearchAdsCredentials;
  keywordId: string;
  dateFrom: string;
  dateTo: string;
  includeTimeIncrement: boolean;
};

export type NaverSearchAdsKeywordStatsIdsShapeResult = {
  keywordId: string;
  dateFrom: string;
  dateTo: string;
  includeTimeIncrement: boolean;
  responseShape: NaverSearchAdsSafeResponseShape;
  topLevelChildShapes: Record<
    string,
    NaverSearchAdsSafeResponseShape
  >;
};

export type NaverSearchAdsListPage<T> = {
  records: T[];
  recordSize: number;
  selector: NaverSearchAdsListSelector;
  baseSearchId: string | null;
  nextBaseSearchId: string | null;
};

export type FetchNaverSearchAdsCampaignPageInput = {
  credentials: NaverSearchAdsCredentials;
  baseSearchId?: string | null;
  recordSize?: number;
  selector?: NaverSearchAdsListSelector;
};

export type FetchNaverSearchAdsAdgroupPageInput = {
  credentials: NaverSearchAdsCredentials;
  campaignId: string;
  baseSearchId?: string | null;
  recordSize?: number;
  selector?: NaverSearchAdsListSelector;
};

export type FetchNaverSearchAdsKeywordPageInput = {
  credentials: NaverSearchAdsCredentials;
  adgroupId: string;
  baseSearchId?: string | null;
  recordSize?: number;
  selector?: NaverSearchAdsListSelector;
};

export type FetchNaverSearchAdsAdPageInput = {
  credentials: NaverSearchAdsCredentials;
  adgroupId: string;
  baseSearchId?: string | null;
  recordSize?: number;
  selector?: NaverSearchAdsListSelector;
};

type UnknownRecord = Record<string, unknown>;

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must be a string or null.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length > maxLength) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeRequiredCredentialValue(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  return normalizeRequiredString(
    value,
    fieldName,
    maxLength,
  );
}

function normalizeCredentials(
  credentials: NaverSearchAdsCredentials,
): NaverSearchAdsCredentials {
  return {
    customerId:
      normalizeRequiredCredentialValue(
        credentials.customerId,
        "customerId",
        300,
      ),
    accessLicense:
      normalizeRequiredCredentialValue(
        credentials.accessLicense,
        "accessLicense",
        1000,
      ),
    secretKey:
      normalizeRequiredCredentialValue(
        credentials.secretKey,
        "secretKey",
        2000,
      ),
  };
}

function normalizeIsoDate(
  value: unknown,
  fieldName: string,
): string {
  const normalizedValue =
    normalizeRequiredString(
      value,
      fieldName,
      10,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalizedValue,
    )
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const [yearText, monthText, dayText] =
    normalizedValue.split("-");

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
  );

  const parsedDate = new Date(timestamp);

  if (
    !Number.isFinite(timestamp) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must be a valid calendar date.`,
    );
  }

  return normalizedValue;
}

function assertDateRange(
  dateFrom: string,
  dateTo: string,
): void {
  if (dateFrom > dateTo) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      "dateFrom must be earlier than or equal to dateTo.",
    );
  }
}

function createZeroEntityDailyStatsRecords(
  entityId: string,
  entityType: NaverSearchAdsStatsEntityType,
  dateFrom: string,
  dateTo: string,
): NaverSearchAdsEntityDailyStatsRecord[] {
  const oneDayMilliseconds =
    24 * 60 * 60 * 1_000;
  const fromMilliseconds = Date.parse(
    `${dateFrom}T00:00:00.000Z`,
  );
  const toMilliseconds = Date.parse(
    `${dateTo}T00:00:00.000Z`,
  );
  const records:
    NaverSearchAdsEntityDailyStatsRecord[] = [];

  for (
    let timestamp = fromMilliseconds;
    timestamp <= toMilliseconds;
    timestamp += oneDayMilliseconds
  ) {
    const date = new Date(timestamp)
      .toISOString()
      .slice(0, 10);

    records.push({
      entityId,
      entityType,
      date,
      periodStart: date,
      periodEnd: date,
      impCnt: 0,
      clkCnt: 0,
      salesAmt: 0,
      ccnt: 0,
      convAmt: 0,
    });
  }

  return records;
}

function normalizeStatsEntityType(
  value: unknown,
): NaverSearchAdsStatsEntityType {
  if (
    value !== "campaign" &&
    value !== "adgroup" &&
    value !== "keyword" &&
    value !== "ad"
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      "entityType must be campaign, adgroup, keyword, or ad.",
    );
  }

  return value;
}

function normalizeStatsEntityIdBatch(
  value: unknown,
  fieldName: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must be an array.`,
    );
  }

  if (
    value.length <
      MIN_NAVER_SEARCH_ADS_STATS_BATCH_SIZE ||
    value.length >
      MAX_NAVER_SEARCH_ADS_STATS_BATCH_SIZE
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must contain between ${MIN_NAVER_SEARCH_ADS_STATS_BATCH_SIZE} and ${MAX_NAVER_SEARCH_ADS_STATS_BATCH_SIZE} items.`,
    );
  }

  const normalizedEntityIds =
    value.map((entityId, index) =>
      normalizeRequiredString(
        entityId,
        `${fieldName}[${index}]`,
        200,
      ),
    );

  const uniqueEntityIds =
    new Set(normalizedEntityIds);

  if (
    uniqueEntityIds.size !==
    normalizedEntityIds.length
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `${fieldName} must not contain duplicates.`,
    );
  }

  return normalizedEntityIds;
}

function normalizeKeywordIdBatch(
  value: unknown,
): string[] {
  return normalizeStatsEntityIdBatch(
    value,
    "keywordIds",
  );
}

function getSafeResponseShapeKind(
  value: unknown,
): NaverSearchAdsSafeResponseShape["kind"] {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (isPlainObject(value)) {
    return "object";
  }

  if (typeof value === "string") {
    return "string";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "undefined") {
    return "undefined";
  }

  return "other";
}

function describeSafeResponseShape(
  value: unknown,
): NaverSearchAdsSafeResponseShape {
  const kind =
    getSafeResponseShapeKind(value);

  const keys =
    isPlainObject(value)
      ? Object.keys(value).sort()
      : [];

  if (!Array.isArray(value)) {
    return {
      kind,
      keys,
      itemCount: null,
      firstItemKind: null,
      firstItemKeys: [],
    };
  }

  const firstItem =
    value[0];

  return {
    kind,
    keys: [],
    itemCount: value.length,
    firstItemKind:
      value.length > 0
        ? getSafeResponseShapeKind(
            firstItem,
          )
        : null,
    firstItemKeys:
      isPlainObject(firstItem)
        ? Object.keys(firstItem).sort()
        : [],
  };
}

function buildSafeTopLevelChildShapes(
  value: unknown,
): Record<
  string,
  NaverSearchAdsSafeResponseShape
> {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [
        key,
        describeSafeResponseShape(
          value[key],
        ),
      ]),
  );
}

function normalizeRecordSize(
  value: unknown,
): number {
  if (value === undefined) {
    return DEFAULT_LIST_RECORD_SIZE;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_LIST_RECORD_SIZE
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      `recordSize must be an integer between 1 and ${MAX_LIST_RECORD_SIZE}.`,
    );
  }

  return value;
}

function normalizeSelector(
  value: unknown,
): NaverSearchAdsListSelector {
  if (value === undefined) {
    return "NEXT";
  }

  if (
    value !== "NEXT" &&
    value !== "PREVIOUS"
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      "selector must be NEXT or PREVIOUS.",
    );
  }

  return value;
}

function createNaverSearchAdsSignature(input: {
  timestamp: string;
  method: string;
  uri: string;
  secretKey: string;
}): string {
  const message = [
    input.timestamp,
    input.method,
    input.uri,
  ].join(".");

  return createHmac(
    "sha256",
    input.secretKey,
  )
    .update(message, "utf8")
    .digest("base64");
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
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

function requireResponseString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is invalid.`,
    );
  }

  return value;
}

function readNullableResponseString(
  value: unknown,
  fieldName: string,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is invalid.`,
    );
  }

  return value;
}

function readNullableResponseBoolean(
  value: unknown,
  fieldName: string,
): boolean | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "boolean") {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is invalid.`,
    );
  }

  return value;
}

function readNullableResponseNumber(
  value: unknown,
  fieldName: string,
): number | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is invalid.`,
    );
  }

  return value;
}

function hasOwnProperty(
  record: UnknownRecord,
  fieldName: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    record,
    fieldName,
  );
}

function readRequiredNullableResponseNumber(
  record: UnknownRecord,
  fieldName: string,
): number | null {
  if (!hasOwnProperty(record, fieldName)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is missing.`,
    );
  }

  return readNullableResponseNumber(
    record[fieldName],
    fieldName,
  );
}

function parseResponseIsoDate(
  value: unknown,
  fieldName: string,
): string {
  const normalizedValue =
    requireResponseString(
      value,
      fieldName,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalizedValue,
    )
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is not a valid date.`,
    );
  }

  const [yearText, monthText, dayText] =
    normalizedValue.split("-");

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
  );
  const parsedDate = new Date(timestamp);

  if (
    !Number.isFinite(timestamp) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is not a valid calendar date.`,
    );
  }

  return normalizedValue;
}


function parseEntityDailyStatsDataRecord(
  value: unknown,
  entityId: string,
  entityType: NaverSearchAdsStatsEntityType,
  dateFrom: string,
  dateTo: string,
): NaverSearchAdsEntityDailyStatsRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads entity stats data record is invalid.",
    );
  }

  const periodStart = parseResponseIsoDate(
    value.dateStart,
    "stats.data.dateStart",
  );

  const periodEnd = parseResponseIsoDate(
    value.dateEnd,
    "stats.data.dateEnd",
  );

  if (periodStart !== periodEnd) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads daily stats record spans more than one date.",
    );
  }

  if (
    periodStart < dateFrom ||
    periodStart > dateTo
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads daily stats record is outside the requested date range.",
    );
  }

  return {
    entityId,
    entityType,
    date: periodStart,
    periodStart,
    periodEnd,
    impCnt:
      readRequiredNullableResponseNumber(
        value,
        "impCnt",
      ),
    clkCnt:
      readRequiredNullableResponseNumber(
        value,
        "clkCnt",
      ),
    salesAmt:
      readRequiredNullableResponseNumber(
        value,
        "salesAmt",
      ),
    ccnt:
      readRequiredNullableResponseNumber(
        value,
        "ccnt",
      ),
    convAmt:
      readRequiredNullableResponseNumber(
        value,
        "convAmt",
      ),
  };
}

function parseEntityDailyStatsResponse(
  value: unknown,
  entityId: string,
  entityType: NaverSearchAdsStatsEntityType,
  dateFrom: string,
  dateTo: string,
): NaverSearchAdsEntityDailyStatsRecord[] {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats response must be an object.",
    );
  }

  requireResponseString(
    value.compTm,
    "stats.compTm",
  );

  requireResponseString(
    value.cycleBaseTm,
    "stats.cycleBaseTm",
  );

  if (!isPlainObject(value.summary)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats summary must be an object.",
    );
  }

  const summaryDateStart =
    parseResponseIsoDate(
      value.summary.dateStart,
      "stats.summary.dateStart",
    );

  const summaryDateEnd =
    parseResponseIsoDate(
      value.summary.dateEnd,
      "stats.summary.dateEnd",
    );

  if (
    summaryDateStart !== dateFrom ||
    summaryDateEnd !== dateTo
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats summary date range does not match the request.",
    );
  }

  if (!Array.isArray(value.data)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats data must be an array.",
    );
  }

  const records = value.data.map((record) =>
    parseEntityDailyStatsDataRecord(
      record,
      entityId,
      entityType,
      dateFrom,
      dateTo,
    ),
  );

  const seenDates = new Set<string>();

  for (const record of records) {
    if (seenDates.has(record.date)) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads stats response contains a duplicate date.",
      );
    }

    seenDates.add(record.date);
  }

  records.sort((left, right) =>
    left.date.localeCompare(right.date),
  );

  return records;
}

function parseEntityDailyStatsBatchResponse(
  value: unknown,
  entityIds: readonly string[],
  entityType: NaverSearchAdsStatsEntityType,
  dateFrom: string,
  dateTo: string,
): NaverSearchAdsEntityDailyStatsResult[] {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads batch stats response must be an object.",
    );
  }

  requireResponseString(
    value.compTm,
    "stats.compTm",
  );

  requireResponseString(
    value.cycleBaseTm,
    "stats.cycleBaseTm",
  );

  if (!Array.isArray(value.data)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads batch stats data must be an array.",
    );
  }

  const expectedIds = new Set(entityIds);
  const recordsByEntityId = new Map<
    string,
    NaverSearchAdsEntityDailyStatsRecord[]
  >();

  for (const item of value.data) {
    if (!isPlainObject(item)) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads batch stats data record is invalid.",
      );
    }

    const entityId = requireResponseString(
      item.id,
      "stats.data.id",
    );

    if (!expectedIds.has(entityId)) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads batch stats response contains an unexpected entity ID.",
      );
    }

    const parsedRecords = Array.isArray(item.data)
      ? item.data.map((record) =>
          parseEntityDailyStatsDataRecord(
            record,
            entityId,
            entityType,
            dateFrom,
            dateTo,
          ),
        )
      : hasOwnProperty(item, "dateStart") ||
          hasOwnProperty(item, "dateEnd")
        ? [
            parseEntityDailyStatsDataRecord(
              item,
              entityId,
              entityType,
              dateFrom,
              dateTo,
            ),
          ]
        : dateFrom === dateTo
          ? [
              {
                entityId,
                entityType,
                date: dateFrom,
                periodStart: dateFrom,
                periodEnd: dateTo,
                impCnt:
                  readRequiredNullableResponseNumber(
                    item,
                    "impCnt",
                  ),
                clkCnt:
                  readRequiredNullableResponseNumber(
                    item,
                    "clkCnt",
                  ),
                salesAmt:
                  readRequiredNullableResponseNumber(
                    item,
                    "salesAmt",
                  ),
                ccnt:
                  readRequiredNullableResponseNumber(
                    item,
                    "ccnt",
                  ),
                convAmt:
                  readRequiredNullableResponseNumber(
                    item,
                    "convAmt",
                  ),
              },
            ]
          : (() => {
              throw new NaverSearchAdsApiError(
                "INVALID_RESPONSE",
                "Naver Search Ads multi-day batch stats response does not contain daily records.",
              );
            })();

    const existingRecords =
      recordsByEntityId.get(entityId) ?? [];

    existingRecords.push(...parsedRecords);
    recordsByEntityId.set(
      entityId,
      existingRecords,
    );
  }

  return entityIds.map((entityId) => {
    const returnedRecords =
      recordsByEntityId.get(entityId);
    const records =
      returnedRecords &&
      returnedRecords.length > 0
        ? returnedRecords
        : createZeroEntityDailyStatsRecords(
            entityId,
            entityType,
            dateFrom,
            dateTo,
          );

    const seenDates = new Set<string>();

    for (const record of records) {
      if (seenDates.has(record.date)) {
        throw new NaverSearchAdsApiError(
          "INVALID_RESPONSE",
          "Naver Search Ads batch stats response contains a duplicate entity date.",
        );
      }

      seenDates.add(record.date);
    }

    records.sort((left, right) =>
      left.date.localeCompare(right.date),
    );

    return {
      entityId,
      entityType,
      dateFrom,
      dateTo,
      records,
    };
  });
}

function parseKeywordDailyStatsDataRecord(
  value: unknown,
  keywordId: string,
  dateFrom: string,
  dateTo: string,
): NaverSearchAdsKeywordDailyStatsRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads keyword stats data record is invalid.",
    );
  }

  const periodStart = parseResponseIsoDate(
    value.dateStart,
    "stats.data.dateStart",
  );

  const periodEnd = parseResponseIsoDate(
    value.dateEnd,
    "stats.data.dateEnd",
  );

  if (periodStart !== periodEnd) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads daily stats record spans more than one date.",
    );
  }

  if (
    periodStart < dateFrom ||
    periodStart > dateTo
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads daily stats record is outside the requested date range.",
    );
  }

  return {
    keywordId,
    date: periodStart,
    periodStart,
    periodEnd,
    impCnt:
      readRequiredNullableResponseNumber(
        value,
        "impCnt",
      ),
    clkCnt:
      readRequiredNullableResponseNumber(
        value,
        "clkCnt",
      ),
    salesAmt:
      readRequiredNullableResponseNumber(
        value,
        "salesAmt",
      ),
    ccnt:
      readRequiredNullableResponseNumber(
        value,
        "ccnt",
      ),
    convAmt:
      readRequiredNullableResponseNumber(
        value,
        "convAmt",
      ),
    avgRnk:
      readRequiredNullableResponseNumber(
        value,
        "avgRnk",
      ),
  };
}

function parseKeywordDailyStatsResponse(
  value: unknown,
  keywordId: string,
  dateFrom: string,
  dateTo: string,
): NaverSearchAdsKeywordDailyStatsRecord[] {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats response must be an object.",
    );
  }

  requireResponseString(
    value.compTm,
    "stats.compTm",
  );

  requireResponseString(
    value.cycleBaseTm,
    "stats.cycleBaseTm",
  );

  if (!isPlainObject(value.summary)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats summary must be an object.",
    );
  }

  const summaryDateStart =
    parseResponseIsoDate(
      value.summary.dateStart,
      "stats.summary.dateStart",
    );

  const summaryDateEnd =
    parseResponseIsoDate(
      value.summary.dateEnd,
      "stats.summary.dateEnd",
    );

  if (
    summaryDateStart !== dateFrom ||
    summaryDateEnd !== dateTo
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats summary date range does not match the request.",
    );
  }

  if (!Array.isArray(value.data)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stats data must be an array.",
    );
  }

  const records = value.data.map((record) =>
    parseKeywordDailyStatsDataRecord(
      record,
      keywordId,
      dateFrom,
      dateTo,
    ),
  );

  const seenDates = new Set<string>();

  for (const record of records) {
    if (seenDates.has(record.date)) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads stats response contains a duplicate date.",
      );
    }

    seenDates.add(record.date);
  }

  records.sort((left, right) =>
    left.date.localeCompare(right.date),
  );

  return records;
}

function parseCampaignRecord(
  value: unknown,
): NaverSearchAdsCampaignRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads campaign record is invalid.",
    );
  }

  return {
    id: requireResponseString(
      value.nccCampaignId,
      "nccCampaignId",
    ),
    name: requireResponseString(
      value.name,
      "campaign.name",
    ),
    campaignType:
      readNullableResponseString(
        value.campaignTp,
        "campaignTp",
      ),
    status:
      readNullableResponseString(
        value.status,
        "campaign.status",
      ),
    statusReason:
      readNullableResponseString(
        value.statusReason,
        "campaign.statusReason",
      ),
    userLock:
      readNullableResponseBoolean(
        value.userLock,
        "campaign.userLock",
      ),
  };
}

function parseAdgroupRecord(
  value: unknown,
): NaverSearchAdsAdgroupRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads adgroup record is invalid.",
    );
  }

  return {
    id: requireResponseString(
      value.nccAdgroupId,
      "nccAdgroupId",
    ),
    campaignId:
      requireResponseString(
        value.nccCampaignId,
        "adgroup.nccCampaignId",
      ),
    name: requireResponseString(
      value.name,
      "adgroup.name",
    ),
    adgroupType:
      readNullableResponseString(
        value.adgroupType,
        "adgroupType",
      ),
    status:
      readNullableResponseString(
        value.status,
        "adgroup.status",
      ),
    statusReason:
      readNullableResponseString(
        value.statusReason,
        "adgroup.statusReason",
      ),
    userLock:
      readNullableResponseBoolean(
        value.userLock,
        "adgroup.userLock",
      ),
  };
}

function parseKeywordRecord(
  value: unknown,
): NaverSearchAdsKeywordRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads keyword record is invalid.",
    );
  }

  return {
    id: requireResponseString(
      value.nccKeywordId,
      "nccKeywordId",
    ),
    adgroupId:
      requireResponseString(
        value.nccAdgroupId,
        "keyword.nccAdgroupId",
      ),
    keyword:
      requireResponseString(
        value.keyword,
        "keyword.keyword",
      ),
    inspectStatus:
      readNullableResponseString(
        value.inspectStatus,
        "keyword.inspectStatus",
      ),
    status:
      readNullableResponseString(
        value.status,
        "keyword.status",
      ),
    statusReason:
      readNullableResponseString(
        value.statusReason,
        "keyword.statusReason",
      ),
    userLock:
      readNullableResponseBoolean(
        value.userLock,
        "keyword.userLock",
      ),
    bidAmount:
      readNullableResponseNumber(
        value.bidAmt,
        "keyword.bidAmt",
      ),
    useGroupBidAmount:
      readNullableResponseBoolean(
        value.useGroupBidAmt,
        "keyword.useGroupBidAmt",
      ),
  };
}


function parseAdRecord(
  value: unknown,
): NaverSearchAdsAdRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads ad record is invalid.",
    );
  }

  return {
    id: requireResponseString(
      value.nccAdId,
      "nccAdId",
    ),
    adgroupId:
      requireResponseString(
        value.nccAdgroupId,
        "ad.nccAdgroupId",
      ),
    type:
      requireResponseString(
        value.type,
        "ad.type",
      ),
    inspectStatus:
      readNullableResponseString(
        value.inspectStatus,
        "ad.inspectStatus",
      ),
    status:
      readNullableResponseString(
        value.status,
        "ad.status",
      ),
    statusReason:
      readNullableResponseString(
        value.statusReason,
        "ad.statusReason",
      ),
    userLock:
      readNullableResponseBoolean(
        value.userLock,
        "ad.userLock",
      ),
    referenceKey:
      readNullableResponseString(
        value.referenceKey,
        "ad.referenceKey",
      ),
  };
}

async function requestNaverSearchAdsJson(
  credentials: NaverSearchAdsCredentials,
  uri: string,
  searchParams?: ReadonlyArray<
    readonly [string, string]
  >,
): Promise<unknown> {
  const normalizedCredentials =
    normalizeCredentials(credentials);

  const normalizedUri =
    normalizeRequiredString(
      uri,
      "uri",
      500,
    );

  if (!normalizedUri.startsWith("/")) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      "uri must start with a slash.",
    );
  }

  const timestamp = Date.now().toString();

  const signature =
    createNaverSearchAdsSignature({
      timestamp,
      method:
        NAVER_SEARCH_ADS_GET_METHOD,
      uri: normalizedUri,
      secretKey:
        normalizedCredentials.secretKey,
    });

  const requestUrl = new URL(
    normalizedUri,
    NAVER_SEARCH_ADS_API_BASE_URL,
  );

  for (
    const [key, value]
    of searchParams ?? []
  ) {
    requestUrl.searchParams.append(
      key,
      value,
    );
  }

  const abortController =
    new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, NAVER_SEARCH_ADS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      requestUrl,
      {
        method:
          NAVER_SEARCH_ADS_GET_METHOD,
        headers: {
          Accept: "application/json",
          "X-Timestamp": timestamp,
          "X-API-KEY":
            normalizedCredentials.accessLicense,
          "X-Customer":
            normalizedCredentials.customerId,
          "X-Signature": signature,
        },
        cache: "no-store",
        signal: abortController.signal,
      },
    );

    if (!response.ok) {
      if (response.body) {
        await response.body.cancel();
      }

      throw new NaverSearchAdsApiError(
        "HTTP_ERROR",
        "Naver Search Ads API returned an unsuccessful response.",
        {
          status: response.status,
        },
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads API returned invalid JSON.",
        { cause: error },
      );
    }
  } catch (error) {
    if (
      error instanceof
      NaverSearchAdsApiError
    ) {
      throw error;
    }

    if (
      abortController.signal.aborted ||
      isAbortError(error)
    ) {
      throw new NaverSearchAdsApiError(
        "REQUEST_TIMEOUT",
        "Naver Search Ads API request timed out.",
      );
    }

    throw new NaverSearchAdsApiError(
      "NETWORK_ERROR",
      "Naver Search Ads API request failed.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseListResponse<T>(
  value: unknown,
  parser: (record: unknown) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new NaverSearchAdsApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads list response must be an array.",
    );
  }

  return value.map((record) =>
    parser(record),
  );
}

function buildPagingSearchParams(input: {
  recordSize: number;
  selector: NaverSearchAdsListSelector;
  baseSearchId: string | null;
}): Array<readonly [string, string]> {
  const searchParams: Array<
    readonly [string, string]
  > = [
    [
      "recordSize",
      input.recordSize.toString(),
    ],
    [
      "selector",
      input.selector,
    ],
  ];

  if (input.baseSearchId) {
    searchParams.push([
      "baseSearchId",
      input.baseSearchId,
    ]);
  }

  return searchParams;
}

function buildListPage<T extends { id: string }>(
  records: T[],
  input: {
    recordSize: number;
    selector: NaverSearchAdsListSelector;
    baseSearchId: string | null;
  },
): NaverSearchAdsListPage<T> {
  return {
    records,
    recordSize: input.recordSize,
    selector: input.selector,
    baseSearchId: input.baseSearchId,
    nextBaseSearchId:
      records.length > 0
        ? records[
            records.length - 1
          ]?.id ?? null
        : null,
  };
}

export async function validateNaverSearchAdsCredentials(
  credentials: NaverSearchAdsCredentials,
): Promise<ValidateNaverSearchAdsCredentialsResult> {
  const normalizedCredentials =
    normalizeCredentials(credentials);

  const timestamp = Date.now().toString();

  const signature =
    createNaverSearchAdsSignature({
      timestamp,
      method:
        NAVER_SEARCH_ADS_GET_METHOD,
      uri:
        NAVER_SEARCH_ADS_CAMPAIGNS_URI,
      secretKey:
        normalizedCredentials.secretKey,
    });

  const requestUrl = new URL(
    NAVER_SEARCH_ADS_CAMPAIGNS_URI,
    NAVER_SEARCH_ADS_API_BASE_URL,
  );

  requestUrl.searchParams.set(
    "recordSize",
    "1",
  );

  const abortController =
    new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, NAVER_SEARCH_ADS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      requestUrl,
      {
        method:
          NAVER_SEARCH_ADS_GET_METHOD,
        headers: {
          Accept: "application/json",
          "X-Timestamp": timestamp,
          "X-API-KEY":
            normalizedCredentials.accessLicense,
          "X-Customer":
            normalizedCredentials.customerId,
          "X-Signature": signature,
        },
        cache: "no-store",
        signal: abortController.signal,
      },
    );

    const result: ValidateNaverSearchAdsCredentialsResult =
      {
        ok: response.ok,
        status: response.status,
      };

    if (response.body) {
      await response.body.cancel();
    }

    return result;
  } catch (error) {
    if (
      abortController.signal.aborted ||
      isAbortError(error)
    ) {
      throw new NaverSearchAdsApiError(
        "REQUEST_TIMEOUT",
        "Naver Search Ads API credential validation timed out.",
      );
    }

    throw new NaverSearchAdsApiError(
      "NETWORK_ERROR",
      "Naver Search Ads API credential validation request failed.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchNaverSearchAdsCampaignPage(
  input: FetchNaverSearchAdsCampaignPageInput,
): Promise<
  NaverSearchAdsListPage<
    NaverSearchAdsCampaignRecord
  >
> {
  const recordSize =
    normalizeRecordSize(
      input.recordSize,
    );

  const selector =
    normalizeSelector(
      input.selector,
    );

  const baseSearchId =
    normalizeOptionalString(
      input.baseSearchId,
      "baseSearchId",
      200,
    );

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_CAMPAIGNS_URI,
      buildPagingSearchParams({
        recordSize,
        selector,
        baseSearchId,
      }),
    );

  const records = parseListResponse(
    response,
    parseCampaignRecord,
  );

  return buildListPage(records, {
    recordSize,
    selector,
    baseSearchId,
  });
}

export async function fetchNaverSearchAdsAdgroupPage(
  input: FetchNaverSearchAdsAdgroupPageInput,
): Promise<
  NaverSearchAdsListPage<
    NaverSearchAdsAdgroupRecord
  >
> {
  const campaignId =
    normalizeRequiredString(
      input.campaignId,
      "campaignId",
      200,
    );

  const recordSize =
    normalizeRecordSize(
      input.recordSize,
    );

  const selector =
    normalizeSelector(
      input.selector,
    );

  const baseSearchId =
    normalizeOptionalString(
      input.baseSearchId,
      "baseSearchId",
      200,
    );

  const searchParams =
    buildPagingSearchParams({
      recordSize,
      selector,
      baseSearchId,
    });

  searchParams.unshift([
    "nccCampaignId",
    campaignId,
  ]);

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_ADGROUPS_URI,
      searchParams,
    );

  const records = parseListResponse(
    response,
    parseAdgroupRecord,
  );

  for (const record of records) {
    if (
      record.campaignId !==
      campaignId
    ) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads adgroup response contains a different campaign ID.",
      );
    }
  }

  return buildListPage(records, {
    recordSize,
    selector,
    baseSearchId,
  });
}

export async function fetchNaverSearchAdsKeywordPage(
  input: FetchNaverSearchAdsKeywordPageInput,
): Promise<
  NaverSearchAdsListPage<
    NaverSearchAdsKeywordRecord
  >
> {
  const adgroupId =
    normalizeRequiredString(
      input.adgroupId,
      "adgroupId",
      200,
    );

  const recordSize =
    normalizeRecordSize(
      input.recordSize,
    );

  const selector =
    normalizeSelector(
      input.selector,
    );

  const baseSearchId =
    normalizeOptionalString(
      input.baseSearchId,
      "baseSearchId",
      200,
    );

  const searchParams =
    buildPagingSearchParams({
      recordSize,
      selector,
      baseSearchId,
    });

  searchParams.unshift([
    "nccAdgroupId",
    adgroupId,
  ]);

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_KEYWORDS_URI,
      searchParams,
    );

  const records = parseListResponse(
    response,
    parseKeywordRecord,
  );

  for (const record of records) {
    if (
      record.adgroupId !==
      adgroupId
    ) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads keyword response contains a different adgroup ID.",
      );
    }
  }

  return buildListPage(records, {
    recordSize,
    selector,
    baseSearchId,
  });
}


export async function fetchNaverSearchAdsAdPage(
  input: FetchNaverSearchAdsAdPageInput,
): Promise<
  NaverSearchAdsListPage<
    NaverSearchAdsAdRecord
  >
> {
  const adgroupId =
    normalizeRequiredString(
      input.adgroupId,
      "adgroupId",
      200,
    );

  const recordSize =
    normalizeRecordSize(
      input.recordSize,
    );

  const selector =
    normalizeSelector(
      input.selector,
    );

  const baseSearchId =
    normalizeOptionalString(
      input.baseSearchId,
      "baseSearchId",
      200,
    );

  const searchParams =
    buildPagingSearchParams({
      recordSize,
      selector,
      baseSearchId,
    });

  searchParams.unshift([
    "nccAdgroupId",
    adgroupId,
  ]);

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_ADS_URI,
      searchParams,
    );

  const records = parseListResponse(
    response,
    parseAdRecord,
  );

  for (const record of records) {
    if (
      record.adgroupId !==
      adgroupId
    ) {
      throw new NaverSearchAdsApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads ad response contains a different adgroup ID.",
      );
    }
  }

  return buildListPage(records, {
    recordSize,
    selector,
    baseSearchId,
  });
}

export async function fetchNaverSearchAdsEntityDailyStats(
  input: FetchNaverSearchAdsEntityDailyStatsInput,
): Promise<NaverSearchAdsEntityDailyStatsResult> {
  const entityId =
    normalizeRequiredString(
      input.entityId,
      "entityId",
      200,
    );

  const entityType =
    normalizeStatsEntityType(
      input.entityType,
    );

  const dateFrom = normalizeIsoDate(
    input.dateFrom,
    "dateFrom",
  );

  const dateTo = normalizeIsoDate(
    input.dateTo,
    "dateTo",
  );

  assertDateRange(dateFrom, dateTo);

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_STATS_URI,
      [
        ["id", entityId],
        [
          "fields",
          JSON.stringify(
            NAVER_SEARCH_ADS_ENTITY_STATS_FIELDS,
          ),
        ],
        [
          "timeRange",
          JSON.stringify({
            since: dateFrom,
            until: dateTo,
          }),
        ],
        [
          "timeIncrement",
          NAVER_SEARCH_ADS_DAILY_STATS_TIME_INCREMENT.toString(),
        ],
      ],
    );

  return {
    entityId,
    entityType,
    dateFrom,
    dateTo,
    records:
      parseEntityDailyStatsResponse(
        response,
        entityId,
        entityType,
        dateFrom,
        dateTo,
      ),
  };
}

export async function fetchNaverSearchAdsEntityDailyStatsBatch(
  input: FetchNaverSearchAdsEntityDailyStatsBatchInput,
): Promise<NaverSearchAdsEntityDailyStatsBatchResult> {
  const entityIds =
    normalizeStatsEntityIdBatch(
      input.entityIds,
      "entityIds",
    );

  const entityType =
    normalizeStatsEntityType(
      input.entityType,
    );

  const dateFrom = normalizeIsoDate(
    input.dateFrom,
    "dateFrom",
  );

  const dateTo = normalizeIsoDate(
    input.dateTo,
    "dateTo",
  );

  assertDateRange(dateFrom, dateTo);

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_STATS_URI,
      [
        ...entityIds.map(
          (entityId) =>
            [
              "ids",
              entityId,
            ] as const,
        ),
        [
          "fields",
          JSON.stringify(
            NAVER_SEARCH_ADS_ENTITY_STATS_FIELDS,
          ),
        ],
        [
          "timeRange",
          JSON.stringify({
            since: dateFrom,
            until: dateTo,
          }),
        ],
        ...(dateFrom === dateTo
          ? []
          : [
              [
                "timeIncrement",
                NAVER_SEARCH_ADS_DAILY_STATS_TIME_INCREMENT.toString(),
              ] as const,
            ]),
      ],
    );

  return {
    entityType,
    dateFrom,
    dateTo,
    results:
      parseEntityDailyStatsBatchResponse(
        response,
        entityIds,
        entityType,
        dateFrom,
        dateTo,
      ),
  };
}

export async function fetchNaverSearchAdsKeywordDailyStats(
  input: FetchNaverSearchAdsKeywordDailyStatsInput,
): Promise<NaverSearchAdsKeywordDailyStatsResult> {
  const keywordId =
    normalizeRequiredString(
      input.keywordId,
      "keywordId",
      200,
    );

  const dateFrom = normalizeIsoDate(
    input.dateFrom,
    "dateFrom",
  );

  const dateTo = normalizeIsoDate(
    input.dateTo,
    "dateTo",
  );

  assertDateRange(dateFrom, dateTo);

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_STATS_URI,
      [
        ["id", keywordId],
        [
          "fields",
          JSON.stringify(
            NAVER_SEARCH_ADS_KEYWORD_STATS_FIELDS,
          ),
        ],
        [
          "timeRange",
          JSON.stringify({
            since: dateFrom,
            until: dateTo,
          }),
        ],
        [
          "timeIncrement",
          NAVER_SEARCH_ADS_DAILY_STATS_TIME_INCREMENT.toString(),
        ],
      ],
    );

  return {
    keywordId,
    dateFrom,
    dateTo,
    records:
      parseKeywordDailyStatsResponse(
        response,
        keywordId,
        dateFrom,
        dateTo,
      ),
  };
}

export async function probeNaverSearchAdsKeywordDailyStatsBatchShape(
  input: ProbeNaverSearchAdsKeywordDailyStatsBatchShapeInput,
): Promise<NaverSearchAdsKeywordDailyStatsBatchShapeResult> {
  const keywordIds =
    normalizeKeywordIdBatch(
      input.keywordIds,
    );

  const dateFrom = normalizeIsoDate(
    input.dateFrom,
    "dateFrom",
  );

  const dateTo = normalizeIsoDate(
    input.dateTo,
    "dateTo",
  );

  assertDateRange(dateFrom, dateTo);

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_STATS_URI,
      [
        ...keywordIds.map(
          (keywordId) =>
            [
              "ids",
              keywordId,
            ] as const,
        ),
        [
          "fields",
          JSON.stringify(
            NAVER_SEARCH_ADS_KEYWORD_STATS_FIELDS,
          ),
        ],
        [
          "timeRange",
          JSON.stringify({
            since: dateFrom,
            until: dateTo,
          }),
        ],
      ],
    );

  return {
    keywordCount:
      keywordIds.length,
    dateFrom,
    dateTo,
    responseShape:
      describeSafeResponseShape(
        response,
      ),
    topLevelChildShapes:
      buildSafeTopLevelChildShapes(
        response,
      ),
  };
}

export async function probeNaverSearchAdsKeywordStatsIdsShape(
  input: ProbeNaverSearchAdsKeywordStatsIdsShapeInput,
): Promise<NaverSearchAdsKeywordStatsIdsShapeResult> {
  const keywordId =
    normalizeRequiredString(
      input.keywordId,
      "keywordId",
      200,
    );

  if (
    typeof input.includeTimeIncrement !==
    "boolean"
  ) {
    throw new NaverSearchAdsApiError(
      "INVALID_INPUT",
      "includeTimeIncrement must be a boolean.",
    );
  }

  const dateFrom = normalizeIsoDate(
    input.dateFrom,
    "dateFrom",
  );

  const dateTo = normalizeIsoDate(
    input.dateTo,
    "dateTo",
  );

  assertDateRange(dateFrom, dateTo);

  const searchParams: Array<
    readonly [string, string]
  > = [
    ["ids", keywordId],
    [
      "fields",
      JSON.stringify(
        NAVER_SEARCH_ADS_KEYWORD_STATS_FIELDS,
      ),
    ],
    [
      "timeRange",
      JSON.stringify({
        since: dateFrom,
        until: dateTo,
      }),
    ],
  ];

  if (input.includeTimeIncrement) {
    searchParams.push([
      "timeIncrement",
      NAVER_SEARCH_ADS_DAILY_STATS_TIME_INCREMENT.toString(),
    ]);
  }

  const response =
    await requestNaverSearchAdsJson(
      input.credentials,
      NAVER_SEARCH_ADS_STATS_URI,
      searchParams,
    );

  return {
    keywordId,
    dateFrom,
    dateTo,
    includeTimeIncrement:
      input.includeTimeIncrement,
    responseShape:
      describeSafeResponseShape(
        response,
      ),
    topLevelChildShapes:
      buildSafeTopLevelChildShapes(
        response,
      ),
  };
}
