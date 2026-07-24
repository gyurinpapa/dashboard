// scripts/verify-naver-searchads-production-recovery-isolation-checkpoint.ts
//
// Offline contract fixture for exact production recovery isolation.
//
// Safety boundary:
// - reads one local TypeScript source file only;
// - creates no database client;
// - makes no RPC or provider API calls;
// - performs no database writes;
// - verifies that existing recovery metadata is preserved;
// - verifies that a mismatched source_job_id is rejected.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const TARGET_PATH = resolve(
  process.cwd(),
  "scripts/execute-naver-searchads-production-recovery-authoritative-live.ts",
);

const SOURCE_JOB_ID =
  "9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7";

const CONFIRMATION_TOKEN =
  "2e4f159d0cc0909472cb14afd0062ec627f0243c1f6fbbff8ed4e3ef6ead2656";

const CURRENT_INGESTION_ID =
  "48401e55-55e5-4722-ba58-1ad2338eda04";

const PUBLISHED_INGESTION_ID =
  "6d74227e-8d3b-4782-b041-6915d1cc3b89";

const SOURCE_IDENTITY_DIGEST =
  "ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40";

type JsonRecord = Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
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

function createIsolationErrorDetail(
  checkpointValue: unknown,
): JsonRecord {
  if (
    !isPlainObject(
      checkpointValue,
    )
  ) {
    throw new Error(
      "The processing recovery checkpoint is missing during isolation.",
    );
  }

  const recovery =
    checkpointValue["recovery"];

  if (
    !isPlainObject(
      recovery,
    )
  ) {
    throw new Error(
      "The recovery checkpoint metadata is missing during isolation.",
    );
  }

  const recoverySourceJobId =
    readRequiredString(
      recovery["source_job_id"],
      "processing_checkpoint.recovery.source_job_id",
    );

  if (
    recoverySourceJobId !==
      SOURCE_JOB_ID
  ) {
    throw new Error(
      "The recovery checkpoint source job changed before isolation.",
    );
  }

  return {
    processing_checkpoint: {
      ...checkpointValue,

      recovery: {
        ...recovery,

        source_job_id:
          SOURCE_JOB_ID,

        confirmation_token:
          CONFIRMATION_TOKEN,

        expected_current_ingestion_id:
          CURRENT_INGESTION_ID,

        expected_published_ingestion_id:
          PUBLISHED_INGESTION_ID,

        isolated:
          true,
      },
    },
  };
}

