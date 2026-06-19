// app/api/workspaces/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemberRole =
  | "master"
  | "director"
  | "admin"
  | "staff"
  | "client"
  | null;

type WorkspaceLogoFields = {
  logo_storage_bucket?: string | null;
  logo_storage_path?: string | null;
  logo_updated_at?: string | null;
};

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function jsonError(
  status: number,
  message: string,
  extra?: Record<string, any>
) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status }
  );
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
}

function normalizeRole(v: any): MemberRole {
  const s = asString(v).toLowerCase();

  if (
    s === "master" ||
    s === "director" ||
    s === "admin" ||
    s === "staff" ||
    s === "client"
  ) {
    return s;
  }

  return null;
}

function getBearerToken(req: Request) {
  const h =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  const m = h.match(/^Bearer\s+(.+)$/i);

  return m?.[1]?.trim() ?? null;
}

function buildWorkspaceLogoUrl(
  bucketValue: any,
  pathValue: any
) {
  const bucket = asString(bucketValue);
  const path = asString(pathValue);

  if (!bucket || !path) {
    return null;
  }

  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(path);

  return asString(data?.publicUrl) || null;
}

function toWorkspaceLogoPayload(
  row: WorkspaceLogoFields
) {
  const logoStorageBucket =
    asString(row?.logo_storage_bucket) || null;

  const logoStoragePath =
    asString(row?.logo_storage_path) || null;

  const logoUpdatedAt =
    asString(row?.logo_updated_at) || null;

  return {
    workspace_logo_url: buildWorkspaceLogoUrl(
      logoStorageBucket,
      logoStoragePath
    ),
    logo_storage_bucket: logoStorageBucket,
    logo_storage_path: logoStoragePath,
    logo_updated_at: logoUpdatedAt,
  };
}

async function getActor(req: Request) {
  const bearer = getBearerToken(req);

  if (bearer) {
    const { data, error } =
      await supabaseAdmin.auth.getUser(bearer);

    if (!error && data?.user) {
      return {
        user: data.user,
        error: null as string | null,
      };
    }
  }

  const { user, error } = await sbAuth();

  if (error || !user) {
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

async function getWorkspaceInfoByIds(
  workspaceIds: string[]
) {
  const ids = Array.from(
    new Set(
      workspaceIds
        .map(asString)
        .filter(Boolean)
    )
  );

  const workspaceMap = new Map<
    string,
    {
      name: string;
      logo_storage_bucket: string | null;
      logo_storage_path: string | null;
      logo_updated_at: string | null;
    }
  >();

  if (!ids.length) {
    return workspaceMap;
  }

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select(
      [
        "id",
        "name",
        "logo_storage_bucket",
        "logo_storage_path",
        "logo_updated_at",
      ].join(", ")
    )
    .in("id", ids);

  if (error || !data) {
    return workspaceMap;
  }

  for (const row of data as any[]) {
    const id = asString(row?.id);

    if (!id) continue;

    workspaceMap.set(id, {
      name: asString(row?.name),
      logo_storage_bucket:
        asString(row?.logo_storage_bucket) || null,
      logo_storage_path:
        asString(row?.logo_storage_path) || null,
      logo_updated_at:
        asString(row?.logo_updated_at) || null,
    });
  }

  return workspaceMap;
}

async function getProfileEmailByUserId(
  userId: string
) {
  const id = asString(userId);

  if (!id) return "";

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `FAILED_TO_FETCH_PROFILE_EMAIL:${error.message}`
    );
  }

  return normalizeEmail(data?.email);
}

async function hasMasterMembership(
  userId: string
) {
  const id = asString(userId);

  if (!id) return false;

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", id)
    .eq("role", "master")
    .limit(1);

  if (error) {
    throw new Error(
      `FAILED_TO_FETCH_MASTER_MEMBERSHIP:${error.message}`
    );
  }

  return (
    Array.isArray(data) &&
    data.length > 0
  );
}

async function isTrueMasterUser(
  userId: string
) {
  const email =
    await getProfileEmailByUserId(userId);

  if (email !== ONLY_MASTER_EMAIL) {
    return false;
  }

  return await hasMasterMembership(userId);
}

