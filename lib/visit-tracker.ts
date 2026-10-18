// ─────────────────────────────────────────────────────────────────────────────
// Household Visit Tracker — localStorage-backed
// ─────────────────────────────────────────────────────────────────────────────

export interface Visit {
  id: string;
  familyName: string;
  village: string;
  district: string;
  topic: string;
  topicLabel: string;
  lang: string;
  date: string;
  durationMin: number;
  outcome: "completed" | "partial" | "referred";
  notes: string;
  quizScore?: number;
}

const KEY = "amr_jagruti_visits";

export function getVisits(): Visit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addVisit(visit: Omit<Visit, "id">): Visit {
  const visits = getVisits();
  const full: Visit = { id: `v-${Date.now()}`, ...visit };
  visits.unshift(full);
  localStorage.setItem(KEY, JSON.stringify(visits));
  return full;
}

export function deleteVisit(id: string) {
  const visits = getVisits().filter((v) => v.id !== id);
  localStorage.setItem(KEY, JSON.stringify(visits));
}

export function visitsToCSV(visits: Visit[]): string {
  const headers = ["ID","Family","Village","District","Topic","Language","Date","Duration(min)","Outcome","Score(%)","Notes"];
  const rows = visits.map((v) => [
    v.id, `"${v.familyName}"`, `"${v.village}"`, `"${v.district}"`,
    `"${v.topicLabel}"`, v.lang, v.date, v.durationMin,
    v.outcome, v.quizScore ?? "", `"${v.notes}"`,
  ]);
  return [headers, ...rows].map((r) => r.join(",")).join("\n");
}
