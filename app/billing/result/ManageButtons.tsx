"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../pricing/billing.module.css";
export default function ManageButtons({ orderId, monthly, paid, cancelled }: { orderId: string; monthly: boolean; paid: boolean; cancelled: boolean }) {
  const router = useRouter(), pending = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function act(action: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/billing/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, action }) });
      if (!response.ok) throw new Error();
      setMessage("서버에서 처리 결과를 확인했습니다."); router.refresh();
    } catch { setMessage("처리 결과를 확정하지 못했습니다. 결제 상태 재확인 후 다시 확인해주세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <><div className={styles.actions}>
    <button type="button" className={styles.button} disabled={busy} onClick={() => act("reconcile")}>결제 상태 재확인</button>
    {monthly && paid && !cancelled ? <button type="button" className={styles.button} disabled={busy} onClick={() => act("cancel")}>다음 결제 해지</button> : null}
    {paid ? <button type="button" className={styles.button} disabled={busy} onClick={() => act("refund")}>테스트 결제 전액 취소</button> : null}
  </div><p className={styles.error} role="status">{message}</p></>;
}
