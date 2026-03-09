// app/api/workspace-members/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "master" | "director" | "admin" | "staff" | "client";

const ALLOWED_ROLES: Role[] = ["master", "director", "admin", "staff", "client"];

/**
 * ✅ master는 오직 이 이메일 1명만 허용
 */
const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeNullable(v: any) {
  const s = asString(v);
  return s || null;
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
}

function isRole(v: any): v is Role {
  return ALLOWED_ROLES.includes(v);
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
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return { data, error };
}

async function getFirstPrivilegedMembership(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("*")
    .eq("user_id", userId)
    .in("role", ["master", "director"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { data: null, error };
  return { data: data?.[0] ?? null, error: null };
}

async function getFirstMasterMembership(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("*")
    .eq("user_id", userId)
    .eq("role", "master")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { data: null, error };
  return { data: data?.[0] ?? null, error: null };
}

async function getFirstAccessibleMembership(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("*")
    .eq("user_id", userId)
    .in("role", ["master", "director", "admin", "staff", "client"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { data: null, error };
  return { data: data?.[0] ?? null, error: null };
}

function canAccess(role?: string | null) {
  return role === "master" || role === "director";
}

function canDirectorEditTarget(targetRole?: string | null) {
  return targetRole !== "master" && targetRole !== "director";
}

async function getProfilesByUserIds(userIds: string[]) {
  const ids = Array.from(new Set(userIds.map(asString).filter(Boolean)));

  if (!ids.length) {
    return new Map<
      string,
      {
        name: string | null;
        email: string | null;
      }
    >();
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email")
    .in("id", ids);

  const profileMap = new Map<
    string,
    {
      name: string | null;
      email: string | null;
    }
  >();

  if (error || !profiles) {
    return profileMap;
  }

  for (const p of profiles as any[]) {
    const id = asString(p?.id);
    if (!id) continue;

    profileMap.set(id, {
      name: p?.name ? String(p.name) : null,
      email: p?.email ? String(p.email) : null,
    });
  }

  return profileMap;
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

async function attachProfileFields<T extends Record<string, any>>(members: T[]) {
  const rows = Array.isArray(members) ? members : [];

  const userIds = Array.from(
    new Set(
      rows
        .map((m) => asString(m?.user_id))
        .filter(Boolean)
    )
  );

  const profileMap = await getProfilesByUserIds(userIds);

  return rows.map((m) => {
    const p = profileMap.get(asString(m?.user_id));
    return {
      ...m,
      email: p?.email ?? null,
      full_name: p?.name ?? null,
      name: p?.name ?? null,
    };
  });
}

async function attachWorkspaceFields<T extends Record<string, any>>(members: T[]) {
  const rows = Array.isArray(members) ? members : [];

  const workspaceIds = Array.from(
    new Set(
      rows
        .map((m) => asString(m?.workspace_id))
        .filter(Boolean)
    )
  );

  const workspaceMap = await getWorkspaceNamesByIds(workspaceIds);

  return rows.map((m) => ({
    ...m,
    workspace_name: workspaceMap.get(asString(m?.workspace_id)) ?? null,
  }));
}

async function isTrueMasterUser(userId: string) {
  const profileMap = await getProfilesByUserIds([userId]);
  const actorEmail = normalizeEmail(profileMap.get(asString(userId))?.email);

  if (actorEmail !== ONLY_MASTER_EMAIL) {
    return {
      ok: true,
      isTrueMaster: false,
      actorEmail,
      masterMembership: null as any,
    };
  }

  const masterMembershipResult = await getFirstMasterMembership(userId);
  if (masterMembershipResult.error) {
    return {
      ok: false,
      isTrueMaster: false,
      actorEmail,
      masterMembership: null as any,
      error: masterMembershipResult.error,
    };
  }

  return {
    ok: true,
    isTrueMaster: !!masterMembershipResult.data,
    actorEmail,
    masterMembership: masterMembershipResult.data ?? null,
  };
}

export async function GET(req: Request) {
  try {
    const actorResult = await getActor(req);
    if (!actorResult.user) {
      return jsonError(401, actorResult.error || "UNAUTHORIZED");
    }

    const url = new URL(req.url);
    let workspace_id = asString(url.searchParams.get("workspace_id"));

    const actorIsPlatformOwner = await isPlatformOwner(actorResult.user.id);

    const trueMasterCheck = await isTrueMasterUser(actorResult.user.id);
    if (!trueMasterCheck.ok) {
      return jsonError(500, "FAILED_TO_RESOLVE_TRUE_MASTER", {
        detail: (trueMasterCheck as any)?.error?.message ?? null,
      });
    }

    const isTrueMaster = trueMasterCheck.isTrueMaster;

    let actorMembership: any = null;

    if (actorIsPlatformOwner) {
      if (workspace_id) {
        const found = await getMembershipForWorkspace(actorResult.user.id, workspace_id);
        if (found.error) {
          return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
            detail: found.error.message,
          });
        }
        actorMembership = found.data ?? null;
      }

      if (!actorMembership) {
        const firstMembership = await getFirstAccessibleMembership(actorResult.user.id);
        if (firstMembership.error) {
          return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
            detail: firstMembership.error.message,
          });
        }
        actorMembership =
          firstMembership.data ?? trueMasterCheck.masterMembership ?? null;
        workspace_id = asString(actorMembership?.workspace_id);
      }

      const { data: members, error: membersErr } = await supabaseAdmin
        .from("workspace_members")
        .select("*")
        .order("workspace_id", { ascending: true })
        .order("created_at", { ascending: true });

      if (membersErr) {
        return jsonError(500, "FAILED_TO_FETCH_WORKSPACE_MEMBERS", {
          detail: membersErr.message,
        });
      }

      const withProfiles = await attachProfileFields(members ?? []);
      const mergedMembers = await attachWorkspaceFields(withProfiles);

      const meProfile =
        mergedMembers.find(
          (m: any) =>
            asString(m?.user_id) === asString(actorMembership?.user_id) &&
            asString(m?.workspace_id) === asString(actorMembership?.workspace_id)
        ) ??
        mergedMembers.find(
          (m: any) => asString(m?.user_id) === asString(actorMembership?.user_id)
        ) ??
        null;

      return NextResponse.json({
        ok: true,
        workspace_id,
        me: {
          user_id: actorMembership?.user_id ?? actorResult.user.id,
          workspace_id: actorMembership?.workspace_id ?? null,
          role: actorMembership?.role ?? null,
          division: actorMembership?.division ?? null,
          department: actorMembership?.department ?? null,
          team: actorMembership?.team ?? null,
          email: meProfile?.email ?? null,
          full_name: meProfile?.full_name ?? null,
          name: meProfile?.name ?? null,
          workspace_name: meProfile?.workspace_name ?? null,
          platform_role: "platform_owner",
        },
        members: mergedMembers,
      });
    }

    if (isTrueMaster) {
      if (workspace_id) {
        const found = await getMembershipForWorkspace(actorResult.user.id, workspace_id);
        if (found.error) {
          return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
            detail: found.error.message,
          });
        }
        actorMembership = found.data ?? null;
      }

      if (!actorMembership) {
        actorMembership = trueMasterCheck.masterMembership ?? null;
        workspace_id = asString(actorMembership?.workspace_id);
      }

      if (!actorMembership || !canAccess(actorMembership?.role)) {
        return jsonError(403, "MEMBERS_PAGE_FORBIDDEN");
      }

      const { data: members, error: membersErr } = await supabaseAdmin
        .from("workspace_members")
        .select("*")
        .order("workspace_id", { ascending: true })
        .order("created_at", { ascending: true });

      if (membersErr) {
        return jsonError(500, "FAILED_TO_FETCH_WORKSPACE_MEMBERS", {
          detail: membersErr.message,
        });
      }

      const withProfiles = await attachProfileFields(members ?? []);
      const mergedMembers = await attachWorkspaceFields(withProfiles);

      const meProfile =
        mergedMembers.find(
          (m: any) =>
            asString(m?.user_id) === asString(actorMembership?.user_id) &&
            asString(m?.workspace_id) === asString(actorMembership?.workspace_id)
        ) ??
        mergedMembers.find(
          (m: any) => asString(m?.user_id) === asString(actorMembership?.user_id)
        ) ??
        null;

      return NextResponse.json({
        ok: true,
        workspace_id,
        me: {
          user_id: actorMembership.user_id,
          workspace_id: actorMembership.workspace_id,
          role: actorMembership.role,
          division: actorMembership.division ?? null,
          department: actorMembership.department ?? null,
          team: actorMembership.team ?? null,
          email: meProfile?.email ?? null,
          full_name: meProfile?.full_name ?? null,
          name: meProfile?.name ?? null,
          workspace_name: meProfile?.workspace_name ?? null,
        },
        members: mergedMembers,
      });
    }

    if (workspace_id) {
      const found = await getMembershipForWorkspace(actorResult.user.id, workspace_id);
      if (found.error || !found.data) {
        return jsonError(403, "WORKSPACE_ACCESS_DENIED");
      }
      actorMembership = found.data;
    } else {
      const found = await getFirstPrivilegedMembership(actorResult.user.id);
      if (found.error || !found.data) {
        return jsonError(403, "MEMBERS_PAGE_FORBIDDEN");
      }
      actorMembership = found.data;
      workspace_id = asString(actorMembership.workspace_id);
    }

    if (!canAccess(actorMembership?.role)) {
      return jsonError(403, "MEMBERS_PAGE_FORBIDDEN");
    }

    const { data: members, error: membersErr } = await supabaseAdmin
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: true });

    if (membersErr) {
      return jsonError(500, "FAILED_TO_FETCH_WORKSPACE_MEMBERS", {
        detail: membersErr.message,
      });
    }

    const withProfiles = await attachProfileFields(members ?? []);
    const mergedMembers = await attachWorkspaceFields(withProfiles);

    const meProfile =
      mergedMembers.find(
        (m: any) => asString(m?.user_id) === asString(actorMembership?.user_id)
      ) ?? null;

    return NextResponse.json({
      ok: true,
      workspace_id,
      me: {
        user_id: actorMembership.user_id,
        workspace_id: actorMembership.workspace_id,
        role: actorMembership.role,
        division: actorMembership.division ?? null,
        department: actorMembership.department ?? null,
        team: actorMembership.team ?? null,
        email: meProfile?.email ?? null,
        full_name: meProfile?.full_name ?? null,
        name: meProfile?.name ?? null,
        workspace_name: meProfile?.workspace_name ?? null,
      },
      members: mergedMembers,
    });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_SERVER_ERROR", { detail: e?.message });
  }
}

