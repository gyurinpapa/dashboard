/* eslint-disable @next/next/no-html-link-for-pages -- Explicit canonical-host navigation. */
import PublicSiteShell from '../../../PublicSiteShell';
import type {Order} from '@/lib/billing/review/server';
import {registrationGet,type RegistrationRow} from '@/lib/billing/review/registration-store';
import {registrationRefundEstimate,registrationUsable} from '@/lib/billing/registration-view';
import {won} from '@/lib/billing/catalog';
import ManageButtons from './ManageButtons';
import styles from '../../../pricing/billing.module.css';
export default async function RegistrationResult({order}:{order:Order}){
  let registered:RegistrationRow|null=null;
  try{registered=await registrationGet(order.id,order.user_id);}catch{/* Never substitute the payment ledger's old approval-based period. */}
  const now=new Date().toISOString();
  const paid=!!registered&&order.status==='active'&&registrationUsable(registered,now);
  const waiting=!!registered&&order.status==='active'&&registered.payment_status==='verified'&&!registered.workspace_id;
  const cancelled=registered?.payment_status==='refunded'||order.status==='refunded';
  const estimate=registered?registrationRefundEstimate(registered,now):0;
  const label=cancelled?'환불 확인':waiting?'결제 확인 · 관리자 배정 대기':paid?'이용 중':registered?.payment_status==='refund_pending'?'환불 처리 중':'상태 확인 필요';
  return <PublicSiteShell><div className={styles.container}><section className={styles.panel}><p className={styles.eyebrow}>TEST PAYMENT</p><h1>{label}</h1>
    <dl><div className={styles.row}><dt>상품</dt><dd>{order.name}</dd></div><div className={styles.row}><dt>테스트 금액</dt><dd>{won(order.amount)} · 부가세 포함</dd></div>
      <div className={styles.row}><dt>신규 광고주</dt><dd>{registered?.name||'결제 확인 후 등록'}</dd></div><div className={styles.row}><dt>상태</dt><dd>{label}</dd></div>
      <div className={styles.row}><dt>워크스페이스</dt><dd>{registered?.workspace_id?'관리자 배정 완료':'미등록'}</dd></div>
      {registered?.started_at?<div className={styles.row}><dt>이용 시작</dt><dd>{new Date(registered.started_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</dd></div>:null}
      {registered?.paid_until?<div className={styles.row}><dt>이용 종료</dt><dd>{new Date(registered.paid_until).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</dd></div>:null}</dl>
    {waiting?<p className={styles.notice}>신규 광고주가 워크스페이스 미등록 상태로 등록되었습니다. 관리자 배정 전에는 리포트를 이용할 수 없으며 이용기간도 차감되지 않습니다. 배정 완료일부터 1개월 이용이 시작됩니다.</p>:null}
    {!registered?<p className={styles.notice}>등록 결과를 아직 확인하지 못했습니다. 결제가 실패했다는 뜻은 아닙니다. 새로 결제하지 말고 ‘결제 상태 재확인’을 눌러주세요.</p>:null}
    <ManageButtons orderId={order.id} status={cancelled?'refunded':order.status} scope={order.scope} targetId={order.target_id} monthly={false} paid={paid} cancelled={!!cancelled}
      refundAmount={estimate} refundPending={registered?.payment_status==='refund_pending'} awaitingAssignment={waiting}/>
    {paid&&registered?.workspace_id?<a className={styles.button} href={`/report-builder?workspace_id=${registered.workspace_id}`}>리포트 시작하기</a>:null}
    <p className={styles.details}>이 흐름은 분리된 테스트입니다. 실제 요금은 청구되지 않습니다. 배정 전 환불은 전액이며, 배정 후에는 결제 승인일부터 168시간의 전액 환불 보장과 남은 실제 이용기간에 따른 환불 기준을 적용합니다. 환불만으로 광고주·기존 리포트는 삭제되지 않습니다.</p>
    <p><a href='/billing/registrations'>미등록 광고주 확인</a> · <a href='/account'>내 서비스</a> · <a href='/refund'>환불정책</a></p></section></div></PublicSiteShell>;
}
