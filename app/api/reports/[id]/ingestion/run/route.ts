// app/api/reports/[id]/ingestion/run/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function asNullableString(v: any) {
  const s = asString(v);
  return s ? s : null;
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
  const s = String(v ?? "").trim();
  if (!s) return "";

  const a = s.replace(/[.\s]/g, "-").replace(/\//g, "-");
  const m1 = a.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const mm = String(m1[2]).padStart(2, "0");
    const dd = String(m1[3]).padStart(2, "0");
    return `${m1[1]}-${mm}-${dd}`;
  }

  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

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
  if (label) return { creative: label, creative_file: "" };

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

  return { creative: "", creative_file: "" };
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

function toArray(v: any) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return [v];
  return [];
}

/**
 * 최신 CSV 선택 우선순위
 * 1) meta.csv_uploads[0]
 * 2) meta.upload.csv[0]
 * 둘 다 지원해서 업로드 구조가 달라도 ingestion이 안전하게 동작하도록 한다.
 */
function pickLatestCsvEntryFromMeta(meta: any) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  const csvUploads = toArray((safeMeta as any)?.csv_uploads);
  const uploadCsv = toArray((safeMeta as any)?.upload?.csv);

  const merged = [...csvUploads, ...uploadCsv].filter(Boolean);

  if (!merged.length) return null;

  const deduped = merged.filter((item, idx, arr) => {
    const path = asString(item?.path);
    if (!path) return false;
    return arr.findIndex((x) => asString(x?.path) === path) === idx;
  });

  return deduped[0] ?? null;
}

async function getUserId(req: Request) {
  const admin = getSupabaseAdmin();

  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
    const userId = data?.user?.id ?? null;

    if (error || !userId) {
      return {
        ok: false as const,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }

    return { ok: true as const, userId };
  }

  const auth = await sbAuth();
  if (auth.error || !auth.user?.id) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized (no session)",
    };
  }

  return { ok: true as const, userId: auth.user.id };
}

function getSafeBatchSize(totalRows: number, fileSizeBytes = 0) {
  if (totalRows > 0) {
    if (totalRows >= 600000) return 5000;
    if (totalRows >= 400000) return 4000;
    if (totalRows >= 300000) return 3200;
    if (totalRows >= 200000) return 2600;
    if (totalRows >= 120000) return 2000;
    if (totalRows >= 80000) return 1600;
    if (totalRows >= 50000) return 1200;
    if (totalRows >= 10000) return 800;
    return 500;
  }

  if (fileSizeBytes >= 300 * 1024 * 1024) return 4000;
  if (fileSizeBytes >= 150 * 1024 * 1024) return 3000;
  if (fileSizeBytes >= 80 * 1024 * 1024) return 2000;
  if (fileSizeBytes >= 20 * 1024 * 1024) return 1200;
  if (fileSizeBytes >= 5 * 1024 * 1024) return 800;
  return 500;
}

function getMetaUpdateEveryBatches(totalRows: number, fileSizeBytes = 0) {
  if (totalRows > 0) {
    if (totalRows >= 300000) return 3;
    if (totalRows >= 100000) return 2;
    if (totalRows >= 50000) return 2;
    return 1;
  }

  if (fileSizeBytes >= 120 * 1024 * 1024) return 3;
  if (fileSizeBytes >= 60 * 1024 * 1024) return 2;
  if (fileSizeBytes >= 20 * 1024 * 1024) return 2;
  return 1;
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
  };
}

async function insertBatchWithRetry(
  sb: ReturnType<typeof getSupabaseAdmin>,
  rows: any[],
  maxRetries = 2
) {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { error } = await sb.from("report_rows").insert(rows);

    if (!error) {
      return;
    }

    lastError = error;

    if (attempt < maxRetries) {
      await sleep(250 * (attempt + 1));
    }
  }

  throw new Error(lastError?.message || "Insert failed");
}

