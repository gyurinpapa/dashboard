// app/api/report-types/list/route.ts

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(
  status: number,
  message: string,
  extra?: Record<string, any>
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(extra ?? {}),
    },
    { status }
  );
}

function getBearerToken(req: Request) {
  const authz =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  const match = authz.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function getActor(req: Request) {
  const bearer = getBearerToken(req);

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);

    if (!error && data?.user?.id) {
      return {
        user: data.user,
        error: null as string | null,
      };
    }
  }

  const { user, error } = await sbAuth();

  if (error || !user?.id) {
    return {
      user: null,
      error: "UNAUTHORIZED",
    };
  }

  return {
    user,
    error: null as string | null,
  };
}

export async function GET(req: Request) {
  try {
    const actor = await getActor(req);

    if (!actor.user?.id) {
      return jsonError(401, actor.error || "UNAUTHORIZED");
    }

    const { data, error } = await supabaseAdmin
      .from("report_types")
      .select("id,key,name")
      .order("name", { ascending: true });

    if (error) {
      return jsonError(500, "FAILED_TO_FETCH_REPORT_TYPES", {
        detail: error.message,
      });
    }

    const reportTypes = Array.isArray(data) ? data : [];

    return NextResponse.json({
      ok: true,
      count: reportTypes.length,
      report_types: reportTypes,
    });
  } catch (error: any) {
    return jsonError(500, "FAILED_TO_FETCH_REPORT_TYPES", {
      detail: error?.message ?? String(error),
    });
  }
}
