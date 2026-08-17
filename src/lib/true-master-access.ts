import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function asString(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asString(value).toLowerCase();
}

export async function isTrueMasterUser(userId: string) {
  const id = asString(userId);
  if (!id) return false;

  const admin = getSupabaseAdmin();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`TRUE_MASTER_PROFILE_LOOKUP_FAILED:${profileError.message}`);
  }

  if (normalizeEmail(profile?.email) !== ONLY_MASTER_EMAIL) {
    return false;
  }

  const { data: memberships, error: membershipError } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", id)
    .eq("role", "master")
    .limit(1);

  if (membershipError) {
    throw new Error(
      `TRUE_MASTER_MEMBERSHIP_LOOKUP_FAILED:${membershipError.message}`,
    );
  }

  return Array.isArray(memberships) && memberships.length > 0;
}
