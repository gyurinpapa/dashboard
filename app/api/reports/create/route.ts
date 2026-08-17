// app/api/reports/create/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

type ReportDataSourceKind = "csv" | "api";

type CreateBody = {
  workspace_id?: string;
  advertiser_id?: string | null;
  connection_id?: string | null;
  report_type_id?: string;
  title?: string;
  status?: string;
  meta?: any;
  period_start?: string | null;
  period_end?: string | null;
};

function jsonError(
  status: number,
  message: string,
  extra?: Record<string, any>,
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(extra ?? {}),
    },
    { status },
  );
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeObj(v: any) {
  return isPlainObject(v) ? v : {};
}

function isOnlyMasterEmail(email: any) {
  return normalizeEmail(email) === ONLY_MASTER_EMAIL;
}

function canCreateReport(
  role: string | null | undefined,
  email?: string | null,
) {
  const normalizedRole = asString(role).toLowerCase();

  if (normalizedRole === "master") {
    return isOnlyMasterEmail(email);
  }

  return (
    normalizedRole === "director" ||
    normalizedRole === "admin" ||
    normalizedRole === "staff"
  );
}

function normalizeDataSourceKind(value: any): ReportDataSourceKind {
  const kind = asString(value).toLowerCase();

  if (kind === "api") return "api";
  return "csv";
}

function normalizeReportMeta(input: any) {
  const meta = safeObj(input);
  const existingDataSource = isPlainObject(meta.data_source)
    ? meta.data_source
    : {};

  const kind = normalizeDataSourceKind(existingDataSource.kind);

  if (kind === "api") {
    const normalizedDataSource = {
      ...existingDataSource,
    };

    delete normalizedDataSource.provider;

    return {
      ...meta,
      data_source: {
        ...normalizedDataSource,
        kind: "api" as const,
        data_level: asString(existingDataSource.data_level) || "keyword",
        mode: asString(existingDataSource.mode) || "snapshot_replace",
      },
    };
  }

  return {
    ...meta,
    data_source: {
      ...existingDataSource,
      kind: "csv" as const,
    },
  };
}


function mapAtomicApiReportRpcError(error: any) {
  const message = asString(error?.message);
  const code = asString(error?.code);

  if (message.startsWith("API_REPORT_INVALID_INPUT:")) {
    return jsonError(400, "INVALID_INPUT");
  }

  if (
    message.startsWith("API_REPORT_CONNECTION_NOT_FOUND:")
  ) {
    return jsonError(404, "CONNECTION_NOT_FOUND");
  }

  if (
    message.startsWith("API_REPORT_CONNECTION_SCOPE_INVALID:") ||
    message.startsWith("API_REPORT_SCOPE_INVALID:")
  ) {
    return jsonError(403, "CONNECTION_SCOPE_MISMATCH");
  }

  if (
    message.startsWith("API_REPORT_CONNECTION_NOT_ACTIVE:")
  ) {
    return jsonError(409, "CONNECTION_NOT_ACTIVE");
  }

  if (
    message.startsWith(
      "API_REPORT_CONNECTION_CREDENTIALS_MISSING:",
    )
  ) {
    return jsonError(
      409,
      "CONNECTION_CREDENTIALS_MISSING",
    );
  }

  if (
    code === "23505" ||
    code === "23503" ||
    code === "23514"
  ) {
    return jsonError(
      409,
      "API_REPORT_ATOMIC_CREATION_CONFLICT",
    );
  }

  return jsonError(
    500,
    "API_REPORT_ATOMIC_CREATION_FAILED",
  );
}

