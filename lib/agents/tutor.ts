// ─────────────────────────────────────────────────────────────────────────────
// Tutor Agent
// Drives Q&A and quiz. Fixed scoring rules (correct/incorrect → branch).
// Identifies concept gaps. Requests additional content on gap.
// ─────────────────────────────────────────────────────────────────────────────

import type { QuizQuestion, QuizAnswer } from "../session-store";
import type { Lang } from "../content-library";

// ── Quiz bank ─────────────────────────────────────────────────────────────────

export const QUIZ_BANK: QuizQuestion[] = [
  {
    id: "q1",
    question: {
      kn: "ಶೀತ ಮತ್ತು ಜ್ವರಕ್ಕೆ ಪ್ರತಿಜೀವಕ ತೆಗೆದುಕೊಳ್ಳಬೇಕೇ?",
      en: "Should you take an antibiotic for a cold and fever?",
    },
    options: [
      { kn: "ಹೌದು, ಯಾವಾಗಲೂ", en: "Yes, always" },
      { kn: "ಇಲ್ಲ, ಶೀತ ವೈರಸ್‌ನಿಂದ ಬರುತ್ತದೆ", en: "No, colds are caused by viruses" },
      { kn: "ವೈದ್ಯರ ಸೂಚನೆ ಮಾತ್ರ ಅಲ್ಲ", en: "Only sometimes" },
      { kn: "ತಿಳಿದಿಲ್ಲ", en: "I don't know" },
    ],
    correctIndex: 1,
    conceptTag: "antibiotics",
    explanation: {
      kn: "ಶೀತ ಮತ್ತು ಹಳ್ಳ ಜ್ವರ ವೈರಸ್‌ನಿಂದ ಬರುತ್ತವೆ. ಪ್ರತಿಜೀವಕ ವೈರಸ್ ಮೇಲೆ ಕೆಲಸ ಮಾಡುವುದಿಲ್ಲ.",
      en: "Colds and most fevers are caused by viruses. Antibiotics work only against bacteria, not viruses.",
    },
  },
  {
    id: "q2",
    question: {
      kn: "ಪ್ರತಿಜೀವಕ ನಡೆಯಲ್ಲಿ ಚೇತರಿಕೆ ಕಂಡ ನಂತರ ಏನು ಮಾಡಬೇಕು?",
      en: "After feeling better during an antibiotic course, what should you do?",
    },
    options: [
      { kn: "ಔಷಧ ನಿಲ್ಲಿಸಬಹುದು", en: "Stop the medicine" },
      { kn: "ವೈದ್ಯರು ಹೇಳಿದ ದಿನಗಳವರೆಗೆ ಮುಂದುವರಿಸಿ", en: "Continue until the course the doctor prescribed" },
      { kn: "ಡೋಸ್ ಕಡಿಮೆ ಮಾಡಬಹುದು", en: "Reduce the dose" },
      { kn: "ಬೇರೆ ಔಷಧ ಬದಲಿಸಿ", en: "Switch to another medicine" },
    ],
    correctIndex: 1,
    conceptTag: "full-course",
    explanation: {
      kn: "ಅರ್ಧಕ್ಕೇ ಔಷಧ ನಿಲ್ಲಿಸಿದರೆ ಬ್ಯಾಕ್ಟೀರಿಯಾ ನಿರೋಧ ಶಕ್ತಿ ಗಳಿಸಬಹುದು. ಪೂರ್ಣ ನಡೆ ಮಾಡಿ.",
      en: "Stopping early can let resistant bacteria survive. Always complete the full prescribed course.",
    },
  },
  {
    id: "q3",
    question: {
      kn: "ನಿಮ್ಮ ಉಳಿದ ಪ್ರತಿಜೀವಕ ನೆರೆಮನೆಯವರಿಗೆ ಕೊಡಬಹುದೇ?",
      en: "Can you give your leftover antibiotics to a neighbour who is sick?",
    },
    options: [
      { kn: "ಹೌದು, ಅವರಿಗೆ ಸಹಾಯವಾಗಬಹುದು", en: "Yes, it might help them" },
      { kn: "ಇಲ್ಲ, ಎಂದಿಗೂ ಕೊಡಬಾರದು", en: "No, never share antibiotics" },
      { kn: "ಒಮ್ಮೊಮ್ಮೆ ಕೊಡಬಹುದು", en: "Sometimes it's okay" },
      { kn: "ಅವರ ಜ್ವರ ಇದ್ದರೆ ಕೊಡಬಹುದು", en: "If they have fever, yes" },
    ],
    correctIndex: 1,
    conceptTag: "sharing",
    explanation: {
      kn: "ಪ್ರತಿ ಸೋಂಕು ಬೇರೆ ಬ್ಯಾಕ್ಟೀರಿಯಾದಿಂದ ಬರಬಹುದು. ಉಳಿದ ಔಷಧ ಹಂಚಬೇಡಿ, ಆರೋಗ್ಯ ಕೇಂದ್ರದಲ್ಲಿ ಹಿಂದಿರುಗಿಸಿ.",
      en: "Each infection may need different treatment. Never share antibiotics — return leftovers to a health centre.",
    },
  },
  {
    id: "q4",
    question: {
      kn: "AMR ಅಂದರೇನು?",
      en: "What does AMR (Antimicrobial Resistance) mean?",
    },
    options: [
      { kn: "ಔಷಧ ಅಲರ್ಜಿ", en: "Medicine allergy" },
      { kn: "ಸೂಕ್ಷ್ಮಾಣುಗಳು ಔಷಧ ವಿರುದ್ಧ ನಿರೋಧ ಶಕ್ತಿ ಗಳಿಸಿಕೊಳ್ಳುವುದು", en: "Microbes becoming resistant to medicine" },
      { kn: "ಔಷಧ ಮೂಲ ಕೊರತೆ", en: "Shortage of medicines" },
      { kn: "ಹೊಸ ರೋಗ", en: "A new disease" },
    ],
    correctIndex: 1,
    conceptTag: "AMR",
    explanation: {
      kn: "AMR ಎಂದರೆ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಇತ್ಯಾದಿ ಸೂಕ್ಷ್ಮಾಣುಗಳು ಔಷಧ ವಿರುದ್ಧ ನಿರೋಧ ಶಕ್ತಿ ಗಳಿಸಿ ಗುಣಪಡಿಸಲಾಗದ ಸೋಂಕು ಉಂಟು ಮಾಡುವ ಸ್ಥಿತಿ.",
      en: "AMR means bacteria or other microbes develop resistance to medicines, making infections very difficult or impossible to treat.",
    },
  },
  {
    id: "q5",
    question: {
      kn: "ಶೌಚಾಲಯ ಬಳಸುವಷ್ಟು ಸ್ವಚ್ಛತೆ AMR ಕಡಿಮೆ ಮಾಡಬಲ್ಲದೇ?",
      en: "Can using a toilet (instead of open defecation) help reduce AMR?",
    },
    options: [
      { kn: "ಇಲ್ಲ, ಸಂಬಂಧ ಇಲ್ಲ", en: "No, it's unrelated" },
      { kn: "ಹೌದು, ಸೋಂಕು ತಡೆಯುತ್ತದೆ ಆದ್ದರಿಂದ ಕಡಿಮೆ ಔಷಧ ಬೇಕು", en: "Yes, it prevents infection so fewer antibiotics are needed" },
      { kn: "ಸ್ವಲ್ಪ ಮಾತ್ರ", en: "Only a little" },
      { kn: "ಕೇವಲ ಮಕ್ಕಳಿಗೆ", en: "Only for children" },
    ],
    correctIndex: 1,
    conceptTag: "prevention",
    explanation: {
      kn: "ಸ್ವಚ್ಛತೆ ಕಾಪಾಡಿದರೆ ಸೋಂಕು ಕಡಿಮೆ, ಆದ್ದರಿಂದ ಪ್ರತಿಜೀವಕ ಅಗತ್ಯ ಕಡಿಮೆ — AMR ಹರಡುವ ಅವಕಾಶ ಕಡಿಮೆ.",
      en: "Good sanitation prevents infections, meaning fewer antibiotics are used, which reduces opportunities for AMR to develop and spread.",
    },
  },
];

