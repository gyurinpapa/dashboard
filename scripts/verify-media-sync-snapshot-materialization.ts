import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  appendMediaSyncStagingBatch,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  assertMediaSyncStagingComplete,
  getMediaSyncStagingSummary,
  type MediaSyncStagingSummary,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  materializeMediaSyncSnapshot,
  MediaSyncSnapshotMaterializationError,
} from "../src/lib/media-sync/media-sync-snapshot-materialization-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
} from "../src/lib/media-sync/media-sync-worker-repository";
import type {
  EtrylueNormalizedMediaRow,
  JsonObject,
  MediaSyncJobRecord,
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

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

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
  snapshotIngestionId: string | null;
};

type ReportState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
  totalReportRows: number;
  reportRowsSnapshot: string;
};

type ProtectedJobState = {
  status: string;
  progress: number;
  finishedAt: string | null;
  error: string | null;
  errorDetail: JsonObject | null;
  snapshotIngestionId: string | null;
};

type MaterializedRow = {
  id: string;
  report_id: string;
  workspace_id: string;
  advertiser_id: string | null;
  ingestion_id: string | null;
  row_index: number;
  date: string | null;
  channel: string | null;
  device: string | null;
  source: string | null;
  row: EtrylueNormalizedMediaRow;
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

  if (!UUID_PATTERN.test(normalizedValue)) {
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

function stableJson(value: unknown): string {
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

async function assertNoActiveFixtureConflict(
  reportId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id, status")
      .eq("report_id", reportId)
      .in("status", ["pending", "processing"])
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

  if (
    reportResult.error ||
    !reportResult.data
  ) {
    throw new Error(
      "VERIFICATION_REPORT_STATE_READ_FAILED",
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
        ascending: true,
        nullsFirst: true,
      })
      .order("row_index", {
        ascending: true,
      })
      .order("id", {
        ascending: true,
      });

  if (
    rowsResult.error ||
    !Array.isArray(rowsResult.data)
  ) {
    throw new Error(
      "VERIFICATION_REPORT_ROWS_STATE_READ_FAILED",
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

    totalReportRows:
      rowsResult.data.length,

    reportRowsSnapshot:
      stableJson(rowsResult.data),
  };
}

function reportPointersMatch(
  before: ReportState,
  after: ReportState,
): boolean {
  return (
    before.currentIngestionId ===
      after.currentIngestionId &&
    before.publishedIngestionId ===
      after.publishedIngestionId
  );
}

function fullReportStateMatches(
  before: ReportState,
  after: ReportState,
): boolean {
  return (
    reportPointersMatch(before, after) &&
    before.totalReportRows ===
      after.totalReportRows &&
    before.reportRowsSnapshot ===
      after.reportRowsSnapshot
  );
}

function createCanonicalFixtureRows(input: {
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
}): EtrylueNormalizedMediaRow[] {
  const dates = [
    input.dateFrom,
    input.dateTo,
    input.dateTo,
  ];

  return dates.map(
    (
      date,
      index,
    ): EtrylueNormalizedMediaRow => {
      const suffix =
        String(index + 1);

      return {
        date,
        report_date: date,
        day: date,
        ymd: date,

        channel:
          "검색광고",

        source:
          "네이버 검색광고",

        platform:
          "네이버",

        device:
          index % 2 === 0
            ? "PC"
            : "MOBILE",

        campaign:
          `materialization-fixture-campaign-${suffix}`,

        campaign_name:
          `materialization-fixture-campaign-${suffix}`,

        group:
          `materialization-fixture-group-${suffix}`,

        group_name:
          `materialization-fixture-group-${suffix}`,

        adgroup_name:
          `materialization-fixture-group-${suffix}`,

        keyword:
          `materialization-fixture-keyword-${suffix}`,

        keyword_name:
          `materialization-fixture-keyword-${suffix}`,

        impressions:
          100 + index,

        clicks:
          10 + index,

        cost:
          1_000 + index,

        conversions:
          1 + index,

        revenue:
          2_000 + index,

        rank:
          1 + index,

        row_level:
          "keyword",

        data_level:
          "keyword",

        row_level_reason:
          "snapshot_materialization_verification_fixture",

        provider:
          NAVER_PROVIDER,

        ingestion_source:
          "api",

        external_account_id:
          input.externalAccountId,

        external_campaign_id:
          `materialization-fixture-campaign-id-${suffix}`,

        external_group_id:
          `materialization-fixture-group-id-${suffix}`,

        external_keyword_id:
          `materialization-fixture-keyword-id-${suffix}`,

        provider_meta: {
          fixture: true,
          fixture_index: index,
          verification:
            "snapshot_materialization",
        },
      };
    },
  );
}

function createSyntheticCompleteSummary(input: {
  jobId: string;
  expectedRows: number;
}): MediaSyncStagingSummary {
  return {
    jobId: input.jobId,
    expectedRows: input.expectedRows,
    totalRows: input.expectedRows,
    minRowIndex:
      input.expectedRows > 0
        ? 0
        : null,
    maxRowIndex:
      input.expectedRows > 0
        ? input.expectedRows - 1
        : null,
    distinctRowIndexes:
      input.expectedRows,
    rowsInExpectedRange:
      input.expectedRows,
    missingExpectedRows: 0,
    outOfRangeRows: 0,
    scopeMismatchRows: 0,
    blankRowKeyRows: 0,
    missingFingerprintRows: 0,
    canonicalMismatchRows: 0,
    dateWindowCount:
      input.expectedRows > 0
        ? 1
        : 0,
    dateWindowSummaries: [],
    isComplete: true,
  };
}

async function readProtectedJobState(
  jobId: string,
): Promise<ProtectedJobState> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select(
        "status, progress, finished_at, error, error_detail, snapshot_ingestion_id",
      )
      .eq("id", jobId)
      .maybeSingle();

  if (error || !data) {
    throw new Error(
      "VERIFICATION_JOB_STATE_READ_FAILED",
    );
  }

  return {
    status:
      String(data.status ?? ""),
    progress:
      Number(data.progress ?? 0),
    finishedAt:
      data.finished_at ?? null,
    error:
      data.error ?? null,
    errorDetail:
      (data.error_detail ?? null) as JsonObject | null,
    snapshotIngestionId:
      data.snapshot_ingestion_id ?? null,
  };
}

function protectedJobStateMatchesExceptSnapshot(
  before: ProtectedJobState,
  after: ProtectedJobState,
): boolean {
  return (
    before.status === after.status &&
    before.progress === after.progress &&
    before.finishedAt === after.finishedAt &&
    before.error === after.error &&
    stableJson(before.errorDetail) ===
      stableJson(after.errorDetail)
  );
}

async function readMaterializedRows(
  reportId: string,
  ingestionId: string,
): Promise<MaterializedRow[]> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(REPORT_ROWS_TABLE)
      .select(
        "id, report_id, workspace_id, advertiser_id, ingestion_id, row_index, date, channel, device, source, row",
      )
      .eq("report_id", reportId)
      .eq("ingestion_id", ingestionId)
      .order("row_index", {
        ascending: true,
      });

  if (
    error ||
    !Array.isArray(data)
  ) {
    throw new Error(
      "VERIFICATION_MATERIALIZED_ROWS_READ_FAILED",
    );
  }

  return data as unknown as MaterializedRow[];
}

async function readStagingRowsSnapshot(
  jobId: string,
): Promise<string> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select("*")
      .eq("job_id", jobId)
      .order("row_index", {
        ascending: true,
      });

  if (
    error ||
    !Array.isArray(data)
  ) {
    throw new Error(
      "VERIFICATION_STAGING_SNAPSHOT_READ_FAILED",
    );
  }

  return stableJson(data);
}

async function expectMaterializationError(
  operation: () => Promise<unknown>,
  expectedCode:
    MediaSyncSnapshotMaterializationError["code"],
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return (
      error instanceof
        MediaSyncSnapshotMaterializationError &&
      error.code === expectedCode
    );
  }
}

