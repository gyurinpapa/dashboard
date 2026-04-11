"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type ReportType = {
  id: string;
  key: string;
  name: string;
};

type ReportRow = {
  id: string;
  title: string;
  status: "draft" | "ready" | "archived";

  created_at?: string | null;

  advertiser_id?: string | null;
  advertiser_name?: string | null;
  share_token?: string | null;

  period_start?: string | null;
  period_end?: string | null;
  period_preset?: string | null;
  period_label?: string | null;

  draft_period_start?: string | null;
  draft_period_end?: string | null;
  draft_period_preset?: string | null;
  draft_period_label?: string | null;

  published_period_start?: string | null;
  published_period_end?: string | null;
  published_period_preset?: string | null;
  published_period_label?: string | null;
  published_at?: string | null;
};

type AdvertiserRow = {
  id: string;
  name: string;
};

type ReportFilterKey = "all" | "published" | "draft";
type MemberRole = "master" | "director" | "admin" | "staff" | "client" | null;

type WorkspaceMemberRow = {
  workspace_id: string;
  role: MemberRole;
  division: string | null;
  department: string | null;
  team: string | null;
  workspace_name?: string | null;
};

const ROLE_RANK: Record<Exclude<MemberRole, null>, number> = {
  client: 1,
  staff: 2,
  admin: 3,
  director: 4,
  master: 5,
};

async function safeReadJson(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return { __nonjson: true, status: res.status, text: "" };

  try {
    return JSON.parse(text);
  } catch {
    return { __nonjson: true, status: res.status, text };
  }
}

