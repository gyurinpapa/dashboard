// scripts/verify-report-template-representative-row-selection.ts
//
// Pure synthetic regression fixture.
// - no browser rendering
// - no provider API requests
// - no database connection or writes
// - executes ReportTemplate's actual representative-row contract

import assert from "node:assert/strict";

import {
  buildRowLevelBuckets,
} from "../app/components/ReportTemplate";

type FixtureRow = Record<string, unknown> & {
  id: string;
};

type MetricTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

const SHOPPING_REASON =
  "naver_searchad_shopping_ad_daily_stats";

const BRAND_SEARCH_REASON =
  "naver_searchad_brand_search_adgroup_daily_stats";

const REGISTERED_KEYWORD_REASON =
  "naver_searchad_registered_keyword_daily_stats";

const GENERAL_SEARCH_CREATIVE_REASON =
  "naver_searchad_registered_keyword_creative_daily_stats";

function representativeRows(
  rows: FixtureRow[],
): FixtureRow[] {
  return buildRowLevelBuckets(
    rows,
  ).representativeRows as FixtureRow[];
}

function rowIds(
  rows: FixtureRow[],
): string[] {
  return rows.map(
    (row) =>
      row.id,
  );
}

function sumMetrics(
  rows: FixtureRow[],
): MetricTotals {
  return rows.reduce<MetricTotals>(
    (
      totals,
      row,
    ) => ({
      impressions:
        totals.impressions +
        Number(row.impressions ?? 0),
      clicks:
        totals.clicks +
        Number(row.clicks ?? 0),
      cost:
        totals.cost +
        Number(row.cost ?? 0),
      conversions:
        totals.conversions +
        Number(row.conversions ?? 0),
      revenue:
        totals.revenue +
        Number(row.revenue ?? 0),
    }),
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      revenue: 0,
    },
  );
}

function createSearchCreative(
  id: string,
  patch: Partial<FixtureRow> = {},
): FixtureRow {
  return {
    id,
    provider:
      "naver_searchad",
    channel:
      "검색광고",
    row_level:
      "creative",
    data_level:
      "creative",
    row_level_reason:
      GENERAL_SEARCH_CREATIVE_REASON,
    keyword:
      `${id}-keyword`,
    creative:
      `${id}-creative`,
    impressions:
      1,
    clicks:
      1,
    cost:
      1,
    conversions:
      1,
    revenue:
      1,
    ...patch,
  };
}

function assertIncluded(
  name: string,
  row: FixtureRow,
): void {
  assert.deepEqual(
    rowIds(
      representativeRows([
        row,
      ]),
    ),
    [
      row.id,
    ],
    `${name}: representative inclusion changed.`,
  );
}

function assertExcluded(
  name: string,
  row: FixtureRow,
): void {
  assert.deepEqual(
    representativeRows([
      row,
    ]),
    [],
    `${name}: representative exclusion changed.`,
  );
}

function verifyCreativeContracts(): void {
  assertExcluded(
    "general search-ad creative",
    createSearchCreative(
      "general-search-creative",
    ),
  );

  assertIncluded(
    "display creative",
    {
      ...createSearchCreative(
        "display-creative",
      ),
      provider:
        "meta_ads",
      channel:
        "디스플레이광고",
      row_level_reason:
        "meta_ads_creative_daily_stats",
    },
  );

  const shopping =
    createSearchCreative(
      "naver-shopping-authoritative",
      {
        row_level_reason:
          SHOPPING_REASON,
      },
    );

  assertIncluded(
    "exact Naver SHOPPING authoritative creative",
    shopping,
  );

  const nearMatches = [
    {
      name:
        "different provider",
      row: {
        ...shopping,
        id:
          "shopping-near-provider",
        provider:
          "google_ads",
      },
    },
    {
      name:
        "different row-level reason",
      row: {
        ...shopping,
        id:
          "shopping-near-reason",
        row_level_reason:
          REGISTERED_KEYWORD_REASON,
      },
    },
    {
      name:
        "different data level",
      row: {
        ...shopping,
        id:
          "shopping-near-data-level",
        data_level:
          "keyword",
      },
    },
    {
      name:
        "ordinary search-ad creative",
      row:
        createSearchCreative(
          "ordinary-search-creative",
        ),
    },
  ];

  for (
    const fixture of
      nearMatches
  ) {
    assertExcluded(
      fixture.name,
      fixture.row,
    );
  }
}

