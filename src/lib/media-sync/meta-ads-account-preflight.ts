import { META_ADS_API_VERSION } from "./meta-ads-canonical-row";
import { resolveMetaAdsAccountPolicy, type MetaAdsPolicyDateRange } from "./meta-ads-account-policy";
import type { MetaAdsCredentialContext } from "./meta-ads-credentials";

const ORIGIN = "https://graph.facebook.com";
const FIELDS = "id,account_id,currency,timezone_name";
export type MetaAdsAccountMetadata = Readonly<{ externalAccountId: string; currency: string; timeZone: string }>;
type ErrorCode = "SERVER_ONLY" | "INVALID_INPUT" | "MISSING_DEPENDENCY" | "INVALID_RESPONSE" |
  "ACCOUNT_MISMATCH" | "INVALID_METADATA" | "POLICY_MISMATCH" | "INVALID_POLICY" |
  "REQUEST_FAILED" | "REQUEST_TIMEOUT" | "RESPONSE_TOO_LARGE" | "API_HTTP_ERROR" | "API_ERROR";
export class MetaAdsAccountPreflightError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number | null = null) {
    super(`Meta account preflight ${code}.`); this.name = "MetaAdsAccountPreflightError";
  }
}
function check(ok: unknown, code: ErrorCode): asserts ok {
  if (!ok) throw new MetaAdsAccountPreflightError(code);
}
function server() { check(typeof window === "undefined", "SERVER_ONLY"); }
function account(value: unknown): asserts value is string {
  check(typeof value === "string" && /^[1-9][0-9]{0,29}$/.test(value), "INVALID_INPUT");
}
function own(value: object, key: string): unknown {
  const d = Object.getOwnPropertyDescriptor(value, key);
  check(d && Object.hasOwn(d, "value"), "INVALID_RESPONSE"); return d.value;
}
function safe(error: unknown, fallback: ErrorCode): MetaAdsAccountPreflightError {
  return error instanceof MetaAdsAccountPreflightError ? error : new MetaAdsAccountPreflightError(fallback);
}

