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

    const isSearch =
      raw.includes("search") ||
      raw.includes("sa") ||
      raw.includes("powerlink") ||
      raw.includes("shopping");

    const isDisplay =
      raw.includes("display") ||
      raw.includes("gfa") ||
      raw.includes("gdn") ||
      raw.includes("da") ||
      raw.includes("banner");

    channelGroup = isSearch ? "search" : isDisplay ? "display" : "display";
  }

  return {
    date,
    day: date,
    ymd: date,

    channelGroup,
    channel_group: channelGroup,

    impressions: num(m?.impressions ?? m?.imp ?? m?.impCnt ?? m?.impr ?? m?.imprCnt),
    clicks: num(m?.clicks ?? m?.clk ?? m?.clkCnt ?? m?.clickCnt),
    cost: num(m?.cost ?? m?.spend ?? m?.adCost ?? m?.costAmt),
    conversions: num(m?.conversions ?? m?.conv ?? m?.convCnt ?? m?.purchase ?? m?.orders),
    revenue: num(m?.revenue ?? m?.sales ?? m?.rev ?? m?.gmv),

    source: m?.source ?? m?.media ?? m?.platform ?? null,
    campaign: m?.campaign ?? m?.campaign_name ?? null,
    group: m?.group ?? m?.adgroup ?? m?.adgroup_name ?? null,
    keyword: m?.keyword ?? null,
    device: m?.device ?? null,
  };
}

// ✅ 작은 UI helper (카드 스타일)
function CardBox({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        background: "white",
        ...style,
      }}
    >
      {children}
    </div>
  );
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
  const [aiContent, setAiContent] = useState<any>(null);

  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      setLoading(true);
      setMsg("");
      setReport(null);
      setReportType(null);
      setAiContent(null);
      setMetricsDaily([]);

      try {
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

        const md = (json.metrics_daily ?? json.metricsDaily ?? []) as any[];
        setMetricsDaily(Array.isArray(md) ? md : []);

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

  const periodFrom =
    (meta?.period?.from as string | undefined) ?? (report?.period_start ?? undefined);
  const periodTo =
    (meta?.period?.to as string | undefined) ?? (report?.period_end ?? undefined);

  const channels = (meta?.channels ?? []) as ChannelKey[];
  const note = (meta?.note ?? "") as string;

  const rowsOverride = useMemo(() => {
    if (!Array.isArray(metricsDaily) || metricsDaily.length === 0) return [];
    return metricsDaily.map(mapMetricsDailyToRow);
  }, [metricsDaily]);

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

      <div
        style={{
          marginTop: 8,
          padding: 10,
          border: "1px dashed #999",
          borderRadius: 10,
          fontSize: 13,
        }}
      >
        <b>DEBUG</b>{" "}
        id={id || "(no id)"} / loading={String(loading)} / report={report ? "yes" : "no"} / type=
        {reportType?.key ?? "-"}
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
                <b>DB metrics_daily</b>: {metricsDaily.length}건 / <b>rowsOverride</b>:{" "}
                {rowsOverride.length}건
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && report && isCommerce && (
        <CommerceReportEditor
          report={report}
          onSaved={(nextMeta: any) => {
            setReport((prev) => (prev ? { ...prev, meta: nextMeta } : prev));
          }}
        />
      )}

      {/* ✅ AI 인사이트 생성 UI (가독성 카드 버전) */}
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

                {/* 요약 */}
                <div style={{ fontWeight: 800, marginBottom: 6 }}>요약</div>
                <CardBox style={{ background: "white" }}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{aiContent.summary ?? "(summary 없음)"}</div>
                </CardBox>

                {/* 이상징후 */}
                <div style={{ fontWeight: 800, marginTop: 14, marginBottom: 6 }}>이상징후</div>
                {Array.isArray(aiContent?.anomalies) && aiContent.anomalies.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {aiContent.anomalies.slice(0, 5).map((a: any, idx: number) => (
                      <CardBox key={idx}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <div style={{ fontWeight: 800 }}>{a?.title ?? "(제목 없음)"}</div>
                        </div>

                        {a?.why && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>원인</div>
                            <div style={{ opacity: 0.95 }}>{a.why}</div>
                          </div>
                        )}

                        {a?.impact && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>영향</div>
                            <div style={{ opacity: 0.95 }}>{a.impact}</div>
                          </div>
                        )}

                        {Array.isArray(a?.checklist) && a.checklist.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 6 }}>
                              체크리스트
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                              {a.checklist.map((s: any, i: number) => (
                                <li key={i}>{String(s)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardBox>
                    ))}
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>(이상징후 없음)</div>
                )}

                {/* 액션 */}
                <div style={{ fontWeight: 800, marginTop: 14, marginBottom: 6 }}>액션</div>
                {Array.isArray(aiContent?.actions) && aiContent.actions.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {aiContent.actions.slice(0, 3).map((a: any, idx: number) => (
                      <CardBox key={idx}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              border: "1px solid #ddd",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              opacity: 0.8,
                            }}
                          >
                            {idx + 1}
                          </div>
                          <div style={{ fontWeight: 800 }}>{a?.title ?? "(제목 없음)"}</div>
                        </div>

                        {a?.rationale && (
                          <div style={{ marginTop: 8, opacity: 0.9, lineHeight: 1.55 }}>
                            {a.rationale}
                          </div>
                        )}

                        {Array.isArray(a?.next_steps) && a.next_steps.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 6 }}>
                              다음 단계
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                              {a.next_steps.map((s: any, i: number) => (
                                <li key={i}>{String(s)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardBox>
                    ))}
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>(액션 없음)</div>
                )}

                {/* 원문 JSON은 접기 */}
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: "pointer", opacity: 0.75 }}>원문 JSON 보기</summary>
                  <pre style={{ marginTop: 10, overflowX: "auto" }}>
                    {JSON.stringify(
                      { summary: aiContent.summary, anomalies: aiContent.anomalies, actions: aiContent.actions, kpi: aiContent.kpi, _debug: aiContent._debug },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </>
            ) : (
              <div style={{ opacity: 0.7 }}>
                아직 인사이트가 없어. 위의 <b>“AI 인사이트 생성”</b>을 눌러봐.
              </div>
            )}
          </div>
        </section>
      )}

      {!loading && report && isCommerce && (
        <div style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 18 }}>
          <div style={{ marginBottom: 10, opacity: 0.7 }}>
            아래는 <b>기존 홈(/) 보고서 UI</b>를 그대로 재사용한 영역이야. (홈은 훼손되지 않음)
          </div>

          <CommerceDashboard
            key={dashboardKey}
            dataUrl="/data/acc_001.csv"
            rowsOverride={rowsOverride}
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