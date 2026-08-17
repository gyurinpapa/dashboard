// app/reports/[id]/page.tsx
"use client";

import {
  memo,
  useCallback,
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
const MAX_MEDIA_SYNC_DATE_WINDOW_DAYS = 31;

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

function pickDownloadFileNameFromContentDisposition(
  contentDisposition: string | null,
) {
  const header = String(contentDisposition ?? "").trim();
  if (!header) return "";

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const basicMatch = header.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1].trim();
  }

  return "";
}

function downloadBlobFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================================================
 * API helpers
 * ========================================================= */

type ReportDataSourceKind = "csv" | "api";

type ReportDetail = {
  id: string;
  title?: string | null;
  status?: string | null;
  meta?: any;
  workspace_id?: string | null;
  advertiser_id?: string | null;
  advertiser_public_slug?: string | null;

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

function normalizeReportDataSourceKind(value: any): ReportDataSourceKind {
  const kind = String(value ?? "").trim().toLowerCase();

  if (kind === "api") return "api";
  return "csv";
}

function getReportDataSourceKind(report: ReportDetail | null | undefined): ReportDataSourceKind {
  const meta =
    report?.meta && typeof report.meta === "object" ? report.meta : {};
  const dataSource =
    meta?.data_source && typeof meta.data_source === "object"
      ? meta.data_source
      : {};

  return normalizeReportDataSourceKind(dataSource?.kind);
}

function getReportDataSourceLabel(kind: ReportDataSourceKind) {
  return kind === "api" ? "API 연동" : "CSV 업로드";
}

function getReportDataSourceDescription(kind: ReportDataSourceKind) {
  if (kind === "api") {
    return "매체 API에서 선택 기간의 데이터를 가져오는 리포트입니다. CSV 업로드는 사용하지 않습니다.";
  }

  return "CSV 파일 업로드로 데이터를 구성하는 리포트입니다. 기준 기간은 업로드된 CSV 데이터 기준으로 자동 산정됩니다.";
}

type MediaSyncSettingsDraft = {
  dateFrom: string;
  dateTo: string;
  dataLevel: "keyword" | "creative" | "mixed" | "unknown";
  mode: "snapshot_replace";
};

function normalizeYmdInput(value: any) {
  const normalized = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (date.toISOString().slice(0, 10) !== normalized) {
    return "";
  }

  return normalized;
}

function getInclusiveDateWindowDays(dateFrom: string, dateTo: string) {
  const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00.000Z`);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return 0;
  }

  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

function isMediaSyncDateWindowAllowed(dateFrom: string, dateTo: string) {
  const days = getInclusiveDateWindowDays(dateFrom, dateTo);

  return days >= 1 && days <= MAX_MEDIA_SYNC_DATE_WINDOW_DAYS;
}

function normalizeMediaSyncDataLevel(value: any): MediaSyncSettingsDraft["dataLevel"] {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "keyword" ||
    normalized === "creative" ||
    normalized === "mixed" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return "keyword";
}

function buildEmptyMediaSyncSettingsDraft(): MediaSyncSettingsDraft {
  return {
    dateFrom: "",
    dateTo: "",
    dataLevel: "keyword",
    mode: "snapshot_replace",
  };
}

function extractMediaSyncSettingsFromReport(
  detail: ReportDetail | null | undefined,
): MediaSyncSettingsDraft {
  const meta =
    detail?.meta && typeof detail.meta === "object" ? detail.meta : {};
  const mediaSync =
    meta?.media_sync && typeof meta.media_sync === "object"
      ? meta.media_sync
      : {};

  return {
    dateFrom: normalizeYmdInput(mediaSync?.date_from),
    dateTo: normalizeYmdInput(mediaSync?.date_to),
    dataLevel: normalizeMediaSyncDataLevel(mediaSync?.data_level),
    mode: "snapshot_replace",
  };
}

function mediaSyncSettingsToStableKey(v: MediaSyncSettingsDraft) {
  return JSON.stringify({
    dateFrom: normalizeYmdInput(v.dateFrom),
    dateTo: normalizeYmdInput(v.dateTo),
    dataLevel: normalizeMediaSyncDataLevel(v.dataLevel),
    mode: "snapshot_replace",
  });
}

function isValidMediaSyncSettingsDraft(v: MediaSyncSettingsDraft) {
  const dateFrom = normalizeYmdInput(v.dateFrom);
  const dateTo = normalizeYmdInput(v.dateTo);

  return Boolean(
    dateFrom &&
      dateTo &&
      dateFrom <= dateTo &&
      isMediaSyncDateWindowAllowed(dateFrom, dateTo),
  );
}

function getMediaSyncSettingsError(v: MediaSyncSettingsDraft) {
  const dateFrom = normalizeYmdInput(v.dateFrom);
  const dateTo = normalizeYmdInput(v.dateTo);

  if (!dateFrom || !dateTo) {
    return "API 동기화 시작일과 종료일을 모두 입력하세요.";
  }

  if (dateFrom > dateTo) {
    return "API 동기화 시작일은 종료일보다 늦을 수 없습니다.";
  }

  if (!isMediaSyncDateWindowAllowed(dateFrom, dateTo)) {
    return "네이버 검색광고 API 동기화 기간은 31일 이내로 선택해주세요.";
  }

  return "";
}

type MonthGoalDraft = {
  revenue: string;
  cost: string;
  roas: string;
  conversions: string;
  clicks: string;
  ctr: string;
  cvr: string;
};

type BrandSearchContractMonth = {
  month: string;
  pc: string;
  mobile: string;
};

type BrandSearchContractsDraft = BrandSearchContractMonth[];

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

type RowsMetaResult = {
  rowsCount: number;
  ingestionIdUsed: string;
  fallbackUsed: boolean;
  metaOnly: boolean;
  minDate: string;
  maxDate: string;
};

function buildEmptyMonthGoal(): MonthGoalDraft {
  return {
    revenue: "",
    cost: "",
    roas: "",
    conversions: "",
    clicks: "",
    ctr: "",
    cvr: "",
  };
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateFromLooseMonthBase(base?: string | null) {
  const raw = String(base ?? "").trim();
  if (raw) {
    const normalized = raw.length === 7 ? `${raw}-01` : raw;
    const d = new Date(`${normalized.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return new Date();
}

function buildRecentBrandSearchMonthKeys(base?: string | null) {
  const baseDate = dateFromLooseMonthBase(base);
  const baseYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth();

  return [2, 1, 0].map((offset) => {
    return monthKeyFromDate(new Date(baseYear, baseMonth - offset, 1));
  });
}

function buildEmptyBrandSearchContracts(
  monthKeys: string[] = buildRecentBrandSearchMonthKeys(),
): BrandSearchContractsDraft {
  return monthKeys.map((month) => ({
    month,
    pc: "",
    mobile: "",
  }));
}

function normalizeContractInputValue(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeBrandSearchContractAmount(v: any) {
  const raw = normalizeContractInputValue(v);
  if (!raw) return "";

  const cleaned = raw.replace(/[₩,%\s]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return "";

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return raw;

  return String(Math.round(n));
}

function brandSearchContractsToStableKey(v: BrandSearchContractsDraft) {
  return JSON.stringify(
    (v ?? []).map((item) => ({
      month: normalizeContractInputValue(item.month),
      pc: normalizeContractInputValue(item.pc),
      mobile: normalizeContractInputValue(item.mobile),
    })),
  );
}

function brandSearchContractsToPayload(v: BrandSearchContractsDraft) {
  const out: Record<string, { pc: string; mobile: string }> = {};

  for (const item of v ?? []) {
    const month = normalizeContractInputValue(item.month);
    if (!month) continue;

    out[month] = {
      pc: normalizeBrandSearchContractAmount(item.pc),
      mobile: normalizeBrandSearchContractAmount(item.mobile),
    };
  }

  return out;
}

function extractBrandSearchContractsFromReport(
  detail: ReportDetail | null | undefined,
  monthKeys: string[],
): BrandSearchContractsDraft {
  const meta =
    detail?.meta && typeof detail.meta === "object" ? detail.meta : {};

  const source =
    meta?.brand_search_contracts && typeof meta.brand_search_contracts === "object"
      ? meta.brand_search_contracts
      : {};

  const byMonth = new Map<string, { pc: string; mobile: string }>();

  if (Array.isArray(source)) {
    for (const item of source) {
      const month = normalizeContractInputValue(item?.month);
      if (!month) continue;

      byMonth.set(month, {
        pc: normalizeContractInputValue(item?.pc),
        mobile: normalizeContractInputValue(item?.mobile),
      });
    }
  } else {
    for (const [month, value] of Object.entries(source)) {
      if (!value || typeof value !== "object") continue;

      byMonth.set(normalizeContractInputValue(month), {
        pc: normalizeContractInputValue((value as any)?.pc),
        mobile: normalizeContractInputValue((value as any)?.mobile),
      });
    }
  }

  return monthKeys.map((month) => {
    const saved = byMonth.get(month);

    return {
      month,
      pc: normalizeContractInputValue(saved?.pc),
      mobile: normalizeContractInputValue(saved?.mobile),
    };
  });
}

function normalizeGoalInputValue(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function toGoalNumber(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value)
    .replace(/[₩,%\s]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return 0;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toRoasMultiplier(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return value > 10 ? value / 100 : value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const hasPercent = raw.includes("%");
  const n = toGoalNumber(raw);

  if (!Number.isFinite(n) || n <= 0) return 0;

  if (hasPercent) return n / 100;
  return n > 10 ? n / 100 : n;
}

function formatGoalNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round(value));
}

function buildCommerceComputedRevenue(monthGoal: MonthGoalDraft) {
  const cost = toGoalNumber(monthGoal.cost);
  const roasMultiplier = toRoasMultiplier(monthGoal.roas);

  if (cost <= 0 || roasMultiplier <= 0) {
    return normalizeGoalInputValue(monthGoal.revenue);
  }

  return formatGoalNumber(cost * roasMultiplier);
}

function extractMonthGoalFromReport(
  detail: ReportDetail | null | undefined,
): MonthGoalDraft {
  const meta =
    detail?.meta && typeof detail.meta === "object" ? detail.meta : {};
  const monthGoal =
    meta?.month_goal && typeof meta.month_goal === "object"
      ? meta.month_goal
      : {};

  return {
    revenue: normalizeGoalInputValue(monthGoal?.revenue),
    cost: normalizeGoalInputValue(monthGoal?.cost),
    roas: normalizeGoalInputValue(monthGoal?.roas),
    conversions: normalizeGoalInputValue(monthGoal?.conversions),
    clicks: normalizeGoalInputValue(monthGoal?.clicks),
    ctr: normalizeGoalInputValue(monthGoal?.ctr),
    cvr: normalizeGoalInputValue(monthGoal?.cvr),
  };
}

function monthGoalToStableKey(v: MonthGoalDraft) {
  return JSON.stringify({
    revenue: normalizeGoalInputValue(v.revenue),
    cost: normalizeGoalInputValue(v.cost),
    roas: normalizeGoalInputValue(v.roas),
    conversions: normalizeGoalInputValue(v.conversions),
    clicks: normalizeGoalInputValue(v.clicks),
    ctr: normalizeGoalInputValue(v.ctr),
    cvr: normalizeGoalInputValue(v.cvr),
  });
}

async function fetchReportDetail(reportId: string): Promise<ReportDetail> {
  const res = await authFetch(`/api/reports/${reportId}`);
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Failed to fetch report (${res.status})`);
  }
  return (json.report ?? {}) as ReportDetail;
}


async function fetchWorkspaceLogoUrl(workspaceId: string): Promise<string> {
  const id = String(workspaceId ?? "").trim();
  if (!id) return "";

  const res = await authFetch("/api/workspaces/list");
  const json = await safeJson(res);

  if (!res.ok || !json?.ok) {
    return "";
  }

  const workspaces = Array.isArray(json?.workspaces)
    ? json.workspaces
    : [];

  const matched = workspaces.find(
    (item: any) =>
      String(item?.workspace_id ?? "").trim() === id,
  );

  return String(
    matched?.workspace_logo_url ?? "",
  ).trim();
}

async function patchReportPeriodDraft(
  reportId: string,
  next: ReportPeriod,
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
      json?.error || `Failed to save report period (${res.status})`,
    );
  }

  return (json.report ?? {}) as ReportDetail;
}

async function patchReportMonthGoal(
  reportId: string,
  next: MonthGoalDraft,
): Promise<ReportDetail> {
  const res = await authFetch(`/api/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      month_goal: {
        revenue: normalizeGoalInputValue(next.revenue),
        cost: normalizeGoalInputValue(next.cost),
        roas: normalizeGoalInputValue(next.roas),
        conversions: normalizeGoalInputValue(next.conversions),
        clicks: normalizeGoalInputValue(next.clicks),
        ctr: normalizeGoalInputValue(next.ctr),
        cvr: normalizeGoalInputValue(next.cvr),
      },
    }),
  });

  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Failed to save month goal (${res.status})`);
  }

  return (json.report ?? {}) as ReportDetail;
}

async function patchReportBrandSearchContracts(
  reportId: string,
  next: BrandSearchContractsDraft,
): Promise<ReportDetail> {
  const res = await authFetch(`/api/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand_search_contracts: brandSearchContractsToPayload(next),
    }),
  });

  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.error ||
        `Failed to save brand search contracts (${res.status})`,
    );
  }

  return (json.report ?? {}) as ReportDetail;
}

