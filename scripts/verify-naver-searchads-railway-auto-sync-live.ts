import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  decryptNaverSearchAdsConnection,
} from "../src/lib/media-sync/media-connections-repository";
import {
  createPendingMediaSyncJob,
  parseMediaSyncJobRecord,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  resolveNaverExternalProductCollectionPolicy,
  resolveNaverSearchAdsCampaignCollectionContract,
  NaverSearchAdsAuthoritativeGrainError,
  type NaverSearchAdsCampaignCollectionContract,
} from "../src/lib/media-sync/naver-searchads-authoritative-grain";
import {
  fetchNaverSearchAdsCampaignPage,
  NaverSearchAdsApiError,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const MEDIA_CONNECTIONS_TABLE = "media_connections";
const MEDIA_SYNC_JOBS_TABLE = "media_sync_jobs";
const REPORTS_TABLE = "reports";
const REPORT_INGESTIONS_TABLE = "report_ingestions";
const REPORT_ROWS_TABLE = "report_rows";

const NAVER_PROVIDER = "naver_searchad" as const;
const ACTIVE_CONNECTION_STATUS = "active" as const;
const ACTIVE_JOB_STATUSES = ["pending", "processing"] as const;
const TERMINAL_JOB_STATUSES = ["done", "failed", "cancelled"] as const;

const REQUEST_INTERVAL_MS = 1_000;
const MAX_RETRY_COUNT = 3;
const CAMPAIGN_PAGE_SIZE = 1_000;
const MAX_CAMPAIGN_PAGES = 100;
const DATABASE_PAGE_SIZE = 1_000;

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 60 * 60 * 1_000;

const REQUIRED_CAMPAIGN_TYPES = [
  "SHOPPING",
  "BRAND_SEARCH",
  "WEB_SITE",
] as const;

const KNOWN_PARITY_CAMPAIGNS = [
  {
    key: "shopping_mobile",
    displayName: "Shopping MO",
    campaignId: "cmp-a001-02-000000010549559",
    campaignType: "SHOPPING",
    expectedImpressions: 3_257,
    expectedClicks: 83,
  },
  {
    key: "brand_search",
    displayName: "브랜드검색",
    campaignId: "cmp-a001-04-000000005653958",
    campaignType: "BRAND_SEARCH",
    expectedImpressions: 2_742,
    expectedClicks: 1_098,
  },
  {
    key: "shopping_pc",
    displayName: "Shopping PC",
    campaignId: "cmp-a001-02-000000010549606",
    campaignType: "SHOPPING",
    expectedImpressions: 1_076,
    expectedClicks: 2,
  },
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UnknownRecord = Record<string, unknown>;

type ObserverInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
};

type ReportState = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
};

type ConnectionState = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  provider: string;
  status: string;
  externalAccountId: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

type CampaignPreflight = {
  allCampaigns: NaverSearchAdsCampaignRecord[];
  supportedCampaigns: NaverSearchAdsCampaignRecord[];
  unsupportedCampaigns: NaverSearchAdsCampaignRecord[];
  contractsByCampaignId: Map<
    string,
    NaverSearchAdsCampaignCollectionContract
  >;
};

type SnapshotRow = {
  id: string;
  report_id: string;
  workspace_id: string;
  advertiser_id: string | null;
  ingestion_id: string | null;
  row_index: number | string;
  date: string | null;
  row: EtrylueNormalizedMediaRow;
};

type MetricTotal = {
  rows: number;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

type CampaignCoverage = MetricTotal & {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  canonicalRowLevel: string;
  rowLevels: Set<string>;
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
    throw new Error(
      `RAILWAY_AUTO_SYNC_INVALID_${argumentName.toUpperCase()}_UUID`,
    );
  }

  return normalized;
}

function normalizeYmdArgument(
  value: unknown,
  argumentName: string,
): string {
  const normalized = normalizeRequiredArgument(
    value,
    argumentName,
    10,
  );

  const matched = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!matched) {
    throw new Error(
      `RAILWAY_AUTO_SYNC_INVALID_${argumentName.toUpperCase()}`,
    );
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error(
      `RAILWAY_AUTO_SYNC_INVALID_${argumentName.toUpperCase()}`,
    );
  }

  return normalized;
}

