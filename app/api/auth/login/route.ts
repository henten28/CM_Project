import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, BACKEND_URL } from "@/lib/backend";

// POST /api/auth/login → backend /auth/login; the token goes into an httpOnly cookie, only the user is returned
export async function POST(request: NextRequest) {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(),
      cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json({ detail: "backend unreachable" }, { status: 503 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ detail: data.detail ?? "sign-in failed" }, { status: res.status });
  (await cookies()).set(AUTH_COOKIE, data.token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60,
    secure: request.nextUrl.protocol === "https:",
  });
  return Response.json({ user: data.user });
}
