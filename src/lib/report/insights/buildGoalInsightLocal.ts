import type { GoalState, MonthKey, ReportType } from "../types";

type GoalMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cvr: number;
  cpa: number;
  roas: number;
};

type ProgressMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  roas: number;
};

type Args = {
  reportType?: ReportType;
  monthKey: MonthKey;
  goal: GoalState;
  actual: GoalMetrics;
  goalComputed: GoalMetrics;
  progress: ProgressMetrics;
};

function toSafeNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function formatPercent(rate: number, digits = 1) {
  return `${(toSafeNumber(rate) * 100).toFixed(digits)}%`;
}

function formatWon(value: number) {
  const safe = Math.round(toSafeNumber(value));
  return `₩${safe.toLocaleString("ko-KR")}`;
}

function pickSeverity(rate: number) {
  const safe = clamp01(rate);
  if (safe >= 0.9) return "정상";
  if (safe >= 0.6) return "위험";
  return "심각";
}

function paceText(rate: number) {
  const safe = clamp01(rate);
  if (safe >= 1) return "이미 넘어선 상태";
  if (safe >= 0.9) return "마감까지 충분히 달성 가능한 구간";
  if (safe >= 0.6) return "회복은 가능하지만 구조 조정이 필요한 구간";
  return "현재 방식으로는 목표 달성이 어려운 구간";
}

function joinSentences(parts: string[]) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function pickPrimaryRate(reportType: ReportType, progress: ProgressMetrics, goal: GoalState) {
  if (reportType === "traffic") {
    if (toSafeNumber(goal.clicks) > 0) return clamp01(progress.clicks);
    if (toSafeNumber(goal.impressions) > 0) return clamp01(progress.impressions);
    if (toSafeNumber(goal.cost) > 0) return clamp01(progress.cost);
    return clamp01(progress.clicks || progress.impressions || progress.cost);
  }

  if (reportType === "db_acquisition") {
    if (toSafeNumber(goal.conversions) > 0) return clamp01(progress.conversions);
    if (toSafeNumber(goal.clicks) > 0) return clamp01(progress.clicks);
    if (toSafeNumber(goal.cost) > 0) return clamp01(progress.cost);
    return clamp01(progress.conversions || progress.clicks || progress.cost);
  }

  if (toSafeNumber(goal.revenue) > 0) return clamp01(progress.revenue);
  if (toSafeNumber(goal.conversions) > 0) return clamp01(progress.conversions);
  if (toSafeNumber(goal.cost) > 0) return clamp01(progress.cost);
  return clamp01(progress.revenue || progress.conversions || progress.cost);
}

