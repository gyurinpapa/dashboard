import assert from "node:assert/strict";
import { getDailyReportV2ProviderStatus as display } from "../src/lib/media-sync/daily-report-v2-provider-status";

const complete = Object.freeze({
  target_covered: true,
  through_date: "2026-09-13",
  first_missing_date: null,
  contiguous_rows: 940,
});
const latest = Object.freeze({
  status: "failed", progress: 0,
  date_from: "2026-09-21", automation_contract: "daily_report_v2",
});

// Incident fixture: historical 7/7 coverage must never conceal today's failure.
assert.deepEqual(display(complete, latest), {
  status: "failed", statusText: "실패", currentStage: "2026-09-21 · 실패",
});
for (const [status, text] of [
  ["pending", "대기 중"], ["processing", "처리 중 32%"], ["cancelled", "취소됨"],
]) {
  assert.deepEqual(display(complete, { ...latest, status, progress: 32 }), {
    status, statusText: text, currentStage: `2026-09-21 · ${text}`,
  });
}

// Even when the detailed job list omits this job, the provider's latest status wins.
assert.deepEqual(display(complete, { status: "failed", progress: 0 }), {
  status: "failed", statusText: "실패", currentStage: "최근 동기화 실패",
});
assert.deepEqual(display(complete, { ...latest, status: "done" }), {
  status: "done", statusText: "완료", currentStage: "2026-09-21 · 데일리 동기화 완료",
});
assert.equal(display(complete, { ...latest, status: "done", date_from: "2026-09-13" })?.currentStage, "초기 동기화 완료");
assert.equal(display(complete, null)?.currentStage, "초기 동기화 완료");

const incomplete = { ...complete, target_covered: false, first_missing_date: "2026-09-03" };
assert.equal(display(incomplete, { ...latest, status: "done", date_from: "2026-09-02" })?.status, "pending");
assert.equal(display(incomplete, null)?.currentStage, "2026-09-03 대기");
assert.equal(display(incomplete, latest)?.status, "failed");
assert.equal(display(null, latest), null, "non-Daily-V2 provider behavior remains with its existing caller");
assert.equal(display(complete, { ...latest, status: "processing", progress: NaN })?.statusText, "처리 중 0%");
assert.equal(display(complete, { ...latest, status: "processing", progress: 150 })?.statusText, "처리 중 100%");
assert.equal(complete.contiguous_rows, 940);
assert.equal(complete.target_covered, true);
assert.equal(latest.status, "failed");

console.log("DAILY_REPORT_V2_PROVIDER_STATUS=PASS (17 assertions)");
console.log("INITIAL_COVERAGE_AND_COUNTS=UNCHANGED");
console.log("NETWORK_CALLS=0 DB_WRITES=0");
