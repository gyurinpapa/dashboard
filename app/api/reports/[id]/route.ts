// app/api/reports/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

type Ctx = { params: Promise<{ id: string }> };

function asString(v: any) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

async function getUserFromSbAuth() {
  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;
  return { user, authErr };
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return jsonError(400, "id is required");
    }

    const { user, authErr } = await getUserFromSbAuth();
    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select(
        [
          "id",
          "workspace_id",
          "report_type_id",
          "title",
          "status",

          // legacy
          "period_start",
          "period_end",

          // draft
          "draft_period_start",
          "draft_period_end",

          // published
          "published_period_start",
          "published_period_end",
          "published_at",

          "meta",
          "created_at",
          "updated_at",
          "created_by",
        ].join(", ")
      )
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) {
      return jsonError(403, "Forbidden: you are not a member of this workspace");
    }

    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return jsonError(400, "id is required");
    }

    const { user, authErr } = await getUserFromSbAuth();
    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) {
      return jsonError(403, "Forbidden: you are not a member of this workspace");
    }

    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : undefined;

    const hasPeriodStart =
      Object.prototype.hasOwnProperty.call(body, "period_start") ||
      Object.prototype.hasOwnProperty.call(body, "draft_period_start");

    const hasPeriodEnd =
      Object.prototype.hasOwnProperty.call(body, "period_end") ||
      Object.prototype.hasOwnProperty.call(body, "draft_period_end");

    const draft_period_start = hasPeriodStart
      ? (body.draft_period_start ?? body.period_start ?? null)
      : undefined;

    const draft_period_end = hasPeriodEnd
      ? (body.draft_period_end ?? body.period_end ?? null)
      : undefined;

    const meta = body.meta !== undefined ? body.meta : undefined;

    const patch: any = {};

    if (title !== undefined) patch.title = title;

    if (hasPeriodStart) {
      patch.draft_period_start = draft_period_start;
      patch.period_start = draft_period_start;
    }

    if (hasPeriodEnd) {
      patch.draft_period_end = draft_period_end;
      patch.period_end = draft_period_end;
    }

    // ✅ 현재 DB 안전 우선:
    // draft_period_preset / draft_period_label 은 여기서 저장하지 않음
    // (컬럼 존재 확인 후 다음 단계에서 붙이기)

    if (meta !== undefined) patch.meta = meta;

    if (Object.keys(patch).length === 0) {
      return jsonError(400, "No fields to update");
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("reports")
      .update(patch)
      .eq("id", id)
      .select(
        [
          "id",
          "workspace_id",
          "report_type_id",
          "title",
          "status",

          "period_start",
          "period_end",

          "draft_period_start",
          "draft_period_end",

          "published_period_start",
          "published_period_end",
          "published_at",

          "meta",
          "updated_at",
        ].join(", ")
      )
      .maybeSingle();

    if (uErr) return jsonError(400, uErr.message);
    if (!updated) return jsonError(404, "Report not found");

    return NextResponse.json({ ok: true, report: updated });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}