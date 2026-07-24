import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CLAIM_CONTRACT,
  ExactNaverProductionRecoveryMaterializationClaimError,
  claimExactNaverProductionRecoveryMaterializationCandidate,
  createExactNaverProductionRecoveryMaterializationClaimInput,
  type ClaimExactNaverProductionRecoveryMaterializationCandidateInput,
  type ExactNaverProductionRecoveryMaterializationClaimRpcArgs,
  type ExactNaverProductionRecoveryMaterializationClaimRpcInvoker,
} from "../src/lib/media-sync/media-sync-exact-naver-production-recovery-materialization-claim-repository";
import type {
  JsonObject,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const NEW_SQL_PATH =
  "scripts/sql/create-claim-exact-naver-production-recovery-materialization-candidate.sql";
const NEW_REPOSITORY_PATH =
  "src/lib/media-sync/media-sync-exact-naver-production-recovery-materialization-claim-repository.ts";
const EXISTING_V3_SQL_PATH =
  "scripts/sql/create-claim-exact-naver-production-recovery-candidate.sql";
const WORKER_ORCHESTRATION_PATH =
  "src/lib/media-sync/media-sync-worker-orchestration-repository.ts";
const MATERIALIZATION_REPOSITORY_PATH =
  "src/lib/media-sync/media-sync-snapshot-materialization-repository.ts";
const JOBS_REPOSITORY_PATH =
  "src/lib/media-sync/media-sync-jobs-repository.ts";
const TYPES_PATH =
  "src/lib/media-sync/types.ts";

const EXACT_RPC =
  "claim_exact_naver_production_recovery_materialization_candidate";
const GENERIC_CLAIM_RPC =
  "claim_next_naver_media_sync_job";
const PREPARE_MATERIALIZATION_RPC =
  "prepare_media_sync_snapshot_materialization";
const BATCH_MATERIALIZATION_RPC =
  "materialize_media_sync_snapshot_batch";
const COMPLETE_MATERIALIZATION_RPC =
  "complete_media_sync_snapshot_materialization";
const ACTIVATION_RPC =
  "activate_media_sync_snapshot";
const FINALIZATION_RPC =
  "finalize_media_sync_job";

const CLAIMED_AT =
  "2026-07-22T15:00:00.000Z";

const SOURCE_IDENTITY_DIGEST =
  "ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40";
const REPORT_INGESTIONS_DESCRIPTOR_DIGEST =
  "117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776";
const CURRENT_SENTINEL_DIGEST =
  "05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7";
const PUBLISHED_SENTINEL_DIGEST =
  "1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0";

const CANDIDATE_ROWS = 44_604;
const SOURCE_ROWS = 44_514;

const contract =
  EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CLAIM_CONTRACT;

type UnknownRecord =
  Record<string, unknown>;

type StagingSummary = {
  rows: number;
  minRowIndex: number;
  maxRowIndex: number;
  distinctRowIndexes: number;
  distinctWindowRowKeys: number;
  keywordRows: number;
  creativeRows: number;
  mixedRows: number;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  overlapRows: number;
  invalidFingerprintRows: number;
  scopeMismatchRows: number;
  canonicalMismatchRows: number;
  invalidGrainRows: number;
  fingerprint: string;
};

type SourceSummary = {
  rows: number;
  minRowIndex: number;
  maxRowIndex: number;
  distinctRowIndexes: number;
  distinctWindowRowKeys: number;
  invalidFingerprintRows: number;
  identityDigest: string;
};

type ReportState = {
  currentIngestionId: string;
  publishedIngestionId: string;
  reportIngestionsCount: number;
  reportIngestionsDescriptorDigest: string;
  currentDescriptorRows: number;
  currentDescriptorStatus: string;
  publishedDescriptorRows: number;
  publishedDescriptorStatus: string;
  currentSentinelCount: number;
  currentSentinelDigest: string;
  publishedSentinelCount: number;
  publishedSentinelDigest: string;
};

type SimulatedDatabaseState = {
  candidate: MediaSyncJobRecord;
  otherJobs: MediaSyncJobRecord[];
  sourceJobId: string;
  activeJobCount: number;
  candidateStaging: StagingSummary;
  sourceStaging: SourceSummary;
  report: ReportState;
};

type RpcCallCounts = {
  exactClaim: number;
  genericClaim: number;
  prepareMaterialization: number;
  batchMaterialization: number;
  completeMaterialization: number;
  activation: number;
  finalization: number;
  unknown: number;
};

type VerificationHarness = {
  state: SimulatedDatabaseState;
  calls: RpcCallCounts;
  rpcCalls: Array<{
    functionName: string;
    args: ExactNaverProductionRecoveryMaterializationClaimRpcArgs;
  }>;
  invokeRpc: ExactNaverProductionRecoveryMaterializationClaimRpcInvoker;
};

type ProtectedFileSnapshot = {
  path: string;
  digest: string;
};

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function clone<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T;
}

function parseFixtureJob(
  value: unknown,
): MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new Error(
      "DI_FIXTURE_INVALID_JOB_RECORD",
    );
  }

  return clone(
    value as unknown as MediaSyncJobRecord,
  );
}

