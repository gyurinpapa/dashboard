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
    ? options.map(normalizeOption).filter(Boolean) as NormalizedOption[]
    : [];

  const hasRealOptions = normalizedFromOptions.some((item) => item.value !== "all");

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
  return (
    <section className="rounded-2xl border border-gray-200 bg-white/95 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
          {title}
        </span>
        <span className="text-[10px] text-gray-400">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="border-t border-gray-100 px-2 py-2">
          <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto pr-1">
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
                    "w-full rounded-xl px-2.5 py-2 text-left text-[12px] transition",
                    "whitespace-nowrap overflow-hidden text-ellipsis",
                    active
                      ? "border border-gray-900 bg-gray-900 text-white"
                      : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                    disabled ? "cursor-not-allowed opacity-40 hover:bg-white" : "",
                  ].join(" ")}
                >
                  {option.label}
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
      <div className="flex w-[124px] flex-col gap-2">
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