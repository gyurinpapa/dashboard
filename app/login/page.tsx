import {sbAuth} from '@/lib/supabase/auth-server';
import {safeNext} from '@/lib/customer-journey';
import {redirect} from 'next/navigation';
import {Suspense} from 'react';
import PublicSiteShell from '../PublicSiteShell';
import LoginForm from './LoginForm';
import styles from '../pricing/billing.module.css';
export const metadata={title:'로그인 | Etrylue Performance',robots:{index:false,follow:false}};
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){const {user}=await sbAuth();if(user)redirect(safeNext((await searchParams).next));return <PublicSiteShell><div className={styles.container}><Suspense fallback={<p>로그인 화면을 준비하고 있습니다.</p>}><LoginForm /></Suspense></div></PublicSiteShell>;}
