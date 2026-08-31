// scripts/verify-google-ads-staging-rpc-sql.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SQL_PATH =
  path.resolve(
    process.cwd(),
    "scripts/sql/create-append-media-sync-staging-batch-google-keyword.sql",
  );

const EXPECTED_BASELINE_MD5 =
  "d90ce68348f56334be61a3c943501ceb";

const EXPECTED_POST_MUTATION_MD5 =
  "1e863518f6a472a6cd940fd8df998e38";

function normalizeSql(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractFunctionDefinition(
  sql: string,
): string {
  const start =
    sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.append_media_sync_staging_batch",
    );

  assert.notEqual(
    start,
    -1,
    "append_media_sync_staging_batch definition is missing.",
  );

  const endMarker =
    "$function$;";

  const end =
    sql.indexOf(
      endMarker,
      start,
    );

  assert.notEqual(
    end,
    -1,
    "append_media_sync_staging_batch executable function terminator is missing.",
  );

  return sql.slice(
    start,
    end + endMarker.length,
  );
}

function assertContains(
  haystack: string,
  needle: string,
): void {
  assert.equal(
    haystack.includes(
      normalizeSql(needle),
    ),
    true,
    `Expected SQL contract fragment is missing: ${needle}`,
  );
}

function assertDoesNotContain(
  haystack: string,
  needle: string,
): void {
  assert.equal(
    haystack.includes(
      normalizeSql(needle),
    ),
    false,
    `Generic staging RPC unexpectedly contains token: ${needle}`,
  );
}

function main(): void {
  const sql =
    fs.readFileSync(
      SQL_PATH,
      "utf8",
    );

  const normalizedSql =
    normalizeSql(sql);

  const functionDefinition =
    extractFunctionDefinition(sql);

  const normalizedFunction =
    normalizeSql(
      functionDefinition,
    );

  // Comments document the read-only materialization-start guard. They are not
  // materialization writes; inspect executable SQL for forbidden mutations.
  const normalizedExecutableFunction = normalizeSql(
    functionDefinition.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " "),
  );

  assertContains(
    normalizedSql,
    `Production baseline pg_get_functiondef MD5: ${EXPECTED_BASELINE_MD5}`,
  );

  assertContains(
    normalizedSql,
    `Expected post-mutation pg_get_functiondef MD5: ${EXPECTED_POST_MUTATION_MD5}`,
  );

  assertContains(
    normalizedFunction,
    "create or replace function public.append_media_sync_staging_batch(p_payload jsonb)",
  );

  assertContains(
    normalizedFunction,
    "language plpgsql security definer",
  );

  assertContains(
    normalizedFunction,
    "set search_path to 'pg_catalog', 'public', 'extensions'",
  );

  assertContains(
    normalizedFunction,
    "set statement_timeout to '2min'",
  );

  assertContains(
    normalizedFunction,
    "(v_report_id is not null and v_job.report_id <> v_report_id)",
  );

  assertContains(
    normalizedFunction,
    "v_report_id := v_job.report_id;",
  );

  assertContains(
    normalizedFunction,
    "v_job.provider not in ( 'naver_searchad', 'google_ads' )",
  );

  assertContains(
    normalizedFunction,
    "v_provider not in ( 'naver_searchad', 'google_ads' )",
  );

  assertContains(
    normalizedFunction,
    "or v_job.provider <> v_provider",
  );

  assertContains(
    normalizedFunction,
    "jsonb_typeof(p_payload -> 'rows') <> 'array'",
  );

  assertContains(
    normalizedFunction,
    "jsonb_typeof(row_json) <> 'object'",
  );

  assertContains(
    normalizedFunction,
    "row_key is null",
  );

  assertContains(
    normalizedFunction,
    "row_date < v_date_from or row_date > v_date_to",
  );

  assertContains(
    normalizedFunction,
    "having count(*) > 1",
  );

  assertContains(
    normalizedFunction,
    "digest( (input.item -> 'row')::text, 'sha256' )",
  );

  assertContains(
    normalizedFunction,
    "insert into public.media_sync_staging_rows",
  );

  assertContains(
    normalizedFunction,
    "message = 'MSS_DUPLICATE_CONFLICT'",
  );

  for (const forbiddenToken of [
    "row_level",
    "data_level",
    "row_level_reason",
    "external_keyword_id",
    "external_creative_id",
    "external_ad_id",
  ]) {
    assertDoesNotContain(
      normalizedFunction,
      forbiddenToken,
    );
  }

  assertDoesNotContain(
    normalizedFunction,
    "if v_provider = 'google_ads' then",
  );

  assertContains(
    normalizedSql,
    "revoke all on function public.append_media_sync_staging_batch(jsonb) from public",
  );

  assertContains(
    normalizedSql,
    "revoke all on function public.append_media_sync_staging_batch(jsonb) from anon",
  );

  assertContains(
    normalizedSql,
    "revoke all on function public.append_media_sync_staging_batch(jsonb) from authenticated",
  );

  assertContains(
    normalizedSql,
    "grant execute on function public.append_media_sync_staging_batch(jsonb) to service_role",
  );

  for (const forbiddenMutationToken of [
    "current_ingestion_id",
    "published_ingestion_id",
    "report_rows",
    "materializ",
    "activation",
    "finalization",
    "reconcile_naver",
  ]) {
    assertDoesNotContain(
      normalizedExecutableFunction,
      forbiddenMutationToken,
    );
  }

  assertContains(normalizedExecutableFunction, "v_job.snapshot_ingestion_id is not null");
  assertContains(normalizedExecutableFunction, "from public.media_sync_report_projections");

  console.log(
    "GOOGLE_ADS_STAGING_RPC_SQL_FIXTURE=PASS",
  );
  console.log(
    `verified Production baseline MD5 encoded: ${EXPECTED_BASELINE_MD5}`,
  );
  console.log(
    `verified expected post-mutation MD5 encoded: ${EXPECTED_POST_MUTATION_MD5}`,
  );
  console.log(
    "verified executable function terminator present: true",
  );
  console.log(
    "verified Production statement_timeout 2min preserved: true",
  );
  console.log(
    "verified optional report_id Production contract preserved: true",
  );
  console.log(
    "verified Naver provider remains allowed: true",
  );
  console.log(
    "verified Google provider remains allowed: true",
  );
  console.log(
    "verified generic RPC grain-neutral invariant restored: true",
  );
  console.log(
    "verified Google keyword-only DB guard absent: true",
  );
  console.log(
    "verified service_role-only execution contract encoded: true",
  );
  console.log(
    "verified pointer/materialization/finalization mutation tokens absent: true",
  );
  console.log(
    "verified database execution performed by fixture: false",
  );
}

main();
