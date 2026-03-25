// src/lib/export-builder/types.ts

export type ExportRatio = "16:9";

export type ExportTemplateKey =
  | "full-single"
  | "top-bottom"
  | "two-column-equal"
  | "left-wide-right-stack"
  | "grid-2x2";

export type ExportSectionKey =
  | "summary-kpi"
  | "summary-chart"
  | "summary-goal"
  | "summary2-heatmap"
  | "summary2-funnel"
  | "keyword-top10"
  | "creative-top8";

export type ExportCategory =
  | "summary"
  | "summary2"
  | "keyword"
  | "creative";

export type ExportSlotId = string;

export type ExportSlotRole =
  | "hero-main"
  | "hero-summary"
  | "detail-main"
  | "wide-primary"
  | "split-main-a"
  | "split-main-b"
  | "compact-support-top"
  | "compact-support-bottom"
  | "compact-grid";

export type ExportInsightPolicy = "normal" | "short" | "hidden";
export type ExportInsightMode = "manual" | "auto";

export type ExportBlock = {
  id: string;
  sectionKey: ExportSectionKey;
  slotId: ExportSlotId;

  /**
   * Step19-2
   * 슬롯 Inspector 최소 override
   */
  title?: string;
  subtitle?: string;
  hidden?: boolean;

  /**
   * Step18-1 / Step20-1
   * 장표별 직접작성/자동작성 인사이트 확장용 최소 필드
   * - auto: 다음 단계에서 자동 생성 인사이트 사용
   * - manual: insightText 직접 작성본 사용
   */
  insightMode?: ExportInsightMode;
  insightText?: string;
};

export type ExportPage = {
  id: string;
  templateKey: ExportTemplateKey;
  title?: string;
  blocks: ExportBlock[];
};

export type ExportDocumentMeta = {
  reportId: string;
  advertiserName?: string;
  reportTypeName?: string;
  periodLabel?: string;
};

export type ExportDocument = {
  id: string;
  ratio: ExportRatio;
  meta: ExportDocumentMeta;
  pages: ExportPage[];
  createdAt: string;
  updatedAt: string;
};

export type ExportTemplateSlotDefinition = {
  id: ExportSlotId;
  label: string;
  description?: string;

  /**
   * Step20-2
   * 템플릿-슬롯 계약 기반 builder 강화를 위한 최소 메타
   */
  slotRole?: ExportSlotRole;
  insightPolicy?: ExportInsightPolicy;
  preferredSections?: ExportSectionKey[];
  allowedSections?: ExportSectionKey[];
};

export type ExportTemplateDefinition = {
  key: ExportTemplateKey;
  label: string;
  description?: string;
  slots: ExportTemplateSlotDefinition[];
};

export type ExportSectionDefinition = {
  key: ExportSectionKey;
  label: string;
  description?: string;
  category: ExportCategory;

  /**
   * 이 섹션이 특히 잘 맞는 템플릿들
   * UI에서 추천 badge / 필터링 용도로 사용 가능
   */
  recommendedTemplates: ExportTemplateKey[];

  /**
   * 특정 slot id만 허용하고 싶을 때 사용
   * 지금 단계에서는 거의 비워두고,
   * 추후 full-only 같은 제약이 필요해질 때 확장
   */
  allowedSlots?: ExportSlotId[];

  /**
   * export 렌더러에서 최소 높이 프리셋 참고용
   */
  minHeightPreset?: "sm" | "md" | "lg";

  /**
   * 섹션 카드/차트류인지 표류인지 정도를 구분하는 힌트
   * 이후 UI 필터링/배치 추천에 활용 가능
   */
  viewType?: "kpi" | "chart" | "table" | "heatmap" | "funnel" | "goal";
};

export type ExportStarterPresetKey =
  | "starter-default"
  | "starter-summary-focused"
  | "starter-executive";

export type ExportStarterPresetDefinition = {
  key: ExportStarterPresetKey;
  label: string;
  description?: string;
};

export type CreateExportDocumentInput = {
  reportId: string;
  advertiserName?: string;
  reportTypeName?: string;
  periodLabel?: string;
  preset?: ExportStarterPresetKey;
};