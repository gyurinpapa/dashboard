import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function getActor(req: Request) {
  const bearer = getBearerToken(req);

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user) return { user: data.user };
  }

  const { user } = await sbAuth();
  return { user };
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const advertiserId = asString(id);

    if (!advertiserId) {
      return jsonError(400, "INVALID_ID");
    }

    const { user } = await getActor(req);
    if (!user) {
      return jsonError(401, "UNAUTHORIZED");
    }

    // 1️⃣ advertiser 조회
    const { data: adv, error: advErr } = await supabaseAdmin
      .from("advertisers")
      .select("id, workspace_id")
      .eq("id", advertiserId)
      .maybeSingle();

    if (advErr) {
      return jsonError(500, "ADVERTISER_FETCH_FAILED", { detail: advErr.message });
    }

    if (!adv) {
      return jsonError(404, "NOT_FOUND");
    }

    const workspaceId = adv.workspace_id;

    // 2️⃣ role 확인
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (memErr) {
      return jsonError(500, "MEMBERSHIP_CHECK_FAILED", { detail: memErr.message });
    }

    if (!mem || mem.role !== "master") {
      return jsonError(403, "FORBIDDEN_MASTER_ONLY");
    }

    // 3️⃣ report 연결 체크
    const { count, error: cntErr } = await supabaseAdmin
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("advertiser_id", advertiserId)
        .eq("workspace_id", workspaceId);

    if (cntErr) {
      return jsonError(500, "REPORT_CHECK_FAILED", { detail: cntErr.message });
    }

    if ((count ?? 0) > 0) {
      return jsonError(409, "ADVERTISER_IN_USE", {
        message: "연결된 리포트가 있어 삭제할 수 없습니다.",
        report_count: count,
      });
    }

    // 4️⃣ 삭제
    const { error: delErr } = await supabaseAdmin
        .from("advertisers")
        .delete()
        .eq("id", advertiserId)
        .eq("workspace_id", workspaceId);

    if (delErr) {
      return jsonError(500, "DELETE_FAILED", { detail: delErr.message });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_ERROR", { detail: e?.message });
  }
}