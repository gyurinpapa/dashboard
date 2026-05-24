import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isExpired(expiresAt: any) {
  const raw = asString(expiresAt);
  if (!raw) return false;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;

  return d.getTime() < Date.now();
}

function safeProfileName(email: string) {
  const local = email.split("@")[0] || "member";
  return local.trim() || "member";
}

function normalizeMemberRole(v: any) {
  const role = asString(v).toLowerCase();

  if (role === "director") return "director";
  if (role === "admin") return "admin";
  if (role === "staff") return "staff";
  if (role === "client") return "client";

  return "staff";
}

function isAllowedInviteRole(v: any) {
  const role = asString(v).toLowerCase();

  if (role === "director") return true;
  if (role === "admin") return true;
  if (role === "staff") return true;
  if (role === "client") return true;

  return false;
}

export async function POST(req: Request) {
  let createdAuthUserId = "";

  try {
    const sb = getSupabaseAdmin();

    const body = await req.json().catch(() => ({}));

    const token = asString(body?.token);
    const password = asString(body?.password);
    const division = asString(body?.division);
    const department = asString(body?.department);
    const team = asString(body?.team);

    if (!token) {
      return jsonError(400, "TOKEN_REQUIRED");
    }

    if (!password || password.length < 6) {
      return jsonError(400, "PASSWORD_TOO_SHORT", {
        detail: "비밀번호는 최소 6자 이상이어야 합니다.",
      });
    }

    const { data: invite, error: inviteErr } = await sb
      .from("workspace_invites")
      .select(
        [
          "id",
          "workspace_id",
          "email",
          "role",
          "token",
          "status",
          "expires_at",
          "accepted_by",
          "accepted_at",
        ].join(", ")
      )
      .eq("token", token)
      .maybeSingle();

    if (inviteErr) {
      return jsonError(500, inviteErr.message || "INVITE_LOOKUP_FAILED");
    }

    if (!invite) {
      return jsonError(404, "INVITE_NOT_FOUND");
    }

    const inviteRow = invite as any;

    if (inviteRow.status !== "pending") {
      return jsonError(409, "INVITE_NOT_PENDING");
    }

    if (isExpired(inviteRow.expires_at)) {
      return jsonError(410, "INVITE_EXPIRED");
    }

    const email = normalizeEmail(inviteRow.email);
    const workspaceId = asString(inviteRow.workspace_id);
    const inviteRoleRaw = asString(inviteRow.role).toLowerCase();

    if (!email || !email.includes("@")) {
      return jsonError(400, "INVITE_EMAIL_INVALID");
    }

    if (!workspaceId) {
      return jsonError(500, "INVITE_WORKSPACE_MISSING");
    }

    /**
     * master는 초대 흐름으로 생성하거나 변경하지 않는다.
     * true master는 gyurinpapakimdh@gmail.com 한 명만 별도 정책으로 관리한다.
     */
    if (inviteRoleRaw === "master") {
      return jsonError(403, "MASTER_INVITE_NOT_ALLOWED", {
        detail: "master role은 초대 가입 흐름에서 사용할 수 없습니다.",
      });
    }

    /**
     * 초대 가입에서 허용되는 role은 director/admin/staff/client뿐이다.
     * 잘못된 role은 기존 안전 정책에 따라 staff로 fallback한다.
     */
    const role = isAllowedInviteRole(inviteRoleRaw)
      ? normalizeMemberRole(inviteRoleRaw)
      : "staff";

    /**
     * profiles.company_id는 workspace_id가 아니라 companies.id를 참조한다.
     * 따라서 초대의 workspace_id로 workspaces.company_id를 먼저 조회한 뒤
     * profiles.company_id에는 company_id를 넣어야 FK 오류가 나지 않는다.
     */
    const { data: workspace, error: workspaceErr } = await sb
      .from("workspaces")
      .select("id, company_id")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceErr) {
      return jsonError(500, workspaceErr.message || "WORKSPACE_LOOKUP_FAILED");
    }

    if (!workspace) {
      return jsonError(404, "WORKSPACE_NOT_FOUND");
    }

    const workspaceRow = workspace as any;
    const companyId = asString(workspaceRow.company_id);

    if (!companyId) {
      return jsonError(500, "WORKSPACE_COMPANY_ID_MISSING", {
        detail:
          "초대 대상 workspace에 company_id가 없어 profiles.company_id를 설정할 수 없습니다.",
      });
    }

    const { data: existingProfile, error: profileLookupErr } = await sb
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (profileLookupErr) {
      return jsonError(
        500,
        profileLookupErr.message || "PROFILE_LOOKUP_FAILED"
      );
    }

    if (existingProfile?.id) {
      const existingProfileRow = existingProfile as any;

      const { data: existingMember, error: memberLookupErr } = await sb
        .from("workspace_members")
        .select("workspace_id, user_id, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", existingProfileRow.id)
        .maybeSingle();

      if (memberLookupErr) {
        return jsonError(
          500,
          memberLookupErr.message || "MEMBER_LOOKUP_FAILED"
        );
      }

      if (existingMember) {
        return jsonError(409, "ALREADY_WORKSPACE_MEMBER", {
          detail: "이미 이 workspace의 멤버입니다.",
        });
      }

      return jsonError(409, "USER_ALREADY_EXISTS", {
        detail:
          "이미 가입된 이메일입니다. 기존 로그인 방식으로 로그인한 뒤 초대 수락 흐름을 사용해야 합니다.",
      });
    }

    const { data: createdUserData, error: createUserErr } =
      await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: safeProfileName(email),
          invited_workspace_id: workspaceId,
          invited_company_id: companyId,
        },
      });

    if (createUserErr || !createdUserData?.user?.id) {
      return jsonError(
        500,
        createUserErr?.message || "AUTH_USER_CREATE_FAILED"
      );
    }

    const userId = createdUserData.user.id;
    createdAuthUserId = userId;

    const now = new Date().toISOString();

    const { error: profileErr } = await sb.from("profiles").upsert(
      {
        id: userId,
        company_id: companyId,
        name: safeProfileName(email),
        email,
        updated_at: now,
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      if (createdAuthUserId) {
        await sb.auth.admin.deleteUser(createdAuthUserId).catch(() => null);
      }

      return jsonError(500, profileErr.message || "PROFILE_UPSERT_FAILED");
    }

    const { error: memberErr } = await sb.from("workspace_members").insert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
      division,
      department,
      team,
    });

    if (memberErr) {
      if (createdAuthUserId) {
        await sb.auth.admin.deleteUser(createdAuthUserId).catch(() => null);
      }

      return jsonError(500, memberErr.message || "MEMBER_INSERT_FAILED");
    }

    const { error: updateInviteErr } = await sb
      .from("workspace_invites")
      .update({
        status: "accepted",
        accepted_by: userId,
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", inviteRow.id)
      .eq("status", "pending");

    if (updateInviteErr) {
      if (createdAuthUserId) {
        await sb.auth.admin.deleteUser(createdAuthUserId).catch(() => null);
      }

      return jsonError(
        500,
        updateInviteErr.message || "INVITE_UPDATE_FAILED"
      );
    }

    return NextResponse.json({
      ok: true,
      workspace_id: workspaceId,
      company_id: companyId,
      user_id: userId,
      email,
      role,
    });
  } catch (e: any) {
    if (createdAuthUserId) {
      try {
        const sb = getSupabaseAdmin();
        await sb.auth.admin.deleteUser(createdAuthUserId).catch(() => null);
      } catch {
        // rollback best-effort
      }
    }

    return jsonError(500, e?.message || "UNKNOWN_ERROR");
  }
}