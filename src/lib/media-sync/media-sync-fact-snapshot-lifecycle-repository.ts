import { getSupabaseAdmin } from "../supabase/admin";
import type { MediaSyncJobRecord } from "./types";

const NAVER_PROVIDER = "naver_searchad" as const;
const SNAPSHOT_REPLACE_MODE = "snapshot_replace" as const;

const PREPARE_RPC =
  "prepare_naver_fact_snapshot_materialization" as const;
const BATCH_RPC =
  "materialize_naver_fact_snapshot_batch" as const;
const COMPLETE_RPC =
  "complete_naver_fact_snapshot_materialization" as const;
const ACTIVATE_RPC =
  "activate_naver_fact_snapshot" as const;
const FANOUT_ACTIVATE_RPC =
  "activate_naver_fact_snapshot_fanout" as const;
const FINALIZE_RPC =
  "finalize_naver_fact_snapshot_job" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

type UnknownRecord =
  Record<string, unknown>;

type RpcResponse = {
  data: unknown;
  error: unknown;
};

export type NaverFactSnapshotLifecycleErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "UNSUPPORTED_JOB"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT"
  | "RESULT_CONFLICT";

export class NaverFactSnapshotLifecycleError extends Error {
  readonly code:
    NaverFactSnapshotLifecycleErrorCode;

  constructor(
    code:
      NaverFactSnapshotLifecycleErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name =
      "NaverFactSnapshotLifecycleError";
    this.code = code;
  }
}

export type NaverFactSnapshotLifecycleDependencies = {
  invokeRpc?: (
    functionName: string,
    args: {
      p_payload:
        Record<string, unknown>;
    },
  ) => Promise<RpcResponse>;
};

export type NaverFactSnapshotProjectionDescriptor = {
  reportId: string;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedRows: number;
};

export type PrepareNaverFactSnapshotInput = {
  job: MediaSyncJobRecord;
  reportId: string;
  dependencies?:
    NaverFactSnapshotLifecycleDependencies;
};

export type PrepareNaverFactSnapshotResult = {
  job: MediaSyncJobRecord;
  reportId: string;
  previousIngestionId: string | null;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedRows: number;
  nextRowIndex: number;
  idempotent: boolean;
};

export type MaterializeNaverFactSnapshotBatchInput = {
  job: MediaSyncJobRecord;
  reportId: string;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedRows: number;
  batchStart: number;
  batchSize: number;
  dependencies?:
    NaverFactSnapshotLifecycleDependencies;
};

export type MaterializeNaverFactSnapshotBatchResult = {
  job: MediaSyncJobRecord;
  reportId: string;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedRows: number;
  batchStart: number;
  batchEndExclusive: number;
  expectedBatchRows: number;
  insertedRows: number;
  materializedBatchRows: number;
  nextRowIndex: number;
  complete: boolean;
  idempotent: boolean;
};

export type CompleteNaverFactSnapshotInput = {
  job: MediaSyncJobRecord;
  reportId: string;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedRows: number;
  dependencies?:
    NaverFactSnapshotLifecycleDependencies;
};

export type CompleteNaverFactSnapshotResult = {
  job: MediaSyncJobRecord;
  reportId: string;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  rowCount: number;
  completionFingerprint: string;
  idempotent: boolean;
};

export type ActivateNaverFactSnapshotInput = {
  job: MediaSyncJobRecord;
  reportId: string;
  previousIngestionId: string | null;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedRows: number;
  dependencies?:
    NaverFactSnapshotLifecycleDependencies;
};

export type ActivateNaverFactSnapshotResult = {
  job: MediaSyncJobRecord;
  reportId: string;
  previousIngestionId: string | null;
  snapshotIngestionId: string;
  currentIngestionId: string;
  publishedIngestionId: string | null;
  projectionStart: string;
  projectionEnd: string;
  rowCount: number;
  completionFingerprint: string;
  idempotent: boolean;
};

export type NaverFactSnapshotFanoutActivationProjection = {
  reportId: string;
  previousIngestionId: string | null;
  snapshotIngestionId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedRows: number;
};

export type ActivateNaverFactSnapshotFanoutInput = {
  job: MediaSyncJobRecord;
  projections:
    NaverFactSnapshotFanoutActivationProjection[];
  dependencies?:
    NaverFactSnapshotLifecycleDependencies;
};

