// scripts/verify-media-sync-end-to-end-orchestration.ts

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  processNextNaverMediaSyncJob,
  MediaSyncWorkerOrchestrationError,
} from "../src/lib/media-sync/media-sync-worker-orchestration-repository";
import type {
  NaverKeywordStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
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
  JsonObject,
} from "../src/lib/media-sync/types";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const MEDIA_SYNC_STAGING_ROWS_TABLE =
  "media_sync_staging_rows";

const REPORT_INGESTIONS_TABLE =
  "report_ingestions";

const REPORT_ROWS_TABLE =
  "report_rows";

const REPORTS_TABLE =
  "reports";

const MEDIA_CONNECTIONS_TABLE =
  "media_connections";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const FIXTURE_KEYWORD_COUNT =
  5;

const FIXTURE_BATCH_SIZE =
  4;

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
  connectionId: string;
  snapshotIngestionId: string | null;
};

type ReportState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
  totalReportRows: number;
  reportRowsSnapshot: string;
};

type ConnectionState = {
  id: string;
  lastSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

type StoredReportRow = {
  row_index: number;
  date: string | null;
  channel: string | null;
  device: string | null;
  source: string | null;
  row: EtrylueNormalizedMediaRow;
};

type StoredStagingRow = {
  row_index: number | string;
  date: string;
  channel: string | null;
  device: string | null;
  source: string | null;
  row_key: string;
  row_fingerprint: string;
  row: EtrylueNormalizedMediaRow;
};

function stableJson(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record =
    value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}

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

function createFixtureCampaign():
  NaverSearchAdsCampaignRecord {
  return {
    id:
      "end-to-end-campaign-id",

    name:
      "end-to-end-campaign",

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
      "end-to-end-adgroup-id",

    campaignId,

    name:
      "end-to-end-adgroup",

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
          `end-to-end-keyword-id-${sequence}`,

        adgroupId,

        keyword:
          `end-to-end-keyword-${sequence}`,

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

async function assertNoPendingNaverJob():
  Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id")
      .eq("provider", NAVER_PROVIDER)
      .eq("status", "pending")
      .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_NAVER_JOB_CHECK_FAILED",
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

async function assertNoActiveJobForReport(
  reportId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id, status")
      .eq("report_id", reportId)
      .in("status", [
        "pending",
        "processing",
      ])
      .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_ACTIVE_JOB_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_ACTIVE_JOB_ALREADY_EXISTS",
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
      .select(
        "id, ingestion_id, row_index, date, channel, device, source, row",
      )
      .eq("report_id", reportId)
      .order("ingestion_id", {
        ascending:
          true,

        nullsFirst:
          true,
      })
      .order("row_index", {
        ascending:
          true,
      })
      .order("id", {
        ascending:
          true,
      });

  if (rowsResult.error) {
    throw new Error(
      "VERIFICATION_REPORT_ROWS_STATE_READ_FAILED",
    );
  }

  const rows =
    Array.isArray(rowsResult.data)
      ? rowsResult.data
      : [];

  return {
    currentIngestionId:
      typeof reportResult.data
        .current_ingestion_id ===
      "string"
        ? reportResult.data
            .current_ingestion_id
        : null,

    publishedIngestionId:
      typeof reportResult.data
        .published_ingestion_id ===
      "string"
        ? reportResult.data
            .published_ingestion_id
        : null,

    totalReportRows:
      rows.length,

    reportRowsSnapshot:
      stableJson(rows),
  };
}

async function readConnectionState(
  connectionId: string,
): Promise<ConnectionState> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_CONNECTIONS_TABLE)
      .select(
        "id, last_sync_at, last_error, updated_at",
      )
      .eq("id", connectionId)
      .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_CONNECTION_STATE_READ_FAILED",
    );
  }

  if (!data) {
    throw new Error(
      "VERIFICATION_CONNECTION_NOT_FOUND",
    );
  }

  return {
    id:
      String(data.id),

    lastSyncAt:
      typeof data.last_sync_at ===
      "string"
        ? data.last_sync_at
        : null,

    lastError:
      typeof data.last_error ===
      "string"
        ? data.last_error
        : null,

    updatedAt:
      String(data.updated_at),
  };
}

async function readSnapshotRows(input: {
  reportId: string;
  ingestionId: string;
}): Promise<StoredReportRow[]> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(REPORT_ROWS_TABLE)
      .select(
        "row_index, date, channel, device, source, row",
      )
      .eq("report_id", input.reportId)
      .eq("ingestion_id", input.ingestionId)
      .order("row_index", {
        ascending:
          true,
      });

  if (error) {
    throw new Error(
      "VERIFICATION_SNAPSHOT_ROWS_READ_FAILED",
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "VERIFICATION_SNAPSHOT_ROWS_INVALID_RESULT",
    );
  }

  return data as unknown as StoredReportRow[];
}

