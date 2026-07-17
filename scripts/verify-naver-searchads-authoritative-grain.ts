import {
  NaverSearchAdsAuthoritativeGrainError,
  assertUniqueNaverSearchAdsCampaignSelections,
  resolveNaverExternalProductCollectionPolicy,
  resolveNaverSearchAdsCampaignCollectionContract,
  selectNaverSearchAdsAuthoritativeValue,
  type NaverSearchAdsAuthoritativeGrain,
  type NaverSearchAdsAuthoritativeSelection,
  type NaverSearchAdsGrainValues,
} from "../src/lib/media-sync/naver-searchads-authoritative-grain";

type VerificationCase = {
  name: string;
  run: () => void;
};

type Metrics = {
  impressions: number;
  clicks: number;
};

type CampaignParityFixture = {
  campaignId: string;
  campaignName: string;
  campaignType:
    | "WEB_SITE"
    | "SHOPPING"
    | "BRAND_SEARCH";
  expectedGrain:
    NaverSearchAdsAuthoritativeGrain;
  expected: Metrics;
  valuesByGrain:
    NaverSearchAdsGrainValues<Metrics>;
};

const SEARCH_ADS_PARITY_FIXTURES:
  readonly CampaignParityFixture[] = [
    {
      campaignId:
        "cmp-a001-02-000000010549559",
      campaignName:
        "Shopping MO",
      campaignType:
        "SHOPPING",
      expectedGrain:
        "ad",
      expected: {
        impressions:
          3_257,
        clicks:
          83,
      },
      valuesByGrain: {
        adgroup: {
          impressions:
            3_257,
          clicks:
            83,
        },
        keyword: {
          impressions:
            0,
          clicks:
            0,
        },
        ad: {
          impressions:
            3_257,
          clicks:
            83,
        },
      },
    },
    {
      campaignId:
        "cmp-a001-04-000000005653958",
      campaignName:
        "브랜드검색",
      campaignType:
        "BRAND_SEARCH",
      expectedGrain:
        "adgroup",
      expected: {
        impressions:
          2_742,
        clicks:
          1_098,
      },
      valuesByGrain: {
        adgroup: {
          impressions:
            2_742,
          clicks:
            1_098,
        },
        keyword: {
          impressions:
            2_632,
          clicks:
            1_092,
        },
        ad: {
          impressions:
            0,
          clicks:
            0,
        },
      },
    },
    {
      campaignId:
        "cmp-a001-02-000000010549606",
      campaignName:
        "Shopping PC",
      campaignType:
        "SHOPPING",
      expectedGrain:
        "ad",
      expected: {
        impressions:
          1_076,
        clicks:
          2,
      },
      valuesByGrain: {
        adgroup: {
          impressions:
            1_076,
          clicks:
            2,
        },
        keyword: {
          impressions:
            0,
          clicks:
            0,
        },
        ad: {
          impressions:
            1_076,
          clicks:
            2,
        },
      },
    },
  ];

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
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

function assertMetricsEqual(
  actual: Metrics,
  expected: Metrics,
  message: string,
): void {
  assertEqual(
    actual.impressions,
    expected.impressions,
    `${message} impressions`,
  );

  assertEqual(
    actual.clicks,
    expected.clicks,
    `${message} clicks`,
  );
}

function addMetrics(
  left: Metrics,
  right: Metrics,
): Metrics {
  return {
    impressions:
      left.impressions +
      right.impressions,
    clicks:
      left.clicks +
      right.clicks,
  };
}

function sumMetrics(
  values:
    readonly Metrics[],
): Metrics {
  return values.reduce(
    addMetrics,
    {
      impressions:
        0,
      clicks:
        0,
    },
  );
}

function expectContractError(
  expectedCode:
    NaverSearchAdsAuthoritativeGrainError["code"],
  callback: () => void,
): void {
  try {
    callback();
  } catch (error) {
    assertTrue(
      error instanceof
        NaverSearchAdsAuthoritativeGrainError,
      "Expected NaverSearchAdsAuthoritativeGrainError.",
    );

    assertEqual(
      error.code,
      expectedCode,
      "Unexpected authoritative grain error code",
    );

    return;
  }

  throw new Error(
    `Expected ${expectedCode} to be thrown.`,
  );
}

