import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "report_uploads"; // ✅ 사용 중인 storage bucket명으로 맞추기

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function getUserFromReq(req: Request) {
  const admin = getSupabaseAdmin();

  // 1) Bearer 우선
  const token = getBearerToken(req);
  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user) return { user: data.user, error: null };
  }

  // 2) fallback: 쿠키 세션(sbAuth)
  const { user, error } = await sbAuth();
  return { user: user ?? null, error: error ?? null };
}

async function assertWorkspaceMember(workspace_id: string, user_id: string) {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) return { ok: false, status: 500 as const, error: error.message };
  if (!data) return { ok: false, status: 403 as const, error: "FORBIDDEN" };

  return { ok: true as const, role: data.role };
}

// ✅ “폴더 생성” 효과: 폴더 아래에 placeholder 파일 1개 업로드
async function ensureAdvertiserFolder(workspace_id: string, advertiser_id: string) {
  const admin = getSupabaseAdmin();

  // 원하는 폴더 구조는 여기서 결정
  // 예) workspaces/<ws>/advertisers/<adv>/
  const dir = `workspaces/${workspace_id}/advertisers/${advertiser_id}`;
  const placeholderPath = `${dir}/.keep`;

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(placeholderPath, Buffer.from(""), {
      contentType: "application/octet-stream",
      upsert: true, // ✅ 이미 있어도 OK (idempotent)
    });

  if (error) {
    // 폴더 생성 실패는 치명적일 수도/아닐 수도 -> 여기선 에러로 처리
    throw new Error(`STORAGE_FOLDER_CREATE_FAILED: ${error.message}`);
  }

  return { dir, placeholderPath, bucket: BUCKET };
}

export async function POST(req: Request) {
  try {
    const { user, error: authErr } = await getUserFromReq(req);
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const workspace_id = asString(body.workspace_id);
    const name = asString(body.name);

    if (!workspace_id) {
      return NextResponse.json({ ok: false, error: "workspace_id is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    // ✅ 권한: workspace 멤버인지 확인
    const mem = await assertWorkspaceMember(workspace_id, user.id);
    if (!mem.ok) {
      return NextResponse.json({ ok: false, error: mem.error }, { status: mem.status });
    }

    const admin = getSupabaseAdmin();

    // ✅ insert로 중복은 unique constraint(workspace_id,name)에서 막히도록
    const { data, error } = await admin
      .from("advertisers")
      .insert({ workspace_id, name, created_by: user.id })
      .select("id, workspace_id, name")
      .single();

    if (error) {
      const code = (error as any)?.code;
      if (code === "23505") {
        return NextResponse.json({ ok: false, error: "광고주 중복" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // ✅ 광고주 생성 성공 → storage “폴더” 자동 생성
    const folder = await ensureAdvertiserFolder(workspace_id, data.id);

    return NextResponse.json({
      ok: true,
      advertiser: data,
      storage_folder: folder, // dir / placeholderPath / bucket 반환
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}