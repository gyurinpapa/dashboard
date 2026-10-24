import assert from "node:assert/strict";
import { parseMetaAdsInsightsPreview } from "../src/lib/media-sync/meta-ads-insights-preview";
import { reconcileMetaAdsAdDailyRows as reconcile, readMetaAdsAdDailyCheck as read } from "../src/lib/media-sync/meta-ads-ad-daily-check";
import { formatMetaAdsPreviewExport } from "../src/lib/media-sync/meta-ads-insights-preview-export";

// Synthetic only: no credentials, database, environment files or live network.
let network = 0;
globalThis.fetch = async () => { network++; throw new Error("NETWORK_FORBIDDEN"); };
async function main() {
  let cases = 0;
  const accountId = "123456", token = "SYNTHETIC_DAILY_SECRET";
  const range = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };
  const input = { ...range, externalAccountId: accountId, accessToken: token };
  const account = parseMetaAdsInsightsPreview({ data: [{ account_id: accountId,
    date_start: range.dateFrom, date_stop: range.dateTo, impressions: "600", clicks: "60", spend: "0.6",
    actions: [{ action_type: "offsite_conversion.fb_pixel_custom", value: "8" }],
    conversions: [{ action_type: "contact_website", value: "8" }, { action_type: "contact_total", value: "8" }],
  }] }, accountId, range);
  const rows = [1, 2, 3].map((n, i) => ({ account_id: accountId, campaign_id: String(10 + n),
    campaign_name: `Fixture ${n}`, adset_id: String(20 + n), ad_id: String(30 + n),
    date_start: `2026-09-0${n}`, date_stop: `2026-09-0${n}`, impressions: String(n * 100), clicks: String(n * 10), spend: `0.${n}`,
    actions: [{ action_type: "contact_website", value: "1000" }],
    conversions: [{ action_type: "contact_website", value: String([4, 1, 3][i]) }, { action_type: "contact_total", value: "1000" }],
  }));
  const sparse = { ...rows[0], ad_id: "99", impressions: "0", clicks: "0", spend: "0", conversions: undefined };
  const all = [...rows, sparse];
  const expected = reconcile(all, accountId, range, account, 1);
  assert.equal(expected.status, "MATCH"); assert.equal(expected.ad_daily_sum.spend, "0.6");
  assert.equal(expected.ad_daily_sum.reported_website_contacts, "8");
  assert.equal(expected.ad_daily_sum.rows_without_contact_value, 1);
  assert.deepEqual(expected.campaigns.map(c => c.reported_website_contacts), ["4", "1", "3"]);
  assert.equal(expected.row_count, 4); assert.equal(expected.ad_count, 4); assert.equal(expected.day_count, 3);
  assert.equal(expected.report_data_saved, false); cases++;
  assert.deepEqual(reconcile([...all].reverse(), accountId, range, account, 1), expected); cases++;
  assert.equal(reconcile(rows.map(r => ({ ...r, conversions: undefined })), accountId, range, account, 1).status, "MISMATCH"); cases++;
  assert.equal(reconcile(all, accountId, range, { ...account, conversions: [] }, 1).status, "UNRESOLVED"); cases++;
  const explicitZero = reconcile([{ ...sparse, conversions: [{ action_type: "contact_website", value: "0" }] }], accountId,
    range, { ...account, impressions: "0", clicks: "0", spend: "0", conversions: [{ action_type: "contact_website", value: "0" }] }, 1);
  assert.equal(explicitZero.status, "MATCH"); assert.equal(explicitZero.ad_daily_sum.rows_without_contact_value, 0); cases++;
  const noRows = reconcile([], accountId, range, account, 1);
  assert.equal(noRows.status, "MISMATCH"); assert.equal(noRows.complete, true); cases++;
  const emptyAccount = parseMetaAdsInsightsPreview({ data: [] }, accountId, range);
  assert.equal(reconcile([], accountId, range, emptyAccount, 1).status, "UNRESOLVED"); cases++;
  const precise = reconcile([{ ...rows[0], spend: "0.000001" }, { ...rows[1], spend: "0.000002" }], accountId,
    range, { ...account, impressions: "300", clicks: "30", spend: "0.000003", conversions: [{ action_type: "contact_website", value: "5" }] }, 1);
  assert.equal(precise.status, "MATCH"); cases++;
  for (const change of [{ account_id: "999" }, { date_start: "2026-08-31", date_stop: "2026-08-31" },
    { date_start: "2026-09-31", date_stop: "2026-09-31" }, { date_stop: "2026-09-02" }, { ad_id: "bad" },
    { adset_id: "" }, { campaign_id: "0" }, { campaign_name: "\n" }, { impressions: "1.5" }, { spend: "1e2" },
    { clicks: "-1" }, { spend: "9007199254740992" }, { conversions: null },
    { conversions: [{ action_type: "contact_website", value: "-1" }] },
    { conversions: [{ action_type: "contact_website", value: "1" }, { action_type: "contact_website", value: "2" }] }]) {
    assert.throws(() => reconcile([{ ...rows[0], ...change }], accountId, range, account, 1)); cases++;
  }
  assert.throws(() => reconcile([rows[0], { ...rows[0], campaign_id: "999" }], accountId, range, account, 1)); cases++;
  assert.throws(() => reconcile([sparse, sparse], accountId, range, account, 1)); cases++;
  assert.throws(() => reconcile(all, accountId, range, { ...account, date_from: "2026-09-02" }, 1)); cases++;

  const url = new URL(`https://graph.facebook.com/v26.0/act_${accountId}/insights`);
  let calls = 0;
  const fetchOne: typeof fetch = async (request, init) => {
    calls++; const requestUrl = new URL(String(request));
    assert.equal(requestUrl.origin, url.origin); assert.equal(requestUrl.pathname, url.pathname);
    assert.equal(requestUrl.searchParams.get("level"), "ad"); assert.equal(requestUrl.searchParams.get("time_increment"), "1");
    assert.equal(requestUrl.searchParams.get("limit"), "500");
    assert.equal(requestUrl.searchParams.has("access_token"), false);
    assert.equal(requestUrl.searchParams.has("action_report_time"), false);
    assert.equal(requestUrl.searchParams.has("action_attribution_windows"), false);
    assert.ok(requestUrl.searchParams.get("fields")?.split(",").includes("conversions"));
    assert.deepEqual(JSON.parse(requestUrl.searchParams.get("time_range")!), { since: range.dateFrom, until: range.dateTo });
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    return Response.json({ data: all, paging: { cursors: { after: "unused" } } });
  };
  assert.deepEqual(await read(input, account, fetchOne), expected); assert.equal(calls, 1); cases++;
  let page = 0;
  const next = `${url}?after=next_cursor&access_token=${token}&level=account`;
  const paged = await read(input, account, async (request) => {
    page++;
    if (page === 1) return Response.json({ data: rows.slice(0, 2), paging: { next, cursors: { after: "next_cursor" } } });
    const u = new URL(String(request)); assert.equal(u.searchParams.get("after"), "next_cursor");
    assert.equal(u.searchParams.get("level"), "ad"); assert.equal(u.searchParams.has("access_token"), false);
    return Response.json({ data: [rows[2], sparse] });
  });
  assert.deepEqual(paged, { ...expected, page_count: 2 }); assert.equal(page, 2); cases++;
  page = 0;
  await assert.rejects(read(input, account, async () => ++page === 1
    ? Response.json({ data: [rows[0]], paging: { next, cursors: { after: "next_cursor" } } })
    : Response.json({ data: [rows[0]] })), /INVALID_RESPONSE/); cases++;
  for (const bad of [
    { next: "https://untrusted.invalid/?after=next_cursor", cursors: { after: "next_cursor" } },
    { next: `${url}?after=other`, cursors: { after: "next_cursor" } },
    { next, cursors: { after: "bad cursor" } },
    { next: `${url}?after=${token}`, cursors: { after: token } },
  ]) {
    await assert.rejects(read(input, account, async () => Response.json({ data: rows, paging: bad }))); cases++;
  }
  page = 0;
  await assert.rejects(read(input, account, async () => { page++;
    return Response.json({ data: [], paging: { next, cursors: { after: "next_cursor" } } });
  }), /INCOMPLETE_RESPONSE/); assert.equal(page, 2); cases++;
  page = 0;
  await assert.rejects(read(input, account, async () => { page++;
    return Response.json({ data: [], paging: { next: `${url}?after=cursor_${page}`, cursors: { after: `cursor_${page}` } } });
  }), /INCOMPLETE_RESPONSE/); assert.equal(page, 5); cases++;
  for (const response of [Response.json({ error: { message: token } }), Response.json({ data: Array(501).fill(rows[0]) }),
    new Response("bad json"), new Response(token, { status: 403 }),
    new Response("{}", { headers: { "content-length": "1048577" } }), new Response("x".repeat(1048577))]) {
    await assert.rejects(read(input, account, async () => response), e => !String(e).includes(token)); cases++;
  }
  await assert.rejects(read(input, account, async () => { throw new Error(token); }), e => !String(e).includes(token)); cases++;
  await assert.rejects(read(input, account, () => new Promise(() => {}), { timeoutMs: 5 }), /REQUEST_TIMEOUT/); cases++;
  let cancelled = false;
  await assert.rejects(read(input, account, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); }, cancel() { cancelled = true; },
  })), { timeoutMs: 5 }), /REQUEST_TIMEOUT/); assert.equal(cancelled, true); cases++;
  const exported = formatMetaAdsPreviewExport({ externalAccountId: accountId, currency: "KRW", timeZone: "Asia/Seoul", preview: account,
    adDailyCheck: { ...expected, access_token: token, account: { ...expected.account, access_token: token },
      campaigns: expected.campaigns.map(c => ({ ...c, access_token: token })),
      days: expected.days.map(d => ({ ...d, access_token: token })) } as typeof expected });
  assert.equal(exported.includes(token), false); assert.equal(exported.includes("access_token"), false);
  assert.equal(JSON.parse(exported).schema, "etrylue_meta_insights_check_v3");
  assert.deepEqual(JSON.parse(exported).ad_daily_check, expected); cases++;
  assert.equal(network, 0);
  console.log(`META_AD_DAILY_CHECK: ${cases} cases PASS; LIVE_API=0; DB_WRITES=0; REPORT_SYNC=DISABLED`);
}
main().catch(error => { console.error("META_AD_DAILY_CHECK: FAIL", error); process.exitCode = 1; });
