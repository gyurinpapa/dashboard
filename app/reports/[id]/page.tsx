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
  };
}

async function fetchCreativesMap(
  reportId: string,
): Promise<Record<string, string>> {
  const res = await authFetch(
    `/api/reports/${reportId}/assets/creatives/map?expiresIn=3600&mode=expanded`,
  );
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(
      json?.error || `Failed to fetch creativesMap (${res.status})`,
    );
  }
  return json.creativesMap ?? {};
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
      },
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

function pickAdvertiserIdFromReport(report: ReportDetail | null | undefined) {
  const meta =
    report?.meta && typeof report.meta === "object" ? report.meta : {};

  return (
    asStr((report as any)?.advertiser_id) ||
    asStr(meta?.advertiser_id) ||
    asStr(meta?.advertiserId) ||
    ""
  );
}

async function fetchAdvertiserPublicSlug(advertiserId: string) {
  const id = asStr(advertiserId);
  if (!id) return "";

  const { data, error } = await supabase
    .from("advertisers")
    .select("public_slug")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[advertiser public_slug fetch failed]", error);
    return "";
  }

  return normalizePublicSlug((data as any)?.public_slug);
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
  pdfLoading,
  pngLoading,
  csvLoading,
  canPublish,
  publishing,
  onPublish,
  canOpenExportBuilder,
  onOpenExportBuilder,
}: {
  onDownloadPdf: () => Promise<void>;
  onDownloadPng: () => Promise<void>;
  onDownloadCsv: () => Promise<void>;
  pdfLoading: boolean;
  pngLoading: boolean;
  csvLoading: boolean;
  canPublish: boolean;
  publishing: boolean;
  onPublish: () => Promise<void>;
  canOpenExportBuilder: boolean;
  onOpenExportBuilder: () => void;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-base font-semibold text-gray-900">
            다운로드 / 발행
          </div>
          <div className="mt-1 text-sm text-gray-500">
            미리보기 렌더링 없이 필요한 파일 다운로드와 발행만 진행합니다.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ReportDownloadButtons
            onDownloadPdf={onDownloadPdf}
            onDownloadPng={onDownloadPng}
            onDownloadCsv={onDownloadCsv}
            pdfLoading={pdfLoading}
            pngLoading={pngLoading}
            csvLoading={csvLoading}
          />

          {canOpenExportBuilder ? (
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              onClick={onOpenExportBuilder}
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
  const [rows, setRows] = useState<any[]>([]);
  const rowsLoadedRef = useRef(false);
  const latestRowsRef = useRef<any[]>([]);
  const rowsFetchPromiseRef = useRef<Promise<{ rowsCount: number }> | null>(
    null,
  );
  const rowsMetaFetchPromiseRef = useRef<Promise<RowsMetaResult> | null>(null);
  const [rowsMetaCount, setRowsMetaCount] = useState(0);
  const [rowsMetaLoaded, setRowsMetaLoaded] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<string>("");

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

  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});
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
    return getRowsDateRange(displayRows as any[]);
  }, [displayRows]);

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
    const nextGoal = extractMonthGoalFromReport(report);
    const nextKey = monthGoalToStableKey(nextGoal);

    if (nextKey === lastLoadedMonthGoalKeyRef.current) return;

    setMonthGoal(nextGoal);
    lastLoadedMonthGoalKeyRef.current = nextKey;
    setMonthGoalSavedText("");
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
    let alive = true;

    const advertiserId = pickAdvertiserIdFromReport(report);

    if (!advertiserId) {
      setAdvertiserPublicSlug("");
      return;
    }

    const fromReport = normalizePublicSlug(
      (report as any)?.advertiser_public_slug,
    );
    if (fromReport) {
      setAdvertiserPublicSlug(fromReport);
      return;
    }

    setAdvertiserPublicSlug("");

    void fetchAdvertiserPublicSlug(advertiserId).then((slug) => {
      if (!alive) return;
      setAdvertiserPublicSlug(slug);
    });

    return () => {
      alive = false;
    };
  }, [report]);

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

  const hasPublishableRows =
    Math.max(ingestionInfo.inserted, ingestionInfo.validRows) > 0;

  const isPublishReady =
    sessionIngested && ingestionStatus === "done" && hasPublishableRows;

  const canPublish = !publishing && isPublishReady;

  const canOpenExportBuilder = ENABLE_EXPORT_BUILDER_ENTRY && canPublish;

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

        const [detailResult, creativesResult] = await Promise.allSettled([
          fetchReportDetail(reportId),
          fetchCreativesMap(reportId),
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
          const nextCreativesMap = { ...(creativesResult.value ?? {}) };
          setCreativesMap(nextCreativesMap);

          console.log("[refreshRows] creativesMap ok", {
            keyCount: Object.keys(nextCreativesMap).length,
          });
        } else {
          console.error(
            "[refreshRows] creativesMap failed",
            creativesResult.reason,
          );
          setCreativesMap({});
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
      const nextCreativesMap = { ...(creativesResult.value ?? {}) };
      setCreativesMap(nextCreativesMap);

      console.log("[refreshReportShell] creativesMap ok", {
        keyCount: Object.keys(nextCreativesMap).length,
      });
    } else {
      console.error(
        "[refreshReportShell] creativesMap failed",
        creativesResult.reason,
      );
      setCreativesMap({});
      nextMsg += `creativesMap 조회 실패: ${
        (creativesResult.reason as any)?.message || "unknown"
      }\n`;
    }

    if (rowsMetaResult.status === "fulfilled") {
      const meta = rowsMetaResult.value;
      setRowsMetaCount(meta.rowsCount);
      setRowsMetaLoaded(true);
    } else {
      console.error("[refreshReportShell] rows meta failed", rowsMetaResult.reason);
      setRowsMetaCount(0);
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
            setRowsMetaLoaded(true);
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
    setRows([]);
    setCreativesMap({});
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
  }, [csvFile, pollIngestionStatus, refreshRows, report, reportId]);

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

      const nextCreativesMap = await fetchCreativesMap(reportId);
      setCreativesMap({ ...(nextCreativesMap ?? {}) });

      setMsg(`소재 업로드 완료: ${filesCount}개`);
    } catch (e: any) {
      setMsg(e?.message || "소재 업로드 중 오류");
    } finally {
      setUploadingCreatives(false);
    }
  }, [creativeFiles, reportId]);

  const handlePublish = useCallback(async () => {
    if (!reportId) return;

    if (!isPublishReady || !hasPublishableRows) {
      setMsg(
        "CSV 업로드 + 파싱이 완료되어 rows 데이터가 준비되어야 발행할 수 있습니다.",
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
       * 대용량 CSV 안정화:
       * 발행 직후 rows 전체를 다시 조회하지 않는다.
       * 10만 행 이상에서는 /rows 전체 fetch가 statement timeout을 유발할 수 있다.
       * 발행 가능 여부는 ingestionInfo.inserted / validRows와 publish 응답으로 판단한다.
       */
    } catch (e: any) {
      setMsg(e?.message || "발행 실패");
    } finally {
      setPublishing(false);
    }
  }, [hasPublishableRows, isPublishReady, reportId]);

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
      };
    }

    const currentRows = latestRowsRef.current;
    if (rowsLoadedRef.current && currentRows.length > 0) {
      return {
        rowsCount: currentRows.length,
        ingestionIdUsed: "",
        fallbackUsed: false,
        metaOnly: false,
      };
    }

    if (rowsMetaFetchPromiseRef.current) {
      return rowsMetaFetchPromiseRef.current;
    }

    const task = fetchRowsMeta(reportId)
      .then((meta) => {
        setRowsMetaCount(meta.rowsCount);
        setRowsMetaLoaded(true);
        return meta;
      })
      .catch((e) => {
        console.error("[refreshRowsMeta] failed", e);
        setRowsMetaCount(0);
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

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight">리포트 편집</div>
          <div className="mt-1 text-sm text-gray-500">
            업로드/파싱/소재 매칭/다운로드/발행까지 한 화면에서 진행합니다.
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm lg:grid-cols-4">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-gray-500">Report ID</div>
          <div className="mt-1 break-all font-mono text-sm">
            {reportId || "-"}
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="text-xs text-gray-500">세션 시작</div>
          <div className="mt-1 text-sm font-medium">{sessionStartedText}</div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="text-xs text-gray-500">CSV 파싱 상태</div>
          <div className="mt-1 text-sm font-medium">{ingestionStatusLabel}</div>

          <div className="mt-1 text-xs leading-5 text-gray-500">
            {ingestionStatusDescription}
          </div>

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
                  ingestionInfo.progress,
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
            {formatInt(ingestionInfo.inserted)}{" "}
            <span className="text-gray-300">·</span> 저장 rows{" "}
            {rowsMetaLoaded ? formatInt(rowsMetaCount) : "-"}
          </div>

          {ingestionInfo.error ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                ingestionStatus === "failed"
                  ? "border-red-100 bg-red-50 text-red-700"
                  : "border-amber-100 bg-amber-50 text-amber-800"
              }`}
            >
              {ingestionInfo.error}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border p-3">
          <div className="text-xs text-gray-500">공유 URL</div>
          <div className="mt-1 text-sm">
            {displaySharePath ? (
              <a
                href={fullUrl(displaySharePath)}
                target="_blank"
                rel="noreferrer"
                className="break-all text-blue-600 underline"
              >
                {fullUrl(displaySharePath)}
              </a>
            ) : (
              "-"
            )}
          </div>

          {advertiserPublicSlug ? (
            <div className="mt-2 text-[11px] text-gray-500">
              광고주 고정 URL 사용 중
            </div>
          ) : null}
        </div>
      </div>

      {msg ? (
        <div className="mb-5 rounded-xl border bg-gray-50 px-4 py-3 text-sm whitespace-pre-wrap">
          {msg}
        </div>
      ) : null}

      <section className="mb-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">
              월 목표값 사전 입력
            </div>
            <div className="mt-1 text-sm text-gray-500">
              저장된 값은 reports.meta.month_goal에 보관되며, 발행 후 공유
              리포트에서도 사라지지 않도록 사용합니다.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {monthGoalSavedText ? (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                {monthGoalSavedText}
              </span>
            ) : monthGoalDirty ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                저장 필요
              </span>
            ) : (
              <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500">
                저장됨
              </span>
            )}

            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                savingMonthGoal
                  ? "cursor-not-allowed bg-gray-400"
                  : "bg-black hover:opacity-90"
              }`}
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
                <span className="text-xs font-medium text-gray-600">
                  매출 목표
                </span>
                <input
                  type="text"
                  value={buildCommerceComputedRevenue(monthGoal)}
                  readOnly
                  placeholder="비용 × ROAS 자동 계산"
                  className="mt-1 w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  비용 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cost}
                  onChange={(e) =>
                    handleChangeMonthGoal("cost", e.target.value)
                  }
                  placeholder="예: 5000000"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  ROAS 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.roas}
                  onChange={(e) =>
                    handleChangeMonthGoal("roas", e.target.value)
                  }
                  placeholder="예: 600"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  전환 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.conversions}
                  onChange={(e) =>
                    handleChangeMonthGoal("conversions", e.target.value)
                  }
                  placeholder="예: 120"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>
            </>
          ) : isTraffic ? (
            <>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  클릭 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.clicks}
                  onChange={(e) =>
                    handleChangeMonthGoal("clicks", e.target.value)
                  }
                  placeholder="예: 10000"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  CTR 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.ctr}
                  onChange={(e) => handleChangeMonthGoal("ctr", e.target.value)}
                  placeholder="예: 1.5"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  비용 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cost}
                  onChange={(e) =>
                    handleChangeMonthGoal("cost", e.target.value)
                  }
                  placeholder="예: 5000000"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  전환 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.conversions}
                  onChange={(e) =>
                    handleChangeMonthGoal("conversions", e.target.value)
                  }
                  placeholder="예: 120"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  CVR 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cvr}
                  onChange={(e) => handleChangeMonthGoal("cvr", e.target.value)}
                  placeholder="예: 2.0"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  비용 목표
                </span>
                <input
                  type="text"
                  value={monthGoal.cost}
                  onChange={(e) =>
                    handleChangeMonthGoal("cost", e.target.value)
                  }
                  placeholder="예: 5000000"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">
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
                  className="mt-1 w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none"
                />
              </label>
            </>
          )}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          숫자 형식은 그대로 저장합니다. 표시/계산 방식은 기존 리포트 로직을
          변경하지 않습니다.
        </div>
      </section>

      <section className="mb-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">
              브랜드검색 계약 금액
            </div>
            <div className="mt-1 text-sm text-gray-500">
              네이버 브랜드검색처럼 월 단위로 구매한 광고비를 PC/모바일별로
              입력합니다. 저장된 값은 reports.meta.brand_search_contracts에
              보관하고, 리포트 화면에서 월·기기별 일별 rows에 자동 배분하는 데
              사용합니다.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {brandSearchContractsSavedText ? (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                {brandSearchContractsSavedText}
              </span>
            ) : brandSearchContractsDirty ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                저장 필요
              </span>
            ) : (
              <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500">
                저장됨
              </span>
            )}

            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                savingBrandSearchContracts
                  ? "cursor-not-allowed bg-gray-400"
                  : "bg-black hover:opacity-90"
              }`}
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
              className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
            >
              <div className="text-sm font-semibold text-gray-900">
                {item.month}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                해당 월의 브랜드검색 계약 금액
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">
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
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-600">
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
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs leading-5 text-gray-500">
          이번 단계에서는 계약 금액 입력/저장 UI만 추가합니다. 다음 단계에서
          ReportTemplate에 전달한 뒤 입력 월의 PC/모바일 브랜드검색 rows 수를
          기준으로 일별 비용을 자동 배분합니다.
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-1 text-base font-semibold text-gray-900">
            CSV 업로드
          </div>
          <div className="mb-4 text-sm text-gray-500">
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

            <div className="text-sm text-gray-600">
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
              {csvUploadButtonText}
            </button>

            <div className="rounded-xl border bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-gray-700">
                  {ingestionStatusLabel}
                </span>
                <span className="text-gray-500">
                  {formatInt(ingestionInfo.progress)}%
                </span>
              </div>

              <div className="mt-1 text-xs leading-5 text-gray-500">
                {ingestionStatusDescription}
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
                      ingestionInfo.progress,
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
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                    ingestionStatus === "failed"
                      ? "border-red-100 bg-red-50 text-red-700"
                      : "border-amber-100 bg-amber-50 text-amber-800"
                  }`}
                >
                  {ingestionInfo.error}
                </div>
              ) : null}
            </div>

            <div className="text-xs text-gray-500">
              업로드 완료 후 WORKER가 켜져 있으면 서버 처리 상태와 진행률이
              자동으로 갱신됩니다.
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-1 text-base font-semibold text-gray-900">
            소재 업로드
          </div>
          <div className="mb-4 text-sm text-gray-500">
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

            <div className="text-sm text-gray-600">
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

          <div className="mt-5 rounded-xl border bg-gray-50 p-4">
            <div className="mb-1 text-sm font-semibold text-gray-900">
              매칭된 소재
            </div>

            <div className="text-sm text-gray-700">
              고유 URL: <b>{creativesUrlCount}</b>개{" "}
              <span className="text-gray-400">·</span> 키 후보:{" "}
              <b>{creativesKeyCount}</b>개
            </div>

            {!sessionCreativesUploaded ? (
              <div className="mt-2 text-xs text-gray-600">
                현재는 서버에 저장된 기존 매칭 결과를 표시 중입니다. 이번
                세션에서 새 이미지를 업로드하면 즉시 갱신됩니다.
              </div>
            ) : null}

            <div className="mt-2 text-xs text-gray-500">
              ※ 키 후보 수는 매칭 성공률을 올리기 위한 확장 키가 포함되어 커질
              수 있습니다. 실제 이미지 파일 수 감은 고유 URL이 더 정확합니다.
            </div>
          </div>

          {creativeUploadLog.length > 0 ? (
            <div className="mt-4 rounded-xl border bg-white p-3">
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
        </section>
      </div>

      <div className="mt-5">
        <DownloadPanel
          onDownloadPdf={handleDownloadPdf}
          onDownloadPng={handleDownloadPng}
          onDownloadCsv={handleDownloadCsv}
          pdfLoading={pdfLoading}
          pngLoading={pngLoading}
          csvLoading={csvLoading}
          canPublish={canPublish}
          publishing={publishing}
          onPublish={handlePublish}
          canOpenExportBuilder={canOpenExportBuilder}
          onOpenExportBuilder={handleOpenExportBuilder}
        />
      </div>

      <div className="mt-3 text-xs text-gray-500">
        서버 rows(실제): {rows.length}개{" "}
        <span className="text-gray-400">·</span> 현재 표시 rows:{" "}
        {displayRows.length}개 <span className="text-gray-400">·</span> 광고주:{" "}
        {effectivePreviewAdvertiserName || "-"}{" "}
        <span className="text-gray-400">·</span> 유형:{" "}
        {effectivePreviewReportTypeName || "-"}{" "}
        <span className="text-gray-400">·</span> 기준 기간:{" "}
        {previewPeriodLabel || "-"}
      </div>

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
              reportPeriod={reportPeriod}
              onChangeReportPeriod={setReportPeriod}
              monthGoal={resolvedMonthGoalForSave}
              brandSearchContracts={brandSearchContractsForReportTemplate}
              hidePeriodEditor={true}
              hideTabPeriodText={true}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
