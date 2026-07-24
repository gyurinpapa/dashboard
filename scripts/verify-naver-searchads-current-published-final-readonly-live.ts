// scripts/verify-naver-searchads-current-published-final-readonly-live.ts
//
// Exact final read-only verification for the completed Naver Search Ads recovery.
//
// Safety boundary:
// - Supabase REST GET requests only
// - no INSERT / UPDATE / DELETE / UPSERT
// - no RPC or Naver API calls
// - no job creation / claim
// - no materialization / activation / finalization
// - verifies report pointers again after all row reads
//
// Run:
// MEDIA_SYNC_WORKER_ENABLED=0 node --env-file=.env.local --import tsx \
//   scripts/verify-naver-searchads-current-published-final-readonly-live.ts

import assert from "node:assert/strict";

import { buildRowLevelBuckets } from "../app/components/ReportTemplate";

const REPORT_ID = "ea413950-4068-41e8-9ced-8355020d7e7d";
const WORKSPACE_ID = "27b1556f-9d42-496f-bd7e-5a59ebee71d4";
const ADVERTISER_ID = "da51e71a-01ce-42fb-a937-7af0b5f47786";
const CANDIDATE_JOB_ID = "4191baff-393f-4be8-bb38-31548d3ba051";

const EXPECTED_CURRENT_INGESTION_ID =
  "38d08585-0b71-4147-a3bb-e15ebc9caa08";
const EXPECTED_PUBLISHED_INGESTION_ID =
  "6d74227e-8d3b-4782-b041-6915d1cc3b89";

const EXPECTED_CURRENT_ROWS = 44_604;
const EXPECTED_PUBLISHED_ROWS = 44_514;

const EXPECTED_CURRENT_ROW_LEVELS = {
  keyword: 43_310,
  creative: 1_244,
  mixed: 50,
  unknown: 0,
} as const;

const EXPECTED_CURRENT_KPI = {
  impressions: 7_075,
  clicks: 1_183,
  cost: 113_850,
  conversions: 67,
  revenue: 12_729_300,
} as const;

const EXPECTED_PUBLISHED_KPI = {
  impressions: 2_632,
  clicks: 1_092,
  cost: 0,
  conversions: 65,
  revenue: 7_639_300,
} as const;

const EXPECTED_CANDIDATE_STATUS = "done";
const EXPECTED_CANDIDATE_PROGRESS = 100;
const EXPECTED_CANDIDATE_ATTEMPT_COUNT = 12;
const PAGE_SIZE = 1_000;

type JsonRecord = Record<string, unknown>;

type MetricTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

type ReportState = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  status: string | null;
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
};

type CandidateJobState = {
  id: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  status: string;
  progress: number;
  attemptCount: number;
  snapshotIngestionId: string | null;
  finishedAt: string | null;
  error: string | null;
};

type SnapshotDescriptor = {
  id: string;
  reportId: string;
  workspaceId: string;
  rowCount: number;
  status: string | null;
};

type SnapshotSummary = {
  ingestionId: string;
  storedRows: number;
  representativeRows: number;
  rowLevels: {
    keyword: number;
    creative: number;
    mixed: number;
    unknown: number;
  };
  metrics: MetricTotals;
  firstRowIndex: number | null;
  lastRowIndex: number | null;
  contiguousRowIndexes: boolean;
};

function requiredEnv(names: readonly string[]): string {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

const SUPABASE_URL = requiredEnv([
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
]).replace(/\/+$/, "");

const SUPABASE_SERVICE_ROLE_KEY = requiredEnv([
  "SUPABASE_SERVICE_ROLE_KEY",
]);

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: unknown): JsonRecord | null {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asRequiredString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? "").trim();
  assert.ok(normalized, `${fieldName} must be a non-empty string.`);
  return normalized;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (
    !normalized ||
    normalized.toLowerCase() === "null" ||
    normalized.toLowerCase() === "undefined"
  ) {
    return null;
  }
  return normalized;
}

function asFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[,%₩\s]/g, "").trim());
  assert.ok(Number.isFinite(parsed), `${fieldName} must be a finite number.`);
  return parsed;
}

