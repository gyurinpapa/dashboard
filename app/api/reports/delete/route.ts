// app/api/reports/delete/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!auth) return "";
  const [type, token] = auth.split(" ");
  if (String(type).toLowerCase() !== "bearer") return "";
  return asString(token);
}

async function resolveUser(req: Request) {
  // 1) Bearer 우선
  const bearer = getBearerToken(req);
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user) {
      return { user: data.user, error: null };
    }
  }

  // 2) 쿠키 fallback
  const { user, error } = await sbAuth();
  return { user, error };
}

function isMissingTableError(message: string) {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache")
  );
}

export async function POST(req: Request) {
  try {
    const { user, error: authErr } = await resolveUser(req);
    if (authErr || !user) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const body = await req.json().catch(() => ({}));
    const workspace_id = asString(body?.workspace_id);
    const report_ids_raw = Array.isArray(body?.report_ids) ? body.report_ids : [];
    const report_ids = report_ids_raw
      .map((x: any) => asString(x))
      .filter(Boolean);

    if (!workspace_id) {
      return jsonError(400, "WORKSPACE_ID_REQUIRED");
    }

    if (report_ids.length === 0) {
      return jsonError(400, "REPORT_IDS_REQUIRED");
    }

    // 사용자가 해당 workspace 멤버인지 확인
    const { data: member, error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, user_id, role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) {
      return jsonError(500, memberErr.message);
    }

    if (!member) {
      return jsonError(403, "FORBIDDEN");
    }

    // 실제로 해당 workspace 소속 report만 삭제 대상
    const { data: targetRows, error: targetErr } = await supabaseAdmin
      .from("reports")
      .select("id")
      .eq("workspace_id", workspace_id)
      .in("id", report_ids);

    if (targetErr) {
      return jsonError(500, targetErr.message);
    }

    const deletableIds = (targetRows ?? [])
      .map((x: any) => String(x.id))
      .filter(Boolean);

    if (deletableIds.length === 0) {
      return jsonError(404, "NO_REPORTS_FOUND");
    }

    // 자식 데이터 먼저 삭제
    const { error: errRows } = await supabaseAdmin
      .from("report_rows")
      .delete()
      .in("report_id", deletableIds);

    if (errRows) {
      return jsonError(500, errRows.message, { step: "delete_report_rows" });
    }

    const { error: errCreatives } = await supabaseAdmin
      .from("report_creatives")
      .delete()
      .in("report_id", deletableIds);

    if (errCreatives) {
      return jsonError(500, errCreatives.message, { step: "delete_report_creatives" });
    }

    // uploads 테이블이 없으면 무시
    const { error: errCsvUploads } = await supabaseAdmin
      .from("report_csv_uploads")
      .delete()
      .in("report_id", deletableIds);

    if (errCsvUploads && !isMissingTableError(errCsvUploads.message || "")) {
      return jsonError(500, errCsvUploads.message, { step: "delete_report_csv_uploads" });
    }

    const { error: errImageUploads } = await supabaseAdmin
      .from("report_image_uploads")
      .delete()
      .in("report_id", deletableIds);

    if (errImageUploads && !isMissingTableError(errImageUploads.message || "")) {
      return jsonError(500, errImageUploads.message, { step: "delete_report_image_uploads" });
    }

    // 마지막으로 reports 삭제
    const { error: errReports } = await supabaseAdmin
      .from("reports")
      .delete()
      .in("id", deletableIds)
      .eq("workspace_id", workspace_id);

    if (errReports) {
      return jsonError(500, errReports.message, { step: "delete_reports" });
    }

    return NextResponse.json({
      ok: true,
      deleted_ids: deletableIds,
      deleted_count: deletableIds.length,
    });
  } catch (e: any) {
    return jsonError(500, e?.message || "DELETE_REPORTS_FAILED");
  }
}