interface TutorInput {
  moduleIds: string[];
  priorAnswers: QuizAnswer[];
  lang: Lang;
}

interface TutorOutput {
  questionsToAsk: QuizQuestion[];
  gaps: string[];
  agentNote: { kn: string; en: string };
}

// Fixed scoring: wrong answer → concept tag goes to gaps
export function scoringRule(answer: QuizAnswer): boolean {
  return answer.correct;
}

export function identifyGaps(answers: QuizAnswer[]): string[] {
  return answers.filter((a) => !a.correct).map((a) => a.conceptTag);
}

export async function runTutorAgent(input: TutorInput): Promise<TutorOutput> {
  await new Promise((r) => setTimeout(r, 500));

  // Select questions relevant to current modules
  const moduleConceptMap: Record<string, string[]> = {
    m1: ["antibiotics"],
    m2: ["AMR", "resistance"],
    m3: ["full-course", "compliance"],
    m4: ["sharing"],
    m5: ["when-to-seek-care"],
    m6: ["prevention"],
    m7: ["case-study", "misuse"],
  };

  const relevantTags = input.moduleIds.flatMap((m) => moduleConceptMap[m] ?? []);
  const answeredIds = new Set(input.priorAnswers.map((a) => a.questionId));

  // Filter: relevant tags and not already answered
  let questions = QUIZ_BANK.filter(
    (q) => relevantTags.includes(q.conceptTag) && !answeredIds.has(q.id)
  );

  // If no specific match, include all unanswered
  if (questions.length === 0) {
    questions = QUIZ_BANK.filter((q) => !answeredIds.has(q.id));
  }

  const gaps = identifyGaps(input.priorAnswers);
  const priorityGapQuestions = QUIZ_BANK.filter(
    (q) => gaps.includes(q.conceptTag) && !answeredIds.has(q.id)
  );

  // Gaps come first
  const finalQuestions = [...new Map(
    [...priorityGapQuestions, ...questions].map((q) => [q.id, q])
  ).values()].slice(0, 3);

  const agentNote = {
    kn: `ಶಿಕ್ಷಕ ಏಜೆಂಟ್: ${finalQuestions.length} ಪ್ರಶ್ನೆ ಆಯ್ಕೆ. ತಿಳಿವಳಿಕೆ ಕೊರತೆ: [${gaps.join(", ") || "ಇಲ್ಲ"}].`,
    en: `Tutor Agent: ${finalQuestions.length} question(s) selected. Concept gaps identified: [${gaps.join(", ") || "none"}].`,
  };

  return { questionsToAsk: finalQuestions, gaps, agentNote };
}
