// app/api/advertisers/create/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
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

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function getBearerToken(req: Request) {
  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function canCreateAdvertiser(role: any) {
  const normalizedRole = asString(role).toLowerCase();

  return (
    normalizedRole === "master" ||
    normalizedRole === "director" ||
    normalizedRole === "admin" ||
    normalizedRole === "staff"
  );
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

    if (!workspace_id) return jsonError(400, "workspace_id required");
    if (!name) return jsonError(400, "name required");

    const admin = getSupabaseAdmin();

    const actorIsTrueMaster = await isTrueMasterUser(user.id);

    let mem: {
      workspace_id?: string | null;
      user_id?: string | null;
      role?: string | null;
    } | null = null;

    if (!actorIsTrueMaster) {
      const { data, error: memErr } = await admin
        .from("workspace_members")
        .select("workspace_id, user_id, role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (memErr) {
        return jsonError(500, "MEMBERSHIP_CHECK_FAILED", { detail: memErr.message });
      }

      mem = data;

      if (!mem) {
        return jsonError(403, "FORBIDDEN");
      }

      if (!canCreateAdvertiser(mem.role)) {
        return jsonError(403, "FORBIDDEN_CREATE_ADVERTISER_PERMISSION");
      }
    }

    const resolvedWorkspaceId = actorIsTrueMaster
      ? workspace_id
      : asString(mem?.workspace_id);

    if (!resolvedWorkspaceId || resolvedWorkspaceId !== workspace_id) {
      return jsonError(403, "FORBIDDEN_WORKSPACE_MISMATCH");
    }

    const { data: created, error: insErr } = await admin
      .from("advertisers")
      .insert({
        workspace_id: resolvedWorkspaceId,
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