// app/api/cron/naver_sa/route.ts
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------ env / supabase (SAFE) ------------------ */

function getEnv(name: string): string | null {
  const v = process.env[name];
  if (!v || !String(v).trim()) return null;
  return v;
}

/**
 * ✅ 요청 시점에만 생성, env 없으면 null
 * - import 시점에 createClient 실행 금지 (빌드 안전)
 */
function getSupabaseAdmin(): SupabaseClient | null {
  const url = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function jsonFail(status: number, error: string, hint?: string) {
  return NextResponse.json({ ok: false, error, hint }, { status });
}

/* ------------------ auth ------------------ */

function requireCronSecret(req: Request) {
  const secret = getEnv("CRON_SECRET");
  if (!secret) return { ok: false as const, error: "Missing env CRON_SECRET" as const };

  const got = new URL(req.url).searchParams.get("secret");
  if (got !== secret) return { ok: false as const, error: "Unauthorized" as const };

  return { ok: true as const };
}

/* ------------------ utils ------------------ */

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

function resolveBaseUrl(): string {
  // 우선순위: 명시 설정 > vercel 도메인 > 로컬
  const explicit = getEnv("NEXT_PUBLIC_BASE_URL") || getEnv("SITE_URL") || getEnv("NEXT_PUBLIC_SITE_URL");
  if (explicit) return explicit;

  const vercelUrl = getEnv("VERCEL_URL");
  if (vercelUrl) {
    if (vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")) return vercelUrl;
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

/* ------------------ MAIN ------------------ */

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  // ✅ 요청 시점에만 Supabase 생성
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return jsonFail(
      503,
      "Supabase environment variables are missing.",
      "Set SUPABASE_URL(or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in Vercel env."
    );
  }

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
  const baseUrl = resolveBaseUrl();

  for (const c of conns ?? []) {
    try {
      const u = new URL("/api/sync/naver_sa", baseUrl);
      u.searchParams.set("workspace_id", c.workspace_id);
      u.searchParams.set("since", since);
      u.searchParams.set("until", until);
      u.searchParams.set("maxTry", "60");
      u.searchParams.set("intervalMs", "3000");

      const r = await fetch(u.toString(), { method: "GET" });
      const j = await r.json().catch(() => ({}));

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