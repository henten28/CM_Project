import { NextRequest } from "next/server";
import { forward } from "@/lib/backend";

type Context = { params: Promise<{ path?: string[] }> };
const DRAFT_ACTIONS = new Set(["edit_question", "regenerate_question", "regenerate_quiz", "publish"]);
const ID = /^[A-Za-z0-9_-]{1,100}$/;

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function GET(request: NextRequest, context: Context) {
  const path = (await context.params).path ?? [];
  const query = request.nextUrl.searchParams;

  if (path.length === 0 && !request.nextUrl.search) return forward("/quizzes");
  if (path.length === 1 && path[0] === "drafts" && !request.nextUrl.search) return forward("/quizzes/drafts");
  if (path.length === 2 && path[0] === "drafts" && ID.test(path[1]) && !request.nextUrl.search) {
    return forward(`/quizzes/drafts/${encodeURIComponent(path[1])}`);
  }
  if (path.length === 2 && path[0] === "attempts" && ID.test(path[1]) && !request.nextUrl.search) {
    return forward(`/quizzes/attempts/${encodeURIComponent(path[1])}`);
  }
  if (path.length === 1 && path[0] !== "drafts" && path[0] !== "attempts" && ID.test(path[0])) {
    const versions = query.getAll("version");
    if ([...query.keys()].some((key) => key !== "version") || versions.length > 1 ||
        (versions.length === 1 && (!/^\d+$/.test(versions[0]) || Number(versions[0]) < 1))) {
      return Response.json({ detail: "invalid version query" }, { status: 400 });
    }
    const suffix = versions.length ? `?version=${encodeURIComponent(versions[0])}` : "";
    return forward(`/quizzes/${encodeURIComponent(path[0])}${suffix}`);
  }
  return Response.json({ detail: "not found" }, { status: 404 });
}

export async function POST(request: NextRequest, context: Context) {
  const path = (await context.params).path ?? [];
  const body = await request.text();
  const payload = jsonObject(body);
  if (!payload) return Response.json({ detail: "invalid JSON body" }, { status: 400 });

  if (path.length === 1 && path[0] === "drafts") {
    return forward("/quizzes/drafts", { method: "POST", body });
  }
  if (path.length === 3 && path[0] === "drafts" && ID.test(path[1]) && path[2] === "action") {
    if (typeof payload.action !== "string" || !DRAFT_ACTIONS.has(payload.action) ||
        !Number.isInteger(payload.expectedRevision) || Number(payload.expectedRevision) < 0) {
      return Response.json({ detail: "invalid draft action or expectedRevision" }, { status: 422 });
    }
    return forward(`/quizzes/drafts/${encodeURIComponent(path[1])}/action`, { method: "POST", body });
  }
  if (path.length === 2 && path[0] !== "drafts" && path[0] !== "attempts" && ID.test(path[0]) && path[1] === "attempts") {
    if (!Number.isInteger(payload.version) || Number(payload.version) < 1) {
      return Response.json({ detail: "version must be a positive integer" }, { status: 422 });
    }
    return forward(`/quizzes/${encodeURIComponent(path[0])}/attempts`, { method: "POST", body });
  }
  if (path.length === 3 && path[0] === "attempts" && ID.test(path[1]) && path[2] === "submit") {
    if (!Array.isArray(payload.answers)) return Response.json({ detail: "answers must be an array" }, { status: 422 });
    return forward(`/quizzes/attempts/${encodeURIComponent(path[1])}/submit`, { method: "POST", body });
  }
  return Response.json({ detail: "not found" }, { status: 404 });
}
