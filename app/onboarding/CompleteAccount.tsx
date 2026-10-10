/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation preserves auth cookies and canonical host routing without prefetch. */
'use client';
import {useState} from 'react';
import { purchaseNext } from '@/lib/customer-journey';
import {supabase} from '@/src/lib/supabase/client';
import styles from '../pricing/billing.module.css';
export default function CompleteAccount() {
  const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(''),[next,setNext]=useState('/account');
  async function complete() {
    if(busy)return; setBusy(true);setError('');
    try {
      const {data,error:sessionError}=await supabase.auth.getSession();
      if(sessionError||!data.session) throw new Error('이메일 인증 후 로그인해주세요. 아래 로그인 링크에서 이어갈 수 있습니다.');
      const response=await fetch('/api/auth/onboarding',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`}});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error==='EXISTING_ACCOUNT'?'기존 계정입니다. 리포트 화면에서 계속 이용해주세요.':result.error==='EMAIL_UNVERIFIED'?'이메일 인증을 먼저 완료해주세요.':'계정 준비를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
      const verified=await supabase.auth.getUser();
      setNext(purchaseNext(verified.data.user?.app_metadata?.purchase_next));
      setDone(true);
    } catch(e) {setError(e instanceof Error?e.message:'연결을 확인하고 다시 시도해주세요.');} finally {setBusy(false);}
  }
  return <><div aria-live="polite">{done?<p className={styles.notice}>회사 전용 워크스페이스가 준비되었습니다.</p>:null}</div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}>
      {!done&&<button className={styles.button} disabled={busy} onClick={complete}>{busy?'계정 준비 중…':'계정 준비 완료하기'}</button>}
      {done?<a className={styles.button} href={next}>{next.startsWith('/billing/')?'선택한 요금제로 계속하기':'내 서비스로 이동'}</a>:<a href="/login?next=/onboarding">로그인 후 계속하기</a>}
    </div></>;
}
