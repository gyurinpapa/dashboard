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