async function patchReportMediaSyncSettings(
  reportId: string,
  next: MediaSyncSettingsDraft,
): Promise<ReportDetail> {
  const dateFrom = normalizeYmdInput(next.dateFrom);
  const dateTo = normalizeYmdInput(next.dateTo);

  if (!dateFrom || !dateTo || dateFrom > dateTo || !isMediaSyncDateWindowAllowed(dateFrom, dateTo)) {
    throw new Error(getMediaSyncSettingsError(next) || "API 동기화 기간이 올바르지 않습니다.");
  }

  const res = await authFetch(`/api/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_sync: {
        date_from: dateFrom,
        date_to: dateTo,
        data_level: normalizeMediaSyncDataLevel(next.dataLevel),
        mode: "snapshot_replace",
      },
    }),
  });

  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.error || `Failed to save API sync settings (${res.status})`,
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

async function fetchRowsMeta(reportId: string): Promise<RowsMetaResult> {
  const res = await authFetch(
    `/api/reports/${reportId}/rows?metaOnly=1&debug=0`,
  );
  const json = await safeJson(res);

  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.error || `Failed to fetch rows meta (${res.status})`,
    );
  }

  return {
    rowsCount: asNum(json?.rows_count),
    ingestionIdUsed: asStr(json?.ingestion_id_used),
    fallbackUsed: !!json?.fallback_used,
    metaOnly: !!json?.meta_only,
    minDate: asStr(json?.min_date),
    maxDate: asStr(json?.max_date),
  };
}

type CreativesMapResult = {
  creativesMap: Record<string, string>;
  currentCreativesBatchId: string | null;
  strictCount: number;
  signedCount: number;
  notModified: boolean;
  expiresIn: number;
};

const CREATIVE_MAP_REUSE_MAX_AGE_MS = 45 * 60 * 1000;
const NULL_CREATIVE_BATCH_SENTINEL = "__NULL__";

async function fetchCreativesMap(
  reportId: string,
  knownBatchId?: string | null,
): Promise<CreativesMapResult> {
  const params = new URLSearchParams({
    expiresIn: "3600",
    mode: "expanded",
  });

  if (knownBatchId !== undefined) {
    params.set(
      "knownBatchId",
      knownBatchId ?? NULL_CREATIVE_BATCH_SENTINEL,
    );
  }

  const res = await authFetch(
    `/api/reports/${reportId}/assets/creatives/map?${params.toString()}`,
  );
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.error || `Failed to fetch creativesMap (${res.status})`,
    );
  }

  const currentCreativesBatchId =
    json?.meta?.currentCreativesBatchId == null ||
    String(json.meta.currentCreativesBatchId).trim() === ""
      ? null
      : String(json.meta.currentCreativesBatchId).trim();

  return {
    creativesMap:
      json?.creativesMap && typeof json.creativesMap === "object"
        ? json.creativesMap
        : {},
    currentCreativesBatchId,
    strictCount: Math.max(0, asNum(json?.meta?.strictCount)),
    signedCount: Math.max(0, asNum(json?.meta?.signedCount)),
    notModified: json?.notModified === true,
    expiresIn: Math.max(0, asNum(json?.meta?.expiresIn)),
  };
}

async function runIngestion(reportId: string) {
  const res = await authFetch(`/api/reports/${reportId}/ingestion/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },

    /**
     * ✅ 대용량 CSV 안정화
     * - 기존 replace는 API 요청 안에서 CSV 파싱/insert까지 실행했다.
     * - queue는 ingestion_jobs에 작업만 등록하고 즉시 응답한다.
     * - 실제 파싱/insert는 다음 단계 worker가 처리한다.
     */
    body: JSON.stringify({ mode: "queue" }),
  });

  const json = await safeJson(res);

  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.detail || json?.error || `Ingestion queue failed (${res.status})`,
    );
  }

  return json;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanUploadFileName(name: string) {
  let base =
    String(name || "")
      .split("/")
      .pop() ||
    name ||
    "upload.csv";
  base = base.replace(/[\\]/g, "_");
  base = base
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  item: CsvUploadMetaItem,
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
      json?.detail || json?.error || `CSV finalize failed (${res.status})`,
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
  const EXPECTED_NULL_BATCH = "__NULL__";

  let batchId: string | undefined;
  let expectedCurrentCreativesBatchId: string | null | undefined;
  const allItems: any[] = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const chunk = files.slice(i, i + BATCH_SIZE);
    const isFinalChunk = i + BATCH_SIZE >= files.length;

    const fd = new FormData();
    for (const f of chunk) fd.append("files", f);

    fd.set("expiresIn", "3600");
    fd.set("finalize", isFinalChunk ? "1" : "0");

    if (batchId) {
      if (expectedCurrentCreativesBatchId === undefined) {
        throw new Error("Missing creative upload snapshot authority");
      }

      fd.set("batch_id", batchId);
      fd.set(
        "expected_current_creatives_batch_id",
        expectedCurrentCreativesBatchId ?? EXPECTED_NULL_BATCH,
      );
    }

    const res = await authFetch(
      `/api/reports/${reportId}/assets/creatives/upload`,
      {
        method: "POST",
        body: fd,
      },
    );

    const json = (await safeJson(res)) as any;

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `Creatives upload failed (${res.status})`);
    }

    if (!batchId && json?.batch_id) {
      batchId = String(json.batch_id);
    }

    if (
      expectedCurrentCreativesBatchId === undefined &&
      Object.prototype.hasOwnProperty.call(
        json ?? {},
        "expected_current_creatives_batch_id",
      )
    ) {
      const rawExpected = json?.expected_current_creatives_batch_id;
      expectedCurrentCreativesBatchId = rawExpected
        ? String(rawExpected)
        : null;
    }

    if (!isFinalChunk) {
      if (!batchId || expectedCurrentCreativesBatchId === undefined) {
        throw new Error("Creative upload candidate authority was not returned");
      }

      if (json?.finalized !== false) {
        throw new Error("Creative upload candidate finalized too early");
      }
    } else if (json?.finalized !== true) {
      throw new Error("Creative upload candidate was not finalized");
    }

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
    json1?.error || json1?.message || `Publish failed (${res1.status})`,
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
      json2?.error || json2?.message || `Publish-lite failed (${res2.status})`,
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

function normalizePublicSlug(v: any) {
  const s = asStr(v).toLowerCase();
  if (!s) return "";
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(s)) return "";
  return s;
}

