import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createMediaCanonicalRowBatchBuffer,
  MediaCanonicalRowBatchBufferError,
  type MediaCanonicalRowBatchFlushContext,
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
  assertMediaSyncStagingComplete,
  MediaSyncStagingSummaryError,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  convertNaverKeywordDailyStatsToCanonicalRows,
  NaverSearchAdsCanonicalRowError,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import {
  collectNaverKeywordDailyStats,
  NaverKeywordStatsCollectorError,
  type NaverKeywordStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";
import type {
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsKeywordDailyStatsRecord,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
  NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

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

const FIXTURE_BATCH_SIZE = 4;
const FIXTURE_KEYWORD_COUNT = 3;
const FIXTURE_DATE_WINDOW_INDEX = 0;

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

type StoredStagingOrderRow = {
  row_index: number;
  date_window_index: number;
  date: string;
  row: {
    external_keyword_id?: unknown;
    date?: unknown;
  };
};

type PipelineMeasurements = {
  callbackCount: number;
  canonicalRowCount: number;

  flushBatchSizes: number[];
  flushRowStartIndexes: number[];
  flushRowEndIndexes: number[];

  appendSubmittedRows: number;
  appendInsertedRows: number;
  appendDuplicateRows: number;

  expectedOrder: Array<{
    externalKeywordId: string;
    date: string;
  }>;
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

function createFixtureCampaign():
  NaverSearchAdsCampaignRecord {
  return {
    id:
      "fixture-campaign-id",

    name:
      "fixture-campaign",

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
      "fixture-adgroup-id",

    campaignId,

    name:
      "fixture-adgroup",

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
      const suffix =
        String(index + 1);

      return {
        id:
          `fixture-keyword-id-${suffix}`,

        adgroupId,

        keyword:
          `fixture-keyword-${suffix}`,

        inspectStatus:
          "APPROVED",

        status:
          "ELIGIBLE",

        statusReason:
          null,

        userLock:
          false,

        bidAmount:
          100 + index,

        useGroupBidAmount:
          false,
      };
    },
  );
}

function createFixtureStatsDates(
  dateFrom: string,
  dateTo: string,
): string[] {
  if (dateFrom === dateTo) {
    return [
      dateFrom,
    ];
  }

  return [
    dateFrom,
    dateTo,
  ];
}

function createFixtureStatsResult(input: {
  keywordId: string;
  keywordIndex: number;
  dateFrom: string;
  dateTo: string;
}): NaverSearchAdsKeywordDailyStatsResult {
  const dates =
    createFixtureStatsDates(
      input.dateFrom,
      input.dateTo,
    );

  const records =
    dates.map(
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

function createFixtureCollectorDependencies(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  keywords: readonly NaverSearchAdsKeywordRecord[];
  dateFrom: string;
  dateTo: string;
}): Partial<NaverKeywordStatsCollectorDependencies> {
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
            "VERIFICATION_FIXTURE_CAMPAIGN_SCOPE_MISMATCH",
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
            "VERIFICATION_FIXTURE_ADGROUP_SCOPE_MISMATCH",
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
      ): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
        const keywordIndex =
          input.keywords.findIndex(
            (keyword) =>
              keyword.id ===
              request.keywordId,
          );

        if (keywordIndex < 0) {
          throw new Error(
            "VERIFICATION_FIXTURE_KEYWORD_NOT_FOUND",
          );
        }

        if (
          request.dateFrom !==
            input.dateFrom ||
          request.dateTo !==
            input.dateTo
        ) {
          throw new Error(
            "VERIFICATION_FIXTURE_DATE_SCOPE_MISMATCH",
          );
        }

        return createFixtureStatsResult({
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
          0,
          0,
          0,
        ),

    random:
      (): number =>
        0,
  };
}

function createPipelineMeasurements():
  PipelineMeasurements {
  return {
    callbackCount:
      0,

    canonicalRowCount:
      0,

    flushBatchSizes:
      [],

    flushRowStartIndexes:
      [],

    flushRowEndIndexes:
      [],

    appendSubmittedRows:
      0,

    appendInsertedRows:
      0,

    appendDuplicateRows:
      0,

    expectedOrder:
      [],
  };
}

function captureExpectedOrder(
  measurements: PipelineMeasurements,
  rows: readonly EtrylueNormalizedMediaRow[],
): void {
  for (const row of rows) {
    const externalKeywordId =
      row.external_keyword_id;

    if (
      typeof externalKeywordId !==
        "string" ||
      !externalKeywordId
    ) {
      throw new Error(
        "VERIFICATION_CANONICAL_KEYWORD_ID_MISSING",
      );
    }

    measurements.expectedOrder.push({
      externalKeywordId,
      date:
        row.date,
    });
  }
}

async function readStoredStagingOrder(
  jobId: string,
): Promise<StoredStagingOrderRow[]> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .select(
        "row_index, date_window_index, date, row",
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
      "VERIFICATION_STAGING_ORDER_READ_FAILED",
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "VERIFICATION_STAGING_ORDER_INVALID_RESULT",
    );
  }

  return data as unknown as StoredStagingOrderRow[];
}

