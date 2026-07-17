import assert from "node:assert/strict";

import {
  fetchNaverSearchAdsAdPage,
  fetchNaverSearchAdsEntityDailyStats,
  fetchNaverSearchAdsKeywordDailyStats,
  NaverSearchAdsApiError,
} from "../src/lib/media-sync/naver-searchads-api";

const credentials = {
  customerId: "123456",
  accessLicense: "fixture-access-license",
  secretKey: "fixture-secret-key",
};

type CapturedRequest = {
  url: URL;
  method: string;
  headers: Headers;
};

type QueuedResponse = {
  status?: number;
  body: unknown;
};

const originalFetch = globalThis.fetch;
const requests: CapturedRequest[] = [];
const responses: QueuedResponse[] = [];

function queueJson(
  body: unknown,
  status = 200,
): void {
  responses.push({
    status,
    body,
  });
}

function createStatsResponse(input: {
  dateFrom: string;
  dateTo: string;
  records: Array<{
    date: string;
    impCnt: number | null;
    clkCnt: number | null;
    salesAmt: number | null;
    ccnt: number | null;
    convAmt: number | null;
    avgRnk?: number | null;
  }>;
}): unknown {
  return {
    compTm: "2026-07-13T00:00:00.000Z",
    cycleBaseTm: "2026-07-13T00:00:00.000Z",
    summary: {
      dateStart: input.dateFrom,
      dateEnd: input.dateTo,
    },
    data: input.records.map((record) => ({
      dateStart: record.date,
      dateEnd: record.date,
      impCnt: record.impCnt,
      clkCnt: record.clkCnt,
      salesAmt: record.salesAmt,
      ccnt: record.ccnt,
      convAmt: record.convAmt,
      ...(Object.prototype.hasOwnProperty.call(
        record,
        "avgRnk",
      )
        ? {
            avgRnk: record.avgRnk,
          }
        : {}),
    })),
  };
}

async function expectApiError(
  operation: () => Promise<unknown>,
  expectedCode: NaverSearchAdsApiError["code"],
): Promise<void> {
  await assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof NaverSearchAdsApiError &&
      error.code === expectedCode,
  );
}

