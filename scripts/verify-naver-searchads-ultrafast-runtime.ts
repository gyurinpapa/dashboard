import {
  deepStrictEqual,
  equal,
  ok,
  rejects,
} from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { NaverSearchAdsCredentials } from "../src/lib/media-sync/connection-credentials";
import {
  fetchNaverSearchAdsStatReportAdgroupDailyStats,
  fetchNaverSearchAdsStatReportKeywordDailyStats,
} from "../src/lib/media-sync/naver-searchads-stat-report-daily-metrics";

const SUCCESS_CREDENTIALS:
  NaverSearchAdsCredentials = {
    customerId:
      "ultrafast-success-customer",
    accessLicense:
      "verification-access-license",
    secretKey:
      "verification-secret-key",
  };

const FAILURE_CREDENTIALS:
  NaverSearchAdsCredentials = {
    customerId:
      "ultrafast-failure-customer",
    accessLicense:
      "verification-access-license",
    secretKey:
      "verification-secret-key",
  };

const CREATE_CREDENTIALS:
  NaverSearchAdsCredentials = {
    customerId:
      "ultrafast-create-customer",
    accessLicense:
      "verification-access-license",
    secretKey:
      "verification-secret-key",
  };

const STAT_DATE =
  "2025-01-01";

const AD_ROW = [
  "20250101",
  "1",
  "cmp-1",
  "grp-1",
  "nkw-1",
  "nad-1",
  "bsn-1",
  "8750",
  "M",
  "10",
  "2",
  "300",
  "25",
  "0",
].join("\t");