function storedOrderMatches(input: {
  storedRows:
    readonly StoredStagingOrderRow[];

  expectedOrder:
    readonly {
      externalKeywordId: string;
      date: string;
    }[];
}): boolean {
  if (
    input.storedRows.length !==
    input.expectedOrder.length
  ) {
    return false;
  }

  return input.storedRows.every(
    (
      storedRow,
      index,
    ) => {
      const expected =
        input.expectedOrder[index];

      if (!expected) {
        return false;
      }

      return (
        Number(
          storedRow.row_index,
        ) === index &&
        Number(
          storedRow.date_window_index,
        ) ===
          FIXTURE_DATE_WINDOW_INDEX &&
        storedRow.date ===
          expected.date &&
        storedRow.row
          ?.external_keyword_id ===
          expected.externalKeywordId &&
        storedRow.row
          ?.date ===
          expected.date
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
      .select(
        "id",
        {
          count:
            "exact",
          head:
            true,
        },
      )
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

function arraysEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length ===
      right.length &&
    left.every(
      (
        value,
        index,
      ) =>
        value ===
        right[index],
    )
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

  let cleanupCompleted =
    false;

  const measurements =
    createPipelineMeasurements();

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

    if (!claimedJob) {
      throw new Error(
        "VERIFICATION_CLAIM_RETURNED_NULL",
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

    const dependencies =
      createFixtureCollectorDependencies({
        campaign,
        adgroup,
        keywords,
        dateFrom:
          claimedJob.date_from,
        dateTo:
          claimedJob.date_to,
      });

    const batchBuffer =
      createMediaCanonicalRowBatchBuffer({
        maxBatchSize:
          FIXTURE_BATCH_SIZE,

        onFlush:
          async (
            rows,
            flushContext:
              MediaCanonicalRowBatchFlushContext,
          ): Promise<void> => {
            const appendResult =
              await appendMediaSyncStagingBatch({
                job:
                  claimedJob,

                rows,

                rowStartIndex:
                  flushContext.rowStartIndex,

                dateWindowIndex:
                  FIXTURE_DATE_WINDOW_INDEX,
              });

            measurements.flushBatchSizes.push(
              rows.length,
            );

            measurements
              .flushRowStartIndexes
              .push(
                flushContext.rowStartIndex,
              );

            measurements
              .flushRowEndIndexes
              .push(
                flushContext.rowEndIndex,
              );

            measurements.appendSubmittedRows +=
              appendResult.submittedRows;

            measurements.appendInsertedRows +=
              appendResult.insertedRows;

            measurements.appendDuplicateRows +=
              appendResult.duplicateRows;
          },
      });

    const startCursor =
      createNaverKeywordStatsCursor({
        dateWindow: {
          index:
            FIXTURE_DATE_WINDOW_INDEX,

          dateFrom:
            claimedJob.date_from,

          dateTo:
            claimedJob.date_to,
        },
      });

    const collectorResult =
      await collectNaverKeywordDailyStats({
        credentials:
          context.credentials,

        cursor:
          startCursor,

        requestIntervalMs:
          0,

        keywordChunkSize:
          2,

        chunkPauseMs:
          0,

        maxRetryCount:
          1,

        dependencies,

        onKeywordStats:
          async (
            item,
          ): Promise<void> => {
            const canonicalRows =
              convertNaverKeywordDailyStatsToCanonicalRows({
                externalAccountId:
                  claimedJob.external_account_id,

                campaign:
                  item.campaign,

                adgroup:
                  item.adgroup,

                keyword:
                  item.keyword,

                stats:
                  item.stats,
              });

            measurements.callbackCount +=
              1;

            measurements.canonicalRowCount +=
              canonicalRows.length;

            captureExpectedOrder(
              measurements,
              canonicalRows,
            );

            await batchBuffer.pushMany(
              canonicalRows,
            );
          },
      });

    await batchBuffer.flushRemaining();

    const bufferState =
      batchBuffer.getState();

    const expectedRows =
      FIXTURE_KEYWORD_COUNT *
      createFixtureStatsDates(
        claimedJob.date_from,
        claimedJob.date_to,
      ).length;

    const expectedBatchSizes =
      expectedRows === 6
        ? [
            4,
            2,
          ]
        : expectedRows === 3
          ? [
              3,
            ]
          : [];

    const expectedBatchStarts =
      expectedRows === 6
        ? [
            0,
            4,
          ]
        : expectedRows === 3
          ? [
              0,
            ]
          : [];

    const expectedBatchEnds =
      expectedRows === 6
        ? [
            3,
            5,
          ]
        : expectedRows === 3
          ? [
              2,
            ]
          : [];

    const collectorMatches =
      collectorResult.completed ===
        true &&
      collectorResult.campaignPagesRead ===
        1 &&
      collectorResult.campaignsRead ===
        1 &&
      collectorResult.adgroupPagesRead ===
        1 &&
      collectorResult.adgroupsRead ===
        1 &&
      collectorResult.keywordPagesRead ===
        1 &&
      collectorResult.keywordsDiscoveredInRun ===
        FIXTURE_KEYWORD_COUNT &&
      collectorResult.keywordsCompletedInRun ===
        FIXTURE_KEYWORD_COUNT &&
      collectorResult.statsRequestsAttempted ===
        FIXTURE_KEYWORD_COUNT &&
      collectorResult.statsRequestsSucceeded ===
        FIXTURE_KEYWORD_COUNT &&
      collectorResult.retryCount ===
        0 &&
      collectorResult.cursor.completedKeywordCount ===
        FIXTURE_KEYWORD_COUNT;

    console.log(
      "collector fixture contract matches:",
      collectorMatches,
    );

    const canonicalCountsMatch =
      measurements.callbackCount ===
        FIXTURE_KEYWORD_COUNT &&
      measurements.canonicalRowCount ===
        expectedRows &&
      measurements.expectedOrder.length ===
        expectedRows;

    console.log(
      "canonical conversion counts match:",
      canonicalCountsMatch,
    );

    const bufferMatches =
      bufferState.pendingRowCount ===
        0 &&
      bufferState.acceptedRowCount ===
        expectedRows &&
      bufferState.flushedRowCount ===
        expectedRows &&
      bufferState.flushedBatchCount ===
        expectedBatchSizes.length &&
      bufferState.busy ===
        false &&
      arraysEqual(
        measurements.flushBatchSizes,
        expectedBatchSizes,
      ) &&
      arraysEqual(
        measurements.flushRowStartIndexes,
        expectedBatchStarts,
      ) &&
      arraysEqual(
        measurements.flushRowEndIndexes,
        expectedBatchEnds,
      );

    console.log(
      "bounded batch buffer contract matches:",
      bufferMatches,
    );

    const appendMatches =
      measurements.appendSubmittedRows ===
        expectedRows &&
      measurements.appendInsertedRows ===
        expectedRows &&
      measurements.appendDuplicateRows ===
        0;

    console.log(
      "staging append totals match:",
      appendMatches,
    );

    const completeSummary =
      await assertMediaSyncStagingComplete({
        job:
          claimedJob,

        expectedRows,
      });

    const completeSummaryMatches =
      completeSummary.isComplete ===
        true &&
      completeSummary.totalRows ===
        expectedRows &&
      completeSummary.minRowIndex ===
        0 &&
      completeSummary.maxRowIndex ===
        expectedRows - 1 &&
      completeSummary.distinctRowIndexes ===
        expectedRows &&
      completeSummary.rowsInExpectedRange ===
        expectedRows &&
      completeSummary.missingExpectedRows ===
        0 &&
      completeSummary.outOfRangeRows ===
        0 &&
      completeSummary.scopeMismatchRows ===
        0 &&
      completeSummary.blankRowKeyRows ===
        0 &&
      completeSummary.missingFingerprintRows ===
        0 &&
      completeSummary.canonicalMismatchRows ===
        0 &&
      completeSummary.dateWindowCount ===
        1 &&
      completeSummary.dateWindowSummaries.length ===
        1 &&
      completeSummary.dateWindowSummaries[0]
        ?.dateWindowIndex ===
        FIXTURE_DATE_WINDOW_INDEX &&
      completeSummary.dateWindowSummaries[0]
        ?.rowCount ===
        expectedRows;

    console.log(
      "staging complete summary matches:",
      completeSummaryMatches,
    );

    const storedRows =
      await readStoredStagingOrder(
        claimedJob.id,
      );

    const globalOrderPreserved =
      storedOrderMatches({
        storedRows,
        expectedOrder:
          measurements.expectedOrder,
      });

    console.log(
      "global canonical row order preserved:",
      globalOrderPreserved,
    );

    const storedRowCountMatches =
      (
        await readStagingRowCount(
          claimedJob.id,
        )
      ) === expectedRows;

    console.log(
      "stored staging row count matches:",
      storedRowCountMatches,
    );

    const jobStateUnchanged =
      claimedJob.status ===
        PROCESSING_STATUS &&
      claimedJob.progress ===
        pendingJob.progress &&
      claimedJob.raw_rows ===
        pendingJob.raw_rows &&
      claimedJob.normalized_rows ===
        pendingJob.normalized_rows &&
      claimedJob.inserted_rows ===
        pendingJob.inserted_rows &&
      claimedJob.failed_rows ===
        pendingJob.failed_rows &&
      claimedJob.snapshot_ingestion_id ===
        pendingJob.snapshot_ingestion_id;

    console.log(
      "job progress and completion fields unchanged:",
      jobStateUnchanged,
    );

    const reportStateAfterPipeline =
      await readReportState(
        input.reportId,
      );

    const reportUnchangedBeforeCleanup =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterPipeline,
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
      collectorMatches &&
      canonicalCountsMatch &&
      bufferMatches &&
      appendMatches &&
      completeSummaryMatches &&
      globalOrderPreserved &&
      storedRowCountMatches &&
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
        MediaSyncWorkerRepositoryError
    ) {
      console.error(
        "Naver staging pipeline verification failed:",
        error.code,
      );

      console.error(
        "repository error diagnostic:",
        JSON.stringify(
          readSafeErrorDiagnostic(
            error,
          ),
        ),
      );

      console.error(
        "repository cause diagnostic:",
        JSON.stringify(
          readSafeErrorDiagnostic(
            error.cause,
          ),
        ),
      );

      process.exitCode = 1;
      return;
    }

    if (
      error instanceof Error
    ) {
      console.error(
        "Naver staging pipeline verification failed:",
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
        "error cause diagnostic:",
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
      "Naver staging pipeline verification failed:",
      "UNKNOWN_ERROR",
    );

    process.exitCode = 1;
  },
);