import { getSupabaseAdmin } from "../supabase/admin";

export type ReportPublishSnapshot = {
  reportId: string;
  sourceShareToken: string | null;
  currentIngestionId: string;
  currentCreativesBatchId: string | null;
  draftPeriodStart: string | null;
  draftPeriodEnd: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type CommitReportPublishSnapshotInput = {
  snapshot: ReportPublishSnapshot;
  includePublishedAt: boolean;
};

export type CommitReportPublishSnapshotResult = {
  shareToken: string;
  publishedAt: string | null;
  publishedIngestionId: string;
  publishedCreativesBatchId: string | null;
  publishedPeriodStart: string | null;
  publishedPeriodEnd: string | null;
};

export type ReportPublishSnapshotErrorCode =
  | "PUBLISH_CONFLICT"
  | "DATABASE_ERROR"
  | "CANONICAL_IDENTITY_REQUIRED"
  | "CANONICAL_IDENTITY_INVALID";

export class ReportPublishSnapshotError extends Error {
  readonly code: ReportPublishSnapshotErrorCode;

  constructor(
    code: ReportPublishSnapshotErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReportPublishSnapshotError";
    this.code = code;
  }
}

type CanonicalPeriodType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "cumulative";

type CanonicalSourceType = "api" | "csv";

type CanonicalReportType =
  | "traffic"
  | "db_acquisition"
  | "commerce";

type CanonicalPublicIdentity = {
  source_type: CanonicalSourceType;
  report_type: CanonicalReportType;
  period_type: CanonicalPeriodType;
  period_key: string;
};

function asString(value: unknown) {
  if (value == null) return "";

  const normalized = String(value).trim();

  if (!normalized) return "";
  if (normalized.toLowerCase() === "null") return "";
  if (normalized.toLowerCase() === "undefined") return "";

  return normalized;
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function normalizeCanonicalSourceType(
  value: unknown,
): CanonicalSourceType | null {
  const normalized = asString(value).toLowerCase();

  if (normalized === "api") return "api";
  if (normalized === "csv") return "csv";

  return null;
}

function mapDbReportTypeKey(
  value: unknown,
): CanonicalReportType | null {
  const normalized = asString(value).toLowerCase();

  if (normalized === "traffic") return "traffic";
  if (normalized === "db") return "db_acquisition";
  if (normalized === "db_acquisition") {
    return "db_acquisition";
  }
  if (normalized === "commerce") return "commerce";

  return null;
}

function normalizeCanonicalPeriodType(
  value: unknown,
): CanonicalPeriodType | null {
  const normalized = asString(value).toLowerCase();

  if (
    normalized === "daily" ||
    normalized === "weekly" ||
    normalized === "monthly" ||
    normalized === "quarterly" ||
    normalized === "yearly" ||
    normalized === "cumulative"
  ) {
    return normalized;
  }

  return null;
}

function isValidDailyCanonicalPeriodKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function isValidCanonicalPeriodKey(
  periodType: CanonicalPeriodType,
  periodKey: string,
) {
  switch (periodType) {
    case "daily":
      return isValidDailyCanonicalPeriodKey(periodKey);

    case "weekly":
      return /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(
        periodKey,
      );

    case "monthly":
      return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(periodKey);

    case "quarterly":
      return /^\d{4}-Q[1-4]$/.test(periodKey);

    case "yearly":
      return /^\d{4}$/.test(periodKey);

    case "cumulative":
      return periodKey === "all";

    default:
      return false;
  }
}

function normalizeExistingShareToken(value: string | null) {
  const token = String(value ?? "").trim();

  if (!token) return "";
  if (token.toLowerCase() === "null") return "";
  if (token.toLowerCase() === "undefined") return "";

  return token;
}

function randToken(len = 32) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let value = "";

  for (let index = 0; index < len; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }

  return value;
}

function isUrlContractV2Marked(meta: Record<string, unknown>) {
  return asString(meta.url_contract_version) === "2";
}

function readCanonicalPublicIdentity(
  meta: Record<string, unknown>,
): CanonicalPublicIdentity | null {
  const raw = meta.public_identity;

  if (!isPlainObject(raw)) {
    return null;
  }

  const sourceType = normalizeCanonicalSourceType(
    raw.source_type,
  );
  const reportType = mapDbReportTypeKey(
    raw.report_type,
  );
  const periodType = normalizeCanonicalPeriodType(
    raw.period_type,
  );
  const periodKey = asString(raw.period_key);

  if (
    !sourceType ||
    !reportType ||
    !periodType ||
    !periodKey ||
    !isValidCanonicalPeriodKey(periodType, periodKey)
  ) {
    return null;
  }

  return {
    source_type: sourceType,
    report_type: reportType,
    period_type: periodType,
    period_key: periodKey,
  };
}

async function assertCanonicalIdentityReadyForPublish(
  reportId: string,
): Promise<CanonicalPublicIdentity | null> {
  const sb = getSupabaseAdmin();

  const { data: report, error: reportError } = await sb
    .from("reports")
    .select("id, advertiser_id, report_type_id, meta")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    throw new ReportPublishSnapshotError(
      "DATABASE_ERROR",
      reportError.message ||
        "The report canonical identity could not be checked.",
      { cause: reportError },
    );
  }

  if (!report) {
    throw new ReportPublishSnapshotError(
      "PUBLISH_CONFLICT",
      "The report no longer exists before publish commit.",
    );
  }

  const meta = isPlainObject((report as any).meta)
    ? ((report as any).meta as Record<string, unknown>)
    : {};

  const rawPublicIdentity = meta.public_identity;
  const hasPublicIdentity =
    rawPublicIdentity !== null &&
    rawPublicIdentity !== undefined;

  const isV2 =
    isUrlContractV2Marked(meta) ||
    hasPublicIdentity;

  // Legacy reports remain backward-compatible.
  if (!isV2) {
    return null;
  }

  const canonicalIdentity =
    readCanonicalPublicIdentity(meta);

  if (!canonicalIdentity) {
    throw new ReportPublishSnapshotError(
      "CANONICAL_IDENTITY_REQUIRED",
      "V2_CANONICAL_IDENTITY_REQUIRED",
    );
  }

  const advertiserId = asString(
    (report as any).advertiser_id,
  );
  const reportTypeId = asString(
    (report as any).report_type_id,
  );

  if (!advertiserId || !reportTypeId) {
    throw new ReportPublishSnapshotError(
      "CANONICAL_IDENTITY_INVALID",
      "V2_CANONICAL_AUTHORITY_INCOMPLETE",
    );
  }

  const { data: advertiser, error: advertiserError } =
    await sb
      .from("advertisers")
      .select("id, public_slug")
      .eq("id", advertiserId)
      .maybeSingle();

  if (advertiserError) {
    throw new ReportPublishSnapshotError(
      "DATABASE_ERROR",
      advertiserError.message ||
        "The advertiser canonical authority could not be checked.",
      { cause: advertiserError },
    );
  }

  if (!advertiser || !asString((advertiser as any).public_slug)) {
    throw new ReportPublishSnapshotError(
      "CANONICAL_IDENTITY_INVALID",
      "V2_CANONICAL_ADVERTISER_SLUG_REQUIRED",
    );
  }

  const { data: reportType, error: reportTypeError } =
    await sb
      .from("report_types")
      .select("id, key")
      .eq("id", reportTypeId)
      .maybeSingle();

  if (reportTypeError) {
    throw new ReportPublishSnapshotError(
      "DATABASE_ERROR",
      reportTypeError.message ||
        "The report type canonical authority could not be checked.",
      { cause: reportTypeError },
    );
  }

  const authoritativeReportType = mapDbReportTypeKey(
    (reportType as any)?.key,
  );

  if (!authoritativeReportType) {
    throw new ReportPublishSnapshotError(
      "CANONICAL_IDENTITY_INVALID",
      "V2_UNSUPPORTED_REPORT_TYPE",
    );
  }

  const dataSource = isPlainObject(meta.data_source)
    ? meta.data_source
    : {};

  const authoritativeSourceType =
    normalizeCanonicalSourceType(
      dataSource.kind,
    );

  if (!authoritativeSourceType) {
    throw new ReportPublishSnapshotError(
      "CANONICAL_IDENTITY_INVALID",
      "V2_CANONICAL_SOURCE_TYPE_INVALID",
    );
  }

  if (
    canonicalIdentity.source_type !==
      authoritativeSourceType ||
    canonicalIdentity.report_type !==
      authoritativeReportType
  ) {
    throw new ReportPublishSnapshotError(
      "CANONICAL_IDENTITY_INVALID",
      "V2_CANONICAL_IDENTITY_AUTHORITY_MISMATCH",
    );
  }

  return canonicalIdentity;
}

