"use client";
import { isMetaAdsContactConnection, readMetaAdsContactPolicy } from "@/src/lib/media-sync/meta-ads-contact-policy";
import { metaAdsDailyStatusText, readMetaAdsDailyPolicy, metaAdsSetupDates } from "@/src/lib/media-sync/meta-ads-daily-policy";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  getMetaAdsConnectionView,
  metaAdsConnectionErrorMessage,
  type MetaAdsConnectionSummary,
} from "@/src/lib/media-sync/meta-ads-connection-view";

type Props = {
  workspaceId: string;
  advertiserId: string;
  connections: readonly MetaAdsConnectionSummary[];
  loading: boolean;
  resolved: boolean;
  error: string;
  canManage: boolean;
  getAccessToken: () => Promise<string | null>;
  onRefresh: () => void;
};
const buttonStyle: CSSProperties = {
  border: "1px solid rgba(124, 92, 255, 0.30)", borderRadius: 10,
  background: "rgba(124, 92, 255, 0.10)", padding: "9px 11px", color: "#e8e4ff",
  fontSize: 11, fontWeight: 800, cursor: "pointer",
};
const inputStyle: CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box", marginTop: 5,
  border: "1px solid rgba(255,255,255,0.22)", borderRadius: 8,
  background: "rgba(20,16,44,0.55)", color: "#f7f7ff", padding: 9, fontSize: 12,
};

