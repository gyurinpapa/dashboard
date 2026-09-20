import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { resolveAdvertiserMediaConnectionAccess } from "@/src/lib/media-sync/media-connection-access";
import { handleMetaAdsConnectionPost } from "@/src/lib/media-sync/meta-ads-connection-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleMetaAdsConnectionPost(request, id, {
    resolveAccess: resolveAdvertiserMediaConnectionAccess,
    insert: async record => {
      return getSupabaseAdmin().from("media_connections").insert(record)
        .select("id,workspace_id,advertiser_id,provider,external_account_id,status,last_verified_at").single();
    },
  });
}
