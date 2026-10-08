import PublicSiteShell from "../../../PublicSiteShell";
import { reviewConfig } from "@/lib/billing/review/config";
import { isScope } from "@/lib/billing/catalog";
import styles from "../../../pricing/billing.module.css";
import LoginForm from "./LoginForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "심사용 로그인 | Etrylue", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  let scope = "advertiser";
  try { const target = new URL(params.next || "", "https://www.etrylue.com");
    if (target.pathname === "/billing/checkout" && isScope(target.searchParams.get("scope"))) scope = target.searchParams.get("scope")!;
  } catch { /* Fixed local destination below; no open redirects. */ }
  let enabled = false;
  try { reviewConfig(); enabled = true; } catch { /* Fail closed without setup. */ }
  return <PublicSiteShell><div className={styles.container}><section className={styles.panel}>
    <p className={styles.eyebrow}>PAYMENT REVIEW</p><h1>심사용 로그인</h1>
    <p className={styles.notice}>계약 담당자에게 제공한 심사용 계정으로 결제 경로를 확인할 수 있습니다. 실제 요금은 청구되지 않으며, 운영 리포트 계정과 별도로 관리됩니다.</p>
    {enabled ? <LoginForm next={`/billing/checkout?scope=${scope}&mode=once`} /> : <p className={styles.details}>심사용 결제 환경을 준비하고 있습니다. 문의: <a href="mailto:etrylue3479@gmail.com">etrylue3479@gmail.com</a></p>}
  </section></div></PublicSiteShell>;
}
