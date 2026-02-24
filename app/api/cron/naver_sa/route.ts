import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function requireCronSecret(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, error: "Missing env CRON_SECRET" as const };

  const got = new URL(req.url).searchParams.get("secret");
  if (got !== secret) return { ok: false, error: "Unauthorized" as const };

  return { ok: true as const };
}

// KST 기준 YYYY-MM-DD
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

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  // ✅ 기본: 어제 하루만 (가장 안정)
  const since = kstYmd(-1);
  const until = kstYmd(-1);

  const { data: conns, error } = await supabase
    .from("connections")
    .select("id, workspace_id, source, status, external_account_id")
    .eq("source", "naver_sa")
    .eq("status", "connected");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results: any[] = [];

  // ✅ baseUrl 안전하게 만들기 (Invalid URL 방지)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? process.env.NEXT_PUBLIC_BASE_URL
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  for (const c of conns ?? []) {
    try {
      const u = new URL("/api/sync/naver_sa", baseUrl);
      u.searchParams.set("workspace_id", c.workspace_id);
      u.searchParams.set("since", since);
      u.searchParams.set("until", until);
      u.searchParams.set("maxTry", "60");
      u.searchParams.set("intervalMs", "3000");

      const r = await fetch(u.toString(), { method: "GET" });
      const j = await r.json();

      results.push({
        ok: r.ok && j?.ok === true,
        workspace_id: c.workspace_id,
        connection_id: c.id,
        customer_id: c.external_account_id,
        status: r.status,
        body: j,
        url: u.toString(),
      });
    } catch (e: any) {
      results.push({
        ok: false,
        workspace_id: c.workspace_id,
        connection_id: c.id,
        customer_id: c.external_account_id,
        error: e?.message ?? String(e),
        baseUrl,
      });
    }
  }

  const okCount = results.filter((x) => x.ok).length;

  return NextResponse.json({
    ok: true,
    step: "cron_naver_sa_done",
    since,
    until,
    baseUrl,
    total: results.length,
    okCount,
    results,
  });
}