import {
  convertNaverKeywordDailyStatsToCanonicalRows,
  NaverSearchAdsCanonicalRowError,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import type {
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
} from "../src/lib/media-sync/naver-searchads-api";

type VerificationCase = {
  name: string;
  run: () => void;
};

const CAMPAIGN_FIXTURE:
  NaverSearchAdsCampaignRecord = {
    id: "cmp-001",
    name: "브랜드 캠페인",
    campaignType: "WEB_SITE",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const ADGROUP_FIXTURE:
  NaverSearchAdsAdgroupRecord = {
    id: "grp-001",
    campaignId:
      CAMPAIGN_FIXTURE.id,
    name: "브랜드 광고그룹",
    adgroupType: "WEB_SITE",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const KEYWORD_FIXTURE:
  NaverSearchAdsKeywordRecord = {
    id: "kwd-001",
    adgroupId:
      ADGROUP_FIXTURE.id,
    keyword: "테스트 키워드",
    inspectStatus: "APPROVED",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
    bidAmount: 500,
    useGroupBidAmount: false,
  };

const STATS_FIXTURE:
  NaverSearchAdsKeywordDailyStatsResult = {
    keywordId:
      KEYWORD_FIXTURE.id,
    dateFrom: "2026-06-01",
    dateTo: "2026-06-03",
    records: [
      {
        keywordId:
          KEYWORD_FIXTURE.id,
        date: "2026-06-03",
        periodStart: "2026-06-03",
        periodEnd: "2026-06-03",
        impCnt: null,
        clkCnt: null,
        salesAmt: null,
        ccnt: null,
        convAmt: null,
        avgRnk: null,
      },
      {
        keywordId:
          KEYWORD_FIXTURE.id,
        date: "2026-06-01",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-01",
        impCnt: 1000,
        clkCnt: 50,
        salesAmt: 25000,
        ccnt: 4,
        convAmt: 120000,
        avgRnk: 2.3,
      },
      {
        keywordId:
          KEYWORD_FIXTURE.id,
        date: "2026-06-02",
        periodStart: "2026-06-02",
        periodEnd: "2026-06-02",
        impCnt: 500,
        clkCnt: 20,
        salesAmt: 10000,
        ccnt: 1,
        convAmt: 30000,
        avgRnk: 3.1,
      },
    ],
  };

function cloneFixture<T>(
  value: T,
): T {
  return structuredClone(value);
}

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function assertJsonEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson =
    JSON.stringify(actual);

  const expectedJson =
    JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}: expected=${expectedJson} actual=${actualJson}`,
    );
  }
}

function expectCanonicalError(
  expectedCode:
    NaverSearchAdsCanonicalRowError["code"],
  callback: () => void,
): void {
  try {
    callback();
  } catch (error) {
    assertTrue(
      error instanceof
        NaverSearchAdsCanonicalRowError,
      "Expected NaverSearchAdsCanonicalRowError.",
    );

    assertEqual(
      error.code,
      expectedCode,
      "Unexpected canonical error code",
    );

    return;
  }

  throw new Error(
    `Expected canonical conversion to throw ${expectedCode}.`,
  );
}

const verificationCases:
  VerificationCase[] = [
    {
      name:
        "maps hierarchy and daily metrics to canonical rows",
      run: () => {
        const rows =
          convertNaverKeywordDailyStatsToCanonicalRows({
            externalAccountId:
              "customer-001",
            campaign:
              cloneFixture(
                CAMPAIGN_FIXTURE,
              ),
            adgroup:
              cloneFixture(
                ADGROUP_FIXTURE,
              ),
            keyword:
              cloneFixture(
                KEYWORD_FIXTURE,
              ),
            stats:
              cloneFixture(
                STATS_FIXTURE,
              ),
          });

        assertEqual(
          rows.length,
          3,
          "Canonical row count mismatch",
        );

        assertJsonEqual(
          rows.map(
            (row) => row.date,
          ),
          [
            "2026-06-01",
            "2026-06-02",
            "2026-06-03",
          ],
          "Canonical rows must be sorted by date",
        );

        const firstRow =
          rows[0];

        assertTrue(
          firstRow !== undefined,
          "First canonical row is missing.",
        );

        assertEqual(
          firstRow.date,
          "2026-06-01",
          "date mismatch",
        );

        assertEqual(
          firstRow.report_date,
          firstRow.date,
          "report_date mismatch",
        );

        assertEqual(
          firstRow.day,
          firstRow.date,
          "day mismatch",
        );

        assertEqual(
          firstRow.ymd,
          firstRow.date,
          "ymd mismatch",
        );

        assertEqual(
          firstRow.channel,
          "검색광고",
          "channel mismatch",
        );

        assertEqual(
          firstRow.source,
          "네이버 검색광고",
          "source mismatch",
        );

        assertEqual(
          firstRow.platform,
          "네이버",
          "platform mismatch",
        );

        assertEqual(
          firstRow.device,
          "",
          "device mismatch",
        );

        assertEqual(
          firstRow.campaign,
          CAMPAIGN_FIXTURE.name,
          "campaign mismatch",
        );

        assertEqual(
          firstRow.campaign_name,
          CAMPAIGN_FIXTURE.name,
          "campaign_name mismatch",
        );

        assertEqual(
          firstRow.group,
          ADGROUP_FIXTURE.name,
          "group mismatch",
        );

        assertEqual(
          firstRow.group_name,
          ADGROUP_FIXTURE.name,
          "group_name mismatch",
        );

        assertEqual(
          firstRow.adgroup_name,
          ADGROUP_FIXTURE.name,
          "adgroup_name mismatch",
        );

        assertEqual(
          firstRow.keyword,
          KEYWORD_FIXTURE.keyword,
          "keyword mismatch",
        );

        assertEqual(
          firstRow.keyword_name,
          KEYWORD_FIXTURE.keyword,
          "keyword_name mismatch",
        );

        assertEqual(
          firstRow.impressions,
          1000,
          "impressions mismatch",
        );

        assertEqual(
          firstRow.clicks,
          50,
          "clicks mismatch",
        );

        assertEqual(
          firstRow.cost,
          25000,
          "cost mismatch",
        );

        assertEqual(
          firstRow.conversions,
          4,
          "conversions mismatch",
        );

        assertEqual(
          firstRow.revenue,
          120000,
          "revenue mismatch",
        );

        assertEqual(
          firstRow.rank,
          2.3,
          "rank mismatch",
        );

        assertEqual(
          firstRow.row_level,
          "keyword",
          "row_level mismatch",
        );

        assertEqual(
          firstRow.data_level,
          "keyword",
          "data_level mismatch",
        );

        assertEqual(
          firstRow.row_level_reason,
          "naver_searchad_registered_keyword_daily_stats",
          "row_level_reason mismatch",
        );

        assertEqual(
          firstRow.provider,
          "naver_searchad",
          "provider mismatch",
        );

        assertEqual(
          firstRow.ingestion_source,
          "api",
          "ingestion_source mismatch",
        );

        assertEqual(
          firstRow.external_account_id,
          "customer-001",
          "external_account_id mismatch",
        );

        assertEqual(
          firstRow.external_campaign_id,
          CAMPAIGN_FIXTURE.id,
          "external_campaign_id mismatch",
        );

        assertEqual(
          firstRow.external_group_id,
          ADGROUP_FIXTURE.id,
          "external_group_id mismatch",
        );

        assertEqual(
          firstRow.external_keyword_id,
          KEYWORD_FIXTURE.id,
          "external_keyword_id mismatch",
        );
      },
    },
    {
      name:
        "maps nullable Naver metrics to canonical zero values",
      run: () => {
        const rows =
          convertNaverKeywordDailyStatsToCanonicalRows({
            externalAccountId:
              "customer-001",
            campaign:
              cloneFixture(
                CAMPAIGN_FIXTURE,
              ),
            adgroup:
              cloneFixture(
                ADGROUP_FIXTURE,
              ),
            keyword:
              cloneFixture(
                KEYWORD_FIXTURE,
              ),
            stats:
              cloneFixture(
                STATS_FIXTURE,
              ),
          });

        const nullMetricRow =
          rows.find(
            (row) =>
              row.date ===
              "2026-06-03",
          );

        assertTrue(
          nullMetricRow !== undefined,
          "Null metric canonical row is missing.",
        );

        assertEqual(
          nullMetricRow.impressions,
          0,
          "Null impCnt must map to zero",
        );

        assertEqual(
          nullMetricRow.clicks,
          0,
          "Null clkCnt must map to zero",
        );

        assertEqual(
          nullMetricRow.cost,
          0,
          "Null salesAmt must map to zero",
        );

        assertEqual(
          nullMetricRow.conversions,
          0,
          "Null ccnt must map to zero",
        );

        assertEqual(
          nullMetricRow.revenue,
          0,
          "Null convAmt must map to zero",
        );

        assertEqual(
          nullMetricRow.rank,
          0,
          "Null avgRnk must map to zero",
        );
      },
    },
    {
      name:
        "supports explicit canonical dimension overrides",
      run: () => {
        const rows =
          convertNaverKeywordDailyStatsToCanonicalRows({
            externalAccountId:
              "customer-001",
            campaign:
              cloneFixture(
                CAMPAIGN_FIXTURE,
              ),
            adgroup:
              cloneFixture(
                ADGROUP_FIXTURE,
              ),
            keyword:
              cloneFixture(
                KEYWORD_FIXTURE,
              ),
            stats:
              cloneFixture(
                STATS_FIXTURE,
              ),
            dimensions: {
              channel:
                "custom-channel",
              source:
                "custom-source",
              platform:
                "custom-platform",
              device:
                "all",
            },
          });

        const firstRow =
          rows[0];

        assertTrue(
          firstRow !== undefined,
          "Canonical row is missing.",
        );

        assertEqual(
          firstRow.channel,
          "custom-channel",
          "channel override mismatch",
        );

        assertEqual(
          firstRow.source,
          "custom-source",
          "source override mismatch",
        );

        assertEqual(
          firstRow.platform,
          "custom-platform",
          "platform override mismatch",
        );

        assertEqual(
          firstRow.device,
          "all",
          "device override mismatch",
        );
      },
    },
    {
      name:
        "rejects campaign and adgroup scope mismatch",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverKeywordDailyStatsToCanonicalRows({
              externalAccountId:
                "customer-001",
              campaign:
                cloneFixture(
                  CAMPAIGN_FIXTURE,
                ),
              adgroup: {
                ...cloneFixture(
                  ADGROUP_FIXTURE,
                ),
                campaignId:
                  "different-campaign",
              },
              keyword:
                cloneFixture(
                  KEYWORD_FIXTURE,
                ),
              stats:
                cloneFixture(
                  STATS_FIXTURE,
                ),
            });
          },
        );
      },
    },
    {
      name:
        "rejects keyword and stats scope mismatch",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverKeywordDailyStatsToCanonicalRows({
              externalAccountId:
                "customer-001",
              campaign:
                cloneFixture(
                  CAMPAIGN_FIXTURE,
                ),
              adgroup:
                cloneFixture(
                  ADGROUP_FIXTURE,
                ),
              keyword:
                cloneFixture(
                  KEYWORD_FIXTURE,
                ),
              stats: {
                ...cloneFixture(
                  STATS_FIXTURE,
                ),
                keywordId:
                  "different-keyword",
              },
            });
          },
        );
      },
    },
    {
      name:
        "rejects duplicate keyword dates",
      run: () => {
        const stats =
          cloneFixture(
            STATS_FIXTURE,
          );

        const duplicateRecord =
          cloneFixture(
            stats.records[0],
          );

        assertTrue(
          duplicateRecord !== undefined,
          "Duplicate fixture source is missing.",
        );

        stats.records.push(
          duplicateRecord,
        );

        expectCanonicalError(
          "DUPLICATE_DATE",
          () => {
            convertNaverKeywordDailyStatsToCanonicalRows({
              externalAccountId:
                "customer-001",
              campaign:
                cloneFixture(
                  CAMPAIGN_FIXTURE,
                ),
              adgroup:
                cloneFixture(
                  ADGROUP_FIXTURE,
                ),
              keyword:
                cloneFixture(
                  KEYWORD_FIXTURE,
                ),
              stats,
            });
          },
        );
      },
    },
    {
      name:
        "rejects invalid negative metrics",
      run: () => {
        const stats =
          cloneFixture(
            STATS_FIXTURE,
          );

        const firstRecord =
          stats.records[0];

        assertTrue(
          firstRecord !== undefined,
          "Metric fixture source is missing.",
        );

        firstRecord.salesAmt = -1;

        expectCanonicalError(
          "INVALID_STATS_RECORD",
          () => {
            convertNaverKeywordDailyStatsToCanonicalRows({
              externalAccountId:
                "customer-001",
              campaign:
                cloneFixture(
                  CAMPAIGN_FIXTURE,
                ),
              adgroup:
                cloneFixture(
                  ADGROUP_FIXTURE,
                ),
              keyword:
                cloneFixture(
                  KEYWORD_FIXTURE,
                ),
              stats,
            });
          },
        );
      },
    },
    {
      name:
        "does not mutate hierarchy or stats inputs",
      run: () => {
        const campaign =
          cloneFixture(
            CAMPAIGN_FIXTURE,
          );

        const adgroup =
          cloneFixture(
            ADGROUP_FIXTURE,
          );

        const keyword =
          cloneFixture(
            KEYWORD_FIXTURE,
          );

        const stats =
          cloneFixture(
            STATS_FIXTURE,
          );

        const before =
          JSON.stringify({
            campaign,
            adgroup,
            keyword,
            stats,
          });

        convertNaverKeywordDailyStatsToCanonicalRows({
          externalAccountId:
            "customer-001",
          campaign,
          adgroup,
          keyword,
          stats,
        });

        const after =
          JSON.stringify({
            campaign,
            adgroup,
            keyword,
            stats,
          });

        assertEqual(
          after,
          before,
          "Converter mutated its input",
        );
      },
    },
  ];

function main(): void {
  let passedCount = 0;
  let failedCount = 0;

  for (
    const verificationCase
    of verificationCases
  ) {
    try {
      verificationCase.run();
      passedCount += 1;

      console.log(
        `verification case passed: ${verificationCase.name}`,
      );
    } catch (error) {
      failedCount += 1;

      console.error(
        `verification case failed: ${verificationCase.name}`,
      );

      console.error(
        error instanceof Error
          ? {
              name:
                error.name,
              message:
                error.message,
            }
          : {
              value:
                String(error),
            },
      );
    }
  }

  const verificationPassed =
    failedCount === 0 &&
    passedCount ===
      verificationCases.length;

  console.log(
    `verification tests attempted: ${verificationCases.length}`,
  );

  console.log(
    `verification tests passed: ${passedCount}`,
  );

  console.log(
    `verification tests failed: ${failedCount}`,
  );

  console.log(
    `verification uses real Naver API: false`,
  );

  console.log(
    `verification uses database: false`,
  );

  console.log(
    `verification writes report_rows: false`,
  );

  console.log(
    `verification creates snapshot: false`,
  );

  console.log(
    `verification modifies CSV worker: false`,
  );

  console.log(
    `verification passed: ${verificationPassed}`,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

main();