function buildRestUrl(table: string, params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  return `${SUPABASE_URL}/rest/v1/${table}?${search.toString()}`;
}

async function restGet(
  table: string,
  params: Record<string, string>,
  range?: { from: number; to: number },
): Promise<unknown[]> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    Prefer: "count=exact",
  };

  if (range) {
    headers.Range = `${range.from}-${range.to}`;
    headers["Range-Unit"] = "items";
  }

  const response = await fetch(buildRestUrl(table, params), {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `READ_ONLY_REST_GET_FAILED:${table}:${response.status}:${responseText.slice(0, 500)}`,
    );
  }

  const payload: unknown = await response.json();
  assert.ok(Array.isArray(payload), `${table} GET response must be an array.`);
  return payload;
}

async function readSingleRow(
  table: string,
  params: Record<string, string>,
  label: string,
): Promise<JsonRecord> {
  const rows = await restGet(table, { ...params, limit: "2" });
  assert.equal(rows.length, 1, `${label} must resolve to exactly one row.`);
  assert.ok(isPlainObject(rows[0]), `${label} must be an object.`);
  return rows[0];
}

async function readReportState(): Promise<ReportState> {
  const row = await readSingleRow(
    "reports",
    {
      select:
        "id,workspace_id,advertiser_id,status,current_ingestion_id,published_ingestion_id",
      id: `eq.${REPORT_ID}`,
    },
    "report",
  );

  return {
    id: asRequiredString(row.id, "report.id"),
    workspaceId: asRequiredString(row.workspace_id, "report.workspace_id"),
    advertiserId: asRequiredString(row.advertiser_id, "report.advertiser_id"),
    status: asNullableString(row.status),
    currentIngestionId: asNullableString(row.current_ingestion_id),
    publishedIngestionId: asNullableString(row.published_ingestion_id),
  };
}

async function readCandidateJobState(): Promise<CandidateJobState> {
  const row = await readSingleRow(
    "media_sync_jobs",
    {
      select:
        "id,report_id,workspace_id,advertiser_id,status,progress,attempt_count,snapshot_ingestion_id,finished_at,error",
      id: `eq.${CANDIDATE_JOB_ID}`,
    },
    "candidate job",
  );

  return {
    id: asRequiredString(row.id, "candidate.id"),
    reportId: asRequiredString(row.report_id, "candidate.report_id"),
    workspaceId: asRequiredString(row.workspace_id, "candidate.workspace_id"),
    advertiserId: asRequiredString(row.advertiser_id, "candidate.advertiser_id"),
    status: asRequiredString(row.status, "candidate.status"),
    progress: asFiniteNumber(row.progress, "candidate.progress"),
    attemptCount: asFiniteNumber(row.attempt_count, "candidate.attempt_count"),
    snapshotIngestionId: asNullableString(row.snapshot_ingestion_id),
    finishedAt: asNullableString(row.finished_at),
    error: asNullableString(row.error),
  };
}

async function readSnapshotDescriptor(
  ingestionId: string,
): Promise<SnapshotDescriptor> {
  const row = await readSingleRow(
    "report_ingestions",
    {
      select: "id,report_id,workspace_id,row_count,status",
      id: `eq.${ingestionId}`,
    },
    `report ingestion ${ingestionId}`,
  );

  return {
    id: asRequiredString(row.id, "report_ingestion.id"),
    reportId: asRequiredString(row.report_id, "report_ingestion.report_id"),
    workspaceId: asRequiredString(row.workspace_id, "report_ingestion.workspace_id"),
    rowCount: asFiniteNumber(row.row_count, "report_ingestion.row_count"),
    status: asNullableString(row.status),
  };
}

async function readActiveJobs(): Promise<JsonRecord[]> {
  const rows = await restGet("media_sync_jobs", {
    select: "id,status,progress,attempt_count",
    report_id: `eq.${REPORT_ID}`,
    status: "in.(pending,processing)",
    order: "created_at.asc",
  });

  return rows.map((row, index) => {
    assert.ok(isPlainObject(row), `activeJobs[${index}] must be an object.`);
    return row;
  });
}

