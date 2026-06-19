// app/api/workspaces/[id]/logo/route.ts
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemberRole =
  | "master"
  | "director"
  | "admin"
  | "staff"
  | "client"
  | null;

type WorkspaceLogoRow = {
  id: string;
  name: string | null;
  logo_storage_bucket: string | null;
  logo_storage_path: string | null;
  logo_updated_at: string | null;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";
const LOGO_BUCKET = "workspace_logos";
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

const ALLOWED_MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
}

function normalizeRole(v: any): MemberRole {
  const value = asString(v).toLowerCase();

  if (
    value === "master" ||
    value === "director" ||
    value === "admin" ||
    value === "staff" ||
    value === "client"
  ) {
    return value;
  }

  return null;
}

function getBearerToken(req: Request) {
  const header =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  const match = header.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() ?? null;
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

async function getProfileEmail(
  userId: string,
  authEmail?: string | null
) {
  const normalizedAuthEmail =
    normalizeEmail(authEmail);

  if (normalizedAuthEmail) {
    return normalizedAuthEmail;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `FAILED_TO_FETCH_PROFILE:${error.message}`
    );
  }

  return normalizeEmail(data?.email);
}

async function getMembership(
  workspaceId: string,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `FAILED_TO_FETCH_MEMBERSHIP:${error.message}`
    );
  }

  return data
    ? {
        workspace_id: asString(data.workspace_id),
        user_id: asString(data.user_id),
        role: normalizeRole(data.role),
      }
    : null;
}

function canManageWorkspaceLogo(
  role: MemberRole,
  email: string
) {
  if (role === "director") {
    return true;
  }

  return (
    role === "master" &&
    email === ONLY_MASTER_EMAIL
  );
}

function buildPublicUrl(
  bucket: string,
  path: string
) {
  if (!bucket || !path) {
    return null;
  }

  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(path);

  return asString(data?.publicUrl) || null;
}

function sanitizeExtension(
  fileName: string,
  fallbackExtension: string
) {
  const match =
    fileName.toLowerCase().match(/\.([a-z0-9]+)$/);

  const candidate = match?.[1] ?? "";

  if (
    candidate === "png" ||
    candidate === "jpg" ||
    candidate === "jpeg" ||
    candidate === "webp"
  ) {
    return candidate === "jpeg"
      ? "jpg"
      : candidate;
  }

  return fallbackExtension;
}

