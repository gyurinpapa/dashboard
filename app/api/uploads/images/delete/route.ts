// app/api/uploads/images/delete/route.ts
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
 * Legacy image single-delete endpoint.
 *
 * 현재 tracked application caller가 없으며,
 * 과거 구현은 caller-controlled bucket/path를 받아
 * service-role Storage mutation을 수행했다.
 *
 * 현재 UI 동작에 영향을 주지 않으면서
 * legacy mutation surface를 완전히 폐쇄한다.
 */
export async function POST(_req: Request) {
  return jsonError(
    410,
    "IMAGE_DELETE_LEGACY_ENDPOINT_DISABLED"
  );
}