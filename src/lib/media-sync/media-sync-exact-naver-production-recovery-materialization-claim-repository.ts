import type {
  MediaSyncJobRecord,
} from "./types";

const CLAIM_EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CANDIDATE_RPC =
  "claim_exact_naver_production_recovery_materialization_candidate";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const EXPECTED_PROGRESS = 99;
const EXPECTED_ATTEMPT_COUNT = 12;
const EXPECTED_CANDIDATE_ROWS = 44_604;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHA256_PATTERN =
  /^[0-9a-f]{64}$/;

export const EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CLAIM_CONTRACT =
  Object.freeze({
    candidateJobId:
      "4191baff-393f-4be8-bb38-31548d3ba051",
    sourceJobId:
      "9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7",
    reportId:
      "ea413950-4068-41e8-9ced-8355020d7e7d",
    workspaceId:
      "27b1556f-9d42-496f-bd7e-5a59ebee71d4",
    advertiserId:
      "da51e71a-01ce-42fb-a937-7af0b5f47786",
    connectionId:
      "aba7d28f-ec85-49db-941a-fa5babe2af61",
    expectedCandidateUpdatedAt:
      "2026-07-22 14:23:11.371149+00",
    expectedConfirmationToken:
      "7aa3be46fb606536de8c3bc9540a311426da8b203508cebeef1d2e93fd8668d2",
    expectedStagingFingerprint:
      "1874890814e763dfe834ae0d97698157e707939ef5a213be8582a9bc264c35f1",
    expectedCurrentIngestionId:
      "48401e55-55e5-4722-ba58-1ad2338eda04",
    expectedPublishedIngestionId:
      "6d74227e-8d3b-4782-b041-6915d1cc3b89",
  });

export type ClaimExactNaverProductionRecoveryMaterializationCandidateInput = {
  candidateJobId: string;
  sourceJobId: string;
  expectedCandidateUpdatedAt: string;
  expectedConfirmationToken: string;
  expectedStagingFingerprint: string;
  expectedCurrentIngestionId: string;
  expectedPublishedIngestionId: string;
};

export type ExactNaverProductionRecoveryMaterializationClaimRpcArgs = {
  p_candidate_job_id: string;
  p_source_job_id: string;
  p_expected_candidate_updated_at: string;
  p_expected_confirmation_token: string;
  p_expected_staging_fingerprint: string;
  p_expected_current_ingestion_id: string;
  p_expected_published_ingestion_id: string;
};

export type ExactNaverProductionRecoveryMaterializationClaimRpcResult = {
  data: unknown;
  error: unknown;
};

export type ExactNaverProductionRecoveryMaterializationClaimRpcInvoker = (
  functionName: string,
  args: ExactNaverProductionRecoveryMaterializationClaimRpcArgs,
) => Promise<ExactNaverProductionRecoveryMaterializationClaimRpcResult>;

export type ExactNaverProductionRecoveryMaterializationClaimJobParser = (
  value: unknown,
) =>
  | MediaSyncJobRecord
  | Promise<MediaSyncJobRecord>;

export type ExactNaverProductionRecoveryMaterializationClaimDependencies = {
  invokeRpc?:
    ExactNaverProductionRecoveryMaterializationClaimRpcInvoker;
  parseJob?:
    ExactNaverProductionRecoveryMaterializationClaimJobParser;
};

export type ExactNaverProductionRecoveryMaterializationClaimErrorCode =
  | "INVALID_INPUT"
  | "CLAIM_REJECTED"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class ExactNaverProductionRecoveryMaterializationClaimError
  extends Error {
  readonly code:
    ExactNaverProductionRecoveryMaterializationClaimErrorCode;

  constructor(
    code:
      ExactNaverProductionRecoveryMaterializationClaimErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "ExactNaverProductionRecoveryMaterializationClaimError";
    this.code = code;
  }
}

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeUuid(
  value: unknown,
  fieldName: string,
): string {
  const normalizedValue =
    normalizeRequiredString(
      value,
      fieldName,
      36,
    );

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      `${fieldName} must be a UUID.`,
    );
  }

  return normalizedValue.toLowerCase();
}

function normalizeSha256(
  value: unknown,
  fieldName: string,
): string {
  const normalizedValue =
    normalizeRequiredString(
      value,
      fieldName,
      64,
    ).toLowerCase();

  if (!SHA256_PATTERN.test(normalizedValue)) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      `${fieldName} must be a lowercase SHA-256 digest.`,
    );
  }

  return normalizedValue;
}

