/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation preserves auth cookies and canonical host routing without prefetch. */
import { redirect } from 'next/navigation';
import { sbAuth } from '@/lib/supabase/auth-server';
import { actor, db } from '@/lib/billing/review/server';
import { won } from '@/lib/billing/catalog';
import PublicSiteShell from '../PublicSiteShell';
import styles from '../pricing/billing.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'내 서비스 | Etrylue Performance',robots:{index:false,follow:false}};
export default async function Account(){
 const {user}=await sbAuth();if(!user)redirect('/login?next=/account');
 let orders:{id:string;name:string;amount:number;status:string}[]=[];let unavailable=false;
 try {const id=await actor();const result=await db().from('billing_test_orders').select('id,name,amount,status').eq('user_id',id).order('created_at',{ascending:false}).limit(30);if(result.error)throw result.error;orders=result.data||[];}catch{unavailable=true;}
 return <PublicSiteShell signedIn><div className={styles.container}><p className={styles.eyebrow}>MY ETRYLUE</p><h1 className={styles.title}>내 서비스</h1>
 <p className={styles.intro}>{user.email} 계정으로 이용 중입니다.</p>
 <div className={styles.grid}><section className={styles.card}><h2>이용권 구매</h2><p>처음 구매하신다면 요금제를 선택하세요. 기존 광고주가 없어도 신규 광고주로 시작할 수 있습니다.</p><a className={styles.button} href="/pricing">요금제 선택</a></section>
 <section className={styles.card}><h2>리포트</h2><p>내 회사의 광고주와 리포트를 관리합니다.</p><a className={styles.button} href="/report-builder">리포트 시작하기</a></section>
 <section className={styles.card}><h2>계정 관리</h2><p>비밀번호를 잊었거나 변경이 필요한 경우 이메일로 재설정할 수 있습니다.</p><a className={styles.button} href="/reset-password">비밀번호 재설정</a></section></div>
 <section className={styles.panel} style={{marginTop:32}}><h2>결제 내역</h2><p className={styles.details}>현재는 테스트 결제 내역입니다. 실제 요금은 청구되지 않습니다.</p>
 {unavailable?<p className={styles.notice}>결제 내역을 불러오지 못했거나 테스트 이용 대상이 아닌 계정입니다. 이미 결제했다면 다시 구매하지 말고 문의해주세요.</p>:!orders.length?<p className={styles.notice}>아직 결제 내역이 없습니다. 요금제를 선택하고 첫 구매를 시작하세요.</p>:<ul>{orders.map(o=><li key={o.id} className={styles.row}><span>{o.name}<br/>{won(o.amount)} · {o.status==='active'?'검증 완료':o.status==='refunded'?'취소 완료':'상태 확인 필요'}</span><a href={`/billing/review/result?order=${o.id}`}>상세 · 취소</a></li>)}</ul>}
 </section></div></PublicSiteShell>;
}
