// ─────────────────────────────────────────────────────────────────────────────
// Planning Agent
// Selects approved modules for the topic, available time and prior gaps.
// Returns a structured lesson plan. Uses mock LLM — slot ready for Bedrock.
// ─────────────────────────────────────────────────────────────────────────────

import { MODULES, CONTENT_LIBRARY } from "../content-library";
import type { LessonModule } from "../session-store";

interface PlanInput {
  topic: string;
  availableMinutes: number;
  priorGaps: string[];
  lang: "kn" | "en";
}

interface PlanOutput {
  lessonPlan: LessonModule[];
  agentNote: { kn: string; en: string };
}

// Topic → relevant module IDs (deterministic mapping)
const TOPIC_MODULE_MAP: Record<string, string[]> = {
  antibiotics:      ["m1", "m3", "m5"],
  amr:              ["m2", "m3", "m4", "m5"],
  resistance:       ["m2", "m4", "m6"],
  prevention:       ["m6", "m5"],
  sharing:          ["m4", "m7"],
  "case study":     ["m7", "m2", "m4"],
  general:          ["m1", "m2", "m3", "m4", "m5", "m6"],
  ಪ್ರತಿಜೀವಕ:          ["m1", "m3", "m5"],
  ಪ್ರತಿರೋಧ:           ["m2", "m4", "m6"],
  "ತಡೆಗಟ್ಟುವಿಕೆ":     ["m6", "m5"],
  "ಪ್ರಕರಣ ಅಧ್ಯಯನ":   ["m7"],
};

function matchTopic(topic: string): string[] {
  const lower = topic.toLowerCase();
  for (const [key, ids] of Object.entries(TOPIC_MODULE_MAP)) {
    if (lower.includes(key)) return ids;
  }
  return ["m1", "m2", "m3"]; // default
}

export async function runPlanningAgent(input: PlanInput): Promise<PlanOutput> {
  // Simulated planning delay
  await new Promise((r) => setTimeout(r, 800));

  const relevantModuleIds = matchTopic(input.topic);

  // Add modules that address known gaps
  if (input.priorGaps.includes("full-course")) relevantModuleIds.push("m3");
  if (input.priorGaps.includes("sharing")) relevantModuleIds.push("m4");
  if (input.priorGaps.includes("AMR")) relevantModuleIds.push("m2");

  // Deduplicate
  const uniqueIds = [...new Set(relevantModuleIds)];

  // Fit to available time
  let totalTime = 0;
  const selected: LessonModule[] = [];

  for (const mId of uniqueIds) {
    const mod = MODULES.find((m) => m.id === mId);
    if (!mod) continue;
    if (totalTime + mod.estimatedMinutes > input.availableMinutes) break;
    const contentIds = CONTENT_LIBRARY.filter((b) => b.moduleId === mId).map((b) => b.id);
    selected.push({
      moduleId: mId,
      contentIds,
      estimatedMinutes: mod.estimatedMinutes,
    });
    totalTime += mod.estimatedMinutes;
  }

  // Ensure at least one module
  if (selected.length === 0) {
    const mod = MODULES[0];
    const contentIds = CONTENT_LIBRARY.filter((b) => b.moduleId === mod.id).map((b) => b.id);
    selected.push({ moduleId: mod.id, contentIds, estimatedMinutes: mod.estimatedMinutes });
  }

  const agentNote = {
    kn: `ಯೋಜನಾ ಏಜೆಂಟ್: "${input.topic}" ವಿಷಯಕ್ಕೆ ${selected.length} ಮಾಡ್ಯೂಲ್ ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ (${totalTime} ನಿಮಿಷ). ASHA ಅನುಮೋದನೆ ಅಗತ್ಯ.`,
    en: `Planning Agent: Selected ${selected.length} module(s) for "${input.topic}" (${totalTime} min). ASHA approval required before session begins.`,
  };

  return { lessonPlan: selected, agentNote };
}
