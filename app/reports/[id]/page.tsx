// app/reports/[id]/page.tsx
"use client";

import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";
import ReportDownloadButtons from "@/app/components/report/ReportDownloadButtons";
import { buildReportFileName } from "@/src/lib/report/download/file-name";
import { downloadCsvFile } from "@/src/lib/report/download/export-csv";
import { prepareElementForExport } from "@/src/lib/report/download/export-helpers";
import { downloadPngFromElement } from "@/src/lib/report/download/export-png";
import { downloadPdfFromElement } from "@/src/lib/report/download/export-pdf";
import { ENABLE_EXPORT_BUILDER_ENTRY } from "@/src/lib/export-builder/feature";

import type { ReportPeriod } from "@/src/lib/report/period";
import {
  getPeriodLabel,
  getRowsDateRange,
  resolvePresetPeriod,
} from "@/src/lib/report/period";
import { extractAdvertiserName } from "@/src/lib/report/utils";

import ReportTemplate from "../../components/ReportTemplate";

const CSV_BUCKET = "report_uploads";

async function safeJson(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: "Non-JSON response", raw };
  }
}

/* =========================================================
 * Bearer 우선 + 쿠키 fallback
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

type ReportDetail = {
  id: string;
  title?: string | null;
  status?: string | null;
  meta?: any;
  workspace_id?: string | null;

  advertiser_name?: string | null;
  advertiserName?: string | null;
  advertiser?: string | null;

  report_type_name?: string | null;
  reportTypeName?: string | null;
  report_type_key?: string | null;
  reportTypeKey?: string | null;

  // legacy
  period_start?: string | null;
  period_end?: string | null;

  // draft
  draft_period_start?: string | null;
  draft_period_end?: string | null;

  // published
  published_period_start?: string | null;
  published_period_end?: string | null;
  published_at?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type CsvUploadMetaItem = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  path: string;
  created_at: string;
  bucket?: string;
};

type IngestionUiInfo = {
  status: "idle" | "queued" | "processing" | "done" | "failed";
  progress: number;
  totalLines: number;
  parsedLines: number;
  inserted: number;
  validRows: number;
  batchSize: number;
  committedBatches: number;
  error: string;
  startedAt: string;
  finishedAt: string;
};

async function fetchReportDetail(reportId: string): Promise<ReportDetail> {
  const res = await authFetch(`/api/reports/${reportId}`);
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Failed to fetch report (${res.status})`);
  }
  return (json.report ?? {}) as ReportDetail;
}

async function patchReportPeriodDraft(
  reportId: string,
  next: ReportPeriod
): Promise<ReportDetail> {
  const res = await authFetch(`/api/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft_period_start: next.startDate || null,
      draft_period_end: next.endDate || null,
    }),
  });

  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.error || `Failed to save report period (${res.status})`
    );
  }

  return (json.report ?? {}) as ReportDetail;
}

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

function nowIso() {
  return new Date().toISOString();
}

function cleanUploadFileName(name: string) {
  let base = String(name || "").split("/").pop() || name || "upload.csv";
  base = base.replace(/[\\]/g, "_");
  base = base.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  try {
    base = base.normalize("NFC");
  } catch {}

  return base || "upload.csv";
}

async function uploadCsvDirectToStorage(params: {
  reportId: string;
  workspaceId: string;
  file: File;
}) {
  const { reportId, workspaceId, file } = params;

  const fileName = cleanUploadFileName(file.name || "upload.csv");
  const ts = Date.now();
  const path = `workspaces/${workspaceId}/reports/${reportId}/csv/${ts}_${fileName}`;

  const { error } = await supabase.storage.from(CSV_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "text/csv",
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(error.message || "CSV direct upload failed");
  }

  const item: CsvUploadMetaItem = {
    id: String(ts),
    name: fileName,
    size: file.size,
    contentType: file.type || "text/csv",
    path,
    created_at: nowIso(),
    bucket: CSV_BUCKET,
  };

  return { ok: true as const, item };
}

async function finalizeCsvUploadMeta(
  reportId: string,
  item: CsvUploadMetaItem
) {
  const res = await authFetch(`/api/uploads/csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "finalize",
      reportId,
      item,
    }),
  });

  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.detail || json?.error || `CSV finalize failed (${res.status})`
    );
  }

  return json;
}

async function uploadCsv(params: {
  reportId: string;
  workspaceId: string;
  file: File;
}) {
  const direct = await uploadCsvDirectToStorage(params);
  const finalized = await finalizeCsvUploadMeta(params.reportId, direct.item);

  return {
    ok: true,
    item: direct.item,
    finalize: finalized,
  };
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
  reportTypeKey: string;
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
 * Publish
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

function formatInt(v: number) {
  const n = Number(v || 0);
  return new Intl.NumberFormat("ko-KR").format(n);
}

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

function extractIngestionInfo(
  detail: ReportDetail | null | undefined
): IngestionUiInfo {
  const ingestion = detail?.meta?.ingestion ?? {};

  const rawStatus = asStr(ingestion?.status);
  const status =
    rawStatus === "queued" ||
    rawStatus === "processing" ||
    rawStatus === "done" ||
    rawStatus === "failed"
      ? rawStatus
      : "idle";

  const progress = Math.max(0, Math.min(100, asNum(ingestion?.progress)));
  const totalLines = asNum(ingestion?.total_lines);
  const parsedLines = asNum(ingestion?.parsed_lines);
  const inserted = asNum(ingestion?.inserted);
  const validRows = asNum(ingestion?.valid_rows);
  const batchSize = asNum(ingestion?.batch_size);
  const committedBatches = asNum(ingestion?.committed_batches);
  const error = asStr(ingestion?.error);
  const startedAt = asStr(ingestion?.started_at);
  const finishedAt = asStr(ingestion?.finished_at);

  return {
    status,
    progress,
    totalLines,
    parsedLines,
    inserted,
    validRows,
    batchSize,
    committedBatches,
    error,
    startedAt,
    finishedAt,
  };
}

async function fetchReportHeaderInfo(
  reportId: string
): Promise<ReportHeaderInfo> {
  try {
    const report = await fetchReportDetail(reportId);
    const meta =
      report?.meta && typeof report.meta === "object" ? report.meta : {};

    const reportTypeKey =
      asStr((report as any)?.report_type_key) ||
      asStr((report as any)?.reportTypeKey) ||
      asStr(meta?.report_type_key) ||
      asStr(meta?.reportTypeKey) ||
      asStr(meta?.report_type);

    let reportTypeName =
      asStr((report as any)?.report_type_name) ||
      asStr((report as any)?.reportTypeName) ||
      asStr(meta?.report_type_name) ||
      asStr(meta?.reportTypeName);

    const keyLower = reportTypeKey.toLowerCase();

    if (keyLower === "traffic") {
      reportTypeName = "트래픽 리포트";
    } else if (keyLower === "commerce") {
      reportTypeName = reportTypeName || "커머스 매출 리포트";
    }

    return {
      advertiserName:
        asStr((report as any)?.advertiser_name) ||
        asStr((report as any)?.advertiserName) ||
        asStr((report as any)?.advertiser) ||
        asStr(meta?.advertiser_name) ||
        asStr(meta?.advertiserName) ||
        asStr(meta?.advertiser) ||
        "",
      reportTypeName,
      reportTypeKey,
    };
  } catch {
    return {
      advertiserName: "",
      reportTypeName: "",
      reportTypeKey: "",
    };
  }
}

/* =========================================================
 * localStorage helpers
 * ========================================================= */

