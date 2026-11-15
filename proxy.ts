import { NextResponse, type NextRequest } from "next/server";

// Page access by role, checked on the server before a page renders. The backend checks every API call again,
// so this only decides which screens a person sees.
//   asha        → household sessions, visits, quiz builder, profile
//   supervisor  → dashboard
//   signed out  → home, learning library, published quizzes (household learners never sign in)

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
type Role = "asha" | "supervisor";

const RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/session", roles: ["asha"] },
  { prefix: "/agent-session", roles: ["asha"] },
  { prefix: "/quiz-builder", roles: ["asha"] },
  { prefix: "/visits", roles: ["asha"] },
  { prefix: "/profile", roles: ["asha"] },
  { prefix: "/certificate", roles: ["asha"] },
  { prefix: "/dashboard", roles: ["supervisor"] },
  { prefix: "/settings", roles: ["asha", "supervisor"] },
];

const HOME: Record<Role, string> = { asha: "/", supervisor: "/dashboard" };

async function roleFor(token: string | undefined): Promise<Role | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { role: Role }).role;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get("amr_token")?.value;

  // supervisors land on their dashboard; signed-in users skip the sign-in page
  if (pathname === "/" || pathname === "/login") {
    const role = await roleFor(token);
    if (role === "supervisor" || (role && pathname === "/login")) {
      return NextResponse.redirect(new URL(HOME[role], request.url));
    }
    return NextResponse.next();
  }

  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const role = await roleFor(token);
  if (!role) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(login);
    if (token) res.cookies.delete("amr_token");  // expired or revoked
    return res;
  }
  if (!rule.roles.includes(role)) {
    const home = new URL(HOME[role], request.url);
    home.searchParams.set("denied", pathname);
    return NextResponse.redirect(home);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/", "/login",
    "/session/:path*", "/agent-session/:path*", "/quiz-builder/:path*", "/visits/:path*",
    "/profile/:path*", "/certificate/:path*", "/dashboard/:path*", "/settings/:path*",
  ],
};
