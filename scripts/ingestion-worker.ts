// scripts/ingestion-worker.ts
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function getRequiredSupabaseAdmin() {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("SUPABASE_ADMIN_CLIENT_NOT_AVAILABLE");
  }

  return supabase;
}

type ReportRowLevel = "keyword" | "creative" | "mixed" | "unknown";

type IngestionJob = {
  id: string;
  report_id: string;
  workspace_id: string;
  advertiser_id: string | null;
  csv_bucket: string;
  csv_path: string;
  csv_name: string | null;
  status: string;
  mode: string;
  created_by: string | null;
};

const DEFAULT_BUCKET = "report_uploads";

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function asNullableString(v: any) {
  const s = asString(v);
  return s ? s : null;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  const cleaned = s.replace(/[,\s₩%]/g, "");
  const n = Number(cleaned);

  return Number.isFinite(n) ? n : 0;
}

function normKey(k: string, idx: number) {
  const raw = String(k ?? "").trim();
  if (!raw) return `col_${idx}`;

  const n = raw
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!n || n.length <= 1) return `col_${idx}`;

  return n;
}

function toYMD(v: string) {
  const raw = String(v ?? "")
    .replace(/\uFEFF/g, "")
    .trim();

  if (!raw) return "";

  const compact = raw.replace(/\s+/g, "");

  const isoDate = compact.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const mm = String(isoDate[2]).padStart(2, "0");
    const dd = String(isoDate[3]).padStart(2, "0");
    return `${isoDate[1]}-${mm}-${dd}`;
  }

  const separatedDate = compact.match(
    /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\.?$/
  );
  if (separatedDate) {
    const mm = String(separatedDate[2]).padStart(2, "0");
    const dd = String(separatedDate[3]).padStart(2, "0");
    return `${separatedDate[1]}-${mm}-${dd}`;
  }

  const koreanDate = raw.match(
    /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\.?$/
  );
  if (koreanDate) {
    const mm = String(koreanDate[2]).padStart(2, "0");
    const dd = String(koreanDate[3]).padStart(2, "0");
    return `${koreanDate[1]}-${mm}-${dd}`;
  }

  const compactDate = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) return `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`;

  const dateTimePrefix = compact.match(
    /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})[T_\s].*$/
  );
  if (dateTimePrefix) {
    const mm = String(dateTimePrefix[2]).padStart(2, "0");
    const dd = String(dateTimePrefix[3]).padStart(2, "0");
    return `${dateTimePrefix[1]}-${mm}-${dd}`;
  }

  return "";
}

function pickDim(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];

    if (v == null) continue;

    const s = String(v).trim();

    if (s) return s;
  }

  return null;
}

function basenameOf(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  const noQuery = s.split("?")[0].split("#")[0];
  const winParts = noQuery.split("\\");
  const lastWin = winParts[winParts.length - 1] || noQuery;
  const urlParts = lastWin.split("/");

  return (urlParts[urlParts.length - 1] || lastWin).trim();
}

function stripExt(name: string) {
  const base = basenameOf(name);
  const i = base.lastIndexOf(".");

  return i > 0 ? base.slice(0, i) : base;
}

function pickDateField(obj: any) {
  const known = [
    "date",
    "day",
    "ymd",
    "dt",
    "report_date",
    "segment_date",
    "stat_date",
    "period_start",
    "date_start",
    "start_date",
    "날짜",
    "일자",
    "기간_시작",
    "기간시작",
    "집계일",
  ];

  for (const k of known) {
    const v = obj?.[k];

    if (v == null) continue;

    const y = toYMD(String(v));

    if (y) return y;
  }

  for (const v of Object.values(obj || {})) {
    const y = toYMD(String(v ?? ""));

    if (y) return y;
  }

  return "";
}

function pickKeywordLike(obj: any) {
  return pickDim(obj, [
    "keyword",
    "keyword_name",
    "search_term",
    "searchterm",
    "query",
    "query_text",
    "search_query",
    "대표키워드",
    "키워드",
    "검색어",
    "검색_키워드",
    "검색키워드",
    "검색쿼리",
    "쿼리",
  ]);
}

