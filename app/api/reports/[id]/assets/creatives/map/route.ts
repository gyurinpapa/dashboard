// app/api/reports/[id]/assets/creatives/map/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET = "report_uploads";
const CREATIVE_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24 * 7;
const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asInt(v: any, def = CREATIVE_SIGNED_URL_EXPIRES_IN) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (n < 60) return 60;
  if (n > CREATIVE_SIGNED_URL_EXPIRES_IN) return CREATIVE_SIGNED_URL_EXPIRES_IN;
  return Math.floor(n);
}

function asStr(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asStr(v).toLowerCase();
}

function normalizeFilenameKey(v: any): string {
  const s = String(v ?? "").trim();
  const base = s.split("/").pop() ?? s;

  try {
    return base.normalize("NFC").toLowerCase();
  } catch {
    return base.toLowerCase();
  }
}

function stripExt(name: string) {
  return name.replace(/\.[a-z0-9]{1,8}$/i, "");
}

function shouldExpand(mode: string) {
  return mode === "expanded";
}

/**
 * ✅ Bearer 우선 + 쿠키(session) fallback
 * - 프론트에서 Authorization: Bearer ... 를 보내면 이걸 먼저 검증
 * - 없으면 sbAuth() 쿠키 세션으로 user 확인
 *
 * 반환:
 *  - { ok: true, userId }
 *  - { ok: false, status, message }
 */
async function getUserId(req: Request) {
  const admin = getSupabaseAdmin();

  // 1) Bearer 토큰 우선
  const authz =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await admin.auth.getUser(bearer);

    const userId = data?.user?.id ?? null;

    if (error || !userId) {
      return {
        ok: false as const,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }

    return {
      ok: true as const,
      userId,
    };
  }

  // 2) 쿠키 세션 fallback
  const auth = await sbAuth();

  if (auth.error || !auth.user?.id) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized (no session). Please sign in.",
    };
  }

  return {
    ok: true as const,
    userId: auth.user.id,
  };
}

async function getProfileEmailByUserId(userId: string) {
  const id = asStr(userId);
  if (!id) return "";

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`PROFILE_EMAIL_FETCH_FAILED:${error.message}`);
  }

  return normalizeEmail((data as any)?.email);
}

