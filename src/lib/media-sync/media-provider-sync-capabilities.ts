import type {
  MediaProvider,
  MediaSyncDataLevel,
} from "./types";

export type MediaProviderSyncCapability = Readonly<{
  syncRuntimeEnabled: boolean;
  allowedDataLevels: readonly MediaSyncDataLevel[];
}>;

const ALL_NAVER_SEARCH_ADS_DATA_LEVELS = [
  "keyword",
  "creative",
  "mixed",
  "unknown",
] as const satisfies readonly MediaSyncDataLevel[];

const MEDIA_PROVIDER_SYNC_CAPABILITIES = {
  naver_searchad: {
    syncRuntimeEnabled: true,
    allowedDataLevels:
      ALL_NAVER_SEARCH_ADS_DATA_LEVELS,
  },
  google_ads: {
    syncRuntimeEnabled: false,
    allowedDataLevels: ["keyword"],
  },
  meta_ads: {
    syncRuntimeEnabled: false,
    allowedDataLevels: [],
  },
} as const satisfies Record<
  MediaProvider,
  MediaProviderSyncCapability
>;

export function getMediaProviderSyncCapability(
  provider: MediaProvider,
): MediaProviderSyncCapability {
  return MEDIA_PROVIDER_SYNC_CAPABILITIES[provider];
}