const CONVERSION_ROW = [
  "20250101",
  "1",
  "cmp-1",
  "grp-1",
  "nkw-1",
  "nad-1",
  "bsn-1",
  "8750",
  "M",
  "1",
  "1",
  "3",
  "400",
].join("\t");

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(value),
    {
      status,
      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

async function verifySharedReadyCache(): Promise<void> {
  const originalFetch =
    globalThis.fetch;
  let fetchCount = 0;
  let listCount = 0;
  let createCount = 0;
  let nextJobId = 1;
  const reportTypes =
    new Map<number, string>([
      [101, "AD"],
      [102, "AD_CONVERSION"],
    ]);

  globalThis.fetch =
    async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      fetchCount += 1;

      const url = new URL(
        input instanceof Request
          ? input.url
          : input.toString(),
      );

      if (
        url.pathname ===
          "/stat-reports" &&
        init?.method === "GET"
      ) {
        listCount += 1;

        return jsonResponse([
          {
            reportJobId: 101,
            reportTp: "AD",
            statDt:
              STAT_DATE,
            status: "BUILT",
            downloadUrl:
              "https://api.searchad.naver.com/report-download?fileversion=101",
            updateTm:
              "2025-01-02T06:00:00+09:00",
          },
          {
            reportJobId: 102,
            reportTp:
              "AD_CONVERSION",
            statDt:
              STAT_DATE,
            status: "BUILT",
            downloadUrl:
              "https://api.searchad.naver.com/report-download?fileversion=102",
            updateTm:
              "2025-01-02T06:00:00+09:00",
          },
        ]);
      }

      if (
        url.pathname ===
          "/stat-reports" &&
        init?.method === "POST"
      ) {
        createCount += 1;
        const body = JSON.parse(
          String(init.body ?? "{}"),
        ) as {
          reportTp: string;
          statDt: string;
        };
        const reportJobId =
          nextJobId;

        nextJobId += 1;
        reportTypes.set(
          reportJobId,
          body.reportTp,
        );

        return jsonResponse(
          {
            reportJobId,
            reportTp:
              body.reportTp,
            statDt:
              body.statDt,
            status:
              "BUILT",
            downloadUrl:
              `https://api.searchad.naver.com/report-download?fileversion=${reportJobId}`,
            updateTm:
              "2025-01-02T06:00:00+09:00",
          },
          201,
        );
      }

      if (
        url.pathname ===
        "/report-download"
      ) {
        const reportJobId = Number(
          url.searchParams.get(
            "fileversion",
          ),
        );
        const reportType =
          reportTypes.get(
            reportJobId,
          );

        return new Response(
          reportType ===
            "AD_CONVERSION"
            ? CONVERSION_ROW
            : AD_ROW,
          {
            status: 200,
            headers: {
              "content-type":
                "text/tab-separated-values",
            },
          },
        );
      }

      throw new Error(
        `UNEXPECTED_FETCH:${url.pathname}`,
      );
    };

  try {
    const keyword =
      await fetchNaverSearchAdsStatReportKeywordDailyStats({
        credentials:
          SUCCESS_CREDENTIALS,
        keywordId:
          "nkw-1",
        dateFrom:
          STAT_DATE,
        dateTo:
          STAT_DATE,
      });

    const adgroup =
      await fetchNaverSearchAdsStatReportAdgroupDailyStats({
        credentials:
          SUCCESS_CREDENTIALS,
        entityId:
          "grp-1",
        entityType:
          "adgroup",
        dateFrom:
          STAT_DATE,
        dateTo:
          STAT_DATE,
      });

    const missingKeyword =
      await fetchNaverSearchAdsStatReportKeywordDailyStats({
        credentials:
          SUCCESS_CREDENTIALS,
        keywordId:
          "nkw-missing",
        dateFrom:
          STAT_DATE,
        dateTo:
          STAT_DATE,
      });

    equal(fetchCount, 3);
    equal(listCount, 1);
    equal(createCount, 0);
    equal(keyword.records.length, 1);
    equal(adgroup.records.length, 1);
    equal(
      missingKeyword.records.length,
      0,
    );

    deepStrictEqual(
      keyword.records[0],
      {
        keywordId:
          "nkw-1",
        date:
          STAT_DATE,
        periodStart:
          STAT_DATE,
        periodEnd:
          STAT_DATE,
        impCnt:
          10,
        clkCnt:
          2,
        salesAmt:
          300,
        ccnt:
          3,
        convAmt:
          400,
        avgRnk:
          2.5,
      },
    );

    deepStrictEqual(
      adgroup.records[0],
      {
        entityId:
          "grp-1",
        entityType:
          "adgroup",
        date:
          STAT_DATE,
        periodStart:
          STAT_DATE,
        periodEnd:
          STAT_DATE,
        impCnt:
          10,
        clkCnt:
          2,
        salesAmt:
          300,
        ccnt:
          3,
        convAmt:
          400,
      },
    );
  } finally {
    globalThis.fetch =
      originalFetch;
  }
}

async function verifyFailedCacheCooldown(): Promise<void> {
  const originalFetch =
    globalThis.fetch;
  const originalWarn =
    console.warn;
  let fetchCount = 0;
  let warningCount = 0;

  globalThis.fetch =
    async (): Promise<Response> => {
      fetchCount += 1;
      return jsonResponse(
        {
          code: 500,
        },
        500,
      );
    };

  console.warn =
    (...args: unknown[]): void => {
      warningCount += 1;
      ok(
        String(args[0]).includes(
          "exact /stats fallback enabled",
        ),
      );
    };

  const request = () =>
    fetchNaverSearchAdsStatReportKeywordDailyStats({
      credentials:
        FAILURE_CREDENTIALS,
      keywordId:
        "nkw-failure",
      dateFrom:
        "2025-01-02",
      dateTo:
        "2025-01-02",
    });

  try {
    await rejects(request);
    const fetchCountAfterFirst =
      fetchCount;

    await rejects(request);

    equal(
      fetchCount,
      fetchCountAfterFirst,
    );
    equal(warningCount, 1);
    ok(fetchCountAfterFirst > 0);
  } finally {
    globalThis.fetch =
      originalFetch;
    console.warn =
      originalWarn;
  }
}

