// ─────────────────────────────────────────────────────────────────────────────
// Typed client for the FastAPI backend.
// The browser only talks to this app's own /api routes; they forward to the
// backend server-side (BACKEND_URL). No AWS credentials ever exist on the client.
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = "kn" | "en" | "hi";
export type Level = "easy" | "medium" | "hard";
export type SafetyCategory = "SAFE" | "URGENT" | "DOSAGE" | "SELF_MEDICATION" | "PERSONAL_MEDICAL";
export type SessionState = "AWAITING_APPROVAL" | "IN_PROGRESS" | "SAFETY_HOLD" | "COMPLETED";

export interface Bilingual { kn: string; en: string; }

export interface LessonModule { moduleId: string; contentIds: string[]; estimatedMinutes: number; }
export interface LessonPlan { lessonPlan: LessonModule[]; agentNote: Bilingual; }

export interface ContentHit {
  id: string;
  moduleId: string;
  title: Bilingual;
  body: Bilingual;
  conceptTags: string[];
  difficulty: string;
  sourceId: string;
  source: string;
  version: number;
  verified: boolean;
}

export interface RetrievalResult {
  contentIds: string[];
  hits: ContentHit[];
  sources: { id: string; name: string }[];
  refinements: string[];
  displayLang: "kn" | "en";
  contentVersion: string;
}

// question as served to the client: no correct answer included
export interface QuizItem { id: string; conceptTag: string; question: Bilingual; options: Bilingual[]; }

export interface AnswerFeedback {
  questionId: string;
  correct: boolean;
  conceptTag: string;
  explanation: Bilingual;
  reinforcementContentIds: string[];
}

export interface TutorResult {
  scorePercent: number;
  answered: number;
  correct: number;
  gaps: string[];
  feedback: AnswerFeedback[];
  nextActivity: { level: Level; kind: "recap" | "guided_practice" | "case_study"; contentIds: string[]; questionIds: string[] };
  nextQuestions: QuizItem[];
}

export interface SafetyResult {
  triggered: boolean;
  category: SafetyCategory;
  ruleId: string | null;
  message: { kn: string; en: string; hi: string } | null;  // fixed text, never generated
  helpline: string | null;
}

export interface EscalationTask {
  id: string;
  category: SafetyCategory;
  ruleId: string;
  actionKey: string;
  action: string;
  status: "open" | "closed";
  simulated: boolean;
  createdAt: string;
  closedAt: string | null;
}

export interface SessionSummary {
  sessionId: string;
  scorePercent: number;
  answered: number;
  covered: { moduleId: string; title: Bilingual; contentIds: string[] }[];
  remainingGaps: { conceptTag: string; label: Bilingual; suggestedContentIds: string[]; followUp: Bilingual }[];
  referralTasks: EscalationTask[];
  sourcesCited: { id: string; name: string }[];
  contentVersion: string;
  note: Bilingual;
}

export interface SessionRecord {
  id: string;
  state: SessionState;
  topic: string;
  durationMinutes: number;
  lang: Lang;
  priorGaps: string[];
  plan: LessonPlan | null;
  planSource: "llm" | "rules";
  approvedPlan: LessonPlan | null;
  startSafety: SafetyResult | null;
  escalations: EscalationTask[];
  summary: SessionSummary | null;
}

export interface Health { ok: boolean; reachable: boolean; mock?: boolean; region?: string; model?: string; error?: string; }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI puts errors in `detail` (a string, or a list of validation errors)
    const d = (data as { detail?: unknown }).detail;
    // non-JSON bodies (e.g. a restarting server) fall back to the HTTP status
    throw new ApiError(res.status, typeof d === "string" ? d : d ? JSON.stringify(d) : `HTTP ${res.status} ${res.statusText}`);
  }
  return data as T;
}

// ── endpoints ────────────────────────────────────────────────────────────────

export function startSession(input: { topic: string; durationMinutes: 5 | 10 | 15; lang: Lang; priorGaps?: string[] }) {
  return call<{ sessionId: string; state: SessionState; plan: LessonPlan | null; planSource: string | null;
                safety: SafetyResult | null; requiresAshaApproval: boolean }>(
    "/api/session/start", { priorGaps: [], ...input });
}

