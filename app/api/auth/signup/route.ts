// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Direct public signup is intentionally disabled.
 *
 * Workspace membership must only be provisioned through the existing
 * workspace invite flow:
 *
 *   /invite/[token]
 *   -> /api/workspace-invites/register
 *
 * This endpoint is retained as a fail-closed compatibility boundary so
 * legacy callers cannot create Auth users, profiles, or workspace members.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "DIRECT_SIGNUP_DISABLED",
      detail: "회원가입은 초대 링크를 통해서만 가능합니다.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
