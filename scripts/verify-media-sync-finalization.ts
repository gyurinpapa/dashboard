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
} from "../src/lib/media-sync/media-sync-snapshot-activation-repository";
import {
  finalizeMediaSyncJob,
  MediaSyncFinalizationError,
} from "../src/lib/media-sync/media-sync-finalization-repository";
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

const MEDIA_CONNECTIONS_TABLE =
  "media_connections";

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

type JobState = {
  status: string;
  progress: number;
  rawRows: number;
  normalizedRows: number;
  insertedRows: number;
  failedRows: number;
  previousIngestionId: string | null;
  snapshotIngestionId: string | null;
  finishedAt: string | null;
  error: string | null;
  errorDetail: JsonObject | null;
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
          `finalization-fixture-campaign-${suffix}`,

        campaign_name:
          `finalization-fixture-campaign-${suffix}`,

        group:
          `finalization-fixture-group-${suffix}`,

        group_name:
          `finalization-fixture-group-${suffix}`,

        adgroup_name:
          `finalization-fixture-group-${suffix}`,

        keyword:
          `finalization-fixture-keyword-${suffix}`,

        keyword_name:
          `finalization-fixture-keyword-${suffix}`,

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
          "sync_finalization_verification_fixture",

        provider:
          NAVER_PROVIDER,

        ingestion_source:
          "api",

        external_account_id:
          input.externalAccountId,

        external_campaign_id:
          `finalization-fixture-campaign-id-${suffix}`,

        external_group_id:
          `finalization-fixture-group-id-${suffix}`,

        external_keyword_id:
          `finalization-fixture-keyword-id-${suffix}`,

        provider_meta: {
          fixture: true,
          fixture_index: index,
          verification:
            "sync_finalization",
        },
      };
    },
  );
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

  /*
   * This fixture verifies its own materialized snapshot separately by
   * ingestion_id. Reading every historical report_rows record here can scan
   * unrelated failed snapshots and reintroduce a large, unbounded query.
   *
   * Activation and finalization are allowed to change only the current
   * pointer, job final state, and connection sync metadata. The published
   * pointer must remain unchanged throughout the fixture.
   */
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
      0,

    reportRowsSnapshot:
      "POINTER_ONLY_REPORT_STATE",
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

  if (error || !data) {
    throw new Error(
      "VERIFICATION_CONNECTION_STATE_READ_FAILED",
    );
  }

  return {
    id: String(data.id),
    lastSyncAt:
      data.last_sync_at ?? null,
    lastError:
      data.last_error ?? null,
    updatedAt:
      String(data.updated_at ?? ""),
  };
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
          "previous_ingestion_id",
          "snapshot_ingestion_id",
          "finished_at",
          "error",
          "error_detail",
          "updated_at",
        ].join(", "),
      )
      .eq("id", jobId)
      .maybeSingle();

  if (error || !data) {
    throw new Error(
      "VERIFICATION_JOB_STATE_READ_FAILED",
    );
  }

  const record =
    data as unknown as Record<string, unknown>;

  const nullableString = (
    value: unknown,
  ): string | null => {
    return typeof value === "string"
      ? value
      : null;
  };

  return {
    status:
      String(record.status ?? ""),
    progress:
      Number(record.progress ?? 0),
    rawRows:
      Number(record.raw_rows ?? 0),
    normalizedRows:
      Number(record.normalized_rows ?? 0),
    insertedRows:
      Number(record.inserted_rows ?? 0),
    failedRows:
      Number(record.failed_rows ?? 0),
    previousIngestionId:
      nullableString(
        record.previous_ingestion_id,
      ),
    snapshotIngestionId:
      nullableString(
        record.snapshot_ingestion_id,
      ),
    finishedAt:
      nullableString(
        record.finished_at,
      ),
    error:
      nullableString(
        record.error,
      ),
    errorDetail:
      (record.error_detail ?? null) as JsonObject | null,
    updatedAt:
      String(record.updated_at ?? ""),
  };
}

