// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_CANONICAL_HOST = "app.etrylue.com";

const NON_CANONICAL_APP_HOSTS = new Set([
  "etrylue.com",
  "www.etrylue.com",
]);

function isCanonicalAppPath(pathname: string): boolean {
  return (
    pathname === "/report-builder" ||
    pathname.startsWith("/report-builder/") ||
    pathname === "/reports" ||
    pathname.startsWith("/reports/")
  );
}

function getRequestHostname(req: NextRequest): string {
  const rawHost =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.hostname;

  const firstHost =
    rawHost.split(",")[0]?.trim().toLowerCase() ?? "";

  return firstHost
    .replace(/:\d+$/u, "")
    .replace(/\.$/u, "");
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const requestHostname =
    getRequestHostname(req);

  if (
    NON_CANONICAL_APP_HOSTS.has(requestHostname) &&
    isCanonicalAppPath(pathname)
  ) {
    const url = req.nextUrl.clone();

    url.protocol = "https:";
    url.hostname = APP_CANONICAL_HOST;
    url.port = "";

    return NextResponse.redirect(url, 307);
  }

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