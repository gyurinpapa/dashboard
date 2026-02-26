"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

import type { Row } from "./types";
import { normalizeCsvRows } from "./aggregate";
import { parseDateLoose } from "./date"; // ⚠️ 파일 상단에 이미 있으면 추가하지 말 것

type ChannelKind = "search" | "display";

type UseReportRowsOptions = {
  from?: string; // YYYY-MM-DD (권장)
  to?: string;   // YYYY-MM-DD (권장)
  channels?: ChannelKind[]; // "search" | "display"
};

type UseReportRowsResult = {
  rows: Row[];
  isLoading: boolean;
  error: string | null;
};

/** YYYY-MM-DD 형태면 문자열 비교가 안전. 아니면 최대한 YYYY-MM-DD로 정규화 */
function normalizeDateKey(input: any): string {
  if (!input) return "";
  const s = String(input).trim();

  // ISO like "2026-02-21T14:20:27.313495+00:00" -> "2026-02-21"
  const iso10 = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso10)) return iso10;

  // "2026.02.21" / "2026/02/21" -> "2026-02-21"
  const replaced = s.replace(/\./g, "-").replace(/\//g, "-").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(replaced)) return replaced;

  // last resort: try Date
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

/**
 * row가 search/display 중 무엇인지 추정
 * - 네 CSV가 아직 'naver/google/meta/coupang' 기반이라도,
 *   source/campaign/group/keyword 텍스트에서 검색/디스플레이 힌트를 잡아냄
 */
function inferChannelKind(row: any): ChannelKind | "" {
  const ch = String(row?.channel ?? "").toLowerCase();

  // 이미 search/display로 들어온 경우
  if (ch === "search") return "search";
  if (ch === "display") return "display";

  // 텍스트 풀 구성 (있을 수 있는 필드 다 합침)
  const blob = [
    row?.source,
    row?.media,
    row?.platform,
    row?.campaign,
    row?.group,
    row?.adgroup,
    row?.keyword,
    row?.type,
    row?.name,
    row?.channel,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  // ✅ 검색(search)로 강하게 추정되는 키워드들
  // - sa / search / brand / shopping / powerlink 등
  const isSearch =
    /\bsa\b/.test(blob) ||
    /\bsearch\b/.test(blob) ||
    /파워링크|쇼핑검색|브랜드검색/.test(blob) ||
    /keyword|키워드/.test(blob);

  // ✅ 디스플레이(display)로 강하게 추정되는 키워드들
  // - gfa / gdn / display / meta / facebook / instagram / da 등
  const isDisplay =
    /\bgfa\b/.test(blob) ||
    /\bgdn\b/.test(blob) ||
    /\bdisplay\b/.test(blob) ||
    /\bda\b/.test(blob) ||
    /성과형디스플레이/.test(blob) ||
    /meta|facebook|instagram/.test(blob);

  // meta는 일반적으로 디스플레이/소셜로 분류되는 경우가 많아서 display 우선
  // (너의 기준에 따라 나중에 조정 가능)
  if (isDisplay && !isSearch) return "display";
  if (isSearch && !isDisplay) return "search";

  // 둘 다 애매하면 빈 값 반환(필터가 너무 빡세게 잘리는 걸 막기 위해)
  return "";
}

/**
 * CSV(정적 파일) -> Row[] 로드 전용 훅
 * - 나중에 DB로 갈아탈 때 여기만 교체하면 됨
 * - ✅ options는 "선택"이라 기존 호출은 영향 없음
 */
export function useReportRows(
  csvPath: string,
  options?: UseReportRowsOptions
): UseReportRowsResult {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // options가 바뀔 때만 fetch 재실행되도록 key 안정화
  const optKey = useMemo(() => {
    const from = options?.from ?? "";
    const to = options?.to ?? "";
    const channels = (options?.channels ?? []).slice().sort().join(",");
    return `${from}|${to}|${channels}`;
  }, [options?.from, options?.to, options?.channels]);

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

        console.log("FIRST DATE:", parsed.data[0]?.date);
        console.log("LAST DATE:", parsed.data[parsed.data.length - 1]?.date);

        if (parsed.errors?.length) {
          const first = parsed.errors[0];
          throw new Error(`CSV parse error: ${first.message ?? "unknown"}`);
        }

        const original = normalizeCsvRows(parsed.data as any[]);

        /* ===== 🔍 날짜 검증 로그 START ===== */

        const invalidDates = original.filter(r => !parseDateLoose(r.date));
        console.log("INVALID DATE COUNT:", invalidDates.length);
        console.log("INVALID SAMPLE:", invalidDates.slice(0, 5));
        /* ===== 🔍 날짜 검증 로그 END ===== */
        console.log("normalized length:", original.length);

        const rawImpTotal = parsed.data
        .filter((r: any) => r && r.impressions !== undefined)
        .reduce((sum: number, r: any) => {
          const v = Number(r.impressions);
          return sum + (Number.isFinite(v) ? v : 0);
        }, 0);

        console.log("RAW IMP TOTAL:", rawImpTotal);

        const normalizedImpTotal = original.reduce((sum: number, r: any) => {
          return sum + Number(r.impressions ?? 0);
        }, 0);

        console.log("RAW IMP TOTAL:", rawImpTotal);
        console.log("NORMALIZED IMP TOTAL:", normalizedImpTotal);
        console.log("==== CSV DEBUG END ====");

        if (!alive) return;

        let normalized = original;

        // ✅ 1) 기간 필터 (안전: date를 YYYY-MM-DD로 정규화 후 비교)
        const from = normalizeDateKey(options?.from ?? "");
        const to = normalizeDateKey(options?.to ?? "");

        if (from && to) {
          normalized = normalized.filter((r: any) => {
            const d = normalizeDateKey((r as any).date);
            return d && d >= from && d <= to;
          });
        }

        // ✅ 2) 채널 필터 ("search" | "display") - 안전 추정 + 0건 방지
        const channels = options?.channels ?? [];
        if (channels.length) {
          const set = new Set<ChannelKind>(channels);

          const after = normalized.filter((r: any) => {
            const kind = inferChannelKind(r);
            // kind가 ""이면 매핑 불가 → 일단 통과시키지 않음(엄격)
            return kind ? set.has(kind) : false;
          });

          // 🔒 안전장치:
          // 채널 필터가 0건이면 "CSV가 search/display로 구분되지 않음" 가능성이 큼.
          // 이 경우 UI가 '전체만'으로 죽는 게 더 큰 사고라서,
          // 기간만 적용된 normalized를 유지하고 error에 힌트만 남김.
          if (after.length === 0 && normalized.length > 0) {
            setError(
              "채널(search/display) 매핑이 데이터에서 확인되지 않아 채널 필터를 적용하지 않았어. (CSV의 source/campaign 라벨을 보고 매핑 규칙을 조정하면 정확해짐)"
            );
          } else {
            normalized = after;
          }
        }

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
  }, [csvPath, optKey]);

  return { rows, isLoading, error };
}