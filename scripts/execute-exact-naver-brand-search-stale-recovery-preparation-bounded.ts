// scripts/execute-exact-naver-brand-search-stale-recovery-preparation-bounded.ts

import { setTimeout as delay } from "node:timers/promises";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";

const PREPARATION_RPC =
  "prepare_exact_naver_brand_search_stale_recovery_candidate";

const SOURCE_JOB_ID =
  "7ef7b4ee-7786-4695-af1c-abb0f75fd553";
const REPORT_ID =
  "ea413950-4068-41e8-9ced-8355020d7e7d";
const WORKSPACE_ID =
  "27b1556f-9d42-496f-bd7e-5a59ebee71d4";
const ADVERTISER_ID =
  "da51e71a-01ce-42fb-a937-7af0b5f47786";
const CONNECTION_ID =
  "aba7d28f-ec85-49db-941a-fa5babe2af61";

const EXPECTED_CURRENT_INGESTION_ID =
  "415e51eb-18b1-43d7-a4e6-6fabb5868792";
const EXPECTED_PUBLISHED_INGESTION_ID =
  "4fa4e562-aa61-4178-9c27-fca63657b5ac";

const EXPECTED_SOURCE_IDENTITY_DIGEST =
  "3b28ccb42d52dcde46b9da44bb8043573b8966b6ecdd3a7a0655d0ac88dfef49";
const EXPECTED_CONFIRMATION_TOKEN =
  "97284ee9d16df6415c7fba27cb8da05dec4f0b98c2c567dae7bd297fbfa4d92d";

const EXPECTED_SOURCE_ROWS = 45_844;
const EXPECTED_EXCLUDED_ROWS = 1_204;
const EXPECTED_RETAINED_ROWS = 44_640;
const EXPECTED_REINDEX_ROWS = 1_330;
const EXPECTED_MIXED_CAMPAIGNS = 5;
const EXPECTED_MATCHED_CAMPAIGNS = 3;
const COPY_BATCH_SIZE = 500;

const MAX_RPC_CALLS =
  1 + Math.ceil(EXPECTED_SOURCE_ROWS / COPY_BATCH_SIZE) + 2;
const INTER_CALL_DELAY_MS = 100;

const ALLOWED_PHASES = new Set([
  "copying",
  "finalizing",
  "completed",
]);

type JsonRecord = Record<string, unknown>;

type RpcErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type RpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: RpcErrorLike | null;
  }>;
};

type PreparationResult = {
  sourceJobId: string;
  candidateJobId: string;
  candidateStatus: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;
  sourceRows: number;
  candidateRows: number;
  excludedRows: number;
  retainedRows: number;
  reindexRequiredRows: number;
  mixedCampaignCount: number;
  matchedCampaignCount: number;
  sourceIdentityDigest: string;
  candidateIdentityDigest: string | null;
  confirmationToken: string;
  currentIngestionId: string;
  publishedIngestionId: string;
  candidatePhase: string;
  candidateNextRowIndex: number;
  sourceUnchanged: boolean;
  reportPointersUnchanged: boolean;
  candidateReadyForReconciliation: boolean;
  candidateClaimed: boolean;
  reconciliationCalled: boolean;
  materializationCalled: boolean;
  activationCalled: boolean;
  finalizationCalled: boolean;
  publishCalled: boolean;
};

class BoundedPreparationError extends Error {
  readonly code: string;
  readonly causeDetail: unknown;

