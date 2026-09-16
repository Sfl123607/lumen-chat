import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const GUEST_COOKIE = "chat_guest_id";
const PUBLIC_PATHS = ["/login", "/signup"];

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Rejects cross-site state-changing API calls (defence in depth on top of SameSite cookies). */
function isCrossSiteMutation(req: NextRequest): boolean {
  if (!req.nextUrl.pathname.startsWith("/api/")) return false;
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  // Compare against the host the request was actually sent to (respecting reverse proxies).
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() !== host;
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isCrossSiteMutation(req)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Cross-site request blocked." } }, { status: 403 });
  }

  // ── Demo mode: identify the visitor with an httpOnly guest cookie ──
  if (!supabaseConfigured()) {
    if (PUBLIC_PATHS.includes(pathname)) return NextResponse.redirect(new URL("/", req.url));
    const res = NextResponse.next();
    if (!req.cookies.get(GUEST_COOKIE)) {
      res.cookies.set(GUEST_COOKIE, crypto.randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  }

  // ── Supabase mode: refresh the session cookie and protect routes ──
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of cookiesToSet) res.cookies.set(name, value, options);
      },
    },
  });

  // getUser() validates the token with Supabase; never trust the cookie alone.
  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!user) {
    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/status") return res;
      return NextResponse.json({ error: { code: "unauthorized", message: "Please sign in." } }, { status: 401 });
    }
    if (!isPublic) {
      const login = new URL("/login", req.url);
      if (pathname !== "/") login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return res;
  }

  if (isPublic) return NextResponse.redirect(new URL("/", req.url));
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