export async function PATCH(req: Request) {
  try {
    const actorResult = await getActor(req);
    if (!actorResult.user) {
      return jsonError(401, actorResult.error || "UNAUTHORIZED");
    }

    const body = await req.json().catch(() => ({}));

    const workspace_id = asString(body.workspace_id);
    const member_user_id = asString(body.member_user_id);
    const role = asString(body.role);
    const division = normalizeNullable(body.division);
    const department = normalizeNullable(body.department);
    const team = normalizeNullable(body.team);

    if (!workspace_id) return jsonError(400, "workspace_id is required");
    if (!member_user_id) return jsonError(400, "member_user_id is required");
    if (!role || !isRole(role)) return jsonError(400, "invalid role");

    const actorIsPlatformOwner = await isPlatformOwner(actorResult.user.id);

    const trueMasterCheck = await isTrueMasterUser(actorResult.user.id);
    if (!trueMasterCheck.ok) {
      return jsonError(500, "FAILED_TO_RESOLVE_TRUE_MASTER", {
        detail: (trueMasterCheck as any)?.error?.message ?? null,
      });
    }

    const isTrueMaster = trueMasterCheck.isTrueMaster;

    let actorMembership: any = null;

    if (actorIsPlatformOwner) {
      const actorMembershipResult = await getMembershipForWorkspace(
        actorResult.user.id,
        workspace_id
      );

      if (actorMembershipResult.error) {
        return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
          detail: actorMembershipResult.error.message,
        });
      }

      if (actorMembershipResult.data) {
        actorMembership = actorMembershipResult.data;
      } else {
        const firstMembership = await getFirstAccessibleMembership(actorResult.user.id);
        if (firstMembership.error) {
          return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
            detail: firstMembership.error.message,
          });
        }
        actorMembership =
          firstMembership.data ?? trueMasterCheck.masterMembership ?? null;
      }

      if (!actorMembership) {
        return jsonError(403, "MEMBERS_UPDATE_FORBIDDEN");
      }
    } else if (isTrueMaster) {
      const actorMembershipResult = await getMembershipForWorkspace(
        actorResult.user.id,
        workspace_id
      );

      if (actorMembershipResult.error) {
        return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
          detail: actorMembershipResult.error.message,
        });
      }

      actorMembership =
        actorMembershipResult.data ?? trueMasterCheck.masterMembership ?? null;

      if (!actorMembership || !canAccess(actorMembership?.role)) {
        return jsonError(403, "MEMBERS_UPDATE_FORBIDDEN");
      }
    } else {
      const actorMembershipResult = await getMembershipForWorkspace(
        actorResult.user.id,
        workspace_id
      );
      if (actorMembershipResult.error || !actorMembershipResult.data) {
        return jsonError(403, "WORKSPACE_ACCESS_DENIED");
      }

      actorMembership = actorMembershipResult.data;

      if (!canAccess(actorMembership?.role)) {
        return jsonError(403, "MEMBERS_UPDATE_FORBIDDEN");
      }
    }

    const targetResult = await getMembershipForWorkspace(member_user_id, workspace_id);
    if (targetResult.error || !targetResult.data) {
      return jsonError(404, "TARGET_MEMBER_NOT_FOUND");
    }

    const targetMembership = targetResult.data;

    if (
      asString(actorMembership.user_id) === member_user_id &&
      asString(targetMembership.workspace_id) === asString(workspace_id)
    ) {
      return jsonError(400, "SELF_ROLE_CHANGE_BLOCKED");
    }

    const profileMap = await getProfilesByUserIds([
      asString(actorMembership.user_id),
      member_user_id,
    ]);

    const actorEmail = normalizeEmail(
      profileMap.get(asString(actorMembership.user_id))?.email
    );
    const targetEmail = normalizeEmail(profileMap.get(member_user_id)?.email);

    const isActorOnlyMasterEmail = actorEmail === ONLY_MASTER_EMAIL;
    const isTargetOnlyMasterEmail = targetEmail === ONLY_MASTER_EMAIL;

    if (!actorIsPlatformOwner && !isTrueMaster && actorMembership.role === "director") {
      if (!canDirectorEditTarget(targetMembership.role)) {
        return jsonError(403, "DIRECTOR_CANNOT_EDIT_MASTER_OR_DIRECTOR");
      }

      if (role === "master" || role === "director") {
        return jsonError(403, "DIRECTOR_CANNOT_ASSIGN_MASTER_OR_DIRECTOR");
      }
    }

    if (role === "master" && !isTargetOnlyMasterEmail) {
      return jsonError(403, "ONLY_SPECIFIC_EMAIL_CAN_BE_MASTER", {
        allowed_master_email: ONLY_MASTER_EMAIL,
      });
    }

    if (isTargetOnlyMasterEmail && role !== "master") {
      return jsonError(403, "ALLOWED_MASTER_CANNOT_BE_DEMOTED", {
        allowed_master_email: ONLY_MASTER_EMAIL,
      });
    }

    const isTargetCurrentlyMaster = targetMembership.role === "master";
    const isMasterSensitiveChange = isTargetCurrentlyMaster || role === "master";

    if (isMasterSensitiveChange) {
      if (
        !actorIsPlatformOwner &&
        (actorMembership.role !== "master" || !isActorOnlyMasterEmail || !isTrueMaster)
      ) {
        return jsonError(403, "ONLY_TRUE_MASTER_CAN_CHANGE_MASTER_STATE", {
          allowed_master_email: ONLY_MASTER_EMAIL,
        });
      }
    }

    const updatePayload: Record<string, any> = {
      role,
      division,
      department,
      team,
    };

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("workspace_members")
      .update(updatePayload)
      .eq("workspace_id", workspace_id)
      .eq("user_id", member_user_id)
      .select("*")
      .maybeSingle();

    if (updateErr || !updated) {
      return jsonError(500, "FAILED_TO_UPDATE_WORKSPACE_MEMBER", {
        detail: updateErr?.message,
      });
    }

    const withProfiles = await attachProfileFields(updated ? [updated] : []);
    const merged = await attachWorkspaceFields(withProfiles);
    const member = merged?.[0] ?? updated;

    return NextResponse.json({
      ok: true,
      member,
    });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_SERVER_ERROR", { detail: e?.message });
  }
}

