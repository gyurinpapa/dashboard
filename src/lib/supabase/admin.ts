// src/lib/supabase/admin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 서버에서만 사용 (Route Handler / Server Actions)
// ✅ 브라우저로 절대 노출 금지
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// 기존 코드 호환을 위해 supabaseAdmin도 export
export const supabaseAdmin = getSupabaseAdmin();