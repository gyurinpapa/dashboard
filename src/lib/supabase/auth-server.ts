// src/lib/supabase/auth-server.ts
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseCookieHeader(raw: string | null): Array<{ name: string; value: string }> {
  if (!raw) return [];
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((kv) => {
      const eq = kv.indexOf("=");
      if (eq < 0) return { name: kv, value: "" };
      const name = kv.slice(0, eq).trim();
      const value = kv.slice(eq + 1).trim();
      return { name, value };
    });
}

function getAllCookiesSafe(): Array<{ name: string; value: string }> {
  // ✅ 최신 Next: cookies().getAll() 존재
  try {
    const cs: any = cookies();
    if (cs && typeof cs.getAll === "function") {
      const all = cs.getAll();
      // Next의 getAll()은 {name,value,...} 배열
      return (all ?? []).map((c: any) => ({ name: c.name, value: c.value }));
    }
  } catch {
    // ignore
  }

  // ✅ 구버전/특수 런타임: headers().get("cookie")로 파싱
  try {
    const h = headers();
    const raw = h.get("cookie");
    return parseCookieHeader(raw);
  } catch {
    return [];
  }
}

/**
 * Route Handler / Server Components에서 쿠키 기반 세션을 안정적으로 읽기 위한 공통 헬퍼.
 * - 기존 API들이 쓰는 sbAuth() 시그니처 유지 → 구조 안 깨짐
 */
export async function sbAuth() {
  const supabase = createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return getAllCookiesSafe();
        },
        setAll() {
          // 현재 목적(세션 읽기)엔 setAll이 필수 아님.
          // 필요해지는 시점(리프레시 토큰 갱신 등)이 오면 NextResponse 기반으로 확장 가능.
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();

  return {
    supabase,
    user: data?.user ?? null,
    error,
  };
}