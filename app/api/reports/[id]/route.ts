import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isTrueMasterUser } from "@/src/lib/true-master-access";
import { normalizeReportTheme } from "@/src/lib/report/theme";

type Ctx = { params: Promise<{ id: string }> };

const MAX_MEDIA_SYNC_DATE_WINDOW_DAYS = 31;

function asString(v: any) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getWorkspaceIdFromReport(report: any): string | undefined {
  if (!report || typeof report !== "object") return undefined;
  return asString((report as any).workspace_id);
}

function getRoleFromWorkspaceMember(member: any): string {
  return String(member?.role ?? "").trim().toLowerCase();
}

function canPatchReport(
  member: any,
  actorIsTrueMaster: boolean,
  reportCreatedBy: any,
  userId: any
) {
  if (actorIsTrueMaster) return true;

  const role = getRoleFromWorkspaceMember(member);

  if (role === "director") return true;
  if (role === "admin") return true;

  if (role === "staff") {
    const createdBy = asString(reportCreatedBy);
    const actorUserId = asString(userId);

    return !!createdBy && !!actorUserId && createdBy === actorUserId;
  }

  return false;
}

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

type CanonicalSourceType = "api" | "csv";

type CanonicalReportType =
  | "traffic"
  | "db_acquisition"
  | "commerce";

type CanonicalPeriodType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "cumulative";

type CanonicalPublicIdentity = {
  source_type: CanonicalSourceType;
  report_type: CanonicalReportType;
  period_type: CanonicalPeriodType;
  period_key: string;
};

function normalizeCanonicalSourceType(
  value: any,
): CanonicalSourceType | null {
  const normalized = String(
    value ?? "",
  ).trim().toLowerCase();

  if (normalized === "api") return "api";
  if (normalized === "csv") return "csv";

  return null;
}

function mapDbReportTypeKey(
  value: any,
): CanonicalReportType | null {
  const key = String(
    value ?? "",
  ).trim().toLowerCase();

  if (key === "traffic") {
    return "traffic";
  }

  if (
    key === "db" ||
    key === "db_acquisition"
  ) {
    return "db_acquisition";
  }

  if (key === "commerce") {
    return "commerce";
  }

  return null;
}

function isValidCanonicalPublicSlug(value: any) {
  const slug = String(
    value ?? "",
  ).trim();

  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(
    slug,
  );
}

function isCanonicalPeriodType(
  value: string,
): value is CanonicalPeriodType {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "yearly" ||
    value === "cumulative"
  );
}

function isValidDailyCanonicalPeriodKey(
  value: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`,
  );

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
      return isValidDailyCanonicalPeriodKey(
        periodKey,
      );

    case "weekly":
      return /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(
        periodKey,
      );

    case "monthly":
      return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(
        periodKey,
      );

    case "quarterly":
      return /^\d{4}-Q[1-4]$/.test(
        periodKey,
      );

    case "yearly":
      return /^\d{4}$/.test(periodKey);

    case "cumulative":
      return periodKey === "all";

    default:
      return false;
  }
}

function normalizeMonthGoal(v: any) {
  if (!isPlainObject(v)) return null;

  return {
    revenue: v.revenue ?? "",
    cost: v.cost ?? "",
    roas: v.roas ?? "",
    conversions: v.conversions ?? "",
    clicks: v.clicks ?? "",
    ctr: v.ctr ?? "",
    cvr: v.cvr ?? "",
    updated_at: new Date().toISOString(),
  };
}

function normalizeContractAmount(v: any) {
  if (v == null) return "";

  const s = String(v)
    .replace(/[₩,\s]/g, "")
    .trim();

  if (!s) return "";

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return "";

  return String(Math.round(n));
}

function normalizeBrandSearchContracts(v: any) {
  if (!isPlainObject(v)) return null;

  const out: Record<
    string,
    {
      pc: string;
      mobile: string;
      updated_at: string;
    }
  > = {};

  const now = new Date().toISOString();

  for (const [monthKeyRaw, value] of Object.entries(v)) {
    const monthKey = String(monthKeyRaw ?? "").trim();

    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (!isPlainObject(value)) continue;

    const pc = normalizeContractAmount((value as any).pc);
    const mobile = normalizeContractAmount((value as any).mobile);

    out[monthKey] = {
      pc,
      mobile,
      updated_at: now,
    };
  }

  return out;
}

function normalizeYmdOrNull(v: any) {
  const s = String(v ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null;
  }

  const date = new Date(`${s}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const normalized = date.toISOString().slice(0, 10);

  if (normalized !== s) {
    return null;
  }

  return s;
}

