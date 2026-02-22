"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

import CommerceReportEditor from "@/components/reports/CommerceReportEditor";
import CommerceDashboard from "@/components/dashboard/CommerceDashboard";

// ✅ "채널"을 search/display로 정의 (용어는 화면에서 '채널'로 표기)
type ChannelKey = "search" | "display";

export default function ReportDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState<any>(null);
  const [reportType, setReportType] = useState<any>(null);

  // AI Insight UI 상태
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState("");

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setMsg("");

      // 1) report
      const { data: r, error: rErr } = await supabase
        .from("reports")
        .select("id, title, status, created_at, workspace_id, created_by, report_type_id, meta")
        .eq("id", id)
        .single();

      if (rErr) {
        setMsg(`report 조회 실패: ${rErr.message}`);
        setLoading(false);
        return;
      }

      setReport(r);

      // 2) report type
      const { data: t, error: tErr } = await supabase
        .from("report_types")
        .select("id, key, name")
        .eq("id", r.report_type_id)
        .single();

      if (tErr) {
        setMsg(`report_type 조회 실패: ${tErr.message}`);
        setLoading(false);
        return;
      }

      setReportType(t);
      setLoading(false);
    })();
  }, [id]);

  const isCommerce = reportType?.key === "commerce";
  const meta = report?.meta ?? {};

  // ✅ meta 스키마: { period: {from,to}, channels: ["search"|"display"], note: "" }
  const periodFrom = meta?.period?.from as string | undefined;
  const periodTo = meta?.period?.to as string | undefined;
  const channels = (meta?.channels ?? []) as ChannelKey[];
  const note = (meta?.note ?? "") as string;

  // ✅ 저장 후 meta가 바뀌면 대시보드를 리마운트해서 즉시 반영
  const dashboardKey = useMemo(() => {
    return JSON.stringify({
      from: periodFrom ?? "",
      to: periodTo ?? "",
      channels: Array.isArray(channels) ? channels.slice().sort() : [],
    });
  }, [periodFrom, periodTo, channels]);

  const channelsLabel = useMemo(() => {
    if (!Array.isArray(channels) || channels.length === 0) return "(미설정)";
    const map: Record<ChannelKey, string> = {
      search: "Search AD",
      display: "Display AD",
    };
    return channels.map((c) => map[c] ?? c).join(", ");
  }, [channels]);

  const aiInsightText = (meta?.ai_insight?.text ?? "") as string;
  const aiInsightCreatedAt = meta?.ai_insight?.created_at as string | undefined;

  async function generateAIInsight() {
    if (!id) return;
    if (aiLoading) return;

    setAiLoading(true);
    setAiMsg("");

    try {
      const res = await fetch("/api/ai/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const errText = json?.error ?? `HTTP ${res.status}`;
        setAiMsg(`AI 인사이트 생성 실패: ${errText}`);
        setAiLoading(false);
        return;
      }

      // ✅ 서버가 meta까지 돌려주므로 그대로 반영
      const nextMeta = json?.meta;
      const insight = json?.insight as string | undefined;

      if (nextMeta) {
        setReport((prev: any) => (prev ? { ...prev, meta: nextMeta } : prev));
      }

      if (insight) {
        setAiMsg("✅ AI 인사이트 생성 완료");
      } else {
        setAiMsg("✅ 저장은 됐는데, 본문이 비어있어. (서버 응답 확인 필요)");
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

      {loading && <p style={{ marginTop: 12 }}>불러오는 중...</p>}
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

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
            <b>Created</b>: {report.created_at}
          </div>
          <div>
            <b>Workspace</b>: {report.workspace_id}
          </div>

          <hr style={{ margin: "12px 0" }} />

          <div>
            <b>Type</b>:{" "}
            {reportType ? `${reportType.name} (key=${reportType.key})` : "loading..."}
          </div>

          {/* ✅ meta 요약 표시 */}
          {isCommerce && (
            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
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
            </div>
          )}
        </div>
      )}

      {/* ✅ 커머스 설정 저장 UI */}
      {!loading && report && isCommerce && (
        <CommerceReportEditor
          report={report}
          onSaved={(nextMeta: any) => {
            // ✅ 저장 성공 후 즉시 화면 반영
            setReport((prev: any) => (prev ? { ...prev, meta: nextMeta } : prev));
          }}
        />
      )}

      {/* ✅ AI 인사이트 생성 UI (진짜 연결) */}
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
            {aiInsightText ? (
              <>
                {aiInsightCreatedAt && (
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                    마지막 생성: {aiInsightCreatedAt}
                  </div>
                )}
                {aiInsightText}
              </>
            ) : (
              <div style={{ opacity: 0.7 }}>
                아직 인사이트가 없어. 위의 <b>“AI 인사이트 생성”</b>을 눌러봐.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ✅ 기존 홈 대시보드 UI 재사용 + 기간/채널(rowOptions)까지 실제 적용 */}
      {!loading && report && isCommerce && (
        <div style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 18 }}>
          <div style={{ marginBottom: 10, opacity: 0.7 }}>
            아래는 <b>기존 홈(/) 보고서 UI</b>를 그대로 재사용한 영역이야. (홈은 절대 훼손되지 않음)
          </div>

          <CommerceDashboard
            key={dashboardKey}
            dataUrl="/data/acc_001.csv"
            // ✅ rows 단계에서 기간+채널을 먼저 잘라서, 아래 미리보기에서 "채널 필터"가 반드시 먹게 함
            rowOptions={{
              from: periodFrom,
              to: periodTo,
              channels: Array.isArray(channels) ? channels : [],
            }}
            init={{
              tab: "summary",
              // period는 HeaderBar "기간 표시"에도 쓰일 수 있으니 유지
              period: { from: periodFrom, to: periodTo },
            }}
          />
        </div>
      )}
    </main>
  );
}