import { setTimeout as delay } from "node:timers/promises";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsKeywordDailyStats,
  fetchNaverSearchAdsKeywordPage,
  NaverSearchAdsApiError,
  type NaverSearchAdsKeywordDailyStatsRecord,
  type NaverSearchAdsKeywordRecord,
} from "../src/lib/media-sync/naver-searchads-api";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const REPORTS_TABLE = "reports";
const REPORT_ROWS_TABLE = "report_rows";

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

const HIERARCHY_RECORD_SIZE = 100;

const MAX_CAMPAIGN_PAGES = 100;
const MAX_ADGROUP_PAGES = 100;
const MAX_KEYWORD_PAGES = 100;

const MAX_KEYWORD_SAMPLE_SIZE = 100;

const STATS_REQUEST_INTERVAL_MS = 1_000;

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

type KeywordStatsRequestMeasurement = {
  keywordId: string;
  succeeded: boolean;
  status: number | null;
  errorCode: string | null;
  latencyMs: number;
  recordCount: number;
  requestScopePreserved: boolean;
  datesWithinRange: boolean;
  numericFieldsValid: boolean;
};

type KeywordCollectionResult = {
  keywords: NaverSearchAdsKeywordRecord[];
  campaignPagesRead: number;
  campaignsRead: number;
  adgroupPagesRead: number;
  adgroupsRead: number;
  keywordPagesRead: number;
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

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(
      `${argumentName} argument must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
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
    reportId: normalizeRequiredArgument(
      reportIdArgument,
      "reportId",
    ),
    connectionId:
      normalizeRequiredArgument(
        connectionIdArgument,
        "connectionId",
      ),
    workspaceId:
      normalizeRequiredArgument(
        workspaceIdArgument,
        "workspaceId",
      ),
    advertiserId:
      normalizeRequiredArgument(
        advertiserIdArgument,
        "advertiserId",
      ),
    createdBy:
      normalizeRequiredArgument(
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
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
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
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
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
  const supabase = getSupabaseAdmin();

  const reportResult = await supabase
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

  const rowsResult = await supabase
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
        .current_ingestion_id ?? null,
    publishedIngestionId:
      reportResult.data
        .published_ingestion_id ?? null,
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

async function deleteVerificationJob(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", fixture.jobId)
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

  return data?.id === fixture.jobId;
}

async function verifyJobDeleted(
  jobId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
    );
  }

  return data === null;
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const deleted =
    await deleteVerificationJob(fixture);

  if (!deleted) {
    return false;
  }

  return verifyJobDeleted(
    fixture.jobId,
  );
}

function appendUniqueKeywords(
  destination: NaverSearchAdsKeywordRecord[],
  seenKeywordIds: Set<string>,
  source: readonly NaverSearchAdsKeywordRecord[],
): void {
  for (const keyword of source) {
    if (
      destination.length >=
      MAX_KEYWORD_SAMPLE_SIZE
    ) {
      return;
    }

    if (seenKeywordIds.has(keyword.id)) {
      continue;
    }

    seenKeywordIds.add(keyword.id);
    destination.push(keyword);
  }
}

async function collectKeywordSample(
  credentials: Parameters<
    typeof fetchNaverSearchAdsCampaignPage
  >[0]["credentials"],
): Promise<KeywordCollectionResult> {
  const keywords:
    NaverSearchAdsKeywordRecord[] = [];

  const seenKeywordIds =
    new Set<string>();

  let campaignPagesRead = 0;
  let campaignsRead = 0;
  let adgroupPagesRead = 0;
  let adgroupsRead = 0;
  let keywordPagesRead = 0;

  let campaignBaseSearchId:
    | string
    | null = null;

  for (
    let campaignPageNumber = 1;
    campaignPageNumber <= MAX_CAMPAIGN_PAGES;
    campaignPageNumber += 1
  ) {
    const campaignPage =
      await fetchNaverSearchAdsCampaignPage({
        credentials,
        baseSearchId:
          campaignBaseSearchId,
        recordSize:
          HIERARCHY_RECORD_SIZE,
        selector: "NEXT",
      });

    campaignPagesRead += 1;
    campaignsRead +=
      campaignPage.records.length;

    for (
      const campaign
      of campaignPage.records
    ) {
      let adgroupBaseSearchId:
        | string
        | null = null;

      for (
        let adgroupPageNumber = 1;
        adgroupPageNumber <= MAX_ADGROUP_PAGES;
        adgroupPageNumber += 1
      ) {
        const adgroupPage =
          await fetchNaverSearchAdsAdgroupPage({
            credentials,
            campaignId: campaign.id,
            baseSearchId:
              adgroupBaseSearchId,
            recordSize:
              HIERARCHY_RECORD_SIZE,
            selector: "NEXT",
          });

        adgroupPagesRead += 1;
        adgroupsRead +=
          adgroupPage.records.length;

        for (
          const adgroup
          of adgroupPage.records
        ) {
          let keywordBaseSearchId:
            | string
            | null = null;

          for (
            let keywordPageNumber = 1;
            keywordPageNumber <= MAX_KEYWORD_PAGES;
            keywordPageNumber += 1
          ) {
            const keywordPage =
              await fetchNaverSearchAdsKeywordPage({
                credentials,
                adgroupId: adgroup.id,
                baseSearchId:
                  keywordBaseSearchId,
                recordSize:
                  HIERARCHY_RECORD_SIZE,
                selector: "NEXT",
              });

            keywordPagesRead += 1;

            appendUniqueKeywords(
              keywords,
              seenKeywordIds,
              keywordPage.records,
            );

            if (
              keywords.length >=
              MAX_KEYWORD_SAMPLE_SIZE
            ) {
              return {
                keywords,
                campaignPagesRead,
                campaignsRead,
                adgroupPagesRead,
                adgroupsRead,
                keywordPagesRead,
              };
            }

            if (
              keywordPage.records.length <
              HIERARCHY_RECORD_SIZE
            ) {
              break;
            }

            if (
              !keywordPage.nextBaseSearchId ||
              keywordPage.nextBaseSearchId ===
                keywordBaseSearchId
            ) {
              throw new Error(
                "VERIFICATION_KEYWORD_CURSOR_INVALID",
              );
            }

            keywordBaseSearchId =
              keywordPage.nextBaseSearchId;
          }
        }

        if (
          adgroupPage.records.length <
          HIERARCHY_RECORD_SIZE
        ) {
          break;
        }

        if (
          !adgroupPage.nextBaseSearchId ||
          adgroupPage.nextBaseSearchId ===
            adgroupBaseSearchId
        ) {
          throw new Error(
            "VERIFICATION_ADGROUP_CURSOR_INVALID",
          );
        }

        adgroupBaseSearchId =
          adgroupPage.nextBaseSearchId;
      }
    }

    if (
      campaignPage.records.length <
      HIERARCHY_RECORD_SIZE
    ) {
      return {
        keywords,
        campaignPagesRead,
        campaignsRead,
        adgroupPagesRead,
        adgroupsRead,
        keywordPagesRead,
      };
    }

    if (
      !campaignPage.nextBaseSearchId ||
      campaignPage.nextBaseSearchId ===
        campaignBaseSearchId
    ) {
      throw new Error(
        "VERIFICATION_CAMPAIGN_CURSOR_INVALID",
      );
    }

    campaignBaseSearchId =
      campaignPage.nextBaseSearchId;
  }

  throw new Error(
    "VERIFICATION_CAMPAIGN_PAGE_LIMIT_EXCEEDED",
  );
}

function statsNumbersAreValid(
  records:
    readonly NaverSearchAdsKeywordDailyStatsRecord[],
): boolean {
  return records.every((record) =>
    [
      record.impCnt,
      record.clkCnt,
      record.salesAmt,
      record.ccnt,
      record.convAmt,
      record.avgRnk,
    ].every(
      (value) =>
        value === null ||
        Number.isFinite(value),
    ),
  );
}

function statsDatesAreWithinRange(
  records:
    readonly NaverSearchAdsKeywordDailyStatsRecord[],
  dateFrom: string,
  dateTo: string,
): boolean {
  return records.every(
    (record) =>
      record.date >= dateFrom &&
      record.date <= dateTo &&
      record.periodStart ===
        record.date &&
      record.periodEnd ===
        record.date,
  );
}

function getElapsedMilliseconds(
  startedAt: bigint,
): number {
  const elapsedNanoseconds =
    process.hrtime.bigint() -
    startedAt;

  return (
    Number(elapsedNanoseconds) /
    1_000_000
  );
}

async function measureKeywordStatsRequest(input: {
  credentials: Parameters<
    typeof fetchNaverSearchAdsKeywordDailyStats
  >[0]["credentials"];
  keyword: NaverSearchAdsKeywordRecord;
  dateFrom: string;
  dateTo: string;
}): Promise<KeywordStatsRequestMeasurement> {
  const startedAt =
    process.hrtime.bigint();

  try {
    const result =
      await fetchNaverSearchAdsKeywordDailyStats({
        credentials:
          input.credentials,
        keywordId:
          input.keyword.id,
        dateFrom:
          input.dateFrom,
        dateTo:
          input.dateTo,
      });

    return {
      keywordId:
        input.keyword.id,
      succeeded: true,
      status: 200,
      errorCode: null,
      latencyMs:
        getElapsedMilliseconds(
          startedAt,
        ),
      recordCount:
        result.records.length,
      requestScopePreserved:
        result.keywordId ===
          input.keyword.id &&
        result.dateFrom ===
          input.dateFrom &&
        result.dateTo ===
          input.dateTo,
      datesWithinRange:
        statsDatesAreWithinRange(
          result.records,
          input.dateFrom,
          input.dateTo,
        ),
      numericFieldsValid:
        statsNumbersAreValid(
          result.records,
        ),
    };
  } catch (error) {
    if (
      error instanceof
      NaverSearchAdsApiError
    ) {
      return {
        keywordId:
          input.keyword.id,
        succeeded: false,
        status:
          error.status,
        errorCode:
          error.code,
        latencyMs:
          getElapsedMilliseconds(
            startedAt,
          ),
        recordCount: 0,
        requestScopePreserved: false,
        datesWithinRange: false,
        numericFieldsValid: false,
      };
    }

    throw error;
  }
}

function calculateAverage(
  values: readonly number[],
): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce(
    (sum, value) =>
      sum + value,
    0,
  );

  return total / values.length;
}

function calculatePercentile(
  values: readonly number[],
  percentile: number,
): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues =
    [...values].sort(
      (left, right) =>
        left - right,
    );

  const rawIndex =
    Math.ceil(
      percentile *
        sortedValues.length,
    ) - 1;

  const boundedIndex =
    Math.min(
      sortedValues.length - 1,
      Math.max(0, rawIndex),
    );

  return (
    sortedValues[
      boundedIndex
    ] ?? 0
  );
}

function roundToTwoDecimals(
  value: number,
): number {
  return (
    Math.round(
      value * 100,
    ) / 100
  );
}

function buildStatusCounts(
  measurements:
    readonly KeywordStatsRequestMeasurement[],
): Record<string, number> {
  const statusCounts:
    Record<string, number> = {};

  for (
    const measurement
    of measurements
  ) {
    const statusKey =
      measurement.status === null
        ? "null"
        : measurement.status.toString();

    statusCounts[statusKey] =
      (statusCounts[statusKey] ?? 0) +
      1;
  }

  return statusCounts;
}

function buildErrorCodeCounts(
  measurements:
    readonly KeywordStatsRequestMeasurement[],
): Record<string, number> {
  const errorCodeCounts:
    Record<string, number> = {};

  for (
    const measurement
    of measurements
  ) {
    if (!measurement.errorCode) {
      continue;
    }

    errorCodeCounts[
      measurement.errorCode
    ] =
      (
        errorCodeCounts[
          measurement.errorCode
        ] ?? 0
      ) + 1;
  }

  return errorCodeCounts;
}

async function main(): Promise<void> {
  const input =
    readVerificationInput();

  let fixture:
    | VerificationFixture
    | null = null;

  let cleanupCompleted = false;

  try {
    await assertNoExistingPendingNaverJob();

    await assertNoExistingActiveJobForReport(
      input.reportId,
    );

    const reportStateBefore =
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
    console.log(
      "configured keyword sample limit:",
      MAX_KEYWORD_SAMPLE_SIZE,
    );
    console.log(
      "configured stats concurrency:",
      1,
    );
    console.log(
      "configured minimum request interval ms:",
      STATS_REQUEST_INTERVAL_MS,
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
        dataLevel: "keyword",
        mode: "snapshot_replace",
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
        pendingJob.id &&
      context.connection.id ===
        input.connectionId &&
      context.connection.workspaceId ===
        input.workspaceId &&
      context.connection.advertiserId ===
        input.advertiserId &&
      context.credentials.customerId ===
        context.connection
          .externalAccountId;

    console.log(
      "worker context matches fixture:",
      contextMatchesFixture,
    );

    const keywordCollection =
      await collectKeywordSample(
        context.credentials,
      );

    console.log(
      "hierarchy campaign pages read:",
      keywordCollection
        .campaignPagesRead,
    );
    console.log(
      "hierarchy campaigns read:",
      keywordCollection
        .campaignsRead,
    );
    console.log(
      "hierarchy adgroup pages read:",
      keywordCollection
        .adgroupPagesRead,
    );
    console.log(
      "hierarchy adgroups read:",
      keywordCollection
        .adgroupsRead,
    );
    console.log(
      "hierarchy keyword pages read:",
      keywordCollection
        .keywordPagesRead,
    );
    console.log(
      "keyword sample acquired:",
      keywordCollection
        .keywords.length,
    );
    console.log(
      "keyword sample reached limit:",
      keywordCollection
        .keywords.length ===
        MAX_KEYWORD_SAMPLE_SIZE,
    );

    if (
      keywordCollection
        .keywords.length === 0
    ) {
      throw new Error(
        "VERIFICATION_KEYWORD_NOT_FOUND",
      );
    }

    const measurements:
      KeywordStatsRequestMeasurement[] =
      [];

    const statsCollectionStartedAt =
      process.hrtime.bigint();

    for (
      let keywordIndex = 0;
      keywordIndex <
      keywordCollection.keywords.length;
      keywordIndex += 1
    ) {
      const keyword =
        keywordCollection
          .keywords[keywordIndex];

      if (!keyword) {
        throw new Error(
          "VERIFICATION_KEYWORD_SAMPLE_INVALID",
        );
      }

      const measurement =
        await measureKeywordStatsRequest({
          credentials:
            context.credentials,
          keyword,
          dateFrom:
            input.dateFrom,
          dateTo:
            input.dateTo,
        });

      measurements.push(
        measurement,
      );

      console.log(
        [
          "stats request",
          `${keywordIndex + 1}/${keywordCollection.keywords.length}`,
          `success=${measurement.succeeded}`,
          `status=${measurement.status ?? "null"}`,
          `error=${measurement.errorCode ?? "null"}`,
          `latencyMs=${measurement.latencyMs}`,
          `records=${measurement.recordCount}`,
        ].join(" "),
      );

      const hasNextKeyword =
        keywordIndex <
        keywordCollection
          .keywords.length -
          1;

      if (hasNextKeyword) {
        await delay(
          STATS_REQUEST_INTERVAL_MS,
        );
      }
    }

    const statsCollectionElapsedMs =
      getElapsedMilliseconds(
        statsCollectionStartedAt,
      );

    const successfulMeasurements =
      measurements.filter(
        (measurement) =>
          measurement.succeeded,
      );

    const failedMeasurements =
      measurements.filter(
        (measurement) =>
          !measurement.succeeded,
      );

    const latencies =
      measurements.map(
        (measurement) =>
          measurement.latencyMs,
      );

    const totalRecordsReturned =
      measurements.reduce(
        (sum, measurement) =>
          sum +
          measurement.recordCount,
        0,
      );

    const requestsAttempted =
      measurements.length;

    const requestsSucceeded =
      successfulMeasurements.length;

    const requestsFailed =
      failedMeasurements.length;

    const successRate =
      requestsAttempted > 0
        ? requestsSucceeded /
          requestsAttempted
        : 0;

    const rateLimitResponses =
      measurements.filter(
        (measurement) =>
          measurement.status === 429,
      ).length;

    const serverErrorResponses =
      measurements.filter(
        (measurement) =>
          measurement.status !== null &&
          measurement.status >= 500 &&
          measurement.status <= 599,
      ).length;

    const allSuccessfulScopesPreserved =
      successfulMeasurements.every(
        (measurement) =>
          measurement
            .requestScopePreserved,
      );

    const allSuccessfulDatesValid =
      successfulMeasurements.every(
        (measurement) =>
          measurement
            .datesWithinRange,
      );

    const allSuccessfulNumbersValid =
      successfulMeasurements.every(
        (measurement) =>
          measurement
            .numericFieldsValid,
      );

    console.log(
      "stats requests attempted:",
      requestsAttempted,
    );
    console.log(
      "stats requests succeeded:",
      requestsSucceeded,
    );
    console.log(
      "stats requests failed:",
      requestsFailed,
    );
    console.log(
      "stats request success rate:",
      roundToTwoDecimals(
        successRate * 100,
      ),
    );
    console.log(
      "stats HTTP 429 responses:",
      rateLimitResponses,
    );
    console.log(
      "stats HTTP 5xx responses:",
      serverErrorResponses,
    );
    console.log(
      "stats status counts:",
      JSON.stringify(
        buildStatusCounts(
          measurements,
        ),
      ),
    );
    console.log(
      "stats error code counts:",
      JSON.stringify(
        buildErrorCodeCounts(
          measurements,
        ),
      ),
    );
    console.log(
      "stats total records returned:",
      totalRecordsReturned,
    );
    console.log(
      "stats total elapsed ms:",
      statsCollectionElapsedMs,
    );
    console.log(
      "stats average latency ms:",
      roundToTwoDecimals(
        calculateAverage(
          latencies,
        ),
      ),
    );
    console.log(
      "stats minimum latency ms:",
      latencies.length > 0
        ? Math.min(...latencies)
        : 0,
    );
    console.log(
      "stats maximum latency ms:",
      latencies.length > 0
        ? Math.max(...latencies)
        : 0,
    );
    console.log(
      "stats p50 latency ms:",
      calculatePercentile(
        latencies,
        0.5,
      ),
    );
    console.log(
      "stats p95 latency ms:",
      calculatePercentile(
        latencies,
        0.95,
      ),
    );
    console.log(
      "stats successful scopes preserved:",
      allSuccessfulScopesPreserved,
    );
    console.log(
      "stats successful dates valid:",
      allSuccessfulDatesValid,
    );
    console.log(
      "stats successful numeric fields valid:",
      allSuccessfulNumbersValid,
    );

    const reportStateAfterRequest =
      await readReportState(
        input.reportId,
      );

    const reportDataUnchanged =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterRequest,
      );

    console.log(
      "report pointers and rows unchanged:",
      reportDataUnchanged,
    );

    cleanupCompleted =
      await cleanupFixture(
        fixture,
      );

    console.log(
      "verification fixture deleted:",
      cleanupCompleted,
    );

    const reportStateAfterCleanup =
      await readReportState(
        input.reportId,
      );

    const reportDataStillUnchanged =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterCleanup,
      );

    console.log(
      "report data unchanged after cleanup:",
      reportDataStillUnchanged,
    );

    const verificationPassed =
      claimMatchesFixture &&
      contextMatchesFixture &&
      requestsAttempted > 0 &&
      requestsSucceeded ===
        requestsAttempted &&
      rateLimitResponses === 0 &&
      serverErrorResponses === 0 &&
      allSuccessfulScopesPreserved &&
      allSuccessfulDatesValid &&
      allSuccessfulNumbersValid &&
      reportDataUnchanged &&
      cleanupCompleted &&
      reportDataStillUnchanged;

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

        if (
          !emergencyCleanupCompleted
        ) {
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
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof
    NaverSearchAdsApiError
  ) {
    console.error(
      "Naver sequential stats verification failed:",
      error.code,
      error.status ?? "",
    );

    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    MediaSyncWorkerRepositoryError
  ) {
    console.error(
      "Naver sequential stats verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    MediaSyncJobsRepositoryError
  ) {
    console.error(
      "Naver sequential stats verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "Naver sequential stats verification failed:",
      error.message.startsWith(
        "VERIFICATION_",
      )
        ? error.message
        : error.name,
    );

    process.exitCode = 1;
    return;
  }

  console.error(
    "Naver sequential stats verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});