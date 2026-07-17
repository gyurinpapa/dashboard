import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  decryptNaverSearchAdsConnection,
  MediaConnectionsRepositoryError,
} from "../src/lib/media-sync/media-connections-repository";
import {
  readNaverSearchAdsCombinedProcessingCheckpoint,
  MediaSyncCombinedProcessingCheckpointError,
  type NaverSearchAdsCombinedProcessingCheckpoint,
} from "../src/lib/media-sync/media-sync-combined-processing-checkpoint-repository";
import {
  createPendingMediaSyncJob,
  parseMediaSyncJobRecord,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  getNaverSearchAdsCombinedStagingSummary,
  MediaSyncStagingSummaryError,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  materializeMediaSyncSnapshot,
  MediaSyncSnapshotMaterializationError,
  type MediaSyncSnapshotMaterializationResult,
} from "../src/lib/media-sync/media-sync-snapshot-materialization-repository";
import {
  processClaimedNaverMediaSyncJob,
  MediaSyncWorkerOrchestrationError,
  type ProcessNaverMediaSyncJobOptions,
} from "../src/lib/media-sync/media-sync-worker-orchestration-repository";
import {
  claimNextNaverMediaSyncJob,
  releaseNaverMediaSyncJobForResume,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  resolveNaverExternalProductCollectionPolicy,
  resolveNaverSearchAdsCampaignCollectionContract,
  NaverSearchAdsAuthoritativeGrainError,
  type NaverSearchAdsCampaignCollectionContract,
} from "../src/lib/media-sync/naver-searchads-authoritative-grain";
import type {
  NaverAuthoritativeEntityStatsCollectorDependencies,
  NaverAuthoritativeEntityStatsCollectorRetryEvent,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import type {
  NaverKeywordStatsCollectorDependencies,
  NaverKeywordStatsCollectorRetryEvent,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
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

const MEDIA_CONNECTIONS_TABLE =
  "media_connections";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const MEDIA_SYNC_STAGING_ROWS_TABLE =
  "media_sync_staging_rows";

const REPORTS_TABLE =
  "reports";

const REPORT_INGESTIONS_TABLE =
  "report_ingestions";

const REPORT_ROWS_TABLE =
  "report_rows";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const ACTIVE_CONNECTION_STATUS =
  "active" as const;

const PENDING_STATUS =
  "pending" as const;

const PROCESSING_STATUS =
  "processing" as const;

const ACTIVE_JOB_STATUSES = [
  PENDING_STATUS,
  PROCESSING_STATUS,
] as const;

const DATE_WINDOW_INDEX =
  0;

const PARITY_DATE_FROM =
  "2026-05-01";

const PARITY_DATE_TO =
  "2026-05-02";

const EXPECTED_SEARCH_ADS_TOTAL = {
  impressions: 7_075,
  clicks: 1_183,
} as const;

const EXPECTED_CAMPAIGNS = [
  {
    key: "shopping_mobile",
    displayName: "Shopping MO",
    campaignId:
      "cmp-a001-02-000000010549559",
    campaignType: "SHOPPING",
    canonicalRowLevel: "creative",
    authoritativeGrain: "ad",
    expected: {
      impressions: 3_257,
      clicks: 83,
    },
  },
  {
    key: "brand_search",
    displayName: "브랜드검색",
    campaignId:
      "cmp-a001-04-000000005653958",
    campaignType: "BRAND_SEARCH",
    canonicalRowLevel: "mixed",
    authoritativeGrain: "adgroup",
    expected: {
      impressions: 2_742,
      clicks: 1_098,
    },
  },
  {
    key: "shopping_pc",
    displayName: "Shopping PC",
    campaignId:
      "cmp-a001-02-000000010549606",
    campaignType: "SHOPPING",
    canonicalRowLevel: "creative",
    authoritativeGrain: "ad",
    expected: {
      impressions: 1_076,
      clicks: 2,
    },
  },
] as const;

/*
 * 실제 API 요청 안전 설정.
 * timeout으로 run을 자르지 않고 collector bounded limit로만 partial/resume한다.
 */
const REQUEST_INTERVAL_MS =
  1_000;

const KEYWORD_CHUNK_SIZE =
  100;

const CHUNK_PAUSE_MS =
  10_000;

const MAX_RETRY_COUNT =
  3;

const STAGING_BATCH_SIZE =
  50;

/*
 * 첫 claim은 의도적으로 1건만 처리해 실제 API + 실제 DB에서
 * combined partial/checkpoint/pending release/reclaim 경로를 강제 검증한다.
 */
const MAX_KEYWORD_STATS_PER_RUN =
  1;

const MAX_STATS_REQUESTS_PER_RUN =
  1;

const MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN =
  20;

const MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN =
  1;

const MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN =
  1;

const MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN =
  20;

/*
 * 두 번째 claim부터는 운영과 동일한 bounded resume 크기로 전환한다.
 * timeout이나 무제한 loop에 의존하지 않으며 cursor/checkpoint 계약은 그대로다.
 */
const RESUME_MAX_KEYWORD_STATS_PER_RUN =
  100;

const RESUME_MAX_STATS_REQUESTS_PER_RUN =
  50;

const RESUME_MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN =
  100;

const RESUME_MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN =
  50;

/*
 * 1회 forced-partial + 최대 99회 bounded resume.
 * 일반적인 parity 대상은 훨씬 적은 claim으로 완료되지만,
 * 실제 계정 entity 증가에도 검증이 임의 timeout으로 실패하지 않도록 충분한 상한을 둔다.
 */
const MAX_CLAIM_RUNS =
  100;

const CAMPAIGN_PREFLIGHT_RECORD_SIZE =
  1_000;

const MAX_CAMPAIGN_PREFLIGHT_PAGES =
  100;

const MATERIALIZATION_BATCH_SIZE =
  2_000;

const DATABASE_PAGE_SIZE =
  1_000;

const CLEANUP_DELETE_BATCH_SIZE =
  100;

const ACTIVATION_BLOCK_SENTINEL =
  "VERIFICATION_ACTIVATION_BLOCKED";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FINGERPRINT_PATTERN =
  /^[0-9a-f]{64}$/;

const FORBIDDEN_DIAGNOSTIC_TEXT_PATTERN =
  /secret|token|credential|ciphertext|access\s*license|authorization|password|api[_ -]?key/gi;

const MAX_SAFE_DIAGNOSTIC_TEXT_LENGTH =
  1_000;

const MAX_NESTED_CAUSE_DEPTH =
  6;

type VerificationInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
};

type VerificationFixture = {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  snapshotIngestionId: string | null;
};

type ReportScope = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
};

type ConnectionScope = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  provider: string;
  status: string;
  externalAccountId: string;
};

type DatabaseState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
  reportRowsCount: number;
  reportIngestionsCount: number;
  reportJobsCount: number;
  reportStagingRowsCount: number;
  snapshotLinkedJobIds: string[];
};

type StoredStagingRow = {
  row_index: number | string;
  date_window_index: number;
  date: string;
  row_key: string;
  row_fingerprint: string;
  row: EtrylueNormalizedMediaRow;
};

type MaterializationGuards = {
  materializationCalls: number;
  activationCalls: number;
  finalizationCalls: number;
};

type MaterializationCapture = {
  result: MediaSyncSnapshotMaterializationResult | null;
};