function buildParitySelections():
  NaverSearchAdsAuthoritativeSelection<Metrics>[] {
  return SEARCH_ADS_PARITY_FIXTURES.map(
    (fixture) => {
      const before =
        JSON.stringify(
          fixture.valuesByGrain,
        );

      const selection =
        selectNaverSearchAdsAuthoritativeValue({
          campaignId:
            fixture.campaignId,
          campaignType:
            fixture.campaignType,
          valuesByGrain:
            fixture.valuesByGrain,
        });

      const after =
        JSON.stringify(
          fixture.valuesByGrain,
        );

      assertEqual(
        after,
        before,
        `${fixture.campaignName} input mutation`,
      );

      assertEqual(
        selection.authoritativeGrain,
        fixture.expectedGrain,
        `${fixture.campaignName} grain`,
      );

      assertMetricsEqual(
        selection.value,
        fixture.expected,
        `${fixture.campaignName} metrics`,
      );

      return selection;
    },
  );
}

const verificationCases:
  VerificationCase[] = [
    {
      name:
        "WEB_SITE keeps the existing keyword contract",
      run: () => {
        const contract =
          resolveNaverSearchAdsCampaignCollectionContract(
            "WEB_SITE",
          );

        assertEqual(
          contract.authoritativeGrain,
          "keyword",
          "WEB_SITE grain",
        );

        assertEqual(
          contract.canonicalRowLevel,
          "keyword",
          "WEB_SITE row level",
        );
      },
    },
    {
      name:
        "SHOPPING uses ad as the single authoritative grain",
      run: () => {
        const contract =
          resolveNaverSearchAdsCampaignCollectionContract(
            "SHOPPING",
          );

        assertEqual(
          contract.authoritativeGrain,
          "ad",
          "SHOPPING grain",
        );

        assertEqual(
          contract.canonicalRowLevel,
          "creative",
          "SHOPPING row level",
        );
      },
    },
    {
      name:
        "BRAND_SEARCH uses adgroup as the single authoritative grain",
      run: () => {
        const contract =
          resolveNaverSearchAdsCampaignCollectionContract(
            "BRAND_SEARCH",
          );

        assertEqual(
          contract.authoritativeGrain,
          "adgroup",
          "BRAND_SEARCH grain",
        );

        assertEqual(
          contract.canonicalRowLevel,
          "mixed",
          "BRAND_SEARCH row level",
        );
      },
    },
    {
      name:
        "live parity fixtures select exactly one grain per campaign",
      run: () => {
        const selections =
          buildParitySelections();

        assertUniqueNaverSearchAdsCampaignSelections(
          selections,
        );

        assertEqual(
          selections.length,
          SEARCH_ADS_PARITY_FIXTURES.length,
          "Selection count",
        );

        for (
          const selection
          of selections
        ) {
          assertTrue(
            selection.ignoredGrains.every(
              (grain) =>
                grain !==
                selection.authoritativeGrain,
            ),
            "An authoritative grain was also marked ignored.",
          );
        }
      },
    },
    {
      name:
        "authoritative Search Ads total matches the verified UI total",
      run: () => {
        const selections =
          buildParitySelections();

        const authoritativeTotal =
          sumMetrics(
            selections.map(
              (selection) =>
                selection.value,
            ),
          );

        assertMetricsEqual(
          authoritativeTotal,
          {
            impressions:
              7_075,
            clicks:
              1_183,
          },
          "Authoritative Search Ads total",
        );
      },
    },
    {
      name:
        "keyword-only total reproduces the incomplete legacy snapshot",
      run: () => {
        const keywordOnlyTotal =
          sumMetrics(
            SEARCH_ADS_PARITY_FIXTURES.map(
              (fixture) =>
                fixture.valuesByGrain
                  .keyword ?? {
                    impressions:
                      0,
                    clicks:
                      0,
                  },
            ),
          );

        assertMetricsEqual(
          keywordOnlyTotal,
          {
            impressions:
              2_632,
            clicks:
              1_092,
          },
          "Keyword-only total",
        );

        assertMetricsEqual(
          {
            impressions:
              7_075 -
              keywordOnlyTotal.impressions,
            clicks:
              1_183 -
              keywordOnlyTotal.clicks,
          },
          {
            impressions:
              4_443,
            clicks:
              91,
          },
          "Keyword-only missing amount",
        );
      },
    },
    {
      name:
        "cross-grain values are ignored instead of double-counted",
      run: () => {
        const selections =
          buildParitySelections();

        const authoritativeTotal =
          sumMetrics(
            selections.map(
              (selection) =>
                selection.value,
            ),
          );

        const allProvidedGrainTotal =
          sumMetrics(
            SEARCH_ADS_PARITY_FIXTURES.flatMap(
              (fixture) =>
                Object.values(
                  fixture.valuesByGrain,
                ).filter(
                  (
                    value,
                  ): value is Metrics =>
                    value !==
                    undefined,
                ),
            ),
          );

        assertTrue(
          allProvidedGrainTotal.impressions >
            authoritativeTotal.impressions,
          "Cross-grain impression total was not larger than the authoritative total.",
        );

        assertTrue(
          allProvidedGrainTotal.clicks >
            authoritativeTotal.clicks,
          "Cross-grain click total was not larger than the authoritative total.",
        );
      },
    },
    {
      name:
        "unknown Search Ads campaign types fail closed",
      run: () => {
        expectContractError(
          "UNSUPPORTED_CAMPAIGN_TYPE",
          () => {
            resolveNaverSearchAdsCampaignCollectionContract(
              "PLACE",
            );
          },
        );
      },
    },
    {
      name:
        "missing authoritative grain data is rejected",
      run: () => {
        expectContractError(
          "AUTHORITATIVE_VALUE_MISSING",
          () => {
            selectNaverSearchAdsAuthoritativeValue({
              campaignId:
                "shopping-without-ad",
              campaignType:
                "SHOPPING",
              valuesByGrain: {
                keyword: {
                  impressions:
                    0,
                  clicks:
                    0,
                },
              },
            });
          },
        );
      },
    },
    {
      name:
        "duplicate campaign selections are rejected",
      run: () => {
        const selection =
          selectNaverSearchAdsAuthoritativeValue({
            campaignId:
              "duplicate-campaign",
            campaignType:
              "WEB_SITE",
            valuesByGrain: {
              keyword: {
                impressions:
                  1,
                clicks:
                  1,
              },
            },
          });

        expectContractError(
          "DUPLICATE_CAMPAIGN_SELECTION",
          () => {
            assertUniqueNaverSearchAdsCampaignSelections(
              [
                selection,
                selection,
              ],
            );
          },
        );
      },
    },
    {
      name:
        "ADVoost is excluded from Search Ads collection",
      run: () => {
        const policy =
          resolveNaverExternalProductCollectionPolicy(
            "ADVOOST_SHOPPING",
          );

        assertEqual(
          policy.status,
          "excluded",
          "ADVoost status",
        );

        assertEqual(
          policy.reason,
          "excluded_display_provider",
          "ADVoost exclusion reason",
        );

        assertEqual(
          policy.productFamily,
          "display_ads",
          "ADVoost product family",
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
    "verified SHOPPING grain:",
    "ad",
  );
  console.log(
    "verified BRAND_SEARCH grain:",
    "adgroup",
  );
  console.log(
    "verified WEB_SITE grain:",
    "keyword",
  );
  console.log(
    "verified Search Ads total impressions:",
    7_075,
  );
  console.log(
    "verified Search Ads total clicks:",
    1_183,
  );
  console.log(
    "cross-grain duplicate rows selected:",
    0,
  );
  console.log(
    "ADVoost Search Ads collection:",
    "excluded_display_provider",
  );
  console.log(
    "verification uses real Naver API:",
    false,
  );
  console.log(
    "verification uses database:",
    false,
  );
  console.log(
    "verification writes staging:",
    false,
  );
  console.log(
    "verification writes report_rows:",
    false,
  );
  console.log(
    "verification changes report pointers:",
    false,
  );
  console.log(
    "verification modifies keyword collector:",
    false,
  );
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
    "verification passed:",
    verificationPassed,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

main();