function pickCreativeLike(obj: any) {
  const label = pickDim(obj, [
    "creative",
    "creative_name",
    "creative_label",
    "ad_creative",
    "adcreative",
    "asset_name",
    "소재",
    "소재명",
    "광고소재",
    "소재_명",
    "소재명칭",
    "소재제목",
    "소재명(광고)",
    "크리에이티브",
    "크리에이티브명",
  ]);

  if (label) {
    return {
      creative: label,
      creative_file: "",
    };
  }

  const file = pickDim(obj, [
    "creative_file",
    "creative_filename",
    "file_name",
    "filename",
    "image_file",
    "img_file",
    "소재파일",
    "소재파일명",
    "이미지파일",
    "이미지파일명",
    "파일명",
  ]);

  if (file) {
    return {
      creative: stripExt(file),
      creative_file: basenameOf(file),
    };
  }

  return {
    creative: "",
    creative_file: "",
  };
}

function pickImagePathLike(obj: any) {
  const img = pickDim(obj, [
    "imagepath",
    "image_path",
    "imagePath",
    "image_url",
    "imageurl",
    "img_url",
    "imgurl",
    "thumbnail",
    "thumb",
    "thumbnail_url",
    "thumb_url",
    "소재이미지",
    "이미지",
    "이미지url",
    "이미지_url",
  ]);

  return img ? String(img).trim() : "";
}

function hasMeaningfulMetric(obj: any) {
  const metricKeys = [
    "impressions",
    "impr",
    "clicks",
    "cost",
    "conversions",
    "conv",
    "revenue",
    "sales",
    "ctr",
    "cpc",
    "cvr",
    "cpa",
    "roas",
  ];

  return metricKeys.some((key) => {
    const v = obj?.[key];

    if (v == null) return false;

    if (typeof v === "number") {
      return Number.isFinite(v) && v !== 0;
    }

    return String(v).trim() !== "";
  });
}

function inferReportRowLevel(obj: any): {
  row_level: ReportRowLevel;
  row_level_reason: string;
} {
  const keyword = asString(
    obj?.keyword ||
      obj?.keyword_name ||
      obj?.search_term ||
      obj?.searchterm ||
      obj?.query ||
      obj?.query_text ||
      obj?.search_query ||
      obj?.대표키워드 ||
      obj?.키워드 ||
      obj?.검색어 ||
      obj?.검색_키워드 ||
      obj?.검색키워드 ||
      obj?.검색쿼리 ||
      obj?.쿼리
  );

  const creative = asString(
    obj?.creative ||
      obj?.creative_name ||
      obj?.creative_label ||
      obj?.ad_creative ||
      obj?.adcreative ||
      obj?.asset_name ||
      obj?.소재 ||
      obj?.소재명 ||
      obj?.광고소재 ||
      obj?.소재_명 ||
      obj?.소재명칭 ||
      obj?.소재제목 ||
      obj?.["소재명(광고)"] ||
      obj?.크리에이티브 ||
      obj?.크리에이티브명
  );

  const creativeFile = asString(
    obj?.creative_file ||
      obj?.creative_filename ||
      obj?.file_name ||
      obj?.filename ||
      obj?.image_file ||
      obj?.img_file ||
      obj?.소재파일 ||
      obj?.소재파일명 ||
      obj?.이미지파일 ||
      obj?.이미지파일명 ||
      obj?.파일명
  );

  const imagePath = asString(
    obj?.imagepath ||
      obj?.imagePath ||
      obj?.image_path ||
      obj?.image_url ||
      obj?.imageurl ||
      obj?.img_url ||
      obj?.imgurl ||
      obj?.thumbnail ||
      obj?.thumb ||
      obj?.thumbnail_url ||
      obj?.thumb_url ||
      obj?.소재이미지 ||
      obj?.이미지 ||
      obj?.이미지url ||
      obj?.이미지_url
  );

  const hasKeywordSignal = !!keyword;
  const hasCreativeSignal = !!creative || !!creativeFile || !!imagePath;
  const hasMetricSignal = hasMeaningfulMetric(obj);

  if (hasKeywordSignal && hasCreativeSignal) {
    return {
      row_level: "mixed",
      row_level_reason: "keyword_and_creative_signal",
    };
  }

  if (hasKeywordSignal) {
    return {
      row_level: "keyword",
      row_level_reason: "keyword_signal",
    };
  }

  if (hasCreativeSignal) {
    return {
      row_level: "creative",
      row_level_reason: "creative_signal",
    };
  }

  if (hasMetricSignal) {
    return {
      row_level: "unknown",
      row_level_reason: "metric_only",
    };
  }

  return {
    row_level: "unknown",
    row_level_reason: "no_dimension_signal",
  };
}

