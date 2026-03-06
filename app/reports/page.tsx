// app/reports/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";

type ReportRow = {
  id: string;
  title: string | null;
  status: "draft" | "ready" | "archived" | string;
  created_at: string | null;
  workspace_id: string | null;
  advertiser_id: string | null;
};

type AdvertiserRow = {
  id: string;
  name: string | null;
  workspace_id: string | null;
};

async function safeJson(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: "Non-JSON response", raw };
  }
}

/* =========================================================
 * ✅ Bearer 우선 + 쿠키 fallback fetch
 * ========================================================= */

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers || undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

/* =========================================================
 * Draft 생성 (기존 /api/reports/create 사용 가정)
 * ========================================================= */
async function createDraftReport(args: {
  workspace_id: string;
  report_type_id: string;
  title?: string;
}) {
  const res = await authFetch(`/api/reports/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: args.workspace_id,
      report_type_id: args.report_type_id,
      title: args.title ?? undefined,
      status: "draft",
    }),
  });

  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Create report failed (${res.status})`);
  }

  const reportId =
    json?.report?.id || json?.id || json?.report_id || json?.data?.id;

  if (!reportId) throw new Error("REPORT_ID_MISSING_FROM_RESPONSE");
  return String(reportId);
}

/* =========================================================
 * 선택 삭제
 * - 아래 route 예시는 /api/reports/delete 기준
 * ========================================================= */
async function deleteReports(args: {
  workspace_id: string;
  report_ids: string[];
}) {
  const res = await authFetch(`/api/reports/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: args.workspace_id,
      report_ids: args.report_ids,
    }),
  });

  const json = await safeJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Delete reports failed (${res.status})`);
  }

  const deletedIds: string[] = Array.isArray(json?.deleted_ids)
    ? json.deleted_ids.map((x: any) => String(x))
    : args.report_ids;

  return deletedIds;
}

