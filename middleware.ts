import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 항상 허용
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/report-builder") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // reports는 로그인 필요
  if (pathname.startsWith("/reports")) {
    const hasSession =
      req.cookies.get("sb-access-token") ||
      req.cookies.get("supabase-auth-token");

    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/report-builder";
      url.search = `?next=${pathname}${search}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};