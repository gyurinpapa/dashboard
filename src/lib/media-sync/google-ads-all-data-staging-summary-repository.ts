import type {
  GetMediaSyncStagingSummaryInput,
  MediaSyncStagingDateWindowSummary,
  MediaSyncStagingSummary,
} from "./media-sync-staging-summary-repository";
import {
  isValidMediaSyncDateRange,
  isValidYmd,
  type MediaSyncJobRecord,
} from "./types";

const SUMMARIZE_GOOGLE_ADS_ALL_DATA_STAGING_BASE_RPC =
  "summarize_google_ads_all_data_staging_base";

const VALIDATE_GOOGLE_ADS_ALL_DATA_STAGING_BATCH_RPC =
  "validate_google_ads_all_data_staging_batch_v1";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const PROCESSING_STATUS =
  "processing" as const;

const VALIDATION_BATCH_SIZE =
  2_000;

export type GoogleAdsAllDataStagingSummaryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "STAGING_INCOMPLETE"
  | "STAGING_CHANGED"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class GoogleAdsAllDataStagingSummaryError
  extends Error {
  readonly code:
    GoogleAdsAllDataStagingSummaryErrorCode;

  readonly summary:
    MediaSyncStagingSummary |
    null;

  constructor(
    code:
      GoogleAdsAllDataStagingSummaryErrorCode,
    message:
      string,
    options?:
      ErrorOptions &
      Readonly<{
        summary?:
          MediaSyncStagingSummary |
          null;
      }>,
  ) {
    super(
      message,
      {
        cause:
          options?.cause,
      },
    );

    this.name =
      "GoogleAdsAllDataStagingSummaryError";

    this.code =
      code;

    this.summary =
      options?.summary ??
      null;
  }
}

type UnknownRecord =
  Record<string, unknown>;

type MediaSyncJobRecordWithExecutionContract =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract?:
      unknown;
  }>;

type BaseSummaryRpcRecord =
  Readonly<{
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
  }>;

type ValidationBatchRpcRecord =
  Readonly<{
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
  }>;

type BaseSummary =
  Readonly<{
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
  }>;

type ValidationBatch =
  Readonly<{
    jobId: string;
    afterRowIndex:
      number |
      null;
    batchSize: number;
    batchRows: number;
    batchMaxRowIndex:
      number |
      null;
    scopeMismatchRows: number;
    blankRowKeyRows: number;
    missingFingerprintRows: number;
    canonicalMismatchRows: number;
    dateWindowSummaries:
      MediaSyncStagingDateWindowSummary[];
  }>;

export type GoogleAdsAllDataStagingSummaryDependencies =
  Readonly<{
    invokeRpc?:
      (
        functionName:
          string,
        args:
          Readonly<{
            p_payload:
              Record<string, unknown>;
          }>,
      ) =>
        Promise<
          Readonly<{
            data: unknown;
            error: unknown;
          }>
        >;
  }>;

function isPlainObject(
  value:
    unknown,
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
  value:
    unknown,
  fieldName:
    string,
  maxLength =
    2_000,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (!normalized) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalized;
}

function normalizeNonNegativeInteger(
  value:
    unknown,
  fieldName:
    string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_INPUT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function requireResultInteger(
  value:
    unknown,
  fieldName:
    string,
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
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      `Database result ${fieldName} is invalid.`,
    );
  }

  return numberValue;
}

function requireNullableResultInteger(
  value:
    unknown,
  fieldName:
    string,
): number | null {
  if (value === null) {
    return null;
  }

  return requireResultInteger(
    value,
    fieldName,
  );
}