function immutableJobCountsMatch(
  before: JobState,
  after: JobState,
): boolean {
  return (
    before.rawRows === after.rawRows &&
    before.normalizedRows === after.normalizedRows &&
    before.insertedRows === after.insertedRows &&
    before.failedRows === after.failedRows &&
    before.previousIngestionId ===
      after.previousIngestionId &&
    before.snapshotIngestionId ===
      after.snapshotIngestionId &&
    stableJson(before.errorDetail) ===
      stableJson(after.errorDetail)
  );
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

async function expectFinalizationError(
  operation: () => Promise<unknown>,
  expectedCode:
    MediaSyncFinalizationError["code"],
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return (
      error instanceof
        MediaSyncFinalizationError &&
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

async function resetConnectionSyncForFixture(
  connectionId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(MEDIA_CONNECTIONS_TABLE)
      .update({
        last_sync_at: null,
      })
      .eq("id", connectionId);

  if (error) {
    throw new Error(
      "VERIFICATION_CONNECTION_RESET_FAILED",
    );
  }
}

async function mutateConnectionLastSyncFuture(
  connectionId: string,
): Promise<string> {
  const future =
    new Date(Date.now() + 86_400_000)
      .toISOString();

  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(MEDIA_CONNECTIONS_TABLE)
      .update({
        last_sync_at: future,
        last_error: null,
      })
      .eq("id", connectionId);

  if (error) {
    throw new Error(
      "VERIFICATION_CONNECTION_FUTURE_MUTATION_FAILED",
    );
  }

  return future;
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
        last_sync_at: state.lastSyncAt,
        last_error: state.lastError,
        updated_at: state.updatedAt,
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

  let cleanupCompleted =
    false;

  try {
    await assertNoActiveFixtureConflict(
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
      connectionId: pendingJob.connection_id,
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

    const beforeActivationRejected =
      await expectFinalizationError(
        () =>
          finalizeMediaSyncJob({
            job: materialization.job,
            expectedRows:
              canonicalRows.length,
          }),
        "SNAPSHOT_NOT_ACTIVE",
      );

    console.log(
      "pre-activation finalization rejected:",
      beforeActivationRejected,
    );

    const activation =
      await activateMediaSyncSnapshot({
        job: materialization.job,
        expectedRows:
          canonicalRows.length,
      });

    const activatedJob =
      activation.job;

    const activatedSnapshotCurrent =
      activation.currentIngestionId ===
      materialization.snapshotIngestionId;

    const activationFingerprintMatchesMaterialization =
      activation.stagingFingerprint ===
        activation.materializedFingerprint &&
      activation.stagingFingerprint ===
        materialization.stagingFingerprint &&
      activation.materializedFingerprint ===
        materialization.materializedFingerprint;

    console.log(
      "activated snapshot is current:",
      activatedSnapshotCurrent,
    );

    console.log(
      "activation fingerprint matches materialization:",
      activationFingerprintMatchesMaterialization,
    );

    const stagingSnapshotBefore =
      await readStagingRowsSnapshot(
        claimedJob.id,
      );

    const materializedRowsBefore =
      await readMaterializedRows(
        input.reportId,
        materialization.snapshotIngestionId,
      );

    const materializedRowsSnapshotBefore =
      stableJson(materializedRowsBefore);

    await mutateJobStatus(
      claimedJob.id,
      "cancelled",
    );

    const nonProcessingRejected =
      await expectFinalizationError(
        () =>
          finalizeMediaSyncJob({
            job: activatedJob,
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
      await expectFinalizationError(
        () =>
          finalizeMediaSyncJob({
            job: {
              ...activatedJob,
              external_account_id:
                `${activatedJob.external_account_id}-mismatch`,
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

    const jobStateBeforeFinalize =
      await readJobState(
        claimedJob.id,
      );

    const reportStateBeforeFinalize =
      await readReportState(
        input.reportId,
      );

    await resetConnectionSyncForFixture(
      input.connectionId,
    );

    const connectionStateBeforeFinalize =
      await readConnectionState(
        input.connectionId,
      );

    const firstFinalization =
      await finalizeMediaSyncJob({
        job: activatedJob,
        expectedRows:
          canonicalRows.length,
      });

    const jobStateAfterFinalize =
      await readJobState(
        claimedJob.id,
      );

    const reportStateAfterFinalize =
      await readReportState(
        input.reportId,
      );

    const connectionStateAfterFinalize =
      await readConnectionState(
        input.connectionId,
      );

    const newFinalizationMatches =
      firstFinalization.idempotent === false &&
      firstFinalization.job.status === "done" &&
      firstFinalization.job.progress === 100 &&
      typeof firstFinalization.job.finished_at ===
        "string" &&
      firstFinalization.job.error === null &&
      firstFinalization.rowCount ===
        canonicalRows.length &&
      firstFinalization.currentIngestionId ===
        materialization.snapshotIngestionId &&
      firstFinalization.snapshotIngestionId ===
        materialization.snapshotIngestionId &&
      firstFinalization.stagingFingerprint ===
        firstFinalization.materializedFingerprint &&
      firstFinalization.stagingFingerprint ===
        activation.stagingFingerprint &&
      firstFinalization.materializedFingerprint ===
        activation.materializedFingerprint &&
      firstFinalization.stagingFingerprint ===
        materialization.stagingFingerprint &&
      firstFinalization.materializedFingerprint ===
        materialization.materializedFingerprint;

    const onlyJobFinalStateChanged =
      jobStateBeforeFinalize.status ===
        PROCESSING_STATUS &&
      jobStateAfterFinalize.status === "done" &&
      jobStateAfterFinalize.progress === 100 &&
      jobStateAfterFinalize.finishedAt !== null &&
      jobStateAfterFinalize.error === null &&
      immutableJobCountsMatch(
        jobStateBeforeFinalize,
        jobStateAfterFinalize,
      );

    const reportPointersUnchanged =
      reportStateBeforeFinalize.currentIngestionId ===
        reportStateAfterFinalize.currentIngestionId &&
      reportStateBeforeFinalize.publishedIngestionId ===
        reportStateAfterFinalize.publishedIngestionId;

    const reportRowsUnchanged =
      reportStateBeforeFinalize.reportRowsSnapshot ===
      reportStateAfterFinalize.reportRowsSnapshot;

    const connectionSyncUpdated =
      connectionStateBeforeFinalize.lastSyncAt !==
        connectionStateAfterFinalize.lastSyncAt &&
      connectionStateAfterFinalize.lastSyncAt ===
        firstFinalization.finishedAt &&
      connectionStateAfterFinalize.lastError === null &&
      firstFinalization.connectionUpdated === true;

    console.log(
      "new sync finalization matches:",
      newFinalizationMatches,
    );

    console.log(
      "only job final state changed:",
      onlyJobFinalStateChanged,
    );

    console.log(
      "report pointers unchanged:",
      reportPointersUnchanged,
    );

    console.log(
      "report_rows unchanged:",
      reportRowsUnchanged,
    );

    console.log(
      "connection sync updated:",
      connectionSyncUpdated,
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
      "staging rows unchanged:",
      stagingUnchanged,
    );

    console.log(
      "materialized report_rows unchanged:",
      materializedRowsUnchanged,
    );

    const retryResult =
      await finalizeMediaSyncJob({
        job: firstFinalization.job,
        expectedRows:
          canonicalRows.length,
      });

    const exactRetryIdempotent =
      retryResult.idempotent === true &&
      retryResult.connectionUpdated === false &&
      retryResult.finishedAt ===
        firstFinalization.finishedAt &&
      retryResult.snapshotIngestionId ===
        firstFinalization.snapshotIngestionId;

    console.log(
      "exact retry idempotent:",
      exactRetryIdempotent,
    );

    const futureSyncAt =
      await mutateConnectionLastSyncFuture(
        input.connectionId,
      );

    const futureRetryResult =
      await finalizeMediaSyncJob({
        job: firstFinalization.job,
        expectedRows:
          canonicalRows.length,
      });

    const connectionNewerSyncNotRegressed =
      futureRetryResult.idempotent === true &&
      futureRetryResult.connectionUpdated === false &&
      Date.parse(
        futureRetryResult.connectionLastSyncAt,
      ) === Date.parse(futureSyncAt);

    console.log(
      "newer connection sync not regressed:",
      connectionNewerSyncNotRegressed,
    );

    await restoreConnectionState(
      connectionStateAfterFinalize,
    );

    await restoreReportPointer(
      input.reportId,
      reportStateBefore,
    );

    const stalePointerRejected =
      await expectFinalizationError(
        () =>
          finalizeMediaSyncJob({
            job: firstFinalization.job,
            expectedRows:
              canonicalRows.length,
          }),
        "SNAPSHOT_NOT_ACTIVE",
      );

    await getSupabaseAdmin()
      .from(REPORTS_TABLE)
      .update({
        current_ingestion_id:
          materialization.snapshotIngestionId,
      })
      .eq("id", input.reportId);

    const stalePointerLeftDatabaseUnchanged =
      stalePointerRejected === true;

    console.log(
      "stale current snapshot rejected:",
      stalePointerRejected,
    );

    console.log(
      "stale pointer left DB unchanged:",
      stalePointerLeftDatabaseUnchanged,
    );

    cleanupCompleted =
      await cleanupFixture({
        fixture,
        reportStateBefore,
        connectionStateBefore,
      });

    console.log(
      "fixture cleanup completed:",
      cleanupCompleted,
    );

    const finalReportState =
      await readReportState(
        input.reportId,
      );

    const finalConnectionState =
      await readConnectionState(
        input.connectionId,
      );

    const finalReportStateUnchanged =
      reportStateBefore.currentIngestionId ===
        finalReportState.currentIngestionId &&
      reportStateBefore.publishedIngestionId ===
        finalReportState.publishedIngestionId &&
      reportStateBefore.totalReportRows ===
        finalReportState.totalReportRows &&
      reportStateBefore.reportRowsSnapshot ===
        finalReportState.reportRowsSnapshot;

    const finalConnectionStateRestored =
      connectionStateBefore.lastSyncAt ===
        finalConnectionState.lastSyncAt &&
      connectionStateBefore.lastError ===
        finalConnectionState.lastError;

    console.log(
      "final report state unchanged:",
      finalReportStateUnchanged,
    );

    console.log(
      "final connection state restored:",
      finalConnectionStateRestored,
    );

    const verificationPassed =
      contextMatches &&
      beforeActivationRejected &&
      activatedSnapshotCurrent &&
      activationFingerprintMatchesMaterialization &&
      nonProcessingRejected &&
      scopeMismatchRejected &&
      newFinalizationMatches &&
      onlyJobFinalStateChanged &&
      reportPointersUnchanged &&
      reportRowsUnchanged &&
      connectionSyncUpdated &&
      stagingUnchanged &&
      materializedRowsUnchanged &&
      exactRetryIdempotent &&
      connectionNewerSyncNotRegressed &&
      stalePointerRejected &&
      stalePointerLeftDatabaseUnchanged &&
      cleanupCompleted &&
      finalReportStateUnchanged &&
      finalConnectionStateRestored;

    console.log(
      "verification passed:",
      verificationPassed,
    );

    if (!verificationPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (
      fixture !== null &&
      reportStateBefore !== null &&
      connectionStateBefore !== null &&
      !cleanupCompleted
    ) {
      try {
        const emergencyCleanupCompleted =
          await cleanupFixture({
            fixture,
            reportStateBefore,
            connectionStateBefore,
          });

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
          reportStateBefore.currentIngestionId ===
            finalState.currentIngestionId &&
          reportStateBefore.publishedIngestionId ===
            finalState.publishedIngestionId &&
          reportStateBefore.totalReportRows ===
            finalState.totalReportRows &&
          reportStateBefore.reportRowsSnapshot ===
            finalState.reportRowsSnapshot;

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

    if (connectionStateBefore !== null) {
      try {
        const finalConnectionState =
          await readConnectionState(
            input.connectionId,
          );

        const finalConnectionStateRestored =
          connectionStateBefore.lastSyncAt ===
            finalConnectionState.lastSyncAt &&
          connectionStateBefore.lastError ===
            finalConnectionState.lastError;

        console.log(
          "final connection state restored:",
          finalConnectionStateRestored,
        );

        if (!finalConnectionStateRestored) {
          process.exitCode = 1;
        }
      } catch {
        console.error(
          "final connection state check failed:",
          "CONNECTION_STATE_CHECK_ERROR",
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
  if (!(error instanceof MediaSyncFinalizationError)) {
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
      MediaSyncFinalizationError
      ? error.code
      : "UNKNOWN_ERROR";

  console.error(
    "sync finalization verification failed:",
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
