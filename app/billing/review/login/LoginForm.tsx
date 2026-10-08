"use client";
import { useRef, useState } from "react";
import styles from "../../../pricing/billing.module.css";
export default function LoginForm({ next }: { next: string }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget, data = new FormData(form);
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/billing/review/session", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      if (!response.ok) throw new Error();
      form.reset(); window.location.assign(next);
    } catch { setMessage("로그인하지 못했습니다. 안내받은 심사용 계정과 비밀번호를 확인해주세요. 일반 리포트 계정으로는 로그인할 수 없습니다."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={submit}>
    <label className={styles.label} htmlFor="review-email">심사용 이메일</label>
    <input className={styles.select} id="review-email" name="email" type="email" autoComplete="username" required disabled={busy} />
    <label className={styles.label} htmlFor="review-password">비밀번호</label>
    <input className={styles.select} id="review-password" name="password" type="password" autoComplete="current-password" required disabled={busy} />
    <div className={styles.actions}><button className={styles.button} disabled={busy}>{busy ? "로그인 확인 중…" : "로그인하고 주문 확인"}</button></div>
    <p className={styles.error} role="status">{message}</p>
  </form>;
}
