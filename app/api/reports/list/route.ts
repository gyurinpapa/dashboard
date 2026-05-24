// app/api/reports/list/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";
const ALL_WORKSPACES = "__all__";

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

function asOffset(v: any, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;

  const x = Math.floor(n);
  if (x < 0) return 0;
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

async function getProfileEmailByUserId(userId: string) {
  const id = asString(userId);
  if (!id) return "";

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`FAILED_TO_FETCH_PROFILE_EMAIL:${error.message}`);
  }

  return asString(data?.email).toLowerCase();
}

async function hasMasterMembership(userId: string) {
  const id = asString(userId);
  if (!id) return false;

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", id)
    .eq("role", "master")
    .limit(1);

  if (error) {
    throw new Error(`FAILED_TO_FETCH_MASTER_MEMBERSHIP:${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

async function isTrueMasterUser(userId: string) {
  const email = await getProfileEmailByUserId(userId);

  if (email !== ONLY_MASTER_EMAIL) {
    return false;
  }

  return await hasMasterMembership(userId);
}

async function getWorkspaceNamesByIds(workspaceIds: string[]) {
  const ids = Array.from(
    new Set(workspaceIds.map(asString).filter(Boolean))
  );

  const map = new Map<string, string>();

  if (!ids.length) return map;

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name")
    .in("id", ids);

  if (error || !data) return map;

  for (const row of data as any[]) {
    const id = asString(row?.id);
    if (!id) continue;

    map.set(id, asString(row?.name));
  }

  return map;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // ✅ 기존 호출 구조 유지 + 점진 로딩 지원
    const workspace_id = asString(url.searchParams.get("workspace_id"));
    const limit = asLimit(url.searchParams.get("limit"), 50);
    const offset = asOffset(url.searchParams.get("offset"), 0);

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
    const actorIsTrueMaster = await isTrueMasterUser(userId);

    /**
     * ✅ true master 전용 전체 리포트 조회
     * - platform_owner 단독으로는 전체 조회 불가
     * - true master는 전체 workspace reports 조회 가능
     * - 기존 단일 workspace 조회 구조는 그대로 유지
     */
    if (workspace_id === ALL_WORKSPACES) {
      if (!actorIsTrueMaster) {
        return jsonError(403, "ALL_WORKSPACES_ACCESS_DENIED");
      }

      const from = offset;
      const to = offset + limit - 1;

      const { data, error } = await supabaseAdmin
        .from("reports")
        .select(
          "id,title,status,created_at,workspace_id,advertiser_id,share_token"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (error) {
        return jsonError(500, error.message);
      }

      const rows = Array.isArray(data) ? data : [];

      const workspaceIds = Array.from(
        new Set(rows.map((r: any) => asString(r?.workspace_id)).filter(Boolean))
      );

      const workspaceNameById = await getWorkspaceNamesByIds(workspaceIds);

      const advertiserIds = Array.from(
        new Set(rows.map((r: any) => asString(r?.advertiser_id)).filter(Boolean))
      );

      let advertiserNameById = new Map<string, string>();

      if (advertiserIds.length > 0) {
        const { data: advs, error: advErr } = await supabaseAdmin
          .from("advertisers")
          .select("id,name,workspace_id")
          .in("id", advertiserIds);

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
        const workspaceId = asString(r?.workspace_id);
        const advertiser_id = asNullableString(r?.advertiser_id);
        const advertiser_name = advertiser_id
          ? advertiserNameById.get(advertiser_id) ?? null
          : null;

        return {
          id: r?.id ?? null,
          title: r?.title ?? "",
          status: r?.status ?? "",
          created_at: r?.created_at ?? null,
          workspace_id: workspaceId,
          workspace_name: workspaceNameById.get(workspaceId) ?? null,
          advertiser_id,
          advertiser_name,
          share_token: asNullableString(r?.share_token),
        };
      });

      const has_more = rows.length >= limit;
      const next_offset = offset + rows.length;

      return NextResponse.json({
        ok: true,
        workspace_id: ALL_WORKSPACES,
        is_all_workspaces: true,
        is_true_master: true,
        platform_role: actorIsPlatformOwner ? "platform_owner" : null,
        count: reports.length,
        limit,
        offset,
        has_more,
        next_offset,
        reports,
      });
    }

    const actorCanBypassWorkspaceMembership = actorIsTrueMaster;

    /**
     * ✅ workspace membership 확인
     * - true master는 전체 workspace를 볼 수 있으므로 단일 workspace membership도 bypass 가능
     * - platform_owner 단독으로는 통과 불가
     * - 그 외 사용자는 요청한 workspace가 실제로 이 사용자의 접근 가능한 workspace인지 검증
     */
    if (!actorCanBypassWorkspaceMembership) {
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
    // - workspace_id 기준 조회
    // - 안정 정렬 유지: created_at desc + id desc
    // - offset/limit 기반 점진 로딩 지원
    const from = offset;
    const to = offset + limit - 1;

    const { data, error } = await supabaseAdmin
      .from("reports")
      .select(
        "id,title,status,created_at,workspace_id,advertiser_id,share_token"
      )
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

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
        workspace_name: null,
        advertiser_id,
        advertiser_name,
        share_token: asNullableString(r?.share_token),
      };
    });

    const has_more = rows.length >= limit;
    const next_offset = offset + rows.length;

    return NextResponse.json({
      ok: true,
      workspace_id,
      is_all_workspaces: false,
      is_true_master: actorIsTrueMaster,
      platform_role: actorIsPlatformOwner ? "platform_owner" : null,
      count: reports.length,
      limit,
      offset,
      has_more,
      next_offset,
      reports,
    });
  } catch (e: any) {
    const msg = e?.message ?? "";

    if (String(msg).startsWith("FAILED_TO_FETCH_PROFILE_EMAIL:")) {
      return jsonError(500, "FAILED_TO_FETCH_PROFILE_EMAIL", {
        detail: String(msg).replace("FAILED_TO_FETCH_PROFILE_EMAIL:", ""),
      });
    }

    if (String(msg).startsWith("FAILED_TO_FETCH_MASTER_MEMBERSHIP:")) {
      return jsonError(500, "FAILED_TO_FETCH_MASTER_MEMBERSHIP", {
        detail: String(msg).replace("FAILED_TO_FETCH_MASTER_MEMBERSHIP:", ""),
      });
    }

    return jsonError(500, e?.message ?? "server error");
  }
}