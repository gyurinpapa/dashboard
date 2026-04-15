// app/api/share/[token]/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asToken(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function asInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function asBool(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function asIsoOrNull(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

/** ===== row extractor ===== */
function tryParseJson(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function extractRowObject(rec: any) {
  if (!rec) return null;

  const candidates = ["row", "data", "row_data", "payload", "json", "raw", "value"];
  for (const k of candidates) {
    const parsed = tryParseJson(rec?.[k]);
    if (parsed) return parsed;
  }

  const copy: any = { ...rec };
  delete copy.id;
  delete copy.report_id;
  delete copy.workspace_id;
  delete copy.advertiser_id;
  delete copy.created_at;
  delete copy.updated_at;
  delete copy.ingestion_id;

  return copy;
}

/**
 * rows 조회는 기존 안전 버전 유지
 * - 여기 건드렸다가 rows 자체가 비는 회귀가 생겼으므로 원복
 */
async function fetchAllReportRows(
  sb: any,
  reportId: string,
  publishedIngestionId?: string | null
) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];

  while (true) {
    const to = from + pageSize - 1;

    let query = sb.from("report_rows").select("*").eq("report_id", reportId);

    if (publishedIngestionId) {
      query = query.eq("ingestion_id", publishedIngestionId);
    }

    const { data, error } = await query.range(from, to);

    if (error) throw new Error(error.message || "Rows DB error");
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function pickDateStr(r: any) {
  const v =
    r?.date ??
    r?.ymd ??
    r?.day ??
    r?.dt ??
    r?.report_date ??
    r?.segment_date ??
    r?.stat_date;

  if (v == null) return "";
  return String(v).slice(0, 10);
}

function minMaxDate(rows: any[]) {
  let min = "";
  let max = "";
  for (const r of rows) {
    const d = pickDateStr(r);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return { min_date: min || null, max_date: max || null };
}

/** ===== key normalize helpers ===== */
function safeDecode(s: string) {
  const v = String(s ?? "");
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function normalizeKey(v: any) {
  let s = String(v ?? "");
  s = safeDecode(s);
  s = s.replace(/\\/g, "/");
  s = s.replace(/\u00A0/g, " ");
  s = s.trim();
  s = s.replace(/\s+/g, " ");
  try {
    s = s.normalize("NFC");
  } catch {}
  return s;
}

function basenameOf(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const noQs = s.split("?")[0].split("#")[0];
  const base = noQs.split("/").pop() || noQs;
  return normalizeKey(base);
}

function stripExt(name: string) {
  const base = basenameOf(name);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}

function uniq(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const x of arr) {
    const s = normalizeKey(x);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }

  return out;
}

function normalizeCreativesMap(map: Record<string, string>) {
  const out: Record<string, string> = {};

  for (const [k0, url] of Object.entries(map || {})) {
    if (!url) continue;

    const kRaw = normalizeKey(k0);
    if (!kRaw) continue;

    const base = normalizeKey(basenameOf(kRaw));
    const noext = normalizeKey(stripExt(base));

    const p1 = base ? normalizeKey(`/creatives/${base}`) : "";
    const p1n = noext ? normalizeKey(`/creatives/${noext}`) : "";
    const c1 = base ? normalizeKey(`C:/creatives/${base}`) : "";
    const c1n = noext ? normalizeKey(`C:/creatives/${noext}`) : "";

    const keys = uniq([
      kRaw,
      base,
      noext,
      p1,
      p1n,
      c1,
      c1n,
      kRaw.startsWith("C:") ? normalizeKey(kRaw.slice(2)) : normalizeKey(`C:${kRaw}`),
      base ? (base.startsWith("C:") ? normalizeKey(base.slice(2)) : normalizeKey(`C:${base}`)) : "",
      noext
        ? noext.startsWith("C:")
          ? normalizeKey(noext.slice(2))
          : normalizeKey(`C:${noext}`)
        : "",
      p1 ? (p1.startsWith("C:") ? normalizeKey(p1.slice(2)) : normalizeKey(`C:${p1}`)) : "",
      c1 ? (c1.startsWith("C:") ? normalizeKey(c1.slice(2)) : normalizeKey(`C:${c1}`)) : "",
    ]);

    for (const kk of keys) {
      if (!out[kk]) out[kk] = url;
    }
  }

  return out;
}

function makeCreativeKeyCandidates(c: any) {
  const creativeKey = normalizeKey(c?.creative_key);
  const fileName = normalizeKey(c?.file_name);
  const storagePath = normalizeKey(c?.storage_path);

  const baseFile = fileName ? basenameOf(fileName) : "";
  const basePath = storagePath ? basenameOf(storagePath) : "";

  const prefFile = baseFile ? normalizeKey(`/creatives/${baseFile}`) : "";
  const prefPath = basePath ? normalizeKey(`/creatives/${basePath}`) : "";
  const noextFile = baseFile ? stripExt(baseFile) : "";
  const noextPath = basePath ? stripExt(basePath) : "";

  return uniq([
    creativeKey,
    fileName,
    baseFile,
    noextFile,
    prefFile,
    noextFile ? normalizeKey(`/creatives/${noextFile}`) : "",
    storagePath,
    basePath,
    noextPath,
    prefPath,
    noextPath ? normalizeKey(`/creatives/${noextPath}`) : "",
  ]);
}

function makeRowCreativeCandidates(r: any) {
  const rawCandidates: any[] = [
    r?.creative_key,
    r?.creativeKey,
    r?.creative_file,
    r?.creativeFile,
    r?.creative,
    r?.imagepath_raw,
    r?.imagepath,
    r?.imagePath,
    r?.image_path,
    r?.image_url,
    r?.imageUrl,
    r?.thumbnail?.imagePath,
    r?.thumbnail?.imagepath,
    r?.thumbUrl,
    r?.thumb_url,
    r?.thumbnailUrl,
    r?.thumbnail_url,
    r?.extras?.creative_key,
    r?.extras?.creativeKey,
    r?.extras?.creative_file,
    r?.extras?.creativeFile,
    r?.extras?.creative,
    r?.extras?.imagepath_raw,
    r?.extras?.imagepath,
    r?.extras?.imagePath,
    r?.extras?.image_path,
  ];

  const rawStrs = uniq(
    rawCandidates
      .filter(Boolean)
      .map((v) => normalizeKey(v))
      .map((v) => String(v).trim())
  );

  const baseNames: string[] = [];
  for (const s of rawStrs) {
    const b = basenameOf(s);
    if (!b) continue;
    baseNames.push(normalizeKey(b));
    baseNames.push(normalizeKey(stripExt(b)));
  }

  const pathForms: string[] = [];
  for (const b of baseNames) {
    if (!b) continue;
    pathForms.push(normalizeKey(`/creatives/${b}`));
    pathForms.push(normalizeKey(`C:/creatives/${b}`));
  }

  const all = uniq([...rawStrs, ...baseNames, ...pathForms]).map(normalizeKey);

  const withPrefix: string[] = [];
  for (const k of all) {
    const kk = normalizeKey(k);
    if (!kk) continue;

    if (kk.startsWith("C:")) {
      withPrefix.push(kk);
      withPrefix.push(normalizeKey(kk.slice(2)));
    } else {
      withPrefix.push(normalizeKey(`C:${kk}`));
      withPrefix.push(kk);
    }
  }

  return uniq(withPrefix.map(normalizeKey));
}

async function fetchReportNames(sb: any, report: any) {
  const meta: any =
    report?.meta && typeof report.meta === "object" ? report.meta : {};

  let advertiser_name =
    asStr(report?.advertiser_name) ||
    asStr(meta?.advertiser_name) ||
    asStr(meta?.advertiserName) ||
    "";

  let report_type_name =
    asStr(report?.report_type_name) ||
    asStr(meta?.report_type_name) ||
    asStr(meta?.reportTypeName) ||
    "";

  let report_type_key =
    asStr(report?.report_type_key) ||
    asStr(meta?.report_type_key) ||
    asStr(meta?.reportTypeKey) ||
    "";

  const advertiserId = asStr(report?.advertiser_id);
  const reportTypeId = asStr(report?.report_type_id);

  if (!advertiser_name && advertiserId) {
    const { data: adv, error: advErr } = await sb
      .from("advertisers")
      .select("name")
      .eq("id", advertiserId)
      .maybeSingle();

    if (!advErr && adv) {
      advertiser_name = asStr(adv?.name);
    }
  }

  if ((!report_type_name || !report_type_key) && reportTypeId) {
    const { data: rt, error: rtErr } = await sb
      .from("report_types")
      .select("name,key")
      .eq("id", reportTypeId)
      .maybeSingle();

    if (!rtErr && rt) {
      if (!report_type_name) report_type_name = asStr(rt?.name);
      if (!report_type_key) report_type_key = asStr(rt?.key);
    }
  }

  return {
    advertiser_name,
    report_type_name,
    report_type_key,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Array.isArray(items) || items.length === 0) return [];

  const safeLimit = Math.max(1, Math.floor(limit || 1));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, () => run())
  );

  return results;
}

