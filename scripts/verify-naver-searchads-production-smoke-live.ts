import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { parseMediaSyncJobRecord } from "../src/lib/media-sync/media-sync-jobs-repository";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const MEDIA_CONNECTIONS_TABLE = "media_connections";
const MEDIA_SYNC_JOBS_TABLE = "media_sync_jobs";
const MEDIA_SYNC_STAGING_ROWS_TABLE = "media_sync_staging_rows";
const REPORTS_TABLE = "reports";
const REPORT_INGESTIONS_TABLE = "report_ingestions";
const REPORT_ROWS_TABLE = "report_rows";

const NAVER_PROVIDER = "naver_searchad" as const;
const ACTIVE_CONNECTION_STATUS = "active" as const;
const DONE_STATUS = "done" as const;
const SUCCESS_STATUS = "success" as const;
const DATABASE_PAGE_SIZE = 1_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

const FORBIDDEN_DIAGNOSTIC_TEXT_PATTERN =
  /secret|token|credential|ciphertext|access\s*license|authorization|password|api[_ -]?key/gi;
const MAX_SAFE_DIAGNOSTIC_TEXT_LENGTH = 1_000;
const MAX_NESTED_CAUSE_DEPTH = 6;

type UnknownRecord = Record<string, unknown>;

type SmokeInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  expectedCurrentIngestionId: string;
  expectedPublishedIngestionId: string | null;
  dateFrom: string;
  dateTo: string;
  expectedRows: number;
  expectedImpressions: number;
  expectedClicks: number;
  expectedCanonicalFingerprint: string;
};

type ReportState = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  currentIngestionId: string;
  publishedIngestionId: string | null;
};

type ConnectionState = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  provider: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

type IngestionState = {
  id: string;
  workspaceId: string;
  reportId: string;
  kind: string;
  status: string;
  rowCount: number;
  error: string | null;
};

type SnapshotRow = {
  id: string;
  report_id: string;
  workspace_id: string;
  advertiser_id: string | null;
  ingestion_id: string | null;
  row_index: number | string;
  date: string | null;
  channel: string | null;
  device: string | null;
  source: string | null;
  row: EtrylueNormalizedMediaRow;
};

type StagingRow = {
  row_index: number | string;
  date: string;
  row_key: string;
  row_fingerprint: string;
  row: EtrylueNormalizedMediaRow;
};

function isPlainObject(value: unknown): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
  maxLength = 500,
): string {
  if (typeof value !== "string") {
    throw new Error(`${argumentName} argument is required.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${argumentName} argument must not be empty.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${argumentName} argument exceeds the maximum length.`);
  }

  return normalized;
}

function normalizeUuidArgument(
  value: unknown,
  argumentName: string,
): string {
  const normalized = normalizeRequiredArgument(
    value,
    argumentName,
    36,
  );

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`SMOKE_INVALID_${argumentName.toUpperCase()}_UUID`);
  }

  return normalized;
}

function normalizeNullableUuidArgument(
  value: unknown,
  argumentName: string,
): string | null {
  const normalized = normalizeRequiredArgument(
    value,
    argumentName,
    36,
  );

  if (normalized.toUpperCase() === "NULL") {
    return null;
  }

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`SMOKE_INVALID_${argumentName.toUpperCase()}_UUID`);
  }

  return normalized;
}

function normalizeNonNegativeIntegerArgument(
  value: unknown,
  argumentName: string,
): number {
  const normalized = normalizeRequiredArgument(
    value,
    argumentName,
    30,
  );
  const numberValue = Number(normalized);

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`SMOKE_INVALID_${argumentName.toUpperCase()}`);
  }

  return numberValue;
}

