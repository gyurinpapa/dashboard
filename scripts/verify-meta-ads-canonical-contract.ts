import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import type {
  MetaAdsAdDailyInsight,
  MetaAdsCanonicalContext,
  MetaAdsCanonicalErrorCode,
} from "../src/lib/media-sync/meta-ads-canonical-row";
import type { EtrylueNormalizedMediaRow } from "../src/lib/media-sync/types";

// Install guards BEFORE loading application code. Neither credentials nor .env
// are needed. Any attempted fetch/socket/DNS operation fails this verification.
let networkAttempts = 0;
const restorers: Array<() => void> = [];
function block(target: object, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  assert.ok(descriptor, `Missing network guard target: ${key}`);
  Object.defineProperty(target, key, {
    ...descriptor,
    value: () => {
      networkAttempts += 1;
      throw new Error("OFFLINE_CONTRACT_NETWORK_FORBIDDEN");
    },
  });
  restorers.push(() => Object.defineProperty(target, key, descriptor));
}

type Fixture = {
  description: string;
  context: MetaAdsCanonicalContext;
  records: MetaAdsAdDailyInsight[];
  expected: {
    inputRows: number;
    totalRows: number;
    rawRows: number;
    droppedDates: string[];
    metricsByDate: Array<{
      date: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: number;
    }>;
    firstRowKey: string;
  };
  invalidCases: Array<{
    name: string;
    target: "context" | "record";
    changes?: Record<string, unknown>;
    omit?: string[];
    error: MetaAdsCanonicalErrorCode;
  }>;
};

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