async function main(): Promise<void> {
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = responses.shift();

    if (!response) {
      throw new Error(
        "Fixture fetch received an unexpected request.",
      );
    }

    const url =
      input instanceof Request
        ? new URL(input.url)
        : new URL(input.toString());

    const headers = new Headers(
      input instanceof Request
        ? input.headers
        : init?.headers,
    );

    requests.push({
      url,
      method:
        input instanceof Request
          ? input.method
          : init?.method ?? "GET",
      headers,
    });

    return new Response(
      JSON.stringify(response.body),
      {
        status: response.status ?? 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  try {
    queueJson([
      {
        nccAdId:
          "nad-a001-02-000000000000001",
        nccAdgroupId:
          "grp-a001-02-000000000000001",
        type: "SHOPPING_PRODUCT_AD",
        inspectStatus: "APPROVED",
        status: "ELIGIBLE",
        statusReason: "ELIGIBLE",
        userLock: false,
        referenceKey: "1234567890",
      },
      {
        nccAdId:
          "nad-a001-02-000000000000002",
        nccAdgroupId:
          "grp-a001-02-000000000000001",
        type: "SHOPPING_PRODUCT_AD",
        inspectStatus: "APPROVED",
        status: "ELIGIBLE",
        statusReason: "ELIGIBLE",
        userLock: false,
        referenceKey: "0987654321",
      },
    ]);

    const adPage =
      await fetchNaverSearchAdsAdPage({
        credentials,
        adgroupId:
          "grp-a001-02-000000000000001",
        recordSize: 100,
        selector: "NEXT",
      });

    assert.equal(adPage.records.length, 2);
    assert.equal(
      adPage.records[0]?.id,
      "nad-a001-02-000000000000001",
    );
    assert.equal(
      adPage.records[0]?.type,
      "SHOPPING_PRODUCT_AD",
    );
    assert.equal(
      adPage.records[0]?.referenceKey,
      "1234567890",
    );

    const adRequest = requests.at(-1);

    assert.ok(adRequest);
    assert.equal(
      adRequest.url.pathname,
      "/ncc/ads",
    );
    assert.equal(
      adRequest.url.searchParams.get(
        "nccAdgroupId",
      ),
      "grp-a001-02-000000000000001",
    );
    assert.equal(
      adRequest.url.searchParams.get(
        "recordSize",
      ),
      "100",
    );
    assert.equal(
      adRequest.url.searchParams.get(
        "selector",
      ),
      "NEXT",
    );

    queueJson([
      {
        nccAdId:
          "nad-a001-02-000000000000003",
        nccAdgroupId:
          "grp-a001-02-000000000000999",
        type: "SHOPPING_PRODUCT_AD",
        inspectStatus: "APPROVED",
        status: "ELIGIBLE",
        statusReason: "ELIGIBLE",
        userLock: false,
        referenceKey: "1111111111",
      },
    ]);

    await expectApiError(
      () =>
        fetchNaverSearchAdsAdPage({
          credentials,
          adgroupId:
            "grp-a001-02-000000000000001",
        }),
      "INVALID_RESPONSE",
    );

    for (
      const entityType
      of [
        "campaign",
        "adgroup",
        "ad",
      ] as const
    ) {
      const entityId =
        entityType === "campaign"
          ? "cmp-a001-02-000000010549559"
          : entityType === "adgroup"
            ? "grp-a001-02-000000000000001"
            : "nad-a001-02-000000000000001";

      queueJson(
        createStatsResponse({
          dateFrom: "2026-05-01",
          dateTo: "2026-05-02",
          records: [
            {
              date: "2026-05-01",
              impCnt: 1_000,
              clkCnt: 20,
              salesAmt: 10_000,
              ccnt: 2,
              convAmt: 30_000,
            },
            {
              date: "2026-05-02",
              impCnt: 2_257,
              clkCnt: 63,
              salesAmt: 20_000,
              ccnt: 3,
              convAmt: 40_000,
            },
          ],
        }),
      );

      const stats =
        await fetchNaverSearchAdsEntityDailyStats({
          credentials,
          entityId,
          entityType,
          dateFrom: "2026-05-01",
          dateTo: "2026-05-02",
        });

      assert.equal(stats.entityId, entityId);
      assert.equal(
        stats.entityType,
        entityType,
      );
      assert.equal(stats.records.length, 2);
      assert.equal(
        stats.records[0]?.entityId,
        entityId,
      );
      assert.equal(
        stats.records[1]?.impCnt,
        2_257,
      );

      const statsRequest = requests.at(-1);

      assert.ok(statsRequest);
      assert.equal(
        statsRequest.url.pathname,
        "/stats",
      );
      assert.equal(
        statsRequest.url.searchParams.get("id"),
        entityId,
      );
      assert.equal(
        statsRequest.url.searchParams.get(
          "timeIncrement",
        ),
        "1",
      );
      assert.deepEqual(
        JSON.parse(
          statsRequest.url.searchParams.get(
            "fields",
          ) ?? "null",
        ),
        [
          "impCnt",
          "clkCnt",
          "salesAmt",
          "ccnt",
          "convAmt",
        ],
      );
    }

    queueJson(
      createStatsResponse({
        dateFrom: "2026-05-01",
        dateTo: "2026-05-02",
        records: [
          {
            date: "2026-05-01",
            impCnt: 100,
            clkCnt: 10,
            salesAmt: 1_000,
            ccnt: 1,
            convAmt: 2_000,
            avgRnk: 1.5,
          },
          {
            date: "2026-05-02",
            impCnt: 200,
            clkCnt: 20,
            salesAmt: 2_000,
            ccnt: 2,
            convAmt: 4_000,
            avgRnk: 2.5,
          },
        ],
      }),
    );

    const keywordStats =
      await fetchNaverSearchAdsKeywordDailyStats({
        credentials,
        keywordId:
          "nkw-a001-01-000000000000001",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-02",
      });

    assert.equal(
      keywordStats.records[0]?.avgRnk,
      1.5,
    );

    const keywordRequest =
      requests.at(-1);

    assert.ok(keywordRequest);
    assert.deepEqual(
      JSON.parse(
        keywordRequest.url.searchParams.get(
          "fields",
        ) ?? "null",
      ),
      [
        "impCnt",
        "clkCnt",
        "salesAmt",
        "ccnt",
        "convAmt",
        "avgRnk",
      ],
    );

    queueJson(
      createStatsResponse({
        dateFrom: "2026-05-01",
        dateTo: "2026-05-02",
        records: [
          {
            date: "2026-05-01",
            impCnt: 1,
            clkCnt: 1,
            salesAmt: 1,
            ccnt: 1,
            convAmt: 1,
          },
          {
            date: "2026-05-01",
            impCnt: 2,
            clkCnt: 2,
            salesAmt: 2,
            ccnt: 2,
            convAmt: 2,
          },
        ],
      }),
    );

    await expectApiError(
      () =>
        fetchNaverSearchAdsEntityDailyStats({
          credentials,
          entityId:
            "cmp-a001-02-000000010549559",
          entityType: "campaign",
          dateFrom: "2026-05-01",
          dateTo: "2026-05-02",
        }),
      "INVALID_RESPONSE",
    );

    assert.equal(
      responses.length,
      0,
      "All queued fixture responses must be consumed.",
    );

    console.log(
      "verified /ncc/ads page contract: true",
    );
    console.log(
      "verified adgroup scope mismatch rejection: true",
    );
    console.log(
      "verified campaign entity daily stats: true",
    );
    console.log(
      "verified adgroup entity daily stats: true",
    );
    console.log(
      "verified ad entity daily stats: true",
    );
    console.log(
      "verified legacy keyword stats contract unchanged: true",
    );
    console.log(
      "verified duplicate daily stats rejection: true",
    );
    console.log(
      "fixture uses real Naver API: false",
    );
    console.log(
      "fixture uses database: false",
    );
    console.log(
      "fixture writes staging: false",
    );
    console.log(
      "fixture writes report_rows: false",
    );
    console.log(
      "fixture changes report pointers: false",
    );
    console.log(
      "verification passed: true",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error: unknown) => {
  console.error(
    "Naver Search Ads entity API fixture failed.",
    error,
  );
  process.exitCode = 1;
});
