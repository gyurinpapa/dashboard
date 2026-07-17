import { createHash } from "node:crypto";

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

const LARGE_FIXTURE_ENV =
  "MEDIA_SYNC_LARGE_FIXTURE";

const LARGE_FIXTURE_ROW_COUNT_ENV =
  "MEDIA_SYNC_LARGE_FIXTURE_ROW_COUNT";

const DEFAULT_LARGE_FIXTURE_ROW_COUNT =
  44_514;

const MAX_LARGE_FIXTURE_ROW_COUNT =
  100_000;

const STAGING_APPEND_BATCH_SIZE =
  500;

const MATERIALIZATION_BATCH_SIZE =
  2_000;

const DATABASE_PAGE_SIZE =
  1_000;

const CLEANUP_DELETE_BATCH_SIZE =
  100;

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

function readBooleanEnv(
  name: string,
): boolean {
  const value =
    String(process.env[name] ?? "")
      .trim()
      .toLowerCase();

  return (
    value === "1" ||
    value === "true" ||
    value === "yes" ||
    value === "on"
  );
}

function readLargeFixtureRowCount(): number {
  if (!readBooleanEnv(LARGE_FIXTURE_ENV)) {
    return 3;
  }

  const rawValue =
    String(
      process.env[
        LARGE_FIXTURE_ROW_COUNT_ENV
      ] ??
        DEFAULT_LARGE_FIXTURE_ROW_COUNT,
    ).trim();

  const value =
    Number(rawValue);

  if (
    !Number.isSafeInteger(value) ||
    value < 3 ||
    value > MAX_LARGE_FIXTURE_ROW_COUNT
  ) {
    throw new Error(
      `${LARGE_FIXTURE_ROW_COUNT_ENV} must be an integer between 3 and ${MAX_LARGE_FIXTURE_ROW_COUNT}.`,
    );
  }

  return value;
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
      {
        cause:
          reportResult.error ?? undefined,
      },
    );
  }

  /*
   * Large materialization fixtures must not scan or count every existing
   * report_rows record before they can begin. The fixture already verifies
   * the newly created snapshot by ingestion_id and removes it during cleanup.
   * Here we preserve the safety contract by checking only the two report
   * pointers, which are the state this materialization step must never change.
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
  rowCount: number;
}): EtrylueNormalizedMediaRow[] {
  return Array.from(
    { length: input.rowCount },
    (
      _,
      index,
    ): EtrylueNormalizedMediaRow => {
      const suffix =
        String(index + 1);

      const date =
        index === 0
          ? input.dateFrom
          : index % 2 === 0
            ? input.dateFrom
            : input.dateTo;

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
          100 + (index % 1_000),

        clicks:
          10 + (index % 100),

        cost:
          1_000 + index,

        conversions:
          1 + (index % 10),

        revenue:
          2_000 + index,

        rank:
          1 + (index % 15),

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
            input.rowCount > 3
              ? "large_snapshot_materialization"
              : "snapshot_materialization",
        },
      };
    },
  );
}

async function appendRemainingStagingRows(input: {
  job: MediaSyncJobRecord;
  rows: EtrylueNormalizedMediaRow[];
  startIndex: number;
}): Promise<void> {
  let completedRows =
    input.startIndex;

  for (
    let rowStartIndex = input.startIndex;
    rowStartIndex < input.rows.length;
    rowStartIndex += STAGING_APPEND_BATCH_SIZE
  ) {
    const rows =
      input.rows.slice(
        rowStartIndex,
        rowStartIndex +
          STAGING_APPEND_BATCH_SIZE,
      );

    try {
      await appendMediaSyncStagingBatch({
        job: input.job,
        rows,
        rowStartIndex,
        dateWindowIndex:
          Math.floor(
            rowStartIndex /
              STAGING_APPEND_BATCH_SIZE,
          ),
      });
    } catch (error) {
      console.error(
        "staging append failed:",
        {
          startRowIndex:
            rowStartIndex,
          endRowIndex:
            rowStartIndex +
            rows.length -
            1,
          batchSize:
            rows.length,
          completedRows,
          totalRows:
            input.rows.length,
        },
      );

      const diagnostic =
        readSafeErrorDiagnostic(
          error,
        );

      if (diagnostic) {
        console.error(
          "staging append diagnostic:",
          diagnostic,
        );
      }

      throw new Error(
        "VERIFICATION_STAGING_APPEND_FAILED",
        { cause: error },
      );
    }

    completedRows +=
      rows.length;

    if (
      completedRows === input.rows.length ||
      completedRows % 5_000 < rows.length
    ) {
      console.log(
        "staging fixture rows appended:",
        `${completedRows}/${input.rows.length}`,
      );
    }
  }
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

  const rows:
    MaterializedRow[] = [];

  for (
    let offset = 0;
    ;
    offset += DATABASE_PAGE_SIZE
  ) {
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
        })
        .range(
          offset,
          offset + DATABASE_PAGE_SIZE - 1,
        );

    if (
      error ||
      !Array.isArray(data)
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_READ_FAILED",
      );
    }

    rows.push(
      ...(data as unknown as MaterializedRow[]),
    );

    if (
      data.length < DATABASE_PAGE_SIZE
    ) {
      break;
    }
  }

  return rows;
}

async function readStagingRowsSnapshot(
  jobId: string,
): Promise<string> {
  const supabase =
    getSupabaseAdmin();

  const hash =
    createHash("sha256");

  for (
    let offset = 0;
    ;
    offset += DATABASE_PAGE_SIZE
  ) {
    const { data, error } =
      await supabase
        .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
        .select("*")
        .eq("job_id", jobId)
        .order("row_index", {
          ascending: true,
        })
        .range(
          offset,
          offset + DATABASE_PAGE_SIZE - 1,
        );

    if (
      error ||
      !Array.isArray(data)
    ) {
      throw new Error(
        "VERIFICATION_STAGING_SNAPSHOT_READ_FAILED",
      );
    }

    for (const row of data) {
      hash.update(
        stableJson(row),
      );
      hash.update("\n");
    }

    if (
      data.length < DATABASE_PAGE_SIZE
    ) {
      break;
    }
  }

  return hash.digest("hex");
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

async function deleteMaterializedRowsInBatches(input: {
  reportId: string;
  ingestionId: string;
}): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  while (true) {
    const page =
      await supabase
        .from(REPORT_ROWS_TABLE)
        .select("id")
        .eq("report_id", input.reportId)
        .eq("ingestion_id", input.ingestionId)
        .order("row_index", {
          ascending: true,
        })
        .limit(CLEANUP_DELETE_BATCH_SIZE);

    if (
      page.error ||
      !Array.isArray(page.data)
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_READ_FAILED",
        { cause: page.error },
      );
    }

    if (page.data.length === 0) {
      return;
    }

    const ids =
      page.data
        .map((row) => row.id)
        .filter(
          (id): id is string =>
            typeof id === "string",
        );

    const deletion =
      await supabase
        .from(REPORT_ROWS_TABLE)
        .delete()
        .in("id", ids);

    if (deletion.error) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_FAILED",
        { cause: deletion.error },
      );
    }
  }
}

async function deleteStagingRowsInBatches(
  jobId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  while (true) {
    const page =
      await supabase
        .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
        .select("id")
        .eq("job_id", jobId)
        .order("row_index", {
          ascending: true,
        })
        .limit(CLEANUP_DELETE_BATCH_SIZE);

    if (
      page.error ||
      !Array.isArray(page.data)
    ) {
      throw new Error(
        "VERIFICATION_STAGING_CLEANUP_READ_FAILED",
        { cause: page.error },
      );
    }

    if (page.data.length === 0) {
      return;
    }

    const ids =
      page.data
        .map((row) => row.id)
        .filter(
          (id): id is string =>
            typeof id === "string",
        );

    const deletion =
      await supabase
        .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
        .delete()
        .in("id", ids);

    if (deletion.error) {
      throw new Error(
        "VERIFICATION_STAGING_CLEANUP_FAILED",
        { cause: deletion.error },
      );
    }
  }
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  if (fixture.snapshotIngestionId) {
    await deleteMaterializedRowsInBatches({
      reportId:
        fixture.reportId,
      ingestionId:
        fixture.snapshotIngestionId,
    });

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
        { cause: ingestionDelete.error },
      );
    }
  }

  await deleteStagingRowsInBatches(
    fixture.jobId,
  );

  const jobDelete =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .delete()
      .eq("id", fixture.jobId)
      .eq("report_id", fixture.reportId);

  if (jobDelete.error) {
    throw new Error(
      "VERIFICATION_JOB_CLEANUP_FAILED",
      { cause: jobDelete.error },
    );
  }

  /*
   * Cleanup verification must remain bounded.
   *
   * We only need to know whether at least one fixture row remains. Exact
   * counts can scan large fixture sets again and may fail even after deletion
   * has already completed. Check each table sequentially with limit(1) so an
   * error identifies the exact verification step and preserves its cause.
   */
  const jobCheck =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id")
      .eq("id", fixture.jobId)
      .limit(1);

  if (
    jobCheck.error ||
    !Array.isArray(jobCheck.data)
  ) {
    throw new Error(
      "VERIFICATION_JOB_CLEANUP_CHECK_FAILED",
      { cause: jobCheck.error ?? undefined },
    );
  }

  if (jobCheck.data.length > 0) {
    return false;
  }

  const stagingCheck =
    await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select("id")
      .eq("job_id", fixture.jobId)
      .limit(1);

  if (
    stagingCheck.error ||
    !Array.isArray(stagingCheck.data)
  ) {
    throw new Error(
      "VERIFICATION_STAGING_CLEANUP_CHECK_FAILED",
      {
        cause:
          stagingCheck.error ?? undefined,
      },
    );
  }

  if (stagingCheck.data.length > 0) {
    return false;
  }

  if (fixture.snapshotIngestionId) {
    const ingestionCheck =
      await supabase
        .from(REPORT_INGESTIONS_TABLE)
        .select("id")
        .eq(
          "id",
          fixture.snapshotIngestionId,
        )
        .limit(1);

    if (
      ingestionCheck.error ||
      !Array.isArray(ingestionCheck.data)
    ) {
      throw new Error(
        "VERIFICATION_INGESTION_CLEANUP_CHECK_FAILED",
        {
          cause:
            ingestionCheck.error ??
            undefined,
        },
      );
    }

    if (ingestionCheck.data.length > 0) {
      return false;
    }

    const rowsCheck =
      await supabase
        .from(REPORT_ROWS_TABLE)
        .select("id")
        .eq(
          "report_id",
          fixture.reportId,
        )
        .eq(
          "ingestion_id",
          fixture.snapshotIngestionId,
        )
        .limit(1);

    if (
      rowsCheck.error ||
      !Array.isArray(rowsCheck.data)
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_CHECK_FAILED",
        {
          cause:
            rowsCheck.error ?? undefined,
        },
      );
    }

    if (rowsCheck.data.length > 0) {
      return false;
    }
  }

  return true;
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

    const fixtureRowCount =
      readLargeFixtureRowCount();

    const largeFixtureEnabled =
      fixtureRowCount > 3;

    console.log(
      "large materialization fixture:",
      largeFixtureEnabled,
    );

    console.log(
      "fixture row count:",
      fixtureRowCount,
    );

    console.log(
      "materialization batch size:",
      MATERIALIZATION_BATCH_SIZE,
    );

    const canonicalRows =
      createCanonicalFixtureRows({
        externalAccountId:
          claimedJob.external_account_id,
        dateFrom:
          claimedJob.date_from,
        dateTo:
          claimedJob.date_to,
        rowCount:
          fixtureRowCount,
      });

    const incompleteRowCount =
      Math.min(2, canonicalRows.length);

    await appendMediaSyncStagingBatch({
      job: claimedJob,
      rows: canonicalRows.slice(
        0,
        incompleteRowCount,
      ),
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
            batchSize:
              MATERIALIZATION_BATCH_SIZE,
          }),
        "STAGING_INCOMPLETE",
      );

    console.log(
      "incomplete staging rejected:",
      incompleteRejected,
    );

    await appendRemainingStagingRows({
      job:
        claimedJob,
      rows:
        canonicalRows,
      startIndex:
        incompleteRowCount,
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
            batchSize:
              MATERIALIZATION_BATCH_SIZE,
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
            batchSize:
              MATERIALIZATION_BATCH_SIZE,
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
        batchSize:
          MATERIALIZATION_BATCH_SIZE,
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
        batchSize:
          MATERIALIZATION_BATCH_SIZE,
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
            batchSize:
              MATERIALIZATION_BATCH_SIZE,
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
      } catch (error) {
        console.error(
          "emergency report row restore failed:",
          "RESTORE_ERROR",
        );

        const diagnostic =
          readSafeErrorDiagnostic(
            error,
          );

        if (diagnostic) {
          console.error(
            "emergency restore diagnostic:",
            diagnostic,
          );
        }

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
      } catch (error) {
        console.error(
          "emergency cleanup failed:",
          "CLEANUP_ERROR",
        );

        const diagnostic =
          readSafeErrorDiagnostic(
            error,
          );

        if (diagnostic) {
          console.error(
            "emergency cleanup diagnostic:",
            diagnostic,
          );
        }

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
      } catch (error) {
        console.error(
          "final report state check failed:",
          "REPORT_STATE_CHECK_ERROR",
        );

        const diagnostic =
          readSafeErrorDiagnostic(
            error,
          );

        if (diagnostic) {
          console.error(
            "final report state diagnostic:",
            diagnostic,
          );
        }

        process.exitCode = 1;
      }
    }
  }
}