export type ActivateNaverFactSnapshotFanoutResult = {
  job: MediaSyncJobRecord;
  projectionCount: number;
  primaryReportId: string;
  primaryPreviousIngestionId: string | null;
  primarySnapshotIngestionId: string;
  primaryCurrentIngestionId: string;
  primaryPublishedIngestionId: string | null;
  primaryRowCount: number;
  idempotent: boolean;
};

export type FinalizeNaverFactSnapshotJobInput = {
  job: MediaSyncJobRecord;
  projections:
    NaverFactSnapshotProjectionDescriptor[];
  dependencies?:
    NaverFactSnapshotLifecycleDependencies;
};

export type FinalizeNaverFactSnapshotJobResult = {
  job: MediaSyncJobRecord;
  finishedAt: string;
  connectionId: string;
  connectionLastSyncAt: string;
  connectionUpdated: boolean;
  projectionCount: number;
  idempotent: boolean;
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

function requiredString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}

function nullableUuid(
  value: unknown,
  fieldName: string,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const normalized =
    requiredString(
      value,
      fieldName,
    );

  if (!UUID_PATTERN.test(normalized)) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a UUID or null.`,
    );
  }

  return normalized;
}

function requiredUuid(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    requiredString(
      value,
      fieldName,
    );

  if (!UUID_PATTERN.test(normalized)) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a UUID.`,
    );
  }

  return normalized;
}

function requiredDate(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    requiredString(
      value,
      fieldName,
    );

  if (!DATE_PATTERN.test(normalized)) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be YYYY-MM-DD.`,
    );
  }

  const ms =
    Date.parse(
      `${normalized}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(ms) ||
    new Date(ms)
      .toISOString()
      .slice(0, 10) !== normalized
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} is not a valid calendar date.`,
    );
  }

  return normalized;
}

function requiredTimestamp(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    requiredString(
      value,
      fieldName,
    );

  if (
    !Number.isFinite(
      Date.parse(normalized),
    )
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a timestamp.`,
    );
  }

  return normalized;
}

function nonNegativeSafeInteger(
  value: unknown,
  fieldName: string,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return numeric;
}

function requiredBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be boolean.`,
    );
  }

  return value;
}

function validateUuidInput(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value.trim())
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_INPUT",
      `${fieldName} must be a UUID.`,
    );
  }

  return value.trim();
}

function validateNullableUuidInput(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null) {
    return null;
  }

  return validateUuidInput(
    value,
    fieldName,
  );
}

function validateDateInput(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !DATE_PATTERN.test(value.trim())
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_INPUT",
      `${fieldName} must be YYYY-MM-DD.`,
    );
  }

  const normalized =
    value.trim();

  const ms =
    Date.parse(
      `${normalized}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(ms) ||
    new Date(ms)
      .toISOString()
      .slice(0, 10) !== normalized
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_INPUT",
      `${fieldName} is not a valid calendar date.`,
    );
  }

  return normalized;
}

function validateCountInput(
  value: unknown,
  fieldName: string,
  options?: {
    positive?: boolean;
    max?: number;
  },
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (options?.positive &&
      (value as number) <= 0) ||
    (
      options?.max !== undefined &&
      (value as number) > options.max
    )
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_INPUT",
      `${fieldName} is invalid.`,
    );
  }

  return value as number;
}

function validateJob(
  job: MediaSyncJobRecord,
): void {
  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_JOB",
      "A media sync job is required.",
    );
  }

  validateUuidInput(
    job.id,
    "job.id",
  );

  validateUuidInput(
    job.workspace_id,
    "job.workspace_id",
  );

  validateUuidInput(
    job.advertiser_id,
    "job.advertiser_id",
  );

  validateUuidInput(
    job.connection_id,
    "job.connection_id",
  );

  if (
    job.provider !== NAVER_PROVIDER ||
    job.mode !== SNAPSHOT_REPLACE_MODE
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "UNSUPPORTED_JOB",
      "Fact snapshot lifecycle supports only Naver snapshot_replace jobs.",
    );
  }

  if (
    typeof job.external_account_id !==
      "string" ||
    !job.external_account_id.trim()
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_JOB",
      "job.external_account_id is required.",
    );
  }
}