function readInput(): ObserverInput {
  const [
    reportId,
    connectionId,
    workspaceId,
    advertiserId,
    createdBy,
    dateFrom,
    dateTo,
  ] = process.argv.slice(2);

  const normalizedDateFrom =
    normalizeYmdArgument(dateFrom, "dateFrom");
  const normalizedDateTo =
    normalizeYmdArgument(dateTo, "dateTo");

  if (normalizedDateFrom > normalizedDateTo) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_INVALID_DATE_RANGE",
    );
  }

  return {
    reportId:
      normalizeUuidArgument(reportId, "reportId"),
    connectionId:
      normalizeUuidArgument(connectionId, "connectionId"),
    workspaceId:
      normalizeUuidArgument(workspaceId, "workspaceId"),
    advertiserId:
      normalizeUuidArgument(advertiserId, "advertiserId"),
    createdBy:
      normalizeUuidArgument(createdBy, "createdBy"),
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
  };
}

function readRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      `RAILWAY_AUTO_SYNC_INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return value.trim();
}

function readNullableString(
  value: unknown,
): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function readNonNegativeNumber(
  value: unknown,
  fieldName: string,
): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(
      `RAILWAY_AUTO_SYNC_INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return numeric;
}

function readRowIndex(value: unknown): number {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_INVALID_ROW_INDEX",
    );
  }

  return numeric;
}

function emptyMetricTotal(): MetricTotal {
  return {
    rows: 0,
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
  };
}

function addRowMetrics(
  total: MetricTotal,
  row: EtrylueNormalizedMediaRow,
): void {
  total.rows += 1;
  total.impressions +=
    readNonNegativeNumber(row.impressions, "impressions");
  total.clicks +=
    readNonNegativeNumber(row.clicks, "clicks");
  total.cost +=
    readNonNegativeNumber(row.cost, "cost");
  total.conversions +=
    readNonNegativeNumber(row.conversions, "conversions");
  total.revenue +=
    readNonNegativeNumber(row.revenue, "revenue");
}

function shouldRetryApiError(
  error: NaverSearchAdsApiError,
): boolean {
  return (
    error.code === "NETWORK_ERROR" ||
    error.code === "REQUEST_TIMEOUT" ||
    error.status === 429 ||
    (
      typeof error.status === "number" &&
      error.status >= 500 &&
      error.status <= 599
    )
  );
}

async function fetchCampaignPageWithRetry(
  input: Parameters<
    typeof fetchNaverSearchAdsCampaignPage
  >[0],
): Promise<
  NaverSearchAdsListPage<NaverSearchAdsCampaignRecord>
> {
  let retryCount = 0;

  while (true) {
    try {
      return await fetchNaverSearchAdsCampaignPage(input);
    } catch (error) {
      if (
        !(error instanceof NaverSearchAdsApiError) ||
        !shouldRetryApiError(error) ||
        retryCount >= MAX_RETRY_COUNT
      ) {
        throw error;
      }

      retryCount += 1;
      const delayMs =
        REQUEST_INTERVAL_MS *
        2 ** (retryCount - 1);

      console.log(
        "campaign preflight retry:",
        JSON.stringify({
          retryCount,
          delayMs,
          status: error.status,
          code: error.code,
        }),
      );

      await delay(delayMs);
    }
  }
}

async function fetchAllCampaigns(
  credentials: Awaited<
    ReturnType<
      typeof decryptNaverSearchAdsConnection
    >
  >["credentials"],
): Promise<NaverSearchAdsCampaignRecord[]> {
  const campaigns: NaverSearchAdsCampaignRecord[] = [];
  const seenIds = new Set<string>();
  let baseSearchId: string | null = null;

  for (
    let pageNumber = 1;
    pageNumber <= MAX_CAMPAIGN_PAGES;
    pageNumber += 1
  ) {
    const page =
      await fetchCampaignPageWithRetry({
        credentials,
        recordSize: CAMPAIGN_PAGE_SIZE,
        selector: "NEXT",
        baseSearchId,
      });

    for (const campaign of page.records) {
      if (seenIds.has(campaign.id)) {
        throw new Error(
          "RAILWAY_AUTO_SYNC_DUPLICATE_CAMPAIGN_DISCOVERY",
        );
      }

      seenIds.add(campaign.id);
      campaigns.push(campaign);
    }

    if (page.records.length < CAMPAIGN_PAGE_SIZE) {
      return campaigns;
    }

    if (
      !page.nextBaseSearchId ||
      page.nextBaseSearchId === baseSearchId
    ) {
      throw new Error(
        "RAILWAY_AUTO_SYNC_INVALID_CAMPAIGN_PAGINATION",
      );
    }

    baseSearchId = page.nextBaseSearchId;
    await delay(REQUEST_INTERVAL_MS);
  }

  throw new Error(
    "RAILWAY_AUTO_SYNC_CAMPAIGN_PAGE_LIMIT_EXCEEDED",
  );
}

