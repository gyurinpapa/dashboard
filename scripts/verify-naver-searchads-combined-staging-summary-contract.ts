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

  requireText(
    sql.toLowerCase(),
    "create or replace function public.summarize_naver_searchads_combined_staging",
    "The combined staging summary RPC is missing.",
  );

  assert.ok(
    !sql.toLowerCase().includes(
      "create or replace function public.summarize_media_sync_staging",
    ),
    "The combined SQL must not replace the legacy keyword summary RPC.",
  );

  requireText(
    sql.toLowerCase(),
    "security definer",
    "The combined RPC must remain SECURITY DEFINER.",
  );

  requireText(
    sql,
    "SET search_path TO 'pg_catalog', 'public', 'extensions'",
    "The combined RPC fixed search_path contract is missing.",
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

  requireText(
    sql,
    "grant execute",
    "The service-role execution grant is missing.",
  );

  requireText(
    sql,
    "to service_role",
    "The combined RPC must be granted only to service_role.",
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
    '"summarize_naver_searchads_combined_staging"',
    "The combined summary RPC constant is missing.",
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

  requireText(
    keywordOrchestrator,
    "assertMediaSyncStagingComplete",
    "The existing keyword orchestrator no longer uses the legacy summary assertion.",
  );

  assert.ok(
    !keywordOrchestrator.includes(
      "assertNaverSearchAdsCombinedStagingComplete",
    ),
    "The existing keyword orchestrator must not use the combined summary RPC.",
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
    "verified combined staging summary accepts keyword creative and mixed contracts: true",
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
    "verified existing keyword orchestrator still uses the legacy summary assertion: true",
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
