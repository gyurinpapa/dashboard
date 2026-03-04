// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // always allow
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/report-builder") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // protect /reports/*
  if (pathname.startsWith("/reports")) {
    const hasAuthCookie = req.cookies.getAll().some((c) => {
      const n = c.name || "";
      return n.startsWith("sb-") && n.endsWith("-auth-token") && !!c.value;
    });

    if (!hasAuthCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/report-builder";
      url.search = `?next=${pathname}${search}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};