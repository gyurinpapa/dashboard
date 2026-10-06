/* eslint-disable @next/next/no-html-link-for-pages -- Static links avoid client navigation/prefetch on this small review page. */
import type { Metadata } from "next";
import PublicSiteShell from "../PublicSiteShell";
import { notFound } from "next/navigation";
import { plans, won, type Scope } from "@/lib/billing/catalog";
import styles from "./billing.module.css";
export const metadata: Metadata = { title: "요금제 검토 | Etrylue Performance", robots: { index: false, follow: false } };
export default async function Pricing({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const mode = (await searchParams).mode === "once" ? "once" : "monthly";
  return <PublicSiteShell><div className={styles.container}>
    <p className={styles.eyebrow}>PRICING PREVIEW</p>
    <h1 className={styles.title}>필요한 범위만큼,<br />원하는 결제 방식으로.</h1>
    <p className={styles.intro}>광고주 한 곳부터 회사 전체까지.<br />1개월 이용권과 매월 자동결제 중 선택하세요.</p>
    <div className={styles.notice}>검토용 요금제입니다. 현재는 테스트 환경에서만 결제를 확인하며, 실제 요금이 청구되지 않습니다. 아래 가격과 제공 한도는 운영 공개 전에 최종 확정합니다.</div>
    <nav className={styles.toggle} aria-label="결제 방식">
      <a href="/pricing?mode=monthly" aria-current={mode === "monthly" ? "page" : undefined}>매월 자동결제</a>
      <a href="/pricing?mode=once" aria-current={mode === "once" ? "page" : undefined}>건별 결제 · 1개월</a>
    </nav>
    <div className={styles.grid}>{(Object.keys(plans) as Scope[]).map(scope => <article key={scope} className={styles.card}>
      <h2>{plans[scope].name}</h2><p>{plans[scope].description}</p>
      <div className={styles.price}>{won(plans[scope][mode])}<span className={styles.unit}> / 1개월</span></div>
      <p>부가세 포함<br />{mode === "monthly" ? "매월 갱신 · 다음 결제 해지 가능" : "한 번 결제 · 자동 갱신 없음"}</p>
      <a className={styles.button} href={`/billing/checkout?scope=${scope}&mode=${mode}`}>이 범위 선택하기</a>
    </article>)}</div>
    <ul className={styles.details}>
      <li>건별 결제는 리포트 한 건의 가격이 아닌, 선택한 범위의 1개월 이용권입니다.</li>
      <li>회사 이용권은 해당 회사 소속 워크스페이스를 포함하며, 광고주 수는 전체 합산합니다.</li>
      <li>결제로 다른 회사·워크스페이스·광고주의 열람 권한이 추가되지는 않습니다.</li>
      <li>유료 이용 범위·환불 기준·기존 고객 전환 정책은 운영 오픈 전에 별도로 확정합니다.</li>
    </ul>
  </div></PublicSiteShell>;
}
