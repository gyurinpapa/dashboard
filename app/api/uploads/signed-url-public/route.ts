// app/api/uploads/signed-url-public/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await req.json().catch(() => null);
    if (!body) return jsonError(400, "Invalid JSON");

    const token = asString(body.token);
    const bucket = asString(body.bucket) || "report_uploads";
    const path = asString(body.path);

    if (!token) return jsonError(400, "Missing token");
    if (!path) return jsonError(400, "Missing path");

    // 1) token으로 report 찾기 (ready만)
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, status, meta")
      .eq("share_token", token)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");
    if (report.status !== "ready") return jsonError(404, "Report not found");

    const meta = report.meta && typeof report.meta === "object" ? report.meta : {};
    const upload = meta.upload && typeof meta.upload === "object" ? meta.upload : {};

    // 2) 허용된 path인지 검증 (csv + images만)
    const csv = upload.csv && typeof upload.csv === "object" ? upload.csv : null;
    const csvPath = csv?.path ? String(csv.path) : "";

    const images = Array.isArray(upload.images) ? upload.images : [];
    const imagePaths = images
      .map((it: any) => (it?.path ? String(it.path) : ""))
      .filter(Boolean);

    const allowed = path === csvPath || imagePaths.includes(path);
    if (!allowed) return jsonError(403, "Path not allowed");

    // 3) signed url 생성
    const { data, error: sErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10); // 10분

    if (sErr) return jsonError(500, sErr.message);

    return NextResponse.json({ ok: true, url: data?.signedUrl });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}