/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation preserves auth cookies and canonical host routing without prefetch. */
'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { safeNext } from '@/lib/customer-journey';
import styles from '../pricing/billing.module.css';
export default function LoginForm() {
  const query=useSearchParams(), next=safeNext(query.get('next'));
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function login(magic=false) {
    if(busy)return;
    const address=email.trim().toLowerCase();
    if(!address.includes('@')) {setError('이메일 주소를 확인해주세요.');return;}
    if(!magic&&!password) {setError('비밀번호를 입력해주세요.');return;}
    setBusy(true);setError('');setMessage('');
    try {
      const result=magic?await supabase.auth.signInWithOtp({email:address,options:{shouldCreateUser:false,emailRedirectTo:`${window.location.origin}${next}`}}):await supabase.auth.signInWithPassword({email:address,password});
      if(result.error) throw new Error(magic?'로그인 메일을 보내지 못했습니다. 가입한 이메일인지 확인하고 잠시 후 다시 시도해주세요.':'이메일 또는 비밀번호를 확인해주세요. 비밀번호를 잊었다면 아래에서 재설정할 수 있습니다.');
      if(magic) setMessage('로그인 링크를 보냈습니다. 메일함과 스팸함을 확인해주세요.');
      else window.location.assign(next);
    } catch(e) {setError(e instanceof Error?e.message:'연결을 확인해주세요.');} finally {setBusy(false);}
  }
  return <section className={styles.panel}><p className={styles.eyebrow}>WELCOME BACK</p><h1>로그인</h1>
    <p className={styles.intro}>{next.startsWith('/billing/checkout')?'선택한 요금제가 준비되어 있습니다. 로그인하면 주문을 이어갑니다.':next.startsWith('/invite/')?'초대받은 이메일로 로그인하면 초대 수락 화면으로 돌아갑니다.':'우리 회사의 이용권과 리포트를 한곳에서 관리하세요.'}</p>
    <form onSubmit={e=>{e.preventDefault();void login();}}>
      <label className={styles.label} htmlFor="email">이메일</label><input className={styles.select} id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" required />
      <label className={styles.label} htmlFor="password">비밀번호</label><div style={{position:'relative'}}><input className={styles.select} style={{paddingRight:80}} id="password" type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" autoCapitalize="none" spellCheck={false} required />
      <button type="button" aria-controls="password" aria-label={showPassword?'비밀번호 숨기기':'비밀번호 보기'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)} style={{position:'absolute',right:4,top:2,bottom:2,minWidth:64,background:'transparent',border:0,color:'var(--text)',font:'inherit',fontSize:13,cursor:'pointer'}}>{showPassword?'숨기기':'보기'}</button></div>
      {error&&<p className={styles.error} role="alert">{error}</p>}{message&&<p className={styles.notice} role="status">{message}</p>}
      <div className={styles.actions}><button className={styles.button} disabled={busy}>{busy?'처리 중…':'로그인하고 계속하기'}</button><button type="button" className={styles.button} disabled={busy} onClick={()=>void login(true)}>이메일로 로그인</button></div>
    </form>
    <p className={styles.details}><a href="/reset-password">비밀번호 재설정</a> · <a href={`/signup?next=${encodeURIComponent(next)}`}>처음이신가요? 회원가입</a></p>
  </section>;
}
