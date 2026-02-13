"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GoalState, MonthKey } from "../lib/report/types";
import { progressRate } from "../lib/report/format";

type InsightOk = { ok: true; result: string };
type InsightFail = { ok: false; error?: string; aborted?: boolean };
type InsightRes = InsightOk | InsightFail;

async function requestInsight(payload: any, signal?: AbortSignal): Promise<InsightRes> {
  try {
    const res = await fetch("/api/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    const raw = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    if (!res.ok) return { ok: false, error: json?.error || raw || `HTTP ${res.status}` };
    if (!json?.ok) return { ok: false, error: json?.error || "Unknown error" };

    return { ok: true, result: String(json.result || "") };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, aborted: true };
    }
    return { ok: false, error: err?.message || "Network error" };
  }
}

export function useInsights(params: {
  byMonth: any[];
  rowsLength: number;
  currentMonthKey: MonthKey;
  monthGoal: GoalState;

  currentMonthActual: {
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

  currentMonthGoalComputed: {
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
}) {
  const [monthlyInsight, setMonthlyInsight] = useState("");
  const [monthGoalInsight, setMonthGoalInsight] = useState("");

  const monthlyAbortRef = useRef<AbortController | null>(null);
  const goalAbortRef = useRef<AbortController | null>(null);
  const goalTimerRef = useRef<any>(null);

  // 1) 월별 성과 인사이트
  useEffect(() => {
    if (!params.byMonth?.length) return;

    monthlyAbortRef.current?.abort();
    const ac = new AbortController();
    monthlyAbortRef.current = ac;

    (async () => {
      setMonthlyInsight(""); // 로딩
      const monthlyData = params.byMonth.slice(0, 3);

      const r = await requestInsight({ type: "monthly", data: monthlyData }, ac.signal);

      if (!r.ok) {
        if (r.aborted) return; // 취소는 무시
        setMonthlyInsight(`인사이트 생성 실패: ${r.error || "Unknown error"}`);
      } else {
        setMonthlyInsight(r.result);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [params.byMonth]);

  // progress (목표 인사이트에 사용)
  const progress = useMemo(
    () => ({
      impressions: progressRate(params.currentMonthActual.impressions, params.currentMonthGoalComputed.impressions),
      clicks: progressRate(params.currentMonthActual.clicks, params.currentMonthGoalComputed.clicks),
      cost: progressRate(params.currentMonthActual.cost, params.currentMonthGoalComputed.cost),
      conversions: progressRate(params.currentMonthActual.conversions, params.currentMonthGoalComputed.conversions),
      revenue: progressRate(params.currentMonthActual.revenue, params.currentMonthGoalComputed.revenue),
      roas: progressRate(params.currentMonthActual.roas, params.currentMonthGoalComputed.roas),
    }),
    [params.currentMonthActual, params.currentMonthGoalComputed]
  );

  // 2) 당월 목표/결과 인사이트 (700ms 디바운스)
  useEffect(() => {
    console.log("[goal] effect fired", {
  rowsLength: params.rowsLength,
  currentMonthKey: params.currentMonthKey,
  monthGoal: params.monthGoal,
});
    if (!params.rowsLength || params.currentMonthKey === "all") return;

    const goalSum =
      (Number(params.monthGoal.impressions) || 0) +
      (Number(params.monthGoal.clicks) || 0) +
      (Number(params.monthGoal.cost) || 0) +
      (Number(params.monthGoal.conversions) || 0) +
      (Number(params.monthGoal.revenue) || 0);

    if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
    goalAbortRef.current?.abort();

    if (goalSum <= 0) {
      setMonthGoalInsight("목표값을 입력하면, 당월 현황 기준 3문장 인사이트가 자동 생성됩니다.");
      return;
    }

    setMonthGoalInsight(""); // 로딩
    const ac = new AbortController();
    goalAbortRef.current = ac;

    goalTimerRef.current = setTimeout(() => {
      (async () => {
        const payload = {
          type: "monthGoal",
          monthKey: params.currentMonthKey,
          goal: {
            impressions: Number(params.monthGoal.impressions) || 0,
            clicks: Number(params.monthGoal.clicks) || 0,
            cost: Number(params.monthGoal.cost) || 0,
            conversions: Number(params.monthGoal.conversions) || 0,
            revenue: Number(params.monthGoal.revenue) || 0,
          },
          actual: params.currentMonthActual,
          progress,
          note: "",
        };

        const r = await requestInsight(payload, ac.signal);

        if (!r.ok) {
          if (r.aborted) return;
          setMonthGoalInsight(`인사이트 생성 실패: ${r.error || "Unknown error"}`);
        } else {
          setMonthGoalInsight(r.result);
        }
      })();
    }, 700);

    return () => {
      if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
      ac.abort();
    };
  }, [
    params.rowsLength,
  params.currentMonthKey,

  params.monthGoal.impressions,
  params.monthGoal.clicks,
  params.monthGoal.cost,
  params.monthGoal.conversions,
  params.monthGoal.revenue,

  params.currentMonthActual.impressions,
  params.currentMonthActual.clicks,
  params.currentMonthActual.cost,
  params.currentMonthActual.conversions,
  params.currentMonthActual.revenue,
  params.currentMonthActual.roas,

  params.currentMonthGoalComputed.impressions,
  params.currentMonthGoalComputed.clicks,
  params.currentMonthGoalComputed.cost,
  params.currentMonthGoalComputed.conversions,
  params.currentMonthGoalComputed.revenue,
  params.currentMonthGoalComputed.roas,
  ]);

  return { monthlyInsight, monthGoalInsight };
}
