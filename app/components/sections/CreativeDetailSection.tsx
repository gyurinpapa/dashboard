"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Row, ReportType } from "../../../src/lib/report/types";

import SummarySection from "./SummarySection";

import {
  summarize,
  groupBySource,
  groupByDevice,
  groupByWeekRecent5,
  groupByMonthRecent3,
} from "../../../src/lib/report/aggregate";

import {
  toSafeNumber,
  diffRatio,
  formatDeltaPercentFromRatio,
  formatPercentFromRate,
  formatPercentFromRoas,
} from "../../../src/lib/report/format";

/** =========================
 * Types / mode helpers
 * ========================= */
type ReportMode = "commerce" | "traffic" | "db_acquisition";

function resolveReportMode(reportType?: ReportMode): ReportMode {
  if (reportType === "traffic") return "traffic";
  if (reportType === "db_acquisition") return "db_acquisition";
  return "commerce";
}

/** =========================
 * Utils (안전 방어)
 * ========================= */
function safePct(n: number) {
  return formatPercentFromRate(n, 1);
}

function safePct0(n: number) {
  return formatPercentFromRate(n, 0);
}

function safeRoasPct0(n: number) {
  return formatPercentFromRoas(n, 0);
}

function signPct(n: number) {
  return formatDeltaPercentFromRatio(n, 1, "0.0%");
}

function pickDeviceLabel(raw: string) {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("mobile") || s === "m") return "모바일";
  if (s.includes("pc") || s.includes("desktop")) return "PC";
  if (s.includes("tablet")) return "태블릿";
  if (s.includes("unknown") || !s.trim()) return "미지정";
  return raw;
}

function getCreativeKey(r: Row) {
  const anyR = r as any;
  return (
    anyR.creativeName ||
    anyR.creative ||
    anyR.adCreative ||
    anyR.material ||
    anyR.asset ||
    anyR.adName ||
    anyR.creativeId ||
    anyR.adId ||
    ""
  )
    .toString()
    .trim();
}

/** ✅ 선택 소재 이미지 URL 추출 */
function getCreativePreviewUrl(r: Row) {
  const anyR = r as any;
  return (
    anyR.imagePath ||
    anyR.creativeImageUrl ||
    anyR.thumbnailUrl ||
    anyR.thumbUrl ||
    anyR.imageUrl ||
    anyR.previewUrl ||
    anyR.assetUrl ||
    ""
  )
    .toString()
    .trim();
}

/** ✅ 절대 안 터지는 safe wrappers */
function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.error(e);
    return fallback;
  }
}

function normalizeDateKey(value: any): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const compact = raw
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, "");
  const matched = compact.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (matched) {
    const [, y, m, d] = matched;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }

  return "";
}

function extractRowDateKey(row: Row): string {
  const anyR = row as any;
  const candidates = [
    anyR.dateKey,
    anyR.date,
    anyR.day,
    anyR.ymd,
    anyR.reportDate,
    anyR.segmentDate,
    anyR.daily,
    anyR["일자"],
    anyR["날짜"],
    anyR["date"],
  ];

  for (const value of candidates) {
    const normalized = normalizeDateKey(value);
    if (normalized) return normalized;
  }

  return "";
}

function groupByDayFromRows(rows: Row[]) {
  const map = new Map<string, Row[]>();

  for (const row of rows) {
    const dateKey = extractRowDateKey(row);
    if (!dateKey) continue;

    const bucket = map.get(dateKey) ?? [];
    bucket.push(row);
    map.set(dateKey, bucket);
  }

  return Array.from(map.entries())
    .map(([dateKey, bucket]) => {
      const s = safeCall(
        () => summarize(bucket as any),
        {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          revenue: 0,
          ctr: 0,
          cpc: 0,
          cvr: 0,
          cpa: 0,
          roas: 0,
        } as any
      );

      return {
        date: dateKey,
        dateKey,
        label: dateKey,
        impressions: toSafeNumber((s as any)?.impressions ?? (s as any)?.impr),
        impr: toSafeNumber((s as any)?.impressions ?? (s as any)?.impr),
        clicks: toSafeNumber((s as any)?.clicks),
        ctr: toSafeNumber((s as any)?.ctr),
        cpc: toSafeNumber((s as any)?.cpc),
        cost: toSafeNumber((s as any)?.cost),
        conversions: toSafeNumber(
          (s as any)?.conversions ?? (s as any)?.conv
        ),
        conv: toSafeNumber((s as any)?.conversions ?? (s as any)?.conv),
        cvr: toSafeNumber((s as any)?.cvr),
        cpa: toSafeNumber((s as any)?.cpa),
        revenue: toSafeNumber((s as any)?.revenue),
        roas: toSafeNumber((s as any)?.roas),
      };
    })
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
}

/** =========================
 * Badge helpers (TOP3)
 * ========================= */
type BadgeKey = "ctr" | "conversions" | "roas" | "cpa";

const BADGE_META: Record<BadgeKey, { label: string; className: string }> = {
  ctr: { label: "TOP CTR", className: "border border-[#B7D7E3] bg-[#B7D7E3]/18 text-[#5F87A3]" },
  conversions: { label: "TOP 전환", className: "border border-[#B7D7E3] bg-[#7FA6C4]/12 text-[#4F7F9E]" },
  roas: { label: "TOP ROAS", className: "border border-[#B7D7E3] bg-[#B7D7E3]/16 text-[#4F7F9E]" },
  cpa: { label: "TOP CPA", className: "border border-[#CFC2B1] bg-[#F3E4D2]/28 text-[#7B7166]" },
};

