"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../pricing/billing.module.css";
export default function ManageButtons({ orderId, status, monthly, paid, cancelled }: { orderId: string; status: string; monthly: boolean; paid: boolean; cancelled: boolean }) {
  const router = useRouter(), pending = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [completedAction, setCompletedAction] = useState("");
  async function act(action: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(""); setCompletedAction("");
    try {
      const response = await fetch("/api/billing/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, action }) });
      if (!response.ok) throw new Error();
      setCompletedAction(action); router.refresh();
    } catch { setMessage(action === "refund"
      ? "전액 취소 결과를 확인하지 못했습니다. 취소가 실패했다고 확정된 것은 아닙니다. ‘결제 상태 재확인’을 눌러주세요. 계속 확인되지 않으면 새로 결제하지 말고 문의해주세요."
      : "최신 처리 결과를 확인하지 못했습니다. 잠시 후 ‘결제 상태 재확인’을 눌러주세요. 같은 안내가 계속되면 새로 결제하지 말고 문의해주세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  const confirmedMessage = status === "refunded"
    ? "테스트 결제 전액 취소가 완료되었습니다. 테스트 이용권도 종료되었습니다. 실제 청구된 금액은 없습니다."
    : completedAction === "refund"
      ? "전액 취소 완료가 아직 확인되지 않았습니다. ‘결제 상태 재확인’을 눌러 취소 반영 여부를 확인해주세요."
      : monthly && cancelled
        ? "다음 테스트 결제가 해지되었습니다. 이미 결제한 금액은 취소되지 않으며, 이용기간은 상단에서 확인할 수 있습니다."
        : paid
          ? "테스트 결제 승인 완료 상태를 확인했습니다. 이용기간은 상단에 표시된 종료 시각까지입니다. 실제 요금은 청구되지 않습니다."
          : "결제 승인 완료 상태가 확인되지 않았습니다. 새로 결제하지 말고 잠시 후 ‘결제 상태 재확인’을 눌러주세요. 계속 동일하면 문의해주세요.";
  const confirmed = status === "refunded" || (completedAction !== "refund" && (paid || (monthly && cancelled)));
  return <><div className={styles.actions}>
    <button type="button" className={styles.button} disabled={busy} onClick={() => act("reconcile")}>결제 상태 재확인</button>
    {monthly && paid && !cancelled ? <button type="button" className={styles.button} disabled={busy} onClick={() => act("cancel")}>다음 결제 해지</button> : null}
    {paid ? <button type="button" className={styles.button} disabled={busy} onClick={() => act("refund")}>테스트 결제 전액 취소</button> : null}
  </div><p className={styles.error} style={!message && completedAction && confirmed ? { color: "var(--mint, #35e0d0)" } : undefined} role="status">{message || (completedAction ? confirmedMessage : "")}</p></>;
}