async function updateReportIngestionMeta(
  sb: ReturnType<typeof getSupabaseAdmin>,
  reportId: string,
  baseMeta: any,
  patch: Record<string, any>,
  extraPatch?: Record<string, any>
) {
  const nextMeta = {
    ...(baseMeta ?? {}),
    ingestion: {
      ...(((baseMeta ?? {}) as any)?.ingestion ?? {}),
      ...patch,
    },
  };

  const { error } = await sb
    .from("reports")
    .update({
      meta: nextMeta,
      ...(extraPatch ?? {}),
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(error.message || "Failed to update ingestion meta");
  }

  return nextMeta;
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    processedBytes += value?.byteLength ?? 0;

    const chunk = decoder.decode(value, { stream: true });

    for (let i = 0; i < chunk.length; i++) {
      let ch = chunk[i];

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
        } else {
          inQuotes = false;
          pendingQuoteAtChunkEnd = false;
        }
      }

      if (ch === '"') {
        if (inQuotes) {
          const next = chunk[i + 1];

          if (next === '"') {
            cur += '"';
            i++;
            continue;
          }

          if (i === chunk.length - 1) {
            pendingQuoteAtChunkEnd = true;
            continue;
          }

          inQuotes = false;
          continue;
        } else {
          inQuotes = true;
          continue;
        }
      }

      if (!inQuotes && ch === ",") {
        pushCell();
        continue;
      }

      if (!inQuotes && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && chunk[i + 1] === "\n") i++;
        await emitRowIfNeeded();
        continue;
      }

      cur += ch;
    }

    if (handlers.onChunkProgress) {
      await handlers.onChunkProgress(processedBytes, totalBytes);
    }
  }

  const tail = decoder.decode();
  if (tail) {
    for (let i = 0; i < tail.length; i++) {
      let ch = tail[i];

      if (pendingQuoteAtChunkEnd) {
        if (ch === '"') {
          cur += '"';
          pendingQuoteAtChunkEnd = false;
          continue;
        } else {
          inQuotes = false;
          pendingQuoteAtChunkEnd = false;
        }
      }

      if (ch === '"') {
        if (inQuotes) {
          const next = tail[i + 1];

          if (next === '"') {
            cur += '"';
            i++;
            continue;
          }

          if (i === tail.length - 1) {
            pendingQuoteAtChunkEnd = true;
            continue;
          }

          inQuotes = false;
          continue;
        } else {
          inQuotes = true;
          continue;
        }
      }

      if (!inQuotes && ch === ",") {
        pushCell();
        continue;
      }

      if (!inQuotes && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && tail[i + 1] === "\n") i++;
        await emitRowIfNeeded();
        continue;
      }

      cur += ch;
    }
  }

  if (pendingQuoteAtChunkEnd) {
    inQuotes = false;
    pendingQuoteAtChunkEnd = false;
  }

  if (cur.length > 0 || row.length > 0 || rowHasValue) {
    await emitRowIfNeeded();
  }
}

