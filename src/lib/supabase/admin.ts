// src/lib/supabase/admin.ts

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 내부 util: env 안전 조회
 * - 값 없으면 null 반환 (절대 throw 금지)
 */
function getEnv(name: string): string | null {
  const v = process.env[name];
  if (!v || !String(v).trim()) return null;
  return v;
}

/**
 * ✅ 서버 전용 Supabase Admin Client 생성 함수
 *
 * ⚠️ 중요:
 * - 모듈 로딩 시점에 createClient를 실행하지 않음
 * - 요청 시점에만 호출
 * - env 없으면 null 반환 (빌드 안전)
 *
 * 사용 예:
 * const sb = getSupabaseAdmin();
 * if (!sb) return NextResponse.json({ ok:false, error:"Supabase env missing" }, { status:503 });
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  // 서버 권장 키 우선
  const supabaseUrl =
    getEnv("SUPABASE_URL") ||
    getEnv("NEXT_PUBLIC_SUPABASE_URL");

  const serviceRoleKey =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SERVICE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}