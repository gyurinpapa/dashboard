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

function buildPublicStorageUrl(
  sb: any,
  bucketValue: any,
  pathValue: any
) {
  const bucket = asString(bucketValue);
  const path = asString(pathValue);

  if (!bucket || !path) {
    return null;
  }

  const { data } = sb.storage
    .from(bucket)
    .getPublicUrl(path);

  return asString(data?.publicUrl) || null;
}

async function fetchWorkspaceLogoUrl(
  sb: any,
  workspaceId: string
) {
  const id = asString(workspaceId);

  if (!id) {
    return null;
  }

  const { data, error } = await sb
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return buildPublicStorageUrl(
    sb,
    (data as any)?.logo_storage_bucket,
    (data as any)?.logo_storage_path
  );
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
      .select("id, name, workspace_id, public_slug")
      .eq("public_slug", slug)
      .maybeSingle();

    if (advertiserErr) {
      return jsonError(500, advertiserErr.message || "ADVERTISER_LOOKUP_FAILED");
    }

    if (!advertiser) {
      return jsonError(404, "CLIENT_NOT_FOUND");
    }

    const advertiserId = asString((advertiser as any).id);
    const advertiserWorkspaceId = asString((advertiser as any).workspace_id);

    if (!advertiserId) {
      return jsonError(500, "ADVERTISER_ID_MISSING");
    }

    const { data: report, error: reportErr } = await sb
      .from("reports")
      .select(
        [
          "id",
          "title",
          "status",
          "share_token",
          "advertiser_id",
          "workspace_id",
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
      return jsonError(500, reportErr.message || "REPORT_LOOKUP_FAILED");
    }

    if (!report || !asString((report as any).share_token)) {
      return jsonError(404, "PUBLISHED_REPORT_NOT_FOUND", {
        detail: "이 광고주에 연결된 발행 리포트가 없습니다.",
      });
    }

    const reportWorkspaceId =
      asString((report as any).workspace_id) ||
      advertiserWorkspaceId;

    const workspaceLogoUrl =
      await fetchWorkspaceLogoUrl(
        sb,
        reportWorkspaceId
      );

    return NextResponse.json({
      ok: true,
      slug,
      workspace_logo_url: workspaceLogoUrl,
      advertiser: {
        id: advertiserId,
        name: asString((advertiser as any).name),
        workspace_id: advertiserWorkspaceId,
        public_slug: slug,
      },
      report: {
        id: asString((report as any).id),
        title: asString((report as any).title),
        status: asString((report as any).status),
        share_token: asString((report as any).share_token),
        advertiser_id: asString((report as any).advertiser_id),
        workspace_id: reportWorkspaceId,
        workspace_logo_url: workspaceLogoUrl,
        published_at: (report as any).published_at ?? null,
        created_at: (report as any).created_at ?? null,
      },
    });
  } catch (e: any) {
    return jsonError(500, e?.message || "INTERNAL_SERVER_ERROR");
  }
}
