"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

import CommerceReportEditor from "@/components/reports/CommerceReportEditor";
import CommerceDashboard from "@/components/dashboard/CommerceDashboard";

type ChannelKey = "search" | "display";

type ReportRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at?: string;
  workspace_id: string;
  created_by: string;
  report_type_id: string;
  meta: any;
  period_start: string | null;
  period_end: string | null;
};

type ReportTypeRow = {
  id: string;
  key: string;
  name: string;
};

function fmtDT(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

// ✅ metrics_daily → dashboard Row 변환기 (최소 필드만 맞추면 집계/인사이트 살아남음)
function mapMetricsDailyToRow(m: any) {
  const num = (v: any) => {
    const n = Number(String(v ?? 0).replace(/[,₩%\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // date 필드 후보(너 DB 실제 컬럼명에 맞춰 필요한 것만 남겨도 됨)
  const date =
    m?.date ??
    m?.day ??
    m?.ymd ??
    m?.metric_date ??
    m?.period_date ??
    m?.report_date ??
    m?.dt;

  // 채널 그룹(search/display) 후보
  // 1) 이미 "search"/"display"가 들어있으면 그대로
  // 2) 아니면 source/채널 문자열에서 추론해서 group으로 만든다
  const direct =
    m?.channel_group ??
    m?.channelGroup ??
    m?.channel_type ??
    m?.channelType ??
    m?.media_type ??
    m?.mediaType ??
    m?.inventory_type ??
    m?.inventoryType;

  let channelGroup: ChannelKey | null =
    direct === "search" || direct === "display" ? direct : null;

  if (!channelGroup) {
    const raw = String(
      m?.channel ?? m?.source ?? m?.media ?? m?.platform ?? m?.campaignType ?? ""
    ).toLowerCase();

    // search 힌트(네이버 SA/파워링크/쇼핑검색 등)
    const isSearch =
      raw.includes("search") ||
      raw.includes("sa") ||
      raw.includes("powerlink") ||
      raw.includes("shopping");

    // display 힌트(GFA/GDN/DA 등)
    const isDisplay =
      raw.includes("display") ||
      raw.includes("gfa") ||
      raw.includes("gdn") ||
      raw.includes("da") ||
      raw.includes("banner");

    // 둘 다 아니면: 안전 기본값(일단 display로 두면 대부분 “필터로 0”되는 걸 줄일 수 있음)
    channelGroup = isSearch ? "search" : isDisplay ? "display" : "display";
  }

  return {
    // 날짜: dashboard 필터가 찾을 수 있게 여러 키로 안전하게 제공
    date,
    day: date,
    ymd: date,

    // 채널 그룹: search/display 필터가 먹게
    channelGroup,
    channel_group: channelGroup,

    // 핵심 지표(프로젝트마다 키가 다를 수 있어 후보를 넓게 둠)
    impressions: num(m?.impressions ?? m?.imp ?? m?.impCnt ?? m?.impr ?? m?.imprCnt),
    clicks: num(m?.clicks ?? m?.clk ?? m?.clkCnt ?? m?.clickCnt),
    cost: num(m?.cost ?? m?.spend ?? m?.adCost ?? m?.costAmt),
    conversions: num(m?.conversions ?? m?.conv ?? m?.convCnt ?? m?.purchase ?? m?.orders),
    revenue: num(m?.revenue ?? m?.sales ?? m?.rev ?? m?.gmv),

    // (선택) 구조/키워드 탭용 필드들 - 없으면 null
    source: m?.source ?? m?.media ?? m?.platform ?? null,
    campaign: m?.campaign ?? m?.campaign_name ?? null,
    group: m?.group ?? m?.adgroup ?? m?.adgroup_name ?? null,
    keyword: m?.keyword ?? null,
    device: m?.device ?? null,
  };
}

export default function ReportDetailPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState<ReportRow | null>(null);
  const [reportType, setReportType] = useState<ReportTypeRow | null>(null);

  // ✅ NEW: DB(metrics_daily) 기반 rowsOverride
  const [metricsDaily, setMetricsDaily] = useState<any[]>([]);

  // AI Insight UI 상태
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [aiContent, setAiContent] = useState<any>(null); // insights.content (JSON)

  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      setLoading(true);
      setMsg("");
      setReport(null);
      setReportType(null);
      setAiContent(null);
      setMetricsDaily([]); // ✅ reset

      try {
        // ✅ 1) report는 API로 통일 (세션/권한 체크는 route에서)
        const res = await fetch(`/api/reports/${id}`, {
          method: "GET",
          cache: "no-store",
        });
        const text = await res.text();

        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!res.ok || !json?.ok) {
          if (!mounted) return;
          setMsg(`report 조회 실패(${res.status}): ${json?.error ?? text ?? "empty"}`);
          setLoading(false);
          return;
        }

        const r = json.report as ReportRow;

        if (!mounted) return;
        setReport(r);

        // ✅ NEW: API가 같이 내려주는 metrics_daily를 받아서 저장
        // - 키 이름이 다르면 여기만 바꾸면 됨
        // - 예: json.metricsDaily / json.metrics_daily / json.data.metrics_daily 등
        const md = (json.metrics_daily ?? json.metricsDaily ?? []) as any[];
        setMetricsDaily(Array.isArray(md) ? md : []);

        // ✅ 2) report type은 우선 supabase client로 조회 (나중에 API로 빼도 됨)
        const { data: t, error: tErr } = await supabase
          .from("report_types")
          .select("id, key, name")
          .eq("id", r.report_type_id)
          .maybeSingle();

        if (!mounted) return;

        if (tErr || !t) {
          setMsg(`report_type 조회 실패: ${tErr?.message ?? "not found"}`);
          setLoading(false);
          return;
        }
        setReportType(t as ReportTypeRow);

        // ✅ 3) (선택) 기존 저장된 insights 있으면 보여주기
        const { data: ins, error: insErr } = await supabase
          .from("insights")
          .select("content, updated_at")
          .eq("report_id", id)
          .eq("kind", "summary")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!mounted) return;
        if (!insErr && ins?.content) {
          setAiContent({ ...ins.content, _saved_updated_at: ins.updated_at });
        }

        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setMsg(`불러오기 예외: ${e?.message ?? String(e)}`);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  const isCommerce = reportType?.key === "commerce";
  const meta = report?.meta ?? {};

  // ✅ meta 스키마: { period: {from,to}, channels: ["search"|"display"], note: "" }
  // ✅ fallback: meta.period가 비어있으면 reports.period_start/end 사용
  const periodFrom =
    (meta?.period?.from as string | undefined) ?? (report?.period_start ?? undefined);
  const periodTo =
    (meta?.period?.to as string | undefined) ?? (report?.period_end ?? undefined);

  const channels = (meta?.channels ?? []) as ChannelKey[];
  const note = (meta?.note ?? "") as string;

  // ✅ NEW: metrics_daily → rowsOverride 변환
  const rowsOverride = useMemo(() => {
    if (!Array.isArray(metricsDaily) || metricsDaily.length === 0) return [];
    return metricsDaily.map(mapMetricsDailyToRow);
  }, [metricsDaily]);

  // ✅ 저장 후 meta가 바뀌면 대시보드를 리마운트해서 즉시 반영
  // ✅ rowsOverride 길이도 key에 포함(데이터 주입 반영)
  const dashboardKey = useMemo(() => {
    return JSON.stringify({
      from: periodFrom ?? "",
      to: periodTo ?? "",
      channels: Array.isArray(channels) ? channels.slice().sort() : [],
      rowsLen: rowsOverride.length,
    });
  }, [periodFrom, periodTo, channels, rowsOverride.length]);

  const channelsLabel = useMemo(() => {
    if (!Array.isArray(channels) || channels.length === 0) return "(미설정)";
    const map: Record<ChannelKey, string> = {
      search: "Search AD",
      display: "Display AD",
    };
    return channels.map((c) => map[c] ?? c).join(", ");
  }, [channels]);

  async function generateAIInsight() {
    if (!id) return;
    if (aiLoading) return;

    setAiLoading(true);
    setAiMsg("");

    try {
      const res = await fetch("/api/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ report_id: id }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        const errText = json?.error ?? text ?? `HTTP ${res.status}`;
        setAiMsg(`AI 인사이트 생성 실패: ${errText}`);
        return;
      }

      const saved = json?.insight;
      const content = saved?.content ?? null;

      if (content) {
        setAiContent(content);
        setAiMsg("✅ AI 인사이트 생성 완료");
      } else {
        setAiMsg("✅ 저장은 됐는데 content가 비어있어. (서버 응답 확인 필요)");
      }
    } catch (e: any) {
      setAiMsg(`AI 인사이트 생성 실패: ${e?.message ?? "unknown error"}`);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1400 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Report Detail</h1>
      <div style={{ marginTop: 8, padding: 10, border: "1px dashed #999", borderRadius: 10, fontSize: 13 }}>
        <b>DEBUG</b>{" "}
        id={id || "(no id)"} / loading={String(loading)} / report={report ? "yes" : "no"} / type={reportType?.key ?? "-"}
        <br />
        <b>period</b> {periodFrom ?? "-"} ~ {periodTo ?? "-"}
        <br />
        <b>channels</b> {Array.isArray(channels) ? channels.join(",") : "-"}
        <br />
        <b>metricsDaily</b> {metricsDaily.length} / <b>rowsOverride</b> {rowsOverride.length}
      </div>

      {loading && <p style={{ marginTop: 12 }}>불러오는 중...</p>}
      {msg && <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{msg}</p>}

      {!loading && report && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            border: "1px solid #ddd",
            borderRadius: 12,
          }}
        >
          <div>
            <b>ID</b>: {report.id}
          </div>
          <div>
            <b>Title</b>: {report.title}
          </div>
          <div>
            <b>Status</b>: {report.status}
          </div>
          <div>
            <b>Created</b>: {fmtDT(report.created_at)}
          </div>
          <div>
            <b>Workspace</b>: {report.workspace_id}
          </div>

          <hr style={{ margin: "12px 0" }} />

          <div>
            <b>Type</b>:{" "}
            {reportType ? `${reportType.name} (key=${reportType.key})` : "loading..."}
          </div>

          {/* ✅ meta + reports.period fallback 요약 표시 */}
          {isCommerce && (
            <div style={{ marginTop: 10, opacity: 0.9, fontSize: 13 }}>
              <div>
                <b>기간</b>: {periodFrom ?? "-"} ~ {periodTo ?? "-"}
              </div>
              <div>
                <b>채널</b>: {channelsLabel}
              </div>
              {note?.trim() && (
                <div>
                  <b>메모</b>: {note}
                </div>
              )}
              <div style={{ marginTop: 6, opacity: 0.7 }}>
                <b>DB metrics_daily</b>: {metricsDaily.length}건 / <b>rowsOverride</b>: {rowsOverride.length}건
              </div>
            </div>
          )}
        </div>
      )}

      {/* ✅ 커머스 설정 저장 UI */}
      {!loading && report && isCommerce && (
        <CommerceReportEditor
          report={report}
          onSaved={(nextMeta: any) => {
            setReport((prev) => (prev ? { ...prev, meta: nextMeta } : prev));
          }}
        />
      )}

      {/* ✅ AI 인사이트 생성 UI */}
      {!loading && report && (
        <section style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 18 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>AI 인사이트</h2>

            <button
              onClick={generateAIInsight}
              disabled={aiLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: aiLoading ? "#f5f5f5" : "white",
                cursor: aiLoading ? "wait" : "pointer",
              }}
            >
              {aiLoading ? "생성 중..." : "AI 인사이트 생성"}
            </button>

            {aiMsg && <span style={{ fontSize: 13, opacity: 0.8 }}>{aiMsg}</span>}
          </div>

          <div
            style={{
              marginTop: 12,
              padding: 14,
              border: "1px solid #ddd",
              borderRadius: 12,
              background: "#fafafa",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {aiContent ? (
              <>
                {aiContent?._saved_updated_at && (
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                    마지막 저장: {fmtDT(aiContent._saved_updated_at)}
                  </div>
                )}
                <div style={{ fontWeight: 800, marginBottom: 6 }}>요약</div>
                <div style={{ marginBottom: 12 }}>{aiContent.summary ?? "(summary 없음)"}</div>

                <div style={{ fontWeight: 800, marginBottom: 6 }}>이상징후</div>
                <pre style={{ margin: 0 }}>{JSON.stringify(aiContent.anomalies ?? [], null, 2)}</pre>

                <div style={{ fontWeight: 800, marginTop: 12, marginBottom: 6 }}>액션</div>
                <pre style={{ margin: 0 }}>{JSON.stringify(aiContent.actions ?? [], null, 2)}</pre>
              </>
            ) : (
              <div style={{ opacity: 0.7 }}>
                아직 인사이트가 없어. 위의 <b>“AI 인사이트 생성”</b>을 눌러봐.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ✅ 기존 홈 대시보드 UI 재사용 + 기간/채널 실제 적용 + DB rowsOverride 주입 */}
      {!loading && report && isCommerce && (
        <div style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 18 }}>
          <div style={{ marginBottom: 10, opacity: 0.7 }}>
            아래는 <b>기존 홈(/) 보고서 UI</b>를 그대로 재사용한 영역이야. (홈은 훼손되지 않음)
          </div>

          <CommerceDashboard
            key={dashboardKey}
            dataUrl="/data/TEST_ver1.csv" // ✅ fallback로 남겨둠 (rowsOverride가 있으면 이건 무시됨)
            rowsOverride={rowsOverride} // ✅ NEW: DB 데이터 주입
            rowOptions={{
              from: periodFrom,
              to: periodTo,
              channels: Array.isArray(channels) ? channels : [],
            }}
            init={{
              tab: "summary",
              period: { from: periodFrom, to: periodTo },
            }}
          />
        </div>
      )}
    </main>
  );
}