export async function GET(req: Request) {
  try {
    const actorResult = await getActor(req);

    if (!actorResult.user) {
      return jsonError(
        401,
        actorResult.error || "UNAUTHORIZED"
      );
    }

    const userId = asString(
      actorResult.user.id
    );

    if (!userId) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const actorIsPlatformOwner =
      await isPlatformOwner(userId);

    const actorIsTrueMaster =
      await isTrueMasterUser(userId);

    /**
     * true master는 전체 workspace 조회 가능.
     * platform_owner 단독으로는 전체 권한을 주지 않는다.
     */
    if (actorIsTrueMaster) {
      const {
        data: workspaces,
        error,
      } = await supabaseAdmin
        .from("workspaces")
        .select(
          [
            "id",
            "name",
            "created_at",
            "logo_storage_bucket",
            "logo_storage_path",
            "logo_updated_at",
          ].join(", ")
        )
        .order("name", {
          ascending: true,
        });

      if (error) {
        return jsonError(
          500,
          "FAILED_TO_FETCH_WORKSPACES",
          {
            detail: error.message,
          }
        );
      }

      const rows = (workspaces ?? [])
        .filter(
          (w: any) =>
            asString(w?.id)
        )
        .map((w: any) => ({
          workspace_id: asString(w?.id),
          workspace_name:
            asString(w?.name) || null,

          role: "master" as const,

          division: null,
          department: null,
          team: null,

          platform_role: actorIsPlatformOwner
            ? ("platform_owner" as const)
            : null,

          ...toWorkspaceLogoPayload(w),
        }));

      return NextResponse.json({
        ok: true,
        platform_role: actorIsPlatformOwner
          ? "platform_owner"
          : null,
        is_true_master: true,
        can_view_all_workspaces: true,
        workspaces: rows,
      });
    }

    /**
     * 일반 사용자는 본인 membership 기반만 반환.
     */
    const {
      data: memberships,
      error: memberErr,
    } = await supabaseAdmin
      .from("workspace_members")
      .select(
        [
          "workspace_id",
          "role",
          "division",
          "department",
          "team",
          "created_at",
        ].join(", ")
      )
      .eq("user_id", userId)
      .order("created_at", {
        ascending: true,
      });

    if (memberErr) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_WORKSPACE_MEMBERSHIPS",
        {
          detail: memberErr.message,
        }
      );
    }

    const membershipRows =
      Array.isArray(memberships)
        ? memberships
        : [];

    const workspaceIds =
      membershipRows
        .map((m: any) =>
          asString(m?.workspace_id)
        )
        .filter(Boolean);

    const workspaceInfoById =
      await getWorkspaceInfoByIds(
        workspaceIds
      );

    const rows = membershipRows
      .filter(
        (m: any) =>
          asString(m?.workspace_id)
      )
      .map((m: any) => {
        const workspaceId =
          asString(m?.workspace_id);

        const workspaceInfo =
          workspaceInfoById.get(workspaceId);

        return {
          workspace_id: workspaceId,

          workspace_name:
            workspaceInfo?.name || null,

          role: normalizeRole(
            m?.role
          ),

          division:
            m?.division ?? null,

          department:
            m?.department ?? null,

          team:
            m?.team ?? null,

          platform_role: null,

          ...toWorkspaceLogoPayload({
            logo_storage_bucket:
              workspaceInfo?.logo_storage_bucket ?? null,
            logo_storage_path:
              workspaceInfo?.logo_storage_path ?? null,
            logo_updated_at:
              workspaceInfo?.logo_updated_at ?? null,
          }),
        };
      });

    return NextResponse.json({
      ok: true,
      platform_role: null,
      is_true_master: false,
      can_view_all_workspaces: false,
      workspaces: rows,
    });
  } catch (e: any) {
    const msg = e?.message ?? "";

    if (
      String(msg).startsWith(
        "FAILED_TO_FETCH_PROFILE_EMAIL:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_PROFILE_EMAIL",
        {
          detail: String(msg).replace(
            "FAILED_TO_FETCH_PROFILE_EMAIL:",
            ""
          ),
        }
      );
    }

    if (
      String(msg).startsWith(
        "FAILED_TO_FETCH_MASTER_MEMBERSHIP:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_MASTER_MEMBERSHIP",
        {
          detail: String(msg).replace(
            "FAILED_TO_FETCH_MASTER_MEMBERSHIP:",
            ""
          ),
        }
      );
    }

    return jsonError(
      500,
      "INTERNAL_SERVER_ERROR",
      {
        detail:
          e?.message ?? null,
      }
    );
  }
}
