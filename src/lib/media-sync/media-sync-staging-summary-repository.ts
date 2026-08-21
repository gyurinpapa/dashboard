import { getSupabaseAdmin } from "../supabase/admin";
import {
  isValidMediaSyncDateRange,
  isValidYmd,
  type MediaSyncJobRecord,
} from "./types";

const SUMMARIZE_MEDIA_SYNC_STAGING_RPC =
  "summarize_media_sync_staging";

const SUMMARIZE_NAVER_SEARCH_ADS_COMBINED_STAGING_BASE_RPC =
  "summarize_naver_searchads_combined_staging_base";

const VALIDATE_NAVER_SEARCH_ADS_COMBINED_STAGING_BATCH_RPC =
  "validate_naver_searchads_combined_staging_batch_v3";

const NAVER_SEARCH_ADS_COMBINED_VALIDATION_BATCH_SIZE =
  2_000;

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const PROCESSING_STATUS =
  "processing" as const;

export type MediaSyncStagingSummaryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "STAGING_INCOMPLETE"
  | "STAGING_CHANGED"
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

export type NaverSearchAdsCombinedStagingSummaryDependencies = {
  invokeRpc: (
    functionName: string,
    args: {
      p_payload: Record<string, unknown>;
    },
  ) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};

const defaultNaverSearchAdsCombinedStagingSummaryDependencies:
  NaverSearchAdsCombinedStagingSummaryDependencies = {
    invokeRpc: async (
      functionName,
      args,
    ) => {
      const supabase =
        getSupabaseAdmin();

      return supabase.rpc(
        functionName,
        args,
      );
    },
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

type CombinedBaseSummaryRpcRecord = {
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
  date_window_count: unknown;
  date_window_summaries: unknown;
};

type CombinedValidationBatchRpcRecord = {
  job_id: unknown;
  after_row_index: unknown;
  batch_size: unknown;
  batch_rows: unknown;
  batch_max_row_index: unknown;
  scope_mismatch_rows: unknown;
  blank_row_key_rows: unknown;
  missing_fingerprint_rows: unknown;
  canonical_mismatch_rows: unknown;
  date_window_summaries: unknown;
};

type MediaSyncStagingBaseSummary = {
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

  dateWindowCount: number;
  dateWindowSummaries:
    MediaSyncStagingDateWindowSummary[];
};

type CombinedValidationBatchSummary = {
  jobId: string;
  afterRowIndex: number | null;
  batchSize: number;
  batchRows: number;
  batchMaxRowIndex: number | null;
  scopeMismatchRows: number;
  blankRowKeyRows: number;
  missingFingerprintRows: number;
  canonicalMismatchRows: number;
  dateWindowSummaries: MediaSyncStagingDateWindowSummary[];
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
  options: Readonly<{
    allowGoogleAds?: boolean;
  }> = {},
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

  const googleAdsAllowed =
    options.allowGoogleAds === true &&
    value.provider ===
      GOOGLE_ADS_PROVIDER;

  if (
    value.provider !==
      NAVER_SEARCH_ADS_PROVIDER &&
    !googleAdsAllowed
  ) {
    throw new MediaSyncStagingSummaryError(
      "UNSUPPORTED_PROVIDER",
      options.allowGoogleAds === true
        ? "Only Naver Search Ads or Google Ads staging summaries are supported."
        : "Only Naver Search Ads staging summaries are supported at this stage.",
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


function validateSummaryAggregateConsistency(
  summary: MediaSyncStagingBaseSummary,
): void {
  if (
    summary.rowsInExpectedRange +
      summary.outOfRangeRows !==
    summary.totalRows
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary row ranges are inconsistent.",
    );
  }

  if (
    summary.missingExpectedRows !==
    Math.max(
      summary.expectedRows -
        summary.rowsInExpectedRange,
      0,
    )
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary missing row count is inconsistent.",
    );
  }

  if (
    summary.distinctRowIndexes >
      summary.totalRows ||
    summary.dateWindowCount !==
      summary.dateWindowSummaries.length
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging summary aggregate counts are inconsistent.",
    );
  }

  const windowRowTotal =
    summary.dateWindowSummaries.reduce(
      (
        sum,
        dateWindowSummary,
      ) =>
        sum +
        dateWindowSummary.rowCount,
      0,
    );

  if (
    windowRowTotal !==
    summary.totalRows
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The staging date window row counts do not match the total.",
    );
  }

  if (summary.totalRows === 0) {
    if (
      summary.minRowIndex !== null ||
      summary.maxRowIndex !== null ||
      summary.dateWindowCount !== 0
    ) {
      throw new MediaSyncStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The empty staging summary contains row indexes or date windows.",
      );
    }

    return;
  }

  if (
    summary.minRowIndex === null ||
    summary.maxRowIndex === null ||
    summary.minRowIndex >
      summary.maxRowIndex ||
    summary.dateWindowCount < 1
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The non-empty staging summary contains invalid index bounds.",
    );
  }
}

