const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const filePath = path.join(__dirname, "public/data/TEST_ver1.csv");
const csv = fs.readFileSync(filePath, "utf8");

const parsed = Papa.parse(csv, {
  header: true,
  skipEmptyLines: true,
});

const rows = parsed.data;

console.log("전체 CSV ROW:", rows.length);

// ===== 날짜 범위 설정 =====
const FROM_STR = "2022-04-25";
const TO_STR = "2022-07-31";

const from = new Date(FROM_STR);
const to = new Date(TO_STR);

// ===== Date 객체 비교 방식 =====
const rangeRows = rows.filter((r) => {
  if (!r.date) return false;

  const d = new Date(r.date);

  if (isNaN(d.getTime())) {
    console.log("❌ INVALID DATE:", r.date);
    return false;
  }

  return d >= from && d <= to;
});

function toNum(v) {
  if (!v) return 0;
  return Number(String(v).replace(/[^\d.-]/g, ""));
}

// ===== 집계 =====
const sumImp = rangeRows.reduce((s, r) => s + toNum(r.impressions), 0);
const sumConv = rangeRows.reduce((s, r) => s + toNum(r.conversions), 0);
const sumCost = rangeRows.reduce((s, r) => s + toNum(r.cost), 0);

console.log("===================================");
console.log("DATE RANGE:", FROM_STR, "~", TO_STR);
console.log("ROW COUNT:", rangeRows.length);
console.log("IMP:", sumImp);
console.log("CONV:", sumConv);
console.log("COST:", sumCost);
console.log("===================================");

// ===== 의심 날짜 포맷 확인 =====
const weirdDates = rows.filter(r => {
  if (!r.date) return false;
  return r.date.includes("2022-7-") ||
         r.date.includes("2022/") ||
         r.date.includes(" 00:00") ||
         r.date.length !== 10;
});

console.log("⚠️ 이상한 날짜 포맷 개수:", weirdDates.length);
console.log("샘플:", weirdDates.slice(0, 10));

const badImp = rangeRows.filter(r => isNaN(Number(r.impressions)));
const badCost = rangeRows.filter(r => isNaN(Number(r.cost)));

console.log("IMP NaN 개수:", badImp.length);
console.log("COST NaN 개수:", badCost.length);
console.log("IMP 샘플:", badImp.slice(0,5));
console.log("COST 샘플:", badCost.slice(0,5));