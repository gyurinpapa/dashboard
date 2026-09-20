import { createHash } from "node:crypto";
import { validateMetaAdsCanonicalContext, type MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import { assertMetaAdsStagingContextScope, prepareMetaAdsStagingRows } from "./meta-ads-staging-contract";
import type { EtrylueNormalizedMediaRow, MediaSyncJobRecord } from "./types";
import type { MediaSyncStagingRepositoryRpcInvoker } from "./media-sync-staging-repository";
import type { MediaSyncStagingSummary } from "./media-sync-staging-summary-repository";
import type { MediaSyncSnapshotMaterializationResult } from "./media-sync-snapshot-materialization-repository";

export type MetaAdsProjectionTarget = Readonly<{
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  previousIngestionId: string | null;
  publishedIngestionId: string | null;
}>;

export type MetaAdsProjectionAuthority = MetaAdsProjectionTarget & Readonly<{
  jobId: string;
  snapshotIngestionId: string;
}>;

export type MetaAdsStagingProof = Readonly<{
  summary: MediaSyncStagingSummary;
  /** Opaque dataset proof, NOT a projection completion token or PostgreSQL jsonb hash implementation. */
  datasetFingerprint: string;
}>;

/** All ports are REQUIRED. No Supabase, worker or network fallback is supplied. */
export type MetaAdsStagingProjectionDependencies = Readonly<{
  invokeRpc: MediaSyncStagingRepositoryRpcInvoker;
  loadTargets: (job: MediaSyncJobRecord) => Promise<readonly MetaAdsProjectionTarget[]>;
  checkpoint: (input: { job: MediaSyncJobRecord; totalRows: number }) => Promise<MediaSyncJobRecord>;
  readStagingProof: (input: {
    job: MediaSyncJobRecord; context: MetaAdsCanonicalContext; expectedRows: number;
  }) => Promise<MetaAdsStagingProof>;
  loadProjectionAuthority: (input: {
    job: MediaSyncJobRecord; reportId: string; snapshotIngestionId: string;
  }) => Promise<MetaAdsProjectionAuthority>;
}>;

export type MetaAdsProjectionPhase =
  | "preflight" | "append" | "checkpoint" | "summary"
  | "materialize" | "authority" | "activate" | "finalize";

export class MetaAdsStagingProjectionError extends Error {
  readonly activatedReportIds: readonly string[];
  constructor(
    readonly phase: MetaAdsProjectionPhase,
    message: string,
    /** A failed activation response is not evidence of rollback. */
    readonly activationMayBePartial = false,
    activatedReportIds: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MetaAdsStagingProjectionError";
    this.activatedReportIds = Object.freeze([...activatedReportIds]);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

function requireCondition(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function uuid(value: unknown, nullable = false): void {
  requireCondition((nullable && value === null) || (typeof value === "string" && UUID.test(value)), "Invalid scope identifier.");
}

function batchSize(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  requireCondition(typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= max, "Invalid batch size.");
  return value;
}

/**
 * Repository SQL reference: create-naver-zero-row-snapshot-support.sql,
 * complete/activate/finalize v_completion_fingerprint. The legacy RPC field
 * names say "fingerprint", but carry this job/report/snapshot/range token.
 * It is not a content digest: staging validation and exact bounded batch
 * comparisons remain separate requirements. This does not enable live Meta SQL.
 */
function assertProjectionCompletionToken(
  result: { stagingFingerprint: string; materializedFingerprint: string },
  scope: { jobId: string; reportId: string; snapshotIngestionId: string; totalRows: number },
): void {
  uuid(scope.jobId); uuid(scope.reportId); uuid(scope.snapshotIngestionId);
  requireCondition(Number.isSafeInteger(scope.totalRows) && scope.totalRows > 0,
    "Invalid projection completion row count.");
  // PostgreSQL uuid::text uses lowercase, including for uppercase input UUIDs.
  const token = createHash("sha256").update([
    scope.jobId.toLowerCase(), scope.reportId.toLowerCase(), scope.snapshotIngestionId.toLowerCase(),
    scope.totalRows, 0, scope.totalRows - 1, 0, scope.totalRows - 1,
  ].join(":"), "utf8").digest("hex");
  requireCondition(result.stagingFingerprint === token && result.materializedFingerprint === token,
    "Projection completion token does not match its job, report, snapshot and row range.");
}

function assertExecution(
  before: MediaSyncJobRecord, after: MediaSyncJobRecord, totalRows: number,
  status: "processing" | "done" = "processing",
): void {
  requireCondition(after && typeof after === "object", "Execution result is missing.");
  for (const field of ["id", "report_id", "workspace_id", "advertiser_id", "connection_id", "provider",
    "external_account_id", "date_from", "date_to", "data_level", "mode", "created_by", "created_at",
    "started_at", "attempt_count", "previous_ingestion_id"] as const) {
    requireCondition(after[field] === before[field], "Execution identity or claim changed.");
  }
  requireCondition(after.status === status && after.raw_rows === totalRows &&
    after.normalized_rows === totalRows && after.inserted_rows === totalRows && after.failed_rows === 0 &&
    after.error === null && JSON.stringify(after.error_detail) === JSON.stringify(before.error_detail) &&
    after.automation_contract == null && after.sync_segment_progress == null &&
    Number.isInteger(after.progress) && after.progress >= 0 && after.progress <= 100,
  "Execution counters or state do not match the canonical dataset.");
  if (status === "processing") requireCondition(after.finished_at === null, "Execution finished prematurely.");
}

function validateTargets(value: readonly MetaAdsProjectionTarget[], job: MediaSyncJobRecord) {
  requireCondition(Array.isArray(value) && value.length > 0, "At least one projection target is required.");
  const targets = structuredClone(value);
  const seen = new Set<string>();
  for (const target of targets) {
    requireCondition(target && typeof target === "object", "Invalid projection target.");
    uuid(target.reportId); uuid(target.previousIngestionId, true); uuid(target.publishedIngestionId, true);
    requireCondition(target.workspaceId === job.workspace_id && target.advertiserId === job.advertiser_id &&
      target.createdBy === job.created_by && !seen.has(target.reportId), "Projection target scope or uniqueness is invalid.");
    seen.add(target.reportId);
  }
  const primary = targets.find((target) => target.reportId === job.report_id);
  requireCondition(primary && primary.previousIngestionId === job.previous_ingestion_id,
    "Primary compatibility mirror does not match the target baseline.");
  return [primary, ...targets.filter((target) => target !== primary)];
}

function validateProof(
  proof: MetaAdsStagingProof, job: MediaSyncJobRecord,
  rows: readonly { row: EtrylueNormalizedMediaRow }[],
): MetaAdsStagingProof {
  requireCondition(proof && typeof proof === "object" && typeof proof.datasetFingerprint === "string" && HASH.test(proof.datasetFingerprint),
    "Staging proof is missing or malformed.");
  const summary = proof.summary;
  requireCondition(summary && typeof summary === "object", "Staging summary is missing.");
  const expected: MediaSyncStagingSummary = {
    jobId: job.id, expectedRows: rows.length, totalRows: rows.length,
    minRowIndex: 0, maxRowIndex: rows.length - 1, distinctRowIndexes: rows.length,
    rowsInExpectedRange: rows.length, missingExpectedRows: 0, outOfRangeRows: 0,
    scopeMismatchRows: 0, blankRowKeyRows: 0, missingFingerprintRows: 0, canonicalMismatchRows: 0,
    dateWindowCount: 1, dateWindowSummaries: [{
      dateWindowIndex: 0, rowCount: rows.length, minRowIndex: 0, maxRowIndex: rows.length - 1,
      minDate: rows[0].row.date, maxDate: rows[rows.length - 1].row.date,
    }], isComplete: true,
  };
  for (const field of Object.keys(expected) as Array<keyof MediaSyncStagingSummary>) {
    if (field === "dateWindowSummaries") continue;
    requireCondition(summary[field] === expected[field], "Staging summary is incomplete or inconsistent.");
  }
  requireCondition(Array.isArray(summary.dateWindowSummaries) && summary.dateWindowSummaries.length === 1,
    "Unexpected staging date windows.");
  for (const field of Object.keys(expected.dateWindowSummaries[0]) as Array<keyof MediaSyncStagingSummary["dateWindowSummaries"][number]>) {
    requireCondition(summary.dateWindowSummaries[0]?.[field] === expected.dateWindowSummaries[0][field], "Staging date window mismatch.");
  }
  return structuredClone(proof);
}

/**
 * Offline first-run bridge: one complete dataset -> N equal-dataset projections.
 * No collection, job creation/claim, worker dispatch, SQL installation or live
 * dependency is provided. Different projection periods/fact-store replacement
 * and production resume are deliberately outside this contract.
 * Per-report activation is NOT atomic fanout; failures report possible partial
 * activation and never trigger finalization, rollback or an automatic job retry.
 */
export async function runMetaAdsStagingProjectionContract(input: Readonly<{
  job: MediaSyncJobRecord;
  context: MetaAdsCanonicalContext;
  rows: readonly EtrylueNormalizedMediaRow[];
  appendBatchSize?: number;
  materializationBatchSize?: number;
}>, dependencies: MetaAdsStagingProjectionDependencies) {
  let phase: MetaAdsProjectionPhase = "preflight";
  const activatedReportIds: string[] = [];
  let activationAttempted = false;
  try {
    requireCondition(input && typeof input === "object" && dependencies, "Input and injected dependencies are required.");
    for (const name of ["invokeRpc", "loadTargets", "checkpoint", "readStagingProof", "loadProjectionAuthority"] as const) {
      requireCondition(typeof dependencies[name] === "function", "Every Meta dependency must be explicitly injected.");
    }
    const context = validateMetaAdsCanonicalContext(input.context);
    const initial = structuredClone(input.job);
    requireCondition(initial && initial.provider === "meta_ads" && initial.status === "processing" &&
      initial.data_level === "creative" && initial.mode === "snapshot_replace" &&
      initial.snapshot_ingestion_id === null && initial.finished_at === null && initial.error === null &&
      initial.automation_contract == null && initial.sync_segment_progress == null &&
      (initial as MediaSyncJobRecord & { execution_contract?: unknown }).execution_contract == null &&
      Number.isSafeInteger(initial.attempt_count) && initial.attempt_count >= 1 &&
      typeof initial.started_at === "string" && Number.isFinite(Date.parse(initial.started_at)),
    "Only an unmaterialized, explicitly claimed Meta creative execution is supported.");
    for (const field of ["id", "report_id", "workspace_id", "advertiser_id", "connection_id", "created_by"] as const) uuid(initial[field]);
    uuid(initial.previous_ingestion_id, true);
    assertMetaAdsStagingContextScope(context, initial);
    const dataset = prepareMetaAdsStagingRows({ context, rows: input.rows });
    requireCondition(dataset.totalRows > 0, "Empty Meta snapshots remain unsupported; no projection may be activated.");
    for (const count of [initial.raw_rows, initial.normalized_rows, initial.inserted_rows, initial.failed_rows]) {
      requireCondition(count === 0, "This first-run bridge cannot reset or resume existing execution counters.");
    }
    const appendSize = batchSize(input.appendBatchSize, 2_000, 10_000);
    const materializationSize = batchSize(input.materializationBatchSize, 2_000, 5_000);
    const targets = validateTargets(await dependencies.loadTargets(structuredClone(initial)), initial);
    const assertTargetsUnchanged = async () => {
      const current = validateTargets(await dependencies.loadTargets(structuredClone(initial)), initial);
      requireCondition(current.length === targets.length, "Projection target set changed.");
      for (const target of targets) {
        const matched = current.find((item) => item.reportId === target.reportId);
        requireCondition(matched, "Projection target disappeared.");
        for (const field of ["reportId", "workspaceId", "advertiserId", "createdBy", "previousIngestionId", "publishedIngestionId"] as const) {
          requireCondition(matched[field] === target[field], "Projection target scope or baseline changed.");
        }
      }
    };
    // Load existing repositories only after the explicit-port and scope gates.
    const { appendMediaSyncStagingBatch } = await import("./media-sync-staging-repository");
    const { materializeMediaSyncSnapshot } = await import("./media-sync-snapshot-materialization-repository");
    const { activateMediaSyncSnapshot } = await import("./media-sync-snapshot-activation-repository");
    const { finalizeMediaSyncJob } = await import("./media-sync-finalization-repository");
    const rpcDependencies = { invokeRpc: dependencies.invokeRpc };

    phase = "append";
    for (let offset = 0; offset < dataset.totalRows; offset += appendSize) {
      const batch = dataset.rows.slice(offset, offset + appendSize);
      const result = await appendMediaSyncStagingBatch({
        job: structuredClone(initial), rows: batch.map((entry) => entry.row),
        rowStartIndex: offset, dateWindowIndex: 0, metaContext: context,
      }, rpcDependencies);
      requireCondition(result.submittedRows === batch.length && result.insertedRows + result.duplicateRows === batch.length &&
        result.firstRowIndex === offset && result.lastRowIndex === offset + batch.length - 1,
      "Append response does not match its global batch range.");
    }

    phase = "checkpoint";
    let job = structuredClone(await dependencies.checkpoint({ job: structuredClone(initial), totalRows: dataset.totalRows }));
    assertExecution(initial, job, dataset.totalRows);
    requireCondition(job.snapshot_ingestion_id === null, "Checkpoint must not establish a snapshot pointer.");
    phase = "summary";
    const readProof = async () => validateProof(await dependencies.readStagingProof({
      job: structuredClone(job), context, expectedRows: dataset.totalRows,
    }), job, dataset.rows);
    const proof = await readProof();

    const materialized: Array<{ target: MetaAdsProjectionTarget; result: MediaSyncSnapshotMaterializationResult }> = [];
    phase = "materialize";
    for (const target of targets) {
      const result = await materializeMediaSyncSnapshot({
        job: structuredClone(job), summary: structuredClone(proof.summary), targetReportId: target.reportId,
        batchSize: materializationSize, dependencies: rpcDependencies,
      });
      assertExecution(initial, result.job, dataset.totalRows);
      assertProjectionCompletionToken(result, {
        jobId: initial.id, reportId: target.reportId, snapshotIngestionId: result.snapshotIngestionId,
        totalRows: dataset.totalRows,
      });
      requireCondition(!materialized.some((entry) => entry.result.snapshotIngestionId === result.snapshotIngestionId),
        "A snapshot cannot belong to multiple projections.");
      materialized.push({ target, result });
      job = structuredClone(result.job);
    }

    phase = "authority";
    const authorities: MetaAdsProjectionAuthority[] = [];
    for (const entry of materialized) {
      const authority = structuredClone(await dependencies.loadProjectionAuthority({
        job: structuredClone(job), reportId: entry.target.reportId, snapshotIngestionId: entry.result.snapshotIngestionId,
      }));
      requireCondition(authority && authority.jobId === job.id && authority.snapshotIngestionId === entry.result.snapshotIngestionId,
        "Projection authority does not match its execution and snapshot.");
      for (const field of ["reportId", "workspaceId", "advertiserId", "createdBy", "previousIngestionId", "publishedIngestionId"] as const) {
        requireCondition(authority[field] === entry.target[field], "Projection authority does not match the target baseline.");
      }
      authorities.push(authority);
    }
    phase = "summary";
    const finalProof = await readProof();
    requireCondition(finalProof.datasetFingerprint === proof.datasetFingerprint, "Staging changed before activation.");
    phase = "authority";
    await assertTargetsUnchanged();

    phase = "activate";
    // Preserve the established fanout contract: secondary targets first,
    // primary compatibility projection last. This still is NOT atomic fanout.
    const activationOrder = [...authorities.slice(1), authorities[0]];
    for (const authority of activationOrder) {
      activationAttempted = true;
      const result = await activateMediaSyncSnapshot({
        job: structuredClone(job), expectedRows: dataset.totalRows, projection: authority, dependencies: rpcDependencies,
      });
      assertExecution(initial, result.job, dataset.totalRows);
      assertProjectionCompletionToken(result, {
        jobId: initial.id, reportId: authority.reportId, snapshotIngestionId: authority.snapshotIngestionId,
        totalRows: dataset.totalRows,
      });
      requireCondition(result.publishedIngestionId === authority.publishedIngestionId, "Activation changed published pointer.");
      activatedReportIds.push(authority.reportId);
      job = structuredClone(result.job);
    }

    phase = "finalize";
    requireCondition(activatedReportIds.length === targets.length, "Every projection must be activated before finalization.");
    await assertTargetsUnchanged();
    const finalization = await finalizeMediaSyncJob({ job: structuredClone(job), expectedRows: dataset.totalRows, dependencies: rpcDependencies });
    assertExecution(initial, finalization.job, dataset.totalRows, "done");
    assertProjectionCompletionToken(finalization, {
      jobId: initial.id, reportId: authorities[0].reportId, snapshotIngestionId: authorities[0].snapshotIngestionId,
      totalRows: dataset.totalRows,
    });
    requireCondition(finalization.publishedIngestionId === targets[0].publishedIngestionId && finalization.connectionUpdated &&
      finalization.connectionLastSyncAt === finalization.finishedAt, "Finalization violates the canonical or connection contract.");
    return {
      status: "mock_contract_completed" as const, totalRows: dataset.totalRows, rawRows: dataset.totalRows,
      projectionCount: targets.length, projections: authorities, finalization,
    };
  } catch (cause) {
    throw new MetaAdsStagingProjectionError(phase, `Meta staging/projection contract failed during ${phase}.`,
      activationAttempted, activatedReportIds, { cause });
  }
}