export async function DELETE(req: Request) {
  try {
    const actorResult = await getActor(req);
    if (!actorResult.user) {
      return jsonError(401, actorResult.error || "UNAUTHORIZED");
    }

    const body = await req.json().catch(() => ({}));

    const workspace_id = asString(body.workspace_id);
    const member_user_id = asString(body.member_user_id);

    if (!workspace_id) return jsonError(400, "workspace_id is required");
    if (!member_user_id) return jsonError(400, "member_user_id is required");

    const actorIsPlatformOwner = await isPlatformOwner(actorResult.user.id);

    const trueMasterCheck = await isTrueMasterUser(actorResult.user.id);
    if (!trueMasterCheck.ok) {
      return jsonError(500, "FAILED_TO_RESOLVE_TRUE_MASTER", {
        detail: (trueMasterCheck as any)?.error?.message ?? null,
      });
    }

    const isTrueMaster = trueMasterCheck.isTrueMaster;

    let actorMembership: any = null;

    if (actorIsPlatformOwner) {
      const actorMembershipResult = await getMembershipForWorkspace(
        actorResult.user.id,
        workspace_id
      );

      if (actorMembershipResult.error) {
        return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
          detail: actorMembershipResult.error.message,
        });
      }

      if (actorMembershipResult.data) {
        actorMembership = actorMembershipResult.data;
      } else {
        const firstMembership = await getFirstAccessibleMembership(actorResult.user.id);
        if (firstMembership.error) {
          return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
            detail: firstMembership.error.message,
          });
        }
        actorMembership =
          firstMembership.data ?? trueMasterCheck.masterMembership ?? null;
      }

      if (!actorMembership) {
        return jsonError(403, "MEMBERS_DELETE_FORBIDDEN");
      }
    } else if (isTrueMaster) {
      const actorMembershipResult = await getMembershipForWorkspace(
        actorResult.user.id,
        workspace_id
      );

      if (actorMembershipResult.error) {
        return jsonError(500, "FAILED_TO_RESOLVE_ACTOR_MEMBERSHIP", {
          detail: actorMembershipResult.error.message,
        });
      }

      actorMembership =
        actorMembershipResult.data ?? trueMasterCheck.masterMembership ?? null;

      if (!actorMembership || !canAccess(actorMembership?.role)) {
        return jsonError(403, "MEMBERS_DELETE_FORBIDDEN");
      }
    } else {
      const actorMembershipResult = await getMembershipForWorkspace(
        actorResult.user.id,
        workspace_id
      );
      if (actorMembershipResult.error || !actorMembershipResult.data) {
        return jsonError(403, "WORKSPACE_ACCESS_DENIED");
      }

      actorMembership = actorMembershipResult.data;

      if (!canAccess(actorMembership?.role)) {
        return jsonError(403, "MEMBERS_DELETE_FORBIDDEN");
      }
    }

    const targetResult = await getMembershipForWorkspace(member_user_id, workspace_id);
    if (targetResult.error || !targetResult.data) {
      return jsonError(404, "TARGET_MEMBER_NOT_FOUND");
    }

    const targetMembership = targetResult.data;

    if (
      asString(actorMembership.user_id) === member_user_id &&
      asString(targetMembership.workspace_id) === asString(workspace_id)
    ) {
      return jsonError(400, "SELF_MEMBER_REMOVE_BLOCKED");
    }

    const profileMap = await getProfilesByUserIds([
      asString(actorMembership.user_id),
      member_user_id,
    ]);

    const actorEmail = normalizeEmail(
      profileMap.get(asString(actorMembership.user_id))?.email
    );
    const targetEmail = normalizeEmail(profileMap.get(member_user_id)?.email);

    const isActorOnlyMasterEmail = actorEmail === ONLY_MASTER_EMAIL;
    const isTargetOnlyMasterEmail = targetEmail === ONLY_MASTER_EMAIL;

    /**
     * ✅ only master 이메일 계정은 workspace에서 제거 불가
     */
    if (isTargetOnlyMasterEmail) {
      return jsonError(403, "ALLOWED_MASTER_CANNOT_BE_REMOVED", {
        allowed_master_email: ONLY_MASTER_EMAIL,
      });
    }

    /**
     * ✅ director는 master/director 제거 불가
     */
    if (!actorIsPlatformOwner && !isTrueMaster && actorMembership.role === "director") {
      if (!canDirectorEditTarget(targetMembership.role)) {
        return jsonError(403, "DIRECTOR_CANNOT_REMOVE_MASTER_OR_DIRECTOR");
      }
    }

    /**
     * ✅ master 상태가 얽힌 제거는 true master만 가능
     * - 잘못 들어간 master 정리도 true master 또는 platform_owner만
     */
    const isMasterSensitiveDelete = targetMembership.role === "master";

    if (isMasterSensitiveDelete) {
      if (
        !actorIsPlatformOwner &&
        (actorMembership.role !== "master" || !isActorOnlyMasterEmail || !isTrueMaster)
      ) {
        return jsonError(403, "ONLY_TRUE_MASTER_CAN_REMOVE_MASTER_STATE_MEMBER", {
          allowed_master_email: ONLY_MASTER_EMAIL,
        });
      }
    }

    const { error: deleteErr } = await supabaseAdmin
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspace_id)
      .eq("user_id", member_user_id);

    if (deleteErr) {
      return jsonError(500, "FAILED_TO_DELETE_WORKSPACE_MEMBER", {
        detail: deleteErr.message,
      });
    }

    return NextResponse.json({
      ok: true,
      workspace_id,
      member_user_id,
    });
  } catch (e: any) {
    return jsonError(500, "INTERNAL_SERVER_ERROR", { detail: e?.message });
  }
}