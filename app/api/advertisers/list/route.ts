// app/api/advertisers/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
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
    .select("workspace_id, user_id, role")
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

export async function GET(req: Request) {
  try {
    const actorResult = await getActor(req);
    if (!actorResult.user) {
      return jsonError(401, actorResult.error || "UNAUTHORIZED");
    }

    const url = new URL(req.url);
    const workspace_id = asString(url.searchParams.get("workspace_id"));

    if (!workspace_id) {
      return jsonError(400, "workspace_id is required");
    }

    const actorIsPlatformOwner = await isPlatformOwner(actorResult.user.id);
    const actorIsTrueMaster = await isTrueMasterUser(actorResult.user.id);

    const actorCanBypassWorkspaceMembership =
      actorIsPlatformOwner && actorIsTrueMaster;

    if (!actorCanBypassWorkspaceMembership) {
      const membershipResult = await getMembershipForWorkspace(
        actorResult.user.id,
        workspace_id
      );

      if (membershipResult.error) {
        return jsonError(500, "FAILED_TO_RESOLVE_WORKSPACE_MEMBERSHIP", {
          detail: membershipResult.error.message,
        });
      }

      if (!membershipResult.data) {
        return jsonError(403, "WORKSPACE_ACCESS_DENIED");
      }
    }

    const { data, error } = await supabaseAdmin
      .from("advertisers")
      .select("id, name, workspace_id, created_at")
      .eq("workspace_id", workspace_id)
      .order("name", { ascending: true });

    if (error) {
      return jsonError(500, "FAILED_TO_FETCH_ADVERTISERS", {
        detail: error.message,
      });
    }

    const advertisers = (data ?? [])
      .filter((row: any) => asString(row?.workspace_id) === workspace_id)
      .map((row: any) => ({
        id: asString(row?.id),
        name: asString(row?.name),
        workspace_id: asString(row?.workspace_id),
        created_at: row?.created_at ? String(row.created_at) : null,
      }));

    return NextResponse.json({
      ok: true,
      workspace_id,
      advertisers,
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

    return jsonError(500, "INTERNAL_SERVER_ERROR", { detail: e?.message });
  }
}