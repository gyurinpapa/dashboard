'use client';
import { useState, type FormEvent } from 'react';
import styles from '../pricing/billing.module.css';
export default function SignupForm() {
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy)return;
    const form=new FormData(event.currentTarget);
    setBusy(true);setError('');setMessage('');
    try {
      const response=await fetch('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(Object.fromEntries(['email','password','contactName','companyName','tenantType'].map(k=>[k,form.get(k)])))});
      const result=await response.json();
      if(!response.ok) {
        const messages:Record<string,string>={TOO_MANY_ATTEMPTS:'요청이 많습니다. 잠시 후 다시 시도해주세요.',
          EMAIL_SEND_FAILED:'인증 메일을 보내지 못했습니다. 잠시 후 같은 정보로 다시 요청해주세요.',
          INVALID_PASSWORD:'비밀번호는 12~128자로 입력해주세요.',INVALID_EMAIL:'이메일 주소를 확인해주세요.',
          DIRECT_SIGNUP_DISABLED:'회원가입을 준비 중입니다. 잠시 후 다시 방문해주세요.'};
        throw new Error(messages[result.error]||'가입 요청을 처리하지 못했습니다. 입력 정보를 확인하고 다시 시도해주세요.');
      }
      setMessage(result.message);
    } catch(e) {setError(e instanceof Error?e.message:'연결을 확인하고 다시 시도해주세요.');}
    finally {setBusy(false);}
  }
  return <form onSubmit={submit}>
    <label className={styles.label} htmlFor="companyName">회사명</label><input className={styles.select} id="companyName" name="companyName" maxLength={100} autoComplete="organization" required />
    <label className={styles.label} htmlFor="tenantType">회사 유형</label><select className={styles.select} id="tenantType" name="tenantType" required><option value="agency">광고 대행사</option><option value="advertiser">광고주 · 인하우스</option></select>
    <label className={styles.label} htmlFor="contactName">이름</label><input className={styles.select} id="contactName" name="contactName" maxLength={80} autoComplete="name" required />
    <label className={styles.label} htmlFor="email">이메일</label><input className={styles.select} id="email" name="email" type="email" maxLength={254} autoComplete="email" required />
    <label className={styles.label} htmlFor="password">비밀번호 · 12자 이상</label><input className={styles.select} id="password" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
    <p className={styles.details}><a href="/privacy">개인정보 처리방침</a> · <a href="/terms">이용약관</a></p>
    {error&&<p className={styles.error} role="alert">{error}</p>}{message&&<p className={styles.notice} role="status">{message}</p>}
    <div className={styles.actions}><button className={styles.button} disabled={busy} type="submit">{busy?'인증 메일 요청 중…':'인증 메일 받기'}</button></div>
    {message&&<p className={styles.details}>메일의 인증 링크를 연 뒤 계정 준비를 완료해주세요. 이미 인증했다면 <a href="/login?next=/onboarding">로그인 후 계속하기</a>를 이용하세요.</p>}
  </form>;
}
