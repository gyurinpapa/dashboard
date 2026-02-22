"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Report = {
  id: string;
  title: string;
  status: string;
  period_start: string | null; // "YYYY-MM-DD" or null
  period_end: string | null;
  meta: any;
  created_at: string;
  updated_at: string;
};

function fmtDT(iso: string) {
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [report, setReport] = useState<Report | null>(null);

  // editable fields
  const [title, setTitle] = useState("");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [note, setNote] = useState<string>(""); // meta.note

  async function load() {
    if (!reportId) return;
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch(`/api/reports/${reportId}`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok) {
        setMsg(`불러오기 실패(${res.status}): ${json?.error ?? text ?? "empty"}`);
        setReport(null);
        return;
      }

      const r = json.report as Report;
      setReport(r);
      setTitle(r.title ?? "");
      setPeriodStart(r.period_start ?? "");
      setPeriodEnd(r.period_end ?? "");
      setNote((r.meta?.note as string) ?? "");
    } catch (e: any) {
      setMsg(`불러오기 예외: ${e?.message ?? String(e)}`);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!reportId) return;
    if (saving) return;

    setSaving(true);
    setMsg("");

    try {
      const payload = {
        title,
        period_start: periodStart ? periodStart : null,
        period_end: periodEnd ? periodEnd : null,
        meta: {
          ...(report?.meta ?? {}),
          note,
        },
      };

      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok) {
        setMsg(`저장 실패(${res.status}): ${json?.error ?? text ?? "empty"}`);
        return;
      }

      const updated = json.report as Report;
      setReport((prev) => (prev ? { ...prev, ...updated } : updated));
      setMsg("✅ 저장 완료");
    } catch (e: any) {
      setMsg(`저장 예외: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function generateAI() {
    // 지금은 더미 (다음 단계에서 OpenAI 붙일 예정)
    setMsg("🤖 AI 인사이트 생성: 다음 단계에서 붙일게 (지금은 더미 버튼)");
    // 여기서 나중에 /api/insights/generate 같은 걸 호출할 거야.
  }

  const header = useMemo(() => {
    if (!report) return null;
    return (
      <div style={{ opacity: 0.8, fontSize: 13, marginTop: 6 }}>
        <div>status: {report.status}</div>
        <div>created: {fmtDT(report.created_at)}</div>
        <div>updated: {fmtDT(report.updated_at)}</div>
      </div>
    );
  }, [report]);

  return (
    <main style={{ padding: 24, maxWidth: 920 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Report Editor</h1>
      <div style={{ marginTop: 6, opacity: 0.7 }}>id: {reportId}</div>

      {loading && <p style={{ marginTop: 12 }}>불러오는 중...</p>}
      {!loading && !report && <p style={{ marginTop: 12 }}>리포트를 찾지 못했어.</p>}

      {!loading && report && (
        <section
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #e5e5e5",
            borderRadius: 14,
          }}
        >
          <label style={{ display: "block", fontWeight: 700 }}>
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: 8,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <label style={{ display: "block", fontWeight: 700 }}>
              기간 시작
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 10,
                  minWidth: 200,
                }}
              />
            </label>

            <label style={{ display: "block", fontWeight: 700 }}>
              기간 종료
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 10,
                  minWidth: 200,
                }}
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 14, fontWeight: 700 }}>
            메모 (meta.note)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              style={{
                display: "block",
                width: "100%",
                marginTop: 8,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
              {saving ? "저장 중..." : "저장"}
            </button>
            <button onClick={load} style={{ padding: "10px 14px" }}>
              새로고침
            </button>
            <button onClick={generateAI} style={{ padding: "10px 14px" }}>
              AI 인사이트 생성(더미)
            </button>
          </div>

          {header}
        </section>
      )}

      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </main>
  );
}