function parseDateWindowSummary(
  value:
    unknown,
  index:
    number,
): MediaSyncStagingDateWindowSummary {
  if (!isPlainObject(value)) {
    throw new GoogleAdsAllDataStagingSummaryError(
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
    throw new GoogleAdsAllDataStagingSummaryError(
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
  value:
    unknown,
): MediaSyncStagingDateWindowSummary[] {
  if (!Array.isArray(value)) {
    throw new GoogleAdsAllDataStagingSummaryError(
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
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "Date window summaries are not strictly ordered.",
      );
    }
  }

  return summaries;
}

function mapRpcError(
  error:
    unknown,
): GoogleAdsAllDataStagingSummaryError {
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
    return new GoogleAdsAllDataStagingSummaryError(
      "JOB_NOT_PROCESSING",
      "The Google Ads ALL-DATA media sync job is not processing.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_UNSUPPORTED_PROVIDER",
    )
  ) {
    return new GoogleAdsAllDataStagingSummaryError(
      "UNSUPPORTED_PROVIDER",
      "The staging summary provider is not supported.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_SCOPE_MISMATCH",
    )
  ) {
    return new GoogleAdsAllDataStagingSummaryError(
      "SCOPE_MISMATCH",
      "The Google Ads ALL-DATA staging summary scope does not match the media sync job.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_INVALID_JOB",
    )
  ) {
    return new GoogleAdsAllDataStagingSummaryError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA media sync job was not found or is invalid.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSS_SUMMARY_INVALID_INPUT",
    )
  ) {
    return new GoogleAdsAllDataStagingSummaryError(
      "INVALID_INPUT",
      "The Google Ads ALL-DATA staging summary input is invalid.",
      {
        cause:
          error,
      },
    );
  }

  return new GoogleAdsAllDataStagingSummaryError(
    "DATABASE_ERROR",
    "The Google Ads ALL-DATA staging summary could not be loaded.",
    {
      cause:
        error,
    },
  );
}

function validateJob(
  value:
    unknown,
  expectedRows:
    number,
): asserts value is MediaSyncJobRecordWithExecutionContract {
  if (!isPlainObject(value)) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_JOB",
      "A Google Ads ALL-DATA media sync job record is required.",
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
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads ALL-DATA staging summaries are supported.",
    );
  }

  if (
    value.execution_contract !==
    GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_JOB",
      "The Google Ads media sync job does not use the ALL-DATA execution contract.",
    );
  }

  if (
    value.status !==
    PROCESSING_STATUS
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "JOB_NOT_PROCESSING",
      "The Google Ads ALL-DATA media sync job must be processing before staging completeness can be checked.",
    );
  }

  if (
    !isValidMediaSyncDateRange(
      value.date_from,
      value.date_to,
    )
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA media sync job contains an invalid date range.",
    );
  }

 const attemptCount =
  value.attempt_count;

if (
  typeof value.started_at !== "string" ||
  !value.started_at.trim() ||
  typeof attemptCount !== "number" ||
  !Number.isSafeInteger(
    attemptCount,
  ) ||
  attemptCount < 1
) {
  throw new GoogleAdsAllDataStagingSummaryError(
    "INVALID_JOB",
    "The processing Google Ads ALL-DATA job has an invalid claim state.",
  );
}

  for (
    const [
      fieldName,
      fieldValue,
    ] of [
      [
        "job.raw_rows",
        value.raw_rows,
      ],
      [
        "job.normalized_rows",
        value.normalized_rows,
      ],
      [
        "job.inserted_rows",
        value.inserted_rows,
      ],
      [
        "job.failed_rows",
        value.failed_rows,
      ],
    ] as const
  ) {
    if (
      typeof fieldValue !== "number" ||
      !Number.isSafeInteger(fieldValue) ||
      fieldValue < 0
    ) {
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_JOB",
        `${fieldName} must be a non-negative safe integer.`,
      );
    }
  }

  if (
    value.raw_rows !== expectedRows ||
    value.normalized_rows !== expectedRows ||
    value.inserted_rows !== expectedRows ||
    value.failed_rows !== 0
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "SCOPE_MISMATCH",
      "The Google Ads ALL-DATA durable row counters do not match the expected staging row boundary.",
    );
  }
}

function parseBaseSummary(
  value:
    unknown,
  expectedJobId:
    string,
  expectedRows:
    number,
): BaseSummary {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA base summary RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as BaseSummaryRpcRecord;

  const summary:
    BaseSummary = {
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
    summary.jobId !== expectedJobId ||
    summary.expectedRows !== expectedRows
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA base summary identity does not match the request.",
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
        expectedRows -
          summary.rowsInExpectedRange,
        0,
      ) ||
    summary.scopeMismatchRows !== 0 ||
    summary.blankRowKeyRows !== 0 ||
    summary.missingFingerprintRows !== 0 ||
    summary.dateWindowCount !== 0 ||
    summary.dateWindowSummaries.length !== 0
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA structural base summary is inconsistent.",
    );
  }

  if (
    summary.totalRows === 0
  ) {
    if (
      summary.minRowIndex !== null ||
      summary.maxRowIndex !== null
    ) {
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The empty Google Ads ALL-DATA base summary contains row-index bounds.",
      );
    }
  } else if (
    summary.minRowIndex === null ||
    summary.maxRowIndex === null ||
    summary.minRowIndex >
      summary.maxRowIndex
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The non-empty Google Ads ALL-DATA base summary contains invalid row-index bounds.",
    );
  }

  return summary;
}

