// ─────────────────────────────────────────────────────────────────────────────
// Summary & Follow-up Agent
// Compiles session log into structured summary.
// Flags unresolved gaps and referral tasks.
// ─────────────────────────────────────────────────────────────────────────────

import type { SessionRecord } from "../session-store";
import { MODULES, CONTENT_LIBRARY } from "../content-library";
import type { Lang } from "../content-library";

export interface SessionSummary {
  sessionId: string;
  lang: Lang;
  topicsCovered: { kn: string; en: string }[];
  totalContentBlocks: number;
  quizScore: { correct: number; total: number; pct: number };
  gaps: { tag: string; label: { kn: string; en: string } }[];
  referralTasks: string[];
  followUpRecommendations: { kn: string; en: string }[];
  agentNote: { kn: string; en: string };
}

const GAP_LABELS: Record<string, { kn: string; en: string }> = {
  antibiotics:        { kn: "ಪ್ರತಿಜೀವಕ ಮೂಲಭೂತ",      en: "Antibiotic basics" },
  "full-course":      { kn: "ಪೂರ್ಣ ನಡೆ",             en: "Completing full course" },
  sharing:            { kn: "ಹಂಚಿಕೊಳ್ಳಬೇಡಿ",         en: "Not sharing medicines" },
  AMR:                { kn: "AMR ಅರಿವು",              en: "Understanding AMR" },
  resistance:         { kn: "ನಿರೋಧ ಶಕ್ತಿ",           en: "Resistance concept" },
  prevention:         { kn: "ಸೋಂಕು ತಡೆ",            en: "Infection prevention" },
  "when-to-seek-care":{ kn: "ವೈದ್ಯರ ಬಳಿ ಯಾವಾಗ",    en: "When to seek care" },
  compliance:         { kn: "ಔಷಧ ಅನುಸರಣೆ",          en: "Medicine compliance" },
};

function FOLLOW_UP(gap: string, lang: Lang): string {
  const msgs: Record<string, { kn: string; en: string }> = {
    antibiotics:         { kn: "ಮನೆ ಭೇಟಿ ಸಮಯ ಪ್ರತಿಜೀವಕ ಬಳಕೆ ವಿವರಿಸಿ.", en: "Explain antibiotic use during next home visit." },
    "full-course":       { kn: "ಪೂರ್ಣ ನಡೆ ಮಹತ್ವ ಕುಟುಂಬಕ್ಕೆ ತಿಳಿಸಿ.", en: "Remind family about completing the full course." },
    sharing:             { kn: "ಔಷಧ ಹಂಚಿಕೊಳ್ಳದ ಬಗ್ಗೆ ಮನ ಮಾಡಿ.", en: "Discuss safe antibiotic disposal at next visit." },
    AMR:                 { kn: "AMR ಕರಪತ್ರ ಹಂಚಿ ಚರ್ಚಿಸಿ.", en: "Share NCDC AMR leaflet and discuss at next visit." },
    prevention:          { kn: "ಮನೆ ಸ್ವಚ್ಛತೆ ಪರಿಶೀಲಿಸಿ.", en: "Check household sanitation practices at next visit." },
    "when-to-seek-care": { kn: "ಎಚ್ಚರಿಕೆ ಲಕ್ಷಣಗಳ ಕರಪತ್ರ ನೀಡಿ.", en: "Provide warning-signs leaflet and helpline number (104)." },
  };
  const m = msgs[gap] ?? { kn: `${gap} ಬಗ್ಗೆ ಮರು ಶಿಕ್ಷಣ ನೀಡಿ.`, en: `Re-educate on ${gap} at next visit.` };
  return lang === "kn" ? m.kn : m.en;
}

export async function runSummaryAgent(session: SessionRecord): Promise<SessionSummary> {
  await new Promise((r) => setTimeout(r, 700));

  // Topics covered
  const topicsCovered = (session.lessonPlan ?? []).map((lm) => {
    const mod = MODULES.find((m) => m.id === lm.moduleId);
    return mod?.title ?? { kn: lm.moduleId, en: lm.moduleId };
  });

  // Score
  const correct = session.quizAnswers.filter((a) => a.correct).length;
  const total = session.quizAnswers.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Unique gaps
  const uniqueGaps = [...new Set(session.gaps)].map((tag) => ({
    tag,
    label: GAP_LABELS[tag] ?? { kn: tag, en: tag },
  }));

  // Follow-up recommendations
  const followUpRecommendations = uniqueGaps.map((g) => ({
    kn: FOLLOW_UP(g.tag, "kn"),
    en: FOLLOW_UP(g.tag, "en"),
  }));

  // Simulated referral tasks from gaps
  const referralTasks: string[] = [];
  if (uniqueGaps.some((g) => g.tag === "when-to-seek-care")) {
    referralTasks.push(
      session.lang === "kn"
        ? "ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು PHC ಗೆ ಕರೆದೊಯ್ಯಿರಿ."
        : "Refer family member to PHC for follow-up."
    );
  }

  const agentNote = {
    kn: `ಸಾರಾಂಶ ಏಜೆಂಟ್: ${topicsCovered.length} ವಿಷಯ, ಅಂಕ ${pct}%, ${uniqueGaps.length} ತಿಳಿವಳಿಕೆ ಕೊರತೆ.`,
    en: `Summary Agent: ${topicsCovered.length} topic(s) covered, score ${pct}%, ${uniqueGaps.length} gap(s) identified.`,
  };

  return {
    sessionId: session.id,
    lang: session.lang,
    topicsCovered,
    totalContentBlocks: session.contentDelivered.length,
    quizScore: { correct, total, pct },
    gaps: uniqueGaps,
    referralTasks,
    followUpRecommendations,
    agentNote,
  };
}