async function readStagingRows(
  jobId: string,
): Promise<StoredStagingRow[]> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select(
        "row_index, date, channel, device, source, row_key, row_fingerprint, row",
      )
      .eq("job_id", jobId)
      .order("row_index", {
        ascending:
          true,
      });

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

function rowsMatch(
  stagingRows: readonly StoredStagingRow[],
  reportRows: readonly StoredReportRow[],
): boolean {
  if (
    stagingRows.length !==
    reportRows.length
  ) {
    return false;
  }

  return stagingRows.every(
    (
      stagingRow,
      index,
    ) => {
      const reportRow =
        reportRows[index];

      if (!reportRow) {
        return false;
      }

      return (
        Number(stagingRow.row_index) ===
          index &&
        reportRow.row_index ===
          index &&
        stagingRow.date ===
          reportRow.date &&
        stagingRow.channel ===
          reportRow.channel &&
        stagingRow.device ===
          reportRow.device &&
        stagingRow.source ===
          reportRow.source &&
        stableJson(stagingRow.row) ===
          stableJson(reportRow.row)
      );
    },
  );
}

async function restoreReportPointer(
  reportId: string,
  state: ReportState,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(REPORTS_TABLE)
      .update({
        current_ingestion_id:
          state.currentIngestionId,

        published_ingestion_id:
          state.publishedIngestionId,
      })
      .eq("id", reportId);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_POINTER_RESTORE_FAILED",
    );
  }
}

async function restoreConnectionState(
  state: ConnectionState,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(MEDIA_CONNECTIONS_TABLE)
      .update({
        last_sync_at:
          state.lastSyncAt,

        last_error:
          state.lastError,

        updated_at:
          state.updatedAt,
      })
      .eq("id", state.id);

  if (error) {
    throw new Error(
      "VERIFICATION_CONNECTION_STATE_RESTORE_FAILED",
    );
  }
}

async function cleanupFixture(input: {
  fixture: VerificationFixture;
  reportStateBefore: ReportState;
  connectionStateBefore: ConnectionState;
}): Promise<boolean> {
  const {
    fixture,
    reportStateBefore,
    connectionStateBefore,
  } = input;

  const supabase =
    getSupabaseAdmin();

  await restoreReportPointer(
    fixture.reportId,
    reportStateBefore,
  );

  await restoreConnectionState(
    connectionStateBefore,
  );

  if (fixture.snapshotIngestionId) {
    const rowsDelete =
      await supabase
        .from(REPORT_ROWS_TABLE)
        .delete()
        .eq("report_id", fixture.reportId)
        .eq(
          "ingestion_id",
          fixture.snapshotIngestionId,
        );

    if (rowsDelete.error) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_FAILED",
      );
    }

    const ingestionDelete =
      await supabase
        .from(REPORT_INGESTIONS_TABLE)
        .delete()
        .eq(
          "id",
          fixture.snapshotIngestionId,
        )
        .eq("report_id", fixture.reportId);

    if (ingestionDelete.error) {
      throw new Error(
        "VERIFICATION_INGESTION_CLEANUP_FAILED",
      );
    }
  }

  const stagingDelete =
    await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .delete()
      .eq("job_id", fixture.jobId);

  if (stagingDelete.error) {
    throw new Error(
      "VERIFICATION_STAGING_CLEANUP_FAILED",
    );
  }

  const jobDelete =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .delete()
      .eq("id", fixture.jobId)
      .eq("report_id", fixture.reportId);

  if (jobDelete.error) {
    throw new Error(
      "VERIFICATION_JOB_CLEANUP_FAILED",
    );
  }

  const [
    jobCheck,
    stagingCheck,
    ingestionCheck,
    rowsCheck,
    reportStateAfter,
    connectionStateAfter,
  ] = await Promise.all([
    supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id", {
        count:
          "exact",

        head:
          true,
      })
      .eq("id", fixture.jobId),

    supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select("id", {
        count:
          "exact",

        head:
          true,
      })
      .eq("job_id", fixture.jobId),

    fixture.snapshotIngestionId
      ? supabase
          .from(REPORT_INGESTIONS_TABLE)
          .select("id", {
            count:
              "exact",

            head:
              true,
          })
          .eq(
            "id",
            fixture.snapshotIngestionId,
          )
      : Promise.resolve({
          count:
            0,

          error:
            null,
        }),

    fixture.snapshotIngestionId
      ? supabase
          .from(REPORT_ROWS_TABLE)
          .select("id", {
            count:
              "exact",

            head:
              true,
          })
          .eq("report_id", fixture.reportId)
          .eq(
            "ingestion_id",
            fixture.snapshotIngestionId,
          )
      : Promise.resolve({
          count:
            0,

          error:
            null,
        }),

    readReportState(fixture.reportId),
    readConnectionState(fixture.connectionId),
  ]);

  if (
    jobCheck.error ||
    stagingCheck.error ||
    ingestionCheck.error ||
    rowsCheck.error
  ) {
    throw new Error(
      "VERIFICATION_CLEANUP_CHECK_FAILED",
    );
  }

  return (
    (jobCheck.count ?? 0) === 0 &&
    (stagingCheck.count ?? 0) === 0 &&
    (ingestionCheck.count ?? 0) === 0 &&
    (rowsCheck.count ?? 0) === 0 &&
    reportStateAfter.currentIngestionId ===
      reportStateBefore.currentIngestionId &&
    reportStateAfter.publishedIngestionId ===
      reportStateBefore.publishedIngestionId &&
    reportStateAfter.totalReportRows ===
      reportStateBefore.totalReportRows &&
    reportStateAfter.reportRowsSnapshot ===
      reportStateBefore.reportRowsSnapshot &&
    connectionStateAfter.lastSyncAt ===
      connectionStateBefore.lastSyncAt &&
    connectionStateAfter.lastError ===
      connectionStateBefore.lastError
  );
}