type SafeErrorDiagnostic = {
  depth: number;
  name: string;
  code: string;
  message: string;
  details: string;
  hint: string;
};

function readSafeErrorDiagnostic(
  error: unknown,
): SafeErrorDiagnostic[] | null {
  const diagnostics:
    SafeErrorDiagnostic[] = [];

  const visited =
    new Set<unknown>();

  const safeText = (
    value: unknown,
    maxLength = 2_000,
  ): string => {
    if (typeof value !== "string") {
      return "";
    }

    return value
      .replace(
        /(?:secret|token|credential|ciphertext|accesslicense|authorization|password|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
        "[REDACTED]",
      )
      .slice(0, maxLength);
  };

  let current:
    unknown =
      error;

  for (
    let depth = 0;
    depth <= 8;
    depth += 1
  ) {
    if (
      !current ||
      typeof current !== "object"
    ) {
      if (
        depth === 0 &&
        current !== undefined &&
        current !== null
      ) {
        diagnostics.push({
          depth,
          name:
            typeof current,
          code:
            "",
          message:
            safeText(
              String(current),
            ),
          details:
            "",
          hint:
            "",
        });
      }

      break;
    }

    if (visited.has(current)) {
      break;
    }

    visited.add(current);

    const record =
      current as Record<string, unknown>;

    diagnostics.push({
      depth,
      name:
        safeText(
          record.name,
          200,
        ) ||
        (
          current instanceof Error
            ? current.name
            : current.constructor?.name ?? "UnknownError"
        ),

      code:
        safeText(
          record.code,
          200,
        ),

      message:
        safeText(
          record.message,
        ) ||
        (
          current instanceof Error
            ? safeText(current.message)
            : ""
        ),

      details:
        safeText(
          record.details,
        ),

      hint:
        safeText(
          record.hint,
        ),
    });

    current =
      record.cause;
  }

  return diagnostics.length > 0
    ? diagnostics
    : null;
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
    readSafeErrorDiagnostic(
      error,
    );

  if (diagnostic) {
    console.error(
      "safe error diagnostic:",
      diagnostic,
    );
  }

  process.exit(1);
});