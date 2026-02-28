import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function getUserFromReq(req: Request) {
  const admin = getSupabaseAdmin();

  // 1) Bearer 우선
  const token = getBearerToken(req);
  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user) return { user: data.user, error: null };
  }

  // 2) fallback: 쿠키 세션(sbAuth)
  const { user, error } = await sbAuth();
  return { user: user ?? null, error: error ?? null };
}

async function assertWorkspaceMember(workspace_id: string, user_id: string) {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) return { ok: false, status: 500 as const, error: error.message };
  if (!data) return { ok: false, status: 403 as const, error: "FORBIDDEN" };

  return { ok: true as const, role: data.role };
}

export async function POST(req: Request) {
  try {
    const { user, error: authErr } = await getUserFromReq(req);
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const workspace_id = asString(body.workspace_id);
    const name = asString(body.name);

    if (!workspace_id) {
      return NextResponse.json({ ok: false, error: "workspace_id is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    // ✅ 권한: workspace 멤버인지 확인
    const mem = await assertWorkspaceMember(workspace_id, user.id);
    if (!mem.ok) {
      return NextResponse.json({ ok: false, error: mem.error }, { status: mem.status });
    }

    const admin = getSupabaseAdmin();

    // ✅ workspace 내 name 존재 여부
    const { data, error } = await admin
      .from("advertisers")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("name", name)
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const exists = (data?.length ?? 0) > 0;
    return NextResponse.json({ ok: true, exists });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}