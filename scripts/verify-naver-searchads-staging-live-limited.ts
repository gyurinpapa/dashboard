import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createMediaCanonicalRowBatchBuffer,
  MediaCanonicalRowBatchBufferError,
} from "../src/lib/media-sync/media-canonical-row-batch-buffer";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  getMediaSyncStagingSummary,
  MediaSyncStagingSummaryError,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  NaverSearchAdsApiError,
} from "../src/lib/media-sync/naver-searchads-api";
import {
  convertNaverKeywordDailyStatsToCanonicalRows,
  NaverSearchAdsCanonicalRowError,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import {
  collectNaverKeywordDailyStats,
  NaverKeywordStatsCollectorError,
  type NaverKeywordStatsCollectorRetryEvent,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const MEDIA_SYNC_STAGING_ROWS_TABLE =
  "media_sync_staging_rows";

const REPORTS_TABLE =
  "reports";

const REPORT_ROWS_TABLE =
  "report_rows";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PENDING_STATUS =
  "pending" as const;

const PROCESSING_STATUS =
  "processing" as const;

const ACTIVE_JOB_STATUSES = [
  PENDING_STATUS,
  PROCESSING_STATUS,
] as const;

/*
 * 실제 API 안전 설정
 */
const REQUEST_INTERVAL_MS = 1_000;
const KEYWORD_CHUNK_SIZE = 100;
const CHUNK_PAUSE_MS = 10_000;
const MAX_RETRY_COUNT = 3;

/*
 * 이번 검증에서 실제로 저장할 keyword 수.
 * 전체 account를 수집하지 않는다.
 */
const MAX_KEYWORDS_TO_STAGE = 5;

/*
 * canonical rows는 이 크기를 넘겨 메모리에 유지하지 않는다.
 * 날짜 24일 × keyword 5개여도 여러 batch로 나뉜다.
 */
const STAGING_BATCH_SIZE = 50;

const DATE_WINDOW_INDEX = 0;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VerificationInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
};

type VerificationFixture = {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
};

type ReportState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
  reportRowsCount: number;
};

type JobState = {
  status: string;
  progress: number;
  rawRows: number;
  normalizedRows: number;
  insertedRows: number;
  failedRows: number;
  snapshotIngestionId: string | null;
};

type StoredStagingRow = {
  row_index: number | string;
  date_window_index: number;
  date: string;
  row_key: string;
  row_fingerprint: string;
  row: {
    date?: unknown;
    external_keyword_id?: unknown;
  };
};

