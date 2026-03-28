"use client";

import { useMemo, useState } from "react";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  MonthKey,
  WeekKey,
} from "@/src/lib/report/types";

type WeekOption = { weekKey: WeekKey; label: string };

type FilterGroupKey = "month" | "week" | "device" | "channel" | "source";

type Props = {
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

  selectedSource: string;
  setSelectedSource: (s: string) => void;

  monthOptions: MonthKey[];
  weekOptions: WeekOption[];
  deviceOptions: DeviceKey[];
  channelOptions: ChannelKey[];
  sourceOptions: string[];

  enabledMonthKeySet: Set<string>;
  enabledWeekKeySet: Set<string>;

  readOnlyHeader?: boolean;
};

function cleanText(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function toMonthLabel(v: MonthKey) {
  if (v === "all") return "전체";
  return cleanText(v);
}

function toWeekLabel(v: WeekKey, weekOptions: WeekOption[]) {
  if (v === "all") return "전체";
  return weekOptions.find((x) => x.weekKey === v)?.label ?? cleanText(v);
}

function toDeviceLabel(v: DeviceKey) {
  if (v === "all") return "전체";
  return cleanText(v);
}

function toChannelLabel(v: ChannelKey) {
  if (v === "all") return "전체";
  return cleanText(v);
}

function toSourceLabel(v: string) {
  if (!v || v === "all") return "전체";
  return cleanText(v);
}

function shellClass() {
  return [
    "hidden xl:flex",
    "fixed left-3 2xl:left-4 top-1/2 -translate-y-1/2 z-20",
    "w-[168px] 2xl:w-[180px] flex-col gap-2.5",
    "pointer-events-auto",
  ].join(" ");
}

function cardClass() {
  return [
    "rounded-2xl border border-slate-200/80 bg-white/88",
    "backdrop-blur-md shadow-lg shadow-slate-900/8",
    "p-2.5",
  ].join(" ");
}

function groupButtonClass(active: boolean) {
  return [
    "w-full rounded-xl border px-2.5 py-1.5 text-left transition-all duration-200",
    active
      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");
}

function optionButtonClass(active: boolean, disabled = false) {
  return [
    "w-full rounded-lg border px-2 py-1.5 text-left text-[13px] transition-all duration-150",
    active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    disabled ? "cursor-not-allowed opacity-40 hover:bg-white" : "",
  ].join(" ");
}

export default function FloatingFilterRail({
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
  selectedSource,
  setSelectedSource,
  monthOptions,
  weekOptions,
  deviceOptions,
  channelOptions,
  sourceOptions,
  enabledMonthKeySet,
  enabledWeekKeySet,
  readOnlyHeader = false,
}: Props) {
  const [openGroup, setOpenGroup] = useState<FilterGroupKey | null>(null);

  const groups = useMemo(
    () => [
      {
        key: "month" as const,
        label: "월",
        valueLabel: toMonthLabel(selectedMonth),
      },
      {
        key: "week" as const,
        label: "주차",
        valueLabel: toWeekLabel(selectedWeek, weekOptions),
      },
      {
        key: "device" as const,
        label: "기기",
        valueLabel: toDeviceLabel(selectedDevice),
      },
      {
        key: "channel" as const,
        label: "채널",
        valueLabel: toChannelLabel(selectedChannel),
      },
      {
        key: "source" as const,
        label: "소스",
        valueLabel: toSourceLabel(selectedSource),
      },
    ],
    [
      selectedMonth,
      selectedWeek,
      selectedDevice,
      selectedChannel,
      selectedSource,
      weekOptions,
    ]
  );

  if (readOnlyHeader) return null;

  return (
    <aside className={shellClass()} aria-label="보조 필터 패널">
      <div className={cardClass()}>
        <div className="mb-2 px-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Filters
          </div>
        </div>

        <div className="space-y-2">
          {groups.map((group) => {
            const isActive = filterKey === group.key || openGroup === group.key;

            return (
              <button
                key={group.key}
                type="button"
                className={groupButtonClass(isActive)}
                onClick={() => {
                  setFilterKey(group.key);
                  setOpenGroup((prev) => (prev === group.key ? null : group.key));
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{group.label}</span>
                  <span className="text-[11px] opacity-70">선택</span>
                </div>
                <div className="mt-1 truncate text-xs opacity-80">
                  {group.valueLabel}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {openGroup === "month" ? (
        <div className={cardClass()}>
          <div className="mb-2 text-xs font-semibold text-slate-500">월</div>
          <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
            {monthOptions.map((month) => {
              const disabled =
                month !== "all" && !enabledMonthKeySet.has(String(month));
              const active = selectedMonth === month;

              return (
                <button
                  key={String(month)}
                  type="button"
                  disabled={disabled}
                  className={optionButtonClass(active, disabled)}
                  onClick={() => {
                    if (disabled) return;
                    setSelectedMonth(month);
                  }}
                >
                  {toMonthLabel(month)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {openGroup === "week" ? (
        <div className={cardClass()}>
          <div className="mb-2 text-xs font-semibold text-slate-500">주차</div>
          <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
            {weekOptions.map((week) => {
              const disabled =
                week.weekKey !== "all" &&
                !enabledWeekKeySet.has(String(week.weekKey));
              const active = selectedWeek === week.weekKey;

              return (
                <button
                  key={String(week.weekKey)}
                  type="button"
                  disabled={disabled}
                  className={optionButtonClass(active, disabled)}
                  onClick={() => {
                    if (disabled) return;
                    setSelectedWeek(week.weekKey);
                  }}
                >
                  {week.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {openGroup === "device" ? (
        <div className={cardClass()}>
          <div className="mb-2 text-xs font-semibold text-slate-500">기기</div>
          <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
            {deviceOptions.map((device) => {
              const active = selectedDevice === device;

              return (
                <button
                  key={String(device)}
                  type="button"
                  className={optionButtonClass(active, false)}
                  onClick={() => setSelectedDevice(device)}
                >
                  {toDeviceLabel(device)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {openGroup === "channel" ? (
        <div className={cardClass()}>
          <div className="mb-2 text-xs font-semibold text-slate-500">채널</div>
          <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
            {channelOptions.map((channel) => {
              const active = selectedChannel === channel;

              return (
                <button
                  key={String(channel)}
                  type="button"
                  className={optionButtonClass(active, false)}
                  onClick={() => setSelectedChannel(channel)}
                >
                  {toChannelLabel(channel)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {openGroup === "source" ? (
        <div className={cardClass()}>
          <div className="mb-2 text-xs font-semibold text-slate-500">소스</div>
          <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
            {sourceOptions.map((source) => {
              const active = selectedSource === source;

              return (
                <button
                  key={String(source)}
                  type="button"
                  className={optionButtonClass(active, false)}
                  onClick={() => setSelectedSource(source)}
                >
                  {toSourceLabel(source)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </aside>
  );
}