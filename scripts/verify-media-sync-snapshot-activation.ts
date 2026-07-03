import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  appendMediaSyncStagingBatch,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  assertMediaSyncStagingComplete,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  materializeMediaSyncSnapshot,
} from "../src/lib/media-sync/media-sync-snapshot-materialization-repository";
import {
  activateMediaSyncSnapshot,
  MediaSyncSnapshotActivationError,
} from "../src/lib/media-sync/media-sync-snapshot-activation-repository";
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
  previousIngestionId: string | null;
  snapshotIngestionId: string | null;
  updatedAt: string;
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

        channel: "검색광고",
        source: "네이버 검색광고",
        platform: "네이버",
        device:
          index % 2 === 0
            ? "PC"
            : "MOBILE",

        campaign:
          `activation-fixture-campaign-${suffix}`,
        campaign_name:
          `activation-fixture-campaign-${suffix}`,
        group:
          `activation-fixture-group-${suffix}`,
        group_name:
          `activation-fixture-group-${suffix}`,
        adgroup_name:
          `activation-fixture-group-${suffix}`,
        keyword:
          `activation-fixture-keyword-${suffix}`,
        keyword_name:
          `activation-fixture-keyword-${suffix}`,

        impressions: 100 + index,
        clicks: 10 + index,
        cost: 1_000 + index,
        conversions: 1 + index,
        revenue: 2_000 + index,
        rank: 1 + index,

        row_level: "keyword",
        data_level: "keyword",
        row_level_reason:
          "snapshot_activation_verification_fixture",

        provider: NAVER_PROVIDER,
        ingestion_source: "api",
        external_account_id:
          input.externalAccountId,
        external_campaign_id:
          `activation-fixture-campaign-id-${suffix}`,
        external_group_id:
          `activation-fixture-group-id-${suffix}`,
        external_keyword_id:
          `activation-fixture-keyword-id-${suffix}`,

        provider_meta: {
          fixture: true,
          fixture_index: index,
          verification:
            "snapshot_activation",
        },
      };
    },
  );
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
        "status, progress, finished_at, error, error_detail, previous_ingestion_id, snapshot_ingestion_id, updated_at",
      )
      .eq("id", jobId)
      .maybeSingle();

  if (error || !data) {
    throw new Error(
      "VERIFICATION_JOB_STATE_READ_FAILED",
    );
  }

  return {
    status: String(data.status ?? ""),
    progress: Number(data.progress ?? 0),
    finishedAt:
      data.finished_at ?? null,
    error:
      data.error ?? null,
    errorDetail:
      (data.error_detail ?? null) as JsonObject | null,
    previousIngestionId:
      data.previous_ingestion_id ?? null,
    snapshotIngestionId:
      data.snapshot_ingestion_id ?? null,
    updatedAt:
      String(data.updated_at ?? ""),
  };
}

