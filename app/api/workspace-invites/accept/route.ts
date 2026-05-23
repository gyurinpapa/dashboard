import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = asString(url.searchParams.get("token"));

    if (!token) {
      return jsonError(400, "TOKEN_REQUIRED");
    }

    const sb = getSupabaseAdmin();

    const { data: invite, error } = await sb
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
          "created_at",
        ].join(", ")
      )
      .eq("token", token)
      .maybeSingle();

    if (error) return jsonError(500, error.message || "INVITE_LOOKUP_FAILED");
    if (!invite) return jsonError(404, "INVITE_NOT_FOUND");

    if (isExpired((invite as any).expires_at)) {
        return jsonError(410, "INVITE_EXPIRED");
        }

        const inviteRow = invite as any;

        return NextResponse.json({
        ok: true,
        invite: {
            id: inviteRow.id,
            workspace_id: inviteRow.workspace_id,
            email: inviteRow.email,
            role: inviteRow.role,
            status: inviteRow.status,
            expires_at: inviteRow.expires_at,
            created_at: inviteRow.created_at,
        },
        });
  } catch (e: any) {
    return jsonError(500, e?.message || "UNKNOWN_ERROR");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUser(req);
    if (!auth.ok) {
      return jsonError(auth.status, "UNAUTHORIZED", { detail: auth.message });
    }

    const user = auth.user;
    const userId = user.id;
    const userEmail = normalizeEmail(user.email);

    const body = await req.json().catch(() => ({}));
    const token = asString(body?.token);

    if (!token) {
      return jsonError(400, "TOKEN_REQUIRED");
    }

    const sb = getSupabaseAdmin();

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

    if ((invite as any).status !== "pending") {
      return jsonError(409, "INVITE_NOT_PENDING");
    }

    if (isExpired((invite as any).expires_at)) {
      return jsonError(410, "INVITE_EXPIRED");
    }

    const inviteEmail = normalizeEmail((invite as any).email);

    if (!userEmail || userEmail !== inviteEmail) {
      return jsonError(403, "INVITE_EMAIL_MISMATCH", {
        detail: `초대 이메일(${inviteEmail})과 현재 로그인 이메일(${userEmail || "-"})이 다릅니다.`,
      });
    }

    const workspaceId = asString((invite as any).workspace_id);
    const role = asString((invite as any).role) || "staff";

    if (!workspaceId) {
      return jsonError(500, "INVITE_WORKSPACE_MISSING");
    }

    if (role === "master") {
      return jsonError(403, "MASTER_INVITE_NOT_ALLOWED");
    }

    const { data: existingMember, error: existingErr } = await sb
      .from("workspace_members")
      .select("workspace_id, user_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingErr) {
      return jsonError(500, existingErr.message || "MEMBER_LOOKUP_FAILED");
    }

    if (!existingMember) {
      const { error: insertErr } = await sb.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: userId,
        role,
        division: "",
        department: "",
        team: "",
      });

      if (insertErr) {
        return jsonError(500, insertErr.message || "MEMBER_INSERT_FAILED");
      }
    }

    const now = new Date().toISOString();

    const { error: updateErr } = await sb
      .from("workspace_invites")
      .update({
        status: "accepted",
        accepted_by: userId,
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", (invite as any).id);

    if (updateErr) {
      return jsonError(500, updateErr.message || "INVITE_UPDATE_FAILED");
    }

    return NextResponse.json({
      ok: true,
      workspace_id: workspaceId,
      role,
    });
  } catch (e: any) {
    return jsonError(500, e?.message || "UNKNOWN_ERROR");
  }
}