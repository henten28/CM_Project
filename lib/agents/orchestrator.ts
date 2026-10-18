// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// Manages session state machine and coordinates all agents.
// Validates structured outputs, logs every handoff.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createSession,
  getSession,
  updateSession,
  logHandoff,
  type SessionRecord,
  type QuizAnswer,
} from "../session-store";
import { runPlanningAgent } from "./planning";
import { runRetrievalAgent } from "./retrieval";
import { runTutorAgent } from "./tutor";
import { runSummaryAgent, type SessionSummary } from "./summary";
import type { ContentBlock, Lang } from "../content-library";

// ── Start session ─────────────────────────────────────────────────────────────

export async function startSession(
  lang: Lang,
  topic: string,
  availableMinutes: number
): Promise<{ session: SessionRecord; agentNote: { kn: string; en: string } }> {
  const session = createSession(lang, topic, availableMinutes);
  logHandoff(session.id, "USER", "ORCHESTRATOR", "session_start", { topic, availableMinutes, lang });

  // Planning agent
  const planResult = await runPlanningAgent({ topic, availableMinutes, priorGaps: [], lang });
  logHandoff(session.id, "ORCHESTRATOR", "PLANNING_AGENT", "plan_request", { topic });
  logHandoff(session.id, "PLANNING_AGENT", "ORCHESTRATOR", "plan_ready", { modules: planResult.lessonPlan.length });

  // Validate output
  if (!planResult.lessonPlan || planResult.lessonPlan.length === 0) {
    throw new Error("Planning agent returned empty lesson plan");
  }

  const updated = updateSession(session.id, {
    lessonPlan: planResult.lessonPlan,
    step: "ASHA_APPROVAL",
  });

  return { session: updated, agentNote: planResult.agentNote };
}

// ── ASHA approves plan → begin teaching ──────────────────────────────────────

export async function approveAndStartTeaching(
  sessionId: string
): Promise<{ session: SessionRecord; blocks: ContentBlock[]; agentNote: { kn: string; en: string } }> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (!session.lessonPlan) throw new Error("No lesson plan");

  logHandoff(sessionId, "ASHA", "ORCHESTRATOR", "plan_approved");

  const currentPlan = session.lessonPlan[0];
  const retrievalResult = await runRetrievalAgent({
    moduleIds: [currentPlan.moduleId],
    lang: session.lang,
  });

  logHandoff(sessionId, "ORCHESTRATOR", "RETRIEVAL_AGENT", "content_request", { moduleId: currentPlan.moduleId });
  logHandoff(sessionId, "RETRIEVAL_AGENT", "ORCHESTRATOR", "content_ready", { blocks: retrievalResult.blocks.length });

  updateSession(sessionId, {
    step: "TEACHING",
    ashaApproved: true,
    contentDelivered: retrievalResult.blocks.map((b) => b.id),
  });

  return { session: getSession(sessionId)!, blocks: retrievalResult.blocks, agentNote: retrievalResult.agentNote };
}

// ── Advance to quiz ───────────────────────────────────────────────────────────

export async function advanceToQuiz(
  sessionId: string
): Promise<{ session: SessionRecord; agentNote: { kn: string; en: string } }> {
  const session = getSession(sessionId);
  if (!session || !session.lessonPlan) throw new Error("Session not found");

  const moduleIds = session.lessonPlan.map((lm) => lm.moduleId);
  const tutorResult = await runTutorAgent({ moduleIds, priorAnswers: session.quizAnswers, lang: session.lang });

  logHandoff(sessionId, "ORCHESTRATOR", "TUTOR_AGENT", "quiz_request");
  logHandoff(sessionId, "TUTOR_AGENT", "ORCHESTRATOR", "quiz_ready", { questions: tutorResult.questionsToAsk.length });

  updateSession(sessionId, {
    step: "QUIZ",
    quizQuestions: tutorResult.questionsToAsk,
  });

  return { session: getSession(sessionId)!, agentNote: tutorResult.agentNote };
}

// ── Record quiz answer (deterministic scoring) ────────────────────────────────

export function recordAnswer(
  sessionId: string,
  questionId: string,
  selectedIndex: number
): { correct: boolean; explanation: { kn: string; en: string } } {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");

  const question = session.quizQuestions.find((q) => q.id === questionId);
  if (!question) throw new Error("Question not found");

  const correct = selectedIndex === question.correctIndex;
  const answer: QuizAnswer = {
    questionId,
    selectedIndex,
    correct,
    conceptTag: question.conceptTag,
  };

  const newAnswers = [...session.quizAnswers, answer];
  const newGaps = correct ? session.gaps : [...session.gaps, question.conceptTag];

  logHandoff(sessionId, "ASHA/USER", "TUTOR_AGENT", "quiz_answer", { questionId, correct });
  updateSession(sessionId, { quizAnswers: newAnswers, gaps: [...new Set(newGaps)] });

  return { correct, explanation: question.explanation };
}

// ── Generate session summary ──────────────────────────────────────────────────

export async function generateSummary(sessionId: string): Promise<SessionSummary> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");

  logHandoff(sessionId, "ORCHESTRATOR", "SUMMARY_AGENT", "summary_request");
  const summary = await runSummaryAgent(session);
  logHandoff(sessionId, "SUMMARY_AGENT", "ORCHESTRATOR", "summary_ready");

  updateSession(sessionId, { step: "SUMMARY", completedAt: new Date().toISOString() });
  return summary;
}