export default function ReportsHomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("");
  const [workspaceId, setWorkspaceId] = useState<string>("");

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);

  // 폴더 open/close
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    __none__: true,
  });

  // 검색
  const [q, setQ] = useState("");

  // 선택 삭제 관련
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);

  // report type cards
  const reportTypes = useMemo(
    () => [
      { title: "DB 획득 리포트", key: "db" },
      { title: "영상 조회 리포트", key: "video" },
      { title: "커머스 매출 리포트", key: "commerce" },
      { title: "트래픽 리포트", key: "traffic" },
    ],
    []
  );

  async function loadAll() {
    setLoading(true);
    setMsg("");

    try {
      // 1) session
      const { data: sess } = await supabase.auth.getSession();
      const email = sess?.session?.user?.email ?? "";
      const uid = sess?.session?.user?.id ?? "";
      setUserEmail(email);

      if (!uid) {
        setMsg("세션이 없습니다. 다시 로그인 해주세요.");
        setLoading(false);
        return;
      }

      // 2) workspace_id 찾기
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, workspace_id, current_workspace_id")
        .eq("id", uid)
        .maybeSingle();

      if (profErr) throw new Error(profErr.message);

      const ws =
        String((prof as any)?.current_workspace_id || "").trim() ||
        String((prof as any)?.workspace_id || "").trim();

      if (!ws) {
        throw new Error(
          "WORKSPACE_ID_NOT_FOUND (profiles.current_workspace_id/workspace_id 확인 필요)"
        );
      }
      setWorkspaceId(ws);

      // 3) advertisers
      const { data: advs, error: advErr } = await supabase
        .from("advertisers")
        .select("id, name, workspace_id")
        .eq("workspace_id", ws)
        .order("name", { ascending: true });

      if (advErr) throw new Error(advErr.message);
      const advRows = (advs ?? []) as AdvertiserRow[];
      setAdvertisers(advRows);

      // 4) reports
      const { data: reps, error: repErr } = await supabase
        .from("reports")
        .select("id, title, status, created_at, workspace_id, advertiser_id")
        .eq("workspace_id", ws)
        .order("created_at", { ascending: false });

      if (repErr) throw new Error(repErr.message);
      setReports((reps ?? []) as ReportRow[]);

      // openMap 초기값
      setOpenMap((prev) => {
        const next = { ...prev };
        next.__none__ = prev.__none__ ?? true;
        for (const a of advRows) {
          if (next[a.id] == null) next[a.id] = true;
        }
        return next;
      });

      // 현재 존재하지 않는 선택값 정리
      setSelectedIds((prev) => {
        const next: Record<string, boolean> = {};
        const reportIdSet = new Set((reps ?? []).map((r: any) => String(r.id)));
        for (const id of Object.keys(prev)) {
          if (prev[id] && reportIdSet.has(id)) next[id] = true;
        }
        return next;
      });
    } catch (e: any) {
      setMsg(e?.message || "LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of advertisers) m.set(a.id, a.name || "(광고주)");
    return m;
  }, [advertisers]);

  const filteredReports = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return reports;

    return reports.filter((r) => {
      const title = String(r.title ?? "").toLowerCase();
      const advName = r.advertiser_id
        ? String(advNameById.get(r.advertiser_id) ?? "")
        : "";
      return (
        title.includes(s) ||
        advName.toLowerCase().includes(s) ||
        String(r.id).toLowerCase().includes(s)
      );
    });
  }, [q, reports, advNameById]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of filteredReports) {
      const key = r.advertiser_id || "__none__";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }

    const orderedKeys: string[] = [];
    for (const a of advertisers) if (map.has(a.id)) orderedKeys.push(a.id);
    if (map.has("__none__")) orderedKeys.push("__none__");

    for (const k of map.keys()) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    return { map, orderedKeys };
  }, [filteredReports, advertisers]);

  const filteredReportIds = useMemo(
    () => filteredReports.map((r) => String(r.id)),
    [filteredReports]
  );

  const selectedCount = useMemo(() => {
    let count = 0;
    for (const id of Object.keys(selectedIds)) {
      if (selectedIds[id]) count += 1;
    }
    return count;
  }, [selectedIds]);

  const selectedFilteredCount = useMemo(() => {
    let count = 0;
    for (const id of filteredReportIds) {
      if (selectedIds[id]) count += 1;
    }
    return count;
  }, [filteredReportIds, selectedIds]);

  const allFilteredSelected =
    filteredReportIds.length > 0 &&
    filteredReportIds.every((id) => !!selectedIds[id]);

  function toggleFolder(key: string) {
    setOpenMap((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function openAll() {
    const next: Record<string, boolean> = { __none__: true };
    for (const a of advertisers) next[a.id] = true;
    setOpenMap(next);
  }

  function closeAll() {
    const next: Record<string, boolean> = { __none__: false };
    for (const a of advertisers) next[a.id] = false;
    setOpenMap(next);
  }

  function toggleSelectOne(reportId: string) {
    setSelectedIds((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));
  }

  function selectAllFiltered() {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const id of filteredReportIds) next[id] = true;
      return next;
    });
  }

  function unselectAllFiltered() {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const id of filteredReportIds) delete next[id];
      return next;
    });
  }

  function clearAllSelection() {
    setSelectedIds({});
  }

  async function handleCreateDraft(reportTypeId: string, title: string) {
    if (!workspaceId) {
      setMsg("workspace_id가 없습니다. 로그인/프로필을 확인하세요.");
      return;
    }

    setMsg("");
    try {
      const reportId = await createDraftReport({
        workspace_id: workspaceId,
        report_type_id: reportTypeId,
        title,
      });
      router.push(`/reports/${reportId}`);
    } catch (e: any) {
      setMsg(e?.message || "리포트 생성 실패");
    }
  }

  async function handleDeleteSelected() {
    if (!workspaceId) {
      setMsg("workspace_id가 없습니다.");
      return;
    }

    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (ids.length === 0) {
      setMsg("삭제할 리포트를 먼저 선택해주세요.");
      return;
    }

    const ok = window.confirm(
      `선택한 ${ids.length}개의 리포트를 삭제할까요?\n삭제 후 되돌릴 수 없습니다.`
    );
    if (!ok) return;

    setDeleting(true);
    setMsg("");

    try {
      const deletedIds = await deleteReports({
        workspace_id: workspaceId,
        report_ids: ids,
      });

      const deletedSet = new Set(deletedIds.map(String));

      setReports((prev) => prev.filter((r) => !deletedSet.has(String(r.id))));
      setSelectedIds((prev) => {
        const next = { ...prev };
        for (const id of deletedSet) delete next[id];
        return next;
      });

      setMsg(`${deletedIds.length}개 리포트를 삭제했습니다.`);

      // 최종 동기화 한 번 더
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message || "선택 삭제 실패");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-8">
      <div className="text-3xl font-extrabold text-center">
        Automated Online Ads Reporting
      </div>

      {/* 상단 인사/로그아웃 */}
      <div className="mt-6 rounded-2xl border bg-[#f7e8cf] p-6">
        <div className="text-center text-lg font-semibold">
          {userEmail ? `${userEmail}님 반갑습니다 👋` : "로그인 확인중..."}
        </div>

        <div className="mt-4 flex justify-center">
          <button
            className="rounded-md border bg-white px-4 py-2 text-sm font-semibold hover:border-gray-400"
            onClick={async () => {
              await supabase.auth.signOut();
              location.href = "/";
            }}
          >
            로그아웃
          </button>
        </div>

        {workspaceId ? (
          <div className="mt-3 text-center text-xs text-gray-600">
            workspace_id: {workspaceId}
          </div>
        ) : null}
      </div>

      {/* 보고서 유형 선택 */}
      <div className="mt-10">
        <div className="text-lg font-extrabold mb-3">보고서 유형 선택</div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {reportTypes.map((x) => (
            <button
              key={x.key}
              className="rounded-xl border bg-white p-4 text-left hover:border-gray-400"
              onClick={() => handleCreateDraft(x.key, `${x.title} - Draft`)}
            >
              <div className="font-semibold">{x.title}</div>
              <div className="text-xs text-gray-600 mt-1">key: {x.key}</div>
              <div className="text-xs text-gray-500 mt-2">
                클릭하면 draft report 생성(API 사용)
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 메시지 */}
      {msg ? (
        <div className="mt-6 rounded-md border bg-white p-3 text-sm text-gray-700">
          {msg}
        </div>
      ) : null}

      {/* 내 리포트 목록(광고주별 폴더) */}
      <div className="mt-10">
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex items-center justify-between gap-3">
           <div className="text-lg font-extrabold text-red-600">
  내 리포트 목록 - PATCH TEST 777
</div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                className="rounded-md border px-3 py-2 text-sm w-64"
                placeholder="검색: 광고주/제목/ID"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
                onClick={openAll}
                type="button"
              >
                전체 펼치기
              </button>
              <button
                className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
                onClick={closeAll}
                type="button"
              >
                전체 접기
              </button>
              <button
                className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
                onClick={loadAll}
                type="button"
              >
                새로고침
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
            <div className="text-sm text-gray-700">
              선택됨 <span className="font-extrabold">{selectedCount}</span>개
              {filteredReportIds.length > 0 ? (
                <span className="text-gray-500">
                  {" "}
                  · 현재 목록 기준 {selectedFilteredCount}/{filteredReportIds.length}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:border-gray-400 disabled:opacity-50"
                onClick={allFilteredSelected ? unselectAllFiltered : selectAllFiltered}
                disabled={filteredReportIds.length === 0 || deleting}
              >
                {allFilteredSelected ? "현재 목록 선택해제" : "현재 목록 전체선택"}
              </button>

              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:border-gray-400 disabled:opacity-50"
                onClick={clearAllSelection}
                disabled={selectedCount === 0 || deleting}
              >
                전체 해제
              </button>

              <button
                type="button"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:border-red-300 disabled:opacity-50"
                onClick={handleDeleteSelected}
                disabled={selectedCount === 0 || deleting}
              >
                {deleting ? "삭제 중..." : `선택 삭제 (${selectedCount})`}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">
            로딩중...
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.orderedKeys.length === 0 ? (
              <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">
                리포트가 없습니다.
              </div>
            ) : null}

            {grouped.orderedKeys.map((key) => {
              const list = grouped.map.get(key) ?? [];
              const isNone = key === "__none__";
              const folderName = isNone
                ? "광고주 미지정"
                : advNameById.get(key) ?? "(광고주)";
              const open = openMap[key] ?? true;

              return (
                <div key={key} className="rounded-xl border bg-white">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl"
                    onClick={() => toggleFolder(key)}
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold">
                        {open ? "▼" : "▶"}
                      </span>
                      <span className="font-semibold">{folderName}</span>
                      <span className="text-xs text-gray-500">
                        ({list.length})
                      </span>
                    </div>

                    <div className="text-xs text-gray-500">
                      {isNone ? "" : key}
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t">
                      {list.map((r) => {
                        const checked = !!selectedIds[String(r.id)];

                        return (
                          <div
                            key={r.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={checked}
                              onChange={() => toggleSelectOne(String(r.id))}
                              onClick={(e) => e.stopPropagation()}
                            />

                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => router.push(`/reports/${r.id}`)}
                            >
                              <div className="font-semibold truncate">
                                {r.title || "제목 없음"}{" "}
                                <span className="text-gray-500">
                                  · {String(r.status || "").toUpperCase()}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {fmtDate(r.created_at)}
                              </div>
                            </button>

                            <button
                              type="button"
                              className="rounded-md border px-3 py-2 text-xs font-semibold hover:border-gray-400"
                              onClick={() => router.push(`/reports/${r.id}`)}
                            >
                              열기
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}