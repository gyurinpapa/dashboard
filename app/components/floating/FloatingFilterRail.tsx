"use client";

import { useMemo, useState } from "react";

type PrimitiveOption = string;

type ObjectOption = {
  key?: string;
  value?: string;
  label?: string;
  name?: string;
  id?: string;
};

type OptionInput = PrimitiveOption | ObjectOption;

type Props = {
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  monthOptions?: OptionInput[];

  selectedWeek: string;
  setSelectedWeek: (value: string) => void;
  weekOptions?: OptionInput[];

  selectedDevice: string;
  setSelectedDevice: (value: string) => void;
  deviceOptions?: OptionInput[];

  selectedChannel: string;
  setSelectedChannel: (value: string) => void;
  channelOptions?: OptionInput[];

  selectedSource: string;
  setSelectedSource: (value: string) => void;
  sourceOptions?: OptionInput[];

  enabledMonthKeySet?: Set<string>;
  enabledWeekKeySet?: Set<string>;

  className?: string;
  readOnly?: boolean;
};

type NormalizedOption = {
  value: string;
  label: string;
};

type GroupKey = "month" | "week" | "device" | "channel" | "source";

const ALL_OPTION: NormalizedOption = {
  value: "all",
  label: "전체",
};

function asText(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeOption(input: OptionInput): NormalizedOption | null {
  if (typeof input === "string") {
    const value = asText(input);
    if (!value) return null;
    if (value === "all") return ALL_OPTION;
    return {
      value,
      label: value,
    };
  }

  const value = asText(input.value ?? input.key ?? input.id);
  const label = asText(input.label ?? input.name ?? value);

  if (!value) return null;
  if (value === "all") return ALL_OPTION;

  return {
    value,
    label: label || value,
  };
}

function dedupeWithAllFirst(items: NormalizedOption[]) {
  const map = new Map<string, NormalizedOption>();
  map.set(ALL_OPTION.value, ALL_OPTION);

  for (const item of items) {
    if (!item?.value) continue;
    if (!map.has(item.value)) {
      map.set(item.value, item);
    }
  }

  return Array.from(map.values());
}

function buildSafeOptions(
  options?: OptionInput[],
  fallbackSet?: Set<string>
): NormalizedOption[] {
  const normalizedFromOptions = Array.isArray(options)
    ? (options.map(normalizeOption).filter(Boolean) as NormalizedOption[])
    : [];

  const hasRealOptions = normalizedFromOptions.some(
    (item) => item.value !== "all"
  );

  if (hasRealOptions) {
    return dedupeWithAllFirst(normalizedFromOptions);
  }

  const normalizedFromSet = fallbackSet
    ? Array.from(fallbackSet)
        .map((value) => asText(value))
        .filter(Boolean)
        .map((value) => ({
          value,
          label: value,
        }))
    : [];

  return dedupeWithAllFirst(normalizedFromSet);
}

function GroupSection({
  title,
  open,
  onToggle,
  options,
  selectedValue,
  onSelect,
  readOnly,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  options: NormalizedOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  readOnly?: boolean;
}) {
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? ALL_OPTION;

  return (
    <section
      className={[
        "overflow-hidden rounded-[24px] border bg-white/95 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-all duration-200",
        open
          ? "border-slate-200/90"
          : "border-slate-200/80 hover:border-slate-300/80 hover:shadow-[0_10px_30px_rgba(15,23,42,0.10)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className={[
          "group flex w-full items-center gap-2 px-4 py-3.5 transition-colors",
          open ? "bg-white" : "bg-white hover:bg-slate-50/90",
        ].join(" ")}
      >
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[11px] font-semibold tracking-[-0.01em] text-slate-500">
            {title}
          </div>
          {!open ? (
            <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
              {selectedOption?.label || "전체"}
            </div>
          ) : null}
        </div>

        <div
          className={[
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-all",
            open
              ? "border-slate-200 bg-slate-50 text-slate-500"
              : "border-slate-200 bg-white text-slate-400 group-hover:border-slate-300 group-hover:text-slate-600",
          ].join(" ")}
          aria-hidden="true"
        >
          {open ? "−" : "+"}
        </div>
      </button>

      {open ? (
        <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/70 to-white px-3 pb-3 pt-3">
          <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
            {options.map((option) => {
              const active = selectedValue === option.value;
              const disabled = Boolean(readOnly);

              return (
                <button
                  key={`${title}-${option.value}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(option.value)}
                  className={[
                    "w-full rounded-full border px-1.5 py-3 text-center text-[12px] font-semibold tracking-[-0.01em] transition-all duration-200",
                    "flex min-h-[46px] items-center justify-center",
                    "whitespace-nowrap overflow-hidden text-ellipsis",
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-[0_6px_18px_rgba(15,23,42,0.18)]"
                      : "border-slate-200 bg-white text-slate-700 hover:-translate-y-[1px] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
                    disabled
                      ? "cursor-not-allowed opacity-40 hover:translate-y-0 hover:border-slate-200 hover:bg-white hover:text-slate-700"
                      : "cursor-pointer",
                  ].join(" ")}
                  title={option.label}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function FloatingFilterRail({
  selectedMonth,
  setSelectedMonth,
  monthOptions = [],

  selectedWeek,
  setSelectedWeek,
  weekOptions = [],

  selectedDevice,
  setSelectedDevice,
  deviceOptions = [],

  selectedChannel,
  setSelectedChannel,
  channelOptions = [],

  selectedSource,
  setSelectedSource,
  sourceOptions = [],

  enabledMonthKeySet,
  enabledWeekKeySet,

  className = "",
  readOnly = false,
}: Props) {
  const [openGroup, setOpenGroup] = useState<Record<GroupKey, boolean>>({
    month: true,
    week: true,
    device: false,
    channel: false,
    source: false,
  });

  const safeMonthOptions = useMemo(() => {
    return buildSafeOptions(monthOptions, enabledMonthKeySet);
  }, [monthOptions, enabledMonthKeySet]);

  const safeWeekOptions = useMemo(() => {
    return buildSafeOptions(weekOptions, enabledWeekKeySet);
  }, [weekOptions, enabledWeekKeySet]);

  const safeDeviceOptions = useMemo(() => {
    return buildSafeOptions(deviceOptions);
  }, [deviceOptions]);

  const safeChannelOptions = useMemo(() => {
    return buildSafeOptions(channelOptions);
  }, [channelOptions]);

  const safeSourceOptions = useMemo(() => {
    return buildSafeOptions(sourceOptions);
  }, [sourceOptions]);

  const toggleGroup = (group: GroupKey) => {
    setOpenGroup((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  return (
    <aside className={className}>
      <div className="flex w-[124px] flex-col gap-4">
        <GroupSection
          title="월"
          open={openGroup.month}
          onToggle={() => toggleGroup("month")}
          options={safeMonthOptions}
          selectedValue={selectedMonth}
          onSelect={setSelectedMonth}
          readOnly={readOnly}
        />

        <GroupSection
          title="주차"
          open={openGroup.week}
          onToggle={() => toggleGroup("week")}
          options={safeWeekOptions}
          selectedValue={selectedWeek}
          onSelect={setSelectedWeek}
          readOnly={readOnly}
        />

        <GroupSection
          title="기기"
          open={openGroup.device}
          onToggle={() => toggleGroup("device")}
          options={safeDeviceOptions}
          selectedValue={selectedDevice}
          onSelect={setSelectedDevice}
          readOnly={readOnly}
        />

        <GroupSection
          title="채널"
          open={openGroup.channel}
          onToggle={() => toggleGroup("channel")}
          options={safeChannelOptions}
          selectedValue={selectedChannel}
          onSelect={setSelectedChannel}
          readOnly={readOnly}
        />

        <GroupSection
          title="소스"
          open={openGroup.source}
          onToggle={() => toggleGroup("source")}
          options={safeSourceOptions}
          selectedValue={selectedSource}
          onSelect={setSelectedSource}
          readOnly={readOnly}
        />
      </div>
    </aside>
  );
}