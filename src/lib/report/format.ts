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

// =========================================================
// 표시 규칙 통일용 공용 helper
// - summarize() 기준 비율은 ratio(0~1)
// - 다만 legacy 값(예: 2.5%를 2.5로, 250%를 250으로 들고 있는 경우)도
//   화면에서 안전하게 흡수할 수 있게 유지
// =========================================================
export function toSafeNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// CTR / CVR 같은 일반 비율용
// ratio(0~1)는 그대로, legacy percent(예: 2.35)는 0.0235로 보정
export function normalizeRate01(v: any) {
  const n = toSafeNumber(v);
  return n > 1 ? n / 100 : n;
}

// ROAS용
// summarize() 기준 ratio(예: 2.15)는 그대로,
// legacy percent(예: 215)는 2.15로 보정
export function normalizeRoas01(v: any) {
  const n = toSafeNumber(v);
  return n > 10 ? n / 100 : n;
}

export function formatPercentFromRate(v: any, digits = 2) {
  return `${(normalizeRate01(v) * 100).toFixed(digits)}%`;
}

export function formatPercentFromRoas(v: any, digits = 1) {
  return `${(normalizeRoas01(v) * 100).toFixed(digits)}%`;
}

// =========================================================
// Step 10: Summary 전 구간 재사용용 표시/비교 helper
// =========================================================
export function formatCount(v: any) {
  return Math.round(toSafeNumber(v)).toLocaleString();
}

export function diffRatio(current: any, prev: any) {
  const c = toSafeNumber(current);
  const p = toSafeNumber(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return (c - p) / p;
}

export function formatCurrencyAxisCompact(v: any) {
  const n = toSafeNumber(v);
  const abs = Math.abs(n);

  if (abs >= 100000000) {
    const scaled = n / 100000000;
    return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)}억`;
  }

  if (abs >= 10000) {
    const scaled = n / 10000;
    return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)}만`;
  }

  return toSafeNumber(n).toLocaleString();
}

export function formatPercentAxisFromRoas(v: any) {
  const percent = normalizeRoas01(v) * 100;
  if (Math.abs(percent) >= 1000) return `${percent.toFixed(0)}%`;
  return `${percent.toFixed(1)}%`;
}

// =========================================================
// Step 11: Summary 외 섹션 확장용 증감 표시 helper
// diffRatio() 결과(0~1)를 화면 문자열로 안전하게 변환
// =========================================================
export function formatDeltaPercentFromRatio(
  ratio: any,
  digits = 1,
  fallback = "-"
) {
  if (ratio == null) return fallback;
  const n = Number(ratio);
  if (!Number.isFinite(n)) return fallback;

  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}