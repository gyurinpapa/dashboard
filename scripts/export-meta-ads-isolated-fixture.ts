import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";

// Fixture export only. No env/credential imports and no permitted network path.
const deny = () => { throw new Error("META_FIXTURE_NETWORK_FORBIDDEN"); };
globalThis.fetch = deny;
for (const [target, keys] of [
  [http, ["request", "get"]], [https, ["request", "get"]],
  [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
  [tls, ["connect"]], [dns, ["lookup", "resolve"]],
  [dns.promises, ["lookup", "resolve"]], [dgram.Socket.prototype, ["send", "connect"]],
] as const) for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
syncBuiltinESMExports();

// Independent fixture oracle for PostgreSQL jsonb::text. This is not a new
// production serializer. Actual parity remains a PostgreSQL runtime assertion.
function jsonbText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
    const s = String(value);
    if (!s.includes("e")) return s;
    const [coefficient, exponent] = s.split("e");
    const negative = coefficient.startsWith("-");
    const parts = coefficient.replace(/^-/, "").split(".");
    const digits = parts.join(""); const point = parts[0].length + Number(exponent);
    return (negative ? "-" : "") + (point <= 0 ? "0." + "0".repeat(-point) + digits
      : point >= digits.length ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point));
  }
  if (Array.isArray(value)) return "[" + value.map(jsonbText).join(", ") + "]";
  assert.ok(value && typeof value === "object");
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return "{" + keys.map((key) => JSON.stringify(key) + ": " + jsonbText(object[key])).join(", ") + "}";
}

async function main() {
  const { convertMetaAdsDailyInsightsToCanonicalRows: convert } = await import("../src/lib/media-sync/meta-ads-canonical-row");
  const { prepareMetaAdsStagingRows: prepare } = await import("../src/lib/media-sync/meta-ads-staging-contract");
  const fixture = JSON.parse(readFileSync("scripts/fixtures/meta-ads-ad-daily-insights.json", "utf8"));
  const prepared = prepare({ context: fixture.context, rows: convert({ context: fixture.context, records: fixture.records }) });
  assert.equal(prepared.totalRows, 6);
  const vectors = prepared.rows.map((entry) => ({
    ...entry, jsonb_text: jsonbText(entry.row),
    fingerprint: createHash("sha256").update(jsonbText(entry.row)).digest("hex"),
  }));
  const edgeValues = [{ "가": "한글", a: 0.0000001, zz: "quote\"\\", b: [true, null, 1.25] }];
  process.stdout.write(JSON.stringify({ context: fixture.context, total_rows: prepared.totalRows,
    rows: vectors, jsonb_edge_vectors: edgeValues.map((row) => ({ row, text: jsonbText(row),
      fingerprint: createHash("sha256").update(jsonbText(row)).digest("hex") })) }) + "\n");
}
main().catch((error) => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
