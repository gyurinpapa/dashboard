// app/reports/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignedImage from "@/app/components/uploads/SignedImage";

/** =========================
 * Types
 * ========================= */
type UploadCsvInfo = {
  id?: string; // uuid
  name: string;
  size: number;
  contentType?: string;
  path: string;
  created_at?: string;
  uploaded_at?: string;
};

type UploadImageInfo = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  uploaded_at: string;
};

type ReportRow = {
  id: string;
  title: string;
  status: "draft" | "ready" | "archived";
  meta: any;
  share_token?: string | null;
  created_at?: string;
  updated_at?: string;

  // ✅ 보고서가 속한 workspace_id (API 응답에 있으면 사용)
  workspace_id?: string;
};

type CheckState = "idle" | "checking" | "available" | "duplicate" | "error";

/** =========================
 * Utils
 * ========================= */
async function safeReadJson(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return { __nonjson: true, status: res.status, text: "" };
  try {
    return JSON.parse(text);
  } catch {
    return { __nonjson: true, status: res.status, text };
  }
}

function ensureUpload(meta: any) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (!m.upload || typeof m.upload !== "object") m.upload = {};
  if (!Array.isArray(m.upload.images)) m.upload.images = [];
  if (!Array.isArray(m.upload.csv)) m.upload.csv = [];
  return m;
}

async function getAccessTokenOrThrow() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}

