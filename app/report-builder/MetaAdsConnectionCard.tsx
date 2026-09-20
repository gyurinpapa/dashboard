"use client";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !props.canManage || !view.ready) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const accountId = String(fields.get("externalAccountId") ?? "").trim();
    const accountName = String(fields.get("externalAccountName") ?? "").trim();
    // No token in React state, URL, browser storage, logs or returned connection DTOs.
    let accessToken = String(fields.get("accessToken") ?? "");
    fields.delete("accessToken");
    const tokenInput = form.elements.namedItem("accessToken") as HTMLInputElement;
    tokenInput.value = "";
    setError(""); setNotice("");
    if (!/^[1-9][0-9]{0,29}$/.test(accountId) || !/^[\x21-\x7e]{1,20000}$/.test(accessToken)) {
      accessToken = "";
      setError(metaAdsConnectionErrorMessage("INVALID_INPUT"));
      return;
    }
    busy.current = true; setSaving(true);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const sessionToken = await props.getAccessToken();
      if (!mounted.current || controller.signal.aborted) return;
      if (!sessionToken) { setError(metaAdsConnectionErrorMessage("UNAUTHORIZED")); return; }
      const response = await fetch(`/api/advertisers/${encodeURIComponent(props.advertiserId)}/media-connections/meta-ads`, {
        method: "POST", credentials: "include", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ expectedWorkspaceId: props.workspaceId, externalAccountId: accountId,
          externalAccountName: accountName || null, credentials: { version: 1, access_token: accessToken } }),
      });
      accessToken = "";
      const result = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok || result?.ok !== true) {
        setError(metaAdsConnectionErrorMessage(result?.error));
        return;
      }
      const connection = result.connection;
      if (result.workspace_id !== props.workspaceId || result.advertiser_id !== props.advertiserId ||
        !connection || connection.workspace_id !== props.workspaceId || connection.advertiser_id !== props.advertiserId ||
        connection.provider !== "meta_ads" || connection.external_account_id !== accountId ||
        connection.status !== "active" || connection.has_credentials !== true || connection.last_verified_at !== null ||
        result.verification !== "NOT_PERFORMED" || result.sync_enabled !== false) {
        setError(metaAdsConnectionErrorMessage("SCOPE_MISMATCH"));
        return;
      }
      form.reset(); setOpen(false);
      setNotice("계정을 등록했습니다. 실제 인증 확인과 광고 데이터 동기화는 아직 수행하지 않았습니다.");
      props.onRefresh();
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(metaAdsConnectionErrorMessage(null));
    } finally {
      accessToken = "";
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <section aria-label="Meta Ads 계정 연결" style={{ border: "1px solid rgba(124,92,255,0.18)",
      borderRadius: 14, background: "rgba(42,33,87,0.82)", padding: 14, color: "#bbb8d4" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#f7f7ff" }}>META ADS</div>
        <span aria-live="polite" style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)", padding: "4px 8px", fontSize: 10, fontWeight: 900 }}>{view.label}</span>
      </div>
      <div style={{ marginTop: 10, minHeight: 70, fontSize: 11, lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>{view.description}</p>
        {view.ready && props.connections.map(connection => (
          <p key={connection.id} style={{ margin: "5px 0" }}>
            {connection.external_account_name || "Meta Ads 계정"} · {connection.external_account_id}
          </p>
        ))}
        <p style={{ margin: "5px 0" }}>광고 데이터 동기화는 아직 활성화하지 않았습니다.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {props.canManage && view.ready && !open && (
          <button type="button" style={buttonStyle} onClick={() => { setOpen(true); setError(""); setNotice(""); }}>Meta 계정 등록</button>
        )}
        <button type="button" style={buttonStyle} disabled={props.loading || saving} onClick={props.onRefresh}>상태 새로고침</button>
      </div>
      {view.ready && !props.canManage && <p style={{ fontSize: 11 }}>조회 권한만 있습니다.</p>}
      {open && props.canManage && view.ready && (
        <form onSubmit={submit} autoComplete="off" style={{ marginTop: 14, display: "grid", gap: 12, fontSize: 11 }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>액세스 토큰은 암호화하여 저장하고 다시 표시하지 않습니다. 등록만으로 계정 접근 권한이 확인되지는 않습니다.</p>
          <label>광고계정 ID
            <input name="externalAccountId" required inputMode="numeric" pattern="[1-9][0-9]{0,29}" maxLength={30}
              placeholder="act_ 없이 숫자만 입력" style={inputStyle} disabled={saving} />
          </label>
          <label>계정 이름 (선택)
            <input name="externalAccountName" maxLength={500} style={inputStyle} disabled={saving} />
          </label>
          <label>액세스 토큰
            <input name="accessToken" type="password" required maxLength={20000} autoComplete="new-password"
              spellCheck={false} autoCapitalize="none" style={inputStyle} disabled={saving} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={buttonStyle} disabled={saving}>{saving ? "등록 중…" : "암호화하여 등록"}</button>
            <button type="button" style={buttonStyle} disabled={saving} onClick={() => { setOpen(false); setError(""); }}>취소</button>
          </div>
          <p style={{ margin: 0 }}>입력한 토큰은 제출 후 비워집니다. 재시도할 때 다시 입력해 주세요.</p>
        </form>
      )}
      {error && <p role="alert" style={{ fontSize: 11, lineHeight: 1.6, color: "#ffb4c5" }}>{error}</p>}
      {notice && <p role="status" style={{ fontSize: 11, lineHeight: 1.6, color: "#b4e8d8" }}>{notice}</p>}
    </section>
  );
}
