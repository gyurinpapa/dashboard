import { KRW } from "../format";
import type { ReportType } from "../types";

type AnyRow = Record<string, any>;

type BuildKeywordInsightArgs = {
  keywordAgg: AnyRow[];
  keywordBaseRows: AnyRow[];
  currentMonthActual: AnyRow; // summarize 결과 객체
  currentMonthGoalComputed: AnyRow; // summarize 결과 객체
  reportType?: ReportType;
};

export function buildKeywordInsight({
  keywordAgg,
  keywordBaseRows,
  currentMonthActual,
  currentMonthGoalComputed,
  reportType = "commerce",
}: BuildKeywordInsightArgs): string {
  // --- 안전 숫자 변환 ---
  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const pct100 = (v100: number) => `${v100.toFixed(1)}%`;

  const isTraffic = reportType === "traffic";
  const isDbAcquisition = reportType === "db_acquisition";

  // (A) 목표/결과 기반
  const goal = currentMonthGoalComputed as any;
  const actual = currentMonthActual as any;

  const goalCost = num(goal?.cost);
  const goalRev = num(goal?.revenue);
  const goalConv = num(goal?.conversions);
  const goalClicks = num(goal?.clicks);

  const actCost = num(actual?.cost);
  const actRev = num(actual?.revenue);
  const actConv = num(actual?.conversions);
  const actClicks = num(actual?.clicks);

  const goalROAS = goalCost > 0 ? goalRev / goalCost : 0;
  const actROAS = actCost > 0 ? actRev / actCost : 0;

  const goalCVR = goalClicks > 0 ? goalConv / goalClicks : 0;
  const actCVR = actClicks > 0 ? actConv / actClicks : 0;

  const goalCPA = goalConv > 0 ? goalCost / goalConv : 0;
  const actCPA = actConv > 0 ? actCost / actConv : 0;

  const progressConv = goalConv > 0 ? actConv / goalConv : 0;
  const progressRev = goalRev > 0 ? actRev / goalRev : 0;
  const progressCost = goalCost > 0 ? actCost / goalCost : 0;

  // (B) 키워드 집계에서 TOP/집중도 파악
  const kw = (keywordAgg || []).map((r: any) => ({
    keyword: String(r.keyword ?? r.label ?? r.name ?? ""),
    clicks: num(r.clicks),
    conversions: num(r.conversions ?? r.conv),
    roas: num(r.roas),
    cost: num(r.cost),
    revenue: num(r.revenue),
    avgPos:
      num((r as any).avgPosition) ||
      num((r as any).avg_position) ||
      num((r as any).avgRank) ||
      num((r as any).avg_rank),
  }));

  const sumClicks = kw.reduce((a, b) => a + b.clicks, 0);
  const sumConv = kw.reduce((a, b) => a + b.conversions, 0);
  const sumRevenue = kw.reduce((a, b) => a + b.revenue, 0);
  const sumCost = kw.reduce((a, b) => a + b.cost, 0);

  const top5Clicks = [...kw].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  const top5Conv = [...kw].sort((a, b) => b.conversions - a.conversions).slice(0, 5);
  const top5Revenue = [...kw].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const topClicksShare =
    sumClicks > 0 ? top5Clicks.reduce((a, b) => a + b.clicks, 0) / sumClicks : 0;
  const topConvShare =
    sumConv > 0 ? top5Conv.reduce((a, b) => a + b.conversions, 0) / sumConv : 0;
  const topRevenueShare =
    sumRevenue > 0 ? top5Revenue.reduce((a, b) => a + b.revenue, 0) / sumRevenue : 0;

  // (C) 원본 rows에서 소스/기기 요약
  const bySource = new Map<
    string,
    { clicks: number; conv: number; cost: number; rev: number }
  >();
  const byDevice = new Map<
    string,
    { clicks: number; conv: number; cost: number; rev: number }
  >();

  for (const r of keywordBaseRows as any[]) {
    const source = String(
      (r as any).source ?? (r as any).platform ?? (r as any).medium ?? "unknown"
    );
    const device = String((r as any).device ?? "unknown");
    const clicks = num((r as any).clicks);
    const conv = num((r as any).conversions ?? (r as any).conv);
    const cost = num((r as any).cost);
    const rev = num((r as any).revenue);

    const s = bySource.get(source) ?? { clicks: 0, conv: 0, cost: 0, rev: 0 };
    s.clicks += clicks;
    s.conv += conv;
    s.cost += cost;
    s.rev += rev;
    bySource.set(source, s);

    const d = byDevice.get(device) ?? { clicks: 0, conv: 0, cost: 0, rev: 0 };
    d.clicks += clicks;
    d.conv += conv;
    d.cost += cost;
    d.rev += rev;
    byDevice.set(device, d);
  }

  const pickBest = (
    m: Map<string, { clicks: number; conv: number; cost: number; rev: number }>,
    key: "rev" | "conv" | "clicks"
  ) => {
    const arr = Array.from(m.entries()).map(([k, v]) => ({ k, ...v }));
    arr.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
    return arr[0];
  };

  const pickLowestCpa = (
    m: Map<string, { clicks: number; conv: number; cost: number; rev: number }>
  ) => {
    const arr = Array.from(m.entries())
      .map(([k, v]) => ({
        k,
        ...v,
        cpa: v.conv > 0 ? v.cost / v.conv : 0,
      }))
      .filter((x) => x.conv > 0 && x.cpa > 0);

    arr.sort((a, b) => a.cpa - b.cpa);
    return arr[0];
  };

  const bestSource =
    pickBest(bySource, "rev") || pickBest(bySource, "conv") || pickBest(bySource, "clicks");
  const bestDevice =
    pickBest(byDevice, "rev") || pickBest(byDevice, "conv") || pickBest(byDevice, "clicks");

  const bestSourceConv = pickBest(bySource, "conv") || pickBest(bySource, "clicks");
  const bestDeviceConv = pickBest(byDevice, "conv") || pickBest(byDevice, "clicks");
  const bestSourceCpa = pickLowestCpa(bySource);
  const bestDeviceCpa = pickLowestCpa(byDevice);

  const bestSourceROAS = bestSource?.cost > 0 ? bestSource.rev / bestSource.cost : 0;
  const bestDeviceROAS = bestDevice?.cost > 0 ? bestDevice.rev / bestDevice.cost : 0;

  // (D) 평균노출순위가 있으면 사용
  const hasAvgPos = kw.some((x) => x.avgPos > 0);
  const avgPosRows = kw.filter((x) => x.avgPos > 0);
  const avgPosOverall = hasAvgPos
    ? avgPosRows.reduce((a, b) => a + b.avgPos, 0) / Math.max(1, avgPosRows.length)
    : 0;

  // --- 문장 구성 ---
  const lines: string[] = [];

  if (isTraffic) {
    lines.push(
      `- 키워드 분포는 클릭 Top5가 전체 클릭의 ${pct100(
        topClicksShare * 100
      )}를 차지해 상위 키워드 집중도가 높은 편입니다.`
    );

    if (bestSource?.k) {
      lines.push(
        `- 클릭 기준 성과 중심 소스는 ${bestSource.k}이며, 유입 확대 여력이 상대적으로 높습니다.`
      );
    }

    if (bestDevice?.k) {
      lines.push(
        `- 클릭 기준 성과 중심 기기는 ${bestDevice.k}이며, 해당 구간의 트래픽 반응을 우선 유지하는 것이 유리합니다.`
      );
    }

    if (hasAvgPos) {
      lines.push(
        `- 평균 노출 순위(추정)는 ${avgPosOverall.toFixed(
          2
        )}이며, 클릭 기여 키워드는 노출 유지, 반응이 낮은 키워드는 입찰·매칭타입 조정이 필요합니다.`
      );
    }

    lines.push("");
    lines.push(
      "- 클릭 기여도가 높은 키워드는 예산과 노출을 우선 배분해 트래픽 볼륨을 안정적으로 확대하는 방향이 적절합니다."
    );
    lines.push(
      "- 클릭은 높지만 후속 반응이 약한 키워드는 검색의도 재점검과 소재 메시지 분리가 필요합니다."
    );
    lines.push(
      "- 성과가 좋은 소스·기기 조합은 유지하고, 반응이 약한 구간은 입찰과 예산을 보수적으로 조정하는 운영이 유리합니다."
    );

    return lines.join("\n");
  }

  if (isDbAcquisition) {
    lines.push(
      `- 키워드 분포는 클릭 Top5가 전체 클릭의 ${pct100(
        topClicksShare * 100
      )}, 전환 Top5가 전체 전환의 ${pct100(
        topConvShare * 100
      )}를 차지해 전환 기여 키워드 집중도가 높은 편입니다.`
    );

    lines.push(
      `- 현재 전환 진행률은 ${pct100(
        progressConv * 100
      )}, 비용 진행률은 ${pct100(progressCost * 100)}이며, CVR은 ${pct100(
        actCVR * 100
      )}, CPA는 ${KRW(actCPA)} 수준입니다.`
    );

    if (bestSourceConv?.k) {
      lines.push(
        `- 전환 기여가 가장 높은 소스는 ${bestSourceConv.k}이며, 해당 구간은 리드 확보 중심으로 예산 우선순위를 두는 것이 적절합니다.`
      );
    }

    if (bestDeviceConv?.k) {
      lines.push(
        `- 전환 기여가 가장 높은 기기는 ${bestDeviceConv.k}이며, 해당 기기에서 DB 확보 효율이 상대적으로 우수합니다.`
      );
    }

    if (bestSourceCpa?.k) {
      lines.push(
        `- 효율 기준으로는 ${bestSourceCpa.k} 소스의 CPA가 가장 안정적이어서 추가 확장 후보로 볼 수 있습니다.`
      );
    }

    if (bestDeviceCpa?.k) {
      lines.push(
        `- 기기 기준으로는 ${bestDeviceCpa.k} 구간의 CPA가 가장 안정적이어서 우선 운영 구간으로 해석할 수 있습니다.`
      );
    }

    if (hasAvgPos) {
      lines.push(
        `- 평균 노출 순위(추정)는 ${avgPosOverall.toFixed(
          2
        )}이며, 전환 기여 키워드는 순위 유지가 유리하고 비전환 키워드는 입찰·매칭타입 조정으로 비용 통제가 필요합니다.`
      );
    }

    lines.push("");
    lines.push(
      "- 전환 Top 키워드는 현재 구조를 유지하면서 예산과 입찰을 점진적으로 확대해 DB 확보 볼륨을 늘리는 방향이 적절합니다."
    );
    lines.push(
      "- 클릭은 높지만 전환이 낮은 키워드는 의도 불일치 가능성이 있어 네거티브 확장과 랜딩 메시지 분리 테스트가 필요합니다."
    );
    lines.push(
      "- CPA가 안정적인 키워드는 동일 의도의 롱테일 확장과 별도 예산 분리로 효율을 보호하면서 확장하는 운영이 유리합니다."
    );
    lines.push(
      "- 비용 비중이 큰 구간은 상한 CPC와 매칭타입을 보수적으로 조정해 CPA 안정화를 우선해야 합니다."
    );
    lines.push(
      "- 소스·기기 편차가 큰 경우 전환이 잘 나오는 구간에 예산을 집중하고 약한 구간은 축소 재배분하는 것이 효율적입니다."
    );

    return lines.join("\n");
  }

  lines.push(
    `- 키워드 분포는 클릭 Top5가 전체 클릭의 ${pct100(
      topClicksShare * 100
    )}, 전환 Top5가 전체 전환의 ${pct100(
      topConvShare * 100
    )}, 매출 Top5가 전체 매출의 ${pct100(
      topRevenueShare * 100
    )}로 상위 키워드 집중도가 높은 편입니다.`
  );

  lines.push(
    `- 현재 전환 진행률은 ${pct100(progressConv * 100)}, 매출 진행률은 ${pct100(
      progressRev * 100
    )}, 비용 진행률은 ${pct100(progressCost * 100)}이며, ROAS는 ${pct100(
      actROAS * 100
    )}, CVR은 ${pct100(actCVR * 100)} 수준입니다.`
  );

  if (bestSource?.k) {
    lines.push(
      `- 성과 중심 소스는 ${bestSource.k}이며, 해당 구간 ROAS는 ${pct100(
        bestSourceROAS * 100
      )}입니다.`
    );
  }

  if (bestDevice?.k) {
    lines.push(
      `- 성과 중심 기기는 ${bestDevice.k}이며, 해당 구간 ROAS는 ${pct100(
        bestDeviceROAS * 100
      )}입니다.`
    );
  }

  if (hasAvgPos) {
    lines.push(
      `- 평균 노출 순위(추정)는 ${avgPosOverall.toFixed(
        2
      )}이며, 전환 기여 키워드는 순위 유지가 유리하고 비전환 키워드는 노출/입찰 조정으로 비용 통제가 필요합니다.`
    );
  }

  lines.push("");
  lines.push(
    "- 전환 Top 키워드는 현재 구조를 유지하면서 입찰을 점진적으로 상향해 전환 볼륨을 확대하는 방향이 적절합니다."
  );
  lines.push(
    "- 클릭은 높지만 전환이 낮은 키워드는 의도 불일치 가능성이 있어 네거티브 확장과 랜딩/소재 분리 테스트가 필요합니다."
  );
  lines.push(
    "- ROAS가 높은 키워드는 동일 의도의 롱테일 확장과 예산 분리를 통해 효율을 보호하면서 확장하는 운영이 유리합니다."
  );
  lines.push(
    "- 비용 비중이 큰 구간은 매칭 타입을 보수적으로 조정하고 상한 CPC를 설정해 CPA 안정화가 필요합니다."
  );
  lines.push(
    "- 소스/기기 편차가 큰 경우 성과가 좋은 구간에 예산을 집중하고 약한 구간은 노출·입찰을 낮춰 재배분하는 것이 효율적입니다."
  );

  return lines.join("\n");
}