function readInput(): SmokeInput {
  const [
    reportId,
    connectionId,
    workspaceId,
    advertiserId,
    expectedCurrentIngestionId,
    expectedPublishedIngestionId,
    dateFrom,
    dateTo,
    expectedRows,
    expectedImpressions,
    expectedClicks,
    expectedCanonicalFingerprint,
  ] = process.argv.slice(2);

  const normalizedFingerprint = normalizeRequiredArgument(
    expectedCanonicalFingerprint,
    "expectedCanonicalFingerprint",
    64,
  ).toLowerCase();

  if (!FINGERPRINT_PATTERN.test(normalizedFingerprint)) {
    throw new Error("SMOKE_INVALID_EXPECTED_CANONICAL_FINGERPRINT");
  }

  return {
    reportId: normalizeUuidArgument(reportId, "reportId"),
    connectionId: normalizeUuidArgument(connectionId, "connectionId"),
    workspaceId: normalizeUuidArgument(workspaceId, "workspaceId"),
    advertiserId: normalizeUuidArgument(advertiserId, "advertiserId"),
    expectedCurrentIngestionId: normalizeUuidArgument(
      expectedCurrentIngestionId,
      "expectedCurrentIngestionId",
    ),
    expectedPublishedIngestionId: normalizeNullableUuidArgument(
      expectedPublishedIngestionId,
      "expectedPublishedIngestionId",
    ),
    dateFrom: normalizeRequiredArgument(dateFrom, "dateFrom", 10),
    dateTo: normalizeRequiredArgument(dateTo, "dateTo", 10),
    expectedRows: normalizeNonNegativeIntegerArgument(
      expectedRows,
      "expectedRows",
    ),
    expectedImpressions: normalizeNonNegativeIntegerArgument(
      expectedImpressions,
      "expectedImpressions",
    ),
    expectedClicks: normalizeNonNegativeIntegerArgument(
      expectedClicks,
      "expectedClicks",
    ),
    expectedCanonicalFingerprint: normalizedFingerprint,
  };
}

function readRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`SMOKE_INVALID_${fieldName.toUpperCase()}`);
  }

  return value.trim();
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function readNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`SMOKE_INVALID_${fieldName.toUpperCase()}`);
  }

  return numberValue;
}

function readOptionalNonNegativeMetric(
  value: unknown,
  fieldName: string,
): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`SMOKE_INVALID_${fieldName.toUpperCase()}`);
  }

  return numberValue;
}

function stableJson(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as UnknownRecord;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}

function createCanonicalFingerprint(
  rows: readonly SnapshotRow[],
): string {
  const normalizedRows = rows
    .map((record) => {
      const row = record.row;

      return {
        date:
          readNullableString(record.date) ??
          readNullableString(row.date),
        campaignId: readNullableString(row.external_campaign_id),
        groupId: readNullableString(row.external_group_id),
        keywordId: readNullableString(row.external_keyword_id),
        creativeId: readNullableString(row.external_creative_id),
        rowLevel: readNullableString(row.row_level),
        dataLevel: readNullableString(row.data_level),
        impressions: readOptionalNonNegativeMetric(
          row.impressions,
          "impressions",
        ),
        clicks: readOptionalNonNegativeMetric(
          row.clicks,
          "clicks",
        ),
        cost: readOptionalNonNegativeMetric(row.cost, "cost"),
        conversions: readOptionalNonNegativeMetric(
          row.conversions,
          "conversions",
        ),
        revenue: readOptionalNonNegativeMetric(
          row.revenue,
          "revenue",
        ),
      };
    })
    .sort((left, right) =>
      stableJson(left).localeCompare(stableJson(right)),
    );

  return createHash("sha256")
    .update(stableJson(normalizedRows), "utf8")
    .digest("hex");
}

async function readReportState(input: SmokeInput): Promise<ReportState> {
  const { data, error } = await getSupabaseAdmin()
    .from(REPORTS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, current_ingestion_id, published_ingestion_id",
    )
    .eq("id", input.reportId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("SMOKE_REPORT_READ_FAILED", {
      cause: error ?? undefined,
    });
  }

  return {
    id: readRequiredString(data.id, "report_id"),
    workspaceId: readRequiredString(
      data.workspace_id,
      "report_workspace_id",
    ),
    advertiserId: readRequiredString(
      data.advertiser_id,
      "report_advertiser_id",
    ),
    currentIngestionId: readRequiredString(
      data.current_ingestion_id,
      "report_current_ingestion_id",
    ),
    publishedIngestionId: readNullableString(
      data.published_ingestion_id,
    ),
  };
}

