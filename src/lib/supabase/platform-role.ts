// src/lib/supabase/platform-role.ts
import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getAdminClient() {
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type PlatformRole = "platform_owner" | null;

export async function getPlatformRoleByUserId(
  userId: string
): Promise<PlatformRole> {
  const id = String(userId || "").trim();
  if (!id) return null;

  const supabaseAdmin = getAdminClient();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("platform_role")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load platform_role: ${error.message}`);
  }

  const role = data?.platform_role;
  return role === "platform_owner" ? "platform_owner" : null;
}

export async function isPlatformOwner(userId: string): Promise<boolean> {
  const role = await getPlatformRoleByUserId(userId);
  return role === "platform_owner";
}