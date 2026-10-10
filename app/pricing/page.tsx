/* eslint-disable @next/next/no-html-link-for-pages -- Static links avoid client navigation/prefetch on this small review page. */
import type { Metadata } from "next";
import PublicSiteShell from "../PublicSiteShell";
import { plans, won, type Scope } from "@/lib/billing/catalog";
import styles from "./billing.module.css";
export const metadata: Metadata = { title: "요금제 | Etrylue Performance", robots: { index: false, follow: false } };
export default async function Pricing({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode === "monthly" ? "monthly" : "once";
  return <PublicSiteShell><div className={styles.container}>
    <p className={styles.eyebrow}>PRICING</p>
    <h1 className={styles.title}>필요한 범위만큼,<br />원하는 결제 방식으로.</h1>
    <p className={styles.intro}>광고주 한 곳부터 회사 전체까지.<br />필요한 범위의 1개월 이용권을 선택하세요.</p>
    <div className={styles.notice}>건별 1개월 이용권 요금입니다. 현재 결제 서비스 심사를 준비하고 있으며, 심사용 테스트 결제에서는 실제 요금이 청구되지 않습니다. 매월 자동결제는 일반결제 심사 후 추가 예정입니다.</div>
    <nav className={styles.toggle} aria-label="결제 방식">
      <a href="/pricing?mode=monthly" aria-current={mode === "monthly" ? "page" : undefined}>매월 자동결제 · 준비 중</a>
      <a href="/pricing?mode=once" aria-current={mode === "once" ? "page" : undefined}>건별 결제 · 1개월</a>
    </nav>
    <ol className={styles.steps} aria-label="구매 순서"><li>1. 요금제 선택</li><li>2. 로그인 · 회원가입</li><li>3. 이용 대상 · 결제</li><li>4. 리포트 시작</li></ol>
    <div className={styles.grid}>{(Object.keys(plans) as Scope[]).map(scope => <article key={scope} className={styles.card}>
      <h2>{plans[scope].name}</h2><p>{plans[scope].description}</p>
      <div className={styles.price}>{won(plans[scope][mode])}<span className={styles.unit}> / 1개월</span></div>
      <p>부가세 포함<br />{mode === "monthly" ? "출시 예정 요금 · 현재 신청 불가" : "한 번 결제 · 자동 갱신 없음"}</p>
      <a className={styles.button} href={`/billing/checkout?scope=${scope}&mode=${mode}`}>{mode === "once" ? "이 요금제로 시작하기" : "출시 예정 이용권 안내"}</a>
    </article>)}</div>
    <ul className={styles.details}>
      <li>건별 결제는 리포트 한 건의 가격이 아닌, 선택한 범위의 1개월 이용권입니다.</li>
      <li>회사 이용권은 해당 회사 소속 워크스페이스를 포함하며, 광고주 수는 전체 합산합니다.</li>
      <li>결제로 다른 회사·워크스페이스·광고주의 열람 권한이 추가되지는 않습니다.</li>
      <li>기존 고객의 리포트 이용·공유·자동 수집에는 변경이 없습니다.</li>
    </ul>
  </div></PublicSiteShell>;
}
