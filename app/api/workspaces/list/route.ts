// app/api/workspaces/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";
import {
  loadWorkspaceBrandingMap,
  resolveWorkspaceBrandingMap,
  type WorkspaceBrandingInfo,
} from "@/src/lib/workspace-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemberRole =
  | "master"
  | "director"
  | "admin"
  | "staff"
  | "client"
  | null;

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

function toWorkspaceBrandingPayload(
  branding?: WorkspaceBrandingInfo
) {
  return {
    tenant_id: branding?.tenantId ?? null,
    tenant_name: branding?.tenantName ?? null,
    tenant_type: branding?.tenantType ?? null,
    tenant_status: branding?.tenantStatus ?? null,
    workspace_type: branding?.workspaceType ?? null,
    workspace_kind: branding?.workspaceKind ?? null,
    agency_branding_enabled:
      branding?.agencyBrandingEnabled ?? false,
    branding_workspace_id:
      branding?.brandingWorkspaceId ?? null,
    branding_workspace_name:
      branding?.brandingWorkspaceName ?? null,
    workspace_logo_url:
      branding?.workspaceLogoUrl ?? null,
    logo_storage_bucket:
      branding?.logoStorageBucket ?? null,
    logo_storage_path:
      branding?.logoStoragePath ?? null,
    logo_updated_at:
      branding?.logoUpdatedAt ?? null,
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
            "workspace_type",
            "workspace_kind",
            "tenant_id",
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

      const brandingByWorkspaceId =
        await resolveWorkspaceBrandingMap(
          supabaseAdmin,
          (workspaces ?? []) as any[]
        );

      const rows = (workspaces ?? [])
        .filter(
          (w: any) =>
            asString(w?.id)
        )
        .map((w: any) => {
          const workspaceId = asString(w?.id);
          const branding =
            brandingByWorkspaceId.get(workspaceId);

          return {
            workspace_id: workspaceId,
            workspace_name:
              asString(w?.name) || null,

            role: "master" as const,

            division: null,
            department: null,
            team: null,

            platform_role: actorIsPlatformOwner
              ? ("platform_owner" as const)
              : null,

            ...toWorkspaceBrandingPayload(
              branding
            ),
          };
        });

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

    const brandingByWorkspaceId =
      await loadWorkspaceBrandingMap(
        supabaseAdmin,
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

        const branding =
          brandingByWorkspaceId.get(workspaceId);

        return {
          workspace_id: workspaceId,

          workspace_name:
            branding?.workspaceName || null,

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

          ...toWorkspaceBrandingPayload(
            branding
          ),
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
