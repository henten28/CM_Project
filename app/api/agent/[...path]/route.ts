import { NextRequest } from "next/server";
import { forward } from "@/lib/backend";

type Context = { params: Promise<{ path: string[] }> };
const ACTIONS = new Set(["approve", "revise", "continue", "answer", "ask", "finish"]);
const VIEWS = new Set(["asha", "learner"]);

function queryView(request: NextRequest): string | null | false {
  const values = request.nextUrl.searchParams.getAll("view");
  if (!values.length) return null;
  return values.length === 1 && VIEWS.has(values[0]) ? values[0] : false;
}

export async function GET(request: NextRequest, context: Context) {
  const path = (await context.params).path;
  if (path.length === 1 && (path[0] === "sources" || path[0] === "sessions") && !request.nextUrl.search) {
    return forward(`/agent/${path[0]}`);
  }
  if (path.length === 2 && path[0] === "session" && /^[A-Za-z0-9_-]+$/.test(path[1])) {
    const view = queryView(request);
    if (view === false || [...request.nextUrl.searchParams.keys()].some((key) => key !== "view")) {
      return Response.json({ detail: "invalid query" }, { status: 400 });
    }
    return forward(`/agent/session/${encodeURIComponent(path[1])}${view ? `?view=${view}` : ""}`);
  }
  return Response.json({ detail: "not found" }, { status: 404 });
}

export async function POST(request: NextRequest, context: Context) {
  const path = (await context.params).path;
  const body = await request.text();
  if (path.length === 1 && path[0] === "start") {
    return forward("/agent/start", { method: "POST", body });
  }
  if (path.length === 3 && path[0] === "session" && /^[A-Za-z0-9_-]+$/.test(path[1]) && path[2] === "action") {
    try {
      const payload = JSON.parse(body) as { action?: string; view?: string };
      if (!payload || typeof payload !== "object" || !ACTIONS.has(payload.action ?? "") ||
          (payload.view !== undefined && !VIEWS.has(payload.view))) {
        return Response.json({ detail: "invalid action or view" }, { status: 422 });
      }
    } catch {
      return Response.json({ detail: "invalid JSON body" }, { status: 400 });
    }
    return forward(`/agent/session/${encodeURIComponent(path[1])}/action`, { method: "POST", body });
  }
  return Response.json({ detail: "not found" }, { status: 404 });
}
