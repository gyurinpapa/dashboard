import PublicSiteShell from '../PublicSiteShell';
import { onboardingOrigin } from '@/lib/customer-onboarding/contract';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import CompleteAccount from './CompleteAccount';
import styles from '../pricing/billing.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'계정 준비 | Etrylue Performance',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function OnboardingPage() {
  let origin=''; try {origin=onboardingOrigin();} catch {redirect('/signup');}
  if((await headers()).get('host')!==new URL(origin).host) redirect(`${origin}/onboarding`);
  return <PublicSiteShell><div className={styles.container}><section className={styles.panel}><h1>회사 계정 준비</h1>
    <p className={styles.intro}>이메일 인증을 마쳤다면 아래 버튼으로 회사 전용 워크스페이스를 준비해주세요.</p><CompleteAccount />
  </section></div></PublicSiteShell>;
}