function buildSafeAtomicApiReportResponse(
  value: any,
  expected: {
    workspaceId: string;
    advertiserId: string;
    connectionId: string;
    reportTypeId: string;
  },
) {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = asString(value.id);
  const workspaceId = asString(value.workspace_id);
  const advertiserId = asString(value.advertiser_id);
  const connectionId = asString(value.connection_id);
  const reportTypeId = asString(value.report_type_id);
  const provider = asString(value.provider);
  const status = asString(value.status);
  const meta = safeObj(value.meta);
  const dataSource = isPlainObject(meta.data_source)
    ? meta.data_source
    : {};
  const metaProvider = asString(dataSource.provider);

  if (
    !id ||
    workspaceId !== expected.workspaceId ||
    advertiserId !== expected.advertiserId ||
    connectionId !== expected.connectionId ||
    reportTypeId !== expected.reportTypeId ||
    !provider ||
    metaProvider !== provider ||
    status !== "draft"
  ) {
    return null;
  }

  return {
    id,
    workspace_id: workspaceId,
    advertiser_id: advertiserId,
    report_type_id: reportTypeId,
    title: asString(value.title),
    status,
    period_start: value.period_start ?? null,
    period_end: value.period_end ?? null,
    created_at: value.created_at ?? null,
    meta,
  };
}

/**
 * ✅ Bearer 우선 + 쿠키(session) fallback
 * - 프론트에서 Authorization: Bearer ... 를 보내면 이걸 먼저 검증
 * - 없으면 sbAuth() 쿠키 세션으로 user 확인
 */
async function getUser(
  req: Request,
): Promise<
  | {
      ok: true;
      userId: string;
      email: string | null;
    }
  | {
      ok: false;
      status: number;
      message: string;
    }
