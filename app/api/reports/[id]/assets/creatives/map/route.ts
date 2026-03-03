// app/api/reports/[id]/assets/creatives/map/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asInt(v: any, def = 3600) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (n < 60) return 60;
  if (n > 60 * 60 * 24) return 60 * 60 * 24;
  return Math.floor(n);
}

function normalizeFilenameKey(v: any): string {
  // ✅ 최소한의 키 정규화(과매칭 방지)
  // - NFC normalize
  // - trim
  // - basename만 (path 제거)
  // - 소문자
  const s = String(v ?? "").trim();
  const base = s.split("/").pop() ?? s;
  try {
    return base.normalize("NFC").toLowerCase();
  } catch {
    return base.toLowerCase();
  }
}

function stripExt(name: string) {
  return name.replace(/\.[a-z0-9]{1,8}$/i, "");
}

function shouldExpand(mode: string) {
  return mode === "expanded";
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    // ✅ auth: sbAuth() 결과 객체 방식
    const auth = await sbAuth();
    const user = (auth as any)?.user ?? null;
    const authErr = (auth as any)?.error ?? null;

    if (authErr || !user) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const { id } = await ctx.params;

    const url = new URL(req.url);
    const expiresIn = asInt(url.searchParams.get("expiresIn"), 3600);
    const mode = (url.searchParams.get("mode") || "strict").toLowerCase();

    const admin = getSupabaseAdmin();

    // ✅ report 조회 (workspace_id 필요)
    const { data: report, error: rErr } = await admin
      .from("reports")
      .select("id, workspace_id")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    // ✅ membership 체크
    const { data: wm, error: wmErr } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "FORBIDDEN");

    // ✅ report_creatives: 업로드된 소재 목록
    const { data: rows, error: cErr } = await admin
      .from("report_creatives")
      .select("creative_key, file_name, storage_path")
      .eq("report_id", id)
      .order("created_at", { ascending: false });

    if (cErr) return jsonError(500, cErr.message);

    const BUCKET = "report_uploads";

    // ✅ strict 원본 entries: "파일 기준"으로만 만든다 (과매칭 방지)
    // key: creative_key (원본파일명)
    // url: signed url
    const baseEntries: Array<{ key: string; path: string }> = [];
    for (const r of rows ?? []) {
      const path = String((r as any).storage_path || "").trim();
      const keyRaw = (r as any).creative_key ?? (r as any).file_name ?? "";
      const key = normalizeFilenameKey(keyRaw);
      if (!path || !key) continue;
      baseEntries.push({ key, path });
    }

    // ✅ signed urls (중복 path 제거)
    const uniqPath = new Map<string, { key: string; path: string }>();
    for (const e of baseEntries) {
      if (!uniqPath.has(e.path)) uniqPath.set(e.path, e);
    }

    const creativesMap: Record<string, string> = {};
    const strictCount = uniqPath.size;

    for (const e of uniqPath.values()) {
      const { data: signed, error: sErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(e.path, expiresIn);

      if (sErr || !signed?.signedUrl) continue;

      // ✅ strict key only
      creativesMap[e.key] = signed.signedUrl;

      // ✅ expanded 모드일 때만 “최소 확장” 허용
      // - stripExt(basename) 정도만 추가 (공백/언더스코어/특수문자 확장은 금지)
      if (shouldExpand(mode)) {
        const k2 = stripExt(e.key);
        if (k2 && !creativesMap[k2]) creativesMap[k2] = signed.signedUrl;
      }
    }

    const expandedCount = Object.keys(creativesMap).length;

    return NextResponse.json({
      ok: true,
      creativesMap,
      meta: {
        mode,
        strictCount, // 실제 파일 수(고유 path)
        expandedCount, // 키 후보 수
        expiresIn,
      },
    });
  } catch (e: any) {
    return jsonError(500, e?.message || String(e));
  }
}