function buildClientSharePathFromSlug(slug: string) {
  const safeSlug = normalizePublicSlug(slug);
  if (!safeSlug) return "";
  return `/client/${safeSlug}`;
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

function extractIngestionInfo(
  detail: ReportDetail | null | undefined,
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
  const totalLines = Math.max(
    asNum(ingestion?.total_lines),
    asNum(ingestion?.totalRows),
    asNum(ingestion?.total_rows),
  );

  const parsedLines = Math.max(
    asNum(ingestion?.parsed_lines),
    asNum(ingestion?.parsedLines),
    asNum(ingestion?.parsed_rows),
  );

  const inserted = Math.max(
    asNum(ingestion?.inserted),
    asNum(ingestion?.insertedRows),
    asNum(ingestion?.inserted_rows),
  );
  const validRows = Math.max(
    asNum(ingestion?.valid_rows),
    asNum(ingestion?.validRows),
  );
  const batchSize = asNum(ingestion?.batch_size);
  const committedBatches = asNum(ingestion?.committed_batches);
  const error =
    asStr(ingestion?.error) ||
    asStr(ingestion?.error_detail) ||
    asStr(ingestion?.errorDetail);
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

function normalizeHeaderInfoFromReport(
  report: ReportDetail | null | undefined,
): ReportHeaderInfo {
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
      window.localStorage.getItem(getReportPeriodStorageKey(reportId)),
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

function waitForExportRender() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

const DownloadPanel = memo(function DownloadPanel({
  onDownloadPdf,
  onDownloadPng,
  onDownloadCsv,
  onDownloadPpt,
  pdfLoading,
  pngLoading,
  csvLoading,
  pptLoading,
  canPublish,
  publishing,
  onPublish,
  canOpenExportBuilder,
  onOpenExportBuilder,
}: {
  onDownloadPdf: () => Promise<void>;
  onDownloadPng: () => Promise<void>;
  onDownloadCsv: () => Promise<void>;
  onDownloadPpt: () => Promise<void>;
  pdfLoading: boolean;
  pngLoading: boolean;
  csvLoading: boolean;
  pptLoading: boolean;
  canPublish: boolean;
  publishing: boolean;
  onPublish: () => Promise<void>;
  canOpenExportBuilder: boolean;
  onOpenExportBuilder: () => void;
}) {
  return (
    <section className="rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-base font-black text-[#f7f7ff]">
            다운로드 / 발행
          </div>
          <div className="mt-1 text-sm text-[#d7d5ec]">
            미리보기 렌더링 없이 필요한 파일 다운로드와 발행만 진행합니다.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="etrylue-download-actions">
            <ReportDownloadButtons
              onDownloadPdf={onDownloadPdf}
              onDownloadPng={onDownloadPng}
              onDownloadCsv={onDownloadCsv}
              onDownloadPpt={onDownloadPpt}
              pdfLoading={pdfLoading}
              pngLoading={pngLoading}
              csvLoading={csvLoading}
              pptLoading={pptLoading}
            />
          </div>

          {canOpenExportBuilder ? (
            <button
              type="button"
              className="etrylue-secondary-button rounded-xl px-4 py-2.5 text-sm font-extrabold"
              onClick={onOpenExportBuilder}
            >
              Export Builder 열기
            </button>
          ) : null}

          <button
            type="button"
            className="etrylue-primary-button rounded-xl px-4 py-2.5 text-sm font-black"
            onClick={onPublish}
            disabled={!canPublish}
          >
            {publishing ? "발행 중..." : "발행"}
          </button>
        </div>
      </div>
    </section>
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
  const reportDataSourceKind = useMemo(
    () => getReportDataSourceKind(report),
    [report],
  );
  const isCsvReport = reportDataSourceKind === "csv";
  const isApiReport = reportDataSourceKind === "api";
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const rowsLoadedRef = useRef(false);
  const latestRowsRef = useRef<any[]>([]);
  const rowsFetchPromiseRef = useRef<Promise<{ rowsCount: number }> | null>(
    null,
  );
  const rowsMetaFetchPromiseRef = useRef<Promise<RowsMetaResult> | null>(null);
  const [rowsMetaCount, setRowsMetaCount] = useState(0);
  const [rowsMetaLoaded, setRowsMetaLoaded] = useState(false);
  const [rowsMetaMinDate, setRowsMetaMinDate] = useState("");
  const [rowsMetaMaxDate, setRowsMetaMaxDate] = useState("");
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const workspaceId = String(
      report?.workspace_id ?? "",
    ).trim();

    if (!workspaceId) {
      setWorkspaceLogoUrl("");
      return;
    }

    fetchWorkspaceLogoUrl(workspaceId)
      .then((url) => {
        if (!cancelled) {
          setWorkspaceLogoUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceLogoUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [report?.workspace_id]);

  const [monthGoal, setMonthGoal] = useState<MonthGoalDraft>(() =>
    buildEmptyMonthGoal(),
  );
  const [savingMonthGoal, setSavingMonthGoal] = useState(false);
  const [monthGoalSavedText, setMonthGoalSavedText] = useState<string>("");
  const lastLoadedMonthGoalKeyRef = useRef<string>("");

  const [brandSearchContracts, setBrandSearchContracts] =
    useState<BrandSearchContractsDraft>(() => buildEmptyBrandSearchContracts());
  const [savingBrandSearchContracts, setSavingBrandSearchContracts] =
    useState(false);
  const [brandSearchContractsSavedText, setBrandSearchContractsSavedText] =
    useState<string>("");
  const lastLoadedBrandSearchContractsKeyRef = useRef<string>("");

  const [mediaSyncSettings, setMediaSyncSettings] =
    useState<MediaSyncSettingsDraft>(() => buildEmptyMediaSyncSettingsDraft());
  const [savingMediaSyncSettings, setSavingMediaSyncSettings] = useState(false);
  const [mediaSyncSettingsSavedText, setMediaSyncSettingsSavedText] =
    useState<string>("");
  const lastLoadedMediaSyncSettingsKeyRef = useRef<string>("");

  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});
  const creativesBatchIdRef = useRef<string | null | undefined>(undefined);
  const creativesMapLoadedAtRef = useRef(0);
  const creativesMapCompleteRef = useRef(false);
  const [headerInfo, setHeaderInfo] = useState<ReportHeaderInfo>({
    advertiserName: "",
    reportTypeName: "",
    reportTypeKey: "",
  });

  const [publishing, setPublishing] = useState(false);
  const [sharePath, setSharePath] = useState<string>("");
  const [advertiserPublicSlug, setAdvertiserPublicSlug] = useState<string>("");

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
  const pollingCountRef = useRef(0);
  const postDoneRefreshTimerRef = useRef<number | null>(null);

  const creativesInputRef = useRef<HTMLInputElement | null>(null);
  const [creativeFiles, setCreativeFiles] = useState<File[]>([]);
  const [uploadingCreatives, setUploadingCreatives] = useState(false);
  const [creativeUploadLog, setCreativeUploadLog] = useState<any[]>([]);
  const [lastUploadedCreativeCount, setLastUploadedCreativeCount] =
    useState<number>(0);

  const reportCaptureRef = useRef<HTMLDivElement | null>(null);
  const [exportRenderActive, setExportRenderActive] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pngLoading, setPngLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [pptLoading, setPptLoading] = useState(false);

  const didInitReportPeriodFromSourceRef = useRef(false);
  const saveDraftPeriodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastSavedReportPeriodKeyRef = useRef<string>("");

  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(() =>
    resolvePresetPeriod(),
  );

  const displayRows = rows;
  const displayCreativesMap = creativesMap;

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
    const loadedRange = getRowsDateRange(displayRows as any[]);
    if (loadedRange) return loadedRange;

    if (rowsMetaMinDate && rowsMetaMaxDate) {
      return {
        startDate: rowsMetaMinDate,
        endDate: rowsMetaMaxDate,
      };
    }

    return null;
  }, [displayRows, rowsMetaMaxDate, rowsMetaMinDate]);

  const brandSearchMonthKeys = useMemo(() => {
    return buildRecentBrandSearchMonthKeys(
      reportPeriod.endDate ||
        report?.draft_period_end ||
        report?.published_period_end ||
        report?.period_end ||
        "",
    );
  }, [
    report?.draft_period_end,
    report?.period_end,
    report?.published_period_end,
    reportPeriod.endDate,
  ]);

  const ingestionStatusLabel = useMemo(() => {
    if (ingestionStatus === "idle") return "CSV 업로드 대기";
    if (ingestionStatus === "queued") return "서버 처리 대기중";
    if (ingestionStatus === "processing") return "서버에서 CSV 처리중";
    if (ingestionStatus === "done") return "처리 완료";
    if (ingestionStatus === "failed") return "처리 실패";
    return "CSV 업로드 대기";
  }, [ingestionStatus]);

  const ingestionStatusDescription = useMemo(() => {
    if (ingestionStatus === "idle") {
      return "CSV 파일을 선택한 뒤 업로드하면 서버 처리 대기열에 등록됩니다.";
    }

    if (ingestionStatus === "queued") {
      return "CSV 업로드는 완료되었습니다. WORKER 터미널이 켜져 있으면 곧 서버 처리가 시작됩니다.";
    }

    if (ingestionStatus === "processing") {
      return "서버에서 CSV를 처리 중입니다. 화면을 닫아도 작업은 계속되며, 완료되면 자동으로 반영됩니다.";
    }

    if (ingestionStatus === "done") {
      return "처리 완료. rows가 반영되었고 발행 가능한 상태입니다.";
    }

    if (ingestionStatus === "failed") {
      return ingestionInfo.error
        ? `처리 중 오류가 발생했습니다: ${ingestionInfo.error}`
        : "처리 중 오류가 발생했습니다. 오류 내용을 확인한 뒤 다시 업로드하거나 재시도하세요.";
    }

    return "CSV 파일을 선택한 뒤 업로드하면 서버 처리 대기열에 등록됩니다.";
  }, [ingestionInfo.error, ingestionStatus]);

  const csvUploadButtonText = useMemo(() => {
    if (csvUploading) return "CSV 업로드 중...";
    if (ingestionStatus === "queued") return "서버 처리 대기중";
    if (ingestionStatus === "processing") {
      return `서버 처리중... ${formatInt(ingestionInfo.progress)}%`;
    }
    if (ingestionStatus === "done") return "CSV 다시 업로드";
    if (ingestionStatus === "failed") return "CSV 다시 시도";
    return "CSV 업로드";
  }, [csvUploading, ingestionInfo.progress, ingestionStatus]);

  const monthGoalDirty = useMemo(() => {
    const currentKey = monthGoalToStableKey(monthGoal);
    return (
      !!lastLoadedMonthGoalKeyRef.current &&
      currentKey !== lastLoadedMonthGoalKeyRef.current
    );
  }, [monthGoal]);

  const brandSearchContractsDirty = useMemo(() => {
    const currentKey = brandSearchContractsToStableKey(brandSearchContracts);
    return (
      !!lastLoadedBrandSearchContractsKeyRef.current &&
      currentKey !== lastLoadedBrandSearchContractsKeyRef.current
    );
  }, [brandSearchContracts]);

  const brandSearchContractsForReportTemplate = useMemo(() => {
    return brandSearchContractsToPayload(brandSearchContracts);
  }, [brandSearchContracts]);

  const mediaSyncSettingsDirty = useMemo(() => {
    const currentKey = mediaSyncSettingsToStableKey(mediaSyncSettings);
    return (
      !!lastLoadedMediaSyncSettingsKeyRef.current &&
      currentKey !== lastLoadedMediaSyncSettingsKeyRef.current
    );
  }, [mediaSyncSettings]);

  const mediaSyncSettingsError = useMemo(() => {
    if (!isApiReport) return "";
    return getMediaSyncSettingsError(mediaSyncSettings);
  }, [isApiReport, mediaSyncSettings]);

  useEffect(() => {
    if (!report) return;
    if (isCsvReport && !rowsMetaLoaded) return;

    const initial =
      buildInitialReportPeriod({
        report,
        reportId,
        rowsRange: rowsRange?.startDate && rowsRange?.endDate ? rowsRange : null,
      }) ?? resolvePresetPeriod();

    if (didInitReportPeriodFromSourceRef.current) return;

    setReportPeriod(initial);
    didInitReportPeriodFromSourceRef.current = true;
    lastSavedReportPeriodKeyRef.current = reportPeriodToStableKey(initial);
  }, [isCsvReport, report, reportId, rowsMetaLoaded, rowsRange]);

  useEffect(() => {
    const nextGoal = extractMonthGoalFromReport(report);
    const nextKey = monthGoalToStableKey(nextGoal);

    if (nextKey === lastLoadedMonthGoalKeyRef.current) return;

    setMonthGoal(nextGoal);
    lastLoadedMonthGoalKeyRef.current = nextKey;
    setMonthGoalSavedText("");
  }, [report]);

  useEffect(() => {
    const nextSettings = extractMediaSyncSettingsFromReport(report);
    const nextKey = mediaSyncSettingsToStableKey(nextSettings);

    if (nextKey === lastLoadedMediaSyncSettingsKeyRef.current) return;

    setMediaSyncSettings(nextSettings);
    lastLoadedMediaSyncSettingsKeyRef.current = nextKey;
    setMediaSyncSettingsSavedText("");
  }, [report]);

  useEffect(() => {
    const nextContracts = extractBrandSearchContractsFromReport(
      report,
      brandSearchMonthKeys,
    );
    const nextKey = brandSearchContractsToStableKey(nextContracts);

    if (nextKey === lastLoadedBrandSearchContractsKeyRef.current) return;

    setBrandSearchContracts(nextContracts);
    lastLoadedBrandSearchContractsKeyRef.current = nextKey;
    setBrandSearchContractsSavedText("");
  }, [brandSearchMonthKeys, report]);

  useEffect(() => {
    const fromReport = normalizePublicSlug(
      (report as any)?.advertiser_public_slug,
    );

    setAdvertiserPublicSlug(fromReport);
  }, [report]);

  useEffect(() => {
    if (!reportId || typeof window === "undefined") return;
    if (!didInitReportPeriodFromSourceRef.current) return;

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

  const reportTypeLower =
    `${headerInfo.reportTypeKey} ${effectivePreviewReportTypeName}`.toLowerCase();

  const isTraffic =
    reportTypeLower.includes("traffic") || reportTypeLower.includes("트래픽");

  const isCommerce =
    reportTypeLower.includes("commerce") || reportTypeLower.includes("커머스");

  const isDb =
    reportTypeLower.includes("db") ||
    reportTypeLower.includes("acquisition") ||
    reportTypeLower.includes("전환");

  const resolvedMonthGoalForSave = useMemo<MonthGoalDraft>(() => {
    if (!isCommerce) return monthGoal;

    return {
      ...monthGoal,
      revenue: buildCommerceComputedRevenue(monthGoal),
    };
  }, [isCommerce, monthGoal]);

  const previewPeriodLabel = useMemo(() => {
    return getPeriodLabel(reportPeriod);
  }, [reportPeriod]);

  const displaySharePath = useMemo(() => {
    const clientPath = buildClientSharePathFromSlug(advertiserPublicSlug);

    if (clientPath && (sharePath || report?.status === "ready")) {
      return clientPath;
    }

    return sharePath;
  }, [advertiserPublicSlug, report?.status, sharePath]);

  const hasCsvPublishableRows =
    Math.max(ingestionInfo.inserted, ingestionInfo.validRows) > 0;

  const isCsvPublishReady =
    sessionIngested &&
    ingestionStatus === "done" &&
    hasCsvPublishableRows;

  const isApiPublishReady =
    isApiReport &&
    rowsMetaLoaded &&
    rowsMetaCount > 0;

  const isPublishReady = isApiReport
    ? isApiPublishReady
    : isCsvPublishReady;

  const canPublish = !publishing && isPublishReady;

  const hasAvailableRows =
    rowsMetaLoaded &&
    rowsMetaCount > 0;

  const canOpenExportBuilder =
    ENABLE_EXPORT_BUILDER_ENTRY &&
    hasAvailableRows &&
    ingestionStatus !== "queued" &&
    ingestionStatus !== "processing";

  const reportTitleForDownload = effectivePreviewReportTypeName || "report";
  const advertiserNameForDownload =
    effectivePreviewAdvertiserName || "advertiser";

  const refreshRows = useCallback(async (): Promise<{ rowsCount: number }> => {
    if (!reportId) return { rowsCount: 0 };

    if (rowsFetchPromiseRef.current) {
      return rowsFetchPromiseRef.current;
    }

    const task = (async (): Promise<{ rowsCount: number }> => {
      setLoadingRows(true);
      setMsg("");

      let nextMsg = "";
      let fetchedRowsCount = 0;

      try {
        try {
          const rws = await fetchRows(reportId);
          const nextRows = Array.isArray(rws) ? [...rws] : [];
          fetchedRowsCount = nextRows.length;
          latestRowsRef.current = nextRows;
          rowsLoadedRef.current = true;
          setRowsMetaCount(nextRows.length);
          setRowsMetaLoaded(true);
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
                  .filter(Boolean),
              ),
            ),
          });
        } catch (e: any) {
          console.error("[refreshRows] rows failed", e);
          latestRowsRef.current = [];
          rowsLoadedRef.current = false;
          setRowsMetaCount(0);
          setRowsMetaLoaded(false);
          setRows([]);
          fetchedRowsCount = 0;
          nextMsg += `rows 조회 실패: ${e?.message || "unknown"}\n`;
        }

        setLoadingRows(false);

        const canReuseCreativesMap =
          creativesBatchIdRef.current !== undefined &&
          creativesMapCompleteRef.current &&
          creativesMapLoadedAtRef.current > 0 &&
          Date.now() - creativesMapLoadedAtRef.current <
            CREATIVE_MAP_REUSE_MAX_AGE_MS;

        const knownCreativesBatchId = canReuseCreativesMap
          ? creativesBatchIdRef.current
          : undefined;

        const [detailResult, creativesResult] = await Promise.allSettled([
          fetchReportDetail(reportId),
          fetchCreativesMap(reportId, knownCreativesBatchId),
        ]);

        if (detailResult.status === "fulfilled") {
          const detail = detailResult.value;
          setReport(detail);

          const info = extractIngestionInfo(detail);
          setIngestionInfo(info);
          setIngestionStatus(info.status);

          setHeaderInfo(normalizeHeaderInfoFromReport(detail));
        } else {
          console.error(
            "[refreshRows] report detail failed",
            detailResult.reason,
          );
          nextMsg += `report 조회 실패: ${
            (detailResult.reason as any)?.message || "unknown"
          }\n`;

          setHeaderInfo({
            advertiserName: "",
            reportTypeName: "",
            reportTypeKey: "",
          });
        }

        if (creativesResult.status === "fulfilled") {
          const result = creativesResult.value;

          if (result.notModified) {
            creativesBatchIdRef.current = result.currentCreativesBatchId;

            console.log("[refreshRows] creativesMap reused");
          } else {
            const nextCreativesMap = { ...(result.creativesMap ?? {}) };
            setCreativesMap(nextCreativesMap);
            creativesBatchIdRef.current = result.currentCreativesBatchId;
            creativesMapLoadedAtRef.current = Date.now();
            creativesMapCompleteRef.current =
              result.signedCount === result.strictCount;

            console.log("[refreshRows] creativesMap ok", {
              keyCount: Object.keys(nextCreativesMap).length,
            });
          }
        } else {
          console.error(
            "[refreshRows] creativesMap failed",
            creativesResult.reason,
          );
          setCreativesMap({});
          creativesBatchIdRef.current = undefined;
          creativesMapLoadedAtRef.current = 0;
          creativesMapCompleteRef.current = false;
          nextMsg += `creativesMap 조회 실패: ${
            (creativesResult.reason as any)?.message || "unknown"
          }\n`;
        }

        if (nextMsg.trim()) {
          setMsg(nextMsg.trim());
        }

        return { rowsCount: fetchedRowsCount };
      } finally {
        setLoadingRows(false);
        rowsFetchPromiseRef.current = null;
      }
    })();

    rowsFetchPromiseRef.current = task;
    return task;
  }, [reportId]);

  const refreshReportShell = useCallback(async () => {
    if (!reportId) return;

    setLoadingRows(false);
    setMsg("");

    let nextMsg = "";

    const [detailResult, creativesResult, rowsMetaResult] = await Promise.allSettled([
      fetchReportDetail(reportId),
      fetchCreativesMap(reportId),
      fetchRowsMeta(reportId),
    ]);

    if (detailResult.status === "fulfilled") {
      const detail = detailResult.value;
      setReport(detail);

      const info = extractIngestionInfo(detail);
      setIngestionInfo(info);
      setIngestionStatus(info.status);

      setHeaderInfo(normalizeHeaderInfoFromReport(detail));
    } else {
      console.error(
        "[refreshReportShell] report detail failed",
        detailResult.reason,
      );
      nextMsg += `report 조회 실패: ${
        (detailResult.reason as any)?.message || "unknown"
      }\n`;

      setHeaderInfo({
        advertiserName: "",
        reportTypeName: "",
        reportTypeKey: "",
      });
    }

    if (creativesResult.status === "fulfilled") {
      const result = creativesResult.value;
      const nextCreativesMap = { ...(result.creativesMap ?? {}) };
      setCreativesMap(nextCreativesMap);
      creativesBatchIdRef.current = result.currentCreativesBatchId;
      creativesMapLoadedAtRef.current = Date.now();
      creativesMapCompleteRef.current = result.signedCount === result.strictCount;

      console.log("[refreshReportShell] creativesMap ok", {
        keyCount: Object.keys(nextCreativesMap).length,
      });
    } else {
      console.error(
        "[refreshReportShell] creativesMap failed",
        creativesResult.reason,
      );
      setCreativesMap({});
      creativesBatchIdRef.current = undefined;
      creativesMapLoadedAtRef.current = 0;
      creativesMapCompleteRef.current = false;
      nextMsg += `creativesMap 조회 실패: ${
        (creativesResult.reason as any)?.message || "unknown"
      }\n`;
    }

    if (rowsMetaResult.status === "fulfilled") {
      const meta = rowsMetaResult.value;
      setRowsMetaCount(meta.rowsCount);
      setRowsMetaMinDate(meta.minDate);
      setRowsMetaMaxDate(meta.maxDate);
      setRowsMetaLoaded(true);
    } else {
      console.error("[refreshReportShell] rows meta failed", rowsMetaResult.reason);
      setRowsMetaCount(0);
      setRowsMetaMinDate("");
      setRowsMetaMaxDate("");
      setRowsMetaLoaded(false);
    }

    if (nextMsg.trim()) {
      setMsg(nextMsg.trim());
    }
  }, [reportId]);

  const pollIngestionStatus = useCallback(async (targetReportId: string) => {
    if (!targetReportId) return;

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    pollingCountRef.current = 0;

    if (postDoneRefreshTimerRef.current !== null) {
      window.clearTimeout(postDoneRefreshTimerRef.current);
      postDoneRefreshTimerRef.current = null;
    }

    pollingRef.current = setInterval(async () => {
      pollingCountRef.current += 1;

      if (pollingCountRef.current > 60) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        pollingBusyRef.current = false;

        setMsg(
          "서버 처리 상태 확인 시간이 길어지고 있습니다. WORKER 터미널이 켜져 있는지 확인한 뒤 새로고침해 주세요.",
        );

        setIngestionInfo((prev) => ({
          ...prev,
          error:
            "서버 처리 상태 확인 시간이 길어지고 있습니다. 로컬 개발 환경이라면 WORKER 터미널에서 npm run worker:ingestion이 실행 중인지 확인하세요.",
        }));

        return;
      }

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

          const savedRowsCount = Math.max(info.inserted, info.validRows);
          const hasInsertedRows = savedRowsCount > 0;

          if (hasInsertedRows) {
            setRowsMetaCount(savedRowsCount);

            try {
              const meta = await fetchRowsMeta(targetReportId);

              setRowsMetaCount(meta.rowsCount);
              setRowsMetaMinDate(meta.minDate);
              setRowsMetaMaxDate(meta.maxDate);
              setRowsMetaLoaded(true);

              const initial = buildInitialReportPeriod({
                report: detail,
                reportId: targetReportId,
                rowsRange:
                  meta.minDate && meta.maxDate
                    ? {
                        startDate: meta.minDate,
                        endDate: meta.maxDate,
                      }
                    : null,
              });

              if (initial) {
                setReportPeriod(initial);
                didInitReportPeriodFromSourceRef.current = true;
                lastSavedReportPeriodKeyRef.current =
                  reportPeriodToStableKey(initial);
              }
            } catch (e) {
              console.error("[polling ingestion] rows meta refresh failed", e);
              setRowsMetaLoaded(true);
            }
          }

          setSessionIngested(hasInsertedRows);

          setMsg(
            `파싱 완료${
              info.inserted > 0
                ? ` (inserted: ${formatInt(info.inserted)})`
                : ""
            }${hasInsertedRows ? " → 발행 가능 상태로 전환되었습니다." : ""}`,
          );

          postDoneRefreshTimerRef.current = window.setTimeout(() => {
            if (hasInsertedRows) {
              setIngestionStatus("done");
              setSessionIngested(true);
              setMsg(
                `처리 완료${
                  info.inserted > 0
                    ? ` (inserted: ${formatInt(info.inserted)})`
                    : ""
                } → 서버에 rows가 저장되었고 발행 가능 상태입니다.`,
              );
              return;
            }

            setSessionIngested(false);
            setMsg(
              "처리 상태는 완료로 응답됐지만 inserted/valid rows가 0입니다. CSV 파싱 결과가 실제로 저장되지 않아 아직 발행할 수 없습니다.",
            );
          }, 180);
        }

        if (info.status === "failed") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          if (postDoneRefreshTimerRef.current !== null) {
            window.clearTimeout(postDoneRefreshTimerRef.current);
            postDoneRefreshTimerRef.current = null;
          }

          setMsg(info.error || "CSV 파싱 실패");
        }
      } catch (e) {
        console.error("[polling ingestion]", e);
      } finally {
        pollingBusyRef.current = false;
      }
    }, 5000);
  }, []);

  useEffect(() => {
    if (!reportId) return;

    sessionStartedAtRef.current = Date.now();
    setSessionStartedText("-");

    setSessionIngested(false);
    setSessionCreativesUploaded(false);

    setSharePath("");
    setMsg("");
    setAdvertiserPublicSlug("");

    setReport(null);
    setMonthGoal(buildEmptyMonthGoal());
    setMonthGoalSavedText("");
    lastLoadedMonthGoalKeyRef.current = "";
    setBrandSearchContracts(buildEmptyBrandSearchContracts());
    setBrandSearchContractsSavedText("");
    lastLoadedBrandSearchContractsKeyRef.current = "";
    setCreativeUploadLog([]);
    setLastUploadedCreativeCount(0);
    latestRowsRef.current = [];
    rowsLoadedRef.current = false;
    rowsFetchPromiseRef.current = null;
    rowsMetaFetchPromiseRef.current = null;

    setRowsMetaCount(0);
    setRowsMetaLoaded(false);
    setRowsMetaMinDate("");
    setRowsMetaMaxDate("");

    setRows([]);
    setCreativesMap({});
    creativesBatchIdRef.current = undefined;
    creativesMapLoadedAtRef.current = 0;
    creativesMapCompleteRef.current = false;
    setHeaderInfo({
      advertiserName: "",
      reportTypeName: "",
      reportTypeKey: "",
    });

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
    if (postDoneRefreshTimerRef.current !== null) {
      window.clearTimeout(postDoneRefreshTimerRef.current);
      postDoneRefreshTimerRef.current = null;
    }
    pollingBusyRef.current = false;
    pollingCountRef.current = 0;

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

    void refreshReportShell();

    const d = new Date(sessionStartedAtRef.current);
    setSessionStartedText(d.toLocaleString());
  }, [reportId, refreshReportShell]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (postDoneRefreshTimerRef.current !== null) {
        window.clearTimeout(postDoneRefreshTimerRef.current);
        postDoneRefreshTimerRef.current = null;
      }
      pollingBusyRef.current = false;
      pollingCountRef.current = 0;
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

  const handleChangeMonthGoal = useCallback(
    (key: keyof MonthGoalDraft, value: string) => {
      setMonthGoal((prev) => ({
        ...prev,
        [key]: value,
      }));
      setMonthGoalSavedText("");
    },
    [],
  );

  const handleSaveMonthGoal = useCallback(async () => {
    if (!reportId) return;

    setSavingMonthGoal(true);
    setMonthGoalSavedText("");
    setMsg("");

    try {
      const updated = await patchReportMonthGoal(
        reportId,
        resolvedMonthGoalForSave,
      );
      setReport((prev) => ({ ...(prev ?? {}), ...(updated ?? {}) }));

      const savedGoal = extractMonthGoalFromReport(updated);
      const savedKey = monthGoalToStableKey(savedGoal);

      setMonthGoal(savedGoal);
      lastLoadedMonthGoalKeyRef.current = savedKey;
      setMonthGoalSavedText("저장 완료");
      setMsg(
        "월 목표값이 저장되었습니다. 발행 시 공유 리포트에서도 이 목표값을 사용할 수 있습니다.",
      );
    } catch (e: any) {
      setMonthGoalSavedText("");
      setMsg(e?.message || "월 목표값 저장 실패");
    } finally {
      setSavingMonthGoal(false);
    }
  }, [reportId, resolvedMonthGoalForSave]);

  const handleChangeBrandSearchContract = useCallback(
    (month: string, key: "pc" | "mobile", value: string) => {
      setBrandSearchContracts((prev) =>
        (prev ?? []).map((item) =>
          item.month === month
            ? {
                ...item,
                [key]: value,
              }
            : item,
        ),
      );
      setBrandSearchContractsSavedText("");
    },
    [],
  );

  const handleSaveMediaSyncSettings = useCallback(async () => {
    if (!reportId) return;

    const validationMessage = getMediaSyncSettingsError(mediaSyncSettings);
    if (validationMessage) {
      setMediaSyncSettingsSavedText("");
      setMsg(validationMessage);
      return;
    }

    setSavingMediaSyncSettings(true);
    setMediaSyncSettingsSavedText("");
    setMsg("");

    try {
      const updated = await patchReportMediaSyncSettings(
        reportId,
        mediaSyncSettings,
      );
      setReport((prev) => ({ ...(prev ?? {}), ...(updated ?? {}) }));

      const savedSettings = extractMediaSyncSettingsFromReport(updated);
      const savedKey = mediaSyncSettingsToStableKey(savedSettings);

      setMediaSyncSettings(savedSettings);
      lastLoadedMediaSyncSettingsKeyRef.current = savedKey;
      setMediaSyncSettingsSavedText("저장 완료");
      setMsg(
        "API 동기화 기간이 저장되었습니다. Report Builder의 동기화 요청은 이 기간만 사용합니다.",
      );
    } catch (e: any) {
      setMediaSyncSettingsSavedText("");
      setMsg(e?.message || "API 동기화 기간 저장 실패");
    } finally {
      setSavingMediaSyncSettings(false);
    }
  }, [mediaSyncSettings, reportId]);

  const handleSaveBrandSearchContracts = useCallback(async () => {
    if (!reportId) return;

    setSavingBrandSearchContracts(true);
    setBrandSearchContractsSavedText("");
    setMsg("");

    try {
      const normalizedContracts = brandSearchContracts.map((item) => ({
        month: item.month,
        pc: normalizeBrandSearchContractAmount(item.pc),
        mobile: normalizeBrandSearchContractAmount(item.mobile),
      }));

      const updated = await patchReportBrandSearchContracts(
        reportId,
        normalizedContracts,
      );

      setReport((prev) => ({ ...(prev ?? {}), ...(updated ?? {}) }));

      const savedContracts = extractBrandSearchContractsFromReport(
        updated,
        brandSearchMonthKeys,
      );
      const savedKey = brandSearchContractsToStableKey(savedContracts);

      setBrandSearchContracts(savedContracts);
      lastLoadedBrandSearchContractsKeyRef.current = savedKey;
      setBrandSearchContractsSavedText("저장 완료");
      setMsg(
        "브랜드검색 계약 금액이 저장되었습니다. 다음 단계에서 리포트 rows 비용 자동 배분에 사용합니다.",
      );
    } catch (e: any) {
      setBrandSearchContractsSavedText("");
      setMsg(e?.message || "브랜드검색 계약 금액 저장 실패");
    } finally {
      setSavingBrandSearchContracts(false);
    }
  }, [brandSearchContracts, brandSearchMonthKeys, reportId]);

  const handleUploadCsv = useCallback(async () => {
    if (!reportId) return;

    if (!isCsvReport) {
      setMsg("API 연동형 리포트는 CSV 업로드를 사용할 수 없습니다. 리포트 빌더에서 API 동기화를 요청해 주세요.");
      return;
    }

    if (!csvFile) {
      setMsg("CSV 파일을 선택하세요.");
      return;
    }

    setCsvUploading(true);
    setMsg("");
    latestRowsRef.current = [];
    rowsLoadedRef.current = false;
    rowsFetchPromiseRef.current = null;
    rowsMetaFetchPromiseRef.current = null;
    setRowsMetaCount(0);
    setRowsMetaLoaded(false);
    setRowsMetaMinDate("");
    setRowsMetaMaxDate("");
    setRows([]);

    try {
      let currentReport = report;

      if (!currentReport?.workspace_id) {
        currentReport = await fetchReportDetail(reportId);
        setReport(currentReport);
      }

      const workspaceId = asStr(currentReport?.workspace_id);
      if (!workspaceId) {
        throw new Error(
          "workspace_id를 확인할 수 없습니다. report detail 응답을 확인하세요.",
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

      setMsg("CSV 업로드 완료 → 서버 처리 대기열 등록 중...");
      setIngestionStatus("queued");
      setIngestionInfo((prev) => ({
        ...prev,
        status: "queued",
        progress: 0,
        parsedLines: 0,
        totalLines: 0,
        inserted: 0,
        validRows: 0,
        error: "",
      }));

      runIngestion(reportId)
        .then(async (result) => {
          /**
           * ✅ queue 모드 정상 응답
           * - 여기서는 아직 rows가 insert되지 않는 것이 정상이다.
           * - 따라서 inserted/validRows가 0이어도 실패 처리하면 안 된다.
           * - worker가 처리하면서 reports.meta.ingestion 상태를 queued → processing → done/failed로 갱신한다.
           */
          if (result?.queued || result?.status === "queued") {
            const jobId = asStr(result?.job_id || result?.ingestion_id);

            setSessionIngested(false);
            setIngestionStatus("queued");
            setIngestionInfo((prev) => ({
              ...prev,
              status: "queued",
              progress: 0,
              parsedLines: 0,
              totalLines: 0,
              inserted: 0,
              validRows: 0,
              batchSize: 0,
              committedBatches: 0,
              error: "",
            }));

            setMsg(
              jobId
                ? `CSV 업로드 완료 → 서버 처리 대기열에 등록되었습니다. job: ${jobId}`
                : "CSV 업로드 완료 → 서버 처리 대기열에 등록되었습니다.",
            );

            /**
             * ✅ queue 등록 직후에는 rows를 다시 가져오지 않는다.
             * - 아직 worker가 처리하기 전이라 rows가 바뀌지 않았다.
             * - 3만~10만 행 rows fetch를 불필요하게 실행하면 화면이 무거워진다.
             * - done 감지 후에도 rows 전체 fetch는 자동 실행하지 않는다.
             * - 발행 가능 여부는 reports.meta.ingestion의 inserted/validRows 기준으로 판단한다.
             */
            pollIngestionStatus(reportId);
            return;
          }

          /**
           * ✅ 기존 replace 응답 fallback
           * - 혹시 기존 replace 경로를 사용할 때를 위해 남겨둔다.
           * - 기존 로직/구조 보호용.
           */
          const inserted = asNum(result?.inserted);
          const validRows = asNum(result?.validRows ?? result?.valid_rows);
          const parsedLines = asNum(
            result?.parsedLines ?? result?.parsed_lines,
          );
          const totalLines = asNum(result?.totalLines ?? result?.total_lines);

          const refreshed = await refreshRows();

          const finalInserted = Math.max(inserted, validRows);
          const hasSavedRows = finalInserted > 0;

          if (hasSavedRows) {
            setIngestionStatus("done");
            setSessionIngested(true);
            setIngestionInfo((prev) => ({
              ...prev,
              status: "done",
              progress: 100,
              parsedLines: parsedLines || prev.parsedLines,
              totalLines: totalLines || prev.totalLines,
              inserted: inserted || prev.inserted,
              validRows: validRows || prev.validRows,
              error: "",
            }));

            setMsg(
              `파싱 완료 (inserted: ${formatInt(
                finalInserted,
              )}) → 발행 가능 상태로 전환되었습니다.`,
            );
            return;
          }

          setSessionIngested(false);
          setIngestionStatus("failed");
          setMsg(
            `파싱은 종료됐지만 inserted/valid rows가 0입니다. 실제 저장된 rows: ${
              refreshed?.rowsCount ?? 0
            }개입니다. 아직 발행할 수 없습니다.`,
          );
        })
        .catch((e) => {
          console.error("[runIngestion async failed]", e);
          setIngestionStatus("failed");
          setSessionIngested(false);
          setIngestionInfo((prev) => ({
            ...prev,
            status: "failed",
            error: e?.message || "CSV 파싱 시작 실패",
          }));
          setMsg(e?.message || "CSV 파싱 시작 실패");
        });

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
  }, [csvFile, isCsvReport, pollIngestionStatus, refreshRows, report, reportId]);

  const handleUploadCreatives = useCallback(async () => {
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

      const nextCreativesResult = await fetchCreativesMap(reportId);
      setCreativesMap({ ...(nextCreativesResult.creativesMap ?? {}) });
      creativesBatchIdRef.current =
        nextCreativesResult.currentCreativesBatchId;
      creativesMapLoadedAtRef.current = Date.now();
      creativesMapCompleteRef.current =
        nextCreativesResult.signedCount === nextCreativesResult.strictCount;

      setMsg(`소재 업로드 완료: ${filesCount}개`);
    } catch (e: any) {
      setMsg(e?.message || "소재 업로드 중 오류");
    } finally {
      setUploadingCreatives(false);
    }
  }, [creativeFiles, reportId]);

  const handlePublish = useCallback(async () => {
    if (!reportId) return;

    if (!isPublishReady) {
      setMsg(
        isApiReport
          ? "API 동기화가 완료되어 현재 snapshot rows가 준비되어야 발행할 수 있습니다."
          : "CSV 업로드 + 파싱이 완료되어 rows 데이터가 준비되어야 발행할 수 있습니다.",
      );
      return;
    }

    setPublishing(true);
    setMsg("");
    try {
      const out = await publishReportWithFallback(reportId);

      if (out.sharePath) setSharePath(out.sharePath);

      setReport((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          status: out.status || "ready",
        };
      });

      if (out.used === "publish-lite") {
        setMsg(
          "발행 완료(안전모드: publish-lite). 아래 URL로 실제 보고서를 볼 수 있습니다.",
        );
      } else {
        setMsg("발행 완료. 아래 URL로 실제 보고서를 볼 수 있습니다.");
      }

      /**
       * 대용량 rows 안정화:
       * 발행 직후 rows 전체를 다시 조회하지 않는다.
       * 10만 행 이상에서는 /rows 전체 fetch가 statement timeout을 유발할 수 있다.
       * CSV 리포트는 ingestionInfo의 inserted/validRows를 사용하고,
       * API 리포트는 이미 로드된 rows metadata의 rowsCount를 사용한다.
       * 최종 발행 안전성은 publish API의 서버 검증을 그대로 유지한다.
       */
    } catch (e: any) {
      setMsg(e?.message || "발행 실패");
    } finally {
      setPublishing(false);
    }
  }, [isApiReport, isPublishReady, reportId]);

  const handleOpenExportBuilder = useCallback(() => {
    if (!reportId) return;

    if (!ENABLE_EXPORT_BUILDER_ENTRY) {
      return;
    }

    if (!canOpenExportBuilder) {
      setMsg(
        "이번 세션에서 CSV 업로드 + 파싱을 완료한 뒤 Export Builder를 열 수 있습니다.",
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
  }, [
    canOpenExportBuilder,
    effectivePreviewAdvertiserName,
    effectivePreviewReportTypeName,
    previewPeriodLabel,
    reportId,
    reportPeriod.endDate,
    reportPeriod.preset,
    reportPeriod.startDate,
    router,
  ]);

  const refreshRowsMeta = useCallback(async (): Promise<RowsMetaResult> => {
    if (!reportId) {
      return {
        rowsCount: 0,
        ingestionIdUsed: "",
        fallbackUsed: false,
        metaOnly: true,
        minDate: "",
        maxDate: "",
      };
    }

    const currentRows = latestRowsRef.current;
    if (rowsLoadedRef.current && currentRows.length > 0) {
      const currentRange = getRowsDateRange(currentRows);

      return {
        rowsCount: currentRows.length,
        ingestionIdUsed: "",
        fallbackUsed: false,
        metaOnly: false,
        minDate: currentRange?.startDate || "",
        maxDate: currentRange?.endDate || "",
      };
    }

    if (rowsMetaFetchPromiseRef.current) {
      return rowsMetaFetchPromiseRef.current;
    }

    const task = fetchRowsMeta(reportId)
      .then((meta) => {
        setRowsMetaCount(meta.rowsCount);
        setRowsMetaMinDate(meta.minDate);
        setRowsMetaMaxDate(meta.maxDate);
        setRowsMetaLoaded(true);
        return meta;
      })
      .catch((e) => {
        console.error("[refreshRowsMeta] failed", e);
        setRowsMetaCount(0);
        setRowsMetaMinDate("");
        setRowsMetaMaxDate("");
        setRowsMetaLoaded(false);
        throw e;
      })
      .finally(() => {
        rowsMetaFetchPromiseRef.current = null;
      });

    rowsMetaFetchPromiseRef.current = task;
    return task;
  }, [reportId]);

  const ensureRowsLoadedForHeavyAction = useCallback(
    async (label: string): Promise<{ rowsCount: number }> => {
      const currentRows = latestRowsRef.current;

      if (rowsLoadedRef.current && currentRows.length > 0) {
        return { rowsCount: currentRows.length };
      }

      const meta = await refreshRowsMeta();
      if (meta.rowsCount <= 0) {
        return { rowsCount: 0 };
      }

      setMsg(
        `${label} 준비를 위해 rows 데이터 ${formatInt(
          meta.rowsCount,
        )}개를 1회 불러오는 중입니다.`,
      );

      return refreshRows();
    },
    [refreshRows, refreshRowsMeta],
  );

  const handleDownloadPdf = useCallback(async () => {
    try {
      setPdfLoading(true);

      const loaded = await ensureRowsLoadedForHeavyAction("PDF 다운로드");
      if (!loaded.rowsCount) {
        setMsg(
          "PDF로 내보낼 rows 데이터가 없습니다. CSV 파싱 완료 상태를 확인하세요.",
        );
        return;
      }

      setExportRenderActive(true);
      await waitForExportRender();

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
      setExportRenderActive(false);
      setPdfLoading(false);
    }
  }, [
    advertiserNameForDownload,
    ensureRowsLoadedForHeavyAction,
    reportTitleForDownload,
  ]);

  const handleDownloadPng = useCallback(async () => {
    try {
      setPngLoading(true);

      const loaded = await ensureRowsLoadedForHeavyAction("PNG 다운로드");
      if (!loaded.rowsCount) {
        setMsg(
          "PNG로 내보낼 rows 데이터가 없습니다. CSV 파싱 완료 상태를 확인하세요.",
        );
        return;
      }

      setExportRenderActive(true);
      await waitForExportRender();

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
      setExportRenderActive(false);
      setPngLoading(false);
    }
  }, [
    advertiserNameForDownload,
    ensureRowsLoadedForHeavyAction,
    reportTitleForDownload,
  ]);

  const handleDownloadCsv = useCallback(async () => {
    try {
      setCsvLoading(true);

      const loaded = await ensureRowsLoadedForHeavyAction("CSV 다운로드");
      const rowsForDownload = latestRowsRef.current;

      if (!loaded.rowsCount || rowsForDownload.length === 0) {
        setMsg(
          "다운로드할 rows 데이터가 없습니다. CSV 파싱 완료 상태를 확인하세요.",
        );
        return;
      }

      const fileName = buildReportFileName({
        advertiserName: advertiserNameForDownload,
        reportTitle: reportTitleForDownload,
        ext: "csv",
      });

      await downloadCsvFile({
        rows: rowsForDownload,
        fileName,
      });

      console.log("[download:csv:done]", {
        fileName,
        rows: rowsForDownload.length,
      });

      setMsg(`CSV 다운로드 완료: ${fileName}`);
    } catch (e: any) {
      console.error("[download:csv:error]", e);
      setMsg(e?.message || "CSV 다운로드 중 오류가 발생했습니다.");
    } finally {
      setCsvLoading(false);
    }
  }, [
    advertiserNameForDownload,
    ensureRowsLoadedForHeavyAction,
    reportTitleForDownload,
  ]);


  const handleDownloadPpt = useCallback(async () => {
    if (!reportId) return;

    try {
      setPptLoading(true);
      setMsg("AI PPT 보고서를 생성하는 중입니다. 대용량 리포트는 시간이 조금 걸릴 수 있습니다.");

      const res = await authFetch(`/api/reports/${reportId}/ppt`, {
        method: "GET",
      });

      if (!res.ok) {
        const json = await safeJson(res);
        throw new Error(
          json?.message ||
            json?.detail ||
            json?.error ||
            `PPT 생성 실패 (${res.status})`,
        );
      }

      const blob = await res.blob();
      const fallbackFileName = buildReportFileName({
        advertiserName: advertiserNameForDownload,
        reportTitle: reportTitleForDownload,
        ext: "pptx",
      });

      const fileName =
        pickDownloadFileNameFromContentDisposition(
          res.headers.get("Content-Disposition"),
        ) || fallbackFileName;

      downloadBlobFile(blob, fileName);

      console.log("[download:ppt:server:done]", {
        fileName,
        size: blob.size,
        rowsCount: res.headers.get("X-Report-Rows-Count"),
        slidesCount: res.headers.get("X-PPT-Slides-Count"),
      });

      setMsg(`PPT 다운로드 완료: ${fileName}`);
    } catch (e: any) {
      console.error("[download:ppt:server:error]", e);
      setMsg(e?.message || "PPT 다운로드 중 오류가 발생했습니다.");
    } finally {
      setPptLoading(false);
    }
  }, [advertiserNameForDownload, reportId, reportTitleForDownload]);

  return (
    <>
      <main
        className="min-h-screen"
        style={{
          background:
            "radial-gradient(circle at 18% 0%, rgba(33, 223, 243, 0.10), transparent 30%), radial-gradient(circle at 82% 12%, rgba(124, 92, 255, 0.18), transparent 34%), linear-gradient(135deg, #251b4d 0%, #2c2061 48%, #211a46 100%)",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="etrylue-report-edit relative mx-auto max-w-[1600px] px-6 py-8 text-[#f7f7ff]">

          <div className="pointer-events-none absolute right-8 top-7 z-10 hidden w-[78px] xl:block">
            <img
              src="/branding/etrylue-logo.png"
              alt="Etrylue"
              className="block h-auto w-full object-contain drop-shadow-[0_12px_28px_rgba(8,5,29,0.28)]"
            />
          </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 pr-24">
        <div>
          <div className="text-3xl font-black tracking-[-0.03em] text-[#f7f7ff]">리포트 편집</div>
          <div className="mt-1.5 text-sm leading-6 text-[#d7d5ec]">
            업로드/파싱/소재 매칭/다운로드/발행까지 한 화면에서 진행합니다.
          </div>
        </div>
      </div>

      <section className="mb-5 rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-extrabold text-[#bbb8d4]">
              리포트 데이터 방식
            </div>
            <div className="mt-1 text-xl font-black text-[#f7f7ff]">
              {getReportDataSourceLabel(reportDataSourceKind)}
            </div>
            <div className="mt-2 text-sm leading-6 text-[#d7d5ec]">
              {getReportDataSourceDescription(reportDataSourceKind)}
            </div>
          </div>

          <div
            className={`rounded-full border px-4 py-2 text-sm font-black ${
              isApiReport
                ? "border-[#21dff3]/30 bg-[#21dff3]/10 text-[#9ef5ff]"
                : "border-[#7c5cff]/30 bg-[#7c5cff]/15 text-[#cfc7ff]"
            }`}
          >
            {isApiReport ? "API 연동형" : "CSV 업로드형"}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.10] bg-[#2a2157]/72 p-4 text-sm leading-6 text-[#d7d5ec]">
          {isApiReport ? (
            <div className="space-y-4">
              <div>
                API 연동형 리포트는 사용자가 저장한 기간만 media_sync_jobs의 date_from/date_to로 사용합니다.
                저장만으로 동기화는 실행되지 않으며, 실제 동기화는 Report Builder의 동기화 요청 버튼과 Railway media sync worker가 처리합니다.
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(160px,0.6fr)_auto] md:items-end">
                <label className="block">
                  <span className="text-xs font-extrabold text-[#bbb8d4]">API 동기화 시작일</span>
                  <input
                    type="date"
                    value={mediaSyncSettings.dateFrom}
                    onChange={(event) =>
                      setMediaSyncSettings((prev) => ({
                        ...prev,
                        dateFrom: event.target.value,
                      }))
                    }
                    className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-extrabold text-[#bbb8d4]">API 동기화 종료일</span>
                  <input
                    type="date"
                    value={mediaSyncSettings.dateTo}
                    onChange={(event) =>
                      setMediaSyncSettings((prev) => ({
                        ...prev,
                        dateTo: event.target.value,
                      }))
                    }
                    className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-extrabold text-[#bbb8d4]">데이터 레벨</span>
                  <select
                    value={mediaSyncSettings.dataLevel}
                    onChange={(event) =>
                      setMediaSyncSettings((prev) => ({
                        ...prev,
                        dataLevel: normalizeMediaSyncDataLevel(event.target.value),
                      }))
                    }
                    className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                  >
                    <option value="keyword">키워드</option>
                    <option value="creative">소재</option>
                    <option value="mixed">혼합</option>
                    <option value="unknown">미지정</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={handleSaveMediaSyncSettings}
                  disabled={
                    savingMediaSyncSettings ||
                    !mediaSyncSettingsDirty ||
                    !isValidMediaSyncSettingsDraft(mediaSyncSettings)
                  }
                  className="etrylue-primary-button rounded-xl px-4 py-2.5 text-sm font-black"
                >
                  {savingMediaSyncSettings ? "저장 중..." : "기간 저장"}
                </button>
              </div>

              <div className="text-xs text-[#bbb8d4]">
                {mediaSyncSettingsSavedText ? (
                  <span className="font-extrabold text-emerald-200">{mediaSyncSettingsSavedText}</span>
                ) : mediaSyncSettingsDirty ? (
                  <span className="font-extrabold text-amber-100">저장되지 않은 API 동기화 기간이 있습니다.</span>
                ) : mediaSyncSettingsError ? (
                  <span className="font-extrabold text-[#ffb2c0]">{mediaSyncSettingsError}</span>
                ) : (
                  <span>저장된 기간으로만 pending job을 생성합니다.</span>
                )}
              </div>
            </div>
          ) : (
            <>
              CSV 업로드형 리포트의 기간은 업로드된 rows의 날짜 범위로 자동 산정됩니다.
              기간을 바꾸려면 다른 기간의 CSV를 다시 업로드해야 합니다.
            </>
          )}
        </div>
      </section>

      <div className="mb-5 grid gap-3 rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-4 shadow-[0_22px_54px_rgba(8,5,29,0.22)] lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.10] bg-[#2a2157]/72 p-3">
          <div className="text-xs text-[#bbb8d4]">Report ID</div>
          <div className="mt-1 break-all font-mono text-sm">
            {reportId || "-"}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.10] bg-[#2a2157]/72 p-3">
          <div className="text-xs text-[#bbb8d4]">세션 시작</div>
          <div className="mt-1 text-sm text-[#f7f7ff] font-semibold text-[#f7f7ff]">{sessionStartedText}</div>
        </div>

        <div className="rounded-xl border border-white/[0.10] bg-[#2a2157]/72 p-3">
          <div className="text-xs text-[#bbb8d4]">CSV 파싱 상태</div>
          <div className="mt-1 text-sm text-[#f7f7ff] font-semibold text-[#f7f7ff]">{ingestionStatusLabel}</div>

          <div className="mt-1 text-xs leading-5 text-[#bbb8d4]">
            {ingestionStatusDescription}
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#211b44]/80">
            <div
              className={`h-full rounded-full transition-all ${
                ingestionStatus === "failed"
                  ? "bg-[#ff637c]"
                  : ingestionStatus === "done"
                    ? "bg-[#37e7a1]"
                    : "bg-[linear-gradient(90deg,#21dff3_0%,#5f72ff_55%,#7c5cff_100%)]"
              }`}
              style={{
                width: `${Math.max(
                  ingestionStatus === "queued" ? 5 : 0,
                  ingestionInfo.progress,
                )}%`,
              }}
            />
          </div>
          <div className="mt-2 text-xs text-[#bbb8d4]">
            진행률 {formatInt(ingestionInfo.progress)}%{" "}
            <span className="text-white/20">·</span> parsed{" "}
            {formatInt(ingestionInfo.parsedLines)} /{" "}
            {formatInt(ingestionInfo.totalLines)}{" "}
            <span className="text-white/20">·</span> inserted{" "}
            {formatInt(ingestionInfo.inserted)}{" "}
            <span className="text-white/20">·</span> 저장 rows{" "}
            {rowsMetaLoaded ? formatInt(rowsMetaCount) : "-"}
          </div>

          {ingestionInfo.error ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                ingestionStatus === "failed"
                  ? "border-[#ff637c]/30 bg-[#ff637c]/10 text-[#ffb2c0]"
                  : "border-amber-300/25 bg-amber-300/10 text-amber-100"
              }`}
            >
              {ingestionInfo.error}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/[0.10] bg-[#2a2157]/72 p-3">
          <div className="text-xs text-[#bbb8d4]">공유 URL</div>
          <div className="mt-1 text-sm text-[#f7f7ff]">
            {displaySharePath ? (
              <a
                href={fullUrl(displaySharePath)}
                target="_blank"
                rel="noreferrer"
                className="break-all font-semibold text-[#7defff] underline decoration-[#7defff]/50 underline-offset-2 hover:text-white"
              >
                {fullUrl(displaySharePath)}
              </a>
            ) : (
              "-"
            )}
          </div>

          {advertiserPublicSlug ? (
            <div className="mt-2 text-[11px] text-[#aaa6c9]">
              광고주 고정 URL 사용 중
            </div>
          ) : null}
        </div>
      </div>

      {msg ? (
        <div className="mb-5 rounded-xl border border-white/[0.10] bg-[#2a2157]/78 px-4 py-3 text-sm text-[#d7d5ec] whitespace-pre-wrap">
          {msg}
        </div>
      ) : null}

      <section className="mb-5 rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-base font-black text-[#f7f7ff]">
              월 목표값 사전 입력
            </div>
            <div className="mt-1.5 text-sm leading-6 text-[#d7d5ec]">
              저장된 값은 reports.meta.month_goal에 보관되며, 발행 후 공유
              리포트에서도 사라지지 않도록 사용합니다.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {monthGoalSavedText ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-extrabold text-emerald-200">
                {monthGoalSavedText}
              </span>
            ) : monthGoalDirty ? (
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-extrabold text-amber-100">
                저장 필요
              </span>
            ) : (
              <span className="rounded-full border border-white/[0.11] bg-white/[0.055] px-3 py-1 text-xs font-extrabold text-[#c9c6df]">
                저장됨
              </span>
            )}

            <button
              type="button"
              className="etrylue-primary-button rounded-xl px-4 py-2.5 text-sm font-black"
              onClick={handleSaveMonthGoal}
              disabled={savingMonthGoal}
            >
              {savingMonthGoal ? "저장 중..." : "목표값 저장"}
            </button>
          </div>
        </div>

        <div
          className={`mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 ${
            isCommerce
              ? "xl:grid-cols-4"
              : isTraffic
                ? "xl:grid-cols-3"
                : "xl:grid-cols-4"
          }`}
        >
          {isCommerce ? (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  매출 목표
                </span>
                <input
                  type="text"
                  value={buildCommerceComputedRevenue(monthGoal)}
                  readOnly
                  placeholder="비용 × ROAS 자동 계산"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm text-[#bbb8d4] opacity-80"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  비용 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cost}
                  onChange={(e) =>
                    handleChangeMonthGoal("cost", e.target.value)
                  }
                  placeholder="예: 5000000"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  ROAS 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.roas}
                  onChange={(e) =>
                    handleChangeMonthGoal("roas", e.target.value)
                  }
                  placeholder="예: 600"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  전환 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.conversions}
                  onChange={(e) =>
                    handleChangeMonthGoal("conversions", e.target.value)
                  }
                  placeholder="예: 120"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>
            </>
          ) : isTraffic ? (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  클릭 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.clicks}
                  onChange={(e) =>
                    handleChangeMonthGoal("clicks", e.target.value)
                  }
                  placeholder="예: 10000"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  CTR 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.ctr}
                  onChange={(e) => handleChangeMonthGoal("ctr", e.target.value)}
                  placeholder="예: 1.5"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  비용 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cost}
                  onChange={(e) =>
                    handleChangeMonthGoal("cost", e.target.value)
                  }
                  placeholder="예: 5000000"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  전환 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.conversions}
                  onChange={(e) =>
                    handleChangeMonthGoal("conversions", e.target.value)
                  }
                  placeholder="예: 120"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  CVR 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cvr}
                  onChange={(e) => handleChangeMonthGoal("cvr", e.target.value)}
                  placeholder="예: 2.0"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  비용 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cost}
                  onChange={(e) =>
                    handleChangeMonthGoal("cost", e.target.value)
                  }
                  placeholder="예: 5000000"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#d7d5ec]">
                  CPA 목표
                </span>
                <input
                  type="text"
                  value={(Number(monthGoal.cost || 0) > 0 &&
                  Number(monthGoal.conversions || 0) > 0
                    ? Math.round(
                        Number(monthGoal.cost) / Number(monthGoal.conversions),
                      )
                    : ""
                  ).toString()}
                  readOnly
                  placeholder="자동 계산"
                  className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm text-[#bbb8d4] opacity-80"
                />
              </label>
            </>
          )}
        </div>

        <div className="mt-3 text-xs leading-5 text-[#bbb8d4]">
          숫자 형식은 그대로 저장합니다. 표시/계산 방식은 기존 리포트 로직을
          변경하지 않습니다.
        </div>
      </section>

      <section className="mb-5 rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-base font-black text-[#f7f7ff]">
              브랜드검색 계약 금액
            </div>
            <div className="mt-1.5 text-sm leading-6 text-[#d7d5ec]">
              네이버 브랜드검색처럼 월 단위로 구매한 광고비를 PC/모바일별로
              입력합니다. 저장된 값은 reports.meta.brand_search_contracts에
              보관하고, 리포트 화면에서 월·기기별 일별 rows에 자동 배분하는 데
              사용합니다.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {brandSearchContractsSavedText ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-extrabold text-emerald-200">
                {brandSearchContractsSavedText}
              </span>
            ) : brandSearchContractsDirty ? (
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-extrabold text-amber-100">
                저장 필요
              </span>
            ) : (
              <span className="rounded-full border border-white/[0.11] bg-white/[0.055] px-3 py-1 text-xs font-extrabold text-[#c9c6df]">
                저장됨
              </span>
            )}

            <button
              type="button"
              className="etrylue-primary-button rounded-xl px-4 py-2.5 text-sm font-black"
              onClick={handleSaveBrandSearchContracts}
              disabled={savingBrandSearchContracts}
            >
              {savingBrandSearchContracts ? "저장 중..." : "계약금액 저장"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {brandSearchContracts.map((item) => (
            <div
              key={item.month}
              className="rounded-2xl border border-white/[0.10] bg-[#2a2157]/72 p-4"
            >
              <div className="text-sm font-black text-[#f7f7ff]">
                {item.month}
              </div>
              <div className="mt-1 text-xs text-[#bbb8d4]">
                해당 월의 브랜드검색 계약 금액
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block">
                  <span className="text-xs font-semibold text-[#d7d5ec]">
                    PC 계약금액
                  </span>
                  <input
                    type="text"
                    value={item.pc}
                    onChange={(e) =>
                      handleChangeBrandSearchContract(
                        item.month,
                        "pc",
                        e.target.value,
                      )
                    }
                    placeholder="예: 3000000"
                    className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#d7d5ec]">
                    모바일 계약금액
                  </span>
                  <input
                    type="text"
                    value={item.mobile}
                    onChange={(e) =>
                      handleChangeBrandSearchContract(
                        item.month,
                        "mobile",
                        e.target.value,
                      )
                    }
                    placeholder="예: 5000000"
                    className="etrylue-field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs leading-5 text-[#bbb8d4]">
          이번 단계에서는 계약 금액 입력/저장 UI만 추가합니다. 다음 단계에서
          ReportTemplate에 전달한 뒤 입력 월의 PC/모바일 브랜드검색 rows 수를
          기준으로 일별 비용을 자동 배분합니다.
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)]">
          <div className="mb-1 text-base font-black text-[#f7f7ff]">
            CSV 업로드
          </div>
          <div className="mb-4 text-sm leading-6 text-[#d7d5ec]">
            {isCsvReport
              ? "브라우저에서 Storage로 직접 업로드 후 finalize 합니다."
              : "API 연동형 리포트에서는 CSV 업로드를 사용할 수 없습니다."}
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
              disabled={!isCsvReport}
              className="etrylue-file-input block w-full text-sm text-[#d7d5ec]"
            />

            <div className="text-sm text-[#d7d5ec]">
              {csvFile ? (
                <>
                  선택됨: <span className="font-medium">{csvFile.name}</span>{" "}
                  <span className="text-[#aaa6c9]">·</span>{" "}
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
              className="etrylue-primary-button rounded-xl px-4 py-2.5 text-sm font-black"
              onClick={handleUploadCsv}
              disabled={
                !isCsvReport ||
                csvUploading ||
                ingestionStatus === "queued" ||
                ingestionStatus === "processing"
              }
            >
              {isCsvReport ? csvUploadButtonText : "API 연동형 리포트"}
            </button>

            <div className="rounded-xl border border-white/[0.10] bg-[#2a2157]/72 p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-[#d7d5ec]">
                  {ingestionStatusLabel}
                </span>
                <span className="text-[#bbb8d4]">
                  {formatInt(ingestionInfo.progress)}%
                </span>
              </div>

              <div className="mt-1 text-xs leading-5 text-[#bbb8d4]">
                {ingestionStatusDescription}
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#211b44]/80">
                <div
                  className={`h-full rounded-full transition-all ${
                    ingestionStatus === "failed"
                      ? "bg-[#ff637c]"
                      : ingestionStatus === "done"
                        ? "bg-[#37e7a1]"
                        : "bg-[linear-gradient(90deg,#21dff3_0%,#5f72ff_55%,#7c5cff_100%)]"
                  }`}
                  style={{
                    width: `${Math.max(
                      ingestionStatus === "queued" ? 5 : 0,
                      ingestionInfo.progress,
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#bbb8d4]">
                <div>
                  parsed:{" "}
                  <span className="font-semibold text-[#f7f7ff]">
                    {formatInt(ingestionInfo.parsedLines)}
                  </span>
                </div>
                <div>
                  total:{" "}
                  <span className="font-semibold text-[#f7f7ff]">
                    {formatInt(ingestionInfo.totalLines)}
                  </span>
                </div>
                <div>
                  inserted:{" "}
                  <span className="font-semibold text-[#f7f7ff]">
                    {formatInt(ingestionInfo.inserted)}
                  </span>
                </div>
                <div>
                  valid:{" "}
                  <span className="font-semibold text-[#f7f7ff]">
                    {formatInt(ingestionInfo.validRows)}
                  </span>
                </div>
                <div>
                  batch size:{" "}
                  <span className="font-semibold text-[#f7f7ff]">
                    {formatInt(ingestionInfo.batchSize)}
                  </span>
                </div>
                <div>
                  batches:{" "}
                  <span className="font-semibold text-[#f7f7ff]">
                    {formatInt(ingestionInfo.committedBatches)}
                  </span>
                </div>
              </div>

              {ingestionInfo.error ? (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                    ingestionStatus === "failed"
                      ? "border-[#ff637c]/30 bg-[#ff637c]/10 text-[#ffb2c0]"
                      : "border-amber-300/25 bg-amber-300/10 text-amber-100"
                  }`}
                >
                  {ingestionInfo.error}
                </div>
              ) : null}
            </div>

            <div className="text-xs text-[#bbb8d4]">
              업로드 완료 후 WORKER가 켜져 있으면 서버 처리 상태와 진행률이
              자동으로 갱신됩니다.
            </div>
          </div>
        </section>

        <section className="rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)]">
          <div className="mb-1 text-base font-black text-[#f7f7ff]">
            소재 업로드
          </div>
          <div className="mb-4 text-sm leading-6 text-[#d7d5ec]">
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
              className="etrylue-file-input block w-full text-sm text-[#d7d5ec]"
            />

            <div className="text-sm text-[#d7d5ec]">
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
              className="etrylue-primary-button rounded-xl px-4 py-2.5 text-sm font-black"
              onClick={handleUploadCreatives}
              disabled={uploadingCreatives}
            >
              {uploadingCreatives ? "업로드 중..." : "소재 업로드"}
            </button>

            <div className="text-xs leading-5 text-[#bbb8d4]">
              {creativeFiles.length > 0
                ? "업로드 준비 완료"
                : lastUploadedCreativeCount > 0
                  ? "이미지를 바꾸려면 위 박스를 클릭"
                  : "먼저 이미지를 선택하세요"}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/[0.10] bg-[#2a2157]/72 p-4">
            <div className="mb-1 text-sm font-black text-[#f7f7ff]">
              매칭된 소재
            </div>

            <div className="text-sm text-[#d7d5ec]">
              고유 URL: <b>{creativesUrlCount}</b>개{" "}
              <span className="text-[#aaa6c9]">·</span> 키 후보:{" "}
              <b>{creativesKeyCount}</b>개
            </div>

            {!sessionCreativesUploaded ? (
              <div className="mt-2 text-xs leading-5 text-[#bbb8d4]">
                현재는 서버에 저장된 기존 매칭 결과를 표시 중입니다. 이번
                세션에서 새 이미지를 업로드하면 즉시 갱신됩니다.
              </div>
            ) : null}

            <div className="mt-2 text-xs text-[#bbb8d4]">
              ※ 키 후보 수는 매칭 성공률을 올리기 위한 확장 키가 포함되어 커질
              수 있습니다. 실제 이미지 파일 수 감은 고유 URL이 더 정확합니다.
            </div>
          </div>

          {creativeUploadLog.length > 0 ? (
            <div className="mt-4 rounded-xl border border-white/[0.10] bg-[#211b44]/62 p-3">
              <div className="mb-2 text-xs font-extrabold text-[#f7f7ff]">
                업로드 결과(이번 세션)
              </div>
              <div className="max-h-40 space-y-1 overflow-auto">
                {creativeUploadLog.map((it, idx) => (
                  <div key={idx} className="text-xs text-[#d7d5ec]">
                    {it.ok ? "✅" : "❌"}{" "}
                    <span className="font-medium">{it.file}</span>{" "}
                    <span className="text-[#bbb8d4]">→ key:</span>{" "}
                    <span className="font-mono">{it.creative_key}</span>
                    {!it.ok && it.error ? (
                      <span className="text-[#ff9bad]"> ({it.error})</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-5">
        <DownloadPanel
          onDownloadPdf={handleDownloadPdf}
          onDownloadPng={handleDownloadPng}
          onDownloadCsv={handleDownloadCsv}
          onDownloadPpt={handleDownloadPpt}
          pdfLoading={pdfLoading}
          pngLoading={pngLoading}
          csvLoading={csvLoading}
          pptLoading={pptLoading}
          canPublish={canPublish}
          publishing={publishing}
          onPublish={handlePublish}
          canOpenExportBuilder={canOpenExportBuilder}
          onOpenExportBuilder={handleOpenExportBuilder}
        />
      </div>

      <div className="mt-3 text-xs leading-5 text-[#bbb8d4]">
        서버 rows(실제):{" "}
        {rowsMetaLoaded ? formatInt(rowsMetaCount) : "-"}개{" "}
        <span className="text-[#aaa6c9]">·</span> 현재 표시 rows:{" "}
        {displayRows.length}개 <span className="text-[#aaa6c9]">·</span> 광고주:{" "}
        {effectivePreviewAdvertiserName || "-"}{" "}
        <span className="text-[#aaa6c9]">·</span> 유형:{" "}
        {effectivePreviewReportTypeName || "-"}{" "}
        <span className="text-[#aaa6c9]">·</span> 기준 기간:{" "}
        {previewPeriodLabel || "-"} <span className="text-[#aaa6c9]">·</span> 데이터 방식:{" "}
        {getReportDataSourceLabel(reportDataSourceKind)}
      </div>


        </div>
      </main>

      {exportRenderActive ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] w-[1440px] bg-white"
        >
          <div ref={reportCaptureRef}>
            <ReportTemplate
              rows={deferredDisplayRows}
              isLoading={loadingRows}
              creativesMap={deferredDisplayCreativesMap}
              advertiserName={effectivePreviewAdvertiserName}
              reportTypeName={effectivePreviewReportTypeName}
              reportTypeKey={headerInfo.reportTypeKey}
              workspaceLogoUrl={workspaceLogoUrl}
              reportPeriod={reportPeriod}
              onChangeReportPeriod={setReportPeriod}
              monthGoal={resolvedMonthGoalForSave}
              brandSearchContracts={brandSearchContractsForReportTemplate}
              readOnlyHeader={true}
              hidePeriodEditor={true}
              hideTabPeriodText={true}
            />
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        body {
          background: #211a46;
        }

        ::selection {
          background: rgba(33, 223, 243, 0.28);
          color: #ffffff;
        }

        .etrylue-report-edit input,
        .etrylue-report-edit select,
        .etrylue-report-edit button,
        .etrylue-report-edit a {
          -webkit-tap-highlight-color: transparent;
        }

        .etrylue-report-edit .etrylue-field {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(33, 27, 68, 0.82);
          color: #f7f7ff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
          outline: none;
          transition:
            transform 150ms ease,
            border-color 150ms ease,
            background 150ms ease,
            box-shadow 150ms ease;
        }

        .etrylue-report-edit .etrylue-field::placeholder {
          color: #8f8aa9;
        }

        .etrylue-report-edit .etrylue-field:hover {
          border-color: rgba(33, 223, 243, 0.35);
          background: rgba(42, 33, 87, 0.94);
        }

        .etrylue-report-edit .etrylue-field:focus {
          border-color: rgba(33, 223, 243, 0.8);
          background: rgba(37, 30, 80, 0.96);
          box-shadow: 0 0 0 4px rgba(33, 223, 243, 0.1);
        }

        .etrylue-report-edit select.etrylue-field option {
          background: #241b4b;
          color: #f7f7ff;
        }

        .etrylue-report-edit .etrylue-primary-button {
          border: 1px solid rgba(117, 227, 255, 0.24);
          background: linear-gradient(135deg, #21dff3 0%, #5f72ff 52%, #7c5cff 100%);
          color: #ffffff;
          box-shadow: 0 12px 26px rgba(70, 77, 217, 0.25);
          transition:
            transform 150ms ease,
            filter 150ms ease,
            box-shadow 150ms ease,
            opacity 150ms ease;
        }

        .etrylue-report-edit .etrylue-primary-button:not(:disabled):hover {
          transform: translateY(-2px);
          filter: brightness(1.05) saturate(1.08);
          box-shadow: 0 16px 32px rgba(70, 77, 217, 0.34);
        }

        .etrylue-report-edit .etrylue-primary-button:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 3px rgba(33, 223, 243, 0.26),
            0 16px 32px rgba(70, 77, 217, 0.34);
        }

        .etrylue-report-edit .etrylue-primary-button:disabled {
          cursor: not-allowed;
          border-color: rgba(255, 255, 255, 0.08);
          background: #4a416c;
          color: #aaa6c9;
          box-shadow: none;
          opacity: 0.58;
        }

        .etrylue-report-edit .etrylue-secondary-button {
          border: 1px solid rgba(255, 255, 255, 0.13);
          background: rgba(53, 40, 103, 0.92);
          color: #f7f7ff;
          box-shadow: 0 9px 20px rgba(8, 5, 29, 0.16);
          transition:
            transform 150ms ease,
            border-color 150ms ease,
            background 150ms ease,
            box-shadow 150ms ease;
        }

        .etrylue-report-edit .etrylue-secondary-button:not(:disabled):hover {
          transform: translateY(-2px);
          border-color: rgba(33, 223, 243, 0.4);
          background: #403184;
          box-shadow: 0 12px 24px rgba(8, 5, 29, 0.24);
        }

        .etrylue-report-edit .etrylue-download-actions button {
          border: 1px solid rgba(255, 255, 255, 0.13) !important;
          background: rgba(53, 40, 103, 0.92) !important;
          color: #f7f7ff !important;
          box-shadow: 0 9px 20px rgba(8, 5, 29, 0.14) !important;
          transition:
            transform 150ms ease,
            border-color 150ms ease,
            background 150ms ease,
            box-shadow 150ms ease !important;
        }

        .etrylue-report-edit .etrylue-download-actions button:not(:disabled):hover {
          transform: translateY(-2px);
          border-color: rgba(33, 223, 243, 0.4) !important;
          background: #403184 !important;
          box-shadow: 0 12px 24px rgba(8, 5, 29, 0.24) !important;
        }

        .etrylue-report-edit .etrylue-download-actions button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .etrylue-report-edit .etrylue-file-input {
          color: #d7d5ec;
        }

        .etrylue-report-edit .etrylue-file-input::file-selector-button {
          margin-right: 12px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 10px;
          background: rgba(53, 40, 103, 0.92);
          color: #f7f7ff;
          padding: 9px 14px;
          font-weight: 800;
          cursor: pointer;
          transition:
            transform 150ms ease,
            border-color 150ms ease,
            background 150ms ease;
        }

        .etrylue-report-edit .etrylue-file-input:hover::file-selector-button {
          border-color: rgba(33, 223, 243, 0.4);
          background: #403184;
        }
      `}</style>
    </>
  );
}