function getReportPeriodStorageKey(reportId: string) {
  return `nature_report_period_${reportId}`;
}

function parseStoredReportPeriod(raw: string | null): ReportPeriod | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const preset = asStr((parsed as any).preset);
    const startDate = asStr((parsed as any).startDate);
    const endDate = asStr((parsed as any).endDate);

    const validPreset =
      preset === "this_month" ||
      preset === "last_month" ||
      preset === "last_7_days" ||
      preset === "last_30_days" ||
      preset === "custom";

    if (!validPreset) return null;
    if (!startDate || !endDate) return null;

    return {
      preset: preset as ReportPeriod["preset"],
      startDate,
      endDate,
    };
  } catch {
    return null;
  }
}

function reportPeriodToStableKey(v: ReportPeriod | null | undefined) {
  if (!v) return "";
  return JSON.stringify({
    preset: v.preset || "custom",
    startDate: v.startDate || "",
    endDate: v.endDate || "",
  });
}

function buildInitialReportPeriod(args: {
  report: ReportDetail | null;
  reportId: string;
  rowsRange: { startDate: string; endDate: string } | null;
}): ReportPeriod | null {
  const { report, reportId, rowsRange } = args;

  const meta =
    report?.meta && typeof report.meta === "object" ? report.meta : {};

  const reportTypeKey =
    asStr((report as any)?.report_type_key) ||
    asStr((report as any)?.reportTypeKey) ||
    asStr(meta?.report_type_key) ||
    asStr(meta?.reportTypeKey) ||
    asStr(meta?.report_type);

  const reportTypeName =
    asStr((report as any)?.report_type_name) ||
    asStr((report as any)?.reportTypeName) ||
    asStr(meta?.report_type_name) ||
    asStr(meta?.reportTypeName);

  const typeLower = `${reportTypeKey} ${reportTypeName}`.toLowerCase();
  const isTraffic =
    typeLower.includes("traffic") || typeLower.includes("트래픽");

  if (isTraffic && rowsRange?.startDate && rowsRange?.endDate) {
    return {
      preset: "custom",
      startDate: rowsRange.startDate,
      endDate: rowsRange.endDate,
    };
  }

  const draftStart = asStr(report?.draft_period_start);
  const draftEnd = asStr(report?.draft_period_end);

  if (draftStart && draftEnd) {
    return {
      preset: "custom",
      startDate: draftStart,
      endDate: draftEnd,
    };
  }

  if (typeof window !== "undefined" && reportId) {
    const stored = parseStoredReportPeriod(
      window.localStorage.getItem(getReportPeriodStorageKey(reportId))
    );
    if (stored) return stored;
  }

  const legacyStart = asStr(report?.period_start);
  const legacyEnd = asStr(report?.period_end);

  if (legacyStart && legacyEnd) {
    return {
      preset: "custom",
      startDate: legacyStart,
      endDate: legacyEnd,
    };
  }

  if (rowsRange?.startDate && rowsRange?.endDate) {
    return {
      preset: "custom",
      startDate: rowsRange.startDate,
      endDate: rowsRange.endDate,
    };
  }

  return null;
}