function buildCampaignPreflight(
  campaigns:
    readonly NaverSearchAdsCampaignRecord[],
): CampaignPreflight {
  const supportedCampaigns:
    NaverSearchAdsCampaignRecord[] = [];
  const unsupportedCampaigns:
    NaverSearchAdsCampaignRecord[] = [];
  const contractsByCampaignId =
    new Map<
      string,
      NaverSearchAdsCampaignCollectionContract
    >();

  const advoostPolicy =
    resolveNaverExternalProductCollectionPolicy(
      "ADVOOST",
    );
  const advoostShoppingPolicy =
    resolveNaverExternalProductCollectionPolicy(
      "ADVOOST_SHOPPING",
    );

  assert.equal(advoostPolicy.status, "excluded");
  assert.equal(advoostShoppingPolicy.status, "excluded");

  for (const campaign of campaigns) {
    const normalizedType =
      String(campaign.campaignType ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    if (
      normalizedType === "ADVOOST" ||
      normalizedType === "ADVOOST_SHOPPING"
    ) {
      continue;
    }

    try {
      const contract =
        resolveNaverSearchAdsCampaignCollectionContract(
          campaign.campaignType,
        );

      supportedCampaigns.push(campaign);
      contractsByCampaignId.set(
        campaign.id,
        contract,
      );
    } catch (error) {
      if (
        error instanceof
          NaverSearchAdsAuthoritativeGrainError &&
        error.code === "UNSUPPORTED_CAMPAIGN_TYPE"
      ) {
        unsupportedCampaigns.push(campaign);
        continue;
      }

      throw error;
    }
  }

  return {
    allCampaigns: [...campaigns],
    supportedCampaigns,
    unsupportedCampaigns,
    contractsByCampaignId,
  };
}

async function readReportState(
  input: ObserverInput,
): Promise<ReportState> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, current_ingestion_id, published_ingestion_id",
    )
    .eq("id", input.reportId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_REPORT_READ_FAILED",
      { cause: error ?? undefined },
    );
  }

  const state: ReportState = {
    reportId:
      readRequiredString(data.id, "report_id"),
    workspaceId:
      readRequiredString(
        data.workspace_id,
        "report_workspace_id",
      ),
    advertiserId:
      readRequiredString(
        data.advertiser_id,
        "report_advertiser_id",
      ),
    currentIngestionId:
      readNullableString(
        data.current_ingestion_id,
      ),
    publishedIngestionId:
      readNullableString(
        data.published_ingestion_id,
      ),
  };

  assert.equal(state.reportId, input.reportId);
  assert.equal(state.workspaceId, input.workspaceId);
  assert.equal(state.advertiserId, input.advertiserId);

  return state;
}

async function readConnectionState(
  input: ObserverInput,
): Promise<ConnectionState> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, provider, status, external_account_id, last_sync_at, last_error",
    )
    .eq("id", input.connectionId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_CONNECTION_READ_FAILED",
      { cause: error ?? undefined },
    );
  }

  const state: ConnectionState = {
    connectionId:
      readRequiredString(
        data.id,
        "connection_id",
      ),
    workspaceId:
      readRequiredString(
        data.workspace_id,
        "connection_workspace_id",
      ),
    advertiserId:
      readRequiredString(
        data.advertiser_id,
        "connection_advertiser_id",
      ),
    provider:
      readRequiredString(
        data.provider,
        "connection_provider",
      ),
    status:
      readRequiredString(
        data.status,
        "connection_status",
      ),
    externalAccountId:
      readRequiredString(
        data.external_account_id,
        "connection_external_account_id",
      ),
    lastSyncAt:
      readNullableString(data.last_sync_at),
    lastError:
      readNullableString(data.last_error),
  };

  assert.equal(
    state.connectionId,
    input.connectionId,
  );
  assert.equal(
    state.workspaceId,
    input.workspaceId,
  );
  assert.equal(
    state.advertiserId,
    input.advertiserId,
  );
  assert.equal(state.provider, NAVER_PROVIDER);
  assert.equal(
    state.status,
    ACTIVE_CONNECTION_STATUS,
  );

  return state;
}