async function mutateJobStatus(
  jobId: string,
  status: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .update({ status })
      .eq("id", jobId);

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_STATUS_MUTATION_FAILED",
    );
  }
}

async function mutateMaterializedRowForConflict(
  row: MaterializedRow,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const changedRow = {
    ...row.row,
    cost:
      Number(row.row.cost ?? 0) + 1,
  };

  const { error } =
    await supabase
      .from(REPORT_ROWS_TABLE)
      .update({ row: changedRow })
      .eq("id", row.id);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ROW_CONFLICT_MUTATION_FAILED",
    );
  }
}

async function restoreMaterializedRow(
  row: MaterializedRow,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(REPORT_ROWS_TABLE)
      .update({
        row: row.row,
        date: row.date,
        channel: row.channel,
        device: row.device,
        source: row.source,
      })
      .eq("id", row.id);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ROW_RESTORE_FAILED",
    );
  }
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  if (fixture.snapshotIngestionId) {
    const rowsDelete =
      await supabase
        .from(REPORT_ROWS_TABLE)
        .delete()
        .eq(
          "report_id",
          fixture.reportId,
        )
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
        .eq(
          "report_id",
          fixture.reportId,
        );

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
  ] = await Promise.all([
    supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("id", fixture.jobId),

    supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("job_id", fixture.jobId),

    fixture.snapshotIngestionId
      ? supabase
          .from(REPORT_INGESTIONS_TABLE)
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "id",
            fixture.snapshotIngestionId,
          )
      : Promise.resolve({
          count: 0,
          error: null,
        }),

    fixture.snapshotIngestionId
      ? supabase
          .from(REPORT_ROWS_TABLE)
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "report_id",
            fixture.reportId,
          )
          .eq(
            "ingestion_id",
            fixture.snapshotIngestionId,
          )
      : Promise.resolve({
          count: 0,
          error: null,
        }),
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
    (rowsCheck.count ?? 0) === 0
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

  let originalMaterializedRow:
    MaterializedRow | null =
    null;

  try {
    await assertNoActiveFixtureConflict(
      input.reportId,
    );

    reportStateBefore =
      await readReportState(
        input.reportId,
      );

    const pendingJob =
      await createPendingMediaSyncJob({
        reportId: input.reportId,
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        advertiserId: input.advertiserId,
        createdBy: input.createdBy,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        dataLevel: "keyword",
        mode: "snapshot_replace",
      });

    fixture = {
      jobId: pendingJob.id,
      reportId: pendingJob.report_id,
      workspaceId: pendingJob.workspace_id,
      advertiserId: pendingJob.advertiser_id,
      snapshotIngestionId: null,
    };

    const claimedJob =
      await claimNextNaverMediaSyncJob();

    if (
      !claimedJob ||
      claimedJob.id !== pendingJob.id ||
      claimedJob.status !== PROCESSING_STATUS
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
      context.job.id === claimedJob.id &&
      context.connection.id ===
        claimedJob.connection_id &&
      context.connection.workspaceId ===
        claimedJob.workspace_id &&
      context.connection.advertiserId ===
        claimedJob.advertiser_id &&
      context.connection.externalAccountId ===
        claimedJob.external_account_id;

    console.log(
      "worker context matches fixture:",
      contextMatches,
    );

    const canonicalRows =
      createCanonicalFixtureRows({
        externalAccountId:
          claimedJob.external_account_id,
        dateFrom:
          claimedJob.date_from,
        dateTo:
          claimedJob.date_to,
      });

    await appendMediaSyncStagingBatch({
      job: claimedJob,
      rows: canonicalRows.slice(0, 2),
      rowStartIndex: 0,
      dateWindowIndex: 0,
    });

    const syntheticCompleteSummary =
      createSyntheticCompleteSummary({
        jobId: claimedJob.id,
        expectedRows:
          canonicalRows.length,
      });

    const incompleteRejected =
      await expectMaterializationError(
        () =>
          materializeMediaSyncSnapshot({
            job: {
              ...claimedJob,
              normalized_rows:
                canonicalRows.length,
              inserted_rows:
                canonicalRows.length,
            },
            summary:
              syntheticCompleteSummary,
          }),
        "STAGING_INCOMPLETE",
      );

    console.log(
      "incomplete staging rejected:",
      incompleteRejected,
    );

    await appendMediaSyncStagingBatch({
      job: claimedJob,
      rows: canonicalRows.slice(2),
      rowStartIndex: 2,
      dateWindowIndex: 1,
    });

    const completeSummary =
      await assertMediaSyncStagingComplete({
        job: claimedJob,
        expectedRows:
          canonicalRows.length,
      });

    const checkpointJob: MediaSyncJobRecord = {
      ...claimedJob,
      raw_rows:
        canonicalRows.length,
      normalized_rows:
        canonicalRows.length,
      inserted_rows:
        canonicalRows.length,
      failed_rows: 0,
    };

    const checkpointUpdate =
      await getSupabaseAdmin()
        .from(MEDIA_SYNC_JOBS_TABLE)
        .update({
          raw_rows:
            canonicalRows.length,
          normalized_rows:
            canonicalRows.length,
          inserted_rows:
            canonicalRows.length,
          failed_rows: 0,
        })
        .eq("id", claimedJob.id)
        .eq("status", PROCESSING_STATUS);

    if (checkpointUpdate.error) {
      throw new Error(
        "VERIFICATION_CHECKPOINT_FIXTURE_UPDATE_FAILED",
      );
    }

    const protectedJobBefore =
      await readProtectedJobState(
        claimedJob.id,
      );

    await mutateJobStatus(
      claimedJob.id,
      "cancelled",
    );

    const nonProcessingRejected =
      await expectMaterializationError(
        () =>
          materializeMediaSyncSnapshot({
            job: checkpointJob,
            summary: completeSummary,
          }),
        "JOB_NOT_PROCESSING",
      );

    await mutateJobStatus(
      claimedJob.id,
      PROCESSING_STATUS,
    );

    console.log(
      "non-processing job rejected:",
      nonProcessingRejected,
    );

    const scopeMismatchRejected =
      await expectMaterializationError(
        () =>
          materializeMediaSyncSnapshot({
            job: {
              ...checkpointJob,
              external_account_id:
                `${checkpointJob.external_account_id}-mismatch`,
            },
            summary: completeSummary,
          }),
        "SCOPE_MISMATCH",
      );

    console.log(
      "scope mismatch rejected:",
      scopeMismatchRejected,
    );

    const stagingSnapshotBefore =
      await readStagingRowsSnapshot(
        claimedJob.id,
      );

    const firstMaterialization =
      await materializeMediaSyncSnapshot({
        job: checkpointJob,
        summary: completeSummary,
      });

    fixture.snapshotIngestionId =
      firstMaterialization
        .snapshotIngestionId;

    const firstMaterializationMatches =
      firstMaterialization.idempotent === false &&
      firstMaterialization.rowCount ===
        canonicalRows.length &&
      firstMaterialization.stagingFingerprint ===
        firstMaterialization.materializedFingerprint &&
      firstMaterialization.job.status ===
        PROCESSING_STATUS &&
      firstMaterialization.job.progress ===
        protectedJobBefore.progress &&
      firstMaterialization.job.finished_at ===
        protectedJobBefore.finishedAt;

    console.log(
      "new snapshot materialization matches:",
      firstMaterializationMatches,
    );

    const materializedRows =
      await readMaterializedRows(
        input.reportId,
        firstMaterialization
          .snapshotIngestionId,
      );

    const rowCountMatches =
      materializedRows.length ===
      canonicalRows.length;

    const rowIndexesMatch =
      materializedRows.every(
        (row, index) =>
          row.row_index === index,
      );

    const canonicalRowsMatch =
      materializedRows.every(
        (row, index) => {
          const expected =
            canonicalRows[index];

          return (
            expected !== undefined &&
            row.report_id ===
              input.reportId &&
            row.workspace_id ===
              input.workspaceId &&
            row.advertiser_id ===
              input.advertiserId &&
            row.ingestion_id ===
              firstMaterialization
                .snapshotIngestionId &&
            row.date === expected.date &&
            row.channel === expected.channel &&
            row.device === expected.device &&
            row.source === expected.source &&
            stableJson(row.row) ===
              stableJson(expected)
          );
        },
      );

    console.log(
      "report_rows row count matches:",
      rowCountMatches,
    );

    console.log(
      "report_rows row indexes preserved:",
      rowIndexesMatch,
    );

    console.log(
      "report_rows canonical values match:",
      canonicalRowsMatch,
    );

    const reportStateAfterFirst =
      await readReportState(
        input.reportId,
      );

    const pointerStateUnchanged =
      reportPointersMatch(
        reportStateBefore,
        reportStateAfterFirst,
      );

    const protectedJobAfter =
      await readProtectedJobState(
        claimedJob.id,
      );

    const onlySnapshotPointerChanged =
      protectedJobStateMatchesExceptSnapshot(
        protectedJobBefore,
        protectedJobAfter,
      ) &&
      protectedJobBefore.snapshotIngestionId ===
        null &&
      protectedJobAfter.snapshotIngestionId ===
        firstMaterialization
          .snapshotIngestionId;

    const stagingUnchanged =
      stagingSnapshotBefore ===
      await readStagingRowsSnapshot(
        claimedJob.id,
      );

    console.log(
      "report pointers unchanged:",
      pointerStateUnchanged,
    );

    console.log(
      "only snapshot_ingestion_id changed:",
      onlySnapshotPointerChanged,
    );

    console.log(
      "staging rows unchanged:",
      stagingUnchanged,
    );

    const retryResult =
      await materializeMediaSyncSnapshot({
        job: {
          ...checkpointJob,
          snapshot_ingestion_id:
            firstMaterialization
              .snapshotIngestionId,
        },
        summary: completeSummary,
      });

    const exactRetryIdempotent =
      retryResult.idempotent === true &&
      retryResult.snapshotIngestionId ===
        firstMaterialization
          .snapshotIngestionId &&
      retryResult.rowCount ===
        firstMaterialization.rowCount;

    const rowsAfterRetry =
      await readMaterializedRows(
        input.reportId,
        firstMaterialization
          .snapshotIngestionId,
      );

    const retryCreatedNoDuplicates =
      rowsAfterRetry.length ===
      canonicalRows.length;

    console.log(
      "exact retry idempotent:",
      exactRetryIdempotent,
    );

    console.log(
      "exact retry created no duplicates:",
      retryCreatedNoDuplicates,
    );

    originalMaterializedRow =
      rowsAfterRetry[0] ?? null;

    if (!originalMaterializedRow) {
      throw new Error(
        "VERIFICATION_CONFLICT_ROW_MISSING",
      );
    }

    await mutateMaterializedRowForConflict(
      originalMaterializedRow,
    );

    const conflictStateBefore =
      await readReportState(
        input.reportId,
      );

    const materializationConflictRejected =
      await expectMaterializationError(
        () =>
          materializeMediaSyncSnapshot({
            job: {
              ...checkpointJob,
              snapshot_ingestion_id:
                firstMaterialization
                  .snapshotIngestionId,
            },
            summary: completeSummary,
          }),
        "MATERIALIZATION_CONFLICT",
      );

    const conflictStateAfter =
      await readReportState(
        input.reportId,
      );

    const conflictLeftDatabaseUnchanged =
      fullReportStateMatches(
        conflictStateBefore,
        conflictStateAfter,
      );

    console.log(
      "materialization conflict rejected:",
      materializationConflictRejected,
    );

    console.log(
      "materialization conflict left DB unchanged:",
      conflictLeftDatabaseUnchanged,
    );

    await restoreMaterializedRow(
      originalMaterializedRow,
    );

    originalMaterializedRow = null;

    cleanupCompleted =
      await cleanupFixture(
        fixture,
      );

    console.log(
      "fixture cleanup completed:",
      cleanupCompleted,
    );

    const finalReportState =
      await readReportState(
        input.reportId,
      );

    const finalReportStateUnchanged =
      fullReportStateMatches(
        reportStateBefore,
        finalReportState,
      );

    console.log(
      "final report state unchanged:",
      finalReportStateUnchanged,
    );

    const verificationPassed =
      contextMatches &&
      incompleteRejected &&
      nonProcessingRejected &&
      scopeMismatchRejected &&
      firstMaterializationMatches &&
      rowCountMatches &&
      rowIndexesMatch &&
      canonicalRowsMatch &&
      pointerStateUnchanged &&
      onlySnapshotPointerChanged &&
      stagingUnchanged &&
      exactRetryIdempotent &&
      retryCreatedNoDuplicates &&
      materializationConflictRejected &&
      conflictLeftDatabaseUnchanged &&
      cleanupCompleted &&
      finalReportStateUnchanged;

    console.log(
      "verification passed:",
      verificationPassed,
    );

    if (!verificationPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (
      originalMaterializedRow !== null
    ) {
      try {
        await restoreMaterializedRow(
          originalMaterializedRow,
        );
      } catch {
        console.error(
          "emergency report row restore failed:",
          "RESTORE_ERROR",
        );

        process.exitCode = 1;
      }
    }

    if (
      fixture !== null &&
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
        const finalState =
          await readReportState(
            input.reportId,
          );

        const finalReportStateUnchanged =
          fullReportStateMatches(
            reportStateBefore,
            finalState,
          );

        console.log(
          "final report state unchanged:",
          finalReportStateUnchanged,
        );

        if (!finalReportStateUnchanged) {
          process.exitCode = 1;
        }
      } catch {
        console.error(
          "final report state check failed:",
          "REPORT_STATE_CHECK_ERROR",
        );

        process.exitCode = 1;
      }
    }
  }
}

