// src/lib/export-builder/feature.ts

/**
 * export-builder 진입 UI 임시 노출 여부
 * - false: 진입 버튼/링크 숨김
 * - true: 진입 버튼/링크 노출
 *
 * 주의:
 * - export-builder 라우트 자체는 유지
 * - 기존 share / reports / publish / report preview 로직에는 영향 없음
 */
export const ENABLE_EXPORT_BUILDER_ENTRY = false;