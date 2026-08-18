import {
  isMediaSyncDataLevel,
  isMediaSyncMode,
  isValidMediaSyncDateRange,
  type MediaSyncDataLevel,
  type MediaSyncMode,
  type SafeMediaSyncJob,
} from "./types";

const MAX_REPORT_ID_LENGTH = 200;
const MEDIA_SYNC_JOB_MODE =
  "snapshot_replace" as const;

const FORBIDDEN_RESPONSE_KEYS = new Set([
  "credentialciphertext",
  "credentials",
  "credential",
  "accesslicense",
  "secretkey",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "privatekey",
  "password",
  "authorization",
  "signature",
]);

type UnknownRecord = Record<string, unknown>;

export type MediaSyncJobRequestErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_MODE"
  | "UNSAFE_RESPONSE";

export class MediaSyncJobRequestError extends Error {
  readonly code: MediaSyncJobRequestErrorCode;

  constructor(
    code: MediaSyncJobRequestErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaSyncJobRequestError";
    this.code = code;
  }
}

export type CreateMediaSyncJobRequest = {
  reportId: string;
  dateFrom: string;
  dateTo: string;
  dataLevel: MediaSyncDataLevel;
  mode: MediaSyncMode;
};

export type CreateMediaSyncJobResponse = {
  ok: true;
  report_id: string;
  workspace_id: string;
  advertiser_id: string;
  access_scope: string;
  job: SafeMediaSyncJob;
};

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

function requirePlainObject(
  value: unknown,
  fieldName: string,
): UnknownRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncJobRequestError(
      "INVALID_INPUT",
      `${fieldName} must be a plain object.`,
    );
  }

  return value;
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new MediaSyncJobRequestError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaSyncJobRequestError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaSyncJobRequestError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeDataLevel(
  value: unknown,
): MediaSyncDataLevel {
  if (!isMediaSyncDataLevel(value)) {
    throw new MediaSyncJobRequestError(
      "INVALID_INPUT",
      "dataLevel is invalid.",
    );
  }

  return value;
}

function normalizeMode(
  value: unknown,
): MediaSyncMode {
  if (!isMediaSyncMode(value)) {
    throw new MediaSyncJobRequestError(
      "UNSUPPORTED_MODE",
      "Only snapshot_replace mode is supported.",
    );
  }

  if (value !== MEDIA_SYNC_JOB_MODE) {
    throw new MediaSyncJobRequestError(
      "UNSUPPORTED_MODE",
      "Only snapshot_replace mode is supported.",
    );
  }

  return value;
}

function normalizeInspectionKey(
  key: string,
): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s._-]/g, "");
}

function assertSafeResponseValue(
  value: unknown,
  path: string,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSafeResponseValue(
        item,
        `${path}[${index}]`,
      );
    });

    return;
  }

  if (!isPlainObject(value)) {
    throw new MediaSyncJobRequestError(
      "UNSAFE_RESPONSE",
      `${path} contains a non-serializable value.`,
    );
  }

  for (const [
    key,
    nestedValue,
  ] of Object.entries(value)) {
    const normalizedKey =
      normalizeInspectionKey(key);

    if (
      FORBIDDEN_RESPONSE_KEYS.has(
        normalizedKey,
      )
    ) {
      throw new MediaSyncJobRequestError(
        "UNSAFE_RESPONSE",
        `${path}.${key} is not allowed in a public response.`,
      );
    }

    assertSafeResponseValue(
      nestedValue,
      `${path}.${key}`,
    );
  }
}

function assertSerializableSafeResponse(
  value: unknown,
): void {
  assertSafeResponseValue(
    value,
    "response",
  );

  try {
    JSON.stringify(value);
  } catch (error) {
    throw new MediaSyncJobRequestError(
      "UNSAFE_RESPONSE",
      "Media sync job response could not be serialized.",
      { cause: error },
    );
  }
}

export function normalizeMediaSyncJobReportId(
  value: unknown,
): string {
  return normalizeRequiredString(
    value,
    "reportId",
    MAX_REPORT_ID_LENGTH,
  );
}

export function parseCreateMediaSyncJobRequest(
  input: {
    reportId: unknown;
    body: unknown;
  },
): CreateMediaSyncJobRequest {
  const body = requirePlainObject(
    input.body,
    "body",
  );

  const reportId =
    normalizeMediaSyncJobReportId(
      input.reportId,
    );

  const dateFrom =
    normalizeRequiredString(
      body.dateFrom,
      "dateFrom",
      10,
    );

  const dateTo =
    normalizeRequiredString(
      body.dateTo,
      "dateTo",
      10,
    );

  if (
    !isValidMediaSyncDateRange(
      dateFrom,
      dateTo,
    )
  ) {
    throw new MediaSyncJobRequestError(
      "INVALID_INPUT",
      "dateFrom and dateTo must form a valid YYYY-MM-DD date range.",
    );
  }

  return {
    reportId,
    dateFrom,
    dateTo,
    dataLevel: normalizeDataLevel(
      body.dataLevel,
    ),
    mode: normalizeMode(body.mode),
  };
}

export function assertSafeMediaSyncJobPayload(
  value: unknown,
): void {
  assertSerializableSafeResponse(value);
}