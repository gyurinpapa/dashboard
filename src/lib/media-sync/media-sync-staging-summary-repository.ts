import { getSupabaseAdmin } from "../supabase/admin";
import {
  isValidMediaSyncDateRange,
  isValidYmd,
  type MediaSyncJobRecord,
} from "./types";

const SUMMARIZE_MEDIA_SYNC_STAGING_RPC =
  "summarize_media_sync_staging";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

export type MediaSyncStagingSummaryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "STAGING_INCOMPLETE"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export type MediaSyncStagingDateWindowSummary = {
  dateWindowIndex: number;
  rowCount: number;
  minRowIndex: number;
  maxRowIndex: number;
  minDate: string;
  maxDate: string;
};

export type MediaSyncStagingSummary = {
  jobId: string;
  expectedRows: number;

  totalRows: number;
  minRowIndex: number | null;
  maxRowIndex: number | null;

  distinctRowIndexes: number;
  rowsInExpectedRange: number;
  missingExpectedRows: number;
  outOfRangeRows: number;

  scopeMismatchRows: number;
  blankRowKeyRows: number;
  missingFingerprintRows: number;
  canonicalMismatchRows: number;

  dateWindowCount: number;
  dateWindowSummaries:
    MediaSyncStagingDateWindowSummary[];

  isComplete: boolean;
};

export class MediaSyncStagingSummaryError extends Error {
  readonly code:
    MediaSyncStagingSummaryErrorCode;

  readonly summary:
    MediaSyncStagingSummary | null;

  constructor(
    code: MediaSyncStagingSummaryErrorCode,
    message: string,
    options?: ErrorOptions & {
      summary?: MediaSyncStagingSummary | null;
    },
  ) {
    super(message, {
      cause: options?.cause,
    });

    this.name =
      "MediaSyncStagingSummaryError";

    this.code = code;

    this.summary =
      options?.summary ?? null;
  }
}

export type GetMediaSyncStagingSummaryInput = {
  job: MediaSyncJobRecord;
  expectedRows: number;
};

type UnknownRecord =
  Record<string, unknown>;

type SummaryRpcRecord = {
  job_id: unknown;
  expected_rows: unknown;
  total_rows: unknown;
  min_row_index: unknown;
  max_row_index: unknown;
  distinct_row_indexes: unknown;
  rows_in_expected_range: unknown;
  missing_expected_rows: unknown;
  out_of_range_rows: unknown;
  scope_mismatch_rows: unknown;
  blank_row_key_rows: unknown;
  missing_fingerprint_rows: unknown;
  canonical_mismatch_rows: unknown;
  date_window_count: unknown;
  date_window_summaries: unknown;
  is_complete: unknown;
};

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
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

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 2_000,
): string {
  if (typeof value !== "string") {
    throw new MediaSyncStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function requireResultInteger(
  value: unknown,
  fieldName: string,
): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < 0
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      `Database result ${fieldName} is invalid.`,
    );
  }

  return numberValue;
}

function requireNullableResultInteger(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === null) {
    return null;
  }

  return requireResultInteger(
    value,
    fieldName,
  );
}

function requireBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      `Database result ${fieldName} is invalid.`,
    );
  }

  return value;
}

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_JOB",
      "A media sync job record is required.",
    );
  }

  normalizeRequiredString(
    value.id,
    "job.id",
    200,
  );

  normalizeRequiredString(
    value.report_id,
    "job.report_id",
    200,
  );

  normalizeRequiredString(
    value.workspace_id,
    "job.workspace_id",
    200,
  );

  normalizeRequiredString(
    value.advertiser_id,
    "job.advertiser_id",
    200,
  );

  normalizeRequiredString(
    value.connection_id,
    "job.connection_id",
    200,
  );

  normalizeRequiredString(
    value.external_account_id,
    "job.external_account_id",
    500,
  );

  if (
    value.provider !==
    NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new MediaSyncStagingSummaryError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads staging summaries are supported at this stage.",
    );
  }

  if (
    value.status !==
    PROCESSING_STATUS
  ) {
    throw new MediaSyncStagingSummaryError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing before staging completeness can be checked.",
    );
  }

  if (
    !isValidMediaSyncDateRange(
      value.date_from,
      value.date_to,
    )
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_JOB",
      "The media sync job contains an invalid date range.",
    );
  }

  const startedAt =
    value.started_at;

  const attemptCount =
    value.attempt_count;

  if (
    typeof startedAt !== "string" ||
    !startedAt.trim() ||
    typeof attemptCount !== "number" ||
    !Number.isInteger(attemptCount) ||
    attemptCount < 1
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_JOB",
      "The processing media sync job has an invalid claim state.",
    );
  }
}

