import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { buildWeekOptions, filterRows, periodText, summarize } from "../src/lib/report/aggregate";
import { retainFilterSelection, toggleFilterSelection } from "../src/lib/report/filter-selection";
import { useReportAggregates } from "../src/lib/report/useReportAggregates";

const rows = [
  { id: "sep-search-pc", date: "2026-09-01", device: "PC", provider: "naver_searchad", source: "naver", product: "web_site", provider_meta: { campaign_type: "WEB_SITE" }, cost: 100, impressions: 1000, clicks: 10, conversions: 1 },
  { id: "oct-search-mobile", date: "2026-10-01", device: "Mobile", provider: "google_ads", source: "google", provider_meta: { product_family: "search" }, cost: 200, impressions: 2000, clicks: 20, conversions: 2 },
  { id: "oct-social-mobile", date: "2026-10-08", device: "Mobile", provider: "meta_ads", source: "meta", platform: "lead", cost: 300, impressions: 3000, clicks: 30, conversions: 3 },
  { id: "nov-display-pc", date: "2026-11-02", device: "PC", provider: "google_ads", source: "google", provider_meta: { product_family: "display" }, cost: 400, impressions: 4000, clicks: 40, conversions: 4 },
];

const defaults = {
  rows, rowsArePreNormalized: true,
  selectedMonth: "all", selectedWeek: "all", selectedDevice: "all",
  selectedChannel: "all", selectedSource: "all", selectedProduct: "all",
  monthGoal: { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 },
  needHydratedFilteredRows: false,
};

function run(overrides: Partial<Parameters<typeof useReportAggregates>[0]> = {}) {
  let result!: ReturnType<typeof useReportAggregates>;
  function Probe() { result = useReportAggregates({ ...defaults, ...overrides }); return null; }
  renderToString(createElement(Probe));
  return result;
}

// Union within each filter, intersection across filters, never duplicate a row.
const cases = [
  { filters: { selectedMonth: ["2026-09", "2026-10"] }, ids: [0, 1, 2] },
  { filters: { selectedWeek: ["2026-09-28", "2026-10-05"] }, ids: [1, 2] },
  { filters: { selectedDevice: ["PC", "Mobile"] }, ids: [0, 1, 2, 3] },
  { filters: { selectedChannel: ["search", "social"] }, ids: [0, 1, 2] },
  { filters: { selectedSource: ["naver", "meta"] }, ids: [0, 2] },
  { filters: { selectedProduct: ["google_ads::search", "google_ads::display"] }, ids: [1, 3] },
  { filters: { selectedMonth: ["2026-09", "2026-10"], selectedChannel: ["search", "social"], selectedSource: ["naver", "google"], selectedDevice: ["PC", "Mobile"] }, ids: [0, 1] },
  { filters: { selectedMonth: ["2026-09", "2026-11"] }, ids: [0, 3] },
  { filters: { selectedMonth: ["2026-09", "2026-10"], selectedWeek: ["2026-09-28", "2026-10-05"], selectedDevice: ["PC", "Mobile"], selectedChannel: ["search", "social"], selectedSource: ["google", "meta"], selectedProduct: ["google_ads::search", "lead"] }, ids: [1, 2] },
  { filters: { selectedSource: ["naver", "meta"], selectedDevice: "Tablet" }, ids: [] },
];

for (const { filters, ids } of cases) {
  const expected = ids.map((index) => rows[index]);
  for (const fast of [false, true]) {
    const result = run({ ...filters, needOptions: !fast, needByMonth: !fast });
    assert.deepEqual(result.filteredRows.map((row) => row.id), expected.map((row) => row.id));
    assert.deepEqual(result.totals, summarize(expected));
    if (!fast) assert.deepEqual(result.byMonth.map((row) => row.month), [...new Set(expected.map((row) => row.date.slice(0, 7)))].sort().reverse());
  }
}

const multiple = toggleFilterSelection("2026-09", "2026-10");
assert.deepEqual(multiple, ["2026-09", "2026-10"]);
assert.equal(toggleFilterSelection(multiple, "2026-09"), "2026-10");
assert.equal(toggleFilterSelection("2026-10", "2026-10"), "all");
assert.equal(toggleFilterSelection(multiple, "all"), "all");
assert.equal(retainFilterSelection(multiple, new Set(["2026-10"])), "2026-10");
assert.equal(retainFilterSelection(multiple, new Set(multiple)), multiple);

// October 1 belongs to the week starting in September and must stay selectable.
assert(buildWeekOptions(rows, "2026-10").some((week) => week.weekKey === "2026-09-28"));
assert(run({ selectedMonth: "2026-10" }).enabledWeekKeySet.has("2026-09-28"));
assert(run({ selectedMonth: "2026-10" }).enabledMonthKeySet.has("2026-09"));
assert.deepEqual(filterRows({ ...defaults, selectedMonth: ["2026-09", "2026-10"], selectedWeek: ["2026-09-28", "2026-10-05"] }).map((row) => row.id), [rows[1].id, rows[2].id]);
assert.equal(periodText({ rows, selectedMonth: ["2026-09", "2026-11"], selectedWeek: "all" }), "2026.09.01 ~ 2026.09.30, 2026.11.01 ~ 2026.11.30");
assert.equal(periodText({ rows, selectedMonth: ["2026-09", "2026-10"], selectedWeek: "all" }), "2026.09.01 ~ 2026.10.31");
assert.equal(periodText({ rows, selectedMonth: "2026-10", selectedWeek: ["2026-09-28", "2026-10-05"] }), "2026.10.01 ~ 2026.10.11");
console.log("PASS: six multi-select filters, combined intersections, normal/fast aggregate parity, totals, month/week boundaries, removal, reset and disjoint periods");
