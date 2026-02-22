import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../src/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = supabaseServer();

  const body = await req.json().catch(() => ({}));
  const { workspace_id, report_type_id, title, period_start, period_end, meta } =
    body ?? {};

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!workspace_id || !report_type_id || !title) {
    return NextResponse.json(
      { error: "workspace_id, report_type_id, title are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      workspace_id,
      report_type_id,
      title,
      period_start: period_start ?? null,
      period_end: period_end ?? null,
      status: "draft",
      created_by: auth.user.id,
      meta: meta ?? {},
    })
    .select("id, workspace_id, title, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, report: data });
}