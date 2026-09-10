import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceType = "api" | "csv";

type CanonicalReportType =
  | "traffic"
  | "db_acquisition"
  | "commerce";

type PeriodType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "cumulative";

type RouteParams = {
  accountName: string;
  sourceType: string;
  reportType: string;
  periodType: string;
  periodKey: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

type PublicIdentity = {
  source_type: SourceType;
  report_type: CanonicalReportType;
  period_type: PeriodType;
  period_key: string;
};

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function isSourceType(value: string): value is SourceType {
  return value === "api" || value === "csv";
}

function isCanonicalReportType(
  value: string,
): value is CanonicalReportType {
  return (
    value === "traffic" ||
    value === "db_acquisition" ||
    value === "commerce"
  );
}

function isPeriodType(value: string): value is PeriodType {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "yearly" ||
    value === "cumulative"
  );
}

function isValidDailyPeriodKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function isValidPeriodKey(
  periodType: PeriodType,
  periodKey: string,
) {
  switch (periodType) {
    case "daily":
      return isValidDailyPeriodKey(periodKey);

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

function mapDbReportTypeKey(
  value: unknown,
): CanonicalReportType | null {
  const key = asString(value).toLowerCase();

  if (key === "traffic") {
    return "traffic";
  }

  if (key === "db") {
    return "db_acquisition";
  }

  if (key === "commerce") {
    return "commerce";
  }

  return null;
}

function readDataSourceKind(
  meta: unknown,
): SourceType | null {
  if (
    !meta ||
    typeof meta !== "object" ||
    Array.isArray(meta)
  ) {
    return null;
  }

  const dataSource = (
    meta as Record<string, unknown>
  ).data_source;

  if (
    !dataSource ||
    typeof dataSource !== "object" ||
    Array.isArray(dataSource)
  ) {
    return null;
  }

  const kind = asString(
    (dataSource as Record<string, unknown>).kind,
  ).toLowerCase();

  return isSourceType(kind) ? kind : null;
}

function readPublicIdentity(
  meta: unknown,
): PublicIdentity | null {
  if (
    !meta ||
    typeof meta !== "object" ||
    Array.isArray(meta)
  ) {
    return null;
  }

  const raw = (
    meta as Record<string, unknown>
  ).public_identity;

  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const identity = raw as Record<string, unknown>;

  const sourceType = asString(
    identity.source_type,
  ).toLowerCase();

  const reportType = asString(
    identity.report_type,
  ).toLowerCase();

  const periodType = asString(
    identity.period_type,
  ).toLowerCase();

  const periodKey = asString(identity.period_key);

  if (!isSourceType(sourceType)) {
    return null;
  }

  if (!isCanonicalReportType(reportType)) {
    return null;
  }

  if (!isPeriodType(periodType)) {
    return null;
  }

  if (!isValidPeriodKey(periodType, periodKey)) {
    return null;
  }

  return {
    source_type: sourceType,
    report_type: reportType,
    period_type: periodType,
    period_key: periodKey,
  };
}

function isSamePublicIdentity(
  left: PublicIdentity,
  right: PublicIdentity,
) {
  return (
    left.source_type === right.source_type &&
    left.report_type === right.report_type &&
    left.period_type === right.period_type &&
    left.period_key === right.period_key
  );
}

export default async function CanonicalPublicReportPage({
  params,
}: PageProps) {
  const raw = await params;

  const accountName = asString(raw.accountName);

  const sourceTypeRaw = asString(
    raw.sourceType,
  ).toLowerCase();

  const reportTypeRaw = asString(
    raw.reportType,
  ).toLowerCase();

  const periodTypeRaw = asString(
    raw.periodType,
  ).toLowerCase();

  const periodKey = asString(raw.periodKey);

  if (
    !/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(
      accountName,
    )
  ) {
    notFound();
  }

  if (!isSourceType(sourceTypeRaw)) {
    notFound();
  }

  if (!isCanonicalReportType(reportTypeRaw)) {
    notFound();
  }

  if (!isPeriodType(periodTypeRaw)) {
    notFound();
  }

  if (!isValidPeriodKey(periodTypeRaw, periodKey)) {
    notFound();
  }

  const sourceType = sourceTypeRaw;
  const reportType = reportTypeRaw;
  const periodType = periodTypeRaw;

  const {
    data: advertiser,
    error: advertiserError,
  } = await supabaseAdmin
    .from("advertisers")
    .select(
      "id, tenant_id, workspace_id, public_slug",
    )
    .eq("public_slug", accountName)
    .maybeSingle();

  if (
    advertiserError ||
    !advertiser?.id ||
    !advertiser?.tenant_id ||
    !advertiser?.workspace_id ||
    asString(advertiser.public_slug) !== accountName
  ) {
    notFound();
  }

  const publicIdentity: PublicIdentity = {
    source_type: sourceType,
    report_type: reportType,
    period_type: periodType,
    period_key: periodKey,
  };

  const {
    data: reports,
    error: reportsError,
  } = await supabaseAdmin
    .from("reports")
    .select(
      [
        "id",
        "tenant_id",
        "workspace_id",
        "advertiser_id",
        "report_type_id",
        "status",
        "share_token",
        "published_at",
        "published_ingestion_id",
        "meta",
      ].join(", "),
    )
    .eq("tenant_id", advertiser.tenant_id)
    .eq(
      "workspace_id",
      advertiser.workspace_id,
    )
    .eq("advertiser_id", advertiser.id)
    .eq("status", "ready")
    .contains("meta", {
      public_identity: publicIdentity,
    })
    .limit(2);

  if (
    reportsError ||
    !Array.isArray(reports) ||
    reports.length !== 1
  ) {
    notFound();
  }

  const report: any = reports[0];

  if (
    asString(report.tenant_id) !==
      asString(advertiser.tenant_id) ||
    asString(report.workspace_id) !==
      asString(advertiser.workspace_id) ||
    asString(report.advertiser_id) !==
      asString(advertiser.id)
  ) {
    notFound();
  }

  if (asString(report.status).toLowerCase() !== "ready") {
    notFound();
  }

  const storedPublicIdentity =
    readPublicIdentity(report.meta);

  if (
    !storedPublicIdentity ||
    !isSamePublicIdentity(
      storedPublicIdentity,
      publicIdentity,
    )
  ) {
    notFound();
  }

  if (
    readDataSourceKind(report.meta) !== sourceType
  ) {
    notFound();
  }

  const reportTypeId = asString(
    report.report_type_id,
  );

  if (!reportTypeId) {
    notFound();
  }

  const {
    data: dbReportType,
    error: reportTypeError,
  } = await supabaseAdmin
    .from("report_types")
    .select("key")
    .eq("id", reportTypeId)
    .maybeSingle();

  if (reportTypeError || !dbReportType) {
    notFound();
  }

  if (
    mapDbReportTypeKey(dbReportType.key) !==
    reportType
  ) {
    notFound();
  }

  const publishedIngestionId = asString(
    report.published_ingestion_id,
  );

  const publishedAt = asString(
    report.published_at,
  );

  const shareToken = asString(
    report.share_token,
  );

  if (
    !publishedIngestionId ||
    !publishedAt ||
    !shareToken
  ) {
    notFound();
  }

  redirect(
    `/share/${encodeURIComponent(shareToken)}`,
  );
}
