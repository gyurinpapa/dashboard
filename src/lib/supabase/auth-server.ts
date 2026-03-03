// src/lib/supabase/auth-server.ts
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

type AuthOk = {
  ok: true;
  user: { id: string; email?: string | null };
  accessToken: string;
};
type AuthFail = { ok: false; error: string };
export type SbAuthResult = AuthOk | AuthFail;

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function extractBearer(h: Headers) {
  const authHeader =
    h.get("authorization") ||
    h.get("Authorization") ||
    null;

  if (!authHeader) return null;

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim();
  }

  return null;
}

function extractCookieToken(cookieStr: string | null): string | null {
  if (!cookieStr) return null;

  const parts = cookieStr.split(";").map((s) => s.trim());

  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;

    const k = p.slice(0, eq);
    const vraw = p.slice(eq + 1);

    if (!k.includes("auth-token")) continue;

    try {
      const decoded = decodeURIComponent(vraw);
      const v = JSON.parse(decoded);

      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
      if (v?.access_token) return v.access_token;
      if (v?.currentSession?.access_token) return v.currentSession.access_token;
    } catch {
      // ignore
    }
  }

  return null;
}

export async function sbAuth(): Promise<SbAuthResult> {
  try {
    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const anon = envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    // ✅ Next 15: 반드시 await
    const h = await headers();
    const ck = await cookies();

    let token: string | null = null;

    // 1️⃣ Bearer 우선
    token = extractBearer(h);

    // 2️⃣ cookie fallback
    if (!token) {
      const rawCookie = h.get("cookie");
      token = extractCookieToken(rawCookie);
    }

    // 3️⃣ sb-access-token fallback
    if (!token) {
      token = ck.get("sb-access-token")?.value || null;
    }

    if (!token) {
      return { ok: false, error: "Unauthorized" };
    }

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user?.id) {
      return { ok: false, error: "Unauthorized" };
    }

    return {
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      accessToken: token,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Auth error" };
  }
}