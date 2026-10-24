"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { MetaAdsInsightsPreview as Preview } from "@/src/lib/media-sync/meta-ads-insights-preview";
import { metaAdsConnectionErrorMessage } from "@/src/lib/media-sync/meta-ads-connection-view";
import { formatMetaAdsPreviewExport } from "@/src/lib/media-sync/meta-ads-insights-preview-export";

type Props = {
  workspaceId: string; advertiserId: string; connectionId: string; externalAccountId: string;
  accountLabel: string; getAccessToken: () => Promise<string | null>;
};
type Result = { preview: Preview; currency: string; timezone_name: string };
const buttonStyle: CSSProperties = { border: "1px solid rgba(124,92,255,0.30)", borderRadius: 10,
  background: "rgba(124,92,255,0.10)", padding: "9px 11px", color: "#e8e4ff", fontSize: 11, fontWeight: 800, cursor: "pointer" };
const dateStyle: CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.22)", padding: 7, color: "#f7f7ff", background: "#211a48", colorScheme: "dark" };
const labels: Record<string, string> = {
  lead: "잠재 고객 전체", "offsite_conversion.fb_pixel_lead": "웹사이트 잠재 고객",
  leadgen_grouped: "Meta 내 잠재 고객", "onsite_conversion.lead_grouped": "Meta 내 잠재 고객",
  "offsite_conversion.fb_pixel_complete_registration": "웹사이트 등록 완료",
  "offsite_conversion.fb_pixel_contact": "웹사이트 연락", landing_page_view: "랜딩 페이지 조회",
  omni_landing_page_view: "랜딩 페이지 조회 (통합)", link_click: "링크 클릭",
};
const label = (type: string) => labels[type] ?? (type.startsWith("offsite_conversion.custom.") ? "맞춤 전환" : type);
const number = (value: string | null) => value === null ? "—" : Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 6 });
function priority(type: string) {
  return type.includes("contact") ? 0 : type === "lead" ? 1 : type.includes("lead") || type.startsWith("offsite_conversion.") ? 2 : 3;
}

