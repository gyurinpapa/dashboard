import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { naverSaFetch, NAVER_SA_BASE_URL } from "@/src/lib/sync/naverSa";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// KST 기준 YYYY-MM-DD
function kstYmd(offsetDays: number) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);

  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseRange(url: URL) {
  const range = url.searchParams.get("range");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  if (since && until) return { since, until };
  if (range === "yesterday_today") return { since: kstYmd(-1), until: kstYmd(0) };

  // default: yesterday only (자동 실행 안정형)
  return { since: kstYmd(-1), until: kstYmd(-1) };
}

function parseMode(url: URL) {
  const mode = url.searchParams.get("mode");
  if (mode === "auth_check" || mode === "stat_report" || mode === "stat_sync") return mode;
  return "stat_sync"; // ✅ 기본은 실제 동기화
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type NaverStatReportJob = {
  reportJobId: number;
  status: string; // REGIST / RUNNING / BUILT / ERROR ... (실제 값은 응답 기준)
  downloadUrl?: string;
  reportTp?: string;
  statDt?: string;
  statDtTo?: string;
  updateTm?: string;
  regTm?: string;
  loginId?: string;
};

// CSV를 아주 단순하게 파싱 (콤마/따옴표 포함 가능성 낮은 형태면 충분)
// 만약 리포트가 따옴표/콤마 포함으로 복잡하면 papaparse를 서버에서 쓰도록 바꾸면 됨.
function parseCsvSimple(text: string) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const header = lines[0].split(",").map((s) => s.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(","); // 단순 split (필요시 강화 가능)
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
  return rows;
}

function toNum(v: any) {
  if (v == null) return 0;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const workspace_id = url.searchParams.get("workspace_id");
  if (!workspace_id) {
    return NextResponse.json({ ok: false, error: "workspace_id is required" }, { status: 400 });
  }

  const { since, until } = parseRange(url);
  const mode = parseMode(url);

  // 1) connections 조회 (최신 1건, 개발단계에서는 status 필터 없이 안정적으로)
  const { data: conn, error: connErr } = await supabase
    .from("connections")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("source", "naver_sa")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connErr) return NextResponse.json({ ok: false, error: connErr.message }, { status: 500 });
  if (!conn) {
    return NextResponse.json({ ok: false, error: "No naver_sa connection for workspace" }, { status: 400 });
  }

  // credentials
  const apiKey = (conn.access_token as string | null) ?? null; // Access License
  const secretKey = (conn.refresh_token as string | null) ?? null; // Secret Key
  const customerId = (conn.external_account_id as string | null) ?? null; // Customer ID

  if (!apiKey || !secretKey || !customerId) {
    return NextResponse.json(
      { ok: false, error: "Missing credentials in connections (access_token/refresh_token/external_account_id)" },
      { status: 400 }
    );
  }

  try {
    // ============ A) auth_check ============
    if (mode === "auth_check") {
      const result = await naverSaFetch<any>({
        method: "GET",
        resource: "/ncc/campaigns",
        apiKey,
        secretKey,
        customerId,
      });

      await supabase
        .from("connections")
        .update({
          status: "connected",
          last_error: null,
          last_sync_at: new Date().toISOString(),
          last_sync_since: since,
          last_sync_until: until,
        })
        .eq("id", conn.id);

      return NextResponse.json({
        ok: true,
        step: "naver_auth_check_ok",
        source: "naver_sa",
        workspace_id,
        customer_id: customerId,
        sample: Array.isArray(result) ? result.slice(0, 1) : result,
      });
    }

    // ============ B) stat_report (생성만) ============
    const reportTp = url.searchParams.get("reportTp") ?? "AD";
    const createBody: any = { reportTp, statDt: since, statDtTo: until };

    if (mode === "stat_report") {
      const created = await naverSaFetch<NaverStatReportJob>({
        method: "POST",
        resource: "/stat-reports",
        apiKey,
        secretKey,
        customerId,
        body: createBody,
      });

      await supabase
        .from("connections")
        .update({
          status: "connected",
          last_error: null,
          last_sync_at: new Date().toISOString(),
          last_sync_since: since,
          last_sync_until: until,
        })
        .eq("id", conn.id);

      return NextResponse.json({
        ok: true,
        step: "naver_stat_report_created",
        source: "naver_sa",
        workspace_id,
        customer_id: customerId,
        since,
        until,
        requestBody: createBody,
        response: created,
      });
    }

    // ============ C) stat_sync (생성→폴링→다운로드→업서트) ============
    // 1) 생성
    const created = await naverSaFetch<NaverStatReportJob>({
      method: "POST",
      resource: "/stat-reports",
      apiKey,
      secretKey,
      customerId,
      body: createBody,
    });

    const reportJobId = created?.reportJobId;
    if (!reportJobId) throw new Error(`stat-reports create did not return reportJobId: ${JSON.stringify(created)}`);

    // 2) 폴링 (최대 20회, 3초 간격 = 최대 60초)
    let job: NaverStatReportJob | null = null;
    const maxTry = Number(url.searchParams.get("maxTry") ?? 20);
    const intervalMs = Number(url.searchParams.get("intervalMs") ?? 3000);

    for (let i = 0; i < maxTry; i++) {
      job = await naverSaFetch<NaverStatReportJob>({
        method: "GET",
        resource: `/stat-reports/${reportJobId}`,
        apiKey,
        secretKey,
        customerId,
      });

      const st = (job?.status ?? "").toUpperCase();
      if (st === "BUILT" || st === "DONE" || st === "COMPLETED") break;
      if (st === "ERROR" || st === "FAILED") {
        throw new Error(`stat-report job failed: ${JSON.stringify(job)}`);
      }
      await sleep(intervalMs);
    }

    if (!job) throw new Error("stat-report job polling failed: empty job");
    if (!job.downloadUrl) {
      return NextResponse.json(
        {
          ok: false,
          step: "naver_stat_report_not_ready",
          reportJobId,
          status: job.status,
          job,
          hint: "Try increasing maxTry/intervalMs. Example: &maxTry=40&intervalMs=3000",
        },
        { status: 502 }
      );
    }

   // 3) 다운로드 (✅ download도 인증 헤더 필요 + 서명은 pathname만 사용)
    let downloadResource = job.downloadUrl;

    // downloadUrl이 풀 URL이면 resource(path+query)로 변환
    if (downloadResource.startsWith("http")) {
    const u = new URL(downloadResource);
    downloadResource = `${u.pathname}${u.search}`;
    }

    // 요청은 path+query로 보내고, 서명은 pathname만
    const u2 = new URL(`${NAVER_SA_BASE_URL}${downloadResource}`);

    const csvText = await naverSaFetch<string>({
    method: "GET",
    resource: `${u2.pathname}${u2.search}`,
    signatureResource: u2.pathname, // ✅ 이건 "변수"가 아니라 "키: 값" 인자임
    apiKey,
    secretKey,
    customerId,
    });

    // 4) CSV 파싱 후 일자별 합산
    // ⚠️ 리포트 컬럼명이 계정/리포트Tp에 따라 다름.
    // 아래는 "자주 쓰는 후보 키"들을 최대한 흡수하는 방식.
    const rawRows = parseCsvSimple(csvText);

    const byDate: Record<
      string,
      { imp: number; clk: number; cost: number; conv: number; revenue: number }
    > = {};

    for (const r of rawRows) {
      const date =
        r["date"] ||
        r["statDt"] ||
        r["StatDt"] ||
        r["stat_date"] ||
        r["일자"] ||
        r["일"] ||
        "";

      if (!date) continue;

      const imp = toNum(r["imp"] ?? r["impressions"] ?? r["노출수"] ?? r["impCnt"]);
      const clk = toNum(r["clk"] ?? r["click"] ?? r["clicks"] ?? r["클릭수"] ?? r["clkCnt"]);
      const cost = toNum(r["cost"] ?? r["adCost"] ?? r["총비용"] ?? r["광고비"]);
      const conv = toNum(r["conv"] ?? r["conversions"] ?? r["전환수"] ?? r["convCnt"]);
      const revenue = toNum(r["revenue"] ?? r["sales"] ?? r["매출"] ?? r["전환매출"]);

      if (!byDate[date]) byDate[date] = { imp: 0, clk: 0, cost: 0, conv: 0, revenue: 0 };
      byDate[date].imp += imp;
      byDate[date].clk += clk;
      byDate[date].cost += cost;
      byDate[date].conv += conv;
      byDate[date].revenue += revenue;
    }

    const upsertRows = Object.entries(byDate).map(([d, m]) => ({
      workspace_id,
      source: "naver_sa",
      date: d,
      entity_type: "account",
      entity_id: customerId,
      imp: m.imp,
      clk: m.clk,
      cost: m.cost,
      conv: m.conv,
      revenue: m.revenue,
    }));

    // 5) metrics_daily upsert
    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("metrics_daily")
        .upsert(upsertRows, { onConflict: "workspace_id,source,date,entity_type,entity_id" });

      if (upsertErr) throw upsertErr;
    }

    // 6) connections 업데이트
    await supabase
      .from("connections")
      .update({
        status: "connected",
        last_error: null,
        last_sync_at: new Date().toISOString(),
        last_sync_since: since,
        last_sync_until: until,
      })
      .eq("id", conn.id);

    return NextResponse.json({
      ok: true,
      step: "naver_stat_sync_ok",
      source: "naver_sa",
      workspace_id,
      customer_id: customerId,
      since,
      until,
      reportJobId,
      jobStatus: job.status,
      downloadUrl: job.downloadUrl,
      parsedRows: rawRows.length,
      upsertedDays: upsertRows.length,
      sampleUpserts: upsertRows.slice(0, 3),
    });
  } catch (e: any) {
    const message = e?.message ?? "Unknown error";

    await supabase
      .from("connections")
      .update({
        status: "error",
        last_error: message,
        last_sync_since: since,
        last_sync_until: until,
      })
      .eq("id", conn.id);

    return NextResponse.json(
      { ok: false, step: "naver_call_failed", error: message },
      { status: 500 }
    );
  }
}