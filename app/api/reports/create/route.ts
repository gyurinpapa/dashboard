// app/api/reports/create/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateBody = {
  workspace_id?: string;
  advertiser_id?: string | null;
  report_type_id?: string;
  title?: string;
  status?: string;
  meta?: any;
  period_start?: string | null;
  period_end?: string | null;
};

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function safeObj(v: any) {
  return v && typeof v === "object" ? v : {};
}

/**
 * ✅ Bearer 우선 + 쿠키(session) fallback
 * - 프론트에서 Authorization: Bearer ... 를 보내면 이걸 먼저 검증
 * - 없으면 sbAuth() 쿠키 세션으로 user 확인
 */
async function getUserId(
  req: Request
): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  // 1) Bearer 토큰
  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    const userId = data?.user?.id ?? null;

    if (error || !userId) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }
    return { ok: true, userId };
  }

  // 2) 쿠키 세션 (fallback)
  const auth = await sbAuth();
  const user = auth?.user ?? null;

  if (!user) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized (no session). Please sign in.",
    };
  }

  return { ok: true, userId: user.id };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateBody;

    const workspace_id_in = asString(body.workspace_id);
    const advertiser_id_raw = asString(body.advertiser_id);
    const advertiser_id = advertiser_id_raw || null;

    const report_type_id = asString(body.report_type_id);
    const title = asString(body.title);
    const status = asString(body.status) || "draft";
    const meta = safeObj(body.meta);

    // period는 "들어오면 우선", 없으면 자동세팅
    const period_start_in = body.period_start ?? null;
    const period_end_in = body.period_end ?? null;

    if (!report_type_id) return jsonError(400, "report_type_id is required");

    // ✅ 1) Auth (Bearer 우선 + 쿠키 fallback)
    const auth = await getUserId(req);
    if (!auth.ok) return jsonError(auth.status, auth.message);

    const created_by = auth.userId;

    // ✅ 2) workspace 결정
    // - advertiser_id가 있으면 advertiser.workspace_id를 우선 사용
    // - advertiser_id가 없으면 body.workspace_id 사용
    let resolved_workspace_id = workspace_id_in;

    if (advertiser_id) {
      const { data: adv, error: advErr } = await supabaseAdmin
        .from("advertisers")
        .select("id, workspace_id")
        .eq("id", advertiser_id)
        .maybeSingle();

      if (advErr) return jsonError(500, advErr.message);
      if (!adv) return jsonError(400, "Invalid advertiser_id");

      resolved_workspace_id = asString(adv.workspace_id);

      // body.workspace_id가 들어왔고 advertiser workspace와 다르면 차단
      if (workspace_id_in && resolved_workspace_id !== workspace_id_in) {
        return jsonError(400, "workspace_id does not match advertiser workspace");
      }
    }

    if (!resolved_workspace_id) {
      return jsonError(400, "workspace_id is required");
    }

    // ✅ 3) 멤버십 체크 (resolved workspace 기준)
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", resolved_workspace_id)
      .eq("user_id", created_by)
      .limit(1)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) {
      return jsonError(403, "Forbidden: you are not a member of this workspace");
    }

    // ✅ 3-1) advertiser_id가 들어오면 같은 workspace 소속 광고주인지 최종 재검증
    if (advertiser_id) {
      const { data: adv, error: advErr } = await supabaseAdmin
        .from("advertisers")
        .select("id, workspace_id")
        .eq("id", advertiser_id)
        .eq("workspace_id", resolved_workspace_id)
        .maybeSingle();

      if (advErr) return jsonError(500, advErr.message);
      if (!adv) {
        return jsonError(400, "Invalid advertiser_id for this workspace");
      }
    }

    // ✅ 4) period 자동세팅 (없을 때만)
    let period_start = period_start_in;
    let period_end = period_end_in;

    if (!period_start || !period_end) {
      const [{ data: minRows, error: minErr }, { data: maxRows, error: maxErr }] =
        await Promise.all([
          supabaseAdmin
            .from("metrics_daily")
            .select("date")
            .eq("workspace_id", resolved_workspace_id)
            .order("date", { ascending: true })
            .limit(1),
          supabaseAdmin
            .from("metrics_daily")
            .select("date")
            .eq("workspace_id", resolved_workspace_id)
            .order("date", { ascending: false })
            .limit(1),
        ]);

      if (!minErr && !maxErr) {
        const minDate = (minRows?.[0] as any)?.date ?? null;
        const maxDate = (maxRows?.[0] as any)?.date ?? null;

        if (!period_start && minDate) period_start = minDate;
        if (!period_end && maxDate) period_end = maxDate;
      }
    }

    // ✅ 5) reports insert
    const { data, error } = await supabaseAdmin
      .from("reports")
      .insert({
        workspace_id: resolved_workspace_id,
        advertiser_id,
        report_type_id,
        title: title || "New Report - Draft",
        status,
        period_start,
        period_end,
        created_by,
        meta,
      })
      .select(
        "id, workspace_id, advertiser_id, report_type_id, title, status, period_start, period_end, created_at"
      )
      .single();

    if (error) return jsonError(400, error.message);

    return NextResponse.json({ ok: true, report: data });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}