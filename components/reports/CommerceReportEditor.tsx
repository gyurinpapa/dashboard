"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import CommerceDashboard from "@/components/dashboard/CommerceDashboard";

type Props = {
  report: any;
  onSaved?: (nextMeta: any) => void;

  /**
   * ✅ NEW: 보고용/안전장치
   * - 기본 true: 저장폼 아래에 "DB/API 미리보기"를 붙인다
   * - false로 주면 프리뷰 영역 자체를 숨길 수 있음
   */
  showDbPreview?: boolean;
};

// ✅ 채널 정의: search / display
type ChannelKey = "search" | "display";

function isValidDateRange(from: string, to: string) {
  if (!from || !to) return false;
  return from <= to;
}

function asYMD(v: any): string {
  if (v == null) return "";
  const s = String(v).trim();
  // date 컬럼은 보통 "YYYY-MM-DD"로 오므로 그대로 사용
  return s;
}

export default function CommerceReportEditor({
  report,
  onSaved,
  showDbPreview = true,
}: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [channels, setChannels] = useState<ChannelKey[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ 프리뷰 토글 (보고용)
  const [previewOpen, setPreviewOpen] = useState(true);

  // ✅ 초기값 복원:
  // 1) meta.period.from/to 우선
  // 2) 없으면 report.period_start/end fallback
  useEffect(() => {
    const m = report?.meta ?? {};

    const metaFrom = asYMD(m?.period?.from);
    const metaTo = asYMD(m?.period?.to);

    const colFrom = asYMD(report?.period_start);
    const colTo = asYMD(report?.period_end);

    setFrom(metaFrom || colFrom || "");
    setTo(metaTo || colTo || "");

    setChannels((m?.channels ?? []) as ChannelKey[]);
    setNote((m?.note ?? "") as string);

    setMsg("");
    setSaving(false);
  }, [report?.id, report?.updated_at]); // ✅ updated_at까지 보면 저장 후 반영이 더 안정적

  function toggleChannel(key: ChannelKey) {
    setChannels((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  }

  // ✅ 검증 규칙
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!from) e.push("기간 From을 선택해줘.");
    if (!to) e.push("기간 To를 선택해줘.");
    if (from && to && !isValidDateRange(from, to)) e.push("기간이 올바르지 않아. (From ≤ To)");
    if (!channels.length) e.push("채널을 최소 1개 선택해줘.");
    return e;
  }, [from, to, channels]);

  const canSave = useMemo(() => {
    return Boolean(report?.id) && errors.length === 0 && !saving;
  }, [report?.id, errors.length, saving]);

  async function save() {
    setMsg("");

    if (!report?.id) {
      setMsg("❌ report id가 없어 저장할 수 없어.");
      return;
    }
    if (errors.length > 0) {
      setMsg("❌ " + errors[0]);
      return;
    }
    if (saving) return;

    setSaving(true);

    // ✅ 기존 meta를 보존하면서 필요한 키만 갱신
    const nextMeta = {
      ...(report?.meta ?? {}),
      period: { from, to },
      channels, // ["search"|"display"]
      note: note || "",
    };

    // ✅ meta + 컬럼 period_start/end까지 동기화 저장
    const { data, error } = await supabase
      .from("reports")
      .update({
        meta: nextMeta,
        period_start: from, // date 컬럼: "YYYY-MM-DD"
        period_end: to,
      })
      .eq("id", report.id)
      .select("id, meta, period_start, period_end, updated_at")
      .maybeSingle();

    if (error) {
      setMsg("❌ 저장 실패: " + error.message);
      setSaving(false);
      return;
    }

    // ✅ 서버가 돌려준 meta를 우선 반영 (없으면 nextMeta)
    const savedMeta = (data as any)?.meta ?? nextMeta;

    setMsg("✅ 저장 완료");
    onSaved?.(savedMeta);

    // 로컬 state도 즉시 맞춰두기 (체감 안정성↑)
    setFrom(asYMD((data as any)?.period_start) || from);
    setTo(asYMD((data as any)?.period_end) || to);

    setSaving(false);
  }

  // ✅ DB 프리뷰에 필요한 값들
  const workspaceId: string | null = report?.workspace_id ?? null;

  // CommerceDashboard는 rowOptions를 받아서 "기간/채널" 필터를 안전하게 보장해줌
  const rowOptions = useMemo(() => {
    return {
      from: from || undefined,
      to: to || undefined,
      channels: (channels?.length ? channels : undefined) as any,
    };
  }, [from, to, channels]);

  return (
    <section style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
      <h3 style={{ fontSize: 18, fontWeight: 800 }}>커머스 리포트 설정</h3>
      <p style={{ marginTop: 6, opacity: 0.7 }}>필수: 기간(from/to), 채널 1개 이상 / 선택: 메모</p>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {/* 기간 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>기간 (필수)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          {/* 참고용 */}
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
            (fallback: reports.period_start/end → meta.period.from/to)
          </div>
        </div>

        {/* 채널 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>채널 (최소 1개 필수)</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {(
              [
                ["search", "Search ad"],
                ["display", "Display ad"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={channels.includes(key)}
                  onChange={() => toggleChannel(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 메모 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>메모 / 인사이트 (선택)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            placeholder="예: 설 연휴 영향으로 CVR 하락 → 리마케팅 예산 재배치"
          />
        </div>

        {/* 에러 안내 */}
        {errors.length > 0 && (
          <div style={{ padding: 10, border: "1px solid #f0d0d0", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>저장 불가</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e) => (
                <li key={e} style={{ opacity: 0.85 }}>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 저장 */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: canSave ? "white" : "#f5f5f5",
              cursor: canSave ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>

          {msg && <span style={{ fontSize: 13, opacity: 0.85 }}>{msg}</span>}
        </div>
      </div>

      {/* ✅ DB/API 미리보기 (CSV 업로드 페이지는 그대로 두고, 하단 미리보기만 교체하는 핵심) */}
      {showDbPreview && (
        <section style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed #ddd" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>미리보기 (DB/API)</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                아래 미리보기는 DB(metrics_daily) 기준입니다. (CSV 업로드 흐름은 그대로 유지)
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                fontWeight: 700,
              }}
            >
              {previewOpen ? "미리보기 접기" : "미리보기 펼치기"}
            </button>
          </div>

          {previewOpen && (
            <div style={{ marginTop: 12 }}>
              {!workspaceId ? (
                <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>프리뷰를 띄울 수 없음</div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    report.workspace_id가 없어 DB 기반 미리보기를 띄울 수 없어. <br />
                    (리포트 row에 workspace_id가 포함되어야 함)
                  </div>
                </div>
              ) : (
                <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                  <CommerceDashboard
                    workspaceId={workspaceId}
                    dataUrl="/data/acc_001.csv" // ✅ DB가 비어있을 때 자동 fallback (안전)
                    rowOptions={rowOptions as any}
                    init={{
                      period: { from: from || undefined, to: to || undefined },
                      // 탭/필터 초기값 필요하면 여기에 확장 가능
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}