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
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function getBearerToken(req: Request) {
  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function getActor(req: Request) {
  const admin = getSupabaseAdmin();
  const bearer = getBearerToken(req);

  if (bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
    if (!error && data?.user) {
      return { user: data.user, error: null as string | null };
    }
  }

  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;

  if (authErr || !user) {
    return { user: null, error: "UNAUTHORIZED" as string | null };
  }

  return { user, error: null as string | null };
}

export async function POST(req: Request) {
  try {
    const actorResult = await getActor(req);
    const user = actorResult.user;

    if (!user) {
      return jsonError(401, actorResult.error || "UNAUTHORIZED");
    }

    const body = await req.json().catch(() => ({}));
    const workspace_id = asString(body.workspace_id);
    const name = asString(body.name);

    // ✅ 현재 호출 구조를 깨지 않기 위해 workspace_id는 계속 필수
    if (!workspace_id) return jsonError(400, "workspace_id required");
    if (!name) return jsonError(400, "name required");

    const admin = getSupabaseAdmin();

    // ✅ 멤버십 체크: 요청한 workspace의 실제 멤버만 생성 가능
    const { data: mem, error: memErr } = await admin
      .from("workspace_members")
      .select("workspace_id, user_id, role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (memErr) {
      return jsonError(500, "MEMBERSHIP_CHECK_FAILED", { detail: memErr.message });
    }

    if (!mem) {
      return jsonError(403, "FORBIDDEN");
    }

    // ✅ 중복 이름 체크 (같은 workspace 안에서만)
    // - 현재 구조를 깨지 않기 위해 ilike 유지
    // - 단, 공백 정리된 name 기준으로 검사
    const { data: dup, error: dupErr } = await admin
      .from("advertisers")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .ilike("name", name)
      .limit(1);

    if (dupErr) {
      return jsonError(500, "DUP_CHECK_FAILED", { detail: dupErr.message });
    }

    if ((dup?.length ?? 0) > 0) {
      return jsonError(409, "NAME_ALREADY_EXISTS", {
        advertiser_id: dup?.[0]?.id ?? null,
      });
    }

    // ✅ 광고주 생성
    // - 생성 workspace는 요청값이 아니라
    //   "멤버십이 확인된 workspace_id"로 확정
    const { data: created, error: insErr } = await admin
      .from("advertisers")
      .insert({
        workspace_id: mem.workspace_id,
        name,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (insErr) {
      return jsonError(500, "CREATE_FAILED", { detail: insErr.message });
    }

    return NextResponse.json({
      ok: true,
      advertiser: created,
    });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_ERROR", {
      detail: e?.message || String(e),
    });
  }
}