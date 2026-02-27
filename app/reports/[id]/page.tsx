// app/reports/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id;

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [msg, setMsg] = useState<string>("");

  const [csvUploading, setCsvUploading] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  const [imgSignedMap, setImgSignedMap] = useState<Record<string, string>>({});
  const [shareUrl, setShareUrl] = useState<string>("");

  const [deletingMap, setDeletingMap] = useState<Record<string, boolean>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ✅ 선택된 이미지(path)
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // ✅ 같은 파일 재선택 가능하게 (CSV)
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ CSV open/delete 상태
  const [csvBusyMap, setCsvBusyMap] = useState<Record<string, boolean>>({}); // key=path

  const images: UploadImageInfo[] = useMemo(() => {
    if (!report) return [];
    const meta = ensureUpload(report.meta);
    return meta.upload.images as UploadImageInfo[];
  }, [report]);

  const selectedPaths = useMemo(() => {
    return Object.keys(selected).filter((p) => selected[p]);
  }, [selected]);

  function computeShareUrl(shareToken: string | null | undefined) {
    if (!shareToken) return "";
    return `${location.origin}/share/${shareToken}`;
  }

  async function refreshReport(nextMsg?: string) {
    try {
      const token = await getAccessTokenOrThrow();

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
  // ✅ CSV upload (Bearer)
  // =========================
  async function onUploadCsv(file: File | null) {
    if (!file || !report) return;

    try {
      setCsvUploading(true);
      setMsg("");

      const token = await getAccessTokenOrThrow();

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

      // 같은 파일 재선택 가능
      if (csvInputRef.current) csvInputRef.current.value = "";

      await refreshReport("CSV 업로드 완료");
    } catch (e: any) {
      setMsg(e?.message || "CSV 업로드 실패");
    } finally {
      setCsvUploading(false);
    }
  }

  // ✅ CSV open (signed-url) -> 새 탭
  async function openCsv(it: UploadCsvInfo) {
    if (!report) return;
    if (!it?.path) return;

    try {
      setMsg("");
      setCsvBusyMap((p) => ({ ...p, [it.path]: true }));

      const token = await getAccessTokenOrThrow();
      const res = await fetch("/api/uploads/signed-url", {
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
      if (!res.ok || !json?.ok || !json?.url) {
        setMsg(json?.error || "CSV signed-url 생성 실패");
        return;
      }

      window.open(String(json.url), "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setMsg(e?.message || "CSV 열기 실패");
    } finally {
      setCsvBusyMap((p) => ({ ...p, [it.path]: false }));
    }
  }

  // ✅ CSV delete (storage + meta)
  async function deleteCsv(it: UploadCsvInfo) {
    if (!report) return;
    if (!it?.path) return;

    const ok = window.confirm(`CSV를 삭제할까요?\n\n- ${it.name}`);
    if (!ok) return;

    try {
      setMsg("");
      setCsvBusyMap((p) => ({ ...p, [it.path]: true }));

      // optimistic remove from UI
      setReport((prev) => {
        if (!prev) return prev;
        const meta = ensureUpload(prev.meta);
        meta.upload.csv = (meta.upload.csv || []).filter((x: any) => String(x?.path || "") !== it.path);
        return { ...prev, meta };
      });

      const token = await getAccessTokenOrThrow();
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
  // Images upload
  // =========================
  async function onUploadImages(files: FileList | null) {
    if (!files || !files.length || !report) return;

    try {
      setImgUploading(true);
      setMsg("");

      const token = await getAccessTokenOrThrow();

      const form = new FormData();
      form.append("report_id", report.id);
      Array.from(files).forEach((f) => form.append("files", f));

      const res = await fetch("/api/uploads/images", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || "Image upload failed");
        return;
      }

      const count = Array.isArray(json.uploaded) ? json.uploaded.length : 0;

      setImgSignedMap({});
      await refreshReport(`이미지 업로드 완료 (${count}개)`);
    } finally {
      setImgUploading(false);
    }
  }

  // =========================
  // Single delete
  // =========================
  async function onDeleteImage(it: UploadImageInfo) {
    if (!report) return;

    const ok = window.confirm(`이미지를 삭제할까요?\n\n- ${it.name}`);
    if (!ok) return;

    try {
      setMsg("");
      setDeletingMap((prev) => ({ ...prev, [it.path]: true }));

      // optimistic remove
      setReport((prev) => {
        if (!prev) return prev;
        const meta = ensureUpload(prev.meta);
        meta.upload.images = (meta.upload.images || []).filter(
          (x: any) => String(x?.path || "") !== it.path
        );
        return { ...prev, meta };
      });

      setImgSignedMap((prev) => {
        const next = { ...prev };
        delete next[it.path];
        return next;
      });

      setSelected((prev) => {
        const next = { ...prev };
        delete next[it.path];
        return next;
      });

      const token = await getAccessTokenOrThrow();

      const res = await fetch("/api/uploads/images/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: report.id,
          bucket: it.bucket,
          path: it.path,
        }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        await refreshReport(json?.error || "이미지 삭제 실패");
        return;
      }

      await refreshReport("이미지 삭제 완료");
    } catch (e: any) {
      await refreshReport(e?.message || "이미지 삭제 실패");
    } finally {
      setDeletingMap((prev) => ({ ...prev, [it.path]: false }));
    }
  }

  // =========================
  // ✅ Bulk delete (selected)
  // =========================
  async function onDeleteSelected() {
    if (!report) return;

    const paths = selectedPaths;
    if (!paths.length) {
      setMsg("선택된 이미지가 없습니다.");
      return;
    }

    const ok = window.confirm(`선택한 ${paths.length}개 이미지를 삭제할까요?`);
    if (!ok) return;

    try {
      setMsg("");
      setBulkDeleting(true);

      // optimistic: meta에서 제거
      setReport((prev) => {
        if (!prev) return prev;
        const meta = ensureUpload(prev.meta);
        const removeSet = new Set(paths);
        meta.upload.images = (meta.upload.images || []).filter(
          (x: any) => !removeSet.has(String(x?.path || ""))
        );
        return { ...prev, meta };
      });

      // signed map에서 제거
      setImgSignedMap((prev) => {
        const next = { ...prev };
        for (const p of paths) delete next[p];
        return next;
      });

      // 선택 초기화
      setSelected({});

      const token = await getAccessTokenOrThrow();

      const res = await fetch("/api/uploads/images/delete-many", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: report.id,
          bucket: "report_uploads",
          paths,
        }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        await refreshReport(json?.error || "선택 삭제 실패");
        return;
      }

      await refreshReport(`선택 삭제 완료 (${paths.length}개)`);
    } catch (e: any) {
      await refreshReport(e?.message || "선택 삭제 실패");
    } finally {
      setBulkDeleting(false);
    }
  }

  // =========================
  // signed-url (authed) for images
  // =========================
  async function getSignedUrlAuthed(reportId: string, bucket: string, path: string) {
    const token = await getAccessTokenOrThrow();

    const res = await fetch("/api/uploads/signed-url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reportId, bucket, path }),
    });

    const json = await safeReadJson(res);
    if (!res.ok || !json?.ok) {
      console.warn("signed-url failed", res.status, json);
      return null;
    }
    return json.url as string;
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!report) return;

      const need = images.filter((it) => !imgSignedMap[it.path]);
      if (!need.length) return;

      for (const it of need) {
        const url = await getSignedUrlAuthed(report.id, it.bucket, it.path);
        if (!alive) return;
        if (url) setImgSignedMap((prev) => ({ ...prev, [it.path]: url }));
      }
    })();

    return () => {
      alive = false;
    };
  }, [report, images, imgSignedMap]);

  // ✅ images가 바뀌면, selected에서 존재하지 않는 path 정리(안전)
  useEffect(() => {
    const exist = new Set(images.map((x) => x.path));
    setSelected((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) {
        if (prev[k] && exist.has(k)) next[k] = true;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [images]);

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  if (!report) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 8 }}>Report not found</div>
        {msg ? <div style={{ color: "#b00" }}>{msg}</div> : null}
      </div>
    );
  }

  const meta = ensureUpload(report.meta);

  // CSV list (최신 먼저)
  const csvList: UploadCsvInfo[] = (meta.upload?.csv || []).slice();

  const title = report.title || "Report";
  const statusLabel =
    report.status === "draft" ? "Draft" : report.status === "ready" ? "Ready" : "Archived";

  const allSelected = images.length > 0 && selectedPaths.length === images.length;

  function toggleSelect(path: string, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[path] = true;
      else delete next[path];
      return next;
    });
  }

  function toggleSelectAll() {
    if (!images.length) return;
    if (allSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const it of images) next[it.path] = true;
    setSelected(next);
  }

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        {title} <span style={{ opacity: 0.6 }}>- {statusLabel}</span>
      </h1>

      <div style={{ marginBottom: 12, opacity: 0.85 }}>
        상태: <b>{report.status}</b>
      </div>

      {/* 발행/공유 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
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

      {/* CSV 업로드 + 리스트 */}
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

      {/* 이미지 업로드 */}
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>이미지 업로드</div>

        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          multiple
          disabled={imgUploading || bulkDeleting}
          onChange={(e) => onUploadImages(e.target.files)}
        />

        {/* ✅ 선택 삭제 컨트롤 */}
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 13,
            opacity: 0.95,
          }}
        >
          <span>{imgUploading ? "업로드 중..." : `총 ${images.length}개`}</span>

          <button
            onClick={toggleSelectAll}
            disabled={!images.length || bulkDeleting}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: !images.length || bulkDeleting ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
            title="전체 선택/해제"
          >
            {allSelected ? "전체 해제" : "전체 선택"}
          </button>

          <button
            onClick={onDeleteSelected}
            disabled={!selectedPaths.length || bulkDeleting}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: selectedPaths.length ? "#111" : "#f3f3f3",
              color: selectedPaths.length ? "#fff" : "#666",
              cursor: !selectedPaths.length || bulkDeleting ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
            title="선택 삭제"
          >
            {bulkDeleting ? "삭제 중..." : `선택 삭제 (${selectedPaths.length})`}
          </button>
        </div>

        {images.length ? (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {images
              .slice()
              .reverse()
              .map((it) => {
                const url = imgSignedMap[it.path];
                const deleting = !!deletingMap[it.path] || bulkDeleting;
                const checked = !!selected[it.path];

                return (
                  <div
                    key={it.path}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "#fff",
                      opacity: deleting ? 0.75 : 1,
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <a
                        href={url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "block",
                          width: "100%",
                          aspectRatio: "4 / 3",
                          background: "#f5f5f5",
                          pointerEvents: url && !deleting ? "auto" : "none",
                        }}
                        title="새 탭에서 열기"
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={it.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              opacity: 0.7,
                            }}
                          >
                            loading...
                          </div>
                        )}
                      </a>

                      {/* ✅ 선택 체크박스 */}
                      <label
                        style={{
                          position: "absolute",
                          top: 8,
                          left: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 8px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.92)",
                          border: "1px solid rgba(0,0,0,0.12)",
                          cursor: deleting ? "not-allowed" : "pointer",
                          fontSize: 12,
                          fontWeight: 800,
                          userSelect: "none",
                        }}
                        title="선택"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={deleting}
                          onChange={(e) => toggleSelect(it.path, e.target.checked)}
                        />
                        선택
                      </label>

                      {/* ✅ 단일 삭제 버튼 */}
                      <button
                        onClick={() => onDeleteImage(it)}
                        disabled={deleting}
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          padding: "6px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: "rgba(255,255,255,0.92)",
                          cursor: deleting ? "not-allowed" : "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                        title="삭제"
                      >
                        삭제
                      </button>
                    </div>

                    <div style={{ padding: 10 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginBottom: 6,
                        }}
                        title={it.name}
                      >
                        {it.name}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {(it.size || 0).toLocaleString()} bytes
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
            업로드된 이미지가 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}