async function verifyMissingReportsAreCreated(): Promise<void> {
  const originalFetch =
    globalThis.fetch;
  let listCount = 0;
  let createCount = 0;
  let downloadCount = 0;
  let nextJobId = 201;
  const reportTypes =
    new Map<number, string>();

  globalThis.fetch =
    async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(
        input instanceof Request
          ? input.url
          : input.toString(),
      );

      if (
        url.pathname ===
          "/stat-reports" &&
        init?.method === "GET"
      ) {
        listCount += 1;
        return jsonResponse([]);
      }

      if (
        url.pathname ===
          "/stat-reports" &&
        init?.method === "POST"
      ) {
        createCount += 1;
        const body = JSON.parse(
          String(init.body ?? "{}"),
        ) as {
          reportTp: string;
          statDt: string;
        };
        const reportJobId =
          nextJobId;

        nextJobId += 1;
        reportTypes.set(
          reportJobId,
          body.reportTp,
        );

        return jsonResponse(
          {
            reportJobId,
            reportTp:
              body.reportTp,
            statDt:
              body.statDt,
            status: "BUILT",
            downloadUrl:
              `https://api.searchad.naver.com/report-download?fileversion=${reportJobId}`,
            updateTm:
              "2025-01-02T06:00:00+09:00",
          },
          201,
        );
      }

      if (
        url.pathname ===
          "/report-download"
      ) {
        downloadCount += 1;
        const reportJobId = Number(
          url.searchParams.get(
            "fileversion",
          ),
        );

        return new Response(
          reportTypes.get(
            reportJobId,
          ) === "AD_CONVERSION"
            ? CONVERSION_ROW
            : AD_ROW,
          { status: 200 },
        );
      }

      throw new Error(
        `UNEXPECTED_FETCH:${url.pathname}`,
      );
    };

  try {
    const result =
      await fetchNaverSearchAdsStatReportKeywordDailyStats({
        credentials:
          CREATE_CREDENTIALS,
        keywordId: "nkw-1",
        dateFrom: STAT_DATE,
        dateTo: STAT_DATE,
      });

    equal(result.records.length, 1);
    equal(listCount, 1);
    equal(createCount, 2);
    equal(downloadCount, 2);
  } finally {
    globalThis.fetch =
      originalFetch;
  }
}

async function main(): Promise<void> {
  console.log(
    "Naver ultrafast runtime verification started.",
  );
  console.log(
    "verification uses real Naver API: false",
  );
  console.log(
    "verification uses database: false",
  );
  console.log(
    "verification mutates jobs: false",
  );

  await verifySharedReadyCache();
  console.log(
    "PASS: completed StatReports are reused and shared across keyword and adgroup lookups",
  );

  await verifyFailedCacheCooldown();
  console.log(
    "PASS: failed StatReport build is logged once and cooldown-cached",
  );

  await verifyMissingReportsAreCreated();
  console.log(
    "PASS: missing reusable StatReports still use the bounded create path",
  );

  const workerOrchestrationSource = readFileSync(
    new URL(
      "../src/lib/media-sync/media-sync-worker-orchestration-repository.ts",
      import.meta.url,
    ),
    "utf8",
  );
  ok(
    /DEFAULT_RECONCILIATION_STEPS_PER_CLAIM\s*=\s*\n?\s*8\s*;/.test(
      workerOrchestrationSource,
    ),
    "Production Naver claims must run a bounded eight reconciliation steps by default.",
  );
  ok(
    /step\s*<=\s*reconciliationStepsPerClaim/.test(
      workerOrchestrationSource,
    ) &&
      /step\s*===\s*reconciliationStepsPerClaim/.test(
        workerOrchestrationSource,
      ) &&
      /releaseCombinedPartial\s*\(\s*\{/.test(
        workerOrchestrationSource,
      ),
    "The in-claim reconciliation loop must remain bounded and release safely at its limit.",
  );
  console.log(
    "PASS: production claims run up to eight reconciliation steps and preserve bounded release",
  );

  console.log(
    "NAVER_ULTRAFAST_RUNTIME_VERIFICATION=PASS",
  );
}

main().catch((error: unknown) => {
  console.error(
    "NAVER_ULTRAFAST_RUNTIME_VERIFICATION=FAIL",
  );
  console.error(error);
  process.exitCode = 1;
});
