"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Row } from "./types";

type Options = {
  workspaceId: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD

  sources?: string[]; // default ["naver_sa"]
  channels?: ("search" | "display")[]; // default ["search"]

  entityType?: string; // default "account" (현재 sync 기준)

  debug?: boolean;
};

function uniqNonEmpty(arr?: (string | null | undefined)[]) {
  return Array.from(new Set((arr ?? []).map((v) => String(v ?? "").trim()))).filter(Boolean);
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useReportRowsDb(options: Options) {
  const { workspaceId, from, to, debug } = options;

  const sources = useMemo(() => {
    const x = uniqNonEmpty(options.sources);
    return x.length ? x : ["naver_sa"];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options.sources ?? [])]);

  const channels = useMemo(() => {
    const x = uniqNonEmpty(options.channels as any);
    return (x.length ? x : ["search"]) as ("search" | "display")[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options.channels ?? [])]);

  const entityType = options.entityType ?? "account";

  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      let q = supabase
        .from("metrics_daily")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("entity_type", entityType);

      // source 필터
      if (sources.length === 1) q = q.eq("source", sources[0]);
      else q = q.in("source", sources);

      // channel 필터
      if (channels.length === 1) q = q.eq("channel", channels[0]);
      else q = q.in("channel", channels);

      // 기간 필터
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);

      // 정렬 (날짜 오름차순)
      q = q.order("date", { ascending: true });

      if (debug) {
        console.log("[useReportRowsDb] filters", {
          workspaceId,
          from,
          to,
          sources,
          channels,
          entityType,
        });
      }

      const { data, error } = await q;
      if (cancelled) return;

      if (error) {
        console.error("[useReportRowsDb] DB load error:", error);
        setError(error.message ?? "DB load error");
        setIsLoading(false);
        return;
      }

      const mapped: Row[] =
        data?.map((d: any) => ({
          date: d.date,
          source: d.source,
          channel: d.channel, // ✅ DB 기준
          device: "all",
          campaign: d.campaign ?? undefined,
          group: d.group ?? undefined,
          keyword: d.keyword ?? undefined,
          imp: toNum(d.imp),
          clk: toNum(d.clk),
          cost: toNum(d.cost),
          conv: toNum(d.conv),
          revenue: toNum(d.revenue),
        })) ?? [];

      setRows(mapped);
      setIsLoading(false);

      if (debug) {
        console.log("[useReportRowsDb] loaded", { count: mapped.length, sample: mapped[0] });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    workspaceId,
    from,
    to,
    entityType,
    debug,
    JSON.stringify(sources),
    JSON.stringify(channels),
  ]);

  return { rows, isLoading, error };
}