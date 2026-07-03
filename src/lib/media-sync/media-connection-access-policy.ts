export const ONLY_TRUE_MASTER_EMAIL =
  "gyurinpapakimdh@gmail.com";

export const MEDIA_CONNECTION_WORKSPACE_ROLES = [
  "master",
  "director",
  "admin",
  "staff",
  "client",
] as const;

export type MediaConnectionWorkspaceRole =
  (typeof MEDIA_CONNECTION_WORKSPACE_ROLES)[number];

export type MediaConnectionAccessAction =
  | "view_connections"
  | "manage_connections"
  | "run_sync";

export type MediaConnectionAccessScope =
  | "true_master"
  | "workspace"
  | "own_created";

export type MediaConnectionPermissionFlags = {
  canViewConnections: boolean;
  canManageConnections: boolean;
  canRunSync: boolean;
  accessScope: MediaConnectionAccessScope;
};

export type MediaConnectionActionDenialCode =
  | "CONNECTION_VIEW_ACCESS_DENIED"
  | "CONNECTION_MANAGE_ACCESS_DENIED"
  | "MEDIA_SYNC_ACCESS_DENIED";

export type MediaConnectionReportScopeMismatch =
  | "REPORT_ADVERTISER_MISMATCH"
  | "REPORT_WORKSPACE_MISMATCH";

export type ResolveTrueMasterStatusInput = {
  email: string;
  hasMasterMembership: boolean;

  /**
   * Intentionally ignored as an authorization source.
   *
   * This value exists only so fixture tests can explicitly prove that
   * platform_owner status alone never grants true-master privileges.
   */
  isPlatformOwner?: boolean;
};

export type ResolveMediaConnectionPermissionsInput = {
  role: MediaConnectionWorkspaceRole;
  isTrueMaster: boolean;
  isOwnAdvertiser: boolean;
};

export type ResolveReportAdvertiserScopeInput = {
  reportAdvertiserId: string;
  reportWorkspaceId: string;
  advertiserId: string;
  advertiserWorkspaceId: string;
};

function normalizePolicyEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isMediaConnectionWorkspaceRole(
  value: unknown,
): value is MediaConnectionWorkspaceRole {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();

  return MEDIA_CONNECTION_WORKSPACE_ROLES.includes(
    normalizedValue as MediaConnectionWorkspaceRole,
  );
}

export function resolveTrueMasterStatus(
  input: ResolveTrueMasterStatusInput,
): boolean {
  const email = normalizePolicyEmail(input.email);

  return (
    email === ONLY_TRUE_MASTER_EMAIL &&
    input.hasMasterMembership
  );
}

export function resolveMediaConnectionPermissions(
  input: ResolveMediaConnectionPermissionsInput,
): MediaConnectionPermissionFlags {
  if (input.isTrueMaster) {
    return {
      canViewConnections: true,
      canManageConnections: true,
      canRunSync: true,
      accessScope: "true_master",
    };
  }

  if (
    input.role === "director" ||
    input.role === "admin"
  ) {
    return {
      canViewConnections: true,
      canManageConnections: true,
      canRunSync: true,
      accessScope: "workspace",
    };
  }

  if (
    input.role === "staff" &&
    input.isOwnAdvertiser
  ) {
    return {
      canViewConnections: true,
      canManageConnections: false,
      canRunSync: true,
      accessScope: "own_created",
    };
  }

  return {
    canViewConnections: false,
    canManageConnections: false,
    canRunSync: false,
    accessScope: "workspace",
  };
}

export function getMediaConnectionActionDenialCode(
  action: MediaConnectionAccessAction,
  permissions: MediaConnectionPermissionFlags,
): MediaConnectionActionDenialCode | null {
  if (
    action === "view_connections" &&
    !permissions.canViewConnections
  ) {
    return "CONNECTION_VIEW_ACCESS_DENIED";
  }

  if (
    action === "manage_connections" &&
    !permissions.canManageConnections
  ) {
    return "CONNECTION_MANAGE_ACCESS_DENIED";
  }

  if (
    action === "run_sync" &&
    !permissions.canRunSync
  ) {
    return "MEDIA_SYNC_ACCESS_DENIED";
  }

  return null;
}

export function getReportAdvertiserScopeMismatch(
  input: ResolveReportAdvertiserScopeInput,
): MediaConnectionReportScopeMismatch | null {
  if (input.advertiserId !== input.reportAdvertiserId) {
    return "REPORT_ADVERTISER_MISMATCH";
  }

  if (
    input.advertiserWorkspaceId !==
    input.reportWorkspaceId
  ) {
    return "REPORT_WORKSPACE_MISMATCH";
  }

  return null;
}