import { createHmac } from "node:crypto";

import type { NaverSearchAdsCredentials } from "./connection-credentials";

const NAVER_SEARCH_ADS_API_BASE_URL =
  "https://api.searchad.naver.com";

const NAVER_SEARCH_ADS_STAT_REPORTS_URI =
  "/stat-reports";

const NAVER_SEARCH_ADS_REPORT_DOWNLOAD_URI =
  "/report-download";

const NAVER_SEARCH_ADS_REQUEST_TIMEOUT_MS =
  10_000;

const NAVER_SEARCH_ADS_DOWNLOAD_PROBE_TIMEOUT_MS =
  20_000;

const NAVER_SEARCH_ADS_DOWNLOAD_PROBE_MAX_BYTES =
  65_536;

const NAVER_SEARCH_ADS_STAT_REPORT_TYPES = [
  "AD",
  "AD_DETAIL",
  "EXPKEYWORD",
  "SHOPPINGKEYWORD_DETAIL",
] as const;

const DEFAULT_NAVER_SEARCH_ADS_STAT_REPORT_TYPE =
  "AD" as const;

const NAVER_SEARCH_ADS_ALLOWED_METHODS = [
  "GET",
  "POST",
] as const;

type NaverSearchAdsHttpMethod =
  (typeof NAVER_SEARCH_ADS_ALLOWED_METHODS)[number];

type UnknownRecord = Record<string, unknown>;

export type NaverSearchAdsStatReportApiErrorCode =
  | "INVALID_INPUT"
  | "REQUEST_TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class NaverSearchAdsStatReportApiError extends Error {
  readonly code: NaverSearchAdsStatReportApiErrorCode;
  readonly status: number | null;

  constructor(
    code: NaverSearchAdsStatReportApiErrorCode,
    message: string,
    options?: ErrorOptions & {
      status?: number | null;
    },
  ) {
    super(message, options);

    this.name =
      "NaverSearchAdsStatReportApiError";
    this.code = code;
    this.status = options?.status ?? null;
  }
}

export type NaverSearchAdsStatReportType =
  (typeof NAVER_SEARCH_ADS_STAT_REPORT_TYPES)[number];

export type NaverSearchAdsStatReportRecord = {
  reportJobId: number;
  reportType: string | null;
  status: string | null;
  downloadUrl: string | null;
  statDate: string | null;
  updateTime: string | null;
};

export type CreateNaverSearchAdsStatReportInput = {
  credentials: NaverSearchAdsCredentials;
  statDate: string;
  reportType?: NaverSearchAdsStatReportType;
};

export type GetNaverSearchAdsStatReportInput = {
  credentials: NaverSearchAdsCredentials;
  reportJobId: number;
};

export type ProbeNaverSearchAdsStatReportDownloadInput = {
  credentials: NaverSearchAdsCredentials;
  downloadUrl: string;
};

export type NaverSearchAdsStatReportDownloadProbeResult = {
  host: string;
  pathname: string;
  hasFileVersion: boolean;
  status: number;
  contentType: string | null;
  contentDisposition: string | null;
  bytesRead: number;
  delimiter: "tab" | "comma" | "unknown";
  headerColumns: string[];
  headerColumnCount: number;
  firstRowColumns: string[];
  firstRowColumnCount: number;
};

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeCredentials(
  credentials: NaverSearchAdsCredentials,
): NaverSearchAdsCredentials {
  return {
    customerId: normalizeRequiredString(
      credentials.customerId,
      "customerId",
      300,
    ),
    accessLicense: normalizeRequiredString(
      credentials.accessLicense,
      "accessLicense",
      1000,
    ),
    secretKey: normalizeRequiredString(
      credentials.secretKey,
      "secretKey",
      2000,
    ),
  };
}

function normalizeStatDate(value: unknown): string {
  const normalizedValue =
    normalizeRequiredString(
      value,
      "statDate",
      10,
    );

  const compactValue =
    normalizedValue.replaceAll("-", "");

  if (!/^\d{8}$/.test(compactValue)) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      "statDate must use YYYY-MM-DD or YYYYMMDD format.",
    );
  }

  const year = Number(compactValue.slice(0, 4));
  const month = Number(compactValue.slice(4, 6));
  const day = Number(compactValue.slice(6, 8));
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
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      "statDate must be a valid calendar date.",
    );
  }

  return compactValue;
}