function calculateSummaryIsComplete(
  summary:
    MediaSyncStagingBaseSummary & {
      canonicalMismatchRows: number;
    },
): boolean {
  return (
    summary.totalRows ===
      summary.expectedRows &&
    summary.distinctRowIndexes ===
      summary.expectedRows &&
    summary.rowsInExpectedRange ===
      summary.expectedRows &&
    summary.missingExpectedRows === 0 &&
    summary.outOfRangeRows === 0 &&
    summary.scopeMismatchRows === 0 &&
    summary.blankRowKeyRows === 0 &&
    summary.missingFingerprintRows === 0 &&
    summary.canonicalMismatchRows === 0 &&
    (
      (
        summary.expectedRows === 0 &&
        summary.minRowIndex === null &&
        summary.maxRowIndex === null &&
        summary.dateWindowCount === 0
      )
      ||
      (
        summary.expectedRows > 0 &&
        summary.minRowIndex === 0 &&
        summary.maxRowIndex ===
          summary.expectedRows - 1 &&
        summary.dateWindowCount > 0
      )
    )
  );
}

function parseCombinedBaseRpcResult(
  value: unknown,
  expectedJobId: string,
  expectedRowsInput: number,
): MediaSyncStagingBaseSummary {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging base summary RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as CombinedBaseSummaryRpcRecord;

  const summary:
    MediaSyncStagingBaseSummary = {
      jobId:
        normalizeRequiredString(
          record.job_id,
          "job_id",
          200,
        ),

      expectedRows:
        requireResultInteger(
          record.expected_rows,
          "expected_rows",
        ),

      totalRows:
        requireResultInteger(
          record.total_rows,
          "total_rows",
        ),

      minRowIndex:
        requireNullableResultInteger(
          record.min_row_index,
          "min_row_index",
        ),

      maxRowIndex:
        requireNullableResultInteger(
          record.max_row_index,
          "max_row_index",
        ),

      distinctRowIndexes:
        requireResultInteger(
          record.distinct_row_indexes,
          "distinct_row_indexes",
        ),

      rowsInExpectedRange:
        requireResultInteger(
          record.rows_in_expected_range,
          "rows_in_expected_range",
        ),

      missingExpectedRows:
        requireResultInteger(
          record.missing_expected_rows,
          "missing_expected_rows",
        ),

      outOfRangeRows:
        requireResultInteger(
          record.out_of_range_rows,
          "out_of_range_rows",
        ),

      scopeMismatchRows:
        requireResultInteger(
          record.scope_mismatch_rows,
          "scope_mismatch_rows",
        ),

      blankRowKeyRows:
        requireResultInteger(
          record.blank_row_key_rows,
          "blank_row_key_rows",
        ),

      missingFingerprintRows:
        requireResultInteger(
          record.missing_fingerprint_rows,
          "missing_fingerprint_rows",
        ),

      dateWindowCount:
        requireResultInteger(
          record.date_window_count,
          "date_window_count",
        ),

      dateWindowSummaries:
        parseDateWindowSummaries(
          record.date_window_summaries,
        ),
    };

  if (
    summary.jobId !==
      expectedJobId ||
    summary.expectedRows !==
      expectedRowsInput
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging base summary RPC returned an unexpected job or expected row count.",
    );
  }

  if (
    summary.distinctRowIndexes !==
      summary.totalRows ||
    summary.rowsInExpectedRange +
      summary.outOfRangeRows !==
      summary.totalRows ||
    summary.missingExpectedRows !==
      Math.max(
        summary.expectedRows -
          summary.rowsInExpectedRange,
        0,
      ) ||
    summary.scopeMismatchRows !== 0 ||
    summary.blankRowKeyRows !== 0 ||
    summary.missingFingerprintRows !== 0 ||
    summary.dateWindowCount !== 0 ||
    summary.dateWindowSummaries.length !== 0 ||
    (
      summary.totalRows === 0
        ? summary.minRowIndex !== null ||
          summary.maxRowIndex !== null
        : summary.minRowIndex === null ||
          summary.maxRowIndex === null ||
          summary.minRowIndex >
            summary.maxRowIndex
    )
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The row-index-only combined staging base summary is inconsistent.",
    );
  }

  return summary;
}

