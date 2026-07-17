import assert from "node:assert/strict";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  readNaverSearchAdsCombinedProcessingCheckpoint,
  MediaSyncCombinedProcessingCheckpointError,
  type NaverSearchAdsCombinedProcessingCheckpoint,
} from "../src/lib/media-sync/media-sync-combined-processing-checkpoint-repository";
import {
  createPendingMediaSyncJob,
  parseMediaSyncJobRecord,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  getNaverSearchAdsCombinedStagingSummary,
  MediaSyncStagingSummaryError,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  processClaimedNaverMediaSyncJob,
  MediaSyncWorkerOrchestrationError,
  type ProcessNaverMediaSyncJobOptions,
  type ProcessNaverMediaSyncJobPartialResult,
} from "../src/lib/media-sync/media-sync-worker-orchestration-repository";
import {
  claimNextNaverMediaSyncJob,
  releaseNaverMediaSyncJobForResume,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import type {
  NaverAuthoritativeEntityStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import type {
  NaverKeywordStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import type {
  NaverSearchAdsAdRecord,
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsEntityDailyStatsResult,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
  NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
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

const DATE_WINDOW_INDEX =
  0;

const PARITY_DATE_FROM =
  "2026-05-01";

const PARITY_DATE_TO =
  "2026-05-02";

const STAGING_BATCH_SIZE =
  3;

const MAX_STATS_REQUESTS_PER_RUN =
  20;

const MAX_DISCOVERY_PAGES_PER_RUN =
  20;

const MATERIALIZATION_BLOCK_SENTINEL =
  "VERIFICATION_MATERIALIZATION_BLOCKED";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VerificationInput = {
  reportId:
    string;
  connectionId:
    string;
  workspaceId:
    string;
  advertiserId:
    string;
  createdBy:
    string;
  dateFrom:
    string;
  dateTo:
    string;
};

type VerificationFixture = {
  jobId:
    string;
  reportId:
    string;
  workspaceId:
    string;
  advertiserId:
    string;
};

type ReportState = {
  currentIngestionId:
    string | null;
  publishedIngestionId:
    string | null;
  reportRowsCount:
    number;
};

type StoredStagingRow = {
  row_index:
    number | string;
  date_window_index:
    number;
  date:
    string;
  row_key:
    string;
  row_fingerprint:
    string;
  row:
    EtrylueNormalizedMediaRow;
};

type PhaseMeasurement = {
  name:
    "keyword-partial" |
    "authoritative-partial" |
    "combined-completed";
  claimedAttemptCount:
    number;
  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint;
  stagingRowCount:
    number;
};

type MaterializationGuards = {
  materializationCalls:
    number;
  activationCalls:
    number;
  finalizationCalls:
    number;
};

type UnknownRecord =
  Record<string, unknown>;

const campaigns:
  NaverSearchAdsCampaignRecord[] = [
    {
      id:
        "combined-live-web-campaign",
      name:
        "Combined Live Powerlink",
      campaignType:
        "WEB_SITE",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "combined-live-shopping-campaign",
      name:
        "Combined Live Shopping",
      campaignType:
        "SHOPPING",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "combined-live-brand-campaign",
      name:
        "Combined Live Brand Search",
      campaignType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const webAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "combined-live-web-adgroup",
      campaignId:
        "combined-live-web-campaign",
      name:
        "Combined Live Powerlink Group",
      adgroupType:
        "WEB_SITE",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const shoppingAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "combined-live-shopping-adgroup",
      campaignId:
        "combined-live-shopping-campaign",
      name:
        "Combined Live Shopping Group",
      adgroupType:
        "SHOPPING_PRODUCT_AD",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const brandAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "combined-live-brand-adgroup-1",
      campaignId:
        "combined-live-brand-campaign",
      name:
        "Combined Live Brand Group 1",
      adgroupType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "combined-live-brand-adgroup-2",
      campaignId:
        "combined-live-brand-campaign",
      name:
        "Combined Live Brand Group 2",
      adgroupType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const webKeywords:
  NaverSearchAdsKeywordRecord[] = [
    {
      id:
        "combined-live-keyword-1",
      adgroupId:
        "combined-live-web-adgroup",
      keyword:
        "combined live keyword 1",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      bidAmount:
        500,
      useGroupBidAmount:
        false,
    },
    {
      id:
        "combined-live-keyword-2",
      adgroupId:
        "combined-live-web-adgroup",
      keyword:
        "combined live keyword 2",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      bidAmount:
        600,
      useGroupBidAmount:
        false,
    },
  ];

const shoppingAds:
  NaverSearchAdsAdRecord[] = [
    {
      id:
        "combined-live-shopping-ad-1",
      adgroupId:
        "combined-live-shopping-adgroup",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "combined-live-product-1",
    },
    {
      id:
        "combined-live-shopping-ad-2",
      adgroupId:
        "combined-live-shopping-adgroup",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "combined-live-product-2",
    },
    {
      id:
        "combined-live-shopping-ad-3",
      adgroupId:
        "combined-live-shopping-adgroup",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "combined-live-product-3",
    },
  ];

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
  maxLength =
    200,
): string {
  if (typeof value !==
      "string") {
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

function readVerificationInput():
  VerificationInput {
  const [
    reportIdArgument,
    connectionIdArgument,
    workspaceIdArgument,
    advertiserIdArgument,
    createdByArgument,
    dateFromArgument,
    dateToArgument,
  ] =
    process.argv.slice(
      2,
    );

  const dateFrom =
    normalizeRequiredArgument(
      dateFromArgument,
      "dateFrom",
      10,
    );

  const dateTo =
    normalizeRequiredArgument(
      dateToArgument,
      "dateTo",
      10,
    );

  if (
    dateFrom !==
      PARITY_DATE_FROM ||
    dateTo !==
      PARITY_DATE_TO
  ) {
    throw new Error(
      "VERIFICATION_REQUIRES_2026_05_01_TO_2026_05_02",
    );
  }

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

    dateFrom,
    dateTo,
  };
}

function isWorkerEnabled():
  boolean {
  const value =
    String(
      process.env
        .MEDIA_SYNC_WORKER_ENABLED ??
      "",
    )
      .trim()
      .toLowerCase();

  return (
    value === "1" ||
    value === "true" ||
    value === "yes" ||
    value === "on"
  );
}

function stableJson(
  value: unknown,
): string {
  if (
    value === undefined
  ) {
    return "undefined";
  }

  if (
    value === null ||
    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value,
    ) ??
      "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(
        stableJson,
      )
      .join(",")}]`;
  }

  const record =
    value as
      Record<string, unknown>;

  return `{${Object.keys(
    record,
  )
    .sort()
    .map(
      (
        key,
      ) =>
        `${JSON.stringify(
          key,
        )}:${stableJson(
          record[key],
        )}`,
    )
    .join(",")}}`;
}

function page<T>(
  records:
    readonly T[],
): NaverSearchAdsListPage<T> {
  return {
    records: [
      ...records,
    ],
    nextBaseSearchId:
      null,
    recordSize:
      100,
    selector:
      "NEXT",
    baseSearchId:
      null,
  };
}

function keywordStats(
  keywordId: string,
): NaverSearchAdsKeywordDailyStatsResult {
  return {
    keywordId,
    dateFrom:
      PARITY_DATE_FROM,
    dateTo:
      PARITY_DATE_TO,
    records: [
      {
        keywordId,
        date:
          PARITY_DATE_TO,
        periodStart:
          PARITY_DATE_TO,
        periodEnd:
          PARITY_DATE_TO,
        impCnt:
          40,
        clkCnt:
          4,
        salesAmt:
          400,
        ccnt:
          2,
        convAmt:
          900,
        avgRnk:
          2.2,
      },
      {
        keywordId,
        date:
          PARITY_DATE_FROM,
        periodStart:
          PARITY_DATE_FROM,
        periodEnd:
          PARITY_DATE_FROM,
        impCnt:
          30,
        clkCnt:
          3,
        salesAmt:
          300,
        ccnt:
          1,
        convAmt:
          700,
        avgRnk:
          1.8,
      },
    ],
  };
}

function entityStats(
  entityId: string,
  entityType:
    | "adgroup"
    | "ad",
): NaverSearchAdsEntityDailyStatsResult {
  return {
    entityId,
    entityType,
    dateFrom:
      PARITY_DATE_FROM,
    dateTo:
      PARITY_DATE_TO,
    records: [
      {
        entityId,
        entityType,
        date:
          PARITY_DATE_TO,
        periodStart:
          PARITY_DATE_TO,
        periodEnd:
          PARITY_DATE_TO,
        impCnt:
          20,
        clkCnt:
          2,
        salesAmt:
          200,
        ccnt:
          1,
        convAmt:
          500,
      },
      {
        entityId,
        entityType,
        date:
          PARITY_DATE_FROM,
        periodStart:
          PARITY_DATE_FROM,
        periodEnd:
          PARITY_DATE_FROM,
        impCnt:
          10,
        clkCnt:
          1,
        salesAmt:
          100,
        ccnt:
          0,
        convAmt:
          0,
      },
    ],
  };
}

function getCampaignAdgroups(
  campaignId: string,
): NaverSearchAdsAdgroupRecord[] {
  if (
    campaignId ===
    "combined-live-web-campaign"
  ) {
    return webAdgroups;
  }

  if (
    campaignId ===
    "combined-live-shopping-campaign"
  ) {
    return shoppingAdgroups;
  }

  if (
    campaignId ===
    "combined-live-brand-campaign"
  ) {
    return brandAdgroups;
  }

  return [];
}

function createKeywordDependencies():
  Partial<
    NaverKeywordStatsCollectorDependencies
  > {
  let now =
    Date.parse(
      "2026-07-14T00:00:00.000Z",
    );

  return {
    fetchCampaignPage:
      async () =>
        page(
          campaigns,
        ),

    fetchAdgroupPage:
      async (
        input,
      ) =>
        page(
          getCampaignAdgroups(
            input.campaignId,
          ),
        ),

    fetchKeywordPage:
      async (
        input,
      ) =>
        page(
          input.adgroupId ===
            "combined-live-web-adgroup"
            ? webKeywords
            : [],
        ),

    fetchKeywordDailyStats:
      async (
        input,
      ) =>
        keywordStats(
          input.keywordId,
        ),

    sleep:
      async () =>
        undefined,

    now:
      () => {
        now +=
          1_000;

        return now;
      },

    random:
      () =>
        0,
  };
}

function createAuthoritativeDependencies():
  Partial<
    NaverAuthoritativeEntityStatsCollectorDependencies
  > {
  let now =
    Date.parse(
      "2026-07-14T01:00:00.000Z",
    );

  return {
    fetchCampaignPage:
      async () =>
        page(
          campaigns,
        ),

    fetchAdgroupPage:
      async (
        input,
      ) =>
        page(
          getCampaignAdgroups(
            input.campaignId,
          ),
        ),

    fetchAdPage:
      async (
        input,
      ) =>
        page(
          input.adgroupId ===
            "combined-live-shopping-adgroup"
            ? shoppingAds
            : [],
        ),

    fetchEntityDailyStats:
      async (
        input,
      ) => {
        assert.ok(
          input.entityType ===
            "ad" ||
          input.entityType ===
            "adgroup",
          "Authoritative fixture requested an invalid entity type.",
        );

        return entityStats(
          input.entityId,
          input.entityType,
        );
      },

    sleep:
      async () =>
        undefined,

    now:
      () => {
        now +=
          1_000;

        return now;
      },

    random:
      () =>
        0,
  };
}

async function assertNoExistingPendingNaverJob():
  Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
      .select(
        "id",
      )
      .eq(
        "status",
        PENDING_STATUS,
      )
      .eq(
        "provider",
        NAVER_PROVIDER,
      )
      .limit(
        1,
      );

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_QUEUE_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(
      data,
    ) &&
    data.length >
      0
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

  const {
    data,
    error,
  } =
    await supabase
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
      .select(
        "id, status",
      )
      .eq(
        "report_id",
        reportId,
      )
      .in(
        "status",
        [
          PENDING_STATUS,
          PROCESSING_STATUS,
        ],
      )
      .limit(
        1,
      );

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(
      data,
    ) &&
    data.length >
      0
  ) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_ALREADY_EXISTS",
    );
  }
}

async function assertOnlyFixturePendingJob(
  jobId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
      .select(
        "id",
      )
      .eq(
        "status",
        PENDING_STATUS,
      )
      .eq(
        "provider",
        NAVER_PROVIDER,
      )
      .limit(
        2,
      );

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_FIXTURE_CHECK_FAILED",
    );
  }

  if (
    !Array.isArray(
      data,
    ) ||
    data.length !==
      1 ||
    data[0]?.id !==
      jobId
  ) {
    throw new Error(
      "VERIFICATION_PENDING_FIXTURE_NOT_EXCLUSIVE",
    );
  }
}

async function readReportState(
  reportId: string,
): Promise<
  ReportState
> {
  const supabase =
    getSupabaseAdmin();

  const reportResult =
    await supabase
      .from(
        REPORTS_TABLE,
      )
      .select(
        "current_ingestion_id, published_ingestion_id",
      )
      .eq(
        "id",
        reportId,
      )
      .maybeSingle();

  if (
    reportResult.error
  ) {
    throw new Error(
      "VERIFICATION_REPORT_STATE_READ_FAILED",
    );
  }

  if (
    !reportResult.data
  ) {
    throw new Error(
      "VERIFICATION_REPORT_NOT_FOUND",
    );
  }

  const rowsResult =
    await supabase
      .from(
        REPORT_ROWS_TABLE,
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
        "report_id",
        reportId,
      );

  if (
    rowsResult.error
  ) {
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
      rowsResult.count ??
      0,
  };
}

function reportStateMatches(
  before:
    ReportState,
  after:
    ReportState,
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

async function readJobRecord(
  jobId: string,
): Promise<
  MediaSyncJobRecord
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
      .select(
        "*",
      )
      .eq(
        "id",
        jobId,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_STATE_READ_FAILED",
    );
  }

  if (!data) {
    throw new Error(
      "VERIFICATION_JOB_STATE_NOT_FOUND",
    );
  }

  return parseMediaSyncJobRecord(
    data,
  );
}

async function readStoredStagingRows(
  jobId: string,
): Promise<
  StoredStagingRow[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
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
        ].join(
          ", ",
        ),
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

  if (
    !Array.isArray(
      data,
    )
  ) {
    throw new Error(
      "VERIFICATION_STAGING_ROWS_INVALID_RESULT",
    );
  }

  return data as
    unknown as
    StoredStagingRow[];
}

async function readStagingRowCount(
  jobId: string,
): Promise<number> {
  const supabase =
    getSupabaseAdmin();

  const {
    count,
    error,
  } =
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

  return count ??
    0;
}

async function deleteStagingFixture(
  fixture:
    VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } =
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
  ) ===
    0;
}

async function deleteJobFixture(
  fixture:
    VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
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
      .select(
        "id",
      )
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
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
      .select(
        "id",
      )
      .eq(
        "id",
        fixture.jobId,
      )
      .maybeSingle();

  if (
    checkResult.error
  ) {
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
  fixture:
    VerificationFixture,
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

async function claimFixtureJob(
  jobId: string,
): Promise<
  MediaSyncJobRecord
> {
  await assertOnlyFixturePendingJob(
    jobId,
  );

  const claimedJob =
    await claimNextNaverMediaSyncJob();

  if (
    claimedJob &&
    claimedJob.id !==
      jobId
  ) {
    try {
      await releaseNaverMediaSyncJobForResume(
        claimedJob,
      );
    } catch {
      // The main mismatch error is more actionable.
    }

    throw new Error(
      "VERIFICATION_CLAIMED_NON_FIXTURE_JOB",
    );
  }

  if (
    !claimedJob ||
    claimedJob.id !==
      jobId ||
    claimedJob.status !==
      PROCESSING_STATUS ||
    claimedJob.provider !==
      NAVER_PROVIDER
  ) {
    throw new Error(
      "VERIFICATION_CLAIM_MISMATCH",
    );
  }

  return claimedJob;
}

function validateCheckpoint(
  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint,
  expected: {
    phase:
      "keyword" |
      "authoritative" |
      "completed";
    nextRowIndex:
      number;
    totalRows:
      number;
    keywordComplete:
      boolean;
    authoritativeComplete:
      boolean;
  },
): void {
  assert.equal(
    checkpoint.phase,
    expected.phase,
  );

  assert.equal(
    checkpoint.nextRowIndex,
    expected.nextRowIndex,
  );

  assert.equal(
    checkpoint.totalRows,
    expected.totalRows,
  );

  assert.equal(
    checkpoint.keyword.complete,
    expected.keywordComplete,
  );

  assert.equal(
    checkpoint.authoritative.complete,
    expected.authoritativeComplete,
  );

  assert.equal(
    checkpoint.failedRows,
    0,
  );

  assert.equal(
    checkpoint.dateWindowIndex,
    DATE_WINDOW_INDEX,
  );

  if (
    expected.phase ===
      "keyword"
  ) {
    assert.notEqual(
      checkpoint.keyword.cursor,
      null,
    );

    assert.equal(
      checkpoint.authoritative.cursor,
      null,
    );
  }

  if (
    expected.phase ===
      "authoritative"
  ) {
    assert.notEqual(
      checkpoint.keyword.cursor,
      null,
    );

    assert.notEqual(
      checkpoint.authoritative.cursor,
      null,
    );
  }

  if (
    expected.phase ===
      "completed"
  ) {
    assert.equal(
      checkpoint.keyword.complete,
      true,
    );

    assert.equal(
      checkpoint.authoritative.complete,
      true,
    );

    assert.notEqual(
      checkpoint.keyword.cursor,
      null,
    );

    assert.notEqual(
      checkpoint.authoritative.cursor,
      null,
    );
  }
}

function validatePartialResult(
  result:
    ProcessNaverMediaSyncJobPartialResult,
  expected: {
    phase:
      "keyword" |
      "authoritative";
    checkpointRows:
      number;
  },
): void {
  assert.equal(
    result.status,
    "partial",
  );

  assert.equal(
    result.phase,
    expected.phase,
  );

  assert.equal(
    result.checkpointRows,
    expected.checkpointRows,
  );

  assert.equal(
    result.expectedRows,
    expected.checkpointRows,
  );

  assert.equal(
    result.snapshotIngestionId,
    null,
  );

  assert.equal(
    result.releasedJob.status,
    PENDING_STATUS,
  );

  assert.equal(
    result.checkpointJob.status,
    PROCESSING_STATUS,
  );

  assert.equal(
    result.staging.canonicalRowCount,
    expected.checkpointRows,
  );

  assert.equal(
    result.staging.summary.isComplete,
    false,
  );
}

function validateStoredRows(
  rows:
    readonly StoredStagingRow[],
): {
  rowIndexesContiguous:
    boolean;
  rowKeysUnique:
    boolean;
  fingerprintsValid:
    boolean;
  canonicalCountsMatch:
    boolean;
  authoritativeGrainsUnique:
    boolean;
  metricTotalsMatch:
    boolean;
} {
  const rowIndexesContiguous =
    rows.length ===
      14 &&
    rows.every(
      (
        row,
        index,
      ) =>
        Number(
          row.row_index,
        ) ===
          index &&
        row.date_window_index ===
          DATE_WINDOW_INDEX,
    );

  const rowKeys =
    rows.map(
      (
        row,
      ) =>
        row.row_key,
    );

  const rowKeysUnique =
    rowKeys.every(
      (
        rowKey,
      ) =>
        typeof rowKey ===
          "string" &&
        rowKey.length >
          0,
    ) &&
    new Set(
      rowKeys,
    ).size ===
      rows.length;

  const fingerprintsValid =
    rows.every(
      (
        row,
      ) =>
        typeof row.row_fingerprint ===
          "string" &&
        /^[0-9a-f]{64}$/.test(
          row.row_fingerprint,
        ),
    );

  const canonicalCounts = {
    keyword:
      0,
    creative:
      0,
    mixed:
      0,
  };

  const campaignGrains =
    new Map<
      string,
      Set<string>
    >();

  const totals = {
    impressions:
      0,
    clicks:
      0,
    cost:
      0,
    conversions:
      0,
    revenue:
      0,
  };

  for (
    const storedRow
    of rows
  ) {
    const row =
      storedRow.row;

    assert.equal(
      row.date,
      storedRow.date,
    );

    assert.equal(
      row.provider,
      NAVER_PROVIDER,
    );

    assert.equal(
      row.ingestion_source,
      "api",
    );

    if (
      row.row_level ===
      "keyword"
    ) {
      canonicalCounts.keyword +=
        1;

      assert.equal(
        row.data_level,
        "keyword",
      );

      assert.equal(
        row.external_campaign_id,
        "combined-live-web-campaign",
      );

      assert.equal(
        typeof row.external_keyword_id,
        "string",
      );
    } else if (
      row.row_level ===
      "creative"
    ) {
      canonicalCounts.creative +=
        1;

      assert.equal(
        row.data_level,
        "creative",
      );

      assert.equal(
        row.external_campaign_id,
        "combined-live-shopping-campaign",
      );

      assert.equal(
        row.row_level_reason,
        "naver_searchad_shopping_ad_daily_stats",
      );

      assert.equal(
        typeof row[
          "external_creative_id"
        ],
        "string",
      );
    } else if (
      row.row_level ===
      "mixed"
    ) {
      canonicalCounts.mixed +=
        1;

      assert.equal(
        row.data_level,
        "mixed",
      );

      assert.equal(
        row.external_campaign_id,
        "combined-live-brand-campaign",
      );

      assert.equal(
        row.row_level_reason,
        "naver_searchad_brand_search_adgroup_daily_stats",
      );

      assert.equal(
        typeof row.external_group_id,
        "string",
      );
    } else {
      throw new Error(
        "VERIFICATION_UNEXPECTED_ROW_LEVEL",
      );
    }

    const campaignId =
      String(
        row.external_campaign_id ??
        "",
      );

    const grainSet =
      campaignGrains.get(
        campaignId,
      ) ??
      new Set<string>();

    grainSet.add(
      row.row_level,
    );

    campaignGrains.set(
      campaignId,
      grainSet,
    );

    totals.impressions +=
      row.impressions;

    totals.clicks +=
      row.clicks;

    totals.cost +=
      row.cost;

    totals.conversions +=
      row.conversions;

    totals.revenue +=
      row.revenue;
  }

  const canonicalCountsMatch =
    canonicalCounts.keyword ===
      4 &&
    canonicalCounts.creative ===
      6 &&
    canonicalCounts.mixed ===
      4;

  const authoritativeGrainsUnique =
    campaignGrains.size ===
      3 &&
    Array.from(
      campaignGrains.values(),
    ).every(
      (
        grains,
      ) =>
        grains.size ===
        1,
    ) &&
    campaignGrains.get(
      "combined-live-web-campaign",
    )?.has(
      "keyword",
    ) ===
      true &&
    campaignGrains.get(
      "combined-live-shopping-campaign",
    )?.has(
      "creative",
    ) ===
      true &&
    campaignGrains.get(
      "combined-live-brand-campaign",
    )?.has(
      "mixed",
    ) ===
      true;

  const metricTotalsMatch =
    totals.impressions ===
      290 &&
    totals.clicks ===
      29 &&
    totals.cost ===
      2_900 &&
    totals.conversions ===
      11 &&
    totals.revenue ===
      5_700;

  return {
    rowIndexesContiguous,
    rowKeysUnique,
    fingerprintsValid,
    canonicalCountsMatch,
    authoritativeGrainsUnique,
    metricTotalsMatch,
  };
}

function createBaseOptions(
  guards:
    MaterializationGuards,
): ProcessNaverMediaSyncJobOptions {
  return {
    dateWindowIndex:
      DATE_WINDOW_INDEX,

    stagingBatchSize:
      STAGING_BATCH_SIZE,

    requestIntervalMs:
      0,

    keywordChunkSize:
      100,

    chunkPauseMs:
      0,

    maxRetryCount:
      3,

    maxStatsRequestsPerRun:
      MAX_STATS_REQUESTS_PER_RUN,

    maxKeywordDiscoveryPagesPerRun:
      MAX_DISCOVERY_PAGES_PER_RUN,

    maxAuthoritativeStatsRequestsPerRun:
      MAX_STATS_REQUESTS_PER_RUN,

    maxAuthoritativeDiscoveryPagesPerRun:
      MAX_DISCOVERY_PAGES_PER_RUN,

    dependencies:
      createKeywordDependencies(),

    authoritativeDependencies:
      createAuthoritativeDependencies(),

    orchestrationDependencies: {
      materialize:
        async (
          input,
        ) => {
          guards.materializationCalls +=
            1;

          assert.equal(
            input.job.snapshot_ingestion_id,
            null,
          );

          assert.equal(
            input.summary.totalRows,
            14,
          );

          assert.equal(
            input.summary.isComplete,
            true,
          );

          throw new Error(
            MATERIALIZATION_BLOCK_SENTINEL,
          );
        },

      activate:
        async () => {
          guards.activationCalls +=
            1;

          throw new Error(
            "VERIFICATION_ACTIVATION_MUST_NOT_RUN",
          );
        },

      finalize:
        async () => {
          guards.finalizationCalls +=
            1;

          throw new Error(
            "VERIFICATION_FINALIZATION_MUST_NOT_RUN",
          );
        },
    },
  };
}

function assertExpectedMaterializationBlock(
  error: unknown,
): void {
  if (
    !(
      error instanceof
      MediaSyncWorkerOrchestrationError
    ) ||
    error.code !==
      "MATERIALIZATION_FAILED"
  ) {
    throw error;
  }

  const cause =
    error.cause;

  if (
    !(
      cause instanceof
      Error
    ) ||
    cause.message !==
      MATERIALIZATION_BLOCK_SENTINEL
  ) {
    throw error;
  }
}

function createPhaseMeasurement(input: {
  name:
    PhaseMeasurement["name"];
  claimedJob:
    MediaSyncJobRecord;
  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint;
  stagingRowCount:
    number;
}): PhaseMeasurement {
  return {
    name:
      input.name,
    claimedAttemptCount:
      input.claimedJob
        .attempt_count,
    checkpoint:
      input.checkpoint,
    stagingRowCount:
      input.stagingRowCount,
  };
}

function readSafeErrorDiagnostic(
  value: unknown,
): Record<
  string,
  string | null
> {
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
    value as
      Record<string, unknown>;

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

async function main():
  Promise<void> {
  const input =
    readVerificationInput();

  if (
    isWorkerEnabled()
  ) {
    throw new Error(
      "VERIFICATION_REQUIRES_MEDIA_SYNC_WORKER_DISABLED",
    );
  }

  let fixture:
    VerificationFixture | null =
    null;

  let reportStateBefore:
    ReportState | null =
    null;

  let cleanupCompleted =
    false;

  const guards:
    MaterializationGuards = {
      materializationCalls:
        0,
      activationCalls:
        0,
      finalizationCalls:
        0,
    };

  const phaseMeasurements:
    PhaseMeasurement[] = [];

  console.log(
    "combined live-limited verification uses injected Naver data:",
    true,
  );

  console.log(
    "combined live-limited verification writes temporary staging rows:",
    true,
  );

  console.log(
    "materialization activation and finalization are blocked:",
    true,
  );

  console.log(
    "MEDIA_SYNC_WORKER_ENABLED:",
    false,
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
          "mixed",

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

    const baseOptions =
      createBaseOptions(
        guards,
      );

    /*
     * 1차 실행:
     * keyword 1개 × 2일 → 2행, keyword partial, pending release.
     */
    const claimedOne =
      await claimFixtureJob(
        fixture.jobId,
      );

    const resultOne =
      await processClaimedNaverMediaSyncJob(
        claimedOne,
        {
          ...baseOptions,
          maxKeywordStatsPerRun:
            1,
          maxAuthoritativeEntityStatsPerRun:
            2,
        },
      );

    if (
      resultOne.status !==
      "partial"
    ) {
      throw new Error(
        "VERIFICATION_FIRST_RUN_MUST_BE_PARTIAL",
      );
    }

    validatePartialResult(
      resultOne,
      {
        phase:
          "keyword",
        checkpointRows:
          2,
      },
    );

    const checkpointOne =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        resultOne.checkpointJob,
      );

    validateCheckpoint(
      checkpointOne,
      {
        phase:
          "keyword",
        nextRowIndex:
          2,
        totalRows:
          2,
        keywordComplete:
          false,
        authoritativeComplete:
          false,
      },
    );

    const storedAfterOne =
      await readStoredStagingRows(
        fixture.jobId,
      );

    assert.equal(
      storedAfterOne.length,
      2,
    );

    const pendingAfterOne =
      await readJobRecord(
        fixture.jobId,
      );

    assert.equal(
      pendingAfterOne.status,
      PENDING_STATUS,
    );

    assert.equal(
      pendingAfterOne.inserted_rows,
      2,
    );

    assert.equal(
      stableJson(
        pendingAfterOne.error_detail,
      ),
      stableJson(
        resultOne.releasedJob
          .error_detail,
      ),
    );

    phaseMeasurements.push(
      createPhaseMeasurement({
        name:
          "keyword-partial",
        claimedJob:
          claimedOne,
        checkpoint:
          checkpointOne,
        stagingRowCount:
          storedAfterOne.length,
      }),
    );

    assert.equal(
      guards.materializationCalls,
      0,
    );

    /*
     * 2차 실행:
     * keyword resume 완료 → 누적 4행.
     * authoritative 2 entities × 2일 → 누적 8행, authoritative partial.
     */
    const claimedTwo =
      await claimFixtureJob(
        fixture.jobId,
      );

    const claimedTwoCheckpoint =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        claimedTwo,
      );

    validateCheckpoint(
      claimedTwoCheckpoint,
      {
        phase:
          "keyword",
        nextRowIndex:
          2,
        totalRows:
          2,
        keywordComplete:
          false,
        authoritativeComplete:
          false,
      },
    );

    const resultTwo =
      await processClaimedNaverMediaSyncJob(
        claimedTwo,
        {
          ...baseOptions,
          maxKeywordStatsPerRun:
            20,
          maxAuthoritativeEntityStatsPerRun:
            2,
        },
      );

    if (
      resultTwo.status !==
      "partial"
    ) {
      throw new Error(
        "VERIFICATION_SECOND_RUN_MUST_BE_PARTIAL",
      );
    }

    validatePartialResult(
      resultTwo,
      {
        phase:
          "authoritative",
        checkpointRows:
          8,
      },
    );

    const checkpointTwo =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        resultTwo.checkpointJob,
      );

    validateCheckpoint(
      checkpointTwo,
      {
        phase:
          "authoritative",
        nextRowIndex:
          8,
        totalRows:
          8,
        keywordComplete:
          true,
        authoritativeComplete:
          false,
      },
    );

    const storedAfterTwo =
      await readStoredStagingRows(
        fixture.jobId,
      );

    assert.equal(
      storedAfterTwo.length,
      8,
    );

    assert.deepEqual(
      storedAfterTwo.map(
        (
          row,
        ) =>
          Number(
            row.row_index,
          ),
      ),
      [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
      ],
    );

    assert.equal(
      storedAfterTwo.filter(
        (
          row,
        ) =>
          row.row.row_level ===
          "keyword",
      ).length,
      4,
    );

    assert.equal(
      storedAfterTwo.filter(
        (
          row,
        ) =>
          row.row.row_level ===
          "creative",
      ).length,
      4,
    );

    assert.equal(
      storedAfterTwo.filter(
        (
          row,
        ) =>
          row.row.row_level ===
          "mixed",
      ).length,
      0,
    );

    const pendingAfterTwo =
      await readJobRecord(
        fixture.jobId,
      );

    assert.equal(
      pendingAfterTwo.status,
      PENDING_STATUS,
    );

    assert.equal(
      pendingAfterTwo.inserted_rows,
      8,
    );

    phaseMeasurements.push(
      createPhaseMeasurement({
        name:
          "authoritative-partial",
        claimedJob:
          claimedTwo,
        checkpoint:
          checkpointTwo,
        stagingRowCount:
          storedAfterTwo.length,
      }),
    );

    assert.equal(
      guards.materializationCalls,
      0,
    );

    /*
     * 3차 실행:
     * authoritative resume 완료 → 누적 14행.
     * combined summary까지 실제 DB 검증 후 materialization 호출을 fixture가 차단.
     */
    const claimedThree =
      await claimFixtureJob(
        fixture.jobId,
      );

    const claimedThreeCheckpoint =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        claimedThree,
      );

    validateCheckpoint(
      claimedThreeCheckpoint,
      {
        phase:
          "authoritative",
        nextRowIndex:
          8,
        totalRows:
          8,
        keywordComplete:
          true,
        authoritativeComplete:
          false,
      },
    );

    let expectedMaterializationBlockObserved =
      false;

    try {
      await processClaimedNaverMediaSyncJob(
        claimedThree,
        {
          ...baseOptions,
          maxKeywordStatsPerRun:
            20,
          maxAuthoritativeEntityStatsPerRun:
            20,
        },
      );

      throw new Error(
        "VERIFICATION_MATERIALIZATION_BLOCK_NOT_REACHED",
      );
    } catch (
      error
    ) {
      assertExpectedMaterializationBlock(
        error,
      );

      expectedMaterializationBlockObserved =
        true;
    }

    assert.equal(
      expectedMaterializationBlockObserved,
      true,
    );

    assert.equal(
      guards.materializationCalls,
      1,
    );

    assert.equal(
      guards.activationCalls,
      0,
    );

    assert.equal(
      guards.finalizationCalls,
      0,
    );

    const processingAfterThree =
      await readJobRecord(
        fixture.jobId,
      );

    assert.equal(
      processingAfterThree.status,
      PROCESSING_STATUS,
    );

    assert.equal(
      processingAfterThree.inserted_rows,
      14,
    );

    assert.equal(
      processingAfterThree.raw_rows,
      14,
    );

    assert.equal(
      processingAfterThree.normalized_rows,
      14,
    );

    assert.equal(
      processingAfterThree.failed_rows,
      0,
    );

    assert.equal(
      processingAfterThree.snapshot_ingestion_id,
      null,
    );

    assert.equal(
      processingAfterThree.finished_at,
      null,
    );

    const checkpointThree =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        processingAfterThree,
      );

    validateCheckpoint(
      checkpointThree,
      {
        phase:
          "completed",
        nextRowIndex:
          14,
        totalRows:
          14,
        keywordComplete:
          true,
        authoritativeComplete:
          true,
      },
    );

    const storedAfterThree =
      await readStoredStagingRows(
        fixture.jobId,
      );

    const storedContract =
      validateStoredRows(
        storedAfterThree,
      );

    assert.equal(
      storedContract.rowIndexesContiguous,
      true,
    );

    assert.equal(
      storedContract.rowKeysUnique,
      true,
    );

    assert.equal(
      storedContract.fingerprintsValid,
      true,
    );

    assert.equal(
      storedContract.canonicalCountsMatch,
      true,
    );

    assert.equal(
      storedContract.authoritativeGrainsUnique,
      true,
    );

    assert.equal(
      storedContract.metricTotalsMatch,
      true,
    );

    const completeSummary =
      await getNaverSearchAdsCombinedStagingSummary({
        job:
          processingAfterThree,
        expectedRows:
          14,
      });

    assert.equal(
      completeSummary.isComplete,
      true,
    );

    assert.equal(
      completeSummary.totalRows,
      14,
    );

    assert.equal(
      completeSummary.minRowIndex,
      0,
    );

    assert.equal(
      completeSummary.maxRowIndex,
      13,
    );

    assert.equal(
      completeSummary.distinctRowIndexes,
      14,
    );

    assert.equal(
      completeSummary.missingExpectedRows,
      0,
    );

    assert.equal(
      completeSummary.outOfRangeRows,
      0,
    );

    assert.equal(
      completeSummary.scopeMismatchRows,
      0,
    );

    assert.equal(
      completeSummary.blankRowKeyRows,
      0,
    );

    assert.equal(
      completeSummary.missingFingerprintRows,
      0,
    );

    assert.equal(
      completeSummary.canonicalMismatchRows,
      0,
    );

    phaseMeasurements.push(
      createPhaseMeasurement({
        name:
          "combined-completed",
        claimedJob:
          claimedThree,
        checkpoint:
          checkpointThree,
        stagingRowCount:
          storedAfterThree.length,
      }),
    );

    assert.deepEqual(
      phaseMeasurements.map(
        (
          measurement,
        ) =>
          measurement.checkpoint
            .nextRowIndex,
      ),
      [
        2,
        8,
        14,
      ],
    );

    assert.deepEqual(
      phaseMeasurements.map(
        (
          measurement,
        ) =>
          measurement.stagingRowCount,
      ),
      [
        2,
        8,
        14,
      ],
    );

    assert.deepEqual(
      phaseMeasurements.map(
        (
          measurement,
        ) =>
          measurement.claimedAttemptCount,
      ),
      [
        1,
        2,
        3,
      ],
    );

    const reportStateBeforeCleanup =
      await readReportState(
        input.reportId,
      );

    const reportUnchangedBeforeCleanup =
      reportStateMatches(
        reportStateBefore,
        reportStateBeforeCleanup,
      );

    assert.equal(
      reportUnchangedBeforeCleanup,
      true,
    );

    cleanupCompleted =
      await cleanupFixture(
        fixture,
      );

    assert.equal(
      cleanupCompleted,
      true,
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

    assert.equal(
      reportUnchangedAfterCleanup,
      true,
    );

    console.log(
      "verified real DB keyword partial checkpoint and pending release: true",
    );

    console.log(
      "verified real DB keyword completion transitions to authoritative phase: true",
    );

    console.log(
      "verified real DB authoritative partial checkpoint and pending release: true",
    );

    console.log(
      "verified real DB claim attempt sequence: 1 / 2 / 3",
    );

    console.log(
      "verified real DB combined nextRowIndex sequence: 2 / 8 / 14",
    );

    console.log(
      "verified real DB combined staging row counts: 2 / 8 / 14",
    );

    console.log(
      "verified real DB staging row indexes are contiguous from 0 through 13: true",
    );

    console.log(
      "verified real DB staging canonical counts keyword / creative / mixed: 4 / 6 / 4",
    );

    console.log(
      "verified real DB combined cross-grain duplicate row keys: 0",
    );

    console.log(
      "verified real DB row fingerprints are present: true",
    );

    console.log(
      "verified real DB combined canonical metric totals: 290 / 29 / 2900 / 11 / 5700",
    );

    console.log(
      "verified combined checkpoint phase is completed before materialization: true",
    );

    console.log(
      "verified materialization blocker calls: 1",
    );

    console.log(
      "verified activation calls: 0",
    );

    console.log(
      "verified finalization calls: 0",
    );

    console.log(
      "verified snapshot_ingestion_id remains null: true",
    );

    console.log(
      "verified current_ingestion_id remains unchanged: true",
    );

    console.log(
      "verified published_ingestion_id remains unchanged: true",
    );

    console.log(
      "verified report_rows count remains unchanged: true",
    );

    console.log(
      "verified temporary staging and job cleanup completed: true",
    );

    console.log(
      "fixture uses injected Naver API dependencies: true",
    );

    console.log(
      "fixture uses real Naver API: false",
    );

    console.log(
      "fixture uses database: true",
    );

    console.log(
      "fixture writes temporary staging: true",
    );

    console.log(
      "fixture writes report_rows: false",
    );

    console.log(
      "fixture changes report pointers: false",
    );

    console.log(
      "verification passed: true",
    );
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

main().catch(
  (
    error:
      unknown,
  ) => {
    if (
      error instanceof
        MediaSyncWorkerOrchestrationError ||
      error instanceof
        MediaSyncCombinedProcessingCheckpointError ||
      error instanceof
        MediaSyncStagingSummaryError ||
      error instanceof
        MediaSyncJobsRepositoryError ||
      error instanceof
        MediaSyncWorkerRepositoryError
    ) {
      console.error(
        "combined live-limited staging verification failed:",
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
      error instanceof
      Error
    ) {
      console.error(
        "combined live-limited staging verification failed:",
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
      "combined live-limited staging verification failed:",
      "UNKNOWN_ERROR",
    );

    process.exitCode =
      1;
  },
);