function buildTrafficInsight(args: Args) {
  const clickProgress = clamp01(args.progress.clicks);
  const imprProgress = clamp01(args.progress.impressions);
  const primaryRate = pickPrimaryRate("traffic", args.progress, args.goal);
  const severity = pickSeverity(primaryRate);

  const goalCtr = toSafeNumber(args.goalComputed.ctr);
  const actualCtr = toSafeNumber(args.actual.ctr);
  const goalCpc = toSafeNumber(args.goalComputed.cpc);
  const actualCpc = toSafeNumber(args.actual.cpc);

  const ctrWeak = goalCtr > 0 ? actualCtr < goalCtr * 0.9 : actualCtr < 0.01;
  const imprWeak = imprProgress < 0.85;
  const cpcHigh = goalCpc > 0 ? actualCpc > goalCpc * 1.1 : false;

  let problem = "";
  let cause = "";
  let action = "";

  if (imprWeak && ctrWeak) {
    problem =
      "핵심 문제는 클릭 목표 미달 자체보다 노출 볼륨과 클릭 반응성이 동시에 약해 유입 확대 구조가 막혀 있다는 점이다.";
    cause =
      "이는 입찰·예산 도달 범위가 충분하지 않은 상태에서 소재 반응성까지 떨어져, 확보한 노출을 클릭으로 전환하지 못하는 구조로 해석된다.";
    action =
      "지금 당장은 반응이 확인된 소재 콘셉트를 기준으로 변형 소재를 추가하고, 클릭이 실제 나는 키워드·타겟에 예산과 입찰을 우선 재배분해 노출과 CTR을 동시에 끌어올려야 한다.";
  } else if (imprWeak) {
    problem =
      "핵심 문제는 CTR보다 먼저 노출 볼륨이 막혀 있어 클릭 목표가 자연스럽게 따라오지 못한다는 점이다.";
    cause =
      "소재 반응 이전에 입찰 경쟁력, 예산 배분, 타겟 도달 범위가 제한되어 상단 퍼널 자체가 좁게 운영되는 구조다.";
    action =
      "지금 당장은 고반응 세트의 예산 상한과 입찰 강도를 먼저 올리고, 도달 가능한 키워드·타겟을 넓혀 클릭 풀 자체를 확장해야 한다.";
  } else if (ctrWeak) {
    problem =
      "핵심 문제는 노출은 확보되고 있지만 CTR이 목표 수준을 받쳐주지 못해 유입량이 기대만큼 늘지 않는다는 점이다.";
    cause =
      "현재 구조는 매체 도달은 되고 있으나 소재 메시지와 후킹 요소가 약해, 노출을 클릭으로 바꾸는 중간 전환 효율이 낮은 상태다.";
    action =
      "지금 당장은 클릭률이 낮은 소재를 빠르게 교체하고, 상위 소재의 헤드라인·비주얼 패턴을 복제 확장해 CTR 회복을 최우선으로 잡아야 한다.";
  } else if (cpcHigh) {
    problem =
      "핵심 문제는 클릭은 발생하지만 CPC 압박이 커져 같은 비용으로 확보할 수 있는 유입량이 제한된다는 점이다.";
    cause =
      "경쟁 강도가 높은 구간에 예산이 과도하게 머물러 있고, 효율 세그먼트보다 비싼 클릭이 먼저 소비되는 구조로 보인다.";
    action =
      "지금 당장은 고CPC 구간의 입찰 강도를 낮추고, 동일 클릭을 더 낮은 단가로 만드는 키워드·타겟 확장과 소재 개선을 동시에 진행해야 한다.";
  } else {
    problem =
      "현재 유입 구조는 목표 대비 정상 범위에 있으나, 클릭 확대가 유지되지 않으면 후반부에 성장 탄력이 빠르게 둔화될 수 있다.";
    cause =
      "즉, 지금 성과는 일부 상위 세트에 기대고 있을 가능성이 높아 동일 패턴이 소진되면 볼륨이 쉽게 꺾일 수 있는 구조다.";
    action =
      "지금 당장은 성과가 나는 소재와 키워드를 중심으로 확장 세트를 미리 준비해 유입 볼륨의 추가 성장 여지를 확보해야 한다.";
  }

  return joinSentences([
    `${args.monthKey || "당월"} 트래픽 목표 달성 수준은 ${severity} 단계이며, 클릭 확보 페이스는 ${paceText(clickProgress || primaryRate)}.`,
    problem,
    cause,
    action,
  ]);
}

