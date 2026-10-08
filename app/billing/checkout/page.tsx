import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import PublicSiteShell from "../../PublicSiteShell";
import { isMode, isScope, plans, quote, won } from "@/lib/billing/catalog";
import CheckoutForm from "./CheckoutForm";
import { providerKeys, reviewConfig } from "@/lib/billing/review/config";
import styles from "../../pricing/billing.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이용권 선택 | Etrylue", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Checkout({ searchParams }: { searchParams: Promise<{ scope?: string; mode?: string }> }) {
  const params = await searchParams;
  const scope = isScope(params.scope) ? params.scope : "advertiser", mode = isMode(params.mode) ? params.mode : "once";
  const q = quote(scope, mode);
  let enabled = false;
  try { providerKeys(mode); enabled = mode === "once"; } catch { /* Review stays off until separately configured. */ }
  if (enabled) {
    const origin = reviewConfig().origin;
    const host = (await headers()).get("host");
    if (host !== new URL(origin).host) redirect(`${origin}/billing/checkout?scope=${scope}&mode=once`);
  }
  return <PublicSiteShell><div className={styles.container}>
    <div className={styles.breadcrumb}><a href={`/pricing?mode=${mode}`}>← 요금제로 돌아가기</a></div>
    <section className={styles.panel}><p className={styles.eyebrow}>PLAN DETAILS</p><h1>{mode === "once" ? "주문 확인" : "출시 예정 이용권 안내"}</h1>
      <dl><div className={styles.row}><dt>이용 범위</dt><dd>{plans[scope].description}</dd></div>
        <div className={styles.row}><dt>결제 방식</dt><dd>{mode === "once" ? "건별 · 1개월 이용권" : "매월 자동결제"}</dd></div>
        <div className={styles.row}><dt>{mode === "once" ? "결제 금액" : "출시 예정 요금"}</dt><dd><strong>{won(q.amount)}</strong><br />부가세 포함</dd></div></dl>
      <div className={styles.notice}>{mode === "once" ? "기존 리포트 계정으로 진행하는 토스 테스트 결제입니다. 표시된 상품·금액으로 결제 흐름을 확인하며 실제 요금은 청구되지 않습니다. 운영 리포트 이용권은 발급되지 않습니다." : "매월 자동결제는 일반결제 심사 통과 후 추가 예정입니다. 현재 카드 등록과 구독 신청은 제공하지 않습니다."}</div>
      {enabled ? <CheckoutForm scope={scope} mode="once" /> : mode === "once" ? <p className={styles.details}>심사용 결제 환경을 준비하고 있습니다. 설정 완료 후 이 화면에서 결제창으로 이동할 수 있습니다.</p> : null}
      {mode === "once" ? <p className={styles.details}>이용기간은 결제 승인 시각부터 1개월이며, 자동 갱신되지 않습니다. 결제는 선택한 범위에 적용되며 기존 계정의 접근 권한을 확대하지 않습니다.</p> : null}
      <p className={styles.details}>기존 리포트 이용·공유·자동 수집에는 변경이 없습니다. <Link href="/report-builder" prefetch={false}>리포트로 돌아가기</Link></p>
    </section>
  </div></PublicSiteShell>;
}
