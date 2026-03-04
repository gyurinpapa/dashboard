// app/reports/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";

import ReportTemplate from "../../components/ReportTemplate";

async function safeJson(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: "Non-JSON response", raw };
  }
}

/* =========================================================
 * ✅ Bearer 우선 + 쿠키 fallback (가장 안전)
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

/* =========================================================
 * API helpers
 * ========================================================= */

async function fetchRows(reportId: string): Promise<any[]> {
  const res = await authFetch(`/api/reports/${reportId}/rows`);
  const json = await safeJson(res);
  if (!res.ok || !json?.ok)
    throw new Error(json?.error || `Failed to fetch rows (${res.status})`);
  return json.rows ?? [];
}

async function fetchCreativesMap(
  reportId: string
): Promise<Record<string, string>> {
  const res = await authFetch(
    `/api/reports/${reportId}/assets/creatives/map?expiresIn=3600`
  );
  const json = await safeJson(res);
  if (!res.ok || !json?.ok)
    throw new Error(
      json?.error || `Failed to fetch creativesMap (${res.status})`
    );
  return json.creativesMap ?? {};
}

async function runIngestion(reportId: string) {
  const res = await authFetch(`/api/reports/${reportId}/ingestion/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "replace" }),
  });
  const json = await safeJson(res);
  if (!res.ok || !json?.ok)
    throw new Error(json?.error || `Ingestion failed (${res.status})`);
  return json;
}

async function uploadCsv(reportId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  fd.set("reportId", reportId);

  const res = await authFetch(`/api/uploads/csv`, { method: "POST", body: fd });
  const json = await safeJson(res);
  if (!res.ok || !json?.ok)
    throw new Error(json?.error || `CSV upload failed (${res.status})`);
  return json;
}

// ✅ 소재 업로드 API
type UploadCreativesResult = {
  ok: boolean;
  items?: any[];
  creativesMap?: Record<string, string>;
  error?: string;
};

async function uploadCreatives(reportId: string, files: File[]) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  fd.set("expiresIn", "3600");

  const res = await authFetch(`/api/reports/${reportId}/assets/creatives/upload`, {
    method: "POST",
    body: fd,
  });

  const json = (await safeJson(res)) as UploadCreativesResult;

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Creatives upload failed (${res.status})`);
  }

  return json;
}

/* =========================================================
 * ✅ Publish (published_at 포함 -> 실패 시 publish-lite 재시도)
 * ========================================================= */

function looksLikePublishedAtIssue(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("published_at") ||
    m.includes("schema cache") ||
    m.includes("could not find") ||
    (m.includes("column") && m.includes("published_at"))
  );
}

function pickSharePath(json: any): string {
  if (json?.sharePath) return String(json.sharePath);

  const token = json?.share_token || json?.shareToken;
  if (token) return `/share/${String(token).trim()}`;

  const t2 = json?.report?.share_token || json?.report?.shareToken;
  if (t2) return `/share/${String(t2).trim()}`;

  return "";
}

async function publishReportWithFallback(reportId: string) {
  const res1 = await authFetch(`/api/reports/${reportId}/publish`, {
    method: "POST",
  });
  const json1 = await safeJson(res1);

  if (res1.ok && json1?.ok) {
    return {
      ok: true as const,
      sharePath: pickSharePath(json1),
      status: String(json1?.status || "ready"),
      raw: json1,
      used: "publish" as const,
    };
  }

  const msg1 = String(
    json1?.error || json1?.message || `Publish failed (${res1.status})`
  );

  if (looksLikePublishedAtIssue(msg1)) {
    const res2 = await authFetch(`/api/reports/${reportId}/publish-lite`, {
      method: "POST",
    });
    const json2 = await safeJson(res2);

    if (res2.ok && json2?.ok) {
      return {
        ok: true as const,
        sharePath: pickSharePath(json2),
        status: String(json2?.status || "ready"),
        raw: json2,
        used: "publish-lite" as const,
      };
    }

    const msg2 = String(
      json2?.error || json2?.message || `Publish-lite failed (${res2.status})`
    );
    throw new Error(msg2);
  }

  throw new Error(msg1);
}