> {
  // 1) Bearer 토큰
  const authz =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } =
      await supabaseAdmin.auth.getUser(bearer);

    const user = data?.user ?? null;

    if (error || !user?.id) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }

    return {
      ok: true,
      userId: user.id,
      email: user.email ?? null,
    };
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

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateBody;

    const workspace_id_in = asString(body.workspace_id);

    const advertiser_id_raw = asString(body.advertiser_id);

    const advertiser_id = advertiser_id_raw || null;

    const connection_id = asString(body.connection_id);

    const report_type_id = asString(body.report_type_id);

    const title = asString(body.title);

    const status = "draft";

    const meta = normalizeReportMeta(body.meta);
    const dataSourceKind = normalizeDataSourceKind(meta?.data_source?.kind);

    if (dataSourceKind === "api" && !advertiser_id) {
      return jsonError(
        400,
        "API linked reports require advertiser_id",
      );
    }

    if (dataSourceKind === "api" && !connection_id) {
      return jsonError(
        400,
        "API linked reports require connection_id",
      );
    }

    // period는 "들어오면 우선", 없으면 자동세팅
    const period_start_in = body.period_start ?? null;
    const period_end_in = body.period_end ?? null;

    if (!report_type_id) {
      return jsonError(400, "report_type_id is required");
    }

    // ✅ 1) Auth (Bearer 우선 + 쿠키 fallback)
    const auth = await getUser(req);

    if (!auth.ok) {
      return jsonError(auth.status, auth.message);
    }

    const created_by = auth.userId;
    const userEmail = auth.email;

    // ✅ 2) workspace 결정
    // - advertiser_id가 있으면 advertiser.workspace_id를 우선 사용
    // - advertiser_id가 없으면 body.workspace_id 사용
    let resolved_workspace_id = workspace_id_in;

    if (advertiser_id) {
      const { data: adv, error: advErr } =
        await supabaseAdmin
          .from("advertisers")
          .select("id, workspace_id")
          .eq("id", advertiser_id)
          .maybeSingle();

      if (advErr) {
        return jsonError(500, advErr.message);
      }

      if (!adv) {
        return jsonError(400, "Invalid advertiser_id");
      }

      resolved_workspace_id = asString(
        adv.workspace_id,
      );

      // body.workspace_id가 들어왔고 advertiser workspace와 다르면 차단
      if (
        workspace_id_in &&
        resolved_workspace_id !== workspace_id_in
      ) {
        return jsonError(
          400,
          "workspace_id does not match advertiser workspace",
        );
      }
    }

    if (!resolved_workspace_id) {
      return jsonError(400, "workspace_id is required");
    }

    // ✅ 3) 멤버십 체크 (resolved workspace 기준)
    const { data: wm, error: wmErr } =
      await supabaseAdmin
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("workspace_id", resolved_workspace_id)
        .eq("user_id", created_by)
        .limit(1)
        .maybeSingle();

    if (wmErr) {
      return jsonError(500, wmErr.message);
    }

    if (!wm) {
      return jsonError(
        403,
        "Forbidden: you are not a member of this workspace",
      );
    }

    if (!canCreateReport(wm.role, userEmail)) {
      return jsonError(
        403,
        "Forbidden: insufficient workspace role",
      );
    }

    // ✅ 3-1) advertiser_id가 들어오면 같은 workspace 소속 광고주인지 최종 재검증
    // - staff는 report-builder 목록 계약과 동일하게 본인이 생성한 광고주만 허용
    if (advertiser_id) {
      const { data: adv, error: advErr } =
        await supabaseAdmin
          .from("advertisers")
          .select("id, workspace_id, created_by")
          .eq("id", advertiser_id)
          .eq("workspace_id", resolved_workspace_id)
          .maybeSingle();

      if (advErr) {
        return jsonError(500, advErr.message);
      }

      const normalizedWorkspaceRole =
        asString(wm.role).toLowerCase();

      if (
        !adv ||
        (
          normalizedWorkspaceRole === "staff" &&
          asString(adv.created_by) !== created_by
        )
      ) {
        return jsonError(
          400,
          "Invalid advertiser_id for this workspace",
        );
      }
    }

    // ✅ 4) period 자동세팅 (없을 때만)
    let period_start = period_start_in;
    let period_end = period_end_in;

    if (!period_start || !period_end) {
      const [
        { data: minRows, error: minErr },
        { data: maxRows, error: maxErr },
      ] = await Promise.all([
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
        const minDate =
          (minRows?.[0] as any)?.date ?? null;

        const maxDate =
          (maxRows?.[0] as any)?.date ?? null;

        if (!period_start && minDate) {
          period_start = minDate;
        }

        if (!period_end && maxDate) {
          period_end = maxDate;
        }
      }
    }

    // ✅ 5-A) API report는 report + connection mapping을 하나의 DB transaction으로 생성
    if (dataSourceKind === "api") {
      if (!advertiser_id || !connection_id) {
        return jsonError(
          400,
          "API linked reports require advertiser_id and connection_id",
        );
      }

      const { data, error } = await supabaseAdmin.rpc(
        "create_api_report_with_media_connection_v1",
        {
          p_workspace_id: resolved_workspace_id,
          p_advertiser_id: advertiser_id,
          p_connection_id: connection_id,
          p_report_type_id: report_type_id,
          p_title: title || "New Report - Draft",
          p_period_start: period_start,
          p_period_end: period_end,
          p_created_by: created_by,
          p_meta: meta,
        },
      );

      if (error) {
        return mapAtomicApiReportRpcError(error);
      }

      const safeReport =
        buildSafeAtomicApiReportResponse(
          data,
          {
            workspaceId: resolved_workspace_id,
            advertiserId: advertiser_id,
            connectionId: connection_id,
            reportTypeId: report_type_id,
          },
        );

      if (!safeReport) {
        return jsonError(
          500,
          "API_REPORT_ATOMIC_CREATION_INVALID_RESULT",
        );
      }

      return NextResponse.json({
        ok: true,
        report: safeReport,
      });
    }

    // ✅ 5-B) CSV report 생성 계약은 기존 direct insert를 그대로 유지
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
        [
          "id",
          "workspace_id",
          "advertiser_id",
          "report_type_id",
          "title",
          "status",
          "period_start",
          "period_end",
          "created_at",
          "meta",
        ].join(", "),
      )
      .single();

    if (error) {
      return jsonError(400, error.message);
    }

    return NextResponse.json({
      ok: true,
      report: data,
    });
  } catch (e: any) {
    return jsonError(
      500,
      e?.message ?? String(e),
    );
  }
}
