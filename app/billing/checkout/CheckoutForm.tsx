"use client";
import { useEffect, useRef, useState } from "react";
import type { BillingMode, Scope } from "@/lib/billing/catalog";
import styles from "../../pricing/billing.module.css";
type PaymentRequest = { method: "CARD"; amount: { currency: "KRW"; value: number }; orderId: string; orderName: string; successUrl: string; failUrl: string };
type BillingRequest = { method: "CARD"; successUrl: string; failUrl: string };
declare global { interface Window { TossPayments?: (key: string) => { payment: (options: { customerKey: string }) => {
  requestPayment: (input: PaymentRequest) => Promise<void>;
  requestBillingAuth: (input: BillingRequest) => Promise<void>;
} }; } }
let sdk: Promise<void> | undefined;
function loadSdk() {
  if (window.TossPayments) return Promise.resolve();
  if (!sdk) sdk = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://js.tosspayments.com/v2/standard"; script.async = true;
    script.onload = () => window.TossPayments ? resolve() : reject(new Error("SDK_FAILED"));
    script.onerror = () => { script.remove(); sdk = undefined; reject(new Error("SDK_FAILED")); };
    document.head.appendChild(script);
  });
  return sdk;
}
export default function CheckoutForm({ scope, mode }: { scope: Scope; mode: BillingMode }) {
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]), [target, setTarget] = useState("");
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [loginRequired, setLoginRequired] = useState(false), [loaded, setLoaded] = useState(false);
  const requestId = useRef("");
  const submitting = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/billing/targets", { cache: "no-store", signal: abort.signal }).then(async response => {
      if (response.status === 401) { setLoginRequired(true); return; }
      if (!response.ok) throw new Error();
      const data = await response.json(); setOptions(data[scope] || []);
    }).catch(() => { if (!abort.signal.aborted) setMessage("결제 가능한 이용 대상을 확인하지 못했습니다. 테스트 계정과 설정을 확인해주세요."); })
      .finally(() => { if (!abort.signal.aborted) setLoaded(true); });
    return () => abort.abort();
  }, [scope]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !target || !consent) return;
    submitting.current = true; setBusy(true); setMessage("");
    try {
      // Keep one order ID across retries/tab reloads for this exact choice.
      const storageKey = `etrylue:test-checkout:${scope}:${mode}:${target}`;
      requestId.current = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, requestId.current);
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId.current, scope, mode, targetId: target, consent: true }) });
      if (!response.ok) throw new Error("ORDER_FAILED");
      const order = await response.json();
      await loadSdk();
      const payment = window.TossPayments!(order.clientKey).payment({ customerKey: order.customerKey });
      const redirect = { method: "CARD" as const, successUrl: order.successUrl, failUrl: order.failUrl };
      if (mode === "monthly") await payment.requestBillingAuth(redirect);
      else await payment.requestPayment({ ...redirect, amount: { currency: "KRW", value: order.amount }, orderId: order.orderId, orderName: order.orderName });
    } catch {
      setMessage("결제가 완료되지 않았거나 결과 확인이 필요합니다. 이미 인증했다면 결제 결과를 먼저 확인해주세요.");
    } finally { submitting.current = false; setBusy(false); }
  }
  const next = `/billing/checkout?scope=${scope}&mode=${mode}`;
  return <form onSubmit={submit}>
    {loginRequired ? <p className={styles.notice}><a href={`/login?next=${encodeURIComponent(next)}`}>테스트 계정으로 로그인</a>한 뒤 이용 대상을 선택해주세요.</p> : null}
    <label className={styles.label} htmlFor="billing-target">결제할 이용 대상</label>
    <select className={styles.select} id="billing-target" value={target} onChange={event => { setTarget(event.target.value); requestId.current = ""; }} disabled={!loaded || busy} required>
      <option value="">{loaded ? "대상을 선택해주세요" : "이용 대상 확인 중…"}</option>
      {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
    {loaded && !loginRequired && !options.length ? <p className={styles.details}>현재 테스트 계정에 결제 가능한 대상이 없습니다.</p> : null}
    <label className={styles.consent}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy} />
      <span>표시된 이용 범위와 테스트 금액을 확인했습니다. {mode === "monthly" ? "카드 등록 후 첫 테스트 결제가 진행되며, 월 갱신 흐름과 다음 결제 해지를 테스트하는 데 동의합니다." : "자동 갱신되지 않는 1개월 이용권 테스트에 동의합니다."} 실제 요금은 청구되지 않습니다.</span></label>
    <button className={styles.button} disabled={busy || !target || !consent}>{busy ? "결제창 준비 중…" : mode === "monthly" ? "카드 등록하고 테스트 결제" : "테스트 결제하기"}</button>
    <p className={styles.error} role="status">{message}</p>
    {message && requestId.current ? <a href={`/billing/result?order=${requestId.current}`}>결제 결과 확인</a> : null}
  </form>;
}
