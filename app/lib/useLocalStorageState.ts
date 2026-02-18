"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const read = (): T => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return defaultValue;
      const parsed = JSON.parse(raw) as T;
      return (parsed ?? defaultValue) as T;
    } catch {
      return defaultValue;
    }
  };

  // ✅ 초기 렌더에서는 defaultValue로 시작 → mount 후에만 localStorage로 동기화
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  // 1) mount 후 로드
  useEffect(() => {
    setValue(read());
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 2) hydrated 이후에만 저장
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value, hydrated]);

  return [value, setValue];
}
