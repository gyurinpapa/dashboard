"use client";

import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  normalizeRoas01,
  formatPercentFromRate,
  formatPercentFromRoas,
  diffRatio,
} from "../../../src/lib/report/format";

import SummaryChart from "./summary/SummaryChart";
import SummaryKPI from "./summary/SummaryKPI";
import SummaryTable from "./summary/SummaryTable";
import TrendCell from "../ui/TrendCell";
import DataBarCell from "../ui/DataBarCell";

type Props = {
  reportType?: "commerce" | "traffic";

  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: any;

  totals: any;
  byMonth: any;

  byWeekOnly: any;
  byWeekChart: any;

  bySource: any;
  byDay?: any;
};

const TH_CLASS =
  "px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";

const TD_CLASS =
  "px-4 py-3.5 text-right text-sm text-slate-700 whitespace-nowrap align-middle";

const FIRST_TH_CLASS =
  "px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";

const FIRST_TD_CLASS =
  "px-4 py-3.5 text-left text-sm font-medium text-slate-900 whitespace-nowrap align-middle";

const TABLE_SURFACE_CLASS =
  "overflow-x-auto rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/60";

const TABLE_HEAD_CLASS =
  "sticky top-0 z-10 border-b border-slate-200/90 bg-[rgba(248,250,252,0.9)] backdrop-blur supports-[backdrop-filter]:bg-[rgba(248,250,252,0.82)]";

const EMPTY_STATE_CLASS =
  "px-4 py-10 text-center text-sm font-medium text-slate-500";

const CHART_SURFACE_CLASS = "mt-0";

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

function SectionShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,1))] shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
        className,
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
      <div className="relative px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}

function daySortKey(row: any) {
  return String(row?.date ?? row?.dateKey ?? row?.label ?? "");
}

function dayLabel(row: any) {
  return String(row?.date ?? row?.dateKey ?? row?.label ?? "-");
}

