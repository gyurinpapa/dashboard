/* eslint-disable @next/next/no-html-link-for-pages -- Full auth navigation without prefetch. */
'use client';
import {useEffect,useState} from 'react';
import styles from './home.module.css';
type State='checking'|'signedIn'|'signedOut'|'unavailable';
function endpoint(){return ['www.etrylue.com','etrylue.com'].includes(window.location.hostname)?'https://app.etrylue.com/api/auth/site-session':'/api/auth/site-session';}
export default function HomeAccountLinks(){
 const [state,setState]=useState<State>('checking'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let disposed=false,inFlight=false,last=0;
  const abort=new AbortController();
  async function refresh(force=false){
   if(inFlight||(!force&&Date.now()-last<5000))return;
   inFlight=true;last=Date.now();
   try{const response=await fetch(endpoint(),{credentials:'include',cache:'no-store',signal:abort.signal});if(!response.ok)throw new Error();const data=await response.json();if(typeof data.signedIn!=='boolean')throw new Error();if(!disposed)setState(data.signedIn?'signedIn':'signedOut');}
   catch{if(!disposed)setState('unavailable');}finally{inFlight=false;}
  }
  void refresh();
  const focus=()=>{if(document.visibilityState==='visible')void refresh();};
  const restore=(event:PageTransitionEvent)=>{if(event.persisted){setState('checking');void refresh(true);}};
  window.addEventListener('focus',focus);window.addEventListener('pageshow',restore);
  return()=>{disposed=true;abort.abort();window.removeEventListener('focus',focus);window.removeEventListener('pageshow',restore);};
 },[]);
 async function logout(){
  if(busy)return;setBusy(true);setError('');
  try{const response=await fetch(endpoint(),{method:'POST',credentials:'include',cache:'no-store'});if(!response.ok)throw new Error();window.location.assign(['www.etrylue.com','app.etrylue.com','etrylue.com'].includes(window.location.hostname)?'https://www.etrylue.com/':'/');}
  catch{setError('로그아웃 실패 · 다시 시도');setBusy(false);}
 }
 const primary=[styles.button,styles.buttonPrimary,styles.navButton].join(' ');
 return <div className={styles.accountLinks} aria-live="polite">
 {state==='checking'?<span>계정 확인 중…</span>:state==='signedIn'?<><a href="/account">결제 관리</a><a className={primary} href="/account">내 서비스</a><button className={styles.accountLogout} onClick={()=>void logout()} disabled={busy}>{busy?'처리 중…':'로그아웃'}</button></>:state==='signedOut'?<><a href="/login">로그인</a><a className={primary} href="/signup">회원가입</a></>:<a href="/account">계정 확인 · 내 서비스</a>}
 {error&&<span role="alert">{error}</span>}
 </div>;
}