export async function POST(req: Request, ctx: Ctx) {
  let sb: ReturnType<typeof getSupabaseAdmin> | null = null;
  let reportId = "";
  let reportMetaForError: any = null;

  try {
    const user = await getUserId(req);
    if (!user.ok) return jsonError(user.status, user.message);

    sb = getSupabaseAdmin();

    const { id } = await ctx.params;
    reportId = String(id || "").trim();
    if (!reportId) return jsonError(400, "Missing report id");

    const body = await req.json().catch(() => ({}));
    const mode = asString(body?.mode) || "replace";

    const { data: report, error: reportErr } = await sb
      .from("reports")
      .select("id, workspace_id, advertiser_id, meta, current_ingestion_id")
      .eq("id", reportId)
      .single();

    if (reportErr || !report) {
      return jsonError(404, "Report not found");
    }

    const workspace_id = asNullableString(report.workspace_id);
    const advertiser_id = asNullableString(report.advertiser_id);
    const baseMeta =
      report?.meta && typeof report.meta === "object" ? report.meta : {};
    reportMetaForError = baseMeta;

    const latestCsv = pickLatestCsvEntryFromMeta(baseMeta);
    const bucket = asString(latestCsv?.bucket) || "report_uploads";
    const path = asString(latestCsv?.path);

    if (!path) {
      return jsonError(400, "No uploaded CSV found on report meta", {
        tried: ["meta.csv_uploads[0]", "meta.upload.csv[0]"],
      });
    }

    const { data: blobData, error: dlErr } = await sb.storage
      .from(bucket)
      .download(path);

    if (dlErr || !blobData) {
      return jsonError(400, "Failed to download latest CSV", {
        detail: dlErr?.message || null,
        bucket,
        path,
      });
    }

    const blob = blobData as Blob;
    const blobSize = typeof blob.size === "number" ? blob.size : 0;

    const ingestionId = randomUUID();
    const startedAt = new Date().toISOString();

    reportMetaForError = await updateReportIngestionMeta(
      sb,
      reportId,
      reportMetaForError,
      {
        status: "processing",
        progress: 3,
        started_at: startedAt,
        finished_at: null,
        error: null,
        inserted: 0,
        valid_rows: 0,
        parsed_lines: 0,
        total_lines: 0,
        bytes_total: blobSize || 0,
        bytes_processed: 0,
        min_date: null,
        max_date: null,
        ingestion_id: ingestionId,
        batch_size: 0,
        committed_batches: 0,
        in_flight_inserts: 0,
        max_parallel_inserts: 2,
        last_csv: { bucket, path, name: asString(latestCsv?.name) },
        mode,
      },
      {
        current_ingestion_id: ingestionId,
      }
    );

    if (mode === "replace") {
      const { error: delErr } = await sb
        .from("report_rows")
        .delete()
        .eq("report_id", reportId);

      if (delErr) {
        throw new Error(delErr.message || "Failed to delete previous report rows");
      }
    }

    const batchSize = getSafeBatchSize(0, blobSize);
    const updateEveryBatches = getMetaUpdateEveryBatches(0, blobSize);
    const MAX_PARALLEL_INSERTS = 2;

    reportMetaForError = await updateReportIngestionMeta(
      sb,
      reportId,
      reportMetaForError,
      {
        batch_size: batchSize,
        max_parallel_inserts: MAX_PARALLEL_INSERTS,
      }
    );

    let headerRaw: string[] = [];
    let headers: string[] = [];
    let headerMap: ReturnType<typeof buildHeaderIndexMap> | null = null;

    let totalLines = 0;
    let parsedLines = 0;
    let validRowCount = 0;
    let insertedCount = 0;
    let committedBatchCount = 0;
    let rowIndex = 0;
    let min_date = "";
    let max_date = "";

    let pendingBatch: any[] = [];
    let inFlight: Promise<
      { ok: true; size: number } | { ok: false; error: any }
    >[] = [];

    let lastByteProgress = 3;
    let lastBytesProcessed = 0;
    let lastMetaFlushAt = 0;
    let lastCommittedBatchMeta = 0;
    let isMetaFlushInFlight = false;

    const startedParseAt = Date.now();
    const startedInsertAt = Date.now();

    console.log("[ingestion:start]", {
      reportId,
      ingestionId,
      mode,
      path,
      blobSize,
      batchSize,
      updateEveryBatches,
      MAX_PARALLEL_INSERTS,
      workspace_id,
      advertiser_id,
    });

    type InsertCompletion =
      | { ok: true; size: number }
      | { ok: false; error: any };

    const META_FLUSH_MIN_INTERVAL_MS = 3500;

    const flushProgressMeta = async (force = false) => {
      if (isMetaFlushInFlight) return;

      const now = Date.now();
      const progressFromInsert = calcProgress(
        insertedCount,
        Math.max(validRowCount, insertedCount || 1)
      );
      const progress = Math.max(lastByteProgress, progressFromInsert);

      const shouldUpdate =
        force ||
        committedBatchCount === 1 ||
        committedBatchCount - lastCommittedBatchMeta >= updateEveryBatches ||
        now - lastMetaFlushAt >= META_FLUSH_MIN_INTERVAL_MS;

      if (!shouldUpdate) return;

      isMetaFlushInFlight = true;

      try {
        reportMetaForError = await updateReportIngestionMeta(
          sb!,
          reportId,
          reportMetaForError,
          {
            status: "processing",
            inserted: insertedCount,
            valid_rows: validRowCount,
            parsed_lines: parsedLines,
            total_lines: totalLines,
            progress,
            bytes_total: blobSize || 0,
            bytes_processed: lastBytesProcessed || 0,
            min_date: min_date || null,
            max_date: max_date || null,
            committed_batches: committedBatchCount,
            in_flight_inserts: inFlight.length,
          }
        );

        lastMetaFlushAt = now;
        lastCommittedBatchMeta = committedBatchCount;
      } finally {
        isMetaFlushInFlight = false;
      }
    };

    const settleOneInsert = async (forceMeta = false) => {
      if (!inFlight.length) return;

      const raced = inFlight.map((p, idx) =>
        p.then((result) => ({ idx, result }))
      );

      const settled = await Promise.race(raced);
      inFlight.splice(settled.idx, 1);

      if (!settled.result.ok) {
        throw settled.result.error;
      }

      insertedCount += settled.result.size;
      committedBatchCount += 1;

      await flushProgressMeta(forceMeta);
    };

    const enqueueBatchInsert = async (rows: any[]) => {
      if (!rows.length) return;

      const task: Promise<InsertCompletion> = insertBatchWithRetry(sb!, rows, 2)
        .then(() => ({ ok: true, size: rows.length }) as InsertCompletion)
        .catch((error) => ({ ok: false, error }) as InsertCompletion);

      inFlight.push(task);

      if (inFlight.length >= MAX_PARALLEL_INSERTS) {
        await settleOneInsert(false);
      }
    };

    const drainAllInserts = async (forceMeta = false) => {
      while (inFlight.length > 0) {
        await settleOneInsert(forceMeta);
      }
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
        obj.report_date = obj.report_date || ymd;
        obj.day = obj.day || ymd;
        obj.ymd = obj.ymd || ymd;

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
        let creative_file = "";

        if (headerMap.creative >= 0) {
          creative = String(line?.[headerMap.creative] ?? "").trim();
        }
        if (headerMap.creativeFile >= 0) {
          const rawFile = String(line?.[headerMap.creativeFile] ?? "").trim();
          if (rawFile) {
            creative_file = basenameOf(rawFile);
            if (!creative) creative = stripExt(rawFile);
          }
        }

        if (!creative && !creative_file) {
          const picked = pickCreativeLike(obj);
          creative = picked.creative;
          creative_file = picked.creative_file;
        }

        const curCreative = String(obj.creative ?? "").trim();
        if (!curCreative && creative) obj.creative = creative;

        const curFile = String(obj.creative_file ?? "").trim();
        if (!curFile && creative_file) obj.creative_file = creative_file;

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

        let channel: string | null =
          headerMap.channel >= 0 ? asString(line?.[headerMap.channel]) : null;
        if (!channel) channel = pickDim(obj, ["channel", "채널"]);

        let device: string | null =
          headerMap.device >= 0 ? asString(line?.[headerMap.device]) : null;
        if (!device) device = pickDim(obj, ["device", "기기"]);

        let source: string | null =
          headerMap.source >= 0 ? asString(line?.[headerMap.source]) : null;
        if (!source) source = pickDim(obj, ["source", "매체", "platform"]);

        pendingBatch.push({
          report_id: reportId,
          workspace_id,
          advertiser_id,
          row_index: rowIndex,
          date: ymd,
          row: obj,
          channel: channel || null,
          device: device || null,
          source: source || null,
          ingestion_id: ingestionId,
        });

        validRowCount += 1;
        rowIndex += 1;

        if (!min_date || ymd < min_date) min_date = ymd;
        if (!max_date || ymd > max_date) max_date = ymd;

        if (pendingBatch.length >= batchSize) {
          const batchToInsert = pendingBatch;
          pendingBatch = [];
          await enqueueBatchInsert(batchToInsert);
        }
      },

      onChunkProgress: async (processedBytes, totalBytes) => {
        lastBytesProcessed = processedBytes || 0;
        lastByteProgress = calcProgress(processedBytes, totalBytes || 1);

        await flushProgressMeta(false);
      },
    });

    if (!headerRaw.length || !headers.length || !headerMap) {
      return jsonError(400, "CSV seems empty");
    }

    console.log("[ingestion:parse:done]", {
      reportId,
      totalLines,
      batchSize,
      updateEveryBatches,
      took_ms: Date.now() - startedParseAt,
      header_count: headerRaw.length,
    });

    if (!validRowCount) {
      reportMetaForError = await updateReportIngestionMeta(
        sb,
        reportId,
        reportMetaForError,
        {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: "No valid rows after parsing (date missing?)",
          parsed_lines: parsedLines,
          total_lines: totalLines,
          progress: 100,
          bytes_total: blobSize || 0,
          bytes_processed: blobSize || 0,
        }
      );

      return jsonError(400, "No valid rows after parsing (date missing?)", {
        headerRaw: headerRaw.slice(0, 30),
        headerNorm: headers.slice(0, 30),
      });
    }

    if (pendingBatch.length > 0) {
      const batchToInsert = pendingBatch;
      pendingBatch = [];
      await enqueueBatchInsert(batchToInsert);
    }

    await drainAllInserts(true);

    console.log("[ingestion:insert:done]", {
      reportId,
      ingestionId,
      insertedCount,
      validRowCount,
      parsedLines,
      totalLines,
      committedBatchCount,
      batchSize,
      took_ms: Date.now() - startedInsertAt,
    });

    reportMetaForError = await updateReportIngestionMeta(
      sb,
      reportId,
      reportMetaForError,
      {
        status: "done",
        last_run_at: new Date().toISOString(),
        last_csv: { bucket, path, name: asString(latestCsv?.name) },
        mode,
        inserted: insertedCount,
        valid_rows: validRowCount,
        parsed_lines: parsedLines,
        total_lines: totalLines,
        progress: 100,
        ingestion_id: ingestionId,
        batch_size: batchSize,
        committed_batches: committedBatchCount,
        min_date: min_date || null,
        max_date: max_date || null,
        bytes_total: blobSize || 0,
        bytes_processed: blobSize || 0,
        in_flight_inserts: 0,
        max_parallel_inserts: MAX_PARALLEL_INSERTS,
        finished_at: new Date().toISOString(),
        error: null,
      },
      { current_ingestion_id: ingestionId }
    );

    return NextResponse.json(
      {
        ok: true,
        reportId,
        ingestion_id: ingestionId,
        csv: { bucket, path, name: asString(latestCsv?.name) },
        inserted: insertedCount,
        valid_rows: validRowCount,
        parsed_lines: parsedLines,
        total_lines: totalLines,
        min_date,
        max_date,
        batch_size: batchSize,
        committed_batches: committedBatchCount,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[ingestion/run] fatal error:", error);

    if (sb && reportId) {
      try {
        await updateReportIngestionMeta(sb, reportId, reportMetaForError, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: error?.message || String(error),
          in_flight_inserts: 0,
        });
      } catch (metaError) {
        console.error(
          "[ingestion/run] failed to update ingestion meta:",
          metaError
        );
      }
    }

    return jsonError(500, "Ingestion failed", {
      detail: error?.message || String(error),
    });
  }
}