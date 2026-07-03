import type { User } from "@supabase/supabase-js";

import { supabaseAdmin } from "../supabase/admin";
import { sbAuth } from "../supabase/auth-server";
import {
  getMediaConnectionActionDenialCode,
  getReportAdvertiserScopeMismatch,
  isMediaConnectionWorkspaceRole,
  ONLY_TRUE_MASTER_EMAIL,
  resolveMediaConnectionPermissions,
  resolveTrueMasterStatus,
  type MediaConnectionAccessAction,
  type MediaConnectionAccessScope,
  type MediaConnectionPermissionFlags,
  type MediaConnectionWorkspaceRole,
} from "./media-connection-access-policy";

export {
  ONLY_TRUE_MASTER_EMAIL,
  getMediaConnectionActionDenialCode,
  getReportAdvertiserScopeMismatch,
  isMediaConnectionWorkspaceRole,
  resolveMediaConnectionPermissions,
  resolveTrueMasterStatus,
};

export type {
  MediaConnectionAccessAction,
  MediaConnectionAccessScope,
  MediaConnectionPermissionFlags,
  MediaConnectionWorkspaceRole,
};

export type MediaConnectionAccessContext = {
  userId: string;
  email: string;

  workspaceId: string;
  advertiserId: string;
  advertiserCreatedBy: string | null;

  role: MediaConnectionWorkspaceRole;
  isTrueMaster: boolean;

  accessScope: MediaConnectionAccessScope;

  canViewConnections: boolean;
  canManageConnections: boolean;
  canRunSync: boolean;
};

export type MediaConnectionReportAccessContext =
  MediaConnectionAccessContext & {
    reportId: string;
  };

export type ResolveAdvertiserMediaAccessInput = {
  request: Request;
  advertiserId: string;
  action: MediaConnectionAccessAction;
};

export type ResolveReportMediaAccessInput = {
  request: Request;
  reportId: string;
  action: MediaConnectionAccessAction;
};

export type MediaConnectionAccessErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_INPUT"
  | "PROFILE_LOOKUP_FAILED"
  | "MASTER_MEMBERSHIP_LOOKUP_FAILED"
  | "ADVERTISER_LOOKUP_FAILED"
  | "ADVERTISER_NOT_FOUND"
  | "REPORT_LOOKUP_FAILED"
  | "REPORT_NOT_FOUND"
  | "REPORT_ADVERTISER_MISSING"
  | "REPORT_WORKSPACE_MISSING"
  | "REPORT_ADVERTISER_MISMATCH"
  | "REPORT_WORKSPACE_MISMATCH"
  | "MEMBERSHIP_LOOKUP_FAILED"
  | "WORKSPACE_ACCESS_DENIED"
  | "CONNECTION_VIEW_ACCESS_DENIED"
  | "CONNECTION_MANAGE_ACCESS_DENIED"
  | "MEDIA_SYNC_ACCESS_DENIED";

export class MediaConnectionAccessError extends Error {
  readonly code: MediaConnectionAccessErrorCode;
  readonly status: number;

  constructor(
    code: MediaConnectionAccessErrorCode,
    status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaConnectionAccessError";
    this.code = code;
    this.status = status;
  }
}

type AdvertiserAccessRecord = {
  id: string;
  workspace_id: string;
  created_by: string | null;
};

type ReportAccessRecord = {
  id: string;
  workspace_id: string;
  advertiser_id: string;
};