function validateProcessingJob(
  job: MediaSyncJobRecord,
): void {
  validateJob(job);

  if (job.status !== "processing") {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_JOB",
      "The media sync job must be processing.",
    );
  }
}

function parseReturnedJob(
  value: unknown,
  inputJob: MediaSyncJobRecord,
  expectedStatus:
    "processing" | "done",
): MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      "RPC job result is invalid.",
    );
  }

  if (
    value.id !== inputJob.id ||
    value.workspace_id !==
      inputJob.workspace_id ||
    value.advertiser_id !==
      inputJob.advertiser_id ||
    value.connection_id !==
      inputJob.connection_id ||
    value.provider !==
      NAVER_PROVIDER ||
    value.mode !==
      SNAPSHOT_REPLACE_MODE ||
    value.external_account_id !==
      inputJob.external_account_id ||
    value.status !== expectedStatus
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "RPC job result does not match the requested lifecycle authority.",
    );
  }

  return value as
    unknown as MediaSyncJobRecord;
}

function singleRpcRecord(
  data: unknown,
): UnknownRecord {
  const candidate =
    Array.isArray(data)
      ? data.length === 1
        ? data[0]
        : null
      : data;

  if (!isPlainObject(candidate)) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_DATABASE_RESULT",
      "RPC must return exactly one result row.",
    );
  }

  return candidate;
}

async function invoke(
  functionName: string,
  payload: Record<string, unknown>,
  dependencies:
    NaverFactSnapshotLifecycleDependencies |
    undefined,
): Promise<UnknownRecord> {
  let response: RpcResponse;

  if (dependencies?.invokeRpc) {
    response =
      await dependencies.invokeRpc(
        functionName,
        {
          p_payload: payload,
        },
      );
  } else {
    const supabase =
      getSupabaseAdmin();

    response =
      await supabase.rpc(
        functionName,
        {
          p_payload: payload,
        },
      );
  }

  if (response.error) {
    throw new NaverFactSnapshotLifecycleError(
      "DATABASE_ERROR",
      `${functionName} failed.`,
      {
        cause: response.error,
      },
    );
  }

  return singleRpcRecord(
    response.data,
  );
}

function commonPayload(
  job: MediaSyncJobRecord,
  reportId?: string,
): Record<string, unknown> {
  const payload:
    Record<string, unknown> = {
      job_id: job.id,
      workspace_id:
        job.workspace_id,
      advertiser_id:
        job.advertiser_id,
      connection_id:
        job.connection_id,
      external_account_id:
        job.external_account_id,
    };

  if (reportId !== undefined) {
    payload.report_id =
      validateUuidInput(
        reportId,
        "reportId",
      );
  }

  return payload;
}

function assertProjectionEcho(
  record: UnknownRecord,
  input: {
    reportId: string;
    snapshotIngestionId: string;
    projectionStart: string;
    projectionEnd: string;
  },
): void {
  if (
    requiredUuid(
      record.report_id,
      "report_id",
    ) !== input.reportId ||
    requiredUuid(
      record.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    ) !== input.snapshotIngestionId ||
    requiredDate(
      record.projection_start,
      "projection_start",
    ) !== input.projectionStart ||
    requiredDate(
      record.projection_end,
      "projection_end",
    ) !== input.projectionEnd
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "RPC projection result does not match the request.",
    );
  }
}

export async function prepareNaverFactSnapshotMaterialization(
  input: PrepareNaverFactSnapshotInput,
): Promise<PrepareNaverFactSnapshotResult> {
  validateProcessingJob(
    input.job,
  );

  const reportId =
    validateUuidInput(
      input.reportId,
      "reportId",
    );

  const record =
    await invoke(
      PREPARE_RPC,
      commonPayload(
        input.job,
        reportId,
      ),
      input.dependencies,
    );

  const job =
    parseReturnedJob(
      record.job,
      input.job,
      "processing",
    );

  const returnedReportId =
    requiredUuid(
      record.report_id,
      "report_id",
    );

  if (
    returnedReportId !== reportId
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Prepare result report does not match the request.",
    );
  }

  const previousIngestionId =
    nullableUuid(
      record.previous_ingestion_id,
      "previous_ingestion_id",
    );

  const snapshotIngestionId =
    requiredUuid(
      record.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    );

  const projectionStart =
    requiredDate(
      record.projection_start,
      "projection_start",
    );

  const projectionEnd =
    requiredDate(
      record.projection_end,
      "projection_end",
    );

  const expectedRows =
    nonNegativeSafeInteger(
      record.expected_rows,
      "expected_rows",
    );

  const nextRowIndex =
    nonNegativeSafeInteger(
      record.next_row_index,
      "next_row_index",
    );

  if (
    nextRowIndex > expectedRows
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Prepare checkpoint exceeds expected rows.",
    );
  }

  return {
    job,
    reportId,
    previousIngestionId,
    snapshotIngestionId,
    projectionStart,
    projectionEnd,
    expectedRows,
    nextRowIndex,
    idempotent:
      requiredBoolean(
        record.idempotent,
        "idempotent",
      ),
  };
}