function parseCombinedValidationBatchRpcResult(
  value: unknown,
  expectedJobId: string,
  expectedAfterRowIndex: number | null,
  expectedBatchSize: number,
): CombinedValidationBatchSummary {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging validation batch RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as CombinedValidationBatchRpcRecord;

  const batch:
    CombinedValidationBatchSummary = {
      jobId:
        normalizeRequiredString(
          record.job_id,
          "job_id",
          200,
        ),

      afterRowIndex:
        requireNullableResultInteger(
          record.after_row_index,
          "after_row_index",
        ),

      batchSize:
        requireResultInteger(
          record.batch_size,
          "batch_size",
        ),

      batchRows:
        requireResultInteger(
          record.batch_rows,
          "batch_rows",
        ),

      batchMaxRowIndex:
        requireNullableResultInteger(
          record.batch_max_row_index,
          "batch_max_row_index",
        ),

      scopeMismatchRows:
        requireResultInteger(
          record.scope_mismatch_rows,
          "scope_mismatch_rows",
        ),

      blankRowKeyRows:
        requireResultInteger(
          record.blank_row_key_rows,
          "blank_row_key_rows",
        ),

      missingFingerprintRows:
        requireResultInteger(
          record.missing_fingerprint_rows,
          "missing_fingerprint_rows",
        ),

      canonicalMismatchRows:
        requireResultInteger(
          record.canonical_mismatch_rows,
          "canonical_mismatch_rows",
        ),

      dateWindowSummaries:
        parseDateWindowSummaries(
          record.date_window_summaries,
        ),
    };

  if (
    batch.jobId !==
      expectedJobId ||
    batch.afterRowIndex !==
      expectedAfterRowIndex ||
    batch.batchSize !==
      expectedBatchSize ||
    batch.batchSize < 1 ||
    batch.batchRows >
      batch.batchSize ||
    batch.scopeMismatchRows >
      batch.batchRows ||
    batch.blankRowKeyRows >
      batch.batchRows ||
    batch.missingFingerprintRows >
      batch.batchRows ||
    batch.canonicalMismatchRows >
      batch.batchRows
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging validation batch RPC returned inconsistent values.",
    );
  }

  if (batch.batchRows === 0) {
    if (
      batch.batchMaxRowIndex !== null ||
      batch.scopeMismatchRows !== 0 ||
      batch.blankRowKeyRows !== 0 ||
      batch.missingFingerprintRows !== 0 ||
      batch.canonicalMismatchRows !== 0 ||
      batch.dateWindowSummaries.length !== 0
    ) {
      throw new MediaSyncStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The empty combined staging validation batch returned row data.",
      );
    }

    return batch;
  }

  const batchDateWindowRows =
    batch.dateWindowSummaries.reduce(
      (
        sum,
        windowSummary,
      ) =>
        sum +
        windowSummary.rowCount,
      0,
    );

  if (
    batchDateWindowRows !==
      batch.batchRows
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging validation batch date-window rows are inconsistent.",
    );
  }

  if (
    batch.batchMaxRowIndex === null ||
    (
      batch.afterRowIndex !== null &&
      batch.batchMaxRowIndex <=
        batch.afterRowIndex
    )
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging validation batch cursor did not advance.",
    );
  }

  return batch;
}

