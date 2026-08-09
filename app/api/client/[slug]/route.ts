// app/api/client/[slug]/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

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

function normalizeSlug(v: any) {
  return asString(v).toLowerCase();
}

function isValidSlug(slug: string) {
  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug);
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { slug: slugRaw } = await ctx.params;
    const slug = normalizeSlug(slugRaw);

    if (!slug) {
      return jsonError(400, "SLUG_REQUIRED");
    }

    if (!isValidSlug(slug)) {
      return jsonError(400, "INVALID_SLUG");
    }

    const sb = getSupabaseAdmin();

    const { data: advertiser, error: advertiserErr } = await sb
      .from("advertisers")
      .select("id, workspace_id")
      .eq("public_slug", slug)
      .maybeSingle();

    if (advertiserErr) {
      return jsonError(
        500,
        advertiserErr.message || "ADVERTISER_LOOKUP_FAILED"
      );
    }

    if (!advertiser) {
      return jsonError(404, "CLIENT_NOT_FOUND");
    }

    const advertiserId = asString((advertiser as any).id);
    const advertiserWorkspaceId = asString(
      (advertiser as any).workspace_id
    );

    if (!advertiserId) {
      return jsonError(500, "ADVERTISER_ID_MISSING");
    }

    if (!advertiserWorkspaceId) {
      return jsonError(500, "ADVERTISER_WORKSPACE_MISSING");
    }

    /**
     * 기존 선택 순서는 그대로 유지한다.
     *
     * 중요:
     * - workspace_id / published_ingestion_id 조건을 조회 자체에 추가하지 않는다.
     * - 먼저 기존과 동일한 최신 ready + share_token report를 선택한다.
     * - 선택 후 tenant/published boundary를 검증한다.
     * - 잘못된 최신 report를 건너뛰고 과거 report로 자동 fallback하지 않는다.
     */
    const { data: report, error: reportErr } = await sb
      .from("reports")
      .select(
        [
          "share_token",
          "workspace_id",
          "published_ingestion_id",
          "published_at",
          "created_at",
        ].join(",")
      )
      .eq("advertiser_id", advertiserId)
      .eq("status", "ready")
      .not("share_token", "is", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportErr) {
      return jsonError(
        500,
        reportErr.message || "REPORT_LOOKUP_FAILED"
      );
    }

    const shareToken = asString((report as any)?.share_token);

    if (!report || !shareToken) {
      return jsonError(404, "PUBLISHED_REPORT_NOT_FOUND", {
        detail: "이 광고주에 연결된 발행 리포트가 없습니다.",
      });
    }

    const reportWorkspaceId = asString(
      (report as any).workspace_id
    );

    const publishedIngestionId = asString(
      (report as any).published_ingestion_id
    );

    /**
     * Public client tenant boundary.
     *
     * service_role은 RLS를 우회하므로 API route에서 fail closed 한다.
     * 선택된 report의 workspace가 advertiser와 정확히 일치하지 않으면
     * share_token을 브라우저에 노출하지 않는다.
     */
    if (
      !reportWorkspaceId ||
      reportWorkspaceId !== advertiserWorkspaceId
    ) {
      return jsonError(404, "PUBLISHED_REPORT_NOT_FOUND", {
        detail: "이 광고주에 연결된 발행 리포트가 없습니다.",
      });
    }

    /**
     * /api/share/[token]은 published_ingestion_id가 없는 report를
     * 공개하지 않는다.
     *
     * client slug endpoint에서도 동일한 공개 가능 조건을 확인한 뒤에만
     * bearer 역할을 하는 share_token을 반환한다.
     */
    if (!publishedIngestionId) {
      return jsonError(404, "PUBLISHED_REPORT_NOT_FOUND", {
        detail: "이 광고주에 연결된 발행 리포트가 없습니다.",
      });
    }

    /**
     * Public response 최소화.
     *
     * app/client/[slug]/page.tsx의 실제 caller contract는
     * report.share_token만 필요하다.
     *
     * advertiser/report/workspace UUID, timestamp, status 등
     * 내부 식별자는 공개 응답에 포함하지 않는다.
     */
    return NextResponse.json({
      ok: true,
      report: {
        share_token: shareToken,
      },
    });
  } catch (e: any) {
    return jsonError(
      500,
      e?.message || "INTERNAL_SERVER_ERROR"
    );
  }
}