export async function commitReportPublishSnapshot(
  input: CommitReportPublishSnapshotInput,
): Promise<CommitReportPublishSnapshotResult> {
  const { snapshot, includePublishedAt } = input;
  const sb = getSupabaseAdmin();

  /**
   * URL Contract V2 publish guard
   *
   * - legacy report:
   *   public_identity 없음 + url_contract_version != 2
   *   → 기존 publish 동작 유지
   *
   * - V2 report:
   *   public_identity 존재 또는 url_contract_version=2
   *   → canonical identity가 완전하고
   *      advertiser/report type/source authority와 일치해야 발행
   *
   * publish / publish-lite가 모두 이 helper를 사용하므로
   * 두 경로에 동일한 fail-closed 계약을 적용한다.
   */
  const canonicalIdentityGuard =
    await assertCanonicalIdentityReadyForPublish(
      snapshot.reportId,
    );

  const shareToken =
    normalizeExistingShareToken(snapshot.sourceShareToken) ||
    randToken(32);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    share_token: shareToken,
    status: "ready",
    updated_at: now,
    published_ingestion_id: snapshot.currentIngestionId,
    published_creatives_batch_id:
      snapshot.currentCreativesBatchId,
    published_period_start: snapshot.draftPeriodStart,
    published_period_end: snapshot.draftPeriodEnd,
    period_start: snapshot.draftPeriodStart,
    period_end: snapshot.draftPeriodEnd,
  };

  if (includePublishedAt) {
    patch.published_at = now;
  }

  let query = sb
    .from("reports")
    .update(patch)
    .eq("id", snapshot.reportId)
    .eq(
      "current_ingestion_id",
      snapshot.currentIngestionId,
    );

  /**
   * 첫 publish 직전 canonical identity가 다른 요청에 의해
   * 바뀌는 race를 막는다.
   *
   * V2일 때만 방금 검증한 public_identity가 여전히
   * 동일하게 존재하는 report에 한해 publish update를 허용한다.
   */
  if (canonicalIdentityGuard) {
    query = query.contains("meta", {
      public_identity: canonicalIdentityGuard,
    });
  }

  query =
    snapshot.currentCreativesBatchId === null
      ? query.is("current_creatives_batch_id", null)
      : query.eq(
          "current_creatives_batch_id",
          snapshot.currentCreativesBatchId,
        );

  query =
    snapshot.draftPeriodStart === null
      ? query.is("draft_period_start", null)
      : query.eq(
          "draft_period_start",
          snapshot.draftPeriodStart,
        );

  query =
    snapshot.draftPeriodEnd === null
      ? query.is("draft_period_end", null)
      : query.eq(
          "draft_period_end",
          snapshot.draftPeriodEnd,
        );

  query =
    snapshot.periodStart === null
      ? query.is("period_start", null)
      : query.eq("period_start", snapshot.periodStart);

  query =
    snapshot.periodEnd === null
      ? query.is("period_end", null)
      : query.eq("period_end", snapshot.periodEnd);

  query =
    snapshot.sourceShareToken === null
      ? query.is("share_token", null)
      : query.eq(
          "share_token",
          snapshot.sourceShareToken,
        );

  const { data, error } = await query
    .select("id")
    .maybeSingle();

  if (error) {
    throw new ReportPublishSnapshotError(
      "DATABASE_ERROR",
      error.message ||
        "The report snapshot could not be published.",
      { cause: error },
    );
  }

  if (!data) {
    throw new ReportPublishSnapshotError(
      "PUBLISH_CONFLICT",
      "The report source snapshot changed before publish commit.",
    );
  }

  return {
    shareToken,
    publishedAt: includePublishedAt ? now : null,
    publishedIngestionId: snapshot.currentIngestionId,
    publishedCreativesBatchId:
      snapshot.currentCreativesBatchId,
    publishedPeriodStart: snapshot.draftPeriodStart,
    publishedPeriodEnd: snapshot.draftPeriodEnd,
  };
}
