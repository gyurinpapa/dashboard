// app/api/advertisers/create/route.ts
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
    // ✅ 현재 프로젝트 sbAuth() 시그니처에 맞춤: 결과객체에서 user/error 꺼내기
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

    // ✅ 멤버십 체크 (workspace 멤버만 생성 가능)
    const { data: mem, error: memErr } = await admin
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memErr) return jsonError(500, "MEMBERSHIP_CHECK_FAILED", { detail: memErr.message });
    if (!mem) return jsonError(403, "FORBIDDEN");

    // ✅ 중복 이름 체크 (workspace 스코프)
    const { data: dup, error: dupErr } = await admin
      .from("advertisers")
      .select("id")
      .eq("workspace_id", workspace_id)
      .ilike("name", name)
      .limit(1);

    if (dupErr) return jsonError(500, "DUP_CHECK_FAILED", { detail: dupErr.message });
    if ((dup?.length ?? 0) > 0) return jsonError(409, "NAME_ALREADY_EXISTS");

    // ✅ 광고주 생성
    const { data: created, error: insErr } = await admin
      .from("advertisers")
      .insert({
        workspace_id,
        name,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (insErr) return jsonError(500, "CREATE_FAILED", { detail: insErr.message });

    return NextResponse.json({ ok: true, advertiser: created });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_ERROR", { detail: e?.message || String(e) });
  }
}