/**
 * GET /api/share/[token]
 */
export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const shareToken = asToken(token);
  if (!shareToken) return jsonError(400, "Missing share token");

  const url = new URL(req.url);
  const debugOn = url.searchParams.get("debug") === "1";
  const expiresIn = asInt(url.searchParams.get("expiresIn"), 3600);
  const attachImagePath = url.searchParams.get("attachImagePath") === "1";
  const strict = asBool(url.searchParams.get("strict"));

  const sb = getSupabaseAdmin();

  const { data: report, error: repErr } = await sb
    .from("reports")
    .select(
      [
        "id",
        "title",
        "status",
        "created_at",
        "updated_at",
        "workspace_id",
        "created_by",
        "report_type_id",
        "meta",
        "period_start",
        "period_end",
        "published_period_start",
        "published_period_end",
        "published_at",
        "published_ingestion_id",
        "published_creatives_batch_id",
        "share_token",
        "advertiser_id",
      ].join(",")
    )
    .eq("share_token", shareToken)
    .maybeSingle();

  if (repErr) return jsonError(500, repErr.message || "DB error");
  if (!report) return jsonError(404, "Invalid share token");

  const status = String((report as any)?.status ?? "");
  if (status !== "ready") return jsonError(403, "Report is not published");

  const reportId = String((report as any).id);
  const meta: any = (report as any)?.meta ?? {};
  const publishedIngestionId = asStr((report as any)?.published_ingestion_id) || null;

  const names = await fetchReportNames(sb, report);

  const reportForResponse = {
    ...(report as any),
    advertiser_name: names.advertiser_name || null,
    report_type_name: names.report_type_name || null,
    report_type_key: names.report_type_key || null,
  };

  if (strict) {
    const lastCsvUploadedAt = asIsoOrNull(
      meta?.last_csv_uploaded_at ??
        meta?.lastCsvUploadedAt ??
        meta?.last_csv_at ??
        meta?.lastCsvAt
    );
    const lastIngestedAt = asIsoOrNull(
      meta?.last_ingested_at ??
        meta?.lastIngestedAt ??
        meta?.last_ingestion_at ??
        meta?.lastIngestionAt
    );

    if (!lastCsvUploadedAt) {
      return jsonError(409, "SHARE_BLOCKED_NO_CSV_META", {
        hint: "reports.meta.last_csv_uploaded_at missing",
        ...(debugOn ? { meta } : {}),
      });
    }

    if (!lastIngestedAt) {
      return jsonError(409, "SHARE_BLOCKED_NO_INGESTION_META", {
        hint: "reports.meta.last_ingested_at missing",
        ...(debugOn ? { meta } : {}),
      });
    }

    if (Date.parse(lastIngestedAt) < Date.parse(lastCsvUploadedAt)) {
      return jsonError(409, "SHARE_BLOCKED_INGESTION_OUTDATED", {
        lastCsvUploadedAt,
        lastIngestedAt,
        ...(debugOn ? { meta } : {}),
      });
    }
  }

  let rawRows: any[] = [];
  try {
    rawRows = await fetchAllReportRows(sb, reportId, publishedIngestionId);
  } catch (e: any) {
    return jsonError(500, e?.message || "Failed to fetch rows");
  }

  let rows = (rawRows ?? [])
    .map((r: any) => extractRowObject(r))
    .filter((r: any) => r && typeof r === "object");

  const mm = minMaxDate(rows);

  const { data: creatives, error: creErr } = await sb
    .from("report_creatives")
    .select("creative_key, file_name, storage_bucket, storage_path, mime_type, bytes")
    .eq("report_id", reportId);

  if (creErr) return jsonError(500, creErr.message || "Creatives DB error");

  const creativeErrors: any[] = [];

  const signedCreativeEntries = await mapWithConcurrency(
    creatives ?? [],
    6,
    async (c: any) => {
      const bucket =
        String((c as any).storage_bucket ?? "report_uploads").trim() || "report_uploads";
      const path = String((c as any).storage_path ?? "").trim();

      if (!bucket || !path) {
        if (debugOn) {
          creativeErrors.push({
            reason: "MISSING_STORAGE",
            creative_key: String((c as any).creative_key ?? ""),
            file_name: String((c as any).file_name ?? ""),
            storage_bucket: bucket,
            storage_path: path,
          });
        }
        return null;
      }

      const { data: signed, error: signErr } = await sb.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (signErr || !signed?.signedUrl) {
        if (debugOn) {
          creativeErrors.push({
            reason: "SIGNED_URL_FAILED",
            creative_key: String((c as any).creative_key ?? ""),
            file_name: String((c as any).file_name ?? ""),
            storage_bucket: bucket,
            storage_path: path,
            signErr: signErr ? String((signErr as any).message ?? signErr) : "NO_URL",
          });
        }
        return null;
      }

      return {
        signedUrl: signed.signedUrl,
        keys: makeCreativeKeyCandidates(c),
      };
    }
  );

  const creativesUrlMap: Record<string, string> = {};

  for (const entry of signedCreativeEntries) {
    if (!entry?.signedUrl || !Array.isArray(entry.keys)) continue;

    for (const k of entry.keys) {
      if (!k) continue;
      if (!creativesUrlMap[k]) creativesUrlMap[k] = entry.signedUrl;
    }
  }

  const creativesMapNormalized = normalizeCreativesMap(creativesUrlMap);

  if (attachImagePath && Object.keys(creativesMapNormalized).length > 0) {
    rows = rows.map((r: any) => {
      const candidates = makeRowCreativeCandidates(r);

      let matchedUrl: string | null = null;
      let matchedKey: string | null = null;

      for (const k of candidates) {
        const kk = normalizeKey(k);
        const u = creativesMapNormalized[kk];
        if (u) {
          matchedUrl = u;
          matchedKey = kk;
          break;
        }
      }

      if (!matchedUrl) return r;

      return {
        ...r,
        imagepath_raw:
          r?.imagepath_raw ??
          basenameOf(
            String(
              r?.imagePath ??
                r?.imagepath ??
                r?.image_path ??
                r?.creative_file ??
                r?.creativeFile ??
                ""
            )
          ),
        imagePath: matchedUrl,
        imagepath: matchedUrl,
        image_path: matchedUrl,
        image_url: matchedUrl,
        imageUrl: matchedUrl,
        thumbnail: { imagePath: matchedUrl, imagepath: matchedUrl },
        thumbUrl: matchedUrl,
        thumb_url: matchedUrl,
        thumbnailUrl: matchedUrl,
        thumbnail_url: matchedUrl,
        __matchedKey: matchedKey,
      };
    });
  }

  const debugRowSample = debugOn
    ? (rows.slice(0, 10) as any[]).map((r) => ({
        creative: r?.creative,
        creative_file: r?.creative_file,
        imagepath: r?.imagepath,
        imagePath: r?.imagePath,
        imagepath_raw: r?.imagepath_raw,
        __matchedKey: r?.__matchedKey ?? null,
        keys: Object.keys(r || {}).slice(0, 40),
      }))
    : undefined;

  return NextResponse.json(
    {
      ok: true,
      report: reportForResponse,
      rows,
      creativesMap: creativesUrlMap,
      creativesMapNormalized,
      debug: {
        rows_cnt: rows.length,
        creatives_raw_cnt: (creatives ?? []).length,
        creatives_cnt: Object.keys(creativesUrlMap).length,
        creatives_norm_cnt: Object.keys(creativesMapNormalized).length,
        min_date: mm.min_date,
        max_date: mm.max_date,
        strict,
        published_ingestion_id: publishedIngestionId,
        ...(debugOn
          ? {
              creativeErrors,
              rowSample: debugRowSample,
              meta,
              advertiser_name: reportForResponse.advertiser_name,
              report_type_name: reportForResponse.report_type_name,
              report_type_key: reportForResponse.report_type_key,
            }
          : {}),
      },
    },
    { status: 200 }
  );
}