// src/lib/supabase/auth-server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAllCookiesSafe(): Array<{ name: string; value: string }> {
  try {
    const cs: any = cookies();

    if (cs && typeof cs.getAll === "function") {
      const all = cs.getAll();
      return (all ?? []).map((c: any) => ({
        name: String(c?.name ?? ""),
        value: String(c?.value ?? ""),
      }));
    }
  } catch {
    // ignore
  }

  return [];
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