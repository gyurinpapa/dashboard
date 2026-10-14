import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import PublicSiteShell from "../../PublicSiteShell";
import { isMode, isScope, plans, quote, won } from "@/lib/billing/catalog";
import CheckoutForm from "./CheckoutForm";
import { providerKeys, reviewConfig } from "@/lib/billing/review/config";
import styles from "../../pricing/billing.module.css";
import { registrationEnabled } from '@/lib/billing/review/registration-config';
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이용권 선택 | Etrylue", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Checkout({ searchParams }: { searchParams: Promise<{ scope?: string; mode?: string }> }) {
  const params = await searchParams;
  const scope = isScope(params.scope) ? params.scope : "advertiser", mode = isMode(params.mode) ? params.mode : "once";
  const q = quote(scope, mode);
  const registration=registrationEnabled()&&scope==='advertiser';
  let enabled = false;
  try { providerKeys(mode); enabled = mode === "once"; } catch { /* Review stays off until separately configured. */ }
  if (enabled) {
    const origin = reviewConfig().origin;
    const host = (await headers()).get("host");
    if (host !== new URL(origin).host) redirect(`${origin}/billing/checkout?scope=${scope}&mode=once`);
  }
  return <PublicSiteShell><div className={styles.container}>
    <div className={styles.breadcrumb}><a href={`/pricing?mode=${mode}`}>← 요금제로 돌아가기</a></div>
    <ol className={styles.steps} aria-label="구매 순서"><li>1. 요금제 선택</li><li>2. 로그인 · 회원가입</li><li aria-current="step">3. 이용 대상 · 결제</li><li>{registration?'4. 관리자 배정 · 이용 시작':'4. 리포트 시작'}</li></ol>
    <section className={styles.panel}><p className={styles.eyebrow}>PLAN DETAILS</p><h1>{mode === "once" ? "주문 확인" : "출시 예정 이용권 안내"}</h1>
      <dl><div className={styles.row}><dt>이용 범위</dt><dd>{plans[scope].description}</dd></div>
        <div className={styles.row}><dt>결제 방식</dt><dd>{mode === "once" ? "건별 · 1개월 이용권" : "매월 자동결제"}</dd></div>
        <div className={styles.row}><dt>{mode === "once" ? "결제 금액" : "출시 예정 요금"}</dt><dd><strong>{won(q.amount)}</strong><br />부가세 포함</dd></div></dl>
      <div className={styles.notice}>{registration?'현재는 분리된 토스 테스트 결제입니다. 실제 요금은 청구되지 않습니다. 신규 광고주는 이름만 입력하여 구매하고, 관리자 배정 전까지 미등록 상태로 보관합니다.':mode === "once" ? "현재는 토스 테스트 결제입니다. 실제 요금은 청구되지 않습니다. 신규 광고주 구매 흐름이 열린 환경에서는 결제 확인 후 광고주를 만들고 테스트 이용권으로 리포트 생성을 확인할 수 있습니다. 정식 유료 이용권은 발급되지 않습니다." : "매월 자동결제는 일반결제 심사 통과 후 추가 예정입니다. 현재 카드 등록과 구독 신청은 제공하지 않습니다."}</div>
      {enabled ? <CheckoutForm scope={scope} mode="once" registration={registration} /> : mode === "once" ? <p className={styles.details}>심사용 결제 환경을 준비하고 있습니다. 설정 완료 후 이 화면에서 결제창으로 이동할 수 있습니다.</p> : null}
      {mode === "once" ? <p className={styles.details}>{registration?'신규 광고주는 관리자 배정 완료일부터 1개월, 기존 이용 대상은 결제 승인일부터 1개월입니다.':'이용기간은 결제 승인 시각부터 1개월입니다.'} 자동 갱신되지 않으며 기존 계정의 접근 권한을 확대하지 않습니다.</p> : null}
      <p className={styles.details}>기존 리포트 이용·공유·자동 수집에는 변경이 없습니다. <Link href="/report-builder" prefetch={false}>리포트로 돌아가기</Link></p>
    </section>
  </div></PublicSiteShell>;
}
