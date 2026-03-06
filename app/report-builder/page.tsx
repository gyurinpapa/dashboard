// app/report-builder/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase/client";
import { useRouter } from "next/navigation";

type ReportType = {
  id: string;
  key: string;
  name: string;
};

type ReportRow = {
  id: string;
  title: string;
  status: string;
  created_at?: string;
  advertiser_id?: string | null;
  advertiser_name?: string | null;
  share_token?: string | null;
};

type AdvertiserRow = {
  id: string;
  name: string;
};

type ReportFilterKey = "all" | "published" | "draft";

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
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function isPublishedReport(r: ReportRow) {
  const status = norm(r.status);
  return status === "ready" || !!String(r.share_token ?? "").trim();
}

function isDraftReport(r: ReportRow) {
  const status = norm(r.status);
  return status === "draft";
}

function isArchivedReport(r: ReportRow) {
  return norm(r.status) === "archived";
}

export default function ReportBuilderPage() {
  const router = useRouter();

  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("12345678");

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [types, setTypes] = useState<ReportType[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const [creating, setCreating] = useState(false);

  // ✅ 광고주 목록/폴더 상태/검색
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [search, setSearch] = useState("");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    __none__: true,
  });

  // ✅ 상태 필터
  const [reportFilter, setReportFilter] = useState<ReportFilterKey>("all");

  // ✅ 광고주 선택/생성
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<string>("");
  const [newAdvertiserName, setNewAdvertiserName] = useState("");
  const [creatingAdvertiser, setCreatingAdvertiser] = useState(false);
  const [localMsg, setLocalMsg] = useState("");

  // ✅ 리포트 선택 삭제
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [deletingReports, setDeletingReports] = useState(false);

  /* ---------------- auth ---------------- */

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

  /* ---------------- workspace ---------------- */

  useEffect(() => {
    if (!userId) {
      setWorkspaceId(null);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      setWorkspaceId(data?.workspace_id ?? null);
    })();
  }, [userId]);

  /* ---------------- report types ---------------- */

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

  /* ---------------- advertisers ---------------- */

  useEffect(() => {
    if (!workspaceId) {
      setAdvertisers([]);
      setSelectedAdvertiserId("");
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("advertisers")
        .select("id,name")
        .eq("workspace_id", workspaceId)
        .order("name");

      if (error) {
        console.warn("[advertisers] failed", error);
        setAdvertisers([]);
        return;
      }

      const rows =
        (data ?? []).map((x: any) => ({
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

  /* ---------------- reports ---------------- */

  useEffect(() => {
    if (!workspaceId) return;
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    // ✅ 현재 목록에 없는 선택값은 자동 정리
    setSelectedReportIds((prev) => {
      const allowed = new Set(reports.map((r) => r.id));
      return prev.filter((id) => allowed.has(id));
    });
  }, [reports]);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async function fetchReports() {
    if (!workspaceId) return;

    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch(
      `/api/reports/list?workspace_id=${workspaceId}&limit=50`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const json = await safeReadJson(res);
    if (!res.ok || !(json as any).ok) {
      console.warn("[reports/list] failed", res.status, json);
      return;
    }

    const list = ((json as any).reports ?? []) as any[];

    let nextReports = (list ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      status: String(r.status ?? ""),
      created_at: r.created_at ? String(r.created_at) : undefined,
      advertiser_id: r.advertiser_id ? String(r.advertiser_id) : null,
      advertiser_name: r.advertiser_name ? String(r.advertiser_name) : null,
      share_token: r.share_token ? String(r.share_token) : null,
    })) as ReportRow[];

    const missingNameIds = Array.from(
      new Set(
        nextReports
          .filter((r) => r.advertiser_id && !r.advertiser_name)
          .map((r) => r.advertiser_id as string)
      )
    );

    if (missingNameIds.length) {
      const { data: advs, error } = await supabase
        .from("advertisers")
        .select("id,name")
        .in("id", missingNameIds);

      if (!error && advs?.length) {
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
      }
    }

    setReports(nextReports);
  }

  /* ---------------- actions ---------------- */

  async function signIn() {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return;

    setUserId(data.user?.id ?? null);
    setUserEmail(data.user?.email ?? null);

    await supabase.auth.getSession();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail(null);
    setWorkspaceId(null);
    setReports([]);
    setAdvertisers([]);
    setSearch("");
    setReportFilter("all");
    setSelectedAdvertiserId("");
    setNewAdvertiserName("");
    setOpenMap({ __none__: true });
    setLocalMsg("");
    setSelectedReportIds([]);
  }

  async function createAdvertiser() {
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

  async function createReport(type: ReportType) {
    if (!workspaceId || creating) return;

    setCreating(true);
    setLocalMsg("");

    const token = await getAccessToken();
    if (!token) {
      setCreating(false);
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
    if (!workspaceId || !selectedReportIds.length || deletingReports) return;

    const ok = window.confirm(
      `선택한 리포트 ${selectedReportIds.length}개를 삭제하시겠습니까?\n\n삭제는 소프트 삭제(archived)로 처리되며 목록에서 숨겨집니다.`
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

      const archivedCount = Number((json as any)?.archived_count ?? 0);
      setSelectedReportIds([]);
      await fetchReports();
      setLocalMsg(`리포트 ${archivedCount}개 삭제 완료`);
    } catch (e: any) {
      setLocalMsg(e?.message || "리포트 삭제 실패");
    } finally {
      setDeletingReports(false);
    }
  }

  function toggleFolder(key: string) {
    setOpenMap((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function toggleReportSelection(reportId: string) {
    setSelectedReportIds((prev) => {
      return prev.includes(reportId)
        ? prev.filter((id) => id !== reportId)
        : [...prev, reportId];
    });
  }

  /* ---------------- derived ---------------- */

  const advNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of advertisers) m.set(a.id, a.name);
    return m;
  }, [advertisers]);

  const selectedAdvertiserName = useMemo(() => {
    if (!selectedAdvertiserId) return "";
    return advertisers.find((a) => a.id === selectedAdvertiserId)?.name ?? "";
  }, [advertisers, selectedAdvertiserId]);

  const filteredReports = useMemo(() => {
  const s = norm(search);

  return reports.filter((r) => {
    // ✅ archived는 목록에서 숨김
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

    // ✅ 기존 광고주 선택 드롭다운과 목록 필터를 다시 연결
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

  /* ---------------- UI ---------------- */

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
    <main style={{ display: "flex", justifyContent: "center" }}>
      <div style={containerStyle}>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 900,
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          Automated Online Ads Reporting
        </h1>

        <div
          style={{
            background: "#f5a62333",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 20,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          {!userId ? (
            <>
              <div style={{ width: "100%", maxWidth: 520 }}>
                <div style={{ marginBottom: 6, fontSize: 13 }}>이메일</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#eaf2ff",
                    fontSize: 18,
                  }}
                />
              </div>

              <div style={{ width: "100%", maxWidth: 520 }}>
                <div style={{ marginBottom: 6, fontSize: 13 }}>비밀번호</div>
                <input
                  value={password}
                  type="password"
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#eaf2ff",
                    fontSize: 18,
                  }}
                />
              </div>

              <button className="mainBtn" onClick={signIn}>
                로그인
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {userEmail ?? "사용자"}님 반갑습니다 👋
              </div>

              <button className="subBtn" onClick={signOut}>
                로그아웃
              </button>
            </>
          )}

          <div style={{ fontSize: 13, opacity: 0.7 }}>
            workspace_id: {workspaceId ?? "(없음)"}
          </div>
        </div>

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
                onClick={deleteSelectedReports}
                disabled={!userId || deletingReports || selectedReportIds.length === 0}
                style={{ padding: "10px 14px" }}
                title={
                  selectedReportIds.length === 0
                    ? "삭제할 리포트를 먼저 선택하세요"
                    : `선택된 ${selectedReportIds.length}개 삭제`
                }
              >
                {deletingReports
                  ? "삭제 중..."
                  : `선택 삭제${
                      selectedReportIds.length > 0
                        ? ` (${selectedReportIds.length})`
                        : ""
                    }`}
              </button>

              <button
                className="subBtn"
                onClick={fetchReports}
                disabled={!userId || !workspaceId}
                style={{ padding: "10px 14px" }}
              >
                새로고침
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

          {!userId && (
            <p style={{ marginTop: 10, opacity: 0.7 }}>
              로그인하면 목록이 보입니다.
            </p>
          )}

          {userId && filteredReports.length === 0 && (
            <p style={{ marginTop: 10, opacity: 0.7 }}>
              조건에 맞는 리포트가 없습니다.
            </p>
          )}

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {userId
              ? grouped.orderedKeys.map((key) => {
                  const list = grouped.map.get(key) ?? [];
                  const isNone = key === "__none__";
                  const folderName = isNone
                    ? "광고주 미지정"
                    : advNameById.get(key) ||
                      (list.find((x) => x.advertiser_name)?.advertiser_name ??
                        "(광고주)");

                  const open = openMap[key] ?? true;

                  return (
                    <div key={key} className="folderBox">
                      <button
                        className="folderHeader"
                        onClick={() => toggleFolder(key)}
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
                            {open ? "▼" : "▶"}
                          </span>
                          <div
                            style={{
                              fontWeight: 900,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {folderName}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>
                            ({list.length})
                          </div>
                        </div>

                        <div style={{ fontSize: 12, opacity: 0.45 }}>
                          {isNone ? "" : key}
                        </div>
                      </button>

                      {open ? (
                        <div className="folderBody">
                          {list.map((r, idx) => {
                            const checked = selectedReportIds.includes(r.id);

                            return (
                              <div
                                key={r.id}
                                className="reportRow"
                                style={{
                                  borderBottom:
                                    idx === list.length - 1
                                      ? "none"
                                      : "1px solid #eee",
                                }}
                              >
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

                                <button
                                  onClick={() => router.push(`/reports/${r.id}`)}
                                  className={`reportItem reportItemMain ${
                                    checked ? "reportItemSelected" : ""
                                  }`}
                                >
                                  <div style={{ fontWeight: 700 }}>
                                    {r.title}
                                    <span style={{ fontSize: 12, opacity: 0.55 }}>
                                      {" "}
                                      · {String(r.status ?? "").toUpperCase()}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 13, opacity: 0.6 }}>
                                    {r.created_at ?? ""}
                                  </div>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>
        </section>

        <style jsx>{`
          .mainBtn {
            width: 100%;
            max-width: 520px;
            padding: 14px;
            border-radius: 14px;
            border: none;
            background: black;
            color: white;
            font-weight: 800;
            cursor: pointer;
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.15);
            transition: 0.15s;
          }

          .mainBtn:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 22px rgba(0, 0, 0, 0.18);
          }

          .subBtn {
            padding: 10px 18px;
            border-radius: 12px;
            border: 1px solid #ddd;
            background: rgba(255, 255, 255, 0.85);
            cursor: pointer;
            font-weight: 800;
            transition: 0.15s;
          }

          .subBtn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.08);
          }

          .subBtn:disabled {
            cursor: not-allowed;
            opacity: 0.55;
          }

          .filterBtn {
            padding: 10px 14px;
            border-radius: 12px;
            border: 1px solid #ddd;
            background: white;
            cursor: pointer;
            font-weight: 800;
            transition: 0.15s;
          }

          .filterBtn:hover {
            transform: translateY(-1px);
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.06);
          }

          .filterBtnActive {
            background: black;
            color: white;
            border-color: black;
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

          @media (max-width: 860px) {
            .panelCard {
              padding: 16px;
            }

            .reportCheckWrap {
              width: 46px;
              min-width: 46px;
            }
          }
        `}</style>
      </div>
    </main>
  );
}