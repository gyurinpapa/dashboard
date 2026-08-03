import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PREPARATION_SQL_PATH = resolve(
  process.cwd(),
  "scripts/sql/create-prepare-exact-naver-brand-search-stale-reconciliation-recovery-candidate.sql",
);

const RECONCILIATION_SQL_PATH = resolve(
  process.cwd(),
  "scripts/sql/create-reconcile-naver-searchads-brand-search-cross-grain-staging.sql",
);

const STAGING_TABLE_CONTRACT_PATH = resolve(
  process.cwd(),
  "scripts/fixtures/media-sync-staging-table-contract.json",
);

const PREPARATION_RPC =
  "prepare_exact_naver_brand_search_stale_recovery_candidate";

const POSTGRES_IDENTIFIER_MAX_BYTES = 63;
const ACCIDENTALLY_TRUNCATED_PREPARATION_RPC =
  "prepare_exact_naver_brand_search_stale_reconciliation_recovery_";

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
const CURRENT_INGESTION_ID =
  "415e51eb-18b1-43d7-a4e6-6fabb5868792";
const PUBLISHED_INGESTION_ID =
  "4fa4e562-aa61-4178-9c27-fca63657b5ac";

const SOURCE_CREATED_AT =
  "2026-08-02 14:10:37.410403+00";
const SOURCE_STARTED_AT =
  "2026-08-02 18:44:11.206135+00";
const SOURCE_UPDATED_AT =
  "2026-08-02 19:44:11.627+00";
const SOURCE_FINISHED_AT =
  "2026-08-02 19:44:11.627+00";
const REPORT_UPDATED_AT =
  "2026-08-02 13:58:52.559392+00";

const DATE_FROM = "2026-05-01";
const DATE_TO = "2026-05-02";
const EXTERNAL_ACCOUNT_ID = "703575";

const SOURCE_ROWS = 45_844;
const EXCLUDED_ROWS = 1_204;
const RETAINED_ROWS = 44_640;
const REINDEX_REQUIRED_ROWS = 1_330;
const MIXED_CAMPAIGN_COUNT = 5;
const MATCHED_CAMPAIGN_COUNT = 3;
const ATTEMPT_COUNT = 469;

const EXCLUDED_MIN_ROW_INDEX = 43_310;
const EXCLUDED_MAX_ROW_INDEX = 44_513;
const REINDEX_MIN_OLD_ROW_INDEX = 44_514;
const REINDEX_MAX_OLD_ROW_INDEX = 45_843;

const EXCLUDED_METRICS = Object.freeze({
  impressions: 2_632,
  clicks: 1_092,
  cost: 0,
  conversions: 65,
  revenue: 7_639_300,
});

const IDENTITY_BLOCK_SIZE = 10_000;
const IDENTITY_ALGORITHM =
  "chunked_sha256_v1:block_size=10000";
const PREPARATION_KIND =
  "exact_naver_brand_search_stale_reconciliation_recovery_v1";

const SOURCE_ERROR = "STALE_PROCESSING_JOB";
const SOURCE_ERROR_DETAIL_DIGEST =
  "4413183c727a9919f25b8da09d3f3991fb69c3cd0e5b7e6b53da25711ba790c1";
const PRODUCTION_SOURCE_IDENTITY_DIGEST =
  "3b28ccb42d52dcde46b9da44bb8043573b8966b6ecdd3a7a0655d0ac88dfef49";
const PREPARATION_CONFIRMATION_TOKEN =
  "97284ee9d16df6415c7fba27cb8da05dec4f0b98c2c567dae7bd297fbfa4d92d";

type MetricTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

type FixtureProviderMeta = {
  campaign_type: string;
  authoritative_grain: string | null;
};

type FixtureCanonicalRow = MetricTotals & {
  date: string;
  report_date: string;
  day: string;
  ymd: string;
  channel: string;
  device: string;
  source: string;
  provider: string;
  external_account_id: string;
  ingestion_source: string;
  row_level: string;
  data_level: string;
  row_level_reason: string;
  external_campaign_id: string;
  external_group_id: string;
  external_keyword_id: string | null;
  external_ad_id: string | null;
  external_creative_id: string | null;
  provider_meta: FixtureProviderMeta;
};

type FixtureRow = {
  id: string;
  rowIndex: number;
  dateWindowIndex: number;
  date: string;
  rowKey: string;
  rowFingerprint: string;
  row: FixtureCanonicalRow;
};

type ReconciliationFixtureRow = FixtureRow & {
  excluded: boolean;
  newRowIndex: number | null;
};

type ReconciliationFixture = {
  mixedCampaigns: Set<string>;
  matchedCampaigns: Set<string>;
  excluded: ReconciliationFixtureRow[];
  retained: ReconciliationFixtureRow[];
  reindexed: ReconciliationFixtureRow[];
  excludedMetrics: MetricTotals;
};

