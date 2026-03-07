"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type CurrentWorkspaceItem = {
  id: string;
  name: string;
  slug?: string | null;
  role?: string | null;
  workspace_kind?: string | null;
  workspace_type?: string | null;
};

type CurrentWorkspaceContextValue = {
  workspaceId: string;
  setWorkspaceId: (nextId: string, options?: { replace?: boolean }) => void;

  workspaceList: CurrentWorkspaceItem[];
  setWorkspaceList: (items: CurrentWorkspaceItem[]) => void;

  currentWorkspace: CurrentWorkspaceItem | null;

  isReady: boolean;
  clearWorkspace: () => void;
};

const CurrentWorkspaceContext = createContext<CurrentWorkspaceContextValue | null>(null);

function normalizeWorkspaceId(value: unknown) {
  return String(value ?? "").trim();
}

function buildNextUrl(
  pathname: string,
  searchParams: URLSearchParams,
  nextWorkspaceId: string
) {
  const next = new URLSearchParams(searchParams.toString());

  if (nextWorkspaceId) {
    next.set("workspace_id", nextWorkspaceId);
  } else {
    next.delete("workspace_id");
  }

  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function CurrentWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlWorkspaceId = normalizeWorkspaceId(searchParams.get("workspace_id"));

  const [workspaceId, setWorkspaceIdState] = useState(urlWorkspaceId);
  const [workspaceList, setWorkspaceListState] = useState<CurrentWorkspaceItem[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    setWorkspaceIdState(urlWorkspaceId);
  }, [urlWorkspaceId]);

  const setWorkspaceId = useCallback(
    (nextId: string, options?: { replace?: boolean }) => {
      const normalized = normalizeWorkspaceId(nextId);
      setWorkspaceIdState(normalized);

      const url = buildNextUrl(pathname, new URLSearchParams(searchParams.toString()), normalized);

      if (options?.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    },
    [pathname, router, searchParams]
  );

  const clearWorkspace = useCallback(() => {
    setWorkspaceIdState("");
    const url = buildNextUrl(pathname, new URLSearchParams(searchParams.toString()), "");
    router.replace(url);
  }, [pathname, router, searchParams]);

  const setWorkspaceList = useCallback((items: CurrentWorkspaceItem[]) => {
    const safe = Array.isArray(items) ? items : [];
    setWorkspaceListState(safe);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (urlWorkspaceId) {
      setWorkspaceIdState(urlWorkspaceId);
    }
  }, [urlWorkspaceId]);

  const currentWorkspace = useMemo(() => {
    if (!workspaceId) return null;
    return workspaceList.find((w) => normalizeWorkspaceId(w.id) === workspaceId) ?? null;
  }, [workspaceId, workspaceList]);

  const value = useMemo<CurrentWorkspaceContextValue>(
    () => ({
      workspaceId,
      setWorkspaceId,
      workspaceList,
      setWorkspaceList,
      currentWorkspace,
      isReady: true,
      clearWorkspace,
    }),
    [
      workspaceId,
      setWorkspaceId,
      workspaceList,
      setWorkspaceList,
      currentWorkspace,
      clearWorkspace,
    ]
  );

  return (
    <CurrentWorkspaceContext.Provider value={value}>
      {children}
    </CurrentWorkspaceContext.Provider>
  );
}

export function useCurrentWorkspace() {
  const ctx = useContext(CurrentWorkspaceContext);
  if (!ctx) {
    throw new Error("useCurrentWorkspace must be used inside CurrentWorkspaceProvider");
  }
  return ctx;
}