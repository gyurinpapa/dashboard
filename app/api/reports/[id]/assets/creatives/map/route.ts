// app/api/reports/[id]/assets/creatives/map/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

export async function GET(req: Request, ctx: Ctx) {
  const t0 = Date.now();

  try {
    const { user, error: authErr } = await sbAuth();
    if (authErr || !user) return jsonError(401, "UNAUTHORIZED");

    const { id } = await ctx.params;
    const reportId = asString(id);
    if (!reportId) return jsonError(400, "MISSING_REPORT_ID");

    const supabase = getSupabaseAdmin();

    // ✅ mode=published 지원(공유페이지에서 쓸 수 있음)
    const url = new URL(req.url);
    const mode = asString(url.searchParams.get("mode")) || "current"; // current | published

    const { data: rep, error: repErr } = await supabase
      .from("reports")
      .select("id, current_creatives_batch_id, published_creatives_batch_id")
      .eq("id", reportId)
      .maybeSingle();

    if (repErr) return jsonError(500, "REPORT_SELECT_FAILED", { detail: repErr.message });
    if (!rep) return jsonError(404, "REPORT_NOT_FOUND");

    const batchId =
      mode === "published"
        ? asString((rep as any).published_creatives_batch_id)
        : asString((rep as any).current_creatives_batch_id);

    // ✅ 배치가 없으면 map은 빈 것(= 착시 차단)
    if (!batchId) {
      return NextResponse.json(
        {
          ok: true,
          report_id: reportId,
          mode,
          batch_id: null,
          count_db_rows: 0,
          count_signed: 0,
          unique_url_count: 0,
          unique_path_count: 0,
          creativesMap: {},
          creatives: [],
          ms: Date.now() - t0,
        },
        { status: 200 }
      );
    }

    // ✅ batch_id로만 제한 (핵심)
    const { data: rows, error: selErr } = await supabase
      .from("report_creatives")
      .select("id, report_id, batch_id, creative_key, file_name, storage_bucket, storage_path, created_at")
      .eq("report_id", reportId)
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false });

    if (selErr) return jsonError(500, "DB_SELECT_FAILED", { detail: selErr.message });

    const creatives = rows ?? [];

    const map: Record<string, string> = {};
    const signed: Array<{
      creative_key: string;
      url: string;
      storage_path: string;
      file_name?: string | null;
      created_at?: string | null;
    }> = [];

    for (const c of creatives) {
      const bucket = asString((c as any).storage_bucket) || "report_uploads";
      const path = asString((c as any).storage_path);
      const key = asString((c as any).creative_key);

      if (!bucket || !path || !key) continue;

      const { data: s, error: sErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);

      if (sErr || !s?.signedUrl) continue;

      map[key] = s.signedUrl;
      signed.push({
        creative_key: key,
        url: s.signedUrl,
        storage_path: path,
        file_name: (c as any).file_name ?? null,
        created_at: (c as any).created_at ?? null,
      });
    }

    const urls = signed.map((x) => x.url);
    const uniqUrls = uniq(urls);
    const uniqPaths = uniq(signed.map((x) => x.storage_path));

    return NextResponse.json({
      ok: true,
      report_id: reportId,
      mode,
      batch_id: batchId,
      count_db_rows: creatives.length,
      count_signed: signed.length,
      unique_url_count: uniqUrls.length,
      unique_path_count: uniqPaths.length,
      creativesMap: map,
      creatives: signed,
      ms: Date.now() - t0,
    });
  } catch (e: any) {
    return jsonError(500, "SERVER_ERROR", { detail: String(e?.message ?? e) });
  }
}