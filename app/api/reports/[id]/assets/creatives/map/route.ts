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
    // ✅ auth 통일
    const auth = await sbAuth();

    if (!auth.ok) {
    return jsonError(401, "UNAUTHORIZED");
    }

    const user = auth.user;

    const { id } = await ctx.params;

    const url = new URL(req.url);
    const expiresIn = asInt(url.searchParams.get("expiresIn"), 3600);
    const mode = (url.searchParams.get("mode") || "strict").toLowerCase();

    const admin = getSupabaseAdmin();

    // 1️⃣ report 조회
    const { data: report, error: rErr } = await admin
      .from("reports")
      .select("id, workspace_id")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    // 2️⃣ workspace membership 체크
    const { data: wm, error: wmErr } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "FORBIDDEN");

    // 3️⃣ report_creatives 조회
    const { data: rows, error: cErr } = await admin
      .from("report_creatives")
      .select("creative_key, file_name, storage_path, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: false });

    if (cErr) return jsonError(500, cErr.message);

    const BUCKET = "report_uploads";

    const baseEntries: Array<{ key: string; path: string }> = [];

    for (const r of rows ?? []) {
      const path = String((r as any).storage_path || "").trim();
      const keyRaw = (r as any).creative_key ?? (r as any).file_name ?? "";
      const key = normalizeFilenameKey(keyRaw);

      if (!path || !key) continue;

      baseEntries.push({ key, path });
    }

    const uniqPath = new Map<string, { key: string; path: string }>();

    for (const e of baseEntries) {
      if (!uniqPath.has(e.path)) {
        uniqPath.set(e.path, e);
      }
    }

    const creativesMap: Record<string, string> = {};
    const strictCount = uniqPath.size;

    for (const e of uniqPath.values()) {
      const { data: signed, error: sErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(e.path, expiresIn);

      if (sErr || !signed?.signedUrl) continue;

      creativesMap[e.key] = signed.signedUrl;

      if (shouldExpand(mode)) {
        const k2 = stripExt(e.key);
        if (k2 && !creativesMap[k2]) {
          creativesMap[k2] = signed.signedUrl;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      creativesMap,
      meta: {
        mode,
        strictCount,
        expandedCount: Object.keys(creativesMap).length,
        expiresIn,
      },
    });
  } catch (e: any) {
    return jsonError(500, e?.message || String(e));
  }
}