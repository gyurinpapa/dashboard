import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaAdsVerificationRecord, MetaAdsVerificationStore } from "./meta-ads-connection-verification";

const COLUMNS = "id,workspace_id,advertiser_id,provider,external_account_id,credential_ciphertext,credential_version,status,connected_at,updated_at";

export function createMetaAdsVerificationStore(db: SupabaseClient): MetaAdsVerificationStore {
  return {
    async load(scope) {
      const { data, error } = await db.from("media_connections").select(COLUMNS)
        .eq("id", scope.connectionId).eq("workspace_id", scope.workspaceId)
        .eq("advertiser_id", scope.advertiserId).eq("provider", "meta_ads").maybeSingle();
      if (error) throw new Error("META_VERIFICATION_READ_FAILED");
      return data as MetaAdsVerificationRecord | null;
    },
    async markVerified(record, verifiedAt) {
      const { data, error } = await db.from("media_connections").update({
        connected_at: record.connected_at ?? verifiedAt, last_verified_at: verifiedAt,
        last_error: null, updated_at: verifiedAt,
      }).eq("id", record.id).eq("workspace_id", record.workspace_id)
        .eq("advertiser_id", record.advertiser_id).eq("provider", "meta_ads")
        .eq("external_account_id", record.external_account_id).eq("status", "active")
        .eq("credential_version", record.credential_version).eq("updated_at", record.updated_at)
        .select("id,last_verified_at").maybeSingle();
      if (error) throw new Error("META_VERIFICATION_SAVE_FAILED");
      return data?.id === record.id && Date.parse(data.last_verified_at) === Date.parse(verifiedAt);
    },
  };
}