export async function materializeNaverFactSnapshotBatch(
  input: MaterializeNaverFactSnapshotBatchInput,
): Promise<MaterializeNaverFactSnapshotBatchResult> {
  validateProcessingJob(
    input.job,
  );

  const reportId =
    validateUuidInput(
      input.reportId,
      "reportId",
    );

  const snapshotIngestionId =
    validateUuidInput(
      input.snapshotIngestionId,
      "snapshotIngestionId",
    );

  const projectionStart =
    validateDateInput(
      input.projectionStart,
      "projectionStart",
    );

  const projectionEnd =
    validateDateInput(
      input.projectionEnd,
      "projectionEnd",
    );

  const expectedRows =
    validateCountInput(
      input.expectedRows,
      "expectedRows",
      {
        positive: true,
        max: 2_147_483_647,
      },
    );

  const batchStart =
    validateCountInput(
      input.batchStart,
      "batchStart",
    );

  const batchSize =
    validateCountInput(
      input.batchSize,
      "batchSize",
      {
        positive: true,
        max: 5_000,
      },
    );

  if (batchStart >= expectedRows) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_INPUT",
      "batchStart must be less than expectedRows.",
    );
  }

  const record =
    await invoke(
      BATCH_RPC,
      {
        ...commonPayload(
          input.job,
          reportId,
        ),
        snapshot_ingestion_id:
          snapshotIngestionId,
        projection_start:
          projectionStart,
        projection_end:
          projectionEnd,
        expected_rows:
          expectedRows,
        batch_start:
          batchStart,
        batch_size:
          batchSize,
      },
      input.dependencies,
    );

  const job =
    parseReturnedJob(
      record.job,
      input.job,
      "processing",
    );

  assertProjectionEcho(
    record,
    {
      reportId,
      snapshotIngestionId,
      projectionStart,
      projectionEnd,
    },
  );

  const returnedExpectedRows =
    nonNegativeSafeInteger(
      record.expected_rows,
      "expected_rows",
    );

  const returnedBatchStart =
    nonNegativeSafeInteger(
      record.batch_start,
      "batch_start",
    );

  const batchEndExclusive =
    nonNegativeSafeInteger(
      record.batch_end_exclusive,
      "batch_end_exclusive",
    );

  const expectedBatchRows =
    nonNegativeSafeInteger(
      record.expected_batch_rows,
      "expected_batch_rows",
    );

  const insertedRows =
    nonNegativeSafeInteger(
      record.inserted_rows,
      "inserted_rows",
    );

  const materializedBatchRows =
    nonNegativeSafeInteger(
      record.materialized_batch_rows,
      "materialized_batch_rows",
    );

  const nextRowIndex =
    nonNegativeSafeInteger(
      record.next_row_index,
      "next_row_index",
    );

  const complete =
    requiredBoolean(
      record.complete,
      "complete",
    );

  const idempotent =
    requiredBoolean(
      record.idempotent,
      "idempotent",
    );

  if (
    returnedExpectedRows !==
      expectedRows ||
    returnedBatchStart !==
      batchStart ||
    batchEndExclusive <=
      batchStart ||
    batchEndExclusive >
      expectedRows ||
    expectedBatchRows !==
      batchEndExclusive -
        batchStart ||
    materializedBatchRows !==
      expectedBatchRows ||
    insertedRows >
      expectedBatchRows ||
    nextRowIndex >
      expectedRows ||
    complete !==
      (
        nextRowIndex >=
        expectedRows
      )
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Batch result violates the materialization contract.",
    );
  }

  return {
    job,
    reportId,
    snapshotIngestionId,
    projectionStart,
    projectionEnd,
    expectedRows,
    batchStart,
    batchEndExclusive,
    expectedBatchRows,
    insertedRows,
    materializedBatchRows,
    nextRowIndex,
    complete,
    idempotent,
  };
}