function buildDbInsight(args: Args) {
  const convProgress = clamp01(args.progress.conversions);
  const clickProgress = clamp01(args.progress.clicks);
  const primaryRate = pickPrimaryRate("db_acquisition", args.progress, args.goal);
  const severity = pickSeverity(primaryRate);

  const goalCvr = toSafeNumber(args.goalComputed.cvr);
  const actualCvr = toSafeNumber(args.actual.cvr);
  const goalCpa = toSafeNumber(args.goalComputed.cpa);
  const actualCpa = toSafeNumber(args.actual.cpa);
  const actualConv = toSafeNumber(args.actual.conversions);

  const noConversion = actualConv <= 0;
  const cvrWeak = goalCvr > 0 ? actualCvr < goalCvr * 0.9 : actualCvr < 0.01;
  const cpaHigh = goalCpa > 0 ? actualCpa > goalCpa * 1.1 : false;

  let problem = "";
  let cause = "";
  let action = "";

  if (noConversion) {
    problem =
      "핵심 문제는 단순 부족이 아니라 전환이 사실상 발생하지 않아 DB 확보 구조가 멈춰 있다는 점이다.";
    cause =
      "현재는 유입 이후 전환으로 이어지는 연결 고리가 무너져 있어, 타겟 정합성·오퍼 매력·랜딩 설계 중 하나 이상이 구조적으로 맞지 않는 상태로 해석된다.";
    action =
      "지금 당장은 전환 이력이 전혀 없는 타겟과 소재를 즉시 제외하고, 전환형 메시지와 오퍼를 전면 교체한 소수 세트에 예산을 집중해 전환 재발생 구간부터 복구해야 한다.";
  } else if (cvrWeak && cpaHigh) {
    problem =
      "핵심 문제는 클릭을 전환으로 바꾸는 효율이 약해 DB 목표가 밀리고, 그 결과 CPA까지 함께 악화되고 있다는 점이다.";
    cause =
      "유입량보다 랜딩 설득력과 타겟 품질이 더 큰 병목으로 작용해, 비용은 쓰이는데 전환이 남지 않는 비효율 구조가 형성돼 있다.";
    action =
      "지금 당장은 전환이 실제 발생한 소재·키워드·타겟 조합만 남기고 저CVR 구간을 차단한 뒤, 랜딩 첫 화면 오퍼와 신청 유도 요소를 즉시 재정비해야 한다.";
  } else if (cvrWeak) {
    problem =
      "핵심 문제는 클릭 확보보다 전환 전환율이 목표 수준을 받쳐주지 못해 리드 볼륨이 제한된다는 점이다.";
    cause =
      "유입은 들어오지만 신청 직전에서 이탈이 커, 메시지-랜딩 간 기대 불일치나 전환 장벽이 존재하는 구조로 보인다.";
    action =
      "지금 당장은 랜딩 핵심 혜택 문구와 신청 CTA를 간결하게 재구성하고, 전환이 나는 세그먼트 중심으로 유입을 재집중해야 한다.";
  } else if (cpaHigh) {
    problem =
      "핵심 문제는 전환은 발생하지만 단가가 높아 목표 대비 효율적 DB 축적 속도가 느리다는 점이다.";
    cause =
      "고비용 유입이 과도하게 섞여 있어 전환당 비용이 상승하고, 결과적으로 예산이 리드 확장보다 누수에 가깝게 사용되는 구조다.";
    action =
      "지금 당장은 CPA가 높은 구간의 입찰과 예산을 줄이고, 동일 전환을 더 낮은 비용으로 만드는 타겟·소재 조합으로 재편해야 한다.";
  } else {
    problem =
      "현재 DB 확보 구조는 정상 범위에 있으나, 전환이 일부 효율 구간에 집중돼 있다면 확장 시 품질 저하가 빠르게 나타날 수 있다.";
    cause =
      "즉, 현 구조는 성과 세트 의존도가 높을 가능성이 있어 규모 확대 시 CVR과 CPA가 동시에 흔들릴 여지가 있다.";
    action =
      "지금 당장은 상위 전환 세트의 메시지와 타겟 패턴을 복제해 확장 테스트를 만들고, 저효율 구간은 선제적으로 정리해야 한다.";
  }

  return joinSentences([
    `${args.monthKey || "당월"} DB 확보 목표 달성 수준은 ${severity} 단계이며, 전환 확보 페이스는 ${paceText(convProgress || clickProgress || primaryRate)}.`,
    problem,
    cause,
    action,
  ]);
}