function fmtTs(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/** =========================
 * Component
 * ========================= */
export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id;

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [msg, setMsg] = useState<string>("");

  // CSV/Logo busy
  const [csvUploading, setCsvUploading] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  // share
  const [shareUrl, setShareUrl] = useState<string>("");

  // delete busy map
  const [deletingMap, setDeletingMap] = useState<Record<string, boolean>>({});

  // ✅ accessToken은 페이지에서 1회 확보 후 재사용 (SignedImage에 전달)
  const [accessToken, setAccessToken] = useState<string>("");

  // ✅ 같은 파일 재선택 가능하게 (CSV/Logo)
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ CSV open/delete 상태
  const [csvBusyMap, setCsvBusyMap] = useState<Record<string, boolean>>({}); // key=path

  // =========================
  // 광고주 생성/중복확인 상태
  // =========================
  const [advertiserName, setAdvertiserName] = useState("");
  const [advState, setAdvState] = useState<CheckState>("idle");
  const [advMsg, setAdvMsg] = useState("");
  const [advCreating, setAdvCreating] = useState(false);

  const meta = useMemo(() => ensureUpload(report?.meta), [report]);

  const images: UploadImageInfo[] = useMemo(() => {
    if (!report) return [];
    const m = ensureUpload(report.meta);
    return m.upload.images as UploadImageInfo[];
  }, [report]);

  // ✅ "로고"는 MVP로: 가장 최근 업로드 이미지 1개를 로고로 간주
  const logoItem: UploadImageInfo | null = useMemo(() => {
    if (!images.length) return null;
    return images[images.length - 1]; // 마지막(최신)
  }, [images]);

  function computeShareUrl(shareToken: string | null | undefined) {
    if (!shareToken) return "";
    return `${location.origin}/share/${shareToken}`;
  }

  async function refreshReport(nextMsg?: string) {
    try {
      const token = await getAccessTokenOrThrow();
      setAccessToken(token);

      const res = await fetch(`/api/reports/${reportId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || "Report refresh failed");
        return;
      }

      const r = json.report as ReportRow;
      setReport(r);
      setShareUrl(computeShareUrl(r?.share_token));

      if (nextMsg) setMsg(nextMsg);
    } catch (e: any) {
      setMsg(e?.message || "Unknown error");
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setMsg("");

        const token = await getAccessTokenOrThrow();
        setAccessToken(token);

        const res = await fetch(`/api/reports/${reportId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const json = await safeReadJson(res);
        if (!res.ok || !json?.ok) {
          setMsg(json?.error || "Report load failed");
          setLoading(false);
          return;
        }

        if (!alive) return;

        const r = json.report as ReportRow;
        setReport(r);
        setShareUrl(computeShareUrl(r?.share_token));
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setMsg(e?.message || "Unknown error");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [reportId]);

  // =========================
  // publish
  // =========================
  async function onPublish() {
    if (!report) return;
    try {
      setMsg("");
      const token = await getAccessTokenOrThrow();
      setAccessToken(token);

      const res = await fetch("/api/reports/publish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportId: report.id }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Publish failed");

      await refreshReport("발행 완료 (draft → ready)");
    } catch (e: any) {
      setMsg(e?.message || "발행 실패");
    }
  }

  // =========================
  // share link
  // =========================
  async function onCreateShareLink() {
    if (!report) return;
    try {
      setMsg("");
      const token = await getAccessTokenOrThrow();
      setAccessToken(token);

      const res = await fetch("/api/reports/share/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportId: report.id }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Share create failed");

      const shareToken = (json?.token as string) || "";
      if (!shareToken) throw new Error("Missing token in response");

      const url = `${location.origin}/share/${shareToken}`;
      setShareUrl(url);

      try {
        await navigator.clipboard.writeText(url);
        await refreshReport("공유 링크 생성 + 클립보드 복사 완료");
      } catch {
        await refreshReport("공유 링크 생성 완료 (클립보드 복사 실패)");
      }
    } catch (e: any) {
      setMsg(e?.message || "공유 링크 생성 실패");
    }
  }

  // =========================
  // ✅ signed-url helper (여기 페이지: 로그인 기반)
  // =========================
  async function createSignedUrl(path: string) {
    const token = accessToken || (await getAccessTokenOrThrow());
    if (!accessToken) setAccessToken(token);

    const res = await fetch("/api/uploads/signed-url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
      cache: "no-store",
    });

    const json = await safeReadJson(res);
    if (!res.ok || !json?.ok) {
      console.warn("signed-url failed", res.status, json);
      return null;
    }

    return (json.url as string) || (json.signedUrl as string) || null;
  }

  // =========================
  // ✅ CSV upload (Bearer)
  // =========================
  async function onUploadCsv(file: File | null) {
    if (!file || !report) return;

    try {
      setCsvUploading(true);
      setMsg("");

      const token = await getAccessTokenOrThrow();
      setAccessToken(token);

      const form = new FormData();
      form.append("reportId", report.id);
      form.append("file", file);

      const res = await fetch("/api/uploads/csv", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || `CSV upload failed (${res.status})`);
        return;
      }

      if (csvInputRef.current) csvInputRef.current.value = "";
      await refreshReport("CSV 업로드 완료");
    } catch (e: any) {
      setMsg(e?.message || "CSV 업로드 실패");
    } finally {
      setCsvUploading(false);
    }
  }

  async function openCsv(it: UploadCsvInfo) {
    if (!report) return;
    if (!it?.path) return;

    try {
      setMsg("");
      setCsvBusyMap((p) => ({ ...p, [it.path]: true }));

      const url = await createSignedUrl(it.path);
      if (!url) {
        setMsg("CSV signed-url 생성 실패");
        return;
      }

      window.open(String(url), "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setMsg(e?.message || "CSV 열기 실패");
    } finally {
      setCsvBusyMap((p) => ({ ...p, [it.path]: false }));
    }
  }

  async function deleteCsv(it: UploadCsvInfo) {
    if (!report) return;
    if (!it?.path) return;

    const ok = window.confirm(`CSV를 삭제할까요?\n\n- ${it.name}`);
    if (!ok) return;

    try {
      setMsg("");
      setCsvBusyMap((p) => ({ ...p, [it.path]: true }));

      // optimistic remove
      setReport((prev) => {
        if (!prev) return prev;
        const m = ensureUpload(prev.meta);
        m.upload.csv = (m.upload.csv || []).filter((x: any) => String(x?.path || "") !== it.path);
        return { ...prev, meta: m };
      });

      const token = accessToken || (await getAccessTokenOrThrow());
      if (!accessToken) setAccessToken(token);

      const res = await fetch("/api/uploads/csv/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: report.id,
          bucket: "report_uploads",
          path: it.path,
        }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        await refreshReport(json?.error || "CSV 삭제 실패");
        return;
      }

      await refreshReport("CSV 삭제 완료");
    } catch (e: any) {
      await refreshReport(e?.message || "CSV 삭제 실패");
    } finally {
      setCsvBusyMap((p) => ({ ...p, [it.path]: false }));
    }
  }

  // =========================
  // ✅ 로고 업로드 (기존 images 업로드 엔드포인트 재사용 / 단일 파일)
  // =========================
  async function onUploadLogo(file: File | null) {
    if (!file || !report) return;

    try {
      setImgUploading(true);
      setMsg("");

      const token = accessToken || (await getAccessTokenOrThrow());
      if (!accessToken) setAccessToken(token);

      const form = new FormData();
      form.append("report_id", report.id);
      form.append("files", file);

      const res = await fetch("/api/uploads/images", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || "로고 업로드 실패");
        return;
      }

      if (logoInputRef.current) logoInputRef.current.value = "";
      await refreshReport("로고 업로드 완료");
    } catch (e: any) {
      setMsg(e?.message || "로고 업로드 실패");
    } finally {
      setImgUploading(false);
    }
  }

  async function onDeleteLogo() {
    if (!report || !logoItem) return;

    const ok = window.confirm(`로고를 삭제할까요?\n\n- ${logoItem.name}`);
    if (!ok) return;

    try {
      setMsg("");
      setDeletingMap((prev) => ({ ...prev, [logoItem.path]: true }));

      // optimistic remove
      setReport((prev) => {
        if (!prev) return prev;
        const m = ensureUpload(prev.meta);
        m.upload.images = (m.upload.images || []).filter((x: any) => String(x?.path || "") !== logoItem.path);
        return { ...prev, meta: m };
      });

      const token = accessToken || (await getAccessTokenOrThrow());
      if (!accessToken) setAccessToken(token);

      const res = await fetch("/api/uploads/images/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: report.id,
          bucket: logoItem.bucket,
          path: logoItem.path,
        }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        await refreshReport(json?.error || "로고 삭제 실패");
        return;
      }

      await refreshReport("로고 삭제 완료");
    } catch (e: any) {
      await refreshReport(e?.message || "로고 삭제 실패");
    } finally {
      setDeletingMap((prev) => ({ ...prev, [logoItem.path]: false }));
    }
  }

  // =========================
  // ✅ 광고주: 중복 확인 / 생성 (Bearer 통일)
  // =========================
  const workspaceIdForAdvertiser =
    report?.workspace_id || report?.meta?.workspace_id || null;

  const canCheckAdv = !!workspaceIdForAdvertiser && !!advertiserName.trim();
  const canCreateAdv = canCheckAdv && advState === "available" && !advCreating;

  async function checkAdvertiserDup() {
    if (!canCheckAdv) return;

    try {
      setAdvState("checking");
      setAdvMsg("");

      const token = accessToken || (await getAccessTokenOrThrow());
      if (!accessToken) setAccessToken(token);

      const res = await fetch("/api/advertisers/check-name", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceIdForAdvertiser,
          name: advertiserName.trim(),
        }),
      });

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        setAdvState("error");
        setAdvMsg((json as any)?.error || "중복확인 실패");
        return;
      }

      const exists = !!(json as any).exists;
      if (exists) {
        setAdvState("duplicate");
        setAdvMsg("광고주 중복");
      } else {
        setAdvState("available");
        setAdvMsg("사용가능");
      }
    } catch (e: any) {
      setAdvState("error");
      setAdvMsg(e?.message || "중복확인 실패");
    }
  }

  async function createAdvertiser() {
    if (!canCreateAdv) return;

    try {
      setAdvCreating(true);
      setAdvMsg("");

      const token = accessToken || (await getAccessTokenOrThrow());
      if (!accessToken) setAccessToken(token);

      const res = await fetch("/api/advertisers/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceIdForAdvertiser,
          name: advertiserName.trim(),
        }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !(json as any)?.ok) {
        setAdvMsg((json as any)?.error || "광고주 생성 실패");
        return;
      }

      setAdvMsg("✅ 광고주 생성 완료");
    } catch (e: any) {
      setAdvMsg(e?.message || "광고주 생성 실패");
    } finally {
      setAdvCreating(false);
    }
  }

  function advBadge() {
    if (advState === "available")
      return { text: "사용가능", fg: "#0a7a2f", bg: "rgba(10,122,47,0.12)" };
    if (advState === "duplicate")
      return { text: "광고주 중복", fg: "#b42318", bg: "rgba(180,35,24,0.12)" };
    if (advState === "checking")
      return { text: "확인중...", fg: "#444", bg: "rgba(0,0,0,0.06)" };
    if (advState === "error")
      return { text: "오류", fg: "#b42318", bg: "rgba(180,35,24,0.12)" };
    return null;
  }

  // =========================
  // Render guards
  // =========================
  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  if (!report) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 8 }}>Report not found</div>
        {msg ? <div style={{ color: "#b00" }}>{msg}</div> : null}
      </div>
    );
  }

  // CSV list
  const csvList: UploadCsvInfo[] = (meta.upload?.csv || []).slice();

  const title = report.title || "Report";
  const statusLabel =
    report.status === "draft"
      ? "Draft"
      : report.status === "ready"
      ? "Ready"
      : "Archived";

  const logoDeleting = logoItem ? !!deletingMap[logoItem.path] : false;

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        {title} <span style={{ opacity: 0.6 }}>- {statusLabel}</span>
      </h1>

      <div style={{ marginBottom: 12, opacity: 0.85 }}>
        상태: <b>{report.status}</b>
      </div>

      {/* 발행/공유 */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {report.status === "draft" ? (
          <button
            onClick={onPublish}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            발행하기 (draft → ready)
          </button>
        ) : null}

        {report.status === "ready" ? (
          <button
            onClick={onCreateShareLink}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            공유 링크 생성
          </button>
        ) : null}

        {shareUrl ? (
          <a href={shareUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            {shareUrl}
          </a>
        ) : null}
      </div>

      {msg ? (
        <div
          style={{
            marginBottom: 16,
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          {msg}
        </div>
      ) : null}

      {/* =========================
          1) 광고주 생성 (NEW)
         ========================= */}
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>광고주 생성</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={advertiserName}
            onChange={(e) => {
              setAdvertiserName(e.target.value);
              setAdvState("idle");
              setAdvMsg("");
            }}
            placeholder="광고주명을 입력하세요"
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.14)",
              fontSize: 14,
            }}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={checkAdvertiserDup}
              disabled={!canCheckAdv || advState === "checking"}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: !canCheckAdv ? "not-allowed" : "pointer",
                opacity: !canCheckAdv ? 0.6 : 1,
                fontWeight: 800,
              }}
            >
              중복확인
            </button>

            <button
              onClick={createAdvertiser}
              disabled={!canCreateAdv}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#111",
                color: "#fff",
                cursor: !canCreateAdv ? "not-allowed" : "pointer",
                opacity: !canCreateAdv ? 0.6 : 1,
                fontWeight: 900,
              }}
            >
              {advCreating ? "생성중..." : "광고주 생성"}
            </button>

            {advBadge() ? (
              <span
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  fontWeight: 900,
                  color: advBadge()!.fg,
                  background: advBadge()!.bg,
                  border: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 13,
                }}
              >
                {advBadge()!.text}
              </span>
            ) : null}
          </div>

          {advMsg ? <div style={{ fontSize: 13, opacity: 0.85 }}>{advMsg}</div> : null}

          {!workspaceIdForAdvertiser ? (
            <div style={{ fontSize: 13, color: "#b42318", opacity: 0.9 }}>
              workspace_id를 찾을 수 없습니다. (API에서 report.workspace_id를 내려주도록 확인 필요)
            </div>
          ) : null}
        </div>
      </section>

      {/* =========================
          2) CSV 업로드
         ========================= */}
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>CSV 업로드</div>

        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={csvUploading}
          onChange={(e) => onUploadCsv(e.target.files?.[0] || null)}
        />

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          {csvUploading ? "업로드 중..." : `총 ${csvList.length}개`}
        </div>

        {csvList.length ? (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {csvList.map((it) => {
              const busy = !!csvBusyMap[it.path];
              return (
                <div
                  key={it.path}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    opacity: busy ? 0.75 : 1,
                    background: "#fff",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={it.name}
                    >
                      {it.name}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      {(it.size || 0).toLocaleString()} bytes{" "}
                      {it.created_at || it.uploaded_at ? `· ${fmtTs(it.created_at || it.uploaded_at)}` : ""}
                    </div>
                  </div>

                  {/* ✅ 여기 flexShrink: 0 로 “완성” (EOF 에러 방지 포인트) */}
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => openCsv(it)}
                      disabled={busy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#111",
                        color: "#fff",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontWeight: 800,
                      }}
                      title="새 탭에서 열기"
                    >
                      열기
                    </button>

                    <button
                      onClick={() => deleteCsv(it)}
                      disabled={busy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontWeight: 800,
                      }}
                      title="삭제"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
            아직 CSV가 업로드되지 않았습니다.
          </div>
        )}
      </section>

      {/* =========================
          3) 로고 업로드 (NEW: 단일)
         ========================= */}
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>로고 업로드</div>

        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          disabled={imgUploading || logoDeleting}
          onChange={(e) => onUploadLogo(e.target.files?.[0] || null)}
        />

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          {imgUploading ? "업로드 중..." : logoItem ? "로고 1개 등록됨" : "등록된 로고가 없습니다."}
        </div>

        {logoItem ? (
          <div
            style={{
              marginTop: 12,
              border: "1px solid #eee",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div style={{ position: "relative" }}>
              <a
                href="#"
                onClick={async (e) => {
                  e.preventDefault();
                  if (logoDeleting) return;
                  const url = await createSignedUrl(logoItem.path);
                  if (!url) return;
                  window.open(String(url), "_blank", "noopener,noreferrer");
                }}
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: 520,
                  aspectRatio: "4 / 2",
                  background: "#f5f5f5",
                  margin: "0 auto",
                }}
                title="새 탭에서 열기"
              >
                <SignedImage path={logoItem.path} alt={logoItem.name} accessToken={accessToken} />
              </a>

              <button
                onClick={onDeleteLogo}
                disabled={logoDeleting || imgUploading}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "rgba(255,255,255,0.92)",
                  cursor: logoDeleting ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
                title="로고 삭제"
              >
                {logoDeleting ? "삭제중..." : "삭제"}
              </button>
            </div>

            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 800 }}>{logoItem.name}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                {(logoItem.size || 0).toLocaleString()} bytes · {fmtTs(logoItem.uploaded_at)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                * MVP: “가장 최근 업로드 이미지 1개”를 로고로 취급합니다.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
            로고 이미지를 업로드해 주세요.
          </div>
        )}
      </section>
    </div>
  );
}