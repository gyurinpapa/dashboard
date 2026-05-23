"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";

function asText(v: any) {
  return String(v ?? "").trim();
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => {
    const raw = asText(searchParams.get("next"));
    if (!raw) return "/report-builder";
    if (!raw.startsWith("/")) return "/report-builder";
    return raw;
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function signInWithPassword() {
    const nextEmail = email.trim().toLowerCase();

    if (!nextEmail || !nextEmail.includes("@")) {
      setError("이메일을 정확히 입력하세요.");
      return;
    }

    if (!password) {
      setError("비밀번호를 입력하세요.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: nextEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message || "로그인에 실패했습니다.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    const nextEmail = email.trim().toLowerCase();

    if (!nextEmail || !nextEmail.includes("@")) {
      setError("이메일을 정확히 입력하세요.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: nextEmail,
        options: {
          emailRedirectTo: `${origin}${nextPath}`,
        },
      });

      if (otpError) {
        setError(otpError.message || "로그인 링크 발송에 실패했습니다.");
        return;
      }

      setMessage("로그인 링크를 이메일로 발송했습니다. 메일함을 확인하세요.");
    } catch (e: any) {
      setError(e?.message || "로그인 링크 발송 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 28,
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
          로그인
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          초대받은 이메일 계정으로 로그인하면 초대 수락 화면으로 돌아갑니다.
        </div>

        <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              이메일
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={{
                height: 42,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                padding: "0 12px",
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              비밀번호
            </span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              type="password"
              autoComplete="current-password"
              style={{
                height: 42,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                padding: "0 12px",
                outline: "none",
              }}
            />
          </label>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#be123c",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        {message ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: "#ecfdf5",
              border: "1px solid #bbf7d0",
              color: "#047857",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        ) : null}

        <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={signInWithPassword}
            disabled={loading}
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid #111827",
              background: loading ? "#9ca3af" : "#111827",
              color: "#fff",
              fontWeight: 800,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "처리 중..." : "비밀번호로 로그인"}
          </button>

          <button
            type="button"
            onClick={sendMagicLink}
            disabled={loading}
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111827",
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
            }}
          >
            이메일 로그인 링크 받기
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
          로그인 후 이동 위치: <b>{nextPath}</b>
        </div>
      </section>
    </main>
  );
}

function LoginPageFallback() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6b7280",
        fontWeight: 700,
      }}
    >
      로그인 화면을 불러오는 중...
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageClient />
    </Suspense>
  );
}