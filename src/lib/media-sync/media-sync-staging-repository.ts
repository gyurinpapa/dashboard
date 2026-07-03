import { getSupabaseAdmin } from "../supabase/admin";
import {
  isMediaSyncDataLevel,
  isValidMediaSyncDateRange,
  isValidYmd,
  type EtrylueNormalizedMediaRow,
  type JsonValue,
  type MediaSyncJobRecord,
} from "./types";

const APPEND_MEDIA_SYNC_STAGING_BATCH_RPC =
  "append_media_sync_staging_batch";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const API_INGESTION_SOURCE =
  "api" as const;

const MAX_BATCH_SIZE = 10_000;

const FORBIDDEN_SECRET_KEY_PATTERN =
  /secret|token|credential|ciphertext|accesslicense|authorization|password|api[_-]?key/i;

export type MediaSyncStagingRepositoryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "DUPLICATE_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class MediaSyncStagingRepositoryError extends Error {
  readonly code: MediaSyncStagingRepositoryErrorCode;

  constructor(
    code: MediaSyncStagingRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "MediaSyncStagingRepositoryError";

    this.code = code;
  }
}

export type AppendMediaSyncStagingBatchInput = {
  job: MediaSyncJobRecord;
  rows: readonly EtrylueNormalizedMediaRow[];
  rowStartIndex: number;
  dateWindowIndex: number;
};

export type AppendMediaSyncStagingBatchResult = {
  submittedRows: number;
  insertedRows: number;
  duplicateRows: number;
  firstRowIndex: number | null;
  lastRowIndex: number | null;
};

type UnknownRecord = Record<string, unknown>;

type AppendRpcRow = {
  submitted_rows: unknown;
  inserted_rows: unknown;
  duplicate_rows: unknown;
  first_row_index: unknown;
  last_row_index: unknown;
};

type StagingRpcInputRow = {
  row_index: number;
  row_key: string;
  date: string;
  channel: string | null;
  device: string | null;
  source: string | null;
  row: EtrylueNormalizedMediaRow;
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
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeDimension(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  if (value.length > 2_000) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return value;
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
    throw new MediaSyncStagingRepositoryError(
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
    throw new MediaSyncStagingRepositoryError(
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

function assertJsonSerializable(
  value: unknown,
  path: string,
  visited: Set<object>,
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MediaSyncStagingRepositoryError(
        "INVALID_INPUT",
        `${path} contains a non-finite number.`,
      );
    }

    return;
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${path} contains a value that cannot be stored as JSON.`,
    );
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      throw new MediaSyncStagingRepositoryError(
        "INVALID_INPUT",
        `${path} contains a circular reference.`,
      );
    }

    visited.add(value);

    try {
      for (
        let index = 0;
        index < value.length;
        index += 1
      ) {
        assertJsonSerializable(
          value[index],
          `${path}[${index}]`,
          visited,
        );
      }
    } finally {
      visited.delete(value);
    }

    return;
  }

  if (!isPlainObject(value)) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${path} must contain only plain JSON objects.`,
    );
  }

  if (visited.has(value)) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `${path} contains a circular reference.`,
    );
  }

  visited.add(value);

  try {
    for (
      const [key, nestedValue]
      of Object.entries(value)
    ) {
      if (
        FORBIDDEN_SECRET_KEY_PATTERN.test(
          key.replace(/[^a-z0-9_-]/gi, ""),
        )
      ) {
        throw new MediaSyncStagingRepositoryError(
          "INVALID_INPUT",
          `${path} contains a forbidden secret field.`,
        );
      }

      assertJsonSerializable(
        nestedValue,
        `${path}.${key}`,
        visited,
      );
    }
  } finally {
    visited.delete(value);
  }
}

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncStagingRepositoryError(
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
    throw new MediaSyncStagingRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads staging rows are supported at this stage.",
    );
  }

  if (value.status !== PROCESSING_STATUS) {
    throw new MediaSyncStagingRepositoryError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing before staging rows can be appended.",
    );
  }

  if (
    !isValidMediaSyncDateRange(
      value.date_from,
      value.date_to,
    )
  ) {
    throw new MediaSyncStagingRepositoryError(
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
    throw new MediaSyncStagingRepositoryError(
      "INVALID_JOB",
      "The processing media sync job has an invalid claim state.",
    );
  }
}

function buildNaverKeywordRowKey(
  row: EtrylueNormalizedMediaRow,
): string {
  const provider =
    normalizeRequiredString(
      row.provider,
      "row.provider",
      100,
    );

  const externalAccountId =
    normalizeRequiredString(
      row.external_account_id,
      "row.external_account_id",
      500,
    );

  const externalCampaignId =
    normalizeRequiredString(
      row.external_campaign_id,
      "row.external_campaign_id",
      2_000,
    );

  const externalGroupId =
    normalizeRequiredString(
      row.external_group_id,
      "row.external_group_id",
      2_000,
    );

  const externalKeywordId =
    normalizeRequiredString(
      row.external_keyword_id,
      "row.external_keyword_id",
      2_000,
    );

  const date =
    normalizeRequiredString(
      row.date,
      "row.date",
      10,
    );

  return JSON.stringify([
    provider,
    externalAccountId,
    externalCampaignId,
    externalGroupId,
    externalKeywordId,
    date,
  ]);
}