function parseValidationBatch(
  value:
    unknown,
  expectedJobId:
    string,
  expectedAfterRowIndex:
    number |
    null,
  expectedBatchSize:
    number,
): ValidationBatch {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA validation batch RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as ValidationBatchRpcRecord;

  const batch:
    ValidationBatch = {
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
    batch.jobId !== expectedJobId ||
    batch.afterRowIndex !== expectedAfterRowIndex ||
    batch.batchSize !== expectedBatchSize ||
    batch.batchRows > expectedBatchSize
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA validation batch identity is inconsistent.",
    );
  }

  const batchWindowRows =
    batch.dateWindowSummaries.reduce(
      (
        total,
        summary,
      ) =>
        total +
        summary.rowCount,
      0,
    );

  if (
    !Number.isSafeInteger(
      batchWindowRows,
    ) ||
    batchWindowRows !==
      batch.batchRows
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA validation batch date-window row count is inconsistent.",
    );
  }

  if (
    batch.batchRows === 0
  ) {
    if (
      batch.batchMaxRowIndex !== null ||
      batch.dateWindowSummaries.length !== 0
    ) {
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The empty Google Ads ALL-DATA validation batch contains row data.",
      );
    }
  } else if (
    batch.batchMaxRowIndex === null ||
    (
      expectedAfterRowIndex !== null &&
      batch.batchMaxRowIndex <=
        expectedAfterRowIndex
    )
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA validation batch did not advance its row boundary.",
    );
  }

  return batch;
}

function baseSummariesEqual(
  left:
    BaseSummary,
  right:
    BaseSummary,
): boolean {
  return (
    left.jobId === right.jobId &&
    left.expectedRows === right.expectedRows &&
    left.totalRows === right.totalRows &&
    left.minRowIndex === right.minRowIndex &&
    left.maxRowIndex === right.maxRowIndex &&
    left.distinctRowIndexes ===
      right.distinctRowIndexes &&
    left.rowsInExpectedRange ===
      right.rowsInExpectedRange &&
    left.missingExpectedRows ===
      right.missingExpectedRows &&
    left.outOfRangeRows ===
      right.outOfRangeRows
  );
}

function mergeDateWindowSummaries(
  target:
    Map<
      number,
      MediaSyncStagingDateWindowSummary
    >,
  incoming:
    readonly MediaSyncStagingDateWindowSummary[],
): void {
  for (
    const summary
    of incoming
  ) {
    const existing =
      target.get(
        summary.dateWindowIndex,
      );

    if (!existing) {
      target.set(
        summary.dateWindowIndex,
        {
          ...summary,
        },
      );

      continue;
    }

    const rowCount =
      existing.rowCount +
      summary.rowCount;

    if (
      !Number.isSafeInteger(rowCount)
    ) {
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The Google Ads ALL-DATA date-window row count overflowed.",
      );
    }

    target.set(
      summary.dateWindowIndex,
      {
        dateWindowIndex:
          summary.dateWindowIndex,

        rowCount,

        minRowIndex:
          Math.min(
            existing.minRowIndex,
            summary.minRowIndex,
          ),

        maxRowIndex:
          Math.max(
            existing.maxRowIndex,
            summary.maxRowIndex,
          ),

        minDate:
          existing.minDate <
          summary.minDate
            ? existing.minDate
            : summary.minDate,

        maxDate:
          existing.maxDate >
          summary.maxDate
            ? existing.maxDate
            : summary.maxDate,
      },
    );
  }
}

