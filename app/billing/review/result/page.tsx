/* eslint-disable @next/next/no-html-link-for-pages -- Explicit full navigation for isolated billing screens. */
import PublicSiteShell from "../../../PublicSiteShell";
import { actor, loadOrder } from "@/lib/billing/review/server";
import { won } from "@/lib/billing/catalog";
import ManageButtons from "./ManageButtons";
import styles from "../../../pricing/billing.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "결제 결과 확인 | Etrylue", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Result({ searchParams }: { searchParams: Promise<{ order?: string; result?: string }> }) {
  const { order: id, result } = await searchParams;
  let order = null;
  try { order = await loadOrder(id, await actor()); } catch { /* Never leak another purchaser's order. */ }
  // This uncached server component evaluates the entitlement at request time, never in client render.
  // eslint-disable-next-line react-hooks/purity
  const paid = order?.status === "active" && !!order.paid_until && Date.parse(order.paid_until) > Date.now();
  return <PublicSiteShell><div className={styles.container}>
    <section className={styles.panel}><p className={styles.eyebrow}>TEST PAYMENT</p>
      <h1>{paid ? "테스트 결제가 확인되었습니다" : "결제 상태 확인"}</h1>
      {result === "interrupted" && !paid ? <p className={styles.notice}>결제창에서 절차가 중단되었습니다. 결제가 완료된 상태는 아닙니다. 같은 상품의 주문 화면으로 돌아가 다시 진행할 수 있습니다.</p> : null}
      {order ? <><dl>
        <div className={styles.row}><dt>상품</dt><dd>{order.name}</dd></div>
        <div className={styles.row}><dt>금액</dt><dd>{won(order.amount)} · 부가세 포함</dd></div>
        <div className={styles.row}><dt>상태</dt><dd>{paid ? "결제 검증 완료" : order.status === "refunded" ? "취소·환불 확인" : "결과 확인 필요"}</dd></div>
        {order.paid_until ? <div className={styles.row}><dt>테스트 이용기간 종료</dt><dd>{new Date(order.paid_until).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</dd></div> : null}
        {order.mode === "monthly" ? <div className={styles.row}><dt>다음 갱신</dt><dd>{order.cancel_at_period_end ? "해지됨" : "자동 스케줄 미연결 · 테스트 대기"}</dd></div> : null}
      </dl><ManageButtons orderId={order.id} scope={order.scope} targetId={order.target_id} status={order.status} monthly={order.mode === "monthly"} paid={paid} cancelled={order.cancel_at_period_end} /></> : <p className={styles.notice}>주문을 확인하지 못했습니다. 결제한 테스트 계정으로 로그인했는지 확인해주세요. 이 화면만으로 결제 성공을 판단하지 않습니다.</p>}
      <p className={styles.details}>실제 청구와 기존 리포트 권한 변경은 없습니다. 결제 오류가 발생하면 새로 구매하기 전에 기존 결제 결과를 먼저 확인해주세요.</p>
      {order ? <div className={styles.actions}><a href={`/billing/checkout?scope=${order.scope}&mode=once`}>같은 상품 주문 화면으로 돌아가기</a></div> : null}
      <div className={styles.actions}><a href="/pricing">요금제로 돌아가기</a></div>
    </section>
  </div></PublicSiteShell>;
}