function extractCanonicalRow(record: JsonRecord): JsonRecord {
  const rowObject =
    parseJsonObject(record.row) ??
    parseJsonObject(record.data) ??
    parseJsonObject(record.row_data) ??
    parseJsonObject(record.payload) ??
    {};

  return {
    ...rowObject,
    date: rowObject.date ?? record.date ?? null,
    report_date: rowObject.report_date ?? record.date ?? null,
    channel: rowObject.channel ?? record.channel ?? null,
    device: rowObject.device ?? record.device ?? null,
    source: rowObject.source ?? record.source ?? null,
    ingestion_id: rowObject.ingestion_id ?? record.ingestion_id ?? null,
    row_index: rowObject.row_index ?? record.row_index ?? null,
  };
}

async function readAllSnapshotRows(
  ingestionId: string,
): Promise<{ rows: JsonRecord[]; rowIndexes: number[] }> {
  const allRows: JsonRecord[] = [];
  const rowIndexes: number[] = [];
  let from = 0;

  while (true) {
    const page = await restGet(
      "report_rows",
      {
        select: "ingestion_id,row_index,date,channel,device,source,row",
        report_id: `eq.${REPORT_ID}`,
        ingestion_id: `eq.${ingestionId}`,
        order: "row_index.asc",
      },
      { from, to: from + PAGE_SIZE - 1 },
    );

    if (page.length === 0) break;

    for (let index = 0; index < page.length; index += 1) {
      const raw = page[index];
      assert.ok(isPlainObject(raw), `report_rows[${from + index}] must be an object.`);
      assert.equal(
        asRequiredString(raw.ingestion_id, `report_rows[${from + index}].ingestion_id`),
        ingestionId,
      );

      const rowIndex = asFiniteNumber(
        raw.row_index,
        `report_rows[${from + index}].row_index`,
      );
      assert.ok(
        Number.isInteger(rowIndex) && rowIndex >= 0,
        `report_rows[${from + index}].row_index must be a non-negative integer.`,
      );

      rowIndexes.push(rowIndex);
      allRows.push(extractCanonicalRow(raw));
    }

    if (page.length < PAGE_SIZE) break;
    from += page.length;
  }

  return { rows: allRows, rowIndexes };
}

function readMetric(row: JsonRecord, names: readonly string[]): number {
  const metrics = isPlainObject(row.metrics) ? row.metrics : null;

  for (const name of names) {
    const direct = row[name];
    if (direct !== null && direct !== undefined && String(direct).trim() !== "") {
      return asFiniteNumber(direct, `row.${name}`);
    }

    const nested = metrics?.[name];
    if (nested !== null && nested !== undefined && String(nested).trim() !== "") {
      return asFiniteNumber(nested, `row.metrics.${name}`);
    }
  }

  return 0;
}

function sumMetrics(rows: readonly JsonRecord[]): MetricTotals {
  const totals: MetricTotals = {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
  };

  for (const row of rows) {
    totals.impressions += readMetric(row, [
      "impressions",
      "impression",
      "impr",
      "노출수",
      "노출",
    ]);
    totals.clicks += readMetric(row, ["clicks", "click", "클릭수", "클릭"]);
    totals.cost += readMetric(row, ["cost", "spend", "expense", "비용", "광고비"]);
    totals.conversions += readMetric(row, [
      "conversions",
      "conversion",
      "conv",
      "전환수",
      "전환",
    ]);
    totals.revenue += readMetric(row, [
      "revenue",
      "sales",
      "매출",
      "전환매출",
    ]);
  }

  return totals;
}

function analyzeRowIndexes(rowIndexes: readonly number[]) {
  if (rowIndexes.length === 0) {
    return { first: null, last: null, contiguous: true };
  }

  let contiguous = rowIndexes[0] === 0;
  for (let index = 1; index < rowIndexes.length; index += 1) {
    if (rowIndexes[index] !== rowIndexes[index - 1] + 1) {
      contiguous = false;
      break;
    }
  }

  return {
    first: rowIndexes[0] ?? null,
    last: rowIndexes[rowIndexes.length - 1] ?? null,
    contiguous,
  };
}

