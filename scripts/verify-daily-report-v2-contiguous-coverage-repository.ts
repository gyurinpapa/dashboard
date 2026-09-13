import assert from "node:assert/strict";


const REPORT_ID =
  "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";

const ADVERTISER_ID =
  "33333333-3333-4333-8333-333333333333";

const START_DATE =
  "2026-09-01";

const THROUGH_DATE =
  "2026-09-04";

function createReport(
  automationStart =
    START_DATE,
  identityStart =
    START_DATE,
) {
  return {
    id:
      REPORT_ID,
    workspace_id:
      WORKSPACE_ID,
    advertiser_id:
      ADVERTISER_ID,
    meta: {
      public_identity: {
        source_type:
          "api",
        period_type:
          "daily_sync",
        period_key:
          identityStart,
      },
      media_sync: {
        auto_sync: {
          enabled:
            true,
          contract:
            "daily_report_v2",
          start_date:
            automationStart,
          scope:
            "all_mapped_supported_media",
        },
      },
    },
  };
}

function createConnection(
  input: {
    id:
      string;
    provider:
      "naver_searchad" |
      "google_ads" |
      "meta_ads";
    externalAccountId:
      string;
    status?:
      string;
  },
) {
  return {
    id:
      input.id,
    workspace_id:
      WORKSPACE_ID,
    advertiser_id:
      ADVERTISER_ID,
    provider:
      input.provider,
    external_account_id:
      input.externalAccountId,
    status:
      input.status ??
      "active",
  } as never;
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fixture-service-role-key";

  const {
    DailyReportV2CoverageRepositoryError,
    loadDailyReportV2ContiguousCoverage,
  } = await import(
    "../src/lib/media-sync/daily-report-v2-contiguous-coverage-repository"
  );

  const partitionCalls:
    Array<{
      provider:
        string;
      externalAccountId:
        string;
      offset:
        number;
      limit:
        number;
    }> =
      [];

  const connections =
    new Map(
      [
        [
          "naver-connection",
          createConnection({
            id:
              "naver-connection",
            provider:
              "naver_searchad",
            externalAccountId:
              "naver-account",
          }),
        ],
        [
          "google-connection",
          createConnection({
            id:
              "google-connection",
            provider:
              "google_ads",
            externalAccountId:
              "google-account",
          }),
        ],
        [
          "meta-connection",
          createConnection({
            id:
              "meta-connection",
            provider:
              "meta_ads",
            externalAccountId:
              "meta-account",
          }),
        ],
      ],
    );

  const rowsByProvider =
    new Map<
      string,
      Array<{
        date:
          string;
        row_count:
          number;
      }>
    >([
      [
        "naver_searchad",
        [
          {
            date:
              "2026-09-01",
            row_count:
              5,
          },
          {
            date:
              "2026-09-02",
            row_count:
              0,
          },
          {
            date:
              "2026-09-03",
            row_count:
              7,
          },
          {
            date:
              "2026-09-04",
            row_count:
              3,
          },
        ],
      ],
      [
        "google_ads",
        [
          {
            date:
              "2026-09-01",
            row_count:
              2,
          },
          {
            date:
              "2026-09-02",
            row_count:
              4,
          },
          {
            date:
              "2026-09-04",
            row_count:
              9,
          },
        ],
      ],
    ]);

  const coverage =
    await loadDailyReportV2ContiguousCoverage({
      reportId:
        REPORT_ID,
      workspaceId:
        WORKSPACE_ID,
      advertiserId:
        ADVERTISER_ID,
      throughDate:
        THROUGH_DATE,
      dependencies: {
        loadReport:
          async () => ({
            data:
              createReport(),
            error:
              null,
          }),

        listConnectionIds:
          async () => [
            "meta-connection",
            "google-connection",
            "naver-connection",
          ],

        getConnection:
          async ({
            connectionId,
          }) =>
            connections.get(
              connectionId,
            ) ??
            null,

        loadPartitionPage:
          async (
            input,
          ) => {
            partitionCalls.push({
              provider:
                input.provider,
              externalAccountId:
                input.externalAccountId,
              offset:
                input.offset,
              limit:
                input.limit,
            });

            const all =
              rowsByProvider.get(
                input.provider,
              ) ??
              [];

            return {
              data:
                all.slice(
                  input.offset,
                  input.offset +
                    input.limit,
                ),
              error:
                null,
            };
          },
      },
    });

  assert.equal(
    coverage.startDate,
    START_DATE,
  );

  assert.equal(
    coverage.throughDate,
    THROUGH_DATE,
  );

  assert.equal(
    coverage.participants.length,
    2,
  );

  assert.deepEqual(
    coverage.participants.map(
      (
        participant,
      ) =>
        participant.provider,
    ),
    [
      "google_ads",
      "naver_searchad",
    ],
  );

  const google =
    coverage.participants.find(
      (
        participant,
      ) =>
        participant.provider ===
        "google_ads",
    );

  const naver =
    coverage.participants.find(
      (
        participant,
      ) =>
        participant.provider ===
        "naver_searchad",
    );

  assert.ok(
    google,
  );

  assert.ok(
    naver,
  );

  assert.equal(
    google.completedThrough,
    "2026-09-02",
  );

  assert.equal(
    google.firstMissingDate,
    "2026-09-03",
  );

  assert.equal(
    google.contiguousDates,
    2,
  );

  assert.equal(
    google.contiguousRows,
    6,
  );

  assert.equal(
    google.targetCovered,
    false,
  );

  assert.equal(
    naver.completedThrough,
    "2026-09-04",
  );

  assert.equal(
    naver.firstMissingDate,
    null,
  );

  assert.equal(
    naver.contiguousDates,
    4,
  );

  /*
   * 2026-09-02 has row_count=0 and still counts as durable coverage.
   */
  assert.equal(
    naver.contiguousRows,
    15,
  );

  assert.equal(
    naver.targetCovered,
    true,
  );

  assert.equal(
    coverage.completedThrough,
    "2026-09-02",
  );

  assert.equal(
    coverage.firstMissingDate,
    "2026-09-03",
  );

  assert.equal(
    coverage.targetCovered,
    false,
  );

  assert.equal(
    partitionCalls.some(
      (
        call,
      ) =>
        call.provider ===
        "meta_ads",
    ),
    false,
  );

  assert.equal(
    partitionCalls.every(
      (
        call,
      ) =>
        call.limit ===
        1_000,
    ),
    true,
  );

  await assert.rejects(
    () =>
      loadDailyReportV2ContiguousCoverage({
        reportId:
          REPORT_ID,
        workspaceId:
          WORKSPACE_ID,
        advertiserId:
          ADVERTISER_ID,
        throughDate:
          THROUGH_DATE,
        dependencies: {
          loadReport:
            async () => ({
              data:
                createReport(
                  "2026-09-02",
                  START_DATE,
                ),
              error:
                null,
            }),
          listConnectionIds:
            async () => [],
          getConnection:
            async () =>
              null,
          loadPartitionPage:
            async () => ({
              data:
                [],
              error:
                null,
            }),
        },
      }),
    (
      error,
    ) =>
      error instanceof
        DailyReportV2CoverageRepositoryError &&
      error.code ===
        "CONTRACT_INVALID",
  );

  await assert.rejects(
    () =>
      loadDailyReportV2ContiguousCoverage({
        reportId:
          REPORT_ID,
        workspaceId:
          WORKSPACE_ID,
        advertiserId:
          ADVERTISER_ID,
        throughDate:
          "2026-08-31",
        dependencies: {
          loadReport:
            async () => ({
              data:
                createReport(),
              error:
                null,
            }),
          listConnectionIds:
            async () => [],
          getConnection:
            async () =>
              null,
          loadPartitionPage:
            async () => ({
              data:
                [],
              error:
                null,
            }),
        },
      }),
    (
      error,
    ) =>
      error instanceof
        DailyReportV2CoverageRepositoryError &&
      error.code ===
        "DATE_RANGE_INVALID",
  );

  await assert.rejects(
    () =>
      loadDailyReportV2ContiguousCoverage({
        reportId:
          REPORT_ID,
        workspaceId:
          WORKSPACE_ID,
        advertiserId:
          ADVERTISER_ID,
        throughDate:
          THROUGH_DATE,
        dependencies: {
          loadReport:
            async () => ({
              data:
                createReport(),
              error:
                null,
            }),
          listConnectionIds:
            async () => [
              "meta-only",
            ],
          getConnection:
            async () =>
              createConnection({
                id:
                  "meta-only",
                provider:
                  "meta_ads",
                externalAccountId:
                  "meta-account",
              }),
          loadPartitionPage:
            async () => ({
              data:
                [],
              error:
                null,
            }),
        },
      }),
    (
      error,
    ) =>
      error instanceof
        DailyReportV2CoverageRepositoryError &&
      error.code ===
        "NO_PARTICIPANTS",
  );

  const noFirstDate =
    await loadDailyReportV2ContiguousCoverage({
      reportId:
        REPORT_ID,
      workspaceId:
        WORKSPACE_ID,
      advertiserId:
        ADVERTISER_ID,
      throughDate:
        THROUGH_DATE,
      dependencies: {
        loadReport:
          async () => ({
            data:
              createReport(),
            error:
              null,
          }),
        listConnectionIds:
          async () => [
            "google-connection",
          ],
        getConnection:
          async () =>
            connections.get(
              "google-connection",
            ) ??
            null,
        loadPartitionPage:
          async () => ({
            data: [
              {
                date:
                  "2026-09-02",
                row_count:
                  4,
              },
            ],
            error:
              null,
          }),
      },
    });

  assert.equal(
    noFirstDate.completedThrough,
    null,
  );

  assert.equal(
    noFirstDate.firstMissingDate,
    START_DATE,
  );

  assert.equal(
    noFirstDate.targetCovered,
    false,
  );

  console.log(
    "D10F_REPORT_CONTRACT_AUTHORITY=PASS",
  );

  console.log(
    "D10F_MAPPED_RUNTIME_FACT_PARTICIPANTS=PASS",
  );

  console.log(
    "D10F_META_RUNTIME_DISABLED_EXCLUDED=PASS",
  );

  console.log(
    "D10F_ZERO_ROW_PARTITION_COUNTS_AS_COVERAGE=PASS",
  );

  console.log(
    "D10F_PROVIDER_CONTIGUOUS_THROUGH=PASS",
  );

  console.log(
    "D10F_REPORT_MIN_COMPLETED_THROUGH=PASS",
  );

  console.log(
    "D10F_FIRST_GAP_FAIL_CLOSED=PASS",
  );

  console.log(
    "D10F_OFFLINE_SEMANTIC_FIXTURE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "LIVE_PROVIDER_API_CALLS=0",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
