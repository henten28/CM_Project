import type { Citation, AgentTrace } from "@/lib/agent-client";
import type { Lang } from "@/lib/prefs";

export type QuizDifficulty = "basic" | "intermediate" | "advanced";
export type QuizDraftState = "AWAITING_REVIEW" | "PUBLISHED" | "BLOCKED";

export interface DraftQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  conceptTag: string;
  citations: Citation[];
}

export interface QuestionInput {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  conceptTag: string;
  citations: { chunkId: string; quote: string }[];
}

export interface QuizDraft {
  id: string;
  revision: number;
  state: QuizDraftState;
  topic: string;
  title: string;
  lang: Lang;
  difficulty: QuizDifficulty;
  questionCount: number;
  questions: DraftQuestion[];
  publishedVersion: number | null;
  createdAt: string;
  updatedAt: string;
  trace: AgentTrace[];
  callsUsed: number;
  maxCalls: number;
  usingDemo: boolean;
  error: string | null;
}

export interface DraftSummary {
  id: string;
  title: string;
  topic: string;
  state: QuizDraftState;
  revision: number;
  publishedVersion: number | null;
  questionCount: number;
  updatedAt: string;
}

export interface PublishedQuizSummary {
  id: string;
  title: string;
  topic: string;
  lang: Lang;
  difficulty: QuizDifficulty;
  version: number;
  questionCount: number;
  publishedAt: string;
}

export interface PublicQuestion { id: string; question: string; options: string[]; }
export interface PublicQuiz extends PublishedQuizSummary { questions: PublicQuestion[]; }

export interface QuizResultItem {
  questionId: string;
  question: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string;
  citations: Citation[];
}

export interface QuizResult {
  scorePercent: number;
  correct: number;
  total: number;
  items: QuizResultItem[];
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  version: number;
  status: "IN_PROGRESS" | "COMPLETED";
  quiz: PublicQuiz;
  createdAt: string;
  result: QuizResult | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new Error(typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${response.status}`);
  }
  return data as T;
}

export function listPublishedQuizzes() { return request<PublishedQuizSummary[]>("/api/quizzes"); }
export function listQuizDrafts() { return request<DraftSummary[]>("/api/quizzes/drafts"); }
export function getQuizDraft(id: string) { return request<QuizDraft>(`/api/quizzes/drafts/${encodeURIComponent(id)}`); }

export function createQuizDraft(input: {
  topic: string; lang: Lang; difficulty: QuizDifficulty; questionCount: number;
}) {
  return request<QuizDraft>("/api/quizzes/drafts", { method: "POST", body: JSON.stringify(input) });
}

export type DraftActionInput =
  | { action: "edit_question"; expectedRevision: number; questionId: string; question: QuestionInput }
  | { action: "regenerate_question"; expectedRevision: number; questionId: string; feedback?: string }
  | { action: "regenerate_quiz"; expectedRevision: number; feedback?: string }
  | { action: "publish"; expectedRevision: number };

export function actOnQuizDraft(id: string, input: DraftActionInput) {
  return request<QuizDraft>(`/api/quizzes/drafts/${encodeURIComponent(id)}/action`, {
    method: "POST", body: JSON.stringify(input),
  });
}

export function getPublicQuiz(id: string, version?: number) {
  const suffix = version === undefined ? "" : `?version=${encodeURIComponent(String(version))}`;
  return request<PublicQuiz>(`/api/quizzes/${encodeURIComponent(id)}${suffix}`);
}

export function createQuizAttempt(id: string, version: number) {
  return request<QuizAttempt>(`/api/quizzes/${encodeURIComponent(id)}/attempts`, {
    method: "POST", body: JSON.stringify({ version }),
  });
}

export function getQuizAttempt(id: string) {
  return request<QuizAttempt>(`/api/quizzes/attempts/${encodeURIComponent(id)}`);
}

export function submitQuizAttempt(id: string, answers: { questionId: string; selectedIndex: number }[]) {
  return request<QuizAttempt>(`/api/quizzes/attempts/${encodeURIComponent(id)}/submit`, {
    method: "POST", body: JSON.stringify({ answers }),
  });
}
