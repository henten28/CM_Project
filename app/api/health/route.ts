import { forward } from "@/lib/backend";

// GET /api/health → backend /health; adds `reachable` so the UI can tell "down" from "up"
export async function GET() {
  const res = await forward("/health");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ ok: false, reachable: false, error: data.detail ?? `HTTP ${res.status}` });
  return Response.json({ ...data, reachable: true });
}
