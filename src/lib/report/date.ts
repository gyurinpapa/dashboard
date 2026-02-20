export function parseDateLoose(s: any): Date | null {
  if (!s) return null;
  const str = String(s).trim();
  const normalized = str.replace(/\./g, "-");

  // YYYY-MM-DD 우선 파싱 (로컬 타임존 안전)
  const m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const yy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function toYMDLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthKeyOfDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabelOf(m: string) {
  return `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
}

// Monday 기준 주 시작
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun ... 6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday 기준
  x.setDate(x.getDate() + diff);
  return x;
}

// ✅ 네 룰 반영: "1일이 월~목이면 그 달 1주차 / 금~일이면 전월 마지막 주"
function startOfWeekMon(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function monthWeekLabelRule(ws: Date) {
  const we = addDays(ws, 6);

  let baseY = ws.getFullYear();
  let baseM = ws.getMonth();

  // 다음달 1일이 이번 주에 포함되고, 그 요일이 월~목이면 기준달을 다음달로
  const nextMonthFirst = new Date(ws.getFullYear(), ws.getMonth() + 1, 1);
  if (nextMonthFirst >= ws && nextMonthFirst <= we) {
    const dow = nextMonthFirst.getDay(); // 1~4 => Mon~Thu
    if (dow >= 1 && dow <= 4) {
      baseY = nextMonthFirst.getFullYear();
      baseM = nextMonthFirst.getMonth();
    }
  }

  const monthFirst = new Date(baseY, baseM, 1);
  const monthFirstDow = monthFirst.getDay(); // 0 Sun

  const week1Start = startOfWeekMon(monthFirst);

  // 1일이 금/토/일이면 그 주는 전월 마지막 주 취급 => 1주차 시작은 다음주(다음 월요일)
  const effectiveWeek1Start =
    monthFirstDow === 5 || monthFirstDow === 6 || monthFirstDow === 0
      ? addDays(week1Start, 7)
      : week1Start;

  const diffWeeks = Math.floor(
    (startOfWeekMon(ws).getTime() - effectiveWeek1Start.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  const weekNo = diffWeeks + 1;
  const safeWeekNo = weekNo < 1 ? 1 : weekNo;

  return `${baseY}년 ${baseM + 1}월 ${safeWeekNo}주차`;
}