function protectedJobStateMatches(
  before: ProtectedJobState,
  after: ProtectedJobState,
): boolean {
  return (
    before.status === after.status &&
    before.progress === after.progress &&
    before.finishedAt === after.finishedAt &&
    before.error === after.error &&
    stableJson(before.errorDetail) ===
      stableJson(after.errorDetail) &&
    before.previousIngestionId ===
      after.previousIngestionId &&
    before.snapshotIngestionId ===
      after.snapshotIngestionId &&
    before.updatedAt === after.updatedAt
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

async function expectActivationError(
  operation: () => Promise<unknown>,
  expectedCode:
    MediaSyncSnapshotActivationError["code"],
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return (
      error instanceof
        MediaSyncSnapshotActivationError &&
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

async function mutateMaterializedRowForInvalidSnapshot(
  row: MaterializedRow,
): Promise<void> {
  const changedRow = {
    ...row.row,
    cost:
      Number(row.row.cost ?? 0) + 1,
  };

  const { error } =
    await getSupabaseAdmin()
      .from(REPORT_ROWS_TABLE)
      .update({ row: changedRow })
      .eq("id", row.id);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ROW_MUTATION_FAILED",
    );
  }
}

async function restoreMaterializedRow(
  row: MaterializedRow,
): Promise<void> {
  const { error } =
    await getSupabaseAdmin()
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

async function setCurrentIngestionId(
  reportId: string,
  ingestionId: string | null,
): Promise<void> {
  const { error } =
    await getSupabaseAdmin()
      .from(REPORTS_TABLE)
      .update({
        current_ingestion_id:
          ingestionId,
      })
      .eq("id", reportId);

  if (error) {
    throw new Error(
      "VERIFICATION_CURRENT_POINTER_UPDATE_FAILED",
    );
  }
}

async function cleanupFixture(
  fixture: VerificationFixture,
  originalCurrentIngestionId: string | null,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  await setCurrentIngestionId(
    fixture.reportId,
    originalCurrentIngestionId,
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
          .eq("report_id", fixture.reportId)
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

    const materialization =
      await materializeMediaSyncSnapshot({
        job: checkpointJob,
        summary: completeSummary,
      });

    fixture.snapshotIngestionId =
      materialization.snapshotIngestionId;

    const activationJob =
      materialization.job;

    let protectedJobBefore =
      await readProtectedJobState(
        claimedJob.id,
      );

    const reportStateAfterMaterialization =
      await readReportState(
        input.reportId,
      );

    const materializationLeftPointersUnchanged =
      reportStateAfterMaterialization.currentIngestionId ===
        reportStateBefore.currentIngestionId &&
      reportStateAfterMaterialization.publishedIngestionId ===
        reportStateBefore.publishedIngestionId;

    console.log(
      "materialization left report pointers unchanged:",
      materializationLeftPointersUnchanged,
    );

    const stagingSnapshotBefore =
      await readStagingRowsSnapshot(
        claimedJob.id,
      );

    const rowsBeforeActivation =
      await readMaterializedRows(
        input.reportId,
        materialization.snapshotIngestionId,
      );

    const materializedRowsSnapshotBefore =
      stableJson(rowsBeforeActivation);

    const missingSnapshotRejected =
      await expectActivationError(
        () =>
          activateMediaSyncSnapshot({
            job: {
              ...activationJob,
              snapshot_ingestion_id: null,
            },
            expectedRows:
              canonicalRows.length,
          }),
        "SNAPSHOT_NOT_MATERIALIZED",
      );

    console.log(
      "missing materialized snapshot rejected:",
      missingSnapshotRejected,
    );

    await mutateJobStatus(
      claimedJob.id,
      "cancelled",
    );

    const nonProcessingRejected =
      await expectActivationError(
        () =>
          activateMediaSyncSnapshot({
            job: activationJob,
            expectedRows:
              canonicalRows.length,
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
      await expectActivationError(
        () =>
          activateMediaSyncSnapshot({
            job: {
              ...activationJob,
              external_account_id:
                `${activationJob.external_account_id}-mismatch`,
            },
            expectedRows:
              canonicalRows.length,
          }),
        "SCOPE_MISMATCH",
      );

    console.log(
      "scope mismatch rejected:",
      scopeMismatchRejected,
    );

    originalMaterializedRow =
      rowsBeforeActivation[0] ?? null;

    if (!originalMaterializedRow) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROW_MISSING",
      );
    }

    await mutateMaterializedRowForInvalidSnapshot(
      originalMaterializedRow,
    );

    const invalidSnapshotStateBefore =
      await readReportState(
        input.reportId,
      );

    const invalidSnapshotRejected =
      await expectActivationError(
        () =>
          activateMediaSyncSnapshot({
            job: activationJob,
            expectedRows:
              canonicalRows.length,
          }),
        "SNAPSHOT_INVALID",
      );

    const invalidSnapshotStateAfter =
      await readReportState(
        input.reportId,
      );

    const invalidSnapshotLeftPointerUnchanged =
      invalidSnapshotStateBefore.currentIngestionId ===
        invalidSnapshotStateAfter.currentIngestionId &&
      invalidSnapshotStateBefore.publishedIngestionId ===
        invalidSnapshotStateAfter.publishedIngestionId;

    console.log(
      "invalid materialized snapshot rejected:",
      invalidSnapshotRejected,
    );

    console.log(
      "invalid snapshot left pointers unchanged:",
      invalidSnapshotLeftPointerUnchanged,
    );

    await restoreMaterializedRow(
      originalMaterializedRow,
    );

    originalMaterializedRow = null;

    protectedJobBefore =
      await readProtectedJobState(
        claimedJob.id,
      );

    const firstActivation =
      await activateMediaSyncSnapshot({
        job: activationJob,
        expectedRows:
          canonicalRows.length,
      });

    const reportStateAfterActivation =
      await readReportState(
        input.reportId,
      );

    const firstActivationMatches =
      firstActivation.idempotent === false &&
      firstActivation.previousIngestionId ===
        reportStateBefore.currentIngestionId &&
      firstActivation.snapshotIngestionId ===
        materialization.snapshotIngestionId &&
      firstActivation.currentIngestionId ===
        materialization.snapshotIngestionId &&
      firstActivation.publishedIngestionId ===
        reportStateBefore.publishedIngestionId &&
      firstActivation.rowCount ===
        canonicalRows.length &&
      firstActivation.stagingFingerprint ===
        firstActivation.materializedFingerprint;

    const onlyCurrentPointerChanged =
      reportStateAfterActivation.currentIngestionId ===
        materialization.snapshotIngestionId &&
      reportStateAfterActivation.publishedIngestionId ===
        reportStateBefore.publishedIngestionId;

    console.log(
      "new snapshot activation matches:",
      firstActivationMatches,
    );

    console.log(
      "only current_ingestion_id changed:",
      onlyCurrentPointerChanged,
    );

    console.log(
      "published_ingestion_id unchanged:",
      reportStateAfterActivation.publishedIngestionId ===
        reportStateBefore.publishedIngestionId,
    );

    const protectedJobAfter =
      await readProtectedJobState(
        claimedJob.id,
      );

    const protectedJobUnchanged =
      protectedJobStateMatches(
        protectedJobBefore,
        protectedJobAfter,
      );

    const stagingUnchanged =
      stagingSnapshotBefore ===
      await readStagingRowsSnapshot(
        claimedJob.id,
      );

    const materializedRowsUnchanged =
      materializedRowsSnapshotBefore ===
      stableJson(
        await readMaterializedRows(
          input.reportId,
          materialization.snapshotIngestionId,
        ),
      );

    console.log(
      "protected job state unchanged:",
      protectedJobUnchanged,
    );

    console.log(
      "staging rows unchanged:",
      stagingUnchanged,
    );

    console.log(
      "materialized report_rows unchanged:",
      materializedRowsUnchanged,
    );

    const retryResult =
      await activateMediaSyncSnapshot({
        job: activationJob,
        expectedRows:
          canonicalRows.length,
      });

    const exactRetryIdempotent =
      retryResult.idempotent === true &&
      retryResult.snapshotIngestionId ===
        firstActivation.snapshotIngestionId &&
      retryResult.currentIngestionId ===
        firstActivation.currentIngestionId &&
      retryResult.publishedIngestionId ===
        firstActivation.publishedIngestionId;

    console.log(
      "exact retry idempotent:",
      exactRetryIdempotent,
    );

    const conflictPointer =
      randomUUID();

    await setCurrentIngestionId(
      input.reportId,
      conflictPointer,
    );

    const conflictStateBefore =
      await readReportState(
        input.reportId,
      );

    const activationConflictRejected =
      await expectActivationError(
        () =>
          activateMediaSyncSnapshot({
            job: activationJob,
            expectedRows:
              canonicalRows.length,
          }),
        "ACTIVATION_CONFLICT",
      );

    const conflictStateAfter =
      await readReportState(
        input.reportId,
      );

    const activationConflictLeftDbUnchanged =
      conflictStateBefore.currentIngestionId ===
        conflictStateAfter.currentIngestionId &&
      conflictStateBefore.publishedIngestionId ===
        conflictStateAfter.publishedIngestionId &&
      conflictStateBefore.reportRowsSnapshot ===
        conflictStateAfter.reportRowsSnapshot;

    console.log(
      "stale pointer activation conflict rejected:",
      activationConflictRejected,
    );

    console.log(
      "activation conflict left DB unchanged:",
      activationConflictLeftDbUnchanged,
    );

    await setCurrentIngestionId(
      input.reportId,
      materialization.snapshotIngestionId,
    );

    cleanupCompleted =
      await cleanupFixture(
        fixture,
        reportStateBefore.currentIngestionId,
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
      finalReportState.currentIngestionId ===
        reportStateBefore.currentIngestionId &&
      finalReportState.publishedIngestionId ===
        reportStateBefore.publishedIngestionId &&
      finalReportState.totalReportRows ===
        reportStateBefore.totalReportRows &&
      finalReportState.reportRowsSnapshot ===
        reportStateBefore.reportRowsSnapshot;

    console.log(
      "final report state unchanged:",
      finalReportStateUnchanged,
    );

    const verificationPassed =
      contextMatches &&
      materializationLeftPointersUnchanged &&
      missingSnapshotRejected &&
      nonProcessingRejected &&
      scopeMismatchRejected &&
      invalidSnapshotRejected &&
      invalidSnapshotLeftPointerUnchanged &&
      firstActivationMatches &&
      onlyCurrentPointerChanged &&
      protectedJobUnchanged &&
      stagingUnchanged &&
      materializedRowsUnchanged &&
      exactRetryIdempotent &&
      activationConflictRejected &&
      activationConflictLeftDbUnchanged &&
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
      reportStateBefore !== null &&
      !cleanupCompleted
    ) {
      try {
        const emergencyCleanupCompleted =
          await cleanupFixture(
            fixture,
            reportStateBefore.currentIngestionId,
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

    if (reportStateBefore !== null) {
      try {
        const finalState =
          await readReportState(
            input.reportId,
          );

        const finalReportStateUnchanged =
          finalState.currentIngestionId ===
            reportStateBefore.currentIngestionId &&
          finalState.publishedIngestionId ===
            reportStateBefore.publishedIngestionId &&
          finalState.totalReportRows ===
            reportStateBefore.totalReportRows &&
          finalState.reportRowsSnapshot ===
            reportStateBefore.reportRowsSnapshot;

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
      MediaSyncSnapshotActivationError)
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
    code: safeText(record.code),
    message: safeText(record.message),
    details: safeText(record.details),
    hint: safeText(record.hint),
  };
}

main().catch((error) => {
  const repositoryCode =
    error instanceof
      MediaSyncSnapshotActivationError
      ? error.code
      : "UNKNOWN_ERROR";

  console.error(
    "snapshot activation verification failed:",
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