export default function SummarySection(props: Props) {
  const { reportType, totals, byMonth, byWeekOnly, byWeekChart, bySource, byDay } =
    props;

  const isTraffic = reportType === "traffic";

  const months = Array.isArray(byMonth) ? byMonth : [];
  const weeks = Array.isArray(byWeekOnly) ? byWeekOnly : [];
  const weekChartData = Array.isArray(byWeekChart) ? byWeekChart : [];
  const sources = Array.isArray(bySource) ? bySource : [];
  const days = Array.isArray(byDay) ? byDay : [];

  const weekSortKey = (w: any) => {
    const k = w?.weekKey ?? w?.startDate ?? w?.weekStart ?? w?.dateKey;
    if (k) return String(k);

    const m = String(w?.label ?? "").match(
      /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})주차/
    );
    if (!m) return String(w?.label ?? "");
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const wk = m[3].padStart(2, "0");
    return `${y}-${mo}-${wk}`;
  };

  const sortedWeeks = [...weeks].sort((a, b) =>
    weekSortKey(a).localeCompare(weekSortKey(b))
  );

  const sortedDays = [...days].sort((a, b) =>
    daySortKey(a).localeCompare(daySortKey(b))
  );

  const prevWeekSorted = sortedWeeks.at(-2);
  const lastWeekSorted = sortedWeeks.at(-1);

  const maxImpr = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toSafeNumber(r?.impressions ?? r?.impr))
  );
  const maxClicks = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toSafeNumber(r?.clicks))
  );
  const maxCost = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toSafeNumber(r?.cost))
  );
  const maxConv = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toSafeNumber(r?.conversions ?? r?.conv))
  );
  const maxRev = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toSafeNumber(r?.revenue))
  );

  const srcMaxImpr = Math.max(
    0,
    ...sources.map((r: any) => toSafeNumber(r?.impressions ?? r?.impr))
  );
  const srcMaxClicks = Math.max(
    0,
    ...sources.map((r: any) => toSafeNumber(r?.clicks))
  );
  const srcMaxCost = Math.max(
    0,
    ...sources.map((r: any) => toSafeNumber(r?.cost))
  );
  const srcMaxConv = Math.max(
    0,
    ...sources.map((r: any) => toSafeNumber(r?.conversions ?? r?.conv))
  );
  const srcMaxRev = Math.max(
    0,
    ...sources.map((r: any) => toSafeNumber(r?.revenue))
  );

  const dayMaxImpr = Math.max(
    0,
    ...sortedDays.map((r: any) => toSafeNumber(r?.impressions ?? r?.impr))
  );
  const dayMaxClicks = Math.max(
    0,
    ...sortedDays.map((r: any) => toSafeNumber(r?.clicks))
  );
  const dayMaxCost = Math.max(
    0,
    ...sortedDays.map((r: any) => toSafeNumber(r?.cost))
  );
  const dayMaxConv = Math.max(
    0,
    ...sortedDays.map((r: any) => toSafeNumber(r?.conversions ?? r?.conv))
  );
  const dayMaxRev = Math.max(
    0,
    ...sortedDays.map((r: any) => toSafeNumber(r?.revenue))
  );

  return (
    <div className="mt-6 space-y-12 lg:space-y-14">
      <div>
        <SectionIntro
          badge="📊 KPI"
          title="기간 성과 요약"
          description="현재 필터 조건 기준의 핵심 KPI를 빠르게 확인합니다."
          compact
        />

        <div className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.72))] p-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.035)] sm:p-3">
          <SummaryKPI reportType={reportType} totals={totals} />
        </div>
      </div>

      <div>
        <SectionIntro
          badge="📋 SUMMARY TABLE"
          title="월별 성과 (최근 3개월)"
          description="최근 월별 핵심 성과를 비교합니다."
          compact
        />
        <SummaryTable reportType={reportType} byMonth={months} />
      </div>

      <section className="space-y-12 lg:space-y-14">
        <div>
          <SectionIntro
            badge="📅 WEEKLY"
            title="주차별 성과"
            description="최근 주차 흐름과 전주 대비 변화량을 빠르게 확인합니다."
            compact
          />

          <div className={TABLE_SURFACE_CLASS}>
            <table
              className={[
                "w-full table-fixed text-sm",
                isTraffic ? "min-w-[860px]" : "min-w-[1320px]",
              ].join(" ")}
            >
              <colgroup>
                <col className="w-[180px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[110px]" />
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[120px]" />}
                {!isTraffic && <col className="w-[90px]" />}
              </colgroup>

              <thead className={TABLE_HEAD_CLASS}>
                <tr>
                  <th className={FIRST_TH_CLASS}>Week</th>
                  <th className={TH_CLASS}>Impr</th>
                  <th className={TH_CLASS}>Clicks</th>
                  <th className={TH_CLASS}>CTR</th>
                  <th className={TH_CLASS}>CPC</th>
                  <th className={TH_CLASS}>Cost</th>
                  {!isTraffic && <th className={TH_CLASS}>Conv</th>}
                  {!isTraffic && <th className={TH_CLASS}>CVR</th>}
                  {!isTraffic && <th className={TH_CLASS}>CPA</th>}
                  {!isTraffic && <th className={TH_CLASS}>Revenue</th>}
                  {!isTraffic && <th className={TH_CLASS}>ROAS</th>}
                </tr>
              </thead>

              <tbody>
                {lastWeekSorted && prevWeekSorted && (
                  <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.9),rgba(248,250,252,0.96))] font-medium text-slate-800">
                    <td className={`${FIRST_TD_CLASS} truncate`}>
                      증감(최근주-전주)
                    </td>

                    <td className={TD_CLASS}>
                      <TrendCell
                        v={diffRatio(
                          lastWeekSorted?.impressions,
                          prevWeekSorted?.impressions
                        )}
                      />
                    </td>

                    <td className={TD_CLASS}>
                      <TrendCell
                        v={diffRatio(
                          lastWeekSorted?.clicks,
                          prevWeekSorted?.clicks
                        )}
                      />
                    </td>

                    <td className={TD_CLASS}>
                      <TrendCell
                        v={diffRatio(
                          normalizeRate01(lastWeekSorted?.ctr),
                          normalizeRate01(prevWeekSorted?.ctr)
                        )}
                        digits={2}
                      />
                    </td>

                    <td className={TD_CLASS}>
                      <TrendCell
                        v={diffRatio(lastWeekSorted?.cpc, prevWeekSorted?.cpc)}
                        digits={2}
                      />
                    </td>

                    <td className={TD_CLASS}>
                      <TrendCell
                        v={diffRatio(lastWeekSorted?.cost, prevWeekSorted?.cost)}
                      />
                    </td>

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <TrendCell
                          v={diffRatio(
                            lastWeekSorted?.conversions,
                            prevWeekSorted?.conversions
                          )}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <TrendCell
                          v={diffRatio(
                            normalizeRate01(lastWeekSorted?.cvr),
                            normalizeRate01(prevWeekSorted?.cvr)
                          )}
                          digits={2}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <TrendCell
                          v={diffRatio(lastWeekSorted?.cpa, prevWeekSorted?.cpa)}
                          digits={2}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <TrendCell
                          v={diffRatio(
                            lastWeekSorted?.revenue,
                            prevWeekSorted?.revenue
                          )}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <TrendCell
                          v={diffRatio(
                            normalizeRoas01(lastWeekSorted?.roas),
                            normalizeRoas01(prevWeekSorted?.roas)
                          )}
                          digits={2}
                        />
                      </td>
                    )}
                  </tr>
                )}

                {sortedWeeks.map((w: any, idx: number) => (
                  <tr
                    key={w?.weekKey ?? `${weekSortKey(w)}-${idx}`}
                    className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-sky-50/55 transition-colors"
                  >
                    <td
                      className={`${FIRST_TD_CLASS} truncate`}
                      title={String(w?.label ?? "")}
                    >
                      {w?.label}
                    </td>

                    <td className={TD_CLASS}>
                      <DataBarCell
                        value={toSafeNumber(w?.impressions ?? w?.impr)}
                        max={maxImpr}
                      />
                    </td>

                    <td className={TD_CLASS}>
                      <DataBarCell
                        value={toSafeNumber(w?.clicks)}
                        max={maxClicks}
                      />
                    </td>

                    <td className={`${TD_CLASS} font-medium text-violet-600`}>
                      {formatPercentFromRate(w?.ctr, 2)}
                    </td>

                    <td className={TD_CLASS}>{KRW(toSafeNumber(w?.cpc))}</td>

                    <td className={TD_CLASS}>
                      <DataBarCell
                        value={toSafeNumber(w?.cost)}
                        max={maxCost}
                        label={KRW(toSafeNumber(w?.cost))}
                      />
                    </td>

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <DataBarCell
                          value={toSafeNumber(w?.conversions ?? w?.conv)}
                          max={maxConv}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={`${TD_CLASS} font-medium text-violet-600`}>
                        {formatPercentFromRate(w?.cvr, 2)}
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>{KRW(toSafeNumber(w?.cpa))}</td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <DataBarCell
                          value={toSafeNumber(w?.revenue)}
                          max={maxRev}
                          label={KRW(toSafeNumber(w?.revenue))}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={`${TD_CLASS} font-semibold text-orange-600`}>
                        {formatPercentFromRoas(w?.roas, 1)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionIntro
            badge="📈 CHART"
            title="주차별 추이"
            description="핵심 성과 흐름을 시각적으로 비교해 변화 구간을 빠르게 파악합니다."
            compact
          />

          <div className={CHART_SURFACE_CLASS}>
            <SummaryChart reportType={reportType} data={weekChartData} />
          </div>
        </div>

        <div>
          <SectionIntro
            badge="🧭 SOURCE"
            title="소스별 성과"
            description="소스별 효율 차이를 비교해 예산과 운영 우선순위를 점검합니다."
            compact
          />

          <div className={TABLE_SURFACE_CLASS}>
            <table
              className={[
                "w-full table-fixed text-sm",
                isTraffic ? "min-w-[860px]" : "min-w-[1320px]",
              ].join(" ")}
            >
              <colgroup>
                <col className="w-[180px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[110px]" />
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[120px]" />}
                {!isTraffic && <col className="w-[90px]" />}
              </colgroup>

              <thead className={TABLE_HEAD_CLASS}>
                <tr>
                  <th className={FIRST_TH_CLASS}>Source</th>
                  <th className={TH_CLASS}>Impr</th>
                  <th className={TH_CLASS}>Clicks</th>
                  <th className={TH_CLASS}>CTR</th>
                  <th className={TH_CLASS}>CPC</th>
                  <th className={TH_CLASS}>Cost</th>
                  {!isTraffic && <th className={TH_CLASS}>Conv</th>}
                  {!isTraffic && <th className={TH_CLASS}>CVR</th>}
                  {!isTraffic && <th className={TH_CLASS}>CPA</th>}
                  {!isTraffic && <th className={TH_CLASS}>Revenue</th>}
                  {!isTraffic && <th className={TH_CLASS}>ROAS</th>}
                </tr>
              </thead>

              <tbody>
                {sources.map((r: any, idx: number) => (
                  <tr
                    key={r?.source ?? idx}
                    className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-emerald-50/45 transition-colors"
                  >
                    <td
                      className={`${FIRST_TD_CLASS} truncate`}
                      title={String(r?.source ?? "")}
                    >
                      {r?.source}
                    </td>

                    <td className={TD_CLASS}>
                      <DataBarCell
                        value={toSafeNumber(r?.impressions ?? r?.impr)}
                        max={srcMaxImpr}
                      />
                    </td>

                    <td className={TD_CLASS}>
                      <DataBarCell
                        value={toSafeNumber(r?.clicks)}
                        max={srcMaxClicks}
                      />
                    </td>

                    <td className={`${TD_CLASS} font-medium text-violet-600`}>
                      {formatPercentFromRate(r?.ctr, 2)}
                    </td>

                    <td className={TD_CLASS}>{KRW(toSafeNumber(r?.cpc))}</td>

                    <td className={TD_CLASS}>
                      <DataBarCell
                        value={toSafeNumber(r?.cost)}
                        max={srcMaxCost}
                        label={KRW(toSafeNumber(r?.cost))}
                      />
                    </td>

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <DataBarCell
                          value={toSafeNumber(r?.conversions ?? r?.conv)}
                          max={srcMaxConv}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={`${TD_CLASS} font-medium text-violet-600`}>
                        {formatPercentFromRate(r?.cvr, 2)}
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>{KRW(toSafeNumber(r?.cpa))}</td>
                    )}

                    {!isTraffic && (
                      <td className={TD_CLASS}>
                        <DataBarCell
                          value={toSafeNumber(r?.revenue)}
                          max={srcMaxRev}
                          label={KRW(toSafeNumber(r?.revenue))}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className={`${TD_CLASS} font-semibold text-orange-600`}>
                        {formatPercentFromRoas(r?.roas, 1)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionIntro
            badge="🗓️ DAILY"
            title="일자별 성과"
            description="일 단위 흐름을 확인해 변동이 큰 날짜와 이슈 구간을 찾습니다."
            compact
          />

          <div className={TABLE_SURFACE_CLASS}>
            <table
              className={[
                "w-full table-fixed text-sm",
                isTraffic ? "min-w-[860px]" : "min-w-[1320px]",
              ].join(" ")}
            >
              <colgroup>
                <col className="w-[180px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[110px]" />
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[90px]" />}
                {!isTraffic && <col className="w-[120px]" />}
                {!isTraffic && <col className="w-[90px]" />}
              </colgroup>

              <thead className={TABLE_HEAD_CLASS}>
                <tr>
                  <th className={FIRST_TH_CLASS}>Date</th>
                  <th className={TH_CLASS}>Impr</th>
                  <th className={TH_CLASS}>Clicks</th>
                  <th className={TH_CLASS}>CTR</th>
                  <th className={TH_CLASS}>CPC</th>
                  <th className={TH_CLASS}>Cost</th>
                  {!isTraffic && <th className={TH_CLASS}>Conv</th>}
                  {!isTraffic && <th className={TH_CLASS}>CVR</th>}
                  {!isTraffic && <th className={TH_CLASS}>CPA</th>}
                  {!isTraffic && <th className={TH_CLASS}>Revenue</th>}
                  {!isTraffic && <th className={TH_CLASS}>ROAS</th>}
                </tr>
              </thead>

              <tbody>
                {sortedDays.length === 0 ? (
                  <tr className="border-t border-slate-200/90">
                    <td
                      className={EMPTY_STATE_CLASS}
                      colSpan={isTraffic ? 6 : 11}
                    >
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedDays.map((d: any, idx: number) => (
                    <tr
                      key={d?.date ?? d?.dateKey ?? `${daySortKey(d)}-${idx}`}
                      className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-amber-50/45 transition-colors"
                    >
                      <td
                        className={`${FIRST_TD_CLASS} truncate`}
                        title={dayLabel(d)}
                      >
                        {dayLabel(d)}
                      </td>

                      <td className={TD_CLASS}>
                        <DataBarCell
                          value={toSafeNumber(d?.impressions ?? d?.impr)}
                          max={dayMaxImpr}
                        />
                      </td>

                      <td className={TD_CLASS}>
                        <DataBarCell
                          value={toSafeNumber(d?.clicks)}
                          max={dayMaxClicks}
                        />
                      </td>

                      <td className={`${TD_CLASS} font-medium text-violet-600`}>
                        {formatPercentFromRate(d?.ctr, 2)}
                      </td>

                      <td className={TD_CLASS}>{KRW(toSafeNumber(d?.cpc))}</td>

                      <td className={TD_CLASS}>
                        <DataBarCell
                          value={toSafeNumber(d?.cost)}
                          max={dayMaxCost}
                          label={KRW(toSafeNumber(d?.cost))}
                        />
                      </td>

                      {!isTraffic && (
                        <td className={TD_CLASS}>
                          <DataBarCell
                            value={toSafeNumber(d?.conversions ?? d?.conv)}
                            max={dayMaxConv}
                          />
                        </td>
                      )}

                      {!isTraffic && (
                        <td className={`${TD_CLASS} font-medium text-violet-600`}>
                          {formatPercentFromRate(d?.cvr, 2)}
                        </td>
                      )}

                      {!isTraffic && (
                        <td className={TD_CLASS}>{KRW(toSafeNumber(d?.cpa))}</td>
                      )}

                      {!isTraffic && (
                        <td className={TD_CLASS}>
                          <DataBarCell
                            value={toSafeNumber(d?.revenue)}
                            max={dayMaxRev}
                            label={KRW(toSafeNumber(d?.revenue))}
                          />
                        </td>
                      )}

                      {!isTraffic && (
                        <td className={`${TD_CLASS} font-semibold text-orange-600`}>
                          {formatPercentFromRoas(d?.roas, 1)}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}