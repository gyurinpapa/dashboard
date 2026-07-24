// scripts/execute-naver-searchads-production-recovery-authoritative-live.ts
//
// Exact-ID, bounded authoritative recovery execution.
//
// Safety boundary:
// - exact candidate ID and confirmation token only;
// - generic pending claim disabled;
// - keyword staging disabled by authoritative checkpoint;
// - partial/completed staging returns to cancelled isolation;
// - materialization, activation, and finalization hard-blocked;
// - current/published pointers and lightweight active-snapshot sentinels rechecked;
// - no exact count(*) query against report_rows.

import { createHash } from "node:crypto";

import {
  MediaSyncWorkerOrchestrationError,
  processClaimedNaverMediaSyncJob,
} from "../src/lib/media-sync/media-sync-worker-orchestration-repository";
import {
  saveNaverSearchAdsCombinedProcessingCheckpoint,
} from "../src/lib/media-sync/media-sync-combined-processing-checkpoint-repository";
import {
  parseMediaSyncJobRecord,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  getSupabaseAdmin,
} from "../src/lib/supabase/admin";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const CANDIDATE_JOB_ID =
  "4191baff-393f-4be8-bb38-31548d3ba051";

const SOURCE_JOB_ID =
  "9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7";

const REPORT_ID =
  "ea413950-4068-41e8-9ced-8355020d7e7d";

const CURRENT_INGESTION_ID =
  "48401e55-55e5-4722-ba58-1ad2338eda04";

const PUBLISHED_INGESTION_ID =
  "6d74227e-8d3b-4782-b041-6915d1cc3b89";

const WORKSPACE_ID =
  "27b1556f-9d42-496f-bd7e-5a59ebee71d4";

const ADVERTISER_ID =
  "da51e71a-01ce-42fb-a937-7af0b5f47786";

const CONNECTION_ID =
  "aba7d28f-ec85-49db-941a-fa5babe2af61";

const CLAIM_RPC =
  "claim_exact_naver_production_recovery_candidate";

const EXPECTED_CURRENT_REPORT_ROWS =
  118;

const EXPECTED_PUBLISHED_REPORT_ROWS =
  44_514;

const EXPECTED_TOTAL_REPORT_ROWS =
  359_716;

const EXPECTED_SOURCE_STAGING_ROWS =
  44_514;

const EXPECTED_SOURCE_IDENTITY_DIGEST =
  "ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40";

const RECOVERY_CONTRACT_KEYS = [
  "confirmation_token",
  "contract_version",
  "expected_current_ingestion_id",
  "expected_published_ingestion_id",
  "isolated",
  "keyword_counts_derived_from_staging",
  "prepared_at",
  "request_counts_reconstructed",
  "source_identity_digest",
  "source_job_id",
  "source_job_updated_at",
  "source_staging_rows",
] as const;

type JsonRecord = Record<string, unknown>;

type RecoveryContract = {
  contractVersion: 1;
  sourceJobId: string;
  sourceJobUpdatedAt: string;
  sourceStagingRows: number;
  sourceIdentityDigest: string;
  keywordCountsDerivedFromStaging: true;
  requestCountsReconstructed: false;
  preparedAt: string;
  confirmationToken: string;
  expectedCurrentIngestionId: string;
  expectedPublishedIngestionId: string;
  isolated: boolean;
};

type ProcessingCheckpointEnvelope = {
  raw: JsonRecord;
  phase: "authoritative" | "completed";
  nextRowIndex: number;
  totalRows: number;
  recovery: RecoveryContract | null;
};

type SaveCombinedCheckpointInput =
  Parameters<
    typeof saveNaverSearchAdsCombinedProcessingCheckpoint
  >[0];

type SaveCombinedCheckpointDependencies =
  Parameters<
    typeof saveNaverSearchAdsCombinedProcessingCheckpoint
  >[1];

type IngestionDescriptor = {
  id: string;
  rowCount: number;
  status: string;
  error: string | null;
  updatedAt: string;
};

type ReportState = {
  current: string;
  published: string;

  metadataTotal: number;
  reportIngestionsCount: number;
  ingestionDescriptorsDigest: string;

  currentDescriptor: IngestionDescriptor;
  publishedDescriptor: IngestionDescriptor;

  currentSentinelDigest: string;
  publishedSentinelDigest: string;
};

class StopAfterCombinedStagingBoundaryError extends Error {
  constructor() {
    super(
      "Recovery authoritative staging reached the pre-materialization boundary.",
    );

    this.name =
      "StopAfterCombinedStagingBoundaryError";
  }
}

function isPlainObject(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requiredArgs(): {
  candidateId: string;
  token: string;
} {
  const [
    candidateId,
    token,
    ...extra
  ] =
    process.argv
      .slice(2)
      .map(
        (value) =>
          value.trim(),
      );

  if (
    !candidateId ||
    !token ||
    extra.length > 0
  ) {
    throw new Error(
      "Usage: node --env-file=.env.local --import tsx ./scripts/execute-naver-searchads-production-recovery-authoritative-live.ts <candidate-job-id> <confirmation-token>",
    );
  }

  if (
    candidateId !==
      CANDIDATE_JOB_ID ||
    !/^[0-9a-f]{64}$/.test(
      token,
    )
  ) {
    throw new Error(
      "The exact candidate ID or confirmation token format does not match.",
    );
  }

  return {
    candidateId,
    token,
  };
}

function positiveEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw =
    String(
      process.env[name] ??
      "",
    ).trim();

  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }

  return value;
}

function readNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim()
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(
      normalized,
    ) ||
    normalized < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return normalized;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function stableJson(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(
      value,
    );
  }

  if (
    Array.isArray(value)
  ) {
    return (
      "[" +
      value
        .map(stableJson)
        .join(",") +
      "]"
    );
  }

  if (
    isPlainObject(value)
  ) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${stableJson(value[key])}`,
        )
        .join(",") +
      "}"
    );
  }

  return JSON.stringify(
    String(value),
  );
}


function normalizeConfirmationTimestamp(
  value: string,
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    throw new Error(
      "The candidate updated_at timestamp is missing.",
    );
  }

  const normalized =
    trimmed
      .replace(
        " ",
        "T",
      )
      .replace(
        /Z$/,
        "+00:00",
      )
      .replace(
        /\+00$/,
        "+00:00",
      );

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+00:00$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "The candidate updated_at timestamp is not a normalized UTC value.",
    );
  }

  return normalized;
}

function readStrictBoolean(
  value: unknown,
  expected: boolean,
  fieldName: string,
): boolean {
  if (
    value !==
      expected
  ) {
    throw new Error(
      `${fieldName} must be ${String(expected)}.`,
    );
  }

  return expected;
}

function readRecoveryContract(
  value: unknown,
  expectedIsolated:
    boolean |
    null,
): RecoveryContract {
  if (
    !isPlainObject(
      value,
    )
  ) {
    throw new Error(
      "The exact recovery contract is missing.",
    );
  }

  const actualKeys =
    Object.keys(value)
      .sort();

  const expectedKeys =
    [...RECOVERY_CONTRACT_KEYS]
      .sort();

  if (
    stableJson(actualKeys) !==
      stableJson(expectedKeys)
  ) {
    throw new Error(
      "The exact recovery contract shape changed.",
    );
  }

  if (
    value["contract_version"] !==
      1
  ) {
    throw new Error(
      "The recovery contract version changed.",
    );
  }

  const sourceJobId =
    readRequiredString(
      value["source_job_id"],
      "processing_checkpoint.recovery.source_job_id",
    );

  const sourceJobUpdatedAt =
    normalizeConfirmationTimestamp(
      readRequiredString(
        value["source_job_updated_at"],
        "processing_checkpoint.recovery.source_job_updated_at",
      ),
    );

  const sourceStagingRows =
    readNonNegativeInteger(
      value["source_staging_rows"],
      "processing_checkpoint.recovery.source_staging_rows",
    );

  const sourceIdentityDigest =
    readRequiredString(
      value["source_identity_digest"],
      "processing_checkpoint.recovery.source_identity_digest",
    );

  const preparedAt =
    normalizeConfirmationTimestamp(
      readRequiredString(
        value["prepared_at"],
        "processing_checkpoint.recovery.prepared_at",
      ),
    );

  const confirmationToken =
    readRequiredString(
      value["confirmation_token"],
      "processing_checkpoint.recovery.confirmation_token",
    );

  const expectedCurrentIngestionId =
    readRequiredString(
      value["expected_current_ingestion_id"],
      "processing_checkpoint.recovery.expected_current_ingestion_id",
    );

  const expectedPublishedIngestionId =
    readRequiredString(
      value["expected_published_ingestion_id"],
      "processing_checkpoint.recovery.expected_published_ingestion_id",
    );

  const isolated =
    value["isolated"];

  if (
    typeof isolated !==
      "boolean" ||
    (
      expectedIsolated !==
        null &&
      isolated !==
        expectedIsolated
    )
  ) {
    throw new Error(
      "The recovery isolation flag changed unexpectedly.",
    );
  }

  readStrictBoolean(
    value["keyword_counts_derived_from_staging"],
    true,
    "processing_checkpoint.recovery.keyword_counts_derived_from_staging",
  );

  readStrictBoolean(
    value["request_counts_reconstructed"],
    false,
    "processing_checkpoint.recovery.request_counts_reconstructed",
  );

  if (
    sourceJobId !==
      SOURCE_JOB_ID ||
    sourceStagingRows !==
      EXPECTED_SOURCE_STAGING_ROWS ||
    sourceIdentityDigest !==
      EXPECTED_SOURCE_IDENTITY_DIGEST ||
    !/^[0-9a-f]{64}$/.test(
      confirmationToken,
    ) ||
    expectedCurrentIngestionId !==
      CURRENT_INGESTION_ID ||
    expectedPublishedIngestionId !==
      PUBLISHED_INGESTION_ID
  ) {
    throw new Error(
      "The exact recovery contract no longer matches the approved baseline.",
    );
  }

  return {
    contractVersion:
      1,
    sourceJobId,
    sourceJobUpdatedAt,
    sourceStagingRows,
    sourceIdentityDigest,
    keywordCountsDerivedFromStaging:
      true,
    requestCountsReconstructed:
      false,
    preparedAt,
    confirmationToken,
    expectedCurrentIngestionId,
    expectedPublishedIngestionId,
    isolated,
  };
}

function toRecoveryJson(
  recovery: RecoveryContract,
  input: {
    confirmationToken: string;
    isolated: boolean;
  },
): JsonRecord {
  return {
    contract_version:
      recovery.contractVersion,
    source_job_id:
      recovery.sourceJobId,
    source_job_updated_at:
      recovery.sourceJobUpdatedAt,
    source_staging_rows:
      recovery.sourceStagingRows,
    source_identity_digest:
      recovery.sourceIdentityDigest,
    keyword_counts_derived_from_staging:
      recovery.keywordCountsDerivedFromStaging,
    request_counts_reconstructed:
      recovery.requestCountsReconstructed,
    prepared_at:
      recovery.preparedAt,
    confirmation_token:
      input.confirmationToken,
    expected_current_ingestion_id:
      recovery.expectedCurrentIngestionId,
    expected_published_ingestion_id:
      recovery.expectedPublishedIngestionId,
    isolated:
      input.isolated,
  };
}

function assertSameRecoveryIdentity(
  actual: RecoveryContract,
  approved: RecoveryContract,
): void {
  const actualIdentity = {
    ...toRecoveryJson(
      actual,
      {
        confirmationToken:
          "",
        isolated:
          false,
      },
    ),
    confirmation_token:
      "",
    isolated:
      false,
  };

  const approvedIdentity = {
    ...toRecoveryJson(
      approved,
      {
        confirmationToken:
          "",
        isolated:
          false,
      },
    ),
    confirmation_token:
      "",
    isolated:
      false,
  };

  if (
    stableJson(actualIdentity) !==
      stableJson(approvedIdentity)
  ) {
    throw new Error(
      "The recovery identity changed during authoritative execution.",
    );
  }
}

function readProcessingCheckpointEnvelope(
  job: MediaSyncJobRecord,
): ProcessingCheckpointEnvelope {
  if (
    !isPlainObject(
      job.error_detail,
    )
  ) {
    throw new Error(
      "The processing checkpoint error_detail is missing.",
    );
  }

  const raw =
    job.error_detail[
      "processing_checkpoint"
    ];

  if (
    !isPlainObject(
      raw,
    )
  ) {
    throw new Error(
      "The processing checkpoint is missing.",
    );
  }

  const collector =
    raw["collector"];

  if (
    !isPlainObject(
      collector,
    ) ||
    collector["combined_version"] !==
      1 ||
    !isPlainObject(
      collector["keyword"],
    ) ||
    collector["keyword"]["complete"] !==
      true ||
    !isPlainObject(
      collector["authoritative"],
    )
  ) {
    throw new Error(
      "The combined checkpoint collector contract is invalid.",
    );
  }

  const phaseValue =
    collector["phase"];

  if (
    phaseValue !==
      "authoritative" &&
    phaseValue !==
      "completed"
  ) {
    throw new Error(
      "The exact recovery checkpoint is not at the authoritative boundary.",
    );
  }

  const nextRowIndex =
    readNonNegativeInteger(
      collector["next_row_index"],
      "processing_checkpoint.collector.next_row_index",
    );

  const rawRows =
    readNonNegativeInteger(
      raw["raw_rows"],
      "processing_checkpoint.raw_rows",
    );

  const normalizedRows =
    readNonNegativeInteger(
      raw["normalized_rows"],
      "processing_checkpoint.normalized_rows",
    );

  const insertedRows =
    readNonNegativeInteger(
      raw["inserted_rows"],
      "processing_checkpoint.inserted_rows",
    );

  const failedRows =
    readNonNegativeInteger(
      raw["failed_rows"],
      "processing_checkpoint.failed_rows",
    );

  if (
    nextRowIndex !==
      insertedRows ||
    rawRows !==
      insertedRows ||
    normalizedRows !==
      insertedRows ||
    failedRows !==
      0 ||
    job.raw_rows !==
      insertedRows ||
    job.normalized_rows !==
      insertedRows ||
    job.inserted_rows !==
      insertedRows ||
    job.failed_rows !==
      0 ||
    insertedRows <
      EXPECTED_SOURCE_STAGING_ROWS ||
    (
      phaseValue ===
        "completed" &&
      collector["authoritative"]["complete"] !==
        true
    )
  ) {
    throw new Error(
      "The combined checkpoint row contract is inconsistent.",
    );
  }

  const recoveryValue =
    raw["recovery"];

  return {
    raw,
    phase:
      phaseValue,
    nextRowIndex,
    totalRows:
      insertedRows,
    recovery:
      recoveryValue ===
        undefined ||
      recoveryValue ===
        null
        ? null
        : readRecoveryContract(
            recoveryValue,
            null,
          ),
  };
}

function createConfirmationToken(input: {
  job: MediaSyncJobRecord;
  checkpoint: ProcessingCheckpointEnvelope;
  recovery: RecoveryContract;
}): string {
  const confirmationSource =
    [
      "version=1",
      `candidate_job_id=${input.job.id}`,
      `source_job_id=${input.recovery.sourceJobId}`,
      `expected_candidate_updated_at=${normalizeConfirmationTimestamp(input.job.updated_at)}`,
      `report_id=${input.job.report_id}`,
      `workspace_id=${input.job.workspace_id}`,
      `advertiser_id=${input.job.advertiser_id}`,
      `connection_id=${input.job.connection_id}`,
      `current_ingestion_id=${CURRENT_INGESTION_ID}`,
      `published_ingestion_id=${PUBLISHED_INGESTION_ID}`,
      `checkpoint_phase=${input.checkpoint.phase}`,
      `checkpoint_next_row_index=${input.checkpoint.nextRowIndex}`,
      `checkpoint_total_rows=${input.checkpoint.totalRows}`,
      `candidate_rows=${input.checkpoint.totalRows}`,
      `base_rows=${input.recovery.sourceStagingRows}`,
      `base_identity_digest=${input.recovery.sourceIdentityDigest}`,
      `total_report_rows=${EXPECTED_TOTAL_REPORT_ROWS}`,
      `current_report_rows=${EXPECTED_CURRENT_REPORT_ROWS}`,
      `published_report_rows=${EXPECTED_PUBLISHED_REPORT_ROWS}`,
    ].join("\n");

  return createHash(
    "sha256",
  )
    .update(
      confirmationSource,
    )
    .digest(
      "hex",
    );
}

async function loadJob(
  id: string,
): Promise<MediaSyncJobRecord> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        "media_sync_jobs",
      )
      .select("*")
      .eq(
        "id",
        id,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "The recovery candidate could not be loaded.",
      {
        cause:
          error ??
          undefined,
      },
    );
  }

  return parseMediaSyncJobRecord(
    data,
  );
}

function parseIngestionDescriptor(
  value: unknown,
): IngestionDescriptor {
  if (
    !isPlainObject(value)
  ) {
    throw new Error(
      "The report ingestion descriptor is invalid.",
    );
  }

  return {
    id:
      readRequiredString(
        value["id"],
        "report_ingestions.id",
      ),

    rowCount:
      readNonNegativeInteger(
        value["row_count"],
        "report_ingestions.row_count",
      ),

    status:
      readRequiredString(
        value["status"],
        "report_ingestions.status",
      ),

    error:
      value["error"] === null
        ? null
        : readRequiredString(
            value["error"],
            "report_ingestions.error",
          ),

    updatedAt:
      readRequiredString(
        value["updated_at"],
        "report_ingestions.updated_at",
      ),
  };
}

async function readSentinelDigest(input: {
  ingestionId: string;
  rowCount: number;
  label: string;
}): Promise<string> {
  if (
    input.rowCount <= 0
  ) {
    throw new Error(
      `${input.label} row count must be positive.`,
    );
  }

  const indexes =
    Array.from(
      new Set([
        0,
        Math.floor(
          (
            input.rowCount -
            1
          ) /
            2,
        ),
        input.rowCount -
          1,
      ]),
    ).sort(
      (
        left,
        right,
      ) =>
        left -
        right,
    );

  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        "report_rows",
      )
      .select(
        "id,report_id,ingestion_id,row_index,date,channel,device,source,row",
      )
      .eq(
        "report_id",
        REPORT_ID,
      )
      .eq(
        "ingestion_id",
        input.ingestionId,
      )
      .in(
        "row_index",
        indexes,
      )
      .order(
        "row_index",
        {
          ascending:
            true,
        },
      )
      .order(
        "id",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw new Error(
      `The ${input.label} report_rows sentinels could not be loaded.`,
      {
        cause:
          error,
      },
    );
  }

  if (
    !Array.isArray(data) ||
    data.length !==
      indexes.length
  ) {
    throw new Error(
      `The ${input.label} report_rows sentinel count is invalid.`,
    );
  }

  const actualIndexes =
    data.map(
      (record) =>
        readNonNegativeInteger(
          record.row_index,
          `${input.label}.row_index`,
        ),
    );

  if (
    actualIndexes.some(
      (
        rowIndex,
        index,
      ) =>
        rowIndex !==
        indexes[index],
    )
  ) {
    throw new Error(
      `The ${input.label} report_rows sentinel indexes are invalid.`,
    );
  }

  const hash =
    createHash(
      "sha256",
    );

  for (
    const record
    of data
  ) {
    hash.update(
      `${stableJson(record)}\n`,
    );
  }

  return hash.digest(
    "hex",
  );
}

async function readReportState(): Promise<ReportState> {
  const supabase =
    getSupabaseAdmin();

  const {
    data:
      report,
    error:
      reportError,
  } =
    await supabase
      .from(
        "reports",
      )
      .select(
        "current_ingestion_id,published_ingestion_id",
      )
      .eq(
        "id",
        REPORT_ID,
      )
      .maybeSingle();

  if (
    reportError ||
    !report
  ) {
    throw new Error(
      "The report state could not be loaded.",
      {
        cause:
          reportError ??
          undefined,
      },
    );
  }

  const current =
    readRequiredString(
      report.current_ingestion_id,
      "reports.current_ingestion_id",
    );

  const published =
    readRequiredString(
      report.published_ingestion_id,
      "reports.published_ingestion_id",
    );

  const {
    data:
      ingestionData,
    error:
      ingestionError,
  } =
    await supabase
      .from(
        "report_ingestions",
      )
      .select(
        "id,row_count,status,error,updated_at",
      )
      .eq(
        "report_id",
        REPORT_ID,
      );

  if (ingestionError) {
    throw new Error(
      "The report ingestion metadata could not be loaded.",
      {
        cause:
          ingestionError,
      },
    );
  }

  if (
    !Array.isArray(
      ingestionData,
    )
  ) {
    throw new Error(
      "The report ingestion metadata result is invalid.",
    );
  }

  const descriptors =
    ingestionData.map(
      parseIngestionDescriptor,
    );

  const currentDescriptor =
    descriptors.find(
      (descriptor) =>
        descriptor.id ===
        current,
    );

  const publishedDescriptor =
    descriptors.find(
      (descriptor) =>
        descriptor.id ===
        published,
    );

  if (
    !currentDescriptor ||
    !publishedDescriptor
  ) {
    throw new Error(
      "The active report ingestion metadata was not found.",
    );
  }

  let metadataTotal =
    0;

  for (
    const descriptor
    of descriptors
  ) {
    metadataTotal +=
      descriptor.rowCount;

    if (
      !Number.isSafeInteger(
        metadataTotal,
      )
    ) {
      throw new Error(
        "The report ingestion metadata total overflowed.",
      );
    }
  }

  const ingestionDescriptorsDigest =
    createHash(
      "sha256",
    )
      .update(
        `${stableJson(
          [...descriptors].sort(
            (
              left,
              right,
            ) =>
              left.id.localeCompare(
                right.id,
              ),
          ),
        )}