function validateCanonicalRow(input: {
  row: unknown;
  rowIndexInBatch: number;
  job: MediaSyncJobRecord;
}): EtrylueNormalizedMediaRow {
  const {
    row,
    rowIndexInBatch,
    job,
  } = input;

  if (!isPlainObject(row)) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `rows[${rowIndexInBatch}] must be a canonical row object.`,
    );
  }

  assertJsonSerializable(
    row,
    `rows[${rowIndexInBatch}]`,
    new Set<object>(),
  );

  const typedRow =
    row as EtrylueNormalizedMediaRow;

  if (
    typedRow.provider !==
    job.provider
  ) {
    throw new MediaSyncStagingRepositoryError(
      "SCOPE_MISMATCH",
      `rows[${rowIndexInBatch}] provider does not match the job.`,
    );
  }

  if (
    typedRow.ingestion_source !==
    API_INGESTION_SOURCE
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `rows[${rowIndexInBatch}] must use API ingestion_source.`,
    );
  }

  const externalAccountId =
    normalizeRequiredString(
      typedRow.external_account_id,
      `rows[${rowIndexInBatch}].external_account_id`,
      500,
    );

  if (
    externalAccountId !==
    job.external_account_id
  ) {
    throw new MediaSyncStagingRepositoryError(
      "SCOPE_MISMATCH",
      `rows[${rowIndexInBatch}] account does not match the job.`,
    );
  }

  if (!isValidYmd(typedRow.date)) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `rows[${rowIndexInBatch}].date is invalid.`,
    );
  }

  if (
    typedRow.date < job.date_from ||
    typedRow.date > job.date_to
  ) {
    throw new MediaSyncStagingRepositoryError(
      "SCOPE_MISMATCH",
      `rows[${rowIndexInBatch}].date is outside the job date range.`,
    );
  }

  if (
    typedRow.report_date !==
      typedRow.date ||
    typedRow.day !==
      typedRow.date ||
    typedRow.ymd !==
      typedRow.date
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `rows[${rowIndexInBatch}] canonical date fields do not match.`,
    );
  }

  if (
    !isMediaSyncDataLevel(
      typedRow.row_level,
    ) ||
    !isMediaSyncDataLevel(
      typedRow.data_level,
    )
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `rows[${rowIndexInBatch}] contains an invalid data level.`,
    );
  }

  if (
    typedRow.row_level !== "keyword" ||
    typedRow.data_level !== "keyword"
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `rows[${rowIndexInBatch}] must be a Naver keyword row.`,
    );
  }

  normalizeRequiredString(
    typedRow.external_campaign_id,
    `rows[${rowIndexInBatch}].external_campaign_id`,
  );

  normalizeRequiredString(
    typedRow.external_group_id,
    `rows[${rowIndexInBatch}].external_group_id`,
  );

  normalizeRequiredString(
    typedRow.external_keyword_id,
    `rows[${rowIndexInBatch}].external_keyword_id`,
  );

  normalizeRequiredString(
    typedRow.campaign,
    `rows[${rowIndexInBatch}].campaign`,
  );

  normalizeRequiredString(
    typedRow.group,
    `rows[${rowIndexInBatch}].group`,
  );

  normalizeRequiredString(
    typedRow.keyword,
    `rows[${rowIndexInBatch}].keyword`,
  );

  normalizeDimension(
    typedRow.channel,
    `rows[${rowIndexInBatch}].channel`,
  );

  normalizeDimension(
    typedRow.device,
    `rows[${rowIndexInBatch}].device`,
  );

  normalizeDimension(
    typedRow.source,
    `rows[${rowIndexInBatch}].source`,
  );

  const metricFields = [
    "impressions",
    "clicks",
    "cost",
    "conversions",
    "revenue",
  ] as const;

  for (const metricField of metricFields) {
    const metricValue =
      typedRow[metricField];

    if (
      typeof metricValue !== "number" ||
      !Number.isFinite(metricValue) ||
      metricValue < 0
    ) {
      throw new MediaSyncStagingRepositoryError(
        "INVALID_INPUT",
        `rows[${rowIndexInBatch}].${metricField} must be a non-negative finite number.`,
      );
    }
  }

  return typedRow;
}

