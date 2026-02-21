"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Props = {
  report: any;
  onSaved?: (nextMeta: any) => void;
};

// ✅ 채널 정의 변경: display/search
type ChannelKey = "search" | "display";

function isValidDateRange(from: string, to: string) {
  if (!from || !to) return false;
  return from <= to;
}

export default function CommerceReportEditor({ report, onSaved }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [channels, setChannels] = useState<ChannelKey[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ report.meta에서 값 복원
  useEffect(() => {
    const m = report?.meta ?? {};
    setFrom(m?.period?.from ?? "");
    setTo(m?.period?.to ?? "");
    setChannels((m?.channels ?? []) as ChannelKey[]);
    setNote(m?.note ?? "");
    setMsg("");
    setSaving(false);
  }, [report?.id]);

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
  }, [from, to, channels.length]);

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

    const meta = {
      period: { from, to },
      channels, // ✅ ["search"|"display"]
      note: note || "",
    };

    const { error } = await supabase
      .from("reports")
      .update({ meta })
      .eq("id", report.id);

    if (error) {
      setMsg("❌ 저장 실패: " + error.message);
    } else {
      setMsg("✅ 저장 완료");
      onSaved?.(meta); // ✅ 성공했을 때만
    }

    setSaving(false);
  }

  return (
    <section style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
      <h3 style={{ fontSize: 18, fontWeight: 800 }}>커머스 리포트 설정</h3>
      <p style={{ marginTop: 6, opacity: 0.7 }}>
        필수: 기간(from/to), 채널 1개 이상 / 선택: 메모
      </p>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {/* 기간 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>기간 (필수)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
                <li key={e} style={{ opacity: 0.85 }}>{e}</li>
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
    </section>
  );
}