function normalizeExactTimestamp(
  value: unknown,
  fieldName: string,
): string {
  const normalizedValue =
    normalizeRequiredString(
      value,
      fieldName,
      64,
    );

  if (
    normalizedValue !==
    EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CLAIM_CONTRACT
      .expectedCandidateUpdatedAt
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      `${fieldName} does not match the exact recovery contract.`,
    );
  }

  return normalizedValue;
}

function assertExactValue(
  actual: string,
  expected: string,
  fieldName: string,
): void {
  if (actual !== expected) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      `${fieldName} does not match the exact recovery contract.`,
    );
  }
}

function normalizeInput(
  input:
    ClaimExactNaverProductionRecoveryMaterializationCandidateInput,
): ExactNaverProductionRecoveryMaterializationClaimRpcArgs {
  if (!isPlainObject(input)) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_INPUT",
      "An exact materialization-only claim input is required.",
    );
  }

  const candidateJobId =
    normalizeUuid(
      input.candidateJobId,
      "candidateJobId",
    );
  const sourceJobId =
    normalizeUuid(
      input.sourceJobId,
      "sourceJobId",
    );
  const expectedCurrentIngestionId =
    normalizeUuid(
      input.expectedCurrentIngestionId,
      "expectedCurrentIngestionId",
    );
  const expectedPublishedIngestionId =
    normalizeUuid(
      input.expectedPublishedIngestionId,
      "expectedPublishedIngestionId",
    );
  const expectedCandidateUpdatedAt =
    normalizeExactTimestamp(
      input.expectedCandidateUpdatedAt,
      "expectedCandidateUpdatedAt",
    );
  const expectedConfirmationToken =
    normalizeSha256(
      input.expectedConfirmationToken,
      "expectedConfirmationToken",
    );
  const expectedStagingFingerprint =
    normalizeSha256(
      input.expectedStagingFingerprint,
      "expectedStagingFingerprint",
    );

  const contract =
    EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CLAIM_CONTRACT;

  assertExactValue(
    candidateJobId,
    contract.candidateJobId,
    "candidateJobId",
  );
  assertExactValue(
    sourceJobId,
    contract.sourceJobId,
    "sourceJobId",
  );
  assertExactValue(
    expectedCurrentIngestionId,
    contract.expectedCurrentIngestionId,
    "expectedCurrentIngestionId",
  );
  assertExactValue(
    expectedPublishedIngestionId,
    contract.expectedPublishedIngestionId,
    "expectedPublishedIngestionId",
  );
  assertExactValue(
    expectedConfirmationToken,
    contract.expectedConfirmationToken,
    "expectedConfirmationToken",
  );
  assertExactValue(
    expectedStagingFingerprint,
    contract.expectedStagingFingerprint,
    "expectedStagingFingerprint",
  );

  return {
    p_candidate_job_id:
      candidateJobId,
    p_source_job_id:
      sourceJobId,
    p_expected_candidate_updated_at:
      expectedCandidateUpdatedAt,
    p_expected_confirmation_token:
      expectedConfirmationToken,
    p_expected_staging_fingerprint:
      expectedStagingFingerprint,
    p_expected_current_ingestion_id:
      expectedCurrentIngestionId,
    p_expected_published_ingestion_id:
      expectedPublishedIngestionId,
  };
}

function readErrorMessage(
  error: unknown,
): string {
  if (
    isPlainObject(error) &&
    typeof error.message ===
      "string"
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "";
}

function mapRpcError(
  error: unknown,
): ExactNaverProductionRecoveryMaterializationClaimError {
  const message =
    readErrorMessage(error);

  if (
    message.includes(
      "EMC_",
    )
  ) {
    return new ExactNaverProductionRecoveryMaterializationClaimError(
      "CLAIM_REJECTED",
      "The exact materialization-only recovery claim was rejected by its database contract.",
      { cause: error },
    );
  }

  return new ExactNaverProductionRecoveryMaterializationClaimError(
    "DATABASE_ERROR",
    "The exact materialization-only recovery claim could not be completed.",
    { cause: error },
  );
}

function readNestedObject(
  record: UnknownRecord,
  key: string,
  message: string,
): UnknownRecord {
  const value =
    record[key];

  if (!isPlainObject(value)) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      message,
    );
  }

  return value;
}

