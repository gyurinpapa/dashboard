type ExportCsvParams = {
  fileName: string;
  rows: any[];
};

function safeText(value: unknown) {
  if (value == null) return "";
  return String(value);
}

function safeNumber(value: unknown) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function pickValue(row: any, keys: string[]) {
  for (const key of keys) {
    const v = row?.[key];
    if (v != null && String(v).trim() !== "") return v;
  }
  return "";
}

function csvEscape(value: unknown) {
  const text = safeText(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsvRows(rows: any[]) {
  const columns = [
    { header: "date", keys: ["date", "report_date", "day"] },
    { header: "channel", keys: ["channel", "source", "media"] },
    { header: "device", keys: ["device"] },
    { header: "campaign", keys: ["campaign_name", "campaign"] },
    { header: "group", keys: ["group_name", "group", "adgroup_name", "adgroup"] },
    { header: "keyword", keys: ["keyword"] },
    { header: "creative_file", keys: ["creative_file", "creativeFile", "imagepath_raw"] },
    { header: "impressions", keys: ["impressions", "impr"] },
    { header: "clicks", keys: ["clicks", "click", "clk"] },
    { header: "cost", keys: ["cost", "spend"] },
    { header: "conversions", keys: ["conversions", "conv", "cv"] },
    { header: "revenue", keys: ["revenue", "sales", "gmv"] },
    { header: "ctr", keys: ["ctr"] },
    { header: "cpc", keys: ["cpc"] },
    { header: "cvr", keys: ["cvr"] },
    { header: "cpa", keys: ["cpa"] },
    { header: "roas", keys: ["roas"] },
  ] as const;

  const headerLine = columns.map((c) => c.header).join(",");

  const bodyLines = rows.map((row) => {
    return columns
      .map((col) => {
        const raw = pickValue(row, [...col.keys]);

        if (
          col.header === "impressions" ||
          col.header === "clicks" ||
          col.header === "cost" ||
          col.header === "conversions" ||
          col.header === "revenue" ||
          col.header === "ctr" ||
          col.header === "cpc" ||
          col.header === "cvr" ||
          col.header === "cpa" ||
          col.header === "roas"
        ) {
          return csvEscape(safeNumber(raw));
        }

        return csvEscape(raw);
      })
      .join(",");
  });

  return [headerLine, ...bodyLines].join("\n");
}

export function downloadCsvFile({ fileName, rows }: ExportCsvParams) {
  const csvText = buildCsvRows(Array.isArray(rows) ? rows : []);
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvText], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return {
    ok: true,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    fileName,
  };
}