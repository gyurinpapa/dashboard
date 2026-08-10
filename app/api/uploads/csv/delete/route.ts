// app/api/uploads/csv/delete/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    { status }
  );
}

/**
 * Legacy CSV single-delete endpoint.
 *
 * 현재 애플리케이션에는 이 route를 호출하는 tracked caller가 없으며,
 * CSV 업로드/metadata의 현재 계약은 /api/uploads/csv에서 관리한다.
 *
 * 과거 구현은 public request의 bucket/path를 받아 service-role Storage
 * mutation을 수행하고 meta.upload.csv만 갱신했기 때문에:
 *
 * - caller-controlled bucket mutation
 * - meta.csv_uploads와 meta.upload.csv 간 불일치
 * - Storage delete 성공 후 DB update 실패 시 rollback 불가
 *
 * 위험이 존재했다.
 *
 * 현재 UI 동작에 영향을 주지 않으면서 해당 legacy mutation surface를
 * 완전히 폐쇄하기 위해 fail-closed 응답만 반환한다.
 */
export async function POST(_req: Request) {
  return jsonError(
    410,
    "CSV_DELETE_LEGACY_ENDPOINT_DISABLED"
  );
}