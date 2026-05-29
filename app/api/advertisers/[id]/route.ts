// app/api/advertisers/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function jsonError(status: number, message: string, extra?: any) {
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
    if (!error && data?.user) return { user: data.user };
  }

  const { user } = await sbAuth();
  return { user };
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
    throw new Error(`PROFILE_EMAIL_FETCH_FAILED:${error.message}`);
  }

  return normalizeEmail(data?.email);
}

async function getWorkspaceRole(userId: string, workspaceId: string) {
  const id = asString(userId);
  const wid = asString(workspaceId);

  if (!id || !wid) return "";

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("user_id", id)
    .eq("workspace_id", wid)
    .maybeSingle();

  if (error) {
    throw new Error(`WORKSPACE_ROLE_CHECK_FAILED:${error.message}`);
  }

  return asString(data?.role).toLowerCase();
}

async function isTrueMasterUser(userId: string, workspaceId: string) {
  const id = asString(userId);
  const wid = asString(workspaceId);

  if (!id || !wid) return false;

  const email = await getProfileEmailByUserId(id);

  if (email !== ONLY_MASTER_EMAIL) {
    return false;
  }

  const role = await getWorkspaceRole(id, wid);

  return role === "master";
}

function canManageWorkspaceAdvertiser(role: string) {
  return role === "director" || role === "admin";
}

function canManageOwnAdvertiser(role: string) {
  return role === "staff";
}

function canAccessAdvertiser(args: {
  role: string;
  isTrueMaster: boolean;
  actorUserId: string;
  advertiserCreatedBy: string;
}) {
  const { role, isTrueMaster, actorUserId, advertiserCreatedBy } = args;

  if (isTrueMaster) return true;

  if (canManageWorkspaceAdvertiser(role)) {
    return true;
  }

  if (canManageOwnAdvertiser(role)) {
    return advertiserCreatedBy === actorUserId;
  }

  return false;
}

async function fetchAdvertiserById(advertiserId: string) {
  const { data, error } = await supabaseAdmin
    .from("advertisers")
    .select("id, name, workspace_id, created_by, created_at, public_slug")
    .eq("id", advertiserId)
    .maybeSingle();

  if (error) {
    throw new Error(`ADVERTISER_FETCH_FAILED:${error.message}`);
  }

  return data ?? null;
}

