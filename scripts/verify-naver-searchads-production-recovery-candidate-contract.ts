import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SQL_PATH = resolve(
  process.cwd(),
  "scripts/sql/create-prepare-naver-searchads-production-recovery-candidate.sql",
);

const COMBINED_CHECKPOINT_REPOSITORY_PATH = resolve(
  process.cwd(),
  "src/lib/media-sync/media-sync-combined-processing-checkpoint-repository.ts",
);

const WORKER_REPOSITORY_PATH = resolve(
  process.cwd(),
  "src/lib/media-sync/media-sync-worker-repository.ts",
);

const PREPARE_RPC =
  "prepare_naver_searchads_production_recovery_candidate";

const SOURCE_JOB_ID =
  "9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7";
const DATE_FROM = "2026-05-01";
const DATE_TO = "2026-05-02";
const EXPECTED_ROWS = 44_514;
const EXPECTED_KEYWORD_ENTITIES = 22_257;

type JsonPrimitive = string | number | boolean | null;
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type IdentityRow = {
  rowIndex: number;
  dateWindowIndex: number;
  date: string;
  rowKey: string;
  rowFingerprint: string;
};

function normalizeSource(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function requirePattern(
  value: string,
  pattern: RegExp,
  message: string,
): void {
  assert.match(value, pattern, message);
}

function rejectPattern(
  value: string,
  pattern: RegExp,
  message: string,
): void {
  assert.doesNotMatch(value, pattern, message);
}

function createIdentityDigest(
  rows: readonly IdentityRow[],
): string {
  const hash = createHash("sha256");

  const sorted = [...rows].sort(
    (left, right) =>
      left.rowIndex - right.rowIndex ||
      left.rowKey.localeCompare(right.rowKey),
  );

  for (const row of sorted) {
    hash.update(
      `${JSON.stringify([
        row.rowIndex,
        row.dateWindowIndex,
        row.date,
        row.rowKey,
        row.rowFingerprint,
      ])}\n`,
    );
  }

  return hash.digest("hex");
}

function createKeywordCursor(): JsonObject {
  return {
    version: 1,
    dateWindowIndex: 0,
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    campaignBaseSearchId: null,
    campaignId: null,
    adgroupBaseSearchId: null,
    adgroupId: null,
    keywordBaseSearchId: null,
    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,
    lastCompletedKeywordId: null,
    completedKeywordCount: EXPECTED_KEYWORD_ENTITIES,
    discoveredKeywordCount: EXPECTED_KEYWORD_ENTITIES,
  };
}

function createProcessingCheckpoint(): JsonObject {
  const keywordCursor = createKeywordCursor();

  return {
    version: 1,
    saved_at: "2026-07-20T00:00:00.000Z",
    date_window_index: 0,
    raw_rows: EXPECTED_ROWS,
    normalized_rows: EXPECTED_ROWS,
    inserted_rows: EXPECTED_ROWS,
    failed_rows: 0,
    collector: {
      discovered_keywords: EXPECTED_KEYWORD_ENTITIES,
      completed_keywords: EXPECTED_KEYWORD_ENTITIES,
      stats_requests_attempted: 0,
      stats_requests_succeeded: 0,
      retry_count: 0,
      date_window_index: 0,
      cursor: keywordCursor,
      combined_version: 1,
      phase: "authoritative",
      next_row_index: EXPECTED_ROWS,
      keyword: {
        complete: true,
        cursor: keywordCursor,
        counts: {
          discovered: EXPECTED_KEYWORD_ENTITIES,
          completed: EXPECTED_KEYWORD_ENTITIES,
          statsRequestsAttempted: 0,
          statsRequestsSucceeded: 0,
          retryCount: 0,
        },
      },
      authoritative: {
        complete: false,
        cursor: null,
        counts: {
          discovered: 0,
          completed: 0,
          statsRequestsAttempted: 0,
          statsRequestsSucceeded: 0,
          retryCount: 0,
        },
      },
    },
    recovery: {
      contract_version: 1,
      source_job_id: SOURCE_JOB_ID,
      source_job_updated_at:
        "2026-07-19T11:59:16.834Z",
      source_staging_rows: EXPECTED_ROWS,
      source_identity_digest: "a".repeat(64),
      keyword_counts_derived_from_staging: true,
      request_counts_reconstructed: false,
      prepared_at: "2026-07-20T00:00:00.000Z",
    },
  };
}

function asObject(
  value: JsonValue | undefined,
  fieldName: string,
): JsonObject {
  assert.ok(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value),
    `${fieldName} must be an object.`,
  );

  return value as JsonObject;
}