async function readSnapshotSummary(ingestionId: string): Promise<SnapshotSummary> {
  const { rows, rowIndexes } = await readAllSnapshotRows(ingestionId);
  const buckets = buildRowLevelBuckets(rows);
  const indexState = analyzeRowIndexes(rowIndexes);

  return {
    ingestionId,
    storedRows: rows.length,
    representativeRows: buckets.representativeRows.length,
    rowLevels: {
      keyword: buckets.keywordRows.length,
      creative: buckets.creativeRows.length,
      mixed: buckets.mixedRows.length,
      unknown: buckets.unknownRows.length,
    },
    metrics: sumMetrics(buckets.representativeRows),
    firstRowIndex: indexState.first,
    lastRowIndex: indexState.last,
    contiguousRowIndexes: indexState.contiguous,
  };
}

function verifyReportState(report: ReportState): void {
  assert.equal(report.id, REPORT_ID);
  assert.equal(report.workspaceId, WORKSPACE_ID);
  assert.equal(report.advertiserId, ADVERTISER_ID);
  assert.equal(report.currentIngestionId, EXPECTED_CURRENT_INGESTION_ID);
  assert.equal(report.publishedIngestionId, EXPECTED_PUBLISHED_INGESTION_ID);
  assert.notEqual(report.currentIngestionId, report.publishedIngestionId);
}

function verifyCandidateJob(candidate: CandidateJobState): void {
  assert.equal(candidate.id, CANDIDATE_JOB_ID);
  assert.equal(candidate.reportId, REPORT_ID);
  assert.equal(candidate.workspaceId, WORKSPACE_ID);
  assert.equal(candidate.advertiserId, ADVERTISER_ID);
  assert.equal(candidate.status, EXPECTED_CANDIDATE_STATUS);
  assert.equal(candidate.progress, EXPECTED_CANDIDATE_PROGRESS);
  assert.equal(candidate.attemptCount, EXPECTED_CANDIDATE_ATTEMPT_COUNT);
  assert.equal(candidate.snapshotIngestionId, EXPECTED_CURRENT_INGESTION_ID);
  assert.equal(candidate.error, null);
  assert.ok(candidate.finishedAt, "candidate.finished_at must be present.");
}

function verifySnapshotDescriptor(
  descriptor: SnapshotDescriptor,
  ingestionId: string,
  expectedRows: number,
): void {
  assert.equal(descriptor.id, ingestionId);
  assert.equal(descriptor.reportId, REPORT_ID);
  assert.equal(descriptor.workspaceId, WORKSPACE_ID);
  assert.equal(descriptor.rowCount, expectedRows);
}

function verifySnapshotSummary(
  summary: SnapshotSummary,
  input: {
    ingestionId: string;
    expectedRows: number;
    expectedMetrics: MetricTotals;
    expectedRowLevels?: SnapshotSummary["rowLevels"];
  },
): void {
  assert.equal(summary.ingestionId, input.ingestionId);
  assert.equal(summary.storedRows, input.expectedRows);
  assert.equal(summary.firstRowIndex, 0);
  assert.equal(summary.lastRowIndex, input.expectedRows - 1);
  assert.equal(summary.contiguousRowIndexes, true);
  if (input.expectedRowLevels) {
    assert.deepEqual(summary.rowLevels, input.expectedRowLevels);
  }
  assert.deepEqual(summary.metrics, input.expectedMetrics);
}

function printSnapshot(label: string, summary: SnapshotSummary): void {
  console.log(`${label} ingestion: ${summary.ingestionId}`);
  console.log(`${label} stored rows: ${summary.storedRows.toLocaleString("en-US")}`);
  console.log(
    `${label} row levels: ${summary.rowLevels.keyword.toLocaleString("en-US")} / ${summary.rowLevels.creative.toLocaleString("en-US")} / ${summary.rowLevels.mixed.toLocaleString("en-US")} / ${summary.rowLevels.unknown.toLocaleString("en-US")}`,
  );
  console.log(
    `${label} representative rows: ${summary.representativeRows.toLocaleString("en-US")}`,
  );
  console.log(
    `${label} KPI: ${summary.metrics.impressions.toLocaleString("en-US")} / ${summary.metrics.clicks.toLocaleString("en-US")} / ${summary.metrics.cost.toLocaleString("en-US")} / ${summary.metrics.conversions.toLocaleString("en-US")} / ${summary.metrics.revenue.toLocaleString("en-US")}`,
  );
  console.log(`${label} row_index contiguous: ${summary.contiguousRowIndexes}`);
}