function normalizeReportType(
  value: unknown,
): NaverSearchAdsStatReportType {
  if (value === undefined) {
    return DEFAULT_NAVER_SEARCH_ADS_STAT_REPORT_TYPE;
  }

  if (
    typeof value !== "string" ||
    !NAVER_SEARCH_ADS_STAT_REPORT_TYPES.includes(
      value as NaverSearchAdsStatReportType,
    )
  ) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      `reportType must be one of ${NAVER_SEARCH_ADS_STAT_REPORT_TYPES.join(", ")}.`,
    );
  }

  return value as NaverSearchAdsStatReportType;
}

function normalizeReportJobId(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      "reportJobId must be a positive safe integer.",
    );
  }

  return value;
}

function normalizeMethod(
  value: unknown,
): NaverSearchAdsHttpMethod {
  if (
    value !== "GET" &&
    value !== "POST"
  ) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      "method must be GET or POST.",
    );
  }

  return value;
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

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
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
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is invalid.`,
    );
  }

  return value.trim();
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
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_RESPONSE",
      `Naver Search Ads response field ${fieldName} is invalid.`,
    );
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function describeStatDateValue(
  value: unknown,
): string {
  if (value === null) {
    return "kind=null";
  }

  if (Array.isArray(value)) {
    return `kind=array; length=${value.length}`;
  }

  if (isPlainObject(value)) {
    return `kind=object; keys=${Object.keys(value).sort().join(",")}`;
  }

  if (typeof value === "string") {
    const safeValue = value
      .replace(/[\r\n\t]/g, " ")
      .slice(0, 80);

    return `kind=string; value=${JSON.stringify(safeValue)}; length=${value.length}`;
  }

  if (typeof value === "number") {
    return `kind=number; value=${Number.isFinite(value) ? value : "non-finite"}`;
  }

  return `kind=${typeof value}`;
}

function formatUtcDateAsSeoulStatDate(
  date: Date,
): string {
  const seoulTimestamp =
    date.getTime() +
    9 * 60 * 60 * 1000;

  const seoulDate =
    new Date(seoulTimestamp);

  const year =
    seoulDate.getUTCFullYear();
  const month = String(
    seoulDate.getUTCMonth() + 1,
  ).padStart(2, "0");
  const day = String(
    seoulDate.getUTCDate(),
  ).padStart(2, "0");

  return `${year}${month}${day}`;
}

function readNullableResponseStatDate(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  ) {
    const normalizedValue =
      value.toString();

    if (/^\d{8}$/.test(normalizedValue)) {
      return normalizedValue;
    }
  }

  if (typeof value === "string") {
    const trimmedValue =
      value.trim();

    const compactDate =
      trimmedValue.replaceAll("-", "");

    if (/^\d{8}$/.test(compactDate)) {
      return compactDate;
    }

    const parsedTimestamp =
      Date.parse(trimmedValue);

    if (Number.isFinite(parsedTimestamp)) {
      return formatUtcDateAsSeoulStatDate(
        new Date(parsedTimestamp),
      );
    }
  }

  throw new NaverSearchAdsStatReportApiError(
    "INVALID_RESPONSE",
    `Naver Search Ads response field statDt is invalid. ${describeStatDateValue(value)}`,
  );
}

function requireResponseJobId(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads response field reportJobId is invalid.",
    );
  }

  return value;
}

function createNaverSearchAdsSignature(input: {
  timestamp: string;
  method: NaverSearchAdsHttpMethod;
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

function parseStatReportResponse(
  value: unknown,
): NaverSearchAdsStatReportRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stat report response must be an object.",
    );
  }

  const statDate =
    readNullableResponseStatDate(
      value.statDt,
    );

  return {
    reportJobId: requireResponseJobId(
      value.reportJobId,
    ),
    reportType:
      readNullableResponseString(
        value.reportTp,
        "reportTp",
      ),
    status:
      readNullableResponseString(
        value.status,
        "status",
      ),
    downloadUrl:
      readNullableResponseString(
        value.downloadUrl,
        "downloadUrl",
      ),
    statDate,
    updateTime:
      readNullableResponseString(
        value.updateTm,
        "updateTm",
      ),
  };
}

async function requestNaverSearchAdsJson(input: {
  credentials: NaverSearchAdsCredentials;
  method: NaverSearchAdsHttpMethod;
  uri: string;
  body?: UnknownRecord;
}): Promise<unknown> {
  const normalizedCredentials =
    normalizeCredentials(input.credentials);

  const method = normalizeMethod(input.method);

  const uri = normalizeRequiredString(
    input.uri,
    "uri",
    500,
  );

  if (!uri.startsWith("/")) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      "uri must start with a slash.",
    );
  }

  const timestamp = Date.now().toString();

  const signature =
    createNaverSearchAdsSignature({
      timestamp,
      method,
      uri,
      secretKey:
        normalizedCredentials.secretKey,
    });

  const requestUrl = new URL(
    uri,
    NAVER_SEARCH_ADS_API_BASE_URL,
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
        method,
        headers: {
          Accept: "application/json",
          ...(method === "POST"
            ? {
                "Content-Type":
                  "application/json; charset=utf-8",
              }
            : {}),
          "X-Timestamp": timestamp,
          "X-API-KEY":
            normalizedCredentials.accessLicense,
          "X-Customer":
            normalizedCredentials.customerId,
          "X-Signature": signature,
        },
        body:
          method === "POST"
            ? JSON.stringify(input.body ?? {})
            : undefined,
        cache: "no-store",
        signal: abortController.signal,
      },
    );

    if (!response.ok) {
      if (response.body) {
        await response.body.cancel();
      }

      throw new NaverSearchAdsStatReportApiError(
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
      throw new NaverSearchAdsStatReportApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads API returned invalid JSON.",
        { cause: error },
      );
    }
  } catch (error) {
    if (
      error instanceof
      NaverSearchAdsStatReportApiError
    ) {
      throw error;
    }

    if (
      abortController.signal.aborted ||
      isAbortError(error)
    ) {
      throw new NaverSearchAdsStatReportApiError(
        "REQUEST_TIMEOUT",
        "Naver Search Ads API request timed out.",
      );
    }

    throw new NaverSearchAdsStatReportApiError(
      "NETWORK_ERROR",
      "Naver Search Ads API request failed.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateDownloadUrl(
  value: unknown,
): URL {
  const normalizedValue =
    normalizeRequiredString(
      value,
      "downloadUrl",
      5000,
    );

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch (error) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      "downloadUrl must be a valid URL.",
      { cause: error },
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !==
      "api.searchad.naver.com" ||
    parsedUrl.pathname !==
      NAVER_SEARCH_ADS_REPORT_DOWNLOAD_URI
  ) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_INPUT",
      "downloadUrl must be an official Naver Search Ads report-download URL.",
    );
  }

  return parsedUrl;
}

function detectHeaderDelimiter(
  headerLine: string,
): "tab" | "comma" | "unknown" {
  if (headerLine.includes("\t")) {
    return "tab";
  }

  if (headerLine.includes(",")) {
    return "comma";
  }

  return "unknown";
}

async function readSafeErrorBody(
  response: Response,
): Promise<string> {
  const maxBytes = 4096;
  const bodyText = await response.text();

  return bodyText
    .slice(0, maxBytes)
    .replace(
      /(authtoken=)[^&"\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /("(?:authtoken|apiKey|secretKey|accessLicense)"\s*:\s*")[^"]+(")/gi,
      "$1[REDACTED]$2",
    )
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

function getSafeDownloadQueryKeys(
  downloadUrl: URL,
): string {
  const keys = Array.from(
    new Set(downloadUrl.searchParams.keys()),
  ).sort();

  return keys.length > 0
    ? keys.join(",")
    : "none";
}

function parseHeaderColumns(
  headerLine: string,
  delimiter: "tab" | "comma" | "unknown",
): string[] {
  if (delimiter === "unknown") {
    return headerLine
      ? [headerLine]
      : [];
  }

  const separator =
    delimiter === "tab" ? "\t" : ",";

  return headerLine
    .split(separator)
    .map((column) =>
      column
        .trim()
        .replace(/^"|"$/g, ""),
    )
    .filter(Boolean)
    .slice(0, 100);
}

export async function createNaverSearchAdsStatReport(
  input: CreateNaverSearchAdsStatReportInput,
): Promise<NaverSearchAdsStatReportRecord> {
  const statDate = normalizeStatDate(
    input.statDate,
  );

  const reportType = normalizeReportType(
    input.reportType,
  );

  const response =
    await requestNaverSearchAdsJson({
      credentials: input.credentials,
      method: "POST",
      uri:
        NAVER_SEARCH_ADS_STAT_REPORTS_URI,
      body: {
        reportTp: reportType,
        statDt: statDate,
      },
    });

  const report = parseStatReportResponse(
    response,
  );

  if (
    report.reportType !== reportType ||
    report.statDate !== statDate
  ) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stat report creation response does not match the request.",
    );
  }

  return report;
}

export async function getNaverSearchAdsStatReport(
  input: GetNaverSearchAdsStatReportInput,
): Promise<NaverSearchAdsStatReportRecord> {
  const reportJobId = normalizeReportJobId(
    input.reportJobId,
  );

  const response =
    await requestNaverSearchAdsJson({
      credentials: input.credentials,
      method: "GET",
      uri: `${NAVER_SEARCH_ADS_STAT_REPORTS_URI}/${reportJobId}`,
    });

  const report = parseStatReportResponse(
    response,
  );

  if (report.reportJobId !== reportJobId) {
    throw new NaverSearchAdsStatReportApiError(
      "INVALID_RESPONSE",
      "Naver Search Ads stat report lookup returned a different reportJobId.",
    );
  }

  return report;
}

export async function probeNaverSearchAdsStatReportDownload(
  input: ProbeNaverSearchAdsStatReportDownloadInput,
): Promise<NaverSearchAdsStatReportDownloadProbeResult> {
  const normalizedCredentials =
    normalizeCredentials(
      input.credentials,
    );

  const downloadUrl = validateDownloadUrl(
    input.downloadUrl,
  );

  const timestamp =
    Date.now().toString();

  const signature =
    createNaverSearchAdsSignature({
      timestamp,
      method: "GET",
      uri:
        NAVER_SEARCH_ADS_REPORT_DOWNLOAD_URI,
      secretKey:
        normalizedCredentials.secretKey,
    });

  const abortController =
    new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, NAVER_SEARCH_ADS_DOWNLOAD_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(
      downloadUrl,
      {
        method: "GET",
        headers: {
          Accept:
            "text/tab-separated-values,text/csv,text/plain,*/*",
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
      const safeErrorBody =
        await readSafeErrorBody(response);

      const safeQueryKeys =
        getSafeDownloadQueryKeys(
          downloadUrl,
        );

      const contentType =
        response.headers.get(
          "content-type",
        ) ?? "unknown";

      throw new NaverSearchAdsStatReportApiError(
        "HTTP_ERROR",
        [
          "Naver Search Ads report download returned an unsuccessful response.",
          `queryKeys=${safeQueryKeys}`,
          `contentType=${contentType}`,
          safeErrorBody
            ? `body=${safeErrorBody}`
            : "body=empty",
        ].join(" "),
        {
          status: response.status,
        },
      );
    }

    if (!response.body) {
      throw new NaverSearchAdsStatReportApiError(
        "INVALID_RESPONSE",
        "Naver Search Ads report download response has no body.",
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    try {
      while (
        bytesRead <
        NAVER_SEARCH_ADS_DOWNLOAD_PROBE_MAX_BYTES
      ) {
        const { value, done } =
          await reader.read();

        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        const remainingBytes =
          NAVER_SEARCH_ADS_DOWNLOAD_PROBE_MAX_BYTES -
          bytesRead;

        const acceptedChunk =
          value.byteLength <= remainingBytes
            ? value
            : value.slice(0, remainingBytes);

        chunks.push(acceptedChunk);
        bytesRead += acceptedChunk.byteLength;

        if (
          acceptedChunk.byteLength <
          value.byteLength
        ) {
          break;
        }
      }
    } finally {
      await reader.cancel();
    }

    const combinedBytes = new Uint8Array(
      bytesRead,
    );

    let offset = 0;

    for (const chunk of chunks) {
      combinedBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder("utf-8", {
      fatal: false,
    })
      .decode(combinedBytes)
      .replace(/^\uFEFF/, "");

    const headerLine =
      text
        .split(/\r?\n/, 2)[0]
        ?.trim() ?? "";

    const delimiter =
      detectHeaderDelimiter(headerLine);

    const headerColumns =
      parseHeaderColumns(
        headerLine,
        delimiter,
      );

    return {
      host: downloadUrl.hostname,
      pathname: downloadUrl.pathname,
      hasFileVersion:
        downloadUrl.searchParams.has(
          "fileversion",
        ) ||
        downloadUrl.searchParams.has(
          "fileVersion",
        ),
      status: response.status,
      contentType:
        response.headers.get(
          "content-type",
        ),
      contentDisposition:
        response.headers.get(
          "content-disposition",
        ),
      bytesRead,
      delimiter,
      headerColumns,
      headerColumnCount:
        headerColumns.length,
      firstRowColumns:
        headerColumns,
      firstRowColumnCount:
        headerColumns.length,
    };
  } catch (error) {
    if (
      error instanceof
      NaverSearchAdsStatReportApiError
    ) {
      throw error;
    }

    if (
      abortController.signal.aborted ||
      isAbortError(error)
    ) {
      throw new NaverSearchAdsStatReportApiError(
        "REQUEST_TIMEOUT",
        "Naver Search Ads report download probe timed out.",
      );
    }

    throw new NaverSearchAdsStatReportApiError(
      "NETWORK_ERROR",
      "Naver Search Ads report download probe failed.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
