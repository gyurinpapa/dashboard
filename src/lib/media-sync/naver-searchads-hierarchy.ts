import type {
  NaverSearchAdsCredentials,
} from "./connection-credentials";
import {
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsKeywordPage,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsKeywordRecord,
  type NaverSearchAdsListPage,
} from "./naver-searchads-api";

const DEFAULT_PAGE_RECORD_SIZE = 100;
const MAX_PAGE_RECORD_SIZE = 1000;
const DEFAULT_MAX_PAGES = 10_000;
const MAX_ALLOWED_PAGES = 100_000;

export type NaverSearchAdsHierarchyErrorCode =
  | "INVALID_INPUT"
  | "INVALID_PAGE"
  | "DUPLICATE_RECORD"
  | "CURSOR_NOT_ADVANCED"
  | "CURSOR_REPEATED"
  | "MAX_PAGES_EXCEEDED";

export class NaverSearchAdsHierarchyError extends Error {
  readonly code:
    NaverSearchAdsHierarchyErrorCode;

  constructor(
    code: NaverSearchAdsHierarchyErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "NaverSearchAdsHierarchyError";
    this.code = code;
  }
}

export type NaverSearchAdsPaginationOptions = {
  recordSize?: number;
  maxPages?: number;
};

export type NaverSearchAdsPageContext = {
  pageNumber: number;
  recordSize: number;
  baseSearchId: string | null;
  nextBaseSearchId: string | null;
  totalRecordsSeen: number;
  isLastPage: boolean;
};

export type NaverSearchAdsPaginationSummary = {
  pageCount: number;
  recordCount: number;
  lastBaseSearchId: string | null;
};

export type NaverSearchAdsPageHandler<T> = (
  records: readonly T[],
  context: NaverSearchAdsPageContext,
) => void | Promise<void>;

export type IterateNaverSearchAdsCampaignsInput = {
  credentials: NaverSearchAdsCredentials;
  onPage:
    NaverSearchAdsPageHandler<NaverSearchAdsCampaignRecord>;
  options?: NaverSearchAdsPaginationOptions;
};

export type IterateNaverSearchAdsAdgroupsInput = {
  credentials: NaverSearchAdsCredentials;
  campaignId: string;
  onPage:
    NaverSearchAdsPageHandler<NaverSearchAdsAdgroupRecord>;
  options?: NaverSearchAdsPaginationOptions;
};

export type IterateNaverSearchAdsKeywordsInput = {
  credentials: NaverSearchAdsCredentials;
  adgroupId: string;
  onPage:
    NaverSearchAdsPageHandler<NaverSearchAdsKeywordRecord>;
  options?: NaverSearchAdsPaginationOptions;
};

type RecordWithId = {
  id: string;
};

type IteratePagesInput<T extends RecordWithId> = {
  recordSize: number;
  maxPages: number;
  fetchPage: (
    baseSearchId: string | null,
  ) => Promise<NaverSearchAdsListPage<T>>;
  onPage: NaverSearchAdsPageHandler<T>;
};

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeRecordSize(
  value: unknown,
): number {
  if (value === undefined) {
    return DEFAULT_PAGE_RECORD_SIZE;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_PAGE_RECORD_SIZE
  ) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_INPUT",
      `recordSize must be an integer between 1 and ${MAX_PAGE_RECORD_SIZE}.`,
    );
  }

  return value;
}

function normalizeMaxPages(
  value: unknown,
): number {
  if (value === undefined) {
    return DEFAULT_MAX_PAGES;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_ALLOWED_PAGES
  ) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_INPUT",
      `maxPages must be an integer between 1 and ${MAX_ALLOWED_PAGES}.`,
    );
  }

  return value;
}

function requirePageHandler<T>(
  value: unknown,
): asserts value is NaverSearchAdsPageHandler<T> {
  if (typeof value !== "function") {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_INPUT",
      "onPage must be a function.",
    );
  }
}

function validatePage<T extends RecordWithId>(
  page: NaverSearchAdsListPage<T>,
  expectedRecordSize: number,
  expectedBaseSearchId: string | null,
): void {
  if (!Array.isArray(page.records)) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_PAGE",
      "Naver Search Ads page records are invalid.",
    );
  }

  if (
    page.recordSize !==
    expectedRecordSize
  ) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_PAGE",
      "Naver Search Ads page recordSize does not match the request.",
    );
  }

  if (page.selector !== "NEXT") {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_PAGE",
      "Naver Search Ads page selector must be NEXT.",
    );
  }

  if (
    page.baseSearchId !==
    expectedBaseSearchId
  ) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_PAGE",
      "Naver Search Ads page baseSearchId does not match the request.",
    );
  }

  if (
    page.records.length >
    expectedRecordSize
  ) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_PAGE",
      "Naver Search Ads page contains more records than requested.",
    );
  }

  for (const record of page.records) {
    if (
      !record ||
      typeof record !== "object" ||
      typeof record.id !== "string" ||
      !record.id.trim()
    ) {
      throw new NaverSearchAdsHierarchyError(
        "INVALID_PAGE",
        "Naver Search Ads page contains a record with an invalid ID.",
      );
    }
  }

  const expectedNextBaseSearchId =
    page.records.length > 0
      ? page.records[
          page.records.length - 1
        ]?.id ?? null
      : null;

  if (
    page.nextBaseSearchId !==
    expectedNextBaseSearchId
  ) {
    throw new NaverSearchAdsHierarchyError(
      "INVALID_PAGE",
      "Naver Search Ads page nextBaseSearchId does not match its final record.",
    );
  }
}

