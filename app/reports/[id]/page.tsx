// app/reports/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";
import ReportDownloadButtons from "@/app/components/report/ReportDownloadButtons";
import { buildReportFileName } from "@/src/lib/report/download/file-name";
import { downloadCsvFile } from "@/src/lib/report/download/export-csv";
import { prepareElementForExport } from "@/src/lib/report/download/export-helpers";
import { downloadPngFromElement } from "@/src/lib/report/download/export-png";
import { downloadPdfFromElement } from "@/src/lib/report/download/export-pdf";

import ReportTemplate from "../../components/ReportTemplate";

async function safeJson(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: "Non-JSON response", raw };
  }
}

/* =========================================================
 * ✅ Bearer 우선 + 쿠키 fallback
 * ========================================================= */

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers || undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

/* =========================================================
 * API helpers
 * ========================================================= */

async function fetchRows(reportId: string): Promise<any[]> {
  const res = await authFetch(`/api/reports/${reportId}/rows`);
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Failed to fetch rows (${res.status})`);
  }
  return json.rows ?? [];
}

async function fetchCreativesMap(
  reportId: string
): Promise<Record<string, string>> {
  const res = await authFetch(
    `/api/reports/${reportId}/assets/creatives/map?expiresIn=3600`
  );
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.error || `Failed to fetch creativesMap (${res.status})`
    );
  }
  return json.creativesMap ?? {};
}

async function runIngestion(reportId: string) {
  const res = await authFetch(`/api/reports/${reportId}/ingestion/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "replace" }),
  });
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Ingestion failed (${res.status})`);
  }
  return json;
}

async function uploadCsv(reportId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  fd.set("reportId", reportId);

  const res = await authFetch(`/api/uploads/csv`, {
    method: "POST",
    body: fd,
  });
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `CSV upload failed (${res.status})`);
  }
  return json;
}

type UploadCreativesResult = {
  ok: boolean;
  items?: any[];
  creativesMap?: Record<string, string>;
  batch_id?: string;
  error?: string;
};

type ReportHeaderInfo = {
  advertiserName: string;
  reportTypeName: string;
};

async function uploadCreatives(reportId: string, files: File[]) {
  if (!reportId) throw new Error("Missing reportId");
  if (!files?.length) throw new Error("No files");

  const BATCH_SIZE = 4;

  let batchId: string | undefined;
  const allItems: any[] = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const chunk = files.slice(i, i + BATCH_SIZE);

    const fd = new FormData();
    for (const f of chunk) fd.append("files", f);

    fd.set("expiresIn", "3600");
    if (batchId) fd.set("batch_id", batchId);

    const res = await authFetch(
      `/api/reports/${reportId}/assets/creatives/upload`,
      {
        method: "POST",
        body: fd,
      }
    );

    const json = (await safeJson(res)) as any;

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `Creatives upload failed (${res.status})`);
    }

    if (!batchId && json?.batch_id) batchId = json.batch_id;

    const items = json?.items ?? [];
    if (Array.isArray(items) && items.length) allItems.push(...items);
  }

  return {
    ok: true,
    batch_id: batchId,
    items: allItems,
  } as UploadCreativesResult;
}

/* =========================================================
 * ✅ Publish
 * ========================================================= */

function looksLikePublishedAtIssue(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("published_at") ||
    m.includes("schema cache") ||
    m.includes("could not find") ||
    (m.includes("column") && m.includes("published_at"))
  );
}

function pickSharePath(json: any): string {
  if (json?.sharePath) return String(json.sharePath);

  const token = json?.share_token || json?.shareToken;
  if (token) return `/share/${String(token).trim()}`;

  const t2 = json?.report?.share_token || json?.report?.shareToken;
  if (t2) return `/share/${String(t2).trim()}`;

  return "";
}

async function publishReportWithFallback(reportId: string) {
  const res1 = await authFetch(`/api/reports/${reportId}/publish`, {
    method: "POST",
  });
  const json1 = await safeJson(res1);

  if (res1.ok && json1?.ok) {
    return {
      ok: true as const,
      sharePath: pickSharePath(json1),
      status: String(json1?.status || "ready"),
      raw: json1,
      used: "publish" as const,
    };
  }

  const msg1 = String(
    json1?.error || json1?.message || `Publish failed (${res1.status})`
  );

  if (looksLikePublishedAtIssue(msg1)) {
    const res2 = await authFetch(`/api/reports/${reportId}/publish-lite`, {
      method: "POST",
    });
    const json2 = await safeJson(res2);

    if (res2.ok && json2?.ok) {
      return {
        ok: true as const,
        sharePath: pickSharePath(json2),
        status: String(json2?.status || "ready"),
        raw: json2,
        used: "publish-lite" as const,
      };
    }

    const msg2 = String(
      json2?.error || json2?.message || `Publish-lite failed (${res2.status})`
    );
    throw new Error(msg2);
  }

  throw new Error(msg1);
}

function fullUrl(path: string) {
  if (!path) return "";
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function uniqCount(values: string[]) {
  const s = new Set<string>();
  for (const v of values) if (v) s.add(v);
  return s.size;
}

/* =========================================================
 * UI helper
 * ========================================================= */

function humanSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const fixed = i === 0 ? String(Math.round(n)) : n.toFixed(n >= 10 ? 1 : 2);
  return `${fixed}${units[i]}`;
}

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function normalizeReportId(v: any) {
  if (Array.isArray(v)) return asStr(v[0]);
  return asStr(v);
}

function rowFingerprint(row: any) {
  if (!row || typeof row !== "object") return "";
  return [
    asStr(row?.id),
    asStr(row?.__row_id),
    asStr(row?.date ?? row?.report_date ?? row?.day),
    asStr(row?.campaign_name ?? row?.campaign),
    asStr(row?.group_name ?? row?.group),
    asStr(row?.keyword),
    asStr(row?.channel),
    asStr(row?.device),
    asStr(row?.creative_file ?? row?.creativeFile ?? row?.imagepath_raw),
    asStr(row?.impressions ?? row?.impr),
    asStr(row?.clicks ?? row?.click ?? row?.clk),
    asStr(row?.cost ?? row?.spend),
    asStr(row?.conversions ?? row?.conv ?? row?.cv),
    asStr(row?.revenue ?? row?.sales ?? row?.gmv),
  ].join("|");
}

async function fetchReportHeaderInfo(
  _reportId: string
): Promise<ReportHeaderInfo> {
  return {
    advertiserName: "",
    reportTypeName: "",
  };
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = normalizeReportId(params?.id);

  const sessionStartedAtRef = useRef<number | null>(null);
  const [sessionStartedText, setSessionStartedText] = useState<string>("-");

  const [sessionIngested, setSessionIngested] = useState(false);
  const [sessionCreativesUploaded, setSessionCreativesUploaded] =
    useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});
  const [headerInfo, setHeaderInfo] = useState<ReportHeaderInfo>({
    advertiserName: "",
    reportTypeName: "",
  });
  const [previewVersion, setPreviewVersion] = useState(0);

  const [publishing, setPublishing] = useState(false);
  const [sharePath, setSharePath] = useState<string>("");

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [lastUploadedCsvName, setLastUploadedCsvName] = useState<string>("");

  const creativesInputRef = useRef<HTMLInputElement | null>(null);
  const [creativeFiles, setCreativeFiles] = useState<File[]>([]);
  const [uploadingCreatives, setUploadingCreatives] = useState(false);
  const [creativeUploadLog, setCreativeUploadLog] = useState<any[]>([]);
  const [lastUploadedCreativeCount, setLastUploadedCreativeCount] =
    useState<number>(0);

  const reportCaptureRef = useRef<HTMLDivElement | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pngLoading, setPngLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const displayRows = rows;
  const displayCreativesMap = creativesMap;

  const creativesKeyCount = Object.keys(displayCreativesMap || {}).length;

  const creativesUrlCount = useMemo(() => {
    const paths = Object.values(displayCreativesMap || {}).map((url) => {
      const s = String(url || "");
      if (!s) return "";
      try {
        const u = new URL(s);
        return u.pathname;
      } catch {
        return s;
      }
    });
    return uniqCount(paths);
  }, [displayCreativesMap]);

  const rowsSignature = useMemo(() => {
    if (!displayRows.length) return "rows:0";

    const first = displayRows[0];
    const second = displayRows[1];
    const last = displayRows[displayRows.length - 1];
    const prev = displayRows[displayRows.length - 2];

    return [
      `len:${displayRows.length}`,
      `f1:${rowFingerprint(first)}`,
      `f2:${rowFingerprint(second)}`,
      `l2:${rowFingerprint(prev)}`,
      `l1:${rowFingerprint(last)}`,
    ].join("||");
  }, [displayRows]);

  const headerFallbackFromRows = useMemo(() => {
    let advertiserName = "";
    let reportTypeName = "";

    for (const r of rows ?? []) {
      if (!advertiserName) {
        advertiserName =
          asStr(r?.advertiser_name) ||
          asStr(r?.advertiserName) ||
          asStr(r?.advertiser) ||
          asStr(r?.brand_name) ||
          asStr(r?.client_name);
      }

      if (!reportTypeName) {
        reportTypeName =
          asStr(r?.report_type_name) ||
          asStr(r?.reportTypeName) ||
          asStr(r?.report_type_key) ||
          asStr(r?.reportTypeKey) ||
          asStr(r?.report_type);
      }

      if (advertiserName && reportTypeName) break;
    }

    return { advertiserName, reportTypeName };
  }, [rows]);

  const effectivePreviewAdvertiserName =
    headerInfo.advertiserName || headerFallbackFromRows.advertiserName || "";

  const effectivePreviewReportTypeName =
    headerInfo.reportTypeName || headerFallbackFromRows.reportTypeName || "";

  const previewKey = useMemo(() => {
    return [
      reportId || "",
      effectivePreviewAdvertiserName,
      effectivePreviewReportTypeName,
      rowsSignature,
      creativesUrlCount,
      previewVersion,
    ].join("|");
  }, [
    reportId,
    effectivePreviewAdvertiserName,
    effectivePreviewReportTypeName,
    rowsSignature,
    creativesUrlCount,
    previewVersion,
  ]);

  const canPublish = sessionIngested && !publishing;

  const reportTitleForDownload = effectivePreviewReportTypeName || "report";
  const advertiserNameForDownload =
    effectivePreviewAdvertiserName || "advertiser";

  async function refreshRows() {
    if (!reportId) return;

    setLoadingRows(true);
    setMsg("");

    let nextMsg = "";

    try {
      try {
  const rws = await fetchRows(reportId);
  const nextRows = Array.isArray(rws) ? [...rws] : [];
  setRows(nextRows);

  console.log("[refreshRows] rows ok", {
    rowsLen: nextRows.length,
    sampleRow: nextRows[0] ?? null,
    firstDate:
      nextRows[0]?.date ??
      nextRows[0]?.report_date ??
      nextRows[0]?.day ??
      null,
    lastDate:
      nextRows[nextRows.length - 1]?.date ??
      nextRows[nextRows.length - 1]?.report_date ??
      nextRows[nextRows.length - 1]?.day ??
      null,
    monthKeys: Array.from(
      new Set(
        nextRows
          .map((r) => {
            const raw = r?.date ?? r?.report_date ?? r?.day;
            if (!raw) return "";
            return String(raw).slice(0, 7);
          })
          .filter(Boolean)
      )
    ),
  });
} catch (e: any) {
        console.error("[refreshRows] rows failed", e);
        setRows([]);
        nextMsg += `rows 조회 실패: ${e?.message || "unknown"}\n`;
      }

      try {
        const cmap = await fetchCreativesMap(reportId);
        const nextCreativesMap = { ...(cmap ?? {}) };
        setCreativesMap(nextCreativesMap);

        console.log("[refreshRows] creativesMap ok", {
          keyCount: Object.keys(nextCreativesMap).length,
        });
      } catch (e: any) {
        console.error("[refreshRows] creativesMap failed", e);
        setCreativesMap({});
        nextMsg += `creativesMap 조회 실패: ${e?.message || "unknown"}\n`;
      }

      try {
        const hdr = await fetchReportHeaderInfo(reportId);
        setHeaderInfo({
          advertiserName: asStr(hdr?.advertiserName),
          reportTypeName: asStr(hdr?.reportTypeName),
        });
      } catch (e: any) {
        console.error("[refreshRows] headerInfo failed", e);
        setHeaderInfo({
          advertiserName: "",
          reportTypeName: "",
        });
        nextMsg += `header 조회 실패: ${e?.message || "unknown"}\n`;
      }

      setPreviewVersion((v) => v + 1);

      if (nextMsg.trim()) {
        setMsg(nextMsg.trim());
      }
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    if (!reportId) return;

    sessionStartedAtRef.current = Date.now();
    setSessionStartedText("-");

    setSessionIngested(false);
    setSessionCreativesUploaded(false);

    setSharePath("");
    setMsg("");

    setCreativeUploadLog([]);
    setLastUploadedCreativeCount(0);
    setRows([]);
    setCreativesMap({});
    setHeaderInfo({
      advertiserName: "",
      reportTypeName: "",
    });
    setPreviewVersion(0);

    refreshRows();

    const d = new Date(sessionStartedAtRef.current);
    setSessionStartedText(d.toLocaleString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function handleUploadCsv() {
    if (!reportId) return;

    if (!csvFile) {
      setMsg("CSV 파일을 선택하세요.");
      return;
    }

    setCsvUploading(true);
    setMsg("");

    try {
      const up = await uploadCsv(reportId, csvFile);
      const uploadedName =
        up?.item?.name || up?.item?.file_name || csvFile.name || "";
      if (uploadedName) setLastUploadedCsvName(String(uploadedName));

      const run = await runIngestion(reportId);

      setSessionIngested(true);

      await refreshRows();

      setCsvFile(null);
      if (csvInputRef.current) csvInputRef.current.value = "";

      setMsg(
        `CSV 업로드 + 파싱 완료 (inserted: ${
          run?.inserted ?? "?"
        }) → 미리보기에 반영되었습니다.`
      );
    } catch (e: any) {
      setMsg(e?.message || "CSV 업로드/파싱 실패");
    } finally {
      setCsvUploading(false);
    }
  }

  async function handleUploadCreatives() {
    if (!reportId) return;

    if (!creativeFiles.length) {
      setMsg("소재 이미지 파일을 선택하세요.");
      return;
    }

    setUploadingCreatives(true);
    setMsg("");

    try {
      const filesCount = creativeFiles.length;

      const res = await uploadCreatives(reportId, creativeFiles);

      setSessionCreativesUploaded(true);

      const items = (res as any).items ?? [];
      setCreativeUploadLog(items);
      setLastUploadedCreativeCount(filesCount);

      setCreativeFiles([]);
      if (creativesInputRef.current) creativesInputRef.current.value = "";

      await refreshRows();

      setMsg(`소재 업로드 완료: ${filesCount}개`);
    } catch (e: any) {
      setMsg(e?.message || "소재 업로드 중 오류");
    } finally {
      setUploadingCreatives(false);
    }
  }

  async function handlePublish() {
    if (!reportId) return;

    if (!sessionIngested) {
      setMsg(
        "이번 세션에서 CSV 업로드 + 파싱(ingestion/run)을 먼저 완료해야 발행할 수 있습니다."
      );
      return;
    }

    setPublishing(true);
    setMsg("");
    try {
      const out = await publishReportWithFallback(reportId);

      if (out.sharePath) setSharePath(out.sharePath);

      if (out.used === "publish-lite") {
        setMsg(
          "발행 완료(안전모드: publish-lite). 아래 URL로 실제 보고서를 볼 수 있습니다."
        );
      } else {
        setMsg("발행 완료. 아래 URL로 실제 보고서를 볼 수 있습니다.");
      }
    } catch (e: any) {
      setMsg(e?.message || "발행 실패");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDownloadPdf() {
  try {
    setPdfLoading(true);

    const el = reportCaptureRef.current;

    if (!el) {
      console.warn("[download:pdf] reportCaptureRef not found");
      setMsg("PDF 다운로드 준비 중 대상 영역을 찾지 못했습니다.");
      return;
    }

    const fileName = buildReportFileName({
      advertiserName: advertiserNameForDownload,
      reportTitle: reportTitleForDownload,
      ext: "pdf",
    });

    await prepareElementForExport(el);

    const result = await downloadPdfFromElement({
      element: el,
      fileName,
    });

    console.log("[download:pdf:done]", {
      fileName: result.fileName,
      width: result.width,
      height: result.height,
      pages: result.pages,
    });

    setMsg(`PDF 다운로드 완료: ${result.fileName} / ${result.pages} page`);
  } catch (e: any) {
    console.error("[download:pdf:error]", e);
    setMsg(e?.message || "PDF 다운로드 중 오류가 발생했습니다.");
  } finally {
    setPdfLoading(false);
  }
}

async function handleDownloadPng() {
  try {
    setPngLoading(true);

    const el = reportCaptureRef.current;

    if (!el) {
      console.warn("[download:png] reportCaptureRef not found");
      setMsg("PNG 다운로드 준비 중 대상 영역을 찾지 못했습니다.");
      return;
    }

    const fileName = buildReportFileName({
      advertiserName: advertiserNameForDownload,
      reportTitle: reportTitleForDownload,
      ext: "png",
    });

    await prepareElementForExport(el);

    const result = await downloadPngFromElement({
      element: el,
      fileName,
    });

    console.log("[download:png:done]", {
      fileName: result.fileName,
      width: result.width,
      height: result.height,
    });

    setMsg(`PNG 다운로드 완료: ${result.fileName}`);
  } catch (e: any) {
    console.error("[download:png:error]", e);
    setMsg(e?.message || "PNG 다운로드 중 오류가 발생했습니다.");
  } finally {
    setPngLoading(false);
  }
}

function handleDownloadCsv() {
  try {
    setCsvLoading(true);

    const fileName = buildReportFileName({
      advertiserName: advertiserNameForDownload,
      reportTitle: reportTitleForDownload,
      ext: "csv",
    });

    const result = downloadCsvFile({
      fileName,
      rows: Array.isArray(displayRows) ? displayRows : [],
    });

    console.log("[download:csv:done]", {
      fileName: result.fileName,
      rowCount: result.rowCount,
    });

    setMsg(
      `CSV 다운로드 완료: ${result.fileName} / ${result.rowCount}개 row`
    );
  } catch (e: any) {
    console.error("[download:csv:error]", e);
    setMsg(e?.message || "CSV 다운로드 중 오류가 발생했습니다.");
  } finally {
    setCsvLoading(false);
  }
}

  const shareUrl = sharePath ? fullUrl(sharePath) : "";

  const csvStatusText = useMemo(() => {
    if (csvFile) {
      const sz = csvFile.size ? ` (${humanSize(csvFile.size)})` : "";
      return `선택됨: ${csvFile.name}${sz}`;
    }
    if (lastUploadedCsvName) return `최근 업로드: ${lastUploadedCsvName}`;
    return "📌 CSV 파일을 선택해 주세요 (클릭)";
  }, [csvFile, lastUploadedCsvName]);

  const creativesStatusText = useMemo(() => {
    if (creativeFiles.length > 0) return `선택됨: ${creativeFiles.length}개`;
    if (lastUploadedCreativeCount > 0) {
      return `최근 업로드: ${lastUploadedCreativeCount}개`;
    }
    return "📌 이미지 파일을 선택해 주세요 (클릭)";
  }, [creativeFiles.length, lastUploadedCreativeCount]);

  const creativesNamePreview = useMemo(() => {
    const list = creativeFiles.map((f) => f?.name).filter(Boolean);
    if (!list.length) return "";
    const head = list.slice(0, 3).join(", ");
    const more = list.length > 3 ? ` 외 ${list.length - 3}개` : "";
    return `${head}${more}`;
  }, [creativeFiles]);

  return (
    <div className="p-6">
      <div className="rounded-lg border p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">실제 보고서 URL</div>
            <div className="text-xs text-gray-600">
              CSV 업로드/파싱 + 소재 업로드 후, 발행하면 공유 링크(/share/[token])가
              생성됩니다.
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              세션 시작: {sessionStartedText}
              {" · "}
              {sessionIngested
                ? "✅ 이번 세션 CSV 파싱 완료"
                : "⛔ 이번 세션 CSV 파싱 전(재발행 제한)"}
              {" · "}
              {sessionCreativesUploaded
                ? "✅ 이번 세션 소재 업로드 완료"
                : "ℹ️ 기존 저장 소재는 표시되며, 이번 세션 재업로드 전 상태"}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                publishing || !canPublish
                  ? "bg-gray-300 text-gray-600"
                  : "bg-black text-white hover:opacity-90"
              }`}
              onClick={handlePublish}
              disabled={publishing || !canPublish}
              title={!sessionIngested ? "이번 세션에서 CSV 업로드+파싱 필요" : ""}
            >
              {publishing ? "발행 중..." : "발행하기"}
            </button>

            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
              onClick={refreshRows}
            >
              새로고침
            </button>
          </div>
        </div>

        {shareUrl ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              readOnly
              value={shareUrl}
            />

            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm font-semibold bg-white hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100"
              style={{ minWidth: 74 }}
              onClick={() => window.open(shareUrl, "_blank")}
              title="새 탭에서 열기"
            >
              열기
            </button>

            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm font-semibold bg-white hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100"
              style={{ minWidth: 74 }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setMsg("URL을 복사했습니다.");
                } catch {
                  setMsg("복사 실패(브라우저 권한 확인)");
                }
              }}
              title="클립보드에 복사"
            >
              복사
            </button>
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-500">
            아직 발행되지 않았습니다.
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold">리포트</div>
          <div className="mt-1 text-sm text-gray-600">/reports/{reportId}</div>
        </div>
      </div>

      {msg ? (
        <div className="mt-3 rounded-md border bg-white p-3 text-sm text-gray-700 whitespace-pre-line">
          {msg}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">CSV 업로드</div>
            <div className="text-xs text-gray-600 mb-3">
              업로드 후 서버 파서(ingestion/run)가 실행되어 rows가 갱신됩니다.
            </div>

            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            />

            <label
              htmlFor={undefined as any}
              onClick={() => csvInputRef.current?.click()}
              className="block w-full rounded-md border px-4 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100"
              style={{ userSelect: "none" }}
              title="클릭해서 CSV 파일을 선택하세요"
            >
              <div className="text-sm font-semibold">📁 CSV 파일 선택</div>
              <div className="mt-1 text-xs text-gray-600">
                클릭하여 파일을 선택하세요. (드래그앤드롭은 추후)
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div
                  className={`text-xs ${
                    csvFile || lastUploadedCsvName
                      ? "text-gray-700"
                      : "text-gray-500"
                  }`}
                >
                  {csvStatusText}
                </div>

                {csvFile ? (
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs font-semibold hover:border-gray-400 bg-white"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCsvFile(null);
                      if (csvInputRef.current) csvInputRef.current.value = "";
                    }}
                    title="선택 해제"
                  >
                    선택 해제
                  </button>
                ) : null}
              </div>
            </label>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  csvUploading
                    ? "bg-gray-300 text-gray-600"
                    : "bg-black text-white hover:opacity-90"
                }`}
                onClick={handleUploadCsv}
                disabled={csvUploading}
              >
                {csvUploading ? "업로드 중..." : "CSV 업로드 + 파싱"}
              </button>

              <div className="text-xs text-gray-600">
                {csvFile
                  ? "업로드 준비 완료"
                  : lastUploadedCsvName
                  ? "CSV를 다시 바꾸려면 위 박스를 클릭"
                  : "먼저 CSV를 선택하세요"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">소재 업로드</div>
            <div className="text-xs text-gray-600 mb-3">
              CSV의 <b>creative_file</b> 값과 업로드 파일명이 매칭됩니다.
              <br />
              예: CSV <b>CR_001.png</b> → 업로드도 <b>CR_001.png</b>
            </div>

            <input
              ref={creativesInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => setCreativeFiles(Array.from(e.target.files ?? []))}
            />

            <label
              htmlFor={undefined as any}
              onClick={() => creativesInputRef.current?.click()}
              className="block w-full rounded-md border px-4 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100"
              style={{ userSelect: "none" }}
              title="클릭해서 이미지 파일을 선택하세요"
            >
              <div className="text-sm font-semibold">🖼️ 이미지 파일 선택</div>
              <div className="mt-1 text-xs text-gray-600">
                여러 개 선택 가능합니다.
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div
                  className={`text-xs ${
                    creativeFiles.length > 0 || lastUploadedCreativeCount > 0
                      ? "text-gray-700"
                      : "text-gray-500"
                  }`}
                >
                  {creativesStatusText}
                  {creativesNamePreview ? (
                    <span className="text-gray-500"> · {creativesNamePreview}</span>
                  ) : null}
                </div>

                {creativeFiles.length > 0 ? (
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs font-semibold hover:border-gray-400 bg-white"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCreativeFiles([]);
                      if (creativesInputRef.current) {
                        creativesInputRef.current.value = "";
                      }
                    }}
                    title="선택 해제"
                  >
                    선택 해제
                  </button>
                ) : null}
              </div>
            </label>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  uploadingCreatives
                    ? "bg-gray-300 text-gray-600"
                    : "bg-black text-white hover:opacity-90"
                }`}
                onClick={handleUploadCreatives}
                disabled={uploadingCreatives}
              >
                {uploadingCreatives ? "업로드 중..." : "소재 업로드"}
              </button>

              <div className="text-xs text-gray-600">
                {creativeFiles.length > 0
                  ? "업로드 준비 완료"
                  : lastUploadedCreativeCount > 0
                  ? "이미지를 바꾸려면 위 박스를 클릭"
                  : "먼저 이미지를 선택하세요"}
              </div>
            </div>

            {creativeUploadLog.length > 0 ? (
              <div className="mt-3 rounded-md border p-2 bg-white">
                <div className="text-xs font-semibold mb-2">
                  업로드 결과(이번 세션)
                </div>
                <div className="max-h-40 overflow-auto space-y-1">
                  {creativeUploadLog.map((it, idx) => (
                    <div key={idx} className="text-xs text-gray-700">
                      {it.ok ? "✅" : "❌"}{" "}
                      <span className="font-medium">{it.file}</span>{" "}
                      <span className="text-gray-500">→ key:</span>{" "}
                      <span className="font-mono">{it.creative_key}</span>
                      {!it.ok && it.error ? (
                        <span className="text-red-600"> ({it.error})</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-1">매칭된 소재</div>

            <div className="text-sm text-gray-700">
              고유 URL: <b>{creativesUrlCount}</b>개{" "}
              <span className="text-gray-400">·</span> 키 후보:{" "}
              <b>{creativesKeyCount}</b>개
            </div>

            {!sessionCreativesUploaded ? (
              <div className="mt-2 text-xs text-gray-600">
                현재는 서버에 저장된 기존 매칭 결과를 표시 중입니다. 이번 세션에서
                새 이미지를 업로드하면 즉시 갱신됩니다.
              </div>
            ) : null}

            <div className="mt-2 text-xs text-gray-500">
              ※ 키 후보 수는 매칭 성공률을 올리기 위한 확장 키가 포함되어 커질 수
              있습니다. 실제 이미지 파일 수 감은 고유 URL이 더 정확합니다.
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-lg border">
            <div className="flex items-center justify-between px-4 py-3 border-b gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">미리보기</div>
                <div className="text-xs text-gray-500">
                  compact + scale(0.9) + right scroll
                </div>
              </div>

              <div className="shrink-0">
                <ReportDownloadButtons
                  onDownloadPdf={handleDownloadPdf}
                  onDownloadPng={handleDownloadPng}
                  onDownloadCsv={handleDownloadCsv}
                  pdfLoading={pdfLoading}
                  pngLoading={pngLoading}
                  csvLoading={csvLoading}
                />
              </div>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-4">
              <div ref={reportCaptureRef}>
                <div
                  style={{
                    transform: "scale(0.9)",
                    transformOrigin: "top center",
                  }}
                >
                  <ReportTemplate
                    key={previewKey}
                    rows={displayRows}
                    isLoading={loadingRows}
                    creativesMap={displayCreativesMap}
                    advertiserName={effectivePreviewAdvertiserName}
                    reportTypeName={effectivePreviewReportTypeName}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            서버 rows(실제): {rows.length}개{" "}
            <span className="text-gray-400">·</span> 현재 표시 rows:{" "}
            {displayRows.length}개{" "}
            <span className="text-gray-400">·</span> 광고주:{" "}
            {effectivePreviewAdvertiserName || "-"}{" "}
            <span className="text-gray-400">·</span> 유형:{" "}
            {effectivePreviewReportTypeName || "-"}
          </div>
        </div>
      </div>
    </div>
  );
}