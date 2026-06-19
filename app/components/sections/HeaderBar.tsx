// app/components/sections/HeaderBar.tsx
"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";

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

function tabClass(active: boolean, decision = false) {
  return [
    "relative inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-t-[8px] border px-3.5 text-[13px] font-semibold tracking-tight",
    "transition-[background-color,border-color,color,box-shadow] duration-150",
    "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nature-blue)]/20",
    active
      ? decision
        ? "z-10 border-[var(--nature-warm-gray)] bg-[var(--nature-cream)]/92 text-slate-900 shadow-[inset_0_-2px_0_var(--nature-warm-gray)]"
        : "z-10 border-[var(--nature-blue)] bg-[var(--nature-blue-light)]/72 text-slate-950 shadow-[inset_0_-2px_0_var(--nature-blue)]"
      : decision
        ? "border-[var(--nature-border)]/70 bg-[var(--nature-cream)]/38 text-slate-600 hover:border-[var(--nature-warm-gray)] hover:bg-[var(--nature-cream)]/68 hover:text-slate-900"
        : "border-[var(--nature-border-blue)]/65 bg-[var(--nature-blue-light)]/18 text-slate-600 hover:border-[var(--nature-blue)]/70 hover:bg-[var(--nature-blue-light)]/42 hover:text-slate-900",
  ].join(" ");
}

function optionBtnClass(active: boolean, dim = false, disabled = false) {
  return [
    "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all duration-200",
    !disabled ? "hover:-translate-y-[1px] hover:shadow-md" : "",
    active
      ? "border-[var(--nature-blue)] bg-[var(--nature-blue)] text-white shadow-sm"
      : "border-[var(--nature-border)] bg-[var(--nature-surface)] text-slate-700 hover:bg-[var(--nature-cream)]/70",
    dim ? "opacity-40" : "",
    disabled
      ? "cursor-not-allowed border-[var(--nature-border)] bg-[var(--nature-shell)] text-slate-400 opacity-40 hover:translate-y-0 hover:bg-[var(--nature-shell)] hover:shadow-none"
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

const PRIMARY_TABS_TOP: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "summary", label: "요약" },
  { key: "summary2", label: "요약2" },
  { key: "structure", label: "구조" },
];

const PRIMARY_TABS_BOTTOM: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "keyword", label: "키워드" },
  { key: "keywordDetail", label: "키워드(상세)" },
  { key: "creative", label: "소재" },
  { key: "creativeDetail", label: "소재(상세)" },
];

const DECISION_TABS_TOP: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "decision", label: "Decision" },
];

const DECISION_TABS_BOTTOM: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "hypothesis1", label: "가설 1" },
  { key: "hypothesis2", label: "가설 2" },
  { key: "hypothesis3", label: "가설 3" },
  { key: "hypothesis4", label: "가설 4" },
  { key: "hypothesis5", label: "가설 5" },
];

