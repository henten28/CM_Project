import { NextRequest } from "next/server";
import {
  startSession,
  approveAndStartTeaching,
  advanceToQuiz,
  recordAnswer,
  generateSummary,
} from "@/lib/agents/orchestrator";
import { getSession } from "@/lib/session-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, ...params } = body;

    switch (action) {
      case "start": {
        const { lang = "kn", topic = "general", availableMinutes = 20 } = params;
        const result = await startSession(lang, topic, availableMinutes);
        return Response.json({ ok: true, ...result });
      }

      case "approve": {
        if (!sessionId) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
        const result = await approveAndStartTeaching(sessionId);
        return Response.json({ ok: true, ...result });
      }

      case "quiz": {
        if (!sessionId) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
        const result = await advanceToQuiz(sessionId);
        return Response.json({ ok: true, ...result });
      }

      case "answer": {
        const { questionId, selectedIndex } = params;
        if (!sessionId || questionId === undefined || selectedIndex === undefined) {
          return Response.json({ ok: false, error: "sessionId, questionId, selectedIndex required" }, { status: 400 });
        }
        const result = recordAnswer(sessionId, questionId, Number(selectedIndex));
        const session = getSession(sessionId);
        return Response.json({ ok: true, ...result, session });
      }

      case "summary": {
        if (!sessionId) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
        const summary = await generateSummary(sessionId);
        const session = getSession(sessionId);
        return Response.json({ ok: true, summary, session });
      }

      case "get": {
        if (!sessionId) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
        const session = getSession(sessionId);
        if (!session) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
        return Response.json({ ok: true, session });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
