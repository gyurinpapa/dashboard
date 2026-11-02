// Synthetic regression: execute the real hook with API source labels and CSV keys.
// No provider requests, database access, or changes to stored report rows.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useReportAggregates } from "../src/lib/report/useReportAggregates";
import { summarize } from "../src/lib/report/aggregate";
import type { Row } from "../src/lib/report/types";
import type { FilterSelection } from "../src/lib/report/filter-selection";

type Args = Parameters<typeof useReportAggregates>[0];
type Result = ReturnType<typeof useReportAggregates>;
type FixtureRow = Row & { id: string };
function aggregate(args: Args): Result {
  let result: Result | undefined;
  function Probe() { result = useReportAggregates(args); return null; }
  renderToStaticMarkup(createElement(Probe));
  assert.ok(result);
  return result;
}
const rows: FixtureRow[] = ["네이버 검색광고", "Naver Ads", "Meta Ads", "Facebook", "Google Ads"].map((source, i) => ({
  id: String(i), source, date: i % 2 ? "2026-10-02" : "2026-10-01",
  provider: i < 2 ? "naver_searchad" : i < 4 ? "meta_ads" : "google_ads",
  channel: i < 2 ? "search" : i < 4 ? "social" : "display",
  device: i % 2 ? "Mobile" : "PC", product: `product-${i}`,
  impressions: (i + 1) * 100, clicks: (i + 1) * 10, cost: (i + 1) * 1000,
  conversions: i + 1, revenue: (i + 1) * 2000,
}));
const selections: [FilterSelection, number[]][] = [
  ["all", [0,1,2,3,4]], ["naver", [0,1]], ["meta", [2,3]], ["google", [4]],
  [["naver", "meta"], [0,1,2,3]], [["meta"], [2,3]], ["missing", []],
];
const variants: FixtureRow[][] = [
  rows,
  rows.map((row, i) => ({...row, source: i < 2 ? "naver" : i < 4 ? "meta" : "google"})),
  rows.map((row, i) => i === 0 ? {...row, source: "", platform: "네이버"}
    : i === 2 ? {...row, source: "", media_source: "Meta Ads"} : row),
];
let cases = 0;
for (const inputRows of variants) {
  const before = JSON.stringify(inputRows);
  for (const fast of [false, true]) for (const [selectedSource, indices] of selections) {
    const args: Args = {rows: inputRows, rowsArePreNormalized: true,
      selectedMonth: "all", selectedWeek: "all", selectedDevice: "all", selectedChannel: "all", selectedSource,
      monthGoal: {impressions:0,clicks:0,cost:0,conversions:0,revenue:0},
      needOptions: !fast, needByMonth: !fast, needHydratedFilteredRows: false};
    const actual = aggregate(args), expected = indices.map(i => inputRows[i]);
    assert.deepEqual(actual.filteredRows.map(row => row.id), expected.map(row => row.id), `${JSON.stringify(selectedSource)} fast=${fast}`);
    assert.deepEqual(actual.totals, summarize(expected));
    if (!fast) {
      assert.deepEqual(actual.sourceOptions, ["google", "meta", "naver"]);
      assert.equal(actual.byMonth.reduce((sum, month) => sum + month.conversions, 0), actual.totals.conversions);
      if (indices.length) assert.ok(actual.channelOptions.length > 0);
    }
    cases++;
    const device = aggregate({...args, selectedDevice: "PC"});
    assert.deepEqual(device.filteredRows.map(row => row.id), expected.filter(row => row.device === "PC").map(row => row.id)); cases++;
    const channel = aggregate({...args, selectedChannel: "social"});
    assert.deepEqual(channel.filteredRows.map(row => row.id), expected.filter(row => row.channel === "social").map(row => row.id)); cases++;
  }
  assert.equal(JSON.stringify(inputRows), before); cases++;
}
console.log(`REPORT_SOURCE_FILTER: ${cases} cases PASS; API labels, CSV keys, fallback fields, scalar/multi-select, full/fast paths; LIVE_API=0`);