/** Parent keys this card by user/workspace/advertiser; scope changes discard secrets and stale requests. */
export default function MetaAdsConnectionCard(props: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<MetaAdsConnectionSummary | null>(null);
  const dates = metaAdsSetupDates();
  const [startDate, setStartDate] = useState(dates.defaultStart);
  const [includeForms, setIncludeForms] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const view = getMetaAdsConnectionView(props);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestController.current?.abort();
    };
  }, []);

  const pending = props.connections.some(c => {
    const state = c.meta?.meta_ads_daily_status;
    return state && typeof state === "object" && !Array.isArray(state) &&
      ["pending", "processing"].includes(String((state as Record<string, unknown>).status));
  });
  const { onRefresh } = props;
  useEffect(() => {
    if (!pending) return;
    let checks = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      onRefresh();
      if (++checks >= 20) clearInterval(timer);
    }, 15000);
    return () => clearInterval(timer);
  }, [pending, onRefresh]);

  function openSetup(connection: MetaAdsConnectionSummary | null) {
    setEditing(connection);
    setIncludeForms(connection ? Boolean(readMetaAdsContactPolicy(connection.meta?.meta_ads_reporting, connection.external_account_id)?.instant_form) : true);
    setStartDate(readMetaAdsDailyPolicy(connection?.meta?.meta_ads_daily)?.start_date ?? dates.defaultStart);
    setOpen(true); setError(""); setNotice("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !props.canManage || !view.ready) return;
    const form = event.currentTarget, fields = new FormData(form);
    const accountId = editing?.external_account_id ?? String(fields.get("externalAccountId") ?? "").trim();
    const accountName = String(fields.get("externalAccountName") ?? "").trim();
    let accessToken = String(fields.get("accessToken") ?? "");
    fields.delete("accessToken");
    (form.elements.namedItem("accessToken") as HTMLInputElement).value = "";
    setError(""); setNotice("");
    if (!/^[1-9][0-9]{0,29}$/.test(accountId) || ((!editing || accessToken) && !/^[\x21-\x7e]{1,20000}$/.test(accessToken)) ||
      fields.get("confirmConversion") !== "on") {
      accessToken = ""; setError(metaAdsConnectionErrorMessage("META_SETUP_INVALID_INPUT")); return;
    }
    busy.current = true; setSaving(true);
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 70000);
    let registered = false;
    try {
      const sessionToken = await props.getAccessToken();
      if (!mounted.current || controller.signal.aborted) return;
      if (!sessionToken) { setError(metaAdsConnectionErrorMessage("UNAUTHORIZED")); return; }
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` };
      let connection = editing;
      if (!connection) {
        const response = await fetch(`/api/advertisers/${encodeURIComponent(props.advertiserId)}/media-connections/meta-ads`, {
          method: "POST", credentials: "include", signal: controller.signal, headers,
          body: JSON.stringify({ expectedWorkspaceId: props.workspaceId, externalAccountId: accountId,
            externalAccountName: accountName || null, credentials: { version: 1, access_token: accessToken } }),
        });
        accessToken = "";
        const result = await response.json();
        if (!mounted.current || controller.signal.aborted) return;
        if (!response.ok || result?.ok !== true) { setError(metaAdsConnectionErrorMessage(result?.error)); return; }
        const c = result.connection;
        if (result.workspace_id !== props.workspaceId || result.advertiser_id !== props.advertiserId ||
          !c || c.workspace_id !== props.workspaceId || c.advertiser_id !== props.advertiserId ||
          c.provider !== "meta_ads" || c.external_account_id !== accountId || c.has_credentials !== true ||
          c.last_verified_at !== null || result.verification !== "NOT_PERFORMED" || result.sync_enabled !== false) {
          setError(metaAdsConnectionErrorMessage("SCOPE_MISMATCH")); return;
        }
        connection = c as MetaAdsConnectionSummary; registered = true; setEditing(connection);
      }
      const response = await fetch(`/api/advertisers/${encodeURIComponent(props.advertiserId)}/media-connections/meta-ads/${encodeURIComponent(connection.id)}/setup`, {
        method: "POST", credentials: "include", signal: controller.signal, headers,
        body: JSON.stringify({ expectedWorkspaceId: props.workspaceId, startDate, conversion: includeForms ? "website_contact_and_instant_form" : "website_contact", confirmConversion: true,
          credentials: accessToken ? { version: 1, access_token: accessToken } : null }),
      });
      accessToken = "";
      const result = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok || result?.ok !== true) { setError(metaAdsConnectionErrorMessage(result?.error)); return; }
      if (result.workspace_id !== props.workspaceId || result.advertiser_id !== props.advertiserId ||
        result.connection_id !== connection.id || result.external_account_id !== accountId ||
        result.verification !== "INSIGHTS_CONFIRMED" || result.sync_enabled !== true) {
        setError(metaAdsConnectionErrorMessage("SCOPE_MISMATCH")); return;
      }
      form.reset(); setOpen(false); setEditing(null);
      setNotice(result.initial_status === "done" ? "자동 수집 설정을 확인했습니다. 매일 새벽 5시에 갱신됩니다."
        : "인증과 성과 확인을 완료했습니다. 첫 수집을 진행한 뒤 매일 새벽 5시에 갱신합니다.");
      props.onRefresh();
    } catch {
      if (mounted.current) setError(controller.signal.aborted
        ? "처리 결과를 확인하는 데 시간이 걸립니다. 연결 상태를 새로고침해 주세요."
        : metaAdsConnectionErrorMessage("META_SETUP_VERIFICATION_FAILED"));
    } finally {
      clearTimeout(timeout); accessToken = ""; busy.current = false;
      if (mounted.current) { setSaving(false); if (registered) props.onRefresh(); }
    }
  }

  return (
    <section aria-label="Meta Ads 계정 연결" style={{ border: "1px solid rgba(124,92,255,0.18)",
      borderRadius: 14, background: "rgba(42,33,87,0.82)", padding: 14, color: "#bbb8d4" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#f7f7ff" }}>META ADS</div>
        <span aria-live="polite" style={{ borderRadius: 999,
          border: view.connected ? "1px solid rgba(110, 231, 183, 0.28)" : "1px solid rgba(255, 255, 255, 0.12)",
          background: view.connected ? "rgba(110, 231, 183, 0.10)" : "rgba(255, 255, 255, 0.05)",
          color: view.connected ? "#a7f3d0" : "#bbb8d4",
          padding: "4px 8px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>{view.label}</span>
      </div>
      <div style={{ marginTop: 10, minHeight: 70, fontSize: 11, lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>{view.description}</p>
        {view.ready && props.connections.map(connection => (
          <p key={connection.id} style={{ margin: "5px 0" }}>
            {connection.external_account_name || "Meta Ads 계정"} · {connection.external_account_id}
            {connection.status === "active" && metaAdsDailyStatusText(connection.meta ?? {}) ? (
              <span style={{ display: "block", color: "#a7f3d0" }}>{metaAdsDailyStatusText(connection.meta ?? {})}</span>
            ) : null}
          </p>
        ))}
        <p style={{ margin: "5px 0" }}>{view.ready && props.connections.some(c => isMetaAdsContactConnection({ ...c, meta: c.meta ?? {} }))
          ? props.connections.some(c => c.status === "active" && metaAdsDailyStatusText(c.meta ?? {}))
            ? "최근 7일의 전환을 다시 확인하며, 저장한 기간의 DB획득 보고서에 자동 반영합니다."
            : "DB획득 보고서에서 웹사이트 문의를 수동으로 동기화할 수 있습니다."
          : "광고 데이터 동기화는 아직 활성화하지 않았습니다."}</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {props.canManage && view.ready && !open && (
          <button type="button" style={buttonStyle} disabled={saving} onClick={() => openSetup(null)}>Meta 계정 연결</button>
        )}
        {props.canManage && view.ready && !open && props.connections.filter(c => ["active", "error"].includes(c.status) && c.has_credentials).map(connection => (
          <button key={connection.id} type="button" style={buttonStyle} disabled={saving}
            onClick={() => openSetup(connection)}>
            {props.connections.length > 1 ? `${connection.external_account_name || connection.external_account_id} 수집 설정` : "수집 설정 · 인증 갱신"}
          </button>
        ))}
      </div>
      {view.ready && !props.canManage && <p style={{ fontSize: 11 }}>조회 권한만 있습니다.</p>}
      {open && props.canManage && view.ready && (
        <form key={editing?.id ?? "new"} onSubmit={submit} autoComplete="off" style={{ marginTop: 14, display: "grid", gap: 12, fontSize: 11 }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>계정 접근과 성과 데이터를 확인한 후 자동 수집을 시작합니다. 현재 지원: 원화·한국시간 계정의 DB획득 · 웹사이트 문의.</p>
          <label>광고계정 ID
            <input name="externalAccountId" required inputMode="numeric" defaultValue={editing?.external_account_id} pattern="[1-9][0-9]{0,29}" maxLength={30}
              placeholder="act_ 없이 숫자만 입력" style={inputStyle} disabled={saving || Boolean(editing)} />
          </label>
          {!editing && <label>계정 이름 (선택)
            <input name="externalAccountName" maxLength={500} style={inputStyle} disabled={saving} />
          </label>}
          <label>{editing ? "새 액세스 토큰 (인증 갱신 시 입력)" : "액세스 토큰"}
            <input name="accessToken" type="password" required={!editing} maxLength={20000} autoComplete="new-password"
              spellCheck={false} autoCapitalize="none" style={inputStyle} disabled={saving} />
          </label>
          <label>수집 시작일
            <input name="startDate" type="date" required value={startDate} onChange={event => setStartDate(event.target.value)}
              min={dates.minDate} max={dates.maxDate} style={inputStyle} disabled={saving} />
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 7, lineHeight: 1.6 }}>
            <input name="includeInstantForms" type="checkbox" checked={includeForms} onChange={event => setIncludeForms(event.target.checked)} disabled={saving} />
            <span>인스턴트 양식 제출도 전환에 포함</span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 7, lineHeight: 1.6 }}>
            <input name="confirmConversion" type="checkbox" required disabled={saving} style={{ marginTop: 3 }} />
            <span>이 계정의 웹사이트 문의{includeForms ? "와 인스턴트 양식 제출을" : "를"} ‘문의·상담 신청’ 전환으로 집계하고, 매일 새벽 5시 자동 수집을 시작합니다.</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={buttonStyle} disabled={saving}>{saving ? "계정·성과 확인 중…" : "검증하고 자동 수집 시작"}</button>
            <button type="button" style={buttonStyle} disabled={saving} onClick={() => { setOpen(false); setError(""); }}>취소</button>
          </div>
          <p style={{ margin: 0 }}>토큰은 암호화하여 저장하며 제출 후 입력칸에서 지워집니다. 기존 계정은 새 토큰을 입력하지 않으면 저장된 인증 정보를 사용합니다.</p>
        </form>
      )}
      {error && <p role="alert" style={{ fontSize: 11, lineHeight: 1.6, color: "#ffb4c5" }}>{error}</p>}
      {notice && <p role="status" style={{ fontSize: 11, lineHeight: 1.6, color: "#b4e8d8" }}>{notice}</p>}
    </section>
  );
}
