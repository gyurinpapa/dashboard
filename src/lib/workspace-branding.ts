import type { SupabaseClient } from "@supabase/supabase-js";

type TenantType = "agency" | "advertiser" | null;

type WorkspaceSeedRow = {
  id?: string | null;
  name?: string | null;
  workspace_type?: string | null;
  workspace_kind?: string | null;
  tenant_id?: string | null;
};

type TenantRow = {
  id?: string | null;
  name?: string | null;
  tenant_type?: string | null;
  status?: string | null;
};

type BrandingWorkspaceRow = WorkspaceSeedRow & {
  logo_storage_bucket?: string | null;
  logo_storage_path?: string | null;
  logo_updated_at?: string | null;
};

export type WorkspaceBrandingInfo = {
  workspaceId: string;
  workspaceName: string | null;
  workspaceType: string | null;
  workspaceKind: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantType: TenantType;
  tenantStatus: string | null;
  agencyBrandingEnabled: boolean;
  brandingWorkspaceId: string | null;
  brandingWorkspaceName: string | null;
  workspaceLogoUrl: string | null;
  logoStorageBucket: string | null;
  logoStoragePath: string | null;
  logoUpdatedAt: string | null;
};

export type AgencyBrandingTargetResult =
  | {
      ok: true;
      workspace: Required<Pick<WorkspaceBrandingInfo, "workspaceId">> & {
        workspaceName: string | null;
        workspaceType: string | null;
        workspaceKind: string | null;
        tenantId: string;
      };
      tenant: {
        id: string;
        name: string | null;
        tenantType: "agency";
        status: "active";
      };
      brandingWorkspace: {
        id: string;
        name: string | null;
        logoStorageBucket: string | null;
        logoStoragePath: string | null;
        logoUpdatedAt: string | null;
      };
    }
  | {
      ok: false;
      reason:
        | "WORKSPACE_NOT_FOUND"
        | "TENANT_NOT_FOUND"
        | "AGENCY_BRANDING_NOT_AVAILABLE"
        | "AGENCY_BRANDING_TENANT_INACTIVE"
        | "AGENCY_BRANDING_WORKSPACE_AMBIGUOUS";
    };

function asString(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function asNullableString(value: unknown) {
  return asString(value) || null;
}

function normalizeTenantType(value: unknown): TenantType {
  const normalized = asString(value).toLowerCase();

  if (normalized === "agency") return "agency";
  if (normalized === "advertiser") return "advertiser";

  return null;
}

function buildPublicStorageUrl(
  supabase: SupabaseClient,
  bucketValue: unknown,
  pathValue: unknown,
) {
  const bucket = asString(bucketValue);
  const path = asString(pathValue);

  if (!bucket || !path) {
    return null;
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return asNullableString(data?.publicUrl);
}

function uniqueIds(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map(asString)
        .filter(Boolean),
    ),
  );
}

