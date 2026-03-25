// src/lib/export-builder/source-browser-types.ts

import type {
  ChannelKey,
  DeviceKey,
  MonthKey,
  WeekKey,
} from "@/src/lib/report/types";
import type { ExportSectionKey } from "@/src/lib/export-builder/types";

export type SourceBrowserTabKey =
  | "summary"
  | "summary2"
  | "structure"
  | "keyword"
  | "keyword-detail"
  | "creative"
  | "creative-detail";

export type SourceBrowserFilterState = {
  selectedMonth: MonthKey;
  selectedWeek: WeekKey;
  selectedDevice: DeviceKey;
  selectedChannel: ChannelKey;
};

export type SourceBrowserTabItem = {
  key: SourceBrowserTabKey;
  label: string;
  enabled: boolean;
  description?: string;
};

export type SourceBrowserBlockItem = {
  key: string;
  tab: SourceBrowserTabKey;
  label: string;
  description: string;
  sectionKey?: ExportSectionKey;
  enabled: boolean;
  badge?: string;
};