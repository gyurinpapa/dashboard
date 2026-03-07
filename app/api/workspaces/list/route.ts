// app/api/workspaces/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemberRole = "master" | "director" | "admin" | "staff" | "client" | null;

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

function normalizeRole(v: any): MemberRole {
  const s = asString(v).toLowerCase();
  if (
    s === "master" ||
    s === "director" ||
    s === "admin" ||
    s === "staff" ||
    s === "client"
  ) {
    return s;
  }
  return null;
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
      return { user: data.user, error: null as string | null };
    }
  }

  const { user, error } = await sbAuth();
  if (error || !user) {
    return { user: null, error: "UNAUTHORIZED" };
  }

  return { user, error: null as string | null };
}

async function getWorkspaceNamesByIds(workspaceIds: string[]) {
  const ids = Array.from(new Set(workspaceIds.map(asString).filter(Boolean)));
  const workspaceMap = new Map<string, string>();

  if (!ids.length) return workspaceMap;

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name")
    .in("id", ids);

  if (error || !data) {
    return workspaceMap;
  }

  for (const row of data as any[]) {
    const id = asString(row?.id);
    if (!id) continue;
    workspaceMap.set(id, asString(row?.name));
  }

  return workspaceMap;
}

export async function GET(req: Request) {
  try {
    const actorResult = await getActor(req);
    if (!actorResult.user) {
      return jsonError(401, actorResult.error || "UNAUTHORIZED");
    }

    const userId = actorResult.user.id;
    const actorIsPlatformOwner = await isPlatformOwner(userId);

    // 1) platform_owner는 전체 workspace 선택 가능
    if (actorIsPlatformOwner) {
      const { data: workspaces, error } = await supabaseAdmin
        .from("workspaces")
        .select("id, name, created_at")
        .order("name", { ascending: true });

      if (error) {
        return jsonError(500, "FAILED_TO_FETCH_WORKSPACES", {
          detail: error.message,
        });
      }

      const rows = (workspaces ?? []).map((w: any) => ({
        workspace_id: asString(w?.id),
        workspace_name: asString(w?.name) || null,
        role: "master" as const,
        division: null,
        department: null,
        team: null,
        platform_role: "platform_owner" as const,
      }));

      return NextResponse.json({
        ok: true,
        platform_role: "platform_owner",
        workspaces: rows,
      });
    }

    // 2) 일반 사용자는 본인 membership 기준
    const { data: memberships, error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role, division, department, team, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (memberErr) {
      return jsonError(500, "FAILED_TO_FETCH_WORKSPACE_MEMBERSHIPS", {
        detail: memberErr.message,
      });
    }

    const membershipRows = Array.isArray(memberships) ? memberships : [];
    const workspaceIds = membershipRows
      .map((m: any) => asString(m?.workspace_id))
      .filter(Boolean);

    const workspaceNameById = await getWorkspaceNamesByIds(workspaceIds);

    const rows = membershipRows.map((m: any) => ({
      workspace_id: asString(m?.workspace_id),
      workspace_name: workspaceNameById.get(asString(m?.workspace_id)) ?? null,
      role: normalizeRole(m?.role),
      division: m?.division ?? null,
      department: m?.department ?? null,
      team: m?.team ?? null,
      platform_role: null,
    }));

    return NextResponse.json({
      ok: true,
      platform_role: null,
      workspaces: rows,
    });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_SERVER_ERROR", {
      detail: e?.message ?? null,
    });
  }
}