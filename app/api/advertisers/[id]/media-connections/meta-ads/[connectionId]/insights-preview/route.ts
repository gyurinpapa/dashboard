import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { resolveAdvertiserMediaConnectionAccess } from "@/src/lib/media-sync/media-connection-access";
import { handleMetaAdsInsightsPreview, type MetaAdsPreviewRecord } from "@/src/lib/media-sync/meta-ads-insights-preview-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string; connectionId: string }> }) {
  const { id, connectionId } = await context.params;
  return handleMetaAdsInsightsPreview(request, id, connectionId, {
    resolveAccess: resolveAdvertiserMediaConnectionAccess, fetchImpl: fetch,
    async load(scope) {
      const { data, error } = await getSupabaseAdmin().from("media_connections")
        .select("id,workspace_id,advertiser_id,provider,external_account_id,credential_ciphertext,credential_version,status,connected_at,last_verified_at,updated_at")
        .eq("id", scope.connectionId).eq("workspace_id", scope.workspaceId)
        .eq("advertiser_id", scope.advertiserId).eq("provider", "meta_ads").maybeSingle();
      if (error) throw new Error("META_PREVIEW_READ_FAILED");
      return data as MetaAdsPreviewRecord | null;
    },
  });
}