  constructor(
    code: string,
    causeDetail?: unknown,
  ) {
    super(code);
    this.name = "BoundedPreparationError";
    this.code = code;
    this.causeDetail = causeDetail;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requiredString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new BoundedPreparationError(
      `INVALID_${fieldName.toUpperCase()}`,
    );
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BoundedPreparationError(
      `INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return normalized;
}

function nullableString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return requiredString(value, fieldName);
}

function requiredInteger(
  value: unknown,
  fieldName: string,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new BoundedPreparationError(
      `INVALID_${fieldName.toUpperCase()}`,
      value,
    );
  }

  return parsed;
}

function requiredBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new BoundedPreparationError(
      `INVALID_${fieldName.toUpperCase()}`,
      value,
    );
  }

  return value;
}

function parsePreparationResult(
  value: unknown,
): PreparationResult {
  if (!isRecord(value)) {
    throw new BoundedPreparationError(
      "PREPARATION_RESULT_NOT_OBJECT",
      value,
    );
  }

  return {
    sourceJobId:
      requiredString(value.source_job_id, "source_job_id"),
    candidateJobId:
      requiredString(value.candidate_job_id, "candidate_job_id"),
    candidateStatus:
      requiredString(value.candidate_status, "candidate_status"),
    reportId:
      requiredString(value.report_id, "report_id"),
    workspaceId:
      requiredString(value.workspace_id, "workspace_id"),
    advertiserId:
      requiredString(value.advertiser_id, "advertiser_id"),
    connectionId:
      requiredString(value.connection_id, "connection_id"),
    sourceRows:
      requiredInteger(value.source_rows, "source_rows"),
    candidateRows:
      requiredInteger(value.candidate_rows, "candidate_rows"),
    excludedRows:
      requiredInteger(value.excluded_rows, "excluded_rows"),
    retainedRows:
      requiredInteger(value.retained_rows, "retained_rows"),
    reindexRequiredRows:
      requiredInteger(
        value.reindex_required_rows,
        "reindex_required_rows",
      ),
    mixedCampaignCount:
      requiredInteger(
        value.mixed_campaign_count,
        "mixed_campaign_count",
      ),
    matchedCampaignCount:
      requiredInteger(
        value.matched_campaign_count,
        "matched_campaign_count",
      ),
    sourceIdentityDigest:
      requiredString(
        value.source_identity_digest,
        "source_identity_digest",
      ),
    candidateIdentityDigest:
      nullableString(
        value.candidate_identity_digest,
        "candidate_identity_digest",
      ),
    confirmationToken:
      requiredString(
        value.confirmation_token,
        "confirmation_token",
      ),
    currentIngestionId:
      requiredString(
        value.current_ingestion_id,
        "current_ingestion_id",
      ),
    publishedIngestionId:
      requiredString(
        value.published_ingestion_id,
        "published_ingestion_id",
      ),
    candidatePhase:
      requiredString(value.candidate_phase, "candidate_phase"),
    candidateNextRowIndex:
      requiredInteger(
        value.candidate_next_row_index,
        "candidate_next_row_index",
      ),
    sourceUnchanged:
      requiredBoolean(value.source_unchanged, "source_unchanged"),
    reportPointersUnchanged:
      requiredBoolean(
        value.report_pointers_unchanged,
        "report_pointers_unchanged",
      ),
    candidateReadyForReconciliation:
      requiredBoolean(
        value.candidate_ready_for_reconciliation,
        "candidate_ready_for_reconciliation",
      ),
    candidateClaimed:
      requiredBoolean(value.candidate_claimed, "candidate_claimed"),
    reconciliationCalled:
      requiredBoolean(
        value.reconciliation_called,
        "reconciliation_called",
      ),
    materializationCalled:
      requiredBoolean(
        value.materialization_called,
        "materialization_called",
      ),
    activationCalled:
      requiredBoolean(
        value.activation_called,
        "activation_called",
      ),
    finalizationCalled:
      requiredBoolean(
        value.finalization_called,
        "finalization_called",
      ),
    publishCalled:
      requiredBoolean(value.publish_called, "publish_called"),
  };
}

function readExactArguments(): {
  sourceIdentityDigest: string;
  confirmationToken: string;
} {
  const [
    sourceIdentityDigest,
    confirmationToken,
    ...extra
  ] = process.argv
    .slice(2)
    .map((value) => value.trim().toLowerCase());

  if (
    !sourceIdentityDigest ||
    !confirmationToken ||
    extra.length > 0
  ) {
    throw new BoundedPreparationError(
      "Usage: node --env-file=.env.local --import tsx ./scripts/execute-exact-naver-brand-search-stale-recovery-preparation-bounded.ts <source-identity-digest> <preparation-confirmation-token>",
    );
  }

  if (
    sourceIdentityDigest !==
      EXPECTED_SOURCE_IDENTITY_DIGEST ||
    confirmationToken !==
      EXPECTED_CONFIRMATION_TOKEN
  ) {
    throw new BoundedPreparationError(
      "EXACT_PREPARATION_ARGUMENT_MISMATCH",
    );
  }

  return {
    sourceIdentityDigest,
    confirmationToken,
  };
}

function assertFixedContract(
  result: PreparationResult,
): void {
  if (
    result.sourceJobId !== SOURCE_JOB_ID ||
    result.reportId !== REPORT_ID ||
    result.workspaceId !== WORKSPACE_ID ||
    result.advertiserId !== ADVERTISER_ID ||
    result.connectionId !== CONNECTION_ID ||
    result.candidateStatus !== "cancelled" ||
    result.sourceRows !== EXPECTED_SOURCE_ROWS ||
    result.excludedRows !== EXPECTED_EXCLUDED_ROWS ||
    result.retainedRows !== EXPECTED_RETAINED_ROWS ||
    result.reindexRequiredRows !== EXPECTED_REINDEX_ROWS ||
    result.mixedCampaignCount !== EXPECTED_MIXED_CAMPAIGNS ||
    result.matchedCampaignCount !== EXPECTED_MATCHED_CAMPAIGNS ||
    result.sourceIdentityDigest !==
      EXPECTED_SOURCE_IDENTITY_DIGEST ||
    result.confirmationToken !==
      EXPECTED_CONFIRMATION_TOKEN ||
    result.currentIngestionId !==
      EXPECTED_CURRENT_INGESTION_ID ||
    result.publishedIngestionId !==
      EXPECTED_PUBLISHED_INGESTION_ID ||
    !ALLOWED_PHASES.has(result.candidatePhase) ||
    result.candidateNextRowIndex > EXPECTED_SOURCE_ROWS ||
    result.candidateRows !== result.candidateNextRowIndex ||
    result.sourceUnchanged !== true ||
    result.reportPointersUnchanged !== true ||
    result.candidateClaimed !== false ||
    result.reconciliationCalled !== false ||
    result.materializationCalled !== false ||
    result.activationCalled !== false ||
    result.finalizationCalled !== false ||
    result.publishCalled !== false
  ) {
    throw new BoundedPreparationError(
      "PREPARATION_RESULT_CONTRACT_MISMATCH",
      result,
    );
  }

  const complete = result.candidatePhase === "completed";

  if (
    result.candidateReadyForReconciliation !== complete ||
    (
      complete &&
      (
        result.candidateNextRowIndex !== EXPECTED_SOURCE_ROWS ||
        result.candidateIdentityDigest !==
          EXPECTED_SOURCE_IDENTITY_DIGEST
      )
    ) ||
    (
      !complete &&
      result.candidateIdentityDigest !== null
    )
  ) {
    throw new BoundedPreparationError(
      "PREPARATION_COMPLETION_CONTRACT_MISMATCH",
      result,
    );
  }
}

async function callPreparationRpc(input: {
  sourceIdentityDigest: string;
  confirmationToken: string;
}): Promise<PreparationResult> {
  const supabase =
    getSupabaseAdmin() as unknown as RpcClient;

  const { data, error } = await supabase.rpc(
    PREPARATION_RPC,
    {
      p_payload: {
        expected_source_identity_digest:
          input.sourceIdentityDigest,
        confirmation_token:
          input.confirmationToken,
      },
    },
  );

  if (error) {
    throw new BoundedPreparationError(
      "BOUNDED_PREPARATION_RPC_FAILED",
      {
        code: error.code ?? null,
        message: error.message ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
      },
    );
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new BoundedPreparationError(
      "BOUNDED_PREPARATION_RPC_RESULT_COUNT_MISMATCH",
      data,
    );
  }

  const result = parsePreparationResult(data[0]);
  assertFixedContract(result);
  return result;
}

async function main(): Promise<void> {
  const input = readExactArguments();

  console.log(
    "exact stale recovery preparation mode:",
    "bounded/resumable; cancelled candidate only",
  );
  console.log("source job id:", SOURCE_JOB_ID);
  console.log("fixed copy batch size:", COPY_BATCH_SIZE);
  console.log("maximum RPC calls:", MAX_RPC_CALLS);
  console.log(
    "downstream calls:",
    "claim 0 / reconciliation 0 / materialization 0 / activation 0 / finalization 0 / publish 0",
  );

  let candidateJobId: string | null = null;
  let previousNextRowIndex = -1;
  let previousPhase: string | null = null;

  for (
    let callIndex = 1;
    callIndex <= MAX_RPC_CALLS;
    callIndex += 1
  ) {
    const result = await callPreparationRpc(input);

    if (
      candidateJobId !== null &&
      result.candidateJobId !== candidateJobId
    ) {
      throw new BoundedPreparationError(
        "CANDIDATE_JOB_ID_CHANGED_DURING_PREPARATION",
        {
          expected: candidateJobId,
          actual: result.candidateJobId,
        },
      );
    }

    candidateJobId = result.candidateJobId;

    if (
      previousNextRowIndex > result.candidateNextRowIndex
    ) {
      throw new BoundedPreparationError(
        "CANDIDATE_CHECKPOINT_MOVED_BACKWARD",
        {
          previousNextRowIndex,
          currentNextRowIndex:
            result.candidateNextRowIndex,
        },
      );
    }

    if (
      previousPhase === "finalizing" &&
      result.candidatePhase === "copying"
    ) {
      throw new BoundedPreparationError(
        "CANDIDATE_PHASE_MOVED_BACKWARD",
        {
          previousPhase,
          currentPhase: result.candidatePhase,
        },
      );
    }

    previousNextRowIndex =
      result.candidateNextRowIndex;
    previousPhase = result.candidatePhase;

    console.log(
      JSON.stringify({
        call: callIndex,
        candidate_job_id:
          result.candidateJobId,
        phase:
          result.candidatePhase,
        candidate_rows:
          result.candidateRows,
        next_row_index:
          result.candidateNextRowIndex,
        expected_rows:
          EXPECTED_SOURCE_ROWS,
        ready_for_reconciliation:
          result.candidateReadyForReconciliation,
      }),
    );

    if (result.candidatePhase === "completed") {
      console.log(
        JSON.stringify(
          {
            all_checks_passed: true,
            source_job_id:
              result.sourceJobId,
            candidate_job_id:
              result.candidateJobId,
            candidate_status:
              result.candidateStatus,
            candidate_phase:
              result.candidatePhase,
            candidate_rows:
              result.candidateRows,
            candidate_next_row_index:
              result.candidateNextRowIndex,
            source_identity_digest:
              result.sourceIdentityDigest,
            candidate_identity_digest:
              result.candidateIdentityDigest,
            excluded_rows:
              result.excludedRows,
            retained_rows:
              result.retainedRows,
            reindex_required_rows:
              result.reindexRequiredRows,
            mixed_campaign_count:
              result.mixedCampaignCount,
            matched_campaign_count:
              result.matchedCampaignCount,
            current_ingestion_id:
              result.currentIngestionId,
            published_ingestion_id:
              result.publishedIngestionId,
            source_unchanged:
              result.sourceUnchanged,
            report_pointers_unchanged:
              result.reportPointersUnchanged,
            candidate_ready_for_reconciliation:
              result.candidateReadyForReconciliation,
            candidate_claimed:
              result.candidateClaimed,
            reconciliation_called:
              result.reconciliationCalled,
            materialization_called:
              result.materializationCalled,
            activation_called:
              result.activationCalled,
            finalization_called:
              result.finalizationCalled,
            publish_called:
              result.publishCalled,
          },
          null,
          2,
        ),
      );
      return;
    }

    await delay(INTER_CALL_DELAY_MS);
  }

  throw new BoundedPreparationError(
    "BOUNDED_PREPARATION_MAX_CALLS_EXCEEDED",
    {
      candidateJobId,
      previousPhase,
      previousNextRowIndex,
      maxRpcCalls: MAX_RPC_CALLS,
    },
  );
}

main().catch((error: unknown) => {
  const code =
    error instanceof BoundedPreparationError
      ? error.code
      : error instanceof Error
        ? error.message
        : "BOUNDED_PREPARATION_FAILED";

  const detail =
    error instanceof BoundedPreparationError
      ? error.causeDetail
      : null;

  console.error(
    "exact stale recovery bounded preparation failed:",
    code,
  );

  if (detail !== undefined && detail !== null) {
    console.error(
      "failure detail:",
      JSON.stringify(detail, null, 2),
    );
  }

  console.error(
    "Stop here. Do not call reconciliation, materialization, activation, finalization, publish, or the generic queue.",
  );
  console.error(
    "The bounded RPC is checkpointed and idempotent; inspect the candidate read-only before any retry.",
  );

  process.exitCode = 1;
});
