import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const workspace_id = url.searchParams.get("workspace_id");
    const limit = Number(url.searchParams.get("limit") ?? "50");

    if (!workspace_id) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("id, title, status, period_start, period_end, created_at, updated_at")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, reports: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}