type MaterializedRow = {
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

type MaterializedRowsValidation = {
  rowCountMatches: boolean;
  rowIndexesContiguous: boolean;
  canonicalRowsMatchStaging: boolean;
  scopeMatches: boolean;
  actualTotals: CampaignMetricTotal;
};

type RetryMeasurements = {
  keywordRetryCount: number;
  authoritativeRetryCount: number;
};

type ClaimMeasurement = {
  claimNumber: number;
  attemptCount: number;
  status: "partial" | "activation_blocked";
  checkpoint: NaverSearchAdsCombinedProcessingCheckpoint;
  stagingRowCount: number;
};

type CampaignPreflight = {
  allCampaigns: NaverSearchAdsCampaignRecord[];

  /**
   * 이번 parity 검증 대상으로 명시된 campaign만 collector에 전달한다.
   * 계정의 다른 campaign은 실제 응답에서 확인하되 staging 대상으로 사용하지 않는다.
   */
  selectedCampaigns: NaverSearchAdsCampaignRecord[];
  keywordCampaigns: NaverSearchAdsCampaignRecord[];
  authoritativeCampaigns: NaverSearchAdsCampaignRecord[];

  /**
   * authoritative grain 계약이 아직 없는 실제 Search Ads campaign.
   * collector dependency에는 절대 전달하지 않아 staging 저장을 차단한다.
   */
  unsupportedCampaigns: NaverSearchAdsCampaignRecord[];

  contractsByCampaignId: Map<
    string,
    NaverSearchAdsCampaignCollectionContract
  >;
  advoostExcluded: boolean;
  unknownCampaignTypesFailClosed: boolean;
};

type CampaignMetricTotal = {
  impressions: number;
  clicks: number;
};

type StoredRowsValidation = {
  rowIndexesContiguous: boolean;
  allRowKeysPresent: boolean;
  allRowKeysUnique: boolean;
  crossGrainDuplicateRowKeys: number;
  duplicateEntityDateRows: number;
  allFingerprintsPresent: boolean;
  oneAuthoritativeGrainPerCampaign: boolean;
  rowsMatchCampaignContracts: boolean;
  keywordRowsOnlyForWebSite: boolean;
  shoppingRowsOnlyCreative: boolean;
  brandRowsOnlyMixed: boolean;
  datesWithinParityRange: boolean;
  actualTotals: CampaignMetricTotal;
  campaignTotals: Map<string, CampaignMetricTotal>;
};

type ParityDifference = {
  key: string;
  campaignName: string;
  campaignId: string;
  expectedImpressions: number;
  actualImpressions: number;
  impressionDelta: number;
  expectedClicks: number;
  actualClicks: number;
  clickDelta: number;
};

type UnknownRecord =
  Record<string, unknown>;

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${argumentName} argument is required.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new Error(
      `${argumentName} argument must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeUuidArgument(
  value: unknown,
  argumentName: string,
): string {
  const normalizedValue =
    normalizeRequiredArgument(
      value,
      argumentName,
      36,
    );

  if (
    !UUID_PATTERN.test(
      normalizedValue,
    )
  ) {
    throw new Error(
      `VERIFICATION_INVALID_${argumentName.toUpperCase()}_UUID`,
    );
  }

  return normalizedValue;
}

function readVerificationInput():
  VerificationInput {
  const [
    reportIdArgument,
    connectionIdArgument,
    workspaceIdArgument,
    advertiserIdArgument,
    createdByArgument,
    dateFromArgument,
    dateToArgument,
  ] = process.argv.slice(2);

  const dateFrom =
    normalizeRequiredArgument(
      dateFromArgument,
      "dateFrom",
      10,
    );

  const dateTo =
    normalizeRequiredArgument(
      dateToArgument,
      "dateTo",
      10,
    );

  if (
    dateFrom !==
      PARITY_DATE_FROM ||
    dateTo !==
      PARITY_DATE_TO
  ) {
    throw new Error(
      "VERIFICATION_REQUIRES_2026_05_01_TO_2026_05_02",
    );
  }

  return {
    reportId:
      normalizeUuidArgument(
        reportIdArgument,
        "reportId",
      ),

    connectionId:
      normalizeUuidArgument(
        connectionIdArgument,
        "connectionId",
      ),

    workspaceId:
      normalizeUuidArgument(
        workspaceIdArgument,
        "workspaceId",
      ),

    advertiserId:
      normalizeUuidArgument(
        advertiserIdArgument,
        "advertiserId",
      ),

    createdBy:
      normalizeUuidArgument(
        createdByArgument,
        "createdBy",
      ),

    dateFrom,
    dateTo,
  };
}

function assertWorkerExplicitlyDisabled():
  void {
  const value =
    String(
      process.env
        .MEDIA_SYNC_WORKER_ENABLED ??
      "",
    )
      .trim()
      .toLowerCase();

  if (value !== "0") {
    throw new Error(
      "VERIFICATION_REQUIRES_MEDIA_SYNC_WORKER_ENABLED_0",
    );
  }
}

function stableJson(
  value: unknown,
): string {
  if (value === undefined) {
    return "undefined";
  }

  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value) ??
      "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableJson)
      .join(",")}]`;
  }

  const record =
    value as UnknownRecord;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype ===
      Object.prototype ||
    prototype ===
      null
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
      `VERIFICATION_INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return value.trim();
}

function readNullableString(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function readNonNegativeMetric(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `VERIFICATION_INVALID_CANONICAL_${fieldName.toUpperCase()}`,
    );
  }

  return value;
}

async function readExactCount(
  tableName: string,
  columnName: string,
  value: string,
): Promise<number> {
  const supabase =
    getSupabaseAdmin();

  const {
    count,
    error,
  } = await supabase
    .from(tableName)
    .select(
      "id",
      {
        count: "exact",
        head: true,
      },
    )
    .eq(
      columnName,
      value,
    );

  if (error) {
    throw new Error(
      `VERIFICATION_${tableName.toUpperCase()}_COUNT_FAILED`,
      {
        cause: error,
      },
    );
  }

  return count ?? 0;
}

async function readReportScope(
  input: VerificationInput,
): Promise<ReportScope> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(REPORTS_TABLE)
    .select(
      "id, workspace_id, advertiser_id",
    )
    .eq(
      "id",
      input.reportId,
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "VERIFICATION_REPORT_SCOPE_READ_FAILED",
      {
        cause: error ?? undefined,
      },
    );
  }

  const scope: ReportScope = {
    reportId:
      readRequiredString(
        data.id,
        "report_id",
      ),
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
  };

  if (
    scope.reportId !==
      input.reportId ||
    scope.workspaceId !==
      input.workspaceId ||
    scope.advertiserId !==
      input.advertiserId
  ) {
    throw new Error(
      "VERIFICATION_REPORT_SCOPE_MISMATCH",
    );
  }

  return scope;
}

async function readConnectionScope(
  input: VerificationInput,
): Promise<ConnectionScope> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, provider, status, external_account_id",
    )
    .eq(
      "id",
      input.connectionId,
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "VERIFICATION_CONNECTION_SCOPE_READ_FAILED",
      {
        cause: error ?? undefined,
      },
    );
  }

  const scope: ConnectionScope = {
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
  };

  if (
    scope.connectionId !==
      input.connectionId ||
    scope.workspaceId !==
      input.workspaceId ||
    scope.advertiserId !==
      input.advertiserId
  ) {
    throw new Error(
      "VERIFICATION_CONNECTION_SCOPE_MISMATCH",
    );
  }

  if (
    scope.provider !==
    NAVER_PROVIDER
  ) {
    throw new Error(
      "VERIFICATION_CONNECTION_PROVIDER_MISMATCH",
    );
  }

  if (
    scope.status !==
    ACTIVE_CONNECTION_STATUS
  ) {
    throw new Error(
      "VERIFICATION_CONNECTION_NOT_ACTIVE",
    );
  }

  return scope;
}

async function assertNoExistingPendingNaverJob():
  Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select(
      "id, report_id, status",
    )
    .eq(
      "provider",
      NAVER_PROVIDER,
    )
    .eq(
      "status",
      PENDING_STATUS,
    )
    .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_QUEUE_CHECK_FAILED",
      {
        cause: error,
      },
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_PENDING_NAVER_JOB_ALREADY_EXISTS",
    );
  }
}

async function assertNoExistingActiveJobForReport(
  reportId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select(
      "id, status",
    )
    .eq(
      "report_id",
      reportId,
    )
    .in(
      "status",
      [...ACTIVE_JOB_STATUSES],
    )
    .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_CHECK_FAILED",
      {
        cause: error,
      },
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_ALREADY_EXISTS",
    );
  }
}

async function readDatabaseState(
  reportId: string,
): Promise<DatabaseState> {
  const supabase =
    getSupabaseAdmin();

  const reportResult =
    await supabase
      .from(REPORTS_TABLE)
      .select(
        "current_ingestion_id, published_ingestion_id",
      )
      .eq(
        "id",
        reportId,
      )
      .maybeSingle();

  if (
    reportResult.error ||
    !reportResult.data
  ) {
    throw new Error(
      "VERIFICATION_REPORT_STATE_READ_FAILED",
      {
        cause:
          reportResult.error ??
          undefined,
      },
    );
  }

  const snapshotJobsResult =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select(
        "id, snapshot_ingestion_id",
      )
      .eq(
        "report_id",
        reportId,
      );

  if (snapshotJobsResult.error) {
    throw new Error(
      "VERIFICATION_SNAPSHOT_JOB_STATE_READ_FAILED",
      {
        cause:
          snapshotJobsResult.error,
      },
    );
  }

  const snapshotLinkedJobIds =
    (Array.isArray(
      snapshotJobsResult.data,
    )
      ? snapshotJobsResult.data
      : [])
      .filter(
        (record: {
          id: unknown;
          snapshot_ingestion_id:
            unknown;
        }) =>
          typeof record
            .snapshot_ingestion_id ===
            "string" &&
          record
            .snapshot_ingestion_id
            .trim().length > 0,
      )
      .map(
        (record: {
          id: unknown;
          snapshot_ingestion_id:
            unknown;
        }) =>
          String(record.id),
      )
      .sort();

  return {
    currentIngestionId:
      readNullableString(
        reportResult.data
          .current_ingestion_id,
      ),

    publishedIngestionId:
      readNullableString(
        reportResult.data
          .published_ingestion_id,
      ),

    reportRowsCount:
      await readExactCount(
        REPORT_ROWS_TABLE,
        "report_id",
        reportId,
      ),

    reportIngestionsCount:
      await readExactCount(
        REPORT_INGESTIONS_TABLE,
        "report_id",
        reportId,
      ),

    reportJobsCount:
      await readExactCount(
        MEDIA_SYNC_JOBS_TABLE,
        "report_id",
        reportId,
      ),

    reportStagingRowsCount:
      await readExactCount(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
        "report_id",
        reportId,
      ),

    snapshotLinkedJobIds,
  };
}

function databaseStateMatches(
  before: DatabaseState,
  after: DatabaseState,
): boolean {
  return (
    before.currentIngestionId ===
      after.currentIngestionId &&
    before.publishedIngestionId ===
      after.publishedIngestionId &&
    before.reportRowsCount ===
      after.reportRowsCount &&
    before.reportIngestionsCount ===
      after.reportIngestionsCount &&
    before.reportJobsCount ===
      after.reportJobsCount &&
    before.reportStagingRowsCount ===
      after.reportStagingRowsCount &&
    stableJson(
      before.snapshotLinkedJobIds,
    ) ===
      stableJson(
        after.snapshotLinkedJobIds,
      )
  );
}

function shouldRetryApiError(
  error: NaverSearchAdsApiError,
): boolean {
  return (
    error.code ===
      "NETWORK_ERROR" ||
    error.code ===
      "REQUEST_TIMEOUT" ||
    error.status ===
      429 ||
    (
      typeof error.status ===
        "number" &&
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
  NaverSearchAdsListPage<
    NaverSearchAdsCampaignRecord
  >
> {
  let retryCount = 0;

  while (true) {
    try {
      return await fetchNaverSearchAdsCampaignPage(
        input,
      );
    } catch (error) {
      if (
        !(error instanceof NaverSearchAdsApiError) ||
        !shouldRetryApiError(error) ||
        retryCount >=
          MAX_RETRY_COUNT
      ) {
        throw error;
      }

      retryCount += 1;

      const delayMs =
        REQUEST_INTERVAL_MS *
        2 **
          (retryCount - 1);

      console.log(
        "campaign preflight retry:",
        JSON.stringify({
          retryCount,
          delayMs,
          status:
            error.status,
          code:
            error.code,
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
): Promise<
  NaverSearchAdsCampaignRecord[]
> {
  const campaigns:
    NaverSearchAdsCampaignRecord[] = [];

  const seenIds =
    new Set<string>();

  let baseSearchId:
    string | null =
      null;

  for (
    let pageNumber = 1;
    pageNumber <=
      MAX_CAMPAIGN_PREFLIGHT_PAGES;
    pageNumber += 1
  ) {
    const page =
      await fetchCampaignPageWithRetry({
        credentials,
        recordSize:
          CAMPAIGN_PREFLIGHT_RECORD_SIZE,
        selector:
          "NEXT",
        baseSearchId,
      });

    for (
      const campaign
      of page.records
    ) {
      if (
        seenIds.has(
          campaign.id,
        )
      ) {
        throw new Error(
          "VERIFICATION_DUPLICATE_CAMPAIGN_DISCOVERY",
        );
      }

      seenIds.add(
        campaign.id,
      );

      campaigns.push(
        campaign,
      );
    }

    if (
      page.records.length <
      CAMPAIGN_PREFLIGHT_RECORD_SIZE
    ) {
      return campaigns;
    }

    if (
      !page.nextBaseSearchId ||
      page.nextBaseSearchId ===
        baseSearchId
    ) {
      throw new Error(
        "VERIFICATION_INVALID_CAMPAIGN_PAGINATION",
      );
    }

    baseSearchId =
      page.nextBaseSearchId;

    await delay(
      REQUEST_INTERVAL_MS,
    );
  }

  throw new Error(
    "VERIFICATION_CAMPAIGN_PAGE_LIMIT_EXCEEDED",
  );
}

function verifyUnknownCampaignTypesFailClosed():
  boolean {
  try {
    resolveNaverSearchAdsCampaignCollectionContract(
      "__ETRYLUE_UNKNOWN_LIVE_TYPE__",
    );

    return false;
  } catch (error) {
    return (
      error instanceof
        NaverSearchAdsAuthoritativeGrainError &&
      error.code ===
        "UNSUPPORTED_CAMPAIGN_TYPE"
    );
  }
}

function validateCampaignPreflight(
  campaigns:
    readonly NaverSearchAdsCampaignRecord[],
): CampaignPreflight {
  const contractsByCampaignId =
    new Map<
      string,
      NaverSearchAdsCampaignCollectionContract
    >();

  const expectedCampaignIds =
    new Set<string>(
      EXPECTED_CAMPAIGNS.map(
        (expected) =>
          expected.campaignId,
      ),
    );

  const selectedCampaigns:
    NaverSearchAdsCampaignRecord[] = [];

  const keywordCampaigns:
    NaverSearchAdsCampaignRecord[] = [];

  const authoritativeCampaigns:
    NaverSearchAdsCampaignRecord[] = [];

  const unsupportedCampaigns:
    NaverSearchAdsCampaignRecord[] = [];

  const advoostPolicy =
    resolveNaverExternalProductCollectionPolicy(
      "ADVOOST",
    );

  const advoostShoppingPolicy =
    resolveNaverExternalProductCollectionPolicy(
      "ADVOOST_SHOPPING",
    );

  const syntheticUnknownTypeFailClosed =
    verifyUnknownCampaignTypesFailClosed();

  if (!syntheticUnknownTypeFailClosed) {
    throw new Error(
      "VERIFICATION_UNKNOWN_CAMPAIGN_TYPE_NOT_FAIL_CLOSED",
    );
  }

  for (
    const campaign
    of campaigns
  ) {
    let contract:
      NaverSearchAdsCampaignCollectionContract | null =
        null;

    try {
      contract =
        resolveNaverSearchAdsCampaignCollectionContract(
          campaign.campaignType,
        );
    } catch (error) {
      if (
        error instanceof
          NaverSearchAdsAuthoritativeGrainError &&
        error.code ===
          "UNSUPPORTED_CAMPAIGN_TYPE"
      ) {
        /*
         * POWER_CONTENT 같은 아직 검증되지 않은 실제 campaignType은
         * fail-closed로 기록하고 collector dependency에서 제외한다.
         * 따라서 이 campaign은 staging에 단 한 행도 저장될 수 없다.
         */
        unsupportedCampaigns.push(
          campaign,
        );

        continue;
      }

      throw error;
    }

    if (!contract) {
      throw new Error(
        `VERIFICATION_CAMPAIGN_CONTRACT_MISSING:${campaign.id}`,
      );
    }

    if (
      !expectedCampaignIds.has(
        campaign.id,
      )
    ) {
      /*
       * 실제 계정 응답에는 존재하지만 이번 7,075 / 1,183 parity 범위에
       * 포함되지 않은 검증 외 campaign이다. 실제 응답에서 존재 여부와
       * contract 유효성만 확인하고 collector에는 전달하지 않는다.
       */
      continue;
    }

    contractsByCampaignId.set(
      campaign.id,
      contract,
    );

    selectedCampaigns.push(
      campaign,
    );

    if (
      contract.authoritativeGrain ===
      "keyword"
    ) {
      keywordCampaigns.push(
        campaign,
      );
    } else {
      authoritativeCampaigns.push(
        campaign,
      );
    }
  }

  for (
    const expected
    of EXPECTED_CAMPAIGNS
  ) {
    const campaign =
      campaigns.find(
        (item) =>
          item.id ===
          expected.campaignId,
      );

    if (!campaign) {
      throw new Error(
        `VERIFICATION_EXPECTED_CAMPAIGN_NOT_FOUND:${expected.campaignId}`,
      );
    }

    const contract =
      contractsByCampaignId.get(
        expected.campaignId,
      );

    if (
      !contract ||
      contract.campaignType !==
        expected.campaignType ||
      contract.authoritativeGrain !==
        expected.authoritativeGrain ||
      contract.canonicalRowLevel !==
        expected.canonicalRowLevel
    ) {
      throw new Error(
        `VERIFICATION_EXPECTED_CAMPAIGN_CONTRACT_MISMATCH:${expected.campaignId}`,
      );
    }
  }

  if (
    selectedCampaigns.length !==
      EXPECTED_CAMPAIGNS.length
  ) {
    throw new Error(
      "VERIFICATION_EXPECTED_CAMPAIGN_SELECTION_COUNT_MISMATCH",
    );
  }

  const liveUnsupportedCampaignTypesFailClosed =
    unsupportedCampaigns.every(
      (campaign) => {
        try {
          resolveNaverSearchAdsCampaignCollectionContract(
            campaign.campaignType,
          );

          return false;
        } catch (error) {
          return (
            error instanceof
              NaverSearchAdsAuthoritativeGrainError &&
            error.code ===
              "UNSUPPORTED_CAMPAIGN_TYPE"
          );
        }
      },
    );

  const unknownCampaignTypesFailClosed =
    syntheticUnknownTypeFailClosed &&
    liveUnsupportedCampaignTypesFailClosed;

  const actualSearchCampaignTypesExcludeAdvoost =
    campaigns.every(
      (campaign) => {
        const campaignType =
          String(
            campaign.campaignType ??
            "",
          )
            .trim()
            .toUpperCase()
            .replace(
              /[\s-]+/g,
              "_",
            );

        return (
          campaignType !==
            "ADVOOST" &&
          campaignType !==
            "ADVOOST_SHOPPING"
        );
      },
    );

  const advoostExcluded =
    advoostPolicy.status ===
      "excluded" &&
    advoostPolicy.reason ===
      "excluded_display_provider" &&
    advoostShoppingPolicy.status ===
      "excluded" &&
    advoostShoppingPolicy.reason ===
      "excluded_display_provider" &&
    actualSearchCampaignTypesExcludeAdvoost;

  if (!advoostExcluded) {
    throw new Error(
      "VERIFICATION_ADVOOST_SEARCH_ADS_EXCLUSION_FAILED",
    );
  }

  if (!unknownCampaignTypesFailClosed) {
    throw new Error(
      "VERIFICATION_LIVE_UNSUPPORTED_CAMPAIGN_TYPE_NOT_FAIL_CLOSED",
    );
  }

  return {
    allCampaigns: [
      ...campaigns,
    ],
    selectedCampaigns,
    keywordCampaigns,
    authoritativeCampaigns,
    unsupportedCampaigns,
    contractsByCampaignId,
    advoostExcluded,
    unknownCampaignTypesFailClosed,
  };
}

function createPreloadedCampaignPageFetcher(
  campaigns:
    readonly NaverSearchAdsCampaignRecord[],
): NaverKeywordStatsCollectorDependencies["fetchCampaignPage"] {
  const stableCampaigns = [
    ...campaigns,
  ];

  return async (
    input,
  ): Promise<
    NaverSearchAdsListPage<
      NaverSearchAdsCampaignRecord
    >
  > => {
    const recordSize =
      typeof input.recordSize ===
        "number"
        ? input.recordSize
        : 100;

    const selector =
      input.selector ??
      "NEXT";

    const baseSearchId =
      input.baseSearchId ??
      null;

    if (
      selector !==
      "NEXT"
    ) {
      throw new NaverSearchAdsApiError(
        "INVALID_INPUT",
        "The live verification campaign dependency only supports NEXT paging.",
      );
    }

    let startIndex = 0;

    if (baseSearchId) {
      const foundIndex =
        stableCampaigns.findIndex(
          (campaign) =>
            campaign.id ===
            baseSearchId,
        );

      if (foundIndex < 0) {
        throw new NaverSearchAdsApiError(
          "INVALID_INPUT",
          "The saved campaign paging position was not found in the verified live campaign set.",
        );
      }

      startIndex =
        foundIndex + 1;
    }

    const records =
      stableCampaigns.slice(
        startIndex,
        startIndex +
          recordSize,
      );

    return {
      records,
      recordSize,
      selector,
      baseSearchId,
      nextBaseSearchId:
        records.length > 0
          ? records[
              records.length - 1
            ]?.id ?? null
          : null,
    };
  };
}

function createKeywordDependencies(
  campaignPreflight:
    CampaignPreflight,
): Partial<
  NaverKeywordStatsCollectorDependencies
> {
  return {
    /*
     * 실제 API에서 사전 확인한 WEB_SITE campaign만 기존 keyword collector에 전달한다.
     * adgroup / keyword / stats 요청은 collector 기본 실제 API dependency를 그대로 사용한다.
     */
    fetchCampaignPage:
      createPreloadedCampaignPageFetcher(
        campaignPreflight
          .keywordCampaigns,
      ),
  };
}

function createAuthoritativeDependencies(
  campaignPreflight:
    CampaignPreflight,
): Partial<
  NaverAuthoritativeEntityStatsCollectorDependencies
> {
  return {
    /*
     * 실제 API에서 사전 확인한 SHOPPING / BRAND_SEARCH campaign만 전달한다.
     * adgroup / ad / entity stats 요청은 collector 기본 실제 API dependency를 그대로 사용한다.
     */
    fetchCampaignPage:
      createPreloadedCampaignPageFetcher(
        campaignPreflight
          .authoritativeCampaigns,
      ),
  };
}

async function assertOnlyFixturePendingJob(
  jobId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select(
      "id",
    )
    .eq(
      "provider",
      NAVER_PROVIDER,
    )
    .eq(
      "status",
      PENDING_STATUS,
    )
    .limit(2);

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_FIXTURE_CHECK_FAILED",
      {
        cause: error,
      },
    );
  }

  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    data[0]?.id !==
      jobId
  ) {
    throw new Error(
      "VERIFICATION_PENDING_FIXTURE_NOT_EXCLUSIVE",
    );
  }
}

async function claimFixtureJob(
  jobId: string,
): Promise<MediaSyncJobRecord> {
  await assertOnlyFixturePendingJob(
    jobId,
  );

  const claimedJob =
    await claimNextNaverMediaSyncJob();

  if (
    claimedJob &&
    claimedJob.id !==
      jobId
  ) {
    try {
      await releaseNaverMediaSyncJobForResume(
        claimedJob,
      );
    } catch {
      // The claim mismatch remains the primary safe diagnostic.
    }

    throw new Error(
      "VERIFICATION_CLAIMED_NON_FIXTURE_JOB",
    );
  }

  if (
    !claimedJob ||
    claimedJob.id !==
      jobId ||
    claimedJob.status !==
      PROCESSING_STATUS ||
    claimedJob.provider !==
      NAVER_PROVIDER
  ) {
    throw new Error(
      "VERIFICATION_CLAIM_MISMATCH",
    );
  }

  return claimedJob;
}

async function readJobRecord(
  jobId: string,
): Promise<MediaSyncJobRecord> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("*")
    .eq(
      "id",
      jobId,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_STATE_READ_FAILED",
      {
        cause: error,
      },
    );
  }

  if (!data) {
    throw new Error(
      "VERIFICATION_JOB_STATE_NOT_FOUND",
    );
  }

  return parseMediaSyncJobRecord(
    data,
  );
}

async function readStoredStagingRows(
  jobId: string,
): Promise<StoredStagingRow[]> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(
      MEDIA_SYNC_STAGING_ROWS_TABLE,
    )
    .select(
      [
        "row_index",
        "date_window_index",
        "date",
        "row_key",
        "row_fingerprint",
        "row",
      ].join(", "),
    )
    .eq(
      "job_id",
      jobId,
    )
    .order(
      "row_index",
      {
        ascending: true,
      },
    );

  if (error) {
    throw new Error(
      "VERIFICATION_STAGING_ROWS_READ_FAILED",
      {
        cause: error,
      },
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "VERIFICATION_STAGING_ROWS_INVALID_RESULT",
    );
  }

  return data as unknown as
    StoredStagingRow[];
}

async function readStagingRowCount(
  jobId: string,
): Promise<number> {
  return readExactCount(
    MEDIA_SYNC_STAGING_ROWS_TABLE,
    "job_id",
    jobId,
  );
}

async function readMaterializedRows(
  fixture: VerificationFixture,
  ingestionId: string,
): Promise<MaterializedRow[]> {
  const supabase =
    getSupabaseAdmin();

  const rows:
    MaterializedRow[] = [];

  for (
    let offset = 0;
    ;
    offset += DATABASE_PAGE_SIZE
  ) {
    const {
      data,
      error,
    } = await supabase
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
      .eq(
        "report_id",
        fixture.reportId,
      )
      .eq(
        "workspace_id",
        fixture.workspaceId,
      )
      .eq(
        "ingestion_id",
        ingestionId,
      )
      .order(
        "row_index",
        {
          ascending: true,
        },
      )
      .range(
        offset,
        offset +
          DATABASE_PAGE_SIZE -
          1,
      );

    if (
      error ||
      !Array.isArray(data)
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_READ_FAILED",
        {
          cause:
            error ??
            undefined,
        },
      );
    }

    rows.push(
      ...(
        data as unknown as
          MaterializedRow[]
      ),
    );

    if (
      data.length <
      DATABASE_PAGE_SIZE
    ) {
      break;
    }
  }

  return rows;
}

async function readSnapshotIngestionExists(
  fixture: VerificationFixture,
  ingestionId: string,
): Promise<boolean> {
  const {
    data,
    error,
  } = await getSupabaseAdmin()
    .from(REPORT_INGESTIONS_TABLE)
    .select(
      "id, report_id",
    )
    .eq(
      "id",
      ingestionId,
    )
    .eq(
      "report_id",
      fixture.reportId,
    )
    .limit(1);

  if (
    error ||
    !Array.isArray(data)
  ) {
    throw new Error(
      "VERIFICATION_SNAPSHOT_INGESTION_READ_FAILED",
      {
        cause:
          error ??
          undefined,
      },
    );
  }

  return (
    data.length === 1 &&
    data[0]?.id ===
      ingestionId &&
    data[0]?.report_id ===
      fixture.reportId
  );
}

function validateMaterializedRows(
  input: {
    fixture:
      VerificationFixture;
    ingestionId:
      string;
    stagingRows:
      readonly StoredStagingRow[];
    materializedRows:
      readonly MaterializedRow[];
  },
): MaterializedRowsValidation {
  let rowIndexesContiguous =
    input.materializedRows.length ===
    input.stagingRows.length;

  let canonicalRowsMatchStaging =
    input.materializedRows.length ===
    input.stagingRows.length;

  let scopeMatches =
    input.materializedRows.length ===
    input.stagingRows.length;

  const actualTotals:
    CampaignMetricTotal = {
      impressions: 0,
      clicks: 0,
    };

  for (
    let index = 0;
    index <
      input.materializedRows.length;
    index += 1
  ) {
    const materializedRow =
      input.materializedRows[index];

    const stagingRow =
      input.stagingRows[index];

    if (!materializedRow) {
      rowIndexesContiguous =
        false;
      canonicalRowsMatchStaging =
        false;
      scopeMatches =
        false;
      continue;
    }

    if (
      Number(
        materializedRow.row_index,
      ) !==
        index
    ) {
      rowIndexesContiguous =
        false;
    }

    if (!stagingRow) {
      canonicalRowsMatchStaging =
        false;
      scopeMatches =
        false;
      continue;
    }

    if (
      materializedRow.report_id !==
        input.fixture.reportId ||
      materializedRow.workspace_id !==
        input.fixture.workspaceId ||
      materializedRow.advertiser_id !==
        input.fixture.advertiserId ||
      materializedRow.ingestion_id !==
        input.ingestionId
    ) {
      scopeMatches =
        false;
    }

    if (
      Number(
        stagingRow.row_index,
      ) !==
        index ||
      materializedRow.date !==
        stagingRow.row.date ||
      materializedRow.channel !==
        stagingRow.row.channel ||
      materializedRow.device !==
        stagingRow.row.device ||
      materializedRow.source !==
        stagingRow.row.source ||
      stableJson(
        materializedRow.row,
      ) !==
        stableJson(
          stagingRow.row,
        )
    ) {
      canonicalRowsMatchStaging =
        false;
    }

    actualTotals.impressions +=
      readNonNegativeMetric(
        materializedRow.row
          .impressions,
        "materialized_impressions",
      );

    actualTotals.clicks +=
      readNonNegativeMetric(
        materializedRow.row
          .clicks,
        "materialized_clicks",
      );
  }

  return {
    rowCountMatches:
      input.materializedRows.length ===
      input.stagingRows.length,

    rowIndexesContiguous,

    canonicalRowsMatchStaging,

    scopeMatches,

    actualTotals,
  };
}

async function resolveFixtureSnapshotIngestionId(
  fixture: VerificationFixture,
): Promise<string | null> {
  if (
    fixture.snapshotIngestionId
  ) {
    return fixture
      .snapshotIngestionId;
  }

  const {
    data,
    error,
  } = await getSupabaseAdmin()
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select(
      "snapshot_ingestion_id",
    )
    .eq(
      "id",
      fixture.jobId,
    )
    .eq(
      "report_id",
      fixture.reportId,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_FIXTURE_SNAPSHOT_ID_READ_FAILED",
      {
        cause: error,
      },
    );
  }

  const snapshotIngestionId =
    readNullableString(
      data
        ?.snapshot_ingestion_id,
    );

  fixture.snapshotIngestionId =
    snapshotIngestionId;

  return snapshotIngestionId;
}

async function deleteMaterializedRowsInBatches(
  fixture: VerificationFixture,
  ingestionId: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  while (true) {
    const {
      data,
      error,
    } = await supabase
      .from(REPORT_ROWS_TABLE)
      .select(
        "id",
      )
      .eq(
        "report_id",
        fixture.reportId,
      )
      .eq(
        "workspace_id",
        fixture.workspaceId,
      )
      .eq(
        "ingestion_id",
        ingestionId,
      )
      .order(
        "row_index",
        {
          ascending: true,
        },
      )
      .limit(
        CLEANUP_DELETE_BATCH_SIZE,
      );

    if (
      error ||
      !Array.isArray(data)
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_READ_FAILED",
        {
          cause:
            error ??
            undefined,
        },
      );
    }

    if (
      data.length ===
      0
    ) {
      return;
    }

    const ids =
      data
        .map(
          (record) =>
            record.id,
        )
        .filter(
          (
            id,
          ): id is string =>
            typeof id ===
              "string" &&
            id.trim().length >
              0,
        );

    if (
      ids.length !==
      data.length
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_INVALID_IDS",
      );
    }

    const deletion =
      await supabase
        .from(
          REPORT_ROWS_TABLE,
        )
        .delete()
        .in(
          "id",
          ids,
        );

    if (
      deletion.error
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_FAILED",
        {
          cause:
            deletion.error,
        },
      );
    }
  }
}

async function deleteStagingRowsInBatches(
  fixture: VerificationFixture,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  while (true) {
    const {
      data,
      error,
    } = await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .select(
        "id",
      )
      .eq(
        "job_id",
        fixture.jobId,
      )
      .eq(
        "report_id",
        fixture.reportId,
      )
      .eq(
        "workspace_id",
        fixture.workspaceId,
      )
      .eq(
        "advertiser_id",
        fixture.advertiserId,
      )
      .order(
        "row_index",
        {
          ascending: true,
        },
      )
      .limit(
        CLEANUP_DELETE_BATCH_SIZE,
      );

    if (
      error ||
      !Array.isArray(data)
    ) {
      throw new Error(
        "VERIFICATION_STAGING_CLEANUP_READ_FAILED",
        {
          cause:
            error ??
            undefined,
        },
      );
    }

    if (
      data.length ===
      0
    ) {
      return;
    }

    const ids =
      data
        .map(
          (record) =>
            record.id,
        )
        .filter(
          (
            id,
          ): id is string =>
            typeof id ===
              "string" &&
            id.trim().length >
              0,
        );

    if (
      ids.length !==
      data.length
    ) {
      throw new Error(
        "VERIFICATION_STAGING_CLEANUP_INVALID_IDS",
      );
    }

    const deletion =
      await supabase
        .from(
          MEDIA_SYNC_STAGING_ROWS_TABLE,
        )
        .delete()
        .in(
          "id",
          ids,
        );

    if (
      deletion.error
    ) {
      throw new Error(
        "VERIFICATION_STAGING_CLEANUP_FAILED",
        {
          cause:
            deletion.error,
        },
      );
    }
  }
}

async function deleteJobFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq(
      "id",
      fixture.jobId,
    )
    .eq(
      "report_id",
      fixture.reportId,
    )
    .eq(
      "workspace_id",
      fixture.workspaceId,
    )
    .eq(
      "advertiser_id",
      fixture.advertiserId,
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_FAILED",
      {
        cause: error,
      },
    );
  }

  if (
    data?.id !==
    fixture.jobId
  ) {
    return false;
  }

  const checkResult =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id")
      .eq(
        "id",
        fixture.jobId,
      )
      .limit(1);

  if (
    checkResult.error ||
    !Array.isArray(
      checkResult.data,
    )
  ) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
      {
        cause:
          checkResult.error ??
          undefined,
      },
    );
  }

  return (
    checkResult.data.length ===
    0
  );
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const snapshotIngestionId =
    await resolveFixtureSnapshotIngestionId(
      fixture,
    );

  if (
    snapshotIngestionId
  ) {
    await deleteMaterializedRowsInBatches(
      fixture,
      snapshotIngestionId,
    );

    const ingestionDelete =
      await supabase
        .from(
          REPORT_INGESTIONS_TABLE,
        )
        .delete()
        .eq(
          "id",
          snapshotIngestionId,
        )
        .eq(
          "report_id",
          fixture.reportId,
        );

    if (
      ingestionDelete.error
    ) {
      throw new Error(
        "VERIFICATION_INGESTION_CLEANUP_FAILED",
        {
          cause:
            ingestionDelete.error,
        },
      );
    }
  }

  await deleteStagingRowsInBatches(
    fixture,
  );

  const jobDeleted =
    await deleteJobFixture(
      fixture,
    );

  if (!jobDeleted) {
    return false;
  }

  const stagingCheck =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .select(
        "id",
      )
      .eq(
        "job_id",
        fixture.jobId,
      )
      .limit(1);

  if (
    stagingCheck.error ||
    !Array.isArray(
      stagingCheck.data,
    )
  ) {
    throw new Error(
      "VERIFICATION_STAGING_CLEANUP_CHECK_FAILED",
      {
        cause:
          stagingCheck.error ??
          undefined,
      },
    );
  }

  if (
    stagingCheck.data.length >
    0
  ) {
    return false;
  }

  if (
    snapshotIngestionId
  ) {
    const ingestionCheck =
      await supabase
        .from(
          REPORT_INGESTIONS_TABLE,
        )
        .select(
          "id",
        )
        .eq(
          "id",
          snapshotIngestionId,
        )
        .eq(
          "report_id",
          fixture.reportId,
        )
        .limit(1);

    if (
      ingestionCheck.error ||
      !Array.isArray(
        ingestionCheck.data,
      )
    ) {
      throw new Error(
        "VERIFICATION_INGESTION_CLEANUP_CHECK_FAILED",
        {
          cause:
            ingestionCheck.error ??
            undefined,
        },
      );
    }

    if (
      ingestionCheck.data.length >
      0
    ) {
      return false;
    }

    const rowsCheck =
      await supabase
        .from(
          REPORT_ROWS_TABLE,
        )
        .select(
          "id",
        )
        .eq(
          "report_id",
          fixture.reportId,
        )
        .eq(
          "ingestion_id",
          snapshotIngestionId,
        )
        .limit(1);

    if (
      rowsCheck.error ||
      !Array.isArray(
        rowsCheck.data,
      )
    ) {
      throw new Error(
        "VERIFICATION_MATERIALIZED_ROWS_CLEANUP_CHECK_FAILED",
        {
          cause:
            rowsCheck.error ??
            undefined,
        },
      );
    }

    if (
      rowsCheck.data.length >
      0
    ) {
      return false;
    }
  }

  return true;
}

function captureKeywordRetry(
  measurements:
    RetryMeasurements,
  event:
    NaverKeywordStatsCollectorRetryEvent,
): void {
  measurements.keywordRetryCount +=
    1;

  console.log(
    "keyword collector retry:",
    JSON.stringify({
      operation:
        event.operation,
      retryCount:
        event.retryCount,
      delayMs:
        event.delayMs,
      httpStatus:
        event.httpStatus,
      errorCode:
        event.errorCode,
    }),
  );
}

function captureAuthoritativeRetry(
  measurements:
    RetryMeasurements,
  event:
    NaverAuthoritativeEntityStatsCollectorRetryEvent,
): void {
  measurements.authoritativeRetryCount +=
    1;

  console.log(
    "authoritative collector retry:",
    JSON.stringify({
      operation:
        event.operation,
      authoritativeGrain:
        event.cursor
          .authoritativeGrain,
      retryCount:
        event.retryCount,
      delayMs:
        event.delayMs,
      httpStatus:
        event.httpStatus,
      errorCode:
        event.errorCode,
    }),
  );
}

function createBaseOptions(
  input: {
    guards: MaterializationGuards;
    capture: MaterializationCapture;
    retryMeasurements:
      RetryMeasurements;
    campaignPreflight:
      CampaignPreflight;
  },
): ProcessNaverMediaSyncJobOptions {
  return {
    dateWindowIndex:
      DATE_WINDOW_INDEX,

    stagingBatchSize:
      STAGING_BATCH_SIZE,

    requestIntervalMs:
      REQUEST_INTERVAL_MS,

    keywordChunkSize:
      KEYWORD_CHUNK_SIZE,

    chunkPauseMs:
      CHUNK_PAUSE_MS,

    maxRetryCount:
      MAX_RETRY_COUNT,

    maxKeywordStatsPerRun:
      MAX_KEYWORD_STATS_PER_RUN,

    maxStatsRequestsPerRun:
      MAX_STATS_REQUESTS_PER_RUN,

    maxKeywordDiscoveryPagesPerRun:
      MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN,

    maxAuthoritativeEntityStatsPerRun:
      MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN,

    maxAuthoritativeStatsRequestsPerRun:
      MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN,

    maxAuthoritativeDiscoveryPagesPerRun:
      MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN,

    materializationBatchSize:
      MATERIALIZATION_BATCH_SIZE,

    onRetry:
      async (event) => {
        captureKeywordRetry(
          input.retryMeasurements,
          event,
        );
      },

    onAuthoritativeRetry:
      async (event) => {
        captureAuthoritativeRetry(
          input.retryMeasurements,
          event,
        );
      },

    dependencies:
      createKeywordDependencies(
        input.campaignPreflight,
      ),

    authoritativeDependencies:
      createAuthoritativeDependencies(
        input.campaignPreflight,
      ),

    orchestrationDependencies: {
      materialize:
        async (
          materializationInput,
        ) => {
          input.guards
            .materializationCalls +=
            1;

          assert.equal(
            materializationInput.job
              .snapshot_ingestion_id,
            null,
          );

          assert.equal(
            materializationInput.summary
              .isComplete,
            true,
          );

          assert.ok(
            materializationInput.summary
              .totalRows > 0,
          );

          const result =
            await materializeMediaSyncSnapshot(
              materializationInput,
            );

          input.capture.result =
            result;

          return result;
        },

      activate:
        async (
          activationInput,
        ) => {
          input.guards
            .activationCalls +=
            1;

          const materialization =
            input.capture.result;

          assert.ok(
            materialization,
          );

          assert.equal(
            activationInput.job
              .snapshot_ingestion_id,
            materialization
              .snapshotIngestionId,
          );

          assert.equal(
            activationInput.expectedRows,
            materialization.rowCount,
          );

          throw new Error(
            ACTIVATION_BLOCK_SENTINEL,
          );
        },

      finalize:
        async () => {
          input.guards
            .finalizationCalls +=
            1;

          throw new Error(
            "VERIFICATION_FINALIZATION_MUST_NOT_RUN",
          );
        },
    },
  };
}

function assertExpectedActivationBlock(
  error: unknown,
): void {
  if (
    !(
      error instanceof
      MediaSyncWorkerOrchestrationError
    ) ||
    error.code !==
      "ACTIVATION_FAILED"
  ) {
    throw error;
  }

  const cause =
    error.cause;

  if (
    !(cause instanceof Error) ||
    cause.message !==
      ACTIVATION_BLOCK_SENTINEL
  ) {
    throw error;
  }
}

function validateCheckpointShape(
  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint,
): void {
  assert.equal(
    checkpoint.version,
    1,
  );

  assert.equal(
    checkpoint.dateWindowIndex,
    DATE_WINDOW_INDEX,
  );

  assert.equal(
    checkpoint.failedRows,
    0,
  );

  assert.equal(
    checkpoint.nextRowIndex,
    checkpoint.totalRows,
  );

  assert.ok(
    checkpoint.nextRowIndex >=
    0,
  );
}

function validatePartialResult(
  result: Awaited<
    ReturnType<
      typeof processClaimedNaverMediaSyncJob
    >
  >,
): asserts result is Extract<
  Awaited<
    ReturnType<
      typeof processClaimedNaverMediaSyncJob
    >
  >,
  { status: "partial" }
> {
  if (
    result.status !==
    "partial"
  ) {
    throw new Error(
      "VERIFICATION_RUN_MUST_BE_PARTIAL",
    );
  }

  assert.equal(
    result.snapshotIngestionId,
    null,
  );

  assert.equal(
    result.releasedJob.status,
    PENDING_STATUS,
  );

  assert.equal(
    result.checkpointJob.status,
    PROCESSING_STATUS,
  );

  assert.equal(
    result.staging.summary
      .isComplete,
    false,
  );
}

function readCanonicalEntityIdentity(
  row: EtrylueNormalizedMediaRow,
): string {
  const record =
    row as unknown as
      UnknownRecord;

  if (
    row.row_level ===
    "keyword"
  ) {
    return readRequiredString(
      row.external_keyword_id,
      "canonical_keyword_id",
    );
  }

  if (
    row.row_level ===
    "creative"
  ) {
    return readRequiredString(
      record.external_creative_id,
      "canonical_creative_id",
    );
  }

  if (
    row.row_level ===
    "mixed"
  ) {
    return readRequiredString(
      row.external_group_id,
      "canonical_group_id",
    );
  }

  throw new Error(
    "VERIFICATION_UNEXPECTED_CANONICAL_ROW_LEVEL",
  );
}

function validateStoredRows(
  input: {
    rows: readonly StoredStagingRow[];
    campaignPreflight:
      CampaignPreflight;
  },
): StoredRowsValidation {
  const rowIndexesContiguous =
    input.rows.every(
      (storedRow, index) =>
        Number(
          storedRow.row_index,
        ) === index &&
        storedRow
          .date_window_index ===
          DATE_WINDOW_INDEX,
    );

  const rowKeys =
    input.rows.map(
      (storedRow) =>
        storedRow.row_key,
    );

  const allRowKeysPresent =
    rowKeys.every(
      (rowKey) =>
        typeof rowKey ===
          "string" &&
        rowKey.length > 0,
    );

  const allRowKeysUnique =
    new Set(rowKeys).size ===
    rowKeys.length;

  const rowKeyGrains =
    new Map<
      string,
      Set<string>
    >();

  const entityDateKeys =
    new Set<string>();

  let duplicateEntityDateRows =
    0;

  const campaignGrains =
    new Map<
      string,
      Set<string>
    >();

  const campaignTotals =
    new Map<
      string,
      CampaignMetricTotal
    >();

  let rowsMatchCampaignContracts =
    true;

  let keywordRowsOnlyForWebSite =
    true;

  let shoppingRowsOnlyCreative =
    true;

  let brandRowsOnlyMixed =
    true;

  let datesWithinParityRange =
    true;

  let allFingerprintsPresent =
    true;

  const actualTotals:
    CampaignMetricTotal = {
      impressions: 0,
      clicks: 0,
    };

  for (
    const storedRow
    of input.rows
  ) {
    const row =
      storedRow.row;

    assert.equal(
      row.date,
      storedRow.date,
    );

    if (
      row.date <
        PARITY_DATE_FROM ||
      row.date >
        PARITY_DATE_TO
    ) {
      datesWithinParityRange =
        false;
    }

    assert.equal(
      row.provider,
      NAVER_PROVIDER,
    );

    assert.equal(
      row.ingestion_source,
      "api",
    );

    if (
      typeof storedRow
        .row_fingerprint !==
        "string" ||
      !FINGERPRINT_PATTERN.test(
        storedRow
          .row_fingerprint,
      )
    ) {
      allFingerprintsPresent =
        false;
    }

    const campaignId =
      readRequiredString(
        row.external_campaign_id,
        "canonical_campaign_id",
      );

    const contract =
      input.campaignPreflight
        .contractsByCampaignId
        .get(campaignId);

    if (!contract) {
      rowsMatchCampaignContracts =
        false;
    } else {
      if (
        row.row_level !==
          contract.canonicalRowLevel ||
        row.data_level !==
          contract.canonicalDataLevel ||
        row.row_level_reason !==
          contract.rowLevelReason
      ) {
        rowsMatchCampaignContracts =
          false;
      }

      if (
        contract.campaignType ===
          "WEB_SITE" &&
        row.row_level !==
          "keyword"
      ) {
        keywordRowsOnlyForWebSite =
          false;
      }

      if (
        contract.campaignType ===
          "SHOPPING" &&
        row.row_level !==
          "creative"
      ) {
        shoppingRowsOnlyCreative =
          false;
      }

      if (
        contract.campaignType ===
          "BRAND_SEARCH" &&
        row.row_level !==
          "mixed"
      ) {
        brandRowsOnlyMixed =
          false;
      }
    }

    const grainSet =
      campaignGrains.get(
        campaignId,
      ) ??
      new Set<string>();

    grainSet.add(
      row.row_level,
    );

    campaignGrains.set(
      campaignId,
      grainSet,
    );

    const rowKeyGrainSet =
      rowKeyGrains.get(
        storedRow.row_key,
      ) ??
      new Set<string>();

    rowKeyGrainSet.add(
      row.row_level,
    );

    rowKeyGrains.set(
      storedRow.row_key,
      rowKeyGrainSet,
    );

    const entityId =
      readCanonicalEntityIdentity(
        row,
      );

    const entityDateKey = [
      row.row_level,
      campaignId,
      entityId,
      row.date,
    ].join("|");

    if (
      entityDateKeys.has(
        entityDateKey,
      )
    ) {
      duplicateEntityDateRows +=
        1;
    } else {
      entityDateKeys.add(
        entityDateKey,
      );
    }

    const impressions =
      readNonNegativeMetric(
        row.impressions,
        "impressions",
      );

    const clicks =
      readNonNegativeMetric(
        row.clicks,
        "clicks",
      );

    actualTotals.impressions +=
      impressions;

    actualTotals.clicks +=
      clicks;

    const campaignTotal =
      campaignTotals.get(
        campaignId,
      ) ?? {
        impressions: 0,
        clicks: 0,
      };

    campaignTotal.impressions +=
      impressions;

    campaignTotal.clicks +=
      clicks;

    campaignTotals.set(
      campaignId,
      campaignTotal,
    );
  }

  const crossGrainDuplicateRowKeys =
    Array.from(
      rowKeyGrains.values(),
    ).filter(
      (grainSet) =>
        grainSet.size > 1,
    ).length;

  const oneAuthoritativeGrainPerCampaign =
    Array.from(
      campaignGrains.values(),
    ).every(
      (grainSet) =>
        grainSet.size === 1,
    ) &&
    EXPECTED_CAMPAIGNS.every(
      (expected) =>
        campaignGrains.get(
          expected.campaignId,
        )?.size === 1 &&
        campaignGrains.get(
          expected.campaignId,
        )?.has(
          expected.canonicalRowLevel,
        ) === true,
    );

  return {
    rowIndexesContiguous,
    allRowKeysPresent,
    allRowKeysUnique,
    crossGrainDuplicateRowKeys,
    duplicateEntityDateRows,
    allFingerprintsPresent,
    oneAuthoritativeGrainPerCampaign,
    rowsMatchCampaignContracts,
    keywordRowsOnlyForWebSite,
    shoppingRowsOnlyCreative,
    brandRowsOnlyMixed,
    datesWithinParityRange,
    actualTotals,
    campaignTotals,
  };
}

function createParityDifferences(
  validation:
    StoredRowsValidation,
): ParityDifference[] {
  return EXPECTED_CAMPAIGNS.map(
    (expected) => {
      const actual =
        validation.campaignTotals.get(
          expected.campaignId,
        ) ?? {
          impressions: 0,
          clicks: 0,
        };

      return {
        key:
          expected.key,
        campaignName:
          expected.displayName,
        campaignId:
          expected.campaignId,
        expectedImpressions:
          expected.expected
            .impressions,
        actualImpressions:
          actual.impressions,
        impressionDelta:
          actual.impressions -
          expected.expected
            .impressions,
        expectedClicks:
          expected.expected
            .clicks,
        actualClicks:
          actual.clicks,
        clickDelta:
          actual.clicks -
          expected.expected
            .clicks,
      };
    },
  );
}

function verifyKeywordAndAuthoritativeCursorsRemainSeparate(
  measurements:
    readonly ClaimMeasurement[],
  finalCheckpoint:
    NaverSearchAdsCombinedProcessingCheckpoint,
): boolean {
  if (
    !finalCheckpoint.keyword
      .cursor ||
    !finalCheckpoint.authoritative
      .cursor
  ) {
    return false;
  }

  const authoritativePhaseCheckpoints =
    measurements
      .map(
        (measurement) =>
          measurement.checkpoint,
      )
      .filter(
        (checkpoint) =>
          checkpoint.phase ===
            "authoritative" ||
          checkpoint.phase ===
            "completed",
      );

  if (
    authoritativePhaseCheckpoints.length ===
    0
  ) {
    return false;
  }

  const keywordCursorJson =
    stableJson(
      authoritativePhaseCheckpoints[0]
        ?.keyword.cursor,
    );

  const keywordCursorStable =
    authoritativePhaseCheckpoints.every(
      (checkpoint) =>
        checkpoint.keyword.complete &&
        stableJson(
          checkpoint.keyword.cursor,
        ) ===
          keywordCursorJson,
    );

  const cursorShapesSeparate =
    stableJson(
      finalCheckpoint.keyword
        .cursor,
    ) !==
    stableJson(
      finalCheckpoint.authoritative
        .cursor,
    );

  return (
    keywordCursorStable &&
    cursorShapesSeparate
  );
}

function sanitizeDiagnosticText(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value
    .slice(
      0,
      MAX_SAFE_DIAGNOSTIC_TEXT_LENGTH,
    )
    .replace(
      FORBIDDEN_DIAGNOSTIC_TEXT_PATTERN,
      "[redacted]",
    );
}

function readSafeErrorDiagnostic(
  value: unknown,
): Record<
  string,
  string | number | null
> {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return {
      name: null,
      code: null,
      message: null,
      details: null,
      hint: null,
      status: null,
      phase: null,
      campaignType: null,
      authoritativeGrain: null,
      nextRowIndex: null,
    };
  }

  const record =
    value as UnknownRecord;

  return {
    name:
      sanitizeDiagnosticText(
        record.name,
      ),
    code:
      sanitizeDiagnosticText(
        record.code,
      ),
    message:
      sanitizeDiagnosticText(
        record.message,
      ),
    details:
      sanitizeDiagnosticText(
        record.details,
      ),
    hint:
      sanitizeDiagnosticText(
        record.hint,
      ),
    status:
      typeof record.status ===
        "number"
        ? record.status
        : null,
    phase:
      sanitizeDiagnosticText(
        record.phase,
      ),
    campaignType:
      sanitizeDiagnosticText(
        record.campaignType,
      ),
    authoritativeGrain:
      sanitizeDiagnosticText(
        record.authoritativeGrain,
      ),
    nextRowIndex:
      typeof record.nextRowIndex ===
        "number"
        ? record.nextRowIndex
        : null,
  };
}

function readSafeErrorChain(
  error: unknown,
): Array<
  Record<
    string,
    string | number | null
  >
> {
  const diagnostics: Array<
    Record<
      string,
      string | number | null
    >
  > = [];

  let current: unknown =
    error;

  const visited =
    new Set<object>();

  for (
    let depth = 0;
    depth <
      MAX_NESTED_CAUSE_DEPTH;
    depth += 1
  ) {
    if (
      !current ||
      typeof current !==
        "object" ||
      visited.has(
        current,
      )
    ) {
      break;
    }

    visited.add(
      current,
    );

    diagnostics.push(
      readSafeErrorDiagnostic(
        current,
      ),
    );

    current =
      (current as UnknownRecord)
        .cause;
  }

  return diagnostics;
}

async function main():
  Promise<void> {
  const input =
    readVerificationInput();

  assertWorkerExplicitlyDisabled();

  let fixture:
    VerificationFixture | null =
      null;

  let databaseStateBefore:
    DatabaseState | null =
      null;

  let cleanupCompleted =
    false;

  let finalReportStateUnchanged =
    false;

  const guards:
    MaterializationGuards = {
      materializationCalls: 0,
      activationCalls: 0,
      finalizationCalls: 0,
    };

  const capture:
    MaterializationCapture = {
      result: null,
    };

  const retryMeasurements:
    RetryMeasurements = {
      keywordRetryCount: 0,
      authoritativeRetryCount: 0,
    };

  const claimMeasurements:
    ClaimMeasurement[] = [];

  console.log(
    "combined live materialization verification date range:",
    `${input.dateFrom} ~ ${input.dateTo}`,
  );

  console.log(
    "MEDIA_SYNC_WORKER_ENABLED:",
    0,
  );

  console.log(
    "maximum claim/run count:",
    MAX_CLAIM_RUNS,
  );

  console.log(
    "first claim forced partial limits:",
    JSON.stringify({
      maxKeywordStatsPerRun:
        MAX_KEYWORD_STATS_PER_RUN,
      maxStatsRequestsPerRun:
        MAX_STATS_REQUESTS_PER_RUN,
      maxAuthoritativeEntityStatsPerRun:
        MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN,
      maxAuthoritativeStatsRequestsPerRun:
        MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN,
    }),
  );

  console.log(
    "bounded resume limits after first claim:",
    JSON.stringify({
      maxKeywordStatsPerRun:
        RESUME_MAX_KEYWORD_STATS_PER_RUN,
      maxStatsRequestsPerRun:
        RESUME_MAX_STATS_REQUESTS_PER_RUN,
      maxAuthoritativeEntityStatsPerRun:
        RESUME_MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN,
      maxAuthoritativeStatsRequestsPerRun:
        RESUME_MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN,
      maxKeywordDiscoveryPagesPerRun:
        MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN,
      maxAuthoritativeDiscoveryPagesPerRun:
        MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN,
    }),
  );

  console.log(
    "materialization batch size:",
    MATERIALIZATION_BATCH_SIZE,
  );

  console.log(
    "real materialization enabled:",
    true,
  );

  console.log(
    "activation and finalization are blocked:",
    true,
  );

  try {
    /*
     * Read-only safety gate.
     * 하나라도 불일치하면 credential 복호화, Naver API 호출,
     * temporary job/staging/snapshot write 전에 중단한다.
     */
    const reportScope =
      await readReportScope(
        input,
      );

    const connectionScope =
      await readConnectionScope(
        input,
      );

    if (
      reportScope.workspaceId !==
        connectionScope.workspaceId ||
      reportScope.advertiserId !==
        connectionScope.advertiserId
    ) {
      throw new Error(
        "VERIFICATION_REPORT_CONNECTION_SCOPE_MISMATCH",
      );
    }

    await assertNoExistingPendingNaverJob();

    await assertNoExistingActiveJobForReport(
      input.reportId,
    );

    databaseStateBefore =
      await readDatabaseState(
        input.reportId,
      );

    console.log(
      "verified preflight report/workspace/advertiser/connection scope: true",
    );

    console.log(
      "verified existing pending Naver jobs before fixture: 0",
    );

    console.log(
      "verified existing active jobs for report before fixture: 0",
    );

    console.log(
      "saved initial database state:",
      JSON.stringify(
        databaseStateBefore,
      ),
    );

    /*
     * 기존 서버 전용 복호화 경로만 사용한다.
     * credential 원문은 어떤 로그에도 출력하지 않는다.
     */
    const decrypted =
      await decryptNaverSearchAdsConnection({
        connectionId:
          connectionScope.connectionId,
        workspaceId:
          connectionScope.workspaceId,
        advertiserId:
          connectionScope.advertiserId,
      });

    if (
      decrypted.credentials
        .customerId !==
      connectionScope
        .externalAccountId
    ) {
      throw new Error(
        "VERIFICATION_CREDENTIAL_SCOPE_MISMATCH",
      );
    }

    /*
     * temporary DB write 전에 실제 Search Ads campaign 응답을 전부 읽고
     * campaignType을 fail-closed로 확정한다.
     */
    const actualCampaigns =
      await fetchAllCampaigns(
        decrypted.credentials,
      );

    const campaignPreflight =
      validateCampaignPreflight(
        actualCampaigns,
      );

    console.log(
      "verified real Naver API campaign preflight count:",
      campaignPreflight
        .allCampaigns.length,
    );

    console.log(
      "verified real Naver API WEB_SITE campaign count:",
      campaignPreflight
        .keywordCampaigns.length,
    );

    console.log(
      "verified real Naver API SHOPPING/BRAND_SEARCH campaign count:",
      campaignPreflight
        .authoritativeCampaigns.length,
    );

    console.log(
      "verified real Naver API parity target campaign count:",
      campaignPreflight
        .selectedCampaigns.length,
    );

    console.log(
      "verified unsupported live campaign types blocked from staging:",
      campaignPreflight
        .unsupportedCampaigns.length,
    );

    if (
      campaignPreflight
        .unsupportedCampaigns.length > 0
    ) {
      console.log(
        "unsupported live campaign types:",
        JSON.stringify(
          campaignPreflight
            .unsupportedCampaigns
            .map(
              (campaign) => ({
                campaignId:
                  campaign.id,
                campaignType:
                  campaign.campaignType,
              }),
            ),
        ),
      );
    }

    const pendingJob =
      await createPendingMediaSyncJob({
        reportId:
          input.reportId,
        connectionId:
          input.connectionId,
        workspaceId:
          input.workspaceId,
        advertiserId:
          input.advertiserId,
        createdBy:
          input.createdBy,
        dateFrom:
          input.dateFrom,
        dateTo:
          input.dateTo,
        dataLevel:
          "mixed",
        mode:
          "snapshot_replace",
      });

    fixture = {
      jobId:
        pendingJob.id,
      reportId:
        pendingJob.report_id,
      workspaceId:
        pendingJob.workspace_id,
      advertiserId:
        pendingJob.advertiser_id,
      snapshotIngestionId:
        null,
    };

    const baseOptions =
      createBaseOptions({
        guards,
        capture,
        retryMeasurements,
        campaignPreflight,
      });

    let expectedActivationBlockObserved =
      false;

    for (
      let claimNumber = 1;
      claimNumber <=
        MAX_CLAIM_RUNS;
      claimNumber += 1
    ) {
      const claimedJob =
        await claimFixtureJob(
          fixture.jobId,
        );

      const checkpointBeforeRun =
        readNaverSearchAdsCombinedProcessingCheckpoint(
          claimedJob,
        );

      validateCheckpointShape(
        checkpointBeforeRun,
      );

      const runOptions:
        ProcessNaverMediaSyncJobOptions =
        claimNumber === 1
          ? baseOptions
          : {
              ...baseOptions,
              maxKeywordStatsPerRun:
                RESUME_MAX_KEYWORD_STATS_PER_RUN,
              maxStatsRequestsPerRun:
                RESUME_MAX_STATS_REQUESTS_PER_RUN,
              maxAuthoritativeEntityStatsPerRun:
                RESUME_MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN,
              maxAuthoritativeStatsRequestsPerRun:
                RESUME_MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN,
            };

      try {
        const result =
          await processClaimedNaverMediaSyncJob(
            claimedJob,
            runOptions,
          );

        validatePartialResult(
          result,
        );

        const checkpoint =
          readNaverSearchAdsCombinedProcessingCheckpoint(
            result.checkpointJob,
          );

        validateCheckpointShape(
          checkpoint,
        );

        const stagingRowCount =
          await readStagingRowCount(
            fixture.jobId,
          );

        assert.equal(
          stagingRowCount,
          checkpoint.totalRows,
        );

        claimMeasurements.push({
          claimNumber,
          attemptCount:
            claimedJob.attempt_count,
          status:
            "partial",
          checkpoint,
          stagingRowCount,
        });

        console.log(
          "bounded partial run:",
          JSON.stringify({
            claimNumber,
            attemptCount:
              claimedJob.attempt_count,
            phase:
              checkpoint.phase,
            nextRowIndex:
              checkpoint.nextRowIndex,
            stagingRowCount,
          }),
        );
      } catch (error) {
        assertExpectedActivationBlock(
          error,
        );

        expectedActivationBlockObserved =
          true;

        if (!capture.result) {
          throw new Error(
            "VERIFICATION_MATERIALIZATION_RESULT_NOT_CAPTURED",
          );
        }

        fixture.snapshotIngestionId =
          capture.result
            .snapshotIngestionId;

        const blockedJob =
          await readJobRecord(
            fixture.jobId,
          );

        const checkpoint =
          readNaverSearchAdsCombinedProcessingCheckpoint(
            blockedJob,
          );

        validateCheckpointShape(
          checkpoint,
        );

        assert.equal(
          checkpoint.phase,
          "completed",
        );

        const stagingRowCount =
          await readStagingRowCount(
            fixture.jobId,
          );

        assert.equal(
          stagingRowCount,
          checkpoint.totalRows,
        );

        claimMeasurements.push({
          claimNumber,
          attemptCount:
            claimedJob.attempt_count,
          status:
            "activation_blocked",
          checkpoint,
          stagingRowCount,
        });

        console.log(
          "real materialization completed and activation blocked:",
          JSON.stringify({
            claimNumber,
            attemptCount:
              claimedJob.attempt_count,
            nextRowIndex:
              checkpoint.nextRowIndex,
            stagingRowCount,
            snapshotIngestionId:
              capture.result
                .snapshotIngestionId,
          }),
        );

        break;
      }
    }

    if (
      !expectedActivationBlockObserved
    ) {
      throw new Error(
        "VERIFICATION_MAX_CLAIM_RUNS_EXCEEDED",
      );
    }

    assert.equal(
      guards.materializationCalls,
      1,
    );

    assert.equal(
      guards.activationCalls,
      1,
    );

    assert.equal(
      guards.finalizationCalls,
      0,
    );

    const materialization =
      capture.result;

    if (!materialization) {
      throw new Error(
        "VERIFICATION_MATERIALIZATION_RESULT_MISSING",
      );
    }

    fixture.snapshotIngestionId =
      materialization
        .snapshotIngestionId;

    const finalJob =
      await readJobRecord(
        fixture.jobId,
      );

    const finalCheckpoint =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        finalJob,
      );

    validateCheckpointShape(
      finalCheckpoint,
    );

    assert.equal(
      finalCheckpoint.phase,
      "completed",
    );

    assert.equal(
      finalCheckpoint.keyword
        .complete,
      true,
    );

    assert.equal(
      finalCheckpoint.authoritative
        .complete,
      true,
    );

    const storedRows =
      await readStoredStagingRows(
        fixture.jobId,
      );

    assert.ok(
      storedRows.length > 0,
    );

    assert.equal(
      storedRows.length,
      finalCheckpoint.totalRows,
    );

    const completeSummary =
      await getNaverSearchAdsCombinedStagingSummary({
        job:
          finalJob,
        expectedRows:
          finalCheckpoint.totalRows,
      });

    const storedRowsValidation =
      validateStoredRows({
        rows:
          storedRows,
        campaignPreflight,
      });

    const parityDifferences =
      createParityDifferences(
        storedRowsValidation,
      );

    const campaignParityMatches =
      parityDifferences.every(
        (difference) =>
          difference.impressionDelta ===
            0 &&
          difference.clickDelta ===
            0,
      );

    const totalParityMatches =
      storedRowsValidation
        .actualTotals
        .impressions ===
        EXPECTED_SEARCH_ADS_TOTAL
          .impressions &&
      storedRowsValidation
        .actualTotals
        .clicks ===
        EXPECTED_SEARCH_ADS_TOTAL
          .clicks;

    const combinedPartialResumeVerified =
      claimMeasurements.length >= 2 &&
      claimMeasurements.some(
        (measurement) =>
          measurement.status ===
          "partial",
      ) &&
      claimMeasurements[
        claimMeasurements.length - 1
      ]?.status ===
        "activation_blocked";

    const keywordAndAuthoritativeCursorsRemainSeparate =
      verifyKeywordAndAuthoritativeCursorsRemainSeparate(
        claimMeasurements,
        finalCheckpoint,
      );

    const nextRowIndexesMonotonic =
      claimMeasurements.every(
        (measurement, index) =>
          index === 0 ||
          measurement.checkpoint
            .nextRowIndex >=
            (
              claimMeasurements[
                index - 1
              ]?.checkpoint
                .nextRowIndex ??
              0
            ),
      );

    const claimAttemptCountsContiguous =
      claimMeasurements.every(
        (measurement, index) =>
          measurement.attemptCount ===
          index + 1,
      );

    const combinedRowIndexesContiguous =
      storedRowsValidation
        .rowIndexesContiguous &&
      completeSummary.minRowIndex ===
        0 &&
      completeSummary.maxRowIndex ===
        storedRows.length - 1 &&
      completeSummary
        .distinctRowIndexes ===
        storedRows.length &&
      completeSummary
        .missingExpectedRows ===
        0 &&
      completeSummary
        .outOfRangeRows ===
        0;

    const shoppingAuthoritativeGrainVerified =
      storedRowsValidation
        .shoppingRowsOnlyCreative &&
      EXPECTED_CAMPAIGNS
        .filter(
          (expected) =>
            expected.campaignType ===
            "SHOPPING",
        )
        .every(
          (expected) =>
            storedRowsValidation
              .campaignTotals
              .has(
                expected.campaignId,
              ),
        );

    const brandAuthoritativeGrainVerified =
      storedRowsValidation
        .brandRowsOnlyMixed &&
      EXPECTED_CAMPAIGNS
        .filter(
          (expected) =>
            expected.campaignType ===
            "BRAND_SEARCH",
        )
        .every(
          (expected) =>
            storedRowsValidation
              .campaignTotals
              .has(
                expected.campaignId,
              ),
        );

    const combinedSummaryComplete =
      completeSummary.isComplete &&
      completeSummary.totalRows ===
        storedRows.length &&
      completeSummary
        .scopeMismatchRows ===
        0 &&
      completeSummary
        .blankRowKeyRows ===
        0 &&
      completeSummary
        .missingFingerprintRows ===
        0 &&
      completeSummary
        .canonicalMismatchRows ===
        0;

    const snapshotIngestionCreated =
      finalJob
        .snapshot_ingestion_id ===
        materialization
          .snapshotIngestionId &&
      materialization.job
        .snapshot_ingestion_id ===
        materialization
          .snapshotIngestionId;

    const snapshotIngestionExists =
      await readSnapshotIngestionExists(
        fixture,
        materialization
          .snapshotIngestionId,
      );

    const materializedRows =
      await readMaterializedRows(
        fixture,
        materialization
          .snapshotIngestionId,
      );

    const materializedRowsValidation =
      validateMaterializedRows({
        fixture,
        ingestionId:
          materialization
            .snapshotIngestionId,
        stagingRows:
          storedRows,
        materializedRows,
      });

    const materializationFingerprintsMatch =
      FINGERPRINT_PATTERN.test(
        materialization
          .stagingFingerprint,
      ) &&
      FINGERPRINT_PATTERN.test(
        materialization
          .materializedFingerprint,
      ) &&
      materialization
        .stagingFingerprint ===
        materialization
          .materializedFingerprint;

    const materializationResultMatches =
      materialization
        .idempotent ===
        false &&
      materialization
        .rowCount ===
        storedRows.length &&
      materialization.job
        .status ===
        PROCESSING_STATUS &&
      snapshotIngestionCreated &&
      materializationFingerprintsMatch;

    const materializedTotalsMatchStaging =
      materializedRowsValidation
        .actualTotals
        .impressions ===
        storedRowsValidation
          .actualTotals
          .impressions &&
      materializedRowsValidation
        .actualTotals
        .clicks ===
        storedRowsValidation
          .actualTotals
          .clicks;

    const materializedTotalsMatchParity =
      materializedRowsValidation
        .actualTotals
        .impressions ===
        EXPECTED_SEARCH_ADS_TOTAL
          .impressions &&
      materializedRowsValidation
        .actualTotals
        .clicks ===
        EXPECTED_SEARCH_ADS_TOTAL
          .clicks;

    const databaseStateBeforeCleanup =
      await readDatabaseState(
        input.reportId,
      );

    const reportPointersUnchangedBeforeCleanup =
      databaseStateBefore
        .currentIngestionId ===
        databaseStateBeforeCleanup
          .currentIngestionId &&
      databaseStateBefore
        .publishedIngestionId ===
        databaseStateBeforeCleanup
          .publishedIngestionId;

    const temporaryReportRowsAdded =
      databaseStateBeforeCleanup
        .reportRowsCount ===
      databaseStateBefore
        .reportRowsCount +
        materialization.rowCount;

    const temporaryIngestionAdded =
      databaseStateBeforeCleanup
        .reportIngestionsCount ===
      databaseStateBefore
        .reportIngestionsCount +
        1;

    const temporaryJobAdded =
      databaseStateBeforeCleanup
        .reportJobsCount ===
      databaseStateBefore
        .reportJobsCount +
        1;

    const temporaryStagingRowsAdded =
      databaseStateBeforeCleanup
        .reportStagingRowsCount ===
      databaseStateBefore
        .reportStagingRowsCount +
        storedRows.length;

    const expectedSnapshotLinkedJobIds = [
      ...databaseStateBefore
        .snapshotLinkedJobIds,
      fixture.jobId,
    ].sort();

    const onlyFixtureSnapshotLinked =
      stableJson(
        databaseStateBeforeCleanup
          .snapshotLinkedJobIds,
      ) ===
      stableJson(
        expectedSnapshotLinkedJobIds,
      );

    cleanupCompleted =
      await cleanupFixture(
        fixture,
      );

    const databaseStateAfterCleanup =
      await readDatabaseState(
        input.reportId,
      );

    finalReportStateUnchanged =
      databaseStateMatches(
        databaseStateBefore,
        databaseStateAfterCleanup,
      );

    const parityMatches =
      campaignParityMatches &&
      totalParityMatches;

    if (!parityMatches) {
      console.error(
        "real Naver API parity changed:",
        true,
      );

      console.error(
        "actual Search Ads totals:",
        JSON.stringify(
          storedRowsValidation
            .actualTotals,
        ),
      );

      console.error(
        "previous parity Search Ads totals:",
        JSON.stringify(
          EXPECTED_SEARCH_ADS_TOTAL,
        ),
      );

      console.error(
        "campaign parity differences:",
        JSON.stringify(
          parityDifferences,
        ),
      );

      console.error(
        "source account data may have changed since the previous parity verification:",
        true,
      );
    }

    const verificationPassed =
      campaignPreflight
        .advoostExcluded &&
      campaignPreflight
        .unknownCampaignTypesFailClosed &&
      finalCheckpoint.keyword
        .complete &&
      finalCheckpoint.authoritative
        .complete &&
      combinedPartialResumeVerified &&
      keywordAndAuthoritativeCursorsRemainSeparate &&
      nextRowIndexesMonotonic &&
      claimAttemptCountsContiguous &&
      combinedRowIndexesContiguous &&
      storedRowsValidation
        .allRowKeysPresent &&
      storedRowsValidation
        .allRowKeysUnique &&
      storedRowsValidation
        .crossGrainDuplicateRowKeys ===
        0 &&
      storedRowsValidation
        .duplicateEntityDateRows ===
        0 &&
      storedRowsValidation
        .allFingerprintsPresent &&
      storedRowsValidation
        .oneAuthoritativeGrainPerCampaign &&
      storedRowsValidation
        .rowsMatchCampaignContracts &&
      storedRowsValidation
        .keywordRowsOnlyForWebSite &&
      storedRowsValidation
        .shoppingRowsOnlyCreative &&
      storedRowsValidation
        .brandRowsOnlyMixed &&
      storedRowsValidation
        .datesWithinParityRange &&
      shoppingAuthoritativeGrainVerified &&
      brandAuthoritativeGrainVerified &&
      combinedSummaryComplete &&
      parityMatches &&
      guards.materializationCalls ===
        1 &&
      guards.activationCalls ===
        1 &&
      guards.finalizationCalls ===
        0 &&
      materializationResultMatches &&
      snapshotIngestionExists &&
      materializedRowsValidation
        .rowCountMatches &&
      materializedRowsValidation
        .rowIndexesContiguous &&
      materializedRowsValidation
        .canonicalRowsMatchStaging &&
      materializedRowsValidation
        .scopeMatches &&
      materializedTotalsMatchStaging &&
      materializedTotalsMatchParity &&
      reportPointersUnchangedBeforeCleanup &&
      temporaryReportRowsAdded &&
      temporaryIngestionAdded &&
      temporaryJobAdded &&
      temporaryStagingRowsAdded &&
      onlyFixtureSnapshotLinked &&
      cleanupCompleted &&
      finalReportStateUnchanged;

    console.log(
      "verified real Naver API keyword phase:",
      finalCheckpoint.keyword
        .complete,
    );

    console.log(
      "verified real Naver API SHOPPING authoritative grain:",
      shoppingAuthoritativeGrainVerified
        ? "ad"
        : "invalid",
    );

    console.log(
      "verified real Naver API BRAND_SEARCH authoritative grain:",
      brandAuthoritativeGrainVerified
        ? "adgroup"
        : "invalid",
    );

    console.log(
      "verified ADVoost excluded from Search Ads staging:",
      campaignPreflight
        .advoostExcluded,
    );

    console.log(
      "verified unknown campaign types fail closed:",
      campaignPreflight
        .unknownCampaignTypesFailClosed,
    );

    console.log(
      "verified real DB combined partial/resume:",
      combinedPartialResumeVerified,
    );

    console.log(
      "verified keyword and authoritative cursors remain separate:",
      keywordAndAuthoritativeCursorsRemainSeparate,
    );

    console.log(
      "verified combined row indexes are contiguous:",
      combinedRowIndexesContiguous,
    );

    console.log(
      "verified one authoritative grain per campaign:",
      storedRowsValidation
        .oneAuthoritativeGrainPerCampaign,
    );

    console.log(
      "verified cross-grain duplicate staging row keys:",
      storedRowsValidation
        .crossGrainDuplicateRowKeys,
    );

    console.log(
      "verified duplicate entity/date canonical rows:",
      storedRowsValidation
        .duplicateEntityDateRows,
    );

    console.log(
      "verified all staging row fingerprints are present:",
      storedRowsValidation
        .allFingerprintsPresent,
    );

    console.log(
      "verified combined staging summary is complete:",
      combinedSummaryComplete,
    );

    console.log(
      "verified staging Search Ads impressions:",
      storedRowsValidation
        .actualTotals
        .impressions,
    );

    console.log(
      "verified staging Search Ads clicks:",
      storedRowsValidation
        .actualTotals
        .clicks,
    );

    console.log(
      "verified campaign parity details:",
      JSON.stringify(
        parityDifferences,
      ),
    );

    console.log(
      "verified real snapshot materialization row count:",
      materialization.rowCount,
    );

    console.log(
      "verified snapshot ingestion created:",
      snapshotIngestionCreated &&
      snapshotIngestionExists,
    );

    console.log(
      "verified staging and materialized fingerprints match:",
      materializationFingerprintsMatch,
    );

    console.log(
      "verified materialized report_rows count matches staging:",
      materializedRowsValidation
        .rowCountMatches,
    );

    console.log(
      "verified materialized report_rows row indexes are contiguous:",
      materializedRowsValidation
        .rowIndexesContiguous,
    );

    console.log(
      "verified materialized report_rows canonical values match staging:",
      materializedRowsValidation
        .canonicalRowsMatchStaging,
    );

    console.log(
      "verified materialized report_rows scope matches fixture:",
      materializedRowsValidation
        .scopeMatches,
    );

    console.log(
      "verified materialized Search Ads impressions:",
      materializedRowsValidation
        .actualTotals
        .impressions,
    );

    console.log(
      "verified materialized Search Ads clicks:",
      materializedRowsValidation
        .actualTotals
        .clicks,
    );

    console.log(
      "verified materialization calls:",
      guards.materializationCalls,
    );

    console.log(
      "verified activation blocker calls:",
      guards.activationCalls,
    );

    console.log(
      "verified finalization calls:",
      guards.finalizationCalls,
    );

    console.log(
      "verified current_ingestion_id remains unchanged before cleanup:",
      reportPointersUnchangedBeforeCleanup &&
      databaseStateBefore
        .currentIngestionId ===
        databaseStateBeforeCleanup
          .currentIngestionId,
    );

    console.log(
      "verified published_ingestion_id remains unchanged before cleanup:",
      reportPointersUnchangedBeforeCleanup &&
      databaseStateBefore
        .publishedIngestionId ===
        databaseStateBeforeCleanup
          .publishedIngestionId,
    );

    console.log(
      "verified temporary report_rows added before cleanup:",
      temporaryReportRowsAdded
        ? materialization.rowCount
        : "invalid",
    );

    console.log(
      "verified temporary report_ingestions added before cleanup:",
      temporaryIngestionAdded
        ? 1
        : "invalid",
    );

    console.log(
      "verified only fixture job links temporary snapshot:",
      onlyFixtureSnapshotLinked,
    );

    console.log(
      "verified temporary snapshot, staging, and job cleanup completed:",
      cleanupCompleted,
    );

    console.log(
      "verified current_ingestion_id remains unchanged after cleanup:",
      databaseStateBefore
        .currentIngestionId ===
        databaseStateAfterCleanup
          .currentIngestionId,
    );

    console.log(
      "verified published_ingestion_id remains unchanged after cleanup:",
      databaseStateBefore
        .publishedIngestionId ===
        databaseStateAfterCleanup
          .publishedIngestionId,
    );

    console.log(
      "verified report_rows count restored after cleanup:",
      databaseStateBefore
        .reportRowsCount ===
        databaseStateAfterCleanup
          .reportRowsCount,
    );

    console.log(
      "verified report_ingestions count restored after cleanup:",
      databaseStateBefore
        .reportIngestionsCount ===
        databaseStateAfterCleanup
          .reportIngestionsCount,
    );

    console.log(
      "verified bounded claim attempts:",
      claimMeasurements.map(
        (measurement) =>
          measurement.attemptCount,
      ).join(" / "),
    );

    console.log(
      "verified bounded nextRowIndex sequence:",
      claimMeasurements.map(
        (measurement) =>
          measurement.checkpoint
            .nextRowIndex,
      ).join(" / "),
    );

    console.log(
      "verified keyword collector retry count:",
      retryMeasurements
        .keywordRetryCount,
    );

    console.log(
      "verified authoritative collector retry count:",
      retryMeasurements
        .authoritativeRetryCount,
    );

    console.log(
      "fixture uses real Naver API:",
      true,
    );

    console.log(
      "fixture uses database:",
      true,
    );

    console.log(
      "fixture writes temporary staging:",
      true,
    );

    console.log(
      "fixture writes temporary report_rows:",
      true,
    );

    console.log(
      "fixture writes temporary report_ingestion:",
      true,
    );

    console.log(
      "fixture changes report pointers:",
      false,
    );

    console.log(
      "verification passed:",
      verificationPassed,
    );

    console.log(
      "final report state unchanged:",
      finalReportStateUnchanged,
    );

    if (!verificationPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (
      fixture &&
      !cleanupCompleted
    ) {
      try {
        const emergencyCleanupCompleted =
          await cleanupFixture(
            fixture,
          );

        console.log(
          "emergency cleanup completed:",
          emergencyCleanupCompleted,
        );

        cleanupCompleted =
          emergencyCleanupCompleted;

        if (!emergencyCleanupCompleted) {
          process.exitCode = 1;
        }
      } catch (cleanupError) {
        console.error(
          "emergency cleanup failed:",
          JSON.stringify(
            readSafeErrorChain(
              cleanupError,
            ),
          ),
        );

        process.exitCode = 1;
      }
    }

    if (
      databaseStateBefore !==
      null
    ) {
      try {
        const finalDatabaseState =
          await readDatabaseState(
            input.reportId,
          );

        finalReportStateUnchanged =
          databaseStateMatches(
            databaseStateBefore,
            finalDatabaseState,
          );

        console.log(
          "final report state unchanged:",
          finalReportStateUnchanged,
        );

        if (!finalReportStateUnchanged) {
          process.exitCode = 1;
        }
      } catch (finalStateError) {
        console.error(
          "final report state check failed:",
          JSON.stringify(
            readSafeErrorChain(
              finalStateError,
            ),
          ),
        );

        process.exitCode = 1;
      }
    }
  }
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
        MediaSyncWorkerOrchestrationError ||
      error instanceof
        MediaSyncCombinedProcessingCheckpointError ||
      error instanceof
        MediaSyncStagingSummaryError ||
      error instanceof
        MediaSyncSnapshotMaterializationError ||
      error instanceof
        MediaSyncJobsRepositoryError ||
      error instanceof
        MediaSyncWorkerRepositoryError ||
      error instanceof
        MediaConnectionsRepositoryError ||
      error instanceof
        NaverSearchAdsApiError ||
      error instanceof
        NaverSearchAdsAuthoritativeGrainError ||
      error instanceof Error
    ) {
      console.error(
        "combined live materialization verification failed:",
        JSON.stringify(
          readSafeErrorChain(
            error,
          ),
        ),
      );

      console.error(
        "verification passed:",
        false,
      );

      process.exitCode = 1;
      return;
    }

    console.error(
      "combined live materialization verification failed:",
      "UNKNOWN_ERROR",
    );

    console.error(
      "verification passed:",
      false,
    );

    process.exitCode = 1;
  },
);