`,
      )
      .digest(
        "hex",
      );

  const [
    currentSentinelDigest,
    publishedSentinelDigest,
  ] =
    await Promise.all([
      readSentinelDigest({
        ingestionId:
          current,

        rowCount:
          currentDescriptor.rowCount,

        label:
          "current-ingestion",
      }),

      readSentinelDigest({
        ingestionId:
          published,

        rowCount:
          publishedDescriptor.rowCount,

        label:
          "published-ingestion",
      }),
    ]);

  return {
    current,
    published,

    metadataTotal,
    reportIngestionsCount:
      descriptors.length,
    ingestionDescriptorsDigest,

    currentDescriptor,
    publishedDescriptor,

    currentSentinelDigest,
    publishedSentinelDigest,
  };
}

function assertInitial(
  job: MediaSyncJobRecord,
  suppliedToken: string,
): RecoveryContract {
  if (
    job.id !==
      CANDIDATE_JOB_ID ||
    job.report_id !==
      REPORT_ID ||
    job.workspace_id !==
      WORKSPACE_ID ||
    job.advertiser_id !==
      ADVERTISER_ID ||
    job.connection_id !==
      CONNECTION_ID ||
    job.provider !==
      "naver_searchad" ||
    job.status !==
      "cancelled" ||
    job.progress < 0 ||
    job.progress > 99 ||
    job.raw_rows <
      EXPECTED_SOURCE_STAGING_ROWS ||
    job.normalized_rows !==
      job.raw_rows ||
    job.inserted_rows !==
      job.raw_rows ||
    job.failed_rows !==
      0 ||
    job.attempt_count <
      0 ||
    job.started_at !==
      null ||
    job.finished_at !==
      null ||
    job.snapshot_ingestion_id !==
      null ||
    job.error !==
      null
  ) {
    throw new Error(
      "The isolated recovery candidate no longer matches the approved state.",
    );
  }

  const checkpoint =
    readProcessingCheckpointEnvelope(
      job,
    );

  if (!checkpoint.recovery) {
    throw new Error(
      "The isolated recovery contract is missing before exact claim.",
    );
  }

  const recovery =
    readRecoveryContract(
      toRecoveryJson(
        checkpoint.recovery,
        {
          confirmationToken:
            checkpoint.recovery.confirmationToken,
          isolated:
            checkpoint.recovery.isolated,
        },
      ),
      true,
    );

  const recalculatedToken =
    createConfirmationToken({
      job,
      checkpoint,
      recovery,
    });

  if (
    suppliedToken !==
      recovery.confirmationToken ||
    recalculatedToken !==
      recovery.confirmationToken
  ) {
    throw new Error(
      "The supplied or recalculated exact confirmation token does not match the isolated candidate.",
    );
  }

  return recovery;
}

function assertReportBaseline(
  state: ReportState,
): void {
  if (
    state.current !==
      CURRENT_INGESTION_ID ||
    state.published !==
      PUBLISHED_INGESTION_ID ||
    state.reportIngestionsCount <=
      0 ||
    state.metadataTotal <=
      0 ||
    state.currentDescriptor.rowCount !==
      EXPECTED_CURRENT_REPORT_ROWS ||
    state.currentDescriptor.status !==
      "success" ||
    state.currentDescriptor.error !==
      null ||
    state.publishedDescriptor.rowCount !==
      EXPECTED_PUBLISHED_REPORT_ROWS ||
    state.publishedDescriptor.status !==
      "success" ||
    state.publishedDescriptor.error !==
      null
  ) {
    throw new Error(
      "The report pointers or active ingestion baseline no longer match the approved state.",
    );
  }
}

function assertReportUnchanged(
  before: ReportState,
  after: ReportState,
): void {
  if (
    after.current !==
      before.current ||
    after.published !==
      before.published ||
    after.metadataTotal !==
      before.metadataTotal ||
    after.reportIngestionsCount !==
      before.reportIngestionsCount ||
    after.ingestionDescriptorsDigest !==
      before.ingestionDescriptorsDigest ||
    stableJson(
      after.currentDescriptor,
    ) !==
      stableJson(
        before.currentDescriptor,
      ) ||
    stableJson(
      after.publishedDescriptor,
    ) !==
      stableJson(
        before.publishedDescriptor,
      ) ||
    after.currentSentinelDigest !==
      before.currentSentinelDigest ||
    after.publishedSentinelDigest !==
      before.publishedSentinelDigest
  ) {
    throw new Error(
      "The report pointers, ingestion metadata, or active report_rows sentinels changed during authoritative recovery.",
    );
  }
}

async function saveCombinedCheckpointPreservingRecovery(
  input: SaveCombinedCheckpointInput,
  dependencies:
    SaveCombinedCheckpointDependencies = {},
  approvedRecovery: RecoveryContract,
): Promise<MediaSyncJobRecord> {
  if (
    input.job.id !==
      CANDIDATE_JOB_ID ||
    input.job.report_id !==
      REPORT_ID ||
    input.job.workspace_id !==
      WORKSPACE_ID ||
    input.job.advertiser_id !==
      ADVERTISER_ID ||
    input.job.connection_id !==
      CONNECTION_ID ||
    input.job.provider !==
      "naver_searchad" ||
    input.job.status !==
      "processing"
  ) {
    throw new Error(
      "The exact recovery checkpoint save scope changed.",
    );
  }

  const inputEnvelope =
    readProcessingCheckpointEnvelope(
      input.job,
    );

  if (inputEnvelope.recovery) {
    assertSameRecoveryIdentity(
      inputEnvelope.recovery,
      approvedRecovery,
    );

    if (
      inputEnvelope.recovery.confirmationToken !==
        approvedRecovery.confirmationToken
    ) {
      throw new Error(
        "The recovery token changed before combined checkpoint save.",
      );
    }
  }

  const savedJob =
    await saveNaverSearchAdsCombinedProcessingCheckpoint(
      input,
      dependencies,
    );

  const savedEnvelope =
    readProcessingCheckpointEnvelope(
      savedJob,
    );

  if (
    savedEnvelope.phase !==
      input.checkpoint.phase ||
    savedEnvelope.nextRowIndex !==
      input.checkpoint.nextRowIndex ||
    savedEnvelope.totalRows !==
      input.checkpoint.totalRows
  ) {
    throw new Error(
      "The saved exact recovery checkpoint does not match the orchestration result.",
    );
  }

  if (savedEnvelope.recovery) {
    assertSameRecoveryIdentity(
      savedEnvelope.recovery,
      approvedRecovery,
    );
  }

  const preservedErrorDetail = {
    processing_checkpoint: {
      ...savedEnvelope.raw,
      recovery:
        toRecoveryJson(
          approvedRecovery,
          {
            confirmationToken:
              approvedRecovery.confirmationToken,
            isolated:
              false,
          },
        ),
    },
  };

  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        "media_sync_jobs",
      )
      .update({
        error_detail:
          preservedErrorDetail,
      })
      .eq(
        "id",
        savedJob.id,
      )
      .eq(
        "provider",
        "naver_searchad",
      )
      .eq(
        "status",
        "processing",
      )
      .eq(
        "attempt_count",
        savedJob.attempt_count,
      )
      .eq(
        "updated_at",
        savedJob.updated_at,
      )
      .eq(
        "raw_rows",
        savedJob.raw_rows,
      )
      .eq(
        "normalized_rows",
        savedJob.normalized_rows,
      )
      .eq(
        "inserted_rows",
        savedJob.inserted_rows,
      )
      .eq(
        "failed_rows",
        0,
      )
      .select("*")
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "The exact recovery metadata could not be restored after combined checkpoint save.",
      {
        cause:
          error ??
          undefined,
      },
    );
  }

  const preservedJob =
    parseMediaSyncJobRecord(
      data,
    );

  if (
    preservedJob.updated_at !==
      savedJob.updated_at
  ) {
    throw new Error(
      "The checkpoint recovery preservation unexpectedly changed updated_at.",
    );
  }

  const preservedEnvelope =
    readProcessingCheckpointEnvelope(
      preservedJob,
    );

  if (
    !preservedEnvelope.recovery ||
    preservedEnvelope.recovery.isolated !==
      false ||
    preservedEnvelope.recovery.confirmationToken !==
      approvedRecovery.confirmationToken
  ) {
    throw new Error(
      "The exact recovery metadata was not preserved after combined checkpoint save.",
    );
  }

  assertSameRecoveryIdentity(
    preservedEnvelope.recovery,
    approvedRecovery,
  );

  return preservedJob;
}

async function claimExact(
  job: MediaSyncJobRecord,
): Promise<MediaSyncJobRecord> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .rpc(
        CLAIM_RPC,
        {
          p_candidate_job_id:
            job.id,

          p_source_job_id:
            SOURCE_JOB_ID,

          p_expected_candidate_updated_at:
            job.updated_at,

          p_expected_current_ingestion_id:
            CURRENT_INGESTION_ID,

          p_expected_published_ingestion_id:
            PUBLISHED_INGESTION_ID,
        },
      );

  if (
    error ||
    !Array.isArray(
      data,
    ) ||
    data.length !==
      1
  ) {
    throw new Error(
      "The exact recovery candidate could not be claimed.",
      {
        cause:
          error ??
          undefined,
      },
    );
  }

  const claimed =
    parseMediaSyncJobRecord(
      data[0],
    );

  if (
    claimed.status !==
      "processing" ||
    claimed.attempt_count !==
      job.attempt_count +
        1 ||
    !claimed.started_at
  ) {
    throw new Error(
      "The exact claim result is invalid.",
    );
  }

  return claimed;
}

async function isolate(
  jobOrId:
    MediaSyncJobRecord |
    string,
  approvedRecovery: RecoveryContract,
): Promise<MediaSyncJobRecord> {
  const loadedJob =
    typeof jobOrId ===
      "string"
      ? await loadJob(
          jobOrId,
        )
      : jobOrId;

  if (
    loadedJob.id !==
      CANDIDATE_JOB_ID ||
    loadedJob.report_id !==
      REPORT_ID ||
    loadedJob.workspace_id !==
      WORKSPACE_ID ||
    loadedJob.advertiser_id !==
      ADVERTISER_ID ||
    loadedJob.connection_id !==
      CONNECTION_ID ||
    loadedJob.provider !==
      "naver_searchad" ||
    loadedJob.status !==
      "processing"
  ) {
    throw new Error(
      "The exact recovery isolation scope changed.",
    );
  }

  const checkpoint =
    readProcessingCheckpointEnvelope(
      loadedJob,
    );

  if (checkpoint.recovery) {
    assertSameRecoveryIdentity(
      checkpoint.recovery,
      approvedRecovery,
    );

    if (
      checkpoint.recovery.confirmationToken !==
        approvedRecovery.confirmationToken
    ) {
      throw new Error(
        "The recovery confirmation token changed before isolation.",
      );
    }
  }

  const recoveryBeforeTokenRefresh =
    toRecoveryJson(
      approvedRecovery,
      {
        confirmationToken:
          approvedRecovery.confirmationToken,
        isolated:
          true,
      },
    );

  const isolationUpdatedAt =
    new Date()
      .toISOString();

  const {
    data:
      isolatedData,
    error:
      isolatedError,
  } =
    await getSupabaseAdmin()
      .from(
        "media_sync_jobs",
      )
      .update({
        status:
          "cancelled",
        started_at:
          null,
        finished_at:
          null,
        error:
          null,
        error_detail: {
          processing_checkpoint: {
            ...checkpoint.raw,
            recovery:
              recoveryBeforeTokenRefresh,
          },
        },
        updated_at:
          isolationUpdatedAt,
      })
      .eq(
        "id",
        loadedJob.id,
      )
      .eq(
        "provider",
        "naver_searchad",
      )
      .eq(
        "status",
        "processing",
      )
      .eq(
        "attempt_count",
        loadedJob.attempt_count,
      )
      .eq(
        "updated_at",
        loadedJob.updated_at,
      )
      .eq(
        "raw_rows",
        checkpoint.totalRows,
      )
      .eq(
        "normalized_rows",
        checkpoint.totalRows,
      )
      .eq(
        "inserted_rows",
        checkpoint.totalRows,
      )
      .eq(
        "failed_rows",
        0,
      )
      .select("*")
      .maybeSingle();

  if (
    isolatedError ||
    !isolatedData
  ) {
    throw new Error(
      "The recovery candidate could not be returned to cancelled isolation.",
      {
        cause:
          isolatedError ??
          undefined,
      },
    );
  }

  const isolatedJob =
    parseMediaSyncJobRecord(
      isolatedData,
    );

  const isolatedCheckpoint =
    readProcessingCheckpointEnvelope(
      isolatedJob,
    );

  const nextConfirmationToken =
    createConfirmationToken({
      job:
        isolatedJob,
      checkpoint:
        isolatedCheckpoint,
      recovery:
        approvedRecovery,
    });

  const finalErrorDetail = {
    processing_checkpoint: {
      ...isolatedCheckpoint.raw,
      recovery:
        toRecoveryJson(
          approvedRecovery,
          {
            confirmationToken:
              nextConfirmationToken,
            isolated:
              true,
          },
        ),
    },
  };

  const {
    data:
      finalData,
    error:
      finalError,
  } =
    await getSupabaseAdmin()
      .from(
        "media_sync_jobs",
      )
      .update({
        error_detail:
          finalErrorDetail,
      })
      .eq(
        "id",
        isolatedJob.id,
      )
      .eq(
        "provider",
        "naver_searchad",
      )
      .eq(
        "status",
        "cancelled",
      )
      .eq(
        "attempt_count",
        isolatedJob.attempt_count,
      )
      .eq(
        "updated_at",
        isolatedJob.updated_at,
      )
      .is(
        "started_at",
        null,
      )
      .is(
        "finished_at",
        null,
      )
      .is(
        "snapshot_ingestion_id",
        null,
      )
      .select("*")
      .maybeSingle();

  if (
    finalError ||
    !finalData
  ) {
    throw new Error(
      "The refreshed exact confirmation token could not be stored after isolation.",
      {
        cause:
          finalError ??
          undefined,
      },
    );
  }

  const finalJob =
    parseMediaSyncJobRecord(
      finalData,
    );

  if (
    finalJob.updated_at !==
      isolatedJob.updated_at
  ) {
    throw new Error(
      "The confirmation token refresh unexpectedly changed updated_at.",
    );
  }

  const finalCheckpoint =
    readProcessingCheckpointEnvelope(
      finalJob,
    );

  if (
    !finalCheckpoint.recovery ||
    finalCheckpoint.recovery.isolated !==
      true ||
    finalCheckpoint.recovery.confirmationToken !==
      nextConfirmationToken ||
    createConfirmationToken({
      job:
        finalJob,
      checkpoint:
        finalCheckpoint,
      recovery:
        finalCheckpoint.recovery,
    }) !==
      nextConfirmationToken
  ) {
    throw new Error(
      "The refreshed exact confirmation token failed post-isolation verification.",
    );
  }

  assertSameRecoveryIdentity(
    finalCheckpoint.recovery,
    approvedRecovery,
  );

  return finalJob;
}

function expectedStop(
  error: unknown,
): boolean {
  return (
    error instanceof
      MediaSyncWorkerOrchestrationError &&
    error.code ===
      "MATERIALIZATION_FAILED" &&
    error.cause instanceof
      StopAfterCombinedStagingBoundaryError
  );
}

async function main(): Promise<void> {
  const {
    candidateId,
    token,
  } =
    requiredArgs();

  const requestIntervalMs =
    positiveEnv(
      "MEDIA_SYNC_WORKER_REQUEST_INTERVAL_MS",
      1_000,
      250,
      60_000,
    );

  const maxAuthoritativeEntityStatsPerRun =
    positiveEnv(
      "MEDIA_SYNC_WORKER_MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN",
      100,
      1,
      10_000,
    );

  const maxAuthoritativeStatsRequestsPerRun =
    positiveEnv(
      "MEDIA_SYNC_WORKER_MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN",
      50,
      1,
      10_000,
    );

  const maxAuthoritativeDiscoveryPagesPerRun =
    positiveEnv(
      "MEDIA_SYNC_WORKER_MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN",
      20,
      1,
      100_000,
    );

  const jobTimeoutMs =
    positiveEnv(
      "MEDIA_SYNC_WORKER_JOB_TIMEOUT_MS",
      600_000,
      30_000,
      3_600_000,
    );

  console.log(
    "production recovery authoritative mode: exact isolated candidate",
  );

  console.log(
    "generic pending claim: false",
  );

  console.log(
    "keyword staging allowed: false",
  );

  console.log(
    "materialization / activation / finalization allowed: false / false / false",
  );

  const beforeJob =
    await loadJob(
      candidateId,
    );

  const approvedRecovery =
    assertInitial(
      beforeJob,
      token,
    );

  const beforeReport =
    await readReportState();

  assertReportBaseline(
    beforeReport,
  );

  console.log(
    "pre-claim report metadata and sentinel verification passed: true",
  );

  console.log(
    "report_ingestions count / metadata total:",
    `${beforeReport.reportIngestionsCount} / ${beforeReport.metadataTotal}`,
  );

  console.log(
    "current / published metadata rows:",
    `${beforeReport.currentDescriptor.rowCount} / ${beforeReport.publishedDescriptor.rowCount}`,
  );

  const claimed =
    await claimExact(
      beforeJob,
    );

  const abortController =
    new AbortController();

  const timeoutHandle =
    setTimeout(
      () =>
        abortController.abort(),
      jobTimeoutMs,
    );

  let runStatus:
    "partial" |
    "completed_boundary" =
    "partial";

  let partialReason:
    string | null =
    null;

  try {
    const result =
      await processClaimedNaverMediaSyncJob(
        claimed,
        {
          requestIntervalMs,

          maxAuthoritativeEntityStatsPerRun,

          maxAuthoritativeStatsRequestsPerRun,

          maxAuthoritativeDiscoveryPagesPerRun,

          jobTimeoutMs,

          signal:
            abortController.signal,

          orchestrationDependencies: {
            saveCombinedCheckpoint:
              (
                input,
                dependencies,
              ) =>
                saveCombinedCheckpointPreservingRecovery(
                  input,
                  dependencies,
                  approvedRecovery,
                ),

            releaseForResume:
              (
                jobOrId,
              ) =>
                isolate(
                  jobOrId,
                  approvedRecovery,
                ),

            materialize:
              async (): Promise<never> => {
                throw new StopAfterCombinedStagingBoundaryError();
              },

            activate:
              async (): Promise<never> => {
                throw new Error(
                  "Activation must never be called by recovery authoritative execution.",
                );
              },

            finalize:
              async (): Promise<never> => {
                throw new Error(
                  "Finalization must never be called by recovery authoritative execution.",
                );
              },
          },
        },
      );

    if (
      result.status !==
        "partial"
    ) {
      throw new Error(
        "Unexpected completed orchestration result.",
      );
    }

    partialReason =
      result.partialReason;
  } catch (error) {
    if (
      expectedStop(
        error,
      )
    ) {
      runStatus =
        "completed_boundary";

      await isolate(
        candidateId,
        approvedRecovery,
      );
    } else {
      try {
        const current =
          await loadJob(
            candidateId,
          );

        if (
          current.status ===
            "processing"
        ) {
          await isolate(
            candidateId,
            approvedRecovery,
          );
        }
      } catch (
        isolationError
      ) {
        console.error(
          "emergency isolation failed:",
          isolationError,
        );
      }

      throw error;
    }
  } finally {
    clearTimeout(
      timeoutHandle,
    );
  }

  const afterJob =
    await loadJob(
      candidateId,
    );

  const afterReport =
    await readReportState();

  assertReportUnchanged(
    beforeReport,
    afterReport,
  );

  if (
    afterJob.status !==
      "cancelled" ||
    afterJob.started_at !==
      null ||
    afterJob.finished_at !==
      null ||
    afterJob.snapshot_ingestion_id !==
      null ||
    afterJob.error !==
      null ||
    afterJob.attempt_count !==
      beforeJob.attempt_count +
        1
  ) {
    throw new Error(
      "The recovery safety boundary verification failed.",
    );
  }

  const afterCheckpoint =
    readProcessingCheckpointEnvelope(
      afterJob,
    );

  if (!afterCheckpoint.recovery) {
    throw new Error(
      "The isolated recovery contract is missing after authoritative execution.",
    );
  }

  assertSameRecoveryIdentity(
    afterCheckpoint.recovery,
    approvedRecovery,
  );

  const nextConfirmationToken =
    createConfirmationToken({
      job:
        afterJob,
      checkpoint:
        afterCheckpoint,
      recovery:
        afterCheckpoint.recovery,
    });

  if (
    afterCheckpoint.recovery.isolated !==
      true ||
    afterCheckpoint.recovery.confirmationToken !==
      nextConfirmationToken
  ) {
    throw new Error(
      "The next exact confirmation token failed final verification.",
    );
  }

  console.log(
    "authoritative run status:",
    runStatus,
  );

  console.log(
    "partial reason:",
    partialReason ??
      "null",
  );

  console.log(
    "candidate returned to cancelled isolation: true",
  );

  console.log(
    "reports pointers unchanged: true",
  );

  console.log(
    "report ingestion metadata and active report_rows sentinels unchanged: true",
  );

  console.log(
    "report_ingestions descriptor digest unchanged: true",
  );

  console.log(
    "current report_rows metadata count:",
    afterReport.currentDescriptor.rowCount,
  );

  console.log(
    "published report_rows metadata count:",
    afterReport.publishedDescriptor.rowCount,
  );

  console.log(
    "next exact confirmation token:",
    nextConfirmationToken,
  );

  console.log(
    "materialization called: false",
  );

  console.log(
    "activation called: false",
  );

  console.log(
    "finalization called: false",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "production recovery authoritative execution failed:",
      error,
    );

    process.exitCode =
      1;
  },
);