function buildHeaderIndexMap(headerRaw: string[], headers: string[]) {
  const exactRawSet = new Map<string, number>();
  const normSet = new Map<string, number>();

  for (let i = 0; i < headerRaw.length; i++) {
    const raw = String(headerRaw[i] ?? "").trim();
    const norm = String(headers[i] ?? "").trim();

    if (raw && !exactRawSet.has(raw)) exactRawSet.set(raw, i);
    if (norm && !normSet.has(norm)) normSet.set(norm, i);
  }

  const find = (candidates: string[]) => {
    for (const c of candidates) {
      const rawHit = exactRawSet.get(c);

      if (rawHit != null) return rawHit;

      const normHit = normSet.get(normKey(c, -1));

      if (normHit != null) return normHit;
    }

    return -1;
  };

  return {
    date: find([
      "date",
      "day",
      "ymd",
      "dt",
      "report_date",
      "segment_date",
      "stat_date",
      "period_start",
      "date_start",
      "start_date",
      "날짜",
      "일자",
      "기간_시작",
      "기간시작",
      "집계일",
    ]),
    channel: find(["channel", "채널"]),
    device: find(["device", "기기"]),
    source: find(["source", "매체", "platform"]),
    imagePath: find([
      "imagepath",
      "image_path",
      "imagePath",
      "image_url",
      "imageurl",
      "img_url",
      "imgurl",
      "thumbnail",
      "thumb",
      "thumbnail_url",
      "thumb_url",
      "소재이미지",
      "이미지",
      "이미지url",
      "이미지_url",
    ]),
    creative: find([
      "creative",
      "creative_name",
      "creative_label",
      "ad_creative",
      "adcreative",
      "asset_name",
      "소재",
      "소재명",
      "광고소재",
      "소재_명",
      "소재명칭",
      "소재제목",
      "소재명(광고)",
      "크리에이티브",
      "크리에이티브명",
    ]),
    creativeFile: find([
      "creative_file",
      "creative_filename",
      "file_name",
      "filename",
      "image_file",
      "img_file",
      "소재파일",
      "소재파일명",
      "이미지파일",
      "이미지파일명",
      "파일명",
    ]),
    keyword: find([
      "keyword",
      "keyword_name",
      "search_term",
      "searchterm",
      "query",
      "query_text",
      "search_query",
      "대표키워드",
      "키워드",
      "검색어",
      "검색_키워드",
      "검색키워드",
      "검색쿼리",
      "쿼리",
    ]),
  };
}

function getSafeBatchSize(fileSizeBytes = 0) {
  const envBatchSize = Number(process.env.INGESTION_BATCH_SIZE || 0);

  if (Number.isFinite(envBatchSize) && envBatchSize > 0) {
    return Math.max(500, Math.min(3000, Math.floor(envBatchSize)));
  }

  if (fileSizeBytes >= 120 * 1024 * 1024) return 1500;
  if (fileSizeBytes >= 60 * 1024 * 1024) return 1800;
  if (fileSizeBytes >= 20 * 1024 * 1024) return 2000;
  if (fileSizeBytes >= 5 * 1024 * 1024) return 2000;
  return 1500;
}