type WorkspaceMembershipRecord = {
  workspace_id: string;
  user_id: string;
  role: MediaConnectionWorkspaceRole;
};

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new MediaConnectionAccessError(
      "INVALID_INPUT",
      400,
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaConnectionAccessError(
      "INVALID_INPUT",
      400,
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaConnectionAccessError(
      "INVALID_INPUT",
      400,
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeNullableString(
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = String(value).trim();

  return normalizedValue || null;
}

function normalizeWorkspaceRole(
  value: unknown,
): MediaConnectionWorkspaceRole {
  const normalizedRole = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!isMediaConnectionWorkspaceRole(normalizedRole)) {
    throw new MediaConnectionAccessError(
      "WORKSPACE_ACCESS_DENIED",
      403,
      "Workspace membership contains an unsupported role.",
    );
  }

  return normalizedRole;
}

function getBearerToken(request: Request): string | null {
  const authorization =
    request.headers.get("authorization") ??
    request.headers.get("Authorization") ??
    "";

  const matched = authorization.match(/^Bearer\s+(.+)$/i);

  return matched?.[1]?.trim() || null;
}

async function getAuthenticatedUser(
  request: Request,
): Promise<User> {
  const bearerToken = getBearerToken(request);

  if (bearerToken) {
    const { data, error } =
      await supabaseAdmin.auth.getUser(bearerToken);

    if (!error && data?.user) {
      return data.user;
    }
  }

  const authResult = await sbAuth();
  const user = authResult?.user ?? null;
  const authError = authResult?.error ?? null;

  if (authError || !user) {
    throw new MediaConnectionAccessError(
      "UNAUTHORIZED",
      401,
      "Authentication is required.",
    );
  }

  return user;
}

async function getProfileEmail(
  userId: string,
  authEmail: string | undefined,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new MediaConnectionAccessError(
      "PROFILE_LOOKUP_FAILED",
      500,
      "User profile email could not be loaded.",
      { cause: error },
    );
  }

  const profileEmail = normalizeEmail(data?.email);

  if (profileEmail) {
    return profileEmail;
  }

  return normalizeEmail(authEmail);
}

async function hasMasterMembership(
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("role", "master")
    .limit(1);

  if (error) {
    throw new MediaConnectionAccessError(
      "MASTER_MEMBERSHIP_LOOKUP_FAILED",
      500,
      "Master membership could not be verified.",
      { cause: error },
    );
  }

  return Array.isArray(data) && data.length > 0;
}

async function resolveTrueMaster(
  userId: string,
  email: string,
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail !== ONLY_TRUE_MASTER_EMAIL) {
    return false;
  }

  const masterMembershipExists =
    await hasMasterMembership(userId);

  return resolveTrueMasterStatus({
    email: normalizedEmail,
    hasMasterMembership: masterMembershipExists,
  });
}

async function getAdvertiserRecord(
  advertiserId: string,
): Promise<AdvertiserAccessRecord> {
  const { data, error } = await supabaseAdmin
    .from("advertisers")
    .select("id, workspace_id, created_by")
    .eq("id", advertiserId)
    .maybeSingle();

  if (error) {
    throw new MediaConnectionAccessError(
      "ADVERTISER_LOOKUP_FAILED",
      500,
      "Advertiser could not be loaded.",
      { cause: error },
    );
  }

  if (!data) {
    throw new MediaConnectionAccessError(
      "ADVERTISER_NOT_FOUND",
      404,
      "Advertiser was not found.",
    );
  }

  const id = normalizeRequiredString(
    data.id,
    "advertiser.id",
  );

  const workspaceId = normalizeRequiredString(
    data.workspace_id,
    "advertiser.workspace_id",
  );

  if (id !== advertiserId) {
    throw new MediaConnectionAccessError(
      "ADVERTISER_NOT_FOUND",
      404,
      "Advertiser was not found.",
    );
  }

  return {
    id,
    workspace_id: workspaceId,
    created_by: normalizeNullableString(data.created_by),
  };
}

async function getReportRecord(
  reportId: string,
): Promise<ReportAccessRecord> {
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("id, workspace_id, advertiser_id")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    throw new MediaConnectionAccessError(
      "REPORT_LOOKUP_FAILED",
      500,
      "Report could not be loaded.",
      { cause: error },
    );
  }

  if (!data) {
    throw new MediaConnectionAccessError(
      "REPORT_NOT_FOUND",
      404,
      "Report was not found.",
    );
  }

  const id = normalizeRequiredString(
    data.id,
    "report.id",
  );

  if (id !== reportId) {
    throw new MediaConnectionAccessError(
      "REPORT_NOT_FOUND",
      404,
      "Report was not found.",
    );
  }

  if (!data.workspace_id) {
    throw new MediaConnectionAccessError(
      "REPORT_WORKSPACE_MISSING",
      500,
      "Report workspace is missing.",
    );
  }

  if (!data.advertiser_id) {
    throw new MediaConnectionAccessError(
      "REPORT_ADVERTISER_MISSING",
      400,
      "Report does not have an advertiser.",
    );
  }

  return {
    id,
    workspace_id: normalizeRequiredString(
      data.workspace_id,
      "report.workspace_id",
    ),
    advertiser_id: normalizeRequiredString(
      data.advertiser_id,
      "report.advertiser_id",
    ),
  };
}

async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembershipRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new MediaConnectionAccessError(
      "MEMBERSHIP_LOOKUP_FAILED",
      500,
      "Workspace membership could not be loaded.",
      { cause: error },
    );
  }

  if (!data) {
    return null;
  }

  const resolvedWorkspaceId = normalizeRequiredString(
    data.workspace_id,
    "membership.workspace_id",
  );

  const resolvedUserId = normalizeRequiredString(
    data.user_id,
    "membership.user_id",
  );

  if (
    resolvedWorkspaceId !== workspaceId ||
    resolvedUserId !== userId
  ) {
    throw new MediaConnectionAccessError(
      "WORKSPACE_ACCESS_DENIED",
      403,
      "Workspace membership does not match the requested scope.",
    );
  }

  return {
    workspace_id: resolvedWorkspaceId,
    user_id: resolvedUserId,
    role: normalizeWorkspaceRole(data.role),
  };
}

