import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  activateMediaSyncSnapshot,
  MediaSyncSnapshotActivationError,
  type ActivateMediaSyncSnapshotInput,
  type MediaSyncSnapshotActivationResult,
} from "../src/lib/media-sync/media-sync-snapshot-activation-repository";
import {
  finalizeMediaSyncJob,
  MediaSyncFinalizationError,
  type MediaSyncFinalizationResult,
} from "../src/lib/media-sync/media-sync-finalization-repository";
import {
  processClaimedNaverMediaSyncJob,
  MediaSyncWorkerOrchestrationError,
  type ProcessNaverMediaSyncJobCompletedResult,
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

const EXPECTED_ROW_COUNT =
  118;

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

/*
 * Existing snapshots can contain hundreds of thousands of rows.
 * Avoid ORDER BY date scans on those snapshots during readiness checks.
 */
const MAX_DIRECT_SNAPSHOT_DATE_BOUND_ROWS =
  5_000;

const CLEANUP_DELETE_BATCH_SIZE =
  100;

const PRODUCTION_CUTOVER_GUARD_BLOCK_SENTINEL =
  "VERIFICATION_PRODUCTION_CUTOVER_GUARD_BLOCKED";

const PRODUCTION_CUTOVER_CONFIRMATION_ENV =
  "ETRYLUE_NAVER_SEARCHADS_PRODUCTION_CUTOVER_CONFIRM";

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

type ConnectionLifecycleState = {
  id: string;
  lastSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

type DatabaseState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;

  /**
   * report_rows 전체 exact count를 직접 수행하지 않는다.
   * 대용량 report_rows의 report_id count는 statement timeout이 날 수 있으므로,
   * report_ingestions.row_count 합계를 기존 snapshot 행 수의 lightweight 기준으로 사용한다.
   * fixture candidate 자체는 ingestion_id exact count로 별도 검증한다.
   */
  reportRowsMetadataCount: number;

  reportIngestionsCount: number;
  reportJobsCount: number;
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
  activationRpcCalls: number;
  finalizationCalls: number;
};

type MaterializationCapture = {
  result: MediaSyncSnapshotMaterializationResult | null;
  activationReadiness: ActivationReadinessResult | null;
  confirmationToken: string | null;
  activation: MediaSyncSnapshotActivationResult | null;
  finalization: MediaSyncFinalizationResult | null;
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

type SnapshotIngestionRecord = {
  id: string;
  workspaceId: string;
  reportId: string;
  kind: string;
  status: string;
  csvPath: string | null;
  rowCount: number;
  error: string | null;
  createdBy: string | null;
};

type SnapshotLinkedJobRecord = {
  id: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;
  provider: string;
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
  insertedRows: number;
  normalizedRows: number;
  failedRows: number;
  snapshotIngestionId: string;
  createdBy: string | null;
};

type SnapshotTargetRow = {
  id: string;
  row_index: number | string;
  date: string | null;
  row: EtrylueNormalizedMediaRow;
};

type SnapshotComparisonDescriptor = {
  ingestionId: string;
  ingestionKind: string;
  ingestionStatus: string;
  ingestionRowCount: number;
  actualRowCount: number;
  minDate: string | null;
  maxDate: string | null;
  linkedJobId: string | null;
  linkedJobDateFrom: string | null;
  linkedJobDateTo: string | null;
  completionFingerprint: string | null;
  targetRowsRead: boolean;
  targetRowCount: number | null;
  targetMinDate: string | null;
  targetMaxDate: string | null;
  targetImpressions: number | null;
  targetClicks: number | null;
  targetCanonicalFingerprint: string | null;
};

type ActivationReadinessComparison = {
  sameWholeSnapshotPeriod: boolean | null;
  wholeSnapshotRowCountDelta: number;
  targetRowCountDelta: number | null;
  targetImpressionDelta: number | null;
  targetClickDelta: number | null;
  completionFingerprintsEqual: boolean | null;
  targetCanonicalFingerprintsEqual: boolean | null;
};

type ActivationReadinessResult = {
  ready: boolean;
  activationInputScopeMatches: boolean;
  previousIngestionMatchesCurrentPointer: boolean;
  publishedPointerPreserved: boolean;
  candidateIsNotCurrentSnapshot: boolean;
  candidateIsNotPublishedSnapshot: boolean;
  candidateIngestionValid: boolean;
  candidateRowCountMatches: boolean;
  candidatePeriodMatches: boolean;
  candidateTotalsMatchParity: boolean;
  candidateCompletionFingerprintMatches: boolean;
  currentSnapshotComparisonLoaded: boolean;
  currentSnapshot: SnapshotComparisonDescriptor;
  candidateSnapshot: SnapshotComparisonDescriptor;
  comparison: ActivationReadinessComparison;
};

type RetryMeasurements = {
  keywordRetryCount: number;
  authoritativeRetryCount: number;
};

type ClaimMeasurement = {
  claimNumber: number;
  attemptCount: number;
  status: "partial" | "completed";
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

function readProductionCutoverConfirmationValue():
  string {
  return String(
    process.env[
      PRODUCTION_CUTOVER_CONFIRMATION_ENV
    ] ??
      "",
  ).trim();
}

function readRequiredProductionCutoverConfirmation():
  string {
  const value =
    readProductionCutoverConfirmationValue();

  if (!value) {
    throw new Error(
      "PRODUCTION_CUTOVER_CONFIRMATION_REQUIRED",
    );
  }

  return value;
}

function assertProductionCutoverConfirmationMatches(
  expectedToken: string,
): void {
  const actualToken =
    readRequiredProductionCutoverConfirmation();

  if (actualToken !== expectedToken) {
    const expectedParts =
      expectedToken.split(":");
    const actualParts =
      actualToken.split(":");

    const diagnostic = {
      prefixMatches:
        actualParts[0] === expectedParts[0],
      reportIdMatches:
        actualParts[1] === expectedParts[1],
      currentIngestionIdMatches:
        actualParts[2] === expectedParts[2],
      publishedIngestionIdMatches:
        actualParts[3] === expectedParts[3],
      dateFromMatches:
        actualParts[4] === expectedParts[4],
      dateToMatches:
        actualParts[5] === expectedParts[5],
      rowCountMatches:
        actualParts[6] === expectedParts[6],
      impressionsMatches:
        actualParts[7] === expectedParts[7],
      clicksMatches:
        actualParts[8] === expectedParts[8],
      canonicalFingerprintMatches:
        actualParts[9] === expectedParts[9],
      actualPartCount:
        actualParts.length,
      expectedPartCount:
        expectedParts.length,
      actualCanonicalFingerprint:
        actualParts[9] ?? null,
      expectedCanonicalFingerprint:
        expectedParts[9] ?? null,
    };

    console.error(
      "production cutover confirmation component mismatch:",
      JSON.stringify(diagnostic),
    );

    throw new Error(
      "PRODUCTION_CUTOVER_CONFIRMATION_TOKEN_MISMATCH",
    );
  }
}

function buildProductionCutoverConfirmationToken(
  input: {
    verificationInput:
      VerificationInput;
    databaseStateBefore:
      DatabaseState;
    rowCount: number;
    canonicalFingerprint: string;
  },
): string {
  if (
    !FINGERPRINT_PATTERN.test(
      input.canonicalFingerprint,
    )
  ) {
    throw new Error(
      "PRODUCTION_CUTOVER_INVALID_CANONICAL_FINGERPRINT",
    );
  }

  return [
    "CONFIRM_NAVER_SEARCHADS_PRODUCTION_CUTOVER",
    input.verificationInput
      .reportId,
    input.databaseStateBefore
      .currentIngestionId ??
      "NULL",
    input.databaseStateBefore
      .publishedIngestionId ??
      "NULL",
    input.verificationInput
      .dateFrom,
    input.verificationInput
      .dateTo,
    String(input.rowCount),
    String(
      EXPECTED_SEARCH_ADS_TOTAL
        .impressions,
    ),
    String(
      EXPECTED_SEARCH_ADS_TOTAL
        .clicks,
    ),
    input.canonicalFingerprint,
  ].join(":");
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

async function readReportRowsMetadataCount(
  reportId: string,
): Promise<number> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(REPORT_INGESTIONS_TABLE)
    .select("row_count")
    .eq(
      "report_id",
      reportId,
    );

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ROWS_METADATA_COUNT_FAILED",
      {
        cause: error,
      },
    );
  }

  const records =
    Array.isArray(data)
      ? data
      : [];

  let total = 0;

  for (
    const record
    of records
  ) {
    const rowCount =
      readNonNegativeIntegerValue(
        (record as {
          row_count?: unknown;
        }).row_count,
        "report_ingestion_row_count",
      );

    total += rowCount;

    if (!Number.isSafeInteger(total)) {
      throw new Error(
        "VERIFICATION_REPORT_ROWS_METADATA_COUNT_OVERFLOW",
      );
    }
  }

  return total;
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

async function readConnectionLifecycleState(
  connectionId: string,
): Promise<ConnectionLifecycleState> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .select(
      "id, last_sync_at, last_error, updated_at",
    )
    .eq(
      "id",
      connectionId,
    )
    .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "VERIFICATION_CONNECTION_LIFECYCLE_STATE_READ_FAILED",
      {
        cause:
          error ??
          undefined,
      },
    );
  }

  return {
    id:
      readRequiredString(
        data.id,
        "connection_id",
      ),
    lastSyncAt:
      readNullableString(
        data.last_sync_at,
      ),
    lastError:
      readNullableString(
        data.last_error,
      ),
    updatedAt:
      readRequiredString(
        data.updated_at,
        "connection_updated_at",
      ),
  };
}

