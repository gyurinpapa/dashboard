import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { resolveAdvertiserMediaConnectionAccess } from "@/src/lib/media-sync/media-connection-access";
import { createMetaAdsVerificationStore } from "@/src/lib/media-sync/meta-ads-verification-repository";
import { handleMetaAdsOnboarding } from "@/src/lib/media-sync/meta-ads-onboarding";
import { MetaAdsContactError } from "@/src/lib/media-sync/meta-ads-contact-rows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string; connectionId: string }> }) {
  const { id, connectionId } = await context.params, db = getSupabaseAdmin();
  return handleMetaAdsOnboarding(request, id, connectionId, {
    resolveAccess: resolveAdvertiserMediaConnectionAccess,
    load: createMetaAdsVerificationStore(db).load,
    fetchImpl: fetch,
    async activate(payload) {
      const { data, error } = await db.rpc("activate_meta_ads_daily_connection_v1", { p_payload: payload });
      if (error) {
        const code = String(error.message ?? "").split(/[\s:]/)[0];
        throw new MetaAdsContactError(["META_CONTACT_CHANGED", "META_CONTACT_POLICY_REQUIRED", "META_SETUP_INVALID_RANGE",
          "META_SETUP_INVALID_INPUT"].includes(code) ? code : "META_SETUP_SAVE_FAILED");
      }
      if (!data || typeof data !== "object") throw new MetaAdsContactError("META_SETUP_SAVE_FAILED", 500);
      return data;
    },
  });
}
