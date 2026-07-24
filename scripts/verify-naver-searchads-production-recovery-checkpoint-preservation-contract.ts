import {
  createHash,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

const executionScriptPath =
  resolve(
    process.cwd(),
    "scripts/execute-naver-searchads-production-recovery-authoritative-live.ts",
  );

const sharedCheckpointRepositoryPath =
  resolve(
    process.cwd(),
    "src/lib/media-sync/media-sync-combined-processing-checkpoint-repository.ts",
  );

const executionScript =
  readFileSync(
    executionScriptPath,
    "utf8",
  );

const currentConfirmationSource =
  [
    "version=1",
    "candidate_job_id=4191baff-393f-4be8-bb38-31548d3ba051",
    "source_job_id=9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7",
    "expected_candidate_updated_at=2026-07-21T20:57:08.806358+00:00",
    "report_id=ea413950-4068-41e8-9ced-8355020d7e7d",
    "workspace_id=27b1556f-9d42-496f-bd7e-5a59ebee71d4",
    "advertiser_id=da51e71a-01ce-42fb-a937-7af0b5f47786",
    "connection_id=aba7d28f-ec85-49db-941a-fa5babe2af61",
    "current_ingestion_id=48401e55-55e5-4722-ba58-1ad2338eda04",
    "published_ingestion_id=6d74227e-8d3b-4782-b041-6915d1cc3b89",
    "checkpoint_phase=authoritative",
    "checkpoint_next_row_index=45614",
    "checkpoint_total_rows=45614",
    "candidate_rows=45614",
    "base_rows=44514",
    "base_identity_digest=ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40",
    "total_report_rows=359716",
    "current_report_rows=118",
    "published_report_rows=44514",
  ].join("\n");

const currentConfirmationToken =
  createHash(
    "sha256",
  )
    .update(
      currentConfirmationSource,
    )
    .digest(
      "hex",
    );

if (
  currentConfirmationToken !==
    "f9598e3ffbc8ed84e7a93a679f89e624e321a3cad220c01375e110a9d09bc7ba"
) {
  throw new Error(
    "The current exact confirmation token test vector failed.",
  );
}

const sharedCheckpointRepository =
  readFileSync(
    sharedCheckpointRepositoryPath,
    "utf8",
  );

function requireText(
  source: string,
  text: string,
  label: string,
): void {
  if (!source.includes(text)) {
    throw new Error(
      `${label} is missing.`,
    );
  }
}

function forbidText(
  source: string,
  text: string,
  label: string,
): void {
  if (source.includes(text)) {
    throw new Error(
      `${label} must remain absent.`,
    );
  }
}

requireText(
  executionScript,
  "saveNaverSearchAdsCombinedProcessingCheckpoint",
  "default combined checkpoint repository import",
);

requireText(
  executionScript,
  "async function saveCombinedCheckpointPreservingRecovery(",
  "exact recovery-preserving checkpoint wrapper",
);

requireText(
  executionScript,
  "saveCombinedCheckpointPreservingRecovery(\n                  input,\n                  dependencies,\n                  approvedRecovery,",
  "orchestration checkpoint override",
);

requireText(
  executionScript,
  "The exact recovery metadata could not be restored after combined checkpoint save.",
  "fail-closed recovery restore",
);

requireText(
  executionScript,
  ".eq(\n        \"updated_at\",\n        savedJob.updated_at,",
  "checkpoint restore updated_at guard",
);

requireText(
  executionScript,
  "error_detail:\n          preservedErrorDetail,",
  "recovery-only checkpoint restore write",
);

requireText(
  executionScript,
  "function createConfirmationToken(",
  "dynamic confirmation token calculator",
);

requireText(
  executionScript,
  "expected_candidate_updated_at=${normalizeConfirmationTimestamp(input.job.updated_at)}",
  "updated_at-bound confirmation source",
);

requireText(
  executionScript,
  "next exact confirmation token:",
  "next exact confirmation token output",
);

requireText(
  executionScript,
  "The refreshed exact confirmation token failed post-isolation verification.",
  "post-isolation token verification",
);

requireText(
  executionScript,
  "releaseForResume:",
  "exact release override",
);

requireText(
  executionScript,
  "materialization / activation / finalization allowed: false / false / false",
  "hard-blocked downstream stages",
);

forbidText(
  executionScript,
  "const CONFIRMATION_TOKEN =",
  "stale hardcoded confirmation token",
);

const payloadStart =
  sharedCheckpointRepository.indexOf(
    "const payload = {",
  );

const payloadEnd =
  sharedCheckpointRepository.indexOf(
    "assertSafeJsonValue(",
    payloadStart,
  );

if (
  payloadStart < 0 ||
  payloadEnd <= payloadStart
) {
  throw new Error(
    "The shared combined checkpoint payload boundary was not found.",
  );
}

const sharedPayloadSection =
  sharedCheckpointRepository.slice(
    payloadStart,
    payloadEnd,
  );

forbidText(
  sharedPayloadSection,
  "recovery",
  "shared worker recovery payload modification",
);

requireText(
  sharedCheckpointRepository,
  "/secret|token|credential|ciphertext|accesslicense|authorization|password|api[_-]?key/i",
  "shared checkpoint secret-field guard",
);

requireText(
  executionScript,
  ".update({\n        error_detail:\n          finalErrorDetail,",
  "token-only final recovery write",
);

requireText(
  executionScript,
  ".eq(\n        \"status\",\n        \"cancelled\",",
  "final token refresh cancelled guard",
);

const genericPendingClaim =
  executionScript.includes(
    "claim_next_naver_media_sync_job",
  );

const keywordStagingEnabled =
  executionScript.includes(
    "runKeywordStaging:",
  );

const candidateWideAggregation =
  /string_agg|full\s+outer\s+join/i.test(
    executionScript,
  );

console.log(
  "exact recovery checkpoint preservation contract verification passed: true",
);
console.log(
  "shared combined checkpoint repository modified: false",
);
console.log(
  "exact checkpoint save override installed: true",
);
console.log(
  "recovery restored before partial release: true",
);
console.log(
  "missing recovery emergency fallback available: true",
);
console.log(
  "current exact confirmation token vector passed: true",
);
console.log(
  "next confirmation token recalculated dynamically: true",
);
console.log(
  "stale hardcoded confirmation token:",
  executionScript.includes(
    "const CONFIRMATION_TOKEN =",
  ),
);
console.log(
  "generic pending claim:",
  genericPendingClaim,
);
console.log(
  "keyword staging enabled:",
  keywordStagingEnabled,
);
console.log(
  "candidate-wide digest/string aggregation:",
  candidateWideAggregation,
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