function assertNoDuplicateRecords<T extends RecordWithId>(
  records: readonly T[],
  seenRecordIds: Set<string>,
): void {
  const currentPageIds =
    new Set<string>();

  for (const record of records) {
    if (currentPageIds.has(record.id)) {
      throw new NaverSearchAdsHierarchyError(
        "DUPLICATE_RECORD",
        "Naver Search Ads page contains a duplicate record ID.",
      );
    }

    if (seenRecordIds.has(record.id)) {
      throw new NaverSearchAdsHierarchyError(
        "DUPLICATE_RECORD",
        "Naver Search Ads pagination returned a record ID that was already processed.",
      );
    }

    currentPageIds.add(record.id);
  }

  for (const recordId of currentPageIds) {
    seenRecordIds.add(recordId);
  }
}

async function iteratePages<
  T extends RecordWithId,
>(
  input: IteratePagesInput<T>,
): Promise<NaverSearchAdsPaginationSummary> {
  const seenRecordIds =
    new Set<string>();

  const seenCursors =
    new Set<string>();

  let pageNumber = 0;
  let recordCount = 0;
  let baseSearchId: string | null =
    null;

  while (pageNumber < input.maxPages) {
    const page = await input.fetchPage(
      baseSearchId,
    );

    validatePage(
      page,
      input.recordSize,
      baseSearchId,
    );

    assertNoDuplicateRecords(
      page.records,
      seenRecordIds,
    );

    pageNumber += 1;
    recordCount += page.records.length;

    const isLastPage =
      page.records.length <
        input.recordSize ||
      page.records.length === 0;

    await input.onPage(
      page.records,
      {
        pageNumber,
        recordSize:
          input.recordSize,
        baseSearchId,
        nextBaseSearchId:
          page.nextBaseSearchId,
        totalRecordsSeen:
          recordCount,
        isLastPage,
      },
    );

    if (isLastPage) {
      return {
        pageCount: pageNumber,
        recordCount,
        lastBaseSearchId:
          page.nextBaseSearchId,
      };
    }

    const nextBaseSearchId =
      page.nextBaseSearchId;

    if (!nextBaseSearchId) {
      throw new NaverSearchAdsHierarchyError(
        "CURSOR_NOT_ADVANCED",
        "Naver Search Ads pagination did not return a cursor for a full page.",
      );
    }

    if (
      nextBaseSearchId ===
      baseSearchId
    ) {
      throw new NaverSearchAdsHierarchyError(
        "CURSOR_NOT_ADVANCED",
        "Naver Search Ads pagination cursor did not advance.",
      );
    }

    if (
      seenCursors.has(
        nextBaseSearchId,
      )
    ) {
      throw new NaverSearchAdsHierarchyError(
        "CURSOR_REPEATED",
        "Naver Search Ads pagination returned a repeated cursor.",
      );
    }

    seenCursors.add(
      nextBaseSearchId,
    );

    baseSearchId =
      nextBaseSearchId;
  }

  throw new NaverSearchAdsHierarchyError(
    "MAX_PAGES_EXCEEDED",
    "Naver Search Ads pagination exceeded the configured maximum page count.",
  );
}

export async function iterateNaverSearchAdsCampaigns(
  input: IterateNaverSearchAdsCampaignsInput,
): Promise<NaverSearchAdsPaginationSummary> {
  requirePageHandler<
    NaverSearchAdsCampaignRecord
  >(input.onPage);

  const recordSize =
    normalizeRecordSize(
      input.options?.recordSize,
    );

  const maxPages =
    normalizeMaxPages(
      input.options?.maxPages,
    );

  return iteratePages({
    recordSize,
    maxPages,
    fetchPage: (baseSearchId) =>
      fetchNaverSearchAdsCampaignPage({
        credentials:
          input.credentials,
        baseSearchId,
        recordSize,
        selector: "NEXT",
      }),
    onPage: input.onPage,
  });
}

export async function iterateNaverSearchAdsAdgroups(
  input: IterateNaverSearchAdsAdgroupsInput,
): Promise<NaverSearchAdsPaginationSummary> {
  const campaignId =
    normalizeRequiredString(
      input.campaignId,
      "campaignId",
    );

  requirePageHandler<
    NaverSearchAdsAdgroupRecord
  >(input.onPage);

  const recordSize =
    normalizeRecordSize(
      input.options?.recordSize,
    );

  const maxPages =
    normalizeMaxPages(
      input.options?.maxPages,
    );

  return iteratePages({
    recordSize,
    maxPages,
    fetchPage: (baseSearchId) =>
      fetchNaverSearchAdsAdgroupPage({
        credentials:
          input.credentials,
        campaignId,
        baseSearchId,
        recordSize,
        selector: "NEXT",
      }),
    onPage: input.onPage,
  });
}

export async function iterateNaverSearchAdsKeywords(
  input: IterateNaverSearchAdsKeywordsInput,
): Promise<NaverSearchAdsPaginationSummary> {
  const adgroupId =
    normalizeRequiredString(
      input.adgroupId,
      "adgroupId",
    );

  requirePageHandler<
    NaverSearchAdsKeywordRecord
  >(input.onPage);

  const recordSize =
    normalizeRecordSize(
      input.options?.recordSize,
    );

  const maxPages =
    normalizeMaxPages(
      input.options?.maxPages,
    );

  return iteratePages({
    recordSize,
    maxPages,
    fetchPage: (baseSearchId) =>
      fetchNaverSearchAdsKeywordPage({
        credentials:
          input.credentials,
        adgroupId,
        baseSearchId,
        recordSize,
        selector: "NEXT",
      }),
    onPage: input.onPage,
  });
}