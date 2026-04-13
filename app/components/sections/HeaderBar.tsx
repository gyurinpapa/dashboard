// app/components/sections/HeaderBar.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  MonthKey,
  TabKey,
  WeekKey,
} from "../../../src/lib/report/types";

import type {
  ReportPeriod,
  ReportPeriodPreset,
} from "../../../src/lib/report/period";

import {
  REPORT_PERIOD_PRESETS,
  resolvePresetPeriod,
} from "../../../src/lib/report/period";

import { monthLabelOf } from "../../../src/lib/report/date";
import FilterBtn from "../ui/FilterBtn";

type WeekOption = { weekKey: WeekKey; label: string };
type SourceKey = string;
type ProductKey = string;
type HeaderFilterKey = FilterKey | "source" | "product";

type Props = {
  tab: TabKey;
  setTab: (t: TabKey) => void;

  filterKey: HeaderFilterKey;
  setFilterKey: (k: HeaderFilterKey) => void;

  selectedMonth: MonthKey;
  setSelectedMonth: (m: MonthKey) => void;

  selectedWeek: WeekKey;
  setSelectedWeek: (w: WeekKey) => void;

  selectedDevice: DeviceKey;
  setSelectedDevice: (d: DeviceKey) => void;

  selectedChannel: ChannelKey;
  setSelectedChannel: (c: ChannelKey) => void;

  selectedSource?: SourceKey;
  setSelectedSource?: (s: SourceKey) => void;

  selectedProduct?: ProductKey;
  setSelectedProduct?: (p: ProductKey) => void;

  monthOptions: MonthKey[];
  weekOptions: WeekOption[];
  deviceOptions: DeviceKey[];
  channelOptions: ChannelKey[];
  sourceOptions?: SourceKey[];
  productOptions?: ProductKey[];

  enabledMonthKeySet: Set<string>;
  enabledWeekKeySet: Set<string>;

  fullPeriod: string;
  period: string;

  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportTypeKey?: string | null;

  reportPeriod: ReportPeriod;
  onChangeReportPeriod: (next: ReportPeriod) => void;

  readOnlyHeader?: boolean;

  hidePeriodEditor?: boolean;
  hideTabPeriodText?: boolean;
};

function cleanText(v?: string | null) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function tabClass(active: boolean) {
  return [
    "inline-flex h-11 items-center justify-center rounded-full border px-4 text-sm font-semibold tracking-tight transition-all duration-200",
    active
      ? "border-slate-950 bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.28)] ring-2 ring-white/10"
      : "border-slate-300/80 bg-white/88 text-slate-700 shadow-sm hover:border-slate-400 hover:bg-white hover:text-slate-950 hover:-translate-y-[1px]",
  ].join(" ");
}

function optionBtnClass(active: boolean, dim = false, disabled = false) {
  return [
    "px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all duration-200",
    !disabled ? "hover:-translate-y-[1px] hover:shadow-md" : "",
    active
      ? "bg-slate-950 text-white border-slate-950 shadow-sm"
      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
    dim ? "opacity-40" : "",
    disabled
      ? "opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-100 hover:translate-y-0 hover:shadow-none"
      : "",
  ].join(" ");
}

function periodPresetLabel(preset: ReportPeriodPreset) {
  switch (preset) {
    case "this_month":
      return "이번 달";
    case "last_month":
      return "지난달";
    case "last_7_days":
      return "최근 7일";
    case "last_30_days":
      return "최근 30일";
    case "custom":
      return "직접 선택";
    default:
      return preset;
  }
}

