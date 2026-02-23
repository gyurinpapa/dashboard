import { NextResponse } from "next/server";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export async function GET() {
  const sb = await sbAuth();
  const { data: { user }, error } = await sb.auth.getUser();

  return NextResponse.json({
    ok: !error && !!user,
    error: error?.message ?? null,
    user_id: user?.id ?? null,
    email: user?.email ?? null,
  });
}