async function assertNoActiveJob(
  reportId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id, status")
    .eq("report_id", reportId)
    .in("status", [...ACTIVE_JOB_STATUSES])
    .limit(1);

  if (error) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_ACTIVE_JOB_CHECK_FAILED",
      { cause: error },
    );
  }

  if (Array.isArray(data) && data.length > 0) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_ACTIVE_JOB_ALREADY_EXISTS",
    );
  }
}

async function readJob(
  jobId: string,
): Promise<MediaSyncJobRecord> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_JOB_READ_FAILED",
      { cause: error ?? undefined },
    );
  }

  return parseMediaSyncJobRecord(data);
}

function readCheckpointPhase(
  job: MediaSyncJobRecord,
): string | null {
  const detail = job.error_detail;

  if (!detail || !isPlainObject(detail)) {
    return null;
  }

  const checkpoint =
    detail.processing_checkpoint;

  if (!isPlainObject(checkpoint)) {
    return null;
  }

  return typeof checkpoint.phase === "string"
    ? checkpoint.phase
    : null;
}

async function waitForRailwayCompletion(
  jobId: string,
): Promise<{
  finalJob: MediaSyncJobRecord;
  observedPending: boolean;
  observedProcessing: boolean;
  observedAttemptCounts: number[];
}> {
  const startedAt = Date.now();
  let observedPending = false;
  let observedProcessing = false;
  const observedAttemptCounts = new Set<number>();
  let previousSignature = "";

  while (true) {
    const job = await readJob(jobId);
    const phase = readCheckpointPhase(job);
    const signature = [
      job.status,
      job.progress,
      job.attempt_count,
      job.inserted_rows,
      phase ?? "none",
    ].join(":");

    observedPending ||= job.status === "pending";
    observedProcessing ||= job.status === "processing";
    observedAttemptCounts.add(job.attempt_count);

    if (signature !== previousSignature) {
      console.log(
        "Railway job observation:",
        JSON.stringify({
          status: job.status,
          progress: job.progress,
          attemptCount: job.attempt_count,
          insertedRows: job.inserted_rows,
          failedRows: job.failed_rows,
          checkpointPhase: phase,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
        }),
      );

      previousSignature = signature;
    }

    if (
      TERMINAL_JOB_STATUSES.includes(
        job.status as
          (typeof TERMINAL_JOB_STATUSES)[number],
      )
    ) {
      return {
        finalJob: job,
        observedPending,
        observedProcessing:
          observedProcessing ||
          job.started_at !== null,
        observedAttemptCounts:
          [...observedAttemptCounts].sort(
            (left, right) => left - right,
          ),
      };
    }

    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(
        "RAILWAY_AUTO_SYNC_WAIT_TIMEOUT",
      );
    }

    await delay(POLL_INTERVAL_MS);
  }
}

async function readSnapshotRows(
  input: ObserverInput,
  ingestionId: string,
): Promise<SnapshotRow[]> {
  const supabase = getSupabaseAdmin();
  const rows: SnapshotRow[] = [];

  for (
    let offset = 0;
    ;
    offset += DATABASE_PAGE_SIZE
  ) {
    const { data, error } = await supabase
      .from(REPORT_ROWS_TABLE)
      .select(
        "id, report_id, workspace_id, advertiser_id, ingestion_id, row_index, date, row",
      )
      .eq("report_id", input.reportId)
      .eq("ingestion_id", ingestionId)
      .order("row_index", { ascending: true })
      .range(
        offset,
        offset + DATABASE_PAGE_SIZE - 1,
      );

    if (error || !Array.isArray(data)) {
      throw new Error(
        "RAILWAY_AUTO_SYNC_SNAPSHOT_ROWS_READ_FAILED",
        { cause: error ?? undefined },
      );
    }

    rows.push(
      ...(data as unknown as SnapshotRow[]),
    );

    if (data.length < DATABASE_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function readIngestionRowCount(
  reportId: string,
  ingestionId: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(REPORT_INGESTIONS_TABLE)
    .select(
      "id, report_id, status, row_count",
    )
    .eq("id", ingestionId)
    .eq("report_id", reportId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_INGESTION_READ_FAILED",
      { cause: error ?? undefined },
    );
  }

  assert.equal(
    readRequiredString(
      data.status,
      "ingestion_status",
    ),
    "success",
  );

  const rowCount = Number(data.row_count);

  if (
    !Number.isSafeInteger(rowCount) ||
    rowCount < 0
  ) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_INVALID_INGESTION_ROW_COUNT",
    );
  }

  return rowCount;
}