/** Pure request builder. Does not load a credential, read environment or perform IO. */
export function buildMetaAdsAccountMetadataRequest(input: Readonly<{ externalAccountId: string; accessToken: string }>) {
  try {
    server(); account(input.externalAccountId);
    check(typeof input.accessToken === "string" && /^[\x21-\x7e]{1,20000}$/.test(input.accessToken), "INVALID_INPUT");
    const url = new URL(`${ORIGIN}/${META_ADS_API_VERSION}/act_${input.externalAccountId}`);
    url.searchParams.set("fields", FIELDS);
    return Object.freeze({ url: url.href, init: Object.freeze({ method: "GET" as const,
      headers: Object.freeze({ Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" }),
      cache: "no-store" as const, redirect: "error" as const }) });
  } catch (error) { throw safe(error, "INVALID_INPUT"); }
}

/** Shape/identity validation only. Does not prove token scopes, account status or permission to sync. */
export function parseMetaAdsAccountMetadata(value: unknown, expectedExternalAccountId: string): MetaAdsAccountMetadata {
  try {
    server(); account(expectedExternalAccountId);
    check(value && typeof value === "object" && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), "INVALID_RESPONSE");
    check(!Object.hasOwn(value, "error"), "API_ERROR");
    check(own(value, "account_id") === expectedExternalAccountId &&
      own(value, "id") === `act_${expectedExternalAccountId}`, "ACCOUNT_MISMATCH");
    const currency = own(value, "currency"), timeZone = own(value, "timezone_name");
    check(typeof currency === "string" && /^[A-Z]{3}$/.test(currency), "INVALID_METADATA");
    check(typeof timeZone === "string" && timeZone.length > 0 && timeZone.length <= 200 &&
      timeZone === timeZone.trim() && !/[\x00-\x1f\x7f]/.test(timeZone), "INVALID_METADATA");
    try { new Intl.DateTimeFormat("en", { timeZone }); }
    catch { throw new MetaAdsAccountPreflightError("INVALID_METADATA"); }
    // Extra response fields are never exposed, executed or stored.
    return Object.freeze({ externalAccountId: expectedExternalAccountId, currency, timeZone });
  } catch (error) { throw safe(error, "INVALID_RESPONSE"); }
}

/** Check a raw account response against an independently trusted scope and explicit policy.
 * Mismatches never rewrite a policy or an existing checkpoint. Caller must start a new
 * collection with a deliberately revised policy; this is not a live-runtime gate.
 */
export function verifyMetaAdsAccountPolicyMetadata(policy: unknown, scope: MetaAdsCredentialContext,
  range: MetaAdsPolicyDateRange, rawMetadata: unknown) {
  try {
    server();
    const resolved = resolveMetaAdsAccountPolicy(policy, scope, range);
    const metadata = parseMetaAdsAccountMetadata(rawMetadata, resolved.scope.externalAccountId);
    check(metadata.currency === resolved.context.currency && metadata.timeZone === resolved.context.timeZone, "POLICY_MISMATCH");
    return Object.freeze({ metadata, resolvedPolicy: resolved });
  } catch (error) { throw safe(error, "INVALID_POLICY"); }
}

async function readBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const cancelBody = () => { void response.body?.cancel().catch(() => {}); };
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    cancelBody(); throw new MetaAdsAccountPreflightError("RESPONSE_TOO_LARGE");
  }
  check(response.body, "INVALID_RESPONSE");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0, text = "";
  try {
    check(!signal.aborted, "REQUEST_TIMEOUT");
    for (;;) {
      const { done, value } = await reader.read();
      check(!signal.aborted, "REQUEST_TIMEOUT");
      if (done) break;
      bytes += value.byteLength; check(bytes <= maxBytes, "RESPONSE_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode(); return JSON.parse(text);
  } catch (error) { throw safe(error, "INVALID_RESPONSE"); }
  finally { signal.removeEventListener("abort", cancel); cancel(); }
}

/** One bounded GET through a mandatory caller-supplied transport. No SDK, fallback
 * fetch, retry, storage, OAuth, token inspection endpoint, job or worker registration.
 * Supplying native fetch would make this live: keep it unregistered until separately authorized.
 */
export async function readMetaAdsAccountMetadata(input: Readonly<{ externalAccountId: string; accessToken: string }>,
  dependencies: Readonly<{ fetchImpl: typeof fetch }>, options: Readonly<{ timeoutMs?: number; maxResponseBytes?: number }> = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const externalAccountId = input.externalAccountId;
    const request = buildMetaAdsAccountMetadataRequest({ externalAccountId, accessToken: input.accessToken });
    check(dependencies && typeof dependencies.fetchImpl === "function", "MISSING_DEPENDENCY");
    const fetchImpl = dependencies.fetchImpl;
    const timeoutMs = options.timeoutMs ?? 10000, maxBytes = options.maxResponseBytes ?? 65536;
    check(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30000 &&
      Number.isSafeInteger(maxBytes) && maxBytes >= 128 && maxBytes <= 262144, "INVALID_INPUT");
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new MetaAdsAccountPreflightError("REQUEST_TIMEOUT")); controller.abort(); }, timeoutMs);
    });
    return await Promise.race([timeout, (async () => {
      let response: Response;
      try { response = await fetchImpl(request.url, { ...request.init, signal: controller.signal }); }
      catch { throw new MetaAdsAccountPreflightError("REQUEST_FAILED"); }
      check(response instanceof Response, "INVALID_RESPONSE");
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {}); throw new MetaAdsAccountPreflightError("REQUEST_TIMEOUT");
      }
      try {
        check(!response.redirected, "INVALID_RESPONSE");
        if (response.url) check(response.url === request.url, "ACCOUNT_MISMATCH");
        if (!response.ok) throw new MetaAdsAccountPreflightError("API_HTTP_ERROR", response.status);
      } catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
      return parseMetaAdsAccountMetadata(await readBody(response, maxBytes, controller.signal), externalAccountId);
    })()]);
  } catch (error) { throw safe(error, "REQUEST_FAILED"); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