export async function completeNaverFactSnapshotMaterialization(
  input: CompleteNaverFactSnapshotInput,
): Promise<CompleteNaverFactSnapshotResult> {
  validateProcessingJob(
    input.job,
  );

  const reportId =
    validateUuidInput(
      input.reportId,
      "reportId",
    );

  const snapshotIngestionId =
    validateUuidInput(
      input.snapshotIngestionId,
      "snapshotIngestionId",
    );

  const projectionStart =
    validateDateInput(
      input.projectionStart,
      "projectionStart",
    );

  const projectionEnd =
    validateDateInput(
      input.projectionEnd,
      "projectionEnd",
    );

  const expectedRows =
    validateCountInput(
      input.expectedRows,
      "expectedRows",
      {
        max: 2_147_483_647,
      },
    );

  const record =
    await invoke(
      COMPLETE_RPC,
      {
        ...commonPayload(
          input.job,
          reportId,
        ),
        snapshot_ingestion_id:
          snapshotIngestionId,
        projection_start:
          projectionStart,
        projection_end:
          projectionEnd,
        expected_rows:
          expectedRows,
      },
      input.dependencies,
    );

  const job =
    parseReturnedJob(
      record.job,
      input.job,
      "processing",
    );

  assertProjectionEcho(
    record,
    {
      reportId,
      snapshotIngestionId,
      projectionStart,
      projectionEnd,
    },
  );

  const rowCount =
    nonNegativeSafeInteger(
      record.row_count,
      "row_count",
    );

  if (rowCount !== expectedRows) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Completed snapshot row count does not match expected rows.",
    );
  }

  return {
    job,
    reportId,
    snapshotIngestionId,
    projectionStart,
    projectionEnd,
    rowCount,
    completionFingerprint:
      requiredString(
        record.completion_fingerprint,
        "completion_fingerprint",
      ),
    idempotent:
      requiredBoolean(
        record.idempotent,
        "idempotent",
      ),
  };
}

export async function activateNaverFactSnapshot(
  input: ActivateNaverFactSnapshotInput,
): Promise<ActivateNaverFactSnapshotResult> {
  validateProcessingJob(
    input.job,
  );

  const reportId =
    validateUuidInput(
      input.reportId,
      "reportId",
    );

  const previousIngestionId =
    validateNullableUuidInput(
      input.previousIngestionId,
      "previousIngestionId",
    );

  const snapshotIngestionId =
    validateUuidInput(
      input.snapshotIngestionId,
      "snapshotIngestionId",
    );

  const projectionStart =
    validateDateInput(
      input.projectionStart,
      "projectionStart",
    );

  const projectionEnd =
    validateDateInput(
      input.projectionEnd,
      "projectionEnd",
    );

  const expectedRows =
    validateCountInput(
      input.expectedRows,
      "expectedRows",
      {
        max: 2_147_483_647,
      },
    );

  const record =
    await invoke(
      ACTIVATE_RPC,
      {
        ...commonPayload(
          input.job,
          reportId,
        ),
        previous_ingestion_id:
          previousIngestionId,
        snapshot_ingestion_id:
          snapshotIngestionId,
        projection_start:
          projectionStart,
        projection_end:
          projectionEnd,
        expected_rows:
          expectedRows,
      },
      input.dependencies,
    );

  const job =
    parseReturnedJob(
      record.job,
      input.job,
      "processing",
    );

  assertProjectionEcho(
    record,
    {
      reportId,
      snapshotIngestionId,
      projectionStart,
      projectionEnd,
    },
  );

  const returnedPreviousIngestionId =
    nullableUuid(
      record.previous_ingestion_id,
      "previous_ingestion_id",
    );

  const currentIngestionId =
    requiredUuid(
      record.current_ingestion_id,
      "current_ingestion_id",
    );

  const publishedIngestionId =
    nullableUuid(
      record.published_ingestion_id,
      "published_ingestion_id",
    );

  const rowCount =
    nonNegativeSafeInteger(
      record.row_count,
      "row_count",
    );

  if (
    returnedPreviousIngestionId !==
      previousIngestionId ||
    currentIngestionId !==
      snapshotIngestionId ||
    rowCount !== expectedRows
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Activation result violates the projection pointer contract.",
    );
  }

  return {
    job,
    reportId,
    previousIngestionId,
    snapshotIngestionId,
    currentIngestionId,
    publishedIngestionId,
    projectionStart,
    projectionEnd,
    rowCount,
    completionFingerprint:
      requiredString(
        record.completion_fingerprint,
        "completion_fingerprint",
      ),
    idempotent:
      requiredBoolean(
        record.idempotent,
        "idempotent",
      ),
  };
}