export async function PATCH(req: Request, ctx: Ctx) {
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

    const body = await req.json().catch(() => ({}));
    const name = asString(body?.name);

    if (!name) {
      return jsonError(400, "NAME_REQUIRED");
    }

    const adv = await fetchAdvertiserById(advertiserId);

    if (!adv) {
      return jsonError(404, "NOT_FOUND");
    }

    const workspaceId = asString((adv as any).workspace_id);

    if (!workspaceId) {
      return jsonError(500, "ADVERTISER_WORKSPACE_MISSING");
    }

    const role = await getWorkspaceRole(user.id, workspaceId);
    const isTrueMaster = await isTrueMasterUser(user.id, workspaceId);
    const advertiserCreatedBy = asString((adv as any)?.created_by);

    if (
      !canAccessAdvertiser({
        role,
        isTrueMaster,
        actorUserId: asString(user.id),
        advertiserCreatedBy,
      })
    ) {
      return jsonError(403, "FORBIDDEN_UPDATE_PERMISSION", {
        role: role || null,
        access_scope: role === "staff" ? "own_created" : "workspace",
      });
    }

    const { data: dup, error: dupErr } = await supabaseAdmin
      .from("advertisers")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .ilike("name", name)
      .neq("id", advertiserId)
      .limit(1);

    if (dupErr) {
      return jsonError(500, "DUP_CHECK_FAILED", { detail: dupErr.message });
    }

    if ((dup?.length ?? 0) > 0) {
      return jsonError(409, "NAME_ALREADY_EXISTS", {
        advertiser_id: dup?.[0]?.id ?? null,
      });
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("advertisers")
      .update({ name })
      .eq("id", advertiserId)
      .eq("workspace_id", workspaceId)
      .select("id, name, workspace_id, created_by, created_at, public_slug")
      .maybeSingle();

    if (upErr) {
      return jsonError(500, "UPDATE_FAILED", { detail: upErr.message });
    }

    if (!updated) {
      return jsonError(404, "NOT_FOUND");
    }

    return NextResponse.json({
      ok: true,
      advertiser: updated,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    if (msg.startsWith("PROFILE_EMAIL_FETCH_FAILED:")) {
      return jsonError(500, "PROFILE_EMAIL_FETCH_FAILED", {
        detail: msg.replace("PROFILE_EMAIL_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("WORKSPACE_ROLE_CHECK_FAILED:")) {
      return jsonError(500, "WORKSPACE_ROLE_CHECK_FAILED", {
        detail: msg.replace("WORKSPACE_ROLE_CHECK_FAILED:", ""),
      });
    }

    if (msg.startsWith("ADVERTISER_FETCH_FAILED:")) {
      return jsonError(500, "ADVERTISER_FETCH_FAILED", {
        detail: msg.replace("ADVERTISER_FETCH_FAILED:", ""),
      });
    }

    return jsonError(500, "INTERNAL_ERROR", { detail: e?.message });
  }
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

    const adv = await fetchAdvertiserById(advertiserId);

    if (!adv) {
      return jsonError(404, "NOT_FOUND");
    }

    const workspaceId = asString((adv as any).workspace_id);

    if (!workspaceId) {
      return jsonError(500, "ADVERTISER_WORKSPACE_MISSING");
    }

    const role = await getWorkspaceRole(user.id, workspaceId);
    const isTrueMaster = await isTrueMasterUser(user.id, workspaceId);
    const advertiserCreatedBy = asString((adv as any)?.created_by);

    if (
      !canAccessAdvertiser({
        role,
        isTrueMaster,
        actorUserId: asString(user.id),
        advertiserCreatedBy,
      })
    ) {
      return jsonError(403, "FORBIDDEN_DELETE_PERMISSION", {
        role: role || null,
        access_scope: role === "staff" ? "own_created" : "workspace",
      });
    }

    /**
     * 연결된 리포트가 있으면 삭제 차단 유지.
     * - 광고주 삭제 시 report orphan을 만들지 않기 위한 기존 안전장치.
     */
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

    const { error: delErr } = await supabaseAdmin
      .from("advertisers")
      .delete()
      .eq("id", advertiserId)
      .eq("workspace_id", workspaceId);

    if (delErr) {
      return jsonError(500, "DELETE_FAILED", { detail: delErr.message });
    }

    return NextResponse.json({
      ok: true,
      deleted_id: advertiserId,
      workspace_id: workspaceId,
      access_scope: isTrueMaster
        ? "true_master"
        : canManageWorkspaceAdvertiser(role)
          ? "workspace"
          : canManageOwnAdvertiser(role)
            ? "own_created"
            : "none",
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    if (msg.startsWith("PROFILE_EMAIL_FETCH_FAILED:")) {
      return jsonError(500, "PROFILE_EMAIL_FETCH_FAILED", {
        detail: msg.replace("PROFILE_EMAIL_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("WORKSPACE_ROLE_CHECK_FAILED:")) {
      return jsonError(500, "WORKSPACE_ROLE_CHECK_FAILED", {
        detail: msg.replace("WORKSPACE_ROLE_CHECK_FAILED:", ""),
      });
    }

    if (msg.startsWith("ADVERTISER_FETCH_FAILED:")) {
      return jsonError(500, "ADVERTISER_FETCH_FAILED", {
        detail: msg.replace("ADVERTISER_FETCH_FAILED:", ""),
      });
    }

    return jsonError(500, "INTERNAL_ERROR", { detail: e?.message });
  }
}