function sha256(
  value: string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

async function snapshotFiles(
  paths: readonly string[],
): Promise<ProtectedFileSnapshot[]> {
  return Promise.all(
    paths.map(
      async (
        path,
      ): Promise<ProtectedFileSnapshot> => {
        const source =
          await readFile(
            path,
            "utf8",
          );

        return {
          path,
          digest:
            sha256(source),
        };
      },
    ),
  );
}

function createRecoveryContract(): JsonObject {
  return {
    approved_clicks: 1183,
    approved_conversions: 67,
    approved_cost: 113850,
    approved_impressions: 7075,
    approved_revenue: 12729300,
    confirmation_token:
      contract.expectedConfirmationToken,
    contract_version: 2,
    expected_current_ingestion_id:
      contract.expectedCurrentIngestionId,
    expected_published_ingestion_id:
      contract.expectedPublishedIngestionId,
    isolated: true,
    keyword_counts_derived_from_staging: true,
    prepared_at:
      "2026-07-22T00:27:59.363Z",
    repair_applied_at:
      contract.expectedCandidateUpdatedAt,
    repair_excluded_rows: 1204,
    repair_fingerprint_algorithm:
      "chunked_sha256_v1:block_size=10000",
    repair_kind:
      "brand_search_cross_grain_dedup_v1",
    repair_matched_campaign_count: 3,
    repair_mixed_only_campaign_count: 2,
    repair_original_candidate_fingerprint:
      "f11def9d7faa36e7233878a5cb533c048c17225f519324de80c289f5d8e4ad28",
    repair_original_confirmation_token:
      "31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127",
    repair_repaired_rows: CANDIDATE_ROWS,
    repair_repaired_staging_fingerprint:
      contract.expectedStagingFingerprint,
    repair_source_candidate_rows: 45_808,
    request_counts_reconstructed: false,
    source_identity_digest:
      SOURCE_IDENTITY_DIGEST,
    source_job_id:
      contract.sourceJobId,
    source_job_updated_at:
      "2026-07-19T11:59:16.834Z",
    source_staging_rows: SOURCE_ROWS,
  };
}

function createProcessingCheckpoint(): JsonObject {
  return {
    version: 1,
    saved_at:
      contract.expectedCandidateUpdatedAt,
    raw_rows: CANDIDATE_ROWS,
    normalized_rows: CANDIDATE_ROWS,
    inserted_rows: CANDIDATE_ROWS,
    failed_rows: 0,
    collector: {
      combined_version: 1,
      phase: "completed",
      next_row_index:
        CANDIDATE_ROWS,
      keyword: {
        complete: true,
      },
      authoritative: {
        complete: true,
      },
    },
    recovery:
      createRecoveryContract(),
  };
}

function createCandidateJob(): MediaSyncJobRecord {
  return {
    id:
      contract.candidateJobId,
    workspace_id:
      contract.workspaceId,
    advertiser_id:
      contract.advertiserId,
    report_id:
      contract.reportId,
    connection_id:
      contract.connectionId,
    provider:
      "naver_searchad",
    external_account_id:
      "fixture-account",
    date_from:
      "2026-05-01",
    date_to:
      "2026-05-02",
    data_level:
      "keyword",
    mode:
      "snapshot_replace",
    status:
      "cancelled",
    progress: 99,
    raw_rows:
      CANDIDATE_ROWS,
    normalized_rows:
      CANDIDATE_ROWS,
    inserted_rows:
      CANDIDATE_ROWS,
    failed_rows: 0,
    previous_ingestion_id:
      contract.expectedCurrentIngestionId,
    snapshot_ingestion_id:
      null,
    attempt_count: 12,
    error: null,
    error_detail: {
      processing_checkpoint:
        createProcessingCheckpoint(),
    },
    created_by:
      "00000000-0000-4000-8000-000000000001",
    created_at:
      "2026-07-22T00:27:59.363Z",
    started_at:
      null,
    finished_at:
      null,
    updated_at:
      contract.expectedCandidateUpdatedAt,
  };
}

function createDatabaseState(): SimulatedDatabaseState {
  const otherJob =
    createCandidateJob();

  otherJob.id =
    "00000000-0000-4000-8000-000000000020";
  otherJob.updated_at =
    "2026-07-22T14:00:00.000Z";

  return {
    candidate:
      createCandidateJob(),
    otherJobs: [
      otherJob,
    ],
    sourceJobId:
      contract.sourceJobId,
    activeJobCount: 0,
    candidateStaging: {
      rows:
        CANDIDATE_ROWS,
      minRowIndex: 0,
      maxRowIndex:
        CANDIDATE_ROWS - 1,
      distinctRowIndexes:
        CANDIDATE_ROWS,
      distinctWindowRowKeys:
        CANDIDATE_ROWS,
      keywordRows: 43_310,
      creativeRows: 1_244,
      mixedRows: 50,
      impressions: 7_075,
      clicks: 1_183,
      cost: 113_850,
      conversions: 67,
      revenue: 12_729_300,
      overlapRows: 0,
      invalidFingerprintRows: 0,
      scopeMismatchRows: 0,
      canonicalMismatchRows: 0,
      invalidGrainRows: 0,
      fingerprint:
        contract.expectedStagingFingerprint,
    },
    sourceStaging: {
      rows:
        SOURCE_ROWS,
      minRowIndex: 0,
      maxRowIndex:
        SOURCE_ROWS - 1,
      distinctRowIndexes:
        SOURCE_ROWS,
      distinctWindowRowKeys:
        SOURCE_ROWS,
      invalidFingerprintRows: 0,
      identityDigest:
        SOURCE_IDENTITY_DIGEST,
    },
    report: {
      currentIngestionId:
        contract.expectedCurrentIngestionId,
      publishedIngestionId:
        contract.expectedPublishedIngestionId,
      reportIngestionsCount: 11,
      reportIngestionsDescriptorDigest:
        REPORT_INGESTIONS_DESCRIPTOR_DIGEST,
      currentDescriptorRows: 118,
      currentDescriptorStatus:
        "success",
      publishedDescriptorRows:
        SOURCE_ROWS,
      publishedDescriptorStatus:
        "success",
      currentSentinelCount: 3,
      currentSentinelDigest:
        CURRENT_SENTINEL_DIGEST,
      publishedSentinelCount: 3,
      publishedSentinelDigest:
        PUBLISHED_SENTINEL_DIGEST,
    },
  };
}

function createCallCounts(): RpcCallCounts {
  return {
    exactClaim: 0,
    genericClaim: 0,
    prepareMaterialization: 0,
    batchMaterialization: 0,
    completeMaterialization: 0,
    activation: 0,
    finalization: 0,
    unknown: 0,
  };
}

function expectedRpcArgs():
  ExactNaverProductionRecoveryMaterializationClaimRpcArgs {
  return {
    p_candidate_job_id:
      contract.candidateJobId,
    p_source_job_id:
      contract.sourceJobId,
    p_expected_candidate_updated_at:
      contract.expectedCandidateUpdatedAt,
    p_expected_confirmation_token:
      contract.expectedConfirmationToken,
    p_expected_staging_fingerprint:
      contract.expectedStagingFingerprint,
    p_expected_current_ingestion_id:
      contract.expectedCurrentIngestionId,
    p_expected_published_ingestion_id:
      contract.expectedPublishedIngestionId,
  };
}

function readCheckpoint(
  candidate: MediaSyncJobRecord,
): UnknownRecord | null {
  if (!isPlainObject(candidate.error_detail)) {
    return null;
  }

  const checkpoint =
    candidate.error_detail.processing_checkpoint;

  return isPlainObject(checkpoint)
    ? checkpoint
    : null;
}

function readCollector(
  candidate: MediaSyncJobRecord,
): UnknownRecord | null {
  const checkpoint =
    readCheckpoint(candidate);

  if (!checkpoint) {
    return null;
  }

  const collector =
    checkpoint.collector;

  return isPlainObject(collector)
    ? collector
    : null;
}

function readRecovery(
  candidate: MediaSyncJobRecord,
): UnknownRecord | null {
  const checkpoint =
    readCheckpoint(candidate);

  if (!checkpoint) {
    return null;
  }

  const recovery =
    checkpoint.recovery;

  return isPlainObject(recovery)
    ? recovery
    : null;
}

function readAuthoritative(
  candidate: MediaSyncJobRecord,
): UnknownRecord | null {
  const collector =
    readCollector(candidate);

  if (!collector) {
    return null;
  }

  const authoritative =
    collector.authoritative;

  return isPlainObject(authoritative)
    ? authoritative
    : null;
}

function validateSimulatedDatabaseState(
  state: SimulatedDatabaseState,
): string | null {
  const candidate =
    state.candidate;
  const checkpoint =
    readCheckpoint(candidate);
  const collector =
    readCollector(candidate);
  const recovery =
    readRecovery(candidate);
  const authoritative =
    readAuthoritative(candidate);

  if (
    candidate.id !== contract.candidateJobId ||
    state.sourceJobId !== contract.sourceJobId
  ) {
    return "EMC_EXACT_JOB_ID_MISMATCH";
  }

  if (
    candidate.status !== "cancelled" ||
    candidate.progress !== 99 ||
    candidate.attempt_count !== 12 ||
    candidate.started_at !== null ||
    candidate.finished_at !== null ||
    candidate.error !== null
  ) {
    return "EMC_CANDIDATE_STATE_MISMATCH";
  }

  if (
    candidate.updated_at !==
      contract.expectedCandidateUpdatedAt
  ) {
    return "EMC_CANDIDATE_UPDATED_AT_MISMATCH";
  }

  if (
    candidate.snapshot_ingestion_id !== null
  ) {
    return "EMC_SNAPSHOT_ALREADY_EXISTS";
  }

  if (
    !checkpoint ||
    !collector ||
    collector.phase !== "completed"
  ) {
    return "EMC_CHECKPOINT_MISMATCH";
  }

  if (
    !authoritative ||
    authoritative.complete !== true
  ) {
    return "EMC_AUTHORITATIVE_NOT_COMPLETE";
  }

  if (
    !recovery ||
    recovery.contract_version !== 2 ||
    recovery.repair_kind !==
      "brand_search_cross_grain_dedup_v1"
  ) {
    return "EMC_RECOVERY_CONTRACT_MISMATCH";
  }

  if (
    recovery.confirmation_token !==
      contract.expectedConfirmationToken
  ) {
    return "EMC_CONFIRMATION_TOKEN_MISMATCH";
  }

  if (
    recovery.repair_repaired_staging_fingerprint !==
      contract.expectedStagingFingerprint
  ) {
    return "EMC_STAGING_FINGERPRINT_MISMATCH";
  }

  const staging =
    state.candidateStaging;

  if (
    staging.rows !== CANDIDATE_ROWS ||
    staging.distinctRowIndexes !== CANDIDATE_ROWS ||
    staging.distinctWindowRowKeys !== CANDIDATE_ROWS
  ) {
    return "EMC_STAGING_ROW_COUNT_MISMATCH";
  }

  if (
    staging.minRowIndex !== 0 ||
    staging.maxRowIndex !== CANDIDATE_ROWS - 1
  ) {
    return "EMC_STAGING_RANGE_MISMATCH";
  }

  if (
    staging.keywordRows !== 43_310 ||
    staging.creativeRows !== 1_244 ||
    staging.mixedRows !== 50
  ) {
    return "EMC_STAGING_GRAIN_MISMATCH";
  }

  if (
    staging.impressions !== 7_075 ||
    staging.clicks !== 1_183 ||
    staging.cost !== 113_850 ||
    staging.conversions !== 67 ||
    staging.revenue !== 12_729_300
  ) {
    return "EMC_STAGING_METRIC_MISMATCH";
  }

  if (staging.overlapRows !== 0) {
    return "EMC_STAGING_OVERLAP_MISMATCH";
  }

  if (
    staging.invalidFingerprintRows !== 0 ||
    staging.scopeMismatchRows !== 0 ||
    staging.canonicalMismatchRows !== 0 ||
    staging.invalidGrainRows !== 0
  ) {
    return "EMC_STAGING_INVALID_ROW_MISMATCH";
  }

  if (
    staging.fingerprint !==
      contract.expectedStagingFingerprint
  ) {
    return "EMC_STAGING_FINGERPRINT_MISMATCH";
  }

  const source =
    state.sourceStaging;

  if (
    source.rows !== SOURCE_ROWS ||
    source.minRowIndex !== 0 ||
    source.maxRowIndex !== SOURCE_ROWS - 1 ||
    source.distinctRowIndexes !== SOURCE_ROWS ||
    source.distinctWindowRowKeys !== SOURCE_ROWS ||
    source.invalidFingerprintRows !== 0 ||
    source.identityDigest !== SOURCE_IDENTITY_DIGEST
  ) {
    return "EMC_SOURCE_STAGING_MISMATCH";
  }

  if (state.activeJobCount !== 0) {
    return "EMC_ACTIVE_JOB_EXISTS";
  }

  const report =
    state.report;

  if (
    report.currentIngestionId !==
      contract.expectedCurrentIngestionId ||
    report.publishedIngestionId !==
      contract.expectedPublishedIngestionId
  ) {
    return "EMC_REPORT_POINTER_MISMATCH";
  }

  if (
    report.reportIngestionsCount !== 11 ||
    report.reportIngestionsDescriptorDigest !==
      REPORT_INGESTIONS_DESCRIPTOR_DIGEST ||
    report.currentDescriptorRows !== 118 ||
    report.currentDescriptorStatus !== "success" ||
    report.publishedDescriptorRows !== SOURCE_ROWS ||
    report.publishedDescriptorStatus !== "success"
  ) {
    return "EMC_REPORT_INGESTIONS_DESCRIPTOR_MISMATCH";
  }

  if (
    report.currentSentinelCount !== 3 ||
    report.currentSentinelDigest !==
      CURRENT_SENTINEL_DIGEST ||
    report.publishedSentinelCount !== 3 ||
    report.publishedSentinelDigest !==
      PUBLISHED_SENTINEL_DIGEST
  ) {
    return "EMC_CANONICAL_SENTINEL_MISMATCH";
  }

  return null;
}

function incrementRpcCount(
  calls: RpcCallCounts,
  functionName: string,
): void {
  switch (functionName) {
    case EXACT_RPC:
      calls.exactClaim += 1;
      return;
    case GENERIC_CLAIM_RPC:
      calls.genericClaim += 1;
      return;
    case PREPARE_MATERIALIZATION_RPC:
      calls.prepareMaterialization += 1;
      return;
    case BATCH_MATERIALIZATION_RPC:
      calls.batchMaterialization += 1;
      return;
    case COMPLETE_MATERIALIZATION_RPC:
      calls.completeMaterialization += 1;
      return;
    case ACTIVATION_RPC:
      calls.activation += 1;
      return;
    case FINALIZATION_RPC:
      calls.finalization += 1;
      return;
    default:
      calls.unknown += 1;
  }
}

function createHarness(
  state:
    SimulatedDatabaseState =
      createDatabaseState(),
): VerificationHarness {
  const calls =
    createCallCounts();
  const rpcCalls:
    VerificationHarness["rpcCalls"] = [];

  const invokeRpc:
    ExactNaverProductionRecoveryMaterializationClaimRpcInvoker =
    async (
      functionName,
      args,
    ) => {
      incrementRpcCount(
        calls,
        functionName,
      );
      rpcCalls.push({
        functionName,
        args:
          clone(args),
      });

      if (functionName !== EXACT_RPC) {
        return {
          data: null,
          error: {
            message:
              "VERIFICATION_FORBIDDEN_RPC_CALLED",
          },
        };
      }

      assert.deepEqual(
        args,
        expectedRpcArgs(),
        "The repository changed the exact scalar RPC argument contract.",
      );

      const rejectionMarker =
        validateSimulatedDatabaseState(
          state,
        );

      if (rejectionMarker) {
        return {
          data: null,
          error: {
            message:
              rejectionMarker,
          },
        };
      }

      const claimed =
        clone(state.candidate);

      claimed.status =
        "processing";
      claimed.started_at =
        CLAIMED_AT;
      claimed.finished_at =
        null;
      claimed.updated_at =
        CLAIMED_AT;
      claimed.error =
        null;
      claimed.snapshot_ingestion_id =
        null;

      state.candidate =
        clone(claimed);

      return {
        data: [
          clone(claimed),
        ],
        error: null,
      };
    };

  return {
    state,
    calls,
    rpcCalls,
    invokeRpc,
  };
}

function assertNoForbiddenCalls(
  calls: RpcCallCounts,
): void {
  assert.equal(
    calls.genericClaim,
    0,
    "The generic pending claim RPC was called.",
  );
  assert.equal(
    calls.prepareMaterialization,
    0,
    "The prepare materialization RPC was called.",
  );
  assert.equal(
    calls.batchMaterialization,
    0,
    "The batch materialization RPC was called.",
  );
  assert.equal(
    calls.completeMaterialization,
    0,
    "The complete materialization RPC was called.",
  );
  assert.equal(
    calls.activation,
    0,
    "The activation RPC was called.",
  );
  assert.equal(
    calls.finalization,
    0,
    "The finalization RPC was called.",
  );
  assert.equal(
    calls.unknown,
    0,
    "An unexpected RPC was called.",
  );
}

function assertOnlyLifecycleTransition(
  before: MediaSyncJobRecord,
  after: MediaSyncJobRecord,
): void {
  const expected =
    clone(before);

  expected.status =
    "processing";
  expected.started_at =
    CLAIMED_AT;
  expected.finished_at =
    null;
  expected.updated_at =
    CLAIMED_AT;
  expected.error =
    null;
  expected.snapshot_ingestion_id =
    null;

  assert.deepEqual(
    after,
    expected,
    "The claim changed a field outside the exact candidate lifecycle transition.",
  );
}

async function assertInputRejected(
  name: string,
  mutate:
    (
      input:
        ClaimExactNaverProductionRecoveryMaterializationCandidateInput,
    ) => void,
): Promise<void> {
  const harness =
    createHarness();
  const before =
    clone(harness.state);
  const input =
    createExactNaverProductionRecoveryMaterializationClaimInput();

  mutate(input);

  await assert.rejects(
    () =>
      claimExactNaverProductionRecoveryMaterializationCandidate(
        input,
        {
          invokeRpc:
            harness.invokeRpc,
          parseJob:
            parseFixtureJob,
        },
      ),
    (
      error: unknown,
    ) => {
      assert.ok(
        error instanceof
          ExactNaverProductionRecoveryMaterializationClaimError,
        `${name}: an unexpected error type was returned.`,
      );
      assert.equal(
        error.code,
        "INVALID_INPUT",
        `${name}: the input mismatch was not rejected before RPC execution.`,
      );
      return true;
    },
  );

  assert.equal(
    harness.calls.exactClaim,
    0,
    `${name}: the exact RPC was called for invalid input.`,
  );
  assertNoForbiddenCalls(
    harness.calls,
  );
  assert.deepEqual(
    harness.state,
    before,
    `${name}: database state changed after input rejection.`,
  );
}

async function assertStateRejected(
  name: string,
  mutate:
    (
      state: SimulatedDatabaseState,
    ) => void,
): Promise<void> {
  const state =
    createDatabaseState();

  mutate(state);

  const harness =
    createHarness(state);
  const before =
    clone(harness.state);

  await assert.rejects(
    () =>
      claimExactNaverProductionRecoveryMaterializationCandidate(
        createExactNaverProductionRecoveryMaterializationClaimInput(),
        {
          invokeRpc:
            harness.invokeRpc,
          parseJob:
            parseFixtureJob,
        },
      ),
    (
      error: unknown,
    ) => {
      assert.ok(
        error instanceof
          ExactNaverProductionRecoveryMaterializationClaimError,
        `${name}: an unexpected error type was returned.`,
      );
      assert.equal(
        error.code,
        "CLAIM_REJECTED",
        `${name}: the exact database contract did not reject the mismatch.`,
      );
      return true;
    },
  );

  assert.equal(
    harness.calls.exactClaim,
    1,
    `${name}: the exact RPC call count is invalid.`,
  );
  assertNoForbiddenCalls(
    harness.calls,
  );
  assert.deepEqual(
    harness.state,
    before,
    `${name}: state changed after a rejected exact claim.`,
  );
}

async function verifySuccessPath(): Promise<void> {
  const harness =
    createHarness();
  const candidateBefore =
    clone(harness.state.candidate);
  const otherJobsBefore =
    clone(harness.state.otherJobs);
  const checkpointBefore =
    clone(
      readCheckpoint(
        harness.state.candidate,
      ),
    );
  const recoveryBefore =
    clone(
      readRecovery(
        harness.state.candidate,
      ),
    );
  const stagingBefore =
    clone(
      harness.state.candidateStaging,
    );
  const sourceBefore =
    clone(
      harness.state.sourceStaging,
    );
  const reportBefore =
    clone(
      harness.state.report,
    );

  const claimed =
    await claimExactNaverProductionRecoveryMaterializationCandidate(
      createExactNaverProductionRecoveryMaterializationClaimInput(),
      {
        invokeRpc:
          harness.invokeRpc,
        parseJob:
          parseFixtureJob,
      },
    );

  assert.equal(
    harness.calls.exactClaim,
    1,
    "The success path did not call the exact RPC exactly once.",
  );
  assertNoForbiddenCalls(
    harness.calls,
  );
  assert.equal(
    harness.rpcCalls.length,
    1,
    "The success path made more than one RPC call.",
  );
  assert.equal(
    harness.rpcCalls[0]?.functionName,
    EXACT_RPC,
  );
  assert.deepEqual(
    harness.rpcCalls[0]?.args,
    expectedRpcArgs(),
  );

  assertOnlyLifecycleTransition(
    candidateBefore,
    claimed,
  );
  assert.deepEqual(
    harness.state.candidate,
    claimed,
    "The simulated exact candidate was not claimed.",
  );
  assert.deepEqual(
    harness.state.otherJobs,
    otherJobsBefore,
    "A non-target media sync job changed during the exact claim.",
  );
  assert.equal(
    claimed.attempt_count,
    12,
    "attempt_count was incremented by the materialization-only claim.",
  );
  assert.deepEqual(
    readCheckpoint(claimed),
    checkpointBefore,
    "processing_checkpoint was reconstructed or changed.",
  );
  assert.deepEqual(
    readRecovery(claimed),
    recoveryBefore,
    "recovery was reconstructed or changed.",
  );
  assert.deepEqual(
    harness.state.candidateStaging,
    stagingBefore,
    "Candidate staging changed during the claim.",
  );
  assert.deepEqual(
    harness.state.sourceStaging,
    sourceBefore,
    "Source staging changed during the claim.",
  );
  assert.deepEqual(
    harness.state.report,
    reportBefore,
    "Report pointers, descriptors, sentinels, or rows changed during the claim.",
  );
}

async function verifyInputRejections(): Promise<void> {
  await assertInputRejected(
    "candidate ID mismatch",
    (
      input,
    ) => {
      input.candidateJobId =
        "00000000-0000-4000-8000-000000000010";
    },
  );

  await assertInputRejected(
    "source job ID mismatch",
    (
      input,
    ) => {
      input.sourceJobId =
        "00000000-0000-4000-8000-000000000011";
    },
  );

  await assertInputRejected(
    "updated_at mismatch",
    (
      input,
    ) => {
      input.expectedCandidateUpdatedAt =
        "2026-07-22 14:23:11.371150+00";
    },
  );

  await assertInputRejected(
    "confirmation token mismatch",
    (
      input,
    ) => {
      input.expectedConfirmationToken =
        "0".repeat(64);
    },
  );

  await assertInputRejected(
    "staging fingerprint mismatch",
    (
      input,
    ) => {
      input.expectedStagingFingerprint =
        "1".repeat(64);
    },
  );

  await assertInputRejected(
    "current pointer mismatch",
    (
      input,
    ) => {
      input.expectedCurrentIngestionId =
        "00000000-0000-4000-8000-000000000012";
    },
  );

  await assertInputRejected(
    "published pointer mismatch",
    (
      input,
    ) => {
      input.expectedPublishedIngestionId =
        "00000000-0000-4000-8000-000000000013";
    },
  );
}

async function verifyStateRejections(): Promise<void> {
  await assertStateRejected(
    "active job exists",
    (
      state,
    ) => {
      state.activeJobCount = 1;
    },
  );

  await assertStateRejected(
    "status is not cancelled",
    (
      state,
    ) => {
      state.candidate.status =
        "failed";
    },
  );

  await assertStateRejected(
    "checkpoint is not completed",
    (
      state,
    ) => {
      const collector =
        readCollector(
          state.candidate,
        );
      assert.ok(collector);
      collector.phase =
        "authoritative";
    },
  );

  await assertStateRejected(
    "authoritative.complete is not true",
    (
      state,
    ) => {
      const authoritative =
        readAuthoritative(
          state.candidate,
        );
      assert.ok(authoritative);
      authoritative.complete =
        false;
    },
  );

  await assertStateRejected(
    "recovery contract is not v2",
    (
      state,
    ) => {
      const recovery =
        readRecovery(
          state.candidate,
        );
      assert.ok(recovery);
      recovery.contract_version =
        1;
    },
  );

  await assertStateRejected(
    "staging row count mismatch",
    (
      state,
    ) => {
      state.candidateStaging.rows -= 1;
    },
  );

  await assertStateRejected(
    "staging row range mismatch",
    (
      state,
    ) => {
      state.candidateStaging.maxRowIndex -= 1;
    },
  );

  await assertStateRejected(
    "staging grain mismatch",
    (
      state,
    ) => {
      state.candidateStaging.keywordRows -= 1;
      state.candidateStaging.creativeRows += 1;
    },
  );

  await assertStateRejected(
    "staging metric mismatch",
    (
      state,
    ) => {
      state.candidateStaging.impressions += 1;
    },
  );

  await assertStateRejected(
    "staging overlap is not zero",
    (
      state,
    ) => {
      state.candidateStaging.overlapRows = 1;
    },
  );

  await assertStateRejected(
    "source digest mismatch",
    (
      state,
    ) => {
      state.sourceStaging.identityDigest =
        "f".repeat(64);
    },
  );

  await assertStateRejected(
    "stored confirmation token mismatch",
    (
      state,
    ) => {
      const recovery =
        readRecovery(
          state.candidate,
        );
      assert.ok(recovery);
      recovery.confirmation_token =
        "0".repeat(64);
    },
  );

  await assertStateRejected(
    "stored staging fingerprint mismatch",
    (
      state,
    ) => {
      const recovery =
        readRecovery(
          state.candidate,
        );
      assert.ok(recovery);
      recovery.repair_repaired_staging_fingerprint =
        "1".repeat(64);
    },
  );

  await assertStateRejected(
    "candidate updated_at changed in database",
    (
      state,
    ) => {
      state.candidate.updated_at =
        "2026-07-22T14:23:12.000Z";
    },
  );

  await assertStateRejected(
    "database current pointer mismatch",
    (
      state,
    ) => {
      state.report.currentIngestionId =
        "00000000-0000-4000-8000-000000000015";
    },
  );

  await assertStateRejected(
    "database published pointer mismatch",
    (
      state,
    ) => {
      state.report.publishedIngestionId =
        "00000000-0000-4000-8000-000000000016";
    },
  );

  await assertStateRejected(
    "invalid fingerprint row exists",
    (
      state,
    ) => {
      state.candidateStaging.invalidFingerprintRows = 1;
    },
  );

  await assertStateRejected(
    "scope mismatch row exists",
    (
      state,
    ) => {
      state.candidateStaging.scopeMismatchRows = 1;
    },
  );

  await assertStateRejected(
    "canonical mismatch row exists",
    (
      state,
    ) => {
      state.candidateStaging.canonicalMismatchRows = 1;
    },
  );

  await assertStateRejected(
    "invalid grain row exists",
    (
      state,
    ) => {
      state.candidateStaging.invalidGrainRows = 1;
    },
  );

  await assertStateRejected(
    "snapshot ingestion already exists",
    (
      state,
    ) => {
      state.candidate.snapshot_ingestion_id =
        "00000000-0000-4000-8000-000000000014";
    },
  );
}

async function verifyStaticImplementationContract(): Promise<void> {
  const [
    sql,
    repository,
    existingV3,
    workerOrchestration,
    materializationRepository,
    jobsRepository,
    typesSource,
  ] = await Promise.all([
    readFile(
      NEW_SQL_PATH,
      "utf8",
    ),
    readFile(
      NEW_REPOSITORY_PATH,
      "utf8",
    ),
    readFile(
      EXISTING_V3_SQL_PATH,
      "utf8",
    ),
    readFile(
      WORKER_ORCHESTRATION_PATH,
      "utf8",
    ),
    readFile(
      MATERIALIZATION_REPOSITORY_PATH,
      "utf8",
    ),
    readFile(
      JOBS_REPOSITORY_PATH,
      "utf8",
    ),
    readFile(
      TYPES_PATH,
      "utf8",
    ),
  ]);

  assert.match(
    sql,
    /create or replace function public\.claim_exact_naver_production_recovery_materialization_candidate\s*\(/i,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function public\.claim_exact_naver_production_recovery_candidate\s*\(/i,
    "The existing v3 function was replaced by the new SQL.",
  );
  assert.match(
    sql,
    /status\s*=\s*'processing'/i,
  );
  assert.match(
    sql,
    /status\s*=\s*'cancelled'/i,
  );
  assert.match(
    sql,
    /brand_search_cross_grain_dedup_v1/,
  );
  assert.match(
    sql,
    /chunked_sha256_v1:block_size=10000/,
  );
  assert.match(
    sql,
    /count\(\s*distinct\s*\(\s*row\.date_window_index,\s*row\.row_key\s*\)\s*\)/i,
  );
  assert.match(
    sql,
    /EMC_CONFIRMATION_TOKEN_MISMATCH/,
  );
  assert.match(
    sql,
    /EMC_STAGING_FINGERPRINT_MISMATCH/,
  );
  assert.match(
    sql,
    /EMC_SOURCE_STAGING_MISMATCH/,
  );
  assert.match(
    sql,
    /EMC_REPORT_INGESTIONS_DESCRIPTOR_MISMATCH/,
  );
  assert.match(
    sql,
    /EMC_CANONICAL_SENTINEL_MISMATCH/,
  );

  const updateMatches =
    sql.match(
      /update\s+public\.media_sync_jobs\s+as\s+job/gi,
    ) ?? [];

  assert.equal(
    updateMatches.length,
    1,
    "The SQL must contain exactly one UPDATE and it must target media_sync_jobs.",
  );
  assert.doesNotMatch(
    sql,
    /\binsert\s+into\b/i,
    "The claim SQL contains an INSERT.",
  );
  assert.doesNotMatch(
    sql,
    /\bdelete\s+from\b/i,
    "The claim SQL contains a DELETE.",
  );
  assert.doesNotMatch(
    sql,
    /\btruncate\b/i,
    "The claim SQL contains a TRUNCATE.",
  );
  assert.doesNotMatch(
    sql,
    /\bupdate\s+public\.(?!media_sync_jobs\b)/i,
    "The claim SQL updates a table other than media_sync_jobs.",
  );

  const updateStart =
    sql.search(
      /update\s+public\.media_sync_jobs\s+as\s+job/i,
    );
  const updateEnd =
    sql.indexOf(
      "returning job.*",
      updateStart,
    );

  assert.ok(
    updateStart >= 0 &&
      updateEnd > updateStart,
    "The exact lifecycle UPDATE could not be isolated.",
  );

  const updateBody =
    sql.slice(
      updateStart,
      updateEnd,
    );
  const setStart =
    updateBody.search(
      /\bset\b/i,
    );
  const whereStart =
    updateBody.search(
      /\bwhere\b/i,
    );

  assert.ok(
    setStart >= 0 &&
      whereStart > setStart,
    "The lifecycle SET clause could not be isolated.",
  );

  const setBody =
    updateBody.slice(
      setStart,
      whereStart,
    );

  assert.doesNotMatch(
    setBody,
    /attempt_count\s*=/i,
    "attempt_count is mutated by the materialization-only claim.",
  );
  assert.doesNotMatch(
    setBody,
    /error_detail\s*=/i,
    "error_detail is reconstructed by the materialization-only claim.",
  );
  assert.doesNotMatch(
    setBody,
    /progress\s*=/i,
    "progress is mutated by the materialization-only claim.",
  );
  assert.doesNotMatch(
    setBody,
    /(?:raw_rows|normalized_rows|inserted_rows|failed_rows)\s*=/i,
    "Row counters are mutated by the materialization-only claim.",
  );

  for (
    const forbiddenRpc of [
      GENERIC_CLAIM_RPC,
      PREPARE_MATERIALIZATION_RPC,
      BATCH_MATERIALIZATION_RPC,
      COMPLETE_MATERIALIZATION_RPC,
      ACTIVATION_RPC,
      FINALIZATION_RPC,
    ]
  ) {
    assert.doesNotMatch(
      sql,
      new RegExp(
        `public\\.${forbiddenRpc}\\s*\\(`,
        "i",
      ),
      `The SQL calls forbidden RPC ${forbiddenRpc}.`,
    );
  }

  assert.match(
    repository,
    new RegExp(EXACT_RPC),
  );
  assert.match(
    repository,
    /parseMediaSyncJobRecord/,
  );
  assert.doesNotMatch(
    repository,
    /import\s*\{\s*getSupabaseAdmin\s*\}\s*from\s*["']\.\.\/supabase\/admin["']/,
    "The DI repository eagerly imports the Supabase admin module.",
  );
  assert.match(
    repository,
    /await\s+import\(\s*["']\.\.\/supabase\/admin["']\s*\)/,
    "The production Supabase dependency is not loaded lazily.",
  );
  assert.match(
    repository,
    /await\s+import\(\s*["']\.\/media-sync-jobs-repository["']\s*\)/,
    "The production media sync job parser is not loaded lazily.",
  );
  assert.doesNotMatch(
    repository,
    new RegExp(GENERIC_CLAIM_RPC),
  );
  assert.doesNotMatch(
    repository,
    /prepare_media_sync_snapshot_materialization|materialize_media_sync_snapshot_batch|complete_media_sync_snapshot_materialization|activate_media_sync_snapshot|finalize_media_sync_job/,
  );

  assert.match(
    existingV3,
    /claim_exact_naver_production_recovery_candidate\s*\(/,
  );
  assert.match(
    existingV3,
    /processing_checkpoint,collector,phase[\s\S]{0,120}(?:<>|is\s+distinct\s+from)\s*'authoritative'/i,
    "The existing v3 authoritative-partial contract is missing.",
  );
  assert.doesNotMatch(
    existingV3,
    new RegExp(EXACT_RPC),
    "The existing v3 SQL was mixed with the new materialization-only function.",
  );

  assert.doesNotMatch(
    workerOrchestration,
    new RegExp(EXACT_RPC),
    "The production worker was wired to the new exact claim during the contract-only step.",
  );
  assert.match(
    workerOrchestration,
    /claimNextNaverMediaSyncJob/,
  );
  assert.match(
    materializationRepository,
    /prepare_media_sync_snapshot_materialization/,
  );
  assert.match(
    materializationRepository,
    /materialize_media_sync_snapshot_batch/,
  );
  assert.match(
    materializationRepository,
    /complete_media_sync_snapshot_materialization/,
  );
  assert.match(
    jobsRepository,
    /export function parseMediaSyncJobRecord/,
  );
  assert.match(
    typesSource,
    /export type MediaSyncJobRecord/,
  );
}

async function main(): Promise<void> {
  const protectedPaths = [
    EXISTING_V3_SQL_PATH,
    WORKER_ORCHESTRATION_PATH,
    MATERIALIZATION_REPOSITORY_PATH,
    JOBS_REPOSITORY_PATH,
    TYPES_PATH,
  ] as const;

  const protectedBefore =
    await snapshotFiles(
      protectedPaths,
    );

  await verifyStaticImplementationContract();
  await verifySuccessPath();
  await verifyInputRejections();
  await verifyStateRejections();

  const protectedAfter =
    await snapshotFiles(
      protectedPaths,
    );

  assert.deepEqual(
    protectedAfter,
    protectedBefore,
    "A protected existing project file changed during the DI contract fixture.",
  );

  console.log(
    "exact materialization-only claim RPC name: verified",
  );
  console.log(
    "existing authoritative-partial v3 untouched: true",
  );
  console.log(
    "exact repaired candidate only: verified",
  );
  console.log(
    "candidate lifecycle-only transition: verified",
  );
  console.log(
    "attempt_count preserved at 12: true",
  );
  console.log(
    "processing_checkpoint and recovery preserved: true",
  );
  console.log(
    "candidate staging unchanged: true",
  );
  console.log(
    "source staging and digest unchanged: true",
  );
  console.log(
    "report descriptors, sentinels, and pointers unchanged: true",
  );
  console.log(
    "generic claim calls: 0",
  );
  console.log(
    "materialization calls: 0",
  );
  console.log(
    "activation calls: 0",
  );
  console.log(
    "finalization calls: 0",
  );
  console.log(
    "all required rejection paths: verified",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(error);
    process.exitCode = 1;
  },
);