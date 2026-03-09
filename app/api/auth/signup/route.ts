// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignupType = "internal" | "client";
type SafeRole = "staff" | "client";

type SignupBody = {
  full_name?: string;
  email?: string;
  password?: string;
  passwordConfirm?: string;
  signup_type?: SignupType;
  division?: string;
  department?: string;
  team?: string;
};

type WorkspaceRow = {
  id: string;
  name?: string | null;
  workspace_type?: string | null;
  workspace_kind?: string | null;
  company_id?: string | null;
};

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status }
  );
}

function asString(v: unknown) {
  if (v == null) return "";
  return String(v).trim();
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_ENV_MISSING");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeSignupType(v: string): SignupType | "" {
  if (v === "internal") return "internal";
  if (v === "client") return "client";
  return "";
}

function safeRoleFromSignupType(signupType: SignupType): SafeRole {
  return signupType === "client" ? "client" : "staff";
}

function normalizeOrg(
  signupType: SignupType,
  divisionRaw: string,
  departmentRaw: string,
  teamRaw: string
) {
  if (signupType === "client") {
    return {
      division: "외부",
      department: "광고주",
      team: "광고주",
    };
  }

  return {
    division: divisionRaw,
    department: departmentRaw,
    team: teamRaw,
  };
}

function looksLikeDuplicateEmail(message: string) {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("already") ||
    msg.includes("exists") ||
    msg.includes("duplicate") ||
    msg.includes("registered")
  );
}

async function resolveCompanyId(admin: any) {
  const envCompanyId = asString(process.env.COMPANY_ID);
  if (envCompanyId) {
    return envCompanyId;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("company_id")
    .not("company_id", "is", null)
    .limit(1);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{ company_id: string | null }>;
  return asString(rows[0]?.company_id);
}

async function resolveCompanyWorkspace(admin: any, companyId: string) {
  const EINVENTION_WORKSPACE_ID = "27b1556f-9d42-496f-bd7e-5a59ebee71d4";

  const { data, error } = await admin
    .from("workspaces")
    .select("id,name,workspace_type,workspace_kind,company_id")
    .eq("id", EINVENTION_WORKSPACE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`COMPANY_WORKSPACE_LOOKUP_FAILED:${error.message}`);
  }

  const row = (data ?? null) as WorkspaceRow | null;

  if (!row?.id) {
    throw new Error("COMPANY_WORKSPACE_NOT_FOUND");
  }

  if (asString(row.name) !== "Einvention") {
    throw new Error("COMPANY_WORKSPACE_NOT_FOUND");
  }

  return {
    workspaceId: row.id,
    workspaceName: asString(row.name),
  };
}

  // 1) 가장 우선: 회사명 Einvention workspace 찾기
  const { data: byName, error: byNameError } = await admin
    .from("workspaces")
    .select("id,name,workspace_type,workspace_kind,company_id")
    .eq("company_id", companyId)
    .eq("name", "Einvention")
    .limit(1);

  if (byNameError) {
    throw new Error(`COMPANY_WORKSPACE_LOOKUP_FAILED:${byNameError.message}`);
  }

  const nameRows = (byName ?? []) as WorkspaceRow[];
  if (nameRows[0]?.id) {
    return {
      workspaceId: nameRows[0].id,
      workspaceName: asString(nameRows[0].name),
    };
  }

  // 2) fallback: company/company_workspace 계열 workspace 찾기
  const { data: byType, error: byTypeError } = await admin
    .from("workspaces")
    .select("id,name,workspace_type,workspace_kind,company_id")
    .eq("company_id", companyId)
    .or("workspace_type.eq.company,workspace_type.eq.company_workspace,workspace_kind.eq.company,workspace_kind.eq.company_workspace")
    .limit(10);

  if (byTypeError) {
    throw new Error(`COMPANY_WORKSPACE_LOOKUP_FAILED:${byTypeError.message}`);
  }

  const typeRows = (byType ?? []) as WorkspaceRow[];
  const validCompanyWorkspace = typeRows.find(
    (row) => asString(row.name) !== "Test - Legacy"
  );

  if (validCompanyWorkspace?.id) {
    return {
      workspaceId: validCompanyWorkspace.id,
      workspaceName: asString(validCompanyWorkspace.name),
    };
  }

  // 3) 마지막 fallback: 미분류 workspace
  const { data: fallbackRows, error: fallbackError } = await admin
    .from("workspaces")
    .select("id,name,workspace_type,workspace_kind,company_id")
    .eq("company_id", companyId)
    .eq("name", "미분류")
    .limit(1);

  if (fallbackError) {
    throw new Error(`COMPANY_WORKSPACE_LOOKUP_FAILED:${fallbackError.message}`);
  }

  const uncategorizedRows = (fallbackRows ?? []) as WorkspaceRow[];
  if (uncategorizedRows[0]?.id) {
    return {
      workspaceId: uncategorizedRows[0].id,
      workspaceName: asString(uncategorizedRows[0].name),
    };
  }

  throw new Error("COMPANY_WORKSPACE_NOT_FOUND");
}

