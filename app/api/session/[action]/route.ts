import { NextRequest } from "next/server";
import { forward } from "@/lib/backend";

const ACTIONS = new Set(["start", "step", "complete"]);

// POST /api/session/start | step | complete  →  backend POST /session/<action>
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ detail: `unknown action ${action}` }, { status: 404 });
  return forward(`/session/${action}`, { method: "POST", body: await request.text() });
}

// GET /api/session/<sessionId>  →  backend GET /session/<sessionId>
export async function GET(_request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action: sessionId } = await params;
  return forward(`/session/${encodeURIComponent(sessionId)}`);
}