function buildCommerceInsight(args: Args) {
  const revenueProgress = clamp01(args.progress.revenue);
  const roasProgress = clamp01(args.progress.roas);
  const convProgress = clamp01(args.progress.conversions);
  const primaryRate = pickPrimaryRate("commerce", args.progress, args.goal);
  const severity = pickSeverity(primaryRate);

  const goalRoas = toSafeNumber(args.goalComputed.roas);
  const actualRoas = toSafeNumber(args.actual.roas);
  const goalCvr = toSafeNumber(args.goalComputed.cvr);
  const actualCvr = toSafeNumber(args.actual.cvr);

  const roasWeak = goalRoas > 0 ? actualRoas < goalRoas * 0.9 : actualRoas < 1;
  const cvrWeak = goalCvr > 0 ? actualCvr < goalCvr * 0.9 : actualCvr < 0.01;
  const revenueWeak = revenueProgress < 0.85;

  let problem = "";
  let cause = "";
  let action = "";

  if (revenueWeak && roasWeak) {
    problem =
      "핵심 문제는 매출 볼륨이 부족한 것에 그치지 않고, ROAS까지 목표를 받쳐주지 못해 확장할수록 비효율이 커질 가능성이 높다는 점이다.";
    cause =
      "현재 구조는 구매 가능성이 낮은 세그먼트까지 예산이 퍼져 있거나, 소재와 랜딩이 구매 전환 의도를 충분히 끌어내지 못해 매출과 효율이 동시에 눌린 상태로 해석된다.";
    action =
      "지금 당장은 고ROAS 세그먼트와 구매 전환이 실제 발생하는 소재에 예산을 집중하고, 저ROAS 캠페인은 즉시 축소해 매출 회수력이 확인되는 구간 위주로 재편해야 한다.";
  } else if (revenueWeak && cvrWeak) {
    problem =
      "핵심 문제는 트래픽 부족보다 구매 전환율이 낮아 매출 목표가 따라오지 못한다는 점이다.";
    cause =
      "유입은 발생하지만 상품 설득력, 프로모션 메시지, 랜딩 구매 동선 중 하나 이상이 약해 퍼널 하단에서 매출이 새고 있는 구조다.";
    action =
      "지금 당장은 구매 전환이 나는 상품군과 메시지 조합으로 운영을 압축하고, 상세·혜택·CTA를 포함한 구매 퍼널 개선을 최우선으로 실행해야 한다.";
  } else if (roasWeak) {
    problem =
      "핵심 문제는 매출이 일부 발생하더라도 ROAS가 목표 대비 낮아 같은 예산으로 만들어내는 수익성이 부족하다는 점이다.";
    cause =
      "성과가 낮은 캠페인과 세그먼트가 예산을 잠식하고 있어, 매출보다 비용이 더 빠르게 증가하는 비효율 구조가 만들어져 있다.";
    action =
      "지금 당장은 ROAS 하위 구간을 정리하고, 장바구니·재방문·구매 의도 신호가 강한 세그먼트에 예산을 재집중해야 한다.";
  } else {
    problem =
      "현재 커머스 구조는 정상 범위에 있으나, 매출이 유지되더라도 ROAS가 흔들리기 시작하면 후반 성장은 비용만 늘고 이익이 남지 않는 방향으로 꺾일 수 있다.";
    cause =
      "즉, 지금 성과는 효율 구간이 버티고 있는 덕분일 가능성이 높아 예산 확장 시 저효율 재고가 바로 섞일 위험이 있다.";
    action =
      "지금 당장은 상위 매출·고ROAS 세그먼트를 기준으로 확장 우선순위를 나누고, 성과 하위 캠페인은 선제적으로 축소해 수익성 방어선을 먼저 유지해야 한다.";
  }

  return joinSentences([
    `${args.monthKey || "당월"} 커머스 목표 달성 수준은 ${severity} 단계이며, 매출 확보 페이스는 ${paceText(revenueProgress || convProgress || primaryRate)}.`,
    problem,
    cause,
    action,
  ]);
}

export function buildGoalInsightLocal(args: Args) {
  const reportType: ReportType = args.reportType ?? "commerce";

  if (reportType === "traffic") {
    return buildTrafficInsight(args);
  }

  if (reportType === "db_acquisition") {
    return buildDbInsight(args);
  }

  return buildCommerceInsight(args);
}