function buildCoverage(
  rows: readonly SnapshotRow[],
  preflight: CampaignPreflight,
  input: ObserverInput,
): {
  total: MetricTotal;
  byType: Map<string, MetricTotal>;
  byCampaign: Map<string, CampaignCoverage>;
  rowIndexesContiguous: boolean;
  allRowsInDateRange: boolean;
  allRowsMatchContracts: boolean;
} {
  const total = emptyMetricTotal();
  const byType = new Map<string, MetricTotal>();
  const byCampaign =
    new Map<string, CampaignCoverage>();

  let rowIndexesContiguous = true;
  let allRowsInDateRange = true;
  let allRowsMatchContracts = true;

  rows.forEach((record, index) => {
    const rowIndex =
      readRowIndex(record.row_index);

    if (rowIndex !== index) {
      rowIndexesContiguous = false;
    }

    const row = record.row;
    const campaignId =
      readRequiredString(
        row.external_campaign_id,
        "external_campaign_id",
      );
    const contract =
      preflight.contractsByCampaignId.get(
        campaignId,
      );

    if (!contract) {
      allRowsMatchContracts = false;
      throw new Error(
        `RAILWAY_AUTO_SYNC_ROW_CAMPAIGN_CONTRACT_MISSING:${campaignId}`,
      );
    }

    const campaign =
      preflight.supportedCampaigns.find(
        (item) => item.id === campaignId,
      );

    if (!campaign) {
      throw new Error(
        `RAILWAY_AUTO_SYNC_ROW_CAMPAIGN_DISCOVERY_MISSING:${campaignId}`,
      );
    }

    if (
      row.row_level !==
        contract.canonicalRowLevel ||
      row.data_level !==
        contract.canonicalDataLevel ||
      row.row_level_reason !==
        contract.rowLevelReason
    ) {
      allRowsMatchContracts = false;
    }

    if (
      row.date < input.dateFrom ||
      row.date > input.dateTo
    ) {
      allRowsInDateRange = false;
    }

    addRowMetrics(total, row);

    const typeTotal =
      byType.get(contract.campaignType) ??
      emptyMetricTotal();
    addRowMetrics(typeTotal, row);
    byType.set(
      contract.campaignType,
      typeTotal,
    );

    const campaignCoverage =
      byCampaign.get(campaignId) ?? {
        ...emptyMetricTotal(),
        campaignId,
        campaignName:
          campaign.id,
        campaignType:
          contract.campaignType,
        canonicalRowLevel:
          contract.canonicalRowLevel,
        rowLevels: new Set<string>(),
      };

    addRowMetrics(campaignCoverage, row);
    campaignCoverage.rowLevels.add(
      String(row.row_level),
    );
    byCampaign.set(
      campaignId,
      campaignCoverage,
    );
  });

  return {
    total,
    byType,
    byCampaign,
    rowIndexesContiguous,
    allRowsInDateRange,
    allRowsMatchContracts,
  };
}

