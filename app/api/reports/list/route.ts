// app/api/reports/list/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (!v) return "";
  return String(v).trim();
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
async function getUserId(req: Request): Promise<
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

    const workspace_id = asString(url.searchParams.get("workspace_id"));
    const limit = asLimit(url.searchParams.get("limit"), 50);

    if (!workspace_id) {
      return jsonError(400, "workspace_id required");
    }

    // ✅ auth
    const auth = await getUserId(req);
    if (!auth.ok) return jsonError(auth.status, auth.message);

    const userId = auth.userId;

    // ✅ workspace membership 확인 (+ 에러 핸들링)
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden");

    // ✅ reports list
    // - 최신 생성 리포트 누락 방지: workspace_id 기준 + created_at desc + id desc
    // - advertiser_id / share_token 포함
    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("id,title,status,created_at,workspace_id,advertiser_id,share_token")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (error) {
      return jsonError(500, error.message);
    }

    const rows = (data ?? []) as any[];

    // ✅ advertiser_name 보강
    // reports에 advertiser_name 컬럼이 없더라도 advertisers 테이블에서 이름 매핑
    const advertiserIds = Array.from(
      new Set(
        rows
          .map((r) => asString(r?.advertiser_id))
          .filter(Boolean)
      )
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
        ((advs ?? []) as any[]).map((a) => [String(a.id), String(a.name ?? "")])
      );
    }

    const reports = rows.map((r) => {
      const advertiser_id = asString(r?.advertiser_id) || null;
      const advertiser_name = advertiser_id
        ? advertiserNameById.get(advertiser_id) ?? null
        : null;

      return {
        id: r?.id,
        title: r?.title,
        status: r?.status,
        created_at: r?.created_at ?? null,
        workspace_id: r?.workspace_id ?? workspace_id,
        advertiser_id,
        advertiser_name,
        share_token: asString(r?.share_token) || null,
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