function calcProgress(done: number, total: number) {
  if (!total || total <= 0) return 0;

  const ratio = done / total;

  if (ratio < 0.05) {
    return Math.max(3, Math.floor(ratio * 100));
  }

  if (ratio < 0.9) {
    return Math.floor(ratio * 95);
  }

  if (ratio < 1) {
    return 95 + Math.floor((ratio - 0.9) * 50);
  }

  return 100;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamCsvBlobRows(
  blob: Blob,
  handlers: {
    onHeader: (row: string[]) => Promise<void> | void;
    onRow: (row: string[]) => Promise<void> | void;
    onChunkProgress?: (
      processedBytes: number,
      totalBytes: number
    ) => Promise<void> | void;
  }
) {
  const decoder = new TextDecoder("utf-8");
  const reader = blob.stream().getReader();

  let processedBytes = 0;
  const totalBytes = typeof blob.size === "number" ? blob.size : 0;

  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let rowHasValue = false;
  let headerDone = false;
  let isFirstChar = true;
  let pendingQuoteAtChunkEnd = false;

  const pushCell = () => {
    row.push(cur);

    if (!rowHasValue && cur.trim() !== "") {
      rowHasValue = true;
    }

    cur = "";
  };

  const emitRowIfNeeded = async () => {
    pushCell();

    if (rowHasValue) {
      if (!headerDone) {
        headerDone = true;
        await handlers.onHeader(row);
      } else {
        await handlers.onRow(row);
      }
    }

    row = [];
    cur = "";
    rowHasValue = false;
  };

  const consumeText = async (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (isFirstChar) {
        isFirstChar = false;

        if (ch === "\uFEFF") {
          continue;
        }
      }

      if (pendingQuoteAtChunkEnd) {
        if (ch === '"') {
          cur += '"';
          pendingQuoteAtChunkEnd = false;
          continue;
        }

        inQuotes = false;
        pendingQuoteAtChunkEnd = false;
      }

      if (ch === '"') {
        if (inQuotes) {
          const next = text[i + 1];

          if (next === '"') {
            cur += '"';
            i++;
            continue;
          }

          if (i === text.length - 1) {
            pendingQuoteAtChunkEnd = true;
            continue;
          }

          inQuotes = false;
          continue;
        }

        inQuotes = true;
        continue;
      }

      if (!inQuotes && ch === ",") {
        pushCell();
        continue;
      }

      if (!inQuotes && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        await emitRowIfNeeded();
        continue;
      }

      cur += ch;
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    processedBytes += value?.byteLength ?? 0;

    const chunk = decoder.decode(value, { stream: true });

    await consumeText(chunk);

    if (handlers.onChunkProgress) {
      await handlers.onChunkProgress(processedBytes, totalBytes);
    }
  }

  const tail = decoder.decode();

  if (tail) {
    await consumeText(tail);
  }

  if (pendingQuoteAtChunkEnd) {
    inQuotes = false;
    pendingQuoteAtChunkEnd = false;
  }

  if (cur.length > 0 || row.length > 0 || rowHasValue) {
    await emitRowIfNeeded();
  }
}

async function updateReportIngestionMeta(params: {
  reportId: string;
  patch: Record<string, any>;
}) {
  const { reportId, patch } = params;
  const sb = getRequiredSupabaseAdmin();

  const { data: report, error: readErr } = await sb
    .from("reports")
    .select("meta")
    .eq("id", reportId)
    .maybeSingle();

  if (readErr) {
    throw new Error(`REPORT_META_READ_FAILED:${readErr.message}`);
  }

  const baseMeta =
    (report as any)?.meta && typeof (report as any).meta === "object"
      ? (report as any).meta
      : {};

  const nextMeta = {
    ...baseMeta,
    ingestion: {
      ...((baseMeta as any)?.ingestion ?? {}),
      ...patch,
    },
  };

  const { error } = await sb
    .from("reports")
    .update({
      meta: nextMeta,
      updated_at: nowIso(),
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(`REPORT_META_UPDATE_FAILED:${error.message}`);
  }
}

async function updateJob(params: {
  jobId: string;
  patch: Record<string, any>;
}) {
  const { jobId, patch } = params;
  const sb = getRequiredSupabaseAdmin();

  const { error } = await sb
    .from("ingestion_jobs")
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`JOB_UPDATE_FAILED:${error.message}`);
  }
}

