import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { resolveAdvertiserMediaConnectionAccess } from "@/src/lib/media-sync/media-connection-access";
import { handleMetaAdsConnectionVerification } from "@/src/lib/media-sync/meta-ads-connection-verification";
import { createMetaAdsVerificationStore } from "@/src/lib/media-sync/meta-ads-verification-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; connectionId: string }> }) {
  const { id, connectionId } = await context.params;
  return handleMetaAdsConnectionVerification(request, id, connectionId, {
    resolveAccess: resolveAdvertiserMediaConnectionAccess,
    ...createMetaAdsVerificationStore(getSupabaseAdmin()), fetchImpl: fetch,
  });
}
