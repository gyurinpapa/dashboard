"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const isBrowser = typeof window !== "undefined";

  const read = (): T => {
    if (!isBrowser) return defaultValue;

    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return defaultValue;

      const parsed = JSON.parse(raw) as T;
      return parsed ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [value, setValue] = useState<T>(() => read());

  // key가 바뀌면 그 key로 다시 로드
  useEffect(() => {
    if (!isBrowser) return;
    setValue(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 값 변경 시 저장
  useEffect(() => {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장 실패는 무시
    }
  }, [key, value, isBrowser]);

  return [value, setValue];
}
