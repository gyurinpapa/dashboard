import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import type { MetaAdsApiTestPreviewInput } from "../src/lib/media-sync/meta-ads-api-test-preview";

// Always offline. There is no --run, token argument, env loader or live mode.
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
globalThis.fetch = deny;
for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
  [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
  [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
  [dgram.Socket.prototype, ["send", "connect"]]] as const) {
  for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
}
syncBuiltinESMExports();
const flags = ["--account-id", "--currency", "--timezone", "--date", "--conversion-action",
  "--revenue-action", "--report-time", "--attribution-window"];
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node --import tsx scripts/preview-meta-ads-api-test.ts [--example | --account-id ID --currency CODE --timezone ZONE --date YYYY-MM-DD --conversion-action TYPE --revenue-action TYPE --report-time LABEL --attribution-window LABEL ...]");
    console.log("Preview only. One day, first page <=25 rows, no network/DB/credentials. Omit arguments for the unconnected draft.");
    return;
  }
  const example = args.length === 1 && args[0] === "--example";
  const values = new Map<string, string[]>();
  if (!example) for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!flags.includes(flag) || value === undefined || value.startsWith("--") ||
      (values.has(flag) && flag !== "--attribution-window")) throw new Error("INVALID_ARGUMENTS");
    values.set(flag, [...(values.get(flag) ?? []), value]);
  }
  // Only the two known repository fixtures are readable; no input/output file paths.
  const draft = JSON.parse(readFileSync("scripts/fixtures/meta-ads-connection-draft.json", "utf8"));
  let input: MetaAdsApiTestPreviewInput;
  if (example) {
    const { context } = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
    input = { externalAccountId: context.externalAccountId, currency: context.currency, timeZone: context.timeZone,
      date: context.dateFrom, metricPolicy: context.metricPolicy };
  } else {
    if (draft.scope !== null || draft.currency !== null || draft.timeZone !== null || draft.executionEnabled !== false ||
      draft.accountMetadataVerified !== false || draft.candidateIsAccountVerified !== false) throw new Error("INVALID_DRAFT");
    const value = (flag: string, fallback: string | null) => values.get(flag)?.[0] ?? fallback;
    input = { externalAccountId: value("--account-id", null), currency: value("--currency", null),
      timeZone: value("--timezone", null), date: value("--date", null),
      metricPolicy: { conversionActionType: value("--conversion-action", draft.metricPolicyCandidate.conversionActionType),
        revenueActionType: value("--revenue-action", draft.metricPolicyCandidate.revenueActionType),
        actionReportTime: value("--report-time", draft.metricPolicyCandidate.actionReportTime),
        attributionWindows: values.get("--attribution-window") ?? draft.metricPolicyCandidate.attributionWindows } };
  }
  const { buildMetaAdsApiTestPreview } = await import("../src/lib/media-sync/meta-ads-api-test-preview");
  const preview = buildMetaAdsApiTestPreview(input);
  if (networkAttempts !== 0) throw new Error("NETWORK_FORBIDDEN");
  console.log(JSON.stringify({ inputSource: example ? "SYNTHETIC_EXAMPLE" : values.size ? "MANUAL_PREVIEW" : "UNCONNECTED_DRAFT",
    ...preview, verification: { networkAttempts, apiCalls: 0, dbExecutions: 0, credentialReads: 0 } }, null, 2));
}
main().catch(() => {
  // Never echo arguments, fixture contents, credentials or lower-level errors.
  console.error("META_API_PREVIEW_FAILED: invalid arguments or configuration; preview only, no live mode.");
  process.exitCode = 1;
});
