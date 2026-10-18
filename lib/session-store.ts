// ─────────────────────────────────────────────────────────────────────────────
// In-memory session store (swap for DynamoDB later)
// ─────────────────────────────────────────────────────────────────────────────

import type { Lang } from "./content-library";

export type SessionStep = "PLANNING" | "ASHA_APPROVAL" | "TEACHING" | "QUIZ" | "SUMMARY";

export interface LessonModule {
  moduleId: string;
  contentIds: string[];
  estimatedMinutes: number;
}

export interface QuizQuestion {
  id: string;
  question: { kn: string; en: string };
  options: { kn: string; en: string }[];
  correctIndex: number;
  conceptTag: string;
  explanation: { kn: string; en: string };
}

export interface QuizAnswer {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
  conceptTag: string;
}

export interface HandoffLog {
  timestamp: string;
  from: string;
  to: string;
  action: string;
  data?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  lang: Lang;
  topic: string;
  availableMinutes: number;
  step: SessionStep;
  lessonPlan: LessonModule[] | null;
  ashaApproved: boolean;
  currentModuleIndex: number;
  contentDelivered: string[];
  quizQuestions: QuizQuestion[];
  quizAnswers: QuizAnswer[];
  gaps: string[];
  referralTasks: string[];
  handoffLog: HandoffLog[];
  createdAt: string;
  completedAt: string | null;
}

// In-memory store — fine for prototype / single instance
const store = new Map<string, SessionRecord>();

let idCounter = 1000;
function generateId(): string {
  return `sess-${Date.now()}-${++idCounter}`;
}

export function createSession(
  lang: Lang,
  topic: string,
  availableMinutes: number
): SessionRecord {
  const session: SessionRecord = {
    id: generateId(),
    lang,
    topic,
    availableMinutes,
    step: "PLANNING",
    lessonPlan: null,
    ashaApproved: false,
    currentModuleIndex: 0,
    contentDelivered: [],
    quizQuestions: [],
    quizAnswers: [],
    gaps: [],
    referralTasks: [],
    handoffLog: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  store.set(session.id, session);
  return session;
}

export function getSession(id: string): SessionRecord | undefined {
  return store.get(id);
}

export function updateSession(
  id: string,
  patch: Partial<SessionRecord>
): SessionRecord {
  const s = store.get(id);
  if (!s) throw new Error(`Session ${id} not found`);
  const updated = { ...s, ...patch };
  store.set(id, updated);
  return updated;
}

export function logHandoff(
  sessionId: string,
  from: string,
  to: string,
  action: string,
  data?: Record<string, unknown>
) {
  const s = store.get(sessionId);
  if (!s) return;
  const entry: HandoffLog = {
    timestamp: new Date().toISOString(),
    from,
    to,
    action,
    data,
  };
  updateSession(sessionId, { handoffLog: [...s.handoffLog, entry] });
}

export function getAllSessions(): SessionRecord[] {
  return Array.from(store.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