function verifyCheckpointFixture(): void {
  const processingCheckpoint =
    createProcessingCheckpoint();
  const errorDetail: JsonObject = {
    processing_checkpoint: processingCheckpoint,
  };

  assert.deepEqual(
    Object.keys(errorDetail),
    ["processing_checkpoint"],
    "The candidate error_detail must contain exactly one top-level key.",
  );

  assert.equal(processingCheckpoint.version, 1);
  assert.equal(
    processingCheckpoint.inserted_rows,
    EXPECTED_ROWS,
  );
  assert.equal(processingCheckpoint.failed_rows, 0);

  const collector = asObject(
    processingCheckpoint.collector,
    "processing_checkpoint.collector",
  );
  assert.equal(collector.combined_version, 1);
  assert.equal(collector.phase, "authoritative");
  assert.equal(
    collector.next_row_index,
    EXPECTED_ROWS,
  );

  const keyword = asObject(
    collector.keyword,
    "collector.keyword",
  );
  assert.equal(keyword.complete, true);
  assert.deepEqual(
    keyword.cursor,
    createKeywordCursor(),
  );

  const keywordCounts = asObject(
    keyword.counts,
    "collector.keyword.counts",
  );
  assert.equal(
    keywordCounts.discovered,
    EXPECTED_KEYWORD_ENTITIES,
  );
  assert.equal(
    keywordCounts.completed,
    EXPECTED_KEYWORD_ENTITIES,
  );
  assert.equal(
    keywordCounts.statsRequestsAttempted,
    0,
  );
  assert.equal(
    keywordCounts.statsRequestsSucceeded,
    0,
  );
  assert.equal(keywordCounts.retryCount, 0);

  const authoritative = asObject(
    collector.authoritative,
    "collector.authoritative",
  );
  assert.equal(authoritative.complete, false);
  assert.equal(authoritative.cursor, null);
  assert.deepEqual(
    authoritative.counts,
    {
      discovered: 0,
      completed: 0,
      statsRequestsAttempted: 0,
      statsRequestsSucceeded: 0,
      retryCount: 0,
    },
  );
}

function verifyIdentityDigestFixture(): void {
  const rows: IdentityRow[] = [
    {
      rowIndex: 1,
      dateWindowIndex: 0,
      date: "2026-05-02",
      rowKey:
        '["naver_searchad","account","campaign","group","keyword","2026-05-02"]',
      rowFingerprint: "b".repeat(64),
    },
    {
      rowIndex: 0,
      dateWindowIndex: 0,
      date: "2026-05-01",
      rowKey:
        '["naver_searchad","account","campaign","group","keyword","2026-05-01"]',
      rowFingerprint: "a".repeat(64),
    },
  ];

  assert.equal(
    createIdentityDigest(rows),
    "6b5ccd8317f7c913b5dc3f8147663bb815b701f2b2a028e545113e956e295896",
    "The identity digest serialization contract changed.",
  );
}

function verifyRepositoryContracts(
  combinedRepository: string,
  workerRepository: string,
): void {
  const combined = normalizeSource(combinedRepository);
  const worker = normalizeSource(workerRepository);

  requirePattern(
    combined,
    /phase !== "keyword" && !keyword\.complete/,
    "The combined repository must require completed keyword staging before authoritative resume.",
  );
  requirePattern(
    combined,
    /phase === "completed" && !authoritative\.complete/,
    "The combined repository must reject completed phase before authoritative completion.",
  );
  requirePattern(
    combined,
    /nextrowindex < job\.inserted_rows/,
    "The combined checkpoint must not move behind saved job rows.",
  );
  requirePattern(
    combined,
    /checkpoint\.inserted_rows !== parsed\.totalrows/,
    "Saved checkpoint counts must equal the combined row boundary.",
  );

  requirePattern(
    worker,
    /keys\.length === 1 && keys\[0\] === processing_checkpoint_key/,
    "The worker must accept only processing_checkpoint in error_detail.",
  );
  requirePattern(
    worker,
    /record\.status !== claimed_job_status/,
    "The worker must validate the claimed processing status.",
  );
  requirePattern(
    worker,
    /record\.attempt_count < 1/,
    "The worker must require a claimed attempt count.",
  );
}

