/* eslint-disable @next/next/no-html-link-for-pages -- Preserve canonical auth host navigation. */
import {notFound,redirect} from 'next/navigation';
import PublicSiteShell from '../../PublicSiteShell';
import {actor} from '@/lib/billing/review/server';
import {registrationEnabled} from '@/lib/billing/review/registration-config';
import {registrationRpc,type RegistrationRow} from '@/lib/billing/review/registration-store';
import {BillingError,uuid} from '@/lib/billing/review/config';
import {won} from '@/lib/billing/catalog';
import AssignForm from './AssignForm';
import styles from '../../pricing/billing.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'미등록 광고주 | Etrylue Performance',robots:{index:false,follow:false}};
export default async function Registrations({searchParams}:{searchParams:Promise<{before?:string;cursor?:string}>}){
  if(!registrationEnabled())notFound();
  let userId:string;
  try{userId=await actor();}catch(error){if(error instanceof BillingError&&error.code==='LOGIN_REQUIRED')redirect('/login?next=/billing/registrations');throw error;}
  const params=await searchParams;
  let rows:(RegistrationRow&{destinations:{id:string;name:string}[]})[]=[];let unavailable=false;
  try{
    if((params.before&&!Number.isFinite(Date.parse(params.before)))||(params.cursor&&!uuid(params.cursor)))throw new Error('INVALID_PAGE');
    rows=await registrationRpc('etrylue_registration_list',{p_actor:userId,p_before:params.before||null,p_cursor:params.cursor||null,p_limit:30});
  }catch{unavailable=true;}
  const last=rows[rows.length-1];
  return <PublicSiteShell><div className={styles.container}><p className={styles.eyebrow}>PENDING ADVERTISERS · TEST</p><h1 className={styles.title}>워크스페이스 미등록 광고주</h1>
    <p className={styles.intro}>결제 확인 후 관리자 배정을 기다리는 광고주입니다. 배정 전에는 리포트를 이용할 수 없으며 이용기간도 차감되지 않습니다.</p>
    {unavailable?<p className={styles.notice}>목록을 확인하지 못했습니다. 미등록 광고주가 없다는 뜻은 아닙니다. 잠시 후 다시 확인해주세요.</p>:!rows.length?<p className={styles.notice}>현재 계정에서 확인할 수 있는 미등록 광고주가 없습니다.</p>:rows.map(r=><section key={r.order_id} className={styles.panel} style={{marginBottom:20}}><h2>{r.name}</h2><p>{won(r.amount)} · {r.payment_status==='verified'?'결제 확인 · 관리자 배정 대기':r.payment_status==='refunded'?'환불 확인':r.payment_status==='refund_pending'?'환불 처리 중':'결제 상태 확인 필요'}</p>
      {r.payment_status==='verified'?<AssignForm orderId={r.order_id} destinations={r.destinations||[]}/>:null}
      {r.buyer_id===userId?<a href={`/billing/review/result?order=${r.order_id}`}>결제 내역 · 환불 확인</a>:null}</section>)}
    {last&&rows.length===30?<a href={`/billing/registrations?before=${encodeURIComponent(last.created_at)}&cursor=${last.order_id}`}>다음 미등록 광고주</a>:null}
    <p><a href='/account'>내 서비스</a> · <a href='/pricing'>요금제</a></p></div></PublicSiteShell>;
}
