import assert from "node:assert/strict";
import {
  createNaverSearchAdsStatReport,
  getNaverSearchAdsStatReport,
  listNaverSearchAdsStatReports,
  NaverSearchAdsStatReportApiError,
} from "../src/lib/media-sync/naver-searchads-stat-reports-api";

const credentials = { customerId: "offline", accessLicense: "offline", secretKey: "offline" };
const originalFetch = globalThis.fetch;
let requestCount = 0;
function respond(body: string | null, status = 200) {
  globalThis.fetch = async () => {
    requestCount++;
    return new Response(body, { status });
  };
}
const invalid = (error: unknown) => error instanceof NaverSearchAdsStatReportApiError && error.code === "INVALID_RESPONSE";
async function main() {
  try {
    respond(null);
    assert.deepEqual(await listNaverSearchAdsStatReports({ credentials }), []);
    assert.equal(requestCount, 1);
    respond("[]");
    assert.deepEqual(await listNaverSearchAdsStatReports({ credentials }), []);

    const row = {reportJobId: 123, reportTp: "AD", statDt: "20260901", status: "BUILT", downloadUrl: "https://example.invalid", updateTm: null};
    respond(JSON.stringify([row]));
    assert.deepEqual(await listNaverSearchAdsStatReports({ credentials }), [{reportJobId:123,reportType:"AD",statDate:"20260901",status:"BUILT",downloadUrl:row.downloadUrl,updateTime:null}]);

    for (const body of [" ", "\uFEFF", "<html>error</html>", "[", "null", "{}", JSON.stringify([{...row,reportJobId:"123"}])]) {
      respond(body);
      await assert.rejects(listNaverSearchAdsStatReports({ credentials }), invalid);
    }
    respond(null, 204);
    await assert.rejects(listNaverSearchAdsStatReports({ credentials }), invalid);
    for (const status of [401, 429, 500]) {
      respond(null, status);
      await assert.rejects(listNaverSearchAdsStatReports({ credentials }), (error: unknown) =>
        error instanceof NaverSearchAdsStatReportApiError && error.code === "HTTP_ERROR" && error.status === status);
    }
    respond(null);
    await assert.rejects(getNaverSearchAdsStatReport({ credentials, reportJobId:123 }), invalid);
    await assert.rejects(createNaverSearchAdsStatReport({ credentials, statDate:"2026-09-01" }), invalid);

    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError("synthetic truncated transport")); },
    }), {status:200});
    await assert.rejects(listNaverSearchAdsStatReports({ credentials }), invalid);
    console.log("PASS empty collection normalization; malformed, HTTP, detail/create and transport errors remain rejected; live_api=0; live_db=0");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
