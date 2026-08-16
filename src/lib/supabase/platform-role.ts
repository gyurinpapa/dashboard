// src/lib/supabase/platform-role.ts
import { getSupabaseAdmin } from "./admin";

const ONLY_PLATFORM_OWNER_EMAIL = "gyurinpapakimdh@gmail.com";

function getAdminClient() {
  return getSupabaseAdmin();
}

export type PlatformRole = "platform_owner" | null;

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function getPlatformRoleByUserId(
  userId: string
): Promise<PlatformRole> {
  const id = String(userId || "").trim();
  if (!id) return null;

  const supabaseAdmin = getAdminClient();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email, platform_role")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load platform_role: ${error.message}`);
  }

  const email = normalizeEmail(data?.email);
  const role = data?.platform_role;

  if (email !== ONLY_PLATFORM_OWNER_EMAIL) {
    return null;
  }

  return role === "platform_owner" ? "platform_owner" : null;
}

export async function isPlatformOwner(userId: string): Promise<boolean> {
  const role = await getPlatformRoleByUserId(userId);
  return role === "platform_owner";
}