function verifySqlContract(sqlSource: string): void {
  const sql = normalizeSource(sqlSource);

  requirePattern(
    sql,
    new RegExp(
      `create or replace function public\\.${PREPARE_RPC}\\s*\\(\\s*p_payload jsonb\\s*\\)`,
    ),
    "The recovery preparation RPC signature is missing.",
  );
  requirePattern(
    sql,
    /language plpgsql security definer/,
    "The RPC must be a SECURITY DEFINER PL/pgSQL function.",
  );
  requirePattern(
    sql,
    /set search_path to 'pg_catalog', 'public', 'extensions'/,
    "The fixed search_path contract is missing.",
  );
  requirePattern(
    sql,
    /set statement_timeout to '10min'/,
    "The timeout must be scoped to this function.",
  );

  requirePattern(
    sql,
    /pg_advisory_xact_lock\s*\(/,
    "Concurrent preparation for the same source must be serialized.",
  );
  requirePattern(
    sql,
    /from public\.media_sync_jobs as job where job\.id = v_source_job_id for update/,
    "The exact source job must be locked.",
  );
  requirePattern(
    sql,
    /from public\.reports as report where report\.id = v_expected_report_id for update/,
    "The report pointer row must be locked.",
  );
  requirePattern(
    sql,
    /status in \('pending', 'processing'\)/,
    "An active job must block candidate preparation.",
  );
  requirePattern(
    sql,
    /message = 'prc_candidate_already_exists'/,
    "A second candidate for the same source must be rejected.",
  );

  requirePattern(
    sql,
    /v_source_job\.status <> 'failed'/,
    "The source job must remain failed.",
  );
  requirePattern(
    sql,
    /v_expected_source_job_rows <> 44500/,
    "The 44,500 source-job counter contract must be exact.",
  );
  requirePattern(
    sql,
    /v_expected_source_staging_rows <> 44514/,
    "The 44,514 staging contract must be exact.",
  );
  requirePattern(
    sql,
    /v_expected_keyword_entities <> 22257/,
    "The 22,257 keyword-entity contract must be exact.",
  );
  requirePattern(
    sql,
    /'57014'/,
    "The source timeout code must be checked.",
  );
  requirePattern(
    sql,
    /canceling statement due to statement timeout/,
    "The source timeout message must be checked.",
  );
  requirePattern(
    sql,
    /source_rows\.row_key::jsonb is distinct from jsonb_build_array/,
    "The canonical keyword row_key must be recalculated.",
  );
  requirePattern(
    sql,
    /extensions\.digest\( source_rows\.row::text, 'sha256' \)/,
    "The stored source fingerprint must be recalculated.",
  );
  requirePattern(
    sql,
    /prc_source_identity_digest_mismatch/,
    "The explicit preflight identity digest must gate creation.",
  );

  const jobInsert = sql.match(
    /insert into public\.media_sync_jobs\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*returning/,
  );
  assert.ok(jobInsert, "The candidate job INSERT is missing.");
  assert.match(
    jobInsert[2],
    /'cancelled'/,
    "The candidate must be isolated as cancelled.",
  );
  assert.match(
    jobInsert[2],
    /jsonb_build_object\( 'processing_checkpoint', v_processing_checkpoint \)/,
    "error_detail must contain only processing_checkpoint.",
  );

  const stagingInsert = sql.match(
    /insert into public\.media_sync_staging_rows\s*\(([\s\S]*?)\)\s*select\s*([\s\S]*?)\s*from public\.media_sync_staging_rows as source_row/,
  );
  assert.ok(stagingInsert, "The staging-copy INSERT is missing.");
  assert.doesNotMatch(
    stagingInsert[1],
    /\brow_fingerprint\b/,
    "row_fingerprint must be regenerated by the database.",
  );
  assert.doesNotMatch(
    stagingInsert[1],
    /\bid\b/,
    "Candidate staging IDs must be regenerated.",
  );
  assert.match(
    stagingInsert[2],
    /v_candidate_id/,
    "Copied rows must use the candidate job ID.",
  );

  requirePattern(
    sql,
    /'phase', 'authoritative'/,
    "The candidate must resume at authoritative.",
  );
  requirePattern(
    sql,
    /'next_row_index', v_expected_source_staging_rows/,
    "The resume boundary must equal 44,514.",
  );
  requirePattern(
    sql,
    /'complete', true, 'cursor', v_keyword_cursor/,
    "Keyword staging must be marked complete with a valid cursor.",
  );
  requirePattern(
    sql,
    /'authoritative', jsonb_build_object\( 'complete', false, 'cursor', null/,
    "Authoritative staging must remain fresh and incomplete.",
  );
  requirePattern(
    sql,
    /candidate_row\.row is distinct from source_row\.row/,
    "Candidate JSON must be exactly compared to source JSON.",
  );
  requirePattern(
    sql,
    /candidate_row\.row_fingerprint is distinct from source_row\.row_fingerprint/,
    "Regenerated fingerprints must equal source fingerprints.",
  );
  requirePattern(
    sql,
    /prc_candidate_identity_digest_mismatch/,
    "Candidate and source identity digests must match.",
  );
  requirePattern(
    sql,
    /prc_source_changed_during_preparation/,
    "The source must be rechecked before success.",
  );
  requirePattern(
    sql,
    /prc_report_pointer_changed_during_preparation/,
    "Report pointers must be rechecked before success.",
  );

  rejectPattern(
    sql,
    /\b(?:insert into|update|delete from|truncate)\s+public\.reports\b/,
    "The RPC must not write reports.",
  );
  rejectPattern(
    sql,
    /\b(?:insert into|update|delete from|truncate)\s+public\.report_rows\b/,
    "The RPC must not write report_rows.",
  );
  rejectPattern(
    sql,
    /\bupdate\s+public\.media_sync_jobs\b/,
    "The RPC must not update the failed source job.",
  );
  rejectPattern(
    sql,
    /\bdelete from\b|\btruncate\b/,
    "The RPC must not delete or truncate data.",
  );
  rejectPattern(
    sql,
    /\bclaim_next_naver_media_sync_job\s*\(/,
    "The global claim RPC must not be called.",
  );
  rejectPattern(
    sql,
    /\b(?:materialize|activate|finalize)[a-z0-9_]*\s*\(/,
    "Materialization, activation, and finalization must not be called.",
  );

  requirePattern(
    sql,
    new RegExp(
      `revoke all on function public\\.${PREPARE_RPC}\\(jsonb\\) from public`,
    ),
    "PUBLIC execution must be revoked.",
  );
  requirePattern(
    sql,
    new RegExp(
      `revoke all on function public\\.${PREPARE_RPC}\\(jsonb\\) from anon`,
    ),
    "anon execution must be revoked.",
  );
  requirePattern(
    sql,
    new RegExp(
      `revoke all on function public\\.${PREPARE_RPC}\\(jsonb\\) from authenticated`,
    ),
    "authenticated execution must be revoked.",
  );
  requirePattern(
    sql,
    new RegExp(
      `grant execute on function public\\.${PREPARE_RPC}\\(jsonb\\) to service_role`,
    ),
    "Only service_role must receive EXECUTE.",
  );
}

async function main(): Promise<void> {
  const [sql, combinedRepository, workerRepository] =
    await Promise.all([
      readFile(SQL_PATH, "utf8"),
      readFile(
        COMBINED_CHECKPOINT_REPOSITORY_PATH,
        "utf8",
      ),
      readFile(WORKER_REPOSITORY_PATH, "utf8"),
    ]);

  verifySqlContract(sql);
  verifyRepositoryContracts(
    combinedRepository,
    workerRepository,
  );
  verifyCheckpointFixture();
  verifyIdentityDigestFixture();

  console.log(
    "production recovery candidate contract verification passed:",
    true,
  );
  console.log("database client created:", false);
  console.log("database connections opened:", false);
  console.log("RPC calls:", false);
  console.log("database writes:", false);
  console.log("candidate created:", false);
  console.log("existing job claimed:", false);
  console.log("materialization called:", false);
  console.log("activation called:", false);
  console.log("finalization called:", false);
  console.log(
    "isolated candidate status contract:",
    "cancelled",
  );
  console.log(
    "resume phase / next row index:",
    `authoritative / ${EXPECTED_ROWS}`,
  );
}

main().catch((error: unknown) => {
  const diagnostic =
    error instanceof Error
      ? error
      : new Error(String(error));

  console.error(
    "production recovery candidate contract verification passed:",
    false,
  );
  console.error(
    "contract verification error name:",
    diagnostic.name,
  );
  console.error(
    "contract verification error message:",
    diagnostic.message,
  );

  process.exitCode = 1;
});
