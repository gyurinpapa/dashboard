// app/api/debug/whoami/route.ts
import { NextResponse } from "next/server";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ✅ 현재 프로젝트 sbAuth() 시그니처(결과 객체)로 통일
    const auth = await sbAuth();
    const user = (auth as any)?.user ?? null;
    const err = (auth as any)?.error ?? null;

    return NextResponse.json({
      ok: !err && !!user,
      user: user ?? null,
      error: err ? String((err as any)?.message ?? err) : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, user: null, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}