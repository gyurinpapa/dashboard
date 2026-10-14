/* eslint-disable @next/next/no-html-link-for-pages -- Explicit full navigation for isolated billing screens. */
import PublicSiteShell from "../../../PublicSiteShell";
import { actor, loadOrder, db, refundRequest } from "@/lib/billing/review/server";
import { refundAmount } from "@/lib/billing/refund-policy";
import { won } from "@/lib/billing/catalog";
import ManageButtons from "./ManageButtons";
import styles from "../../../pricing/billing.module.css";
import { isRegistrationOrder } from '@/lib/billing/review/registration-service';
import { registrationEnabled } from '@/lib/billing/review/registration-config';
import RegistrationResult from './RegistrationResult';
export const dynamic = "force-dynamic";
export const metadata = { title: "결제 결과 확인 | Etrylue", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Result({ searchParams }: { searchParams: Promise<{ order?: string; result?: string }> }) {
  const { order: id, result } = await searchParams;
  let order = null;
  try { order = await loadOrder(id, await actor()); } catch { /* Never leak another purchaser's order. */ }
  if(order&&isRegistrationOrder(order)&&registrationEnabled())return <RegistrationResult order={order}/>;
  const [refundState, draft] = order ? await Promise.all([
    refundRequest(order.id,order.user_id).then(data => ({data, unavailable:false})).catch(() => ({data:null, unavailable:true})),
    db().from("billing_test_purchase_drafts").select("order_id").eq("order_id",order.id).eq("user_id",order.user_id).maybeSingle(),
  ]) : [{data:null,unavailable:false},{data:null}];
  const refund = refundState.data, refundUnavailable = refundState.unavailable;
  const newAdvertiser = !!draft.data;
  // Server-only estimate; DB captures authoritative time/amount after the request lock.
  // eslint-disable-next-line react-hooks/purity
  const estimatedRefund = order && !refundUnavailable ? refund?.amount || refundAmount(order.amount,order.anchor_at,order.paid_until,Date.now()) : 0;
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
        {refund ? <div className={styles.row}><dt>환불 요청</dt><dd>{won(refund.amount)} · {refund.status === "completed" ? "환불 확인" : "처리 결과 확인 중"}</dd></div> : null}
      </dl>{refundUnavailable ? <p className={styles.notice}>환불 정보를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.</p> : null}<ManageButtons refundAmount={estimatedRefund} refundPending={refund?.status === "pending"} newAdvertiser={newAdvertiser} orderId={order.id} scope={order.scope} targetId={order.target_id} status={order.status} monthly={order.mode === "monthly"} paid={paid} cancelled={order.cancel_at_period_end} /></> : <p className={styles.notice}>주문을 확인하지 못했습니다. 구매한 계정으로 로그인했는지 확인해주세요. 이 화면만으로 결제 성공을 판단하지 않습니다.</p>}
      <p className={styles.details}>실제 요금은 청구되지 않습니다. 테스트 이용권을 환불하면 해당 이용권이 종료되며, 기존 광고주와 리포트는 자동 삭제되지 않습니다. 결제 오류가 발생하면 새로 구매하기 전에 기존 결제 결과를 먼저 확인해주세요.</p>
      {paid && !newAdvertiser ? <div className={styles.actions}><a className={styles.button} href={`/report-builder${order?.workspace_id ? `?workspace_id=${encodeURIComponent(order.workspace_id)}` : ""}`}>리포트 시작하기</a></div> : null}
      {order && !paid ? <div className={styles.actions}><a href={`/billing/checkout?scope=${order.scope}&mode=once`}>같은 상품 주문 화면으로 돌아가기</a></div> : null}
      <p className={styles.details}><a href="/refund">이용기간·환불정책</a> · 중복 결제 및 서비스 제공 불가 환불은 이메일로 문의해주세요.</p>
      <div className={styles.actions}><a href="/account">내 서비스 · 결제 내역</a><a href="/pricing">요금제로 돌아가기</a></div>
    </section>
  </div></PublicSiteShell>;
}
