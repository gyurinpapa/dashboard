// app/signup/page.tsx
import Link from "next/link";
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import PublicSiteShell from '../PublicSiteShell';
import SignupForm from './SignupForm';
import { onboardingOrigin } from '@/lib/customer-onboarding/contract';
import styles from '../pricing/billing.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: '회원가입 | Etrylue Performance', robots: {index:false,follow:false}, referrer:'no-referrer' as const };
export default async function SignupPage() {
  let origin: string;
  try { origin=onboardingOrigin(); } catch { return <InviteOnlyPage />; }
  if ((await headers()).get('host')!==new URL(origin).host) redirect(`${origin}/signup`);
  return <PublicSiteShell><div className={styles.container}><section className={styles.panel}>
    <h1>우리 회사 계정 만들기</h1><p className={styles.intro}>이메일 인증 후 회사 전용 워크스페이스를 준비합니다.</p>
    <SignupForm /><p className={styles.details}>초대받은 구성원은 전달받은 초대 링크로 가입해주세요. <Link href="/login">기존 계정으로 로그인</Link></p>
  </section></div></PublicSiteShell>;
}

function InviteOnlyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f3f4f6",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 520,
          padding: 32,
          borderRadius: 20,
          background: "#ffffff",
          boxShadow: "0 12px 36px rgba(15, 23, 42, 0.08)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: "#111827",
          }}
        >
          Etrylue Performance
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 20,
            fontWeight: 800,
            color: "#111827",
          }}
        >
          초대 전용 회원가입
        </div>

        <p
          style={{
            margin: "14px 0 0",
            fontSize: 14,
            lineHeight: 1.7,
            color: "#6b7280",
          }}
        >
          Etrylue Performance의 회원가입은 관리자에게 발급받은 초대 링크를
          통해서만 가능합니다.
        </p>

        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            lineHeight: 1.7,
            color: "#6b7280",
          }}
        >
          초대 링크를 받으셨다면 해당 링크를 열어 가입을 진행해주세요.
        </p>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Link
            href="/login"
            style={{
              display: "block",
              padding: "12px 16px",
              borderRadius: 12,
              background: "#111827",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            로그인으로 이동
          </Link>

          <Link
            href="/report-builder"
            style={{
              display: "block",
              padding: "11px 16px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              color: "#374151",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            이전 화면으로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  );
}