async function readConnectionState(
  input: SmokeInput,
): Promise<ConnectionState> {
  const { data, error } = await getSupabaseAdmin()
    .from(MEDIA_CONNECTIONS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, provider, status, last_sync_at, last_error",
    )
    .eq("id", input.connectionId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("SMOKE_CONNECTION_READ_FAILED", {
      cause: error ?? undefined,
    });
  }

  return {
    id: readRequiredString(data.id, "connection_id"),
    workspaceId: readRequiredString(
      data.workspace_id,
      "connection_workspace_id",
    ),
    advertiserId: readRequiredString(
      data.advertiser_id,
      "connection_advertiser_id",
    ),
    provider: readRequiredString(data.provider, "connection_provider"),
    status: readRequiredString(data.status, "connection_status"),
    lastSyncAt: readNullableString(data.last_sync_at),
    lastError: readNullableString(data.last_error),
  };
}

async function readIngestionState(
  input: SmokeInput,
): Promise<IngestionState> {
  const { data, error } = await getSupabaseAdmin()
    .from(REPORT_INGESTIONS_TABLE)
    .select(
      "id, workspace_id, report_id, kind, status, row_count, error",
    )
    .eq("id", input.expectedCurrentIngestionId)
    .eq("report_id", input.reportId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("SMOKE_CURRENT_INGESTION_READ_FAILED", {
      cause: error ?? undefined,
    });
  }

  return {
    id: readRequiredString(data.id, "ingestion_id"),
    workspaceId: readRequiredString(
      data.workspace_id,
      "ingestion_workspace_id",
    ),
    reportId: readRequiredString(data.report_id, "ingestion_report_id"),
    kind: readRequiredString(data.kind, "ingestion_kind"),
    status: readRequiredString(data.status, "ingestion_status"),
    rowCount: readNonNegativeInteger(
      data.row_count,
      "ingestion_row_count",
    ),
    error: readNullableString(data.error),
  };
}

async function readLinkedDoneJob(
  input: SmokeInput,
): Promise<MediaSyncJobRecord> {
  const { data, error } = await getSupabaseAdmin()
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("*")
    .eq("report_id", input.reportId)
    .eq("connection_id", input.connectionId)
    .eq("snapshot_ingestion_id", input.expectedCurrentIngestionId)
    .eq("status", DONE_STATUS)
    .order("finished_at", { ascending: false })
    .limit(2);

  if (error || !Array.isArray(data)) {
    throw new Error("SMOKE_LINKED_JOB_READ_FAILED", {
      cause: error ?? undefined,
    });
  }

  if (data.length !== 1) {
    throw new Error("SMOKE_LINKED_DONE_JOB_COUNT_MISMATCH");
  }

  return parseMediaSyncJobRecord(data[0]);
}

async function readActiveJobCount(reportId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId)
    .in("status", ["pending", "processing"]);

  if (error) {
    throw new Error("SMOKE_ACTIVE_JOB_COUNT_FAILED", { cause: error });
  }

  return count ?? 0;
}