export async function resolveWorkspaceBrandingMap(
  supabase: SupabaseClient,
  workspaceRows: WorkspaceSeedRow[],
): Promise<Map<string, WorkspaceBrandingInfo>> {
  const normalizedWorkspaces = workspaceRows
    .map((row) => ({
      id: asString(row?.id),
      name: asNullableString(row?.name),
      workspaceType: asNullableString(row?.workspace_type),
      workspaceKind: asNullableString(row?.workspace_kind),
      tenantId: asNullableString(row?.tenant_id),
    }))
    .filter((row) => row.id);

  const tenantIds = uniqueIds(
    normalizedWorkspaces.map((row) => row.tenantId),
  );

  const tenantMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      tenantType: TenantType;
      status: string | null;
    }
  >();

  if (tenantIds.length > 0) {
    const { data: tenantRows, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, tenant_type, status")
      .in("id", tenantIds);

    if (tenantError) {
      console.warn("[workspace-branding] failed to load tenants", {
        detail: tenantError.message,
      });
    } else {
      for (const row of (tenantRows ?? []) as TenantRow[]) {
        const id = asString(row?.id);

        if (!id) continue;

        tenantMap.set(id, {
          id,
          name: asNullableString(row?.name),
          tenantType: normalizeTenantType(row?.tenant_type),
          status: asNullableString(row?.status),
        });
      }
    }
  }

  const agencyTenantIds = uniqueIds(
    Array.from(tenantMap.values())
      .filter(
        (tenant) =>
          tenant.tenantType === "agency" &&
          tenant.status === "active",
      )
      .map((tenant) => tenant.id),
  );

  const companyWorkspaceRowsByTenant = new Map<
    string,
    BrandingWorkspaceRow[]
  >();

  if (agencyTenantIds.length > 0) {
    const { data: brandingRows, error: brandingError } = await supabase
      .from("workspaces")
      .select(
        [
          "id",
          "name",
          "workspace_type",
          "workspace_kind",
          "tenant_id",
          "logo_storage_bucket",
          "logo_storage_path",
          "logo_updated_at",
        ].join(", "),
      )
      .in("tenant_id", agencyTenantIds)
      .eq("workspace_type", "company");

    if (brandingError) {
      console.warn(
        "[workspace-branding] failed to load agency branding workspaces",
        {
          detail: brandingError.message,
        },
      );
    } else {
      for (const row of (brandingRows ?? []) as BrandingWorkspaceRow[]) {
        const tenantId = asString(row?.tenant_id);

        if (!tenantId) continue;

        const existing = companyWorkspaceRowsByTenant.get(tenantId) ?? [];
        existing.push(row);
        companyWorkspaceRowsByTenant.set(tenantId, existing);
      }
    }
  }

  const result = new Map<string, WorkspaceBrandingInfo>();

  for (const workspace of normalizedWorkspaces) {
    const tenant = workspace.tenantId
      ? tenantMap.get(workspace.tenantId) ?? null
      : null;

    const companyRows =
      tenant?.tenantType === "agency" &&
      tenant.status === "active"
        ? companyWorkspaceRowsByTenant.get(tenant.id) ?? []
        : [];

    const brandingWorkspace =
      companyRows.length === 1
        ? companyRows[0]
        : null;

    const agencyBrandingEnabled = Boolean(
      tenant?.tenantType === "agency" &&
        tenant.status === "active" &&
        brandingWorkspace,
    );

    const logoStorageBucket = agencyBrandingEnabled
      ? asNullableString(
          brandingWorkspace?.logo_storage_bucket,
        )
      : null;

    const logoStoragePath = agencyBrandingEnabled
      ? asNullableString(
          brandingWorkspace?.logo_storage_path,
        )
      : null;

    result.set(workspace.id, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceType: workspace.workspaceType,
      workspaceKind: workspace.workspaceKind,
      tenantId: workspace.tenantId,
      tenantName: tenant?.name ?? null,
      tenantType: tenant?.tenantType ?? null,
      tenantStatus: tenant?.status ?? null,
      agencyBrandingEnabled,
      brandingWorkspaceId: agencyBrandingEnabled
        ? asNullableString(brandingWorkspace?.id)
        : null,
      brandingWorkspaceName: agencyBrandingEnabled
        ? asNullableString(brandingWorkspace?.name)
        : null,
      workspaceLogoUrl: agencyBrandingEnabled
        ? buildPublicStorageUrl(
            supabase,
            logoStorageBucket,
            logoStoragePath,
          )
        : null,
      logoStorageBucket,
      logoStoragePath,
      logoUpdatedAt: agencyBrandingEnabled
        ? asNullableString(
            brandingWorkspace?.logo_updated_at,
          )
        : null,
    });
  }

  return result;
}

