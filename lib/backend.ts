// Server-only helper for the /api routes that forward to the FastAPI backend.
// BACKEND_URL has no NEXT_PUBLIC_ prefix, so it is never bundled into client code.
// The sign-in token lives in an httpOnly cookie that browser code cannot read; it is attached here, server-side.

import { cookies } from "next/headers";

export const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const AUTH_COOKIE = "amr_token";

export async function authToken(): Promise<string | undefined> {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

export async function forward(path: string, init?: { method?: string; body?: string }): Promise<Response> {
  try {
    const headers: Record<string, string> = {};
    if (init?.body) headers["Content-Type"] = "application/json";
    const token = await authToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body,
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),  // agent steps can wait on the model
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json({ detail: "backend unreachable" }, { status: 503 });
  }
}
