import { NextRequest } from "next/server";
import { forward } from "@/lib/backend";

// only these backend dashboard paths are reachable from the browser
const GET_PATHS = [/^sessions$/, /^tasks$/, /^evaluation$/];
const POST_PATHS = [/^tasks\/[\w-]+\/close$/];

type Ctx = { params: Promise<{ path: string[] }> };

async function resolve(ctx: Ctx, allowed: RegExp[]): Promise<string | null> {
  const path = (await ctx.params).path.join("/");
  return allowed.some((re) => re.test(path)) ? path : null;
}

// GET /api/dashboard/sessions | tasks?status= | evaluation
export async function GET(request: NextRequest, ctx: Ctx) {
  const path = await resolve(ctx, GET_PATHS);
  if (!path) return Response.json({ detail: "not found" }, { status: 404 });
  return forward(`/dashboard/${path}${request.nextUrl.search}`);
}

// POST /api/dashboard/tasks/<id>/close
export async function POST(_request: NextRequest, ctx: Ctx) {
  const path = await resolve(ctx, POST_PATHS);
  if (!path) return Response.json({ detail: "not found" }, { status: 404 });
  return forward(`/dashboard/${path}`, { method: "POST" });
}
