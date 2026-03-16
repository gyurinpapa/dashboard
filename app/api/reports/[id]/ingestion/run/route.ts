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

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[,\s₩%]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ✅ “한글/특수문자만 있는 헤더”가 전부 "_"로 깨지는 걸 방지
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

/**
 * 아주 단순하지만 꽤 안전한 CSV 파서 (quoted field 지원)
 */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && next === '"') {
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  rows.push(row);

  return rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
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

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ✅ CSV 선택용 timestamp 유틸
function toMs(v: any) {
  if (!v) return 0;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

// ✅ 최신 CSV 엔트리 선택
// - timestamp가 있으면 가장 최신 시간 우선
// - timestamp가 전혀 없으면 append 구조를 가정해 마지막 항목 사용
function pickLatestCsvEntry(csvArr: any[]) {
  if (!Array.isArray(csvArr) || !csvArr.length) return null;

  const scored = csvArr.map((item, index) => {
    const ts = Math.max(
      toMs(item?.uploaded_at),
      toMs(item?.created_at),
      toMs(item?.updated_at),
      toMs(item?.added_at),
      toMs(item?.last_modified),
      toMs(item?.timestamp)
    );

    return { item, index, ts };
  });

  const hasTimestamp = scored.some((x) => x.ts > 0);

  if (hasTimestamp) {
    scored.sort((a, b) => {
      if (b.ts !== a.ts) return b.ts - a.ts;
      return b.index - a.index;
    });
    return scored[0].item;
  }

  return csvArr[csvArr.length - 1] ?? null;
}

// channel/device/source 자동 추출(있으면 쓰고, 없으면 null)
function pickDim(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/** ==== path helpers (윈도우 경로/URL 모두 대응) ==== */
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

/**
 * ✅ 날짜 찾기: (1) 알려진 키 → (2) 모든 값 스캔해서 yyyy-mm-dd/yyyymmdd 탐지
 */
function pickDateField(obj: any) {
  const known = [
    "date",
    "day",
    "ymd",
    "report_date",
    "날짜",
    "일자",
    "기간_시작",
    "기간시작",
    "집계일",
    "start_date",
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
  if (file) return { creative: stripExt(file), creative_file: basenameOf(file) };

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

/**
 * ✅ Bearer 우선 + 쿠키(session) fallback
 */
async function getUserId(req: Request) {
  const admin = getSupabaseAdmin();

  // 1) Bearer 우선
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

  // 2) 쿠키 세션 fallback
  const auth = await sbAuth();
  if (auth.error || !auth.user?.id) {
    return { ok: false as const, status: 401, message: "Unauthorized (no session)" };
  }

  return { ok: true as const, userId: auth.user.id };
}

export async function POST(req: Request, ctx: Ctx) {
  // ✅ auth (Bearer 우선 + 쿠키 fallback)
  const auth = await getUserId(req);
  if (!auth.ok) {
    return jsonError(auth.status, "UNAUTHORIZED", { detail: auth.message });
  }

  const userId = auth.userId;

  const { id } = await ctx.params;
  const reportId = asString(id);
  if (!reportId) return jsonError(400, "Missing report id");

  const body = await req.json().catch(() => ({}));
  const mode = asString(body?.mode) || "replace"; // replace | append

  const sb = getSupabaseAdmin();

  // 1) report + meta 로드
  const { data: report, error: repErr } = await sb
    .from("reports")
    .select("id, workspace_id, advertiser_id, meta")
    .eq("id", reportId)
    .maybeSingle();

  if (repErr) return jsonError(500, repErr.message || "DB error");
  if (!report) return jsonError(404, "Report not found");

  // ✅ workspace membership 체크
  const { data: wm, error: wmErr } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", (report as any).workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (wmErr) return jsonError(500, wmErr.message || "DB error");
  if (!wm) return jsonError(403, "FORBIDDEN");

  const meta: any = (report as any).meta ?? {};
  const csvArr: any[] = Array.isArray(meta?.upload?.csv) ? meta.upload.csv : [];
  const latestCsv = pickLatestCsvEntry(csvArr);

  console.log("[ingestion:csv-source]", {
    reportId,
    csvCount: csvArr.length,
    selectedName: asString(latestCsv?.name),
    selectedPath: asString(latestCsv?.path),
    candidates: csvArr.map((x, i) => ({
      i,
      name: asString(x?.name),
      path: asString(x?.path),
      uploaded_at: asString(x?.uploaded_at),
      created_at: asString(x?.created_at),
      updated_at: asString(x?.updated_at),
      added_at: asString(x?.added_at),
      timestamp: asString(x?.timestamp),
    })),
  });

  const bucket = asString(latestCsv?.bucket) || "report_uploads";
  const path = asString(latestCsv?.path);

  if (!path) {
    return jsonError(
      400,
      "No CSV uploaded yet (reports.meta.upload.csv[path] missing)"
    );
  }

  // ✅ 이번 ingestion 세션 id 발급
  const ingestionId = randomUUID();

  // 2) replace면 기존 rows 삭제 (report_id 기준 그대로 유지)
  if (mode === "replace") {
    const { error: delErr } = await sb
      .from("report_rows")
      .delete()
      .eq("report_id", reportId);

    if (delErr) {
      return jsonError(500, delErr.message || "Failed to delete old rows");
    }
  }

  // 3) storage download → parse
  const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(path);
  if (dlErr || !blob) {
    return jsonError(500, dlErr?.message || "CSV download failed", { bucket, path });
  }

  const text = await blob.text();
  const grid = parseCsv(text);
  if (grid.length < 2) return jsonError(400, "CSV seems empty");

  const headerRaw = grid[0].map((h) => String(h ?? "").trim());
  const headers = headerRaw.map((h, i) => normKey(h, i));
  const dataLines = grid.slice(1);

  // 4) row objects 만들기
  const rowObjects: { ymd: string; obj: any }[] = [];
  for (const line of dataLines) {
    const obj: any = {};

    for (let i = 0; i < headers.length; i++) {
      const keyNorm = headers[i];
      const keyRaw = headerRaw[i] || `raw_${i}`;
      const v = line[i] ?? "";

      obj[keyNorm] = v;
      obj[keyRaw] = v;
    }

    const ymd = pickDateField(obj);
    if (!ymd) continue;

    // 숫자 정규화
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

    // creative / imagepath 보강
    const imgPath = pickImagePathLike(obj);
    if (imgPath) {
      obj.imagepath = imgPath;
      obj.imagePath = imgPath;
      obj.imagepath_raw = basenameOf(imgPath);
    }

    const { creative, creative_file } = pickCreativeLike(obj);

    const curCreative = String(obj.creative ?? "").trim();
    if (!curCreative && creative) obj.creative = creative;

    const curFile = String(obj.creative_file ?? "").trim();
    if (!curFile && creative_file) obj.creative_file = creative_file;

    const fileLike = basenameOf(String(obj.creative_file || obj.creative || ""));
    if (!String(obj.imagepath ?? "").trim() && fileLike && fileLike.includes(".")) {
      obj.imagepath_raw = fileLike;
    }

    rowObjects.push({ ymd, obj });
  }

  if (!rowObjects.length) {
    return jsonError(400, "No valid rows after parsing (date missing?)", {
      headerRaw: headerRaw.slice(0, 30),
      headerNorm: headers.slice(0, 30),
      sampleLine0: dataLines[0]?.slice(0, 30) ?? null,
    });
  }

  // 5) insert (batch) + ✅ ingestion_id 저장
  const workspace_id = (report as any).workspace_id ?? null;
  const advertiser_id = (report as any).advertiser_id ?? null;

  const inserts = rowObjects.map(({ ymd, obj }, idx) => {
    const channel = pickDim(obj, ["channel", "채널"]);
    const device = pickDim(obj, ["device", "기기"]);
    const source = pickDim(obj, ["source", "매체", "platform"]);

    return {
      report_id: reportId,
      workspace_id,
      advertiser_id,
      row_index: idx,
      date: ymd,
      row: obj,
      channel,
      device,
      source,

      // ✅ 핵심: 이번 세션 id
      ingestion_id: ingestionId,
    };
  });

  const batches = chunk(inserts, 500);
  for (const b of batches) {
    const { error: insErr } = await sb.from("report_rows").insert(b);
    if (insErr) {
      return jsonError(500, insErr.message || "Insert failed", {
        hint: "report_rows 컬럼 매칭(row/date/ingestion_id 등)을 확인하세요.",
      });
    }
  }

  // ✅ 6) reports.current_ingestion_id 갱신 + meta 기록
  const nextMeta = {
    ...meta,
    ingestion: {
      last_run_at: new Date().toISOString(),
      last_csv: { bucket, path, name: asString(latestCsv?.name) },
      mode,
      inserted: inserts.length,
      ingestion_id: ingestionId,
    },
  };

  const { error: upRepErr } = await sb
    .from("reports")
    .update({ meta: nextMeta, current_ingestion_id: ingestionId })
    .eq("id", reportId);

  if (upRepErr) {
    return jsonError(500, upRepErr.message || "Failed to update report session");
  }

  const dates = rowObjects.map((r) => r.ymd).sort();
  const min_date = dates[0];
  const max_date = dates[dates.length - 1];

  return NextResponse.json(
    {
      ok: true,
      reportId,
      ingestion_id: ingestionId,
      csv: { bucket, path, name: asString(latestCsv?.name) },
      inserted: inserts.length,
      min_date,
      max_date,
    },
    { status: 200 }
  );
}