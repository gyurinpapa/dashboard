// app/hooks/useInsights.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GoalState, MonthKey, ReportType } from "../../src/lib/report/types";

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

    // ✅ HTML(Next 에러 페이지 등) 응답 방지
    const trimmed = raw.trim();
    const looksLikeHtml =
      trimmed.startsWith("<!DOCTYPE") ||
      trimmed.startsWith("<html") ||
      trimmed.startsWith("<HTML");

    let json: any = null;
    if (!looksLikeHtml && raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
    }

    // ✅ HTTP 자체가 실패인 경우
    if (!res.ok) {
      const msg =
        json?.error ||
        (looksLikeHtml ? `Server returned HTML error (HTTP ${res.status})` : raw) ||
        `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    // ✅ HTTP는 성공이지만 API 포맷이 ok가 아닌 경우
    if (!json?.ok) {
      const msg =
        json?.error ||
        (looksLikeHtml ? "Server returned HTML (unexpected)." : raw) ||
        "Unknown error";
      return { ok: false, error: msg };
    }

    return { ok: true, result: String(json.result || "") };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, aborted: true };
    return { ok: false, error: err?.message || "Network error" };
  }
}

function getInsightNote(reportType?: ReportType) {
  if (reportType === "db_acquisition") {
    return "DB획득 리포트 기준으로 해석합니다. 전환, CPA, 리드 확보 효율 중심으로 설명하고 매출/ROAS 중심 해석은 제외합니다.";
  }

  if (reportType === "traffic") {
    return "트래픽 리포트 기준으로 해석합니다. 유입/클릭/CTR 중심으로 설명하고 매출 중심 해석은 제외합니다.";
  }

  return "커머스 리포트 기준으로 해석합니다. 매출, ROAS, 전환 효율 중심으로 설명합니다.";
}

export function useInsights(params: {
  byMonth: any[];
  rowsLength: number;
  currentMonthKey: MonthKey;
  monthGoal: GoalState;
  reportType?: ReportType;

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

  /**
   * [수정 포인트]
   * summary 비활성 상태에서는 인사이트 side-effect를 멈추기 위한 플래그
   * - hook 호출 순서는 유지
   * - fetch / debounce / effect 반응만 억제
   */
  enableMonthlyInsight?: boolean;
  enableMonthGoalInsight?: boolean;
}) {
  const [monthlyInsight, setMonthlyInsight] = useState("");
  const [monthGoalInsight, setMonthGoalInsight] = useState("");

  const monthlyAbortRef = useRef<AbortController | null>(null);
  const goalAbortRef = useRef<AbortController | null>(null);
  const goalTimerRef = useRef<any>(null);

  /**
   * [수정 포인트]
   * 동일 payload로 중복 fetch가 다시 발생하지 않도록 signature 보관
   * - reference 흔들림에는 둔감하게
   * - 내용이 진짜 바뀌었을 때만 다시 요청
   */
  const lastMonthlyRequestKeyRef = useRef("");
  const lastGoalRequestKeyRef = useRef("");

  const safeProgressRate = (actual: number, goal: number) => {
    const a = Number(actual) || 0;
    const g = Number(goal) || 0;
    if (g <= 0) return 0;
    return a / g;
  };

  const insightNote = useMemo(() => {
    return getInsightNote(params.reportType);
  }, [params.reportType]);

  // progress (목표 인사이트에 사용)
  const progress = useMemo(
    () => ({
      impressions: safeProgressRate(
        params.currentMonthActual.impressions,
        params.currentMonthGoalComputed.impressions
      ),
      clicks: safeProgressRate(
        params.currentMonthActual.clicks,
        params.currentMonthGoalComputed.clicks
      ),
      cost: safeProgressRate(
        params.currentMonthActual.cost,
        params.currentMonthGoalComputed.cost
      ),
      conversions: safeProgressRate(
        params.currentMonthActual.conversions,
        params.currentMonthGoalComputed.conversions
      ),
      revenue: safeProgressRate(
        params.currentMonthActual.revenue,
        params.currentMonthGoalComputed.revenue
      ),
      roas: safeProgressRate(
        params.currentMonthActual.roas,
        params.currentMonthGoalComputed.roas
      ),
    }),
    [params.currentMonthActual, params.currentMonthGoalComputed]
  );

  /**
   * [수정 포인트]
   * 월별 인사이트 payload signature
   * - byMonth reference가 새로 생겨도 내용이 같으면 재요청 생략
   */
  const monthlyRequestKey = useMemo(() => {
    if (!params.enableMonthlyInsight) return "";
    if (!params.byMonth?.length) return "";
    try {
      return JSON.stringify({
        type: "monthly",
        reportType: params.reportType ?? "commerce",
        note: insightNote,
        data: params.byMonth.slice(0, 3),
      });
    } catch {
      return "";
    }
  }, [params.byMonth, params.enableMonthlyInsight, params.reportType, insightNote]);

  /**
   * [수정 포인트]
   * 목표 인사이트 payload signature
   * - 입력값/실적/진도율 내용이 같으면 재요청 생략
   */
  const goalRequestKey = useMemo(() => {
    if (!params.enableMonthGoalInsight) return "";
    if (!params.rowsLength || params.currentMonthKey === "all") return "";

    const goal = {
      impressions: Number(params.monthGoal.impressions) || 0,
      clicks: Number(params.monthGoal.clicks) || 0,
      cost: Number(params.monthGoal.cost) || 0,
      conversions: Number(params.monthGoal.conversions) || 0,
      revenue: Number(params.monthGoal.revenue) || 0,
    };

    try {
      return JSON.stringify({
        type: "monthGoal",
        reportType: params.reportType ?? "commerce",
        monthKey: params.currentMonthKey,
        goal,
        actual: params.currentMonthActual,
        progress,
        note: insightNote,
      });
    } catch {
      return "";
    }
  }, [
    params.enableMonthGoalInsight,
    params.rowsLength,
    params.currentMonthKey,
    params.monthGoal,
    params.currentMonthActual,
    params.reportType,
    progress,
    insightNote,
  ]);

  // 1) 월별 성과 인사이트
  useEffect(() => {
    /**
     * [수정 포인트]
     * summary 비활성 상태에서는 월별 인사이트 요청 중단 + signature 초기화
     */
    if (!params.enableMonthlyInsight) {
      monthlyAbortRef.current?.abort();
      lastMonthlyRequestKeyRef.current = "";
      return;
    }

    if (!params.byMonth?.length) return;
    if (!monthlyRequestKey) return;

    /**
     * [수정 포인트]
     * 동일 payload면 중복 요청 생략
     */
    if (lastMonthlyRequestKeyRef.current === monthlyRequestKey) return;
    lastMonthlyRequestKeyRef.current = monthlyRequestKey;

    monthlyAbortRef.current?.abort();
    const ac = new AbortController();
    monthlyAbortRef.current = ac;

    (async () => {
      setMonthlyInsight("");
      const monthlyData = params.byMonth.slice(0, 3);

      const r = await requestInsight(
        {
          type: "monthly",
          reportType: params.reportType ?? "commerce",
          note: insightNote,
          data: monthlyData,
        },
        ac.signal
      );

      if (!r.ok) {
        if (r.aborted) return;
        setMonthlyInsight(`인사이트 생성 실패: ${r.error || "Unknown error"}`);
      } else {
        setMonthlyInsight(r.result);
      }
    })();

    return () => ac.abort();
  }, [
    params.byMonth,
    params.enableMonthlyInsight,
    params.reportType,
    monthlyRequestKey,
    insightNote,
  ]);

  // 2) 당월 목표/결과 인사이트 (700ms 디바운스)
  useEffect(() => {
    /**
     * [수정 포인트]
     * summary 비활성 상태에서는 목표 인사이트 요청/디바운스 중단 + signature 초기화
     */
    if (!params.enableMonthGoalInsight) {
      if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
      goalAbortRef.current?.abort();
      lastGoalRequestKeyRef.current = "";
      return;
    }

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
      lastGoalRequestKeyRef.current = "";
      setMonthGoalInsight(
        "목표값을 입력하면, 당월 현황 기준 3문장 인사이트가 자동 생성됩니다."
      );
      return;
    }

    if (!goalRequestKey) return;

    /**
     * [수정 포인트]
     * 동일 payload면 중복 요청 생략
     */
    if (lastGoalRequestKeyRef.current === goalRequestKey) return;
    lastGoalRequestKeyRef.current = goalRequestKey;

    setMonthGoalInsight("");
    const ac = new AbortController();
    goalAbortRef.current = ac;

    goalTimerRef.current = setTimeout(() => {
      (async () => {
        const payload = {
          type: "monthGoal",
          reportType: params.reportType ?? "commerce",
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
          note: insightNote,
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
    params.enableMonthGoalInsight,
    params.rowsLength,
    params.currentMonthKey,
    params.reportType,

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

    progress,
    goalRequestKey,
    insightNote,
  ]);

  return { monthlyInsight, monthGoalInsight };
}