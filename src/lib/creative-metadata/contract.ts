/** Offline-only contract. No network, credentials, database, or performance writes. */
export type Provider = "naver_searchad" | "google_ads";
export type Scope = Readonly<{
  workspaceId: string; advertiserId: string; provider: Provider; externalAccountId: string;
}>;
export type Identity = Scope & Readonly<{ entityType: "ad" | "asset_group"; entityId: string }>;
export type Asset = Readonly<{
  assetId: string; kind: "image" | "youtube"; role: "main" | "logo" | "thumbnail" | "other";
  imageUrl: string | null; videoId: string | null; watchUrl: string | null; expiresAt: string | null;
}>;
export type Metadata = Readonly<{
  identity: Identity; revision: string; fetchedAt: string; sourceUpdatedAt: string | null;
  temporalBasis: "observed_at_fetch";
  status: "ready" | "partial" | "not_found" | "unsupported" | "unavailable";
  displayName: string | null; headlines: readonly string[]; descriptions: readonly string[];
  assets: readonly Asset[]; issues: readonly string[];
}>;
export type Observation = Readonly<{ revision: string; fetchedAt: string }>;
export type NormalizeResult = Readonly<{ ok: true; metadata: Metadata }> |
  Readonly<{ ok: false; reason: "INVALID_INPUT" | "SCOPE_MISMATCH" }>;

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
export function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s && s.length <= 4000 ? s : null;
}
export function id(value: unknown): string | null {
  const s = typeof value === "string" ? value :
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : "";
  return s && s.length <= 256 && !/[\s\u0000-\u001f]/u.test(s) ? s : null;
}
export function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,19) === value.slice(0,19)
    ? parsed.toISOString() : null;
}
export function makeIdentity(input: Identity): Identity {
  if (!id(input.workspaceId) || !id(input.advertiserId) || !id(input.entityId) ||
      !["naver_searchad", "google_ads"].includes(input.provider) ||
      !["ad", "asset_group"].includes(input.entityType)) throw new Error("INVALID_IDENTITY");
  const account = input.provider === "google_ads" ? input.externalAccountId.replace(/-/g, "") : input.externalAccountId;
  if (!/^\d+$/.test(account)) throw new Error("INVALID_ACCOUNT");
  return Object.freeze({workspaceId: input.workspaceId, advertiserId: input.advertiserId,
    provider: input.provider, externalAccountId: account, entityType: input.entityType, entityId: input.entityId});
}
export function identityKey(input: Identity): string {
  const x = makeIdentity(input);
  return JSON.stringify([x.workspaceId,x.advertiserId,x.provider,x.externalAccountId,x.entityType,x.entityId]);
}

/** scope MUST come from report authorization, never directly from client parameters. */
export function identityForRow(scope: Scope, value: unknown): Identity | null {
  try {
    const row = record(value), meta = record(row.provider_meta);
    const entityId = id(row.external_creative_id);
    if (!entityId || row.row_level !== "creative" || row.provider !== scope.provider || meta.entity_type !== "ad") return null;
    if (row.workspace_id !== undefined && row.workspace_id !== scope.workspaceId) return null;
    if (row.advertiser_id !== undefined && row.advertiser_id !== scope.advertiserId) return null;
    const result = makeIdentity({...scope,entityType:"ad",entityId});
    if (id(row.external_account_id) !== result.externalAccountId) return null;
    if (scope.provider === "naver_searchad") {
      if (row.row_level_reason !== "naver_searchad_web_site_ad_daily_stats" ||
          meta.authoritative_grain !== "keyword" || meta.detail_only !== true || meta.campaign_type !== "WEB_SITE") return null;
    } else {
      const family = meta.product_family;
      if (family !== "search" && family !== "display" && family !== "demand_gen") return null;
      if (row.row_level_reason !== `google_ads_${family}_ad_daily_stats`) return null;
    }
    return result;
  } catch { return null; }
}

const imageHosts: Readonly<Record<Provider, readonly string[]>> = Object.freeze({
  naver_searchad: Object.freeze(["pstatic.net"]),
  google_ads: Object.freeze(["googlesyndication.com","googleusercontent.com","gstatic.com","ytimg.com"]),
});
/** URL policy only; this does NOT fetch URLs or guarantee CORS, reachability, or redirect safety. */
export function safeImageUrl(value: unknown, provider: Provider): string | null {
  return safeHttpsUrl(value,imageHosts[provider]);
}
export function safeHttpsUrl(value: unknown, allowedHosts: readonly string[]): string | null {
  const s = text(value);
  if (!s || /[\u0000-\u0020\\]/u.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash ||
        !allowedHosts.some(h=>u.hostname === h || u.hostname.endsWith("."+h))) return null;
    for (const k of u.searchParams.keys()) {
      if (/^(access_token|api_key|authorization|password|client_secret)$/i.test(k)) return null;
    }
    return u.href;
  } catch { return null; }
}
export function finish(identity: Identity, observation: Observation, data: {
  status?: Metadata["status"]; name?: string | null; headlines?: readonly string[];
  descriptions?: readonly string[]; assets?: readonly Asset[]; issues?: readonly string[];
}): NormalizeResult {
  try {
    const fetchedAt = timestamp(observation.fetchedAt);
    if (!fetchedAt || !id(observation.revision)) return Object.freeze({ok:false,reason:"INVALID_INPUT"});
    const frozenIdentity = makeIdentity(identity);
    const issues = Object.freeze([...new Set(data.issues ?? [])]);
    const metadata: Metadata = Object.freeze({identity:frozenIdentity,revision:observation.revision,fetchedAt,
      sourceUpdatedAt:null,temporalBasis:"observed_at_fetch",status:data.status ?? (issues.length ? "partial" : "ready"),
      displayName:data.name ?? null,headlines:Object.freeze([...(data.headlines ?? [])]),
      descriptions:Object.freeze([...(data.descriptions ?? [])]),
      assets:Object.freeze((data.assets ?? []).map(a=>Object.freeze({...a}))),issues});
    return Object.freeze({ok:true,metadata});
  } catch { return Object.freeze({ok:false,reason:"INVALID_INPUT"}); }
}
export function unavailable(identity: Identity, observation: Observation,
  status: "not_found" | "unsupported" | "unavailable"): NormalizeResult {
  return finish(identity,observation,{status});
}
