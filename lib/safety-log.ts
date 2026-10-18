// ─────────────────────────────────────────────────────────────────────────────
// Safety Event Log — localStorage-backed
// ─────────────────────────────────────────────────────────────────────────────

export interface SafetyEvent {
  id: string;
  timestamp: string;
  sessionId?: string;
  category: "URGENT" | "PRESCRIBING" | "PERSONAL_MEDICAL";
  trigger: string;
  lang: string;
}

const KEY = "amr_jagruti_safety_log";

export function getSafetyLog(): SafetyEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logSafetyEvent(event: Omit<SafetyEvent, "id" | "timestamp">): SafetyEvent {
  const events = getSafetyLog();
  const full: SafetyEvent = {
    id: `se-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
  events.unshift(full);
  // Keep last 200
  if (events.length > 200) events.splice(200);
  localStorage.setItem(KEY, JSON.stringify(events));
  return full;
}

export function clearSafetyLog() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
