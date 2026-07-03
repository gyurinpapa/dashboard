// src/lib/media-sync/types.ts

/**
 * Etrylue Performance
 * Media API integration common types
 *
 * 원칙:
 * - provider 원본 응답을 기존 리포트가 직접 읽지 않는다.
 * - provider adapter가 Etrylue canonical row로 정규화한다.
 * - API credential 원문 타입은 이 공통 파일에 정의하지 않는다.
 * - 브라우저에 secret/access token/credential ciphertext를 노출하지 않는다.
 */

export const MEDIA_PROVIDERS = [
  "naver_searchad",
  "google_ads",
  "meta_ads",
] as const;

export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

export const MEDIA_CONNECTION_STATUSES = [
  "active",
  "disconnected",
  "error",
] as const;

export type MediaConnectionStatus =
  (typeof MEDIA_CONNECTION_STATUSES)[number];

export const MEDIA_SYNC_JOB_STATUSES = [
  "pending",
  "processing",
  "done",
  "failed",
  "cancelled",
] as const;

export type MediaSyncJobStatus =
  (typeof MEDIA_SYNC_JOB_STATUSES)[number];

export const MEDIA_SYNC_DATA_LEVELS = [
  "keyword",
  "creative",
  "mixed",
  "unknown",
] as const;

export type MediaSyncDataLevel =
  (typeof MEDIA_SYNC_DATA_LEVELS)[number];

export const MEDIA_SYNC_MODES = ["snapshot_replace"] as const;

export type MediaSyncMode = (typeof MEDIA_SYNC_MODES)[number];

export const MEDIA_INGESTION_SOURCES = ["api", "csv"] as const;

export type MediaIngestionSource =
  (typeof MEDIA_INGESTION_SOURCES)[number];

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type JsonObject = {
  [key: string]: JsonValue;
};

/**
 * media_connections.meta에 저장 가능한 공개 설정.
 *
 * 비밀정보 저장 금지:
 * - access license
 * - secret key
 * - access token
 * - refresh token
 * - credential ciphertext
 */
export type MediaConnectionMeta = JsonObject & {
  timezone?: string;
  currency?: string;
  sourceOwnership?: "api";
  dataLevel?: MediaSyncDataLevel;
  displayName?: string;
};

/**
 * DB의 public.media_connections 행.
 *
 * credential_ciphertext는 서버 내부 DB 처리에서만 사용한다.
 * API 응답이나 클라이언트 state에 이 타입 전체를 전달하면 안 된다.
 */