function connectionLifecycleStateMatches(
  before:
    ConnectionLifecycleState,
  after:
    ConnectionLifecycleState,
): boolean {
  return (
    before.id ===
      after.id &&
    before.lastSyncAt ===
      after.lastSyncAt &&
    before.lastError ===
      after.lastError &&
    before.updatedAt ===
      after.updatedAt
  );
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

    reportRowsMetadataCount:
      await readReportRowsMetadataCount(
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
    before.reportRowsMetadataCount ===
      after.reportRowsMetadataCount &&
    before.reportIngestionsCount ===
      after.reportIngestionsCount &&
    before.reportJobsCount ===
      after.reportJobsCount &&
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


function readNonNegativeIntegerValue(
  value: unknown,
  fieldName: string,
): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < 0
  ) {
    throw new Error(
      `VERIFICATION_INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return numberValue;
}

function readOptionalNonNegativeMetric(
  value: unknown,
  fieldName: string,
): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 0;
  }

  return readNonNegativeMetric(
    value,
    fieldName,
  );
}

async function readSnapshotIngestionRecord(
  fixture: VerificationFixture,
  ingestionId: string,
): Promise<SnapshotIngestionRecord> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(REPORT_INGESTIONS_TABLE)
    .select("*")
    .eq("id", ingestionId)
    .eq("report_id", fixture.reportId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "VERIFICATION_SNAPSHOT_INGESTION_READ_FAILED",
      {
        cause:
          error ?? undefined,
      },
    );
  }

  const record =
    data as unknown as
      UnknownRecord;

  return {
    id:
      readRequiredString(
        record.id,
        "snapshot_ingestion_id",
      ),
    workspaceId:
      readRequiredString(
        record.workspace_id,
        "snapshot_ingestion_workspace_id",
      ),
    reportId:
      readRequiredString(
        record.report_id,
        "snapshot_ingestion_report_id",
      ),
    kind:
      readRequiredString(
        record.kind,
        "snapshot_ingestion_kind",
      ),
    status:
      readRequiredString(
        record.status,
        "snapshot_ingestion_status",
      ),
    csvPath:
      readNullableString(
        record.csv_path,
      ),
    rowCount:
      readNonNegativeIntegerValue(
        record.row_count,
        "snapshot_ingestion_row_count",
      ),
    error:
      readNullableString(
        record.error,
      ),
    createdBy:
      readNullableString(
        record.created_by,
      ),
  };
}

async function readSnapshotLinkedJob(
  fixture: VerificationFixture,
  ingestionId: string,
): Promise<SnapshotLinkedJobRecord | null> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select(
      [
        "id",
        "report_id",
        "workspace_id",
        "advertiser_id",
        "connection_id",
        "provider",
        "external_account_id",
        "date_from",
        "date_to",
        "inserted_rows",
        "normalized_rows",
        "failed_rows",
        "snapshot_ingestion_id",
        "created_by",
      ].join(", "),
    )
    .eq("report_id", fixture.reportId)
    .eq(
      "snapshot_ingestion_id",
      ingestionId,
    )
    .order(
      "updated_at",
      { ascending: false },
    )
    .limit(1);

  if (error || !Array.isArray(data)) {
    throw new Error(
      "VERIFICATION_SNAPSHOT_LINKED_JOB_READ_FAILED",
      {
        cause:
          error ?? undefined,
      },
    );
  }

  if (data.length === 0) {
    return null;
  }

  const record =
    data[0] as unknown as
      UnknownRecord;

  return {
    id:
      readRequiredString(
        record.id,
        "linked_job_id",
      ),
    reportId:
      readRequiredString(
        record.report_id,
        "linked_job_report_id",
      ),
    workspaceId:
      readRequiredString(
        record.workspace_id,
        "linked_job_workspace_id",
      ),
    advertiserId:
      readRequiredString(
        record.advertiser_id,
        "linked_job_advertiser_id",
      ),
    connectionId:
      readRequiredString(
        record.connection_id,
        "linked_job_connection_id",
      ),
    provider:
      readRequiredString(
        record.provider,
        "linked_job_provider",
      ),
    externalAccountId:
      readRequiredString(
        record.external_account_id,
        "linked_job_external_account_id",
      ),
    dateFrom:
      readRequiredString(
        record.date_from,
        "linked_job_date_from",
      ),
    dateTo:
      readRequiredString(
        record.date_to,
        "linked_job_date_to",
      ),
    insertedRows:
      readNonNegativeIntegerValue(
        record.inserted_rows,
        "linked_job_inserted_rows",
      ),
    normalizedRows:
      readNonNegativeIntegerValue(
        record.normalized_rows,
        "linked_job_normalized_rows",
      ),
    failedRows:
      readNonNegativeIntegerValue(
        record.failed_rows,
        "linked_job_failed_rows",
      ),
    snapshotIngestionId:
      readRequiredString(
        record.snapshot_ingestion_id,
        "linked_job_snapshot_ingestion_id",
      ),
    createdBy:
      readNullableString(
        record.created_by,
      ),
  };
}

async function readSnapshotDateBounds(
  fixture: VerificationFixture,
  ingestionId: string,
): Promise<{
  minDate: string | null;
  maxDate: string | null;
}> {
  const supabase =
    getSupabaseAdmin();

  const [
    firstResult,
    lastResult,
  ] = await Promise.all([
    supabase
      .from(REPORT_ROWS_TABLE)
      .select("date")
      .eq("report_id", fixture.reportId)
      .eq("ingestion_id", ingestionId)
      .not("date", "is", null)
      .order("date", { ascending: true })
      .limit(1),
    supabase
      .from(REPORT_ROWS_TABLE)
      .select("date")
      .eq("report_id", fixture.reportId)
      .eq("ingestion_id", ingestionId)
      .not("date", "is", null)
      .order("date", { ascending: false })
      .limit(1),
  ]);

  if (
    firstResult.error ||
    lastResult.error ||
    !Array.isArray(firstResult.data) ||
    !Array.isArray(lastResult.data)
  ) {
    throw new Error(
      "VERIFICATION_SNAPSHOT_DATE_BOUNDS_READ_FAILED",
      {
        cause:
          firstResult.error ??
          lastResult.error ??
          undefined,
      },
    );
  }

  return {
    minDate:
      readNullableString(
        firstResult.data[0]?.date,
      ),
    maxDate:
      readNullableString(
        lastResult.data[0]?.date,
      ),
  };
}

async function readSnapshotTargetRows(
  fixture: VerificationFixture,
  ingestionId: string,
  dateFrom: string,
  dateTo: string,
): Promise<SnapshotTargetRow[]> {
  const supabase =
    getSupabaseAdmin();

  const rows:
    SnapshotTargetRow[] = [];

  for (
    const expectedCampaign
    of EXPECTED_CAMPAIGNS
  ) {
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
          "id, row_index, date, row",
        )
        .eq("report_id", fixture.reportId)
        .eq("ingestion_id", ingestionId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .contains(
          "row",
          {
            external_campaign_id:
              expectedCampaign.campaignId,
          },
        )
        .order(
          "row_index",
          { ascending: true },
        )
        .range(
          offset,
          offset +
            DATABASE_PAGE_SIZE -
            1,
        );

      if (error || !Array.isArray(data)) {
        throw new Error(
          "VERIFICATION_SNAPSHOT_TARGET_ROWS_READ_FAILED",
          {
            cause:
              error ?? undefined,
          },
        );
      }

      rows.push(
        ...(
          data as unknown as
            SnapshotTargetRow[]
        ),
      );

      if (
        data.length <
        DATABASE_PAGE_SIZE
      ) {
        break;
      }
    }
  }

  return rows;
}

function createCompletionFingerprint(input: {
  jobId: string;
  reportId: string;
  snapshotIngestionId: string;
  expectedRows: number;
}): string {
  if (
    input.expectedRows <= 0 ||
    !Number.isSafeInteger(
      input.expectedRows,
    )
  ) {
    throw new Error(
      "VERIFICATION_INVALID_COMPLETION_FINGERPRINT_ROW_COUNT",
    );
  }

  const lastRowIndex =
    input.expectedRows - 1;

  return createHash("sha256")
    .update(
      [
        input.jobId,
        input.reportId,
        input.snapshotIngestionId,
        input.expectedRows,
        0,
        lastRowIndex,
        0,
        lastRowIndex,
      ].join(":"),
      "utf8",
    )
    .digest("hex");
}

function createTargetCanonicalFingerprint(
  rows: readonly SnapshotTargetRow[],
): string {
  const normalizedRows =
    rows
      .map(
        (record) => {
          const row =
            record.row;

          return {
            date:
              readNullableString(
                record.date,
              ) ??
              readNullableString(
                row.date,
              ),
            campaignId:
              readNullableString(
                row.external_campaign_id,
              ),
            groupId:
              readNullableString(
                row.external_group_id,
              ),
            keywordId:
              readNullableString(
                row.external_keyword_id,
              ),
            creativeId:
              readNullableString(
                row.external_creative_id,
              ),
            rowLevel:
              readNullableString(
                row.row_level,
              ),
            dataLevel:
              readNullableString(
                row.data_level,
              ),
            impressions:
              readOptionalNonNegativeMetric(
                row.impressions,
                "snapshot_target_impressions",
              ),
            clicks:
              readOptionalNonNegativeMetric(
                row.clicks,
                "snapshot_target_clicks",
              ),
            cost:
              readOptionalNonNegativeMetric(
                row.cost,
                "snapshot_target_cost",
              ),
            conversions:
              readOptionalNonNegativeMetric(
                row.conversions,
                "snapshot_target_conversions",
              ),
            revenue:
              readOptionalNonNegativeMetric(
                row.revenue,
                "snapshot_target_revenue",
              ),
          };
        },
      )
      .sort(
        (left, right) =>
          stableJson(left)
            .localeCompare(
              stableJson(right),
            ),
      );

  return createHash("sha256")
    .update(
      stableJson(
        normalizedRows,
      ),
      "utf8",
    )
    .digest("hex");
}

function summarizeSnapshotTargetRows(
  rows: readonly SnapshotTargetRow[],
): {
  rowCount: number;
  minDate: string | null;
  maxDate: string | null;
  impressions: number;
  clicks: number;
  canonicalFingerprint: string;
} {
  let minDate:
    string | null = null;
  let maxDate:
    string | null = null;
  let impressions = 0;
  let clicks = 0;

  for (const record of rows) {
    const date =
      readNullableString(
        record.date,
      ) ??
      readNullableString(
        record.row.date,
      );

    if (date) {
      if (
        minDate === null ||
        date.localeCompare(
          minDate,
        ) < 0
      ) {
        minDate = date;
      }

      if (
        maxDate === null ||
        date.localeCompare(
          maxDate,
        ) > 0
      ) {
        maxDate = date;
      }
    }

    impressions +=
      readOptionalNonNegativeMetric(
        record.row.impressions,
        "snapshot_target_impressions",
      );

    clicks +=
      readOptionalNonNegativeMetric(
        record.row.clicks,
        "snapshot_target_clicks",
      );
  }

  return {
    rowCount:
      rows.length,
    minDate,
    maxDate,
    impressions,
    clicks,
    canonicalFingerprint:
      createTargetCanonicalFingerprint(
        rows,
      ),
  };
}

async function createSnapshotComparisonDescriptor(input: {
  fixture: VerificationFixture;
  ingestionId: string;
  dateFrom: string;
  dateTo: string;
  readTargetRows: boolean;
  knownCompletionFingerprint?: string | null;
}): Promise<SnapshotComparisonDescriptor> {
  const ingestion =
    await readSnapshotIngestionRecord(
      input.fixture,
      input.ingestionId,
    );

  const linkedJob =
    await readSnapshotLinkedJob(
      input.fixture,
      input.ingestionId,
    );

  /*
   * Candidate snapshots are small and must be verified against actual rows.
   * Existing current snapshots can be very large; their authoritative row
   * count is already stored on report_ingestions and is sufficient for the
   * read-only comparison side of activation readiness.
   */
  const actualRowCount =
    input.readTargetRows
      ? await readExactCount(
          REPORT_ROWS_TABLE,
          "ingestion_id",
          input.ingestionId,
        )
      : ingestion.rowCount;

  /*
   * Activation readiness must not sort a large existing snapshot only to
   * rediscover the date scope already stored on its linked media_sync_job.
   *
   * The candidate snapshot is still validated against actual target rows
   * below. For a legacy/non-API ingestion with no linked job, direct date
   * bounds are read only when the snapshot is small enough to remain a
   * lightweight verification query.
   */
  const dateBounds =
    linkedJob
      ? {
          minDate:
            linkedJob.dateFrom,
          maxDate:
            linkedJob.dateTo,
        }
      : actualRowCount <=
          MAX_DIRECT_SNAPSHOT_DATE_BOUND_ROWS
        ? await readSnapshotDateBounds(
            input.fixture,
            input.ingestionId,
          )
        : {
            minDate: null,
            maxDate: null,
          };

  /*
   * Exact target-row comparison is mandatory for the 118-row candidate.
   * The existing current snapshot is metadata-only here: scanning hundreds
   * of thousands of rows is not part of the activation RPC contract and can
   * exceed the database statement timeout.
   */
  const target =
    input.readTargetRows
      ? summarizeSnapshotTargetRows(
          await readSnapshotTargetRows(
            input.fixture,
            input.ingestionId,
            input.dateFrom,
            input.dateTo,
          ),
        )
      : null;

  let completionFingerprint =
    input.knownCompletionFingerprint ??
    null;

  if (
    completionFingerprint === null &&
    linkedJob &&
    linkedJob.insertedRows > 0 &&
    linkedJob.insertedRows ===
      linkedJob.normalizedRows &&
    linkedJob.failedRows === 0
  ) {
    completionFingerprint =
      createCompletionFingerprint({
        jobId:
          linkedJob.id,
        reportId:
          linkedJob.reportId,
        snapshotIngestionId:
          linkedJob.snapshotIngestionId,
        expectedRows:
          linkedJob.insertedRows,
      });
  }

  return {
    ingestionId:
      ingestion.id,
    ingestionKind:
      ingestion.kind,
    ingestionStatus:
      ingestion.status,
    ingestionRowCount:
      ingestion.rowCount,
    actualRowCount,
    minDate:
      dateBounds.minDate,
    maxDate:
      dateBounds.maxDate,
    linkedJobId:
      linkedJob?.id ??
      null,
    linkedJobDateFrom:
      linkedJob?.dateFrom ??
      null,
    linkedJobDateTo:
      linkedJob?.dateTo ??
      null,
    completionFingerprint,
    targetRowsRead:
      input.readTargetRows,
    targetRowCount:
      target?.rowCount ?? null,
    targetMinDate:
      target?.minDate ?? null,
    targetMaxDate:
      target?.maxDate ?? null,
    targetImpressions:
      target?.impressions ?? null,
    targetClicks:
      target?.clicks ?? null,
    targetCanonicalFingerprint:
      target?.canonicalFingerprint ?? null,
  };
}

async function verifyActivationReadiness(input: {
  activationInput:
    ActivateMediaSyncSnapshotInput;
  materialization:
    MediaSyncSnapshotMaterializationResult;
  fixture:
    VerificationFixture;
  databaseStateBefore:
    DatabaseState;
  dateFrom: string;
  dateTo: string;
}): Promise<ActivationReadinessResult> {
  const reportResult =
    await getSupabaseAdmin()
      .from(REPORTS_TABLE)
      .select(
        "id, workspace_id, advertiser_id, current_ingestion_id, published_ingestion_id",
      )
      .eq(
        "id",
        input.fixture.reportId,
      )
      .maybeSingle();

  if (
    reportResult.error ||
    !reportResult.data
  ) {
    throw new Error(
      "VERIFICATION_ACTIVATION_REPORT_READ_FAILED",
      {
        cause:
          reportResult.error ??
          undefined,
      },
    );
  }

  const report =
    reportResult.data as unknown as
      UnknownRecord;

  const currentIngestionId =
    readNullableString(
      report.current_ingestion_id,
    );

  const publishedIngestionId =
    readNullableString(
      report.published_ingestion_id,
    );

  if (!currentIngestionId) {
    throw new Error(
      "VERIFICATION_CURRENT_SNAPSHOT_REQUIRED",
    );
  }

  const job =
    input.activationInput.job;

  const activationInputScopeMatches =
    job.id ===
      input.fixture.jobId &&
    job.report_id ===
      input.fixture.reportId &&
    job.workspace_id ===
      input.fixture.workspaceId &&
    job.advertiser_id ===
      input.fixture.advertiserId &&
    job.provider ===
      NAVER_PROVIDER &&
    job.mode ===
      "snapshot_replace" &&
    job.status ===
      PROCESSING_STATUS &&
    job.snapshot_ingestion_id ===
      input.materialization
        .snapshotIngestionId &&
    input.activationInput
      .expectedRows ===
      input.materialization
        .rowCount &&
    job.inserted_rows ===
      input.activationInput
        .expectedRows &&
    job.normalized_rows ===
      input.activationInput
        .expectedRows &&
    job.failed_rows === 0;

  const previousIngestionMatchesCurrentPointer =
    job.previous_ingestion_id ===
      currentIngestionId &&
    currentIngestionId ===
      input.databaseStateBefore
        .currentIngestionId;

  const publishedPointerPreserved =
    publishedIngestionId ===
      input.databaseStateBefore
        .publishedIngestionId;

  const candidateIsNotCurrentSnapshot =
    input.materialization
      .snapshotIngestionId !==
      currentIngestionId;

  const candidateIsNotPublishedSnapshot =
    input.materialization
      .snapshotIngestionId !==
      publishedIngestionId;

  const candidateIngestion =
    await readSnapshotIngestionRecord(
      input.fixture,
      input.materialization
        .snapshotIngestionId,
    );

  const candidateIngestionValid =
    candidateIngestion.workspaceId ===
      input.fixture.workspaceId &&
    candidateIngestion.reportId ===
      input.fixture.reportId &&
    candidateIngestion.kind ===
      "api" &&
    candidateIngestion.status ===
      "success" &&
    candidateIngestion.csvPath ===
      null &&
    candidateIngestion.error ===
      null &&
    candidateIngestion.createdBy ===
      job.created_by;

  const candidateSnapshot =
    await createSnapshotComparisonDescriptor({
      fixture:
        input.fixture,
      ingestionId:
        input.materialization
          .snapshotIngestionId,
      dateFrom:
        input.dateFrom,
      dateTo:
        input.dateTo,
      readTargetRows:
        true,
      knownCompletionFingerprint:
        input.materialization
          .materializedFingerprint,
    });

  const currentSnapshot =
    await createSnapshotComparisonDescriptor({
      fixture:
        input.fixture,
      ingestionId:
        currentIngestionId,
      dateFrom:
        input.dateFrom,
      dateTo:
        input.dateTo,
      readTargetRows:
        false,
    });

  const candidateRowCountMatches =
    candidateIngestion.rowCount ===
      input.activationInput
        .expectedRows &&
    candidateSnapshot.actualRowCount ===
      input.activationInput
        .expectedRows &&
    candidateSnapshot.ingestionRowCount ===
      input.activationInput
        .expectedRows;

  const candidatePeriodMatches =
    candidateSnapshot.targetRowsRead &&
    candidateSnapshot.minDate ===
      input.dateFrom &&
    candidateSnapshot.maxDate ===
      input.dateTo &&
    candidateSnapshot.targetMinDate ===
      input.dateFrom &&
    candidateSnapshot.targetMaxDate ===
      input.dateTo;

  const candidateTotalsMatchParity =
    candidateSnapshot.targetRowsRead &&
    candidateSnapshot.targetImpressions ===
      EXPECTED_SEARCH_ADS_TOTAL
        .impressions &&
    candidateSnapshot.targetClicks ===
      EXPECTED_SEARCH_ADS_TOTAL
        .clicks;

  const expectedCandidateCompletionFingerprint =
    createCompletionFingerprint({
      jobId:
        job.id,
      reportId:
        job.report_id,
      snapshotIngestionId:
        input.materialization
          .snapshotIngestionId,
      expectedRows:
        input.activationInput
          .expectedRows,
    });

  const candidateCompletionFingerprintMatches =
    FINGERPRINT_PATTERN.test(
      expectedCandidateCompletionFingerprint,
    ) &&
    expectedCandidateCompletionFingerprint ===
      input.materialization
        .stagingFingerprint &&
    expectedCandidateCompletionFingerprint ===
      input.materialization
        .materializedFingerprint &&
    candidateSnapshot
      .completionFingerprint ===
      expectedCandidateCompletionFingerprint;

  const currentSnapshotComparisonLoaded =
    currentSnapshot.ingestionId ===
      currentIngestionId &&
    currentSnapshot.actualRowCount >= 0 &&
    currentSnapshot.ingestionRowCount >= 0 &&
    currentSnapshot.targetRowsRead ===
      false;

  const comparison:
    ActivationReadinessComparison = {
      sameWholeSnapshotPeriod:
        currentSnapshot.minDate &&
        currentSnapshot.maxDate
          ? currentSnapshot.minDate ===
              candidateSnapshot.minDate &&
            currentSnapshot.maxDate ===
              candidateSnapshot.maxDate
          : null,
      wholeSnapshotRowCountDelta:
        candidateSnapshot.actualRowCount -
        currentSnapshot.actualRowCount,
      targetRowCountDelta:
        currentSnapshot.targetRowCount !==
            null &&
          candidateSnapshot.targetRowCount !==
            null
          ? candidateSnapshot.targetRowCount -
            currentSnapshot.targetRowCount
          : null,
      targetImpressionDelta:
        currentSnapshot.targetImpressions !==
            null &&
          candidateSnapshot.targetImpressions !==
            null
          ? candidateSnapshot.targetImpressions -
            currentSnapshot.targetImpressions
          : null,
      targetClickDelta:
        currentSnapshot.targetClicks !==
            null &&
          candidateSnapshot.targetClicks !==
            null
          ? candidateSnapshot.targetClicks -
            currentSnapshot.targetClicks
          : null,
      completionFingerprintsEqual:
        currentSnapshot
          .completionFingerprint
          ? currentSnapshot
              .completionFingerprint ===
            candidateSnapshot
              .completionFingerprint
          : null,
      targetCanonicalFingerprintsEqual:
        currentSnapshot
            .targetCanonicalFingerprint !==
            null &&
          candidateSnapshot
            .targetCanonicalFingerprint !==
            null
          ? currentSnapshot
              .targetCanonicalFingerprint ===
            candidateSnapshot
              .targetCanonicalFingerprint
          : null,
    };

  const ready =
    activationInputScopeMatches &&
    previousIngestionMatchesCurrentPointer &&
    publishedPointerPreserved &&
    candidateIsNotCurrentSnapshot &&
    candidateIsNotPublishedSnapshot &&
    candidateIngestionValid &&
    candidateRowCountMatches &&
    candidatePeriodMatches &&
    candidateTotalsMatchParity &&
    candidateCompletionFingerprintMatches &&
    currentSnapshotComparisonLoaded;

  return {
    ready,
    activationInputScopeMatches,
    previousIngestionMatchesCurrentPointer,
    publishedPointerPreserved,
    candidateIsNotCurrentSnapshot,
    candidateIsNotPublishedSnapshot,
    candidateIngestionValid,
    candidateRowCountMatches,
    candidatePeriodMatches,
    candidateTotalsMatchParity,
    candidateCompletionFingerprintMatches,
    currentSnapshotComparisonLoaded,
    currentSnapshot,
    candidateSnapshot,
    comparison,
  };
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
    fixture:
      VerificationFixture;
    databaseStateBefore:
      DatabaseState;
    verificationInput:
      VerificationInput;
    onActivationCommitted:
      () => void;
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
            .materializationCalls += 1;

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
            .activationCalls += 1;

          const materialization =
            input.capture.result;

          if (!materialization) {
            throw new Error(
              "PRODUCTION_CUTOVER_MATERIALIZATION_RESULT_MISSING",
            );
          }

          assert.equal(
            materialization.rowCount,
            EXPECTED_ROW_COUNT,
          );

          assert.equal(
            activationInput.expectedRows,
            EXPECTED_ROW_COUNT,
          );

          const readiness =
            await verifyActivationReadiness({
              activationInput,
              materialization,
              fixture:
                input.fixture,
              databaseStateBefore:
                input.databaseStateBefore,
              dateFrom:
                input.verificationInput
                  .dateFrom,
              dateTo:
                input.verificationInput
                  .dateTo,
            });

          input.capture
            .activationReadiness =
            readiness;

          if (!readiness.ready) {
            throw new Error(
              "PRODUCTION_CUTOVER_ACTIVATION_READINESS_FAILED",
            );
          }

          const candidateCanonicalFingerprint =
            readiness
              .candidateSnapshot
              .targetCanonicalFingerprint;

          if (!candidateCanonicalFingerprint) {
            throw new Error(
              "PRODUCTION_CUTOVER_CANDIDATE_CANONICAL_FINGERPRINT_MISSING",
            );
          }

          const confirmationToken =
            buildProductionCutoverConfirmationToken({
              verificationInput:
                input.verificationInput,
              databaseStateBefore:
                input.databaseStateBefore,
              rowCount:
                materialization.rowCount,
              canonicalFingerprint:
                candidateCanonicalFingerprint,
            });

          input.capture
            .confirmationToken =
            confirmationToken;

          assertProductionCutoverConfirmationMatches(
            confirmationToken,
          );

          /*
           * 최종 TOCTOU gate: activation RPC 직전에 pointer를 다시 읽는다.
           * guard token을 만든 기준 pointer와 하나라도 다르면 중단한다.
           */
          const stateImmediatelyBeforeActivation =
            await readDatabaseState(
              input.fixture.reportId,
            );

          assert.equal(
            stateImmediatelyBeforeActivation
              .currentIngestionId,
            input.databaseStateBefore
              .currentIngestionId,
          );

          assert.equal(
            stateImmediatelyBeforeActivation
              .publishedIngestionId,
            input.databaseStateBefore
              .publishedIngestionId,
          );

          input.guards
            .activationRpcCalls += 1;

          const result =
            await activateMediaSyncSnapshot(
              activationInput,
            );

          /*
           * RPC가 정상 반환된 즉시 activation commit을 기록한다.
           * 이후 결과 검증 또는 finalization이 실패해도 active snapshot을 cleanup하지 않는다.
           */
          input.onActivationCommitted();

          assert.equal(
            result.currentIngestionId,
            materialization
              .snapshotIngestionId,
          );

          assert.equal(
            result.publishedIngestionId,
            input.databaseStateBefore
              .publishedIngestionId,
          );

          assert.equal(
            result.rowCount,
            EXPECTED_ROW_COUNT,
          );

          assert.equal(
            result.materializedFingerprint,
            materialization
              .materializedFingerprint,
          );

          input.capture.activation =
            result;

          return result;
        },

      finalize:
        async (
          finalizationInput,
        ) => {
          input.guards
            .finalizationCalls += 1;

          const activation =
            input.capture.activation;

          if (!activation) {
            throw new Error(
              "PRODUCTION_CUTOVER_ACTIVATION_RESULT_MISSING",
            );
          }

          const result =
            await finalizeMediaSyncJob(
              finalizationInput,
            );

          assert.equal(
            result.currentIngestionId,
            activation.currentIngestionId,
          );

          assert.equal(
            result.publishedIngestionId,
            input.databaseStateBefore
              .publishedIngestionId,
          );

          assert.equal(
            result.rowCount,
            EXPECTED_ROW_COUNT,
          );

          input.capture.finalization =
            result;

          return result;
        },
    },
  };
}

function assertExpectedProductionCutoverGuardBlock(
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
      PRODUCTION_CUTOVER_GUARD_BLOCK_SENTINEL
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
  readRequiredProductionCutoverConfirmation();

  let fixture:
    VerificationFixture | null =
      null;

  let databaseStateBefore:
    DatabaseState | null =
      null;

  let activationCommitted =
    false;

  const guards:
    MaterializationGuards = {
      materializationCalls: 0,
      activationCalls: 0,
      activationRpcCalls: 0,
      finalizationCalls: 0,
    };

  const capture:
    MaterializationCapture = {
      result: null,
      activationReadiness: null,
      confirmationToken: null,
      activation: null,
      finalization: null,
    };

  const retryMeasurements:
    RetryMeasurements = {
      keywordRetryCount: 0,
      authoritativeRetryCount: 0,
    };

  const claimMeasurements:
    ClaimMeasurement[] = [];

  let completedResult:
    ProcessNaverMediaSyncJobCompletedResult | null =
      null;

  console.log(
    "PRODUCTION CUTOVER: Naver Search Ads",
  );
  console.log(
    "date range:",
    `${input.dateFrom} ~ ${input.dateTo}`,
  );
  console.log(
    "MEDIA_SYNC_WORKER_ENABLED:",
    0,
  );
  console.log(
    "expected parity:",
    JSON.stringify({
      rows: EXPECTED_ROW_COUNT,
      impressions:
        EXPECTED_SEARCH_ADS_TOTAL
          .impressions,
      clicks:
        EXPECTED_SEARCH_ADS_TOTAL
          .clicks,
    }),
  );

  try {
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
        "PRODUCTION_CUTOVER_REPORT_CONNECTION_SCOPE_MISMATCH",
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
        "PRODUCTION_CUTOVER_CREDENTIAL_SCOPE_MISMATCH",
      );
    }

    const campaignPreflight =
      validateCampaignPreflight(
        await fetchAllCampaigns(
          decrypted.credentials,
        ),
      );

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
        fixture,
        databaseStateBefore,
        verificationInput:
          input,
        onActivationCommitted:
          () => {
            activationCommitted =
              true;
          },
      });

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

      const result =
        await processClaimedNaverMediaSyncJob(
          claimedJob,
          runOptions,
        );

      if (
        result.status ===
        "partial"
      ) {
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

        continue;
      }

      completedResult =
        result;
      activationCommitted =
        guards.activationRpcCalls === 1;
      fixture.snapshotIngestionId =
        result.snapshotIngestionId;

      const checkpoint =
        readNaverSearchAdsCombinedProcessingCheckpoint(
          result.checkpointJob,
        );

      validateCheckpointShape(
        checkpoint,
      );

      claimMeasurements.push({
        claimNumber,
        attemptCount:
          claimedJob.attempt_count,
        status:
          "completed",
        checkpoint,
        stagingRowCount:
          checkpoint.totalRows,
      });

      break;
    }

    if (
      !completedResult ||
      !databaseStateBefore ||
      !fixture
    ) {
      throw new Error(
        "PRODUCTION_CUTOVER_MAX_CLAIM_RUNS_EXCEEDED",
      );
    }

    const materialization =
      capture.result;
    const readiness =
      capture.activationReadiness;
    const activation =
      capture.activation;
    const finalization =
      capture.finalization;

    if (
      !materialization ||
      !readiness ||
      !activation ||
      !finalization ||
      !capture.confirmationToken
    ) {
      throw new Error(
        "PRODUCTION_CUTOVER_LIFECYCLE_CAPTURE_MISSING",
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
      guards.activationRpcCalls,
      1,
    );
    assert.equal(
      guards.finalizationCalls,
      1,
    );
    assert.equal(
      readiness.ready,
      true,
    );
    assert.equal(
      materialization.rowCount,
      EXPECTED_ROW_COUNT,
    );
    assert.equal(
      readiness
        .candidateSnapshot
        .targetCanonicalFingerprint,
      capture.confirmationToken
        .split(":")
        .at(-1),
    );

    const finalJob =
      await readJobRecord(
        fixture.jobId,
      );

    assert.equal(
      finalJob.status,
      "done",
    );
    assert.equal(
      finalJob.progress,
      100,
    );
    assert.equal(
      finalJob.snapshot_ingestion_id,
      materialization
        .snapshotIngestionId,
    );

    const finalDatabaseState =
      await readDatabaseState(
        input.reportId,
      );

    assert.equal(
      finalDatabaseState
        .currentIngestionId,
      materialization
        .snapshotIngestionId,
    );
    assert.equal(
      finalDatabaseState
        .publishedIngestionId,
      databaseStateBefore
        .publishedIngestionId,
    );

    const storedRows =
      await readStoredStagingRows(
        fixture.jobId,
      );

    const storedRowsValidation =
      validateStoredRows({
        rows:
          storedRows,
        campaignPreflight,
      });

    assert.equal(
      storedRows.length,
      EXPECTED_ROW_COUNT,
    );
    assert.equal(
      storedRowsValidation
        .actualTotals
        .impressions,
      EXPECTED_SEARCH_ADS_TOTAL
        .impressions,
    );
    assert.equal(
      storedRowsValidation
        .actualTotals
        .clicks,
      EXPECTED_SEARCH_ADS_TOTAL
        .clicks,
    );

    const parityDifferences =
      createParityDifferences(
        storedRowsValidation,
      );

    assert.equal(
      parityDifferences.every(
        (difference) =>
          difference.impressionDelta === 0 &&
          difference.clickDelta === 0,
      ),
      true,
    );

    console.log(
      "production cutover confirmation token matched:",
      true,
    );
    console.log(
      "candidate rows / impressions / clicks:",
      `${EXPECTED_ROW_COUNT} / ${EXPECTED_SEARCH_ADS_TOTAL.impressions} / ${EXPECTED_SEARCH_ADS_TOTAL.clicks}`,
    );
    console.log(
      "materialized fingerprint matched token:",
      true,
    );
    console.log(
      "actual activation RPC calls:",
      guards.activationRpcCalls,
    );
    console.log(
      "current_ingestion_id switched:",
      finalDatabaseState
        .currentIngestionId,
    );
    console.log(
      "published_ingestion_id preserved:",
      finalDatabaseState
        .publishedIngestionId,
    );
    console.log(
      "job status / progress:",
      `${finalJob.status} / ${finalJob.progress}`,
    );
    console.log(
      "finalization finishedAt:",
      finalization.finishedAt,
    );
    console.log(
      "production cutover passed:",
      true,
    );
  } catch (error) {
    /*
     * activation RPC 호출 전 실패만 candidate를 정리한다.
     * RPC 호출이 한 번이라도 시작됐거나 activation이 commit된 뒤의 실패는
     * active snapshot 삭제 위험을 피하기 위해 cleanup하지 않고 fail-closed로 종료한다.
     */
    if (
      fixture &&
      !activationCommitted &&
      guards.activationRpcCalls === 0
    ) {
      try {
        const cleaned =
          await cleanupFixture(
            fixture,
          );

        console.log(
          "pre-activation candidate cleanup completed:",
          cleaned,
        );
      } catch (cleanupError) {
        console.error(
          "pre-activation candidate cleanup failed:",
          JSON.stringify(
            readSafeErrorChain(
              cleanupError,
            ),
          ),
        );
      }
    }

    throw error;
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
        MediaSyncSnapshotActivationError ||
      error instanceof
        MediaSyncFinalizationError ||
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
        "production cutover failed:",
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
      "production cutover failed:",
      "UNKNOWN_ERROR",
    );

    console.error(
      "verification passed:",
      false,
    );

    process.exitCode = 1;
  },
);