function verifySourceContract(
  source: string,
): void {
  const recoveryReadIndex =
    source.indexOf(
      'const recovery =\n    checkpoint["recovery"];',
    );

  const recoveryValidationIndex =
    source.indexOf(
      "The recovery checkpoint metadata is missing during isolation.",
    );

  const sourceValidationIndex =
    source.indexOf(
      "The recovery checkpoint source job changed before isolation.",
    );

  const errorDetailIndex =
    source.indexOf(
      "const errorDetail = {",
    );

  const recoverySpreadIndex =
    source.indexOf(
      "recovery: {\n        ...recovery,",
      errorDetailIndex,
    );

  assert.ok(
    recoveryReadIndex >= 0,
    "The isolate() function must read the existing recovery object.",
  );

  assert.ok(
    recoveryValidationIndex >
      recoveryReadIndex,
    "The existing recovery object must be validated before use.",
  );

  assert.ok(
    sourceValidationIndex >
      recoveryValidationIndex,
    "The fixed recovery source job must be validated before isolation.",
  );

  assert.ok(
    errorDetailIndex >
      sourceValidationIndex,
    "The isolation payload must be created only after validation.",
  );

  assert.ok(
    recoverySpreadIndex >
      errorDetailIndex,
    "The isolation payload must preserve existing recovery fields with ...recovery.",
  );

  assert.doesNotMatch(
    source,
    /recovery:\s*\{\s*source_job_id:\s*SOURCE_JOB_ID/,
    "The recovery object must not be replaced by a reduced object.",
  );
}

function verifyPreservationFixture(): void {
  const originalRecovery: JsonRecord = {
    contract_version:
      1,

    source_job_id:
      SOURCE_JOB_ID,

    source_job_updated_at:
      "2026-07-19T11:59:16.834Z",

    source_staging_rows:
      44_514,

    source_identity_digest:
      SOURCE_IDENTITY_DIGEST,

    keyword_counts_derived_from_staging:
      true,

    request_counts_reconstructed:
      false,

    prepared_at:
      "2026-07-20T00:00:00.000Z",
  };

  const originalCheckpoint: JsonRecord = {
    version:
      1,

    saved_at:
      "2026-07-21T04:07:30.991Z",

    inserted_rows:
      45_514,

    collector: {
      phase:
        "authoritative",

      next_row_index:
        45_514,

      keyword: {
        complete:
          true,
      },

      authoritative: {
        complete:
          false,
      },
    },

    recovery:
      originalRecovery,
  };

  const originalCheckpointSnapshot =
    structuredClone(
      originalCheckpoint,
    );

  const result =
    createIsolationErrorDetail(
      originalCheckpoint,
    );

  const resultCheckpoint =
    result["processing_checkpoint"];

  assert.ok(
    isPlainObject(
      resultCheckpoint,
    ),
    "The resulting processing checkpoint must be an object.",
  );

  const resultRecovery =
    resultCheckpoint["recovery"];

  assert.ok(
    isPlainObject(
      resultRecovery,
    ),
    "The resulting recovery metadata must be an object.",
  );

  for (
    const [
      key,
      value,
    ] of Object.entries(
      originalRecovery,
    )
  ) {
    assert.deepEqual(
      resultRecovery[key],
      value,
      `The existing recovery field ${key} changed during isolation.`,
    );
  }

  assert.equal(
    resultRecovery["source_job_id"],
    SOURCE_JOB_ID,
  );

  assert.equal(
    resultRecovery["confirmation_token"],
    CONFIRMATION_TOKEN,
  );

  assert.equal(
    resultRecovery["expected_current_ingestion_id"],
    CURRENT_INGESTION_ID,
  );

  assert.equal(
    resultRecovery["expected_published_ingestion_id"],
    PUBLISHED_INGESTION_ID,
  );

  assert.equal(
    resultRecovery["isolated"],
    true,
  );

  assert.deepEqual(
    originalCheckpoint,
    originalCheckpointSnapshot,
    "The source checkpoint object must not be mutated.",
  );
}

function verifyWrongSourceRejectedFixture(): void {
  const wrongSourceCheckpoint: JsonRecord = {
    recovery: {
      source_job_id:
        "00000000-0000-4000-8000-000000000000",

      source_staging_rows:
        44_514,

      source_identity_digest:
        SOURCE_IDENTITY_DIGEST,
    },
  };

  assert.throws(
    () =>
      createIsolationErrorDetail(
        wrongSourceCheckpoint,
      ),
    {
      message:
        "The recovery checkpoint source job changed before isolation.",
    },
  );
}

function verifyMissingRecoveryRejectedFixture(): void {
  assert.throws(
    () =>
      createIsolationErrorDetail({
        version:
          1,
      }),
    {
      message:
        "The recovery checkpoint metadata is missing during isolation.",
    },
  );
}

async function main(): Promise<void> {
  const source =
    await readFile(
      TARGET_PATH,
      "utf8",
    );

  verifySourceContract(
    source,
  );

  verifyPreservationFixture();
  verifyWrongSourceRejectedFixture();
  verifyMissingRecoveryRejectedFixture();

  console.log(
    "production recovery isolation checkpoint verification passed:",
    true,
  );

  console.log(
    "existing recovery fields preserved:",
    true,
  );

  console.log(
    "wrong source_job_id rejected:",
    true,
  );

  console.log(
    "missing recovery metadata rejected:",
    true,
  );

  console.log(
    "database client created:",
    false,
  );

  console.log(
    "RPC calls:",
    false,
  );

  console.log(
    "provider API calls:",
    false,
  );

  console.log(
    "database writes:",
    false,
  );

  console.log(
    "materialization called:",
    false,
  );

  console.log(
    "activation called:",
    false,
  );

  console.log(
    "finalization called:",
    false,
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    const diagnostic =
      error instanceof Error
        ? error
        : new Error(
            String(error),
          );

    console.error(
      "production recovery isolation checkpoint verification passed:",
      false,
    );

    console.error(
      "verification error name:",
      diagnostic.name,
    );

    console.error(
      "verification error message:",
      diagnostic.message,
    );

    process.exitCode =
      1;
  },
);