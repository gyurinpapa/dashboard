import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

const ALLOWED_INVITE_ROLES = ["director", "admin", "staff", "client"] as const;

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function normalizeEmail(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function isOnlyMasterEmail(email: any) {
  return normalizeEmail(email) === ONLY_MASTER_EMAIL;
}

function getRole(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function canCreateInvite(actorRole: any, actorEmail: any) {
  const role = getRole(actorRole);

  if (role === "master") {
    return isOnlyMasterEmail(actorEmail);
  }

  if (role === "director") return true;
  if (role === "admin") return true;

  return false;
}

function normalizeInviteRole(v: any) {
  const role = getRole(v);

  if (role === "master") return "";

  if ((ALLOWED_INVITE_ROLES as readonly string[]).includes(role)) {
    return role;
  }

  return "";
}

function canInviteRole(actorRole: any, actorEmail: any, inviteRole: string) {
  const role = getRole(actorRole);

  if (!inviteRole) return false;
  if (inviteRole === "master") return false;

  if (role === "master" && isOnlyMasterEmail(actorEmail)) {
    return true;
  }

  if (role === "director") {
    return inviteRole === "admin" || inviteRole === "staff" || inviteRole === "client";
  }

  if (role === "admin") {
    return inviteRole === "staff" || inviteRole === "client";
  }

  return false;
}

function makeInviteToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getUser(req: Request) {
  const sb = getSupabaseAdmin();

  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await sb.auth.getUser(bearer);
    const user = data?.user ?? null;

    if (error || !user?.id) {
      return {
        ok: false as const,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }

    return { ok: true as const, user };
  }

  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;

  if (authErr || !user?.id) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized (no session)",
    };
  }

  return { ok: true as const, user };
}

export async function POST(req: Request) {
  try {
    const auth = await getUser(req);
    if (!auth.ok) {
      return jsonError(auth.status, "UNAUTHORIZED", { detail: auth.message });
    }

    const user = auth.user;
    const sb = getSupabaseAdmin();

    const body = await req.json().catch(() => ({}));

    const workspaceId = asString(body?.workspace_id);
    const inviteEmail = normalizeEmail(body?.email);
    const inviteRole = normalizeInviteRole(body?.role || "staff");

    if (!workspaceId) {
      return jsonError(400, "WORKSPACE_ID_REQUIRED");
    }

    if (!inviteEmail || !inviteEmail.includes("@")) {
      return jsonError(400, "VALID_EMAIL_REQUIRED");
    }

    if (!inviteRole) {
      return jsonError(400, "INVALID_INVITE_ROLE");
    }

    if (inviteEmail === ONLY_MASTER_EMAIL && inviteRole !== "director") {
      return jsonError(400, "ONLY_MASTER_EMAIL_CANNOT_BE_INVITED_AS_NON_STANDARD_MEMBER", {
        detail:
          "master 계정은 초대 흐름으로 역할을 변경하지 않습니다. master 정책을 유지하세요.",
      });
    }

    const { data: actorMember, error: actorErr } = await sb
      .from("workspace_members")
      .select("workspace_id, user_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (actorErr) return jsonError(500, actorErr.message || "ACTOR_CHECK_FAILED");
    if (!actorMember) return jsonError(403, "WORKSPACE_ACCESS_DENIED");

    if (!canCreateInvite(actorMember.role, user.email)) {
      return jsonError(403, "INVITE_PERMISSION_DENIED");
    }

    if (!canInviteRole(actorMember.role, user.email, inviteRole)) {
      return jsonError(403, "INVITE_ROLE_NOT_ALLOWED");
    }

    const { data: existingProfile, error: profileErr } = await sb
      .from("profiles")
      .select("id, email")
      .ilike("email", inviteEmail)
      .maybeSingle();

    if (profileErr) {
      return jsonError(500, profileErr.message || "PROFILE_LOOKUP_FAILED");
    }

    if (existingProfile?.id) {
      const { data: existingMember, error: existingMemberErr } = await sb
        .from("workspace_members")
        .select("workspace_id, user_id, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", existingProfile.id)
        .maybeSingle();

      if (existingMemberErr) {
        return jsonError(
          500,
          existingMemberErr.message || "EXISTING_MEMBER_LOOKUP_FAILED"
        );
      }

      if (existingMember) {
        return jsonError(409, "ALREADY_WORKSPACE_MEMBER");
      }
    }

    const token = makeInviteToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { data: invite, error: inviteErr } = await sb
      .from("workspace_invites")
      .insert({
        workspace_id: workspaceId,
        email: inviteEmail,
        role: inviteRole,
        token,
        invited_by: user.id,
        status: "pending",
        expires_at: expiresAt,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select(
        [
          "id",
          "workspace_id",
          "email",
          "role",
          "token",
          "status",
          "expires_at",
          "created_at",
        ].join(", ")
      )
      .maybeSingle();

    if (inviteErr) {
      return jsonError(500, inviteErr.message || "INVITE_CREATE_FAILED");
    }

    return NextResponse.json({
      ok: true,
      invite,
      invitePath: `/invite/${token}`,
    });
  } catch (e: any) {
    return jsonError(500, e?.message || "UNKNOWN_ERROR");
  }
}