/** Parent remounts on connection/scope/credential-verification changes. No token or result persistence. */
export default function MetaAdsInsightsPreview(props: Props) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [result, setResult] = useState<Result | null>(null);
  const [dateFrom, setDateFrom] = useState(""), [dateTo, setDateTo] = useState("");
  const [copyMessage, setCopyMessage] = useState(""), [manualCopy, setManualCopy] = useState(false);
  const request = useRef<AbortController | null>(null), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);

  async function load(range: { dateFrom?: string; dateTo?: string } = {}) {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setOpen(true); setBusy(true); setError(""); setResult(null); setCopyMessage(""); setManualCopy(false);
    try {
      const token = await props.getAccessToken();
      if (!mounted.current || controller.signal.aborted) return;
      if (!token) { setError(metaAdsConnectionErrorMessage("UNAUTHORIZED")); return; }
      const response = await fetch(`/api/advertisers/${encodeURIComponent(props.advertiserId)}/media-connections/meta-ads/${encodeURIComponent(props.connectionId)}/insights-preview`, {
        method: "POST", credentials: "include", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expectedWorkspaceId: props.workspaceId, ...range }),
      });
      const body = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok || body?.ok !== true) { setError(metaAdsConnectionErrorMessage(body?.error)); return; }
      if (body.workspace_id !== props.workspaceId || body.advertiser_id !== props.advertiserId ||
        body.connection_id !== props.connectionId || body.external_account_id !== props.externalAccountId ||
        body.read_only !== true || body.sync_enabled !== false || body.conversion_mapping !== "UNCONFIRMED" ||
        !body.preview || !Array.isArray(body.preview.actions) || !Array.isArray(body.preview.action_values) ||
        !Array.isArray(body.preview.conversions) || !Array.isArray(body.preview.conversion_values)) {
        setError(metaAdsConnectionErrorMessage("SCOPE_MISMATCH")); return;
      }
      setResult({ preview: body.preview, currency: body.currency, timezone_name: body.timezone_name });
      setDateFrom(body.preview.date_from); setDateTo(body.preview.date_to);
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(metaAdsConnectionErrorMessage("META_PREVIEW_FAILED"));
    } finally {
      request.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(dateFrom || dateTo ? { dateFrom, dateTo } : {});
  }
  const rows = result ? (["conversions", "actions", "conversion_values", "action_values"] as const)
    .flatMap(source => [...result.preview[source]].sort((a, b) =>
      priority(a.action_type) - priority(b.action_type) || a.action_type.localeCompare(b.action_type))
      .map(row => ({ ...row, source }))) : [];
  const exportText = result ? formatMetaAdsPreviewExport({ externalAccountId: props.externalAccountId,
    currency: result.currency, timeZone: result.timezone_name, preview: result.preview }) : "";
  async function copyResult() {
    try {
      await navigator.clipboard.writeText(exportText);
      if (mounted.current) { setCopyMessage("결과 전체를 복사했습니다. 대화창에 붙여넣어 주세요."); setManualCopy(false); }
    } catch {
      if (mounted.current) { setManualCopy(true); setCopyMessage("아래 내용을 선택해 복사해 주세요."); }
    }
  }

  return <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6 }}>
    <button type="button" style={buttonStyle} disabled={busy} aria-expanded={open}
      onClick={() => open ? setOpen(false) : void load()}>
      {busy ? "성과·전환 조회 중…" : open ? "점검 결과 닫기" : "성과·전환 점검"}
    </button>
    {open && <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 10 }}>
      <p style={{ margin: "0 0 8px" }}>{props.accountLabel} · 기간별 성과와 전환 항목을 확인합니다.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 7 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 7 }}>
          <label>시작일<input type="date" value={dateFrom} disabled={busy} style={dateStyle}
            onChange={e => setDateFrom(e.target.value)} /></label>
          <label>종료일<input type="date" value={dateTo} disabled={busy} style={dateStyle}
            onChange={e => setDateTo(e.target.value)} /></label>
        </div>
        <span>최대 31일. 기간을 비우면 광고계정 시간대 기준 어제까지 최근 30일을 조회합니다.</span>
        <button type="submit" style={buttonStyle} disabled={busy}>선택 기간 조회</button>
      </form>
      {busy && <p role="status">Meta에서 성과를 조회하고 있습니다.</p>}
      {error && <p role="alert" style={{ color: "#ffb4c5" }}>{error}</p>}
      {result && <div role="status">
        <p>{result.preview.date_from} ~ {result.preview.date_to}<br />{result.timezone_name} · {result.currency}</p>
        <button type="button" style={buttonStyle} onClick={() => void copyResult()}>점검 결과 전체 복사</button>
        {copyMessage && <p>{copyMessage}</p>}
        {manualCopy && <textarea aria-label="복사할 점검 결과" readOnly value={exportText}
          onFocus={event => event.currentTarget.select()} style={{ ...dateStyle, height: 160, marginTop: 8 }} />}
        {result.preview.has_data ? <>
          <p>노출 <strong>{number(result.preview.impressions)}</strong> · 클릭 <strong>{number(result.preview.clicks)}</strong><br />
            광고비 <strong>{number(result.preview.spend)} {result.currency}</strong></p>
          <p style={{ color: "#b4e8d8" }}>문의·상담 신청에 해당하는 항목을 광고 관리자 수치와 비교해 주세요.</p>
          <p>조회 범위: actions · action_values · conversions · conversion_values</p>
          {rows.length ? <div style={{ maxHeight: 300, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <caption style={{ textAlign: "left", fontWeight: 800 }}>Meta에서 반환한 성과 항목</caption>
              <thead><tr><th scope="col" style={{ textAlign: "left", width: "78%" }}>항목</th><th scope="col">값</th></tr></thead>
              <tbody>{rows.map(row => <tr key={`${row.source}:${row.action_type}`}>
                <td style={{ borderTop: "1px solid rgba(255,255,255,.1)", padding: "6px 3px", overflowWrap: "anywhere" }}>
                  {label(row.action_type)}
                  <small style={{ display: "block", opacity: .7 }}>{row.source}{label(row.action_type) !== row.action_type && ` · ${row.action_type}`}</small>
                </td>
                <td style={{ borderTop: "1px solid rgba(255,255,255,.1)", textAlign: "right", verticalAlign: "top", paddingTop: 6 }}>{number(row.value)}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p>이 기간에는 성과 항목이 반환되지 않았습니다.</p>}
        </> : <p>이 기간에 반환된 성과 데이터가 없습니다.</p>}
        <p>항목 간 수치는 중복될 수 있어 합산하지 않습니다. 없는 항목은 0건으로 확정하지 않습니다.</p>
        <p>조회 결과는 보고서에 저장되지 않습니다.</p>
      </div>}
    </div>}
  </div>;
}