type RuntimeMeasurements = {
  callbackCount: number;
  canonicalRowCount: number;

  appendSubmittedRows: number;
  appendInsertedRows: number;
  appendDuplicateRows: number;

  flushCount: number;
  maximumFlushedBatchSize: number;

  retryCount: number;

  seenKeywordIds: Set<string>;
  duplicateKeywordDetected: boolean;

  canonicalDatesValid: boolean;
  canonicalScopesValid: boolean;
  canonicalMetricsValid: boolean;

  abortRequested: boolean;
  expectedAbortObserved: boolean;
};

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${argumentName} argument is required.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new Error(
      `${argumentName} argument must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeUuidArgument(
  value: unknown,
  argumentName: string,
): string {
  const normalizedValue =
    normalizeRequiredArgument(
      value,
      argumentName,
      36,
    );

  if (
    !UUID_PATTERN.test(
      normalizedValue,
    )
  ) {
    throw new Error(
      `VERIFICATION_INVALID_${argumentName.toUpperCase()}_UUID`,
    );
  }

  return normalizedValue;
}

function readVerificationInput(): VerificationInput {
  const [
    reportIdArgument,
    connectionIdArgument,
    workspaceIdArgument,
    advertiserIdArgument,
    createdByArgument,
    dateFromArgument,
    dateToArgument,
  ] = process.argv.slice(2);

  return {
    reportId:
      normalizeUuidArgument(
        reportIdArgument,
        "reportId",
      ),

    connectionId:
      normalizeUuidArgument(
        connectionIdArgument,
        "connectionId",
      ),

    workspaceId:
      normalizeUuidArgument(
        workspaceIdArgument,
        "workspaceId",
      ),

    advertiserId:
      normalizeUuidArgument(
        advertiserIdArgument,
        "advertiserId",
      ),

    createdBy:
      normalizeUuidArgument(
        createdByArgument,
        "createdBy",
      ),

    dateFrom:
      normalizeRequiredArgument(
        dateFromArgument,
        "dateFrom",
        10,
      ),

    dateTo:
      normalizeRequiredArgument(
        dateToArgument,
        "dateTo",
        10,
      ),
  };
}

function createRuntimeMeasurements():
  RuntimeMeasurements {
  return {
    callbackCount:
      0,

    canonicalRowCount:
      0,

    appendSubmittedRows:
      0,

    appendInsertedRows:
      0,

    appendDuplicateRows:
      0,

    flushCount:
      0,

    maximumFlushedBatchSize:
      0,

    retryCount:
      0,

    seenKeywordIds:
      new Set<string>(),

    duplicateKeywordDetected:
      false,

    canonicalDatesValid:
      true,

    canonicalScopesValid:
      true,

    canonicalMetricsValid:
      true,

    abortRequested:
      false,

    expectedAbortObserved:
      false,
  };
}

function isFiniteNonNegativeNumber(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

async function assertNoExistingPendingNaverJob(): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id")
      .eq("status", PENDING_STATUS)
      .eq("provider", NAVER_PROVIDER)
      .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_QUEUE_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_PENDING_NAVER_JOB_ALREADY_EXISTS",
    );
  }
}

async function assertNoExistingActiveJobForReport(
  reportId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id, status")
      .eq("report_id", reportId)
      .in(
        "status",
        [...ACTIVE_JOB_STATUSES],
      )
      .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_ALREADY_EXISTS",
    );
  }
}

async function readReportState(
  reportId: string,
): Promise<ReportState> {
  const supabase =
    getSupabaseAdmin();

  const reportResult =
    await supabase
      .from(REPORTS_TABLE)
      .select(
        "current_ingestion_id, published_ingestion_id",
      )
      .eq("id", reportId)
      .maybeSingle();

  if (reportResult.error) {
    throw new Error(
      "VERIFICATION_REPORT_STATE_READ_FAILED",
    );
  }

  if (!reportResult.data) {
    throw new Error(
      "VERIFICATION_REPORT_NOT_FOUND",
    );
  }

  const rowsResult =
    await supabase
      .from(REPORT_ROWS_TABLE)
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("report_id", reportId);

  if (rowsResult.error) {
    throw new Error(
      "VERIFICATION_REPORT_ROWS_COUNT_FAILED",
    );
  }

  return {
    currentIngestionId:
      reportResult.data
        .current_ingestion_id ??
      null,

    publishedIngestionId:
      reportResult.data
        .published_ingestion_id ??
      null,

    reportRowsCount:
      rowsResult.count ?? 0,
  };
}

function reportStateMatches(
  before: ReportState,
  after: ReportState,
): boolean {
  return (
    before.currentIngestionId ===
      after.currentIngestionId &&
    before.publishedIngestionId ===
      after.publishedIngestionId &&
    before.reportRowsCount ===
      after.reportRowsCount
  );
}

async function readJobState(
  jobId: string,
): Promise<JobState> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select(
        [
          "status",
          "progress",
          "raw_rows",
          "normalized_rows",
          "inserted_rows",
          "failed_rows",
          "snapshot_ingestion_id",
        ].join(", "),
      )
      .eq("id", jobId)
      .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_STATE_READ_FAILED",
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "VERIFICATION_JOB_STATE_NOT_FOUND",
    );
  }

  const record =
    data as unknown as Record<
      string,
      unknown
    >;

  return {
    status:
      typeof record.status ===
        "string"
        ? record.status
        : "",

    progress:
      typeof record.progress ===
        "number"
        ? record.progress
        : Number(
            record.progress ?? 0,
          ),

    rawRows:
      typeof record.raw_rows ===
        "number"
        ? record.raw_rows
        : Number(
            record.raw_rows ?? 0,
          ),

    normalizedRows:
      typeof record.normalized_rows ===
        "number"
        ? record.normalized_rows
        : Number(
            record.normalized_rows ?? 0,
          ),

    insertedRows:
      typeof record.inserted_rows ===
        "number"
        ? record.inserted_rows
        : Number(
            record.inserted_rows ?? 0,
          ),

    failedRows:
      typeof record.failed_rows ===
        "number"
        ? record.failed_rows
        : Number(
            record.failed_rows ?? 0,
          ),

    snapshotIngestionId:
      typeof record.snapshot_ingestion_id ===
        "string"
        ? record.snapshot_ingestion_id
        : null,
  };
}

function jobStateMatches(
  before: JobState,
  after: JobState,
): boolean {
  return (
    before.status ===
      after.status &&
    before.progress ===
      after.progress &&
    before.rawRows ===
      after.rawRows &&
    before.normalizedRows ===
      after.normalizedRows &&
    before.insertedRows ===
      after.insertedRows &&
    before.failedRows ===
      after.failedRows &&
    before.snapshotIngestionId ===
      after.snapshotIngestionId
  );
}

async function readStoredStagingRows(
  jobId: string,
): Promise<StoredStagingRow[]> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .select(
        [
          "row_index",
          "date_window_index",
          "date",
          "row_key",
          "row_fingerprint",
          "row",
        ].join(", "),
      )
      .eq("job_id", jobId)
      .order(
        "row_index",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw new Error(
      "VERIFICATION_STAGING_ROWS_READ_FAILED",
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "VERIFICATION_STAGING_ROWS_INVALID_RESULT",
    );
  }

  return data as unknown as StoredStagingRow[];
}

function validateStoredRows(
  rows: readonly StoredStagingRow[],
  expectedRows: number,
): boolean {
  if (
    rows.length !==
    expectedRows
  ) {
    return false;
  }

  return rows.every(
    (
      row,
      index,
    ) => {
      const rowIndex =
        Number(
          row.row_index,
        );

      return (
        rowIndex === index &&
        row.date_window_index ===
          DATE_WINDOW_INDEX &&
        typeof row.row_key ===
          "string" &&
        row.row_key.length > 0 &&
        typeof row.row_fingerprint ===
          "string" &&
        /^[0-9a-f]{64}$/.test(
          row.row_fingerprint,
        ) &&
        row.row?.date ===
          row.date &&
        typeof row.row
          ?.external_keyword_id ===
          "string" &&
        row.row
          .external_keyword_id
          .length > 0
      );
    },
  );
}

async function readStagingRowCount(
  jobId: string,
): Promise<number> {
  const supabase =
    getSupabaseAdmin();

  const { count, error } =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("job_id", jobId);

  if (error) {
    throw new Error(
      "VERIFICATION_STAGING_COUNT_FAILED",
    );
  }

  return count ?? 0;
}

async function deleteStagingFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .delete()
      .eq(
        "job_id",
        fixture.jobId,
      )
      .eq(
        "report_id",
        fixture.reportId,
      )
      .eq(
        "workspace_id",
        fixture.workspaceId,
      )
      .eq(
        "advertiser_id",
        fixture.advertiserId,
      );

  if (error) {
    throw new Error(
      "VERIFICATION_STAGING_DELETE_FAILED",
    );
  }

  return (
    await readStagingRowCount(
      fixture.jobId,
    )
  ) === 0;
}

async function deleteJobFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .delete()
      .eq(
        "id",
        fixture.jobId,
      )
      .eq(
        "report_id",
        fixture.reportId,
      )
      .eq(
        "workspace_id",
        fixture.workspaceId,
      )
      .eq(
        "advertiser_id",
        fixture.advertiserId,
      )
      .select("id")
      .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_FAILED",
    );
  }

  if (
    data?.id !==
    fixture.jobId
  ) {
    return false;
  }

  const checkResult =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id")
      .eq("id", fixture.jobId)
      .maybeSingle();

  if (checkResult.error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
    );
  }

  return checkResult.data === null;
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const stagingDeleted =
    await deleteStagingFixture(
      fixture,
    );

  const jobDeleted =
    await deleteJobFixture(
      fixture,
    );

  return (
    stagingDeleted &&
    jobDeleted
  );
}

function captureRetry(
  measurements: RuntimeMeasurements,
  event: NaverKeywordStatsCollectorRetryEvent,
): void {
  measurements.retryCount += 1;

  console.log(
    [
      "collector retry",
      `operation=${event.operation}`,
      `category=${event.category}`,
      `retryCount=${event.retryCount}`,
      `delayMs=${event.delayMs}`,
      `status=${event.httpStatus ?? "null"}`,
      `errorCode=${event.errorCode}`,
      `keywordId=${event.keywordId ?? "null"}`,
    ].join(" "),
  );
}

function validateCanonicalRows(input: {
  measurements: RuntimeMeasurements;
  rows: ReturnType<
    typeof convertNaverKeywordDailyStatsToCanonicalRows
  >;
  expectedAccountId: string;
  expectedKeywordId: string;
  dateFrom: string;
  dateTo: string;
}): void {
  for (const row of input.rows) {
    if (
      row.date <
        input.dateFrom ||
      row.date >
        input.dateTo ||
      row.date !==
        row.report_date ||
      row.date !==
        row.day ||
      row.date !==
        row.ymd
    ) {
      input.measurements
        .canonicalDatesValid =
        false;
    }

    if (
      row.provider !==
        NAVER_PROVIDER ||
      row.ingestion_source !==
        "api" ||
      row.row_level !==
        "keyword" ||
      row.data_level !==
        "keyword" ||
      row.external_account_id !==
        input.expectedAccountId ||
      row.external_keyword_id !==
        input.expectedKeywordId
    ) {
      input.measurements
        .canonicalScopesValid =
        false;
    }

    if (
      !isFiniteNonNegativeNumber(
        row.impressions,
      ) ||
      !isFiniteNonNegativeNumber(
        row.clicks,
      ) ||
      !isFiniteNonNegativeNumber(
        row.cost,
      ) ||
      !isFiniteNonNegativeNumber(
        row.conversions,
      ) ||
      !isFiniteNonNegativeNumber(
        row.revenue,
      ) ||
      !isFiniteNonNegativeNumber(
        row.rank,
      )
    ) {
      input.measurements
        .canonicalMetricsValid =
        false;
    }
  }
}

async function main(): Promise<void> {
  const input =
    readVerificationInput();

  const measurements =
    createRuntimeMeasurements();

  const abortController =
    new AbortController();

  let fixture:
    VerificationFixture | null =
    null;

  let reportStateBefore:
    ReportState | null =
    null;

  let jobStateBeforeCollection:
    JobState | null =
    null;

  let cleanupCompleted =
    false;

  console.log(
    "live Naver staging verification:",
    "first 5 keywords only",
  );

  console.log(
    "actual Naver API calls:",
    true,
  );

  console.log(
    "staging rows are temporary and will be deleted:",
    true,
  );

  console.log(
    "snapshot/report_rows/pointers remain unchanged:",
    true,
  );

  try {
    await assertNoExistingPendingNaverJob();

    await assertNoExistingActiveJobForReport(
      input.reportId,
    );

    reportStateBefore =
      await readReportState(
        input.reportId,
      );

    console.log(
      "existing pending Naver jobs:",
      0,
    );

    console.log(
      "existing active jobs for report:",
      0,
    );

    const pendingJob =
      await createPendingMediaSyncJob({
        reportId:
          input.reportId,

        connectionId:
          input.connectionId,

        workspaceId:
          input.workspaceId,

        advertiserId:
          input.advertiserId,

        createdBy:
          input.createdBy,

        dateFrom:
          input.dateFrom,

        dateTo:
          input.dateTo,

        dataLevel:
          "keyword",

        mode:
          "snapshot_replace",
      });

    fixture = {
      jobId:
        pendingJob.id,

      reportId:
        pendingJob.report_id,

      workspaceId:
        pendingJob.workspace_id,

      advertiserId:
        pendingJob.advertiser_id,
    };

    const claimedJob =
      await claimNextNaverMediaSyncJob();

    const claimMatchesFixture =
      claimedJob !== null &&
      claimedJob.id ===
        pendingJob.id &&
      claimedJob.status ===
        PROCESSING_STATUS &&
      claimedJob.provider ===
        NAVER_PROVIDER;

    console.log(
      "claim matches fixture:",
      claimMatchesFixture,
    );

    if (
      !claimedJob ||
      !claimMatchesFixture
    ) {
      throw new Error(
        "VERIFICATION_CLAIM_MISMATCH",
      );
    }

    const context =
      await loadNaverMediaSyncWorkerContext(
        claimedJob,
      );

    const contextMatchesFixture =
      context.job.id ===
        claimedJob.id &&
      context.connection.id ===
        claimedJob.connection_id &&
      context.connection.workspaceId ===
        claimedJob.workspace_id &&
      context.connection.advertiserId ===
        claimedJob.advertiser_id &&
      context.connection.externalAccountId ===
        claimedJob.external_account_id &&
      context.credentials.customerId ===
        claimedJob.external_account_id;

    console.log(
      "worker context matches fixture:",
      contextMatchesFixture,
    );

    if (!contextMatchesFixture) {
      throw new Error(
        "VERIFICATION_WORKER_CONTEXT_MISMATCH",
      );
    }

    jobStateBeforeCollection =
      await readJobState(
        claimedJob.id,
      );

    const batchBuffer =
      createMediaCanonicalRowBatchBuffer({
        maxBatchSize:
          STAGING_BATCH_SIZE,

        onFlush:
          async (
            rows,
            flushContext,
          ): Promise<void> => {
            const appendResult =
              await appendMediaSyncStagingBatch({
                job:
                  claimedJob,

                rows,

                rowStartIndex:
                  flushContext.rowStartIndex,

                dateWindowIndex:
                  DATE_WINDOW_INDEX,
              });

            measurements
              .appendSubmittedRows +=
              appendResult.submittedRows;

            measurements
              .appendInsertedRows +=
              appendResult.insertedRows;

            measurements
              .appendDuplicateRows +=
              appendResult.duplicateRows;

            measurements.flushCount +=
              1;

            measurements
              .maximumFlushedBatchSize =
              Math.max(
                measurements
                  .maximumFlushedBatchSize,
                rows.length,
              );
          },
      });

    const startCursor =
      createNaverKeywordStatsCursor({
        dateWindow: {
          index:
            DATE_WINDOW_INDEX,

          dateFrom:
            claimedJob.date_from,

          dateTo:
            claimedJob.date_to,
        },
      });

    try {
      await collectNaverKeywordDailyStats({
        credentials:
          context.credentials,

        cursor:
          startCursor,

        requestIntervalMs:
          REQUEST_INTERVAL_MS,

        keywordChunkSize:
          KEYWORD_CHUNK_SIZE,

        chunkPauseMs:
          CHUNK_PAUSE_MS,

        maxRetryCount:
          MAX_RETRY_COUNT,

        signal:
          abortController.signal,

        onRetry:
          async (
            event,
          ): Promise<void> => {
            captureRetry(
              measurements,
              event,
            );
          },

        onKeywordStats:
          async (
            item,
          ): Promise<void> => {
            if (
              measurements.callbackCount >=
              MAX_KEYWORDS_TO_STAGE
            ) {
              throw new Error(
                "VERIFICATION_CALLBACK_LIMIT_EXCEEDED",
              );
            }

            if (
              measurements.seenKeywordIds.has(
                item.keyword.id,
              )
            ) {
              measurements
                .duplicateKeywordDetected =
                true;
            } else {
              measurements
                .seenKeywordIds.add(
                  item.keyword.id,
                );
            }

            const canonicalRows =
              convertNaverKeywordDailyStatsToCanonicalRows({
                externalAccountId:
                  claimedJob
                    .external_account_id,

                campaign:
                  item.campaign,

                adgroup:
                  item.adgroup,

                keyword:
                  item.keyword,

                stats:
                  item.stats,
              });

            validateCanonicalRows({
              measurements,

              rows:
                canonicalRows,

              expectedAccountId:
                claimedJob
                  .external_account_id,

              expectedKeywordId:
                item.keyword.id,

              dateFrom:
                claimedJob.date_from,

              dateTo:
                claimedJob.date_to,
            });

            await batchBuffer.pushMany(
              canonicalRows,
            );

            measurements.callbackCount +=
              1;

            measurements.canonicalRowCount +=
              canonicalRows.length;

            console.log(
              "live keywords staged:",
              measurements.callbackCount,
              "/",
              MAX_KEYWORDS_TO_STAGE,
            );

            if (
              measurements.callbackCount ===
              MAX_KEYWORDS_TO_STAGE
            ) {
              /*
               * 다섯 번째 callback의 push가 성공한 후
               * 다음 collector 반복 진입에서 중단한다.
               */
              measurements.abortRequested =
                true;

              abortController.abort();
            }
          },
      });

      throw new Error(
        "VERIFICATION_COLLECTOR_COMPLETED_WITHOUT_LIMIT_ABORT",
      );
    } catch (error) {
      if (
        error instanceof
          NaverKeywordStatsCollectorError &&
        error.code ===
          "COLLECTION_ABORTED" &&
        measurements.abortRequested &&
        measurements.callbackCount ===
          MAX_KEYWORDS_TO_STAGE
      ) {
        measurements.expectedAbortObserved =
          true;

        console.log(
          "expected limited collection abort observed:",
          true,
        );
      } else {
        throw error;
      }
    }

    /*
     * Abort 시점에 남아 있는 마지막 partial batch를 저장한다.
     */
    await batchBuffer.flushRemaining();

    const bufferState =
      batchBuffer.getState();

    const expectedRows =
      measurements.canonicalRowCount;

    const limitedCollectionMatches =
      measurements.callbackCount ===
        MAX_KEYWORDS_TO_STAGE &&
      measurements.seenKeywordIds.size ===
        MAX_KEYWORDS_TO_STAGE &&
      measurements
        .duplicateKeywordDetected ===
        false &&
      measurements.abortRequested &&
      measurements
        .expectedAbortObserved;

    console.log(
      "limited keyword collection matches:",
      limitedCollectionMatches,
    );

    const canonicalContractMatches =
      expectedRows > 0 &&
      measurements.canonicalDatesValid &&
      measurements.canonicalScopesValid &&
      measurements.canonicalMetricsValid;

    console.log(
      "live canonical contract matches:",
      canonicalContractMatches,
    );

    const bufferContractMatches =
      bufferState.pendingRowCount ===
        0 &&
      bufferState.acceptedRowCount ===
        expectedRows &&
      bufferState.flushedRowCount ===
        expectedRows &&
      bufferState.busy ===
        false &&
      measurements
        .maximumFlushedBatchSize <=
        STAGING_BATCH_SIZE;

    console.log(
      "bounded buffer contract matches:",
      bufferContractMatches,
    );

    const appendTotalsMatch =
      measurements.appendSubmittedRows ===
        expectedRows &&
      measurements.appendInsertedRows ===
        expectedRows &&
      measurements.appendDuplicateRows ===
        0;

    console.log(
      "staging append totals match:",
      appendTotalsMatch,
    );

    /*
     * 전체 account 수집이 아니므로 assert complete는 호출하지 않는다.
     * 저장된 제한 rows 자체의 구조만 summary로 읽어 검증한다.
     */
    const limitedSummary =
      await getMediaSyncStagingSummary({
        job:
          claimedJob,

        expectedRows,
      });

    const summaryMatchesStoredSubset =
      limitedSummary.totalRows ===
        expectedRows &&
      limitedSummary.minRowIndex ===
        0 &&
      limitedSummary.maxRowIndex ===
        expectedRows - 1 &&
      limitedSummary
        .distinctRowIndexes ===
        expectedRows &&
      limitedSummary
        .rowsInExpectedRange ===
        expectedRows &&
      limitedSummary
        .missingExpectedRows ===
        0 &&
      limitedSummary
        .outOfRangeRows ===
        0 &&
      limitedSummary
        .scopeMismatchRows ===
        0 &&
      limitedSummary
        .blankRowKeyRows ===
        0 &&
      limitedSummary
        .missingFingerprintRows ===
        0 &&
      limitedSummary
        .canonicalMismatchRows ===
        0 &&
      limitedSummary.dateWindowCount ===
        1;

    console.log(
      "limited staging subset summary matches:",
      summaryMatchesStoredSubset,
    );

    console.log(
      "full account completion assertion executed:",
      false,
    );

    const storedRows =
      await readStoredStagingRows(
        claimedJob.id,
      );

    const storedRowsMatch =
      validateStoredRows(
        storedRows,
        expectedRows,
      );

    console.log(
      "stored staging rows match:",
      storedRowsMatch,
    );

    const jobStateAfterCollection =
      await readJobState(
        claimedJob.id,
      );

    const jobStateUnchanged =
      jobStateMatches(
        jobStateBeforeCollection,
        jobStateAfterCollection,
      ) &&
      jobStateAfterCollection.status ===
        PROCESSING_STATUS;

    console.log(
      "job progress and completion fields unchanged:",
      jobStateUnchanged,
    );

    const reportStateAfterCollection =
      await readReportState(
        input.reportId,
      );

    const reportUnchangedBeforeCleanup =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterCollection,
      );

    console.log(
      "report pointers and report_rows unchanged:",
      reportUnchangedBeforeCleanup,
    );

    cleanupCompleted =
      await cleanupFixture(
        fixture,
      );

    console.log(
      "staging and job fixture cleanup completed:",
      cleanupCompleted,
    );

    const reportStateAfterCleanup =
      await readReportState(
        input.reportId,
      );

    const reportUnchangedAfterCleanup =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterCleanup,
      );

    console.log(
      "report unchanged after cleanup:",
      reportUnchangedAfterCleanup,
    );

    const verificationPassed =
      claimMatchesFixture &&
      contextMatchesFixture &&
      limitedCollectionMatches &&
      canonicalContractMatches &&
      bufferContractMatches &&
      appendTotalsMatch &&
      summaryMatchesStoredSubset &&
      storedRowsMatch &&
      jobStateUnchanged &&
      reportUnchangedBeforeCleanup &&
      cleanupCompleted &&
      reportUnchangedAfterCleanup;

    console.log(
      "verification passed:",
      verificationPassed,
    );

    if (!verificationPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (
      fixture &&
      !cleanupCompleted
    ) {
      try {
        const emergencyCleanupCompleted =
          await cleanupFixture(
            fixture,
          );

        console.log(
          "emergency cleanup completed:",
          emergencyCleanupCompleted,
        );

        if (!emergencyCleanupCompleted) {
          process.exitCode = 1;
        }
      } catch {
        console.error(
          "emergency cleanup failed:",
          "CLEANUP_ERROR",
        );

        process.exitCode = 1;
      }
    }

    if (
      reportStateBefore !== null
    ) {
      try {
        const finalReportState =
          await readReportState(
            input.reportId,
          );

        const finalReportUnchanged =
          reportStateMatches(
            reportStateBefore,
            finalReportState,
          );

        console.log(
          "final report state unchanged:",
          finalReportUnchanged,
        );

        if (!finalReportUnchanged) {
          process.exitCode = 1;
        }
      } catch {
        console.error(
          "final report state check failed:",
          "VERIFICATION_REPORT_STATE_FINAL_CHECK_FAILED",
        );

        process.exitCode = 1;
      }
    }
  }
}

function readSafeErrorDiagnostic(
  value: unknown,
): Record<string, string | null> {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return {
      name: null,
      code: null,
      message: null,
      details: null,
      hint: null,
    };
  }

  const record =
    value as Record<string, unknown>;

  return {
    name:
      typeof record.name ===
        "string"
        ? record.name
        : null,

    code:
      typeof record.code ===
        "string"
        ? record.code
        : null,

    message:
      typeof record.message ===
        "string"
        ? record.message
        : null,

    details:
      typeof record.details ===
        "string"
        ? record.details
        : null,

    hint:
      typeof record.hint ===
        "string"
        ? record.hint
        : null,
  };
}

main().catch((error: unknown) => {
  if (
    error instanceof
      NaverKeywordStatsCollectorError ||
    error instanceof
      NaverSearchAdsCanonicalRowError ||
    error instanceof
      MediaCanonicalRowBatchBufferError ||
    error instanceof
      MediaSyncStagingSummaryError ||
    error instanceof
      MediaSyncStagingRepositoryError ||
    error instanceof
      MediaSyncJobsRepositoryError ||
    error instanceof
      MediaSyncWorkerRepositoryError ||
    error instanceof
      NaverSearchAdsApiError
  ) {
    console.error(
      "live Naver staging verification failed:",
      error.code,
    );

    console.error(
      "error diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error,
        ),
      ),
    );

    console.error(
      "cause diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error.cause,
        ),
      ),
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "live Naver staging verification failed:",
      error.message.startsWith(
        "VERIFICATION_",
      )
        ? error.message
        : error.name,
    );

    console.error(
      "error diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error,
        ),
      ),
    );

    console.error(
      "cause diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error.cause,
        ),
      ),
    );

    process.exitCode = 1;
    return;
  }

  console.error(
    "live Naver staging verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});