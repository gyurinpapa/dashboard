import type {
  DecisionAxis,
  DecisionEngineInput,
  GoalMetric,
  GoalSnapshot,
} from "./types";

export type DecisionHypothesis = {
  id: string;
  title: string;
  axis: DecisionAxis | "month";
  confidence: "high" | "medium" | "low";
  currentProblem: string;
  causeEstimate: string;
  action: string;
  expectedChange: string;
};

function toSafeNumber(value: any): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = String(value).replace(/[%₩,\s]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRateMaybePercent(value: any): number {
  const n = toSafeNumber(value);
  if (n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

function safeDivide(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

function metricLabel(metric: GoalMetric): string {
  switch (metric) {
    case "impressions":
      return "노출";
    case "clicks":
      return "클릭";
    case "conversions":
      return "전환";
    case "revenue":
      return "매출";
    case "spend":
      return "비용";
    case "ctr":
      return "CTR";
    case "cvr":
      return "CVR";
    case "cpc":
      return "CPC";
    case "cpa":
      return "CPA";
    case "roas":
      return "ROAS";
    default:
      return metric;
  }
}

function formatMetricValue(metric: GoalMetric, value: number): string {
  const safe = Number.isFinite(value) ? value : 0;

  switch (metric) {
    case "ctr":
    case "cvr":
    case "roas":
      return `${(safe * 100).toFixed(1)}%`;
    case "spend":
    case "revenue":
    case "cpc":
    case "cpa":
      return `${Math.round(safe).toLocaleString()}`;
    case "impressions":
    case "clicks":
    case "conversions":
    default:
      return `${Math.round(safe).toLocaleString()}`;
  }
}

function formatPercent(rate: number): string {
  const safe = Number.isFinite(rate) ? rate : 0;
  return `${(safe * 100).toFixed(1)}%`;
}

function isLowerBetterMetric(metric: GoalMetric): boolean {
  return metric === "cpa" || metric === "cpc";
}

function isAheadNoGap(snapshot: GoalSnapshot): boolean {
  return snapshot.pacingStatus === "ahead" && snapshot.gapValue <= 0;
}

function pickFirstString(obj: any, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  for (const key of keys) {
    const value = obj[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function pickFirstNumber(obj: any, keys: string[]): number {
  if (!obj || typeof obj !== "object") return 0;
  for (const key of keys) {
    if (!(key in obj)) continue;
    const n = toSafeNumber(obj[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pickFirstRate(obj: any, keys: string[]): number {
  if (!obj || typeof obj !== "object") return 0;
  for (const key of keys) {
    if (!(key in obj)) continue;
    const n = normalizeRateMaybePercent(obj[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function resolveAxisName(row: any, axis: DecisionAxis): string {
  switch (axis) {
    case "campaign":
      return (
        pickFirstString(row, [
          "campaign",
          "campaign_name",
          "campaignName",
          "name",
          "title",
          "label",
        ]) || "이름 미확인 캠페인"
      );
    case "week":
      return (
        pickFirstString(row, [
          "week",
          "week_key",
          "weekKey",
          "label",
          "name",
          "title",
        ]) || "주차 미확인"
      );
    default:
      return (
        pickFirstString(row, [
          "name",
          "label",
          "title",
          "key",
        ]) || "대상 미확인"
      );
  }
}

function resolveRowMetricValue(row: any, metric: GoalMetric): number {
  switch (metric) {
    case "impressions":
      return pickFirstNumber(row, ["impressions", "impr"]);
    case "clicks":
      return pickFirstNumber(row, ["clicks", "click", "clk"]);
    case "conversions":
      return pickFirstNumber(row, ["conversions", "conversion", "conv", "cv"]);
    case "revenue":
      return pickFirstNumber(row, [
        "revenue",
        "sales",
        "purchase",
        "purchase_amount",
        "gmv",
      ]);
    case "spend":
      return pickFirstNumber(row, ["spend", "cost", "ad_cost"]);
    case "ctr": {
      const raw = pickFirstRate(row, ["ctr"]);
      if (raw > 0) return raw;
      const clicks = resolveRowMetricValue(row, "clicks");
      const impressions = resolveRowMetricValue(row, "impressions");
      return safeDivide(clicks, impressions);
    }
    case "cvr": {
      const raw = pickFirstRate(row, ["cvr"]);
      if (raw > 0) return raw;
      const conversions = resolveRowMetricValue(row, "conversions");
      const clicks = resolveRowMetricValue(row, "clicks");
      return safeDivide(conversions, clicks);
    }
    case "cpc": {
      const raw = pickFirstNumber(row, ["cpc"]);
      if (raw > 0) return raw;
      const spend = resolveRowMetricValue(row, "spend");
      const clicks = resolveRowMetricValue(row, "clicks");
      return safeDivide(spend, clicks);
    }
    case "cpa": {
      const raw = pickFirstNumber(row, ["cpa"]);
      if (raw > 0) return raw;
      const spend = resolveRowMetricValue(row, "spend");
      const conversions = resolveRowMetricValue(row, "conversions");
      return safeDivide(spend, conversions);
    }
    case "roas": {
      const raw = pickFirstRate(row, ["roas"]);
      if (raw > 0) return raw;
      const revenue = resolveRowMetricValue(row, "revenue");
      const spend = resolveRowMetricValue(row, "spend");
      return safeDivide(revenue, spend);
    }
    default:
      return 0;
  }
}

function pickTopSpendRows(rows?: any[]): any[] {
  if (!Array.isArray(rows)) return [];
  return [...rows]
    .filter((row) => resolveRowMetricValue(row, "spend") > 0)
    .sort(
      (a, b) =>
        resolveRowMetricValue(b, "spend") - resolveRowMetricValue(a, "spend"),
    );
}

function buildBasePacingHypothesis(snapshot: GoalSnapshot): DecisionHypothesis {
  const lowerBetter = isLowerBetterMetric(snapshot.primaryMetric);
  const metricName = metricLabel(snapshot.primaryMetric);
  const aheadNoGap = isAheadNoGap(snapshot);

  if (aheadNoGap) {
    return {
      id: "pace-hold",
      title: "초과 달성 유지 가설",
      axis: "week",
      confidence: "high",
      currentProblem: `현재 pace 기준으로는 ${metricName} 목표를 이미 방어 중이지만, 남은 기간 동안 성과 기여 구조가 흔들리면 초과 달성 폭이 빠르게 축소될 수 있습니다.`,
      causeEstimate: `현재는 시간 진도율 ${formatPercent(snapshot.timeProgressRate)} 대비 실적 페이스가 앞서 있으나, 어떤 구간이 실제로 초과 달성을 만들고 있는지 검증되지 않으면 과도한 조정으로 강한 흐름을 스스로 약화시킬 수 있습니다.`,
      action: `즉시 큰 보정보다 현재 초과 달성 흐름을 만든 구간을 우선 식별하고, 유지해야 할 구간과 소규모 검증이 필요한 구간을 분리합니다.`,
      expectedChange: `불필요한 구조 변경 없이도 현재 초과 달성 흐름을 유지하면서, 이후 확대 가능한 핵심 구간을 더 신뢰도 있게 확인할 수 있습니다.`,
    };
  }

  const problemText =
    snapshot.gapValue > 0
      ? lowerBetter
        ? `현재 pace 기준 월말 ${metricName}가 목표보다 ${formatMetricValue(snapshot.primaryMetric, snapshot.gapValue)} 높게 마감될 위험이 있습니다.`
        : `현재 pace 기준 월말 ${metricName}가 목표 대비 ${formatMetricValue(snapshot.primaryMetric, snapshot.gapValue)} 부족할 가능성이 큽니다.`
      : `현재 pace 기준으로는 ${metricName} 목표 달성 가능성이 유지되고 있습니다.`;

  const causeText =
    snapshot.pacingStatus === "behind"
      ? lowerBetter
        ? `시간 진도율 ${formatPercent(snapshot.timeProgressRate)} 대비 효율 페이스가 뒤처져 있어 비효율 구간의 비용 소모가 누적되고 있을 가능성이 큽니다.`
        : `시간 진도율 ${formatPercent(snapshot.timeProgressRate)} 대비 실적 누적 속도가 부족해 고효율 구간 집중도가 충분하지 않을 가능성이 큽니다.`
      : `현재 페이스는 급격히 무너지지 않았지만, 남은 기간 동안 효율 편차가 커지면 목표 방어력이 약해질 수 있습니다.`;

  const actionText = lowerBetter
    ? `상위 효율 구간은 유지하고, 비효율 구간의 예산·입찰·노출 비중을 즉시 축소해 ${metricName} 초과 구간을 먼저 줄입니다.`
    : `${metricName} 창출력이 높은 구간에 예산과 노출을 우선 재배치해 남은 기간의 누적 속도를 끌어올립니다.`;

  const expectedText =
    snapshot.gapValue > 0
      ? lowerBetter
        ? `목표 초과분을 우선 압축하면 월말 ${metricName}를 목표선에 더 가깝게 수렴시키는 방향의 개선이 기대됩니다.`
        : `부족분 해소에 직접 연결되는 집행 재배치가 가능해져 월말 예상 달성률의 개선이 기대됩니다.`
      : `현재 추세를 방어하면서도 남은 기간의 리스크 구간을 줄이는 보수적 운영안으로 활용할 수 있습니다.`;

  return {
    id: "pace-gap",
    title: "현재 페이스 보정 가설",
    axis: "week",
    confidence: "high",
    currentProblem: problemText,
    causeEstimate: causeText,
    action: actionText,
    expectedChange: expectedText,
  };
}

function buildCampaignEfficiencyHypothesis(
  snapshot: GoalSnapshot,
  byCampaign?: any[],
): DecisionHypothesis | null {
  const candidates = pickTopSpendRows(byCampaign);
  if (candidates.length < 2) return null;

  const topRows = candidates.slice(0, Math.min(5, candidates.length));
  const lowerBetter = isLowerBetterMetric(snapshot.primaryMetric);
  const metricName = metricLabel(snapshot.primaryMetric);
  const aheadNoGap = isAheadNoGap(snapshot);

  const ranked = [...topRows].sort((a, b) => {
    const av = resolveRowMetricValue(a, snapshot.primaryMetric);
    const bv = resolveRowMetricValue(b, snapshot.primaryMetric);
    return lowerBetter ? av - bv : bv - av;
  });

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  const bestName = resolveAxisName(best, "campaign");
  const worstName = resolveAxisName(worst, "campaign");

  const bestMetric = resolveRowMetricValue(best, snapshot.primaryMetric);
  const worstMetric = resolveRowMetricValue(worst, snapshot.primaryMetric);
  const bestSpend = resolveRowMetricValue(best, "spend");
  const worstSpend = resolveRowMetricValue(worst, "spend");

  const hasMeaningfulGap =
    lowerBetter
      ? worstMetric > 0 && bestMetric > 0 && worstMetric > bestMetric * 1.15
      : bestMetric > 0 &&
        worstMetric >= 0 &&
        bestMetric > Math.max(worstMetric * 1.15, 0);

  if (!hasMeaningfulGap) return null;

  if (aheadNoGap) {
    return {
      id: "campaign-reallocation",
      title: "캠페인 기여도 검증 가설",
      axis: "campaign",
      confidence: "high",
      currentProblem: lowerBetter
        ? `상위 지출 캠페인 내에서도 ${worstName}의 ${metricName}가 ${formatMetricValue(snapshot.primaryMetric, worstMetric)}로, ${bestName}의 ${formatMetricValue(snapshot.primaryMetric, bestMetric)} 대비 비효율 편차가 존재합니다. 다만 현재는 목표 pace가 이미 앞서 있어 즉시 전면 재배분이 최우선은 아닙니다.`
        : `상위 지출 캠페인 중 ${bestName}는 ${metricName} ${formatMetricValue(snapshot.primaryMetric, bestMetric)}를 만들고 있고, ${worstName}는 ${formatMetricValue(snapshot.primaryMetric, worstMetric)} 수준에 머물러 기여도 편차가 존재합니다. 다만 현재는 목표 pace가 이미 앞서 있어 즉시 전면 재배분이 최우선은 아닙니다.`,
      causeEstimate: lowerBetter
        ? `현재 초과 달성 흐름 안에서도 캠페인별 효율 차이는 분명하지만, 어떤 캠페인이 실제로 안정적 효율을 반복하는지 검증 없이 강하게 움직이면 오히려 좋은 흐름을 흔들 수 있습니다.`
        : `현재 초과 달성 흐름 안에서도 캠페인별 성과 기여 차이는 분명하지만, 어떤 캠페인이 초과 달성을 지속적으로 만들고 있는지 검증 없이 크게 재배분하면 강한 캠페인 구조를 손상시킬 수 있습니다.`,
      action: `캠페인 간 예산을 크게 옮기기보다 ${bestName}와 ${worstName} 주변 구간의 반응 차이를 소규모로 검증해, 실제로 유지·확대해야 할 캠페인과 관찰이 필요한 캠페인을 먼저 분리합니다.`,
      expectedChange: `즉시 구조를 크게 흔들지 않고도 캠페인별 기여도 신뢰도를 높여, 다음 단계의 재배분 판단을 더 안정적으로 만들 수 있습니다.`,
    };
  }

  const currentProblem = lowerBetter
    ? `상위 집행 캠페인 내에서도 ${worstName}의 ${metricName}가 ${formatMetricValue(snapshot.primaryMetric, worstMetric)}로, ${bestName}의 ${formatMetricValue(snapshot.primaryMetric, bestMetric)} 대비 비효율이 큽니다.`
    : `상위 집행 캠페인 내에서 ${bestName}는 ${metricName} ${formatMetricValue(snapshot.primaryMetric, bestMetric)}를 만들고 있지만, ${worstName}는 ${formatMetricValue(snapshot.primaryMetric, worstMetric)} 수준에 머물러 성과 편차가 큽니다.`;

  const causeEstimate = lowerBetter
    ? `동일한 비용이 더 비싼 전환/클릭으로 연결되는 캠페인이 남아 있어, 효율이 좋은 캠페인 대비 예산 배분이 분산됐을 가능성이 큽니다.`
    : `성과 창출력이 높은 캠페인보다 낮은 캠페인에도 비용이 분산되어, 목표 KPI를 당겨오는 핵심 캠페인 집중도가 부족할 가능성이 큽니다.`;

  const action = lowerBetter
    ? `${worstName}의 비효율 지면·소재·세그먼트를 우선 축소하고, ${bestName}처럼 ${metricName}가 안정적인 캠페인 쪽으로 예산을 재배치합니다.`
    : `${bestName}처럼 ${metricName}를 더 잘 만드는 캠페인에 증액 우선순위를 두고, ${worstName}는 확장보다 구조 조정 후 재평가합니다.`;

  const expectedChange = lowerBetter
    ? `상위 지출 캠페인 기준 비효율 비용을 줄이면 월말 ${metricName} 초과 리스크를 낮추는 방향의 개선이 기대됩니다.`
    : `동일 예산 내에서도 더 높은 ${metricName} 창출 구간 비중이 커져 목표 부족분 해소 속도가 빨라질 가능성이 있습니다.`;

  return {
    id: "campaign-reallocation",
    title: "캠페인 재배분 가설",
    axis: "campaign",
    confidence: "high",
    currentProblem,
    causeEstimate,
    action,
    expectedChange,
  };
}

function buildWeeklyTrendHypothesis(
  snapshot: GoalSnapshot,
  byWeek?: any[],
): DecisionHypothesis | null {
  if (!Array.isArray(byWeek) || byWeek.length < 2) return null;

  const rows = [...byWeek];
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  if (!latest || !previous) return null;

  const latestMetric = resolveRowMetricValue(latest, snapshot.primaryMetric);
  const previousMetric = resolveRowMetricValue(previous, snapshot.primaryMetric);
  const latestName = resolveAxisName(latest, "week");
  const previousName = resolveAxisName(previous, "week");
  const lowerBetter = isLowerBetterMetric(snapshot.primaryMetric);
  const metricName = metricLabel(snapshot.primaryMetric);
  const aheadNoGap = isAheadNoGap(snapshot);

  if (latestMetric <= 0 && previousMetric <= 0) return null;

  const deltaRate =
    previousMetric > 0
      ? safeDivide(latestMetric - previousMetric, previousMetric)
      : 0;

  const isDeteriorating = lowerBetter ? deltaRate > 0.08 : deltaRate < -0.08;
  const isImproving = lowerBetter ? deltaRate < -0.08 : deltaRate > 0.08;

  if (!isDeteriorating && !isImproving) {
    if (aheadNoGap) {
      return {
        id: "weekly-stability",
        title: "주차 안정성 검증 가설",
        axis: "week",
        confidence: "medium",
        currentProblem: `${previousName} 대비 ${latestName}의 ${metricName} 변동폭이 제한적이며, 현재는 목표 pace도 이미 앞서 있습니다. 문제는 부족이 아니라 이 안정 흐름이 남은 기간에도 유지되는지 여부입니다.`,
        causeEstimate: `최근 주차 성과는 안정적이지만, 어떤 주차 패턴이 초과 달성을 실제로 지지하는지 검증되지 않으면 성급한 확장이나 조정이 오히려 안정성을 깨뜨릴 수 있습니다.`,
        action: `현재 주차 구조를 크게 흔들지 말고, 다음 주차에는 소규모 증감 테스트만 분리해 어떤 요인이 안정 흐름을 계속 만드는지 확인합니다.`,
        expectedChange: `초과 달성 흐름을 방어하면서도 다음 주차에 유지해야 할 조건과 검증이 필요한 조건을 더 분명하게 구분할 수 있습니다.`,
      };
    }

    return {
      id: "weekly-stability",
      title: "주차 안정화 가설",
      axis: "week",
      confidence: "medium",
      currentProblem: `${previousName} 대비 ${latestName}의 ${metricName} 변동폭이 제한적이어서, 현재는 급격한 추세 전환보다 운영 안정화가 더 중요한 구간입니다.`,
      causeEstimate: `주차별 성과 레벨은 유지되고 있지만, 목표 부족분을 메우기에는 현재 속도만으로는 가속이 부족할 수 있습니다.`,
      action: `성과가 크게 흔들리지 않는 현재 구조를 유지하되, 다음 주차에는 증액/축소 테스트를 명확히 분리해 어디서 추가 ${metricName}를 만들 수 있는지 확인합니다.`,
      expectedChange: `불필요한 변동성 없이도 다음 주차에 확대 가능한 구간과 방어해야 할 구간을 분리할 수 있습니다.`,
    };
  }

  if (isDeteriorating) {
    return {
      id: "weekly-deterioration",
      title: "최근 주차 하락 보정 가설",
      axis: "week",
      confidence: "medium",
      currentProblem: `${latestName}의 ${metricName}가 ${formatMetricValue(snapshot.primaryMetric, latestMetric)}로, 직전 ${previousName} 대비 ${
        lowerBetter ? "악화" : "하락"
      }했습니다.`,
      causeEstimate: lowerBetter
        ? `최근 주차에 비효율 세그먼트 유입 비중이 커지며 비용 대비 성과 품질이 나빠졌을 가능성이 있습니다.`
        : `최근 주차에 성과 창출력이 낮은 세그먼트 비중이 커져 목표 KPI 누적 속도가 둔화됐을 가능성이 있습니다.`,
      action: `직전 주차 대비 성과가 꺾인 캠페인·소재·타겟 구간을 우선 점검해 최근 악화 구간만 선택적으로 축소하거나 보정합니다.`,
      expectedChange: `최근 주차의 하락분을 먼저 복구하면 월말 forecast 추가 하락을 막고 목표선 복귀 가능성을 높일 수 있습니다.`,
    };
  }

  if (aheadNoGap) {
    return {
      id: "weekly-expansion",
      title: "최근 주차 강세 검증 가설",
      axis: "week",
      confidence: "medium",
      currentProblem: `${latestName}의 ${metricName}가 ${formatMetricValue(snapshot.primaryMetric, latestMetric)}로, 직전 ${previousName} 대비 개선되었습니다. 다만 현재는 이미 목표 pace가 앞서 있으므로, 이 신호를 곧바로 확장 근거로 보기보다 반복 가능성을 먼저 확인해야 합니다.`,
      causeEstimate: `최근 주차에 좋은 반응이 확인됐더라도 그것이 일시적 반등인지, 반복 가능한 강세 패턴인지는 아직 분리되지 않았을 수 있습니다.`,
      action: `최근 주차에 개선을 만든 세그먼트를 즉시 크게 확장하기보다, 동일 조건에서 소규모 반복 테스트를 진행해 강세의 재현 가능성을 먼저 확인합니다.`,
      expectedChange: `현재 초과 달성 흐름을 해치지 않으면서도, 이후 실제로 확장 가능한 주차 패턴을 더 신뢰도 있게 검증할 수 있습니다.`,
    };
  }

  return {
    id: "weekly-expansion",
    title: "최근 주차 확장 가설",
    axis: "week",
    confidence: "medium",
    currentProblem: `${latestName}의 ${metricName}가 ${formatMetricValue(snapshot.primaryMetric, latestMetric)}로, 직전 ${previousName} 대비 개선되었습니다.`,
    causeEstimate: `최근 주차에 효과가 확인된 세그먼트가 존재하지만 아직 그 구간이 전체 운영 기준으로 충분히 확대되지 않았을 수 있습니다.`,
    action: `최근 주차에 개선을 만든 세그먼트를 유지·확대하고, 동일 조건의 캠페인/소재/타겟 조합으로 확장 테스트를 진행합니다.`,
    expectedChange: `이미 개선이 확인된 패턴을 재사용해 남은 기간 동안 추가 ${metricName} 확보 확률을 높일 수 있습니다.`,
  };
}

function buildFallbackHypothesis(snapshot: GoalSnapshot): DecisionHypothesis {
  const metricName = metricLabel(snapshot.primaryMetric);
  const lowerBetter = isLowerBetterMetric(snapshot.primaryMetric);
  const aheadNoGap = isAheadNoGap(snapshot);

  if (aheadNoGap) {
    return {
      id: "fallback-structure",
      title: "성과 유지 검증 가설",
      axis: "campaign",
      confidence: "medium",
      currentProblem: `현재 ${metricName} 목표는 방어 중이지만, 어떤 축이 실제 초과 달성에 기여하는지 아직 충분히 분해되지 않았습니다.`,
      causeEstimate: `캠페인/주차 축 외에 추가 세그먼트 정보가 연결되면 초과 달성 유지에 필요한 핵심 구조를 더 정확히 확인할 수 있습니다.`,
      action: `우선 캠페인 상위 기여 구간과 최근 주차 흐름을 검증 중심으로 확인하고, 다음 단계에서 키워드/소재/채널 축으로 확장합니다.`,
      expectedChange: `현재 의사결정 레이어를 유지한 채, 공격적 변경 없이도 유지해야 할 구조와 검증이 필요한 구조를 자연스럽게 분리할 수 있습니다.`,
    };
  }

  return {
    id: "fallback-structure",
    title: "구조 점검 가설",
    axis: "campaign",
    confidence: "medium",
    currentProblem: lowerBetter
      ? `현재 ${metricName} 초과 리스크는 확인되지만, 세부 축별 편차를 확정할 충분한 데이터가 아직 부족합니다.`
      : `현재 ${metricName} 부족분은 확인되지만, 세부 축별 우선순위를 확정할 충분한 데이터가 아직 부족합니다.`,
    causeEstimate: `캠페인/주차 축 외에 추가 세그먼트 정보가 연결되면 더 정밀한 원인 분해가 가능해집니다.`,
    action: `우선 캠페인 상위 지출 구간과 최근 주차 흐름부터 점검하고, 다음 단계에서 키워드/소재/채널 축으로 확장합니다.`,
    expectedChange: `현재 의사결정 레이어를 유지한 채 다음 단계의 세분화 가설로 자연스럽게 연결할 수 있습니다.`,
  };
}

export function buildHypotheses(
  input: DecisionEngineInput,
  snapshot: GoalSnapshot,
): DecisionHypothesis[] {
  const hypotheses: DecisionHypothesis[] = [];

  hypotheses.push(buildBasePacingHypothesis(snapshot));

  const campaignHypothesis = buildCampaignEfficiencyHypothesis(
    snapshot,
    input.grouped.byCampaign,
  );
  if (campaignHypothesis) {
    hypotheses.push(campaignHypothesis);
  }

  const weeklyHypothesis = buildWeeklyTrendHypothesis(
    snapshot,
    input.grouped.byWeek,
  );
  if (weeklyHypothesis) {
    hypotheses.push(weeklyHypothesis);
  }

  while (hypotheses.length < 3) {
    const fallback = buildFallbackHypothesis(snapshot);
    if (!hypotheses.some((item) => item.id === fallback.id)) {
      hypotheses.push(fallback);
    } else {
      hypotheses.push({
        ...fallback,
        id: `${fallback.id}-${hypotheses.length + 1}`,
        title: "추가 운영 가설",
      });
    }
  }

  return hypotheses.slice(0, 3);
}