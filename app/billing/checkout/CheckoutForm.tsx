/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation preserves auth cookies and canonical host routing without prefetch. */
"use client";
import { useEffect, useRef, useState } from "react";
import type { BillingMode, Scope } from "@/lib/billing/catalog";
import styles from "../../pricing/billing.module.css";
type PaymentRequest = { method: "CARD"; amount: { currency: "KRW"; value: number }; orderId: string; orderName: string; successUrl: string; failUrl: string };
declare global { interface Window { TossPayments?: (key: string) => { payment: (options: { customerKey: string }) => {
  requestPayment: (input: PaymentRequest) => Promise<void>;
} }; } }
let sdk: Promise<void> | undefined;
function loadSdk() {
  if (window.TossPayments) return Promise.resolve();
  if (!sdk) sdk = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://js.tosspayments.com/v2/standard"; script.async = true;
    script.onload = () => { if (window.TossPayments) resolve(); else { script.remove(); sdk = undefined; reject(new Error("SDK_FAILED")); } };
    script.onerror = () => { script.remove(); sdk = undefined; reject(new Error("SDK_FAILED")); };
    document.head.appendChild(script);
  });
  return sdk;
}
export default function CheckoutForm({ scope, mode }: { scope: Scope; mode: BillingMode }) {
  const [options, setOptions] = useState<{ id: string; name: string; paidUntil?: string | null }[]>([]), [target, setTarget] = useState("");
  const [workspaces,setWorkspaces]=useState<{id:string;name:string}[]>([]),[workspace,setWorkspace]=useState(""),[name,setName]=useState("");
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [loginRequired, setLoginRequired] = useState(false), [loaded, setLoaded] = useState(false);
  const requestId = useRef("");
  const submitting = useRef(false);
  const paidUntil = options.find(option => option.id === target)?.paidUntil;
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/billing/review/targets", { cache: "no-store", signal: abort.signal }).then(async response => {
      if (response.status === 401) { setLoginRequired(true); return; }
      if (!response.ok) {const result=await response.json();throw new Error(result.error);}
      const data = await response.json(); setOptions(data[scope] || []); setWorkspaces(data.newAdvertiserWorkspaces || []); if(data.newAdvertiserWorkspaces?.length===1)setWorkspace(data.newAdvertiserWorkspaces[0].id); if(scope==="advertiser")setTarget("new");
    }).catch(error => { if (!abort.signal.aborted) setMessage(error.message === "TEST_ACCESS_REQUIRED" ? "현재는 심사용 테스트 계정만 결제할 수 있습니다. 일반 구매는 결제 심사 완료 후 열립니다." : "이용 대상을 불러오지 못했습니다. 새로고침 후에도 같다면 문의해주세요. 결제는 시작되지 않았습니다."); })
      .finally(() => { if (!abort.signal.aborted) setLoaded(true); });
    return () => abort.abort();
  }, [scope]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !target || !consent || paidUntil) return;
    submitting.current = true; setBusy(true); setMessage("");
    try {
      // Keep one order ID across retries/tab reloads for this exact choice.
      const storageKey = `etrylue:review-checkout:${scope}:${mode}:${target}${target==="new"?":"+workspace+":"+name.trim():""}`;
      requestId.current = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, requestId.current);
      const response = await fetch("/api/billing/review/checkout", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId.current, scope, mode, targetId: target, ...(target === "new" ? {newAdvertiserName:name.trim(),workspaceId:workspace}:{}), consent: true }) });
      if (!response.ok) { const result=await response.json(); throw new Error(result.error || "ORDER_FAILED"); }
      const order = await response.json();
      await loadSdk();
      const payment = window.TossPayments!(order.clientKey).payment({ customerKey: order.customerKey });
      const redirect = { method: "CARD" as const, successUrl: order.successUrl, failUrl: order.failUrl };
      await payment.requestPayment({ ...redirect, amount: { currency: "KRW", value: order.amount }, orderId: order.orderId, orderName: order.orderName });
    } catch(error) {
      const code=error instanceof Error?error.message:"";
      if(code==="ACTIVE_ENTITLEMENT_EXISTS")setMessage("이미 사용 가능한 이용권이 있습니다. 추가 결제 없이 리포트를 시작하세요. 새로고침하면 최신 이용기간이 표시됩니다.");
      else if(code==="NEW_ADVERTISER_TEST_ONLY")setMessage("신규 광고주 구매는 현재 분리된 테스트 환경에서 검증 중입니다. 운영 결제는 아직 시작되지 않았습니다.");
      else if(code==="TARGET_NOT_ALLOWED")setMessage("선택한 회사에 광고주를 등록할 권한이 없습니다. 회사 관리자에게 확인해주세요.");
      else setMessage("결제가 완료되지 않았거나 결과 확인이 필요합니다. 이미 인증했다면 결제 결과를 먼저 확인해주세요.");
    } finally { submitting.current = false; setBusy(false); }
  }
  const next = `/billing/checkout?scope=${scope}&mode=${mode}`;
  if(loginRequired)return <div className={styles.notice}><h2>로그인하고 주문을 이어가세요</h2><p>신규 고객도 기존 광고주 없이 구매할 수 있습니다. 선택한 요금제는 그대로 유지됩니다.</p><div className={styles.actions}><a className={styles.button} href={`/login?next=${encodeURIComponent(next)}`}>로그인</a><a className={styles.button} href={`/signup?next=${encodeURIComponent(next)}`}>회원가입하고 계속하기</a></div></div>;
  return <form onSubmit={submit}>
    <label className={styles.label} htmlFor="billing-target">결제할 이용 대상</label>
    <select className={styles.select} id="billing-target" value={target} onChange={event => { setTarget(event.target.value); requestId.current = ""; }} disabled={!loaded || busy} required>
      <option value="">{loaded ? "대상을 선택해주세요" : "이용 대상 확인 중…"}</option>
      {scope === "advertiser" && <option value="new">+ 신규 광고주</option>}
      {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
    {scope!=="advertiser" && loaded && !loginRequired && !options.length ? <p className={styles.details}>현재 계정에서 선택할 수 있는 이용 대상이 없습니다.</p> : null}
    {scope==="advertiser"&&target==="new"&&<><label className={styles.label} htmlFor="new-advertiser">신규 광고주 이름</label><input id="new-advertiser" className={styles.select} value={name} onChange={e=>setName(e.target.value)} maxLength={100} required disabled={busy}/>
    <label className={styles.label} htmlFor="new-workspace">등록할 워크스페이스</label><select id="new-workspace" className={styles.select} value={workspace} onChange={e=>setWorkspace(e.target.value)} required disabled={busy}><option value="">선택해주세요</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
    <p className={styles.details}>{loaded&&!workspaces.length?"등록 가능한 워크스페이스가 없습니다. 신규 가입자는 계정 준비를 완료하고, 기존 구성원은 회사 관리자에게 등록 권한을 확인해주세요.":"광고주를 미리 만들 필요가 없습니다. 결제 확인 후 신규 광고주를 준비합니다. 결제로 회사 접근 권한이 확대되지는 않습니다."}</p>
    {loaded&&!workspaces.length&&<a href="/onboarding">신규 가입 계정 준비하기</a>}</>}
    {paidUntil ? <div className={styles.notice}><strong>사용 가능한 테스트 이용권이 있습니다.</strong><p>이용기간 종료: {new Date(paidUntil).toLocaleString("ko-KR", {timeZone:"Asia/Seoul"})} KST</p><p>추가 결제 없이 리포트를 시작할 수 있습니다.</p><a className={styles.button} href="/report-builder">리포트 시작하기</a></div> : <>
    <label className={styles.consent}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy} />
      <span>표시된 이용 범위와 테스트 금액을 확인했습니다. {mode === "monthly" ? "카드 등록 후 첫 테스트 결제가 진행되며, 월 갱신 흐름과 다음 결제 해지를 테스트하는 데 동의합니다." : "자동 갱신되지 않는 1개월 이용권 테스트에 동의합니다."} 실제 요금은 청구되지 않습니다.</span></label>
    <button className={styles.button} disabled={busy || !loaded || !target || !consent || (target==="new"&&(!workspace||!name.trim()))}>{busy ? "결제창 준비 중…" : mode === "monthly" ? "카드 등록하고 테스트 결제" : "테스트 결제하기"}</button>
    </>}
    <p className={styles.error} role="status">{message}</p>
    {message && requestId.current ? <a href={`/billing/review/result?order=${requestId.current}`}>결제 결과 확인</a> : null}
  </form>;
}
