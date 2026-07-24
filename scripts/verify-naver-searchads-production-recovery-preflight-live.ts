import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { parseMediaSyncJobRecord } from "../src/lib/media-sync/media-sync-jobs-repository";
import { buildMediaSyncStagingRowKey } from "../src/lib/media-sync/media-sync-staging-row-identity";
import {
  isValidMediaSyncDateRange,
  type EtrylueNormalizedMediaRow,
  type MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const MEDIA_SYNC_JOBS_TABLE = "media_sync_jobs";
const MEDIA_SYNC_STAGING_ROWS_TABLE = "media_sync_staging_rows";
const REPORTS_TABLE = "reports";
const REPORT_ROWS_TABLE = "report_rows";

const NAVER_PROVIDER = "naver_searchad" as const;
const FAILED_STATUS = "failed" as const;
const EXPECTED_JOB_ERROR = "DATABASE_ERROR";
const EXPECTED_ORCHESTRATION_ERROR_NAME =
  "MediaSyncWorkerOrchestrationError";
const EXPECTED_ORCHESTRATION_ERROR_CODE = "STAGING_FAILED";
const EXPECTED_SUMMARY_ERROR_NAME = "MediaSyncStagingSummaryError";
const EXPECTED_SUMMARY_ERROR_CODE = "DATABASE_ERROR";
const EXPECTED_TIMEOUT_CODE = "57014";

const EXPECTED_DATE_FROM = "2026-05-01";
const EXPECTED_DATE_TO = "2026-05-02";
const EXPECTED_JOB_ROWS = 44_500;
const EXPECTED_STAGING_ROWS = 44_514;
const EXPECTED_RECOVERY_DELTA = 14;
const EXPECTED_DATES = 2;
const EXPECTED_DATES_PER_KEYWORD = 2;
const EXPECTED_KEYWORD_ENTITIES =
  EXPECTED_STAGING_ROWS / EXPECTED_DATES_PER_KEYWORD;
const EXPECTED_TAIL_KEYWORD_ENTITIES =
  EXPECTED_RECOVERY_DELTA / EXPECTED_DATES_PER_KEYWORD;
const EXPECTED_DATE_WINDOW_INDEX = 0;
const PAGE_SIZE = 1_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

const KEYWORD_ROW_LEVEL_REASON =
  "naver_searchad_registered_keyword_daily_stats";

type UnknownRecord = Record<string, unknown>;

type ReportRowsSnapshot = {
  count: number;
  digest: string | null;
};

type ReportState = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
  totalReportRowsCount: number;
  currentReportRowsCount: number;
  currentReportRowsDigest: string | null;
  publishedReportRowsCount: number;
  publishedReportRowsDigest: string | null;
};

type JobInvariantSnapshot = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  reportId: string;
  connectionId: string;
  provider: string;
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
  dataLevel: string;
  mode: string;
  status: string;
  progress: number;
  rawRows: number;
  normalizedRows: number;
  insertedRows: number;
  failedRows: number;
  previousIngestionId: string | null;
  snapshotIngestionId: string | null;
  attemptCount: number;
  error: string | null;
  errorDetail: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MetricTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

type GrainCounts = {
  keyword: number;
  creative: number;
  mixed: number;
};

type StoredStagingRow = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;
  provider: string;
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
  rowIndex: number;
  dateWindowIndex: number;
  date: string;
  channel: string;
  device: string;
  source: string;
  rowKey: string;
  rowFingerprint: string;
  row: EtrylueNormalizedMediaRow;
};

type KeywordEntityState = {
  rowCount: number;
  dates: Set<string>;
  minRowIndex: number;
  maxRowIndex: number;
};

type KeywordTailDiagnostic = {
  rowIndex: number;
  date: string;
  rowLevel: "keyword";
  rowLevelReason: string;
  campaign: {
    id: string;
    name: string;
  };
  group: {
    id: string;
    name: string;
  };
  keyword: {
    id: string;
    name: string;
  };
  metrics: MetricTotals;
};

type StagingInspection = {
  totalRows: number;
  minRowIndex: number | null;
  maxRowIndex: number | null;
  distinctRowIndexes: number;
  duplicateRowIndexes: number;
  missingRowIndexes: number;
  duplicateRowKeys: number;
  rowKeyMismatchRows: number;
  invalidFingerprintRows: number;
  scopeMismatchRows: number;
  canonicalMismatchRows: number;
  dateOutOfRangeRows: number;
  dateWindowMismatchRows: number;
  grainCounts: GrainCounts;
  distinctDates: number;
  distinctKeywordEntities: number;
  keywordEntityCoverageMismatchCount: number;
  tailRows: number;
  tailKeywordRows: number;
  tailDistinctDates: number;
  tailDistinctKeywordEntities: number;
  tailKeywordEntityCoverageMismatchCount: number;
  metricTotals: MetricTotals;
  tailMetricTotals: MetricTotals;
  identityDigest: string;
  tailDiagnostics: KeywordTailDiagnostic[];
};

type StagingIdentitySnapshot = {
  totalRows: number;
  minRowIndex: number | null;
  maxRowIndex: number | null;
  identityDigest: string;
};

type FailureContract = {
  orchestrationName: string;
  orchestrationCode: string;
  orchestrationStage: string;
  summaryName: string;
  summaryCode: string;
  timeoutCode: string;
  timeoutMessage: string;
  processingCheckpointAbsent: boolean;
};

class ProductionRecoveryPreflightError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProductionRecoveryPreflightError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new ProductionRecoveryPreflightError(code, message);
}