function norm(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

function normalizeRole(v: any): MemberRole {
  const s = norm(v);
  if (
    s === "master" ||
    s === "director" ||
    s === "admin" ||
    s === "staff" ||
    s === "client"
  ) {
    return s;
  }
  return null;
}

function hasMinRole(role: MemberRole, minRole: Exclude<MemberRole, null>) {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

function isPublishedReport(r: ReportRow) {
  const status = norm(r.status);
  return status === "ready" || !!String(r.share_token ?? "").trim();
}

function isDraftReport(r: ReportRow) {
  return norm(r.status) === "draft";
}

function isArchivedReport(r: ReportRow) {
  return norm(r.status) === "archived";
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function pickCurrentMembership(
  rows: WorkspaceMemberRow[],
  workspaceIdFromQuery: string
): WorkspaceMemberRow | null {
  if (!rows.length) return null;

  if (workspaceIdFromQuery) {
    const matched = rows.find((r) => r.workspace_id === workspaceIdFromQuery);
    if (matched) return matched;
  }

  const einvention = rows.find((r) => String(r.workspace_name ?? "") === "Einvention");
  if (einvention) return einvention;

  return rows[0] ?? null;
}

export default function ReportBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const workspaceIdFromQuery = searchParams.get("workspace_id")?.trim() || "";

  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("12345678");

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState<WorkspaceMemberRow[]>([]);

  const [memberRole, setMemberRole] = useState<MemberRole>(null);
  const [memberDivision, setMemberDivision] = useState<string | null>(null);
  const [memberDepartment, setMemberDepartment] = useState<string | null>(null);
  const [memberTeam, setMemberTeam] = useState<string | null>(null);

  const [types, setTypes] = useState<ReportType[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  const [creating, setCreating] = useState(false);

  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [search, setSearch] = useState("");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    __none__: true,
  });

  const [reportFilter, setReportFilter] = useState<ReportFilterKey>("all");

  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<string>("");
  const [newAdvertiserName, setNewAdvertiserName] = useState("");
  const [creatingAdvertiser, setCreatingAdvertiser] = useState(false);
  const [localMsg, setLocalMsg] = useState("");

  const [selectedAdvertiserIds, setSelectedAdvertiserIds] = useState<string[]>([]);
  const [deletingAdvertisers, setDeletingAdvertisers] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [deletingReports, setDeletingReports] = useState(false);

  const FOLDER_ROW_HEIGHT = 58;
  const REPORT_ROW_HEIGHT = 68;
  const OVERSCAN = 8;
  const LIST_VIEWPORT_HEIGHT = 520;
  const REPORTS_PAGE_SIZE = 100;
  const LOAD_MORE_THRESHOLD = 240;

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(LIST_VIEWPORT_HEIGHT);

  const reportsRequestSeqRef = useRef(0);
  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingReportsRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const canCreateReport = hasMinRole(memberRole, "staff");
  const canManageAdvertisers = hasMinRole(memberRole, "staff");
  const canDeleteReports = hasMinRole(memberRole, "staff");
  const canManageMembers = hasMinRole(memberRole, "director");
  const canDeleteAdvertisers = memberRole === "master";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  const resetReportsState = useCallback(() => {
    reportsRequestSeqRef.current += 1;

    nextOffsetRef.current = 0;
    hasMoreRef.current = false;
    loadingReportsRef.current = false;
    loadingMoreRef.current = false;

    setReports([]);
    setHasMore(false);
    setNextOffset(0);
    setLoadingReports(false);
    setLoadingMore(false);
  }, []);

  const normalizeReportList = useCallback((list: any[]): ReportRow[] => {
    return (list ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      status: String(r.status ?? ""),
      created_at: r.created_at ? String(r.created_at) : undefined,
      advertiser_id: r.advertiser_id ? String(r.advertiser_id) : null,
      advertiser_name: r.advertiser_name ? String(r.advertiser_name) : null,
      share_token: r.share_token ? String(r.share_token) : null,
      period_start: r.period_start ? String(r.period_start) : null,
      period_end: r.period_end ? String(r.period_end) : null,
      period_preset: r.period_preset ? String(r.period_preset) : null,
      period_label: r.period_label ? String(r.period_label) : null,
      draft_period_start: r.draft_period_start ? String(r.draft_period_start) : null,
      draft_period_end: r.draft_period_end ? String(r.draft_period_end) : null,
      draft_period_preset: r.draft_period_preset ? String(r.draft_period_preset) : null,
      draft_period_label: r.draft_period_label ? String(r.draft_period_label) : null,
      published_period_start: r.published_period_start
        ? String(r.published_period_start)
        : null,
      published_period_end: r.published_period_end
        ? String(r.published_period_end)
        : null,
      published_period_preset: r.published_period_preset
        ? String(r.published_period_preset)
        : null,
      published_period_label: r.published_period_label
        ? String(r.published_period_label)
        : null,
      published_at: r.published_at ? String(r.published_at) : null,
    })) as ReportRow[];
  }, []);

  const hydrateMissingAdvertiserNames = useCallback(async (rows: ReportRow[]) => {
    let nextReports = rows;

    const missingNameIds = Array.from(
      new Set(
        nextReports
          .filter((r) => r.advertiser_id && !r.advertiser_name)
          .map((r) => r.advertiser_id as string)
      )
    );

    if (!missingNameIds.length) return nextReports;

    const { data: advs, error } = await supabase
      .from("advertisers")
      .select("id,name")
      .in("id", missingNameIds);

    if (error || !advs?.length) return nextReports;

    const map = new Map<string, string>();
    for (const a of advs as any[]) {
      map.set(String(a.id), String(a.name ?? ""));
    }

    nextReports = nextReports.map((r) => {
      if (r.advertiser_id && !r.advertiser_name) {
        const nm = map.get(r.advertiser_id) ?? null;
        return { ...r, advertiser_name: nm };
      }
      return r;
    });

    return nextReports;
  }, []);

  const mergeUniqueReports = useCallback((prev: ReportRow[], incoming: ReportRow[]) => {
    if (!incoming.length) return prev;

    const map = new Map<string, ReportRow>();
    for (const row of prev) map.set(row.id, row);
    for (const row of incoming) map.set(row.id, row);

    return Array.from(map.values());
  }, []);

  const fetchReportsPage = useCallback(
    async ({
      reset = false,
      forceOffset,
    }: {
      reset?: boolean;
      forceOffset?: number;
    } = {}) => {
      if (!workspaceId) return;

      const currentOffset =
        typeof forceOffset === "number"
          ? forceOffset
          : reset
          ? 0
          : nextOffsetRef.current;

      if (reset) {
        if (loadingReportsRef.current) return;
      } else {
        if (loadingMoreRef.current) return;
        if (!hasMoreRef.current && currentOffset !== 0) return;
      }

      const requestSeq = ++reportsRequestSeqRef.current;

      if (reset) {
        loadingReportsRef.current = true;
        hasMoreRef.current = false;
        nextOffsetRef.current = 0;

        setLoadingReports(true);
        setHasMore(false);
        setNextOffset(0);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      try {
        const token = await getAccessToken();
        if (!token) return;

        const qs = new URLSearchParams();
        qs.set("workspace_id", workspaceId);
        qs.set("limit", String(REPORTS_PAGE_SIZE));
        qs.set("offset", String(currentOffset));

        const res = await fetch(`/api/reports/list?${qs.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await safeReadJson(res);

        if (requestSeq !== reportsRequestSeqRef.current) return;

        if (!res.ok || !(json as any)?.ok) {
          console.warn("[reports/list] failed", res.status, json);
          return;
        }

        const list = ((json as any)?.reports ?? []) as any[];
        const normalized = normalizeReportList(list);
        const hydrated = await hydrateMissingAdvertiserNames(normalized);

        if (requestSeq !== reportsRequestSeqRef.current) return;

        const parsedNextOffset = Number((json as any)?.next_offset);
        const safeNextOffset = Number.isFinite(parsedNextOffset)
          ? parsedNextOffset
          : currentOffset + hydrated.length;

        const safeHasMore =
          typeof (json as any)?.has_more === "boolean"
            ? Boolean((json as any)?.has_more)
            : hydrated.length >= REPORTS_PAGE_SIZE;

        setReports((prev) => {
          return reset ? hydrated : mergeUniqueReports(prev, hydrated);
        });

        nextOffsetRef.current = safeNextOffset;
        hasMoreRef.current = safeHasMore;

        setNextOffset(safeNextOffset);
        setHasMore(safeHasMore);
      } catch (e) {
        console.warn("[reports/list] exception", e);
      } finally {
        if (requestSeq === reportsRequestSeqRef.current) {
          loadingReportsRef.current = false;
          loadingMoreRef.current = false;

          setLoadingReports(false);
          setLoadingMore(false);
        }
      }
    },
    [
      workspaceId,
      REPORTS_PAGE_SIZE,
      normalizeReportList,
      hydrateMissingAdvertiserNames,
      mergeUniqueReports,
    ]
  );

  const fetchReports = useCallback(async () => {
    await fetchReportsPage({ reset: true, forceOffset: 0 });
  }, [fetchReportsPage]);

  const loadMoreReports = useCallback(async () => {
    await fetchReportsPage({ reset: false });
  }, [fetchReportsPage]);

  useEffect(() => {
    if (!userId) {
      setWorkspaceId(null);
      setWorkspaceName(null);
      setWorkspaceMemberships([]);
      setMemberRole(null);
      setMemberDivision(null);
      setMemberDepartment(null);
      setMemberTeam(null);
      resetReportsState();
      return;
    }

    (async () => {
      const token = await getAccessToken();

      if (!token) {
        setWorkspaceId(null);
        setWorkspaceName(null);
        setWorkspaceMemberships([]);
        setMemberRole(null);
        setMemberDivision(null);
        setMemberDepartment(null);
        setMemberTeam(null);
        resetReportsState();
        return;
      }

      const res = await fetch("/api/workspaces/list", {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[workspaces/list] failed", res.status, json);
        setWorkspaceId(null);
        setWorkspaceName(null);
        setWorkspaceMemberships([]);
        setMemberRole(null);
        setMemberDivision(null);
        setMemberDepartment(null);
        setMemberTeam(null);
        resetReportsState();
        return;
      }

      const rows =
        (((json as any)?.workspaces ?? []) as any[]).map((row: any) => ({
          workspace_id: String(row.workspace_id ?? ""),
          role: normalizeRole(row.role),
          division: row.division ?? null,
          department: row.department ?? null,
          team: row.team ?? null,
          workspace_name: row.workspace_name ? String(row.workspace_name) : null,
        })) ?? [];

      const validRows = rows.filter((row) => row.workspace_id);

      if (!validRows.length) {
        setWorkspaceId(null);
        setWorkspaceName(null);
        setWorkspaceMemberships([]);
        setMemberRole(null);
        setMemberDivision(null);
        setMemberDepartment(null);
        setMemberTeam(null);
        resetReportsState();
        return;
      }

      const current = pickCurrentMembership(validRows, workspaceIdFromQuery);

      setWorkspaceMemberships(validRows);
      setWorkspaceId(current?.workspace_id ?? null);
      setWorkspaceName(current?.workspace_name ?? null);
      setMemberRole(current?.role ?? null);
      setMemberDivision(current?.division ?? null);
      setMemberDepartment(current?.department ?? null);
      setMemberTeam(current?.team ?? null);

      if (current?.workspace_id && current.workspace_id !== workspaceIdFromQuery) {
        router.replace(`/report-builder?workspace_id=${encodeURIComponent(current.workspace_id)}`);
      }
    })();
  }, [userId, workspaceIdFromQuery, router, resetReportsState]);

  useEffect(() => {
    if (!userId) {
      setTypes([]);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("report_types")
        .select("id,key,name")
        .order("name");

      setTypes((data ?? []) as ReportType[]);
    })();
  }, [userId]);

  useEffect(() => {
    if (!workspaceId) {
      setAdvertisers([]);
      setSelectedAdvertiserId("");
      return;
    }

    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setAdvertisers([]);
        setSelectedAdvertiserId("");
        return;
      }

      const res = await fetch(
        `/api/advertisers/list?workspace_id=${encodeURIComponent(workspaceId)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[advertisers/list] failed", res.status, json);
        setAdvertisers([]);
        return;
      }

      const rows =
        (((json as any)?.advertisers ?? []) as any[]).map((x: any) => ({
          id: String(x.id),
          name: String(x.name ?? ""),
        })) || [];

      setAdvertisers(rows);

      setOpenMap((prev) => {
        const next = { ...prev };
        next.__none__ = prev.__none__ ?? true;
        for (const a of rows) {
          if (next[a.id] == null) next[a.id] = true;
        }
        return next;
      });

      setSelectedAdvertiserId((prev) => {
        if (!prev) return "";
        return rows.some((x) => x.id === prev) ? prev : "";
      });
    })();
  }, [workspaceId]);

  useEffect(() => {
    setSelectedAdvertiserIds((prev) => {
      const allowed = new Set(advertisers.map((a) => a.id));
      return prev.filter((id) => allowed.has(id));
    });
  }, [advertisers]);

  useEffect(() => {
    if (!workspaceId) {
      resetReportsState();
      return;
    }

    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    setSelectedReportIds((prev) => {
      const allowed = new Set(reports.map((r) => r.id));
      return prev.filter((id) => allowed.has(id));
    });
  }, [reports]);

  useEffect(() => {
    if (!canDeleteReports && selectedReportIds.length > 0) {
      setSelectedReportIds([]);
    }
  }, [canDeleteReports, selectedReportIds.length]);

  async function signIn() {
    setLocalMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLocalMsg(error.message || "로그인 실패");
      return;
    }

    setUserId(data.user?.id ?? null);
    setUserEmail(data.user?.email ?? null);

    await supabase.auth.getSession();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail(null);
    setWorkspaceId(null);
    setWorkspaceName(null);
    setWorkspaceMemberships([]);
    setMemberRole(null);
    setMemberDivision(null);
    setMemberDepartment(null);
    setMemberTeam(null);
    resetReportsState();
    setAdvertisers([]);
    setSearch("");
    setReportFilter("all");
    setSelectedAdvertiserId("");
    setNewAdvertiserName("");
    setOpenMap({ __none__: true });
    setLocalMsg("");
    setSelectedReportIds([]);
    setSelectedAdvertiserIds([]);
    setDeletingAdvertisers(false);
  }

  async function createAdvertiser() {
    if (!canManageAdvertisers) {
      setLocalMsg("광고주 생성 권한이 없습니다.");
      return;
    }

    if (!workspaceId || !userId || creatingAdvertiser) return;

    const name = newAdvertiserName.trim();
    if (!name) {
      setLocalMsg("광고주명을 입력하세요.");
      return;
    }

    setCreatingAdvertiser(true);
    setLocalMsg("");

    try {
      const duplicated = advertisers.find((a) => norm(a.name) === norm(name));
      if (duplicated) {
        setSelectedAdvertiserId(duplicated.id);
        setNewAdvertiserName("");
        setLocalMsg(`이미 있는 광고주입니다. "${duplicated.name}" 을(를) 선택했습니다.`);
        setCreatingAdvertiser(false);
        return;
      }

      const { data, error } = await supabase
        .from("advertisers")
        .insert({
          workspace_id: workspaceId,
          name,
          created_by: userId,
        })
        .select("id,name")
        .single();

      if (error) {
        console.warn("[advertisers/create] failed", error);
        setLocalMsg(error.message || "광고주 생성 실패");
        setCreatingAdvertiser(false);
        return;
      }

      const created: AdvertiserRow = {
        id: String((data as any)?.id),
        name: String((data as any)?.name ?? name),
      };

      setAdvertisers((prev) => {
        const next = [...prev, created].sort((a, b) =>
          a.name.localeCompare(b.name, "ko")
        );
        return next;
      });

      setOpenMap((prev) => ({ ...prev, [created.id]: true }));
      setSelectedAdvertiserId(created.id);
      setNewAdvertiserName("");
      setLocalMsg(`광고주 "${created.name}" 생성 완료`);
    } catch (e: any) {
      setLocalMsg(e?.message || "광고주 생성 실패");
    } finally {
      setCreatingAdvertiser(false);
    }
  }

  async function deleteSelectedAdvertisers() {
    if (!canDeleteAdvertisers) {
      setLocalMsg("광고주 삭제 권한이 없습니다.");
      return;
    }

    if (!workspaceId || !selectedAdvertiserIds.length || deletingAdvertisers) return;

    const ok = window.confirm(
      `선택한 광고주 ${selectedAdvertiserIds.length}개를 삭제하시겠습니까?\n\n연결된 리포트가 있는 광고주는 삭제되지 않습니다.`
    );
    if (!ok) return;

    setDeletingAdvertisers(true);
    setLocalMsg("");

    try {
      const token = await getAccessToken();
      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        setDeletingAdvertisers(false);
        return;
      }

      let deletedCount = 0;

      for (const advertiserId of selectedAdvertiserIds) {
        const res = await fetch(`/api/advertisers/${advertiserId}`, {
          method: "DELETE",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await safeReadJson(res);

        if (!res.ok || !(json as any)?.ok) {
          setLocalMsg(
            (json as any)?.message ||
              (json as any)?.error ||
              "광고주 삭제 실패"
          );
          setDeletingAdvertisers(false);
          return;
        }

        deletedCount += 1;
      }

      setAdvertisers((prev) =>
        prev.filter((a) => !selectedAdvertiserIds.includes(a.id))
      );

      if (
        selectedAdvertiserId &&
        selectedAdvertiserIds.includes(selectedAdvertiserId)
      ) {
        setSelectedAdvertiserId("");
      }

      setSelectedAdvertiserIds([]);
      setLocalMsg(`광고주 ${deletedCount}개 삭제 완료`);
    } catch (e: any) {
      setLocalMsg(e?.message || "광고주 삭제 실패");
    } finally {
      setDeletingAdvertisers(false);
    }
  }

  async function createReport(type: ReportType) {
    if (!canCreateReport) {
      setLocalMsg("리포트 생성 권한이 없습니다.");
      return;
    }

    if (!workspaceId || creating) return;

    setCreating(true);
    setLocalMsg("");

    const token = await getAccessToken();
    if (!token) {
      setCreating(false);
      setLocalMsg("로그인 세션이 없습니다.");
      return;
    }

    const advertiserId = selectedAdvertiserId || null;

    const res = await fetch("/api/reports/create", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        advertiser_id: advertiserId,
        report_type_id: type.id,
        title: `${type.name} - Draft`,
        meta: {},
        status: "draft",
      }),
    });

    const json = await safeReadJson(res);
    const reportId = (json as any)?.report?.id;

    setCreating(false);

    if (!res.ok || !reportId) {
      console.warn("[reports/create] failed", res.status, json);
      setLocalMsg("리포트 생성 실패");
      return;
    }

    await fetchReports();
    router.push(`/reports/${reportId}`);
  }

  async function deleteSelectedReports() {
    if (!canDeleteReports) {
      setLocalMsg("리포트 삭제 권한이 없습니다.");
      return;
    }

    if (!workspaceId || !selectedReportIds.length || deletingReports) return;

    const ok = window.confirm(
      `선택한 리포트 ${selectedReportIds.length}개를 삭제하시겠습니까?\n\n이 삭제는 실제 삭제(hard delete)이며 report_rows / report_creatives / report_csv_uploads / report_image_uploads / reports 데이터가 함께 제거될 수 있습니다.`
    );
    if (!ok) return;

    setDeletingReports(true);
    setLocalMsg("");

    try {
      const token = await getAccessToken();
      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        setDeletingReports(false);
        return;
      }

      const res = await fetch("/api/reports/delete", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          report_ids: selectedReportIds,
        }),
      });

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[reports/delete] failed", res.status, json);
        setLocalMsg((json as any)?.error || "리포트 삭제 실패");
        setDeletingReports(false);
        return;
      }

      const deletedCount = Number((json as any)?.deleted_count ?? 0);

      setSelectedReportIds([]);
      await fetchReports();

      setLocalMsg(`리포트 ${deletedCount}개 삭제 완료`);
    } catch (e: any) {
      setLocalMsg(e?.message || "리포트 삭제 실패");
    } finally {
      setDeletingReports(false);
    }
  }

  function toggleAdvertiserSelection(advertiserId: string) {
    if (!canDeleteAdvertisers) return;

    setSelectedAdvertiserIds((prev) => {
      return prev.includes(advertiserId)
        ? prev.filter((id) => id !== advertiserId)
        : [...prev, advertiserId];
    });
  }

  function toggleFolder(key: string) {
    setOpenMap((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function toggleReportSelection(reportId: string) {
    if (!canDeleteReports) return;

    setSelectedReportIds((prev) => {
      return prev.includes(reportId)
        ? prev.filter((id) => id !== reportId)
        : [...prev, reportId];
    });
  }

  function openMemberManagement() {
    const next = workspaceId
      ? `/report-builder/members?workspace_id=${encodeURIComponent(workspaceId)}`
      : "/report-builder/members";

    router.push(next);
  }

  function changeWorkspace(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return;
    if (nextWorkspaceId === workspaceId) return;

    setSelectedAdvertiserId("");
    setSelectedAdvertiserIds([]);
    setSelectedReportIds([]);
    setSearch("");
    setLocalMsg("");
    resetReportsState();
    router.replace(`/report-builder?workspace_id=${encodeURIComponent(nextWorkspaceId)}`);
  }

  const advNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of advertisers) m.set(a.id, a.name);
    return m;
  }, [advertisers]);

  const selectedAdvertiserName = useMemo(() => {
    if (!selectedAdvertiserId) return "";
    return advertisers.find((a) => a.id === selectedAdvertiserId)?.name ?? "";
  }, [advertisers, selectedAdvertiserId]);

  const memberInfoText = useMemo(() => {
    if (!userId || !memberRole) return "";
    return [
      `role: ${memberRole}`,
      workspaceName ? `workspace: ${workspaceName}` : "",
      memberDivision ? `본부: ${memberDivision}` : "",
      memberDepartment ? `부서: ${memberDepartment}` : "",
      memberTeam ? `팀: ${memberTeam}` : "",
    ]
      .filter(Boolean)
      .join(" / ");
  }, [userId, memberRole, workspaceName, memberDivision, memberDepartment, memberTeam]);

  const filteredReports = useMemo(() => {
    const s = norm(search);

    return reports.filter((r) => {
      if (isArchivedReport(r)) return false;

      const title = norm(r.title);
      const id = norm(r.id);
      const advName =
        norm(r.advertiser_name) ||
        (r.advertiser_id ? norm(advNameById.get(r.advertiser_id) ?? "") : "");

      const matchesSearch =
        !s || title.includes(s) || id.includes(s) || advName.includes(s);

      const matchesStatus =
        reportFilter === "all"
          ? true
          : reportFilter === "published"
          ? isPublishedReport(r)
          : isDraftReport(r);

      const matchesSelectedAdvertiser = selectedAdvertiserId
        ? String(r.advertiser_id ?? "") === selectedAdvertiserId
        : !r.advertiser_id;

      return matchesSearch && matchesStatus && matchesSelectedAdvertiser;
    });
  }, [reports, search, advNameById, reportFilter, selectedAdvertiserId]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of filteredReports) {
      const k = r.advertiser_id ? String(r.advertiser_id) : "__none__";
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }

    const orderedKeys: string[] = [];
    for (const a of advertisers) {
      if (map.has(a.id)) orderedKeys.push(a.id);
    }
    if (map.has("__none__")) orderedKeys.push("__none__");
    for (const k of map.keys()) {
      if (!orderedKeys.includes(k)) orderedKeys.push(k);
    }

    return { map, orderedKeys };
  }, [filteredReports, advertisers]);

  const virtualRows = useMemo(() => {
    const rows: Array<
      | {
          kind: "folder";
          key: string;
          folderKey: string;
          folderName: string;
          isNone: boolean;
          list: ReportRow[];
          open: boolean;
        }
      | {
          kind: "report";
          key: string;
          folderKey: string;
          report: ReportRow;
          idx: number;
          listLength: number;
        }
    > = [];

    for (const key of grouped.orderedKeys) {
      const list = grouped.map.get(key) ?? [];
      const isNone = key === "__none__";
      const folderName = isNone
        ? "광고주 미지정"
        : advNameById.get(key) ||
          (list.find((x) => x.advertiser_name)?.advertiser_name ?? "(광고주)");

      const open = openMap[key] ?? true;

      rows.push({
        kind: "folder",
        key: `folder:${key}`,
        folderKey: key,
        folderName,
        isNone,
        list,
        open,
      });

      if (open) {
        for (let idx = 0; idx < list.length; idx++) {
          rows.push({
            kind: "report",
            key: `report:${key}:${list[idx].id}`,
            folderKey: key,
            report: list[idx],
            idx,
            listLength: list.length,
          });
        }
      }
    }

    return rows;
  }, [grouped, advNameById, openMap]);

  const getVirtualRowHeight = useCallback(
    (
      row:
        | {
            kind: "folder";
            key: string;
            folderKey: string;
            folderName: string;
            isNone: boolean;
            list: ReportRow[];
            open: boolean;
          }
        | {
            kind: "report";
            key: string;
            folderKey: string;
            report: ReportRow;
            idx: number;
            listLength: number;
          }
    ) => {
      return row.kind === "folder" ? FOLDER_ROW_HEIGHT : REPORT_ROW_HEIGHT;
    },
    [FOLDER_ROW_HEIGHT, REPORT_ROW_HEIGHT]
  );

  const virtualOffsets = useMemo(() => {
    const offsets: number[] = new Array(virtualRows.length);
    let acc = 0;

    for (let i = 0; i < virtualRows.length; i += 1) {
      offsets[i] = acc;
      acc += getVirtualRowHeight(virtualRows[i]);
    }

    return offsets;
  }, [virtualRows, getVirtualRowHeight]);

  const totalVirtualHeight = useMemo(() => {
    if (virtualRows.length === 0) return 0;
    const lastIndex = virtualRows.length - 1;
    return virtualOffsets[lastIndex] + getVirtualRowHeight(virtualRows[lastIndex]);
  }, [virtualRows, virtualOffsets, getVirtualRowHeight]);

  const findVirtualStartIndex = useCallback(
    (scrollTop: number) => {
      if (virtualRows.length === 0) return 0;

      let left = 0;
      let right = virtualRows.length - 1;
      let answer = 0;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const rowTop = virtualOffsets[mid];
        const rowBottom = rowTop + getVirtualRowHeight(virtualRows[mid]);

        if (rowBottom >= scrollTop) {
          answer = mid;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }

      return answer;
    },
    [virtualRows, virtualOffsets, getVirtualRowHeight]
  );

  const virtualStartIndex = useMemo(() => {
    return Math.max(0, findVirtualStartIndex(listScrollTop) - OVERSCAN);
  }, [findVirtualStartIndex, listScrollTop, OVERSCAN]);

  const virtualEndIndex = useMemo(() => {
    const viewportBottom = listScrollTop + listViewportHeight;
    return Math.min(
      virtualRows.length,
      findVirtualStartIndex(viewportBottom) + OVERSCAN + 1
    );
  }, [
    findVirtualStartIndex,
    listScrollTop,
    listViewportHeight,
    virtualRows.length,
    OVERSCAN,
  ]);

  const visibleVirtualRows = useMemo(() => {
    return virtualRows.slice(virtualStartIndex, virtualEndIndex);
  }, [virtualRows, virtualStartIndex, virtualEndIndex]);

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setListScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;

    const syncViewportHeight = () => {
      setListViewportHeight(el.clientHeight || LIST_VIEWPORT_HEIGHT);
    };

    syncViewportHeight();

    const observer = new ResizeObserver(() => {
      syncViewportHeight();
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    if (!workspaceId) return;
    if (loadingReportsRef.current || loadingMoreRef.current) return;
    if (!hasMoreRef.current) return;
    if (totalVirtualHeight <= 0) return;

    const viewportBottom = listScrollTop + listViewportHeight;
    const triggerPoint = totalVirtualHeight - LOAD_MORE_THRESHOLD;

    if (viewportBottom >= triggerPoint) {
      loadMoreReports();
    }
  }, [
    workspaceId,
    listScrollTop,
    listViewportHeight,
    totalVirtualHeight,
    loadMoreReports,
    LOAD_MORE_THRESHOLD,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    if (loadingReportsRef.current || loadingMoreRef.current) return;
    if (!hasMoreRef.current) return;
    if (totalVirtualHeight <= 0) return;

    const needsMoreToFillViewport =
      totalVirtualHeight < listViewportHeight + 80;

    if (needsMoreToFillViewport) {
      loadMoreReports();
    }
  }, [workspaceId, totalVirtualHeight, listViewportHeight, loadMoreReports]);

  useEffect(() => {
    setListScrollTop(0);
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
  }, [workspaceId, search, reportFilter, selectedAdvertiserId]);

  const visibleReportIds = useMemo(() => {
    return filteredReports.map((r) => r.id);
  }, [filteredReports]);

  const selectedCount = selectedReportIds.length;

  const selectedVisibleCount = useMemo(() => {
    const set = new Set(selectedReportIds);
    return visibleReportIds.filter((id) => set.has(id)).length;
  }, [selectedReportIds, visibleReportIds]);

  const allVisibleSelected =
    visibleReportIds.length > 0 &&
    visibleReportIds.every((id) => selectedReportIds.includes(id));

  function selectAllVisibleReports() {
    if (!canDeleteReports) return;

    setSelectedReportIds((prev) => {
      const set = new Set(prev);
      for (const id of visibleReportIds) set.add(id);
      return Array.from(set);
    });
  }

  function unselectAllVisibleReports() {
    if (!canDeleteReports) return;

    const visibleSet = new Set(visibleReportIds);
    setSelectedReportIds((prev) => prev.filter((id) => !visibleSet.has(id)));
  }

  function clearAllSelectedReports() {
    if (!canDeleteReports) return;
    setSelectedReportIds([]);
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 1200,
    padding: 24,
  };

  const topActionsStyle: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  };

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        background: "#f3f4f6",
        minHeight: "100vh",
      }}
    >
      <div style={containerStyle}>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 900,
            textAlign: "center",
            marginBottom: 20,
            color: "#111827",
            letterSpacing: "-0.02em",
          }}
        >
          Automated Online Ads Reporting
        </h1>

        <div
          style={{
            background: "#e5e7eb",
            border: "1px solid #cfd4dc",
            borderRadius: 24,
            padding: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            boxShadow:
              "18px 18px 36px rgba(55, 65, 81, 0.14), -12px -12px 24px rgba(255, 255, 255, 0.82)",
          }}
        >
          {!userId ? (
            <>
              <div
                style={{
                  width: "100%",
                  maxWidth: 760,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 34,
                    lineHeight: 1.2,
                    fontWeight: 900,
                    color: "#111827",
                    letterSpacing: "-0.02em",
                  }}
                >
                  온라인 광고 리포트를 더 빠르고 정확하게
                </div>

                <div
                  style={{
                    maxWidth: 680,
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: "#4b5563",
                  }}
                >
                  광고 성과 데이터를 업로드하고, KPI 요약과 시각화를 거쳐
                  공유 가능한 리포트까지 한 번에 관리하세요.
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  maxWidth: 420,
                  marginTop: 10,
                }}
              >
                <div className="authCard">
                  <div className="fieldLabel">이메일</div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="neoField"
                  />

                  <div className="fieldLabel" style={{ marginTop: 14 }}>
                    비밀번호
                  </div>
                  <input
                    value={password}
                    type="password"
                    onChange={(e) => setPassword(e.target.value)}
                    className="neoField"
                  />

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 16,
                    }}
                  >
                    <button
                      className="mainBtn"
                      onClick={signIn}
                      style={{ maxWidth: "none" }}
                    >
                      로그인하기
                    </button>

                    <Link href="/signup" className="signupBtn">
                      회원가입
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>
                {userEmail ?? "사용자"}님 반갑습니다 👋
              </div>

              {memberInfoText ? (
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.92,
                    textAlign: "center",
                    lineHeight: 1.6,
                    color: "#4b5563",
                  }}
                >
                  {memberInfoText}
                </div>
              ) : null}

              {workspaceMemberships.length > 0 ? (
                <div
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      textAlign: "left",
                      color: "#374151",
                      fontWeight: 700,
                    }}
                  >
                    현재 workspace 선택
                  </div>
                  <select
                    value={workspaceId ?? ""}
                    onChange={(e) => changeWorkspace(e.target.value)}
                    disabled={!workspaceMemberships.length}
                    className="neoField"
                    style={{ fontSize: 15 }}
                  >
                    {workspaceMemberships.map((wm) => (
                      <option key={wm.workspace_id} value={wm.workspace_id}>
                        {wm.workspace_name || wm.workspace_id}
                        {wm.role ? ` (${wm.role})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {canManageMembers ? (
                  <button
                    className="subBtn"
                    onClick={openMemberManagement}
                    disabled={!workspaceId}
                    title={!workspaceId ? "workspace_id가 필요합니다." : "멤버 관리"}
                  >
                    멤버 관리
                  </button>
                ) : null}

                <button className="subBtn" onClick={signOut}>
                  로그아웃
                </button>
              </div>
            </>
          )}

          <div
            style={{
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            workspace_id: {workspaceId ?? "(없음)"}
            {workspaceName ? ` / ${workspaceName}` : ""}
          </div>
        </div>

        {canManageAdvertisers ? (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>광고주 선택 / 생성</h2>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "minmax(280px, 1.1fr) minmax(280px, 1fr)",
                gap: 16,
              }}
            >
              <div className="panelCard">
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
                  기존 광고주 선택
                </div>

                <select
                  value={selectedAdvertiserId}
                  onChange={(e) => setSelectedAdvertiserId(e.target.value)}
                  disabled={!userId || !workspaceId}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    fontSize: 15,
                  }}
                >
                  <option value="">광고주 미지정으로 생성</option>
                  {advertisers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                  현재 선택: {selectedAdvertiserName || "광고주 미지정"}
                </div>

                {canDeleteAdvertisers ? (
                  <div style={{ marginTop: 14 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        marginBottom: 8,
                        opacity: 0.8,
                      }}
                    >
                      삭제할 광고주 선택
                    </div>

                    <div
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 12,
                        background: "white",
                        padding: 10,
                        maxHeight: 180,
                        overflowY: "auto",
                      }}
                    >
                      {advertisers.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.6 }}>
                          삭제할 광고주가 없습니다.
                        </div>
                      ) : (
                        advertisers.map((a) => {
                          const checked = selectedAdvertiserIds.includes(a.id);

                          return (
                            <label
                              key={a.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 4px",
                                cursor: "pointer",
                                fontSize: 14,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAdvertiserSelection(a.id)}
                              />
                              <span>{a.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <button
                      className="subBtn deleteBtn"
                      onClick={deleteSelectedAdvertisers}
                      disabled={selectedAdvertiserIds.length === 0 || deletingAdvertisers}
                      style={{ marginTop: 10 }}
                      title={
                        selectedAdvertiserIds.length === 0
                          ? "삭제할 광고주를 먼저 선택하세요"
                          : `선택된 ${selectedAdvertiserIds.length}개 삭제`
                      }
                    >
                      {deletingAdvertisers
                        ? "삭제 중..."
                        : `선택 삭제${
                            selectedAdvertiserIds.length > 0
                              ? ` (${selectedAdvertiserIds.length})`
                              : ""
                          }`}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="panelCard">
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
                  새 광고주 생성
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    value={newAdvertiserName}
                    onChange={(e) => setNewAdvertiserName(e.target.value)}
                    placeholder="예: 네이처컬렉션"
                    disabled={!userId || !workspaceId || creatingAdvertiser}
                    style={{
                      flex: 1,
                      minWidth: 220,
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "white",
                      fontSize: 15,
                    }}
                  />

                  <button
                    className="subBtn"
                    onClick={createAdvertiser}
                    disabled={!userId || !workspaceId || creatingAdvertiser}
                    style={{ padding: "12px 16px" }}
                  >
                    {creatingAdvertiser ? "생성 중..." : "광고주 생성"}
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                  생성 후 자동으로 해당 광고주가 선택됩니다.
                </div>
              </div>
            </div>

            {localMsg ? (
              <div className="infoMsg" style={{ marginTop: 12 }}>
                {localMsg}
              </div>
            ) : null}
          </section>
        ) : localMsg ? (
          <div className="infoMsg" style={{ marginTop: 32 }}>
            {localMsg}
          </div>
        ) : null}

        {canCreateReport ? (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>보고서 유형 선택</h2>

            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.7 }}>
              선택된 광고주: <b>{selectedAdvertiserName || "광고주 미지정"}</b>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                gap: 16,
                marginTop: 16,
              }}
            >
              {types.map((t) => (
                <button
                  key={t.id}
                  onClick={() => createReport(t)}
                  disabled={!workspaceId || creating}
                  className="typeCard"
                >
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</div>
                  <div style={{ marginTop: 6, opacity: 0.7 }}>key: {t.key}</div>
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
                    클릭하면{" "}
                    {selectedAdvertiserName
                      ? `"${selectedAdvertiserName}" 광고주로 `
                      : ""}
                    draft report 생성(API 사용)
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {userId ? (
          <section style={{ marginTop: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>내 리포트 목록</h2>

              <div style={topActionsStyle}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className={`filterBtn ${
                      reportFilter === "all" ? "filterBtnActive" : ""
                    }`}
                    onClick={() => setReportFilter("all")}
                    disabled={!userId}
                  >
                    전체
                  </button>
                  <button
                    className={`filterBtn ${
                      reportFilter === "published" ? "filterBtnActive" : ""
                    }`}
                    onClick={() => setReportFilter("published")}
                    disabled={!userId}
                  >
                    발행됨
                  </button>
                  <button
                    className={`filterBtn ${
                      reportFilter === "draft" ? "filterBtnActive" : ""
                    }`}
                    onClick={() => setReportFilter("draft")}
                    disabled={!userId}
                  >
                    초안
                  </button>
                </div>

                <button
                  className="subBtn"
                  onClick={fetchReports}
                  disabled={!userId || !workspaceId || loadingReports}
                  style={{ padding: "10px 14px" }}
                >
                  {loadingReports ? "불러오는 중..." : "새로고침"}
                </button>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="검색(광고주/제목/ID)"
                  style={{
                    width: 320,
                    maxWidth: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    fontSize: 14,
                  }}
                  disabled={!userId}
                />
              </div>
            </div>

            {canDeleteReports ? (
              <div className="selectionBar" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 14, opacity: 0.8 }}>
                  선택됨 <b>{selectedCount}</b>개
                  {visibleReportIds.length > 0 ? (
                    <span style={{ opacity: 0.7 }}>
                      {" "}
                      · 현재 목록 기준 {selectedVisibleCount}/{visibleReportIds.length}
                    </span>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="subBtn"
                    onClick={
                      allVisibleSelected
                        ? unselectAllVisibleReports
                        : selectAllVisibleReports
                    }
                    disabled={!userId || visibleReportIds.length === 0 || deletingReports}
                    style={{ padding: "10px 14px" }}
                  >
                    {allVisibleSelected ? "현재 목록 선택해제" : "현재 목록 전체선택"}
                  </button>

                  <button
                    className="subBtn"
                    onClick={clearAllSelectedReports}
                    disabled={!userId || selectedCount === 0 || deletingReports}
                    style={{ padding: "10px 14px" }}
                  >
                    전체 해제
                  </button>

                  <button
                    className="subBtn deleteBtn"
                    onClick={deleteSelectedReports}
                    disabled={!userId || deletingReports || selectedCount === 0}
                    style={{ padding: "10px 14px" }}
                    title={
                      selectedCount === 0
                        ? "삭제할 리포트를 먼저 선택하세요"
                        : `선택된 ${selectedCount}개 삭제`
                    }
                  >
                    {deletingReports
                      ? "삭제 중..."
                      : `선택 삭제${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
                  </button>
                </div>
              </div>
            ) : null}

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#6b7280",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span>현재 로딩된 리포트: {reports.length}개</span>
              {loadingReports ? <span>첫 목록 불러오는 중...</span> : null}
              {!loadingReports && loadingMore ? <span>추가 불러오는 중...</span> : null}
              {!loadingReports && !loadingMore && hasMore ? (
                <span>스크롤 하단에서 다음 페이지를 자동으로 불러옵니다.</span>
              ) : null}
            </div>

            {filteredReports.length === 0 && !loadingReports && (
              <p style={{ marginTop: 10, opacity: 0.7 }}>
                조건에 맞는 리포트가 없습니다.
              </p>
            )}

            <div
              ref={listScrollRef}
              onScroll={handleListScroll}
              style={{
                marginTop: 12,
                height: LIST_VIEWPORT_HEIGHT,
                overflowY: "auto",
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  position: "relative",
                  height: totalVirtualHeight,
                }}
              >
                {visibleVirtualRows.map((item, visibleIdx) => {
                  const absoluteIndex = virtualStartIndex + visibleIdx;
                  const top = virtualOffsets[absoluteIndex] ?? 0;
                  const rowHeight = getVirtualRowHeight(item);

                  if (item.kind === "folder") {
                    return (
                      <div
                        key={item.key}
                        style={{
                          position: "absolute",
                          top,
                          left: 0,
                          right: 0,
                          height: rowHeight,
                          paddingBottom: 10,
                          boxSizing: "border-box",
                        }}
                      >
                        <div className="folderBox">
                          <button
                            className="folderHeader"
                            onClick={() => toggleFolder(item.folderKey)}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 900,
                                  width: 18,
                                  display: "inline-block",
                                }}
                              >
                                {item.open ? "▼" : "▶"}
                              </span>
                              <div
                                style={{
                                  fontWeight: 900,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.folderName}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.65 }}>
                                ({item.list.length})
                              </div>
                            </div>

                            <div style={{ fontSize: 12, opacity: 0.45 }}>
                              {item.isNone ? "" : item.folderKey}
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const r = item.report;
                  const checked = selectedReportIds.includes(r.id);

                  return (
                    <div
                      key={item.key}
                      style={{
                        position: "absolute",
                        top,
                        left: 0,
                        right: 0,
                        height: rowHeight,
                        boxSizing: "border-box",
                      }}
                    >
                      <div className="folderBox" style={{ borderTop: "none" }}>
                        <div
                          className="reportRow"
                          style={{
                            borderBottom:
                              item.idx === item.listLength - 1
                                ? "none"
                                : "1px solid #eee",
                          }}
                        >
                          {canDeleteReports ? (
                            <label
                              className="reportCheckWrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleReportSelection(r.id)}
                              />
                            </label>
                          ) : null}

                          <button
                            onClick={() => router.push(`/reports/${r.id}`)}
                            className={`reportItem reportItemMain ${
                              checked ? "reportItemSelected" : ""
                            }`}
                            style={{
                              width: "100%",
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>
                              {r.title}
                              <span style={{ fontSize: 12, opacity: 0.55 }}>
                                {" "}
                                · {String(r.status ?? "").toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.6 }}>
                              {fmtDate(r.created_at ?? null)}
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                padding: "8px 4px",
                fontSize: 12,
                color: "#6b7280",
                textAlign: "center",
              }}
            >
              {loadingMore
                ? "추가 리포트를 불러오는 중..."
                : hasMore
                ? "아래로 스크롤하면 다음 리포트를 자동으로 불러옵니다."
                : reports.length > 0
                ? "모든 리포트를 불러왔습니다."
                : null}
            </div>
          </section>
        ) : null}

        <style jsx>{`
          .fieldLabel {
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 800;
            color: #1f2937;
            letter-spacing: 0.01em;
          }

          .authCard {
            border: 1px solid #c7cdd6;
            border-radius: 20px;
            background: linear-gradient(145deg, #eef1f4, #dde2e8);
            padding: 20px;
            box-shadow:
              10px 10px 20px rgba(107, 114, 128, 0.14),
              -8px -8px 16px rgba(255, 255, 255, 0.88);
          }

          .neoField {
            width: 100%;
            padding: 14px;
            border-radius: 14px;
            border: 1px solid #bfc6cf;
            outline: none;
            background: linear-gradient(145deg, #f8fafc, #d9dde3);
            color: #111827;
            font-size: 16px;
            font-weight: 600;
            box-shadow:
              inset 1px 1px 0 rgba(255, 255, 255, 0.95),
              inset -1px -1px 0 rgba(148, 163, 184, 0.28),
              8px 8px 16px rgba(107, 114, 128, 0.14),
              -6px -6px 12px rgba(255, 255, 255, 0.9);
            transition: box-shadow 0.15s ease, transform 0.15s ease,
              border-color 0.15s ease;
            appearance: none;
            -webkit-appearance: none;
          }

          .neoField::placeholder {
            color: #6b7280;
            font-weight: 500;
          }

          .neoField:focus {
            border-color: #6b7280;
            box-shadow:
              inset 1px 1px 0 rgba(255, 255, 255, 0.98),
              inset -1px -1px 0 rgba(148, 163, 184, 0.24),
              0 0 0 2px rgba(55, 65, 81, 0.12),
              8px 8px 16px rgba(107, 114, 128, 0.16),
              -6px -6px 12px rgba(255, 255, 255, 0.92);
          }

          .mainBtn {
            width: 100%;
            max-width: 520px;
            padding: 14px;
            border-radius: 16px;
            border: 1px solid #374151;
            background: linear-gradient(145deg, #374151, #111827);
            color: #f9fafb;
            font-weight: 900;
            font-size: 16px;
            cursor: pointer;
            box-shadow:
              10px 10px 20px rgba(75, 85, 99, 0.22),
              -6px -6px 12px rgba(255, 255, 255, 0.38);
            transition: 0.15s ease;
            text-align: center;
            letter-spacing: 0.01em;
          }

          .mainBtn:hover {
            transform: translateY(-1px);
            box-shadow:
              12px 12px 22px rgba(75, 85, 99, 0.24),
              -6px -6px 12px rgba(255, 255, 255, 0.4);
          }

          .signupBtn {
            min-width: 180px;
            padding: 12px 18px;
            border-radius: 16px;
            border: 1px solid #c2c8d0;
            background: linear-gradient(145deg, #f8fafc, #dde2e8);
            color: #111827;
            font-weight: 800;
            font-size: 15px;
            cursor: pointer;
            transition: 0.15s ease;
            text-align: center;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow:
              8px 8px 18px rgba(107, 114, 128, 0.14),
              -6px -6px 14px rgba(255, 255, 255, 0.88);
          }

          .signupBtn:hover {
            transform: translateY(-1px);
          }

          .subBtn {
            padding: 10px 18px;
            border-radius: 12px;
            border: 1px solid #d1d5db;
            background: linear-gradient(145deg, #ffffff, #eceff3);
            cursor: pointer;
            font-weight: 800;
            transition: 0.15s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow:
              6px 6px 14px rgba(107, 114, 128, 0.12),
              -4px -4px 10px rgba(255, 255, 255, 0.88);
            color: #111827;
          }

          .subBtn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
              8px 8px 16px rgba(107, 114, 128, 0.14),
              -4px -4px 10px rgba(255, 255, 255, 0.9);
          }

          .subBtn:disabled {
            cursor: not-allowed;
            opacity: 0.55;
          }

          .deleteBtn {
            border-color: #f0cfcf;
            background: linear-gradient(145deg, #fff7f7, #fbecec);
            color: #b42318;
          }

          .deleteBtn:hover:not(:disabled) {
            box-shadow: 0 10px 18px rgba(180, 35, 24, 0.08);
          }

          .filterBtn {
            padding: 10px 14px;
            border-radius: 12px;
            border: 1px solid #d1d5db;
            background: linear-gradient(145deg, #ffffff, #eceff3);
            cursor: pointer;
            font-weight: 800;
            transition: 0.15s;
            color: #111827;
            box-shadow:
              6px 6px 14px rgba(107, 114, 128, 0.1),
              -4px -4px 10px rgba(255, 255, 255, 0.86);
          }

          .filterBtn:hover {
            transform: translateY(-1px);
            box-shadow:
              8px 8px 16px rgba(107, 114, 128, 0.12),
              -4px -4px 10px rgba(255, 255, 255, 0.88);
          }

          .filterBtnActive {
            background: linear-gradient(145deg, #374151, #111827);
            color: white;
            border-color: #374151;
            box-shadow:
              8px 8px 18px rgba(75, 85, 99, 0.22),
              -4px -4px 10px rgba(255, 255, 255, 0.2);
          }

          .panelCard {
            border-radius: 16px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            background: white;
            padding: 18px;
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
          }

          .infoMsg {
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid #eee;
            background: white;
            font-size: 14px;
          }

          .selectionBar {
            padding: 12px 14px;
            border-radius: 14px;
            border: 1px solid #eee;
            background: white;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }

          .typeCard {
            position: relative;
            text-align: left;
            padding: 18px;
            border-radius: 16px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            background: white;
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
            overflow: hidden;
          }

          .typeCard::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: #ff8800;
            transform: scaleY(0);
            transform-origin: center;
            transition: transform 0.15s ease;
          }

          .typeCard:hover::before {
            transform: scaleY(1);
          }

          .typeCard:hover:not(:disabled) {
            transform: translateY(-4px);
            box-shadow: 0 18px 30px rgba(0, 0, 0, 0.1);
            border-color: rgba(0, 0, 0, 0.18);
          }

          .typeCard:active:not(:disabled) {
            transform: translateY(-1px);
          }

          .typeCard:focus-visible {
            outline: none;
            box-shadow: 0 0 0 4px rgba(255, 136, 0, 0.3),
              0 18px 30px rgba(0, 0, 0, 0.1);
            border-color: rgba(255, 136, 0, 0.65);
          }

          .reportRow {
            display: flex;
            align-items: stretch;
            gap: 0;
            background: white;
          }

          .reportCheckWrap {
            width: 52px;
            min-width: 52px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-right: 1px solid #f1f1f1;
            background: white;
            cursor: pointer;
          }

          .reportCheckWrap input {
            width: 16px;
            height: 16px;
            cursor: pointer;
          }

          .reportItem {
            text-align: left;
            padding: 14px;
            border: none;
            background: white;
            cursor: pointer;
            transition: 0.15s;
            width: 100%;
          }

          .reportItemMain:hover {
            background: #fafafa;
          }

          .reportItemSelected {
            background: #fff8ef;
          }

          .folderBox {
            border-radius: 14px;
            border: 1px solid #eee;
            background: white;
            overflow: hidden;
          }

          .folderHeader {
            width: 100%;
            text-align: left;
            padding: 14px;
            cursor: pointer;
            background: white;
            border: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            transition: 0.15s;
          }

          .folderHeader:hover {
            background: #fafafa;
          }

          .folderBody {
            border-top: 1px solid #eee;
          }

          .virtualSpacer {
            position: relative;
            width: 100%;
          }

          @media (max-width: 860px) {
            .panelCard {
              padding: 16px;
            }

            .reportCheckWrap {
              width: 46px;
              min-width: 46px;
            }

            .selectionBar {
              align-items: flex-start;
            }
          }
        `}</style>
      </div>
    </main>
  );
}