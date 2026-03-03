// app/api/advertisers/check-name/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function POST(req: Request) {
  try {
    // ✅ 현재 프로젝트 sbAuth() 시그니처에 맞춤: { ok, user, error } 형태
    const auth = await sbAuth();
    const user = (auth as any)?.user ?? null;
    const authErr = (auth as any)?.error ?? null;

    if (authErr || !user) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const body = await req.json().catch(() => ({}));
    const workspace_id = asString(body.workspace_id);
    const name = asString(body.name);

    if (!workspace_id) return jsonError(400, "workspace_id required");
    if (!name) return jsonError(400, "name required");

    const admin = getSupabaseAdmin();

    // ✅ membership 체크 (workspace 멤버인지)
    const { data: mem, error: memErr } = await admin
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memErr) return jsonError(500, "MEMBERSHIP_CHECK_FAILED", { detail: memErr.message });
    if (!mem) return jsonError(403, "FORBIDDEN");

    // ✅ 동일 이름 존재 여부 확인 (workspace 스코프)
    const { data: exists, error: exErr } = await admin
      .from("advertisers")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .ilike("name", name)
      .limit(1);

    if (exErr) return jsonError(500, "QUERY_FAILED", { detail: exErr.message });

    const isTaken = (exists?.length ?? 0) > 0;

    return NextResponse.json({
      ok: true,
      isTaken,
      matched: isTaken ? exists?.[0] ?? null : null,
    });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_ERROR", { detail: e?.message || String(e) });
  }
}