function getInclusiveDateWindowDays(dateFrom: string, dateTo: string) {
  const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00.000Z`);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return 0;
  }

  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

function isMediaSyncDateWindowAllowed(dateFrom: string, dateTo: string) {
  const days = getInclusiveDateWindowDays(dateFrom, dateTo);

  return days >= 1 && days <= MAX_MEDIA_SYNC_DATE_WINDOW_DAYS;
}

function normalizeMediaSyncDataLevel(v: any) {
  const s = String(v ?? "").trim().toLowerCase();

  if (
    s === "keyword" ||
    s === "creative" ||
    s === "mixed" ||
    s === "unknown"
  ) {
    return s;
  }

  return "keyword";
}

function normalizeMediaSyncSettings(v: any) {
  if (!isPlainObject(v)) return null;

  const dateFrom = normalizeYmdOrNull((v as any).date_from ?? (v as any).dateFrom);
  const dateTo = normalizeYmdOrNull((v as any).date_to ?? (v as any).dateTo);

  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    return null;
  }

  if (!isMediaSyncDateWindowAllowed(dateFrom, dateTo)) {
    return null;
  }

  return {
    date_from: dateFrom,
    date_to: dateTo,
    data_level: normalizeMediaSyncDataLevel((v as any).data_level ?? (v as any).dataLevel),
    mode: "snapshot_replace",
    updated_at: new Date().toISOString(),
  };
}

async function getUserFromSbAuth() {
  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;
  return { user, authErr };
}

async function enrichReportWithAdvertiserName(report: any) {
  if (!report || typeof report !== "object") return report;

  const meta =
    report?.meta && typeof report.meta === "object" ? report.meta : {};

  const existingAdvertiserName =
    asString(report?.advertiser_name) ||
    asString(report?.advertiserName) ||
    asString(report?.advertiser) ||
    asString(meta?.advertiser_name) ||
    asString(meta?.advertiserName) ||
    asString(meta?.advertiser);

  const advertiserId = asString(report?.advertiser_id);
  if (!advertiserId) {
    if (!existingAdvertiserName) {
      return report;
    }

    return {
      ...report,
      advertiser_name: existingAdvertiserName,
      advertiserName: existingAdvertiserName,
    };
  }

  const { data: advertiser, error: advErr } = await supabaseAdmin
    .from("advertisers")
    .select("id, name, public_slug")
    .eq("id", advertiserId)
    .maybeSingle();

  if (advErr) {
    if (!existingAdvertiserName) {
      return report;
    }

    return {
      ...report,
      advertiser_name: existingAdvertiserName,
      advertiserName: existingAdvertiserName,
    };
  }

  const advertiserName = existingAdvertiserName || asString(advertiser?.name);
  const advertiserPublicSlug = asString(advertiser?.public_slug) ?? null;

  return {
    ...report,
    ...(advertiserName
      ? {
          advertiser_name: advertiserName,
          advertiserName: advertiserName,
        }
      : {}),
    advertiser_public_slug: advertiserPublicSlug,
  };
}

async function enrichReportWithReportType(report: any) {
  if (!report || typeof report !== "object") return report;

  const meta =
    report?.meta && typeof report.meta === "object" ? report.meta : {};

  const existingReportTypeKey =
    asString(report?.report_type_key) ||
    asString(report?.reportTypeKey) ||
    asString(meta?.report_type_key) ||
    asString(meta?.reportTypeKey) ||
    asString(meta?.report_type);

  const existingReportTypeName =
    asString(report?.report_type_name) ||
    asString(report?.reportTypeName) ||
    asString(meta?.report_type_name) ||
    asString(meta?.reportTypeName);

  if (existingReportTypeKey || existingReportTypeName) {
    let nextName = existingReportTypeName;
    const keyLower = String(existingReportTypeKey ?? "").toLowerCase();

    if (keyLower === "traffic") nextName = "트래픽 리포트";
    if (keyLower === "commerce") nextName = nextName || "커머스 매출 리포트";

    return {
      ...report,
      report_type_key: existingReportTypeKey,
      reportTypeKey: existingReportTypeKey,
      report_type_name: nextName,
      reportTypeName: nextName,
    };
  }

  const reportTypeId = asString(report?.report_type_id);
  if (!reportTypeId) {
    return report;
  }

  const { data: reportType, error: rtErr } = await supabaseAdmin
    .from("report_types")
    .select("id, key, name")
    .eq("id", reportTypeId)
    .maybeSingle();

  if (rtErr || !reportType) {
    return report;
  }

  const reportTypeKey = asString((reportType as any)?.key);
  let reportTypeName = asString((reportType as any)?.name);

  const keyLower = String(reportTypeKey ?? "").toLowerCase();
  if (keyLower === "traffic") {
    reportTypeName = "트래픽 리포트";
  } else if (keyLower === "commerce") {
    reportTypeName = reportTypeName || "커머스 매출 리포트";
  }

  return {
    ...report,
    report_type_key: reportTypeKey,
    reportTypeKey: reportTypeKey,
    report_type_name: reportTypeName,
    reportTypeName: reportTypeName,
  };
}

async function enrichReport(report: any) {
  const withAdvertiser = await enrichReportWithAdvertiserName(report);
  const withType = await enrichReportWithReportType(withAdvertiser);
  return withType;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return jsonError(400, "id is required");
    }

    const { user, authErr } = await getUserFromSbAuth();
    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select(
        [
          "id",
          "workspace_id",
          "advertiser_id",
          "report_type_id",
          "title",
          "status",
          "period_start",
          "period_end",
          "draft_period_start",
          "draft_period_end",
          "published_period_start",
          "published_period_end",
          "published_at",
          "published_ingestion_id",
          "meta",
          "created_at",
          "updated_at",
          "created_by",
        ].join(", ")
      )
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    const workspaceId = getWorkspaceIdFromReport(report);
    if (!workspaceId) {
      return jsonError(500, "Report workspace_id is missing");
    }

    const actorIsTrueMaster = await isTrueMasterUser(user.id);

    if (!actorIsTrueMaster) {
      const { data: wm, error: wmErr } = await supabaseAdmin
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (wmErr) return jsonError(500, wmErr.message);
      if (!wm) {
        return jsonError(403, "Forbidden: you are not a member of this workspace");
      }
    }

    const enrichedReport = await enrichReport(report);

    return NextResponse.json({ ok: true, report: enrichedReport });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return jsonError(400, "id is required");
    }

    const { user, authErr } = await getUserFromSbAuth();
    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select(
        "id, workspace_id, advertiser_id, report_type_id, created_by, status, published_at, published_ingestion_id, meta"
      )
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    const workspaceId = getWorkspaceIdFromReport(report);
    if (!workspaceId) {
      return jsonError(500, "Report workspace_id is missing");
    }

    const actorIsTrueMaster = await isTrueMasterUser(user.id);

    let wm: any = null;

    if (!actorIsTrueMaster) {
      const { data, error: wmErr } = await supabaseAdmin
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (wmErr) return jsonError(500, wmErr.message);
      if (!data) {
        return jsonError(403, "Forbidden: you are not a member of this workspace");
      }

      wm = data;
    }

    if (
      !canPatchReport(
        wm,
        actorIsTrueMaster,
        report.created_by,
        user.id
      )
    ) {
      return jsonError(
        403,
        "Forbidden: you do not have permission to update this report"
      );
    }

    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : undefined;

    const hasCanonicalPeriodTypeInput =
      Object.prototype.hasOwnProperty.call(
        body,
        "period_type",
      );

    const hasCanonicalPeriodKeyInput =
      Object.prototype.hasOwnProperty.call(
        body,
        "period_key",
      );

    const wantsCanonicalIdentityUpdate =
      hasCanonicalPeriodTypeInput ||
      hasCanonicalPeriodKeyInput;

    const hasPeriodStart =
      Object.prototype.hasOwnProperty.call(body, "period_start") ||
      Object.prototype.hasOwnProperty.call(body, "draft_period_start");

    const hasPeriodEnd =
      Object.prototype.hasOwnProperty.call(body, "period_end") ||
      Object.prototype.hasOwnProperty.call(body, "draft_period_end");

    const draft_period_start = hasPeriodStart
      ? body.draft_period_start ?? body.period_start ?? null
      : undefined;

    const draft_period_end = hasPeriodEnd
      ? body.draft_period_end ?? body.period_end ?? null
      : undefined;

    const existingMeta = isPlainObject(report?.meta) ? report.meta : {};

    const incomingMeta = isPlainObject(body.meta) ? body.meta : undefined;

    if (
      incomingMeta &&
      (
        Object.prototype.hasOwnProperty.call(
          incomingMeta,
          "public_identity",
        ) ||
        Object.prototype.hasOwnProperty.call(
          incomingMeta,
          "url_contract_version",
        )
      )
    ) {
      return jsonError(
        400,
        "V2_CANONICAL_META_DIRECT_WRITE_FORBIDDEN",
      );
    }

    if (
      wantsCanonicalIdentityUpdate &&
      incomingMeta &&
      Object.prototype.hasOwnProperty.call(
        incomingMeta,
        "data_source",
      )
    ) {
      return jsonError(
        400,
        "V2_CANONICAL_DATA_SOURCE_DIRECT_WRITE_FORBIDDEN",
      );
    }

    let canonicalPublicIdentity:
      | CanonicalPublicIdentity
      | undefined;

    if (wantsCanonicalIdentityUpdate) {
      if (
        !hasCanonicalPeriodTypeInput ||
        !hasCanonicalPeriodKeyInput
      ) {
        return jsonError(
          400,
          "V2_CANONICAL_PERIOD_INCOMPLETE",
        );
      }

      const normalizedPeriodType = String(
        body.period_type ?? "",
      ).trim().toLowerCase();

      const canonicalPeriodKey = String(
        body.period_key ?? "",
      ).trim();

      if (
        !isCanonicalPeriodType(
          normalizedPeriodType,
        )
      ) {
        return jsonError(
          400,
          "V2_INVALID_PERIOD_TYPE",
        );
      }

      if (
        !canonicalPeriodKey ||
        !isValidCanonicalPeriodKey(
          normalizedPeriodType,
          canonicalPeriodKey,
        )
      ) {
        return jsonError(
          400,
          "V2_INVALID_PERIOD_KEY",
        );
      }

      if (
        asString(
          (report as any).published_at,
        ) ||
        asString(
          (report as any).published_ingestion_id,
        )
      ) {
        return jsonError(
          409,
          "REPORT_PUBLIC_IDENTITY_LOCKED",
        );
      }

      const advertiserId = asString(
        (report as any).advertiser_id,
      );

      const reportTypeId = asString(
        (report as any).report_type_id,
      );

      if (!advertiserId) {
        return jsonError(
          400,
          "V2_ADVERTISER_REQUIRED",
        );
      }

      if (!reportTypeId) {
        return jsonError(
          400,
          "V2_REPORT_TYPE_REQUIRED",
        );
      }

      const {
        data: advertiser,
        error: advertiserError,
      } = await supabaseAdmin
        .from("advertisers")
        .select(
          "id, workspace_id, public_slug",
        )
        .eq("id", advertiserId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (advertiserError) {
        return jsonError(
          500,
          "V2_ADVERTISER_LOOKUP_FAILED",
          {
            detail: advertiserError.message,
          },
        );
      }

      if (
        !advertiser ||
        !isValidCanonicalPublicSlug(
          (advertiser as any).public_slug,
        )
      ) {
        return jsonError(
          400,
          "V2_ADVERTISER_PUBLIC_SLUG_REQUIRED",
        );
      }

      const {
        data: reportType,
        error: reportTypeError,
      } = await supabaseAdmin
        .from("report_types")
        .select("id, key")
        .eq("id", reportTypeId)
        .maybeSingle();

      if (reportTypeError) {
        return jsonError(
          500,
          "V2_REPORT_TYPE_LOOKUP_FAILED",
          {
            detail: reportTypeError.message,
          },
        );
      }

      if (!reportType) {
        return jsonError(
          400,
          "V2_REPORT_TYPE_NOT_FOUND",
        );
      }

      const canonicalReportType =
        mapDbReportTypeKey(
          (reportType as any).key,
        );

      if (!canonicalReportType) {
        return jsonError(
          400,
          "V2_UNSUPPORTED_REPORT_TYPE",
        );
      }

      const dataSource =
        isPlainObject(
          (existingMeta as any).data_source,
        )
          ? (existingMeta as any).data_source
          : {};

      const canonicalSourceType =
        normalizeCanonicalSourceType(
          (dataSource as any).kind,
        );

      if (!canonicalSourceType) {
        return jsonError(
          400,
          "V2_CANONICAL_SOURCE_TYPE_INVALID",
        );
      }

      canonicalPublicIdentity = {
        source_type: canonicalSourceType,
        report_type: canonicalReportType,
        period_type: normalizedPeriodType,
        period_key: canonicalPeriodKey,
      };
    }

    const hasReportTheme =
      incomingMeta
        ? Object.prototype.hasOwnProperty.call(incomingMeta, "report_theme")
        : false;

    const incomingReportTheme = hasReportTheme
      ? normalizeReportTheme(incomingMeta?.report_theme)
      : undefined;

    const hasMonthGoal =
      Object.prototype.hasOwnProperty.call(body, "month_goal") ||
      (incomingMeta
        ? Object.prototype.hasOwnProperty.call(incomingMeta, "month_goal")
        : false);

    const incomingMonthGoal = hasMonthGoal
      ? normalizeMonthGoal(body.month_goal ?? incomingMeta?.month_goal)
      : undefined;

    const hasBrandSearchContracts =
      Object.prototype.hasOwnProperty.call(body, "brand_search_contracts") ||
      (incomingMeta
        ? Object.prototype.hasOwnProperty.call(
            incomingMeta,
            "brand_search_contracts"
          )
        : false);

    const incomingBrandSearchContracts = hasBrandSearchContracts
      ? normalizeBrandSearchContracts(
          body.brand_search_contracts ?? incomingMeta?.brand_search_contracts
        )
      : undefined;

    const hasMediaSyncSettings =
      Object.prototype.hasOwnProperty.call(body, "media_sync") ||
      (incomingMeta
        ? Object.prototype.hasOwnProperty.call(incomingMeta, "media_sync")
        : false);

    const incomingMediaSyncSettings = hasMediaSyncSettings
      ? normalizeMediaSyncSettings(body.media_sync ?? incomingMeta?.media_sync)
      : undefined;

    if (hasMediaSyncSettings && incomingMediaSyncSettings === null) {
      return jsonError(400, "Invalid media_sync settings");
    }

    const meta =
      incomingMeta !== undefined ||
      incomingReportTheme !== undefined ||
      incomingMonthGoal !== undefined ||
      incomingBrandSearchContracts !== undefined ||
      incomingMediaSyncSettings !== undefined ||
      canonicalPublicIdentity !== undefined
        ? {
            ...existingMeta,
            ...(incomingMeta ?? {}),
            ...(incomingReportTheme !== undefined
              ? { report_theme: incomingReportTheme }
              : {}),
            ...(incomingMonthGoal !== undefined
              ? { month_goal: incomingMonthGoal }
              : {}),
            ...(incomingBrandSearchContracts !== undefined
              ? { brand_search_contracts: incomingBrandSearchContracts }
              : {}),
            ...(incomingMediaSyncSettings !== undefined
              ? { media_sync: incomingMediaSyncSettings }
              : {}),
            ...(canonicalPublicIdentity !== undefined
              ? {
                  url_contract_version: 2,
                  public_identity:
                    canonicalPublicIdentity,
                }
              : {}),
          }
        : undefined;

    const patch: any = {};

    if (title !== undefined) patch.title = title;

    if (hasPeriodStart) {
      patch.draft_period_start = draft_period_start;
      patch.period_start = draft_period_start;
    }

    if (hasPeriodEnd) {
      patch.draft_period_end = draft_period_end;
      patch.period_end = draft_period_end;
    }

    if (meta !== undefined) patch.meta = meta;

    if (Object.keys(patch).length === 0) {
      return jsonError(400, "No fields to update");
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("reports")
      .update(patch)
      .eq("id", id)
      .select(
        [
          "id",
          "workspace_id",
          "advertiser_id",
          "report_type_id",
          "title",
          "status",
          "period_start",
          "period_end",
          "draft_period_start",
          "draft_period_end",
          "published_period_start",
          "published_period_end",
          "published_at",
          "published_ingestion_id",
          "meta",
          "updated_at",
        ].join(", ")
      )
      .maybeSingle();

    if (uErr) {
      const errorCode = String(
        (uErr as any)?.code ?? "",
      );

      const errorMessage = String(
        uErr.message ?? "",
      );

      if (
        errorCode === "23505" ||
        errorMessage.includes(
          "reports_public_identity_uq",
        )
      ) {
        return jsonError(
          409,
          "V2_CANONICAL_IDENTITY_CONFLICT",
        );
      }

      if (
        errorMessage.includes(
          "REPORT_PUBLIC_IDENTITY_LOCKED",
        )
      ) {
        return jsonError(
          409,
          "REPORT_PUBLIC_IDENTITY_LOCKED",
        );
      }

      return jsonError(
        400,
        errorMessage,
      );
    }

    if (!updated) return jsonError(404, "Report not found");

    const enrichedUpdated = await enrichReport(updated);

    return NextResponse.json({ ok: true, report: enrichedUpdated });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}