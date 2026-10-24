"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabase/client";
import MetaAdsInsightsPreview from "../MetaAdsInsightsPreview";

const uuid = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

/** Temporary diagnostics entry, separate from the customer report-building flow.
 * Query values are only scope assertions; the API authenticates and authorizes each read.
 */
export default function MetaDiagnosticsClient() {
  const search = useSearchParams();
  const workspaceId = search.get("workspace_id") ?? "", advertiserId = search.get("advertiser_id") ?? "";
  const connectionId = search.get("connection_id") ?? "", accountId = search.get("account_id") ?? "";
  const valid = [workspaceId, advertiserId, connectionId].every(uuid) && /^[1-9][0-9]{0,29}$/.test(accountId);
  const [session, setSession] = useState<{ ready: boolean; userId: string | null }>({ ready: false, userId: null });
  useEffect(() => {
    let active = true, authVersion = 0;
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      authVersion++;
      if (active) setSession({ ready: true, userId: next?.user.id ?? null });
    });
    const version = authVersion;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && authVersion === version) setSession({ ready: true, userId: data.session?.user.id ?? null });
    }).catch(() => { if (active && authVersion === version) setSession({ ready: true, userId: null }); });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);
  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }
  const builder = uuid(workspaceId) ? `/report-builder?workspace_id=${encodeURIComponent(workspaceId)}` : "/report-builder";
  return <main style={{ minHeight: "100vh", background: "#211a46", color: "#e8e4ff", padding: "32px 16px" }}>
    <section style={{ maxWidth: 760, margin: "0 auto", background: "#2a2157", borderRadius: 16, padding: 24 }}>
      <Link href={builder} style={{ color: "#B7D7E3", fontSize: 13 }}>← 리포트 빌더</Link>
      <h1 style={{ fontSize: 22, marginTop: 24 }}>Meta 연결 점검 · 임시</h1>
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>실제 성과와 문의 전환 항목을 확인하는 별도 점검 화면입니다.
        조회 결과는 보고서에 저장되지 않습니다. 계정 연결 관리 권한이 있어야 조회할 수 있습니다.</p>
      {!valid ? <p role="alert">점검 대상 정보가 올바르지 않습니다.</p> : !session.ready ? <p role="status">로그인을 확인하고 있습니다.</p>
        : !session.userId ? <p>리포트 빌더에서 먼저 로그인한 뒤 이 페이지를 다시 열어 주세요.</p>
        : <MetaAdsInsightsPreview key={`${session.userId}:${workspaceId}:${advertiserId}:${connectionId}:${accountId}`}
          workspaceId={workspaceId} advertiserId={advertiserId} connectionId={connectionId}
          externalAccountId={accountId} accountLabel={`광고계정 ${accountId}`} getAccessToken={getAccessToken} />}
    </section>
  </main>;
}
