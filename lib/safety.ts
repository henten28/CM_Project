// ─────────────────────────────────────────────────────────────────────────────
// Deterministic Safety Controller
// NEVER uses AI — only keyword / pattern matching.
// Output is NEVER overridden by any agent.
// ─────────────────────────────────────────────────────────────────────────────

export type SafetyCategory =
  | "SAFE"
  | "PERSONAL_MEDICAL"
  | "URGENT"
  | "PRESCRIBING";

export interface SafetyResult {
  category: SafetyCategory;
  triggeredBy?: string;
  message: { kn: string; en: string } | null;
  helpline?: string;
}

// ── Trigger patterns (bilingual) ─────────────────────────────────────────────

const URGENT_PATTERNS = [
  // Kannada
  "ಉಸಿರಾಟ ನಿಲ್ಲಿಸಿ", "ಎದೆ ನೋವು", "ಉಸಿರಾಟ ಕಷ್ಟ",
  "ಪ್ರತಿಕ್ರಿಯೆ", "ಅಲರ್ಜಿ", "ಪ್ರಜ್ಞೆ", "ಬಿದ್ದರು", "ರಕ್ತ ಬರುತ್ತಿದೆ",
  "ತಕ್ಷಣ ಸಹಾಯ",
  // English
  "can't breathe", "cannot breathe", "chest pain", "unconscious",
  "fainted", "reaction", "anaphylaxis", "emergency", "bleeding heavily",
  "severe allergy", "difficulty breathing", "not breathing",
];

const PRESCRIBING_PATTERNS = [
  // Kannada
  "ಯಾವ ಔಷಧ ತೆಗೆದುಕೊಳ್ಳಲಿ", "ಎಷ್ಟು ಡೋಸ್", "ಔಷಧ ಸೂಚಿಸಿ",
  "ಯಾವ ಪ್ರತಿಜೀವಕ", "ಡೋಸ್ ಏನು", "ಎಷ್ಟು ಮಿಲ್ಲಿಗ್ರಾಂ",
  // English
  "which antibiotic should i take", "what dose", "prescribe",
  "how many mg", "what medicine should", "recommend a medicine",
  "which tablet", "dosage for", "can i take",
];

const PERSONAL_MEDICAL_PATTERNS = [
  // Kannada
  "ನನಗೆ ಜ್ವರ", "ನನ್ನ ಮಗುವಿಗೆ", "ನನ್ನ ಗಂಡನಿಗೆ", "ಎನ್ನ ತಾಯಿಗೆ",
  "ನನ್ನ ಕಾಯಿಲೆ", "ನನಗೆ ಔಷಧ", "ಗರ್ಭಿಣಿ",
  // English
  "i have fever", "my child has", "my husband", "my mother",
  "i am sick", "i feel", "i have a", "my symptoms", "pregnant",
  "my baby", "my son", "my daughter",
];

function matchesPatterns(text: string, patterns: string[]): string | null {
  const lower = text.toLowerCase();
  for (const p of patterns) {
    if (lower.includes(p.toLowerCase())) return p;
  }
  return null;
}

// ── Fixed safety messages ─────────────────────────────────────────────────────

const MESSAGES: Record<SafetyCategory, { kn: string; en: string } | null> = {
  SAFE: null,
  URGENT: {
    kn: "⚠️ ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿ. ದಯವಿಟ್ಟು ತಕ್ಷಣ ಆರೋಗ್ಯ ಸಹಾಯವಾಣಿ **104** ಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ತೆರಳಿ. AMR ಜಾಗೃತಿ ಅಪ್ ತುರ್ತು ವೈದ್ಯಕೀಯ ಸಲಹೆ ನೀಡಲು ಸಾಧ್ಯವಿಲ್ಲ.",
    en: "⚠️ This sounds like an emergency. Please call the health helpline **104** immediately or go to the nearest hospital. AMR Jagruti cannot provide emergency medical advice.",
  },
  PERSONAL_MEDICAL: {
    kn: "ಇದು ವ್ಯಕ್ತಿಗತ ಆರೋಗ್ಯ ಪ್ರಶ್ನೆ. ದಯವಿಟ್ಟು ANM ಅಥವಾ ವೈದ್ಯರ ಬಳಿ ತೆರಳಿ. AMR ಜಾಗೃತಿ ಶಿಕ್ಷಣ ಸಾಧನ ಮಾತ್ರ, ವ್ಯಕ್ತಿಗತ ಚಿಕಿತ್ಸೆ ಅಲ್ಲ.",
    en: "This appears to be a personal health question. Please consult an ANM or doctor. AMR Jagruti is an education tool only — it cannot provide personal medical advice or treatment.",
  },
  PRESCRIBING: {
    kn: "AMR ಜಾಗೃತಿ ಔಷಧ ಸೂಚಿಸಲು ಅಥವಾ ಡೋಸ್ ಹೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ. ಔಷಧಕ್ಕಾಗಿ ದಯವಿಟ್ಟು ಅರ್ಹ ವೈದ್ಯರ ಬಳಿ ತೆರಳಿ.",
    en: "AMR Jagruti cannot recommend, prescribe, or suggest doses of any medicine. Please consult a qualified doctor for any prescription.",
  },
};

// ── Main classifier ────────────────────────────────────────────────────────────

export function classify(input: string): SafetyResult {
  // Priority order: URGENT > PRESCRIBING > PERSONAL_MEDICAL > SAFE
  let trigger: string | null;

  trigger = matchesPatterns(input, URGENT_PATTERNS);
  if (trigger) {
    return {
      category: "URGENT",
      triggeredBy: trigger,
      message: MESSAGES.URGENT,
      helpline: "104",
    };
  }

  trigger = matchesPatterns(input, PRESCRIBING_PATTERNS);
  if (trigger) {
    return {
      category: "PRESCRIBING",
      triggeredBy: trigger,
      message: MESSAGES.PRESCRIBING,
    };
  }

  trigger = matchesPatterns(input, PERSONAL_MEDICAL_PATTERNS);
  if (trigger) {
    return {
      category: "PERSONAL_MEDICAL",
      triggeredBy: trigger,
      message: MESSAGES.PERSONAL_MEDICAL,
    };
  }

  return { category: "SAFE", message: null };
}
