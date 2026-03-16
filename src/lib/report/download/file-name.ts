export type BuildReportFileNameParams = {
  advertiserName?: string | null;
  reportTitle?: string | null;
  date?: Date;
  ext: "pdf" | "png" | "csv";
};

export function sanitizeFileNamePart(input?: string | null) {
  const raw = String(input ?? "").trim();
  if (!raw) return "report";

  return raw
    .replace(/[\/\\:*?"<>|]+/g, "") // 파일명 금지 문자 제거
    .replace(/\s+/g, "_") // 공백 -> _
    .replace(/_+/g, "_") // __ -> _
    .replace(/^_+|_+$/g, "") // 앞뒤 _
    .slice(0, 50);
}

export function formatDateForFileName(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildReportFileName({
  advertiserName,
  reportTitle,
  date = new Date(),
  ext,
}: BuildReportFileNameParams) {
  const advertiser = sanitizeFileNamePart(advertiserName || "advertiser");
  const title = sanitizeFileNamePart(reportTitle || "report");
  const dateText = formatDateForFileName(date);

  return `${advertiser}_${title}_${dateText}.${ext}`;
}