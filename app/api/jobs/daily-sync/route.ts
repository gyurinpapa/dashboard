import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function kstYmd(offsetDays: number) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET() {
  const since = kstYmd(-1);
  const until = kstYmd(0);

  // ✅ 연결된 naver_sa workspace 목록
  // status 컬럼이 없을 수도 있어서, 일단 source 기준으로만 가져오고
  // 너가 status 쓰고 있으면 여기 .eq("status","connected") 추가하면 됨
  const { data: conns, error } = await supabase
    .from("connections")
    .select("workspace_id")
    .eq("source", "naver_sa");

  if (error) {
    return NextResponse.json({ ok: false, step: "connections_query_failed", error: error.message }, { status: 500 });
  }

  const workspaceIds = Array.from(new Set((conns ?? []).map((c: any) => c.workspace_id).filter(Boolean)));

  const baseUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL?.startsWith("http")
      ? process.env.VERCEL_URL
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "";

  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, step: "base_url_missing", error: "Set SITE_URL or NEXT_PUBLIC_SITE_URL (e.g. https://your-app.vercel.app)" },
      { status: 500 }
    );
  }

  const results: any[] = [];

  for (const workspace_id of workspaceIds) {
    const u = new URL(`${baseUrl}/api/sync/naver_sa`);
    u.searchParams.set("workspace_id", workspace_id);
    u.searchParams.set("since", since);
    u.searchParams.set("until", until);
    u.searchParams.set("channel", "all");

    try {
      const res = await fetch(u.toString(), { method: "GET" });
      const json = await res.json().catch(() => ({}));

      results.push({
        workspace_id,
        ok: Boolean(json?.ok),
        status: res.status,
        run_id: json?.run_id,
        upserted: json?.upserted ?? 0,
        error: json?.error ?? null,
      });
    } catch (e: any) {
      results.push({
        workspace_id,
        ok: false,
        status: 0,
        run_id: null,
        upserted: 0,
        error: e?.message ?? "fetch_failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    step: "daily_sync_done",
    since,
    until,
    total_workspaces: workspaceIds.length,
    results,
  });
}