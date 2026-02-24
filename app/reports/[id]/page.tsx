"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

import CommerceReportEditor from "@/components/reports/CommerceReportEditor";
import CommerceDashboard from "@/components/dashboard/CommerceDashboard";

// ✅ NEW: DB 조회 훅 (channels 필터 지원 버전)
import { useReportRowsDb } from "@/lib/report/useReportRowsDb";

type ChannelKey = "search" | "display";
type DataSourceMode = "db" | "csv"; // ✅ NEW

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
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

// ✅ metrics_daily → dashboard Row 변환기 (최소 필드만 맞추면 집계/인사이트 살아남음)
function mapMetricsDailyToRow(m: any) {
  const num = (v: any) => {
    const n = Number(String(v ?? 0).replace(/[,₩%\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const date =
    m?.date ??
    m?.day ??
    m?.ymd ??
    m?.metric_date ??
    m?.period_date ??
    m?.report_date ??
    m?.dt;

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

  // ✅ NEW: 미리보기 소스 모드
  const [previewMode, setPreviewMode] = useState<DataSourceMode>("db");

  // ✅ NEW: 수집(sync) 버튼 상태
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

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
      setSyncMsg("");

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

  // ✅ meta.channels → DB 조회 channels로 그대로 사용
  const channels = (meta?.channels ?? []) as ChannelKey[];
  const note = (meta?.note ?? "") as string;

  // ✅ NEW: DB에서 직접 읽기 (channels 필터 적용)
  const workspaceId = report?.workspace_id ?? "";
  const dbChannels =
    Array.isArray(channels) && channels.length > 0 ? channels : (["search"] as ChannelKey[]);

  const { rows: dbRows, isLoading: dbLoading, error: dbError } = useReportRowsDb({
    workspaceId,
    from: periodFrom,
    to: periodTo,
    sources: ["naver_sa"],
    channels: dbChannels,
    entityType: "account",
  });

  // ✅ DB rows(Row[]) → 기존 mapper가 먹을 형태로 변환 후 rowsOverride 만들기
  const rowsOverride = useMemo(() => {
    if (!Array.isArray(dbRows) || dbRows.length === 0) return [];
    const shaped = dbRows.map((r: any) => ({
      date: r.date,
      source: r.source,
      channel: r.channel,
      imp: r.imp,
      clk: r.clk,
      cost: r.cost,
      conv: r.conv,
      revenue: r.revenue,
    }));
    return shaped.map(mapMetricsDailyToRow);
  }, [dbRows]);

  const dashboardKey = useMemo(() => {
    return JSON.stringify({
      mode: previewMode,
      from: periodFrom ?? "",
      to: periodTo ?? "",
      channels: Array.isArray(channels) ? channels.slice().sort() : [],
      rowsLen: rowsOverride.length,
    });
  }, [previewMode, periodFrom, periodTo, channels, rowsOverride.length]);

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

  // ✅ NEW: naver_sa sync 실행
  // - meta.channels가 search+display면 channel=all
  // - 하나면 그 채널
  async function runNaverSync() {
    if (!report?.workspace_id) {
      setSyncMsg("workspace_id가 없어 sync를 실행할 수 없어.");
      return;
    }
    if (!periodFrom || !periodTo) {
      setSyncMsg("기간(from/to)을 먼저 저장해줘. (리포트 설정에서)");
      return;
    }
    if (syncing) return;

    // ✅ 채널 파라미터 결정
    const chParam =
      Array.isArray(channels) && channels.includes("search") && channels.includes("display")
        ? "all"
        : (channels?.[0] ?? "search");

    setSyncing(true);
    setSyncMsg("");

    try {
      const qs = new URLSearchParams({
        workspace_id: report.workspace_id,
        since: periodFrom,
        until: periodTo,
        channel: chParam, // ✅ search|display|all
      });

      const res = await fetch(`/api/sync/naver_sa?${qs.toString()}`, {
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
        setSyncMsg(`sync 실패(${res.status}): ${json?.error ?? text ?? "empty"}`);
        return;
      }

      setSyncMsg(`✅ sync 완료(channel=${chParam}). 잠시 후 미리보기에 자동 반영돼.`);
      // ✅ useReportRowsDb가 period/workspace/channel 기준으로 다시 조회하므로,
      //    따로 refresh를 강제할 필요는 없음(필요하면 key에 sync tick 넣어서 리프레시도 가능)
    } catch (e: any) {
      setSyncMsg(`sync 예외: ${e?.message ?? String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1400 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Report Detail</h1>

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
                <b>DB(metrics_daily)</b>:{" "}
                {dbLoading ? "loading..." : dbError ? `error: ${dbError}` : `${dbRows.length}건`} /{" "}
                <b>rowsOverride</b>: {rowsOverride.length}건
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

      {/* ✅ AI 인사이트 */}
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

                <div style={{ fontWeight: 800, marginBottom: 6 }}>요약</div>
                <CardBox style={{ background: "white" }}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{aiContent.summary ?? "(summary 없음)"}</div>
                </CardBox>

                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: "pointer", opacity: 0.75 }}>원문 JSON 보기</summary>
                  <pre style={{ marginTop: 10, overflowX: "auto" }}>
                    {JSON.stringify(
                      {
                        summary: aiContent.summary,
                        anomalies: aiContent.anomalies,
                        actions: aiContent.actions,
                        kpi: aiContent.kpi,
                        _debug: aiContent._debug,
                      },
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

      {/* ✅ 미리보기(하단) */}
      {!loading && report && isCommerce && (
        <div style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>미리보기 데이터</div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setPreviewMode("db")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: previewMode === "db" ? "black" : "white",
                  color: previewMode === "db" ? "white" : "black",
                  fontWeight: 700,
                }}
              >
                DB
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("csv")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: previewMode === "csv" ? "black" : "white",
                  color: previewMode === "csv" ? "white" : "black",
                  fontWeight: 700,
                }}
              >
                CSV(기존)
              </button>
            </div>

            <div style={{ opacity: 0.7, fontSize: 12 }}>
              * 홈(/)의 CSV 업로드 페이지는 그대로 유지됨
            </div>
          </div>

          {/* DB가 비어있을 때 안내 + sync 버튼 */}
          {previewMode === "db" && rowsOverride.length === 0 && (
            <div style={{ marginTop: 12 }}>
              <CardBox style={{ background: "#fffdf5", borderColor: "#f2e2b6" }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>DB 데이터가 아직 없어</div>
                <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
                  - metrics_daily에 적재된 행이 0건이라 DB 기반 미리보기에 표시할 데이터가 없어.<br />
                  - 그래도 리포트 구조/흐름 보고용으로는 <b>CSV(기존)</b> 모드로 전환하면 UI는 유지돼.
                  {dbError && (
                    <>
                      <br />
                      - <b>DB 에러</b>: {dbError}
                    </>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={runNaverSync}
                    disabled={syncing}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: syncing ? "#f5f5f5" : "white",
                      cursor: syncing ? "wait" : "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {syncing ? "sync 중..." : "네이버 sync 실행"}
                  </button>

                  {syncMsg && <span style={{ fontSize: 13, opacity: 0.85 }}>{syncMsg}</span>}
                </div>
              </CardBox>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <CommerceDashboard
              key={dashboardKey}
              dataUrl="/data/acc_001.csv"
              // ✅ mode에 따라 rowsOverride를 주입하거나 끈다
              rowsOverride={previewMode === "db" ? rowsOverride : []}
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
        </div>
      )}

      {/* (선택) DEBUG는 접어두기 */}
      {!loading && report && (
        <details style={{ marginTop: 14, opacity: 0.9 }}>
          <summary style={{ cursor: "pointer" }}>DEBUG 보기</summary>
          <pre style={{ marginTop: 10, overflowX: "auto" }}>
            {JSON.stringify(
              {
                id,
                type: reportType?.key,
                periodFrom,
                periodTo,
                channels,
                dbRowsLen: dbRows.length,
                rowsOverrideLen: rowsOverride.length,
                previewMode,
              },
              null,
              2
            )}
          </pre>
        </details>
      )}
    </main>
  );
}