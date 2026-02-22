import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, report_type_id, title, status, period_start, period_end, meta, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    return NextResponse.json({ ok: true, report: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : undefined;
    const period_start = body.period_start ?? undefined; // date or null
    const period_end = body.period_end ?? undefined;     // date or null
    const meta = body.meta ?? undefined;                 // jsonb

    // update payload (undefined는 제외)
    const patch: any = {};
    if (title !== undefined) patch.title = title;
    if (body.hasOwnProperty("period_start")) patch.period_start = period_start;
    if (body.hasOwnProperty("period_end")) patch.period_end = period_end;
    if (meta !== undefined) patch.meta = meta;

    const { data, error } = await supabaseAdmin
      .from("reports")
      .update(patch)
      .eq("id", id)
      .select("id, title, status, period_start, period_end, meta, updated_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    return NextResponse.json({ ok: true, report: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}