function must(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) {
    fail(code, message);
  }
}

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

  const prototype = Object.getPrototypeOf(value);
  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function requiredString(
  value: unknown,
  fieldName: string,
  maxLength = 5_000,
): string {
  if (typeof value !== "string") {
    fail(
      "PREFLIGHT_INVALID_STRING",
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    fail(
      "PREFLIGHT_BLANK_STRING",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalized.length > maxLength) {
    fail(
      "PREFLIGHT_STRING_TOO_LONG",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalized;
}

function stringAllowBlank(
  value: unknown,
  fieldName: string,
  maxLength = 5_000,
): string {
  if (typeof value !== "string") {
    fail(
      "PREFLIGHT_INVALID_STRING",
      `${fieldName} must be a string.`,
    );
  }

  if (value.length > maxLength) {
    fail(
      "PREFLIGHT_STRING_TOO_LONG",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return value;
}

function nullableString(
  value: unknown,
  fieldName: string,
): string | null {
  return value === null || value === undefined
    ? null
    : requiredString(value, fieldName);
}

function optionalTrimmedString(
  value: unknown,
): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function nonNegativeInteger(
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
    fail(
      "PREFLIGHT_INVALID_INTEGER",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return numberValue;
}

function finiteMetric(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    fail(
      "PREFLIGHT_INVALID_METRIC",
      `${fieldName} must be a finite number.`,
    );
  }

  return value;
}

function canonicalRow(
  value: unknown,
  rowIndex: number,
): EtrylueNormalizedMediaRow {
  if (!isPlainObject(value)) {
    fail(
      "PREFLIGHT_INVALID_CANONICAL_ROW",
      `staging row ${rowIndex} does not contain a canonical row object.`,
    );
  }

  return value as EtrylueNormalizedMediaRow;
}

function storedStagingRow(
  value: unknown,
): StoredStagingRow {
  if (!isPlainObject(value)) {
    fail(
      "PREFLIGHT_INVALID_STAGING_RECORD",
      "A staging database record is invalid.",
    );
  }

  const rowIndex = nonNegativeInteger(
    value.row_index,
    "staging.row_index",
  );

  return {
    reportId: requiredString(
      value.report_id,
      `staging[${rowIndex}].report_id`,
    ),
    workspaceId: requiredString(
      value.workspace_id,
      `staging[${rowIndex}].workspace_id`,
    ),
    advertiserId: requiredString(
      value.advertiser_id,
      `staging[${rowIndex}].advertiser_id`,
    ),
    connectionId: requiredString(
      value.connection_id,
      `staging[${rowIndex}].connection_id`,
    ),
    provider: requiredString(
      value.provider,
      `staging[${rowIndex}].provider`,
      100,
    ),
    externalAccountId: requiredString(
      value.external_account_id,
      `staging[${rowIndex}].external_account_id`,
      500,
    ),
    dateFrom: requiredString(
      value.date_from,
      `staging[${rowIndex}].date_from`,
      10,
    ),
    dateTo: requiredString(
      value.date_to,
      `staging[${rowIndex}].date_to`,
      10,
    ),
    rowIndex,
    dateWindowIndex: nonNegativeInteger(
      value.date_window_index,
      `staging[${rowIndex}].date_window_index`,
    ),
    date: requiredString(
      value.date,
      `staging[${rowIndex}].date`,
      10,
    ),
    channel: requiredString(
      value.channel,
      `staging[${rowIndex}].channel`,
      500,
    ),
    device: stringAllowBlank(
      value.device,
      `staging[${rowIndex}].device`,
      500,
    ),
    source: requiredString(
      value.source,
      `staging[${rowIndex}].source`,
      500,
    ),
    rowKey: requiredString(
      value.row_key,
      `staging[${rowIndex}].row_key`,
    ),
    rowFingerprint: requiredString(
      value.row_fingerprint,
      `staging[${rowIndex}].row_fingerprint`,
      64,
    ),
    row: canonicalRow(value.row, rowIndex),
  };
}

function readTargetJobId(): string {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    fail(
      "PREFLIGHT_EXACT_JOB_ID_ARGUMENT_REQUIRED",
      "Exactly one explicit media sync job ID argument is required.",
    );
  }

  const jobId = requiredString(args[0], "jobId", 36);

  if (!UUID_PATTERN.test(jobId)) {
    fail(
      "PREFLIGHT_INVALID_JOB_ID_UUID",
      "jobId must be a valid UUID.",
    );
  }

  return jobId;
}

function stableJson(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as UnknownRecord;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}

function emptyMetrics(): MetricTotals {
  return {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
  };
}

function addMetrics(
  totals: MetricTotals,
  row: EtrylueNormalizedMediaRow,
  rowIndex: number,
): void {
  totals.impressions += finiteMetric(
    row.impressions,
    `staging[${rowIndex}].row.impressions`,
  );
  totals.clicks += finiteMetric(
    row.clicks,
    `staging[${rowIndex}].row.clicks`,
  );
  totals.cost += finiteMetric(
    row.cost,
    `staging[${rowIndex}].row.cost`,
  );
  totals.conversions += finiteMetric(
    row.conversions,
    `staging[${rowIndex}].row.conversions`,
  );
  totals.revenue += finiteMetric(
    row.revenue,
    `staging[${rowIndex}].row.revenue`,
  );

  must(
    Object.values(totals).every(Number.isFinite),
    "PREFLIGHT_METRIC_TOTAL_OVERFLOW",
    "A staging metric total is not finite.",
  );
}

function displayString(
  value: unknown,
  fallback: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return fallback;
  }

  return value.trim().slice(0, 300);
}

function keywordTailDiagnostic(
  stored: StoredStagingRow,
): KeywordTailDiagnostic {
  const row = stored.row;

  return {
    rowIndex: stored.rowIndex,
    date: stored.date,
    rowLevel: "keyword",
    rowLevelReason: displayString(
      row.row_level_reason,
      "unknown",
    ),
    campaign: {
      id: displayString(
        row.external_campaign_id,
        "unknown",
      ),
      name: displayString(
        row.campaign,
        "unknown",
      ),
    },
    group: {
      id: displayString(
        row.external_group_id,
        "unknown",
      ),
      name: displayString(
        row.group,
        "unknown",
      ),
    },
    keyword: {
      id: displayString(
        row.external_keyword_id,
        "unknown",
      ),
      name: displayString(
        row.keyword,
        "unknown",
      ),
    },
    metrics: {
      impressions: finiteMetric(
        row.impressions,
        `staging[${stored.rowIndex}].row.impressions`,
      ),
      clicks: finiteMetric(
        row.clicks,
        `staging[${stored.rowIndex}].row.clicks`,
      ),
      cost: finiteMetric(
        row.cost,
        `staging[${stored.rowIndex}].row.cost`,
      ),
      conversions: finiteMetric(
        row.conversions,
        `staging[${stored.rowIndex}].row.conversions`,
      ),
      revenue: finiteMetric(
        row.revenue,
        `staging[${stored.rowIndex}].row.revenue`,
      ),
    },
  };
}

function readNestedCauses(
  errorDetail: UnknownRecord,
): UnknownRecord[] {
  const value = errorDetail.nested_causes;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPlainObject);
}

function validateFailureContract(
  job: MediaSyncJobRecord,
): FailureContract {
  must(
    job.error === EXPECTED_JOB_ERROR,
    "PREFLIGHT_JOB_ERROR_MISMATCH",
    `job.error must remain ${EXPECTED_JOB_ERROR}.`,
  );

  must(
    isPlainObject(job.error_detail),
    "PREFLIGHT_ERROR_DETAIL_MISSING",
    "The failed job must contain a structured error_detail object.",
  );

  const detail = job.error_detail;
  const orchestrationName = requiredString(
    detail.name,
    "job.error_detail.name",
  );
  const orchestrationCode = requiredString(
    detail.code,
    "job.error_detail.code",
  );
  const orchestrationStage = requiredString(
    detail.stage,
    "job.error_detail.stage",
  );
  const summaryName = requiredString(
    detail.cause_name,
    "job.error_detail.cause_name",
  );
  const summaryCode = requiredString(
    detail.cause_code,
    "job.error_detail.cause_code",
  );

  must(
    orchestrationName === EXPECTED_ORCHESTRATION_ERROR_NAME,
    "PREFLIGHT_ORCHESTRATION_ERROR_NAME_MISMATCH",
    "The orchestration error name is not the expected staging failure.",
  );
  must(
    orchestrationCode === EXPECTED_ORCHESTRATION_ERROR_CODE,
    "PREFLIGHT_ORCHESTRATION_ERROR_CODE_MISMATCH",
    "The orchestration error code is not STAGING_FAILED.",
  );
  must(
    orchestrationStage === EXPECTED_ORCHESTRATION_ERROR_CODE,
    "PREFLIGHT_ORCHESTRATION_ERROR_STAGE_MISMATCH",
    "The orchestration error stage is not STAGING_FAILED.",
  );
  must(
    summaryName === EXPECTED_SUMMARY_ERROR_NAME,
    "PREFLIGHT_SUMMARY_ERROR_NAME_MISMATCH",
    "The nested repository error is not MediaSyncStagingSummaryError.",
  );
  must(
    summaryCode === EXPECTED_SUMMARY_ERROR_CODE,
    "PREFLIGHT_SUMMARY_ERROR_CODE_MISMATCH",
    "The nested staging summary error is not DATABASE_ERROR.",
  );

  const nestedCauses = readNestedCauses(detail);
  const timeoutCause = nestedCauses.find(
    (cause) =>
      cause.code === EXPECTED_TIMEOUT_CODE &&
      typeof cause.message === "string" &&
      cause.message.toLowerCase().includes(
        "statement timeout",
      ),
  );

  must(
    timeoutCause !== undefined,
    "PREFLIGHT_STATEMENT_TIMEOUT_CAUSE_MISSING",
    "The nested 57014 statement-timeout cause was not found.",
  );

  const processingCheckpointAbsent =
    detail.processing_checkpoint === null ||
    detail.processing_checkpoint === undefined;

  must(
    processingCheckpointAbsent,
    "PREFLIGHT_UNEXPECTED_PROCESSING_CHECKPOINT",
    "The failed job unexpectedly still contains a processing checkpoint.",
  );

  return {
    orchestrationName,
    orchestrationCode,
    orchestrationStage,
    summaryName,
    summaryCode,
    timeoutCode: EXPECTED_TIMEOUT_CODE,
    timeoutMessage: requiredString(
      timeoutCause.message,
      "timeoutCause.message",
    ),
    processingCheckpointAbsent,
  };
}

async function readJob(
  jobId: string,
): Promise<MediaSyncJobRecord> {
  const { data, error } = await getSupabaseAdmin()
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    fail(
      "PREFLIGHT_JOB_READ_FAILED",
      "The target media sync job could not be read.",
    );
  }

  if (!data) {
    fail(
      "PREFLIGHT_JOB_NOT_FOUND",
      "The target media sync job was not found.",
    );
  }

  return parseMediaSyncJobRecord(data);
}

function jobSnapshot(
  job: MediaSyncJobRecord,
): JobInvariantSnapshot {
  return {
    id: job.id,
    workspaceId: job.workspace_id,
    advertiserId: job.advertiser_id,
    reportId: job.report_id,
    connectionId: job.connection_id,
    provider: job.provider,
    externalAccountId: job.external_account_id,
    dateFrom: job.date_from,
    dateTo: job.date_to,
    dataLevel: job.data_level,
    mode: job.mode,
    status: job.status,
    progress: job.progress,
    rawRows: job.raw_rows,
    normalizedRows: job.normalized_rows,
    insertedRows: job.inserted_rows,
    failedRows: job.failed_rows,
    previousIngestionId: job.previous_ingestion_id,
    snapshotIngestionId: job.snapshot_ingestion_id,
    attemptCount: job.attempt_count,
    error: job.error,
    errorDetail: job.error_detail,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

function validateInitialJob(
  job: MediaSyncJobRecord,
): void {
  must(
    job.provider === NAVER_PROVIDER,
    "PREFLIGHT_UNSUPPORTED_PROVIDER",
    "The target job provider must be naver_searchad.",
  );
  must(
    job.status === FAILED_STATUS,
    "PREFLIGHT_JOB_NOT_FAILED",
    "The target recovery job must remain failed.",
  );
  must(
    isValidMediaSyncDateRange(
      job.date_from,
      job.date_to,
    ),
    "PREFLIGHT_INVALID_JOB_DATE_RANGE",
    "The target job date range is invalid.",
  );
  must(
    job.date_from === EXPECTED_DATE_FROM &&
      job.date_to === EXPECTED_DATE_TO,
    "PREFLIGHT_UNEXPECTED_JOB_DATE_RANGE",
    `The recovery job must remain ${EXPECTED_DATE_FROM} through ${EXPECTED_DATE_TO}.`,
  );
  must(
    job.raw_rows === EXPECTED_JOB_ROWS,
    "PREFLIGHT_RAW_ROWS_MISMATCH",
    `job.raw_rows must remain ${EXPECTED_JOB_ROWS}.`,
  );
  must(
    job.normalized_rows === EXPECTED_JOB_ROWS,
    "PREFLIGHT_NORMALIZED_ROWS_MISMATCH",
    `job.normalized_rows must remain ${EXPECTED_JOB_ROWS}.`,
  );
  must(
    job.inserted_rows === EXPECTED_JOB_ROWS,
    "PREFLIGHT_INSERTED_ROWS_MISMATCH",
    `job.inserted_rows must remain ${EXPECTED_JOB_ROWS}.`,
  );
  must(
    job.failed_rows === 0,
    "PREFLIGHT_FAILED_ROWS_NONZERO",
    "job.failed_rows must remain zero.",
  );
  must(
    job.snapshot_ingestion_id === null,
    "PREFLIGHT_SNAPSHOT_ALREADY_EXISTS",
    "job.snapshot_ingestion_id must remain null.",
  );
  must(
    job.finished_at !== null,
    "PREFLIGHT_FAILED_JOB_NOT_FINISHED",
    "The failed recovery job must have finished_at.",
  );
  must(
    job.attempt_count >= 1,
    "PREFLIGHT_INVALID_ATTEMPT_COUNT",
    "The failed job must have a valid prior attempt count.",
  );
}

async function countReportRows(
  reportId: string,
): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(REPORT_ROWS_TABLE)
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("report_id", reportId);

  if (error) {
    fail(
      "PREFLIGHT_REPORT_ROWS_COUNT_FAILED",
      "report_rows could not be counted.",
    );
  }

  return count ?? 0;
}

async function readReportRowsSnapshot(
  reportId: string,
  ingestionId: string | null,
): Promise<ReportRowsSnapshot> {
  if (!ingestionId) {
    return {
      count: 0,
      digest: null,
    };
  }

  const supabase = getSupabaseAdmin();
  const hash = createHash("sha256");
  let count = 0;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(REPORT_ROWS_TABLE)
      .select(
        "id, ingestion_id, row_index, date, channel, device, source, row",
      )
      .eq("report_id", reportId)
      .eq("ingestion_id", ingestionId)
      .order("row_index", {
        ascending: true,
      })
      .order("id", {
        ascending: true,
      })
      .range(
        offset,
        offset + PAGE_SIZE - 1,
      );

    if (error) {
      fail(
        "PREFLIGHT_REPORT_ROWS_READ_FAILED",
        "report_rows snapshot could not be read.",
      );
    }

    if (!Array.isArray(data)) {
      fail(
        "PREFLIGHT_INVALID_REPORT_ROWS_RESULT",
        "report_rows snapshot result is invalid.",
      );
    }

    for (const row of data) {
      if (!isPlainObject(row)) {
        fail(
          "PREFLIGHT_INVALID_REPORT_ROW",
          "A report_rows record is invalid.",
        );
      }

      hash.update(
        `${stableJson({
          id: row.id,
          ingestionId: row.ingestion_id,
          rowIndex: row.row_index,
          date: row.date,
          channel: row.channel,
          device: row.device,
          source: row.source,
          row: row.row,
        })}\n`,
      );

      count += 1;
    }

    offset += data.length;

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return {
    count,
    digest: hash.digest("hex"),
  };
}

async function readReportState(
  job: MediaSyncJobRecord,
): Promise<ReportState> {
  const { data, error } = await getSupabaseAdmin()
    .from(REPORTS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, current_ingestion_id, published_ingestion_id",
    )
    .eq("id", job.report_id)
    .maybeSingle();

  if (error) {
    fail(
      "PREFLIGHT_REPORT_READ_FAILED",
      "The target report could not be read.",
    );
  }

  if (!data) {
    fail(
      "PREFLIGHT_REPORT_NOT_FOUND",
      "The target report was not found.",
    );
  }

  const reportId = requiredString(
    data.id,
    "report.id",
  );
  const workspaceId = requiredString(
    data.workspace_id,
    "report.workspace_id",
  );
  const advertiserId = requiredString(
    data.advertiser_id,
    "report.advertiser_id",
  );

  must(
    reportId === job.report_id &&
      workspaceId === job.workspace_id &&
      advertiserId === job.advertiser_id,
    "PREFLIGHT_REPORT_SCOPE_MISMATCH",
    "The target report scope does not match the media sync job.",
  );

  const currentIngestionId = nullableString(
    data.current_ingestion_id,
    "report.current_ingestion_id",
  );
  const publishedIngestionId = nullableString(
    data.published_ingestion_id,
    "report.published_ingestion_id",
  );

  const totalReportRowsCount = await countReportRows(
    reportId,
  );
  const currentReportRows = await readReportRowsSnapshot(
    reportId,
    currentIngestionId,
  );
  const publishedReportRows =
    publishedIngestionId === currentIngestionId
      ? currentReportRows
      : await readReportRowsSnapshot(
          reportId,
          publishedIngestionId,
        );

  return {
    reportId,
    workspaceId,
    advertiserId,
    currentIngestionId,
    publishedIngestionId,
    totalReportRowsCount,
    currentReportRowsCount: currentReportRows.count,
    currentReportRowsDigest: currentReportRows.digest,
    publishedReportRowsCount: publishedReportRows.count,
    publishedReportRowsDigest: publishedReportRows.digest,
  };
}

function validateReportBaseline(
  job: MediaSyncJobRecord,
  report: ReportState,
): void {
  must(
    job.previous_ingestion_id ===
      report.currentIngestionId,
    "PREFLIGHT_PREVIOUS_INGESTION_POINTER_MISMATCH",
    "job.previous_ingestion_id does not match reports.current_ingestion_id.",
  );
}

function registerKeywordEntity(
  entities: Map<string, KeywordEntityState>,
  keywordId: string,
  stored: StoredStagingRow,
): void {
  const existing = entities.get(keywordId);

  if (existing) {
    existing.rowCount += 1;
    existing.dates.add(stored.date);
    existing.minRowIndex = Math.min(
      existing.minRowIndex,
      stored.rowIndex,
    );
    existing.maxRowIndex = Math.max(
      existing.maxRowIndex,
      stored.rowIndex,
    );
    return;
  }

  entities.set(keywordId, {
    rowCount: 1,
    dates: new Set([stored.date]),
    minRowIndex: stored.rowIndex,
    maxRowIndex: stored.rowIndex,
  });
}

function countKeywordEntityCoverageMismatches(
  entities: Map<string, KeywordEntityState>,
): number {
  let mismatchCount = 0;

  for (const entity of entities.values()) {
    if (
      entity.rowCount !== EXPECTED_DATES_PER_KEYWORD ||
      entity.dates.size !== EXPECTED_DATES_PER_KEYWORD ||
      !entity.dates.has(EXPECTED_DATE_FROM) ||
      !entity.dates.has(EXPECTED_DATE_TO)
    ) {
      mismatchCount += 1;
    }
  }

  return mismatchCount;
}

function isCanonicalKeywordRow(
  stored: StoredStagingRow,
  job: MediaSyncJobRecord,
): boolean {
  const row = stored.row;

  return (
    row.date === stored.date &&
    row.report_date === stored.date &&
    row.day === stored.date &&
    row.ymd === stored.date &&
    row.channel === stored.channel &&
    row.device === stored.device &&
    row.source === stored.source &&
    row.provider === NAVER_PROVIDER &&
    row.external_account_id ===
      job.external_account_id &&
    row.ingestion_source === "api" &&
    row.row_level === "keyword" &&
    row.data_level === "keyword" &&
    row.row_level_reason ===
      KEYWORD_ROW_LEVEL_REASON &&
    optionalTrimmedString(
      row.external_campaign_id,
    ) !== null &&
    optionalTrimmedString(
      row.external_group_id,
    ) !== null &&
    optionalTrimmedString(
      row.external_keyword_id,
    ) !== null &&
    optionalTrimmedString(row.campaign) !== null &&
    optionalTrimmedString(row.group) !== null &&
    optionalTrimmedString(row.keyword) !== null &&
    optionalTrimmedString(
      row["external_creative_id"],
    ) === null &&
    optionalTrimmedString(row.external_ad_id) === null
  );
}

async function inspectStaging(
  job: MediaSyncJobRecord,
): Promise<StagingInspection> {
  const supabase = getSupabaseAdmin();
  const rowIndexes = new Set<number>();
  const rowKeys = new Set<string>();
  const dates = new Set<string>();
  const keywordEntities = new Map<
    string,
    KeywordEntityState
  >();
  const tailDates = new Set<string>();
  const tailKeywordEntities = new Map<
    string,
    KeywordEntityState
  >();
  const grainCounts: GrainCounts = {
    keyword: 0,
    creative: 0,
    mixed: 0,
  };
  const metricTotals = emptyMetrics();
  const tailMetricTotals = emptyMetrics();
  const identityHash = createHash("sha256");
  const tailDiagnostics: KeywordTailDiagnostic[] = [];

  let totalRows = 0;
  let minRowIndex: number | null = null;
  let maxRowIndex: number | null = null;
  let duplicateRowIndexes = 0;
  let duplicateRowKeys = 0;
  let rowKeyMismatchRows = 0;
  let invalidFingerprintRows = 0;
  let scopeMismatchRows = 0;
  let canonicalMismatchRows = 0;
  let dateOutOfRangeRows = 0;
  let dateWindowMismatchRows = 0;
  let tailRows = 0;
  let tailKeywordRows = 0;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select(
        [
          "report_id",
          "workspace_id",
          "advertiser_id",
          "connection_id",
          "provider",
          "external_account_id",
          "date_from",
          "date_to",
          "row_index",
          "date_window_index",
          "date",
          "channel",
          "device",
          "source",
          "row_key",
          "row_fingerprint",
          "row",
        ].join(", "),
      )
      .eq("job_id", job.id)
      .order("row_index", {
        ascending: true,
      })
      .order("row_key", {
        ascending: true,
      })
      .range(
        offset,
        offset + PAGE_SIZE - 1,
      );

    if (error) {
      fail(
        "PREFLIGHT_STAGING_READ_FAILED",
        "The target staging rows could not be read.",
      );
    }

    if (!Array.isArray(data)) {
      fail(
        "PREFLIGHT_INVALID_STAGING_RESULT",
        "The staging query returned an invalid result.",
      );
    }

    for (const raw of data) {
      const stored = storedStagingRow(raw);
      totalRows += 1;
      minRowIndex =
        minRowIndex === null
          ? stored.rowIndex
          : Math.min(
              minRowIndex,
              stored.rowIndex,
            );
      maxRowIndex =
        maxRowIndex === null
          ? stored.rowIndex
          : Math.max(
              maxRowIndex,
              stored.rowIndex,
            );

      if (rowIndexes.has(stored.rowIndex)) {
        duplicateRowIndexes += 1;
      }
      rowIndexes.add(stored.rowIndex);

      if (rowKeys.has(stored.rowKey)) {
        duplicateRowKeys += 1;
      }
      rowKeys.add(stored.rowKey);

      if (
        !FINGERPRINT_PATTERN.test(
          stored.rowFingerprint,
        )
      ) {
        invalidFingerprintRows += 1;
      }

      try {
        if (
          buildMediaSyncStagingRowKey(
            stored.row,
          ) !== stored.rowKey
        ) {
          rowKeyMismatchRows += 1;
        }
      } catch {
        rowKeyMismatchRows += 1;
      }

      if (
        stored.reportId !== job.report_id ||
        stored.workspaceId !== job.workspace_id ||
        stored.advertiserId !== job.advertiser_id ||
        stored.connectionId !== job.connection_id ||
        stored.provider !== job.provider ||
        stored.externalAccountId !==
          job.external_account_id ||
        stored.dateFrom !== job.date_from ||
        stored.dateTo !== job.date_to
      ) {
        scopeMismatchRows += 1;
      }

      if (
        !isCanonicalKeywordRow(stored, job)
      ) {
        canonicalMismatchRows += 1;
      }

      if (
        stored.date < job.date_from ||
        stored.date > job.date_to
      ) {
        dateOutOfRangeRows += 1;
      }

      if (
        stored.dateWindowIndex !==
        EXPECTED_DATE_WINDOW_INDEX
      ) {
        dateWindowMismatchRows += 1;
      }

      const rowLevel = stored.row.row_level;

      if (rowLevel === "keyword") {
        grainCounts.keyword += 1;
      } else if (rowLevel === "creative") {
        grainCounts.creative += 1;
      } else if (rowLevel === "mixed") {
        grainCounts.mixed += 1;
      } else {
        canonicalMismatchRows += 1;
      }

      dates.add(stored.date);

      const keywordId = optionalTrimmedString(
        stored.row.external_keyword_id,
      );

      if (keywordId) {
        registerKeywordEntity(
          keywordEntities,
          keywordId,
          stored,
        );
      } else {
        canonicalMismatchRows += 1;
      }

      addMetrics(
        metricTotals,
        stored.row,
        stored.rowIndex,
      );

      if (
        stored.rowIndex >= EXPECTED_JOB_ROWS
      ) {
        tailRows += 1;
        tailDates.add(stored.date);

        if (rowLevel === "keyword") {
          tailKeywordRows += 1;
        }

        if (keywordId) {
          registerKeywordEntity(
            tailKeywordEntities,
            keywordId,
            stored,
          );
        }

        addMetrics(
          tailMetricTotals,
          stored.row,
          stored.rowIndex,
        );
        tailDiagnostics.push(
          keywordTailDiagnostic(stored),
        );
      }

      identityHash.update(
        `${JSON.stringify([
          stored.rowIndex,
          stored.dateWindowIndex,
          stored.date,
          stored.rowKey,
          stored.rowFingerprint,
        ])}\n`,
      );
    }

    offset += data.length;

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  let missingRowIndexes = 0;

  for (
    let index = 0;
    index < EXPECTED_STAGING_ROWS;
    index += 1
  ) {
    if (!rowIndexes.has(index)) {
      missingRowIndexes += 1;
    }
  }

  tailDiagnostics.sort(
    (left, right) =>
      left.rowIndex - right.rowIndex,
  );

  return {
    totalRows,
    minRowIndex,
    maxRowIndex,
    distinctRowIndexes: rowIndexes.size,
    duplicateRowIndexes,
    missingRowIndexes,
    duplicateRowKeys,
    rowKeyMismatchRows,
    invalidFingerprintRows,
    scopeMismatchRows,
    canonicalMismatchRows,
    dateOutOfRangeRows,
    dateWindowMismatchRows,
    grainCounts,
    distinctDates: dates.size,
    distinctKeywordEntities:
      keywordEntities.size,
    keywordEntityCoverageMismatchCount:
      countKeywordEntityCoverageMismatches(
        keywordEntities,
      ),
    tailRows,
    tailKeywordRows,
    tailDistinctDates: tailDates.size,
    tailDistinctKeywordEntities:
      tailKeywordEntities.size,
    tailKeywordEntityCoverageMismatchCount:
      countKeywordEntityCoverageMismatches(
        tailKeywordEntities,
      ),
    metricTotals,
    tailMetricTotals,
    identityDigest: identityHash.digest("hex"),
    tailDiagnostics,
  };
}

function validateInspection(
  inspection: StagingInspection,
): void {
  must(
    inspection.totalRows ===
      EXPECTED_STAGING_ROWS,
    "PREFLIGHT_STAGING_SCAN_COUNT_MISMATCH",
    `The direct staging scan must return ${EXPECTED_STAGING_ROWS} rows.`,
  );
  must(
    inspection.minRowIndex === 0 &&
      inspection.maxRowIndex ===
        EXPECTED_STAGING_ROWS - 1,
    "PREFLIGHT_STAGING_SCAN_RANGE_MISMATCH",
    "The direct staging row-index range is invalid.",
  );
  must(
    inspection.distinctRowIndexes ===
      EXPECTED_STAGING_ROWS &&
      inspection.duplicateRowIndexes === 0 &&
      inspection.missingRowIndexes === 0,
    "PREFLIGHT_STAGING_INDEX_CONTINUITY_FAILED",
    "row_index is not exactly continuous from 0 through 44513.",
  );
  must(
    inspection.duplicateRowKeys === 0,
    "PREFLIGHT_DUPLICATE_ROW_KEYS",
    "Duplicate row keys found.",
  );
  must(
    inspection.rowKeyMismatchRows === 0,
    "PREFLIGHT_ROW_KEY_CONTRACT_FAILED",
    "row_key identity mismatches found.",
  );
  must(
    inspection.invalidFingerprintRows === 0,
    "PREFLIGHT_FINGERPRINT_FORMAT_FAILED",
    "Missing or malformed row fingerprints found.",
  );
  must(
    inspection.scopeMismatchRows === 0,
    "PREFLIGHT_STAGING_SCOPE_MISMATCH",
    "Staging scope mismatches found.",
  );
  must(
    inspection.canonicalMismatchRows === 0,
    "PREFLIGHT_CANONICAL_MISMATCH_ROWS",
    "Canonical keyword row mismatches found.",
  );
  must(
    inspection.dateOutOfRangeRows === 0,
    "PREFLIGHT_DATE_RANGE_VIOLATION",
    "Rows outside the job date range found.",
  );
  must(
    inspection.dateWindowMismatchRows === 0,
    "PREFLIGHT_DATE_WINDOW_INDEX_MISMATCH",
    "Rows outside date_window_index 0 found.",
  );
  must(
    inspection.grainCounts.keyword ===
      EXPECTED_STAGING_ROWS &&
      inspection.grainCounts.creative === 0 &&
      inspection.grainCounts.mixed === 0,
    "PREFLIGHT_KEYWORD_ONLY_GRAIN_MISMATCH",
    "The failed staging snapshot is not exactly 44,514 keyword rows.",
  );
  must(
    inspection.distinctDates === EXPECTED_DATES,
    "PREFLIGHT_DISTINCT_DATE_COUNT_MISMATCH",
    "The staging snapshot must contain exactly two dates.",
  );
  must(
    inspection.distinctKeywordEntities ===
      EXPECTED_KEYWORD_ENTITIES,
    "PREFLIGHT_KEYWORD_ENTITY_COUNT_MISMATCH",
    `The staging snapshot must contain exactly ${EXPECTED_KEYWORD_ENTITIES} keyword entities.`,
  );
  must(
    inspection.keywordEntityCoverageMismatchCount === 0,
    "PREFLIGHT_KEYWORD_ENTITY_DATE_COVERAGE_MISMATCH",
    "At least one keyword does not contain exactly both expected dates.",
  );
  must(
    inspection.tailRows === EXPECTED_RECOVERY_DELTA &&
      inspection.tailKeywordRows ===
        EXPECTED_RECOVERY_DELTA,
    "PREFLIGHT_KEYWORD_TAIL_ROW_COUNT_MISMATCH",
    "row_index 44500 through 44513 must contain exactly 14 keyword rows.",
  );
  must(
    inspection.tailDistinctDates ===
      EXPECTED_DATES,
    "PREFLIGHT_KEYWORD_TAIL_DATE_COUNT_MISMATCH",
    "The last 14 keyword rows must contain both expected dates.",
  );
  must(
    inspection.tailDistinctKeywordEntities ===
      EXPECTED_TAIL_KEYWORD_ENTITIES,
    "PREFLIGHT_KEYWORD_TAIL_ENTITY_COUNT_MISMATCH",
    `The last 14 rows must contain exactly ${EXPECTED_TAIL_KEYWORD_ENTITIES} keyword entities.`,
  );
  must(
    inspection.tailKeywordEntityCoverageMismatchCount ===
      0,
    "PREFLIGHT_KEYWORD_TAIL_DATE_COVERAGE_MISMATCH",
    "Each of the last seven keywords must contain both expected dates.",
  );
  must(
    inspection.tailDiagnostics.length ===
      EXPECTED_RECOVERY_DELTA &&
      inspection.tailDiagnostics.every(
        (row, index) =>
          row.rowIndex ===
          EXPECTED_JOB_ROWS + index,
      ),
    "PREFLIGHT_KEYWORD_TAIL_INDEX_MISMATCH",
    "The safe tail diagnostics are not exactly row_index 44500 through 44513.",
  );
}

async function readStagingIdentity(
  jobId: string,
): Promise<StagingIdentitySnapshot> {
  const supabase = getSupabaseAdmin();
  const hash = createHash("sha256");
  let totalRows = 0;
  let minRowIndex: number | null = null;
  let maxRowIndex: number | null = null;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select(
        "row_index, date_window_index, date, row_key, row_fingerprint",
      )
      .eq("job_id", jobId)
      .order("row_index", {
        ascending: true,
      })
      .order("row_key", {
        ascending: true,
      })
      .range(
        offset,
        offset + PAGE_SIZE - 1,
      );

    if (error) {
      fail(
        "PREFLIGHT_STAGING_IDENTITY_READ_FAILED",
        "The final staging identity could not be read.",
      );
    }

    if (!Array.isArray(data)) {
      fail(
        "PREFLIGHT_INVALID_STAGING_IDENTITY_RESULT",
        "The final staging identity result is invalid.",
      );
    }

    for (const raw of data) {
      if (!isPlainObject(raw)) {
        fail(
          "PREFLIGHT_INVALID_STAGING_IDENTITY_RECORD",
          "A final staging identity record is invalid.",
        );
      }

      const rowIndex = nonNegativeInteger(
        raw.row_index,
        "identity.row_index",
      );
      const dateWindowIndex = nonNegativeInteger(
        raw.date_window_index,
        "identity.date_window_index",
      );
      const date = requiredString(
        raw.date,
        "identity.date",
        10,
      );
      const rowKey = requiredString(
        raw.row_key,
        "identity.row_key",
      );
      const rowFingerprint = requiredString(
        raw.row_fingerprint,
        "identity.row_fingerprint",
        64,
      );

      totalRows += 1;
      minRowIndex =
        minRowIndex === null
          ? rowIndex
          : Math.min(minRowIndex, rowIndex);
      maxRowIndex =
        maxRowIndex === null
          ? rowIndex
          : Math.max(maxRowIndex, rowIndex);

      hash.update(
        `${JSON.stringify([
          rowIndex,
          dateWindowIndex,
          date,
          rowKey,
          rowFingerprint,
        ])}\n`,
      );
    }

    offset += data.length;

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return {
    totalRows,
    minRowIndex,
    maxRowIndex,
    identityDigest: hash.digest("hex"),
  };
}

function assertUnchanged(
  before: unknown,
  after: unknown,
  code: string,
  message: string,
): void {
  must(
    stableJson(before) === stableJson(after),
    code,
    message,
  );
}

function safeError(
  error: unknown,
): {
  name: string;
  code: string;
  message: string;
} {
  if (error instanceof Error) {
    const codeValue = (
      error as Error & {
        code?: unknown;
      }
    ).code;

    return {
      name: error.name,
      code:
        typeof codeValue === "string"
          ? codeValue
          : "PREFLIGHT_UNEXPECTED_ERROR",
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    code: "PREFLIGHT_UNKNOWN_ERROR",
    message: "An unknown preflight error occurred.",
  };
}

async function main(): Promise<void> {
  const jobId = readTargetJobId();

  console.log(
    "production recovery preflight mode:",
    "read-only",
  );
  console.log(
    "target job id supplied explicitly:",
    true,
  );
  console.log("RPC calls:", false);
  console.log("job claim:", false);
  console.log("job creation:", false);
  console.log("database writes:", false);

  const jobBefore = await readJob(jobId);
  validateInitialJob(jobBefore);
  const failureBefore = validateFailureContract(
    jobBefore,
  );
  const jobInvariantBefore = jobSnapshot(jobBefore);

  const reportBefore = await readReportState(
    jobBefore,
  );
  validateReportBaseline(jobBefore, reportBefore);

  const inspection = await inspectStaging(jobBefore);
  validateInspection(inspection);

  const recoveryMismatchDetected =
    jobBefore.raw_rows === EXPECTED_JOB_ROWS &&
    jobBefore.normalized_rows ===
      EXPECTED_JOB_ROWS &&
    jobBefore.inserted_rows ===
      EXPECTED_JOB_ROWS &&
    inspection.totalRows ===
      EXPECTED_STAGING_ROWS &&
    inspection.totalRows -
      jobBefore.inserted_rows ===
      EXPECTED_RECOVERY_DELTA;

  must(
    recoveryMismatchDetected,
    "PREFLIGHT_EXPECTED_RECOVERY_MISMATCH_NOT_FOUND",
    "The exact 44,500 job counter versus 44,514 staging mismatch was not detected.",
  );

  const jobAfter = await readJob(jobId);
  const failureAfter = validateFailureContract(
    jobAfter,
  );
  const jobInvariantAfter = jobSnapshot(jobAfter);
  const stagingAfter = await readStagingIdentity(
    jobId,
  );
  const reportAfter = await readReportState(jobAfter);

  assertUnchanged(
    jobInvariantBefore,
    jobInvariantAfter,
    "PREFLIGHT_JOB_CHANGED_DURING_READ",
    "media_sync_jobs changed during the read-only preflight.",
  );
  assertUnchanged(
    failureBefore,
    failureAfter,
    "PREFLIGHT_FAILURE_CONTRACT_CHANGED_DURING_READ",
    "The failed summary-timeout contract changed during the read-only preflight.",
  );
  must(
    stagingAfter.totalRows === inspection.totalRows &&
      stagingAfter.minRowIndex ===
        inspection.minRowIndex &&
      stagingAfter.maxRowIndex ===
        inspection.maxRowIndex &&
      stagingAfter.identityDigest ===
        inspection.identityDigest,
    "PREFLIGHT_STAGING_CHANGED_DURING_READ",
    "media_sync_staging_rows changed during the read-only preflight.",
  );
  assertUnchanged(
    reportBefore,
    reportAfter,
    "PREFLIGHT_REPORT_STATE_CHANGED_DURING_READ",
    "reports pointers or active report_rows contents changed during the read-only preflight.",
  );

  console.log("job provider:", jobBefore.provider);
  console.log("job status:", jobBefore.status);
  console.log("job error:", jobBefore.error);
  console.log(
    "job report_id:",
    jobBefore.report_id,
  );
  console.log(
    "job workspace_id:",
    jobBefore.workspace_id,
  );
  console.log(
    "job advertiser_id:",
    jobBefore.advertiser_id,
  );
  console.log(
    "job connection_id:",
    jobBefore.connection_id,
  );
  console.log(
    "job date range:",
    `${jobBefore.date_from} / ${jobBefore.date_to}`,
  );
  console.log(
    "saved job rows raw / normalized / inserted:",
    `${jobBefore.raw_rows} / ${jobBefore.normalized_rows} / ${jobBefore.inserted_rows}`,
  );
  console.log(
    "actual staging rows:",
    inspection.totalRows,
  );
  console.log(
    "job 44500 versus staging 44514 mismatch detected:",
    recoveryMismatchDetected,
  );
  console.log(
    "failure orchestration name / code / stage:",
    `${failureBefore.orchestrationName} / ${failureBefore.orchestrationCode} / ${failureBefore.orchestrationStage}`,
  );
  console.log(
    "failure summary name / code:",
    `${failureBefore.summaryName} / ${failureBefore.summaryCode}`,
  );
  console.log(
    "failure database cause code:",
    failureBefore.timeoutCode,
  );
  console.log(
    "failure database cause message:",
    failureBefore.timeoutMessage,
  );
  console.log(
    "processing checkpoint absent after failed final error:",
    failureBefore.processingCheckpointAbsent,
  );
  console.log(
    "staging min / max / distinct row_index:",
    `${inspection.minRowIndex} / ${inspection.maxRowIndex} / ${inspection.distinctRowIndexes}`,
  );
  console.log(
    "duplicate / missing row_index:",
    `${inspection.duplicateRowIndexes} / ${inspection.missingRowIndexes}`,
  );
  console.log(
    "duplicate row_key:",
    inspection.duplicateRowKeys,
  );
  console.log(
    "row_key contract mismatch rows:",
    inspection.rowKeyMismatchRows,
  );
  console.log(
    "missing or malformed row_fingerprint rows:",
    inspection.invalidFingerprintRows,
  );
  console.log(
    "staging scope mismatch rows:",
    inspection.scopeMismatchRows,
  );
  console.log(
    "canonical keyword mismatch rows:",
    inspection.canonicalMismatchRows,
  );
  console.log(
    "date-range violation rows:",
    inspection.dateOutOfRangeRows,
  );
  console.log(
    "keyword / creative / mixed rows:",
    `${inspection.grainCounts.keyword} / ${inspection.grainCounts.creative} / ${inspection.grainCounts.mixed}`,
  );
  console.log(
    "distinct dates / keyword entities:",
    `${inspection.distinctDates} / ${inspection.distinctKeywordEntities}`,
  );
  console.log(
    "keyword entity date-coverage mismatches:",
    inspection.keywordEntityCoverageMismatchCount,
  );
  console.log(
    "tail rows / keyword rows / distinct dates / distinct keyword entities:",
    `${inspection.tailRows} / ${inspection.tailKeywordRows} / ${inspection.tailDistinctDates} / ${inspection.tailDistinctKeywordEntities}`,
  );
  console.log(
    "tail keyword entity date-coverage mismatches:",
    inspection.tailKeywordEntityCoverageMismatchCount,
  );
  console.log(
    "metric totals impressions / clicks / cost / conversions / revenue:",
    `${inspection.metricTotals.impressions} / ${inspection.metricTotals.clicks} / ${inspection.metricTotals.cost} / ${inspection.metricTotals.conversions} / ${inspection.metricTotals.revenue}`,
  );
  console.log(
    "last 14 keyword metric totals impressions / clicks / cost / conversions / revenue:",
    `${inspection.tailMetricTotals.impressions} / ${inspection.tailMetricTotals.clicks} / ${inspection.tailMetricTotals.cost} / ${inspection.tailMetricTotals.conversions} / ${inspection.tailMetricTotals.revenue}`,
  );
  console.log(
    "last 14 rows verified as 7 keyword entities x 2 dates:",
    true,
  );
  console.log("last 14 keyword row diagnostics:");
  console.log(
    JSON.stringify(
      inspection.tailDiagnostics,
      null,
      2,
    ),
  );

  console.log(
    "reports.current_ingestion_id before / after:",
    `${reportBefore.currentIngestionId ?? "null"} / ${reportAfter.currentIngestionId ?? "null"}`,
  );
  console.log(
    "reports.published_ingestion_id before / after:",
    `${reportBefore.publishedIngestionId ?? "null"} / ${reportAfter.publishedIngestionId ?? "null"}`,
  );
  console.log(
    "report_rows total before / after:",
    `${reportBefore.totalReportRowsCount} / ${reportAfter.totalReportRowsCount}`,
  );
  console.log(
    "report_rows current ingestion before / after:",
    `${reportBefore.currentReportRowsCount} / ${reportAfter.currentReportRowsCount}`,
  );
  console.log(
    "report_rows published ingestion before / after:",
    `${reportBefore.publishedReportRowsCount} / ${reportAfter.publishedReportRowsCount}`,
  );

  console.log("media_sync_jobs unchanged:", true);
  console.log(
    "failed error contract unchanged:",
    true,
  );
  console.log(
    "media_sync_staging_rows unchanged:",
    true,
  );
  console.log("reports pointers unchanged:", true);
  console.log(
    "report_rows counts and active-ingestion contents unchanged:",
    true,
  );
  console.log("materialization called:", false);
  console.log("activation called:", false);
  console.log("finalization called:", false);
  console.log("checkpoint modified:", false);
  console.log("new job created:", false);
  console.log("existing job claimed:", false);
  console.log(
    "existing 44514 rows may be directly materialized:",
    false,
  );
  console.log(
    "recovery candidate must resume after completed keyword staging:",
    true,
  );
  console.log(
    "production recovery preflight passed:",
    true,
  );
  console.log(
    "production recovery candidate may be created:",
    true,
  );
}

main().catch((error: unknown) => {
  const diagnostic = safeError(error);

  console.error(
    "production recovery preflight passed:",
    false,
  );
  console.error(
    "production recovery candidate may be created:",
    false,
  );
  console.error(
    "preflight error name:",
    diagnostic.name,
  );
  console.error(
    "preflight error code:",
    diagnostic.code,
  );
  console.error(
    "preflight error message:",
    diagnostic.message,
  );

  process.exitCode = 1;
});