async function readSnapshotRows(
  input: SmokeInput,
): Promise<SnapshotRow[]> {
  const rows: SnapshotRow[] = [];

  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    const { data, error } = await getSupabaseAdmin()
      .from(REPORT_ROWS_TABLE)
      .select(
        [
          "id",
          "report_id",
          "workspace_id",
          "advertiser_id",
          "ingestion_id",
          "row_index",
          "date",
          "channel",
          "device",
          "source",
          "row",
        ].join(", "),
      )
      .eq("report_id", input.reportId)
      .eq("workspace_id", input.workspaceId)
      .eq("ingestion_id", input.expectedCurrentIngestionId)
      .order("row_index", { ascending: true })
      .range(offset, offset + DATABASE_PAGE_SIZE - 1);

    if (error || !Array.isArray(data)) {
      throw new Error("SMOKE_CURRENT_ROWS_READ_FAILED", {
        cause: error ?? undefined,
      });
    }

    rows.push(...(data as unknown as SnapshotRow[]));

    if (data.length < DATABASE_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function readStagingRows(jobId: string): Promise<StagingRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
    .select("row_index, date, row_key, row_fingerprint, row")
    .eq("job_id", jobId)
    .order("row_index", { ascending: true });

  if (error || !Array.isArray(data)) {
    throw new Error("SMOKE_STAGING_ROWS_READ_FAILED", {
      cause: error ?? undefined,
    });
  }

  return data as unknown as StagingRow[];
}

function assertRows(
  rows: readonly SnapshotRow[],
  input: SmokeInput,
): { impressions: number; clicks: number; canonicalFingerprint: string } {
  assert.equal(rows.length, input.expectedRows);

  let impressions = 0;
  let clicks = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const record = rows[index];
    assert.ok(record);
    assert.equal(readNonNegativeInteger(record.row_index, "row_index"), index);
    assert.equal(record.report_id, input.reportId);
    assert.equal(record.workspace_id, input.workspaceId);
    assert.equal(record.advertiser_id, input.advertiserId);
    assert.equal(record.ingestion_id, input.expectedCurrentIngestionId);

    const date = readNullableString(record.date) ?? record.row.date;
    assert.ok(date >= input.dateFrom && date <= input.dateTo);
    assert.equal(record.row.date, date);
    assert.equal(record.row.channel, record.channel);
    assert.equal(record.row.device, record.device);
    assert.equal(record.row.source, record.source);
    assert.equal(record.row.provider, NAVER_PROVIDER);
    assert.equal(record.row.ingestion_source, "api");

    impressions += readOptionalNonNegativeMetric(
      record.row.impressions,
      "row_impressions",
    );
    clicks += readOptionalNonNegativeMetric(
      record.row.clicks,
      "row_clicks",
    );
  }

  const canonicalFingerprint = createCanonicalFingerprint(rows);

  assert.equal(impressions, input.expectedImpressions);
  assert.equal(clicks, input.expectedClicks);
  assert.equal(
    canonicalFingerprint,
    input.expectedCanonicalFingerprint,
  );

  return { impressions, clicks, canonicalFingerprint };
}

function assertStagingRows(
  rows: readonly StagingRow[],
  input: SmokeInput,
): void {
  assert.equal(rows.length, input.expectedRows);

  const rowKeys = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const record = rows[index];
    assert.ok(record);
    assert.equal(readNonNegativeInteger(record.row_index, "staging_row_index"), index);
    assert.ok(record.date >= input.dateFrom && record.date <= input.dateTo);
    assert.ok(typeof record.row_key === "string" && record.row_key.trim());
    assert.ok(FINGERPRINT_PATTERN.test(record.row_fingerprint));
    assert.equal(rowKeys.has(record.row_key), false);
    rowKeys.add(record.row_key);
    assert.equal(record.row.provider, NAVER_PROVIDER);
    assert.equal(record.row.ingestion_source, "api");
  }
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(FORBIDDEN_DIAGNOSTIC_TEXT_PATTERN, "[redacted]")
    .slice(0, MAX_SAFE_DIAGNOSTIC_TEXT_LENGTH);
}

function readSafeErrorDiagnostic(error: unknown): UnknownRecord {
  if (error instanceof Error) {
    const record = error as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
    };

    return {
      name: sanitizeDiagnosticText(error.name),
      code:
        typeof record.code === "string"
          ? sanitizeDiagnosticText(record.code)
          : null,
      message: sanitizeDiagnosticText(error.message),
      details:
        typeof record.details === "string"
          ? sanitizeDiagnosticText(record.details)
          : null,
      hint:
        typeof record.hint === "string"
          ? sanitizeDiagnosticText(record.hint)
          : null,
      status:
        typeof record.status === "number" ||
        typeof record.status === "string"
          ? record.status
          : null,
    };
  }

  return {
    name: "UnknownError",
    message: sanitizeDiagnosticText(String(error)),
  };
}