function HeaderIntro({
  advertiserName,
  reportTypeName,
  reportTypeKey,
  fullPeriod,
}: {
  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportTypeKey?: string | null;
  fullPeriod: string;
}) {
  const cleanTypeKey = useMemo(() => {
    return cleanText(reportTypeKey);
  }, [reportTypeKey]);

  const cleanTypeName = useMemo(() => {
    return cleanText(reportTypeName);
  }, [reportTypeName]);

  const badgeText = useMemo(() => {
    const key = cleanTypeKey.toLowerCase();
    const name = cleanTypeName.toLowerCase();

    if (
      key === "traffic" ||
      key.includes("traffic") ||
      name.includes("트래픽") ||
      name.includes("traffic")
    ) {
      return "TRAFFIC";
    }

    if (
      key === "commerce" ||
      key.includes("commerce") ||
      name.includes("커머스") ||
      name.includes("commerce") ||
      name.includes("e-commerce") ||
      name.includes("매출")
    ) {
      return "E-COMMERCE";
    }

    if (
      key === "db_acquisition" ||
      key.includes("db_acquisition") ||
      key.includes("db acquisition") ||
      name.includes("db획득") ||
      name.includes("db 획득") ||
      name.includes("db acquisition")
    ) {
      return "DB ACQUISITION";
    }

    return "ONLINE AD";
  }, [cleanTypeKey, cleanTypeName]);

  const headerTitle = useMemo(() => {
    const adv = cleanText(advertiserName);
    const typeName = cleanTypeName;

    if (adv) return `${adv} 광고 리포트`;
    if (typeName) return typeName;
    return "온라인광고";
  }, [advertiserName, cleanTypeName]);

  const headerSubTitle = useMemo(() => {
    const typeName = cleanTypeName;

    if (typeName) return typeName;
    return "광고 성과 리포트";
  }, [cleanTypeName]);

  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl border border-white/12 bg-white/[0.08] px-6 py-6 shadow-[0_18px_48px_rgba(2,6,23,0.22)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(148,163,184,0.18),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-white/85 shadow-sm backdrop-blur-sm">
            {badgeText}
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {headerTitle}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
            <span className="font-medium text-slate-200">{headerSubTitle}</span>
            {fullPeriod ? (
              <>
                <span className="hidden sm:inline text-white/20">•</span>
                <span>
                  데이터 전체 기간{" "}
                  <span className="font-semibold text-white">{fullPeriod}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyHeaderBar({
  advertiserName,
  reportTypeName,
  reportTypeKey,
  fullPeriod,
  period,
  reportPeriod,
}: {
  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportTypeKey?: string | null;
  fullPeriod: string;
  period: string;
  reportPeriod: ReportPeriod;
}) {
  return (
    <div className="grid gap-4">
      <HeaderIntro
        advertiserName={advertiserName}
        reportTypeName={reportTypeName}
        reportTypeKey={reportTypeKey}
        fullPeriod={fullPeriod}
      />

      <div className="rounded-[24px] border border-white/12 bg-white/[0.08] px-4 py-4 shadow-[0_14px_34px_rgba(2,6,23,0.18)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/90">기준 기간</div>
            <div className="mt-1 text-sm text-slate-300">
              {reportPeriod.startDate || "-"} ~ {reportPeriod.endDate || "-"}
            </div>
          </div>

          <div className="min-w-0 sm:text-right">
            <div className="text-sm font-semibold text-white/90">조회 기간</div>
            <div className="mt-1 text-sm text-slate-300">{period || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorHeaderBar(props: Props) {
  const {
    tab,
    setTab,
    filterKey,
    setFilterKey,
    selectedMonth,
    setSelectedMonth,
    selectedWeek,
    setSelectedWeek,
    selectedDevice,
    setSelectedDevice,
    selectedChannel,
    setSelectedChannel,
    selectedSource = "all",
    setSelectedSource = () => {},
    selectedProduct = "all",
    setSelectedProduct = () => {},
    monthOptions,
    weekOptions,
    deviceOptions,
    channelOptions,
    sourceOptions = [],
    productOptions = [],
    enabledMonthKeySet,
    enabledWeekKeySet,
    fullPeriod,
    period,
    advertiserName,
    reportTypeName,
    reportTypeKey,
    reportPeriod,
    onChangeReportPeriod,
    hidePeriodEditor = false,
    hideTabPeriodText = false,
  } = props;

  const disableDisplayChannel = tab === "keyword" || tab === "keywordDetail";
  const filterRootRef = useRef<HTMLDivElement | null>(null);

  const hasSourceOptions = (sourceOptions ?? []).length > 0;
  const hasProductOptions = (productOptions ?? []).length > 0;

  const toggleFilter = (k: Exclude<HeaderFilterKey, null>) => {
    setFilterKey(filterKey === k ? null : k);
  };

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!filterKey) return;
      const el = filterRootRef.current;
      if (!el) return;

      const target = e.target as Node | null;
      if (target && el.contains(target)) return;

      setFilterKey(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterKey(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterKey, setFilterKey]);

  const handlePresetChange = (preset: ReportPeriodPreset) => {
    if (preset === "custom") {
      onChangeReportPeriod({
        preset: "custom",
        startDate: reportPeriod.startDate,
        endDate: reportPeriod.endDate,
      });
      return;
    }

    onChangeReportPeriod(resolvePresetPeriod({ preset }));
  };

  const handleStartDateChange = (nextStartDate: string) => {
    onChangeReportPeriod({
      preset: "custom",
      startDate: nextStartDate,
      endDate: reportPeriod.endDate,
    });
  };

  const handleEndDateChange = (nextEndDate: string) => {
    onChangeReportPeriod({
      preset: "custom",
      startDate: reportPeriod.startDate,
      endDate: nextEndDate,
    });
  };

  return (
    <div className="grid gap-4">
      <HeaderIntro
        advertiserName={advertiserName}
        reportTypeName={reportTypeName}
        reportTypeKey={reportTypeKey}
        fullPeriod={fullPeriod}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
        <div
          ref={filterRootRef}
          className="relative flex min-h-[116px] min-w-0 flex-col justify-between rounded-[24px] border border-white/12 bg-white/[0.08] px-4 py-4 shadow-[0_16px_38px_rgba(2,6,23,0.18)] backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_30%)]" />

          <div className="relative flex min-w-0 flex-col gap-4">
            {!hidePeriodEditor ? (
              <div className="grid gap-3 xl:grid-cols-[140px_minmax(0,1fr)] xl:items-start">
                <div className="pt-2 text-sm font-semibold text-white/90">
                  보고서 기간
                </div>

                <div className="min-w-0">
                  <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
                    <div className="shrink-0">
                      <select
                        value={reportPeriod.preset}
                        onChange={(e) =>
                          handlePresetChange(e.target.value as ReportPeriodPreset)
                        }
                        className="h-11 w-full min-w-[160px] rounded-xl border border-white/12 bg-white/95 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white xl:w-[168px]"
                      >
                        {REPORT_PERIOD_PRESETS.map((preset) => (
                          <option key={preset} value={preset}>
                            {periodPresetLabel(preset)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={reportPeriod.startDate}
                          onChange={(e) => handleStartDateChange(e.target.value)}
                          className="h-11 w-[190px] max-w-full rounded-xl border border-white/12 bg-white/95 px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                        />
                        <span className="shrink-0 text-sm font-medium text-slate-400">
                          ~
                        </span>
                        <input
                          type="date"
                          value={reportPeriod.endDate}
                          onChange={(e) => handleEndDateChange(e.target.value)}
                          className="h-11 w-[190px] max-w-full rounded-xl border border-white/12 bg-white/95 px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <FilterBtn
                active={filterKey === "month"}
                onClick={() => toggleFilter("month")}
              >
                월
              </FilterBtn>
              <FilterBtn
                active={filterKey === "week"}
                onClick={() => toggleFilter("week")}
              >
                주차
              </FilterBtn>
              <FilterBtn
                active={filterKey === "device"}
                onClick={() => toggleFilter("device")}
              >
                기기
              </FilterBtn>
              <FilterBtn
                active={filterKey === "channel"}
                onClick={() => toggleFilter("channel")}
              >
                채널
              </FilterBtn>

              {hasSourceOptions ? (
                <FilterBtn
                  active={filterKey === "source"}
                  onClick={() => toggleFilter("source")}
                >
                  소스
                </FilterBtn>
              ) : null}

              {hasProductOptions ? (
                <FilterBtn
                  active={filterKey === "product"}
                  onClick={() => toggleFilter("product")}
                >
                  상품
                </FilterBtn>
              ) : null}
            </div>
          </div>

          <div className="relative mt-4 min-h-[24px] border-t border-white/10 pt-3 text-sm text-slate-300">
            {period ? (
              <>
                조회 기간 <span className="font-semibold text-white">{period}</span>
              </>
            ) : (
              <span className="text-slate-400">조회 기간 정보 없음</span>
            )}
          </div>

          {filterKey === "month" && (
            <div className="absolute left-0 top-full z-50 mt-3 w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.18)] backdrop-blur-md">
              <div className="mb-3 text-sm font-semibold text-slate-800">
                월 선택
              </div>
              <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth("all");
                    setFilterKey(null);
                  }}
                  className={optionBtnClass(selectedMonth === "all")}
                >
                  전체
                </button>

                {monthOptions.map((m) => {
                  const dim = !enabledMonthKeySet.has(m);

                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(m);
                        setFilterKey(null);
                      }}
                      className={optionBtnClass(selectedMonth === m, dim)}
                    >
                      {monthLabelOf(m)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filterKey === "week" && (
            <div className="absolute left-0 top-full z-50 mt-3 w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.18)] backdrop-blur-md">
              <div className="mb-3 text-sm font-semibold text-slate-800">
                주차 선택
              </div>
              <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWeek("all");
                    setFilterKey(null);
                  }}
                  className={optionBtnClass(selectedWeek === "all")}
                >
                  전체
                </button>

                {weekOptions.map((w) => {
                  const wk = w.weekKey;
                  const dim = !enabledWeekKeySet.has(wk);

                  return (
                    <button
                      key={wk}
                      type="button"
                      onClick={() => {
                        setSelectedWeek(wk);
                        setFilterKey(null);
                      }}
                      className={optionBtnClass(selectedWeek === wk, dim)}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filterKey === "device" && (
            <div className="absolute left-0 top-full z-50 mt-3 w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.18)] backdrop-blur-md">
              <div className="mb-3 text-sm font-semibold text-slate-800">
                기기 선택
              </div>
              <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDevice("all");
                    setFilterKey(null);
                  }}
                  className={optionBtnClass(selectedDevice === "all")}
                >
                  전체
                </button>

                {deviceOptions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedDevice(d);
                      setFilterKey(null);
                    }}
                    className={optionBtnClass(selectedDevice === d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filterKey === "channel" && (
            <div className="absolute left-0 top-full z-50 mt-3 w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.18)] backdrop-blur-md">
              <div className="mb-3 text-sm font-semibold text-slate-800">
                채널 선택
              </div>
              <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedChannel("all");
                    setFilterKey(null);
                  }}
                  className={optionBtnClass(selectedChannel === "all")}
                >
                  전체
                </button>

                {channelOptions.map((c) => {
                  const isDisplay =
                    c === "display" ||
                    c === ("display ad" as any) ||
                    c === ("display_ad" as any);

                  const disabled = disableDisplayChannel && isDisplay;

                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        setSelectedChannel(c);
                        setFilterKey(null);
                      }}
                      title={
                        disabled
                          ? "키워드 탭에서는 display ad를 선택할 수 없습니다."
                          : String(c)
                      }
                      className={optionBtnClass(
                        selectedChannel === c,
                        false,
                        disabled
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasSourceOptions && filterKey === "source" && (
            <div className="absolute left-0 top-full z-50 mt-3 w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.18)] backdrop-blur-md">
              <div className="mb-3 text-sm font-semibold text-slate-800">
                소스 선택
              </div>
              <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSource("all");
                    setFilterKey(null);
                  }}
                  className={optionBtnClass(selectedSource === "all")}
                >
                  전체
                </button>

                {sourceOptions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSelectedSource(s);
                      setFilterKey(null);
                    }}
                    className={optionBtnClass(selectedSource === s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasProductOptions && filterKey === "product" && (
            <div className="absolute left-0 top-full z-50 mt-3 w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.18)] backdrop-blur-md">
              <div className="mb-3 text-sm font-semibold text-slate-800">
                상품 선택
              </div>
              <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct("all");
                    setFilterKey(null);
                  }}
                  className={optionBtnClass(selectedProduct === "all")}
                >
                  전체
                </button>

                {productOptions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSelectedProduct(p);
                      setFilterKey(null);
                    }}
                    className={optionBtnClass(selectedProduct === p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-[116px] min-w-0 flex-col justify-between rounded-[24px] border border-white/12 bg-white/[0.08] px-3 py-3 shadow-[0_16px_38px_rgba(2,6,23,0.18)] backdrop-blur-xl">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("summary")}
              className={tabClass(tab === "summary")}
            >
              요약
            </button>

            <button
              type="button"
              onClick={() => setTab("summary2")}
              className={tabClass(tab === "summary2")}
            >
              요약2
            </button>

            <button
              type="button"
              onClick={() => setTab("structure")}
              className={tabClass(tab === "structure")}
            >
              구조
            </button>

            <button
              type="button"
              onClick={() => setTab("keyword")}
              className={tabClass(tab === "keyword")}
            >
              키워드
            </button>

            <button
              type="button"
              onClick={() => setTab("keywordDetail")}
              className={tabClass(tab === "keywordDetail")}
            >
              키워드(상세)
            </button>

            <button
              type="button"
              onClick={() => setTab("creative")}
              className={tabClass(tab === "creative")}
            >
              소재
            </button>

            <button
              type="button"
              onClick={() => setTab("creativeDetail")}
              className={tabClass(tab === "creativeDetail")}
            >
              소재(상세)
            </button>
          </div>

          <div className="mt-4 flex min-h-[24px] items-end justify-between gap-3 border-t border-white/10 pt-3">
            <div className="text-xs text-slate-300">
              {!hideTabPeriodText ? (
                <>
                  기준 기간{" "}
                  <span className="font-semibold text-white">
                    {reportPeriod.startDate || "-"} ~ {reportPeriod.endDate || "-"}
                  </span>
                </>
              ) : null}
            </div>

            <div className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
              +VAT
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeaderBar(props: Props) {
  const { readOnlyHeader = false } = props;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/40 bg-[linear-gradient(135deg,#0f172a_0%,#162033_38%,#1e293b_72%,#334155_100%)] shadow-[0_18px_50px_rgba(2,6,23,0.24)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.10),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(148,163,184,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-slate-950/10" />

      <div className="relative px-4 pb-4 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1440px]">
          {readOnlyHeader ? (
            <ReadOnlyHeaderBar
              advertiserName={props.advertiserName}
              reportTypeName={props.reportTypeName}
              reportTypeKey={props.reportTypeKey}
              fullPeriod={props.fullPeriod}
              period={props.period}
              reportPeriod={props.reportPeriod}
            />
          ) : (
            <EditorHeaderBar {...props} />
          )}
        </div>
      </div>
    </header>
  );
}