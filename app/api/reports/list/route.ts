// app/api/reports/list/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";
const ALL_WORKSPACES = "__all__";

const REPORT_LIST_SELECT = [
  "id",
  "title",
  "status",
  "created_at",
  "created_by",
  "workspace_id",
  "advertiser_id",
  "share_token",
  "period_start",
  "period_end",
  "draft_period_start",
  "draft_period_end",
  "published_period_start",
  "published_period_end",
  "published_at",
  "meta",
].join(", ");

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

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeRole(v: any) {
  return asString(v).toLowerCase();
}

function canListWorkspaceReports(role: string) {
  return role === "director" || role === "admin" || role === "staff";
}

function canSeeAllReportsInWorkspace(role: string) {
  return role === "director" || role === "admin";
}

function canSeeOwnReportsOnly(role: string) {
  return role === "staff";
}

function getReportDataSourceKindFromMeta(meta: any): "csv" | "api" {
  const dataSource = isPlainObject(meta?.data_source) ? meta.data_source : {};
  const kind = asString(dataSource?.kind).toLowerCase();

  if (kind === "api") return "api";
  return "csv";
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

async function getWorkspaceMembership(userId: string, workspaceId: string) {
  const id = asString(userId);
  const wid = asString(workspaceId);

  if (!id || !wid) {
    return { data: null, error: null };
  }

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, user_id, role, division, department, team")
    .eq("workspace_id", wid)
    .eq("user_id", id)
    .maybeSingle();

  return { data, error };
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

async function getAdvertiserNameMap(args: {
  advertiserIds: string[];
  workspaceId?: string;
}) {
  const advertiserIds = Array.from(
    new Set(args.advertiserIds.map(asString).filter(Boolean))
  );

  const map = new Map<string, string>();

  if (!advertiserIds.length) return map;

  let query = supabaseAdmin
    .from("advertisers")
    .select("id,name,workspace_id")
    .in("id", advertiserIds);

  if (args.workspaceId) {
    query = query.eq("workspace_id", args.workspaceId);
  }

  const { data, error } = await query;

  if (error || !data) return map;

  for (const row of data as any[]) {
    const id = asString(row?.id);
    if (!id) continue;

    map.set(id, asString(row?.name));
  }

  return map;
}

function normalizeReportRow(args: {
  row: any;
  workspaceIdFallback?: string | null;
  workspaceName?: string | null;
  advertiserNameById: Map<string, string>;
}) {
  const { row, workspaceIdFallback, workspaceName, advertiserNameById } = args;

  const advertiser_id = asNullableString(row?.advertiser_id);
  const advertiser_name = advertiser_id
    ? advertiserNameById.get(advertiser_id) ?? null
    : null;

  const meta = isPlainObject(row?.meta) ? row.meta : {};
  const mediaSync = isPlainObject(meta?.media_sync) ? meta.media_sync : {};

  const mediaSyncSettings = {
    media_sync_date_from: asNullableString(mediaSync?.date_from),
    media_sync_date_to: asNullableString(mediaSync?.date_to),
    media_sync_data_level: asNullableString(mediaSync?.data_level) ?? "keyword",
    media_sync_mode: asNullableString(mediaSync?.mode) ?? "snapshot_replace",
  };

  return {
    id: row?.id ?? null,
    title: row?.title ?? "",
    status: row?.status ?? "",
    created_at: row?.created_at ?? null,
    created_by: asNullableString(row?.created_by),

    workspace_id: asString(row?.workspace_id) || workspaceIdFallback || "",
    workspace_name: workspaceName ?? null,

    advertiser_id,
    advertiser_name,
    share_token: asNullableString(row?.share_token),

    period_start: asNullableString(row?.period_start),
    period_end: asNullableString(row?.period_end),
    draft_period_start: asNullableString(row?.draft_period_start),
    draft_period_end: asNullableString(row?.draft_period_end),
    published_period_start: asNullableString(row?.published_period_start),
    published_period_end: asNullableString(row?.published_period_end),
    published_at: asNullableString(row?.published_at),

    data_source_kind: getReportDataSourceKindFromMeta(meta),
    ...mediaSyncSettings,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const workspace_id = asString(url.searchParams.get("workspace_id"));
    const limit = asLimit(url.searchParams.get("limit"), 50);
    const offset = asOffset(url.searchParams.get("offset"), 0);

    if (!workspace_id) {
      return jsonError(400, "workspace_id required");
    }

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
     */
    if (workspace_id === ALL_WORKSPACES) {
      if (!actorIsTrueMaster) {
        return jsonError(403, "ALL_WORKSPACES_ACCESS_DENIED");
      }

      const from = offset;
      const to = offset + limit - 1;

      const { data, error } = await supabaseAdmin
        .from("reports")
        .select(REPORT_LIST_SELECT)
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

      const advertiserNameById = await getAdvertiserNameMap({
        advertiserIds,
      });

      const reports = rows.map((r: any) => {
        const workspaceId = asString(r?.workspace_id);
        const workspaceName = workspaceNameById.get(workspaceId) ?? null;

        return normalizeReportRow({
          row: r,
          workspaceIdFallback: workspaceId,
          workspaceName,
          advertiserNameById,
        });
      });

      const has_more = rows.length >= limit;
      const next_offset = offset + rows.length;

      return NextResponse.json({
        ok: true,
        workspace_id: ALL_WORKSPACES,
        is_all_workspaces: true,
        is_true_master: true,
        platform_role: actorIsPlatformOwner ? "platform_owner" : null,
        access_scope: "all_workspaces",
        count: reports.length,
        limit,
        offset,
        has_more,
        next_offset,
        reports,
      });
    }

    /**
     * ✅ 단일 workspace 조회
     * - true master: membership 없이도 특정 workspace 전체 조회 가능
     * - director/admin: 해당 workspace 전체 리포트 조회
     * - staff: 해당 workspace 중 본인이 created_by인 리포트만 조회
     * - client: 리포트 빌더 목록 조회 차단
     */
    let actorRole = "";

    if (!actorIsTrueMaster) {
      const membershipResult = await getWorkspaceMembership(userId, workspace_id);

      if (membershipResult.error) {
        return jsonError(500, "FAILED_TO_RESOLVE_WORKSPACE_MEMBERSHIP", {
          detail: membershipResult.error.message,
        });
      }

      if (!membershipResult.data?.workspace_id) {
        return jsonError(403, "WORKSPACE_ACCESS_DENIED");
      }

      actorRole = normalizeRole(membershipResult.data?.role);

      if (!canListWorkspaceReports(actorRole)) {
        return jsonError(403, "REPORT_LIST_ACCESS_DENIED", {
          role: actorRole || null,
        });
      }
    } else {
      actorRole = "master";
    }

    const from = offset;
    const to = offset + limit - 1;

    let query = supabaseAdmin
      .from("reports")
      .select(REPORT_LIST_SELECT)
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (!actorIsTrueMaster && canSeeOwnReportsOnly(actorRole)) {
      query = query.eq("created_by", userId);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError(500, error.message);
    }

    const rows = Array.isArray(data) ? data : [];

    const advertiserIds = Array.from(
      new Set(rows.map((r: any) => asString(r?.advertiser_id)).filter(Boolean))
    );

    const advertiserNameById = await getAdvertiserNameMap({
      advertiserIds,
      workspaceId: workspace_id,
    });

    const reports = rows
      .filter((r: any) => asString(r?.workspace_id) === workspace_id)
      .filter((r: any) => {
        if (actorIsTrueMaster) return true;
        if (canSeeAllReportsInWorkspace(actorRole)) return true;
        if (canSeeOwnReportsOnly(actorRole)) {
          return asString(r?.created_by) === userId;
        }

        return false;
      })
      .map((r: any) =>
        normalizeReportRow({
          row: r,
          workspaceIdFallback: workspace_id,
          workspaceName: null,
          advertiserNameById,
        })
      );

    const has_more = rows.length >= limit;
    const next_offset = offset + rows.length;

    return NextResponse.json({
      ok: true,
      workspace_id,
      is_all_workspaces: false,
      is_true_master: actorIsTrueMaster,
      platform_role: actorIsPlatformOwner ? "platform_owner" : null,
      role: actorRole || null,
      access_scope: actorIsTrueMaster
        ? "true_master_workspace"
        : canSeeAllReportsInWorkspace(actorRole)
          ? "workspace"
          : canSeeOwnReportsOnly(actorRole)
            ? "own_created"
            : "none",
      count: reports.length,
      limit,
      offset,
      has_more,
      next_offset,
      reports,
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