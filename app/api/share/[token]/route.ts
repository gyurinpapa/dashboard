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
  return String(v).trim();
}

/** ===== row extractor ===== */
function extractRowObject(rec: any) {
  if (!rec) return null;

  const candidates = ["row", "data", "row_data", "payload", "json", "raw", "value"];
  for (const k of candidates) {
    const v = rec?.[k];
    if (v && typeof v === "object") return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {}
    }
  }

  const copy: any = { ...rec };
  delete copy.id;
  delete copy.report_id;
  delete copy.workspace_id;
  delete copy.advertiser_id;
  delete copy.created_at;
  delete copy.updated_at;
  return copy;
}

async function fetchAllReportRows(sb: any, reportId: string) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await sb
      .from("report_rows")
      .select("*")
      .eq("report_id", reportId)
      .range(from, to);

    if (error) throw new Error(error.message || "Rows DB error");
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function pickDateStr(r: any) {
  const v = r?.date ?? r?.ymd ?? r?.day ?? r?.dt ?? r?.report_date;
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
function basenameOf(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const base = s.split("?")[0].split("#")[0].split("/").pop() || s;
  return String(base).trim();
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
    const s = String(x ?? "").trim();
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

    const k = String(k0 ?? "").trim();
    if (!k) continue;

    const base = basenameOf(k);
    const noext = stripExt(base);

    const creativesPrefBase = base ? `/creatives/${base}` : "";
    const creativesPrefNoext = noext ? `/creatives/${noext}` : "";

    const keys = uniq([
      k,
      base,
      noext,
      creativesPrefBase,
      creativesPrefNoext,
      k.startsWith("C:") ? k.slice(2) : `C:${k}`,
      base.startsWith("C:") ? base.slice(2) : `C:${base}`,
      noext.startsWith("C:") ? noext.slice(2) : `C:${noext}`,
    ]);

    for (const kk of keys) {
      if (!kk) continue;
      if (!out[kk]) out[kk] = url;
    }
  }
  return out;
}

function makeCreativeKeyCandidates(c: any) {
  const creativeKey = String(c?.creative_key ?? "").trim();
  const fileName = String(c?.file_name ?? "").trim();
  const storagePath = String(c?.storage_path ?? "").trim();

  const baseFile = fileName ? basenameOf(fileName) : "";
  const basePath = storagePath ? basenameOf(storagePath) : "";

  const prefFile = baseFile ? `/creatives/${baseFile}` : "";
  const prefPath = basePath ? `/creatives/${basePath}` : "";

  return uniq([creativeKey, fileName, baseFile, prefFile, storagePath, basePath, prefPath]);
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

  // ✅ strict=1 이면 meta 일관성까지 체크해서, 꼬인 publish/share를 원천 차단
  const strict = asBool(url.searchParams.get("strict"));

  const sb = getSupabaseAdmin();

  // 1) report 조회
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
        "share_token",
        "published_at",
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

  // ✅ 제목용 이름 보강
  const names = await fetchReportNames(sb, report);

  const reportForResponse = {
    ...(report as any),
    advertiser_name: names.advertiser_name || null,
    report_type_name: names.report_type_name || null,
    report_type_key: names.report_type_key || null,
  };

  // ✅ (옵션) strict 모드에서만 publish 정합성 검사
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

  // 2) rows 전량 fetch
  let rawRows: any[] = [];
  try {
    rawRows = await fetchAllReportRows(sb, reportId);
  } catch (e: any) {
    return jsonError(500, e?.message || "Failed to fetch rows");
  }

  let rows = (rawRows ?? [])
    .map((r: any) => extractRowObject(r))
    .filter((r: any) => r && typeof r === "object");

  const mm = minMaxDate(rows);

  // 3) creatives fetch + signed url
  const { data: creatives, error: creErr } = await sb
    .from("report_creatives")
    .select("creative_key, file_name, storage_bucket, storage_path, mime_type, bytes")
    .eq("report_id", reportId);

  if (creErr) return jsonError(500, creErr.message || "Creatives DB error");

  const creativesUrlMap: Record<string, string> = {};
  const creativeErrors: any[] = [];

  for (const c of creatives ?? []) {
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
      continue;
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
      continue;
    }

    const signedUrl = signed.signedUrl;

    const keys = makeCreativeKeyCandidates(c);
    for (const k of keys) {
      if (!k) continue;
      if (!creativesUrlMap[k]) creativesUrlMap[k] = signedUrl;
    }
  }

  const creativesMapNormalized = normalizeCreativesMap(creativesUrlMap);

  // (옵션) rows에 imagePath/thumbnail 강제 주입
  if (attachImagePath && Object.keys(creativesMapNormalized).length > 0) {
    rows = rows.map((r: any) => {
      const cand0 =
        r?.creative_key ??
        r?.creativeKey ??
        r?.creative_file ??
        r?.creativeFile ??
        r?.creative ??
        r?.imagepath_raw ??
        r?.imagePath ??
        r?.imagepath ??
        r?.image_path ??
        null;

      const cand1 = r?.imagePath ?? r?.imagepath ?? null;
      const cand2 = r?.imagepath_raw ?? null;

      const rawCandidates = uniq(
        [cand0, cand1, cand2].map((x) => String(x ?? "").trim()).filter(Boolean)
      );

      const expanded: string[] = [];
      for (const raw of rawCandidates) {
        const base = basenameOf(raw);
        const noext = stripExt(base);

        expanded.push(raw);
        expanded.push(base);
        expanded.push(noext);

        if (base) expanded.push(`/creatives/${base}`);
        if (noext) expanded.push(`/creatives/${noext}`);

        expanded.push(raw.startsWith("C:") ? raw.slice(2) : `C:${raw}`);
        expanded.push(base.startsWith("C:") ? base.slice(2) : `C:${base}`);
        expanded.push(noext.startsWith("C:") ? noext.slice(2) : `C:${noext}`);
      }

      const candidates = uniq(expanded);

      let matchedUrl: string | null = null;
      let matchedKey: string | null = null;

      for (const k of candidates) {
        const u = creativesMapNormalized[k];
        if (u) {
          matchedUrl = u;
          matchedKey = k;
          break;
        }
      }

      if (!matchedUrl) return r;

      return {
        ...r,
        imagepath_raw: r?.imagepath_raw ?? basenameOf(String(r?.imagePath ?? r?.imagepath ?? "")),
        imagePath: matchedUrl,
        imagepath: matchedUrl,
        thumbnail: { imagePath: matchedUrl },
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