function parseDateWindowSummary(
  value: unknown,
  index: number,
): MediaSyncStagingDateWindowSummary {
  if (!isPlainObject(value)) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      `date_window_summaries[${index}] is invalid.`,
    );
  }

  const dateWindowIndex =
    requireResultInteger(
      value.date_window_index,
      `date_window_summaries[${index}].date_window_index`,
    );

  const rowCount =
    requireResultInteger(
      value.row_count,
      `date_window_summaries[${index}].row_count`,
    );

  const minRowIndex =
    requireResultInteger(
      value.min_row_index,
      `date_window_summaries[${index}].min_row_index`,
    );

  const maxRowIndex =
    requireResultInteger(
      value.max_row_index,
      `date_window_summaries[${index}].max_row_index`,
    );

  const minDate =
    normalizeRequiredString(
      value.min_date,
      `date_window_summaries[${index}].min_date`,
      10,
    );

  const maxDate =
    normalizeRequiredString(
      value.max_date,
      `date_window_summaries[${index}].max_date`,
      10,
    );

  if (
    rowCount < 1 ||
    minRowIndex > maxRowIndex ||
    !isValidYmd(minDate) ||
    !isValidYmd(maxDate) ||
    minDate > maxDate
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      `date_window_summaries[${index}] contains inconsistent values.`,
    );
  }

  return {
    dateWindowIndex,
    rowCount,
    minRowIndex,
    maxRowIndex,
    minDate,
    maxDate,
  };
}

function parseDateWindowSummaries(
  value: unknown,
): MediaSyncStagingDateWindowSummary[] {
  if (!Array.isArray(value)) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "Database result date_window_summaries is invalid.",
    );
  }

  const summaries =
    value.map(
      parseDateWindowSummary,
    );

  for (
    let index = 1;
    index < summaries.length;
    index += 1
  ) {
    const previous =
      summaries[index - 1];

    const current =
      summaries[index];

    if (
      !previous ||
      !current ||
      previous.dateWindowIndex >=
        current.dateWindowIndex
    ) {
      throw new MediaSyncStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "Date window summaries are not strictly ordered.",
      );
    }
  }

  return summaries;
}

function mapRpcError(
  error: unknown,
): MediaSyncStagingSummaryError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (
    message.includes(
      "MSS_SUMMARY_JOB_NOT_PROCESSING",
    )
  ) {
    return new MediaSyncStagingSummaryError(
      "JOB_NOT_PROCESSING",
      "The media sync job is not processing.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_UNSUPPORTED_PROVIDER",
    )
  ) {
    return new MediaSyncStagingSummaryError(
      "UNSUPPORTED_PROVIDER",
      "The media sync provider is not supported.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_SCOPE_MISMATCH",
    )
  ) {
    return new MediaSyncStagingSummaryError(
      "SCOPE_MISMATCH",
      "The staging summary scope does not match the media sync job.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_INVALID_JOB",
    )
  ) {
    return new MediaSyncStagingSummaryError(
      "INVALID_JOB",
      "The media sync job was not found or is invalid.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_INVALID_INPUT",
    )
  ) {
    return new MediaSyncStagingSummaryError(
      "INVALID_INPUT",
      "The staging summary input is invalid.",
      { cause: error },
    );
  }

  return new MediaSyncStagingSummaryError(
    "DATABASE_ERROR",
    "The media sync staging summary could not be loaded.",
    { cause: error },
  );
}

