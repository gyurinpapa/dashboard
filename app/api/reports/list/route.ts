// app/api/reports/list/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status }
  );
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function asNullableString(v: any) {
  const s = asString(v);
  return s || null;
}

function asLimit(v: any, def = 50) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;

  const x = Math.floor(n);
  if (x < 1) return 1;
  if (x > 200) return 200;
  return x;
}

/**
 * ✅ Bearer 우선 + cookie fallback
 */
async function getUserId(
  req: Request
): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";

  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    const userId = data?.user?.id ?? null;

    if (error || !userId) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }

    return { ok: true, userId };
  }

  // fallback cookie session
  const auth = await sbAuth();

  if (!auth?.user?.id) {
    return { ok: false, status: 401, message: "Unauthorized (no session)" };
  }

  return { ok: true, userId: auth.user.id };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // ✅ 현재 단계에서는 기존 호출 구조를 절대 깨지 않기 위해
    //    workspace_id query를 그대로 받는다.
    const workspace_id = asString(url.searchParams.get("workspace_id"));
    const limit = asLimit(url.searchParams.get("limit"), 50);

    if (!workspace_id) {
      return jsonError(400, "workspace_id required");
    }

    // ✅ auth
    const auth = await getUserId(req);
    if (!auth.ok) {
      return jsonError(auth.status, auth.message);
    }

    const userId = auth.userId;
    const actorIsPlatformOwner = await isPlatformOwner(userId);

    // ✅ workspace membership 확인
    // - platform_owner면 membership 없이 통과
    // - 아니면 요청한 workspace가 실제로 이 사용자의 접근 가능한 workspace인지 검증
    if (!actorIsPlatformOwner) {
      const { data: wm, error: wmErr } = await supabaseAdmin
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (wmErr) {
        return jsonError(500, wmErr.message);
      }

      if (!wm?.workspace_id) {
        return jsonError(403, "Forbidden");
      }
    }

    // ✅ reports list
    // - workspace_id 기준으로만 조회
    // - 최신 생성 리포트 누락 방지: created_at desc + id desc
    // - advertiser_id / share_token 포함
    const { data, error } = await supabaseAdmin
      .from("reports")
      .select(
        "id,title,status,created_at,workspace_id,advertiser_id,share_token"
      )
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (error) {
      return jsonError(500, error.message);
    }

    const rows = Array.isArray(data) ? data : [];

    // ✅ advertiser_name 보강
    // reports에 advertiser_name 컬럼이 없더라도 advertisers 테이블에서 이름 매핑
    // 반드시 같은 workspace 안의 advertiser만 매핑한다.
    const advertiserIds = Array.from(
      new Set(rows.map((r: any) => asString(r?.advertiser_id)).filter(Boolean))
    );

    let advertiserNameById = new Map<string, string>();

    if (advertiserIds.length > 0) {
      const { data: advs, error: advErr } = await supabaseAdmin
        .from("advertisers")
        .select("id,name,workspace_id")
        .in("id", advertiserIds)
        .eq("workspace_id", workspace_id);

      if (advErr) {
        return jsonError(500, advErr.message);
      }

      advertiserNameById = new Map(
        ((advs ?? []) as any[]).map((a) => [
          asString(a?.id),
          asString(a?.name),
        ])
      );
    }

    const reports = rows.map((r: any) => {
      const advertiser_id = asNullableString(r?.advertiser_id);
      const advertiser_name = advertiser_id
        ? advertiserNameById.get(advertiser_id) ?? null
        : null;

      return {
        id: r?.id ?? null,
        title: r?.title ?? "",
        status: r?.status ?? "",
        created_at: r?.created_at ?? null,
        workspace_id: asString(r?.workspace_id) || workspace_id,
        advertiser_id,
        advertiser_name,
        share_token: asNullableString(r?.share_token),
      };
    });

    return NextResponse.json({
      ok: true,
      workspace_id,
      count: reports.length,
      limit,
      reports,
    });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "server error");
  }
}