function readSafeErrorChain(error: unknown): UnknownRecord[] {
  const diagnostics: UnknownRecord[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;

  for (
    let depth = 0;
    current && depth < MAX_NESTED_CAUSE_DEPTH;
    depth += 1
  ) {
    if (visited.has(current)) {
      break;
    }

    visited.add(current);
    diagnostics.push(readSafeErrorDiagnostic(current));

    current =
      current instanceof Error
        ? current.cause
        : isPlainObject(current)
          ? current.cause
          : null;
  }

  return diagnostics;
}

async function main(): Promise<void> {
  const input = readInput();

  console.log("PRODUCTION SMOKE TEST: Naver Search Ads");
  console.log("read-only:", true);
  console.log("report:", input.reportId);
  console.log("expected current ingestion:", input.expectedCurrentIngestionId);
  console.log(
    "expected rows / impressions / clicks:",
    `${input.expectedRows} / ${input.expectedImpressions} / ${input.expectedClicks}`,
  );

  try {
    const reportBefore = await readReportState(input);
    const connection = await readConnectionState(input);
    const ingestion = await readIngestionState(input);
    const linkedJob = await readLinkedDoneJob(input);
    const activeJobCount = await readActiveJobCount(input.reportId);
    const snapshotRows = await readSnapshotRows(input);
    const stagingRows = await readStagingRows(linkedJob.id);

    assert.equal(reportBefore.id, input.reportId);
    assert.equal(reportBefore.workspaceId, input.workspaceId);
    assert.equal(reportBefore.advertiserId, input.advertiserId);
    assert.equal(
      reportBefore.currentIngestionId,
      input.expectedCurrentIngestionId,
    );
    assert.equal(
      reportBefore.publishedIngestionId,
      input.expectedPublishedIngestionId,
    );

    assert.equal(connection.id, input.connectionId);
    assert.equal(connection.workspaceId, input.workspaceId);
    assert.equal(connection.advertiserId, input.advertiserId);
    assert.equal(connection.provider, NAVER_PROVIDER);
    assert.equal(connection.status, ACTIVE_CONNECTION_STATUS);
    assert.ok(connection.lastSyncAt);
    assert.equal(connection.lastError, null);

    assert.equal(ingestion.id, input.expectedCurrentIngestionId);
    assert.equal(ingestion.workspaceId, input.workspaceId);
    assert.equal(ingestion.reportId, input.reportId);
    assert.equal(ingestion.kind, "api");
    assert.equal(ingestion.status, SUCCESS_STATUS);
    assert.equal(ingestion.rowCount, input.expectedRows);
    assert.equal(ingestion.error, null);

    assert.equal(linkedJob.workspace_id, input.workspaceId);
    assert.equal(linkedJob.advertiser_id, input.advertiserId);
    assert.equal(linkedJob.report_id, input.reportId);
    assert.equal(linkedJob.connection_id, input.connectionId);
    assert.equal(linkedJob.provider, NAVER_PROVIDER);
    assert.equal(linkedJob.date_from, input.dateFrom);
    assert.equal(linkedJob.date_to, input.dateTo);
    assert.equal(linkedJob.status, DONE_STATUS);
    assert.equal(linkedJob.progress, 100);
    assert.equal(linkedJob.normalized_rows, input.expectedRows);
    assert.equal(linkedJob.inserted_rows, input.expectedRows);
    assert.equal(linkedJob.failed_rows, 0);
    assert.equal(
      linkedJob.snapshot_ingestion_id,
      input.expectedCurrentIngestionId,
    );
    assert.ok(linkedJob.finished_at);
    assert.equal(linkedJob.error, null);

    assert.equal(activeJobCount, 0);

    const rowSummary = assertRows(snapshotRows, input);
    assertStagingRows(stagingRows, input);

    const reportAfter = await readReportState(input);
    assert.deepEqual(reportAfter, reportBefore);

    console.log("report scope matches:", true);
    console.log("current_ingestion_id matches:", true);
    console.log("published_ingestion_id preserved:", true);
    console.log("current ingestion success / row_count:", `${ingestion.status} / ${ingestion.rowCount}`);
    console.log("linked job status / progress:", `${linkedJob.status} / ${linkedJob.progress}`);
    console.log("linked job snapshot matches current:", true);
    console.log("active report jobs:", activeJobCount);
    console.log("snapshot row indexes contiguous:", true);
    console.log("snapshot rows / impressions / clicks:", `${snapshotRows.length} / ${rowSummary.impressions} / ${rowSummary.clicks}`);
    console.log("canonical fingerprint matches:", true);
    console.log("staging rows retained and valid:", stagingRows.length);
    console.log("connection active / last_sync_at present:", true);
    console.log("report pointers stable during smoke test:", true);
    console.log("production smoke test passed:", true);
  } catch (error) {
    console.error(
      "production smoke test failed:",
      JSON.stringify(readSafeErrorChain(error)),
    );
    console.log("production smoke test passed:", false);
    process.exitCode = 1;
  }
}

void main();
