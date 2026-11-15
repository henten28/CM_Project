import { cookies } from "next/headers";
import { AUTH_COOKIE, forward } from "@/lib/backend";

// POST /api/auth/logout → revokes the token on the backend and clears the cookie
export async function POST() {
  await forward("/auth/logout", { method: "POST" });
  (await cookies()).delete(AUTH_COOKIE);
  return Response.json({ ok: true });
}