const HeaderIntro = memo(function HeaderIntro({
  advertiserName,
  reportTypeName,
  reportTypeKey,
  fullPeriod,
  period,
}: {
  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportTypeKey?: string | null;
  fullPeriod: string;
  period: string;
}) {
  const cleanTypeKey = useMemo(() => cleanText(reportTypeKey), [reportTypeKey]);
  const cleanTypeName = useMemo(() => cleanText(reportTypeName), [reportTypeName]);

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

    if (adv) {
      return adv + " 광고 리포트";
    }

    if (cleanTypeName) {
      return cleanTypeName;
    }

    return "온라인광고";
  }, [advertiserName, cleanTypeName]);

  const headerSubTitle = useMemo(() => {
    if (cleanTypeName) return cleanTypeName;
    return "광고 성과 리포트";
  }, [cleanTypeName]);

  return (
    <div className="bg-transparent px-4 py-2.5 sm:px-5 sm:py-3">
      <div className="relative grid min-w-0 grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(360px,760px)_minmax(260px,1fr)]">
        <div className="hidden lg:block" />

        <div className="relative min-w-0 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(127,166,196,0.20)_0%,rgba(183,215,227,0.09)_42%,rgba(255,255,255,0)_74%)] blur-xl" />

          <div className="relative">
            <div className="mb-1.5 flex justify-center">
              <div className="inline-flex shrink-0 items-center rounded-full border border-[var(--nature-border-blue)] bg-white/76 px-3 py-1 text-[10px] font-extrabold tracking-[0.16em] text-slate-700 shadow-[0_6px_16px_rgba(90,117,136,0.09)] backdrop-blur">
                {badgeText}
              </div>
            </div>

            <h1 className="mx-auto max-w-full truncate text-[23px] font-black tracking-[-0.045em] text-slate-950 drop-shadow-[0_2px_0_rgba(255,255,255,0.82)] sm:text-[28px] lg:text-[31px]">
              {headerTitle}
            </h1>

            <div className="mx-auto mt-1.5 h-[3px] w-20 rounded-full bg-[linear-gradient(90deg,rgba(127,166,196,0)_0%,rgba(127,166,196,0.95)_24%,rgba(95,135,163,1)_50%,rgba(127,166,196,0.95)_76%,rgba(127,166,196,0)_100%)] shadow-[0_3px_10px_rgba(95,135,163,0.34)] sm:w-28" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-0.5 text-xs text-slate-500 lg:items-end lg:text-right">
          {fullPeriod ? (
            <div className="whitespace-nowrap">
              전체 기간{" "}
              <span className="font-bold text-slate-800">{fullPeriod}</span>
            </div>
          ) : null}

          <div className="whitespace-nowrap">
            조회 기간{" "}
            <span className="font-bold text-slate-800">{period || "-"}</span>
          </div>

          <div className="mt-0.5 inline-flex h-6 items-center rounded-full border border-[var(--nature-border-blue)] bg-white/72 px-2.5 text-[10px] font-extrabold text-slate-700 shadow-[0_4px_12px_rgba(90,117,136,0.09)] backdrop-blur">
            +VAT
          </div>
        </div>
      </div>
    </div>
  );
});

const ReadOnlyHeaderBar = memo(function ReadOnlyHeaderBar({
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
    <div className="overflow-visible bg-transparent">
      <HeaderIntro
        advertiserName={advertiserName}
        reportTypeName={reportTypeName}
        reportTypeKey={reportTypeKey}
        fullPeriod={fullPeriod}
        period={period}
      />

      <div className="flex flex-col gap-2 border-t border-[var(--nature-border)] px-4 py-2.5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <span className="font-semibold text-slate-800">기준 기간</span>{" "}
          <span>
            {reportPeriod.startDate || "-"} ~ {reportPeriod.endDate || "-"}
          </span>
        </div>

        <div className="min-w-0 sm:text-right">
          <span className="font-semibold text-slate-800">조회 기간</span>{" "}
          <span>{period || "-"}</span>
        </div>
      </div>
    </div>
  );
});

