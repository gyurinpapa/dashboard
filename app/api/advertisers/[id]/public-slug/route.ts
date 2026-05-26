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
    { status }
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

function normalizePublicSlug(v: any) {
  const raw = asString(v).toLowerCase();

  if (!raw) return "";

  return raw;
}

function validatePublicSlug(slug: string) {
  const s = asString(slug);

  if (!s) {
    return { ok: true, error: "" };
  }

  if (s.length > 80) {
    return {
      ok: false,
      error: "PUBLIC_SLUG_TOO_LONG",
    };
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)) {
    return {
      ok: false,
      error: "INVALID_PUBLIC_SLUG_FORMAT",
    };
  }

  return { ok: true, error: "" };
}

function canUpdatePublicSlug(role: string, isTrueMaster: boolean) {
  if (isTrueMaster) return true;
  return role === "director" || role === "admin";
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
    const publicSlug = normalizePublicSlug(body?.public_slug);

    const validation = validatePublicSlug(publicSlug);

    if (!validation.ok) {
      return jsonError(400, validation.error, {
        message:
          "공개 URL은 소문자 영어, 숫자, 하이픈만 사용할 수 있고 시작과 끝은 영문 또는 숫자여야 합니다.",
      });
    }

    const { data: adv, error: advErr } = await supabaseAdmin
      .from("advertisers")
      .select("id, name, workspace_id, public_slug")
      .eq("id", advertiserId)
      .maybeSingle();

    if (advErr) {
      return jsonError(500, "ADVERTISER_FETCH_FAILED", {
        detail: advErr.message,
      });
    }

    if (!adv) {
      return jsonError(404, "NOT_FOUND");
    }

    const workspaceId = asString(adv.workspace_id);

    if (!workspaceId) {
      return jsonError(500, "ADVERTISER_WORKSPACE_MISSING");
    }

    const role = await getWorkspaceRole(user.id, workspaceId);
    const isTrueMaster = await isTrueMasterUser(user.id, workspaceId);

    if (!canUpdatePublicSlug(role, isTrueMaster)) {
      return jsonError(403, "FORBIDDEN_PUBLIC_SLUG_PERMISSION");
    }

    if (publicSlug) {
      const { data: dup, error: dupErr } = await supabaseAdmin
        .from("advertisers")
        .select("id, name, workspace_id, public_slug")
        .eq("public_slug", publicSlug)
        .neq("id", advertiserId)
        .limit(1);

      if (dupErr) {
        return jsonError(500, "PUBLIC_SLUG_DUP_CHECK_FAILED", {
          detail: dupErr.message,
        });
      }

      if ((dup?.length ?? 0) > 0) {
        return jsonError(409, "PUBLIC_SLUG_ALREADY_EXISTS", {
          advertiser_id: dup?.[0]?.id ?? null,
          advertiser_name: dup?.[0]?.name ?? null,
          public_slug: publicSlug,
          message: "이미 다른 광고주가 사용 중인 공개 URL입니다.",
        });
      }
    }

    const nextPublicSlug = publicSlug || null;

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("advertisers")
      .update({
        public_slug: nextPublicSlug,
      })
      .eq("id", advertiserId)
      .eq("workspace_id", workspaceId)
      .select("id, name, workspace_id, public_slug")
      .maybeSingle();

    if (upErr) {
      return jsonError(500, "PUBLIC_SLUG_UPDATE_FAILED", {
        detail: upErr.message,
      });
    }

    if (!updated) {
      return jsonError(404, "NOT_FOUND_AFTER_UPDATE");
    }

    return NextResponse.json({
      ok: true,
      advertiser: {
        id: asString(updated.id),
        name: asString(updated.name),
        workspace_id: asString(updated.workspace_id),
        public_slug: updated.public_slug ? asString(updated.public_slug) : null,
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? "";

    if (String(msg).startsWith("PROFILE_EMAIL_FETCH_FAILED:")) {
      return jsonError(500, "PROFILE_EMAIL_FETCH_FAILED", {
        detail: String(msg).replace("PROFILE_EMAIL_FETCH_FAILED:", ""),
      });
    }

    if (String(msg).startsWith("WORKSPACE_ROLE_CHECK_FAILED:")) {
      return jsonError(500, "WORKSPACE_ROLE_CHECK_FAILED", {
        detail: String(msg).replace("WORKSPACE_ROLE_CHECK_FAILED:", ""),
      });
    }

    return jsonError(500, "INTERNAL_ERROR", { detail: e?.message });
  }
}