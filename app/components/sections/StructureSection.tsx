"use client";

import { memo, useMemo, useState } from "react";
import { KRW } from "../../../src/lib/report/format";
import { groupByGroup } from "../../../src/lib/report/aggregate";
import DataBarCell from "../ui/DataBarCell";

type ReportMode = "commerce" | "traffic" | "db_acquisition";

type Props = {
  reportType?: ReportMode;
  bySource: any;
  byCampaign: any;
  rows: any; // ✅ 전역필터가 반영된 raw rows
  monthGoal: any;
  allRowsLoading?: boolean; // ✅ CSV 로딩 여부(원천 rows 기준)
};

// ===== 숫자/비율 안전 유틸 =====
const toNum = (v: any) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const toRate01 = (v: any) => {
  const n = toNum(v);
  return n > 1 ? n / 100 : n;
};

const toRoas01 = (v: any) => {
  const n = toNum(v);
  return n > 10 ? n / 100 : n;
};

const pctText = (rate01: number, digits = 1) =>
  `${(rate01 * 100).toFixed(digits)}%`;
const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

const TABLE_SURFACE_CLASS =
  "overflow-x-auto rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/60";

const TABLE_HEAD_CLASS =
  "border-b border-slate-200/90 bg-[rgba(248,250,252,0.9)] backdrop-blur supports-[backdrop-filter]:bg-[rgba(248,250,252,0.82)]";

const TH_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";

const FIRST_TH_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";

const TD_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-right text-sm text-slate-700 align-middle";

const FIRST_TD_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-left text-sm font-medium text-slate-900 align-middle";

const EMPTY_STATE_CLASS =
  "px-4 py-10 text-center text-sm font-medium text-slate-500";

function resolveReportMode(reportType?: ReportMode): ReportMode {
  if (reportType === "traffic") return "traffic";
  if (reportType === "db_acquisition") return "db_acquisition";
  return "commerce";
}

function getTableMeta(reportMode: ReportMode) {
  const isTraffic = reportMode === "traffic";
  const isCommerce = reportMode === "commerce";
  const isDbAcquisition = reportMode === "db_acquisition";

  return {
    isTraffic,
    isCommerce,
    isDbAcquisition,
    showConv: !isTraffic,
    showCvr: !isTraffic,
    showCpa: !isTraffic,
    showRevenue: isCommerce,
    showRoas: isCommerce,
    minWidthClass: isTraffic
      ? "min-w-[860px]"
      : isDbAcquisition
      ? "min-w-[1120px]"
      : "min-w-[1320px]",
    colSpan: isTraffic ? 6 : isDbAcquisition ? 9 : 11,
  };
}

function getStructureCopy(reportMode: ReportMode) {
  if (reportMode === "traffic") {
    return {
      sourceDescription:
        "소스 단위 유입 구조를 비교해 클릭 볼륨과 CTR 중심의 운영 우선순위를 빠르게 확인합니다.",
      insightDescription:
        "현재 소스 구조를 유입 효율 기준으로 해석해 우선 점검 포인트를 정리합니다.",
      campaignDescription:
        "캠페인 단위 유입 성과를 비교해 어떤 캠페인이 전체 트래픽 구조를 주도하는지 확인합니다.",
      groupDescription:
        "선택한 캠페인 기준으로 그룹 구조를 확인해 세부 운영 단위의 클릭/CTR 편차를 점검합니다.",
    };
  }

  if (reportMode === "db_acquisition") {
    return {
      sourceDescription:
        "소스 단위 리드 확보 구조를 비교해 전환 볼륨과 CPA 중심의 운영 우선순위를 빠르게 확인합니다.",
      insightDescription:
        "현재 소스 구조를 리드 확보 효율 기준으로 해석해 우선 점검 포인트를 정리합니다.",
      campaignDescription:
        "캠페인 단위 전환 성과를 비교해 어떤 캠페인이 전체 DB 확보 구조를 주도하는지 확인합니다.",
      groupDescription:
        "선택한 캠페인 기준으로 그룹 구조를 확인해 세부 운영 단위의 전환/CPA 편차를 점검합니다.",
    };
  }

  return {
    sourceDescription:
      "소스 단위 성과 구조를 비교해 운영 우선순위와 효율 편차를 빠르게 확인합니다.",
    insightDescription:
      "현재 소스 구조를 목표 기준으로 해석해 우선 점검 포인트를 정리합니다.",
    campaignDescription:
      "캠페인 단위 성과를 비교해 어떤 캠페인이 전체 구조를 주도하는지 확인합니다.",
    groupDescription:
      "선택한 캠페인 기준으로 그룹 구조를 확인해 세부 운영 단위의 편차를 점검합니다.",
  };
}