async function main() {
  for (const [target, keys] of [
    [globalThis, ["fetch"]],
    [http, ["request", "get"]], [https, ["request", "get"]],
    [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
    [tls, ["connect"]], [dns, ["lookup", "resolve"]],
    [dns.promises, ["lookup", "resolve"]], [dgram.Socket.prototype, ["send", "connect"]],
  ] as const) {
    for (const key of keys) block(target, key);
  }
  syncBuiltinESMExports();
  try {
    const {
      convertMetaAdsDailyInsightsToCanonicalRows: convert,
      MetaAdsCanonicalError,
      META_ADS_API_VERSION,
    } = await import("../src/lib/media-sync/meta-ads-canonical-row");
    const { prepareMetaAdsStagingRows: prepare, buildMetaAdsStagingRowKey: rowKey } =
      await import("../src/lib/media-sync/meta-ads-staging-contract");
    const { buildMediaSyncStagingRowKey: legacyKey } =
      await import("../src/lib/media-sync/media-sync-staging-row-identity");
    const { getMediaProviderSyncCapability } =
      await import("../src/lib/media-sync/media-provider-sync-capabilities");

    const fixture = JSON.parse(readFileSync(resolve(
      "scripts/fixtures/meta-ads-ad-daily-insights.json",
    ), "utf8")) as Fixture;
    freeze(fixture);
    const context = fixture.context;
    const original = JSON.stringify(fixture);
    let negativeCases = 0;
    function rejects(fn: () => unknown, code: MetaAdsCanonicalErrorCode, label: string) {
      assert.throws(fn, (error: unknown) =>
        error instanceof MetaAdsCanonicalError && error.code === code, label);
      negativeCases += 1;
    }
    function convertUnknown(records: unknown, ctx: unknown = context) {
      return convert({ context: ctx as MetaAdsCanonicalContext, records: records as MetaAdsAdDailyInsight[] });
    }

    const rows = convert({ context, records: fixture.records });
    assert.equal(META_ADS_API_VERSION, "v26.0");
    assert.equal(fixture.records.length, fixture.expected.inputRows);
    assert.equal(rows.length, fixture.expected.totalRows);
    assert.deepEqual(rows.map(({ date, impressions, clicks, cost, conversions, revenue }) =>
      ({ date, impressions, clicks, cost, conversions, revenue })), fixture.expected.metricsByDate);
    for (const day of fixture.expected.droppedDates) assert.ok(!rows.some((row) => row.date === day));
    for (const row of rows) {
      assert.equal(row.provider, "meta_ads");
      assert.equal(row.ingestion_source, "api");
      assert.equal(row.row_level, "creative");
      assert.equal(row.data_level, "creative");
      assert.equal(row.row_level_reason, "meta_ads_ad_daily_insights");
      assert.equal(row.device, "");
      assert.deepEqual([row.report_date, row.day, row.ymd], [row.date, row.date, row.date]);
      assert.equal(row.external_account_id, "12345678901234567890");
      assert.equal(row.external_group_id, "2001");
      assert.equal(row.external_ad_id, "3001");
      assert.equal(row.external_creative_id, "3001");
      assert.equal("keyword" in row, false);
      assert.equal("external_keyword_id" in row, false);
      assert.deepEqual(row.provider_meta, {
        provider: "meta_ads", api_version: "v26.0", authoritative_grain: "ad",
        entity_type: "ad", entity_id: "3001", level: "ad", time_increment: 1,
        breakdowns: [], action_breakdowns: [], currency: "KRW", time_zone: "Asia/Seoul",
        metric_policy: {
          conversion_action_type: "fixture.explicit_conversion",
          revenue_action_type: "fixture.explicit_revenue",
          action_report_time: "fixture.explicit_report_time",
          attribution_windows: ["fixture.explicit_window"],
        },
      });
    }
    assert.equal(rows[0].creative_name, "Fixture ad");
    assert.equal(rows[1].creative_name, "3001");
    assert.deepEqual(convert({ context, records: [...fixture.records].reverse() }), rows);
    assert.deepEqual(convert({ context, records: [] }), []);
    assert.deepEqual(convert({ context, records: [fixture.records[1]] }), []);
    console.log("META_ZERO_DROP_DELAYED_CONVERSION_REVENUE_KEEP=PASS");
    console.log("META_EXPLICIT_ACTION_SELECTION_NO_SUM_OR_DEFAULT=PASS");

    for (const test of fixture.invalidCases) {
      const ctx = structuredClone(context);
      const record = structuredClone(fixture.records[0]);
      const target = (test.target === "context" ? ctx : record) as unknown as Record<string, unknown>;
      Object.assign(target, test.changes);
      for (const field of test.omit ?? []) delete target[field];
      rejects(() => convertUnknown([record], ctx), test.error, test.name);
    }
    for (const value of [NaN, Infinity, -Infinity, -1, true, " 1", "0x10", "0." + "0".repeat(400) + "1"]) {
      rejects(() => convertUnknown([{ ...fixture.records[0], spend: value }]), "INVALID_METRIC", "invalid number");
    }
    rejects(() => convertUnknown([{ ...fixture.records[0], impressions: "9007199254740991.1" }]),
      "INVALID_METRIC", "fractional count must not be rounded into a safe integer");
    for (const value of [null, {}, [null], new Array(1)]) {
      rejects(() => convertUnknown(value), "INVALID_INPUT", "invalid or sparse records");
    }
    rejects(() => convertUnknown([fixture.records[0], fixture.records[0]]), "DUPLICATE_AD_DAY", "duplicate fact");
    rejects(() => convertUnknown([fixture.records[1], fixture.records[1]]), "DUPLICATE_AD_DAY", "duplicate zero fact");
    rejects(() => convertUnknown([fixture.records[0], { ...fixture.records[0], campaign_id: "other" }]),
      "DUPLICATE_AD_DAY", "same ad/day with conflicting hierarchy");
    for (const field of ["conversionActionType", "revenueActionType", "actionReportTime", "attributionWindows"]) {
      const ctx = structuredClone(context);
      delete (ctx.metricPolicy as unknown as Record<string, unknown>)[field];
      rejects(() => convertUnknown([], ctx), "UNRESOLVED_METRIC_POLICY", `missing ${field}, even for empty dataset`);
    }
    rejects(() => convertUnknown([fixture.records[1]], { ...context, metricPolicy: null }),
      "UNRESOLVED_METRIC_POLICY", "unresolved zero row must not be dropped");

    const staged = prepare({ context, rows });
    assert.equal(staged.totalRows, fixture.expected.totalRows);
    assert.equal(staged.rawRows, fixture.expected.rawRows);
    assert.notEqual(staged.rawRows, fixture.records.length);
    assert.deepEqual(staged.rows.map((row) => row.row_index), [0, 1, 2, 3, 4, 5]);
    assert.equal(staged.rows[0].row_key, fixture.expected.firstRowKey);
    assert.deepEqual(prepare({ context, rows: [...rows].reverse() }), staged);
    assert.deepEqual(prepare({ context, rows: [] }), { rows: [], totalRows: 0, rawRows: 0 });
    for (const entry of staged.rows) {
      assert.equal(entry.row_key, rowKey(entry.row, context));
      assert.equal(entry.device, "");
      assert.equal(entry.date, entry.row.date);
      assert.equal(entry.channel, entry.row.channel);
      assert.equal(entry.source, entry.row.source);
      assert.ok(Object.isFrozen(entry.row.provider_meta));
      assert.ok(Object.isFrozen(entry.row));
    }
    assert.ok(Object.isFrozen(staged.rows));
    assert.ok(!Object.isFrozen(rows[0]));
    assert.ok(!Object.isFrozen(rows[0].provider_meta));
    const changed = structuredClone(rows[0]);
    changed.cost = 999;
    changed.creative = changed.creative_name = "Renamed ad";
    changed.campaign = changed.campaign_name = "Renamed campaign";
    assert.equal(rowKey(changed, context), staged.rows[0].row_key);
    assert.equal(staged.rows[0].row.cost, 12.345);
    const detached = structuredClone(rows);
    const snapshot = prepare({ context, rows: detached });
    detached[0].provider_meta!.currency = "USD";
    assert.equal(snapshot.rows[0].row.provider_meta!.currency, "KRW");

    const otherAd = convertUnknown([{ ...fixture.records[0], ad_id: "3002" }])[0];
    assert.notEqual(rowKey(otherAd, context), rowKey(rows[0], context));
    assert.equal(prepare({ context, rows: [otherAd, rows[0]] }).totalRows, 2);
    rejects(() => prepare({ context, rows: [rows[0], changed] }), "DUPLICATE_AD_DAY", "duplicate row with revised metrics");
    rejects(() => prepare({ context, rows: [rows[0], { ...rows[0], external_group_id: "other" }] }),
      "DUPLICATE_AD_DAY", "same ad/day with different staging hierarchy");
    for (const patch of [
      { provider: "google_ads" }, { row_level: "keyword" }, { data_level: "mixed" },
      { device: "UNKNOWN" }, { row_level_reason: "other" }, { report_date: "2026-09-02" },
      { external_creative_id: "other" }, { provider_meta: {} }, { source: "Facebook" },
      { impressions: "100" },
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 },
    ]) {
      rejects(() => prepare({ context, rows: [{ ...rows[0], ...patch } as EtrylueNormalizedMediaRow] }),
        "INVALID_CANONICAL_ROW", "tampered canonical row");
    }
    rejects(() => prepare({ context, rows: [{ ...rows[0], external_account_id: "999" }] }),
      "SCOPE_MISMATCH", "staging scope mismatch");
    rejects(() => prepare({ context, rows: [{ ...rows[0], access_token: "synthetic-not-a-secret" }] }),
      "UNSUPPORTED_CONTRACT", "unexpected canonical payload");
    rejects(() => prepare({ context, rows: new Array(1) }), "INVALID_INPUT", "sparse staging array");
    rejects(() => prepare({ context: { ...context, currency: "USD" }, rows }),
      "INVALID_CANONICAL_ROW", "currency provenance mismatch");
    rejects(() => prepare({ context: { ...context, metricPolicy: {
      ...context.metricPolicy, actionReportTime: "fixture.other_report_time",
    } }, rows }), "INVALID_CANONICAL_ROW", "attribution provenance mismatch");
    console.log("META_STAGING_IDENTITY_CONTIGUITY_CANONICAL_RAW=PASS");
    console.log("META_INPUT_IMMUTABILITY_DETERMINISTIC_REPLAY=PASS");

    // Exact independent compatibility expectations for existing shared keys.
    for (const provider of ["naver_searchad", "google_ads"] as const) {
      const legacy: EtrylueNormalizedMediaRow = {
        ...rows[0], provider, row_level: "keyword", data_level: "keyword", external_keyword_id: "4001",
      };
      assert.equal(legacyKey(legacy), JSON.stringify([
        provider, "12345678901234567890", "1001", "2001", "4001", "2026-09-01",
      ]));
    }
    for (const level of ["creative", "mixed"] as const) {
      const legacy: EtrylueNormalizedMediaRow = {
        ...rows[0], provider: "naver_searchad", row_level: level, data_level: level,
      };
      assert.equal(legacyKey(legacy), JSON.stringify([
        "naver_searchad_authoritative_v1", level, "naver_searchad",
        "12345678901234567890", "1001", "2001", ...(level === "creative" ? ["3001"] : []), "2026-09-01",
      ]));
    }
    assert.throws(() => legacyKey(rows[0]), { code: "UNSUPPORTED_PROVIDER" });
    assert.deepEqual(getMediaProviderSyncCapability("meta_ads"), { syncRuntimeEnabled: false, allowedDataLevels: [] });
    assert.equal(JSON.stringify(fixture), original);
    assert.equal(networkAttempts, 0);
    console.log(`META_NEGATIVE_CASES=${negativeCases}`);
    console.log("LEGACY_NAVER_GOOGLE_SHARED_KEYS_EXACT=PASS");
    console.log("META_RUNTIME_STILL_DISABLED=PASS");
    console.log("NETWORK_ATTEMPTS=0");
    console.log("META_ADS_OFFLINE_CANONICAL_CONTRACT=PASS");
  } finally {
    for (const restore of restorers.reverse()) restore();
    syncBuiltinESMExports();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
