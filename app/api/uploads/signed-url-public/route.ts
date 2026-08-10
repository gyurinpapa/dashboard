// app/api/uploads/signed-url-public/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "report_uploads";
const SIGNED_URL_EXPIRES_IN = 60 * 10;

type StoredUploadItem = {
  bucket?: string | null;
  path?: string | null;
};

function jsonError(status: number, message: string) {
  return NextResponse.json(
    { ok: false, error: message },
    { status }
  );
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function asObject(v: any): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? v
    : {};
}

function toItemList(v: any): StoredUploadItem[] {
  if (Array.isArray(v)) {
    return v.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item)
    );
  }

  if (
    v &&
    typeof v === "object" &&
    !Array.isArray(v)
  ) {
    return [v];
  }

  return [];
}

function isOwnedReportPath(
  path: string,
  reportId: string
) {
  const normalizedPath = asString(path).replace(/\\/g, "/");
  const id = asString(reportId);

  if (!normalizedPath || !id) {
    return false;
  }

  const segments = normalizedPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.includes(id);
}

function getStoredBucket(item: StoredUploadItem) {
  return asString(item?.bucket) || BUCKET;
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await req.json().catch(() => null);

    if (!body) {
      return jsonError(400, "Invalid JSON");
    }

    const token = asString(body.token);
    const path = asString(body.path);

    if (!token) {
      return jsonError(400, "Missing token");
    }

    if (!path) {
      return jsonError(400, "Missing path");
    }

    /**
     * body.bucket은 의도적으로 사용하지 않는다.
     *
     * 이 endpoint는 public share token만으로 호출 가능하므로
     * caller가 임의 Storage bucket을 선택하게 두지 않는다.
     */
    const { data: report, error: rErr } =
      await supabaseAdmin
        .from("reports")
        .select(
          [
            "id",
            "status",
            "meta",
            "published_ingestion_id",
          ].join(",")
        )
        .eq("share_token", token)
        .maybeSingle();

    if (rErr) {
      return jsonError(500, rErr.message);
    }

    if (!report) {
      return jsonError(404, "Report not found");
    }

    if ((report as any).status !== "ready") {
      return jsonError(404, "Report not found");
    }

    const reportId = asString((report as any).id);

    if (!reportId) {
      return jsonError(404, "Report not found");
    }

    const publishedIngestionId = asString(
      (report as any).published_ingestion_id
    );

    /**
     * Public signed URL도 실제 published snapshot이 존재하는
     * ready report에 대해서만 허용한다.
     */
    if (!publishedIngestionId) {
      return jsonError(404, "Report not found");
    }

    const meta = asObject((report as any).meta);
    const upload = asObject(meta.upload);

    /**
     * CSV
     *
     * 현재 CSV upload 계약:
     * - meta.csv_uploads: 최신 항목이 첫 번째인 배열
     * - meta.upload.csv: 같은 배열을 legacy compatibility로 유지
     *
     * public endpoint에서는 historical CSV 전체를 허용하지 않고
     * 최신 CSV 1개만 허용한다.
     *
     * 과거 object형 metadata도 toItemList()로 계속 지원한다.
     */
    const csvUploads = toItemList(meta.csv_uploads);
    const legacyUploadCsv = toItemList(upload.csv);

    const latestCsv =
      csvUploads[0] ??
      legacyUploadCsv[0] ??
      null;

    /**
     * Images
     *
     * 현재 upload.images 전체는 report에 연결된 현재 image metadata이므로
     * 기존 계약과 동일하게 전부 허용 후보로 유지한다.
     */
    const images = toItemList(upload.images);

    const allowedItems: StoredUploadItem[] = [
      ...(latestCsv ? [latestCsv] : []),
      ...images,
    ];

    const matchedItem =
      allowedItems.find(
        (item) => asString(item?.path) === path
      ) ?? null;

    if (!matchedItem) {
      return jsonError(403, "Path not allowed");
    }

    /**
     * Metadata 자체도 fail closed 한다.
     *
     * - 현재 Production bucket은 report_uploads
     * - legacy metadata의 bucket 누락은 report_uploads로 해석
     * - 다른 bucket이 metadata에 들어 있으면 signing하지 않는다
     */
    const storedBucket = getStoredBucket(matchedItem);

    if (storedBucket !== BUCKET) {
      return jsonError(403, "Path not allowed");
    }

    /**
     * metadata path가 실제 해당 report 경로에 속하는지 한 번 더 검증한다.
     *
     * Production preflight:
     * - path_missing_own_report_id = 0
     * - cross_report_shared_path_count = 0
     */
    if (!isOwnedReportPath(path, reportId)) {
      return jsonError(403, "Path not allowed");
    }

    const { data, error: sErr } =
      await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(
          path,
          SIGNED_URL_EXPIRES_IN
        );

    if (sErr) {
      return jsonError(500, sErr.message);
    }

    return NextResponse.json({
      ok: true,
      url: data?.signedUrl,
    });
  } catch (e: any) {
    return jsonError(
      500,
      e?.message ?? "Server error"
    );
  }
}