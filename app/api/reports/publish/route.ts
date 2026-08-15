import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import {
  commitReportPublishSnapshot,
  ReportPublishSnapshotError,
} from "@/src/lib/report/publish-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

type LegacyPublishReportRow = {
  id: string;
  workspace_id: string;
  status: string | null;
  share_token: string | null;
  current_ingestion_id: string | null;
  current_creatives_batch_id: string | null;
  draft_period_start: string | null;
  draft_period_end: string | null;
  period_start: string | null;
  period_end: string | null;
};

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function asString(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function normalizeEmail(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function isOnlyMasterEmail(email: any) {
  return normalizeEmail(email) === ONLY_MASTER_EMAIL;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Not authenticated");

    const sb = getSupabaseAdmin();

    const { data: userRes, error: uErr } = await sb.auth.getUser(token);
    if (uErr) return jsonError(401, "Not authenticated");

    const userId = userRes.user?.id;
    const userEmail = userRes.user?.email;
    if (!userId) return jsonError(401, "Not authenticated");

    const body = await req.json().catch(() => null);
    if (!body) return jsonError(400, "Invalid JSON");

    const reportId = asString(body.reportId);
    if (!reportId) return jsonError(400, "Missing reportId");

    const { data: report, error: rErr } = await sb
      .from("reports")
      .select(
        [
          "id",
          "workspace_id",
          "status",
          "share_token",
          "current_ingestion_id",
          "current_creatives_batch_id",
          "draft_period_start",
          "draft_period_end",
          "period_start",
          "period_end",
        ].join(", "),
      )
      .eq("id", reportId)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    const reportRow = report as unknown as LegacyPublishReportRow;

    const { data: wm, error: wErr } = await sb
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", reportRow.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return jsonError(500, wErr.message);

    const role = wm?.role;
    const canPublish =
      role === "admin" ||
      role === "director" ||
      (role === "master" && isOnlyMasterEmail(userEmail));

    if (!canPublish) return jsonError(403, "No permission to publish");

    const currentIngestionId = asString(reportRow.current_ingestion_id);

    if (!currentIngestionId) {
      return jsonError(400, "PUBLISH_BLOCKED_NO_CURRENT_SESSION");
    }

    const { count, error: countError } = await sb
      .from("report_rows")
      .select("id", { count: "exact", head: true })
      .eq("report_id", reportId)
      .eq("ingestion_id", currentIngestionId);

    if (countError) {
      return jsonError(500, countError.message || "COUNT_FAILED");
    }

    if (Number(count ?? 0) <= 0) {
      return jsonError(400, "PUBLISH_BLOCKED_EMPTY_CURRENT_SESSION");
    }

    const sourceShareToken =
      typeof reportRow.share_token === "string"
        ? reportRow.share_token
        : null;

    try {
      await commitReportPublishSnapshot({
        snapshot: {
          reportId,
          sourceShareToken,
          currentIngestionId,
          currentCreativesBatchId:
            asString(reportRow.current_creatives_batch_id) || null,
          draftPeriodStart:
            asString(reportRow.draft_period_start) || null,
          draftPeriodEnd:
            asString(reportRow.draft_period_end) || null,
          periodStart:
            asString(reportRow.period_start) || null,
          periodEnd:
            asString(reportRow.period_end) || null,
        },
        includePublishedAt: false,
      });
    } catch (error) {
      if (
        error instanceof ReportPublishSnapshotError &&
        error.code === "PUBLISH_CONFLICT"
      ) {
        return jsonError(409, "PUBLISH_CONFLICT");
      }

      const message =
        error instanceof Error && error.message
          ? error.message
          : "Server error";

      return jsonError(500, message);
    }

    return NextResponse.json({ ok: true, status: "ready" });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
