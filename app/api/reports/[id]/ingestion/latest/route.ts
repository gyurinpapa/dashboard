import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function getUserId(req: Request, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (error || !data?.user?.id) return { ok: false as const, status: 401 };
    return { ok: true as const, userId: data.user.id };
  }

  const sb = await sbAuth();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user?.id) return { ok: false as const, status: 401 };
  return { ok: true as const, userId: user.id };
}

async function assertCanAccessReport(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, reportId: string, userId: string) {
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .select("id, workspace_id, created_by")
    .eq("id", reportId)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500 };
  if (!report) return { ok: false as const, status: 404 };

  if (report.created_by === userId) return { ok: true as const, report };

  const { data: wm } = await supabaseAdmin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", report.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!wm) return { ok: false as const, status: 403 };
  return { ok: true as const, report };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabaseAdmin = getSupabaseAdmin();
  const { id: reportId } = await ctx.params;

  const uid = await getUserId(req, supabaseAdmin);
  if (!uid.ok) return jsonError(uid.status, "Unauthorized");

  const access = await assertCanAccessReport(supabaseAdmin, reportId, uid.userId);
  if (!access.ok) {
    const m = access.status === 404 ? "Report not found" : access.status === 403 ? "Forbidden" : "Error";
    return jsonError(access.status, m);
  }

  const { data, error } = await supabaseAdmin
    .from("report_ingestions")
    .select("id, kind, status, csv_path, row_count, error, created_at, updated_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return jsonError(500, "Failed to read ingestion");

  return NextResponse.json({
    ok: true,
    ingestion: data || null,
  });
}