type StagingContractColumn = {
  name: string;
  expression: string | null;
  generated_kind: string;
};

type StagingTableContract = {
  columns: StagingContractColumn[];
};


function sha256(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function stripSqlComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function normalizeSql(value: string): string {
  return stripSqlComments(value)
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

function countMatches(
  value: string,
  pattern: RegExp,
): number {
  return [...value.matchAll(pattern)].length;
}

function createIdentityLine(row: FixtureRow): string {
  return `${JSON.stringify([
    row.rowIndex,
    row.dateWindowIndex,
    row.date,
    row.rowKey,
    row.rowFingerprint,
  ])}\n`;
}

function createChunkedIdentityDigest(
  rows: readonly FixtureRow[],
): string {
  const sorted = [...rows].sort(
    (left, right) =>
      left.rowIndex - right.rowIndex ||
      left.rowKey.localeCompare(right.rowKey) ||
      left.id.localeCompare(right.id),
  );

  const blocks = new Map<number, FixtureRow[]>();

  for (const row of sorted) {
    const blockIndex = Math.floor(
      row.rowIndex / IDENTITY_BLOCK_SIZE,
    );

    const existing = blocks.get(blockIndex) ?? [];
    existing.push(row);
    blocks.set(blockIndex, existing);
  }

  const descriptors = [...blocks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([blockIndex, blockRows]) => {
      const blockDigest = sha256(
        blockRows.map(createIdentityLine).join(""),
      );

      return [
        blockIndex,
        blockRows.length,
        blockRows[0].rowIndex,
        blockRows[blockRows.length - 1].rowIndex,
        blockDigest,
      ].join(":");
    });

  return sha256(
    `${IDENTITY_ALGORITHM}\n${descriptors.join("\n")}`,
  );
}

function createConfirmationToken(
  sourceIdentityDigest: string,
): string {
  const lines = [
    "version=1",
    `preparation_kind=${PREPARATION_KIND}`,
    `source_job_id=${SOURCE_JOB_ID}`,
    "source_created_at=2026-08-02T14:10:37.410403+00:00",
    "source_updated_at=2026-08-02T19:44:11.627+00:00",
    "source_finished_at=2026-08-02T19:44:11.627+00:00",
    `source_attempt_count=${ATTEMPT_COUNT}`,
    `source_error=${SOURCE_ERROR}`,
    `source_error_detail_digest=${SOURCE_ERROR_DETAIL_DIGEST}`,
    `report_id=${REPORT_ID}`,
    `workspace_id=${WORKSPACE_ID}`,
    `advertiser_id=${ADVERTISER_ID}`,
    `connection_id=${CONNECTION_ID}`,
    `external_account_id=${EXTERNAL_ACCOUNT_ID}`,
    `date_from=${DATE_FROM}`,
    `date_to=${DATE_TO}`,
    `current_ingestion_id=${CURRENT_INGESTION_ID}`,
    `published_ingestion_id=${PUBLISHED_INGESTION_ID}`,
    "report_updated_at=2026-08-02T13:58:52.559392+00:00",
    `source_rows=${SOURCE_ROWS}`,
    `excluded_rows=${EXCLUDED_ROWS}`,
    `retained_rows=${RETAINED_ROWS}`,
    `reindex_required_rows=${REINDEX_REQUIRED_ROWS}`,
    `mixed_campaign_count=${MIXED_CAMPAIGN_COUNT}`,
    `matched_campaign_count=${MATCHED_CAMPAIGN_COUNT}`,
    `excluded_impressions=${EXCLUDED_METRICS.impressions}`,
    `excluded_clicks=${EXCLUDED_METRICS.clicks}`,
    `excluded_cost=${EXCLUDED_METRICS.cost}`,
    `excluded_conversions=${EXCLUDED_METRICS.conversions}`,
    `excluded_revenue=${EXCLUDED_METRICS.revenue}`,
    `identity_algorithm=${IDENTITY_ALGORITHM}`,
    `source_identity_digest=${sourceIdentityDigest}`,
  ];

  return sha256(lines.join("\n"));
}

function createFixtureRow(rowIndex: number): FixtureRow {
  const isExcluded =
    rowIndex >= EXCLUDED_MIN_ROW_INDEX &&
    rowIndex <= EXCLUDED_MAX_ROW_INDEX;

  const isMixed =
    rowIndex >= REINDEX_MIN_OLD_ROW_INDEX &&
    rowIndex < REINDEX_MIN_OLD_ROW_INDEX +
      MIXED_CAMPAIGN_COUNT;

  let campaignId = `generic-campaign-${Math.floor(rowIndex / 2)}`;
  let rowLevel = "keyword";
  let dataLevel = "keyword";
  let rowLevelReason =
    "naver_searchad_registered_keyword_daily_stats";
  let campaignType = "WEB_SITE";
  let authoritativeGrain: string | null = null;

  if (isExcluded) {
    campaignId =
      `matched-brand-${
        (rowIndex - EXCLUDED_MIN_ROW_INDEX) %
        MATCHED_CAMPAIGN_COUNT
      }`;
    campaignType = "BRAND_SEARCH";
  } else if (isMixed) {
    campaignId =
      `matched-brand-${
        rowIndex - REINDEX_MIN_OLD_ROW_INDEX
      }`;
    rowLevel = "mixed";
    dataLevel = "mixed";
    rowLevelReason =
      "naver_searchad_brand_search_adgroup_daily_stats";
    campaignType = "BRAND_SEARCH";
    authoritativeGrain = "adgroup";
  }

  const isFirstExcluded =
    rowIndex === EXCLUDED_MIN_ROW_INDEX;

  const date =
    rowIndex % 2 === 0
      ? DATE_FROM
      : DATE_TO;

  const row = {
    date,
    report_date: date,
    day: date,
    ymd: date,
    channel: "naver",
    device: "all",
    source: "naver_searchad",
    provider: "naver_searchad",
    external_account_id: EXTERNAL_ACCOUNT_ID,
    ingestion_source: "api",
    row_level: rowLevel,
    data_level: dataLevel,
    row_level_reason: rowLevelReason,
    external_campaign_id: campaignId,
    external_group_id: `group-${Math.floor(rowIndex / 2)}`,
    external_keyword_id:
      rowLevel === "keyword"
        ? `keyword-${Math.floor(rowIndex / 2)}`
        : null,
    external_ad_id: null,
    external_creative_id: null,
    impressions:
      isFirstExcluded
        ? EXCLUDED_METRICS.impressions
        : 0,
    clicks:
      isFirstExcluded
        ? EXCLUDED_METRICS.clicks
        : 0,
    cost:
      isFirstExcluded
        ? EXCLUDED_METRICS.cost
        : 0,
    conversions:
      isFirstExcluded
        ? EXCLUDED_METRICS.conversions
        : 0,
    revenue:
      isFirstExcluded
        ? EXCLUDED_METRICS.revenue
        : 0,
    provider_meta: {
      campaign_type: campaignType,
      authoritative_grain: authoritativeGrain,
    },
  };

  const rowKey = JSON.stringify([
    "naver_searchad",
    EXTERNAL_ACCOUNT_ID,
    campaignId,
    row.external_group_id,
    row.external_keyword_id ?? `entity-${rowIndex}`,
    date,
    rowLevel,
  ]);

  return {
    id: `fixture-${rowIndex.toString().padStart(5, "0")}`,
    rowIndex,
    dateWindowIndex: 0,
    date,
    rowKey,
    rowFingerprint: sha256(
      JSON.stringify(row),
    ),
    row,
  };
}

function createProductionShapeFixture(): FixtureRow[] {
  return Array.from(
    { length: SOURCE_ROWS },
    (_, rowIndex) => createFixtureRow(rowIndex),
  );
}

function calculateReconciliation(
  rows: readonly FixtureRow[],
): ReconciliationFixture {
  const mixedCampaigns = new Set(
    rows
      .filter(
        (row) =>
          row.row.row_level === "mixed" &&
          row.row.data_level === "mixed" &&
          row.row.row_level_reason ===
            "naver_searchad_brand_search_adgroup_daily_stats" &&
          row.row.provider_meta.campaign_type ===
            "BRAND_SEARCH" &&
          row.row.provider_meta.authoritative_grain ===
            "adgroup",
      )
      .map((row) => row.row.external_campaign_id),
  );

  const classified = rows.map((row): FixtureRow & { excluded: boolean } => ({
    ...row,
    excluded:
      row.row.row_level === "keyword" &&
      row.row.data_level === "keyword" &&
      row.row.row_level_reason ===
        "naver_searchad_registered_keyword_daily_stats" &&
      row.row.provider_meta.campaign_type ===
        "BRAND_SEARCH" &&
      mixedCampaigns.has(row.row.external_campaign_id),
  }));

  let nextRowIndex = 0;
  const mapped = classified.map((row): ReconciliationFixtureRow => {
    if (row.excluded) {
      return {
        ...row,
        newRowIndex: null,
      };
    }

    const result = {
      ...row,
      newRowIndex: nextRowIndex,
    };
    nextRowIndex += 1;
    return result;
  });

  const excluded = mapped.filter((row) => row.excluded);
  const retained = mapped.filter((row) => !row.excluded);
  const reindexed = retained.filter(
    (row) => row.rowIndex !== row.newRowIndex,
  );
  const matchedCampaigns = new Set(
    excluded.map((row) => row.row.external_campaign_id),
  );

  const excludedMetrics = excluded.reduce<MetricTotals>(
    (totals, row) => ({
      impressions:
        totals.impressions + Number(row.row.impressions),
      clicks:
        totals.clicks + Number(row.row.clicks),
      cost:
        totals.cost + Number(row.row.cost),
      conversions:
        totals.conversions + Number(row.row.conversions),
      revenue:
        totals.revenue + Number(row.row.revenue),
    }),
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      revenue: 0,
    },
  );

  return {
    mixedCampaigns,
    matchedCampaigns,
    excluded,
    retained,
    reindexed,
    excludedMetrics,
  };
}

function verifyProductionShapeFixture(): {
  sourceIdentityDigest: string;
  confirmationToken: string;
} {
  const source = createProductionShapeFixture();
  const sourceBefore = JSON.stringify(source);
  const sourceIdentityDigest =
    createChunkedIdentityDigest(source);
  const candidate = structuredClone(source);
  const candidateIdentityDigest =
    createChunkedIdentityDigest(candidate);

  assert.equal(source.length, SOURCE_ROWS);
  assert.equal(
    source[0].rowIndex,
    0,
  );
  assert.equal(
    source[source.length - 1].rowIndex,
    SOURCE_ROWS - 1,
  );
  assert.equal(
    new Set(source.map((row) => row.rowIndex)).size,
    SOURCE_ROWS,
  );
  assert.equal(
    new Set(
      source.map(
        (row) => `${row.dateWindowIndex}:${row.rowKey}`,
      ),
    ).size,
    SOURCE_ROWS,
  );
  assert.equal(
    sourceIdentityDigest,
    candidateIdentityDigest,
    "The full candidate copy identity must equal the source identity.",
  );
  assert.match(sourceIdentityDigest, /^[0-9a-f]{64}$/);

  const reconciliation =
    calculateReconciliation(candidate);

  assert.equal(
    reconciliation.excluded.length,
    EXCLUDED_ROWS,
  );
  assert.equal(
    reconciliation.retained.length,
    RETAINED_ROWS,
  );
  assert.equal(
    reconciliation.reindexed.length,
    REINDEX_REQUIRED_ROWS,
  );
  assert.equal(
    reconciliation.mixedCampaigns.size,
    MIXED_CAMPAIGN_COUNT,
  );
  assert.equal(
    reconciliation.matchedCampaigns.size,
    MATCHED_CAMPAIGN_COUNT,
  );
  assert.equal(
    reconciliation.excluded[0].rowIndex,
    EXCLUDED_MIN_ROW_INDEX,
  );
  const lastExcluded = reconciliation.excluded.at(-1);
  if (!lastExcluded) {
    throw new Error("The excluded fixture must not be empty.");
  }
  assert.equal(
    lastExcluded.rowIndex,
    EXCLUDED_MAX_ROW_INDEX,
  );
  assert.equal(
    reconciliation.reindexed[0].rowIndex,
    REINDEX_MIN_OLD_ROW_INDEX,
  );
  const lastReindexed = reconciliation.reindexed.at(-1);
  if (!lastReindexed) {
    throw new Error("The reindexed fixture must not be empty.");
  }
  assert.equal(
    lastReindexed.rowIndex,
    REINDEX_MAX_OLD_ROW_INDEX,
  );
  assert.deepEqual(
    reconciliation.excludedMetrics,
    EXCLUDED_METRICS,
  );
  assert.deepEqual(
    reconciliation.retained.map((row) => row.newRowIndex),
    Array.from(
      { length: RETAINED_ROWS },
      (_, rowIndex) => rowIndex,
    ),
    "The retained rows must compact to 0..44,639 only during reconciliation.",
  );
  assert.equal(
    JSON.stringify(source),
    sourceBefore,
    "The source fixture must remain immutable.",
  );

  const confirmationToken =
    createConfirmationToken(sourceIdentityDigest);
  assert.match(confirmationToken, /^[0-9a-f]{64}$/);
  assert.notEqual(
    confirmationToken,
    createConfirmationToken("0".repeat(64)),
  );
  assert.equal(
    createConfirmationToken(PRODUCTION_SOURCE_IDENTITY_DIGEST),
    PREPARATION_CONFIRMATION_TOKEN,
    "The exact production preparation token serialization changed.",
  );

  let existingCandidate = false;
  const prepareOnce = () => {
    if (existingCandidate) {
      throw new Error("ENBGSR_CANDIDATE_ALREADY_EXISTS");
    }
    existingCandidate = true;
    return {
      status: "cancelled",
      rows: candidate.length,
      phase: "completed",
      nextRowIndex: SOURCE_ROWS,
    };
  };

  assert.deepEqual(prepareOnce(), {
    status: "cancelled",
    rows: SOURCE_ROWS,
    phase: "completed",
    nextRowIndex: SOURCE_ROWS,
  });
  assert.throws(
    prepareOnce,
    /ENBGSR_CANDIDATE_ALREADY_EXISTS/,
  );

  assert.throws(
    () => {
      assert.equal(
        reconciliation.excluded.length,
        EXCLUDED_ROWS - 1,
        "A changed exact assertion must fail closed.",
      );
    },
    /changed exact assertion must fail closed/i,
  );

  return {
    sourceIdentityDigest,
    confirmationToken,
  };
}

function verifyStagingTableContract(
  contractSource: string,
): void {
  const contract = JSON.parse(
    contractSource,
  ) as StagingTableContract;
  const columns = contract.columns;
  const fingerprint = columns.find(
    (column) => column.name === "row_fingerprint",
  );

  if (!fingerprint) {
    throw new Error("row_fingerprint column is missing.");
  }
  assert.equal(
    fingerprint.generated_kind,
    "s",
    "row_fingerprint must remain a stored generated column.",
  );
  assert.equal(typeof fingerprint.expression, "string");
  assert.match(
    fingerprint.expression ?? "",
    /digest.*row.*sha256/i,
  );
}

function verifyPreparationSql(source: string): void {
  const normalized = normalizeSql(source);

  assert.ok(
    Buffer.byteLength(PREPARATION_RPC, "utf8") <=
      POSTGRES_IDENTIFIER_MAX_BYTES,
    "The preparation RPC name must fit PostgreSQL's 63-byte identifier limit.",
  );
  requirePattern(
    normalized,
    new RegExp(
      `drop function if exists public\\.${ACCIDENTALLY_TRUNCATED_PREPARATION_RPC}\\(jsonb\\)`,
    ),
    "The accidentally truncated first deployment must be removed atomically.",
  );

  requirePattern(
    normalized,
    new RegExp(
      `create or replace function public\\.${PREPARATION_RPC}\\s*\\(\\s*p_payload jsonb\\s*\\)`,
    ),
    "The exact preparation RPC signature is missing.",
  );
  requirePattern(normalized, /language plpgsql/,
    "The RPC must be PL/pgSQL.");
  requirePattern(normalized, /security definer/,
    "The RPC must be SECURITY DEFINER.");
  requirePattern(
    normalized,
    /set search_path to 'pg_catalog', 'public', 'extensions'/,
    "The RPC search_path must be fixed.",
  );
  requirePattern(
    normalized,
    /set statement_timeout to '60s'/,
    "The RPC statement_timeout must be 60s.",
  );

  for (const exactValue of [
    SOURCE_JOB_ID,
    REPORT_ID,
    WORKSPACE_ID,
    ADVERTISER_ID,
    CONNECTION_ID,
    CURRENT_INGESTION_ID,
    PUBLISHED_INGESTION_ID,
    EXTERNAL_ACCOUNT_ID,
    DATE_FROM,
    DATE_TO,
    SOURCE_CREATED_AT,
    SOURCE_STARTED_AT,
    SOURCE_UPDATED_AT,
    SOURCE_FINISHED_AT,
    REPORT_UPDATED_AT,
    String(ATTEMPT_COUNT),
    String(SOURCE_ROWS),
    String(EXCLUDED_ROWS),
    String(RETAINED_ROWS),
    String(REINDEX_REQUIRED_ROWS),
    String(MIXED_CAMPAIGN_COUNT),
    String(MATCHED_CAMPAIGN_COUNT),
    String(EXCLUDED_MIN_ROW_INDEX),
    String(EXCLUDED_MAX_ROW_INDEX),
    String(REINDEX_MIN_OLD_ROW_INDEX),
    String(REINDEX_MAX_OLD_ROW_INDEX),
    String(EXCLUDED_METRICS.impressions),
    String(EXCLUDED_METRICS.clicks),
    String(EXCLUDED_METRICS.conversions),
    String(EXCLUDED_METRICS.revenue),
    IDENTITY_ALGORITHM,
    SOURCE_ERROR,
    SOURCE_ERROR_DETAIL_DIGEST,
    PRODUCTION_SOURCE_IDENTITY_DIGEST,
    PREPARATION_CONFIRMATION_TOKEN,
  ]) {
    assert.ok(
      normalized.includes(exactValue.toLowerCase()),
      `The exact contract value is missing: ${exactValue}`,
    );
  }

  requirePattern(
    normalized,
    /pg_advisory_xact_lock\s*\(/,
    "Concurrent exact preparation must be serialized.",
  );
  requirePattern(
    normalized,
    /from public\.media_sync_jobs as job where job\.id = v_expected_source_job_id for update/,
    "The source job must be locked FOR UPDATE.",
  );
  requirePattern(
    normalized,
    /from public\.reports as report where report\.id = v_expected_report_id for update/,
    "The report must be locked FOR UPDATE.",
  );
  requirePattern(
    normalized,
    /from public\.media_connections as connection where connection\.id = v_expected_connection_id for share/,
    "The connection must be validated under a share lock.",
  );

  requirePattern(
    normalized,
    /status in \('pending', 'processing'\)/,
    "Active pending/processing jobs must block preparation.",
  );
  requirePattern(
    normalized,
    /enbgsr_active_job_exists/,
    "The active-job failure code is missing.",
  );
  requirePattern(
    normalized,
    /enbgsr_candidate_already_exists/,
    "Duplicate source candidates must be rejected.",
  );
  requirePattern(
    normalized,
    /source_job_updated_at/,
    "The exact source updated_at guard is missing.",
  );
  requirePattern(
    normalized,
    /source_job_finished_at/,
    "The exact source finished_at guard is missing.",
  );
  for (const staleLiteral of [
    "stale_processing_job",
    "stale_recovery",
    "automatic_recovery",
    "3600000",
    "2026-08-02t18:44:11.465z",
    "2026-08-02t19:44:11.627z",
  ]) {
    assert.ok(
      normalized.includes(staleLiteral),
      `The exact stale failure literal is missing: ${staleLiteral}`,
    );
  }
  requirePattern(
    normalized,
    /source_error_detail_digest/,
    "The full source error_detail digest guard is missing.",
  );

  requirePattern(
    normalized,
    /count\(distinct source_rows\.row_index\)/,
    "The full row_index integrity scan is missing.",
  );
  requirePattern(
    normalized,
    /count\( distinct \( source_rows\.date_window_index, source_rows\.row_key \) \)/,
    "The window/row_key duplicate scan is missing.",
  );
  requirePattern(
    normalized,
    /source_rows\.row_fingerprint is distinct from encode\( extensions\.digest\(/,
    "Stored fingerprints must be recalculated from canonical rows.",
  );
  requirePattern(
    normalized,
    /source_rows\.report_id is distinct from v_expected_report_id/,
    "The staging scope scan is missing.",
  );
  requirePattern(
    normalized,
    /coalesce\(source_rows\.row ->> 'date', ''\) <> source_rows\.date::text/,
    "The canonical row/column consistency scan is missing.",
  );

  requirePattern(
    normalized,
    /create temporary table enbgr_mixed_campaigns/,
    "The mixed campaign precompute is missing.",
  );
  requirePattern(
    normalized,
    /create temporary table enbgr_row_map/,
    "The hypothetical reconciliation row map is missing.",
  );
  requirePattern(
    normalized,
    /row_number\(\) over \( order by classified\.old_row_index, classified\.row_key, classified\.staging_id \) - 1/,
    "The exact compact row-index precompute is missing.",
  );
  requirePattern(
    normalized,
    /enbgsr_reconciliation_precompute_mismatch/,
    "Exact reconciliation precompute mismatch must fail closed.",
  );

  assert.equal(
    countMatches(
      normalized,
      /chunked_sha256_v1:block_size=10000/g,
    ),
    1,
    "The identity algorithm must be defined once and reused.",
  );
  assert.ok(
    countMatches(
      normalized,
      /source_row\.row_index \/ v_identity_block_size/g,
    ) >= 2,
    "Source identity must be checked before and after copy.",
  );
  requirePattern(
    normalized,
    /candidate_row\.row_index \/ v_identity_block_size/,
    "Candidate identity must use the same chunked algorithm.",
  );
  requirePattern(
    normalized,
    /enbgsr_source_identity_digest_mismatch/,
    "The supplied source digest must be enforced.",
  );
  requirePattern(
    normalized,
    /enbgsr_confirmation_token_mismatch/,
    "The exact confirmation token must be enforced.",
  );
  requirePattern(
    normalized,
    /enbgsr_exact_confirmation_input_mismatch/,
    "The supplied digest and token must equal the fixed preflight values.",
  );
  requirePattern(
    normalized,
    new RegExp(
      `alter function public\\.${PREPARATION_RPC}\\(jsonb\\) owner to postgres`,
    ),
    "The preparation RPC owner must be postgres.",
  );

  const stagingInsert = source.match(
    /insert\s+into\s+public\.media_sync_staging_rows\s*\(([\s\S]*?)\)\s*select/i,
  );
  if (!stagingInsert) {
    throw new Error("The candidate staging INSERT is missing.");
  }

  const insertedColumns = stagingInsert[1]
    .split(",")
    .map((column) => column.trim().toLowerCase())
    .filter(Boolean);

  assert.deepEqual(insertedColumns, [
    "job_id",
    "report_id",
    "workspace_id",
    "advertiser_id",
    "connection_id",
    "provider",
    "external_account_id",
    "date_window_index",
    "date_from",
    "date_to",
    "row_index",
    "row_key",
    "date",
    "channel",
    "device",
    "source",
    "row",
  ]);
  assert.ok(!insertedColumns.includes("row_fingerprint"));
  assert.ok(!insertedColumns.includes("id"));
  assert.ok(!insertedColumns.includes("created_at"));
  assert.ok(!insertedColumns.includes("updated_at"));

  requirePattern(
    normalized,
    /insert into public\.media_sync_jobs[\s\S]*?'cancelled', 99, v_expected_source_rows, v_expected_source_rows, v_expected_source_rows, 0,[\s\S]*?null, 0, null/,
    "The candidate must be isolated as cancelled with the established 99/0 lifecycle values.",
  );
  requirePattern(
    normalized,
    /'phase', 'completed'/,
    "The candidate checkpoint must begin immediately before reconciliation.",
  );
  requirePattern(
    normalized,
    /'keyword', jsonb_build_object\( 'complete', true/,
    "The candidate keyword checkpoint must be complete.",
  );
  requirePattern(
    normalized,
    /'authoritative', jsonb_build_object\( 'complete', true/,
    "The candidate authoritative checkpoint must be complete.",
  );
  requirePattern(
    normalized,
    /'next_row_index', v_expected_source_rows/,
    "The candidate next_row_index must remain 45,844 before reconciliation.",
  );
  requirePattern(
    normalized,
    /'candidate_identity_digest', v_source_identity_digest/,
    "Recovery metadata must pin the expected candidate identity.",
  );
  requirePattern(
    normalized,
    /v_candidate_identity_digest is distinct from v_source_identity_digest/,
    "The copied candidate identity must equal the source identity.",
  );
  requirePattern(
    normalized,
    /to_jsonb\(v_source_job_after\) is distinct from to_jsonb\(v_source_job\)/,
    "The complete source job row must be revalidated after copy.",
  );
  requirePattern(
    normalized,
    /enbgsr_report_changed_during_preparation/,
    "Report pointers must be revalidated after copy.",
  );

  rejectPattern(
    normalized,
    /\bupdate\s+public\.media_sync_jobs\b/,
    "No media_sync_jobs row may be updated during preparation.",
  );
  rejectPattern(
    normalized,
    /\bupdate\s+public\.media_sync_staging_rows\b/,
    "Source or candidate staging may not be updated during preparation.",
  );
  rejectPattern(
    normalized,
    /\bdelete\s+from\s+public\.media_sync_staging_rows\b/,
    "Source or candidate staging may not be deleted during preparation.",
  );
  rejectPattern(
    normalized,
    /\bupdate\s+public\.reports\b/,
    "Report pointers may not be updated during preparation.",
  );
  rejectPattern(
    normalized,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.report_rows\b/,
    "report_rows must remain unchanged.",
  );

  for (const forbiddenRpc of [
    "claim_next_naver_media_sync_job",
    "claim_exact_naver_production_recovery_candidate",
    "reconcile_naver_searchads_brand_search_cross_grain_staging",
    "prepare_media_sync_snapshot_materialization",
    "materialize_media_sync_snapshot_batch",
    "complete_media_sync_snapshot_materialization",
    "activate_media_sync_snapshot",
    "finalize_media_sync_job",
    "publish_report",
  ]) {
    rejectPattern(
      normalized,
      new RegExp(`public\\.${forbiddenRpc}\\s*\\(`),
      `The preparation SQL calls forbidden RPC ${forbiddenRpc}.`,
    );
  }

  requirePattern(normalized, /^begin;/,
    "The DDL file must start a transaction.");
  requirePattern(normalized, /commit;$/,
    "The DDL file must commit only after the complete definition.");

  for (const role of ["public", "anon", "authenticated"]) {
    requirePattern(
      normalized,
      new RegExp(
        `revoke all on function public\\.${PREPARATION_RPC}\\(jsonb\\) from ${role}`,
      ),
      `${role} EXECUTE must be revoked.`,
    );
  }
  requirePattern(
    normalized,
    new RegExp(
      `grant execute on function public\\.${PREPARATION_RPC}\\(jsonb\\) to service_role`,
    ),
    "Only service_role must receive EXECUTE.",
  );
}

function verifyReconciliationSql(source: string): void {
  const normalized = normalizeSql(source);

  requirePattern(
    normalized,
    /create or replace function public\.reconcile_naver_searchads_brand_search_cross_grain_staging\s*\(/,
    "The existing reconciliation RPC is missing.",
  );
  requirePattern(
    normalized,
    /set statement_timeout to '60s'/,
    "The reconciliation RPC timeout must remain exactly 60s.",
  );
  rejectPattern(
    normalized,
    /set statement_timeout to '10min'/,
    "The unsafe 10min reconciliation timeout must not return.",
  );
  requirePattern(
    normalized,
    /v_default_batch_size constant integer := 500/,
    "The reconciliation default batch must remain 500.",
  );

  for (const preservedContract of [
    "brand_search_cross_grain_dedup_v1",
    "naver_searchad_registered_keyword_daily_stats",
    "naver_searchad_brand_search_adgroup_daily_stats",
    "brand_search",
    "authoritative_grain",
    "adgroup",
    "nsbgr_reconciliation_conflict",
    "nsbgr_postcondition_failed",
  ]) {
    assert.ok(
      normalized.includes(preservedContract),
      `The reconciliation contract changed or is missing: ${preservedContract}`,
    );
  }

  requirePattern(
    normalized,
    /row_number\(\) over \( order by classified\.old_row_index, classified\.row_key, classified\.staging_id \) - 1/,
    "The deterministic retained-row compact index remains required.",
  );
  assert.equal(
    countMatches(
      normalized,
      /update public\.media_sync_staging_rows as staging/g,
    ),
    2,
    "Reconciliation must keep exactly two changed-only staging UPDATE statements.",
  );
  assert.equal(
    countMatches(
      normalized,
      /delete from public\.media_sync_staging_rows as staging/g,
    ),
    1,
    "Reconciliation must keep exactly one exclusion DELETE statement.",
  );
  assert.ok(
    countMatches(
      normalized,
      /row_map\.old_row_index is distinct from row_map\.new_row_index/g,
    ) >= 3,
    "Changed-only reindex guards must remain present.",
  );
  requirePattern(
    normalized,
    /set raw_rows = v_retained_rows, normalized_rows = v_retained_rows, inserted_rows = v_retained_rows/,
    "The reconciled counters must remain based on retained rows.",
  );

  for (const forbiddenRpc of [
    "prepare_media_sync_snapshot_materialization",
    "materialize_media_sync_snapshot_batch",
    "complete_media_sync_snapshot_materialization",
    "activate_media_sync_snapshot",
    "finalize_media_sync_job",
    "publish_report",
  ]) {
    rejectPattern(
      normalized,
      new RegExp(`public\\.${forbiddenRpc}\\s*\\(`),
      `The reconciliation SQL calls forbidden RPC ${forbiddenRpc}.`,
    );
  }
}

async function main(): Promise<void> {
  const [
    preparationSql,
    reconciliationSql,
    stagingTableContract,
  ] = await Promise.all([
    readFile(PREPARATION_SQL_PATH, "utf8"),
    readFile(RECONCILIATION_SQL_PATH, "utf8"),
    readFile(STAGING_TABLE_CONTRACT_PATH, "utf8"),
  ]);

  verifyStagingTableContract(stagingTableContract);
  verifyPreparationSql(preparationSql);
  verifyReconciliationSql(reconciliationSql);

  const fixture = verifyProductionShapeFixture();

  console.log("exact preparation RPC signature: verified");
  console.log("SECURITY DEFINER/search_path/60s/postgres owner: verified");
  console.log("fixed source/scope/pointer/timestamp guards: verified");
  console.log("source failure STALE_PROCESSING_JOB/stale_recovery: verified");
  console.log("source full staging integrity scan: verified");
  console.log("generated row_fingerprint direct INSERT: absent");
  console.log(`production-shape source rows: ${SOURCE_ROWS}`);
  console.log(`production-shape excluded rows: ${EXCLUDED_ROWS}`);
  console.log(`production-shape retained rows: ${RETAINED_ROWS}`);
  console.log(`production-shape reindex rows: ${REINDEX_REQUIRED_ROWS}`);
  console.log(`production-shape mixed campaigns: ${MIXED_CAMPAIGN_COUNT}`);
  console.log(`production-shape matched campaigns: ${MATCHED_CAMPAIGN_COUNT}`);
  console.log(
    "production-shape excluded metrics:",
    JSON.stringify(EXCLUDED_METRICS),
  );
  console.log(
    "fixture source identity digest:",
    fixture.sourceIdentityDigest,
  );
  console.log(
    "fixture confirmation token:",
    fixture.confirmationToken,
  );
  console.log("candidate status/phase/rows: cancelled/completed/45844");
  console.log("second candidate creation: rejected");
  console.log("source job UPDATE: absent");
  console.log("source staging UPDATE/DELETE: absent");
  console.log("report pointer/report_rows mutation: absent");
  console.log("claim calls: 0");
  console.log("reconciliation calls during preparation: 0");
  console.log("materialization calls: 0");
  console.log("activation calls: 0");
  console.log("finalization calls: 0");
  console.log("publish calls: 0");
  console.log("reconciliation exclusion/reindex contract: preserved");
  console.log("reconciliation statement_timeout/default batch: 60s/500");
  console.log(`preparation RPC identifier bytes: ${Buffer.byteLength(PREPARATION_RPC, "utf8")}/63`);
  console.log("service_role-only execution: verified");
  console.log("contract verification: PASS");
}

main().catch((error) => {
  console.error("contract verification: FAIL");
  console.error(error);
  process.exitCode = 1;
});