"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ReportTemplate from "@/app/components/ReportTemplate";

async function safeJson(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: "Non-JSON response", raw };
  }
}

type RowsApi = {
  ok: boolean;
  stats?: { count: number; minDate: string | null; maxDate: string | null };
  rows?: any[];
  page?: { offset: number; limit: number; returned: number; hasMore: boolean; from: string | null; to: string | null };
  error?: string;
};

async function fetchRowsPreview(reportId: string, params: { from?: string; to?: string; offset?: number; limit?: number }) {
  const sp = new URLSearchParams();
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.offset != null) sp.set("offset", String(params.offset));
  if (params.limit != null) sp.set("limit", String(params.limit));

  const res = await fetch(`/api/reports/${reportId}/rows?${sp.toString()}`, { cache: "no-store" });
  const json = (await safeJson(res)) as RowsApi;

  if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to fetch rows (${res.status})`);
  return json;
}

// (있으면) ingestion/run
async function runIngestion(reportId: string) {
  const res = await fetch(`/api/reports/${reportId}/ingestion/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "replace" }),
  });
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Ingestion failed");
  return json;
}

// CSV 업로드 API
async function uploadCsv(reportId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  fd.set("reportId", reportId);

  const res = await fetch(`/api/uploads/csv`, { method: "POST", body: fd });
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "CSV upload failed");
  return json;
}

// 소재 업로드 API
type UploadCreativesResult = { ok: boolean; items?: any[]; error?: string };
async function uploadCreatives(reportId: string, files: File[]) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  fd.set("expiresIn", "3600");

  const res = await fetch(`/api/reports/${reportId}/assets/creatives/upload`, { method: "POST", body: fd });
  const json = (await safeJson(res)) as UploadCreativesResult;
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Creatives upload failed");
  return json;
}

// 발행 API(이미 추가한 publish route 기준)
async function publishReport(reportId: string) {
  const res = await fetch(`/api/reports/${reportId}/publish`, { method: "POST" });
  const json = await safeJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Publish failed");
  return json as { ok: true; sharePath: string; status: string };
}

