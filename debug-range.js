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

const FROM = "2022-04-25";
const TO = "2022-07-31";

const rangeRows = rows.filter((r) => {
  if (!r.date) return false;
  return r.date >= FROM && r.date <= TO;
});

const sumImp = rangeRows.reduce((s, r) => s + (+r.impressions || 0), 0);
const sumConv = rangeRows.reduce((s, r) => s + (+r.conversions || 0), 0);
const sumCost = rangeRows.reduce((s, r) => s + (+r.cost || 0), 0);

console.log("===================================");
console.log("ROW COUNT:", rangeRows.length);
console.log("IMP:", sumImp);
console.log("CONV:", sumConv);
console.log("COST:", sumCost);
console.log("===================================");