const BadgePill = memo(function BadgePill({ k }: { k: BadgeKey }) {
  const meta = BADGE_META[k];
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.className,
      ].join(" ")}
      title={meta.label}
    >
      {meta.label}
    </span>
  );
});

/** =========================
 * Insight
 * ========================= */
function buildCreativeDetailInsight(args: {
  reportMode: ReportMode;
  creative: string | null;
  allSummary: any;
  selectedSummary: any;
  creativePerfList: CreativePerf[];
  byWeekOnly: any[];
  bySource: any[];
  byDevice: any[];
}) {
  const {
    reportMode,
    creative,
    allSummary,
    selectedSummary,
    creativePerfList,
    byWeekOnly,
    bySource,
    byDevice,
  } = args;

  if (!creative) {
    return {
      title: "선택 소재 요약 인사이트",
      bullets: [
        "소재를 선택하면 해당 소재의 실적/기여도/추세/기기 근거 기반 인사이트가 표시됩니다.",
      ],
      actions: [],
    };
  }

  const all = allSummary ?? {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
    ctr: 0,
    cpc: 0,
    cvr: 0,
    cpa: 0,
    roas: 0,
  };

  const me = selectedSummary ?? {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
    ctr: 0,
    cpc: 0,
    cvr: 0,
    cpa: 0,
    roas: 0,
  };

  const selectedPerf =
    creativePerfList.find((item) => item.creative === creative) ?? {
      creative,
      impressions: toSafeNumber((me as any)?.impressions ?? (me as any)?.impr),
      clicks: toSafeNumber((me as any)?.clicks),
      cost: toSafeNumber((me as any)?.cost),
      conversions: toSafeNumber(
        (me as any)?.conversions ?? (me as any)?.conv
      ),
      revenue: toSafeNumber((me as any)?.revenue),
      ctr: toSafeNumber((me as any)?.ctr),
      cpc: toSafeNumber((me as any)?.cpc),
      cvr: toSafeNumber((me as any)?.cvr),
      cpa: toSafeNumber((me as any)?.cpa),
      roas: toSafeNumber((me as any)?.roas),
    };

  const getRankInfo = (
    metric: "ctr" | "clicks" | "conversions" | "roas" | "cpa",
    lowerIsBetter = false
  ) => {
    const selectedValue = toSafeNumber((selectedPerf as any)[metric]);
    const sorted = [...creativePerfList]
      .filter((item) => {
        const value = toSafeNumber((item as any)[metric]);
        if (metric === "cpa") return value > 0;
        return value >= 0;
      })
      .sort((a, b) => {
        const av = toSafeNumber((a as any)[metric]);
        const bv = toSafeNumber((b as any)[metric]);
        return lowerIsBetter ? av - bv : bv - av;
      });

    const rankIndex = sorted.findIndex((item) => item.creative === creative);
    const rank = rankIndex >= 0 ? rankIndex + 1 : 0;
    const count = sorted.length;
    const values = sorted.map((item) => toSafeNumber((item as any)[metric]));
    const avg =
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;

    const top = sorted[0] ?? null;
    const topValue = top ? toSafeNumber((top as any)[metric]) : 0;
    const percentile = count > 0 && rank > 0 ? rank / count : 1;

    const grade =
      count < 2 || rank <= 0
        ? "비교 제한"
        : percentile <= 0.25
          ? "우수"
          : percentile <= 0.5
            ? "보통 이상"
            : percentile <= 0.75
              ? "보통"
              : "열위";

    return {
      selectedValue,
      rank,
      count,
      avg,
      topCreative: top ? String(top.creative) : "",
      topValue,
      grade,
    };
  };

  const formatMetricValue = (
    metric: "ctr" | "clicks" | "conversions" | "roas" | "cpa",
    value: number
  ) => {
    if (metric === "ctr") return safePct(value);
    if (metric === "roas") return safeRoasPct0(value);
    if (metric === "cpa") return `${Math.round(value).toLocaleString()}원`;
    if (metric === "conversions") return value.toFixed(1);
    return Math.round(value).toLocaleString();
  };

  const buildCompareLine = (
    label: string,
    metric: "ctr" | "clicks" | "conversions" | "roas" | "cpa",
    rankInfo: ReturnType<typeof getRankInfo>
  ) => {
    if (rankInfo.count < 2 || rankInfo.rank <= 0) {
      return `${label} 비교: 비교 가능한 등록 소재가 부족하여 객관적 순위 판단은 제한적입니다. 현재 값은 ${formatMetricValue(
        metric,
        rankInfo.selectedValue
      )}입니다.`;
    }

    const avgText = formatMetricValue(metric, rankInfo.avg);
    const selectedText = formatMetricValue(metric, rankInfo.selectedValue);
    const topText = formatMetricValue(metric, rankInfo.topValue);

    return `${label} 비교: 전체 ${rankInfo.count}개 소재 중 ${rankInfo.rank}위(${rankInfo.grade})입니다. 선택 소재 ${selectedText}, 전체 평균 ${avgText}, 1위 “${rankInfo.topCreative}” ${topText} 기준으로 판단했습니다.`;
  };

  const ctrRank = getRankInfo("ctr");
  const clickRank = getRankInfo("clicks");
  const convRank = getRankInfo("conversions");
  const roasRank = getRankInfo("roas");
  const cpaRank = getRankInfo("cpa", true);

  const shareCost = all.cost ? toSafeNumber(me.cost) / toSafeNumber(all.cost) : 0;
  const shareRev = all.revenue
    ? toSafeNumber(me.revenue) / toSafeNumber(all.revenue)
    : 0;
  const shareConv = all.conversions
    ? toSafeNumber(me.conversions) / toSafeNumber(all.conversions)
    : 0;
  const shareClick = all.clicks
    ? toSafeNumber(me.clicks) / toSafeNumber(all.clicks)
    : 0;
  const shareImpr = all.impressions
    ? toSafeNumber(me.impressions) / toSafeNumber(all.impressions)
    : 0;

  const weeks = [...(byWeekOnly || [])].sort((a, b) =>
    String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
  );
  const wLast = weeks.length ? weeks[weeks.length - 1] : null;
  const wPrev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;

  const roasWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.roas), toSafeNumber(wPrev.roas)) ?? 0
      : 0;
  const clickWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.clicks), toSafeNumber(wPrev.clicks)) ?? 0
      : 0;
  const convWoW =
    wLast && wPrev
      ? diffRatio(
          toSafeNumber(wLast.conversions),
          toSafeNumber(wPrev.conversions)
        ) ?? 0
      : 0;
  const costWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.cost), toSafeNumber(wPrev.cost)) ?? 0
      : 0;
  const ctrWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.ctr), toSafeNumber(wPrev.ctr)) ?? 0
      : 0;
  const cvrWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.cvr), toSafeNumber(wPrev.cvr)) ?? 0
      : 0;
  const cpaWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.cpa), toSafeNumber(wPrev.cpa)) ?? 0
      : 0;

  const sources = [...(bySource || [])].sort(
    (a, b) => toSafeNumber(b.cost) - toSafeNumber(a.cost)
  );
  const topS1 = sources[0] ?? null;
  const topS2 = sources[1] ?? null;

  const devices = [...(byDevice || [])].sort(
    (a, b) => toSafeNumber(b.cost) - toSafeNumber(a.cost)
  );
  const topD1 = devices[0] ?? null;
  const topD2 = devices[1] ?? null;

  const bullets: string[] = [];
  const actions: string[] = [];

  if (reportMode === "traffic") {
    const trendLabel =
      wLast && wPrev
        ? `최근 1주 기준: CTR ${signPct(ctrWoW)}, 클릭 ${signPct(
            clickWoW
          )}, 광고비 ${signPct(costWoW)}`
        : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

    bullets.push(
      `선택 소재 “${creative}” 성과: 노출 ${Math.round(
        toSafeNumber(me.impressions)
      )} / 클릭 ${Math.round(
        toSafeNumber(me.clicks)
      )} / CTR ${safePct(toSafeNumber(me.ctr))}`
    );
    bullets.push(buildCompareLine("CTR", "ctr", ctrRank));
    bullets.push(buildCompareLine("클릭수", "clicks", clickRank));
    bullets.push(
      `기여도(현재 탭 범위 대비): 노출 ${safePct(shareImpr)}, 클릭 ${safePct(
        shareClick
      )}, 비용 ${safePct(shareCost)}`
    );
    bullets.push(trendLabel);

    if (topD1) {
      const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
      const d1Ctr = toSafeNumber(topD1.ctr);
      let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(CTR ${safePct(d1Ctr)}).`;

      if (topD2) {
        const d2 = pickDeviceLabel(String(topD2.device ?? "unknown"));
        const d2Ctr = toSafeNumber(topD2.ctr);
        deviceLine += ` 비교: “${d2}” CTR ${safePct(d2Ctr)}.`;
      }

      bullets.push(deviceLine);
    } else {
      bullets.push("기기별: 데이터가 부족하여 비교가 제한적입니다.");
    }

    if (ctrRank.grade === "우수" || ctrRank.grade === "보통 이상") {
      actions.push(
        `클릭 운영: CTR이 전체 소재 대비 ${ctrRank.grade} 구간입니다. 현재 훅/썸네일/CTA 방향은 유지하고, 동일 메시지를 다른 포맷으로 복제해 노출을 확장하세요.`
      );
    } else {
      actions.push(
        `클릭 개선: CTR이 전체 소재 대비 ${ctrRank.grade} 구간입니다. 선택 소재는 확장보다 첫 화면 훅, 헤드라인, CTA 문구를 우선 교체 테스트해야 합니다.`
      );
    }

    if (clickRank.grade === "우수" || clickRank.grade === "보통 이상") {
      actions.push(
        `클릭 볼륨: 클릭수가 전체 소재 대비 ${clickRank.grade}입니다. 반응이 확인된 소재이므로 예산 확대 전 빈도·도달 중복만 점검하세요.`
      );
    } else {
      actions.push(
        `클릭 볼륨: 클릭수가 전체 소재 대비 ${clickRank.grade}입니다. 낮은 CTR 때문인지, 노출 부족 때문인지 분리해 예산/소재 문제를 따로 판단하세요.`
      );
    }

    if (topS1) {
      actions.push(
        `소스 기준: 비용 상위 “${String(topS1.source)}”(CTR ${safePct(
          toSafeNumber(topS1.ctr)
        )})를 중심으로 예산/세팅 최적화를 우선하세요.`
      );
    }

    if (topS2) {
      actions.push(
        `소스 비교: 2순위 “${String(topS2.source)}”(CTR ${safePct(
          toSafeNumber(topS2.ctr)
        )})와 함께 유지/축소 기준을 명확히 하세요.`
      );
    }

    return { title: "선택 소재 요약 인사이트", bullets, actions };
  }

  if (reportMode === "db_acquisition") {
    const trendLabel =
      wLast && wPrev
        ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 전환 ${signPct(
            convWoW
          )}, CVR ${signPct(cvrWoW)}, CPA ${signPct(cpaWoW)}`
        : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

    bullets.push(
      `선택 소재 “${creative}” 성과: 클릭 ${Math.round(
        toSafeNumber(me.clicks)
      )} / 전환 ${toSafeNumber(me.conversions).toFixed(
        1
      )} / CPA ${Math.round(toSafeNumber(me.cpa)).toLocaleString()}원`
    );
    bullets.push(buildCompareLine("CTR", "ctr", ctrRank));
    bullets.push(buildCompareLine("전환수", "conversions", convRank));
    bullets.push(buildCompareLine("CPA", "cpa", cpaRank));
    bullets.push(
      `기여도(현재 탭 범위 대비): 비용 ${safePct(shareCost)}, 전환 ${safePct(
        shareConv
      )}, 클릭 ${safePct(shareClick)}`
    );
    bullets.push(trendLabel);

    if (topD1) {
      const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
      const d1Cpa = toSafeNumber(topD1.cpa);
      const d1Cvr = toSafeNumber(topD1.cvr);

      let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(CPA ${Math.round(
        d1Cpa
      ).toLocaleString()}원, CVR ${safePct(d1Cvr)}).`;

      if (topD2) {
        const d2 = pickDeviceLabel(String(topD2.device ?? "unknown"));
        const d2Cpa = toSafeNumber(topD2.cpa);
        deviceLine += ` 비교: “${d2}” CPA ${Math.round(d2Cpa).toLocaleString()}원.`;
      }

      bullets.push(deviceLine);
    } else {
      bullets.push("기기별: 데이터가 부족하여 비교가 제한적입니다.");
    }

    if (ctrRank.grade === "열위" || ctrRank.grade === "보통") {
      actions.push(
        `클릭 개선: CTR이 전체 소재 대비 ${ctrRank.grade}입니다. DB 확보용 메시지의 문제를 먼저 의심하고, 혜택/조건/긴급성/CTA를 분리 테스트하세요.`
      );
    } else {
      actions.push(
        `클릭 유지: CTR이 전체 소재 대비 ${ctrRank.grade}입니다. 유입 반응은 확보되어 있으므로 클릭 확장보다 전환 품질 점검을 우선하세요.`
      );
    }

    if (convRank.grade === "우수" || convRank.grade === "보통 이상") {
      actions.push(
        `전환 확대: 전환수가 전체 소재 대비 ${convRank.grade}입니다. 동일 콘셉트의 파생 소재를 만들고, 전환이 발생한 소스/기기 조합에 예산을 더 배분하세요.`
      );
    } else {
      actions.push(
        `전환 개선: 전환수가 전체 소재 대비 ${convRank.grade}입니다. 클릭 이후 랜딩 메시지 일치도, 폼 길이, 상담 CTA 가시성을 먼저 점검하세요.`
      );
    }

    if (cpaRank.grade === "우수" || cpaRank.grade === "보통 이상") {
      actions.push(
        `CPA 운영: CPA가 전체 소재 대비 ${cpaRank.grade}입니다. 비용 확대 여지가 있으나, 증액 후 CPA가 평균선 이상으로 악화되는지 주간 단위로 감시하세요.`
      );
    } else {
      actions.push(
        `CPA 안정화: CPA가 전체 소재 대비 ${cpaRank.grade}입니다. 즉시 확장보다 저효율 소스/기기/시간대를 분리하고 비용 누수를 먼저 줄이세요.`
      );
    }

    if (topS1) {
      actions.push(
        `소스 기준: 비용 상위 “${String(topS1.source)}”(CPA ${Math.round(
          toSafeNumber(topS1.cpa)
        ).toLocaleString()}원)를 중심으로 예산/세팅 최적화를 우선하세요.`
      );
    }
    if (topS2) {
      actions.push(
        `소스 비교: 2순위 “${String(topS2.source)}”(CPA ${Math.round(
          toSafeNumber(topS2.cpa)
        ).toLocaleString()}원)와 함께 유지/축소 기준을 명확히 하세요.`
      );
    }

    return { title: "선택 소재 요약 인사이트", bullets, actions };
  }

  const trendLabel =
    wLast && wPrev
      ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 전환 ${signPct(
          convWoW
        )}, ROAS ${signPct(roasWoW)} (비용 ${signPct(costWoW)})`
      : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

  bullets.push(
    `선택 소재 “${creative}” 성과: 클릭 ${Math.round(
      toSafeNumber(me.clicks)
    )} / 전환 ${toSafeNumber(me.conversions).toFixed(
      1
    )} / ROAS ${safeRoasPct0(toSafeNumber(me.roas))}`
  );
  bullets.push(buildCompareLine("CTR", "ctr", ctrRank));
  bullets.push(buildCompareLine("전환수", "conversions", convRank));
  bullets.push(buildCompareLine("ROAS", "roas", roasRank));
  bullets.push(
    `기여도(현재 탭 범위 대비): 비용 ${safePct(shareCost)}, 전환 ${safePct(
      shareConv
    )}, 매출 ${safePct(shareRev)}`
  );
  bullets.push(trendLabel);

  if (topD1) {
    const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
    const d1Roas = toSafeNumber(topD1.roas);
    const d1Cvr = toSafeNumber(topD1.cvr);
    const d1Ctr = toSafeNumber(topD1.ctr);

    let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(ROAS ${safeRoasPct0(
      d1Roas
    )}, CTR ${safePct(d1Ctr)}, CVR ${safePct(d1Cvr)}).`;

    if (topD2) {
      const d2 = pickDeviceLabel(String(topD2.device ?? "unknown"));
      const d2Roas = toSafeNumber(topD2.roas);
      deviceLine += ` 비교: “${d2}” ROAS ${safeRoasPct0(d2Roas)}.`;
    }

    bullets.push(deviceLine);
  } else {
    bullets.push("기기별: 데이터가 부족하여 비교가 제한적입니다.");
  }

  if (ctrRank.grade === "열위" || ctrRank.grade === "보통") {
    actions.push(
      `클릭 개선: CTR이 전체 소재 대비 ${ctrRank.grade}입니다. 현재 소재는 확장보다 썸네일/첫 프레임/상품 베네핏/CTA를 먼저 교체 테스트하세요.`
    );
  } else {
    actions.push(
      `클릭 확장: CTR이 전체 소재 대비 ${ctrRank.grade}입니다. 상위 반응 요소를 유지한 채 이미지/영상/카피 변형 소재로 노출을 확장하세요.`
    );
  }

  if (convRank.grade === "우수" || convRank.grade === "보통 이상") {
    actions.push(
      `전환 운영: 전환수가 전체 소재 대비 ${convRank.grade}입니다. 구매 의도가 확인된 소재이므로 전환 상위 소스/기기 조합으로 예산을 집중하세요.`
    );
  } else {
    actions.push(
      `전환 개선: 전환수가 전체 소재 대비 ${convRank.grade}입니다. 클릭 대비 구매 설득력이 약할 수 있으므로 상세페이지 첫 화면, 가격/혜택, 리뷰 신뢰 요소를 점검하세요.`
    );
  }

  if (roasRank.grade === "우수" || roasRank.grade === "보통 이상") {
    actions.push(
      `ROAS 확대: ROAS가 전체 소재 대비 ${roasRank.grade}입니다. 단기 확장 후보로 두되, 증액 후 전환수와 ROAS가 동시에 유지되는지 확인하세요.`
    );
  } else {
    actions.push(
      `ROAS 방어: ROAS가 전체 소재 대비 ${roasRank.grade}입니다. 즉시 예산 확대는 보류하고, 매출 기여가 낮은 소스/기기/상품 조합을 축소하세요.`
    );
  }

  if (topS1) {
    actions.push(
      `소스 기준: 비용 상위 “${String(topS1.source)}”(ROAS ${safeRoasPct0(
        toSafeNumber(topS1.roas)
      )})를 중심으로 예산/세팅 최적화를 우선하세요.`
    );
  }
  if (topS2) {
    actions.push(
      `소스 비교: 2순위 “${String(topS2.source)}”(ROAS ${safeRoasPct0(
        toSafeNumber(topS2.roas)
      )})와 함께 유지/축소 기준을 명확히 하세요.`
    );
  }

  return { title: "선택 소재 요약 인사이트", bullets, actions };
}

/** =========================
 * Component
 * ========================= */
type CreativeDetailSlideIndex = 0 | 1 | 2;

type Props = {
  reportType?: ReportMode;
  rows: Row[];
  /**
   * 일반 웹의 소재(상세) 슬라이드 전환용.
   * 전달하지 않으면 기존 전체 콘텐츠를 연속 렌더해 export 경로를 보존한다.
   */
  activeSlide?: CreativeDetailSlideIndex;
};

type CreativePerf = {
  creative: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  ctr: number;
  roas: number;
  cpa: number;
};

type CreativePreviewMeta = {
  url: string;
};

type CreativeIndexData = {
  creativeRowsMap: Map<string, Row[]>;
  previewMetaByCreative: Map<string, CreativePreviewMeta>;
  perfList: CreativePerf[];
  insightPerfList: CreativePerf[];
  creatives: string[];
};

type CreativeOptionButtonProps = {
  creative: string;
  active: boolean;
  badges: BadgeKey[];
  previewUrl: string;
  onSelect: (creative: string) => void;
};

const CreativeOptionButton = memo(function CreativeOptionButton({
  creative,
  active,
  badges,
  previewUrl,
  onSelect,
}: CreativeOptionButtonProps) {
  const handleClick = useCallback(() => {
    onSelect(creative);
  }, [onSelect, creative]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        "group relative block w-full overflow-hidden rounded-[16px] border text-left",
        active
          ? "border-[#7FA6C4] bg-[#B7D7E3]/14 shadow-[0_4px_14px_rgba(127,166,196,0.08)]"
          : "border-[#CFC2B1]/55 bg-white hover:border-[#7FA6C4]/70 hover:bg-[#B7D7E3]/10",
      ].join(" ")}
      title={creative}
    >
      <div
        className={[
          "absolute inset-y-0 left-0 w-[3px]",
          active ? "bg-[#7FA6C4]" : "bg-transparent group-hover:bg-[#B7D7E3]",
        ].join(" ")}
      />

      <div className="flex items-start gap-3 px-3.5 py-3.5">
        <div className="shrink-0">
          <div className="overflow-hidden rounded-[10px] border border-slate-200 bg-slate-50">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={creative}
                className="h-12 w-12 object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center text-[10px] font-semibold text-slate-400">
                NO
                <br />
                IMG
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className={[
                  "truncate text-sm font-semibold",
                  active ? "text-slate-900" : "text-slate-800",
                ].join(" ")}
              >
                {creative}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {previewUrl ? "이미지 미리보기 가능" : "이미지 미리보기 없음"}
              </div>
            </div>

            <div
              className={[
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                active
                  ? "border border-[#B7D7E3] bg-[#B7D7E3]/16 text-[#5F87A3]"
                  : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {active ? "선택됨" : "선택"}
            </div>
          </div>

          {badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {badges.slice(0, 3).map((b) => (
                <span
                  key={b}
                  className={[
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    active
                      ? "border border-[#B7D7E3] bg-white text-slate-700"
                      : BADGE_META[b].className,
                  ].join(" ")}
                >
                  {BADGE_META[b].label}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-slate-400">
              성과 배지 없음
            </div>
          )}
        </div>
      </div>
    </button>
  );
});

type SideThumbButtonProps = {
  creative: string;
  url: string;
  onSelect: (creative: string) => void;
};

const SideThumbButton = memo(function SideThumbButton({
  creative,
  url,
  onSelect,
}: SideThumbButtonProps) {
  const handleClick = useCallback(() => {
    onSelect(creative);
  }, [onSelect, creative]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="overflow-hidden rounded-[10px] border border-gray-200 bg-white hover:border-[#7FA6C4]/70"
      title={creative}
    >
      <img
        src={url}
        alt={creative}
        className="h-16 w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </button>
  );
});

function buildCreativeIndex(rows: Row[]): CreativeIndexData {
  const creativeRowsMap = new Map<string, Row[]>();
  const previewMetaByCreative = new Map<string, CreativePreviewMeta>();
  const perfAccumulator = new Map<string, Omit<CreativePerf, "ctr" | "roas" | "cpa">>();

  for (const row of rows ?? []) {
    const creative = getCreativeKey(row);
    if (!creative) continue;

    const existingRows = creativeRowsMap.get(creative);
    if (existingRows) {
      existingRows.push(row);
    } else {
      creativeRowsMap.set(creative, [row]);
    }

    if (!previewMetaByCreative.has(creative)) {
      previewMetaByCreative.set(creative, {
        url: getCreativePreviewUrl(row),
      });
    }

    const anyR = row as any;
    const impr = toSafeNumber(anyR.impressions ?? anyR.impr ?? anyR.imp ?? 0);
    const clk = toSafeNumber(anyR.clicks ?? anyR.clk ?? anyR.click ?? 0);
    const cost = toSafeNumber(anyR.cost ?? 0);
    const conv = toSafeNumber(anyR.conversions ?? anyR.conv ?? 0);
    const rev = toSafeNumber(anyR.revenue ?? 0);

    const prev = perfAccumulator.get(creative) ?? {
      creative,
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      revenue: 0,
    };

    prev.impressions += impr;
    prev.clicks += clk;
    prev.cost += cost;
    prev.conversions += conv;
    prev.revenue += rev;

    perfAccumulator.set(creative, prev);
  }

  const creatives = Array.from(creativeRowsMap.keys()).sort((a, b) =>
    a.localeCompare(b, "ko")
  );

  const perfList: CreativePerf[] = Array.from(perfAccumulator.values()).map((x) => {
    const ctr = x.impressions > 0 ? x.clicks / x.impressions : 0;
    const roas = x.cost > 0 ? x.revenue / x.cost : 0;
    const cpa = x.conversions > 0 ? x.cost / x.conversions : 0;

    return {
      ...x,
      ctr,
      roas,
      cpa,
    };
  });

  /**
   * 선택 소재가 바뀔 때마다 전체 rows를 다시 그룹화·요약하지 않도록
   * 기존 summarize 기준의 비교용 성과 목록을 rows 변경 시 한 번만 만든다.
   */
  const insightPerfList: CreativePerf[] = Array.from(
    creativeRowsMap.entries(),
  ).map(([creative, bucket]) => {
    const summary = safeCall(
      () => summarize(bucket as any),
      {
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
        cpc: 0,
        cvr: 0,
        cpa: 0,
        roas: 0,
      } as any,
    );

    return {
      creative,
      impressions: toSafeNumber(
        (summary as any)?.impressions ?? (summary as any)?.impr,
      ),
      clicks: toSafeNumber((summary as any)?.clicks),
      cost: toSafeNumber((summary as any)?.cost),
      conversions: toSafeNumber(
        (summary as any)?.conversions ?? (summary as any)?.conv,
      ),
      revenue: toSafeNumber((summary as any)?.revenue),
      ctr: toSafeNumber((summary as any)?.ctr),
      roas: toSafeNumber((summary as any)?.roas),
      cpa: toSafeNumber((summary as any)?.cpa),
    };
  });

  return {
    creativeRowsMap,
    previewMetaByCreative,
    perfList,
    insightPerfList,
    creatives,
  };
}

function buildBadgeMap(perfList: CreativePerf[], reportMode: ReportMode) {
  const map = new Map<string, BadgeKey[]>();

  const top3Desc = (key: BadgeKey) => {
    const sorted = [...perfList].sort((a, b) => {
      const av = toSafeNumber((a as any)[key]);
      const bv = toSafeNumber((b as any)[key]);
      return bv - av;
    });

    const picked = sorted
      .filter((x) => toSafeNumber((x as any)[key]) > 0)
      .slice(0, 3);

    for (const it of picked) {
      const prev = map.get(it.creative) ?? [];
      if (!prev.includes(key)) prev.push(key);
      map.set(it.creative, prev);
    }
  };

  const top3Asc = (key: BadgeKey) => {
    const sorted = [...perfList].sort((a, b) => {
      const av = toSafeNumber((a as any)[key]);
      const bv = toSafeNumber((b as any)[key]);
      return av - bv;
    });

    const picked = sorted
      .filter((x) => toSafeNumber((x as any)[key]) > 0)
      .slice(0, 3);

    for (const it of picked) {
      const prev = map.get(it.creative) ?? [];
      if (!prev.includes(key)) prev.push(key);
      map.set(it.creative, prev);
    }
  };

  if (reportMode === "traffic") {
    top3Desc("ctr");
    return map;
  }

  top3Desc("conversions");

  if (reportMode === "db_acquisition") {
    top3Desc("ctr");
    top3Asc("cpa");
    return map;
  }

  top3Desc("ctr");
  top3Desc("roas");
  return map;
}

export default function CreativeDetailSection({
  reportType,
  rows,
  activeSlide,
}: Props) {
  const reportMode = resolveReportMode(reportType);

  const {
    creativeRowsMap,
    previewMetaByCreative,
    perfList,
    insightPerfList,
    creatives,
  } = useMemo(() => buildCreativeIndex(rows), [rows]);

  const creativeSet = useMemo(() => new Set(creatives), [creatives]);

  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  const handleSelectCreative = useCallback((creative: string) => {
    setSelectedCreative((prev) => (prev === creative ? prev : creative));
  }, []);

  useEffect(() => {
    if (!selectedCreative && creatives.length > 0) {
      setSelectedCreative(creatives[0]);
      return;
    }

    if (selectedCreative && !creativeSet.has(selectedCreative)) {
      setSelectedCreative(creatives[0] ?? null);
    }
  }, [creatives, creativeSet, selectedCreative]);

  const badgeMap = useMemo(
    () => buildBadgeMap(perfList, reportMode),
    [perfList, reportMode]
  );

  const selectedBadges = useMemo(() => {
    if (!selectedCreative) return [] as BadgeKey[];
    return badgeMap.get(selectedCreative) ?? [];
  }, [badgeMap, selectedCreative]);

  const filteredCreatives = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return creatives;
    return creatives.filter((name) => String(name).toLowerCase().includes(q));
  }, [creatives, searchText]);

  const filteredRows = useMemo(() => {
    if (!selectedCreative) return rows;
    return creativeRowsMap.get(selectedCreative) ?? [];
  }, [rows, selectedCreative, creativeRowsMap]);

  const byDay = useMemo(() => groupByDayFromRows(filteredRows), [filteredRows]);

  const selectedPreviewUrl = useMemo(() => {
    if (!selectedCreative) return "";
    return previewMetaByCreative.get(selectedCreative)?.url ?? "";
  }, [previewMetaByCreative, selectedCreative]);

  const sideThumbs = useMemo(() => {
    if (!creatives.length) return [] as { creative: string; url: string }[];

    const idx = selectedCreative ? creatives.indexOf(selectedCreative) : -1;
    const start = idx >= 0 ? idx + 1 : 0;

    const rotated = [
      ...creatives.slice(start),
      ...creatives.slice(0, start),
    ].filter((c) => c !== selectedCreative);

    const out: { creative: string; url: string }[] = [];
    for (const creative of rotated) {
      const url = previewMetaByCreative.get(creative)?.url ?? "";
      if (url) out.push({ creative, url });
      if (out.length >= 4) break;
    }
    return out;
  }, [creatives, previewMetaByCreative, selectedCreative]);

  const allRowsSummary = useMemo(
    () =>
      safeCall(
        () => summarize(rows as any),
        {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          revenue: 0,
          ctr: 0,
          cpc: 0,
          cvr: 0,
          cpa: 0,
          roas: 0,
        } as any,
      ),
    [rows],
  );

  const totals = useMemo(
    () =>
      safeCall(
        () => summarize(filteredRows as any),
        {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          revenue: 0,
          ctr: 0,
          cpc: 0,
          cvr: 0,
          cpa: 0,
          roas: 0,
        } as any
      ),
    [filteredRows]
  );

  const bySource = useMemo(
    () => safeCall(() => groupBySource(filteredRows as any), [] as any[]),
    [filteredRows]
  );

  const byDevice = useMemo(
    () => safeCall(() => groupByDevice(filteredRows as any), [] as any[]),
    [filteredRows]
  );

  const byWeekOnly = useMemo(
    () => safeCall(() => groupByWeekRecent5(filteredRows as any), [] as any[]),
    [filteredRows]
  );

  const byWeekChart = useMemo(() => {
    const arr = [...(byWeekOnly || [])];
    arr.sort((a, b) =>
      String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
    );
    return arr;
  }, [byWeekOnly]);

  const byMonth = useMemo(
    () =>
      safeCall(
        () =>
          groupByMonthRecent3({
            rows: filteredRows as any,
            selectedMonth: "all",
            selectedDevice: "all",
            selectedChannel: "all",
          }),
        [] as any[]
      ),
    [filteredRows]
  );

  const insight = useMemo(
    () =>
      buildCreativeDetailInsight({
        reportMode,
        creative: selectedCreative,
        allSummary: allRowsSummary,
        selectedSummary: totals,
        creativePerfList: insightPerfList,
        byWeekOnly,
        bySource,
        byDevice,
      }),
    [
      reportMode,
      selectedCreative,
      allRowsSummary,
      totals,
      insightPerfList,
      byWeekOnly,
      bySource,
      byDevice,
    ]
  );

  const summarySectionNode = useMemo(
    () => (
      <SummarySection
        reportType={reportMode as ReportType}
        totals={totals}
        byMonth={byMonth}
        byWeekOnly={byWeekOnly}
        byWeekChart={byWeekChart}
        bySource={bySource}
        byDay={byDay}
        activeSlide={activeSlide}
      />
    ),
    [
      reportMode,
      totals,
      byMonth,
      byWeekOnly,
      byWeekChart,
      bySource,
      byDay,
      activeSlide,
    ]
  );

  const showAllSlides = activeSlide == null;
  const showOverviewSlide = showAllSlides || activeSlide === 0;

  const actionTitle =
    reportMode === "traffic"
      ? "다음 운영 액션(클릭 · CTR)"
      : reportMode === "db_acquisition"
        ? "다음 운영 액션(클릭 · 전환 · CPA)"
        : "다음 운영 액션(클릭 · 전환 · ROAS)";

  return (
    <section className="w-full min-w-0">
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside
          className={[
            "min-w-0 rounded-[20px] border border-[var(--nature-border-blue)] bg-white p-4 shadow-[0_4px_14px_rgba(127,166,196,0.07)] self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden",
            showOverviewSlide ? "" : "hidden",
          ].join(" ")}
        >
          <div className="rounded-[16px] border border-slate-200/80 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-[#B7D7E3]/75 bg-[#B7D7E3]/14 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-[#5F87A3]">
                  Creative Selector
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  소재 리스트
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  선택한 소재 기준으로 우측 상세 성과와 인사이트가 함께 갱신됩니다.
                </div>
              </div>

              <div className="shrink-0 rounded-[14px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10 px-3 py-2 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Total
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {creatives.length}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Search
              </label>
              <div className="relative">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="소재명 검색"
                  className="w-full rounded-[12px] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#7FA6C4] focus:bg-white focus:ring-2 focus:ring-[#B7D7E3]/30"
                />
                {searchText ? (
                  <button
                    type="button"
                    onClick={() => setSearchText("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                    title="검색 초기화"
                  >
                    초기화
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Current Selection
                </div>
                <div className="mt-1 truncate text-xs font-medium text-slate-700">
                  {selectedCreative || "선택 없음"}
                </div>
              </div>

              <div className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {filteredCreatives.length}개 표시
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-auto pr-1 lg:max-h-[calc(100vh-20rem)]">
            <div className="flex flex-col gap-2.5">
              {creatives.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  소재 데이터가 없습니다. (소재 컬럼 매핑 필요)
                </div>
              ) : filteredCreatives.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm font-semibold text-slate-700">
                    검색 결과가 없습니다
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    다른 검색어로 시도하거나 검색어를 초기화해 주세요.
                  </div>
                </div>
              ) : (
                filteredCreatives.map((creative) => (
                  <CreativeOptionButton
                    key={creative}
                    creative={creative}
                    active={creative === selectedCreative}
                    badges={badgeMap.get(creative) ?? []}
                    previewUrl={previewMetaByCreative.get(creative)?.url ?? ""}
                    onSelect={handleSelectCreative}
                  />
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[14px] border border-slate-200 bg-slate-50/70 p-3 text-xs leading-5 text-slate-600">
            <b className="text-slate-800">메모</b>
            <div className="mt-1">
              검색과 선택만 담당하는 패널입니다. 우측 상세 성과 영역의 데이터 흐름은 그대로 유지됩니다.
            </div>
          </div>
        </aside>

        <div
          className={[
            "min-w-0 space-y-6",
            showOverviewSlide ? "" : "lg:col-span-2",
          ].join(" ")}
        >
          <div className={showOverviewSlide ? "min-w-0" : "hidden"}>
            <section className="min-w-0 rounded-[20px] border border-[var(--nature-border-blue)] bg-white p-6 shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">{insight.title}</h3>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {selectedCreative
                        ? `소재: ${selectedCreative}`
                        : "소재를 선택하세요"}
                    </div>
                  </div>

                  {selectedBadges.length > 0 && (
                    <div className="hidden shrink-0 gap-2 sm:flex">
                      {selectedBadges.map((b) => (
                        <BadgePill key={b} k={b} />
                      ))}
                    </div>
                  )}
                </div>

                <ul className="mt-4 space-y-2 text-sm text-gray-700">
                  {insight.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex gap-3 rounded-[14px] border border-[#CFC2B1]/40 bg-[#F3E4D2]/14 px-4 py-3 leading-6"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7FA6C4]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 rounded-[16px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10 p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    {actionTitle}
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-gray-700">
                    {insight.actions.map((a, i) => (
                      <li key={i} className="flex gap-3 leading-6">
                        <span className="mt-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#B7D7E3] bg-white text-[10px] font-semibold text-[#5F87A3]">
                          {i + 1}
                        </span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="min-w-0">
                <div className="rounded-[16px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/8 p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    선택 소재 미리보기
                  </div>

                  <div className="mt-3 overflow-hidden rounded-[12px] border border-gray-200 bg-white">
                    {selectedPreviewUrl ? (
                      <img
                        src={selectedPreviewUrl}
                        alt={selectedCreative ?? "creative preview"}
                        className="h-[240px] w-full object-contain bg-white"
                        loading="eager"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-[240px] items-center justify-center text-sm text-gray-400">
                        미리보기 이미지 없음
                      </div>
                    )}
                  </div>

                  {sideThumbs.length > 0 && (
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {sideThumbs.map((item) => (
                        <SideThumbButton
                          key={item.creative}
                          creative={item.creative}
                          url={item.url}
                          onSelect={handleSelectCreative}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            </section>
          </div>

          <div className="creative-detail-week-table-fix min-w-0">
            <div className="min-w-0">{summarySectionNode}</div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .creative-detail-week-table-fix {
          min-width: 0;
          width: 100%;
        }

        .creative-detail-week-table-fix > * {
          min-width: 0;
        }

        .creative-detail-week-table-fix table {
          width: 100%;
        }

        .creative-detail-week-table-fix table th:first-child,
        .creative-detail-week-table-fix table td:first-child {
          white-space: nowrap !important;
          width: 180px;
          max-width: 180px;
        }

        .creative-detail-week-table-fix table td:first-child {
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </section>
  );
}