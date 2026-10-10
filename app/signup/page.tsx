import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import PublicSiteShell from '../PublicSiteShell';
import SignupForm from './SignupForm';
import { onboardingOrigin } from '@/lib/customer-onboarding/contract';
import { purchaseNext } from '@/lib/customer-journey';
import styles from '../pricing/billing.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'회원가입 | Etrylue Performance',robots:{index:false,follow:false}};
export default async function Signup({searchParams}:{searchParams:Promise<{next?:string}>}) {
 const next=purchaseNext((await searchParams).next);
 let origin='';try{origin=onboardingOrigin();}catch{}
 if(origin&&(await headers()).get('host')!==new URL(origin).host)redirect(`${origin}/signup?next=${encodeURIComponent(next)}`);
 return <PublicSiteShell><div className={styles.container}><section className={styles.panel}>
 <p className={styles.eyebrow}>GET STARTED</p><h1>우리 회사 계정 만들기</h1>
 <p className={styles.intro}>광고주나 리포트가 없어도 시작할 수 있습니다. 이메일 인증 후 {next.startsWith('/billing/')?'선택한 요금제의 주문을 이어갑니다.':'요금제를 선택하고 첫 광고주를 등록하세요.'}</p>
 {origin?<SignupForm next={next}/>:<p className={styles.notice}>신규 가입을 준비하고 있습니다. 도입 문의는 <a href="mailto:etrylue3479@gmail.com">etrylue3479@gmail.com</a>으로 보내주세요.</p>}
 <p className={styles.details}>이미 계정이 있나요? <a href={`/login?next=${encodeURIComponent(next)}`}>로그인</a><br/>회사에서 초대받은 구성원은 전달받은 초대 링크를 이용해주세요.</p>
 </section></div></PublicSiteShell>;
}
