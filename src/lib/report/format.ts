// app/lib/report/format.ts

export function safeDiv(a: number, b: number) {
  return b ? a / b : 0;
}

export function KRW(n: number) {
  return `₩${Math.round(n).toLocaleString()}`;
}

// 표시용: 1234 -> "1,234" (0이면 빈칸)
export function formatNumber(n: number) {
  if (!n) return "";
  return Math.round(n).toLocaleString();
}

// 입력용: "1,234" / "₩1,234" -> 1234
export function parseNumberInput(v: string) {
  if (!v) return 0;
  return Number(String(v).replace(/[^\d]/g, "")) || 0;
}

export function progressRate(actual: number, goal: number) {
  if (!goal) return 0;
  return actual / goal;
}
export function diffPct(current: number, prev: number) {
  if (!prev || prev === 0) return 0;
  return ((current - prev) / prev) * 100;
}
