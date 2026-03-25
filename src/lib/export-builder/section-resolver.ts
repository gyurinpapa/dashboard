// src/lib/export-builder/section-resolver.ts

import type { ExportSectionKey } from "./types";
import type {
  ExportReportAggregateInput,
  ExportSectionDataMap,
  ExportSectionMeta,
  ExportSectionPayloadMap,
} from "./section-props";
import {
  EXPORT_SECTION_META_FALLBACK,
  getFallbackSectionData,
} from "./section-fallbacks";

export function buildSectionMeta(
  meta?: Partial<ExportSectionMeta>
): ExportSectionMeta {
  return {
    ...EXPORT_SECTION_META_FALLBACK,
    ...(meta ?? {}),
  };
}

/**
 * 중요:
 * - 실제 section payload가 들어온 경우에는 fallback 샘플 데이터를 섞지 않는다.
 * - payload가 아예 없을 때만 fallback을 사용한다.
 *
 * 이유:
 * - export-builder 전역 기간 / source filter 변경 후 계산된 payload가
 *   fallback 샘플에 가려져 보이는 문제를 막기 위함
 * - "실데이터가 있으면 실데이터 우선" 원칙 유지
 */
export function buildSectionData<K extends ExportSectionKey>(
  sectionKey: K,
  data?: Partial<ExportSectionDataMap[K]>
): ExportSectionDataMap[K] {
  if (data) {
    return data as ExportSectionDataMap[K];
  }

  return getFallbackSectionData(sectionKey) as ExportSectionDataMap[K];
}

export function buildSectionProps<K extends ExportSectionKey>(
  sectionKey: K,
  options?: {
    meta?: Partial<ExportSectionMeta>;
    sectionPayloads?: ExportSectionPayloadMap;
  }
) {
  const meta = buildSectionMeta(options?.meta);
  const data = buildSectionData(
    sectionKey,
    options?.sectionPayloads?.[sectionKey] as
      | Partial<ExportSectionDataMap[K]>
      | undefined
  );

  return {
    meta,
    data,
  };
}

/**
 * Step 17-9에서는 실제 aggregate 구조를 강제하지 않고,
 * 다음 단계에서 안전하게 교체 가능한 adapter 자리만 만든다.
 */
export function buildExportSectionPayloadsFromReportInput(
  input?: ExportReportAggregateInput
): ExportSectionPayloadMap {
  if (!input) return {};

  const payloads: ExportSectionPayloadMap = {};

  // 아래는 "안전한 골격"만 먼저 만든 상태.
  // 다음 단계에서 기존 Nature Report aggregate 구조를 확인한 뒤
  // section별 실제 변환 로직을 채우면 된다.

  if (input.summary) {
    // payloads["summary-kpi"] = ...
  }

  if (input.summaryChart) {
    // payloads["summary-chart"] = ...
  }

  if (input.summaryGoal) {
    // payloads["summary-goal"] = ...
  }

  if (input.heatmap) {
    // payloads["summary2-heatmap"] = ...
  }

  if (input.funnel) {
    // payloads["summary2-funnel"] = ...
  }

  if (Array.isArray(input.keywords)) {
    // payloads["keyword-top10"] = ...
  }

  if (Array.isArray(input.creatives)) {
    // payloads["creative-top8"] = ...
  }

  return payloads;
}