function getActionDenialMessage(
  code:
    | "CONNECTION_VIEW_ACCESS_DENIED"
    | "CONNECTION_MANAGE_ACCESS_DENIED"
    | "MEDIA_SYNC_ACCESS_DENIED",
): string {
  if (code === "CONNECTION_VIEW_ACCESS_DENIED") {
    return "You do not have permission to view media connections for this advertiser.";
  }

  if (code === "CONNECTION_MANAGE_ACCESS_DENIED") {
    return "You do not have permission to manage media connections for this advertiser.";
  }

  return "You do not have permission to synchronize media data for this advertiser.";
}

function assertRequestedAction(
  action: MediaConnectionAccessAction,
  permissions: MediaConnectionPermissionFlags,
): void {
  const denialCode =
    getMediaConnectionActionDenialCode(
      action,
      permissions,
    );

  if (!denialCode) {
    return;
  }

  throw new MediaConnectionAccessError(
    denialCode,
    403,
    getActionDenialMessage(denialCode),
  );
}

async function buildAdvertiserAccessContext(input: {
  request: Request;
  advertiser: AdvertiserAccessRecord;
  action: MediaConnectionAccessAction;
}): Promise<MediaConnectionAccessContext> {
  const user = await getAuthenticatedUser(input.request);

  const userId = normalizeRequiredString(
    user.id,
    "user.id",
  );

  const email = await getProfileEmail(
    userId,
    user.email,
  );

  const isTrueMaster = await resolveTrueMaster(
    userId,
    email,
  );

  let role: MediaConnectionWorkspaceRole = "master";

  if (!isTrueMaster) {
    const membership = await getWorkspaceMembership(
      userId,
      input.advertiser.workspace_id,
    );

    if (!membership) {
      throw new MediaConnectionAccessError(
        "WORKSPACE_ACCESS_DENIED",
        403,
        "You are not a member of the advertiser workspace.",
      );
    }

    role = membership.role;
  }

  const isOwnAdvertiser =
    input.advertiser.created_by === userId;

  const permissionFlags =
    resolveMediaConnectionPermissions({
      role,
      isTrueMaster,
      isOwnAdvertiser,
    });

  const context: MediaConnectionAccessContext = {
    userId,
    email,

    workspaceId: input.advertiser.workspace_id,
    advertiserId: input.advertiser.id,
    advertiserCreatedBy:
      input.advertiser.created_by,

    role,
    isTrueMaster,

    accessScope: permissionFlags.accessScope,

    canViewConnections:
      permissionFlags.canViewConnections,
    canManageConnections:
      permissionFlags.canManageConnections,
    canRunSync: permissionFlags.canRunSync,
  };

  assertRequestedAction(
    input.action,
    permissionFlags,
  );

  return context;
}

export async function resolveAdvertiserMediaConnectionAccess(
  input: ResolveAdvertiserMediaAccessInput,
): Promise<MediaConnectionAccessContext> {
  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
  );

  const advertiser =
    await getAdvertiserRecord(advertiserId);

  return buildAdvertiserAccessContext({
    request: input.request,
    advertiser,
    action: input.action,
  });
}

export async function resolveReportMediaConnectionAccess(
  input: ResolveReportMediaAccessInput,
): Promise<MediaConnectionReportAccessContext> {
  const reportId = normalizeRequiredString(
    input.reportId,
    "reportId",
  );

  const report = await getReportRecord(reportId);

  const advertiser = await getAdvertiserRecord(
    report.advertiser_id,
  );

  const reportScopeMismatch =
    getReportAdvertiserScopeMismatch({
      reportAdvertiserId: report.advertiser_id,
      reportWorkspaceId: report.workspace_id,
      advertiserId: advertiser.id,
      advertiserWorkspaceId:
        advertiser.workspace_id,
    });

  if (
    reportScopeMismatch ===
    "REPORT_ADVERTISER_MISMATCH"
  ) {
    throw new MediaConnectionAccessError(
      "REPORT_ADVERTISER_MISMATCH",
      403,
      "Report and advertiser do not match.",
    );
  }

  if (
    reportScopeMismatch ===
    "REPORT_WORKSPACE_MISMATCH"
  ) {
    throw new MediaConnectionAccessError(
      "REPORT_WORKSPACE_MISMATCH",
      403,
      "Report and advertiser belong to different workspaces.",
    );
  }

  const accessContext =
    await buildAdvertiserAccessContext({
      request: input.request,
      advertiser,
      action: input.action,
    });

  return {
    ...accessContext,
    reportId: report.id,
  };
}