const TabButtons = memo(function TabButtons({
  tab,
  setTab,
  items,
  decision = false,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  items: ReadonlyArray<{ key: TabKey; label: string }>;
  decision?: boolean;
}) {
  const handleTabClick = useCallback(
    (nextTab: TabKey) => {
      if (nextTab === tab) return;
      setTab(nextTab);
    },
    [setTab, tab],
  );

  return (
    <div className="flex shrink-0 items-end gap-1.5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => handleTabClick(item.key)}
          className={tabClass(tab === item.key, decision)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});

const UnifiedTabBar = memo(function UnifiedTabBar({
  tab,
  setTab,
  filterToolbar,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  filterToolbar: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto overscroll-x-contain bg-transparent [scrollbar-width:thin]">
      <div className="flex min-w-max justify-center px-2 pt-1.5 sm:px-3">
        <div className="flex items-end gap-1.5">
          <TabButtons
            tab={tab}
            setTab={setTab}
            items={PRIMARY_TABS_TOP}
          />

        <TabButtons
          tab={tab}
          setTab={setTab}
          items={PRIMARY_TABS_BOTTOM}
        />

        <TabButtons
          tab={tab}
          setTab={setTab}
          items={DECISION_TABS_TOP}
          decision
        />

        <TabButtons
          tab={tab}
          setTab={setTab}
          items={DECISION_TABS_BOTTOM}
          decision
        />

          <div className="mb-1 ml-1 flex h-9 shrink-0 items-center bg-transparent">
            {filterToolbar}
          </div>
        </div>
      </div>
    </div>
  );
});

const FilterToolbar = memo(function FilterToolbar({
  filterKey,
  onToggleMonth,
  onToggleWeek,
  onToggleDevice,
  onToggleChannel,
  onToggleSource,
  onToggleProduct,
  hasSourceOptions,
  hasProductOptions,
}: {
  filterKey: HeaderFilterKey;
  onToggleMonth: () => void;
  onToggleWeek: () => void;
  onToggleDevice: () => void;
  onToggleChannel: () => void;
  onToggleSource: () => void;
  onToggleProduct: () => void;
  hasSourceOptions: boolean;
  hasProductOptions: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <FilterBtn active={filterKey === "month"} onClick={onToggleMonth}>
        월
      </FilterBtn>

      <FilterBtn active={filterKey === "week"} onClick={onToggleWeek}>
        주차
      </FilterBtn>

      <FilterBtn active={filterKey === "device"} onClick={onToggleDevice}>
        기기
      </FilterBtn>

      <FilterBtn active={filterKey === "channel"} onClick={onToggleChannel}>
        채널
      </FilterBtn>

      {hasSourceOptions ? (
        <FilterBtn active={filterKey === "source"} onClick={onToggleSource}>
          소스
        </FilterBtn>
      ) : null}

      {hasProductOptions ? (
        <FilterBtn active={filterKey === "product"} onClick={onToggleProduct}>
          상품
        </FilterBtn>
      ) : null}
    </div>
  );
});

const OptionPopover = memo(function OptionPopover({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute left-0 top-full z-50 mt-2 w-[520px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--nature-border)] bg-[var(--nature-surface)]/98 p-3 shadow-[0_18px_40px_rgba(127,166,196,0.18)] backdrop-blur-md">
      <div className="mb-2 text-xs font-semibold text-slate-800">{title}</div>

      <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
        {children}
      </div>
    </div>
  );
});

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

  const hasSourceOptions = sourceOptions.length > 0;
  const hasProductOptions = productOptions.length > 0;

  const closeFilter = useCallback(() => {
    if (filterKey !== null) setFilterKey(null);
  }, [filterKey, setFilterKey]);

  const toggleFilter = useCallback(
    (k: Exclude<HeaderFilterKey, null>) => {
      setFilterKey(filterKey === k ? null : k);
    },
    [filterKey, setFilterKey],
  );

  const handleToggleMonth = useCallback(
    () => toggleFilter("month"),
    [toggleFilter],
  );

  const handleToggleWeek = useCallback(
    () => toggleFilter("week"),
    [toggleFilter],
  );

  const handleToggleDevice = useCallback(
    () => toggleFilter("device"),
    [toggleFilter],
  );

  const handleToggleChannel = useCallback(
    () => toggleFilter("channel"),
    [toggleFilter],
  );

  const handleToggleSource = useCallback(
    () => toggleFilter("source"),
    [toggleFilter],
  );

  const handleToggleProduct = useCallback(
    () => toggleFilter("product"),
    [toggleFilter],
  );

  useEffect(() => {
    if (!filterKey) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
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

  const handlePresetChange = useCallback(
    (preset: ReportPeriodPreset) => {
      if (preset === "custom") {
        onChangeReportPeriod({
          preset: "custom",
          startDate: reportPeriod.startDate,
          endDate: reportPeriod.endDate,
        });
        return;
      }

      onChangeReportPeriod(resolvePresetPeriod({ preset }));
    },
    [onChangeReportPeriod, reportPeriod.endDate, reportPeriod.startDate],
  );

  const handleStartDateChange = useCallback(
    (nextStartDate: string) => {
      onChangeReportPeriod({
        preset: "custom",
        startDate: nextStartDate,
        endDate: reportPeriod.endDate,
      });
    },
    [onChangeReportPeriod, reportPeriod.endDate],
  );

  const handleEndDateChange = useCallback(
    (nextEndDate: string) => {
      onChangeReportPeriod({
        preset: "custom",
        startDate: reportPeriod.startDate,
        endDate: nextEndDate,
      });
    },
    [onChangeReportPeriod, reportPeriod.startDate],
  );

  const handleSelectMonthAll = useCallback(() => {
    setSelectedMonth("all");
    closeFilter();
  }, [setSelectedMonth, closeFilter]);

  const monthOptionNodes = useMemo(() => {
    return monthOptions.map((m) => {
      const dim = !enabledMonthKeySet.has(m);
      const isActive = selectedMonth === m;

      return (
        <button
          key={m}
          type="button"
          onClick={() => {
            setSelectedMonth(m);
            closeFilter();
          }}
          className={optionBtnClass(isActive, dim)}
        >
          {monthLabelOf(m)}
        </button>
      );
    });
  }, [
    monthOptions,
    enabledMonthKeySet,
    selectedMonth,
    setSelectedMonth,
    closeFilter,
  ]);

  const handleSelectWeekAll = useCallback(() => {
    setSelectedWeek("all");
    closeFilter();
  }, [setSelectedWeek, closeFilter]);

  const weekOptionNodes = useMemo(() => {
    return weekOptions.map((w) => {
      const wk = w.weekKey;
      const dim = !enabledWeekKeySet.has(wk);
      const isActive = selectedWeek === wk;

      return (
        <button
          key={wk}
          type="button"
          onClick={() => {
            setSelectedWeek(wk);
            closeFilter();
          }}
          className={optionBtnClass(isActive, dim)}
        >
          {w.label}
        </button>
      );
    });
  }, [
    weekOptions,
    enabledWeekKeySet,
    selectedWeek,
    setSelectedWeek,
    closeFilter,
  ]);

  const handleSelectDeviceAll = useCallback(() => {
    setSelectedDevice("all");
    closeFilter();
  }, [setSelectedDevice, closeFilter]);

  const deviceOptionNodes = useMemo(() => {
    return deviceOptions.map((d) => {
      const isActive = selectedDevice === d;

      return (
        <button
          key={d}
          type="button"
          onClick={() => {
            setSelectedDevice(d);
            closeFilter();
          }}
          className={optionBtnClass(isActive)}
        >
          {d}
        </button>
      );
    });
  }, [deviceOptions, selectedDevice, setSelectedDevice, closeFilter]);

  const handleSelectChannelAll = useCallback(() => {
    setSelectedChannel("all");
    closeFilter();
  }, [setSelectedChannel, closeFilter]);

  const channelOptionNodes = useMemo(() => {
    return channelOptions.map((c) => {
      const isDisplay =
        c === "display" ||
        c === ("display ad" as any) ||
        c === ("display_ad" as any);

      const disabled = disableDisplayChannel && isDisplay;
      const isActive = selectedChannel === c;

      return (
        <button
          key={c}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setSelectedChannel(c);
            closeFilter();
          }}
          title={
            disabled
              ? "키워드 탭에서는 display ad를 선택할 수 없습니다."
              : String(c)
          }
          className={optionBtnClass(isActive, false, disabled)}
        >
          {c}
        </button>
      );
    });
  }, [
    channelOptions,
    disableDisplayChannel,
    selectedChannel,
    setSelectedChannel,
    closeFilter,
  ]);

  const handleSelectSourceAll = useCallback(() => {
    setSelectedSource("all");
    closeFilter();
  }, [setSelectedSource, closeFilter]);

  const sourceOptionNodes = useMemo(() => {
    return sourceOptions.map((s) => {
      const isActive = selectedSource === s;

      return (
        <button
          key={s}
          type="button"
          onClick={() => {
            setSelectedSource(s);
            closeFilter();
          }}
          className={optionBtnClass(isActive)}
        >
          {s}
        </button>
      );
    });
  }, [sourceOptions, selectedSource, setSelectedSource, closeFilter]);

  const handleSelectProductAll = useCallback(() => {
    setSelectedProduct("all");
    closeFilter();
  }, [setSelectedProduct, closeFilter]);

  const productOptionNodes = useMemo(() => {
    return productOptions.map((p) => {
      const isActive = selectedProduct === p;

      return (
        <button
          key={p}
          type="button"
          onClick={() => {
            setSelectedProduct(p);
            closeFilter();
          }}
          className={optionBtnClass(isActive)}
        >
          {p}
        </button>
      );
    });
  }, [productOptions, selectedProduct, setSelectedProduct, closeFilter]);

  return (
    <div
      ref={filterRootRef}
      className="relative overflow-visible bg-transparent"
    >
      <UnifiedTabBar
        tab={tab}
        setTab={setTab}
        filterToolbar={
          <FilterToolbar
            filterKey={filterKey}
            onToggleMonth={handleToggleMonth}
            onToggleWeek={handleToggleWeek}
            onToggleDevice={handleToggleDevice}
            onToggleChannel={handleToggleChannel}
            onToggleSource={handleToggleSource}
            onToggleProduct={handleToggleProduct}
            hasSourceOptions={hasSourceOptions}
            hasProductOptions={hasProductOptions}
          />
        }
      />

      <HeaderIntro
        advertiserName={advertiserName}
        reportTypeName={reportTypeName}
        reportTypeKey={reportTypeKey}
        fullPeriod={fullPeriod}
        period={period}
      />

      {!hidePeriodEditor ? (
        <div className="bg-transparent">
          <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
            <div className="flex min-w-max items-center gap-1.5 px-3 py-2 sm:px-4">
              <span className="whitespace-nowrap text-[11px] font-semibold text-slate-500">
                기간
              </span>

              <select
                value={reportPeriod.preset}
                onChange={(e) =>
                  handlePresetChange(e.target.value as ReportPeriodPreset)
                }
                className="h-8 w-[108px] shrink-0 rounded-md border border-[var(--nature-border)] bg-[var(--nature-surface)] px-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-[var(--nature-blue)] focus:bg-white"
              >
                {REPORT_PERIOD_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {periodPresetLabel(preset)}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={reportPeriod.startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="h-8 w-[138px] shrink-0 rounded-md border border-[var(--nature-border)] bg-[var(--nature-surface)] px-2 text-xs text-slate-700 outline-none transition focus:border-[var(--nature-blue)] focus:bg-white"
              />

              <span className="shrink-0 text-xs font-medium text-slate-400">
                ~
              </span>

              <input
                type="date"
                value={reportPeriod.endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="h-8 w-[138px] shrink-0 rounded-md border border-[var(--nature-border)] bg-[var(--nature-surface)] px-2 text-xs text-slate-700 outline-none transition focus:border-[var(--nature-blue)] focus:bg-white"
              />

              {!hideTabPeriodText ? (
                <div className="ml-2 shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                  기준 기간{" "}
                  <span className="font-semibold text-slate-800">
                    {reportPeriod.startDate || "-"} ~{" "}
                    {reportPeriod.endDate || "-"}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {filterKey === "month" && (
        <OptionPopover title="월 선택">
          <button
            type="button"
            onClick={handleSelectMonthAll}
            className={optionBtnClass(selectedMonth === "all")}
          >
            전체
          </button>
          {monthOptionNodes}
        </OptionPopover>
      )}

      {filterKey === "week" && (
        <OptionPopover title="주차 선택">
          <button
            type="button"
            onClick={handleSelectWeekAll}
            className={optionBtnClass(selectedWeek === "all")}
          >
            전체
          </button>
          {weekOptionNodes}
        </OptionPopover>
      )}

      {filterKey === "device" && (
        <OptionPopover title="기기 선택">
          <button
            type="button"
            onClick={handleSelectDeviceAll}
            className={optionBtnClass(selectedDevice === "all")}
          >
            전체
          </button>
          {deviceOptionNodes}
        </OptionPopover>
      )}

      {filterKey === "channel" && (
        <OptionPopover title="채널 선택">
          <button
            type="button"
            onClick={handleSelectChannelAll}
            className={optionBtnClass(selectedChannel === "all")}
          >
            전체
          </button>
          {channelOptionNodes}
        </OptionPopover>
      )}

      {hasSourceOptions && filterKey === "source" && (
        <OptionPopover title="소스 선택">
          <button
            type="button"
            onClick={handleSelectSourceAll}
            className={optionBtnClass(selectedSource === "all")}
          >
            전체
          </button>
          {sourceOptionNodes}
        </OptionPopover>
      )}

      {hasProductOptions && filterKey === "product" && (
        <OptionPopover title="상품 선택">
          <button
            type="button"
            onClick={handleSelectProductAll}
            className={optionBtnClass(selectedProduct === "all")}
          >
            전체
          </button>
          {productOptionNodes}
        </OptionPopover>
      )}
    </div>
  );
}

export default function HeaderBar(props: Props) {
  const { readOnlyHeader = false } = props;

  return (
    <header className="relative z-50 bg-transparent">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[linear-gradient(135deg,rgba(248,244,237,0.94)_0%,rgba(244,233,218,0.90)_38%,rgba(222,239,244,0.88)_72%,rgba(190,220,232,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.58),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,250,242,0.55),transparent_38%)]" />

      <div className="relative px-4 pb-2 pt-3 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1680px]">
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

      <div className="pointer-events-none absolute inset-x-8 bottom-0 h-6 translate-y-[42%] rounded-full bg-[linear-gradient(180deg,rgba(127,166,196,0.20)_0%,rgba(183,215,227,0.11)_45%,rgba(255,255,255,0)_100%)] blur-[7px]" />
    </header>
  );
}