export type MediaConnectionRecord = {
  id: string;
  workspace_id: string;
  advertiser_id: string;

  provider: MediaProvider;
  external_account_id: string;
  external_account_name: string | null;

  credential_ciphertext: string | null;
  credential_version: number;

  status: MediaConnectionStatus;

  connected_at: string | null;
  last_verified_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;

  meta: MediaConnectionMeta;

  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * 브라우저와 일반 API 응답에 반환 가능한 연결정보.
 *
 * credential_ciphertext 및 복호화된 credential은 절대 포함하지 않는다.
 */
export type SafeMediaConnection = {
  id: string;
  workspace_id: string;
  advertiser_id: string;

  provider: MediaProvider;
  external_account_id: string;
  external_account_name: string | null;

  status: MediaConnectionStatus;
  has_credentials: boolean;

  connected_at: string | null;
  last_verified_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;

  meta: MediaConnectionMeta;

  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * DB의 public.media_sync_jobs 행.
 */
export type MediaSyncJobRecord = {
  id: string;

  workspace_id: string;
  advertiser_id: string;
  report_id: string;
  connection_id: string;

  provider: MediaProvider;
  external_account_id: string;

  date_from: string;
  date_to: string;

  data_level: MediaSyncDataLevel;
  mode: MediaSyncMode;

  status: MediaSyncJobStatus;
  progress: number;

  raw_rows: number;
  normalized_rows: number;
  inserted_rows: number;
  failed_rows: number;

  previous_ingestion_id: string | null;
  snapshot_ingestion_id: string | null;

  attempt_count: number;
  error: string | null;
  error_detail: JsonObject | null;

  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

/**
 * provider adapter가 반환해야 하는 Etrylue 공통 표준 행.
 *
 * 이 타입은 report_rows.row JSON의 canonical 구조다.
 * provider별 원본 필드명은 기존 리포트 계산 계층에 전달하지 않는다.
 */
export type EtrylueNormalizedMediaRow = {
  /**
   * YYYY-MM-DD
   */
  date: string;
  report_date: string;
  day: string;
  ymd: string;

  channel: string;
  source: string;
  platform: string;
  device: string;

  campaign: string;
  campaign_name: string;

  group: string;
  group_name: string;
  adgroup_name?: string;

  keyword?: string;
  keyword_name?: string;

  creative?: string;
  creative_name?: string;
  creative_file?: string;

  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;

  row_level: MediaSyncDataLevel;
  data_level: MediaSyncDataLevel;
  row_level_reason: string;

  provider: MediaProvider;
  ingestion_source: "api";

  external_account_id: string;
  external_campaign_id?: string;
  external_group_id?: string;
  external_keyword_id?: string;
  external_ad_id?: string;

  /**
   * 비밀정보가 아닌 provider 추적용 값만 허용한다.
   * 원본 API 응답 전체나 인증정보는 넣지 않는다.
   */
  provider_meta?: JsonObject;

  /**
   * 향후 안전하게 확장할 수 있도록 추가 canonical 필드를 허용한다.
   */
  [key: string]:
    | JsonValue
    | JsonObject
    | MediaProvider
    | MediaSyncDataLevel
    | "api"
    | undefined;
};

/**
 * report_rows insert에 전달하는 행.
 *
 * date/channel/device/source는 row JSON과 상위 컬럼에
 * 동일한 canonical 값을 저장해야 한다.
 */
export type MediaReportRowInsert = {
  report_id: string;
  workspace_id: string;
  advertiser_id: string | null;

  row_index: number;
  date: string;

  channel: string | null;
  device: string | null;
  source: string | null;

  ingestion_id: string;
  row: EtrylueNormalizedMediaRow;
};

/**
 * provider adapter가 한 페이지 또는 한 요청 단위를 처리한 결과.
 */
export type MediaProviderFetchResult = {
  rawRows: number;
  normalizedRows: EtrylueNormalizedMediaRow[];
  failedRows: number;

  /**
   * pagination cursor 등 비밀정보가 아닌 다음 요청 상태.
   */
  nextCursor?: string | null;

  /**
   * API 요청 수, 응답 기간 등 안전한 진단 정보만 저장한다.
   */
  meta?: JsonObject;
};

/**
 * media sync job 생성 API의 서버 입력.
 *
 * workspace_id와 advertiser_id는 body 값을 그대로 저장하지 않고,
 * report 및 connection DB 조회 결과에서 확정해야 한다.
 */
export type CreateMediaSyncJobInput = {
  reportId: string;
  connectionId: string;
  dateFrom: string;
  dateTo: string;
  dataLevel: MediaSyncDataLevel;
  mode: MediaSyncMode;
};

/**
 * 클라이언트에 반환 가능한 sync job 정보.
 */
export type SafeMediaSyncJob = Omit<MediaSyncJobRecord, "error_detail"> & {
  error_detail: JsonObject | null;
};

export function isMediaProvider(value: unknown): value is MediaProvider {
  return MEDIA_PROVIDERS.includes(value as MediaProvider);
}

export function isMediaConnectionStatus(
  value: unknown
): value is MediaConnectionStatus {
  return MEDIA_CONNECTION_STATUSES.includes(
    value as MediaConnectionStatus
  );
}

export function isMediaSyncJobStatus(
  value: unknown
): value is MediaSyncJobStatus {
  return MEDIA_SYNC_JOB_STATUSES.includes(
    value as MediaSyncJobStatus
  );
}

export function isMediaSyncDataLevel(
  value: unknown
): value is MediaSyncDataLevel {
  return MEDIA_SYNC_DATA_LEVELS.includes(
    value as MediaSyncDataLevel
  );
}

export function isMediaSyncMode(value: unknown): value is MediaSyncMode {
  return MEDIA_SYNC_MODES.includes(value as MediaSyncMode);
}

/**
 * YYYY-MM-DD 형식만 허용한다.
 *
 * 실제 존재하는 날짜인지 여부까지 검사하여
 * 2026-02-31 같은 값을 차단한다.
 */
export function isValidYmd(value: unknown): value is string {
  const input = String(value ?? "").trim();

  const matched = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return false;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));

  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function isValidMediaSyncDateRange(
  dateFrom: unknown,
  dateTo: unknown
) {
  if (!isValidYmd(dateFrom) || !isValidYmd(dateTo)) {
    return false;
  }

  return dateFrom <= dateTo;
}

export function toSafeMediaConnection(
  record: MediaConnectionRecord
): SafeMediaConnection {
  return {
    id: record.id,
    workspace_id: record.workspace_id,
    advertiser_id: record.advertiser_id,

    provider: record.provider,
    external_account_id: record.external_account_id,
    external_account_name: record.external_account_name,

    status: record.status,
    has_credentials: Boolean(record.credential_ciphertext),

    connected_at: record.connected_at,
    last_verified_at: record.last_verified_at,
    last_sync_at: record.last_sync_at,
    last_error: record.last_error,

    meta: record.meta,

    created_by: record.created_by,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function clampMediaSyncProgress(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(numberValue)));
}