function verifyMixedAndLegacyContracts(): void {
  assertIncluded(
    "Naver BRAND_SEARCH mixed",
    {
      id:
        "naver-brand-search-mixed",
      provider:
        "naver_searchad",
      channel:
        "검색광고",
      row_level:
        "mixed",
      data_level:
        "mixed",
      row_level_reason:
        BRAND_SEARCH_REASON,
      keyword:
        "brand-search",
      creative:
        "brand-search-group",
    },
  );

  const legacyCases = [
    {
      name:
        "legacy CSV keyword",
      row: {
        id:
          "legacy-csv-keyword",
        channel:
          "검색광고",
        keyword:
          "legacy-keyword",
      },
      included:
        true,
    },
    {
      name:
        "legacy display creative",
      row: {
        id:
          "legacy-display-creative",
        channel:
          "디스플레이광고",
        creative:
          "legacy-banner",
      },
      included:
        true,
    },
    {
      name:
        "legacy unknown",
      row: {
        id:
          "legacy-unknown",
        source:
          "legacy-csv",
      },
      included:
        true,
    },
    {
      name:
        "legacy search creative-only",
      row: {
        id:
          "legacy-search-creative-only",
        channel:
          "검색광고",
        creative:
          "legacy-search-creative",
      },
      included:
        false,
    },
  ] as const;

  for (
    const fixture of
      legacyCases
  ) {
    if (fixture.included) {
      assertIncluded(
        fixture.name,
        fixture.row,
      );
      continue;
    }

    assertExcluded(
      fixture.name,
      fixture.row,
    );
  }
}

function verifyCurrentCombinedTotals(): void {
  const rows: FixtureRow[] = [
    {
      id:
        "combined-keyword",
      provider:
        "naver_searchad",
      channel:
        "검색광고",
      row_level:
        "keyword",
      data_level:
        "keyword",
      row_level_reason:
        REGISTERED_KEYWORD_REASON,
      keyword:
        "registered-keyword",
    },
    createSearchCreative(
      "combined-general-search-creative",
      {
        impressions:
          99_999,
        clicks:
          99_999,
        cost:
          99_999,
        conversions:
          99_999,
        revenue:
          99_999,
      },
    ),
    createSearchCreative(
      "combined-shopping",
      {
        row_level_reason:
          SHOPPING_REASON,
        impressions:
          4_333,
        clicks:
          85,
        cost:
          113_850,
        conversions:
          2,
        revenue:
          5_090_000,
      },
    ),
    createSearchCreative(
      "combined-shopping-near-match",
      {
        data_level:
          "keyword",
        row_level_reason:
          SHOPPING_REASON,
        impressions:
          88_888,
        clicks:
          88_888,
        cost:
          88_888,
        conversions:
          88_888,
        revenue:
          88_888,
      },
    ),
    {
      id:
        "combined-brand-search",
      provider:
        "naver_searchad",
      channel:
        "검색광고",
      row_level:
        "mixed",
      data_level:
        "mixed",
      row_level_reason:
        BRAND_SEARCH_REASON,
      keyword:
        "brand-search",
      creative:
        "brand-search-group",
      impressions:
        2_742,
      clicks:
        1_098,
      cost:
        0,
      conversions:
        65,
      revenue:
        7_639_300,
    },
  ];

  const selected =
    representativeRows(
      rows,
    );

  assert.deepEqual(
    rowIds(selected),
    [
      "combined-keyword",
      "combined-shopping",
      "combined-brand-search",
    ],
  );

  assert.deepEqual(
    sumMetrics(selected),
    {
      impressions:
        7_075,
      clicks:
        1_183,
      cost:
        113_850,
      conversions:
        67,
      revenue:
        12_729_300,
    },
  );
}

function main(): void {
  verifyCreativeContracts();
  verifyMixedAndLegacyContracts();
  verifyCurrentCombinedTotals();

  console.log(
    "general search-ad creative excluded: true",
  );
  console.log(
    "display creative included: true",
  );
  console.log(
    "exact Naver SHOPPING authoritative creative included: true",
  );
  console.log(
    "SHOPPING near-matches rejected: true",
  );
  console.log(
    "BRAND_SEARCH mixed included: true",
  );
  console.log(
    "combined totals: 7075 / 1183 / 113850 / 67 / 12729300",
  );
  console.log(
    "CSV/display/legacy unknown behavior preserved: true",
  );
  console.log(
    "verification passed: true",
  );
}

try {
  main();
} catch (error) {
  console.error(
    "ReportTemplate representative-row verification failed:",
    error,
  );
  process.exitCode =
    1;
}