async function getWorkspaceLogoRow(
  workspaceId: string
): Promise<WorkspaceLogoRow | null> {
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `FAILED_TO_FETCH_WORKSPACE:${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  return data as unknown as WorkspaceLogoRow;
}

async function authorizeLogoMutation(
  req: Request,
  workspaceId: string
) {
  const actorResult = await getActor(req);

  if (!actorResult.user) {
    return {
      ok: false as const,
      response: jsonError(
        401,
        actorResult.error || "UNAUTHORIZED"
      ),
    };
  }

  const userId = asString(
    actorResult.user.id
  );

  if (!userId) {
    return {
      ok: false as const,
      response: jsonError(
        401,
        "UNAUTHORIZED"
      ),
    };
  }

  const membership =
    await getMembership(
      workspaceId,
      userId
    );

  if (!membership) {
    return {
      ok: false as const,
      response: jsonError(
        403,
        "WORKSPACE_ACCESS_DENIED"
      ),
    };
  }

  const email =
    await getProfileEmail(
      userId,
      actorResult.user.email
    );

  if (
    !canManageWorkspaceLogo(
      membership.role,
      email
    )
  ) {
    return {
      ok: false as const,
      response: jsonError(
        403,
        "WORKSPACE_LOGO_PERMISSION_DENIED"
      ),
    };
  }

  return {
    ok: true as const,
    userId,
    email,
    membership,
  };
}

export async function POST(
  req: Request,
  context: RouteContext
) {
  let uploadedPath = "";

  try {
    const { id } = await context.params;
    const workspaceId = asString(id);

    if (!workspaceId) {
      return jsonError(
        400,
        "WORKSPACE_ID_REQUIRED"
      );
    }

    const authorization =
      await authorizeLogoMutation(
        req,
        workspaceId
      );

    if (!authorization.ok) {
      return authorization.response;
    }

    const workspace =
      await getWorkspaceLogoRow(
        workspaceId
      );

    if (!workspace) {
      return jsonError(
        404,
        "WORKSPACE_NOT_FOUND"
      );
    }

    const formData =
      await req.formData();

    const fileValue =
      formData.get("file");

    if (!(fileValue instanceof File)) {
      return jsonError(
        400,
        "LOGO_FILE_REQUIRED"
      );
    }

    if (fileValue.size <= 0) {
      return jsonError(
        400,
        "EMPTY_LOGO_FILE"
      );
    }

    if (fileValue.size > MAX_LOGO_BYTES) {
      return jsonError(
        413,
        "LOGO_FILE_TOO_LARGE",
        {
          max_bytes: MAX_LOGO_BYTES,
        }
      );
    }

    const mimeType =
      asString(fileValue.type).toLowerCase();

    const fallbackExtension =
      ALLOWED_MIME_TO_EXTENSION[mimeType];

    if (!fallbackExtension) {
      return jsonError(
        415,
        "UNSUPPORTED_LOGO_FILE_TYPE",
        {
          allowed_mime_types:
            Object.keys(
              ALLOWED_MIME_TO_EXTENSION
            ),
        }
      );
    }

    const extension =
      sanitizeExtension(
        fileValue.name,
        fallbackExtension
      );

    const expectedExtensions =
      mimeType === "image/jpeg"
        ? new Set(["jpg"])
        : new Set([fallbackExtension]);

    if (!expectedExtensions.has(extension)) {
      return jsonError(
        415,
        "LOGO_EXTENSION_MIME_MISMATCH"
      );
    }

    const fileBuffer =
      Buffer.from(
        await fileValue.arrayBuffer()
      );

    if (
      fileBuffer.length <= 0 ||
      fileBuffer.length !== fileValue.size
    ) {
      return jsonError(
        400,
        "INVALID_LOGO_FILE"
      );
    }

    uploadedPath = [
      "workspaces",
      workspaceId,
      "branding",
      "logo",
      `${Date.now()}_${randomUUID()}.${extension}`,
    ].join("/");

    const {
      error: uploadError,
    } = await supabaseAdmin.storage
      .from(LOGO_BUCKET)
      .upload(
        uploadedPath,
        fileBuffer,
        {
          contentType: mimeType,
          cacheControl: "31536000",
          upsert: false,
        }
      );

    if (uploadError) {
      return jsonError(
        500,
        "FAILED_TO_UPLOAD_WORKSPACE_LOGO",
        {
          detail:
            uploadError.message,
        }
      );
    }

    const previousBucket =
      asString(
        workspace.logo_storage_bucket
      );

    const previousPath =
      asString(
        workspace.logo_storage_path
      );

    const updatedAt =
      new Date().toISOString();

    const {
      data: updatedWorkspaceData,
      error: updateError,
    } = await supabaseAdmin
      .from("workspaces")
      .update({
        logo_storage_bucket:
          LOGO_BUCKET,
        logo_storage_path:
          uploadedPath,
        logo_updated_at:
          updatedAt,
      } as any)
      .eq("id", workspaceId)
      .select("*")
      .single();

    if (updateError) {
      await supabaseAdmin.storage
        .from(LOGO_BUCKET)
        .remove([uploadedPath]);

      return jsonError(
        500,
        "FAILED_TO_SAVE_WORKSPACE_LOGO",
        {
          detail:
            updateError.message,
        }
      );
    }

    if (!updatedWorkspaceData) {
      await supabaseAdmin.storage
        .from(LOGO_BUCKET)
        .remove([uploadedPath]);

      return jsonError(
        500,
        "FAILED_TO_SAVE_WORKSPACE_LOGO",
        {
          detail:
            "UPDATED_WORKSPACE_NOT_RETURNED",
        }
      );
    }

    const updatedWorkspace =
      updatedWorkspaceData as unknown as WorkspaceLogoRow;

    uploadedPath = "";

    if (
      previousBucket &&
      previousPath &&
      !(
        previousBucket ===
          LOGO_BUCKET &&
        previousPath ===
          updatedWorkspace.logo_storage_path
      )
    ) {
      const {
        error: removeOldError,
      } = await supabaseAdmin.storage
        .from(previousBucket)
        .remove([previousPath]);

      if (removeOldError) {
        console.warn(
          "[workspace-logo] failed to remove previous logo",
          {
            workspaceId,
            previousBucket,
            previousPath,
            detail:
              removeOldError.message,
          }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      workspace: {
        workspace_id:
          asString(
            updatedWorkspace.id
          ),
        workspace_name:
          asString(
            updatedWorkspace.name
          ) || null,
        workspace_logo_url:
          buildPublicUrl(
            asString(
              updatedWorkspace
                .logo_storage_bucket
            ),
            asString(
              updatedWorkspace
                .logo_storage_path
            )
          ),
        logo_storage_bucket:
          asString(
            updatedWorkspace
              .logo_storage_bucket
          ) || null,
        logo_storage_path:
          asString(
            updatedWorkspace
              .logo_storage_path
          ) || null,
        logo_updated_at:
          asString(
            updatedWorkspace
              .logo_updated_at
          ) || null,
      },
    });
  } catch (e: any) {
    if (uploadedPath) {
      await supabaseAdmin.storage
        .from(LOGO_BUCKET)
        .remove([uploadedPath]);
    }

    const message =
      asString(e?.message);

    if (
      message.startsWith(
        "FAILED_TO_FETCH_PROFILE:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_PROFILE",
        {
          detail: message.replace(
            "FAILED_TO_FETCH_PROFILE:",
            ""
          ),
        }
      );
    }

    if (
      message.startsWith(
        "FAILED_TO_FETCH_MEMBERSHIP:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_MEMBERSHIP",
        {
          detail: message.replace(
            "FAILED_TO_FETCH_MEMBERSHIP:",
            ""
          ),
        }
      );
    }

    if (
      message.startsWith(
        "FAILED_TO_FETCH_WORKSPACE:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_WORKSPACE",
        {
          detail: message.replace(
            "FAILED_TO_FETCH_WORKSPACE:",
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
          message || null,
      }
    );
  }
}

export async function DELETE(
  req: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspaceId = asString(id);

    if (!workspaceId) {
      return jsonError(
        400,
        "WORKSPACE_ID_REQUIRED"
      );
    }

    const authorization =
      await authorizeLogoMutation(
        req,
        workspaceId
      );

    if (!authorization.ok) {
      return authorization.response;
    }

    const workspace =
      await getWorkspaceLogoRow(
        workspaceId
      );

    if (!workspace) {
      return jsonError(
        404,
        "WORKSPACE_NOT_FOUND"
      );
    }

    const previousBucket =
      asString(
        workspace.logo_storage_bucket
      );

    const previousPath =
      asString(
        workspace.logo_storage_path
      );

    const deletedAt =
      new Date().toISOString();

    const {
      error: updateError,
    } = await supabaseAdmin
      .from("workspaces")
      .update({
        logo_storage_bucket: null,
        logo_storage_path: null,
        logo_updated_at:
          deletedAt,
      } as any)
      .eq("id", workspaceId);

    if (updateError) {
      return jsonError(
        500,
        "FAILED_TO_CLEAR_WORKSPACE_LOGO",
        {
          detail:
            updateError.message,
        }
      );
    }

    if (
      previousBucket &&
      previousPath
    ) {
      const {
        error: removeError,
      } = await supabaseAdmin.storage
        .from(previousBucket)
        .remove([previousPath]);

      if (removeError) {
        console.warn(
          "[workspace-logo] failed to remove logo object",
          {
            workspaceId,
            previousBucket,
            previousPath,
            detail:
              removeError.message,
          }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      workspace: {
        workspace_id:
          workspaceId,
        workspace_name:
          asString(
            workspace.name
          ) || null,
        workspace_logo_url:
          null,
        logo_storage_bucket:
          null,
        logo_storage_path:
          null,
        logo_updated_at:
          deletedAt,
      },
    });
  } catch (e: any) {
    const message =
      asString(e?.message);

    if (
      message.startsWith(
        "FAILED_TO_FETCH_PROFILE:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_PROFILE",
        {
          detail: message.replace(
            "FAILED_TO_FETCH_PROFILE:",
            ""
          ),
        }
      );
    }

    if (
      message.startsWith(
        "FAILED_TO_FETCH_MEMBERSHIP:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_MEMBERSHIP",
        {
          detail: message.replace(
            "FAILED_TO_FETCH_MEMBERSHIP:",
            ""
          ),
        }
      );
    }

    if (
      message.startsWith(
        "FAILED_TO_FETCH_WORKSPACE:"
      )
    ) {
      return jsonError(
        500,
        "FAILED_TO_FETCH_WORKSPACE",
        {
          detail: message.replace(
            "FAILED_TO_FETCH_WORKSPACE:",
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
          message || null,
      }
    );
  }
}