export async function activateNaverFactSnapshotFanout(
  input: ActivateNaverFactSnapshotFanoutInput,
): Promise<ActivateNaverFactSnapshotFanoutResult> {
  validateProcessingJob(
    input.job,
  );

  if (
    !Array.isArray(
      input.projections,
    ) ||
    input.projections.length === 0
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_INPUT",
      "At least one fanout projection is required.",
    );
  }

  const seenReportIds =
    new Set<string>();

  const projections =
    input.projections.map(
      (projection, index) => {
        const reportId =
          validateUuidInput(
            projection.reportId,
            `projections[${index}].reportId`,
          );

        if (
          seenReportIds.has(
            reportId,
          )
        ) {
          throw new NaverFactSnapshotLifecycleError(
            "INVALID_INPUT",
            "Fanout projection report IDs must be unique.",
          );
        }

        seenReportIds.add(
          reportId,
        );

        const previousIngestionId =
          validateNullableUuidInput(
            projection.previousIngestionId,
            `projections[${index}].previousIngestionId`,
          );

        const snapshotIngestionId =
          validateUuidInput(
            projection.snapshotIngestionId,
            `projections[${index}].snapshotIngestionId`,
          );

        const projectionStart =
          validateDateInput(
            projection.projectionStart,
            `projections[${index}].projectionStart`,
          );

        const projectionEnd =
          validateDateInput(
            projection.projectionEnd,
            `projections[${index}].projectionEnd`,
          );

        if (
          Date.parse(
            `${projectionEnd}T00:00:00.000Z`,
          ) <
          Date.parse(
            `${projectionStart}T00:00:00.000Z`,
          )
        ) {
          throw new NaverFactSnapshotLifecycleError(
            "INVALID_INPUT",
            "Fanout projection end precedes its start.",
          );
        }

        return {
          report_id:
            reportId,
          previous_ingestion_id:
            previousIngestionId,
          snapshot_ingestion_id:
            snapshotIngestionId,
          projection_start:
            projectionStart,
          projection_end:
            projectionEnd,
          expected_rows:
            validateCountInput(
              projection.expectedRows,
              `projections[${index}].expectedRows`,
              {
                max:
                  2_147_483_647,
              },
            ),
        };
      },
    );

  const record =
    await invoke(
      FANOUT_ACTIVATE_RPC,
      {
        ...commonPayload(
          input.job,
        ),
        projections,
      },
      input.dependencies,
    );

  const job =
    parseReturnedJob(
      record.job,
      input.job,
      "processing",
    );

  const projectionCount =
    nonNegativeSafeInteger(
      record.projection_count,
      "projection_count",
    );

  const primaryReportId =
    requiredUuid(
      record.primary_report_id,
      "primary_report_id",
    );

  const primaryPreviousIngestionId =
    nullableUuid(
      record.primary_previous_ingestion_id,
      "primary_previous_ingestion_id",
    );

  const primarySnapshotIngestionId =
    requiredUuid(
      record.primary_snapshot_ingestion_id,
      "primary_snapshot_ingestion_id",
    );

  const primaryCurrentIngestionId =
    requiredUuid(
      record.primary_current_ingestion_id,
      "primary_current_ingestion_id",
    );

  const primaryPublishedIngestionId =
    nullableUuid(
      record.primary_published_ingestion_id,
      "primary_published_ingestion_id",
    );

  const primaryRowCount =
    nonNegativeSafeInteger(
      record.primary_row_count,
      "primary_row_count",
    );

  const primaryInput =
    input.projections.find(
      (projection) =>
        projection.reportId ===
        input.job.report_id,
    );

  if (!primaryInput) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Primary job report is missing from fanout activation input.",
    );
  }

  if (
    projectionCount !==
      projections.length ||
    primaryReportId !==
      input.job.report_id ||
    primaryPreviousIngestionId !==
      primaryInput.previousIngestionId ||
    primarySnapshotIngestionId !==
      primaryInput.snapshotIngestionId ||
    primaryCurrentIngestionId !==
      primarySnapshotIngestionId ||
    primaryRowCount !==
      primaryInput.expectedRows
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Atomic fanout activation result violates projection authority.",
    );
  }

  return {
    job,
    projectionCount,
    primaryReportId,
    primaryPreviousIngestionId,
    primarySnapshotIngestionId,
    primaryCurrentIngestionId,
    primaryPublishedIngestionId,
    primaryRowCount,
    idempotent:
      requiredBoolean(
        record.idempotent,
        "idempotent",
      ),
  };
}