function validateCompletedSummary(
  summary:
    Omit<
      MediaSyncStagingSummary,
      "isComplete"
    >,
  job:
    MediaSyncJobRecord,
): void {
  if (
    summary.rowsInExpectedRange +
      summary.outOfRangeRows !==
        summary.totalRows ||
    summary.distinctRowIndexes !==
      summary.totalRows ||
    summary.missingExpectedRows !==
      Math.max(
        summary.expectedRows -
          summary.rowsInExpectedRange,
        0,
      ) ||
    summary.dateWindowCount !==
      summary.dateWindowSummaries.length
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA staging summary aggregate is inconsistent.",
    );
  }

  const dateWindowRows =
    summary.dateWindowSummaries.reduce(
      (
        total,
        window,
      ) =>
        total +
        window.rowCount,
      0,
    );

  if (
    !Number.isSafeInteger(
      dateWindowRows,
    ) ||
    dateWindowRows !==
      summary.totalRows
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA date-window summaries do not cover every staging row.",
    );
  }

  for (
    const window
    of summary.dateWindowSummaries
  ) {
    if (
      window.minDate <
        job.date_from ||
      window.maxDate >
        job.date_to
    ) {
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "A Google Ads ALL-DATA date-window summary falls outside the job date range.",
      );
    }
  }

  if (
    summary.totalRows === 0
  ) {
    if (
      summary.minRowIndex !== null ||
      summary.maxRowIndex !== null ||
      summary.dateWindowCount !== 0
    ) {
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The empty Google Ads ALL-DATA staging summary is inconsistent.",
      );
    }
  } else if (
    summary.minRowIndex === null ||
    summary.maxRowIndex === null ||
    summary.minRowIndex >
      summary.maxRowIndex ||
    summary.dateWindowCount < 1
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The non-empty Google Ads ALL-DATA staging summary contains invalid bounds.",
    );
  }
}

function calculateIsComplete(
  summary:
    Omit<
      MediaSyncStagingSummary,
      "isComplete"
    >,
): boolean {
  if (
    summary.expectedRows === 0
  ) {
    return (
      summary.totalRows === 0 &&
      summary.minRowIndex === null &&
      summary.maxRowIndex === null &&
      summary.distinctRowIndexes === 0 &&
      summary.rowsInExpectedRange === 0 &&
      summary.missingExpectedRows === 0 &&
      summary.outOfRangeRows === 0 &&
      summary.scopeMismatchRows === 0 &&
      summary.blankRowKeyRows === 0 &&
      summary.missingFingerprintRows === 0 &&
      summary.canonicalMismatchRows === 0 &&
      summary.dateWindowCount === 0
    );
  }

  return (
    summary.totalRows ===
      summary.expectedRows &&
    summary.minRowIndex === 0 &&
    summary.maxRowIndex ===
      summary.expectedRows - 1 &&
    summary.distinctRowIndexes ===
      summary.expectedRows &&
    summary.rowsInExpectedRange ===
      summary.expectedRows &&
    summary.missingExpectedRows === 0 &&
    summary.outOfRangeRows === 0 &&
    summary.scopeMismatchRows === 0 &&
    summary.blankRowKeyRows === 0 &&
    summary.missingFingerprintRows === 0 &&
    summary.canonicalMismatchRows === 0
  );
}

const defaultInvokeRpc:
  NonNullable<
    GoogleAdsAllDataStagingSummaryDependencies[
      "invokeRpc"
    ]
  > =
  async (
    functionName,
    args,
  ) => {
    const {
      getSupabaseAdmin,
    } =
      await import(
        "../supabase/admin"
      );

    const supabase =
      getSupabaseAdmin();

    return await supabase.rpc(
      functionName,
      args,
    );
  };