export async function POST(req: Request) {
  let createdUserId: string | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as SignupBody;

    const fullName = asString(body.full_name);
    const email = asString(body.email).toLowerCase();
    const password = asString(body.password);
    const passwordConfirm = asString(body.passwordConfirm);
    const signupType = normalizeSignupType(asString(body.signup_type));

    if (!fullName) {
      return jsonError(400, "FULL_NAME_REQUIRED");
    }

    if (!email) {
      return jsonError(400, "EMAIL_REQUIRED");
    }

    if (!password) {
      return jsonError(400, "PASSWORD_REQUIRED");
    }

    if (password.length < 6) {
      return jsonError(400, "PASSWORD_TOO_SHORT");
    }

    if (password !== passwordConfirm) {
      return jsonError(400, "PASSWORD_CONFIRM_MISMATCH");
    }

    if (!signupType) {
      return jsonError(400, "SIGNUP_TYPE_REQUIRED");
    }

    const org = normalizeOrg(
      signupType,
      asString(body.division),
      asString(body.department),
      asString(body.team)
    );

    if (!org.division) {
      return jsonError(400, "DIVISION_REQUIRED");
    }

    if (!org.department) {
      return jsonError(400, "DEPARTMENT_REQUIRED");
    }

    if (!org.team) {
      return jsonError(400, "TEAM_REQUIRED");
    }

    const admin = getAdminClient();

    const companyId = await resolveCompanyId(admin);
    if (!companyId) {
      return jsonError(500, "COMPANY_ID_MISSING", {
        detail:
          "profiles.company_id에서 기존 회사 값을 찾지 못했습니다. COMPANY_ID 환경변수를 설정하거나 기존 profiles 데이터를 확인하세요.",
      });
    }

    const { workspaceId: companyWorkspaceId, workspaceName: companyWorkspaceName } =
      await resolveCompanyWorkspace(admin, companyId);

    if (!companyWorkspaceId) {
      return jsonError(500, "COMPANY_WORKSPACE_ID_MISSING", {
        detail: "Einvention 기본 workspace를 찾지 못했습니다.",
      });
    }

    const { data: createdUser, error: createUserError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          signup_type: signupType,
        },
      });

    if (createUserError) {
      const rawMessage = String(createUserError.message || "");

      console.error("[signup] auth.admin.createUser failed", {
        email,
        message: rawMessage,
        status: (createUserError as any)?.status ?? null,
        code: (createUserError as any)?.code ?? null,
      });

      if (looksLikeDuplicateEmail(rawMessage)) {
        return jsonError(409, "EMAIL_ALREADY_EXISTS", {
          detail: rawMessage,
        });
      }

      return jsonError(500, "AUTH_USER_CREATE_FAILED", {
        detail: rawMessage,
      });
    }

    const userId = createdUser.user?.id;
    if (!userId) {
      return jsonError(500, "AUTH_USER_CREATE_FAILED", {
        detail: "user id missing after createUser",
      });
    }

    createdUserId = userId;

    const now = new Date().toISOString();

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        company_id: companyId,
        name: fullName,
        email,
        updated_at: now,
      },
      {
        onConflict: "id",
      }
    );

    if (profileError) {
      console.error("[signup] profiles upsert failed", {
        email,
        userId,
        company_id: companyId,
        name: fullName,
        message: profileError.message,
        details: (profileError as any)?.details ?? null,
        hint: (profileError as any)?.hint ?? null,
        code: (profileError as any)?.code ?? null,
      });

      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {}

      return jsonError(500, "PROFILE_UPSERT_FAILED", {
        detail: profileError.message,
      });
    }

    const role = safeRoleFromSignupType(signupType);

    const { error: memberError } = await admin
      .from("workspace_members")
      .insert({
        workspace_id: companyWorkspaceId,
        user_id: userId,
        role,
        division: org.division,
        department: org.department,
        team: org.team,
      });

    if (memberError) {
      console.error("[signup] workspace_members insert failed", {
        email,
        userId,
        companyWorkspaceId,
        companyWorkspaceName,
        companyId,
        role,
        division: org.division,
        department: org.department,
        team: org.team,
        message: memberError.message,
        details: (memberError as any)?.details ?? null,
        hint: (memberError as any)?.hint ?? null,
        code: (memberError as any)?.code ?? null,
      });

      try {
        await admin.from("profiles").delete().eq("id", userId);
      } catch {}

      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {}

      return jsonError(500, "WORKSPACE_MEMBER_CREATE_FAILED", {
        detail: memberError.message,
      });
    }

    return NextResponse.json({
      ok: true,
      user_id: userId,
      company_id: companyId,
      workspace_id: companyWorkspaceId,
      workspace_name: companyWorkspaceName,
      role,
      name: fullName,
      email,
      division: org.division,
      department: org.department,
      team: org.team,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);

    console.error("[signup] route failed", err);

    if (createdUserId) {
      try {
        const admin = getAdminClient();

        try {
          await admin.from("profiles").delete().eq("id", createdUserId);
        } catch {}

        try {
          await admin.auth.admin.deleteUser(createdUserId);
        } catch {}
      } catch {
        // rollback best-effort
      }
    }

    if (msg === "SUPABASE_ENV_MISSING") {
      return jsonError(500, "SUPABASE_ENV_MISSING", {
        detail: "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.",
      });
    }

    if (msg === "COMPANY_WORKSPACE_NOT_FOUND") {
      return jsonError(500, "COMPANY_WORKSPACE_NOT_FOUND", {
        detail:
          "Einvention 기본 workspace(또는 미분류 fallback)를 찾지 못했습니다. workspaces 테이블 데이터를 확인하세요.",
      });
    }

    if (String(msg).startsWith("COMPANY_WORKSPACE_LOOKUP_FAILED:")) {
      return jsonError(500, "COMPANY_WORKSPACE_LOOKUP_FAILED", {
        detail: String(msg).replace("COMPANY_WORKSPACE_LOOKUP_FAILED:", ""),
      });
    }

    if (String(msg).startsWith("COMPANY_ID_LOOKUP_FAILED:")) {
      return jsonError(500, "COMPANY_ID_LOOKUP_FAILED", {
        detail: String(msg).replace("COMPANY_ID_LOOKUP_FAILED:", ""),
      });
    }

    return jsonError(500, "INTERNAL_SERVER_ERROR", {
      detail: msg,
    });
  }
}