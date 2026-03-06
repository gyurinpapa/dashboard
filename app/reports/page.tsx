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

  // 다양한 응답 형태에 안전하게 대응
  const reportId =
    json?.report?.id || json?.id || json?.report_id || json?.data?.id;

  if (!reportId) throw new Error("REPORT_ID_MISSING_FROM_RESPONSE");
  return String(reportId);
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

      // 2) workspace_id 찾기 (profiles에 있다고 가정: workspace_id / current_workspace_id)
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

      // openMap 초기값(새 광고주 폴더도 기본 open)
      setOpenMap((prev) => {
        const next = { ...prev };
        next.__none__ = prev.__none__ ?? true;
        for (const a of advRows) {
          if (next[a.id] == null) next[a.id] = true;
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

    // 광고주 이름 순서대로 + 미지정 마지막
    const orderedKeys: string[] = [];
    for (const a of advertisers) if (map.has(a.id)) orderedKeys.push(a.id);
    if (map.has("__none__")) orderedKeys.push("__none__");

    // 혹시 advertisers에 없는 id가 존재하면 뒤에 붙임
    for (const k of map.keys()) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    return { map, orderedKeys };
  }, [filteredReports, advertisers]);

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
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-lg font-extrabold">내 리포트 목록</div>

          <div className="flex items-center gap-2">
            <input
              className="rounded-md border px-3 py-2 text-sm w-64"
              placeholder="검색: 광고주/제목/ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
              onClick={openAll}
            >
              전체 펼치기
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
              onClick={closeAll}
            >
              전체 접기
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
              onClick={loadAll}
            >
              새로고침
            </button>
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
                      {list.map((r) => (
                        <button
                          key={r.id}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50"
                          onClick={() => router.push(`/reports/${r.id}`)}
                        >
                          <div className="font-semibold">
                            {r.title || "제목 없음"}{" "}
                            <span className="text-gray-500">
                              · {String(r.status || "").toUpperCase()}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {fmtDate(r.created_at)}
                          </div>
                        </button>
                      ))}
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