function fullUrl(path: string) {
  if (!path) return "";
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export default function ReportUploadPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id;

  const [msg, setMsg] = useState("");

  // ✅ 업로드 상태
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);

  const [creativeFiles, setCreativeFiles] = useState<File[]>([]);
  const [creativeUploading, setCreativeUploading] = useState(false);
  const [creativeUploadLog, setCreativeUploadLog] = useState<any[]>([]);

  // ✅ 발행 URL
  const [publishing, setPublishing] = useState(false);
  const [sharePath, setSharePath] = useState("");

  // ✅ 프리뷰 데이터(일부만)
  const [stats, setStats] = useState<{ count: number; minDate: string | null; maxDate: string | null } | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ✅ 프리뷰 쿼리(기간/페이지)
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);
  const [limit, setLimit] = useState<number>(2000);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const shareUrl = sharePath ? fullUrl(sharePath) : "";

  async function loadPreview(reset = false) {
    if (!reportId) return;
    setPreviewLoading(true);
    setMsg("");

    try {
      const nextOffset = reset ? 0 : offset;
      const res = await fetchRowsPreview(reportId, {
        from: from || undefined,
        to: to || undefined,
        offset: nextOffset,
        limit,
      });

      setStats(res.stats ?? null);

      if (reset) {
        setPreviewRows(res.rows ?? []);
        setOffset(nextOffset);
      } else {
        setPreviewRows((prev) => prev.concat(res.rows ?? []));
      }

      setHasMore(Boolean(res.page?.hasMore));
      setOffset(nextOffset + (res.page?.returned ?? 0));
    } catch (e: any) {
      setMsg(e?.message || "프리뷰 로드 실패");
    } finally {
      setPreviewLoading(false);
    }
  }

  // 최초 로드: stats + 프리뷰 일부
  useEffect(() => {
    if (!reportId) return;
    // 초기에는 전체 기간으로 프리뷰 일부만
    setFrom("");
    setTo("");
    setOffset(0);
    setPreviewRows([]);
    loadPreview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function handleUploadCsv() {
    if (!reportId) return;
    if (!csvFile) {
      setMsg("CSV 파일을 선택하세요.");
      return;
    }

    setCsvUploading(true);
    setMsg("");
    try {
      await uploadCsv(reportId, csvFile);
      await runIngestion(reportId);

      setMsg("CSV 업로드 + 파싱 완료 → 프리뷰를 갱신합니다.");
      setCsvFile(null);

      // 업로드 후 프리뷰/통계 새로고침
      setOffset(0);
      setPreviewRows([]);
      await loadPreview(true);
    } catch (e: any) {
      setMsg(e?.message || "CSV 업로드/파싱 실패");
    } finally {
      setCsvUploading(false);
    }
  }

  async function handleUploadCreatives() {
    if (!reportId) return;
    if (!creativeFiles.length) {
      setMsg("소재 파일을 선택하세요.");
      return;
    }

    setCreativeUploading(true);
    setMsg("");
    try {
      const out = await uploadCreatives(reportId, creativeFiles);
      setCreativeUploadLog(out.items ?? []);
      setCreativeFiles([]);
      setMsg("소재 업로드 완료 (미리보기 반영은 최소로만 합니다).");
    } catch (e: any) {
      setMsg(e?.message || "소재 업로드 실패");
    } finally {
      setCreativeUploading(false);
    }
  }

  async function handlePublish() {
    if (!reportId) return;
    setPublishing(true);
    setMsg("");
    try {
      const out = await publishReport(reportId);
      setSharePath(out.sharePath);
      setMsg("발행 완료. 상단 URL로 실제 보고서를 확인할 수 있습니다.");
    } catch (e: any) {
      setMsg(e?.message || "발행 실패");
    } finally {
      setPublishing(false);
    }
  }

  const statsText = useMemo(() => {
    if (!stats) return "통계 로딩 중...";
    const { count, minDate, maxDate } = stats;
    return `${count.toLocaleString()} rows / 기간 ${minDate ?? "-"} ~ ${maxDate ?? "-"}`;
  }, [stats]);

  return (
    <div className="p-6">
      {/* ✅ 상단: 실제 보고서 URL (발행) */}
      <div className="rounded-lg border p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">실제 보고서 URL</div>
            <div className="text-xs text-gray-600">
              이 페이지는 “업로드(데이터/소재) → 발행 → 공유(/share/[token])” 흐름을 위한 업로드 페이지입니다.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                publishing ? "bg-gray-300 text-gray-600" : "bg-black text-white hover:opacity-90"
              }`}
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? "발행 중..." : "발행하기"}
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
              onClick={() => {
                setOffset(0);
                setPreviewRows([]);
                loadPreview(true);
              }}
            >
              새로고침
            </button>
          </div>
        </div>

        {shareUrl ? (
          <div className="mt-3 flex items-center gap-2">
            <input className="w-full rounded-md border px-3 py-2 text-sm" readOnly value={shareUrl} />
            <button className="rounded-md border px-3 py-2 text-sm hover:border-gray-400" onClick={() => window.open(shareUrl, "_blank")}>
              열기
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setMsg("URL을 복사했습니다.");
                } catch {
                  setMsg("복사 실패(브라우저 권한 확인)");
                }
              }}
            >
              복사
            </button>
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-500">아직 발행되지 않았습니다.</div>
        )}
      </div>

      {/* 상태 메시지 */}
      {msg ? <div className="mb-4 rounded-md border bg-white p-3 text-sm text-gray-700">{msg}</div> : null}

      <div className="grid grid-cols-12 gap-4">
        {/* 좌측: 업로드 */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* CSV 업로드 */}
          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">CSV 업로드</div>
            <div className="text-xs text-gray-600 mb-3">업로드 후 서버 파서(ingestion/run)로 report_rows가 갱신됩니다.</div>

            <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} />

            <div className="mt-3 flex items-center gap-2">
              <button
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  csvUploading ? "bg-gray-300 text-gray-600" : "bg-black text-white hover:opacity-90"
                }`}
                onClick={handleUploadCsv}
                disabled={csvUploading}
              >
                {csvUploading ? "업로드 중..." : "CSV 업로드 + 파싱"}
              </button>
              <div className="text-xs text-gray-600">{csvFile ? `선택: ${csvFile.name}` : "선택된 파일 없음"}</div>
            </div>
          </div>

          {/* 소재 업로드 (미리보기 반영 최소) */}
          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">소재 업로드</div>
            <div className="text-xs text-gray-600 mb-3">
              CSV의 <b>creative_file</b>과 파일명이 매칭되도록 업로드하세요. (이 페이지에서는 미리보기 반영은 최소)
            </div>

            <input type="file" multiple accept="image/*" className="block w-full text-sm" onChange={(e) => setCreativeFiles(Array.from(e.target.files ?? []))} />

            <div className="mt-3 flex items-center gap-2">
              <button
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  creativeUploading ? "bg-gray-300 text-gray-600" : "bg-black text-white hover:opacity-90"
                }`}
                onClick={handleUploadCreatives}
                disabled={creativeUploading}
              >
                {creativeUploading ? "업로드 중..." : "소재 업로드"}
              </button>
              <div className="text-xs text-gray-600">선택: {creativeFiles.length}개</div>
            </div>

            {creativeUploadLog.length > 0 ? (
              <div className="mt-3 rounded-md border p-2 bg-white">
                <div className="text-xs font-semibold mb-2">업로드 결과</div>
                <div className="max-h-40 overflow-auto space-y-1">
                  {creativeUploadLog.map((it, idx) => (
                    <div key={idx} className="text-xs text-gray-700">
                      {it.ok ? "✅" : "❌"} <span className="font-medium">{it.file}</span>{" "}
                      {it.creative_key ? (
                        <>
                          <span className="text-gray-500">→ key:</span> <span className="font-mono">{it.creative_key}</span>
                        </>
                      ) : null}
                      {!it.ok && it.error ? <span className="text-red-600"> ({it.error})</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* 프리뷰 컨트롤 */}
          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">프리뷰 로드</div>
            <div className="text-xs text-gray-600 mb-3">
              전체 통계는 정확하게, 프리뷰는 일부만 로드합니다. (대용량 안전)
            </div>

            <div className="text-xs text-gray-700 mb-2">전체 통계: {statsText}</div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-gray-600 mb-1">from</div>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  placeholder="YYYY-MM-DD"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">to</div>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  placeholder="YYYY-MM-DD"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <select className="rounded-md border px-2 py-2 text-sm" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
                <option value={2000}>2000</option>
                <option value={5000}>5000</option>
              </select>

              <button
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  previewLoading ? "bg-gray-300 text-gray-600" : "bg-black text-white hover:opacity-90"
                }`}
                disabled={previewLoading}
                onClick={() => {
                  setOffset(0);
                  setPreviewRows([]);
                  loadPreview(true);
                }}
              >
                {previewLoading ? "로딩..." : "프리뷰 불러오기"}
              </button>

              <button
                className={`rounded-md border px-3 py-2 text-sm hover:border-gray-400 ${!hasMore ? "opacity-50" : ""}`}
                disabled={!hasMore || previewLoading}
                onClick={() => loadPreview(false)}
              >
                더 보기
              </button>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              현재 프리뷰: {previewRows.length.toLocaleString()} rows {hasMore ? "(추가 로드 가능)" : "(끝)"}
            </div>
          </div>
        </div>

        {/* 우측: 미리보기 */}
        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-lg border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm font-semibold">미리보기(일부 rows)</div>
              <div className="text-xs text-gray-500">compact + scale(0.9) + right scroll</div>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-4">
              <div style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
                {/* ✅ 소재는 미리보기 최소 반영: creativesMap 안 넘김 */}
                <ReportTemplate rows={previewRows} isLoading={previewLoading} />
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            전체: {stats?.count?.toLocaleString() ?? "-"} rows / 프리뷰: {previewRows.length.toLocaleString()} rows
          </div>
        </div>
      </div>
    </div>
  );
}