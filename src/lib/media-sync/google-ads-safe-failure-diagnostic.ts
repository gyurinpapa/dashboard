// Metadata only. Never serialize error messages, stacks, response bodies or causes.
const TOKEN_CODES = new Set([
  "INVALID_INPUT", "TOKEN_HTTP_ERROR", "TOKEN_REQUEST_TIMEOUT",
  "TOKEN_REQUEST_FAILED", "INVALID_TOKEN_RESPONSE", "REQUIRED_SCOPE_MISSING",
]);
const API_CODES = new Set([
  "REQUEST_TIMEOUT", "REQUEST_FAILED", "API_HTTP_ERROR", "INVALID_RESPONSE",
  "PAGINATION_LOOP", "PAGE_LIMIT_EXCEEDED", "RETRY_EXHAUSTED",
]);
const COLLECTORS = new Set([
  "GoogleAdsKeywordStatsCollectorError", "GoogleAdsSearchAdStatsCollectorError",
  "GoogleAdsDemandGenAdStatsCollectorError", "GoogleAdsDisplayAdStatsCollectorError",
  "GoogleAdsShoppingAdStatsCollectorError", "GoogleAdsPerformanceMaxAssetGroupStatsCollectorError",
  "GoogleAdsYoutubeAdStatsCollectorError",
]);
const DATABASE_ERRORS = new Set([
  "MediaSyncStagingRepositoryError", "GoogleAdsKeywordProcessingCheckpointError",
  "MediaSyncSnapshotMaterializationError", "NaverFactReplacementError",
]);

export type GoogleAdsSafeFailureDiagnostic = Readonly<{
  category: "token_refresh" | "ads_api" | "database" | "unknown";
  reason: string | null;
  http_status: number | null;
}>;

function ownValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

export function getGoogleAdsSafeFailureDiagnostic(error: unknown): GoogleAdsSafeFailureDiagnostic {
  let diagnostic: GoogleAdsSafeFailureDiagnostic = {
    category: "unknown", reason: null, http_status: null,
  };
  const visited = new Set<object>();
  let current = error;
  try {
    for (let depth = 0; depth < 8; depth++) {
      if (!current || typeof current !== "object" || visited.has(current)) break;
      visited.add(current);
      const name = ownValue(current, "name");
      const code = ownValue(current, "code");
      const status = ownValue(current, "status");
      let category: GoogleAdsSafeFailureDiagnostic["category"] = "unknown";
      if (typeof code === "string") {
        if (name === "GoogleAdsAccessTokenRefreshError" && TOKEN_CODES.has(code)) {
          category = "token_refresh";
        } else if (typeof name === "string" && COLLECTORS.has(name) && API_CODES.has(code)) {
          category = "ads_api";
        } else if (typeof name === "string" && DATABASE_ERRORS.has(name) &&
                   (code === "DATABASE_ERROR" || code === "INVALID_DATABASE_RESULT")) {
          category = "database";
        }
      }
      if (category !== "unknown") {
        diagnostic = {
          category,
          reason: code as string,
          http_status: category !== "database" && typeof status === "number" &&
            Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
        };
      }
      current = ownValue(current, "cause");
    }
  } catch {
    // Diagnostic extraction must never interfere with the existing failure write.
  }
  return diagnostic;
}