function parseRpcResult(
  value: unknown,
  expectedJobId: string,
  expectedRowsInput: number,
): MediaSyncStagingSummary {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as SummaryRpcRecord;

  const jobId =
    normalizeRequiredString(
      record.job_id,
      "job_id",
      200,
    );

  const expectedRows =
    requireResultInteger(
      record.expected_rows,
      "expected_rows",
    );

  const totalRows =
    requireResultInteger(
      record.total_rows,
      "total_rows",
    );

  const minRowIndex =
    requireNullableResultInteger(
      record.min_row_index,
      "min_row_index",
    );

  const maxRowIndex =
    requireNullableResultInteger(
      record.max_row_index,
      "max_row_index",
    );

  const distinctRowIndexes =
    requireResultInteger(
      record.distinct_row_indexes,
      "distinct_row_indexes",
    );

  const rowsInExpectedRange =
    requireResultInteger(
      record.rows_in_expected_range,
      "rows_in_expected_range",
    );

  const missingExpectedRows =
    requireResultInteger(
      record.missing_expected_rows,
      "missing_expected_rows",
    );

  const outOfRangeRows =
    requireResultInteger(
      record.out_of_range_rows,
      "out_of_range_rows",
    );

  const scopeMismatchRows =
    requireResultInteger(
      record.scope_mismatch_rows,
      "scope_mismatch_rows",
    );

  const blankRowKeyRows =
    requireResultInteger(
      record.blank_row_key_rows,
      "blank_row_key_rows",
    );

  const missingFingerprintRows =
    requireResultInteger(
      record.missing_fingerprint_rows,
      "missing_fingerprint_rows",
    );

  const canonicalMismatchRows =
    requireResultInteger(
      record.canonical_mismatch_rows,
      "canonical_mismatch_rows",
    );

  const dateWindowCount =
    requireResultInteger(
      record.date_window_count,
      "date_window_count",
    );

  const dateWindowSummaries =
    parseDateWindowSummaries(
      record.date_window_summaries,
    );

  const isComplete =
    requireBoolean(
      record.is_complete,
      "is_complete",
    );

  if (
    jobId !== expectedJobId ||
    expectedRows !==
      expectedRowsInput
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary RPC returned an unexpected job or expected row count.",
    );
  }

  if (
    rowsInExpectedRange +
      outOfRangeRows !==
    totalRows
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary row ranges are inconsistent.",
    );
  }

  if (
    missingExpectedRows !==
    Math.max(
      expectedRows -
        rowsInExpectedRange,
      0,
    )
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary missing row count is inconsistent.",
    );
  }

  if (
    distinctRowIndexes >
      totalRows ||
    dateWindowCount !==
      dateWindowSummaries.length
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary aggregate counts are inconsistent.",
    );
  }

  const windowRowTotal =
    dateWindowSummaries.reduce(
      (sum, summary) =>
        sum + summary.rowCount,
      0,
    );

  if (windowRowTotal !== totalRows) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging date window row counts do not match the total.",
    );
  }

  if (totalRows === 0) {
    if (
      minRowIndex !== null ||
      maxRowIndex !== null ||
      dateWindowCount !== 0
    ) {
      throw new MediaSyncStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The empty staging summary contains row indexes or date windows.",
      );
    }
  } else if (
    minRowIndex === null ||
    maxRowIndex === null ||
    minRowIndex > maxRowIndex ||
    dateWindowCount < 1
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The non-empty staging summary contains invalid index bounds.",
    );
  }

  const calculatedComplete =
    totalRows === expectedRows &&
    distinctRowIndexes ===
      expectedRows &&
    rowsInExpectedRange ===
      expectedRows &&
    missingExpectedRows === 0 &&
    outOfRangeRows === 0 &&
    scopeMismatchRows === 0 &&
    blankRowKeyRows === 0 &&
    missingFingerprintRows === 0 &&
    canonicalMismatchRows === 0 &&
    (
      (
        expectedRows === 0 &&
        minRowIndex === null &&
        maxRowIndex === null &&
        dateWindowCount === 0
      )
      ||
      (
        expectedRows > 0 &&
        minRowIndex === 0 &&
        maxRowIndex ===
          expectedRows - 1 &&
        dateWindowCount > 0
      )
    );

  if (
    isComplete !==
    calculatedComplete
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary complete result is inconsistent.",
    );
  }

  return {
    jobId,
    expectedRows,

    totalRows,
    minRowIndex,
    maxRowIndex,

    distinctRowIndexes,
    rowsInExpectedRange,
    missingExpectedRows,
    outOfRangeRows,

    scopeMismatchRows,
    blankRowKeyRows,
    missingFingerprintRows,
    canonicalMismatchRows,

    dateWindowCount,
    dateWindowSummaries,

    isComplete,
  };
}

export async function getMediaSyncStagingSummary(
  input: GetMediaSyncStagingSummaryInput,
): Promise<MediaSyncStagingSummary> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_INPUT",
      "Staging summary input is required.",
    );
  }

  validateJob(input.job);

  const expectedRows =
    normalizeNonNegativeInteger(
      input.expectedRows,
      "expectedRows",
    );

  const payload = {
    job_id:
      input.job.id,

    report_id:
      input.job.report_id,

    workspace_id:
      input.job.workspace_id,

    advertiser_id:
      input.job.advertiser_id,

    connection_id:
      input.job.connection_id,

    provider:
      input.job.provider,

    external_account_id:
      input.job.external_account_id,

    date_from:
      input.job.date_from,

    date_to:
      input.job.date_to,

    expected_rows:
      expectedRows,
  };

  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result =
      await supabase.rpc(
        SUMMARIZE_MEDIA_SYNC_STAGING_RPC,
        {
          p_payload: payload,
        },
      );
  } catch (error) {
    throw new MediaSyncStagingSummaryError(
      "DATABASE_ERROR",
      "The media sync staging summary repository could not access the database.",
      { cause: error },
    );
  }

  const { data, error } =
    result;

  if (error) {
    throw mapRpcError(error);
  }

  return parseRpcResult(
    data,
    input.job.id,
    expectedRows,
  );
}

export async function assertMediaSyncStagingComplete(
  input: GetMediaSyncStagingSummaryInput,
): Promise<MediaSyncStagingSummary> {
  const summary =
    await getMediaSyncStagingSummary(
      input,
    );

  if (!summary.isComplete) {
    throw new MediaSyncStagingSummaryError(
      "STAGING_INCOMPLETE",
      "The media sync staging rows are not complete.",
      {
        summary,
      },
    );
  }

  return summary;
}