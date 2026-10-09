import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie → send to the login page. The real
// check (is the session valid, can this user see this farm?) happens on the
// server in getContext()/authorize() for every page, action and API route.

const SESSION_COOKIE = "agriflow_session";
const PUBLIC_PATHS = ["/login", "/signup", "/join"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: API routes answer 401 themselves; skip Next.js assets and files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
