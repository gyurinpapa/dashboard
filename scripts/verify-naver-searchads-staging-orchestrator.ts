import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  MediaSyncStagingRepositoryError,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  MediaSyncStagingSummaryError,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  NaverSearchAdsStagingOrchestratorError,
  runNaverSearchAdsStagingOrchestrator,
} from "../src/lib/media-sync/naver-searchads-staging-orchestrator";
import {
  NaverSearchAdsApiError,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsKeywordDailyStatsRecord,
  type NaverSearchAdsKeywordDailyStatsResult,
  type NaverSearchAdsKeywordRecord,
  type NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import {
  NaverSearchAdsCanonicalRowError,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import {
  NaverKeywordStatsCollectorError,
  type NaverKeywordStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  MediaCanonicalRowBatchBufferError,
} from "../src/lib/media-sync/media-canonical-row-batch-buffer";

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

const DATE_WINDOW_INDEX = 0;

const FIXTURE_KEYWORD_COUNT = 5;

const FIXTURE_BATCH_SIZE = 4;

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

async function assertNoExistingPendingNaverJob():
  Promise<void> {
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
      Number(
        record.progress ?? 0,
      ),

    rawRows:
      Number(
        record.raw_rows ?? 0,
      ),

    normalizedRows:
      Number(
        record.normalized_rows ?? 0,
      ),

    insertedRows:
      Number(
        record.inserted_rows ?? 0,
      ),

    failedRows:
      Number(
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

function createFixtureCampaign():
  NaverSearchAdsCampaignRecord {
  return {
    id:
      "orchestrator-campaign-id",

    name:
      "orchestrator-campaign",

    campaignType:
      "WEB_SITE",

    status:
      "ELIGIBLE",

    statusReason:
      null,

    userLock:
      false,
  };
}

function createFixtureAdgroup(
  campaignId: string,
): NaverSearchAdsAdgroupRecord {
  return {
    id:
      "orchestrator-adgroup-id",

    campaignId,

    name:
      "orchestrator-adgroup",

    adgroupType:
      "WEB_SITE",

    status:
      "ELIGIBLE",

    statusReason:
      null,

    userLock:
      false,
  };
}

function createFixtureKeywords(
  adgroupId: string,
): NaverSearchAdsKeywordRecord[] {
  return Array.from(
    {
      length:
        FIXTURE_KEYWORD_COUNT,
    },
    (
      _,
      index,
    ): NaverSearchAdsKeywordRecord => {
      const sequence =
        index + 1;

      return {
        id:
          `orchestrator-keyword-id-${sequence}`,

        adgroupId,

        keyword:
          `orchestrator-keyword-${sequence}`,

        inspectStatus:
          "APPROVED",

        status:
          "ELIGIBLE",

        statusReason:
          null,

        userLock:
          false,

        bidAmount:
          100 * sequence,

        useGroupBidAmount:
          false,
      };
    },
  );
}

function createFixtureDates(
  dateFrom: string,
  dateTo: string,
): string[] {
  if (
    dateFrom ===
    dateTo
  ) {
    return [
      dateFrom,
    ];
  }

  return [
    dateFrom,
    dateTo,
  ];
}

function createStatsResult(input: {
  keywordId: string;
  keywordIndex: number;
  dateFrom: string;
  dateTo: string;
}): NaverSearchAdsKeywordDailyStatsResult {
  const records =
    createFixtureDates(
      input.dateFrom,
      input.dateTo,
    ).map(
      (
        date,
        dateIndex,
      ): NaverSearchAdsKeywordDailyStatsRecord => {
        const metricOffset =
          input.keywordIndex * 10 +
          dateIndex;

        return {
          keywordId:
            input.keywordId,

          date,

          periodStart:
            date,

          periodEnd:
            date,

          impCnt:
            100 + metricOffset,

          clkCnt:
            10 + metricOffset,

          salesAmt:
            1_000 + metricOffset,

          ccnt:
            1 + metricOffset,

          convAmt:
            2_000 + metricOffset,

          avgRnk:
            1 + dateIndex,
        };
      },
    );

  return {
    keywordId:
      input.keywordId,

    dateFrom:
      input.dateFrom,

    dateTo:
      input.dateTo,

    records,
  };
}

function createListPage<T>(
  records: T[],
  baseSearchId: string | null,
): NaverSearchAdsListPage<T> {
  return {
    records,

    recordSize:
      100,

    selector:
      "NEXT",

    baseSearchId,

    nextBaseSearchId:
      null,
  };
}

function createFixtureDependencies(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  keywords:
    readonly NaverSearchAdsKeywordRecord[];
  dateFrom: string;
  dateTo: string;
}): Partial<
  NaverKeywordStatsCollectorDependencies
> {
  return {
    fetchCampaignPage:
      async (
        request,
      ): Promise<
        NaverSearchAdsListPage<
          NaverSearchAdsCampaignRecord
        >
      > => {
        return createListPage(
          [
            input.campaign,
          ],
          request.baseSearchId ??
            null,
        );
      },

    fetchAdgroupPage:
      async (
        request,
      ): Promise<
        NaverSearchAdsListPage<
          NaverSearchAdsAdgroupRecord
        >
      > => {
        if (
          request.campaignId !==
          input.campaign.id
        ) {
          throw new Error(
            "VERIFICATION_CAMPAIGN_SCOPE_MISMATCH",
          );
        }

        return createListPage(
          [
            input.adgroup,
          ],
          request.baseSearchId ??
            null,
        );
      },

    fetchKeywordPage:
      async (
        request,
      ): Promise<
        NaverSearchAdsListPage<
          NaverSearchAdsKeywordRecord
        >
      > => {
        if (
          request.adgroupId !==
          input.adgroup.id
        ) {
          throw new Error(
            "VERIFICATION_ADGROUP_SCOPE_MISMATCH",
          );
        }

        return createListPage(
          [
            ...input.keywords,
          ],
          request.baseSearchId ??
            null,
        );
      },

    fetchKeywordDailyStats:
      async (
        request,
      ): Promise<
        NaverSearchAdsKeywordDailyStatsResult
      > => {
        const keywordIndex =
          input.keywords.findIndex(
            (keyword) =>
              keyword.id ===
              request.keywordId,
          );

        if (keywordIndex < 0) {
          throw new Error(
            "VERIFICATION_KEYWORD_NOT_FOUND",
          );
        }

        if (
          request.dateFrom !==
            input.dateFrom ||
          request.dateTo !==
            input.dateTo
        ) {
          throw new Error(
            "VERIFICATION_DATE_SCOPE_MISMATCH",
          );
        }

        return createStatsResult({
          keywordId:
            request.keywordId,

          keywordIndex,

          dateFrom:
            request.dateFrom,

          dateTo:
            request.dateTo,
        });
      },

    sleep:
      async (): Promise<void> => {
        return;
      },

    now:
      (): number =>
        Date.UTC(
          2026,
          0,
          1,
        ),

    random:
      (): number =>
        0,
  };
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
      .eq(
        "job_id",
        jobId,
      )
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

function storedRowsMatch(input: {
  rows:
    readonly StoredStagingRow[];

  expectedRows: number;

  expectedDates:
    readonly string[];
}): boolean {
  if (
    input.rows.length !==
    input.expectedRows
  ) {
    return false;
  }

  return input.rows.every(
    (
      row,
      index,
    ) => {
      const expectedDate =
        input.expectedDates[
          index %
          input.expectedDates.length
        ];

      return (
        Number(
          row.row_index,
        ) === index &&
        Number(
          row.date_window_index,
        ) ===
          DATE_WINDOW_INDEX &&
        row.date ===
          expectedDate &&
        row.row?.date ===
          expectedDate &&
        typeof row.row
          ?.external_keyword_id ===
          "string" &&
        row.row
          .external_keyword_id
          .length > 0 &&
        typeof row.row_key ===
          "string" &&
        row.row_key.length >
          0 &&
        typeof row.row_fingerprint ===
          "string" &&
        /^[0-9a-f]{64}$/.test(
          row.row_fingerprint,
        )
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
        count:
          "exact",

        head:
          true,
      })
      .eq(
        "job_id",
        jobId,
      );

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
      .eq(
        "id",
        fixture.jobId,
      )
      .maybeSingle();

  if (checkResult.error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
    );
  }

  return (
    checkResult.data ===
    null
  );
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

async function main(): Promise<void> {
  const input =
    readVerificationInput();

  let fixture:
    VerificationFixture | null =
    null;

  let reportStateBefore:
    ReportState | null =
    null;

  let jobStateBefore:
    JobState | null =
    null;

  let cleanupCompleted =
    false;

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

    const claimMatches =
      claimedJob !== null &&
      claimedJob.id ===
        pendingJob.id &&
      claimedJob.status ===
        PROCESSING_STATUS &&
      claimedJob.provider ===
        NAVER_PROVIDER;

    console.log(
      "claim matches fixture:",
      claimMatches,
    );

    if (
      !claimedJob ||
      !claimMatches
    ) {
      throw new Error(
        "VERIFICATION_CLAIM_MISMATCH",
      );
    }

    const context =
      await loadNaverMediaSyncWorkerContext(
        claimedJob,
      );

    const contextMatches =
      context.job.id ===
        claimedJob.id &&
      context.connection.id ===
        claimedJob.connection_id &&
      context.connection.externalAccountId ===
        claimedJob.external_account_id &&
      context.credentials.customerId ===
        claimedJob.external_account_id;

    console.log(
      "worker context matches fixture:",
      contextMatches,
    );

    if (!contextMatches) {
      throw new Error(
        "VERIFICATION_CONTEXT_MISMATCH",
      );
    }

    jobStateBefore =
      await readJobState(
        claimedJob.id,
      );

    const campaign =
      createFixtureCampaign();

    const adgroup =
      createFixtureAdgroup(
        campaign.id,
      );

    const keywords =
      createFixtureKeywords(
        adgroup.id,
      );

    const dates =
      createFixtureDates(
        claimedJob.date_from,
        claimedJob.date_to,
      );

    const expectedRows =
      keywords.length *
      dates.length;

    const result =
      await runNaverSearchAdsStagingOrchestrator({
        job:
          claimedJob,

        credentials:
          context.credentials,

        dateWindowIndex:
          DATE_WINDOW_INDEX,

        stagingBatchSize:
          FIXTURE_BATCH_SIZE,

        requestIntervalMs:
          0,

        keywordChunkSize:
          2,

        chunkPauseMs:
          0,

        maxRetryCount:
          1,

        dependencies:
          createFixtureDependencies({
            campaign,
            adgroup,
            keywords,
            dateFrom:
              claimedJob.date_from,
            dateTo:
              claimedJob.date_to,
          }),
      });

    const collectorMatches =
      result.collector.completed ===
        true &&
      result.collector.campaignPagesRead ===
        1 &&
      result.collector.campaignsRead ===
        1 &&
      result.collector.adgroupPagesRead ===
        1 &&
      result.collector.adgroupsRead ===
        1 &&
      result.collector.keywordPagesRead ===
        1 &&
      result.collector
        .keywordsCompletedInRun ===
        FIXTURE_KEYWORD_COUNT &&
      result.collector
        .statsRequestsSucceeded ===
        FIXTURE_KEYWORD_COUNT &&
      result.collector.retryCount ===
        0;

    console.log(
      "collector result matches:",
      collectorMatches,
    );

    const canonicalCountsMatch =
      result.callbackCount ===
        FIXTURE_KEYWORD_COUNT &&
      result.canonicalRowCount ===
        expectedRows;

    console.log(
      "canonical counts match:",
      canonicalCountsMatch,
    );

    const bufferMatches =
      result.buffer.pendingRowCount ===
        0 &&
      result.buffer.acceptedRowCount ===
        expectedRows &&
      result.buffer.flushedRowCount ===
        expectedRows &&
      result.buffer.busy ===
        false &&
      result.append.maximumBatchSize <=
        FIXTURE_BATCH_SIZE;

    console.log(
      "bounded buffer matches:",
      bufferMatches,
    );

    const appendMatches =
      result.append.submittedRows ===
        expectedRows &&
      result.append.insertedRows ===
        expectedRows &&
      result.append.duplicateRows ===
        0 &&
      result.append.firstRowIndex ===
        0 &&
      result.append.lastRowIndex ===
        expectedRows - 1;

    console.log(
      "append totals match:",
      appendMatches,
    );

    const summaryMatches =
      result.summary.isComplete ===
        true &&
      result.summary.totalRows ===
        expectedRows &&
      result.summary.minRowIndex ===
        0 &&
      result.summary.maxRowIndex ===
        expectedRows - 1 &&
      result.summary
        .distinctRowIndexes ===
        expectedRows &&
      result.summary
        .missingExpectedRows ===
        0 &&
      result.summary
        .outOfRangeRows ===
        0 &&
      result.summary
        .scopeMismatchRows ===
        0 &&
      result.summary
        .canonicalMismatchRows ===
        0;

    console.log(
      "complete summary matches:",
      summaryMatches,
    );

    const storedRows =
      await readStoredStagingRows(
        claimedJob.id,
      );

    const storedRowsContractMatches =
      storedRowsMatch({
        rows:
          storedRows,

        expectedRows,

        expectedDates:
          dates,
      });

    console.log(
      "stored staging rows match:",
      storedRowsContractMatches,
    );

    const jobStateAfter =
      await readJobState(
        claimedJob.id,
      );

    const jobUnchanged =
      jobStateMatches(
        jobStateBefore,
        jobStateAfter,
      ) &&
      jobStateAfter.status ===
        PROCESSING_STATUS;

    console.log(
      "job progress and completion fields unchanged:",
      jobUnchanged,
    );

    const reportStateAfter =
      await readReportState(
        input.reportId,
      );

    const reportUnchanged =
      reportStateMatches(
        reportStateBefore,
        reportStateAfter,
      );

    console.log(
      "report pointers and report_rows unchanged:",
      reportUnchanged,
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
      claimMatches &&
      contextMatches &&
      collectorMatches &&
      canonicalCountsMatch &&
      bufferMatches &&
      appendMatches &&
      summaryMatches &&
      storedRowsContractMatches &&
      jobUnchanged &&
      reportUnchanged &&
      cleanupCompleted &&
      reportUnchangedAfterCleanup;

    console.log(
      "verification passed:",
      verificationPassed,
    );

    if (!verificationPassed) {
      process.exitCode =
        1;
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

        if (
          !emergencyCleanupCompleted
        ) {
          process.exitCode =
            1;
        }
      } catch {
        console.error(
          "emergency cleanup failed:",
          "CLEANUP_ERROR",
        );

        process.exitCode =
          1;
      }
    }

    if (
      reportStateBefore !==
      null
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

        if (
          !finalReportUnchanged
        ) {
          process.exitCode =
            1;
        }
      } catch {
        console.error(
          "final report state check failed:",
          "VERIFICATION_REPORT_STATE_FINAL_CHECK_FAILED",
        );

        process.exitCode =
          1;
      }
    }
  }
}

function readSafeErrorDiagnostic(
  value: unknown,
): Record<string, string | null> {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return {
      name:
        null,

      code:
        null,

      message:
        null,

      details:
        null,

      hint:
        null,
    };
  }

  const record =
    value as Record<
      string,
      unknown
    >;

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

main().catch(
  (
    error: unknown,
  ) => {
    if (
      error instanceof
        NaverSearchAdsStagingOrchestratorError ||
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
        "Naver staging orchestrator verification failed:",
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

      process.exitCode =
        1;

      return;
    }

    if (
      error instanceof Error
    ) {
      console.error(
        "Naver staging orchestrator verification failed:",
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

      process.exitCode =
        1;

      return;
    }

    console.error(
      "Naver staging orchestrator verification failed:",
      "UNKNOWN_ERROR",
    );

    process.exitCode =
      1;
  },
);