function fullUrl(path: string) {
  if (!path) return "";
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function uniqCount(values: string[]) {
  const s = new Set<string>();
  for (const v of values) if (v) s.add(v);
  return s.size;
}

/* =========================================================
 * ✅ UI helper (구조 유지 + 클릭 유도 업그레이드)
 * - input은 숨기고, label을 큰 버튼처럼 만든다
 * - "선택된 파일 없음"을 더 명확/강조
 * ========================================================= */

function humanSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const fixed = i === 0 ? String(Math.round(n)) : n.toFixed(n >= 10 ? 1 : 2);
  return `${fixed}${units[i]}`;
}

function extractTokenFromText(input: string) {
  const s = String(input || "").trim();
  if (!s) return "";
  // /share/<token> 형태
  const m1 = s.match(/\/share\/([^/?#\s]+)/i);
  if (m1?.[1]) return m1[1].trim();
  // token=xxx 쿼리
  const m2 = s.match(/[?&]token=([^&#\s]+)/i);
  if (m2?.[1]) return decodeURIComponent(m2[1]).trim();
  // 그냥 token만 붙여넣은 경우
  return s;
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id;

  /**
   * ✅ B 정책(세션 기준):
   * - 이 페이지에 들어온 “이번 세션”에서
   *   1) CSV 업로드+파싱(ingestion/run) 성공하기 전엔 미리보기 rows를 보여주지 않는다.
   *   2) 소재 업로드 성공하기 전엔 매칭된 소재(creativesMap)를 보여주지 않는다.
   *
   * => DB에 기존 rows/creatives가 있어도 "표시용"으로는 0에서 시작.
   */

  // ✅ Hydration-safe: SSR에서 Date.now() 찍지 않기 (useEffect에서만 세팅)
  const sessionStartedAtRef = useRef<number | null>(null);
  const [sessionStartedText, setSessionStartedText] = useState<string>("-"); // SSR/CSR 최초 동일

  const [sessionIngested, setSessionIngested] = useState(false);
  const [sessionCreativesUploaded, setSessionCreativesUploaded] = useState(false);

  // 서버에서 가져온 “실제 데이터”(표시 여부는 별도)
  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});

  // ✅ 상단: 발행 URL
  const [publishing, setPublishing] = useState(false);
  const [sharePath, setSharePath] = useState<string>("");

  // ✅ CSV
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [lastUploadedCsvName, setLastUploadedCsvName] = useState<string>("");

  // ✅ Creatives
  const creativesInputRef = useRef<HTMLInputElement | null>(null);
  const [creativeFiles, setCreativeFiles] = useState<File[]>([]);
  const [uploadingCreatives, setUploadingCreatives] = useState(false);
  const [creativeUploadLog, setCreativeUploadLog] = useState<any[]>([]);
  const [lastUploadedCreativeCount, setLastUploadedCreativeCount] =
    useState<number>(0);

  /**
   * ✅ 표시용 데이터 (세션 기준 게이트)
   * - 세션에서 ingestion 성공 전: rows를 빈 배열로 렌더
   * - 세션에서 creatives 업로드 성공 전: creativesMap을 빈 객체로 렌더
   */
  const displayRows = sessionIngested ? rows : [];
  const displayCreativesMap = sessionCreativesUploaded ? creativesMap : {};

  const creativesKeyCount = Object.keys(displayCreativesMap || {}).length;

  // ✅ signed url token 착시 방지: pathname 기준 고유 수를 세는 편이 더 안전
  const creativesUrlCount = useMemo(() => {
    const paths = Object.values(displayCreativesMap || {}).map((url) => {
      const s = String(url || "");
      if (!s) return "";
      try {
        const u = new URL(s);
        return u.pathname;
      } catch {
        return s;
      }
    });
    return uniqCount(paths);
  }, [displayCreativesMap]);

  // ✅ 발행 가능 조건도 "세션에서 ingestion 성공" 기준으로 변경(착시 제거)
  const canPublish = sessionIngested && !publishing;

  async function refreshRows() {
    if (!reportId) return;
    setLoadingRows(true);
    setMsg("");
    try {
      const [rws, cmap] = await Promise.all([
        fetchRows(reportId),
        fetchCreativesMap(reportId),
      ]);
      setRows(rws);
      setCreativesMap(cmap);
    } catch (e: any) {
      setMsg(e?.message || "Failed to load rows/creatives");
    } finally {
      setLoadingRows(false);
    }
  }

  // ✅ reportId 변경 시: 세션 시작시간/표시 문자열은 mount 후에만 세팅( hydration-safe )
  useEffect(() => {
    if (!reportId) return;

    sessionStartedAtRef.current = Date.now();
    setSessionStartedText("-"); // 최초 렌더 SSR/CSR 동일 유지

    // 세션 게이트 리셋
    setSessionIngested(false);
    setSessionCreativesUploaded(false);

    setSharePath("");
    setMsg("");

    // “이번에 올린 것” UI 리셋
    setCreativeUploadLog([]);
    setLastUploadedCreativeCount(0);

    refreshRows();

    // mount 이후에만 로컬 포맷 문자열 세팅(✅ hydration-safe)
    const d = new Date(sessionStartedAtRef.current);
    setSessionStartedText(d.toLocaleString());
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
      // 1) upload
      const up = await uploadCsv(reportId, csvFile);
      const uploadedName =
        up?.item?.name || up?.item?.file_name || csvFile.name || "";
      if (uploadedName) setLastUploadedCsvName(String(uploadedName));

      // 2) run ingestion
      const run = await runIngestion(reportId);

      // ✅ B 정책: 이번 세션 ingestion 성공 처리
      setSessionIngested(true);

      // 3) refresh (서버 데이터 최신화)
      await refreshRows();

      // 4) UI 초기화
      setCsvFile(null);
      if (csvInputRef.current) csvInputRef.current.value = "";

      setMsg(
        `CSV 업로드 + 파싱 완료 (inserted: ${run?.inserted ?? "?"}) → 미리보기에 반영되었습니다.`
      );
    } catch (e: any) {
      setMsg(e?.message || "CSV 업로드/파싱 실패");
    } finally {
      setCsvUploading(false);
    }
  }

  async function handleUploadCreatives() {
    if (!reportId) return;

    if (!creativeFiles.length) {
      setMsg("소재 이미지 파일을 선택하세요.");
      return;
    }

    setUploadingCreatives(true);
    setMsg("");

    try {
      const filesCount = creativeFiles.length;

      const res = await uploadCreatives(reportId, creativeFiles);

      // ✅ 이번 세션 creatives 업로드 성공 처리
      setSessionCreativesUploaded(true);

      // 업로드 로그 유지(= “이번에 올린 것” 근거)
      const items = (res as any).items ?? [];
      setCreativeUploadLog(items);
      setLastUploadedCreativeCount(filesCount);

      // input 비우기
      setCreativeFiles([]);
      if (creativesInputRef.current) creativesInputRef.current.value = "";

      // 맵 재로딩(서버 기준 현재 상태)
      setCreativesMap(await fetchCreativesMap(reportId));

      setMsg(`소재 업로드 완료: ${filesCount}개`);
    } catch (e: any) {
      setMsg(e?.message || "소재 업로드 중 오류");
    } finally {
      setUploadingCreatives(false);
    }
  }

  async function handlePublish() {
    if (!reportId) return;

    // ✅ B 정책: 세션 ingestion 없으면 프론트에서 먼저 차단(착시 제거)
    if (!sessionIngested) {
      setMsg(
        "이번 세션에서 CSV 업로드 + 파싱(ingestion/run)을 먼저 완료해야 발행할 수 있습니다."
      );
      return;
    }

    setPublishing(true);
    setMsg("");
    try {
      const out = await publishReportWithFallback(reportId);

      if (out.sharePath) setSharePath(out.sharePath);

      if (out.used === "publish-lite") {
        setMsg(
          "발행 완료(안전모드: publish-lite). 아래 URL로 실제 보고서를 볼 수 있습니다."
        );
      } else {
        setMsg("발행 완료. 아래 URL로 실제 보고서를 볼 수 있습니다.");
      }
    } catch (e: any) {
      setMsg(e?.message || "발행 실패");
    } finally {
      setPublishing(false);
    }
  }

  const shareUrl = sharePath ? fullUrl(sharePath) : "";

  // ✅ 클릭 유도형 상태 문구(가독성 개선)
  const csvStatusText = useMemo(() => {
    if (csvFile) {
      const sz = csvFile.size ? ` (${humanSize(csvFile.size)})` : "";
      return `선택됨: ${csvFile.name}${sz}`;
    }
    if (lastUploadedCsvName) return `최근 업로드: ${lastUploadedCsvName}`;
    return "📌 CSV 파일을 선택해 주세요 (클릭)";
  }, [csvFile, lastUploadedCsvName]);

  const creativesStatusText = useMemo(() => {
    if (creativeFiles.length > 0) return `선택됨: ${creativeFiles.length}개`;
    if (lastUploadedCreativeCount > 0)
      return `최근 업로드: ${lastUploadedCreativeCount}개`;
    return "📌 이미지 파일을 선택해 주세요 (클릭)";
  }, [creativeFiles.length, lastUploadedCreativeCount]);

  // ✅ 선택된 creatives 파일 이름 미리보기(너무 길면 3개만)
  const creativesNamePreview = useMemo(() => {
    const list = creativeFiles.map((f) => f?.name).filter(Boolean);
    if (!list.length) return "";
    const head = list.slice(0, 3).join(", ");
    const more = list.length > 3 ? ` 외 ${list.length - 3}개` : "";
    return `${head}${more}`;
  }, [creativeFiles]);

  return (
    <div className="p-6">
      {/* ✅ 상단: 발행 / 실제 URL 생성 바 */}
      <div className="rounded-lg border p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">실제 보고서 URL</div>
            <div className="text-xs text-gray-600">
              CSV 업로드/파싱 + 소재 업로드 후, 발행하면 공유 링크(/share/[token])가 생성됩니다.
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              세션 시작: {sessionStartedText}
              {" · "}
              {sessionIngested
                ? "✅ 이번 세션 CSV 파싱 완료"
                : "⛔ 이번 세션 CSV 파싱 전(미리보기 숨김)"}
              {" · "}
              {sessionCreativesUploaded
                ? "✅ 이번 세션 소재 업로드 완료"
                : "⛔ 이번 세션 소재 업로드 전(매칭 0)"}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                publishing || !canPublish
                  ? "bg-gray-300 text-gray-600"
                  : "bg-black text-white hover:opacity-90"
              }`}
              onClick={handlePublish}
              disabled={publishing || !canPublish}
              title={!sessionIngested ? "이번 세션에서 CSV 업로드+파싱 필요" : ""}
            >
              {publishing ? "발행 중..." : "발행하기"}
            </button>

            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm hover:border-gray-400"
              onClick={refreshRows}
            >
              새로고침
            </button>
          </div>
        </div>

        {shareUrl ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            readOnly
            value={shareUrl}
          />

          {/* ✅ 오른쪽 버튼 2개: 발행/새로고침과 동일 사이즈 + 클릭 유도 UI */}
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm font-semibold bg-white hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100"
            style={{ minWidth: 74 }}
            onClick={() => window.open(shareUrl, "_blank")}
            title="새 탭에서 열기"
          >
            열기
          </button>

          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm font-semibold bg-white hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100"
            style={{ minWidth: 74 }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                setMsg("URL을 복사했습니다.");
              } catch {
                setMsg("복사 실패(브라우저 권한 확인)");
              }
            }}
            title="클립보드에 복사"
          >
            복사
          </button>
        </div>
      ) : (
        <div className="mt-3 text-xs text-gray-500">아직 발행되지 않았습니다.</div>
      )}
      </div>

      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold">리포트</div>
          <div className="mt-1 text-sm text-gray-600">/reports/{reportId}</div>
        </div>
      </div>

      {msg ? (
        <div className="mt-3 rounded-md border bg-white p-3 text-sm text-gray-700">
          {msg}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-12 gap-4">
        {/* 좌측 */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* CSV 업로드 */}
          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">CSV 업로드</div>
            <div className="text-xs text-gray-600 mb-3">
              업로드 후 서버 파서(ingestion/run)가 실행되어 rows가 갱신됩니다.
            </div>

            {/* ✅ input은 숨기고, label을 큰 클릭 영역으로 */}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            />

            <label
              htmlFor={undefined as any}
              onClick={() => csvInputRef.current?.click()}
              className="block w-full rounded-md border px-4 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100"
              style={{ userSelect: "none" }}
              title="클릭해서 CSV 파일을 선택하세요"
            >
              <div className="text-sm font-semibold">📁 CSV 파일 선택</div>
              <div className="mt-1 text-xs text-gray-600">
                클릭하여 파일을 선택하세요. (드래그앤드롭은 추후)
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div
                  className={`text-xs ${
                    csvFile || lastUploadedCsvName
                      ? "text-gray-700"
                      : "text-gray-500"
                  }`}
                >
                  {csvStatusText}
                </div>

                {csvFile ? (
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs font-semibold hover:border-gray-400 bg-white"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCsvFile(null);
                      if (csvInputRef.current) csvInputRef.current.value = "";
                    }}
                    title="선택 해제"
                  >
                    선택 해제
                  </button>
                ) : null}
              </div>
            </label>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  csvUploading
                    ? "bg-gray-300 text-gray-600"
                    : "bg-black text-white hover:opacity-90"
                }`}
                onClick={handleUploadCsv}
                disabled={csvUploading}
              >
                {csvUploading ? "업로드 중..." : "CSV 업로드 + 파싱"}
              </button>

              <div className="text-xs text-gray-600">
                {csvFile
                  ? "업로드 준비 완료"
                  : lastUploadedCsvName
                  ? "CSV를 다시 바꾸려면 위 박스를 클릭"
                  : "먼저 CSV를 선택하세요"}
              </div>
            </div>
          </div>

          {/* 소재 업로드 */}
          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">소재 업로드</div>
            <div className="text-xs text-gray-600 mb-3">
              CSV의 <b>creative_file</b> 값과 업로드 파일명이 매칭됩니다.
              <br />
              예: CSV <b>CR_001.png</b> → 업로드도 <b>CR_001.png</b>
            </div>

            {/* ✅ input 숨김 + label 클릭 유도 */}
            <input
              ref={creativesInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => setCreativeFiles(Array.from(e.target.files ?? []))}
            />

            <label
              htmlFor={undefined as any}
              onClick={() => creativesInputRef.current?.click()}
              className="block w-full rounded-md border px-4 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100"
              style={{ userSelect: "none" }}
              title="클릭해서 이미지 파일을 선택하세요"
            >
              <div className="text-sm font-semibold">🖼️ 이미지 파일 선택</div>
              <div className="mt-1 text-xs text-gray-600">
                여러 개 선택 가능합니다.
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div
                  className={`text-xs ${
                    creativeFiles.length > 0 || lastUploadedCreativeCount > 0
                      ? "text-gray-700"
                      : "text-gray-500"
                  }`}
                >
                  {creativesStatusText}
                  {creativesNamePreview ? (
                    <span className="text-gray-500"> · {creativesNamePreview}</span>
                  ) : null}
                </div>

                {creativeFiles.length > 0 ? (
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs font-semibold hover:border-gray-400 bg-white"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCreativeFiles([]);
                      if (creativesInputRef.current)
                        creativesInputRef.current.value = "";
                    }}
                    title="선택 해제"
                  >
                    선택 해제
                  </button>
                ) : null}
              </div>
            </label>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  uploadingCreatives
                    ? "bg-gray-300 text-gray-600"
                    : "bg-black text-white hover:opacity-90"
                }`}
                onClick={handleUploadCreatives}
                disabled={uploadingCreatives}
              >
                {uploadingCreatives ? "업로드 중..." : "소재 업로드"}
              </button>

              <div className="text-xs text-gray-600">
                {creativeFiles.length > 0
                  ? "업로드 준비 완료"
                  : lastUploadedCreativeCount > 0
                  ? "이미지를 바꾸려면 위 박스를 클릭"
                  : "먼저 이미지를 선택하세요"}
              </div>
            </div>

            {creativeUploadLog.length > 0 ? (
              <div className="mt-3 rounded-md border p-2 bg-white">
                <div className="text-xs font-semibold mb-2">
                  업로드 결과(이번 세션)
                </div>
                <div className="max-h-40 overflow-auto space-y-1">
                  {creativeUploadLog.map((it, idx) => (
                    <div key={idx} className="text-xs text-gray-700">
                      {it.ok ? "✅" : "❌"}{" "}
                      <span className="font-medium">{it.file}</span>{" "}
                      <span className="text-gray-500">→ key:</span>{" "}
                      <span className="font-mono">{it.creative_key}</span>
                      {!it.ok && it.error ? (
                        <span className="text-red-600"> ({it.error})</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* 매칭 상태 */}
          <div className="rounded-lg border p-4">
            <div className="text-sm font-semibold mb-1">매칭된 소재</div>

            <div className="text-sm text-gray-700">
              고유 URL: <b>{creativesUrlCount}</b>개{" "}
              <span className="text-gray-400">·</span> 키 후보:{" "}
              <b>{creativesKeyCount}</b>개
            </div>

            {!sessionCreativesUploaded ? (
              <div className="mt-2 text-xs text-orange-600">
                이번 세션에서 소재 업로드 전이라 “매칭된 소재”는 0으로 표시됩니다.
              </div>
            ) : null}

            <div className="mt-2 text-xs text-gray-500">
              ※ 키 후보 수는 매칭 성공률을 올리기 위한 “확장 키”가 포함되어 커질 수 있습니다.
              실제 이미지 파일 수 감은 “고유 URL”이 더 정확합니다.
            </div>
          </div>
        </div>

        {/* 우측 미리보기 */}
        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-lg border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm font-semibold">미리보기</div>
              <div className="text-xs text-gray-500">
                compact + scale(0.9) + right scroll
              </div>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-4">
              {!sessionIngested ? (
                <div className="rounded-md border bg-white p-4 text-sm text-gray-700">
                  <div className="font-semibold">
                    이번 세션에서 CSV 업로드 + 파싱이 필요합니다.
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    현재 DB에 기존 데이터가 있더라도, B 정책(세션 기준)에 따라 미리보기는 숨깁니다.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    transform: "scale(0.9)",
                    transformOrigin: "top center",
                  }}
                >
                  <ReportTemplate
                    rows={displayRows}
                    isLoading={loadingRows}
                    creativesMap={displayCreativesMap}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            서버 rows(실제): {rows.length}개{" "}
            <span className="text-gray-400">·</span> 표시 rows(세션 기준):{" "}
            {displayRows.length}개
          </div>
        </div>
      </div>
    </div>
  );
}