async function claimPendingJob() {
  const sb = getRequiredSupabaseAdmin();

  const { data: candidate, error: selectErr } = await sb
    .from("ingestion_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`JOB_SELECT_FAILED:${selectErr.message}`);
  }

  if (!candidate) {
    return null;
  }

  const { data: claimed, error: claimErr } = await sb
    .from("ingestion_jobs")
    .update({
      status: "processing",
      started_at: nowIso(),
      progress: 3,
      error: null,
      error_detail: null,
      updated_at: nowIso(),
    })
    .eq("id", (candidate as any).id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimErr) {
    throw new Error(`JOB_CLAIM_FAILED:${claimErr.message}`);
  }

  if (!claimed) {
    return null;
  }

  return claimed as IngestionJob;
}

function isLikelyStatementTimeout(error: any) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("statement timeout") ||
    message.includes("canceling statement") ||
    message.includes("timeout") ||
    message.includes("57014")
  );
}

async function insertRowsOnce(rows: any[]) {
  const sb = getRequiredSupabaseAdmin();
  const { error } = await sb.from("report_rows").insert(rows);

  if (error) {
    throw error;
  }
}

async function insertBatchWithRetry(rows: any[], maxRetries = 2) {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await insertRowsOnce(rows);
      return;
    } catch (error: any) {
      lastError = error;

      if (attempt < maxRetries) {
        await sleep(250 * (attempt + 1));
      }
    }
  }

  const canSplit =
    rows.length > 500 && isLikelyStatementTimeout(lastError);

  if (canSplit) {
    const mid = Math.ceil(rows.length / 2);
    const left = rows.slice(0, mid);
    const right = rows.slice(mid);

    console.warn("[worker] insert batch timeout; splitting batch", {
      originalSize: rows.length,
      leftSize: left.length,
      rightSize: right.length,
      reason: lastError?.message || String(lastError),
    });

    await insertBatchWithRetry(left, maxRetries);
    await insertBatchWithRetry(right, maxRetries);
    return;
  }

  throw new Error(
    `REPORT_ROWS_INSERT_FAILED:${lastError?.message || "Insert failed"}`
  );
}

