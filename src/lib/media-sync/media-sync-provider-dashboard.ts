import type {
  JsonObject,
  MediaProvider,
  MediaSyncJobStatus,
  SafeMediaConnection,
  SafeMediaSyncJob,
} from "./types";

export type MediaSyncProviderProductState =
  | "enabled"
  | "catalog"
  | "preparing";

export type MediaSyncProviderProduct = Readonly<{
  key: string;
  label: string;
  description: string;
  state: MediaSyncProviderProductState;
}>;

export type MediaSyncProviderDashboardItem = Readonly<{
  provider: MediaProvider;
  label: string;
  runtime_enabled: boolean;
  selection_mode: "fixed_all" | "unavailable";
  products: readonly MediaSyncProviderProduct[];
  connections: readonly SafeMediaConnection[];
  latest_job: null | Readonly<{
    id: string;
    status: MediaSyncJobStatus;
    progress: number;
    phase: string | null;
    current_product: string | null;
    current_product_label: string | null;
    collected_rows: number;
    failed_rows: number;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    updated_at: string;
    error: string | null;
  }>;
}>;

const PROVIDER_ORDER = [
  "naver_searchad",
  "google_ads",
  "meta_ads",
] as const satisfies readonly MediaProvider[];

const PROVIDER_LABELS: Readonly<Record<MediaProvider, string>> =
  Object.freeze({
    naver_searchad: "네이버 검색광고",
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
  });

const PROVIDER_RUNTIME_ENABLED: Readonly<Record<MediaProvider, boolean>> =
  Object.freeze({
    naver_searchad: true,
    google_ads: true,
    meta_ads: false,
  });

const PROVIDER_PRODUCTS: Readonly<
  Record<MediaProvider, readonly MediaSyncProviderProduct[]>
> = Object.freeze({
  naver_searchad: Object.freeze([
    {
      key: "web_site",
      label: "파워링크",
      description: "WEB_SITE 키워드 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "power_contents",
      label: "파워콘텐츠",
      description: "POWER_CONTENTS 키워드 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "place",
      label: "플레이스",
      description: "PLACE 키워드 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "shopping",
      label: "쇼핑검색",
      description: "SHOPPING 광고 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "brand_search",
      label: "브랜드검색",
      description: "BRAND_SEARCH 광고그룹 일별 성과",
      state: "enabled" as const,
    },
  ]),
  google_ads: Object.freeze([
    {
      key: "search",
      label: "검색",
      description: "SEARCH 키워드 및 광고 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "demand_gen",
      label: "Demand Gen",
      description: "DEMAND_GEN 광고 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "display",
      label: "디스플레이",
      description: "DISPLAY 광고 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "performance_max",
      label: "Performance Max",
      description: "PERFORMANCE_MAX 에셋그룹 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "shopping",
      label: "쇼핑",
      description: "SHOPPING 광고 일별 성과",
      state: "enabled" as const,
    },
    {
      key: "youtube",
      label: "YouTube",
      description: "VIDEO 광고 일별 성과",
      state: "enabled" as const,
    },
  ]),
  // Display catalog only: Meta insights remain ad × day totals without platform
  // breakdowns. These entries do not enable runtime or product selection.
  meta_ads: Object.freeze([
    {
      key: "facebook",
      label: "Facebook",
      description: "Facebook 광고 · 성과는 광고별 일별 합산 기준",
      state: "catalog" as const,
    },
    {
      key: "instagram",
      label: "Instagram",
      description: "Instagram 광고 · 성과는 광고별 일별 합산 기준",
      state: "catalog" as const,
    },
    {
      key: "messenger",
      label: "Messenger",
      description: "Messenger 광고 · 성과는 광고별 일별 합산 기준",
      state: "catalog" as const,
    },
    {
      key: "audience_network",
      label: "Audience Network",
      description: "Audience Network 광고 · 성과는 광고별 일별 합산 기준",
      state: "catalog" as const,
    },
    {
      key: "threads",
      label: "Threads",
      description: "Threads 광고 · 성과는 광고별 일별 합산 기준",
      state: "catalog" as const,
    },
  ]),
});

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clampProgress(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(numberValue)));
}

function readCheckpoint(errorDetail: JsonObject | null): UnknownRecord | null {
  if (!isPlainObject(errorDetail)) {
    return null;
  }

  const checkpoint = errorDetail.processing_checkpoint;
  return isPlainObject(checkpoint) ? checkpoint : null;
}

function readJobPhase(job: SafeMediaSyncJob): string | null {
  const checkpoint = readCheckpoint(job.error_detail);

  if (!checkpoint) {
    return null;
  }

  if (job.provider === "google_ads") {
    const collector = checkpoint.collector;
    return isPlainObject(collector)
      ? readOptionalString(collector.phase)
      : readOptionalString(checkpoint.phase);
  }

  return readOptionalString(checkpoint.phase);
}

function readCurrentProduct(job: SafeMediaSyncJob): string | null {
  if (job.provider !== "google_ads") {
    return null;
  }

  const checkpoint = readCheckpoint(job.error_detail);
  const collector = checkpoint?.collector;

  if (!isPlainObject(collector)) {
    return null;
  }

  const productFamily = readOptionalString(collector.product_family);

  if (productFamily) {
    return productFamily;
  }

  const productRoute = Array.isArray(collector.product_route)
    ? collector.product_route
    : [];
  const productIndex = Number(collector.product_index);

  if (
    Number.isSafeInteger(productIndex) &&
    productIndex >= 0 &&
    productIndex < productRoute.length
  ) {
    return readOptionalString(productRoute[productIndex]);
  }

  return null;
}

function getProductLabel(
  provider: MediaProvider,
  productKey: string | null,
): string | null {
  if (!productKey) {
    return null;
  }

  return (
    PROVIDER_PRODUCTS[provider].find((product) => product.key === productKey)
      ?.label ?? productKey
  );
}

function toLatestJob(job: SafeMediaSyncJob) {
  const currentProduct = readCurrentProduct(job);

  return Object.freeze({
    id: job.id,
    status: job.status,
    progress: clampProgress(job.progress),
    phase: readJobPhase(job),
    current_product: currentProduct,
    current_product_label: getProductLabel(job.provider, currentProduct),
    collected_rows: Math.max(0, Number(job.inserted_rows) || 0),
    failed_rows: Math.max(0, Number(job.failed_rows) || 0),
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    updated_at: job.updated_at,
    error: job.error,
  });
}

export function buildMediaSyncProviderDashboard(input: {
  connections: readonly SafeMediaConnection[];
  jobs: readonly SafeMediaSyncJob[];
}): readonly MediaSyncProviderDashboardItem[] {
  return Object.freeze(
    PROVIDER_ORDER.map((provider) => {
      const connections = Object.freeze(
        input.connections.filter((connection) => connection.provider === provider),
      );
      const latestJob = input.jobs.find((job) => job.provider === provider) ?? null;
      const runtimeEnabled = PROVIDER_RUNTIME_ENABLED[provider];

      return Object.freeze({
        provider,
        label: PROVIDER_LABELS[provider],
        runtime_enabled: runtimeEnabled,
        selection_mode: runtimeEnabled ? "fixed_all" : "unavailable",
        products: PROVIDER_PRODUCTS[provider],
        connections,
        latest_job: latestJob ? toLatestJob(latestJob) : null,
      });
    }),
  );
}