function mergeDateWindowSummaries(
  target:
    Map<number, MediaSyncStagingDateWindowSummary>,
  batchSummaries:
    MediaSyncStagingDateWindowSummary[],
): void {
  for (const batchSummary of batchSummaries) {
    const existing =
      target.get(
        batchSummary.dateWindowIndex,
      );

    if (!existing) {
      target.set(
        batchSummary.dateWindowIndex,
        { ...batchSummary },
      );

      continue;
    }

    existing.rowCount +=
      batchSummary.rowCount;

    existing.minRowIndex =
      Math.min(
        existing.minRowIndex,
        batchSummary.minRowIndex,
      );

    existing.maxRowIndex =
      Math.max(
        existing.maxRowIndex,
        batchSummary.maxRowIndex,
      );

    existing.minDate =
      existing.minDate <
        batchSummary.minDate
        ? existing.minDate
        : batchSummary.minDate;

    existing.maxDate =
      existing.maxDate >
        batchSummary.maxDate
        ? existing.maxDate
        : batchSummary.maxDate;
  }
}

function combinedBaseSummariesEqual(
  left: MediaSyncStagingBaseSummary,
  right: MediaSyncStagingBaseSummary,
): boolean {
  return (
    left.jobId ===
      right.jobId &&
    left.expectedRows ===
      right.expectedRows &&
    left.totalRows ===
      right.totalRows &&
    left.minRowIndex ===
      right.minRowIndex &&
    left.maxRowIndex ===
      right.maxRowIndex &&
    left.distinctRowIndexes ===
      right.distinctRowIndexes &&
    left.rowsInExpectedRange ===
      right.rowsInExpectedRange &&
    left.missingExpectedRows ===
      right.missingExpectedRows &&
    left.outOfRangeRows ===
      right.outOfRangeRows &&
    left.scopeMismatchRows ===
      right.scopeMismatchRows &&
    left.blankRowKeyRows ===
      right.blankRowKeyRows &&
    left.missingFingerprintRows ===
      right.missingFingerprintRows &&
    left.dateWindowCount ===
      right.dateWindowCount &&
    JSON.stringify(
      left.dateWindowSummaries,
    ) ===
      JSON.stringify(
        right.dateWindowSummaries,
      )
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
    calculateSummaryIsComplete({
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
    });

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

  validateJob(
    input.job,
    {
      allowGoogleAds:
        true,
    },
  );

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

/**
 * Naver Search Ads combined staging summary.
 *
 * The legacy getMediaSyncStagingSummary() remains keyword-only and continues
 * to call summarize_media_sync_staging. This function is used only after the
 * WEB_SITE keyword phase and SHOPPING/BRAND_SEARCH authoritative phase have
 * both completed.
 */
export async function getNaverSearchAdsCombinedStagingSummary(
  input: GetMediaSyncStagingSummaryInput,
  dependencies:
    NaverSearchAdsCombinedStagingSummaryDependencies =
      defaultNaverSearchAdsCombinedStagingSummaryDependencies,
): Promise<MediaSyncStagingSummary> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_INPUT",
      "Combined staging summary input is required.",
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

  const loadBaseSummary =
    async (): Promise<MediaSyncStagingBaseSummary> => {
      let result;

      try {
        result =
          await dependencies.invokeRpc(
            SUMMARIZE_NAVER_SEARCH_ADS_COMBINED_STAGING_BASE_RPC,
            {
              p_payload:
                payload,
            },
          );
      } catch (error) {
        throw new MediaSyncStagingSummaryError(
          "DATABASE_ERROR",
          "The combined Naver Search Ads staging base summary repository could not access the database.",
          { cause: error },
        );
      }

      const {
        data,
        error,
      } = result;

      if (error) {
        throw mapRpcError(
          error,
        );
      }

      return parseCombinedBaseRpcResult(
        data,
        input.job.id,
        expectedRows,
      );
    };

  const beforeSummary =
    await loadBaseSummary();

  let afterRowIndex:
    number | null =
    null;

  let validatedRows =
    0;

  let scopeMismatchRows =
    0;

  let blankRowKeyRows =
    0;

  let missingFingerprintRows =
    0;

  let canonicalMismatchRows =
    0;

  const dateWindowSummaryMap =
    new Map<
      number,
      MediaSyncStagingDateWindowSummary
    >();

  let validationExhausted =
    false;

  const maximumBatchCalls =
    Math.ceil(
      beforeSummary.totalRows /
        NAVER_SEARCH_ADS_COMBINED_VALIDATION_BATCH_SIZE,
    ) + 2;

  for (
    let batchCallIndex = 0;
    batchCallIndex <
      maximumBatchCalls;
    batchCallIndex += 1
  ) {
    const batchPayload = {
      ...payload,

      after_row_index:
        afterRowIndex,

      batch_size:
        NAVER_SEARCH_ADS_COMBINED_VALIDATION_BATCH_SIZE,
    };

    let result;

    try {
      result =
        await dependencies.invokeRpc(
          VALIDATE_NAVER_SEARCH_ADS_COMBINED_STAGING_BATCH_RPC,
          {
            p_payload:
              batchPayload,
          },
        );
    } catch (error) {
      throw new MediaSyncStagingSummaryError(
        "DATABASE_ERROR",
        "The combined Naver Search Ads staging validation batch repository could not access the database.",
        { cause: error },
      );
    }

    const {
      data,
      error,
    } = result;

    if (error) {
      throw mapRpcError(
        error,
      );
    }

    const batch =
      parseCombinedValidationBatchRpcResult(
        data,
        input.job.id,
        afterRowIndex,
        NAVER_SEARCH_ADS_COMBINED_VALIDATION_BATCH_SIZE,
      );

    if (batch.batchRows === 0) {
      validationExhausted =
        true;

      break;
    }

    validatedRows +=
      batch.batchRows;

    scopeMismatchRows +=
      batch.scopeMismatchRows;

    blankRowKeyRows +=
      batch.blankRowKeyRows;

    missingFingerprintRows +=
      batch.missingFingerprintRows;

    canonicalMismatchRows +=
      batch.canonicalMismatchRows;

    mergeDateWindowSummaries(
      dateWindowSummaryMap,
      batch.dateWindowSummaries,
    );

    if (
      !Number.isSafeInteger(
        validatedRows,
      ) ||
      !Number.isSafeInteger(
        scopeMismatchRows,
      ) ||
      !Number.isSafeInteger(
        blankRowKeyRows,
      ) ||
      !Number.isSafeInteger(
        missingFingerprintRows,
      ) ||
      !Number.isSafeInteger(
        canonicalMismatchRows,
      ) ||
      validatedRows >
        beforeSummary.totalRows
    ) {
      throw new MediaSyncStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The combined staging validation batch totals are invalid.",
      );
    }

    afterRowIndex =
      batch.batchMaxRowIndex;
  }

  if (!validationExhausted) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging validation batches did not terminate safely.",
    );
  }

  if (
    beforeSummary.distinctRowIndexes ===
      beforeSummary.totalRows &&
    validatedRows !==
      beforeSummary.totalRows
  ) {
    throw new MediaSyncStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The combined staging validation batches did not cover every staging row.",
    );
  }

  const afterSummary =
    await loadBaseSummary();

  if (
    !combinedBaseSummariesEqual(
      beforeSummary,
      afterSummary,
    )
  ) {
    throw new MediaSyncStagingSummaryError(
      "STAGING_CHANGED",
      "The combined Naver Search Ads staging rows changed during summary validation.",
    );
  }

  const dateWindowSummaries =
    Array.from(
      dateWindowSummaryMap.values(),
    ).sort(
      (left, right) =>
        left.dateWindowIndex -
        right.dateWindowIndex,
    );

  const completedSummary = {
    ...afterSummary,
    scopeMismatchRows,
    blankRowKeyRows,
    missingFingerprintRows,
    canonicalMismatchRows,
    dateWindowCount:
      dateWindowSummaries.length,
    dateWindowSummaries,
  };

  validateSummaryAggregateConsistency(
    completedSummary,
  );

  const isComplete =
    calculateSummaryIsComplete(
      completedSummary,
    );

  return {
    ...completedSummary,
    isComplete,
  };
}

export async function assertNaverSearchAdsCombinedStagingComplete(
  input: GetMediaSyncStagingSummaryInput,
): Promise<MediaSyncStagingSummary> {
  const summary =
    await getNaverSearchAdsCombinedStagingSummary(
      input,
    );

  if (!summary.isComplete) {
    throw new MediaSyncStagingSummaryError(
      "STAGING_INCOMPLETE",
      "The combined Naver Search Ads staging rows are not complete.",
      {
        summary,
      },
    );
  }

  return summary;
}