/* =========================================================
 * [변경 포인트] Preview 분리
 * 좌측 업로드/상태 변경이 발생해도
 * preview props가 같으면 ReportTemplate 재렌더를 최대한 막는다.
 * ========================================================= */

type PreviewPaneProps = {
  previewKey: string;
  loadingRows: boolean;
  rows: any[];
  creativesMap: Record<string, string>;
  advertiserName: string;
  reportTypeName: string;
  reportTypeKey: string;
  reportPeriod: ReportPeriod;
  onChangeReportPeriod: React.Dispatch<React.SetStateAction<ReportPeriod>>;
  reportCaptureRef: React.RefObject<HTMLDivElement | null>;
  onDownloadPdf: () => Promise<void>;
  onDownloadPng: () => Promise<void>;
  onDownloadCsv: () => Promise<void>;
  pdfLoading: boolean;
  pngLoading: boolean;
  csvLoading: boolean;
};

const PreviewPane = memo(function PreviewPane({
  previewKey,
  loadingRows,
  rows,
  creativesMap,
  advertiserName,
  reportTypeName,
  reportTypeKey,
  reportPeriod,
  onChangeReportPeriod,
  reportCaptureRef,
  onDownloadPdf,
  onDownloadPng,
  onDownloadCsv,
  pdfLoading,
  pngLoading,
  csvLoading,
}: PreviewPaneProps) {
  return (
    <div className="col-span-12 lg:col-span-8">
      <div className="rounded-lg border">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">미리보기</div>
            <div className="text-xs text-gray-500">
              draft period 기준 편집 미리보기
            </div>
          </div>

          <div className="shrink-0">
            <ReportDownloadButtons
              onDownloadPdf={onDownloadPdf}
              onDownloadPng={onDownloadPng}
              onDownloadCsv={onDownloadCsv}
              pdfLoading={pdfLoading}
              pngLoading={pngLoading}
              csvLoading={csvLoading}
            />
          </div>
        </div>

        <div className="p-4">
          <div ref={reportCaptureRef}>
            <div
              style={{
                transform: "scale(1)",
                transformOrigin: "top center",
              }}
            >
              <ReportTemplate
                key={previewKey}
                rows={rows}
                isLoading={loadingRows}
                creativesMap={creativesMap}
                advertiserName={advertiserName}
                reportTypeName={reportTypeName}
                reportTypeKey={reportTypeKey}
                reportPeriod={reportPeriod}
                onChangeReportPeriod={onChangeReportPeriod}
                hidePeriodEditor={true}
                hideTabPeriodText={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function ReportDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const reportId = normalizeReportId(params?.id);

  const sessionStartedAtRef = useRef<number | null>(null);
  const [sessionStartedText, setSessionStartedText] = useState<string>("-");

  const [sessionIngested, setSessionIngested] = useState(false);
  const [sessionCreativesUploaded, setSessionCreativesUploaded] =
    useState(false);

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});
  const [headerInfo, setHeaderInfo] = useState<ReportHeaderInfo>({
    advertiserName: "",
    reportTypeName: "",
    reportTypeKey: "",
  });
  const [previewVersion, setPreviewVersion] = useState(0);

  const [publishing, setPublishing] = useState(false);
  const [sharePath, setSharePath] = useState<string>("");

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [lastUploadedCsvName, setLastUploadedCsvName] = useState<string>("");
  const [ingestionStatus, setIngestionStatus] = useState<
    "idle" | "queued" | "processing" | "done" | "failed"
  >("idle");
  const [ingestionInfo, setIngestionInfo] = useState<IngestionUiInfo>({
    status: "idle",
    progress: 0,
    totalLines: 0,
    parsedLines: 0,
    inserted: 0,
    validRows: 0,
    batchSize: 0,
    committedBatches: 0,
    error: "",
    startedAt: "",
    finishedAt: "",
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingBusyRef = useRef(false);

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

  const didInitReportPeriodFromSourceRef = useRef(false);
  const saveDraftPeriodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastSavedReportPeriodKeyRef = useRef<string>("");

  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(() =>
    resolvePresetPeriod()
  );

  const displayRows = rows;
  const displayCreativesMap = creativesMap;

  /**
   * [변경 포인트]
   * 큰 rows / creativesMap 반영 시 UI 블로킹을 완화
   * 미리보기는 약간 늦게 따라와도 안전한 영역이라 deferred 적용
   */
  const deferredDisplayRows = useDeferredValue(displayRows);
  const deferredDisplayCreativesMap = useDeferredValue(displayCreativesMap);

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

  const rowsRange = useMemo(() => {
    return getRowsDateRange(displayRows as any[]);
  }, [displayRows]);

  const ingestionStatusLabel = useMemo(() => {
    if (ingestionStatus === "idle") return "대기";
    if (ingestionStatus === "queued") return "업로드 완료 / 시작 대기";
    if (ingestionStatus === "processing") return "파싱 중";
    if (ingestionStatus === "done") return "완료";
    if (ingestionStatus === "failed") return "실패";
    return "대기";
  }, [ingestionStatus]);

  useEffect(() => {
    const initial = buildInitialReportPeriod({
      report,
      reportId,
      rowsRange: rowsRange?.startDate && rowsRange?.endDate ? rowsRange : null,
    });

    if (!initial) return;
    if (didInitReportPeriodFromSourceRef.current) return;

    setReportPeriod(initial);
    didInitReportPeriodFromSourceRef.current = true;
    lastSavedReportPeriodKeyRef.current = reportPeriodToStableKey(initial);
  }, [report, reportId, rowsRange]);

  useEffect(() => {
    if (!reportId || typeof window === "undefined") return;
    const key = getReportPeriodStorageKey(reportId);
    window.localStorage.setItem(key, JSON.stringify(reportPeriod));
  }, [reportId, reportPeriod]);

  useEffect(() => {
    if (!reportId) return;
    if (!didInitReportPeriodFromSourceRef.current) return;

    const nextKey = reportPeriodToStableKey(reportPeriod);
    if (!nextKey) return;
    if (nextKey === lastSavedReportPeriodKeyRef.current) return;

    if (saveDraftPeriodTimerRef.current) {
      clearTimeout(saveDraftPeriodTimerRef.current);
      saveDraftPeriodTimerRef.current = null;
    }

    saveDraftPeriodTimerRef.current = setTimeout(async () => {
      try {
        const updated = await patchReportPeriodDraft(reportId, reportPeriod);
        setReport((prev) => ({ ...(prev ?? {}), ...(updated ?? {}) }));
        lastSavedReportPeriodKeyRef.current = nextKey;
      } catch (e: any) {
        console.error("[reportPeriod save failed]", e);
      }
    }, 500);

    return () => {
      if (saveDraftPeriodTimerRef.current) {
        clearTimeout(saveDraftPeriodTimerRef.current);
        saveDraftPeriodTimerRef.current = null;
      }
    };
  }, [reportId, reportPeriod]);

  const rowsSignature = useMemo(() => {
    if (!deferredDisplayRows.length) return "rows:0";

    const first = deferredDisplayRows[0];
    const second = deferredDisplayRows[1];
    const last = deferredDisplayRows[deferredDisplayRows.length - 1];
    const prev = deferredDisplayRows[deferredDisplayRows.length - 2];

    return [
      `len:${deferredDisplayRows.length}`,
      `f1:${rowFingerprint(first)}`,
      `f2:${rowFingerprint(second)}`,
      `l2:${rowFingerprint(prev)}`,
      `l1:${rowFingerprint(last)}`,
    ].join("||");
  }, [deferredDisplayRows]);

  const advertiserNameFromRows = useMemo(() => {
    return extractAdvertiserName(rows);
  }, [rows]);

  const headerFallbackFromRows = useMemo(() => {
    let advertiserName = "";
    let reportTypeName = "";

    for (const r of rows ?? []) {
      if (!advertiserName) {
        advertiserName =
          asStr(r?.advertiser_name) ||
          asStr(r?.advertiserName) ||
          asStr(r?.advertiser) ||
          asStr(r?.account) ||
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
    headerInfo.advertiserName ||
    advertiserNameFromRows ||
    headerFallbackFromRows.advertiserName ||
    "";

  const effectivePreviewReportTypeName = useMemo(() => {
    const keyLower = asStr(headerInfo.reportTypeKey).toLowerCase();

    if (keyLower === "traffic") return "트래픽 리포트";
    if (keyLower === "commerce") {
      return headerInfo.reportTypeName || "커머스 매출 리포트";
    }

    const name =
      headerInfo.reportTypeName || headerFallbackFromRows.reportTypeName || "";

    if (name.toLowerCase().includes("traffic") || name.includes("트래픽")) {
      return "트래픽 리포트";
    }

    return name;
  }, [
    headerInfo.reportTypeKey,
    headerInfo.reportTypeName,
    headerFallbackFromRows.reportTypeName,
  ]);

  const previewKey = useMemo(() => {
    return [
      reportId || "",
      effectivePreviewAdvertiserName,
      effectivePreviewReportTypeName,
      rowsSignature,
      creativesUrlCount,
      previewVersion,
      reportPeriod.startDate,
      reportPeriod.endDate,
      reportPeriod.preset,
    ].join("|");
  }, [
    reportId,
    effectivePreviewAdvertiserName,
    effectivePreviewReportTypeName,
    rowsSignature,
    creativesUrlCount,
    previewVersion,
    reportPeriod.startDate,
    reportPeriod.endDate,
    reportPeriod.preset,
  ]);

  const previewPeriodLabel = useMemo(() => {
    return getPeriodLabel(reportPeriod);
  }, [reportPeriod]);

  const canPublish =
    sessionIngested &&
    !publishing &&
    !loadingRows &&
    Array.isArray(rows) &&
    rows.length > 0;

  const canOpenExportBuilder = ENABLE_EXPORT_BUILDER_ENTRY && canPublish;

  const reportTitleForDownload = effectivePreviewReportTypeName || "report";
  const advertiserNameForDownload =
    effectivePreviewAdvertiserName || "advertiser";

  async function refreshRows(): Promise<{ rowsCount: number }> {
    if (!reportId) return { rowsCount: 0 };

    setLoadingRows(true);
    setMsg("");

    let nextMsg = "";
    let fetchedRowsCount = 0;

    try {
      try {
        const detail = await fetchReportDetail(reportId);
        setReport(detail);

        const info = extractIngestionInfo(detail);
        setIngestionInfo(info);
        setIngestionStatus(info.status);
      } catch (e: any) {
        console.error("[refreshRows] report detail failed", e);
        nextMsg += `report 조회 실패: ${e?.message || "unknown"}\n`;
      }

      try {
        const rws = await fetchRows(reportId);
        const nextRows = Array.isArray(rws) ? [...rws] : [];
        fetchedRowsCount = nextRows.length;
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
        fetchedRowsCount = 0;
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

        const nextReportTypeKey = asStr(hdr?.reportTypeKey);
        let nextReportTypeName = asStr(hdr?.reportTypeName);

        const typeLower =
          `${nextReportTypeKey} ${nextReportTypeName}`.toLowerCase();

        if (typeLower.includes("traffic") || typeLower.includes("트래픽")) {
          nextReportTypeName = "트래픽 리포트";
        } else if (
          nextReportTypeKey.toLowerCase() === "commerce" &&
          !nextReportTypeName
        ) {
          nextReportTypeName = "커머스 매출 리포트";
        }

        setHeaderInfo({
          advertiserName: asStr(hdr?.advertiserName),
          reportTypeName: nextReportTypeName,
          reportTypeKey: nextReportTypeKey,
        });
      } catch (e: any) {
        console.error("[refreshRows] headerInfo failed", e);
        setHeaderInfo({
          advertiserName: "",
          reportTypeName: "",
          reportTypeKey: "",
        });
        nextMsg += `header 조회 실패: ${e?.message || "unknown"}\n`;
      }

      setPreviewVersion((v) => v + 1);

      if (nextMsg.trim()) {
        setMsg(nextMsg.trim());
      }

      return { rowsCount: fetchedRowsCount };
    } finally {
      setLoadingRows(false);
    }
  }

  async function pollIngestionStatus(targetReportId: string) {
    if (!targetReportId) return;

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    pollingRef.current = setInterval(async () => {
      /**
       * [변경 포인트]
       * polling 중첩 호출 방지
       * 이전 요청이 끝나기 전에 다음 interval이 들어오면 skip
       */
      if (pollingBusyRef.current) return;
      pollingBusyRef.current = true;

      try {
        const detail = await fetchReportDetail(targetReportId);
        const info = extractIngestionInfo(detail);

        setReport(detail);
        setIngestionInfo(info);
        setIngestionStatus(info.status);

        if (info.status === "done") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          const refreshed = await refreshRows();
          setSessionIngested((refreshed?.rowsCount ?? 0) > 0);

          setMsg(
            `파싱 완료${
              info.inserted > 0 ? ` (inserted: ${formatInt(info.inserted)})` : ""
            } → 미리보기에 반영되었습니다.`
          );
        }

        if (info.status === "failed") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          setMsg(info.error || "CSV 파싱 실패");
        }
      } catch (e) {
        console.error("[polling ingestion]", e);
      } finally {
        pollingBusyRef.current = false;
      }
    }, 700);
  }

  useEffect(() => {
    if (!reportId) return;

    sessionStartedAtRef.current = Date.now();
    setSessionStartedText("-");

    setSessionIngested(false);
    setSessionCreativesUploaded(false);

    setSharePath("");
    setMsg("");

    setReport(null);
    setCreativeUploadLog([]);
    setLastUploadedCreativeCount(0);
    setRows([]);
    setCreativesMap({});
    setHeaderInfo({
      advertiserName: "",
      reportTypeName: "",
      reportTypeKey: "",
    });
    setPreviewVersion(0);

    didInitReportPeriodFromSourceRef.current = false;
    lastSavedReportPeriodKeyRef.current = "";
    if (saveDraftPeriodTimerRef.current) {
      clearTimeout(saveDraftPeriodTimerRef.current);
      saveDraftPeriodTimerRef.current = null;
    }

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingBusyRef.current = false;

    setIngestionStatus("idle");
    setIngestionInfo({
      status: "idle",
      progress: 0,
      totalLines: 0,
      parsedLines: 0,
      inserted: 0,
      validRows: 0,
      batchSize: 0,
      committedBatches: 0,
      error: "",
      startedAt: "",
      finishedAt: "",
    });

    setReportPeriod(resolvePresetPeriod());

    void refreshRows();

    const d = new Date(sessionStartedAtRef.current);
    setSessionStartedText(d.toLocaleString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      pollingBusyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const notice = searchParams?.get("eb_notice");
    if (!notice) return;

    setMsg(notice);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("eb_notice");

    const nextUrl = next.toString()
      ? `${pathname}?${next.toString()}`
      : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  async function handleUploadCsv() {
    if (!reportId) return;

    if (!csvFile) {
      setMsg("CSV 파일을 선택하세요.");
      return;
    }

    setCsvUploading(true);
    setMsg("");

    try {
      let currentReport = report;

      if (!currentReport?.workspace_id) {
        currentReport = await fetchReportDetail(reportId);
        setReport(currentReport);
      }

      const workspaceId = asStr(currentReport?.workspace_id);
      if (!workspaceId) {
        throw new Error(
          "workspace_id를 확인할 수 없습니다. report detail 응답을 확인하세요."
        );
      }

      const up = await uploadCsv({
        reportId,
        workspaceId,
        file: csvFile,
      });

      const uploadedName =
        up?.item?.name || (up?.item as any)?.file_name || csvFile.name || "";
      if (uploadedName) setLastUploadedCsvName(String(uploadedName));

      setMsg("CSV 업로드 완료 → 파싱 시작 중...");
      setIngestionStatus("processing");
      setIngestionInfo((prev) => ({
        ...prev,
        status: "processing",
        progress: 3,
        parsedLines: 0,
        totalLines: 0,
        inserted: 0,
        validRows: 0,
        error: "",
      }));

      runIngestion(reportId).catch((e) => {
        console.error("[runIngestion async failed]", e);
        setIngestionStatus("failed");
        setIngestionInfo((prev) => ({
          ...prev,
          status: "failed",
          error: e?.message || "CSV 파싱 시작 실패",
        }));
        setMsg(e?.message || "CSV 파싱 시작 실패");
      });

      void pollIngestionStatus(reportId);

      setCsvFile(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
    } catch (e: any) {
      setMsg(e?.message || "CSV 업로드 실패");
      setIngestionStatus("failed");
      setIngestionInfo((prev) => ({
        ...prev,
        status: "failed",
        error: e?.message || "CSV 업로드 실패",
      }));
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

      await refreshRows();
    } catch (e: any) {
      setMsg(e?.message || "발행 실패");
    } finally {
      setPublishing(false);
    }
  }

  function handleOpenExportBuilder() {
    if (!reportId) return;

    if (!ENABLE_EXPORT_BUILDER_ENTRY) {
      return;
    }

    if (!canOpenExportBuilder) {
      setMsg(
        "이번 세션에서 CSV 업로드 + 파싱을 완료한 뒤 Export Builder를 열 수 있습니다."
      );
      return;
    }

    const qs = new URLSearchParams();
    qs.set("advertiserName", effectivePreviewAdvertiserName || "광고주");
    qs.set("reportTypeName", effectivePreviewReportTypeName || "리포트");
    qs.set("periodLabel", previewPeriodLabel || "기간 미정");
    qs.set("periodStart", reportPeriod.startDate || "");
    qs.set("periodEnd", reportPeriod.endDate || "");
    qs.set("periodPreset", reportPeriod.preset || "custom");
    qs.set("preset", "starter-default");

    router.push(`/report-builder/${reportId}/export-builder?${qs.toString()}`);
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

  async function handleDownloadCsv() {
    try {
      setCsvLoading(true);

      const fileName = buildReportFileName({
        advertiserName: advertiserNameForDownload,
        reportTitle: reportTitleForDownload,
        ext: "csv",
      });

      await downloadCsvFile({
        rows: displayRows,
        fileName,
      });

      console.log("[download:csv:done]", {
        fileName,
        rows: displayRows.length,
      });

      setMsg(`CSV 다운로드 완료: ${fileName}`);
    } catch (e: any) {
      console.error("[download:csv:error]", e);
      setMsg(e?.message || "CSV 다운로드 중 오류가 발생했습니다.");
    } finally {
      setCsvLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight">리포트 편집</div>
          <div className="mt-1 text-sm text-gray-500">
            업로드/파싱/소재 매칭/발행까지 한 화면에서 진행합니다.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canOpenExportBuilder ? (
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              onClick={handleOpenExportBuilder}
            >
              Export Builder 열기
            </button>
          ) : null}

          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              canPublish
                ? "bg-black hover:opacity-90"
                : "cursor-not-allowed bg-gray-300"
            }`}
            onClick={handlePublish}
            disabled={!canPublish}
          >
            {publishing ? "발행 중..." : "발행"}
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border bg-white p-4 lg:grid-cols-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">Report ID</div>
          <div className="mt-1 break-all font-mono text-sm">{reportId || "-"}</div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">세션 시작</div>
          <div className="mt-1 text-sm font-medium">{sessionStartedText}</div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">CSV 파싱 상태</div>
          <div className="mt-1 text-sm font-medium">{ingestionStatusLabel}</div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${
                ingestionStatus === "failed"
                  ? "bg-red-500"
                  : ingestionStatus === "done"
                  ? "bg-green-500"
                  : "bg-black"
              }`}
              style={{
                width: `${Math.max(
                  ingestionStatus === "queued" ? 5 : 0,
                  ingestionInfo.progress
                )}%`,
              }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-500">
            진행률 {formatInt(ingestionInfo.progress)}%{" "}
            <span className="text-gray-300">·</span> parsed{" "}
            {formatInt(ingestionInfo.parsedLines)} /{" "}
            {formatInt(ingestionInfo.totalLines)}{" "}
            <span className="text-gray-300">·</span> inserted{" "}
            {formatInt(ingestionInfo.inserted)}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">공유 URL</div>
          <div className="mt-1 text-sm">
            {sharePath ? (
              <a
                href={fullUrl(sharePath)}
                target="_blank"
                rel="noreferrer"
                className="break-all text-blue-600 underline"
              >
                {fullUrl(sharePath)}
              </a>
            ) : (
              "-"
            )}
          </div>
        </div>
      </div>

      {msg ? (
        <div className="mb-4 rounded-lg border bg-gray-50 px-4 py-3 text-sm whitespace-pre-wrap">
          {msg}
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 space-y-5 lg:col-span-4">
          <div className="rounded-lg border p-4">
            <div className="mb-1 text-sm font-semibold">CSV 업로드</div>
            <div className="mb-3 text-xs text-gray-500">
              브라우저에서 Storage로 직접 업로드 후 finalize 합니다.
            </div>

            <div className="space-y-3">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setCsvFile(next);
                }}
                className="block w-full text-sm"
              />

              <div className="text-xs text-gray-600">
                {csvFile ? (
                  <>
                    선택됨: <span className="font-medium">{csvFile.name}</span>{" "}
                    <span className="text-gray-400">·</span>{" "}
                    {humanSize(csvFile.size)}
                  </>
                ) : lastUploadedCsvName ? (
                  <>
                    마지막 업로드:{" "}
                    <span className="font-medium">{lastUploadedCsvName}</span>
                  </>
                ) : (
                  "CSV 파일을 선택하세요"
                )}
              </div>

              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  csvUploading ||
                  ingestionStatus === "queued" ||
                  ingestionStatus === "processing"
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-black hover:opacity-90"
                }`}
                onClick={handleUploadCsv}
                disabled={
                  csvUploading ||
                  ingestionStatus === "queued" ||
                  ingestionStatus === "processing"
                }
              >
                {csvUploading
                  ? "업로드 중..."
                  : ingestionStatus === "queued"
                  ? "파싱 시작 중..."
                  : ingestionStatus === "processing"
                  ? `파싱 중... ${formatInt(ingestionInfo.progress)}%`
                  : "CSV 업로드"}
              </button>

              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-gray-700">
                    {ingestionStatusLabel}
                  </span>
                  <span className="text-gray-500">
                    {formatInt(ingestionInfo.progress)}%
                  </span>
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      ingestionStatus === "failed"
                        ? "bg-red-500"
                        : ingestionStatus === "done"
                        ? "bg-green-500"
                        : "bg-black"
                    }`}
                    style={{
                      width: `${Math.max(
                        ingestionStatus === "queued" ? 5 : 0,
                        ingestionInfo.progress
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    parsed:{" "}
                    <span className="font-medium text-gray-800">
                      {formatInt(ingestionInfo.parsedLines)}
                    </span>
                  </div>
                  <div>
                    total:{" "}
                    <span className="font-medium text-gray-800">
                      {formatInt(ingestionInfo.totalLines)}
                    </span>
                  </div>
                  <div>
                    inserted:{" "}
                    <span className="font-medium text-gray-800">
                      {formatInt(ingestionInfo.inserted)}
                    </span>
                  </div>
                  <div>
                    valid:{" "}
                    <span className="font-medium text-gray-800">
                      {formatInt(ingestionInfo.validRows)}
                    </span>
                  </div>
                  <div>
                    batch size:{" "}
                    <span className="font-medium text-gray-800">
                      {formatInt(ingestionInfo.batchSize)}
                    </span>
                  </div>
                  <div>
                    batches:{" "}
                    <span className="font-medium text-gray-800">
                      {formatInt(ingestionInfo.committedBatches)}
                    </span>
                  </div>
                </div>

                {ingestionInfo.error ? (
                  <div className="mt-2 text-xs text-red-600">
                    {ingestionInfo.error}
                  </div>
                ) : null}
              </div>

              <div className="text-xs text-gray-500">
                업로드 완료 후 파싱 상태와 진행률은 자동으로 갱신됩니다.
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="mb-1 text-sm font-semibold">소재 업로드</div>
            <div className="mb-3 text-xs text-gray-500">
              소재 이미지를 업로드하면 creative key 기준으로 매칭됩니다.
            </div>

            <div className="space-y-3">
              <input
                ref={creativesInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const list = Array.from(e.target.files || []);
                  setCreativeFiles(list);
                }}
                className="block w-full text-sm"
              />

              <div className="text-xs text-gray-600">
                {creativeFiles.length > 0 ? (
                  <>
                    선택됨:{" "}
                    <span className="font-medium">{creativeFiles.length}</span>개
                  </>
                ) : lastUploadedCreativeCount > 0 ? (
                  <>
                    마지막 업로드:{" "}
                    <span className="font-medium">
                      {lastUploadedCreativeCount}
                    </span>
                    개
                  </>
                ) : (
                  "이미지 파일을 선택하세요"
                )}
              </div>

              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  uploadingCreatives
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-black hover:opacity-90"
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
              <div className="mt-3 rounded-md border bg-white p-2">
                <div className="mb-2 text-xs font-semibold">
                  업로드 결과(이번 세션)
                </div>
                <div className="max-h-40 space-y-1 overflow-auto">
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
            <div className="mb-1 text-sm font-semibold">매칭된 소재</div>

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

        <PreviewPane
          previewKey={previewKey}
          loadingRows={loadingRows}
          rows={deferredDisplayRows}
          creativesMap={deferredDisplayCreativesMap}
          advertiserName={effectivePreviewAdvertiserName}
          reportTypeName={effectivePreviewReportTypeName}
          reportTypeKey={headerInfo.reportTypeKey}
          reportPeriod={reportPeriod}
          onChangeReportPeriod={setReportPeriod}
          reportCaptureRef={reportCaptureRef}
          onDownloadPdf={handleDownloadPdf}
          onDownloadPng={handleDownloadPng}
          onDownloadCsv={handleDownloadCsv}
          pdfLoading={pdfLoading}
          pngLoading={pngLoading}
          csvLoading={csvLoading}
        />
      </div>

      <div className="mt-2 text-xs text-gray-500">
        서버 rows(실제): {rows.length}개{" "}
        <span className="text-gray-400">·</span> 현재 표시 rows:{" "}
        {displayRows.length}개{" "}
        <span className="text-gray-400">·</span> 광고주:{" "}
        {effectivePreviewAdvertiserName || "-"}{" "}
        <span className="text-gray-400">·</span> 유형:{" "}
        {effectivePreviewReportTypeName || "-"}{" "}
        <span className="text-gray-400">·</span> 기준 기간:{" "}
        {previewPeriodLabel || "-"}
      </div>
    </div>
  );
}