function printCoverage(
  coverage: ReturnType<typeof buildCoverage>,
  preflight: CampaignPreflight,
): void {
  const discoveredByType =
    new Map<string, number>();

  for (
    const campaign of
    preflight.supportedCampaigns
  ) {
    const contract =
      preflight.contractsByCampaignId.get(
        campaign.id,
      );

    if (!contract) {
      continue;
    }

    discoveredByType.set(
      contract.campaignType,
      (
        discoveredByType.get(
          contract.campaignType,
        ) ?? 0
      ) + 1,
    );
  }

  for (
    const campaignType of
    REQUIRED_CAMPAIGN_TYPES
  ) {
    const totals =
      coverage.byType.get(
        campaignType,
      ) ?? emptyMetricTotal();

    console.log(
      `campaign type ${campaignType}:`,
      JSON.stringify({
        discoveredCampaigns:
          discoveredByType.get(
            campaignType,
          ) ?? 0,
        rows: totals.rows,
        impressions: totals.impressions,
        clicks: totals.clicks,
        cost: totals.cost,
        conversions: totals.conversions,
        revenue: totals.revenue,
      }),
    );
  }

  console.log(
    "campaign coverage details:",
    JSON.stringify(
      [...coverage.byCampaign.values()]
        .sort(
          (left, right) =>
            left.campaignType
              .localeCompare(
                right.campaignType,
              ) ||
            left.campaignName
              .localeCompare(
                right.campaignName,
              ),
        )
        .map((item) => ({
          campaignId: item.campaignId,
          campaignName: item.campaignName,
          campaignType: item.campaignType,
          canonicalRowLevel:
            item.canonicalRowLevel,
          rowLevels:
            [...item.rowLevels].sort(),
          rows: item.rows,
          impressions: item.impressions,
          clicks: item.clicks,
          cost: item.cost,
          conversions: item.conversions,
          revenue: item.revenue,
        })),
    ),
  );
}

