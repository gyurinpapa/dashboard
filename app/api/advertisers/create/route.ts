// app/api/advertisers/create/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
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

function canCreateAdvertiser(role: any, email: any) {
  const normalizedRole = asString(role).toLowerCase();

  if (normalizedRole === "master") {
    return normalizeEmail(email) === ONLY_MASTER_EMAIL;
  }

  return (
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

    if (!canCreateAdvertiser(mem.role, user.email)) {
      return jsonError(403, "FORBIDDEN_CREATE_ADVERTISER_PERMISSION");
    }

    const resolvedWorkspaceId = asString(mem.workspace_id);

    if (!resolvedWorkspaceId || resolvedWorkspaceId !== workspace_id) {
      return jsonError(403, "FORBIDDEN_WORKSPACE_MISMATCH");
    }

    const { data: dup, error: dupErr } = await admin
      .from("advertisers")
      .select("id, name")
      .eq("workspace_id", resolvedWorkspaceId)
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