export async function getGoogleAdsAllDataStagingSummary(
  input:
    GetMediaSyncStagingSummaryInput,
  dependencies:
    GoogleAdsAllDataStagingSummaryDependencies = {},
): Promise<MediaSyncStagingSummary> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA staging summary input is required.",
    );
  }

  const expectedRows =
    normalizeNonNegativeInteger(
      input.expectedRows,
      "expectedRows",
    );

  validateJob(
    input.job,
    expectedRows,
  );

  const executionContract =
    (
      input.job as
        MediaSyncJobRecordWithExecutionContract
    ).execution_contract;

  const payload:
    Record<string, unknown> = {
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

      execution_contract:
        executionContract,

      external_account_id:
        input.job.external_account_id,

      date_from:
        input.job.date_from,

      date_to:
        input.job.date_to,

      expected_rows:
        expectedRows,
    };

  const invokeRpc =
    dependencies.invokeRpc ??
    defaultInvokeRpc;

  const loadBaseSummary =
    async (): Promise<BaseSummary> => {
      let result;

      try {
        result =
          await invokeRpc(
            SUMMARIZE_GOOGLE_ADS_ALL_DATA_STAGING_BASE_RPC,
            {
              p_payload:
                payload,
            },
          );
      } catch (error) {
        throw new GoogleAdsAllDataStagingSummaryError(
          "DATABASE_ERROR",
          "The Google Ads ALL-DATA staging base summary repository could not access the database.",
          {
            cause:
              error,
          },
        );
      }

      if (result.error) {
        throw mapRpcError(
          result.error,
        );
      }

      return parseBaseSummary(
        result.data,
        input.job.id,
        expectedRows,
      );
    };

  const beforeSummary =
    await loadBaseSummary();

  let afterRowIndex:
    number |
    null =
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
        VALIDATION_BATCH_SIZE,
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
        VALIDATION_BATCH_SIZE,
    };

    let result;

    try {
      result =
        await invokeRpc(
          VALIDATE_GOOGLE_ADS_ALL_DATA_STAGING_BATCH_RPC,
          {
            p_payload:
              batchPayload,
          },
        );
    } catch (error) {
      throw new GoogleAdsAllDataStagingSummaryError(
        "DATABASE_ERROR",
        "The Google Ads ALL-DATA staging validation batch repository could not access the database.",
        {
          cause:
            error,
        },
      );
    }

    if (result.error) {
      throw mapRpcError(
        result.error,
      );
    }

    const batch =
      parseValidationBatch(
        result.data,
        input.job.id,
        afterRowIndex,
        VALIDATION_BATCH_SIZE,
      );

    if (
      batch.batchRows === 0
    ) {
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
      !Number.isSafeInteger(validatedRows) ||
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
      throw new GoogleAdsAllDataStagingSummaryError(
        "INVALID_DATABASE_RESULT",
        "The Google Ads ALL-DATA staging validation totals are invalid.",
      );
    }

    afterRowIndex =
      batch.batchMaxRowIndex;
  }

  if (!validationExhausted) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA staging validation batches did not terminate safely.",
    );
  }

  if (
    validatedRows !==
    beforeSummary.totalRows
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA staging validation batches did not cover every persisted row.",
    );
  }

  const afterSummary =
    await loadBaseSummary();

  if (
    !baseSummariesEqual(
      beforeSummary,
      afterSummary,
    )
  ) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "STAGING_CHANGED",
      "The Google Ads ALL-DATA staging rows changed during summary validation.",
    );
  }

  const dateWindowSummaries =
    Array.from(
      dateWindowSummaryMap.values(),
    ).sort(
      (
        left,
        right,
      ) =>
        left.dateWindowIndex -
        right.dateWindowIndex,
    );

  const completedSummary:
    Omit<
      MediaSyncStagingSummary,
      "isComplete"
    > = {
      jobId:
        afterSummary.jobId,

      expectedRows:
        afterSummary.expectedRows,

      totalRows:
        afterSummary.totalRows,

      minRowIndex:
        afterSummary.minRowIndex,

      maxRowIndex:
        afterSummary.maxRowIndex,

      distinctRowIndexes:
        afterSummary.distinctRowIndexes,

      rowsInExpectedRange:
        afterSummary.rowsInExpectedRange,

      missingExpectedRows:
        afterSummary.missingExpectedRows,

      outOfRangeRows:
        afterSummary.outOfRangeRows,

      scopeMismatchRows,

      blankRowKeyRows,

      missingFingerprintRows,

      canonicalMismatchRows,

      dateWindowCount:
        dateWindowSummaries.length,

      dateWindowSummaries,
    };

  validateCompletedSummary(
    completedSummary,
    input.job,
  );

  return {
    ...completedSummary,

    isComplete:
      calculateIsComplete(
        completedSummary,
      ),
  };
}

export async function assertGoogleAdsAllDataStagingComplete(
  input:
    GetMediaSyncStagingSummaryInput,
  dependencies:
    GoogleAdsAllDataStagingSummaryDependencies = {},
): Promise<MediaSyncStagingSummary> {
  const summary =
    await getGoogleAdsAllDataStagingSummary(
      input,
      dependencies,
    );

  if (!summary.isComplete) {
    throw new GoogleAdsAllDataStagingSummaryError(
      "STAGING_INCOMPLETE",
      "The Google Ads ALL-DATA staging rows are not complete.",
      {
        summary,
      },
    );
  }

  return summary;
}
