// Offline regression: compare empty-body and JSON-empty collection responses.
import { deepStrictEqual, equal } from "node:assert/strict";
import { fetchNaverSearchAdsStatReportKeywordDailyStats } from "../src/lib/media-sync/naver-searchads-stat-report-daily-metrics";
const CREATE_CREDENTIALS = {customerId:"offline-json-empty",accessLicense:"offline",secretKey:"offline"};
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

async function verifyMissingReportsAreCreated(
  emptyBody = false,
): Promise<unknown> {
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
        return emptyBody
          ? new Response(null, { status: 200 })
          : jsonResponse([]);
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
        credentials: {
          ...CREATE_CREDENTIALS,
          customerId: emptyBody
            ? "ultrafast-empty-list-customer"
            : CREATE_CREDENTIALS.customerId,
        },
        keywordId: "nkw-1",
        dateFrom: STAT_DATE,
        dateTo: STAT_DATE,
      });

    equal(result.records.length, 1);
    equal(listCount, 1);
    equal(createCount, 2);
    equal(downloadCount, 2);
    return result;
  } finally {
    globalThis.fetch =
      originalFetch;
  }
}

async function main() {
  const normal = await verifyMissingReportsAreCreated();
  const empty = await verifyMissingReportsAreCreated(true);
  deepStrictEqual(empty, normal);
  console.log("PASS bulk-path parity: identical full result, one list GET, two report creates and two downloads per account/date; live_api=0; live_db=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