export async function finalizeNaverFactSnapshotJob(
  input: FinalizeNaverFactSnapshotJobInput,
): Promise<FinalizeNaverFactSnapshotJobResult> {
  validateJob(
    input.job,
  );

  if (
    input.job.status !== "processing" &&
    input.job.status !== "done"
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_JOB",
      "Fact snapshot finalization requires a processing or done job.",
    );
  }

  if (
    !Array.isArray(
      input.projections,
    ) ||
    input.projections.length === 0
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "INVALID_INPUT",
      "At least one projection is required.",
    );
  }

  const seenReportIds =
    new Set<string>();

  const projections =
    input.projections.map(
      (projection, index) => {
        const reportId =
          validateUuidInput(
            projection.reportId,
            `projections[${index}].reportId`,
          );

        if (
          seenReportIds.has(
            reportId,
          )
        ) {
          throw new NaverFactSnapshotLifecycleError(
            "INVALID_INPUT",
            "Projection report IDs must be unique.",
          );
        }

        seenReportIds.add(
          reportId,
        );

        return {
          report_id:
            reportId,
          snapshot_ingestion_id:
            validateUuidInput(
              projection.snapshotIngestionId,
              `projections[${index}].snapshotIngestionId`,
            ),
          projection_start:
            validateDateInput(
              projection.projectionStart,
              `projections[${index}].projectionStart`,
            ),
          projection_end:
            validateDateInput(
              projection.projectionEnd,
              `projections[${index}].projectionEnd`,
            ),
          expected_rows:
            validateCountInput(
              projection.expectedRows,
              `projections[${index}].expectedRows`,
              {
                max:
                  2_147_483_647,
              },
            ),
        };
      },
    );

  const record =
    await invoke(
      FINALIZE_RPC,
      {
        ...commonPayload(
          input.job,
        ),
        projections,
      },
      input.dependencies,
    );

  const job =
    parseReturnedJob(
      record.job,
      input.job,
      "done",
    );

  const finishedAt =
    requiredTimestamp(
      record.finished_at,
      "finished_at",
    );

  const connectionId =
    requiredUuid(
      record.connection_id,
      "connection_id",
    );

  const connectionLastSyncAt =
    requiredTimestamp(
      record.connection_last_sync_at,
      "connection_last_sync_at",
    );

  const projectionCount =
    nonNegativeSafeInteger(
      record.projection_count,
      "projection_count",
    );

  if (
    connectionId !==
      input.job.connection_id ||
    projectionCount !==
      projections.length
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Finalization result violates connection or projection authority.",
    );
  }

  if (
    job.progress !== 100 ||
    !job.finished_at ||
    job.error !== null
  ) {
    throw new NaverFactSnapshotLifecycleError(
      "RESULT_CONFLICT",
      "Finalized media sync job state is invalid.",
    );
  }

  return {
    job,
    finishedAt,
    connectionId,
    connectionLastSyncAt,
    connectionUpdated:
      requiredBoolean(
        record.connection_updated,
        "connection_updated",
      ),
    projectionCount,
    idempotent:
      requiredBoolean(
        record.idempotent,
        "idempotent",
      ),
  };
}

