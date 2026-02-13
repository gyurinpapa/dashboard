"use client";

import { useEffect, useState } from "react";

/**
 * useLocalStorageState
 * - client component 전용
 * - localStorage에 값 저장/로드를 자동 처리
 * - 초기 렌더에서 SSR/CSR mismatch 방지용으로 mount 이후에만 로드
 */
export function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // 1) mount 이후 localStorage 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw));
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 2) 값 변경 시 localStorage 저장 (hydrated 이후만)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}
