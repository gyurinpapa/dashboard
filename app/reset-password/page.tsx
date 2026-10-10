"use client";

import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef, useState, type FormEvent } from "react";

type RecoveryClient = ReturnType<typeof createBrowserClient>;

export default function ResetPasswordPage() {
  const client = useRef<RecoveryClient | null>(null);
  const initialized = useRef(false);
  const [mode, setMode] = useState<"loading" | "request" | "update" | "done">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Exchange once, including React Strict Mode's repeated effect setup.
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const linkError = params.has("error") || new URLSearchParams(window.location.hash.slice(1)).has("error");
    // Remove the code before creating the client: @supabase/ssr enables
    // automatic URL detection, so this page must own the single exchange.
    window.history.replaceState(null, "", window.location.pathname);
    const authClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { isSingleton: false },
    );
    client.current = authClient;
    if (!code || linkError) {
      if (linkError) setError("복구 링크가 만료되었거나 사용할 수 없습니다. 새 메일을 요청해 주세요.");
      setMode("request");
      return;
    }
    void (async () => {
      try {
        const { data, error: exchangeError } = await authClient.auth.exchangeCodeForSession(code);
        if (exchangeError || !data.session) throw new Error("Invalid recovery link");
        setEmail(data.session.user.email ?? "");
        setMode("update");
      } catch {
        setError("복구 링크를 확인하지 못했습니다. 메일을 요청한 브라우저에서 최신 링크를 열거나 새 메일을 요청해 주세요.");
        setMode("request");
      }
    })();
  }, []);

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !client.current) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: requestError } = await client.current.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (requestError) {
        setError(requestError.status === 429
          ? "요청이 많습니다. 잠시 후 다시 시도해 주세요."
          : "복구 메일을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setMessage("등록된 이메일이라면 복구 메일이 발송됩니다. 받은메일함과 스팸함을 확인하고, 이 브라우저에서 최신 메일의 링크를 열어 주세요.");
    } catch {
      setError("네트워크 연결을 확인한 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || mode !== "update" || !client.current) return;
    setError("");
    if (password.length < 12) {
      setError("새 비밀번호는 12자 이상으로 입력해 주세요.");
      return;
    }
    if (password !== confirmation) {
      setError("두 비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await client.current.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.code === "same_password"
          ? "기존 비밀번호와 다른 새 비밀번호를 입력해 주세요."
          : "비밀번호를 변경하지 못했습니다. 더 강한 비밀번호를 사용하거나 새 복구 메일을 요청해 주세요.");
        return;
      }
      setPassword("");
      setConfirmation("");
      await client.current.auth.signOut({ scope: "local" });
      setMode("done");
      setMessage("비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.");
    } catch {
      setError("연결이 중단되었습니다. 새 비밀번호로 로그인해 보고, 실패하면 복구 메일을 다시 요청해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#25265b", color: "#f8fafc" }}>
      <section style={{ width: "100%", maxWidth: 440, padding: 28, border: "1px solid #655880", borderRadius: 20, background: "#352963" }}>
        <p style={{ color: "#B7D7E3", marginTop: 0 }}>Etrylue Performance</p>
        <h1 style={{ fontSize: 26 }}>비밀번호 재설정</h1>
        {mode === "loading" && <p role="status">복구 링크 확인 중…</p>}
        {mode === "request" && <form onSubmit={requestRecovery} style={{ display: "grid", gap: 14 }}>
          <label htmlFor="recovery-email">가입한 이메일</label>
          <input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <button disabled={busy} style={buttonStyle}>{busy ? "요청 중…" : "비밀번호 복구 메일 받기"}</button>
        </form>}
        {mode === "update" && <form onSubmit={updatePassword} style={{ display: "grid", gap: 14 }}>
          <p>{email}</p>
          <label htmlFor="new-password">새 비밀번호 (12자 이상)</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          <label htmlFor="confirm-password">새 비밀번호 확인</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} style={inputStyle} />
          <button disabled={busy} style={buttonStyle}>{busy ? "변경 중…" : "새 비밀번호 저장"}</button>
        </form>}
        {error && <p role="alert" style={{ color: "#fecaca", lineHeight: 1.6 }}>{error}</p>}
        {message && <p role="status" style={{ color: "#B7D7E3", lineHeight: 1.6 }}>{message}</p>}
        <p style={{ marginBottom: 0, marginTop: 24 }}><Link href="/report-builder" style={{ color: "#fff" }}>로그인으로 돌아가기</Link></p>
      </section>
    </main>
  );
}

const inputStyle = { width: "100%", padding: 12, borderRadius: 10, border: "1px solid #7FA6C4", background: "#211e43", color: "#fff" };
const buttonStyle = { padding: 14, borderRadius: 10, border: 0, background: "#B7D7E3", color: "#211e43", fontWeight: 700, cursor: "pointer" };
