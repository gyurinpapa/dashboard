// app/api/advertisers/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";
const ALL_WORKSPACES = "__all__";
const REPORTS_PAGE_MODE = "reports_page";

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status },
  );
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
}

function getBearerToken(req: Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

async function getActor(req: Request) {
  const bearer = getBearerToken(req);

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user) {
      return { user: data.user, error: null };
    }
  }

  const { user, error } = await sbAuth();
  if (error || !user) {
    return { user: null, error: "UNAUTHORIZED" };
  }

  return { user, error: null };
}

async function getMembershipForWorkspace(userId: string, workspaceId: string) {
  const id = asString(userId);
  const wid = asString(workspaceId);

  if (!id || !wid) {
    return { data: null, error: null };
  }

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, user_id, role, division, department, team")
    .eq("user_id", id)
    .eq("workspace_id", wid)
    .maybeSingle();

  return { data, error };
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

  return normalizeEmail(data?.email);
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

function normalizeRole(v: any) {
  return asString(v).toLowerCase();
}

function canListWorkspaceAdvertisers(role: string) {
  return (
    role === "master" ||
    role === "director" ||
    role === "admin" ||
    role === "staff"
  );
}

function canSeeAllAdvertisersInWorkspace(role: string) {
  return role === "master" || role === "director" || role === "admin";
}

function canSeeOwnAdvertisersOnly(role: string) {
  return role === "staff";
}

async function getWorkspaceNamesByIds(workspaceIds: string[]) {
  const ids = Array.from(new Set(workspaceIds.map(asString).filter(Boolean)));

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

function normalizeAdvertiserRow(row: any, workspaceName?: string | null) {
  return {
    id: asString(row?.id),
    name: asString(row?.name),
    workspace_id: asString(row?.workspace_id),
    workspace_name: workspaceName ?? null,
    public_slug: row?.public_slug ? asString(row.public_slug) : null,
    created_by: row?.created_by ? asString(row.created_by) : null,
    created_at: row?.created_at ? String(row.created_at) : null,
  };
}

export async function GET(req: Request) {
  try {
    const actorResult = await getActor(req);
    if (!actorResult.user) {
      return jsonError(401, actorResult.error || "UNAUTHORIZED");
    }

    const actorUserId = asString(actorResult.user.id);

    if (!actorUserId) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const url = new URL(req.url);
    const workspace_id = asString(url.searchParams.get("workspace_id"));
    const mode = asString(url.searchParams.get("mode"));

    if (!workspace_id) {
      return jsonError(400, "workspace_id is required");
    }

    const actorIsPlatformOwner = await isPlatformOwner(actorUserId);
    const actorIsTrueMaster = await isTrueMasterUser(actorUserId);

    /**
     * true master 전용 전체 광고주 조회.
     * - platform_owner 단독으로는 전체 조회 불가.
     * - 전체 master는 모든 workspace의 광고주를 볼 수 있다.
     */
    if (workspace_id === ALL_WORKSPACES) {
      if (!actorIsTrueMaster) {
        return jsonError(403, "ALL_WORKSPACES_ACCESS_DENIED");
      }

      const { data, error } = await supabaseAdmin
        .from("advertisers")
        .select("id, name, workspace_id, created_by, created_at, public_slug")
        .order("name", { ascending: true });

      if (error) {
        return jsonError(500, "FAILED_TO_FETCH_ADVERTISERS", {
          detail: error.message,
        });
      }

      const rows = (data ?? []).filter((row: any) => asString(row?.id));

      const workspaceIds = rows
        .map((row: any) => asString(row?.workspace_id))
        .filter(Boolean);

      const workspaceNameById = await getWorkspaceNamesByIds(workspaceIds);

      const advertisers = rows.map((row: any) => {
        const workspaceId = asString(row?.workspace_id);
        const workspaceName = workspaceNameById.get(workspaceId) ?? null;

        return normalizeAdvertiserRow(row, workspaceName);
      });

      return NextResponse.json({
        ok: true,
        workspace_id: ALL_WORKSPACES,
        is_all_workspaces: true,
        is_true_master: true,
        platform_role: actorIsPlatformOwner ? "platform_owner" : null,
        access_scope: "all_workspaces",
        advertisers,
      });
    }

    /**
     * /reports 전용 광고주 label 조회.
     * - 기존 advertiser list 기본 계약과 완전히 분리한다.
     * - true master는 기존과 동일하게 membership 없이 조회 가능.
     * - 일반 사용자는 반드시 해당 workspace member여야 한다.
     * - role/created_by에 따른 advertiser 축소는 적용하지 않는다.
     * - 현재 /reports Browser 직접 SELECT와 동일하게
     *   해당 workspace의 advertiser label 전체를 반환한다.
     * - 필요한 필드(id, name, workspace_id)만 노출한다.
     */
    if (mode === REPORTS_PAGE_MODE) {
      let actorRole = "";

      if (!actorIsTrueMaster) {
        const membershipResult = await getMembershipForWorkspace(
          actorUserId,
          workspace_id,
        );

        if (membershipResult.error) {
          return jsonError(500, "FAILED_TO_RESOLVE_WORKSPACE_MEMBERSHIP", {
            detail: membershipResult.error.message,
          });
        }

        if (!membershipResult.data) {
          return jsonError(403, "WORKSPACE_ACCESS_DENIED");
        }

        actorRole = normalizeRole(membershipResult.data?.role);
      } else {
        actorRole = "master";
      }

      const { data, error } = await supabaseAdmin
        .from("advertisers")
        .select("id, name, workspace_id")
        .eq("workspace_id", workspace_id)
        .order("name", { ascending: true });

      if (error) {
        return jsonError(500, "FAILED_TO_FETCH_ADVERTISERS", {
          detail: error.message,
        });
      }

      const advertisers = (data ?? [])
        .filter(
          (row: any) =>
            asString(row?.id) &&
            asString(row?.workspace_id) === workspace_id,
        )
        .map((row: any) => ({
          id: asString(row?.id),
          name: row?.name == null ? null : String(row.name),
          workspace_id: asString(row?.workspace_id),
        }));

      return NextResponse.json({
        ok: true,
        workspace_id,
        is_all_workspaces: false,
        is_true_master: actorIsTrueMaster,
        platform_role: actorIsPlatformOwner ? "platform_owner" : null,
        role: actorRole || null,
        access_scope: "reports_page_workspace",
        advertisers,
      });
    }

    /**
     * 단일 workspace 조회.
     * - true master는 membership 없이도 조회 가능.
     * - 일반 사용자는 반드시 해당 workspace member여야 한다.
     * - director/admin: 해당 workspace 전체 광고주 조회 가능.
     * - staff: 본인이 created_by인 광고주만 조회 가능.
     * - client: report-builder 광고주 선택 목록 조회 차단.
     */
    let actorRole = "";

    if (!actorIsTrueMaster) {
      const membershipResult = await getMembershipForWorkspace(
        actorUserId,
        workspace_id,
      );

      if (membershipResult.error) {
        return jsonError(500, "FAILED_TO_RESOLVE_WORKSPACE_MEMBERSHIP", {
          detail: membershipResult.error.message,
        });
      }

      if (!membershipResult.data) {
        return jsonError(403, "WORKSPACE_ACCESS_DENIED");
      }

      actorRole = normalizeRole(membershipResult.data?.role);

      if (!canListWorkspaceAdvertisers(actorRole)) {
        return jsonError(403, "ADVERTISER_LIST_ACCESS_DENIED", {
          role: actorRole || null,
        });
      }
    } else {
      actorRole = "master";
    }

    let query = supabaseAdmin
      .from("advertisers")
      .select("id, name, workspace_id, created_by, created_at, public_slug")
      .eq("workspace_id", workspace_id)
      .order("name", { ascending: true });

    if (!actorIsTrueMaster && canSeeOwnAdvertisersOnly(actorRole)) {
      query = query.eq("created_by", actorUserId);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError(500, "FAILED_TO_FETCH_ADVERTISERS", {
        detail: error.message,
      });
    }

    const advertisers = (data ?? [])
      .filter((row: any) => asString(row?.workspace_id) === workspace_id)
      .filter((row: any) => {
        if (actorIsTrueMaster) return true;
        if (canSeeAllAdvertisersInWorkspace(actorRole)) return true;
        if (canSeeOwnAdvertisersOnly(actorRole)) {
          return asString(row?.created_by) === actorUserId;
        }

        return false;
      })
      .map((row: any) => normalizeAdvertiserRow(row, null));

    return NextResponse.json({
      ok: true,
      workspace_id,
      is_all_workspaces: false,
      is_true_master: actorIsTrueMaster,
      platform_role: actorIsPlatformOwner ? "platform_owner" : null,
      role: actorRole || null,
      access_scope: actorIsTrueMaster
        ? "true_master_workspace"
        : canSeeAllAdvertisersInWorkspace(actorRole)
          ? "workspace"
          : canSeeOwnAdvertisersOnly(actorRole)
            ? "own_created"
            : "none",
      advertisers,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    if (msg.startsWith("FAILED_TO_FETCH_PROFILE_EMAIL:")) {
      return jsonError(500, "FAILED_TO_FETCH_PROFILE_EMAIL", {
        detail: msg.replace("FAILED_TO_FETCH_PROFILE_EMAIL:", ""),
      });
    }

    if (msg.startsWith("FAILED_TO_FETCH_MASTER_MEMBERSHIP:")) {
      return jsonError(500, "FAILED_TO_FETCH_MASTER_MEMBERSHIP", {
        detail: msg.replace("FAILED_TO_FETCH_MASTER_MEMBERSHIP:", ""),
      });
    }

    return jsonError(500, "INTERNAL_ERROR", {
      detail: e?.message ?? String(e),
    });
  }
}