function SectionIntro({
  badge,
  title,
  description,
  compact = false,
}: {
  badge: string;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact ? "mb-5 flex flex-col gap-2" : "mb-6 flex flex-col gap-2.5"
      }
    >
      <div className="inline-flex w-fit items-center rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-slate-500 shadow-sm">
        {badge}
      </div>

      <div>
        <h3
          className={[
            "font-semibold tracking-[-0.02em] text-slate-900",
            compact ? "text-[18px]" : "text-[20px]",
          ].join(" ")}
        >
          {title}
        </h3>
        <p
          className={[
            "text-slate-500",
            compact ? "mt-1.5 text-sm leading-6" : "mt-2 text-sm leading-6",
          ].join(" ")}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function computeGoalKpis(monthGoal: any) {
  const impressions = toNum(monthGoal?.impressions);
  const clicks = toNum(monthGoal?.clicks);
  const cost = toNum(monthGoal?.cost);
  const conversions = toNum(monthGoal?.conversions);
  const revenue = toNum(monthGoal?.revenue);

  const ctr = safeDiv(clicks, impressions);
  const cvr = safeDiv(conversions, clicks);
  const cpc = safeDiv(cost, clicks);
  const cpa = safeDiv(cost, conversions);
  const roas = safeDiv(revenue, cost);

  return {
    impressions,
    clicks,
    cost,
    conversions,
    revenue,
    ctr,
    cvr,
    cpc,
    cpa,
    roas,
  };
}

function pickTopBottom(rows: any[], keyFn: (r: any) => number) {
  const sorted = [...rows].sort((a, b) => keyFn(b) - keyFn(a));
  return { top: sorted[0], bottom: sorted[sorted.length - 1] };
}

function generateSourceInsights(
  reportMode: ReportMode,
  bySource: any[],
  monthGoal: any
) {
  const goal = computeGoalKpis(monthGoal);

  const norm = (Array.isArray(bySource) ? bySource : []).map((r) => {
    const impressions = toNum(r.impressions);
    const clicks = toNum(r.clicks);
    const cost = toNum(r.cost);
    const conversions = toNum(r.conversions);
    const revenue = toNum(r.revenue);

    const ctr = toRate01(r.ctr ?? safeDiv(clicks, impressions));
    const cvr = toRate01(r.cvr ?? safeDiv(conversions, clicks));
    const cpa = toNum(r.cpa ?? safeDiv(cost, conversions));
    const roas = toRoas01(r.roas ?? safeDiv(revenue, cost));

    return {
      source: String(r.source ?? "Unknown"),
      impressions,
      clicks,
      cost,
      conversions,
      revenue,
      ctr,
      cvr,
      cpa,
      roas,
    };
  });

  if (norm.length === 0) return [];

  const total = norm.reduce(
    (acc, r) => {
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.cost += r.cost;
      acc.revenue += r.revenue;
      acc.conversions += r.conversions;
      return acc;
    },
    { impressions: 0, clicks: 0, cost: 0, revenue: 0, conversions: 0 }
  );

  const totalCtr = safeDiv(total.clicks, total.impressions);
  const totalCvr = safeDiv(total.conversions, total.clicks);
  const totalRoas = safeDiv(total.revenue, total.cost);
  const totalCpa = safeDiv(total.cost, total.conversions);

  const maxCostSource = [...norm].sort((a, b) => b.cost - a.cost)[0];

  if (reportMode === "traffic") {
    const { top: topCtr, bottom: bottomCtr } = pickTopBottom(norm, (r) => r.ctr);
    const { top: topClicks, bottom: bottomClicks } = pickTopBottom(
      norm,
      (r) => r.clicks
    );

    const ctrStatus =
      goal.ctr === 0 ? "unknown" : totalCtr >= goal.ctr ? "over" : "under";

    const s1 =
      goal.ctr === 0
        ? `소스 합산 CTR은 ${pctText(
            totalCtr
          )}이며, 목표 CTR이 미입력 상태라 목표 대비 판정은 보류됩니다.`
        : ctrStatus === "over"
        ? `소스 합산 CTR은 ${pctText(
            totalCtr
          )}로 목표 ${pctText(
            goal.ctr
          )}를 상회하며, 유입 효율이 안정적으로 확보된 상태입니다.`
        : `소스 합산 CTR은 ${pctText(
            totalCtr
          )}로 목표 ${pctText(
            goal.ctr
          )} 대비 미달이며, 저반응 소스의 영향이 반영되고 있습니다.`;

    const s2 =
      goal.cpc === 0
        ? `CPC 목표가 미입력 상태라 클릭 단가 기준의 우선순위 판정은 제한됩니다.`
        : `평균 CPC는 ${KRW(safeDiv(total.cost, total.clicks))}로 목표 ${KRW(
            goal.cpc
          )} 대비 ${
            safeDiv(total.cost, total.clicks) <= goal.cpc ? "양호" : "높은"
          } 상태입니다.`;

    const s3 = `CTR 상위 소스는 "${topCtr.source}"(${pctText(
      topCtr.ctr
    )}), 하위 소스는 "${bottomCtr.source}"(${pctText(
      bottomCtr.ctr
    )})로 확인됩니다.`;

    const s4 = `클릭 볼륨 상위 소스는 "${topClicks.source}"(${topClicks.clicks.toLocaleString()} clicks), 하위 소스는 "${bottomClicks.source}"(${bottomClicks.clicks.toLocaleString()} clicks)이며, 볼륨 편차가 분명합니다.`;

    const s5 = `비용 비중이 큰 "${maxCostSource.source}"는 전체 유입 효율에 미치는 영향이 크므로, CTR·CPC를 우선 점검하는 것이 가장 빠른 개선 경로입니다.`;

    return [s1, s2, s3, s4, s5];
  }

  if (reportMode === "db_acquisition") {
    const { top: topConv, bottom: bottomConv } = pickTopBottom(
      norm,
      (r) => r.conversions
    );
    const { top: bestCpa, bottom: worstCpa } = pickTopBottom(norm, (r) =>
      r.conversions > 0 ? -r.cpa : Number.NEGATIVE_INFINITY
    );

    const cpaStatus =
      goal.cpa === 0 ? "unknown" : totalCpa <= goal.cpa ? "over" : "under";

    const s1 =
      goal.cpa === 0
        ? `소스 합산 CPA는 ${KRW(
            totalCpa
          )}이며, 목표 CPA가 미입력 상태라 목표 대비 판정은 보류됩니다.`
        : cpaStatus === "over"
        ? `소스 합산 CPA는 ${KRW(totalCpa)}로 목표 ${KRW(
            goal.cpa
          )} 이내이며, DB 확보 효율이 안정적으로 유지되고 있습니다.`
        : `소스 합산 CPA는 ${KRW(totalCpa)}로 목표 ${KRW(
            goal.cpa
          )}를 상회하며, 리드 확보 효율 개선이 필요한 상태입니다.`;

    const s2 =
      goal.cvr === 0
        ? `CVR 목표가 미입력 상태라 전환율 기준의 정밀 우선순위 판정은 제한됩니다.`
        : `합산 CVR은 ${pctText(totalCvr)}로 목표 ${pctText(goal.cvr)} 대비 ${
            totalCvr >= goal.cvr ? "양호" : "미달"
          } 상태입니다.`;

    const s3 = `전환 확보 상위 소스는 "${topConv.source}"(${topConv.conversions.toLocaleString()} conv), 하위 소스는 "${bottomConv.source}"(${bottomConv.conversions.toLocaleString()} conv)로 확인됩니다.`;

    const s4 =
      bestCpa && worstCpa
        ? `CPA 기준 우수 소스는 "${bestCpa.source}"(${KRW(
            bestCpa.cpa
          )}), 열위 소스는 "${worstCpa.source}"(${KRW(
            worstCpa.cpa
          )})로 확인됩니다.`
        : `소스별 CPA 편차를 기준으로 전환 효율 우수/열위 소스를 나눠 점검하는 것이 필요합니다.`;

    const s5 = `비용 비중이 큰 "${maxCostSource.source}"는 전체 리드 확보 효율에 미치는 영향이 크므로, 이 소스의 CPA·CVR을 우선 점검하는 것이 가장 빠른 개선 경로입니다.`;

    return [s1, s2, s3, s4, s5];
  }

  const { top: topRoas, bottom: bottomRoas } = pickTopBottom(
    norm,
    (r) => r.roas
  );

  const roasStatus =
    goal.roas === 0 ? "unknown" : totalRoas >= goal.roas ? "over" : "under";

  const s1 =
    goal.roas === 0
      ? `소스 합산 ROAS는 ${pctText(
          totalRoas
        )}이며, 목표 ROAS가 미입력 상태라 목표 대비 판정은 보류됩니다.`
      : roasStatus === "over"
      ? `소스 합산 ROAS는 ${pctText(
          totalRoas
        )}로 목표 ${pctText(
          goal.roas
        )}를 상회하며, 구조적으로 효율이 확보된 상태입니다.`
      : `소스 합산 ROAS는 ${pctText(
          totalRoas
        )}로 목표 ${pctText(
          goal.roas
        )} 대비 미달이며, 저효율 소스의 영향이 큽니다.`;

  const s2 =
    goal.cpa === 0
      ? `CPA 목표가 미입력 상태라, 전환 효율(CPA/CVR) 중심의 최적화 우선순위 산정이 제한됩니다.`
      : `CPA는 ${KRW(totalCpa)}로 목표 ${KRW(goal.cpa)} 대비 ${
          totalCpa <= goal.cpa ? "양호" : "높은"
        } 상태입니다.`;

  const s3 = `ROAS 상위 소스는 "${topRoas.source}"(${pctText(
    topRoas.roas
  )}), 하위 소스는 "${bottomRoas.source}"(${pctText(
    bottomRoas.roas
  )})로 확인됩니다.`;

  const s4 = `비용 비중이 큰 "${maxCostSource.source}"가 전체 효율에 미치는 영향이 크므로, 이 소스의 CPA·ROAS를 목표 기준으로 우선 점검하는 것이 가장 빠른 개선 경로입니다.`;

  const s5 =
    goal.roas === 0
      ? `목표 입력을 완료하면, 상위 소스 확장/하위 소스 축소·개선까지 자동으로 재배분 인사이트를 생성할 수 있습니다.`
      : roasStatus === "over"
      ? `다음 단계는 ROAS 상위 소스를 확장하되, 하위 소스는 구조 개선으로 효율을 안정화하는 것입니다.`
      : `목표 달성을 위해 ROAS 상위 소스로 예산을 재배분하고, 하위 소스는 구조 개선 또는 축소로 효율을 회복해야 합니다.`;

  return [s1, s2, s3, s4, s5];
}

function highlightInsightText(text: string) {
  const rules: Array<{ pattern: RegExp; className: string }> = [
    {
      pattern:
        /(ROAS|CPA|CVR|CTR|CPC|Revenue|Cost|Conv|DB 확보|리드 확보|전환 확보|유입 효율|전환 효율|목표|미달|상회|양호|높은|저효율|상위|하위|확장|축소|재배분|우선 점검|개선 경로|효율)/g,
      className: "font-semibold text-slate-900",
    },
    {
      pattern: /([A-Za-z가-힣0-9_-]+\.?\d*%|₩[\d,]+|\"[^\"]+\")/g,
      className: "font-semibold text-violet-700",
    },
  ];

  const segments: Array<{ text: string; className?: string }> = [{ text }];

  for (const rule of rules) {
    const next: Array<{ text: string; className?: string }> = [];

    segments.forEach((segment) => {
      if (segment.className) {
        next.push(segment);
        return;
      }

      let lastIndex = 0;
      const matches = Array.from(segment.text.matchAll(rule.pattern));

      if (matches.length === 0) {
        next.push(segment);
        return;
      }

      matches.forEach((match) => {
        const index = match.index ?? 0;
        const value = match[0];

        if (index > lastIndex) {
          next.push({ text: segment.text.slice(lastIndex, index) });
        }

        next.push({
          text: value,
          className: rule.className,
        });

        lastIndex = index + value.length;
      });

      if (lastIndex < segment.text.length) {
        next.push({ text: segment.text.slice(lastIndex) });
      }
    });

    segments.splice(0, segments.length, ...next);
  }

  return segments;
}

// ✅ 수정: max 계산 반복을 줄이기 위한 공용 helper
function getMetricMaxes(rows: any[]) {
  return {
    maxImpr: Math.max(0, ...rows.map((r: any) => toNum(r.impressions ?? r.impr))),
    maxClicks: Math.max(0, ...rows.map((r: any) => toNum(r.clicks))),
    maxCost: Math.max(0, ...rows.map((r: any) => toNum(r.cost))),
    maxConv: Math.max(0, ...rows.map((r: any) => toNum(r.conversions ?? r.conv))),
    maxRev: Math.max(0, ...rows.map((r: any) => toNum(r.revenue))),
  };
}

type SourceTableProps = {
  reportMode: ReportMode;
  sourceRows: any[];
  allRowsLoading?: boolean;
};

const SourceTable = memo(function SourceTable({
  reportMode,
  sourceRows,
  allRowsLoading,
}: SourceTableProps) {
  const srcMax = useMemo(() => getMetricMaxes(sourceRows), [sourceRows]);
  const tableMeta = getTableMeta(reportMode);

  return (
    <div className={TABLE_SURFACE_CLASS}>
      <table
        className={["w-full text-sm", tableMeta.minWidthClass].join(" ")}
      >
        <thead className={TABLE_HEAD_CLASS}>
          <tr>
            <th className={FIRST_TH_CLASS}>Source</th>
            <th className={TH_CLASS}>Impr</th>
            <th className={TH_CLASS}>Clicks</th>
            <th className={TH_CLASS}>CTR</th>
            <th className={TH_CLASS}>CPC</th>
            <th className={TH_CLASS}>Cost</th>
            {tableMeta.showConv && <th className={TH_CLASS}>Conv</th>}
            {tableMeta.showCvr && <th className={TH_CLASS}>CVR</th>}
            {tableMeta.showCpa && <th className={TH_CLASS}>CPA</th>}
            {tableMeta.showRevenue && <th className={TH_CLASS}>Revenue</th>}
            {tableMeta.showRoas && <th className={TH_CLASS}>ROAS</th>}
          </tr>
        </thead>

        <tbody>
          {sourceRows.length === 0 ? (
            <tr className="border-t border-slate-200/90">
              <td className={EMPTY_STATE_CLASS} colSpan={tableMeta.colSpan}>
                {(allRowsLoading ?? false)
                  ? "데이터 로딩 중..."
                  : "표시할 소스 데이터가 없습니다. (필터 조건을 확인해 주세요)"}
              </td>
            </tr>
          ) : (
            sourceRows.map((r: any, idx: number) => {
              const impr = toNum(r.impressions ?? r.impr);
              const clicks = toNum(r.clicks);
              const ctr = toRate01(r.ctr);
              const cpc = toNum(r.cpc);
              const cost = toNum(r.cost);
              const conv = toNum(r.conversions ?? r.conv);
              const cvr = toRate01(r.cvr);
              const cpa = toNum(r.cpa);
              const revenue = toNum(r.revenue);
              const roas = toRoas01(r.roas);

              return (
                <tr
                  key={r.source ?? idx}
                  className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-emerald-50/45 transition-colors"
                >
                  <td className={FIRST_TD_CLASS}>{r.source}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell value={impr} max={srcMax.maxImpr} />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell value={clicks} max={srcMax.maxClicks} />
                  </td>

                  <td className={`${TD_CLASS} font-medium text-violet-600`}>
                    {(ctr * 100).toFixed(2)}%
                  </td>

                  <td className={TD_CLASS}>{KRW(cpc)}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={cost}
                      max={srcMax.maxCost}
                      label={KRW(cost)}
                    />
                  </td>

                  {tableMeta.showConv && (
                    <td className={TD_CLASS}>
                      <DataBarCell value={conv} max={srcMax.maxConv} />
                    </td>
                  )}

                  {tableMeta.showCvr && (
                    <td className={`${TD_CLASS} font-medium text-violet-600`}>
                      {(cvr * 100).toFixed(2)}%
                    </td>
                  )}

                  {tableMeta.showCpa && <td className={TD_CLASS}>{KRW(cpa)}</td>}

                  {tableMeta.showRevenue && (
                    <td className={TD_CLASS}>
                      <DataBarCell
                        value={revenue}
                        max={srcMax.maxRev}
                        label={KRW(revenue)}
                      />
                    </td>
                  )}

                  {tableMeta.showRoas && (
                    <td className={`${TD_CLASS} font-semibold text-orange-600`}>
                      {(roas * 100).toFixed(1)}%
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
});

type InsightPanelProps = {
  reportMode: ReportMode;
  sourceRows: any[];
  monthGoal: any;
  insightLoading: boolean;
  description: string;
};

const InsightPanel = memo(function InsightPanel({
  reportMode,
  sourceRows,
  monthGoal,
  insightLoading,
  description,
}: InsightPanelProps) {
  const sentences = useMemo(() => {
    if (sourceRows.length === 0) return [];
    return generateSourceInsights(reportMode, sourceRows, monthGoal);
  }, [reportMode, sourceRows, monthGoal]);

  return (
    <div className="overflow-hidden rounded-[26px] border border-slate-200/90 bg-[linear-gradient(135deg,rgba(15,23,42,0.02),rgba(255,255,255,0.98)_18%,rgba(245,243,255,0.92)_56%,rgba(255,247,237,0.92)_100%)] shadow-[0_14px_34px_rgba(15,23,42,0.08)] ring-1 ring-white/70">
      <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.9))] shadow-sm">
            🧠
          </span>

          <span className="inline-flex items-center rounded-full border border-violet-200/80 bg-violet-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
            AI Insight
          </span>

          <span className="font-semibold text-slate-900">구조 분석 포인트</span>

          <span className="font-normal text-slate-400">-</span>

          <span className="font-normal text-slate-500">{description}</span>
        </div>
      </div>

      <div className="px-5 py-5">
        {insightLoading ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-sm text-slate-500 shadow-sm">
            인사이트 생성 중...
          </div>
        ) : sourceRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-sm text-slate-500 shadow-sm">
            소스 데이터가 없어서 인사이트를 만들 수 없습니다. (필터/데이터
            확인)
          </div>
        ) : sentences.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-sm text-slate-500 shadow-sm">
            인사이트 생성 실패: sourceRows는 있는데 문장이 비어있습니다.
            (값/키 확인)
          </div>
        ) : (
          <div className="space-y-3">
            {sentences.map((s, i) => (
              <div
                key={i}
                className="group rounded-[22px] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.035)] transition hover:-translate-y-[1px] hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(79,70,229,0.12),rgba(124,58,237,0.08))] text-xs font-bold text-violet-700 ring-1 ring-violet-200/70">
                    {i + 1}
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Insight
                      </span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span className="text-[11px] font-medium text-slate-400">
                        구조 분석
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
                      {highlightInsightText(s).map((part, idx) => (
                        <span
                          key={`${i}-${idx}`}
                          className={part.className ?? undefined}
                        >
                          {part.text}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

type CampaignTableProps = {
  reportMode: ReportMode;
  campaignRows: any[];
};

const CampaignTable = memo(function CampaignTable({
  reportMode,
  campaignRows,
}: CampaignTableProps) {
  const campMax = useMemo(() => getMetricMaxes(campaignRows), [campaignRows]);
  const tableMeta = getTableMeta(reportMode);

  return (
    <div className={TABLE_SURFACE_CLASS}>
      <table
        className={[
          "w-full text-sm border-collapse",
          tableMeta.minWidthClass,
        ].join(" ")}
      >
        <thead className={TABLE_HEAD_CLASS}>
          <tr>
            <th className={FIRST_TH_CLASS}>Campaign</th>
            <th className={TH_CLASS}>Impr</th>
            <th className={TH_CLASS}>Clicks</th>
            <th className={TH_CLASS}>CTR</th>
            <th className={TH_CLASS}>CPC</th>
            <th className={TH_CLASS}>Cost</th>
            {tableMeta.showConv && <th className={TH_CLASS}>Conv</th>}
            {tableMeta.showCvr && <th className={TH_CLASS}>CVR</th>}
            {tableMeta.showCpa && <th className={TH_CLASS}>CPA</th>}
            {tableMeta.showRevenue && <th className={TH_CLASS}>Revenue</th>}
            {tableMeta.showRoas && <th className={TH_CLASS}>ROAS</th>}
          </tr>
        </thead>

        <tbody>
          {campaignRows.map((r: any, idx: number) => {
            const impr = toNum(r.impressions ?? r.impr);
            const clicks = toNum(r.clicks);
            const ctr = toRate01(r.ctr);
            const cpc = toNum(r.cpc);
            const cost = toNum(r.cost);
            const conv = toNum(r.conversions ?? r.conv);
            const cvr = toRate01(r.cvr);
            const cpa = toNum(r.cpa);
            const revenue = toNum(r.revenue);
            const roas = toRoas01(r.roas);

            return (
              <tr
                key={r.campaign ?? idx}
                className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-sky-50/45 transition-colors"
              >
                <td className={FIRST_TD_CLASS}>{r.campaign}</td>

                <td className={TD_CLASS}>
                  <DataBarCell value={impr} max={campMax.maxImpr} />
                </td>

                <td className={TD_CLASS}>
                  <DataBarCell value={clicks} max={campMax.maxClicks} />
                </td>

                <td className={`${TD_CLASS} font-medium text-violet-600`}>
                  {(ctr * 100).toFixed(2)}%
                </td>

                <td className={TD_CLASS}>{KRW(cpc)}</td>

                <td className={TD_CLASS}>
                  <DataBarCell
                    value={cost}
                    max={campMax.maxCost}
                    label={KRW(cost)}
                  />
                </td>

                {tableMeta.showConv && (
                  <td className={TD_CLASS}>
                    <DataBarCell value={conv} max={campMax.maxConv} />
                  </td>
                )}

                {tableMeta.showCvr && (
                  <td className={`${TD_CLASS} font-medium text-violet-600`}>
                    {(cvr * 100).toFixed(2)}%
                  </td>
                )}

                {tableMeta.showCpa && <td className={TD_CLASS}>{KRW(cpa)}</td>}

                {tableMeta.showRevenue && (
                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={revenue}
                      max={campMax.maxRev}
                      label={KRW(revenue)}
                    />
                  </td>
                )}

                {tableMeta.showRoas && (
                  <td className={`${TD_CLASS} font-semibold text-orange-600`}>
                    {(roas * 100).toFixed(1)}%
                  </td>
                )}
              </tr>
            );
          })}

          {campaignRows.length === 0 && (
            <tr className="border-t border-slate-200/90">
              <td className={EMPTY_STATE_CLASS} colSpan={tableMeta.colSpan}>
                표시할 캠페인 데이터가 없습니다. (필터/컬럼명을 확인)
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

type GroupTableProps = {
  reportMode: ReportMode;
  groupAggRows: any[];
};

const GroupTable = memo(function GroupTable({
  reportMode,
  groupAggRows,
}: GroupTableProps) {
  const grpMax = useMemo(() => getMetricMaxes(groupAggRows), [groupAggRows]);
  const tableMeta = getTableMeta(reportMode);

  return (
    <div className={TABLE_SURFACE_CLASS}>
      <table
        className={[
          "w-full text-sm border-collapse",
          tableMeta.minWidthClass,
        ].join(" ")}
      >
        <thead className={TABLE_HEAD_CLASS}>
          <tr>
            <th className={FIRST_TH_CLASS}>Group</th>
            <th className={TH_CLASS}>Impr</th>
            <th className={TH_CLASS}>Clicks</th>
            <th className={TH_CLASS}>CTR</th>
            <th className={TH_CLASS}>CPC</th>
            <th className={TH_CLASS}>Cost</th>
            {tableMeta.showConv && <th className={TH_CLASS}>Conv</th>}
            {tableMeta.showCvr && <th className={TH_CLASS}>CVR</th>}
            {tableMeta.showCpa && <th className={TH_CLASS}>CPA</th>}
            {tableMeta.showRevenue && <th className={TH_CLASS}>Revenue</th>}
            {tableMeta.showRoas && <th className={TH_CLASS}>ROAS</th>}
          </tr>
        </thead>

        <tbody>
          {groupAggRows.map((r: any, idx: number) => {
            const impr = toNum(r.impressions ?? r.impr);
            const clicks = toNum(r.clicks);
            const ctr = toRate01(r.ctr);
            const cpc = toNum(r.cpc);
            const cost = toNum(r.cost);
            const conv = toNum(r.conversions ?? r.conv);
            const cvr = toRate01(r.cvr);
            const cpa = toNum(r.cpa);
            const revenue = toNum(r.revenue);
            const roas = toRoas01(r.roas);

            return (
              <tr
                key={r.group ?? idx}
                className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-amber-50/45 transition-colors"
              >
                <td className={FIRST_TD_CLASS}>{r.group}</td>

                <td className={TD_CLASS}>
                  <DataBarCell value={impr} max={grpMax.maxImpr} />
                </td>

                <td className={TD_CLASS}>
                  <DataBarCell value={clicks} max={grpMax.maxClicks} />
                </td>

                <td className={`${TD_CLASS} font-medium text-violet-600`}>
                  {(ctr * 100).toFixed(2)}%
                </td>

                <td className={TD_CLASS}>{KRW(cpc)}</td>

                <td className={TD_CLASS}>
                  <DataBarCell
                    value={cost}
                    max={grpMax.maxCost}
                    label={KRW(cost)}
                  />
                </td>

                {tableMeta.showConv && (
                  <td className={TD_CLASS}>
                    <DataBarCell value={conv} max={grpMax.maxConv} />
                  </td>
                )}

                {tableMeta.showCvr && (
                  <td className={`${TD_CLASS} font-medium text-violet-600`}>
                    {(cvr * 100).toFixed(2)}%
                  </td>
                )}

                {tableMeta.showCpa && <td className={TD_CLASS}>{KRW(cpa)}</td>}

                {tableMeta.showRevenue && (
                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={revenue}
                      max={grpMax.maxRev}
                      label={KRW(revenue)}
                    />
                  </td>
                )}

                {tableMeta.showRoas && (
                  <td className={`${TD_CLASS} font-semibold text-orange-600`}>
                    {(roas * 100).toFixed(1)}%
                  </td>
                )}
              </tr>
            );
          })}

          {groupAggRows.length === 0 && (
            <tr className="border-t border-slate-200/90">
              <td className={EMPTY_STATE_CLASS} colSpan={tableMeta.colSpan}>
                표시할 그룹 데이터가 없습니다. (필터/캠페인 선택/컬럼명을
                확인)
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

type GroupSectionProps = {
  reportMode: ReportMode;
  scopedRows: any[];
  description: string;
};

const GroupSection = memo(function GroupSection({
  reportMode,
  scopedRows,
  description,
}: GroupSectionProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    scopedRows.forEach((r: any) => {
      const name = String(r?.campaign_name ?? "").trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [scopedRows]);

  const groupRows = useMemo(() => {
    if (!selectedCampaign) return scopedRows;
    return scopedRows.filter(
      (r: any) => String(r?.campaign_name ?? "").trim() === selectedCampaign
    );
  }, [scopedRows, selectedCampaign]);

  const byGroup = useMemo(() => groupByGroup(groupRows), [groupRows]);
  const groupAggRows = Array.isArray(byGroup) ? byGroup : [];

  return (
    <div className="relative">
      <SectionIntro
        badge="🧩 GROUP"
        title="그룹별 성과"
        description={description}
        compact
      />

      <div className="mb-3 flex items-center justify-end gap-4">
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCampaignOpen((prev) => !prev);
            }}
            className="rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            캠페인명 {campaignOpen ? "▲" : "▼"}
          </button>

          {campaignOpen && (
            <div
              className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-h-80 space-y-1 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCampaign(null);
                    setCampaignOpen(false);
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    selectedCampaign == null
                      ? "bg-slate-900 text-white"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  전체
                </button>

                {campaignOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setSelectedCampaign(c);
                      setCampaignOpen(false);
                    }}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      selectedCampaign === c
                        ? "bg-slate-900 text-white"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <GroupTable reportMode={reportMode} groupAggRows={groupAggRows} />
    </div>
  );
});

export default function StructureSection({
  reportType,
  bySource,
  byCampaign,
  rows,
  monthGoal,
  allRowsLoading,
}: Props) {
  const reportMode = resolveReportMode(reportType);
  const copy = getStructureCopy(reportMode);

  const scopedRows = Array.isArray(rows) ? rows : [];
  const sourceRows = Array.isArray(bySource) ? bySource : [];
  const campaignRows = Array.isArray(byCampaign) ? byCampaign : [];

  const insightLoading = (allRowsLoading ?? false) && sourceRows.length === 0;

  return (
    <div className="mt-6 space-y-8">
      <div>
        <SectionIntro
          badge="🧭 SOURCE"
          title="소스별 구조 성과"
          description={copy.sourceDescription}
          compact
        />

        <SourceTable
          reportMode={reportMode}
          sourceRows={sourceRows}
          allRowsLoading={allRowsLoading}
        />
      </div>

      <div>
        <InsightPanel
          reportMode={reportMode}
          sourceRows={sourceRows}
          monthGoal={monthGoal}
          insightLoading={insightLoading}
          description={copy.insightDescription}
        />
      </div>

      <div>
        <SectionIntro
          badge="📣 CAMPAIGN"
          title="캠페인별 성과"
          description={copy.campaignDescription}
          compact
        />

        <CampaignTable reportMode={reportMode} campaignRows={campaignRows} />
      </div>

      <GroupSection
        reportMode={reportMode}
        scopedRows={scopedRows}
        description={copy.groupDescription}
      />
    </div>
  );
}