export async function loadWorkspaceBrandingMap(
  supabase: SupabaseClient,
  workspaceIds: string[],
) {
  const ids = uniqueIds(workspaceIds);

  if (ids.length === 0) {
    return new Map<string, WorkspaceBrandingInfo>();
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select(
      [
        "id",
        "name",
        "workspace_type",
        "workspace_kind",
        "tenant_id",
      ].join(", "),
    )
    .in("id", ids);

  if (error || !data) {
    if (error) {
      console.warn(
        "[workspace-branding] failed to load workspaces",
        {
          detail: error.message,
        },
      );
    }

    return new Map<string, WorkspaceBrandingInfo>();
  }

  return await resolveWorkspaceBrandingMap(
    supabase,
    data as WorkspaceSeedRow[],
  );
}

export async function loadWorkspaceBrandingInfo(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const id = asString(workspaceId);

  if (!id) return null;

  const map = await loadWorkspaceBrandingMap(
    supabase,
    [id],
  );

  return map.get(id) ?? null;
}

export async function resolveAgencyBrandingTarget(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<AgencyBrandingTargetResult> {
  const id = asString(workspaceId);

  if (!id) {
    return {
      ok: false,
      reason: "WORKSPACE_NOT_FOUND",
    };
  }

  const { data: workspaceData, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, workspace_type, workspace_kind, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (workspaceError) {
    throw new Error(
      `FAILED_TO_FETCH_WORKSPACE:${workspaceError.message}`,
    );
  }

  if (!workspaceData) {
    return {
      ok: false,
      reason: "WORKSPACE_NOT_FOUND",
    };
  }

  const tenantId = asString((workspaceData as any)?.tenant_id);

  if (!tenantId) {
    return {
      ok: false,
      reason: "TENANT_NOT_FOUND",
    };
  }

  const { data: tenantData, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, tenant_type, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError) {
    throw new Error(
      `FAILED_TO_FETCH_TENANT:${tenantError.message}`,
    );
  }

  if (!tenantData) {
    return {
      ok: false,
      reason: "TENANT_NOT_FOUND",
    };
  }

  const tenantType = normalizeTenantType(
    (tenantData as any)?.tenant_type,
  );

  if (tenantType !== "agency") {
    return {
      ok: false,
      reason: "AGENCY_BRANDING_NOT_AVAILABLE",
    };
  }

  const tenantStatus = asString(
    (tenantData as any)?.status,
  ).toLowerCase();

  if (tenantStatus !== "active") {
    return {
      ok: false,
      reason: "AGENCY_BRANDING_TENANT_INACTIVE",
    };
  }

  const { data: brandingRows, error: brandingError } = await supabase
    .from("workspaces")
    .select(
      [
        "id",
        "name",
        "tenant_id",
        "workspace_type",
        "workspace_kind",
        "logo_storage_bucket",
        "logo_storage_path",
        "logo_updated_at",
      ].join(", "),
    )
    .eq("tenant_id", tenantId)
    .eq("workspace_type", "company")
    .limit(2);

  if (brandingError) {
    throw new Error(
      `FAILED_TO_FETCH_AGENCY_BRANDING_WORKSPACE:${brandingError.message}`,
    );
  }

  const rows = (brandingRows ?? []) as BrandingWorkspaceRow[];

  if (rows.length !== 1) {
    return {
      ok: false,
      reason: "AGENCY_BRANDING_WORKSPACE_AMBIGUOUS",
    };
  }

  const brandingWorkspace = rows[0];
  const brandingWorkspaceId = asString(
    brandingWorkspace?.id,
  );

  if (!brandingWorkspaceId) {
    return {
      ok: false,
      reason: "AGENCY_BRANDING_WORKSPACE_AMBIGUOUS",
    };
  }

  return {
    ok: true,
    workspace: {
      workspaceId: id,
      workspaceName: asNullableString(
        (workspaceData as any)?.name,
      ),
      workspaceType: asNullableString(
        (workspaceData as any)?.workspace_type,
      ),
      workspaceKind: asNullableString(
        (workspaceData as any)?.workspace_kind,
      ),
      tenantId,
    },
    tenant: {
      id: tenantId,
      name: asNullableString(
        (tenantData as any)?.name,
      ),
      tenantType: "agency",
      status: "active",
    },
    brandingWorkspace: {
      id: brandingWorkspaceId,
      name: asNullableString(
        brandingWorkspace?.name,
      ),
      logoStorageBucket: asNullableString(
        brandingWorkspace?.logo_storage_bucket,
      ),
      logoStoragePath: asNullableString(
        brandingWorkspace?.logo_storage_path,
      ),
      logoUpdatedAt: asNullableString(
        brandingWorkspace?.logo_updated_at,
      ),
    },
  };
}