async function processJob(job: IngestionJob) {
  const sb = getRequiredSupabaseAdmin();

  const jobId = job.id;
  const reportId = job.report_id;
  const workspaceId = job.workspace_id;
  const advertiserId = asNullableString(job.advertiser_id);
  const csvBucket = asString(job.csv_bucket) || DEFAULT_BUCKET;
  const csvPath = asString(job.csv_path);
  const csvName = asString(job.csv_name);

  if (!reportId || !workspaceId || !csvPath) {
    throw new Error("JOB_REQUIRED_FIELD_MISSING");
  }

  console.log("[worker] processing job", {
    jobId,
    reportId,
    workspaceId,
    csvBucket,
    csvPath,
    csvName,
  });

  await updateReportIngestionMeta({
    reportId,
    patch: {
      status: "processing",
      progress: 3,
      started_at: nowIso(),
      finished_at: null,
      error: null,
      ingestion_id: jobId,
      job_id: jobId,
      last_csv: {
        bucket: csvBucket,
        path: csvPath,
        name: csvName,
      },
    },
  });

  const { data: blobData, error: dlErr } = await sb.storage
    .from(csvBucket)
    .download(csvPath);

  if (dlErr || !blobData) {
    throw new Error(`CSV_DOWNLOAD_FAILED:${dlErr?.message || "unknown"}`);
  }

  const blob = blobData as Blob;
  const blobSize = typeof blob.size === "number" ? blob.size : 0;
  const batchSize = getSafeBatchSize(blobSize);

  await updateJob({
    jobId,
    patch: {
      batch_size: batchSize,
    },
  });

  await updateReportIngestionMeta({
    reportId,
    patch: {
      batch_size: batchSize,
      bytes_total: blobSize,
      bytes_processed: 0,
    },
  });

  if ((job.mode || "replace") === "replace") {
    const { error: delErr } = await sb
      .from("report_rows")
      .delete()
      .eq("report_id", reportId);

    if (delErr) {
      throw new Error(`REPORT_ROWS_DELETE_FAILED:${delErr.message}`);
    }
  }

  let headerRaw: string[] = [];
  let headers: string[] = [];
  let headerMap: ReturnType<typeof buildHeaderIndexMap> | null = null;

  let totalLines = 0;
  let parsedLines = 0;
  let validRowCount = 0;
  let keywordRowCount = 0;
  let creativeRowCount = 0;
  let mixedRowCount = 0;
  let unknownRowCount = 0;
  let insertedCount = 0;
  let committedBatchCount = 0;
  let rowIndex = 0;
  let minDate = "";
  let maxDate = "";

  let pendingBatch: any[] = [];

  let lastMetaUpdateAt = 0;
  let lastCommittedBatchForMeta = 0;
  let lastBytesProcessed = 0;

  const flushProgress = async (force = false) => {
    const now = Date.now();

    const shouldUpdate =
      force ||
      committedBatchCount === 1 ||
      committedBatchCount - lastCommittedBatchForMeta >= 10 ||
      now - lastMetaUpdateAt >= 10000;

    if (!shouldUpdate) return;

    const progress = Math.max(
      3,
      calcProgress(insertedCount, Math.max(validRowCount, insertedCount || 1))
    );

    const common = {
      progress,
      total_rows: totalLines,
      parsed_rows: parsedLines,
      valid_rows: validRowCount,
      inserted_rows: insertedCount,
      keyword_rows: keywordRowCount,
      creative_rows: creativeRowCount,
      mixed_rows: mixedRowCount,
      unknown_rows: unknownRowCount,
      committed_batches: committedBatchCount,
      batch_size: batchSize,
    };

    await updateJob({
      jobId,
      patch: common,
    });

    await updateReportIngestionMeta({
      reportId,
      patch: {
        status: "processing",
        progress,
        parsed_lines: parsedLines,
        total_lines: totalLines,
        valid_rows: validRowCount,
        inserted: insertedCount,
        keyword_rows: keywordRowCount,
        creative_rows: creativeRowCount,
        mixed_rows: mixedRowCount,
        unknown_rows: unknownRowCount,
        committed_batches: committedBatchCount,
        batch_size: batchSize,
        bytes_total: blobSize,
        bytes_processed: lastBytesProcessed,
        min_date: minDate || null,
        max_date: maxDate || null,
        representative_summary_level:
          keywordRowCount + mixedRowCount > 0
            ? "keyword"
            : creativeRowCount > 0
              ? "creative"
              : "unknown",
      },
    });

    lastMetaUpdateAt = now;
    lastCommittedBatchForMeta = committedBatchCount;
  };

  const flushBatch = async () => {
    if (!pendingBatch.length) return;

    const batch = pendingBatch;
    pendingBatch = [];

    await insertBatchWithRetry(batch, 2);

    insertedCount += batch.length;
    committedBatchCount += 1;

    await flushProgress(false);
  };

  await streamCsvBlobRows(blob, {
    onHeader: async (row) => {
      headerRaw = row.map((h) => String(h ?? "").trim());
      headers = headerRaw.map((h, i) => normKey(h, i));
      headerMap = buildHeaderIndexMap(headerRaw, headers);
    },

    onRow: async (line) => {
      totalLines += 1;
      parsedLines += 1;

      if (!headerMap) return;

      const obj: any = {};

      for (let i = 0; i < headers.length; i++) {
        const keyNorm = headers[i];
        const keyRaw = headerRaw[i] || `raw_${i}`;
        const v = line?.[i] ?? "";

        obj[keyNorm] = v;
        obj[keyRaw] = v;
      }

      let ymd = "";

      if (headerMap.date >= 0) {
        ymd = toYMD(String(line?.[headerMap.date] ?? ""));
      }

      if (!ymd) {
        ymd = pickDateField(obj);
      }

      if (!ymd) {
        return;
      }

      obj.date = ymd;
      obj.report_date = ymd;
      obj.day = ymd;
      obj.ymd = ymd;
      obj.dt = ymd;
      obj.segment_date = ymd;
      obj.stat_date = ymd;

      const numericKeys = [
        "impressions",
        "impr",
        "clicks",
        "cost",
        "conversions",
        "conv",
        "revenue",
        "sales",
        "ctr",
        "cpc",
        "cvr",
        "cpa",
        "roas",
      ];

      for (const k of numericKeys) {
        if (obj[k] != null && String(obj[k]).trim() !== "") {
          obj[k] = toNumber(obj[k]);
        }
      }

      let imgPath = "";

      if (headerMap.imagePath >= 0) {
        imgPath = String(line?.[headerMap.imagePath] ?? "").trim();
      }

      if (!imgPath) {
        imgPath = pickImagePathLike(obj);
      }

      if (imgPath) {
        obj.imagepath = imgPath;
        obj.imagePath = imgPath;
        obj.imagepath_raw = basenameOf(imgPath);
      }

      let creative = "";
      let creativeFile = "";

      if (headerMap.creative >= 0) {
        creative = String(line?.[headerMap.creative] ?? "").trim();
      }

      if (headerMap.creativeFile >= 0) {
        const rawFile = String(line?.[headerMap.creativeFile] ?? "").trim();

        if (rawFile) {
          creativeFile = basenameOf(rawFile);

          if (!creative) {
            creative = stripExt(rawFile);
          }
        }
      }

      if (!creative && !creativeFile) {
        const picked = pickCreativeLike(obj);
        creative = picked.creative;
        creativeFile = picked.creative_file;
      }

      const curCreative = String(obj.creative ?? "").trim();

      if (!curCreative && creative) {
        obj.creative = creative;
      }

      const curFile = String(obj.creative_file ?? "").trim();

      if (!curFile && creativeFile) {
        obj.creative_file = creativeFile;
      }

      const fileLike = basenameOf(
        String(obj.creative_file || obj.creative || "")
      );

      if (
        !String(obj.imagepath ?? "").trim() &&
        fileLike &&
        fileLike.includes(".")
      ) {
        obj.imagepath_raw = fileLike;
      }

      let keyword = "";

      if (headerMap.keyword >= 0) {
        keyword = String(line?.[headerMap.keyword] ?? "").trim();
      }

      if (!keyword) {
        keyword = asString(pickKeywordLike(obj));
      }

      if (keyword && !String(obj.keyword ?? "").trim()) {
        obj.keyword = keyword;
      }

      const rowLevel = inferReportRowLevel(obj);

      obj.row_level = rowLevel.row_level;
      obj.data_level = rowLevel.row_level;
      obj.row_level_reason = rowLevel.row_level_reason;

      let channel: string | null =
        headerMap.channel >= 0 ? asString(line?.[headerMap.channel]) : null;

      if (!channel) {
        channel = pickDim(obj, ["channel", "채널"]);
      }

      let device: string | null =
        headerMap.device >= 0 ? asString(line?.[headerMap.device]) : null;

      if (!device) {
        device = pickDim(obj, ["device", "기기"]);
      }

      let source: string | null =
        headerMap.source >= 0 ? asString(line?.[headerMap.source]) : null;

      if (!source) {
        source = pickDim(obj, ["source", "매체", "platform"]);
      }

      pendingBatch.push({
        report_id: reportId,
        workspace_id: workspaceId,
        advertiser_id: advertiserId,
        row_index: rowIndex,
        date: ymd,
        row: obj,
        channel: channel || null,
        device: device || null,
        source: source || null,
        ingestion_id: jobId,
      });

      validRowCount += 1;

      if (rowLevel.row_level === "keyword") {
        keywordRowCount += 1;
      } else if (rowLevel.row_level === "creative") {
        creativeRowCount += 1;
      } else if (rowLevel.row_level === "mixed") {
        mixedRowCount += 1;
      } else {
        unknownRowCount += 1;
      }

      rowIndex += 1;

      if (!minDate || ymd < minDate) minDate = ymd;
      if (!maxDate || ymd > maxDate) maxDate = ymd;

      if (pendingBatch.length >= batchSize) {
        await flushBatch();
      }
    },

    onChunkProgress: async (processedBytes) => {
      lastBytesProcessed = processedBytes || 0;
    },
  });

  if (!headerRaw.length || !headers.length || !headerMap) {
    throw new Error("CSV_EMPTY_OR_HEADER_MISSING");
  }

  if (pendingBatch.length) {
    await flushBatch();
  }

  if (!validRowCount) {
    throw new Error("NO_VALID_ROWS_AFTER_PARSING_DATE_MISSING");
  }

  const donePatch = {
    status: "done",
    progress: 100,
    total_rows: totalLines,
    parsed_rows: parsedLines,
    valid_rows: validRowCount,
    inserted_rows: insertedCount,
    keyword_rows: keywordRowCount,
    creative_rows: creativeRowCount,
    mixed_rows: mixedRowCount,
    unknown_rows: unknownRowCount,
    committed_batches: committedBatchCount,
    batch_size: batchSize,
    finished_at: nowIso(),
    error: null,
    error_detail: null,
  };

  await updateJob({
    jobId,
    patch: donePatch,
  });

  await updateReportIngestionMeta({
    reportId,
    patch: {
      status: "done",
      progress: 100,
      last_run_at: nowIso(),
      finished_at: nowIso(),
      error: null,

      inserted: insertedCount,
      valid_rows: validRowCount,
      keyword_rows: keywordRowCount,
      creative_rows: creativeRowCount,
      mixed_rows: mixedRowCount,
      unknown_rows: unknownRowCount,

      representative_summary_level:
        keywordRowCount + mixedRowCount > 0
          ? "keyword"
          : creativeRowCount > 0
            ? "creative"
            : "unknown",

      parsed_lines: parsedLines,
      total_lines: totalLines,

      ingestion_id: jobId,
      job_id: jobId,

      batch_size: batchSize,
      committed_batches: committedBatchCount,
      min_date: minDate || null,
      max_date: maxDate || null,

      bytes_total: blobSize,
      bytes_processed: blobSize,

      in_flight_inserts: 0,
      max_parallel_inserts: 1,

      last_csv: {
        bucket: csvBucket,
        path: csvPath,
        name: csvName,
      },
    },
  });

  console.log("[worker] done", {
    jobId,
    reportId,
    insertedCount,
    validRowCount,
    totalLines,
    committedBatchCount,
  });
}