export function getSession(sessionId: string) {
  return call<SessionRecord>(`/api/session/${encodeURIComponent(sessionId)}`);
}

export function approvePlan(sessionId: string, editedContentIds?: string[]) {
  return call<{ sessionId: string; state: SessionState; content: RetrievalResult; questions: QuizItem[]; warnings: string[] }>(
    "/api/session/step", { sessionId, action: "approve", editedContentIds });
}

export function submitAnswers(sessionId: string, answers: { questionId: string; selectedIndex: number }[]) {
  return call<{ sessionId: string; state: SessionState; tutor: TutorResult; content: RetrievalResult }>(
    "/api/session/step", { sessionId, action: "answer", answers });
}

export function askQuestion(sessionId: string, text: string) {
  return call<{ sessionId: string; state: SessionState; safety: SafetyResult | null; content: RetrievalResult | null }>(
    "/api/session/step", { sessionId, action: "ask", text });
}

export function completeSession(sessionId: string) {
  return call<{ sessionId: string; state: SessionState; summary: SessionSummary }>("/api/session/complete", { sessionId });
}

export function getHealth() {
  return call<Health>("/api/health");
}

export function resumeSession(sessionId: string) {
  return call<{ sessionId: string; state: SessionState; content: RetrievalResult; questions: QuizItem[];
                progress: { scorePercent: number; answered: number; correct: number; level: Level | null } }>(
    "/api/session/step", { sessionId, action: "resume" });
}

// ── supervisor dashboard ─────────────────────────────────────────────────────

export interface DashboardSession {
  id: string; topic: string; lang: Lang; state: SessionState; date: string; createdAt: string; durationMin: number;
  quizScore: number; totalQ: number; correctQ: number; gaps: string[];
  safetyRouted: boolean; openTasks: number; lessonPlanValid: boolean | null; planSource: "llm" | "rules" | null;
  sessionCompleted: boolean;
}

export interface ReferralTask extends EscalationTask { sessionId: string; topic: string; lang: Lang; }

export interface Metric { numerator: number; denominator: number; percent: number | null; }

export interface EvaluationReport {
  generatedAt: string; mode: "mock" | "bedrock"; model: string | null; contentVersion: string;
  metrics: { testPassRate: Metric; safetyRoutingAccuracy: Metric; safetyFalsePositives: Metric;
             aiPlansPassingValidation: Metric; fullSessionsCompleted: Metric };
  scenarios: { id: string; type: string; title: string; passed: boolean; detail: string }[];
}

export function getDashboardSessions() {
  return call<DashboardSession[]>("/api/dashboard/sessions");
}

export function getReferralTasks(status: "open" | "closed" | "all" = "open") {
  return call<ReferralTask[]>(`/api/dashboard/tasks?status=${status}`);
}

export function closeReferralTask(taskId: string) {
  return call<EscalationTask>(`/api/dashboard/tasks/${encodeURIComponent(taskId)}/close`, {});
}

export function getEvaluation() {
  return call<EvaluationReport | null>("/api/dashboard/evaluation");
}

// ── learning library ─────────────────────────────────────────────────────────

export interface LibraryBlock {
  id: string; title: Bilingual; body: Bilingual; conceptTags: string[]; difficulty: string;
  estimatedMinutes: number; sourceId: string; source: string; version: number;
}

export interface ContentLibrary {
  contentVersion: string;
  sources: { id: string; name: string }[];
  modules: { id: string; title: Bilingual; estimatedMinutes: number; blocks: LibraryBlock[] }[];
  keyMessages: { id: string; conceptTag: string; text: Bilingual }[];
}

export function getContentLibrary() {
  return call<ContentLibrary>("/api/content");
}

// ── helpers ──────────────────────────────────────────────────────────────────

// reviewed content exists in kn and en only; Hindi sessions read English text
export function pick(b: Bilingual, lang: Lang): string {
  return lang === "kn" ? b.kn : b.en;
}

export function voiceLang(lang: Lang): string {
  return lang === "kn" ? "kn-IN" : lang === "hi" ? "hi-IN" : "en-IN";
}
