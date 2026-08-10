// app/api/uploads/images/route.ts
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
 * Legacy image-upload endpoint.
 *
 * 현재 tracked application caller가 없으며,
 * 실제 creative upload 흐름은
 * /api/reports/[id]/assets/creatives/upload 경로를 사용한다.
 *
 * 과거 구현은 service-role Storage upload 후
 * reports.meta.upload.images를 갱신하는 legacy mutation surface였다.
 *
 * 기존 legacy image metadata의 조회 호환성은 유지하되,
 * 신규 legacy upload mutation은 fail-closed로 폐쇄한다.
 */
export async function POST(_req: Request) {
  return jsonError(
    410,
    "IMAGE_UPLOAD_LEGACY_ENDPOINT_DISABLED"
  );
}