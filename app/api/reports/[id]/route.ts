import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

type Ctx = { params: Promise<{ id: string }> };

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

  if (existingAdvertiserName) {
    return {
      ...report,
      advertiser_name: existingAdvertiserName,
      advertiserName: existingAdvertiserName,
    };
  }

  const advertiserId = asString(report?.advertiser_id);
  if (!advertiserId) {
    return report;
  }

  const { data: advertiser, error: advErr } = await supabaseAdmin
    .from("advertisers")
    .select("id, name")
    .eq("id", advertiserId)
    .maybeSingle();

  if (advErr) {
    return report;
  }

  const advertiserName = asString(advertiser?.name);
  if (!advertiserName) {
    return report;
  }

  return {
    ...report,
    advertiser_name: advertiserName,
    advertiserName: advertiserName,
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

          // legacy
          "period_start",
          "period_end",

          // draft
          "draft_period_start",
          "draft_period_end",

          // published
          "published_period_start",
          "published_period_end",
          "published_at",

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

    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) {
      return jsonError(403, "Forbidden: you are not a member of this workspace");
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
      .select("id, workspace_id, advertiser_id, report_type_id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    const workspaceId = getWorkspaceIdFromReport(report);
    if (!workspaceId) {
      return jsonError(500, "Report workspace_id is missing");
    }

    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) {
      return jsonError(403, "Forbidden: you are not a member of this workspace");
    }

    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : undefined;

    const hasPeriodStart =
      Object.prototype.hasOwnProperty.call(body, "period_start") ||
      Object.prototype.hasOwnProperty.call(body, "draft_period_start");

    const hasPeriodEnd =
      Object.prototype.hasOwnProperty.call(body, "period_end") ||
      Object.prototype.hasOwnProperty.call(body, "draft_period_end");

    const draft_period_start = hasPeriodStart
      ? (body.draft_period_start ?? body.period_start ?? null)
      : undefined;

    const draft_period_end = hasPeriodEnd
      ? (body.draft_period_end ?? body.period_end ?? null)
      : undefined;

    const meta = body.meta !== undefined ? body.meta : undefined;

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

          "meta",
          "updated_at",
        ].join(", ")
      )
      .maybeSingle();

    if (uErr) return jsonError(400, uErr.message);
    if (!updated) return jsonError(404, "Report not found");

    const enrichedUpdated = await enrichReport(updated);

    return NextResponse.json({ ok: true, report: enrichedUpdated });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}