async function failJob(job: IngestionJob, error: any) {
  const sb = getRequiredSupabaseAdmin();

  await sb
    .from("report_rows")
    .delete()
    .eq("report_id", job.report_id)
    .eq("ingestion_id", job.id);

  const message = String(error?.message ?? error);
  const detail = {
    message,
    stack: String(error?.stack ?? ""),
    failed_at: nowIso(),
  };

  await updateJob({
    jobId: job.id,
    patch: {
      status: "failed",
      progress: 100,
      error: message,
      error_detail: detail,
      finished_at: nowIso(),
    },
  });

  await updateReportIngestionMeta({
    reportId: job.report_id,
    patch: {
      status: "failed",
      progress: 100,
      error: message,
      finished_at: nowIso(),
      in_flight_inserts: 0,
    },
  });

  console.error("[worker] failed", {
    jobId: job.id,
    reportId: job.report_id,
    error: message,
  });
}

async function processOnePendingJob() {
  const job = await claimPendingJob();

  if (!job) {
    console.log("[worker] no pending jobs");
    return false;
  }

  try {
    await processJob(job);
  } catch (error) {
    await failJob(job, error);
  }

  return true;
}

async function main() {
  const loop = process.env.INGESTION_WORKER_LOOP === "1";
  const intervalMs = Number(process.env.INGESTION_WORKER_INTERVAL_MS || 3000);

  console.log("[worker] started", {
    loop,
    intervalMs,
  });

  if (!loop) {
    await processOnePendingJob();
    return;
  }

  while (true) {
    await processOnePendingJob();
    await sleep(Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 3000);
  }
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});