import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const SQL_PATH =
  "scripts/sql/create-summarize-naver-searchads-combined-staging.sql";

const SUMMARY_REPOSITORY_PATH =
  "src/lib/media-sync/media-sync-staging-summary-repository.ts";

const WORKER_ORCHESTRATION_PATH =
  "src/lib/media-sync/media-sync-worker-orchestration-repository.ts";

const KEYWORD_ORCHESTRATOR_PATH =
  "src/lib/media-sync/naver-searchads-staging-orchestrator.ts";

const LEGACY_COMBINED_RPC =
  "summarize_naver_searchads_combined_staging";

const COMBINED_BASE_RPC =
  "summarize_naver_searchads_combined_staging_base";

const COMBINED_VALIDATION_BATCH_RPC =
  "validate_naver_searchads_combined_staging_batch";

function hash(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
    )
    .digest(
      "hex",
    );
}

function requireText(
  source: string,
  expected: string,
  message: string,
): void {
  assert.ok(
    source.includes(
      expected,
    ),
    message,
  );
}

function requireFunction(
  sql: string,
  functionName: string,
): void {
  requireText(
    sql.toLowerCase(),
    `create or replace function public.${functionName}`,
    `The ${functionName} RPC is missing.`,
  );
}

async function main(): Promise<void> {
  const paths = [
    SQL_PATH,
    SUMMARY_REPOSITORY_PATH,
    WORKER_ORCHESTRATION_PATH,
    KEYWORD_ORCHESTRATOR_PATH,
  ] as const;

  const before =
    await Promise.all(
      paths.map(
        (
          path,
        ) =>
          readFile(
            path,
            "utf8",
          ),
      ),
    );

  const [
    sql,
    summaryRepository,
    workerOrchestration,
    keywordOrchestrator,
  ] = before;

  requireFunction(
    sql,
    LEGACY_COMBINED_RPC,
  );

  requireFunction(
    sql,
    COMBINED_BASE_RPC,
  );

  requireFunction(
    sql,
    COMBINED_VALIDATION_BATCH_RPC,
  );

  assert.ok(
    !sql.toLowerCase().includes(
      "create or replace function public.summarize_media_sync_staging",
    ),
    "The combined SQL must not replace the legacy keyword summary RPC.",
  );

  const securityDefinerCount =
    sql.match(
      /security definer/gi,
    )?.length ?? 0;

  assert.ok(
    securityDefinerCount >= 3,
    "All three combined summary RPCs must remain SECURITY DEFINER.",
  );

  const fixedSearchPathCount =
    sql.match(
      /SET search_path TO 'pg_catalog', 'public', 'extensions'/g,
    )?.length ?? 0;

  assert.ok(
    fixedSearchPathCount >= 3,
    "All three combined summary RPCs must use the fixed search_path.",
  );

  requireText(
    sql,
    "v_validation_batch_size > 2000",
    "The validation batch RPC maximum size guard is missing.",
  );

  requireText(
    sql,
    "after_row_index",
    "The validation batch cursor contract is missing.",
  );

  for (
    const rowLevel
    of [
      "'keyword'",
      "'creative'",
      "'mixed'",
    ]
  ) {
    requireText(
      sql,
      rowLevel,
      `The combined SQL is missing ${rowLevel}.`,
    );
  }

  for (
    const reason
    of [
      "naver_searchad_registered_keyword_daily_stats",
      "naver_searchad_shopping_ad_daily_stats",
      "naver_searchad_brand_search_adgroup_daily_stats",
    ]
  ) {
    requireText(
      sql,
      reason,
      `The combined SQL is missing ${reason}.`,
    );
  }

  requireText(
    sql,
    "external_keyword_id",
    "The combined SQL keyword identity contract is missing.",
  );

  requireText(
    sql,
    "external_creative_id",
    "The combined SQL creative identity contract is missing.",
  );

  requireText(
    sql,
    "extensions.digest",
    "The canonical JSON fingerprint validation is missing.",
  );

  for (
    const functionName
    of [
      LEGACY_COMBINED_RPC,
      COMBINED_BASE_RPC,
      COMBINED_VALIDATION_BATCH_RPC,
    ]
  ) {
    requireText(
      sql,
      `on function public.${functionName}(jsonb)`,
      `The ${functionName} permission contract is missing.`,
    );
  }

  requireText(
    sql,
    "to service_role",
    "The combined RPCs must be granted only to service_role.",
  );

  requireText(
    sql,
    "notify pgrst, 'reload schema'",
    "The PostgREST schema reload is missing.",
  );

  requireText(
    summaryRepository,
    '"summarize_media_sync_staging"',
    "The legacy summary RPC constant was removed.",
  );

  requireText(
    summaryRepository,
    `"${COMBINED_BASE_RPC}"`,
    "The split combined base summary RPC constant is missing.",
  );

  requireText(
    summaryRepository,
    `"${COMBINED_VALIDATION_BATCH_RPC}"`,
    "The split combined validation batch RPC constant is missing.",
  );

  assert.ok(
    !new RegExp(
      `["']${LEGACY_COMBINED_RPC}["']`,
    ).test(
      summaryRepository,
    ),
    "The repository still calls the full combined summary RPC directly.",
  );

  requireText(
    summaryRepository,
    "NAVER_SEARCH_ADS_COMBINED_VALIDATION_BATCH_SIZE",
    "The bounded combined validation batch size is missing.",
  );

  requireText(
    summaryRepository,
    "combinedBaseSummariesEqual",
    "The before/after base summary stability guard is missing.",
  );

  requireText(
    summaryRepository,
    '"STAGING_CHANGED"',
    "The split summary stability error contract is missing.",
  );

  requireText(
    summaryRepository,
    "export async function getMediaSyncStagingSummary",
    "The legacy summary function was removed.",
  );

  requireText(
    summaryRepository,
    "export async function assertMediaSyncStagingComplete",
    "The legacy summary assertion was removed.",
  );

  requireText(
    summaryRepository,
    "export async function getNaverSearchAdsCombinedStagingSummary",
    "The combined summary function is missing.",
  );

  requireText(
    summaryRepository,
    "export async function assertNaverSearchAdsCombinedStagingComplete",
    "The combined summary assertion is missing.",
  );

  requireText(
    workerOrchestration,
    "assertNaverSearchAdsCombinedStagingComplete",
    "The combined worker is not wired to the combined summary assertion.",
  );

  assert.ok(
    !workerOrchestration.includes(
      "assertMediaSyncStagingComplete",
    ),
    "The combined worker still defaults to the legacy keyword summary assertion.",
  );

  assert.ok(
    !keywordOrchestrator.includes(
      "assertMediaSyncStagingComplete",
    ),
    "The keyword orchestrator must not run the legacy staging summary assertion before the combined phases are complete.",
  );

  assert.ok(
    !keywordOrchestrator.includes(
      "assertNaverSearchAdsCombinedStagingComplete",
    ),
    "The keyword orchestrator must not run the combined staging summary assertion.",
  );

  const after =
    await Promise.all(
      paths.map(
        (
          path,
        ) =>
          readFile(
            path,
            "utf8",
          ),
      ),
    );

  assert.deepEqual(
    after.map(
      hash,
    ),
    before.map(
      hash,
    ),
    "The combined summary contract fixture modified a source file.",
  );

  console.log(
    "verified legacy keyword staging summary RPC remains separate: true",
  );

  console.log(
    "verified backward-compatible full combined summary RPC remains defined: true",
  );

  console.log(
    "verified combined base summary RPC is separate from canonical validation: true",
  );

  console.log(
    "verified combined canonical validation uses independent bounded RPC calls: true",
  );

  console.log(
    "verified combined staging accepts keyword creative and mixed contracts: true",
  );

  console.log(
    "verified SHOPPING creative identity and reason checks are present: true",
  );

  console.log(
    "verified BRAND_SEARCH mixed identity and reason checks are present: true",
  );

  console.log(
    "verified combined canonical fingerprint and scope checks remain present: true",
  );

  console.log(
    "verified combined worker uses the combined summary assertion: true",
  );

  console.log(
    "verified keyword orchestrator performs no early staging summary assertion: true",
  );

  console.log(
    "fixture uses real Naver API: false",
  );

  console.log(
    "fixture uses database: false",
  );

  console.log(
    "fixture writes staging: false",
  );

  console.log(
    "fixture writes report_rows: false",
  );

  console.log(
    "fixture changes report pointers: false",
  );

  console.log(
    "verification passed: true",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      "Naver combined staging summary contract fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);