function readStringValue(
  record: UnknownRecord,
  key: string,
): string | null {
  const value =
    record[key];

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return null;
}

function requireRecoveryValue(
  recovery: UnknownRecord,
  key: string,
  expected: string,
): void {
  if (
    readStringValue(
      recovery,
      key,
    ) !== expected
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      `The claimed job recovery contract contains an invalid ${key}.`,
    );
  }
}

function parseTimestamp(
  value: string | null,
  fieldName: string,
): number {
  if (!value) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} is missing.`,
    );
  }

  const timestamp =
    Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} is invalid.`,
    );
  }

  return timestamp;
}

function validateClaimedJob(
  job: MediaSyncJobRecord,
): void {
  const contract =
    EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CLAIM_CONTRACT;

  if (
    job.id !== contract.candidateJobId ||
    job.report_id !== contract.reportId ||
    job.workspace_id !== contract.workspaceId ||
    job.advertiser_id !== contract.advertiserId ||
    job.connection_id !== contract.connectionId ||
    job.provider !== NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The claimed job does not match the exact recovery scope.",
    );
  }

  if (
    job.status !== PROCESSING_STATUS ||
    job.progress !== EXPECTED_PROGRESS ||
    job.attempt_count !== EXPECTED_ATTEMPT_COUNT ||
    job.raw_rows !== EXPECTED_CANDIDATE_ROWS ||
    job.normalized_rows !== EXPECTED_CANDIDATE_ROWS ||
    job.inserted_rows !== EXPECTED_CANDIDATE_ROWS ||
    job.failed_rows !== 0 ||
    job.previous_ingestion_id !==
      contract.expectedCurrentIngestionId ||
    job.snapshot_ingestion_id !== null ||
    job.error !== null ||
    job.finished_at !== null
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The claimed job lifecycle or row counters violate the materialization-only contract.",
    );
  }

  const startedAt =
    parseTimestamp(
      job.started_at,
      "job.started_at",
    );
  const updatedAt =
    parseTimestamp(
      job.updated_at,
      "job.updated_at",
    );
  const priorUpdatedAt =
    parseTimestamp(
      contract.expectedCandidateUpdatedAt,
      "contract.expectedCandidateUpdatedAt",
    );

  if (
    startedAt !== updatedAt ||
    updatedAt <= priorUpdatedAt
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The claimed job timestamps violate the exact lifecycle transition contract.",
    );
  }

  if (!isPlainObject(job.error_detail)) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The claimed job error_detail is missing.",
    );
  }

  const checkpoint =
    readNestedObject(
      job.error_detail,
      "processing_checkpoint",
      "The claimed job processing checkpoint is missing.",
    );
  const collector =
    readNestedObject(
      checkpoint,
      "collector",
      "The claimed job collector checkpoint is missing.",
    );
  const keyword =
    readNestedObject(
      collector,
      "keyword",
      "The claimed job keyword checkpoint is missing.",
    );
  const authoritative =
    readNestedObject(
      collector,
      "authoritative",
      "The claimed job authoritative checkpoint is missing.",
    );
  const recovery =
    readNestedObject(
      checkpoint,
      "recovery",
      "The claimed job recovery contract is missing.",
    );

  if (
    readStringValue(
      checkpoint,
      "version",
    ) !== "1" ||
    readStringValue(
      collector,
      "combined_version",
    ) !== "1" ||
    readStringValue(
      collector,
      "phase",
    ) !== "completed" ||
    readStringValue(
      collector,
      "next_row_index",
    ) !== String(EXPECTED_CANDIDATE_ROWS) ||
    readStringValue(
      keyword,
      "complete",
    ) !== "true" ||
    readStringValue(
      authoritative,
      "complete",
    ) !== "true"
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The claimed job checkpoint is not the completed repaired candidate checkpoint.",
    );
  }

  requireRecoveryValue(
    recovery,
    "contract_version",
    "2",
  );
  requireRecoveryValue(
    recovery,
    "source_job_id",
    contract.sourceJobId,
  );
  requireRecoveryValue(
    recovery,
    "expected_current_ingestion_id",
    contract.expectedCurrentIngestionId,
  );
  requireRecoveryValue(
    recovery,
    "expected_published_ingestion_id",
    contract.expectedPublishedIngestionId,
  );
  requireRecoveryValue(
    recovery,
    "repair_kind",
    "brand_search_cross_grain_dedup_v1",
  );
  requireRecoveryValue(
    recovery,
    "repair_repaired_rows",
    String(EXPECTED_CANDIDATE_ROWS),
  );
  requireRecoveryValue(
    recovery,
    "repair_repaired_staging_fingerprint",
    contract.expectedStagingFingerprint,
  );
  requireRecoveryValue(
    recovery,
    "confirmation_token",
    contract.expectedConfirmationToken,
  );
}

