// app/api/jobs/daily-sync/route.ts
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

function jsonFail(status: number, step: string, error: string, hint?: string) {
  return NextResponse.json({ ok: false, step, error, hint }, { status });
}

/* ------------------ utils ------------------ */

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
  // 우선순위: 명시 설정 > public > vercel preview/prod 도메인
  const siteUrl = getEnv("SITE_URL") || getEnv("NEXT_PUBLIC_SITE_URL");
  if (siteUrl) return siteUrl;

  const vercelUrl = getEnv("VERCEL_URL");
  if (!vercelUrl) return "";

  // VERCEL_URL은 보통 "myapp.vercel.app" 형태
  if (vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")) return vercelUrl;
  return `https://${vercelUrl}`;
}

/* ------------------ MAIN ------------------ */

export async function GET() {
  const since = kstYmd(-1);
  const until = kstYmd(0);

  // ✅ 요청 시점에만 Supabase 생성
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return jsonFail(
      503,
      "supabase_env_missing",
      "Supabase environment variables are missing.",
      "Set SUPABASE_URL(or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in Vercel env."
    );
  }

  // ✅ 연결된 naver_sa workspace 목록
  const { data: conns, error } = await supabase
    .from("connections")
    .select("workspace_id")
    .eq("source", "naver_sa");

  if (error) {
    return jsonFail(500, "connections_query_failed", error.message);
  }

  const workspaceIds = Array.from(
    new Set((conns ?? []).map((c: any) => c.workspace_id).filter(Boolean))
  );

  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    return jsonFail(
      500,
      "base_url_missing",
      "Set SITE_URL or NEXT_PUBLIC_SITE_URL (e.g. https://your-app.vercel.app) or ensure VERCEL_URL is present."
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