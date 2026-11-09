import type { Lang } from "@/lib/prefs";

export type AgentView = "asha" | "learner";
export type AgentState = "AWAITING_REVIEW" | "READY" | "AWAITING_ANSWER" | "COMPLETED" | "BLOCKED";
export type ActivityKind = "plan" | "lesson" | "quiz" | "reinforcement" | "answer" | "summary";
export type AgentAction = "approve" | "revise" | "continue" | "answer" | "ask" | "finish";

export interface Citation {
  chunkId: string;
  documentId: string;
  title: string;
  url: string;
  location: string;
  quote: string;
  provenance: string;
}

export interface Quiz {
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
  conceptTag: string;
}

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  body: string;
  citations: Citation[];
  quiz: Quiz | null;
}

export interface AgentTrace {
  at: string;
  event: string;
  agent: string;
  detail: Record<string, unknown>;
}

export interface AgentAnswer {
  activityId: string;
  selectedIndex: number;
  correct: boolean;
  conceptTag: string;
}

export interface AgentSession {
  id: string;
  topic: string;
  lang: Lang;
  durationMinutes: 5 | 10 | 15;
  state: AgentState;
  pending: Activity | null;
  current: Activity | null;
  history: Activity[];
  answers: AgentAnswer[];
  feedback: string | null;
  trace: AgentTrace[];
  callsUsed: number;
  maxCalls: number;
  usingDemo: boolean;
  safetyMessage?: string | null;
  error: string | null;
}

export interface AgentSource {
  documentId: string;
  title: string;
  url: string;
  provenance: string;
  approved: boolean;
  chunkCount: number;
  publisher?: string;
  origin?: string;
}

export interface AgentSources {
  sources: AgentSource[];
  chunkCount: number;
  usingDemo: boolean;
  errors?: string[];
}

export interface AgentSessionSummary {
  id: string;
  topic: string;
  lang: Lang;
  state: AgentState;
  createdAt: string;
  callsUsed: number;
  maxCalls: number;
  answered: number;
  correct: number;
}

export interface StartAgentInput {
  topic: string;
  durationMinutes: 5 | 10 | 15;
  lang: Lang;
  priorGaps?: string[];
}

export interface AgentActionInput {
  action: AgentAction;
  proposalId?: string;
  feedback?: string;
  selectedIndex?: number;
  text?: string;
  view?: AgentView;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...init?.headers,
  } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new Error(typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${response.status}`);
  }
  return data as T;
}

export function startAgentSession(input: StartAgentInput) {
  return request<AgentSession>("/api/agent/start", { method: "POST", body: JSON.stringify(input) });
}

export function getAgentSession(id: string, view: AgentView) {
  return request<AgentSession>(`/api/agent/session/${encodeURIComponent(id)}?view=${view}`);
}

export function actOnAgentSession(id: string, input: AgentActionInput) {
  const { view = "asha", ...body } = input;
  return request<AgentSession>(`/api/agent/session/${encodeURIComponent(id)}/action`, {
    method: "POST", body: JSON.stringify({ ...body, view }),
  });
}

export function getAgentSources() {
  return request<AgentSources>("/api/agent/sources");
}

export function getAgentSessions() {
  return request<AgentSessionSummary[]>("/api/agent/sessions");
}
