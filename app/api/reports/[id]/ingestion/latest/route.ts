// app/api/reports/[id]/ingestion/latest/route.ts
import { NextResponse } from "next/server";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function GET() {
  try {
    // ✅ sbAuth() 결과객체 방식 통일
    const auth = await sbAuth();
    const user = (auth as any)?.user ?? null;
    const authErr = (auth as any)?.error ?? null;

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false as const, status: 401 as const });
    }

    return NextResponse.json({ ok: true as const, userId: user.id });
  } catch (e: any) {
    return jsonError(500, e?.message || String(e));
  }
}