async function parseRpcResult(
  value: unknown,
  parseJob:
    ExactNaverProductionRecoveryMaterializationClaimJobParser,
): Promise<MediaSyncJobRecord> {
  if (
    !Array.isArray(value) ||
    value.length !== 1
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The exact materialization-only claim RPC must return exactly one job.",
    );
  }

  let job:
    MediaSyncJobRecord;

  try {
    job =
      await parseJob(
        value[0],
      );
  } catch (error) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The exact materialization-only claim RPC returned an invalid media sync job.",
      { cause: error },
    );
  }

  validateClaimedJob(job);

  return job;
}

async function defaultInvokeRpc(
  functionName: string,
  args:
    ExactNaverProductionRecoveryMaterializationClaimRpcArgs,
): Promise<ExactNaverProductionRecoveryMaterializationClaimRpcResult> {
  const { getSupabaseAdmin } =
    await import(
      "../supabase/admin"
    );
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase.rpc(
      functionName,
      args,
    );

  return {
    data,
    error,
  };
}


async function defaultParseJob(
  value: unknown,
): Promise<MediaSyncJobRecord> {
  const { parseMediaSyncJobRecord } =
    await import(
      "./media-sync-jobs-repository"
    );

  return parseMediaSyncJobRecord(
    value,
  );
}

function resolveDependencies(
  dependencies:
    ExactNaverProductionRecoveryMaterializationClaimDependencies,
): Required<ExactNaverProductionRecoveryMaterializationClaimDependencies> {
  return {
    invokeRpc:
      dependencies.invokeRpc ??
      defaultInvokeRpc,
    parseJob:
      dependencies.parseJob ??
      defaultParseJob,
  };
}

export function createExactNaverProductionRecoveryMaterializationClaimInput():
  ClaimExactNaverProductionRecoveryMaterializationCandidateInput {
  const contract =
    EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CLAIM_CONTRACT;

  return {
    candidateJobId:
      contract.candidateJobId,
    sourceJobId:
      contract.sourceJobId,
    expectedCandidateUpdatedAt:
      contract.expectedCandidateUpdatedAt,
    expectedConfirmationToken:
      contract.expectedConfirmationToken,
    expectedStagingFingerprint:
      contract.expectedStagingFingerprint,
    expectedCurrentIngestionId:
      contract.expectedCurrentIngestionId,
    expectedPublishedIngestionId:
      contract.expectedPublishedIngestionId,
  };
}

export async function claimExactNaverProductionRecoveryMaterializationCandidate(
  input:
    ClaimExactNaverProductionRecoveryMaterializationCandidateInput,
  dependencies:
    ExactNaverProductionRecoveryMaterializationClaimDependencies = {},
): Promise<MediaSyncJobRecord> {
  const args =
    normalizeInput(input);
  const resolvedDependencies =
    resolveDependencies(
      dependencies,
    );

  let result:
    ExactNaverProductionRecoveryMaterializationClaimRpcResult;

  try {
    result =
      await resolvedDependencies.invokeRpc(
        CLAIM_EXACT_NAVER_PRODUCTION_RECOVERY_MATERIALIZATION_CANDIDATE_RPC,
        args,
      );
  } catch (error) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "DATABASE_ERROR",
      "The exact materialization-only recovery claim could not access the database.",
      { cause: error },
    );
  }

  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new ExactNaverProductionRecoveryMaterializationClaimError(
      "INVALID_DATABASE_RESULT",
      "The exact materialization-only claim RPC returned an invalid result envelope.",
    );
  }

  if (result.error) {
    throw mapRpcError(
      result.error,
    );
  }

  return parseRpcResult(
    result.data,
    resolvedDependencies.parseJob,
  );
}