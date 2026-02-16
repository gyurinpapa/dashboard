"use client";

import { useMemo, useState, useEffect } from "react";
import { KRW } from "../../lib/report/format";
import { groupByGroup } from "../../lib/report/aggregate";
import DataBarCell from "../DataBarCell";

type Props = {
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

const pctText = (rate01: number, digits = 1) => `${(rate01 * 100).toFixed(digits)}%`;
const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

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

  return { impressions, clicks, cost, conversions, revenue, ctr, cvr, cpc, cpa, roas };
}

function pickTopBottom(rows: any[], keyFn: (r: any) => number) {
  const sorted = [...rows].sort((a, b) => keyFn(b) - keyFn(a));
  return { top: sorted[0], bottom: sorted[sorted.length - 1] };
}

function generateSourceInsights(bySource: any[], monthGoal: any) {
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

  const total = norm.reduce(
    (acc, r) => {
      acc.cost += r.cost;
      acc.revenue += r.revenue;
      acc.conversions += r.conversions;
      return acc;
    },
    { cost: 0, revenue: 0, conversions: 0 }
  );

  const totalRoas = safeDiv(total.revenue, total.cost);
  const totalCpa = safeDiv(total.cost, total.conversions);

  const { top: topRoas, bottom: bottomRoas } = pickTopBottom(norm, (r) => r.roas);
  const maxCostSource = [...norm].sort((a, b) => b.cost - a.cost)[0];

  const roasStatus = goal.roas === 0 ? "unknown" : totalRoas >= goal.roas ? "over" : "under";

  const s1 =
    goal.roas === 0
      ? `소스 합산 ROAS는 ${pctText(totalRoas)}이며, 목표 ROAS가 미입력 상태라 목표 대비 판정은 보류됩니다.`
      : roasStatus === "over"
      ? `소스 합산 ROAS는 ${pctText(totalRoas)}로 목표 ${pctText(goal.roas)}를 상회하며, 구조적으로 효율이 확보된 상태입니다.`
      : `소스 합산 ROAS는 ${pctText(totalRoas)}로 목표 ${pctText(goal.roas)} 대비 미달이며, 저효율 소스의 영향이 큽니다.`;

  const s2 =
    goal.cpa === 0
      ? `CPA 목표가 미입력 상태라, 전환 효율(CPA/CVR) 중심의 최적화 우선순위 산정이 제한됩니다.`
      : `CPA는 ${KRW(totalCpa)}로 목표 ${KRW(goal.cpa)} 대비 ${totalCpa <= goal.cpa ? "양호" : "높은"} 상태입니다.`;

  const s3 = `ROAS 상위 소스는 "${topRoas.source}"(${pctText(topRoas.roas)}), 하위 소스는 "${bottomRoas.source}"(${pctText(
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

export default function StructureSection({
  bySource,
  byCampaign,
  rows,
  monthGoal,
  allRowsLoading,
}: Props) {
  // ✅ 전역필터가 반영된 “원천 rows”
  const scopedRows = Array.isArray(rows) ? rows : [];

  // ✅ 소스/캠페인/그룹 배열 안전 처리
  const sourceRows = Array.isArray(bySource) ? bySource : [];
  const campaignRows = Array.isArray(byCampaign) ? byCampaign : [];

  // ✅ 막대그래프용 Max (빈 배열 안전)
  const srcMaxImpr = Math.max(0, ...sourceRows.map((r: any) => toNum(r.impressions ?? r.impr)));
  const srcMaxClicks = Math.max(0, ...sourceRows.map((r: any) => toNum(r.clicks)));
  const srcMaxCost = Math.max(0, ...sourceRows.map((r: any) => toNum(r.cost)));
  const srcMaxConv = Math.max(0, ...sourceRows.map((r: any) => toNum(r.conversions ?? r.conv)));
  const srcMaxRev = Math.max(0, ...sourceRows.map((r: any) => toNum(r.revenue)));

  const campMaxImpr = Math.max(0, ...campaignRows.map((r: any) => toNum(r.impressions ?? r.impr)));
  const campMaxClicks = Math.max(0, ...campaignRows.map((r: any) => toNum(r.clicks)));
  const campMaxCost = Math.max(0, ...campaignRows.map((r: any) => toNum(r.cost)));
  const campMaxConv = Math.max(0, ...campaignRows.map((r: any) => toNum(r.conversions ?? r.conv)));
  const campMaxRev = Math.max(0, ...campaignRows.map((r: any) => toNum(r.revenue)));

  // ✅ 인사이트 상태
  const insightLoading = (allRowsLoading ?? false) && sourceRows.length === 0;
  const [sentences, setSentences] = useState<string[]>([]);

  useEffect(() => {
    if (sourceRows.length > 0) setSentences(generateSourceInsights(sourceRows, monthGoal));
    else setSentences([]);
  }, [sourceRows, monthGoal]);

  // ✅ (그룹표 전용) 캠페인명 필터
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);

  // ✅ 캠페인 옵션: 전역필터(scopedRows)에 존재하는 캠페인만
  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    scopedRows.forEach((r: any) => {
      const name = String(r?.campaign_name ?? "").trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [scopedRows]);

  // ✅ 그룹표에만 적용되는 캠페인 선택 필터
  const groupRows = useMemo(() => {
    if (!selectedCampaign) return scopedRows;
    return scopedRows.filter(
      (r: any) => String(r?.campaign_name ?? "").trim() === selectedCampaign
    );
  }, [scopedRows, selectedCampaign]);

  const byGroup = useMemo(() => groupByGroup(groupRows), [groupRows]);
  const groupAggRows = Array.isArray(byGroup) ? byGroup : [];

  const grpMaxImpr = Math.max(0, ...groupAggRows.map((r: any) => toNum(r.impressions ?? r.impr)));
  const grpMaxClicks = Math.max(0, ...groupAggRows.map((r: any) => toNum(r.clicks)));
  const grpMaxCost = Math.max(0, ...groupAggRows.map((r: any) => toNum(r.cost)));
  const grpMaxConv = Math.max(0, ...groupAggRows.map((r: any) => toNum(r.conversions ?? r.conv)));
  const grpMaxRev = Math.max(0, ...groupAggRows.map((r: any) => toNum(r.revenue)));

  return (
    <>
      {/* ✅ 최상단: 소스별 요약 */}
      <section>
        <h2 className="text-lg font-semibold mb-3">소스별 요약</h2>

        <div className="overflow-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Source</th>
                <th className="text-right p-3">Impr</th>
                <th className="text-right p-3">Clicks</th>
                <th className="text-right p-3">CTR</th>
                <th className="text-right p-3">CPC</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-right p-3">Conv</th>
                <th className="text-right p-3">CVR</th>
                <th className="text-right p-3">CPA</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {sourceRows.length === 0 ? (
                <tr className="border-t">
                  <td className="p-3 text-gray-500" colSpan={11}>
                    {(allRowsLoading ?? false)
                      ? "데이터 로딩 중..."
                      : "표시할 소스 데이터가 없습니다. (필터 조건을 확인해 주세요)"}
                  </td>
                </tr>
              ) : (
                sourceRows.map((r: any, idx: number) => (
                  <tr key={r.source ?? idx} className="border-t">
                    <td className="p-3 font-medium whitespace-nowrap">{r.source}</td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.impressions ?? r.impr)} max={srcMaxImpr} />
                    </td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.clicks)} max={srcMaxClicks} />
                    </td>

                    <td className="p-3 text-right">{(toRate01(r.ctr) * 100).toFixed(2)}%</td>
                    <td className="p-3 text-right">{KRW(toNum(r.cpc))}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toNum(r.cost)}
                        max={srcMaxCost}
                        label={KRW(toNum(r.cost))}
                      />
                    </td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.conversions ?? r.conv)} max={srcMaxConv} />
                    </td>

                    <td className="p-3 text-right">{(toRate01(r.cvr) * 100).toFixed(2)}%</td>
                    <td className="p-3 text-right">{KRW(toNum(r.cpa))}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toNum(r.revenue)}
                        max={srcMaxRev}
                        label={KRW(toNum(r.revenue))}
                      />
                    </td>

                    <td className="p-3 text-right">{(toRoas01(r.roas) * 100).toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ✅ 요약 인사이트 */}
      <section className="mt-6">
        <div className="border rounded-xl p-6 bg-white">
          <div className="font-semibold mb-3">요약 인사이트</div>

          {insightLoading ? (
            <div className="text-sm text-gray-500">인사이트 생성 중...</div>
          ) : sourceRows.length === 0 ? (
            <div className="text-sm text-gray-500">
              소스 데이터가 없어서 인사이트를 만들 수 없습니다. (필터/데이터 확인)
            </div>
          ) : sentences.length === 0 ? (
            <div className="text-sm text-gray-500">
              인사이트 생성 실패: sourceRows는 있는데 문장이 비어있습니다. (값/키 확인)
            </div>
          ) : (
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-800">
              {sentences.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* ✅ 캠페인 요약 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">캠페인 요약</h2>

        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Campaign</th>
                <th className="text-right p-3">Impr</th>
                <th className="text-right p-3">Clicks</th>
                <th className="text-right p-3">CTR</th>
                <th className="text-right p-3">CPC</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-right p-3">Conv</th>
                <th className="text-right p-3">CVR</th>
                <th className="text-right p-3">CPA</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {campaignRows.map((r: any, idx: number) => (
                <tr key={r.campaign ?? idx} className="border-t">
                  <td className="p-3 font-medium whitespace-nowrap">{r.campaign}</td>

                  <td className="p-3">
                    <DataBarCell value={toNum(r.impressions ?? r.impr)} max={campMaxImpr} />
                  </td>

                  <td className="p-3">
                    <DataBarCell value={toNum(r.clicks)} max={campMaxClicks} />
                  </td>

                  <td className="p-3 text-right">{(toRate01(r.ctr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(r.cpc))}</td>

                  <td className="p-3">
                    <DataBarCell
                      value={toNum(r.cost)}
                      max={campMaxCost}
                      label={KRW(toNum(r.cost))}
                    />
                  </td>

                  <td className="p-3">
                    <DataBarCell value={toNum(r.conversions ?? r.conv)} max={campMaxConv} />
                  </td>

                  <td className="p-3 text-right">{(toRate01(r.cvr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(r.cpa))}</td>

                  <td className="p-3">
                    <DataBarCell
                      value={toNum(r.revenue)}
                      max={campMaxRev}
                      label={KRW(toNum(r.revenue))}
                    />
                  </td>

                  <td className="p-3 text-right">{(toRoas01(r.roas) * 100).toFixed(1)}%</td>
                </tr>
              ))}

              {campaignRows.length === 0 && (
                <tr className="border-t">
                  <td className="p-3 text-gray-500" colSpan={11}>
                    표시할 캠페인 데이터가 없습니다. (필터/컬럼명을 확인)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ✅ 그룹 요약 + (우측) 캠페인명 “단일 버튼 + 1열 리스트” */}
      <section className="mt-10 relative">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">그룹 요약</h3>

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCampaignOpen((prev) => !prev);
              }}
              className="px-4 py-2 rounded-xl border text-sm font-semibold transition
                         border-orange-900/40
                         bg-orange-600 text-white shadow
                         hover:bg-orange-700"
            >
              캠페인명 {campaignOpen ? "▲" : "▼"}
            </button>

            {campaignOpen && (
              <div
                className="absolute right-0 mt-2 w-64 bg-white border rounded-xl shadow-lg z-50 p-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="max-h-80 overflow-auto space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCampaign(null);
                      setCampaignOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition
                      ${
                        selectedCampaign == null
                          ? "bg-orange-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition
                        ${
                          selectedCampaign === c
                            ? "bg-orange-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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

        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Group</th>
                <th className="text-right p-3">Impr</th>
                <th className="text-right p-3">Clicks</th>
                <th className="text-right p-3">CTR</th>
                <th className="text-right p-3">CPC</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-right p-3">Conv</th>
                <th className="text-right p-3">CVR</th>
                <th className="text-right p-3">CPA</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {groupAggRows.map((r: any, idx: number) => (
                <tr key={r.group ?? idx} className="border-t">
                  <td className="p-3 font-medium whitespace-nowrap">{r.group}</td>

                  <td className="p-3">
                    <DataBarCell value={toNum(r.impressions ?? r.impr)} max={grpMaxImpr} />
                  </td>

                  <td className="p-3">
                    <DataBarCell value={toNum(r.clicks)} max={grpMaxClicks} />
                  </td>

                  <td className="p-3 text-right">{(toRate01(r.ctr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(r.cpc))}</td>

                  <td className="p-3">
                    <DataBarCell
                      value={toNum(r.cost)}
                      max={grpMaxCost}
                      label={KRW(toNum(r.cost))}
                    />
                  </td>

                  <td className="p-3">
                    <DataBarCell value={toNum(r.conversions ?? r.conv)} max={grpMaxConv} />
                  </td>

                  <td className="p-3 text-right">{(toRate01(r.cvr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(r.cpa))}</td>

                  <td className="p-3">
                    <DataBarCell
                      value={toNum(r.revenue)}
                      max={grpMaxRev}
                      label={KRW(toNum(r.revenue))}
                    />
                  </td>

                  <td className="p-3 text-right">{(toRoas01(r.roas) * 100).toFixed(1)}%</td>
                </tr>
              ))}

              {groupAggRows.length === 0 && (
                <tr className="border-t">
                  <td className="p-3 text-gray-500" colSpan={11}>
                    표시할 그룹 데이터가 없습니다. (필터/캠페인 선택/컬럼명을 확인)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
