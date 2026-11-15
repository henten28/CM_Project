import { NextRequest } from "next/server";
import { forward } from "@/lib/backend";

type Ctx = { params: Promise<{ path?: string[] }> };
const ID = /^[A-Za-z0-9_-]{1,60}$/;

// GET /api/visits → the signed-in ASHA's visits
export async function GET(_request: NextRequest, ctx: Ctx) {
  const path = (await ctx.params).path ?? [];
  if (path.length) return Response.json({ detail: "not found" }, { status: 404 });
  return forward("/visits");
}

// POST /api/visits → log a visit
export async function POST(request: NextRequest, ctx: Ctx) {
  const path = (await ctx.params).path ?? [];
  if (path.length) return Response.json({ detail: "not found" }, { status: 404 });
  return forward("/visits", { method: "POST", body: await request.text() });
}

// DELETE /api/visits/<id>
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const path = (await ctx.params).path ?? [];
  if (path.length !== 1 || !ID.test(path[0])) return Response.json({ detail: "not found" }, { status: 404 });
  return forward(`/visits/${encodeURIComponent(path[0])}`, { method: "DELETE" });
}