function readSafeDatabaseDiagnostic(
  error: unknown,
): {
  code: string;
  message: string;
  details: string;
  hint: string;
} | null {
  if (
    !(error instanceof
      MediaSyncSnapshotMaterializationError)
  ) {
    return null;
  }

  const cause =
    error.cause;

  if (
    !cause ||
    typeof cause !== "object"
  ) {
    return null;
  }

  const record =
    cause as Record<string, unknown>;

  const safeText = (
    value: unknown,
  ): string => {
    if (typeof value !== "string") {
      return "";
    }

    return value
      .replace(
        /(?:secret|token|credential|ciphertext|accesslicense|authorization|password|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
        "[REDACTED]",
      )
      .slice(0, 2_000);
  };

  return {
    code:
      safeText(record.code),
    message:
      safeText(record.message),
    details:
      safeText(record.details),
    hint:
      safeText(record.hint),
  };
}

main().catch((error) => {
  const repositoryCode =
    error instanceof
      MediaSyncSnapshotMaterializationError
      ? error.code
      : "UNKNOWN_ERROR";

  console.error(
    "snapshot materialization verification failed:",
    repositoryCode,
  );

  const diagnostic =
    readSafeDatabaseDiagnostic(
      error,
    );

  if (diagnostic) {
    console.error(
      "safe database diagnostic:",
      diagnostic,
    );
  }

  process.exit(1);
});