function mapRpcError(
  error: unknown,
): MediaSyncStagingRepositoryError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (
    message.includes(
      "MSS_JOB_NOT_PROCESSING",
    )
  ) {
    return new MediaSyncStagingRepositoryError(
      "JOB_NOT_PROCESSING",
      "The media sync job is not processing.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_UNSUPPORTED_PROVIDER",
    )
  ) {
    return new MediaSyncStagingRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "The media sync provider is not supported.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_SCOPE_MISMATCH",
    )
  ) {
    return new MediaSyncStagingRepositoryError(
      "SCOPE_MISMATCH",
      "The media sync staging scope does not match the job.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_DUPLICATE_CONFLICT",
    )
  ) {
    return new MediaSyncStagingRepositoryError(
      "DUPLICATE_CONFLICT",
      "A staging row conflicts with an existing row.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_INVALID_JOB",
    )
  ) {
    return new MediaSyncStagingRepositoryError(
      "INVALID_JOB",
      "The media sync job was not found or is invalid.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSS_INVALID_INPUT",
    )
  ) {
    return new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      "The staging batch input is invalid.",
      { cause: error },
    );
  }

  return new MediaSyncStagingRepositoryError(
    "DATABASE_ERROR",
    "The media sync staging batch could not be appended.",
    { cause: error },
  );
}

function parseRpcResult(
  value: unknown,
): AppendMediaSyncStagingBatchResult {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The staging append RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as AppendRpcRow;

  const submittedRows =
    requireResultInteger(
      record.submitted_rows,
      "submitted_rows",
    );

  const insertedRows =
    requireResultInteger(
      record.inserted_rows,
      "inserted_rows",
    );

  const duplicateRows =
    requireResultInteger(
      record.duplicate_rows,
      "duplicate_rows",
    );

  const firstRowIndex =
    requireNullableResultInteger(
      record.first_row_index,
      "first_row_index",
    );

  const lastRowIndex =
    requireNullableResultInteger(
      record.last_row_index,
      "last_row_index",
    );

  if (
    insertedRows + duplicateRows !==
    submittedRows
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The staging append RPC returned inconsistent row counts.",
    );
  }

  if (submittedRows === 0) {
    if (
      firstRowIndex !== null ||
      lastRowIndex !== null
    ) {
      throw new MediaSyncStagingRepositoryError(
        "INVALID_DATABASE_RESULT",
        "The empty staging append result contains row indexes.",
      );
    }
  } else if (
    firstRowIndex === null ||
    lastRowIndex === null ||
    firstRowIndex > lastRowIndex
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The staging append RPC returned invalid row indexes.",
    );
  }

  return {
    submittedRows,
    insertedRows,
    duplicateRows,
    firstRowIndex,
    lastRowIndex,
  };
}

export async function appendMediaSyncStagingBatch(
  input: AppendMediaSyncStagingBatchInput,
): Promise<AppendMediaSyncStagingBatchResult> {
  if (!input || typeof input !== "object") {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      "Staging batch input is required.",
    );
  }

  validateJob(input.job);

  if (!Array.isArray(input.rows)) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      "rows must be an array.",
    );
  }

  if (input.rows.length > MAX_BATCH_SIZE) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      `rows must contain no more than ${MAX_BATCH_SIZE} entries.`,
    );
  }

  const rowStartIndex =
    normalizeNonNegativeInteger(
      input.rowStartIndex,
      "rowStartIndex",
    );

  const dateWindowIndex =
    normalizeNonNegativeInteger(
      input.dateWindowIndex,
      "dateWindowIndex",
    );

  if (
    input.rows.length > 0 &&
    rowStartIndex >
      Number.MAX_SAFE_INTEGER -
        input.rows.length
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_INPUT",
      "The staging row index range exceeds the safe integer limit.",
    );
  }

  const rpcRows: StagingRpcInputRow[] =
    input.rows.map(
      (row, index) => {
        const canonicalRow =
          validateCanonicalRow({
            row,
            rowIndexInBatch: index,
            job: input.job,
          });

        return {
          row_index:
            rowStartIndex + index,

          row_key:
            buildNaverKeywordRowKey(
              canonicalRow,
            ),

          date:
            canonicalRow.date,

          channel:
            canonicalRow.channel,

          device:
            canonicalRow.device,

          source:
            canonicalRow.source,

          row:
            canonicalRow,
        };
      },
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

    date_window_index:
      dateWindowIndex,

    rows:
      rpcRows,
  };

  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result = await supabase.rpc(
      APPEND_MEDIA_SYNC_STAGING_BATCH_RPC,
      {
        p_payload: payload,
      },
    );
  } catch (error) {
    throw new MediaSyncStagingRepositoryError(
      "DATABASE_ERROR",
      "The media sync staging repository could not access the database.",
      { cause: error },
    );
  }

  const { data, error } = result;

  if (error) {
    throw mapRpcError(error);
  }

  const parsedResult =
    parseRpcResult(data);

  if (
    parsedResult.submittedRows !==
    input.rows.length
  ) {
    throw new MediaSyncStagingRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The staging append RPC submitted row count does not match the batch.",
    );
  }

  if (input.rows.length > 0) {
    const expectedLastRowIndex =
      rowStartIndex +
      input.rows.length -
      1;

    if (
      parsedResult.firstRowIndex !==
        rowStartIndex ||
      parsedResult.lastRowIndex !==
        expectedLastRowIndex
    ) {
      throw new MediaSyncStagingRepositoryError(
        "INVALID_DATABASE_RESULT",
        "The staging append RPC row index range does not match the batch.",
      );
    }
  }

  return parsedResult;
}