async function main(): Promise<void> {
  assert.equal(
    process.env.MEDIA_SYNC_WORKER_ENABLED,
    "0",
    "MEDIA_SYNC_WORKER_ENABLED must be exactly 0 during verification.",
  );

  console.log("safety mode: Supabase REST GET only");

  const [reportBefore, candidateBefore, activeJobsBefore] = await Promise.all([
    readReportState(),
    readCandidateJobState(),
    readActiveJobs(),
  ]);

  verifyReportState(reportBefore);
  verifyCandidateJob(candidateBefore);
  assert.equal(activeJobsBefore.length, 0, "An active media sync job exists before verification.");

  const [currentDescriptor, publishedDescriptor] = await Promise.all([
    readSnapshotDescriptor(EXPECTED_CURRENT_INGESTION_ID),
    readSnapshotDescriptor(EXPECTED_PUBLISHED_INGESTION_ID),
  ]);

  verifySnapshotDescriptor(
    currentDescriptor,
    EXPECTED_CURRENT_INGESTION_ID,
    EXPECTED_CURRENT_ROWS,
  );
  verifySnapshotDescriptor(
    publishedDescriptor,
    EXPECTED_PUBLISHED_INGESTION_ID,
    EXPECTED_PUBLISHED_ROWS,
  );

  const currentSummary = await readSnapshotSummary(EXPECTED_CURRENT_INGESTION_ID);
  verifySnapshotSummary(currentSummary, {
    ingestionId: EXPECTED_CURRENT_INGESTION_ID,
    expectedRows: EXPECTED_CURRENT_ROWS,
    expectedMetrics: EXPECTED_CURRENT_KPI,
    expectedRowLevels: EXPECTED_CURRENT_ROW_LEVELS,
  });

  const publishedSummary = await readSnapshotSummary(
    EXPECTED_PUBLISHED_INGESTION_ID,
  );
  verifySnapshotSummary(publishedSummary, {
    ingestionId: EXPECTED_PUBLISHED_INGESTION_ID,
    expectedRows: EXPECTED_PUBLISHED_ROWS,
    expectedMetrics: EXPECTED_PUBLISHED_KPI,
  });

  const [reportAfter, candidateAfter, activeJobsAfter] = await Promise.all([
    readReportState(),
    readCandidateJobState(),
    readActiveJobs(),
  ]);

  verifyReportState(reportAfter);
  verifyCandidateJob(candidateAfter);
  assert.equal(activeJobsAfter.length, 0, "An active media sync job exists after verification.");
  assert.deepEqual(reportAfter, reportBefore, "Report state changed during verification.");
  assert.deepEqual(
    candidateAfter,
    candidateBefore,
    "Candidate job state changed during verification.",
  );

  console.log("report scope exact: true");
  console.log(`current pointer: ${reportAfter.currentIngestionId}`);
  console.log(`published pointer: ${reportAfter.publishedIngestionId}`);
  console.log(
    `candidate lifecycle: ${candidateAfter.status} / ${candidateAfter.progress} / ${candidateAfter.attemptCount} / ${candidateAfter.error ?? "null"}`,
  );
  console.log(
    `active jobs before / after: ${activeJobsBefore.length} / ${activeJobsAfter.length}`,
  );

  printSnapshot("current", currentSummary);
  printSnapshot("published", publishedSummary);

  console.log("pointers unchanged during verification: true");
  console.log("candidate unchanged during verification: true");
  console.log("database writes performed: false");
  console.log("verification passed: true");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("current/published final read-only verification failed:", message);
  process.exitCode = 1;
});