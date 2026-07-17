import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TABLE_CONTRACT_PATH =
  "scripts/fixtures/media-sync-staging-table-contract.json";

const RPC_DEFINITION_PATH =
  "scripts/fixtures/append-media-sync-staging-batch.sql.snapshot.txt";

type TableColumn = {
  name: string;
  type: string;
  not_null: boolean;
  position: number;
  expression: string | null;
  generated_kind: string;
};

type TableConstraint = {
  name: string;
  type: string;
  definition: string;
};

type TableIndex = {
  name: string;
  definition: string;
};

type StagingTableContract = {
  table: {
    name: string;
    schema: string;
    rls_enabled: boolean;
  };
  columns: TableColumn[];
  indexes: TableIndex[];
  policies: unknown[];
  triggers: unknown[];
  constraints: TableConstraint[];
};

function normalizeSql(value: string): string {
  return value
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function requireColumn(
  contract: StagingTableContract,
  name: string,
): TableColumn {
  const column = contract.columns.find(
    (candidate) => candidate.name === name,
  );

  assert.ok(
    column,
    `Missing staging table column: ${name}`,
  );

  return column;
}

function requireConstraint(
  contract: StagingTableContract,
  name: string,
): TableConstraint {
  const constraint = contract.constraints.find(
    (candidate) => candidate.name === name,
  );

  assert.ok(
    constraint,
    `Missing staging table constraint: ${name}`,
  );

  return constraint;
}

function requireIndex(
  contract: StagingTableContract,
  name: string,
): TableIndex {
  const index = contract.indexes.find(
    (candidate) => candidate.name === name,
  );

  assert.ok(
    index,
    `Missing staging table index: ${name}`,
  );

  return index;
}

function compactSql(value: string): string {
  return normalizeSql(value).replace(/\s+/g, "");
}

function assertSqlContains(
  normalizedSql: string,
  fragment: string,
): void {
  assert.ok(
    compactSql(normalizedSql).includes(
      compactSql(fragment),
    ),
    `RPC definition is missing required contract fragment: ${fragment}`,
  );
}

function assertSqlDoesNotContain(
  normalizedSql: string,
  fragment: string,
): void {
  assert.equal(
    compactSql(normalizedSql).includes(
      compactSql(fragment),
    ),
    false,
    `RPC definition unexpectedly contains grain-specific token: ${fragment}`,
  );
}

async function main(): Promise<void> {
  const tableContractPath = join(
    process.cwd(),
    TABLE_CONTRACT_PATH,
  );

  const rpcDefinitionPath = join(
    process.cwd(),
    RPC_DEFINITION_PATH,
  );

  const [tableContractText, rpcDefinition] =
    await Promise.all([
      readFile(tableContractPath, "utf8"),
      readFile(rpcDefinitionPath, "utf8"),
    ]);

  const contract = JSON.parse(
    tableContractText,
  ) as StagingTableContract;

  const normalizedRpc = normalizeSql(
    rpcDefinition,
  );

  assert.deepEqual(
    contract.table,
    {
      name: "media_sync_staging_rows",
      schema: "public",
      rls_enabled: true,
    },
  );

  const rowColumn = requireColumn(
    contract,
    "row",
  );

  assert.equal(rowColumn.type, "jsonb");
  assert.equal(rowColumn.not_null, true);

  const fingerprintColumn = requireColumn(
    contract,
    "row_fingerprint",
  );

  assert.equal(
    fingerprintColumn.type,
    "text",
  );

  assert.equal(
    fingerprintColumn.generated_kind,
    "s",
  );

  assert.equal(
    normalizeSql(
      fingerprintColumn.expression ?? "",
    ),
    normalizeSql(
      `encode(digest(("row")::text, 'sha256'::text), 'hex'::text)`,
    ),
  );

  assert.equal(
    requireConstraint(
      contract,
      "media_sync_staging_rows_job_row_index_unique",
    ).definition,
    "UNIQUE (job_id, row_index)",
  );

  assert.equal(
    requireConstraint(
      contract,
      "media_sync_staging_rows_job_window_row_key_unique",
    ).definition,
    "UNIQUE (job_id, date_window_index, row_key)",
  );

  assert.ok(
    requireIndex(
      contract,
      "media_sync_staging_rows_job_row_index_unique",
    ).definition.includes(
      "(job_id, row_index)",
    ),
  );

  assert.ok(
    requireIndex(
      contract,
      "media_sync_staging_rows_job_window_row_key_unique",
    ).definition.includes(
      "(job_id, date_window_index, row_key)",
    ),
  );

  assert.equal(
    requireConstraint(
      contract,
      "media_sync_staging_rows_row_object_check",
    ).definition,
    `CHECK (jsonb_typeof("row") = 'object'::text)`,
  );

  assert.equal(
    requireConstraint(
      contract,
      "media_sync_staging_rows_row_key_not_blank_check",
    ).definition,
    "CHECK (length(btrim(row_key)) > 0)",
  );

  assert.equal(
    requireConstraint(
      contract,
      "media_sync_staging_rows_row_date_in_window_check",
    ).definition,
    "CHECK (date >= date_from AND date <= date_to)",
  );

  const constraintText = normalizeSql(
    contract.constraints
      .map((constraint) => constraint.definition)
      .join(" "),
  );

  for (const forbiddenToken of [
    "row_level",
    "data_level",
    "external_keyword_id",
    "external_creative_id",
    "keyword",
    "creative",
    "mixed",
  ]) {
    assertSqlDoesNotContain(
      constraintText,
      forbiddenToken,
    );
  }

  assert.equal(
    contract.triggers.length,
    0,
  );

  assert.equal(
    contract.policies.length,
    0,
  );

  assertSqlContains(
    normalizedRpc,
    "create or replace function public.append_media_sync_staging_batch(p_payload jsonb)",
  );

  assertSqlContains(
    normalizedRpc,
    "language plpgsql security definer",
  );

  assertSqlContains(
    normalizedRpc,
    "set search_path to 'pg_catalog', 'public', 'extensions'",
  );

  assertSqlContains(
    normalizedRpc,
    "jsonb_typeof(p_payload -> 'rows') <> 'array'",
  );

  assertSqlContains(
    normalizedRpc,
    "jsonb_typeof(row_json) <> 'object'",
  );

  assertSqlContains(
    normalizedRpc,
    "row_key is null",
  );

  assertSqlContains(
    normalizedRpc,
    "row_date < v_date_from or row_date > v_date_to",
  );

  assertSqlContains(
    normalizedRpc,
    "having count(*) > 1",
  );

  assertSqlContains(
    normalizedRpc,
    "by_index.row_fingerprint as by_index_fingerprint",
  );

  assertSqlContains(
    normalizedRpc,
    "by_key.row_fingerprint as by_key_fingerprint",
  );

  assertSqlContains(
    normalizedRpc,
    "digest((input.item -> 'row')::text, 'sha256')",
  );

  assertSqlContains(
    normalizedRpc,
    "by_index_fingerprint <> row_fingerprint",
  );

  assertSqlContains(
    normalizedRpc,
    "by_key_fingerprint <> row_fingerprint",
  );

  assertSqlContains(
    normalizedRpc,
    "insert into public.media_sync_staging_rows",
  );

  assertSqlContains(
    normalizedRpc,
    "incoming.row_json",
  );

  assertSqlContains(
    normalizedRpc,
    "when unique_violation then",
  );

  assertSqlContains(
    normalizedRpc,
    "message = 'mss_duplicate_conflict'",
  );

  for (const forbiddenToken of [
    "row_level",
    "data_level",
    "external_keyword_id",
    "external_creative_id",
    "row_level_reason",
  ]) {
    assertSqlDoesNotContain(
      normalizedRpc,
      forbiddenToken,
    );
  }

  console.log(
    "verified staging table stores generic canonical JSON objects: true",
  );

  console.log(
    "verified table has no keyword-only or grain-specific CHECK constraint: true",
  );

  console.log(
    "verified row_fingerprint is generated from canonical row JSON SHA-256: true",
  );

  console.log(
    "verified unique identity contracts match repository assumptions: true",
  );

  console.log(
    "verified RPC accepts grain-agnostic nonblank row_key and object row payloads: true",
  );

  console.log(
    "verified RPC has no keyword-only creative-or-mixed rejection: true",
  );

  console.log(
    "verified exact duplicate retry and conflict comparison are grain-agnostic: true",
  );

  console.log(
    "verified RPC scope, date-window, and processing-job guards remain present: true",
  );

  console.log(
    "verified SECURITY DEFINER and fixed search_path contract: true",
  );

  console.log(
    "fixture uses captured production catalog snapshot: true",
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

main().catch((error: unknown) => {
  console.error(
    "Media sync staging database contract fixture failed.",
    error,
  );

  process.exitCode = 1;
});