async function hasMasterMembership(userId: string) {
  const id = asStr(userId);
  if (!id) return false;

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", id)
    .eq("role", "master")
    .limit(1);

  if (error) {
    throw new Error(`MASTER_MEMBERSHIP_CHECK_FAILED:${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

async function isTrueMasterUser(userId: string) {
  const id = asStr(userId);
  if (!id) return false;

  const email = await getProfileEmailByUserId(id);

  if (email !== ONLY_MASTER_EMAIL) {
    return false;
  }

  return await hasMasterMembership(id);
}

async function getWorkspaceMembership(userId: string, workspaceId: string) {
  const id = asStr(userId);
  const wid = asStr(workspaceId);

  if (!id || !wid) return null;

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wid)
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`WORKSPACE_MEMBER_CHECK_FAILED:${error.message}`);
  }

  return data ?? null;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;

    const reportId = asStr(id);

    if (!reportId) {
      return jsonError(400, "REPORT_ID_REQUIRED");
    }

    const url = new URL(req.url);

    const expiresIn = asInt(
      url.searchParams.get("expiresIn"),
      CREATIVE_SIGNED_URL_EXPIRES_IN
    );

    const mode = (
      url.searchParams.get("mode") || "strict"
    ).toLowerCase();

    const hasKnownBatchId = url.searchParams.has("knownBatchId");
    const rawKnownBatchId = url.searchParams.get("knownBatchId");
    const knownCreativesBatchId =
      rawKnownBatchId === "__NULL__" ? null : asStr(rawKnownBatchId) || null;

    const admin = getSupabaseAdmin();

    // ✅ auth 통일 (Bearer 우선 + 쿠키 fallback)
    const auth = await getUserId(req);

    if (!auth.ok) {
      return jsonError(auth.status, auth.message);
    }

    const userId = auth.userId;

    // 1️⃣ report 조회
    const { data: report, error: rErr } = await admin
      .from("reports")
      .select("id, workspace_id, current_creatives_batch_id")
      .eq("id", reportId)
      .maybeSingle();

    if (rErr) {
      return jsonError(500, rErr.message);
    }

    if (!report) {
      return jsonError(404, "REPORT_NOT_FOUND");
    }

    const workspaceId = asStr((report as any)?.workspace_id);
    const currentCreativesBatchId = asStr(
      (report as any)?.current_creatives_batch_id
    );

    if (!workspaceId) {
      return jsonError(500, "REPORT_WORKSPACE_MISSING");
    }

    // 2️⃣ workspace membership 체크
    // - 일반 사용자는 해당 workspace member여야 함
    // - true master는 전체 workspace 조회 허용
    // - platform_owner 단독 우회 없음
    const actorIsTrueMaster = await isTrueMasterUser(userId);

    if (!actorIsTrueMaster) {
      const wm = await getWorkspaceMembership(userId, workspaceId);

      if (!wm) {
        return jsonError(403, "FORBIDDEN");
      }
    }

    const normalizedCurrentCreativesBatchId = currentCreativesBatchId || null;

    if (
      hasKnownBatchId &&
      knownCreativesBatchId === normalizedCurrentCreativesBatchId
    ) {
      return NextResponse.json({
        ok: true,
        notModified: true,
        creativesMap: {},
        meta: {
          mode,
          currentCreativesBatchId: normalizedCurrentCreativesBatchId,
          strictCount: 0,
          signedCount: 0,
          expandedCount: 0,
          expiresIn,
        },
      });
    }

    // 3️⃣ report_creatives 조회
    const creativesQuery = admin
      .from("report_creatives")
      .select(
        "creative_key, file_name, storage_path, created_at"
      )
      .eq("report_id", reportId);

    const scopedCreativesQuery = currentCreativesBatchId
      ? creativesQuery.eq("batch_id", currentCreativesBatchId)
      : creativesQuery.is("batch_id", null);

    const { data: rows, error: cErr } = await scopedCreativesQuery
      .order("created_at", { ascending: false });

    if (cErr) {
      return jsonError(500, cErr.message);
    }

    const baseEntries: Array<{
      key: string;
      path: string;
    }> = [];

    for (const r of rows ?? []) {
      const path = String(
        (r as any).storage_path || ""
      ).trim();

      const keyRaw =
        (r as any).creative_key ??
        (r as any).file_name ??
        "";

      const key = normalizeFilenameKey(keyRaw);

      if (!path || !key) continue;

      baseEntries.push({
        key,
        path,
      });
    }

    const uniqPath = new Map<
      string,
      {
        key: string;
        path: string;
      }
    >();

    for (const e of baseEntries) {
      if (!uniqPath.has(e.path)) {
        uniqPath.set(e.path, e);
      }
    }

    const creativesMap: Record<string, string> = {};

    const strictCount = uniqPath.size;
    let signedCount = 0;

    for (const e of uniqPath.values()) {
      const { data: signed, error: sErr } =
        await admin.storage
          .from(BUCKET)
          .createSignedUrl(e.path, expiresIn);

      if (sErr || !signed?.signedUrl) {
        continue;
      }

      creativesMap[e.key] = signed.signedUrl;
      signedCount += 1;

      if (shouldExpand(mode)) {
        const k2 = stripExt(e.key);

        if (k2 && !creativesMap[k2]) {
          creativesMap[k2] = signed.signedUrl;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      notModified: false,
      creativesMap,
      meta: {
        mode,
        currentCreativesBatchId: normalizedCurrentCreativesBatchId,
        strictCount,
        signedCount,
        expandedCount: Object.keys(creativesMap).length,
        expiresIn,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg.startsWith("PROFILE_EMAIL_FETCH_FAILED:")) {
      return jsonError(500, "PROFILE_EMAIL_FETCH_FAILED", {
        detail: msg.replace("PROFILE_EMAIL_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("MASTER_MEMBERSHIP_CHECK_FAILED:")) {
      return jsonError(500, "MASTER_MEMBERSHIP_CHECK_FAILED", {
        detail: msg.replace("MASTER_MEMBERSHIP_CHECK_FAILED:", ""),
      });
    }

    if (msg.startsWith("WORKSPACE_MEMBER_CHECK_FAILED:")) {
      return jsonError(500, "WORKSPACE_MEMBER_CHECK_FAILED", {
        detail: msg.replace("WORKSPACE_MEMBER_CHECK_FAILED:", ""),
      });
    }

    return jsonError(500, e?.message || String(e));
  }
}