function logFailure(error: unknown): void {
  if (
    error instanceof
    MediaSyncWorkerOrchestrationError
  ) {
    console.error(
      "orchestration error code:",
      error.code,
    );

    console.error(
      "orchestration error message:",
      error.message,
    );

    const cause =
      error.cause;

    if (
      cause instanceof Error
    ) {
      console.error(
        "orchestration cause name:",
        cause.name,
      );

      const maybeCode =
        (cause as { code?: unknown })
          .code;

      if (
        typeof maybeCode ===
        "string"
      ) {
        console.error(
          "orchestration cause code:",
          maybeCode,
        );
      }

      console.error(
        "orchestration cause message:",
        cause.message,
      );
    }

    return;
  }

  if (error instanceof Error) {
    console.error(
      "verification error name:",
      error.name,
    );

    console.error(
      "verification error message:",
      error.message,
    );

    return;
  }

  console.error(
    "verification unknown error:",
    String(error),
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

  let connectionStateBefore:
    ConnectionState | null =
    null;

  let cleanupPassed =
    false;

  try {
    await assertNoPendingNaverJob();
    await assertNoActiveJobForReport(
      input.reportId,
    );

    reportStateBefore =
      await readReportState(
        input.reportId,
      );

    connectionStateBefore =
      await readConnectionState(
        input.connectionId,
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

    const expectedRows =
      FIXTURE_KEYWORD_COUNT *
      createFixtureDates(
        input.dateFrom,
        input.dateTo,
      ).length;

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

      connectionId:
        pendingJob.connection_id,

      snapshotIngestionId:
        null,
    };

    const orchestration =
      await processNextNaverMediaSyncJob({
        stagingBatchSize:
          FIXTURE_BATCH_SIZE,

        requestIntervalMs:
          0,

        keywordChunkSize:
          100,

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
              input.dateFrom,

            dateTo:
              input.dateTo,
          }),
      });

    if (!orchestration) {
      throw new Error(
        "VERIFICATION_ORCHESTRATION_RETURNED_NO_JOB",
      );
    }

    fixture.snapshotIngestionId =
      orchestration.snapshotIngestionId;

    const stagingRows =
      await readStagingRows(
        fixture.jobId,
      );

    const reportRows =
      await readSnapshotRows({
        reportId:
          fixture.reportId,

        ingestionId:
          orchestration
            .snapshotIngestionId,
      });

    const finalReportState =
      await readReportState(
        fixture.reportId,
      );

    const finalConnectionState =
      await readConnectionState(
        fixture.connectionId,
      );

    const jobDone =
      orchestration.finalization.job.status ===
        "done" &&
      orchestration.finalization.job.progress ===
        100 &&
      orchestration.finalization.job.finished_at !==
        null;

    const lastSyncUpdated =
      finalConnectionState.lastSyncAt !==
        null &&
      finalConnectionState.lastError ===
        null;

    const currentPointerUpdated =
      finalReportState.currentIngestionId ===
      orchestration.snapshotIngestionId;

    const publishedPointerUnchanged =
      finalReportState.publishedIngestionId ===
      reportStateBefore.publishedIngestionId;

    const rowCountMatches =
      orchestration.expectedRows ===
        expectedRows &&
      stagingRows.length ===
        expectedRows &&
      reportRows.length ===
        expectedRows &&
      orchestration.staging.summary.totalRows ===
        expectedRows &&
      orchestration.materialization.rowCount ===
        expectedRows &&
      orchestration.activation.rowCount ===
        expectedRows &&
      orchestration.finalization.rowCount ===
        expectedRows;

    const rowOrderAndJsonMatches =
      rowsMatch(
        stagingRows,
        reportRows,
      );

    const exactRetry =
      await processNextNaverMediaSyncJob({
        stagingBatchSize:
          FIXTURE_BATCH_SIZE,

        requestIntervalMs:
          0,

        keywordChunkSize:
          100,

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
              input.dateFrom,

            dateTo:
              input.dateTo,
          }),
      });

    const noSecondPendingJob =
      exactRetry === null;

    cleanupPassed =
      await cleanupFixture({
        fixture,
        reportStateBefore,
        connectionStateBefore,
      });

    console.log(
      "pending job created:",
      Boolean(pendingJob.id),
    );

    console.log(
      "processing claim completed:",
      orchestration.jobId ===
        pendingJob.id,
    );

    console.log(
      "worker context loaded:",
      orchestration.finalization.connectionId ===
        input.connectionId,
    );

    console.log(
      "collector canonical rows:",
      orchestration.staging
        .canonicalRowCount,
    );

    console.log(
      "bounded buffer flushed rows:",
      orchestration.staging.buffer
        .flushedRowCount,
    );

    console.log(
      "staging append rows:",
      orchestration.staging.append
        .submittedRows,
    );

    console.log(
      "checkpoint saved:",
      orchestration.checkpointJob.status ===
        "processing" &&
        orchestration.checkpointJob
          .normalized_rows ===
          expectedRows,
    );

    console.log(
      "staging complete:",
      orchestration.staging.summary
        .isComplete,
    );

    console.log(
      "materialization completed:",
      Boolean(
        orchestration.materialization
          .snapshotIngestionId,
      ),
    );

    console.log(
      "activation completed:",
      currentPointerUpdated,
    );

    console.log(
      "finalization completed:",
      jobDone,
    );

    console.log(
      "job.status done:",
      orchestration.finalization.job
        .status === "done",
    );

    console.log(
      "job.progress 100:",
      orchestration.finalization.job
        .progress === 100,
    );

    console.log(
      "job.finished_at non-null:",
      orchestration.finalization.job
        .finished_at !== null,
    );

    console.log(
      "connection last_sync_at updated:",
      lastSyncUpdated,
    );

    console.log(
      "connection last_error null:",
      finalConnectionState.lastError ===
        null,
    );

    console.log(
      "current pointer updated:",
      currentPointerUpdated,
    );

    console.log(
      "published pointer unchanged:",
      publishedPointerUnchanged,
    );

    console.log(
      "row count matches:",
      rowCountMatches,
    );

    console.log(
      "row order and json matches:",
      rowOrderAndJsonMatches,
    );

    console.log(
      "exact retry safe:",
      noSecondPendingJob,
    );

    console.log(
      "fixture cleanup passed:",
      cleanupPassed,
    );

    console.log(
      "verification passed:",
      jobDone &&
        lastSyncUpdated &&
        currentPointerUpdated &&
        publishedPointerUnchanged &&
        rowCountMatches &&
        rowOrderAndJsonMatches &&
        noSecondPendingJob &&
        cleanupPassed,
    );

    console.log(
      "final report state unchanged or restored:",
      cleanupPassed,
    );

    console.log(
      "final connection state restored:",
      cleanupPassed,
    );
  } catch (error) {
    logFailure(error);

    if (
      fixture &&
      reportStateBefore &&
      connectionStateBefore
    ) {
      try {
        cleanupPassed =
          await cleanupFixture({
            fixture,
            reportStateBefore,
            connectionStateBefore,
          });

        console.error(
          "cleanup after failure passed:",
          cleanupPassed,
        );
      } catch (cleanupError) {
        console.error(
          "cleanup after failure failed:",
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        );
      }
    }

    process.exitCode =
      1;
  }
}

main().catch(
  (error) => {
    logFailure(error);
    process.exitCode = 1;
  },
);