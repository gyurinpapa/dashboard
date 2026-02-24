"use client";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  MonthKey,
  TabKey,
  WeekKey,
} from "../../../src/lib/report/types";

import { monthLabelOf } from "../../../src/lib/report/date";

import FilterBtn from "../ui/FilterBtn";

type WeekOption = { weekKey: WeekKey; label: string };

type Props = {
  tab: TabKey;
  setTab: (t: TabKey) => void;

  filterKey: FilterKey;
  setFilterKey: (k: FilterKey) => void;

  selectedMonth: MonthKey;
  setSelectedMonth: (m: MonthKey) => void;

  selectedWeek: WeekKey;
  setSelectedWeek: (w: WeekKey) => void;

  selectedDevice: DeviceKey;
  setSelectedDevice: (d: DeviceKey) => void;

  selectedChannel: ChannelKey;
  setSelectedChannel: (c: ChannelKey) => void;

  monthOptions: MonthKey[];
  weekOptions: WeekOption[];
  deviceOptions: DeviceKey[];
  channelOptions: ChannelKey[];

  enabledMonthKeySet: Set<string>;
  enabledWeekKeySet: Set<string>;

  period: string;
};

export default function HeaderBar(props: Props) {
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
    monthOptions,
    weekOptions,
    deviceOptions,
    channelOptions,
    enabledMonthKeySet,
    enabledWeekKeySet,
    period,
  } = props;

  const toggleFilter = (k: Exclude<FilterKey, null>) =>{
    const next = filterKey === k ? null : k;
    setFilterKey(next as any);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
      <div className="p-8 pb-4">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="mb-6 text-center pt-4">
            <h1 className="text-3xl font-semibold tracking-tight">
              네이처컬렉션 온라인광고 보고서
            </h1>
            <div className="mt-4 border-t border-gray-400" />
            <div className="mt-1 border-t border-gray-300" />
          </div>

          <div className="flex items-start justify-between mb-2">
            {/* LEFT: Filters */}
            <div className="relative inline-block">
              <div className="flex gap-2">
                <FilterBtn active={filterKey === "month"} onClick={() => toggleFilter("month")}>
                  월
                </FilterBtn>
                <FilterBtn active={filterKey === "week"} onClick={() => toggleFilter("week")}>
                  주차
                </FilterBtn>
                <FilterBtn active={filterKey === "device"} onClick={() => toggleFilter("device")}>
                  기기
                </FilterBtn>
                <FilterBtn active={filterKey === "channel"} onClick={() => toggleFilter("channel")}>
                  채널
                </FilterBtn>
              </div>

              {period && (
                <div className="mt-3 mb-2 text-sm text-gray-600">
                  기간: <span className="font-semibold text-gray-900">{period}</span>
                </div>
              )}

              {/* 월 패널 */}
              {filterKey === "month" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedMonth === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
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
                          className={[
                            "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                            selectedMonth === m
                              ? "bg-orange-700 text-white border-orange-700"
                              : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                            dim ? "opacity-40" : "",
                          ].join(" ")}
                        >
                          {monthLabelOf(m)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 주차 패널 */}
              {filterKey === "week" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWeek("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedWeek === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
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
                          className={[
                            "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                            selectedWeek === wk
                              ? "bg-orange-700 text-white border-orange-700"
                              : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                            dim ? "opacity-40" : "",
                          ].join(" ")}
                        >
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 기기 패널 */}
              {filterKey === "device" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDevice("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedDevice === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
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
                        className={[
                          "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                          selectedDevice === d
                            ? "bg-orange-700 text-white border-orange-700"
                            : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                        ].join(" ")}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 채널 패널 */}
              {filterKey === "channel" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChannel("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedChannel === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
                    >
                      전체
                    </button>

                    {channelOptions.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setSelectedChannel(c);
                          setFilterKey(null);
                        }}
                        className={[
                          "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                          selectedChannel === c
                            ? "bg-orange-700 text-white border-orange-700"
                            : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                        ].join(" ")}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Tabs + VAT */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTab("summary")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "summary"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  요약
                </button>

                <button
                  type="button"
                  onClick={() => setTab("structure")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "structure"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  구조
                </button>

                <button
                  type="button"
                  onClick={() => setTab("keyword")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "keyword"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  키워드
                </button>

                <button
                  type="button"
                  onClick={() => setTab("keywordDetail")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "keywordDetail"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  키워드(상세)
                </button>

                <button
                  type="button"
                  onClick={() => setTab("creative")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "creative"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  소재
                </button>

                <button
                  type="button"
                  onClick={() => setTab("creativeDetail")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "creativeDetail"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  소재(상세)
                </button>
              </div>

              <div className="text-sm text-gray-600">[+VAT]</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}