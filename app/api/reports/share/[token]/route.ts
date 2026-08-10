// app/api/reports/share/[token]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sbAdmin() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function buildPublicMeta(metaValue: any) {
  const meta =
    metaValue && typeof metaValue === "object" && !Array.isArray(metaValue)
      ? metaValue
      : {};

  const out: Record<string, any> = {};

  const copyKeys = [
    "advertiser_name",
    "advertiserName",
    "report_type_name",
    "reportTypeName",
    "report_type_key",
    "reportTypeKey",
  ] as const;

  for (const key of copyKeys) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) {
      out[key] = meta[key];
    }
  }

  if (
    meta?.month_goal &&
    typeof meta.month_goal === "object" &&
    !Array.isArray(meta.month_goal)
  ) {
    const publicMonthGoal: Record<string, any> = {};

    for (const key of [
      "revenue",
      "cost",
      "roas",
      "conversions",
      "clicks",
      "ctr",
      "cvr",
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(meta.month_goal, key)) {
        publicMonthGoal[key] = meta.month_goal[key];
      }
    }

    out.month_goal = publicMonthGoal;
  }

  if (
    meta?.brand_search_contracts &&
    typeof meta.brand_search_contracts === "object" &&
    !Array.isArray(meta.brand_search_contracts)
  ) {
    const publicContracts: Record<
      string,
      Record<string, any>
    > = {};

    for (const [month, value] of Object.entries(
      meta.brand_search_contracts
    )) {
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        continue;
      }

      const publicValue: Record<string, any> = {};

      for (const key of ["pc", "mobile"] as const) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          publicValue[key] = (value as any)[key];
        }
      }

      publicContracts[month] = publicValue;
    }

    if (Object.keys(publicContracts).length > 0) {
      out.brand_search_contracts = publicContracts;
    }
  }

  return out;
}

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const shareToken = String(token || "").trim();

    if (!shareToken) {
      return jsonError(400, "Missing share token");
    }

    const sb = sbAdmin();

    const { data: report, error } = await sb
      .from("reports")
      .select(
        [
          "id",
          "title",
          "status",
          "meta",
          "period_start",
          "period_end",
          "published_ingestion_id",
        ].join(",")
      )
      .eq("share_token", shareToken)
      .maybeSingle();

    if (error) {
      return jsonError(500, error.message);
    }

    if (!report) {
      return jsonError(404, "Share token not found");
    }

    if ((report as any).status !== "ready") {
      return jsonError(403, "Report is not published");
    }

    const publishedIngestionId = String(
      (report as any)?.published_ingestion_id ?? ""
    ).trim();

    /**
     * Legacy compatibility route도 실제 공개 가능한 published snapshot만 허용한다.
     *
     * - draft/current/old fallback 없음
     * - published_ingestion_id가 없으면 공개 응답을 반환하지 않는다
     * - 현재 Production ready + share_token 대상은 모두 이 조건을 충족함
     */
    if (!publishedIngestionId) {
      return jsonError(
        409,
        "SHARE_BLOCKED_NO_PUBLISHED_INGESTION"
      );
    }

    /**
     * 기존 legacy response의 { ok, report } shape는 유지한다.
     *
     * 호환성 때문에 id/title/status/period는 유지하되,
     * bearer credential인 share_token과 operational timestamps,
     * ingestion/upload 내부 meta는 공개하지 않는다.
     */
    const reportForResponse = {
      id: (report as any)?.id ?? null,
      title: (report as any)?.title ?? null,
      status: (report as any)?.status ?? null,
      meta: buildPublicMeta((report as any)?.meta),
      period_start: (report as any)?.period_start ?? null,
      period_end: (report as any)?.period_end ?? null,
    };

    return NextResponse.json({
      ok: true,
      report: reportForResponse,
    });
  } catch (e: any) {
    return jsonError(
      500,
      e?.message || "Server error"
    );
  }
}
