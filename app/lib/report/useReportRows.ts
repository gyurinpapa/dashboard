"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";

import type { Row } from "./types";
import { normalizeCsvRows } from "./aggregate";

type UseReportRowsResult = {
  rows: Row[];
  isLoading: boolean;
  error: string | null;
};

/**
 * CSV(정적 파일) -> Row[] 로드 전용 훅
 * - 나중에 DB로 갈아탈 때 여기만 교체하면 됨
 */
export function useReportRows(csvPath: string): UseReportRowsResult {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch(`${csvPath}?ts=${Date.now()}`);
        if (!res.ok) throw new Error(`CSV fetch failed: ${res.status} ${res.statusText}`);

        const csv = await res.text();
        const parsed = Papa.parse<Row>(csv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });

        // papaparse 에러 방어
        if (parsed.errors?.length) {
          const first = parsed.errors[0];
          throw new Error(`CSV parse error: ${first.message ?? "unknown"}`);
        }

        const normalized = normalizeCsvRows(parsed.data as any[]);
        if (!alive) return;

        setRows(normalized);
      } catch (e: any) {
        if (!alive) return;
        setRows([]);
        setError(e?.message ?? "Failed to load CSV");
      } finally {
        if (!alive) return;
        setIsLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [csvPath]);

  return { rows, isLoading, error };
}