async function main(): Promise<void> {
  const input = readInput();
  console.log(
    "RAILWAY AUTO SYNC LIVE OBSERVER: Naver Search Ads",
  );
  console.log("local worker calls: 0");
  console.log(
    "date range:",
    `${input.dateFrom} ~ ${input.dateTo}`,
  );

  const reportBefore =
    await readReportState(input);
  const connectionBefore =
    await readConnectionState(input);

  await assertNoActiveJob(input.reportId);

  const decrypted =
    await decryptNaverSearchAdsConnection({
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      advertiserId: input.advertiserId,
    });

  assert.equal(
    decrypted.credentials.customerId,
    connectionBefore.externalAccountId,
  );

  const campaigns =
    await fetchAllCampaigns(
      decrypted.credentials,
    );
  const preflight =
    buildCampaignPreflight(campaigns);

  const discoveredTypes =
    [...new Set(
      preflight.supportedCampaigns.map(
        (campaign) =>
          preflight.contractsByCampaignId
            .get(campaign.id)
            ?.campaignType,
      ).filter(
        (value): value is Exclude<
          typeof value,
          undefined
        > => value !== undefined,
      ),
    )].sort();

  console.log(
    "real Naver campaign preflight:",
    JSON.stringify({
      allCampaigns:
        preflight.allCampaigns.length,
      supportedCampaigns:
        preflight.supportedCampaigns.length,
      unsupportedCampaigns:
        preflight.unsupportedCampaigns
          .map((campaign) => ({
            campaignId: campaign.id,
            campaignType:
              campaign.campaignType,
          })),
      supportedCampaignTypes:
        discoveredTypes,
    }),
  );

  const pendingJob =
    await createPendingMediaSyncJob({
      reportId: input.reportId,
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      advertiserId: input.advertiserId,
      createdBy: input.createdBy,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      dataLevel: "mixed",
      mode: "snapshot_replace",
    });

  console.log(
    "pending job created for Railway:",
    JSON.stringify({
      jobId: pendingJob.id,
      status: pendingJob.status,
      progress: pendingJob.progress,
    }),
  );

  const observation =
    await waitForRailwayCompletion(
      pendingJob.id,
    );
  const finalJob =
    observation.finalJob;

  if (finalJob.status !== "done") {
    throw new Error(
      `RAILWAY_AUTO_SYNC_JOB_NOT_DONE:${finalJob.status}:${finalJob.error ?? "NO_ERROR"}`,
    );
  }

  assert.equal(finalJob.progress, 100);
  assert.equal(finalJob.failed_rows, 0);
  assert.ok(finalJob.snapshot_ingestion_id);
  assert.ok(finalJob.finished_at);

  const reportAfter =
    await readReportState(input);
  const connectionAfter =
    await readConnectionState(input);

  assert.notEqual(
    reportAfter.currentIngestionId,
    reportBefore.currentIngestionId,
  );
  assert.equal(
    reportAfter.currentIngestionId,
    finalJob.snapshot_ingestion_id,
  );
  assert.equal(
    reportAfter.publishedIngestionId,
    reportBefore.publishedIngestionId,
  );
  assert.equal(
    connectionAfter.lastError,
    null,
  );
  assert.ok(connectionAfter.lastSyncAt);

  const snapshotIngestionId =
    readRequiredString(
      finalJob.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    );

  const rows =
    await readSnapshotRows(
      input,
      snapshotIngestionId,
    );
  const ingestionRowCount =
    await readIngestionRowCount(
      input.reportId,
      snapshotIngestionId,
    );

  assert.equal(
    rows.length,
    ingestionRowCount,
  );
  assert.equal(
    rows.length,
    finalJob.inserted_rows,
  );
  assert.equal(
    finalJob.inserted_rows,
    finalJob.normalized_rows,
  );

  const coverage =
    buildCoverage(rows, preflight, input);

  assert.equal(
    coverage.rowIndexesContiguous,
    true,
  );
  assert.equal(
    coverage.allRowsInDateRange,
    true,
  );
  assert.equal(
    coverage.allRowsMatchContracts,
    true,
  );

  printCoverage(coverage, preflight);

  for (
    const expected of
    KNOWN_PARITY_CAMPAIGNS
  ) {
    const actual =
      coverage.byCampaign.get(
        expected.campaignId,
      );

    if (!actual) {
      throw new Error(
        `RAILWAY_AUTO_SYNC_KNOWN_CAMPAIGN_MISSING:${expected.key}`,
      );
    }

    assert.equal(
      actual.campaignType,
      expected.campaignType,
    );
    assert.equal(
      actual.impressions,
      expected.expectedImpressions,
    );
    assert.equal(
      actual.clicks,
      expected.expectedClicks,
    );
  }

  const requiredTypeResults =
    REQUIRED_CAMPAIGN_TYPES.map(
      (campaignType) => {
        const discoveredCount =
          preflight.supportedCampaigns
            .filter((campaign) =>
              preflight.contractsByCampaignId
                .get(campaign.id)
                ?.campaignType ===
              campaignType,
            )
            .length;

        const totals =
          coverage.byType.get(
            campaignType,
          ) ?? emptyMetricTotal();

        return {
          campaignType,
          discoveredCount,
          rows: totals.rows,
          impressions: totals.impressions,
          clicks: totals.clicks,
          present:
            discoveredCount > 0 &&
            totals.rows > 0,
        };
      },
    );

  const allRequiredTypesPresent =
    requiredTypeResults.every(
      (result) => result.present,
    );

  console.log(
    "required campaign type coverage:",
    JSON.stringify(
      requiredTypeResults,
    ),
  );
  console.log(
    "Railway observed pending:",
    observation.observedPending,
  );
  console.log(
    "Railway observed processing:",
    observation.observedProcessing,
  );
  console.log(
    "Railway observed attempt counts:",
    observation.observedAttemptCounts
      .join(" / "),
  );
  console.log(
    "current_ingestion_id switched:",
    reportAfter.currentIngestionId,
  );
  console.log(
    "published_ingestion_id preserved:",
    reportAfter.publishedIngestionId ??
      "NULL",
  );
  console.log(
    "final job status / progress:",
    `${finalJob.status} / ${finalJob.progress}`,
  );
  console.log(
    "snapshot rows / impressions / clicks:",
    `${coverage.total.rows} / ${coverage.total.impressions} / ${coverage.total.clicks}`,
  );
  console.log(
    "known SHOPPING + BRAND_SEARCH parity passed:",
    true,
  );
  console.log(
    "SHOPPING + BRAND_SEARCH + WEB_SITE coverage passed:",
    allRequiredTypesPresent,
  );

  if (!allRequiredTypesPresent) {
    throw new Error(
      "RAILWAY_AUTO_SYNC_REQUIRED_CAMPAIGN_TYPE_COVERAGE_FAILED",
    );
  }

  console.log(
    "Railway automatic sync verification passed:",
    true,
  );
}

main().catch((error) => {
  console.error(
    "Railway automatic sync verification failed:",
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error),
  );

  process.exitCode = 1;
});
