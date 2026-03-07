// app/api/advertisers/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function getBearerToken(req: Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
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
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, user_id, role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return { data, error };
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

    if (!actorIsPlatformOwner) {
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

    const advertisers = (data ?? []).map((row: any) => ({
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
    return jsonError(500, "INTERNAL_SERVER_ERROR", { detail: e?.message });
  }
}