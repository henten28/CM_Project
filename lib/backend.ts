// Server-only helper for the /api routes that forward to the FastAPI backend.
// BACKEND_URL has no NEXT_PUBLIC_ prefix, so it is never bundled into client code.

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export async function forward(path: string, init?: { method?: string; body?: string }): Promise<Response> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body,
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),  // planning can wait on Bedrock
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json({ detail: "backend unreachable" }, { status: 503 });
  }
}
