import type { Metadata } from "next";
import PublicSiteShell from "../../PublicSiteShell";
import { isMode, isScope, plans, quote, won } from "@/lib/billing/catalog";
import styles from "../../pricing/billing.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이용권 선택 | Etrylue", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Checkout({ searchParams }: { searchParams: Promise<{ scope?: string; mode?: string }> }) {
  const params = await searchParams;
  const scope = isScope(params.scope) ? params.scope : "advertiser", mode = isMode(params.mode) ? params.mode : "monthly";
  const q = quote(scope, mode);
  return <PublicSiteShell><div className={styles.container}>
    <div className={styles.breadcrumb}><a href={`/pricing?mode=${mode}`}>← 요금제로 돌아가기</a></div>
    <section className={styles.panel}><p className={styles.eyebrow}>PLAN DETAILS</p><h1>이용권 안내</h1>
      <dl><div className={styles.row}><dt>이용 범위</dt><dd>{plans[scope].description}</dd></div>
        <div className={styles.row}><dt>결제 방식</dt><dd>{mode === "once" ? "건별 · 1개월 이용권" : "매월 자동결제"}</dd></div>
        <div className={styles.row}><dt>출시 예정 요금</dt><dd><strong>{won(q.amount)}</strong><br />부가세 포함</dd></div></dl>
      <div className={styles.notice}>결제 서비스 오픈 준비 중입니다. 표시된 가격과 제공 범위는 출시 예정안이며, 현재 실제 결제는 진행되지 않습니다.</div>
      <p className={styles.details}>기존 리포트 이용·공유·자동 수집에는 변경이 없습니다.</p>
    </section>
  </div></PublicSiteShell>;
}
