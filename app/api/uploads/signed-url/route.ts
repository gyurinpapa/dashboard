// app/api/uploads/signed-url/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "report_uploads";
const SIGNED_URL_EXPIRES_IN = 60 * 10;

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function sbAdmin() {
  return getSupabaseAdmin();
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizePath(p: string) {
  return p.replace(/^\/+/, "").replace(/\/+/g, "/");
}

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function findRegisteredCreative(params: {
  sb: ReturnType<typeof sbAdmin>;
  reportId: string;
  path: string;
  batchId?: string;
}) {
  const { sb, reportId, path, batchId } = params;

  let query = sb
    .from("report_creatives")
    .select("storage_bucket")
    .eq("report_id", reportId)
    .eq("storage_path", path);

  if (batchId) {
    query = query.eq("batch_id", batchId);
  }

  return query.limit(1).maybeSingle();
}

function isAllowedCreativeBucket(creative: any) {
  const bucket = asString(creative?.storage_bucket) || BUCKET;
  return bucket === BUCKET;
}

export async function POST(req: Request) {
  try {
    const body = await safeJson(req);
    if (!body) return jsonError(400, "Invalid JSON body");

    const path = normalizePath(asString(body.path));
    const shareToken = asString(body.shareToken);

    if (!path) return jsonError(400, "Missing path");

    const sb = sbAdmin();

    // =========================================================
    // 1) 공유 모드
    // - 기존 공개 report 계약 유지
    // - published creative snapshot에 실제 등록된 path만 허용
    // =========================================================
    if (shareToken) {
      const { data: report, error } = await sb
        .from("reports")
        .select(
          "id,status,published_ingestion_id,published_creatives_batch_id"
        )
        .eq("share_token", shareToken)
        .maybeSingle();

      if (error) return jsonError(500, error.message);
      if (!report) return jsonError(404, "Share token not found");

      if (report.status !== "ready") {
        return jsonError(403, "Report is not published");
      }

      const reportId = String(report.id);
      const publishedIngestionId = asString(
        report.published_ingestion_id
      );
      const publishedCreativesBatchId = asString(
        report.published_creatives_batch_id
      );

      if (!publishedIngestionId || !publishedCreativesBatchId) {
        return jsonError(403, "Path not allowed");
      }

      const allowedPrefix = `reports/${reportId}/`;

      if (!path.startsWith(allowedPrefix)) {
        return jsonError(403, "Path not allowed");
      }

      // published creative batch에 exact storage_path로 등록된 파일만 허용
      const {
        data: publishedCreative,
        error: creativeErr,
      } = await findRegisteredCreative({
        sb,
        reportId,
        path,
        batchId: publishedCreativesBatchId,
      });

      if (creativeErr) {
        return jsonError(500, creativeErr.message);
      }

      if (
        !publishedCreative ||
        !isAllowedCreativeBucket(publishedCreative)
      ) {
        return jsonError(403, "Path not allowed");
      }

      const { data, error: signErr } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);

      if (signErr) return jsonError(500, signErr.message);

      return NextResponse.json({
        ok: true,
        url: data?.signedUrl || null,
      });
    }

    // =========================================================
    // 2) 로그인 모드
    // =========================================================
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const accessToken = m?.[1];

    if (!accessToken) {
      return jsonError(403, "Missing Authorization");
    }

    // ---------------------------------------------------------
    // 2-A) 로그인 사용자 인증
    // ---------------------------------------------------------
    const { data: userRes, error: userErr } =
      await sb.auth.getUser(accessToken);

    if (userErr || !userRes?.user) {
      return jsonError(403, "Invalid session");
    }

    // ---------------------------------------------------------
    // 2-B) report storage path 형식 확인
    // reports/{reportId}/...
    // ---------------------------------------------------------
    if (!path.startsWith("reports/")) {
      return jsonError(403, "Invalid path");
    }

    const pathParts = path.split("/");
    const reportId = asString(pathParts[1]);

    if (!reportId) {
      return jsonError(403, "Invalid path");
    }

    // UUID column에 malformed value를 보내 500이 발생하지 않도록
    // report id의 기본 UUID 형태만 먼저 확인한다.
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(reportId)) {
      return jsonError(403, "Invalid path");
    }

    const allowedPrefix = `reports/${reportId}/`;

    if (!path.startsWith(allowedPrefix)) {
      return jsonError(403, "Invalid path");
    }

    // ---------------------------------------------------------
    // 2-C) path가 귀속된 report의 workspace 확인
    //
    // service_role은 RLS를 우회하므로,
    // signed URL 생성 전에 resource scope를 명시적으로 확인한다.
    // ---------------------------------------------------------
    const { data: report, error: reportErr } = await sb
      .from("reports")
      .select("id,workspace_id")
      .eq("id", reportId)
      .maybeSingle();

    if (reportErr) {
      return jsonError(500, reportErr.message);
    }

    if (!report || !report.workspace_id) {
      return jsonError(403, "Forbidden");
    }

    // ---------------------------------------------------------
    // 2-D) 현재 사용자가 해당 report workspace의 member인지 확인
    //
    // role 제한은 이번 단계에서 추가하지 않는다.
    // 기존 정상 사용자 범위를 변경하지 않고 resource boundary만 닫는다.
    // ---------------------------------------------------------
    const { data: membership, error: membershipErr } = await sb
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    if (membershipErr) {
      return jsonError(500, membershipErr.message);
    }

    if (!membership) {
      return jsonError(403, "Forbidden");
    }

    // ---------------------------------------------------------
    // 2-E) 해당 report에 실제 등록된 creative path인지 확인
    //
    // 기존 workspace member 범위는 유지하되,
    // reports/{reportId}/ 아래 임의 path signing은 허용하지 않는다.
    // ---------------------------------------------------------
    const {
      data: registeredCreative,
      error: creativeErr,
    } = await findRegisteredCreative({
      sb,
      reportId,
      path,
    });

    if (creativeErr) {
      return jsonError(500, creativeErr.message);
    }

    if (
      !registeredCreative ||
      !isAllowedCreativeBucket(registeredCreative)
    ) {
      return jsonError(403, "Path not allowed");
    }

    // ---------------------------------------------------------
    // 2-F) 인증 + report ownership + workspace membership
    // + exact creative path 검증을 모두 통과한 경우에만 signed URL 생성
    // ---------------------------------------------------------
    const { data, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);

    if (signErr) {
      return jsonError(500, signErr.message);
    }

    return NextResponse.json({
      ok: true,
      url: data?.signedUrl || null,
    });
  } catch (e: any) {
    return jsonError(500, e?.message || "Server error");
  }
}