/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation preserves auth cookies and canonical host routing without prefetch. */
import { redirect } from 'next/navigation';
import { sbAuth } from '@/lib/supabase/auth-server';
import { actor, db } from '@/lib/billing/review/server';
import { won } from '@/lib/billing/catalog';
import PublicSiteShell from '../PublicSiteShell';
import styles from '../pricing/billing.module.css';
import {registrationEnabled,REGISTRATION_CATALOG} from '@/lib/billing/review/registration-config';
import {registrationAccess,type RegistrationRow} from '@/lib/billing/review/registration-store';
import {registrationUsable} from '@/lib/billing/registration-view';
export const dynamic='force-dynamic';
export const metadata={title:'내 서비스 | Etrylue Performance',robots:{index:false,follow:false}};
export default async function Account(){
 const {user}=await sbAuth();if(!user)redirect('/login?next=/account');
 const registration=registrationEnabled();
 let orders:{id:string;name:string;amount:number;status:string;paid_until:string|null;catalog_version?:string;target_id?:string}[]=[];let unavailable=false;
 let registrations:RegistrationRow[]=[];
 try {const id=await actor();const result=await db().from('billing_test_orders').select('id,name,amount,status,paid_until'+(registration?',catalog_version,target_id':'')).eq('user_id',id).order('created_at',{ascending:false}).limit(30);if(result.error)throw result.error;orders=result.data as unknown as typeof orders||[];
   const ids=orders.filter(o=>o.catalog_version===REGISTRATION_CATALOG).map(o=>o.target_id!).filter(Boolean);
   if(ids.length)registrations=await registrationAccess(ids);
 }catch{unavailable=true;}
 const now=new Date().toISOString();
 const registrationByOrder=new Map(registrations.map(r=>[r.order_id,r]));
 const activeOrders=orders.filter(o=>o.status==='active'&&(o.catalog_version===REGISTRATION_CATALOG
   ?!!registrations.find(r=>r.order_id===o.id&&registrationUsable(r,now))
   :!!o.paid_until&&Date.parse(o.paid_until)>Date.parse(now)));
 const waiting=orders.some(o=>o.catalog_version===REGISTRATION_CATALOG&&o.status==='active'&&registrationByOrder.get(o.id)?.payment_status==='verified'&&!registrationByOrder.get(o.id)?.workspace_id);
 function orderStatus(o:typeof orders[number]){
   if(o.catalog_version!==REGISTRATION_CATALOG)return o.status==='active'?'검증 완료':o.status==='refunded'?'취소 완료':'상태 확인 필요';
   const row=registrationByOrder.get(o.id);
   return row?.payment_status==='refunded'||o.status==='refunded'?'취소 완료':row?.payment_status==='refund_pending'?'환불 처리 중':
     row?.payment_status==='verified'&&o.status==='active'?!row.workspace_id?'워크스페이스 미등록 · 배정 대기':registrationUsable(row,now)?'이용 중':'이용기간 종료':'등록 결과 확인 필요';
 }
 return <PublicSiteShell><div className={styles.container}><p className={styles.eyebrow}>MY ETRYLUE</p><h1 className={styles.title}>내 서비스</h1>
 <p className={styles.intro}>{user.email} 계정으로 이용 중입니다.</p>
 <div className={styles.grid}><section className={styles.card}><h2>{registration&&unavailable?'이용권 상태 확인':activeOrders.length?"이용 중인 테스트 이용권":waiting?'관리자 배정 대기':"이용권 구매"}</h2><p>{registration&&unavailable?'이용권 상태를 확인하지 못했습니다. 이미 결제했다면 새로 구매하지 말고 결제 내역을 다시 확인해주세요.':activeOrders.length?`현재 유효한 이용권이 ${activeOrders.length}건 있습니다. 결제 내역에서 상세 내용을 확인할 수 있습니다.`:waiting?'구매한 신규 광고주가 미등록 상태입니다. 관리자 배정 완료 후 이용이 시작됩니다.':"처음 구매하신다면 요금제를 선택하세요. 기존 광고주가 없어도 신규 광고주로 시작할 수 있습니다."}</p><a className={styles.button} href={registration&&unavailable?'/account':activeOrders.length?"/report-builder":waiting?'/billing/registrations':"/pricing"}>{registration&&unavailable?'다시 확인':activeOrders.length?"리포트 시작하기":waiting?'미등록 광고주 확인':"요금제 선택"}</a></section>
 <section className={styles.card}><h2>리포트</h2><p>내 회사의 광고주와 리포트를 관리합니다.</p><a className={styles.button} href="/report-builder">리포트 시작하기</a></section>
 <section className={styles.card}><h2>계정 관리</h2><p>비밀번호를 잊었거나 변경이 필요한 경우 이메일로 재설정할 수 있습니다.</p><a className={styles.button} href="/reset-password">비밀번호 재설정</a></section>
 {registration?<section className={styles.card}><h2>워크스페이스 미등록 광고주</h2><p>구매한 신규 광고주와 관리자 배정 대기 상태를 확인합니다. 이용기간은 배정 완료일부터 시작합니다.</p><a className={styles.button} href='/billing/registrations'>미등록 광고주 확인</a></section>:null}</div>
 <section className={styles.panel} style={{marginTop:32}}><h2>결제 내역</h2><p className={styles.details}>현재는 테스트 결제 내역입니다. 실제 요금은 청구되지 않습니다.</p>
 {unavailable?<p className={styles.notice}>결제 내역을 불러오지 못했거나 테스트 이용 대상이 아닌 계정입니다. 이미 결제했다면 다시 구매하지 말고 문의해주세요.</p>:!orders.length?<p className={styles.notice}>아직 결제 내역이 없습니다. 요금제를 선택하고 첫 구매를 시작하세요.</p>:<ul>{orders.map(o=><li key={o.id} className={styles.row}><span>{o.name}<br/>{won(o.amount)} · {orderStatus(o)}</span><a href={`/billing/review/result?order=${o.id}`}>상세 · 취소</a></li>)}</ul>}
 </section></div></PublicSiteShell>;
}

