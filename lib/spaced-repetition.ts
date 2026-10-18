// ─────────────────────────────────────────────────────────────────────────────
// Spaced Repetition — gap tracking with review scheduling
// ─────────────────────────────────────────────────────────────────────────────

export interface GapRecord {
  tag: string;
  label: { kn: string; en: string; hi: string };
  lastEncountered: string; // ISO date
  timesWrong: number;
  nextReviewDate: string;  // ISO date
}

const KEY = "amr_jagruti_gaps";

const INTERVAL_DAYS = [1, 3, 7, 14]; // SM-2 lite

const GAP_LABELS: Record<string, { kn: string; en: string; hi: string }> = {
  antibiotics:         { kn: "ಪ್ರತಿಜೀವಕ ಮೂಲಭೂತ",     en: "Antibiotic basics",       hi: "एंटीबायोटिक मूल बातें" },
  "full-course":       { kn: "ಪೂರ್ಣ ನಡೆ",            en: "Completing full course",   hi: "पूरा कोर्स पूरा करना" },
  sharing:             { kn: "ಹಂಚಿಕೊಳ್ಳಬೇಡಿ",        en: "Not sharing antibiotics",  hi: "एंटीबायोटिक साझा न करें" },
  AMR:                 { kn: "AMR ಅರಿವು",             en: "Understanding AMR",        hi: "AMR की समझ" },
  resistance:          { kn: "ನಿರೋಧ ಶಕ್ತಿ",          en: "Resistance concept",       hi: "प्रतिरोध की अवधारणा" },
  prevention:          { kn: "ಸೋಂಕು ತಡೆ",           en: "Infection prevention",      hi: "संक्रमण रोकथाम" },
  "when-to-seek-care": { kn: "ವೈದ್ಯರ ಬಳಿ ಯಾವಾಗ",   en: "When to seek care",        hi: "डॉक्टर के पास कब जाएं" },
  compliance:          { kn: "ಔಷಧ ಅನುಸರಣೆ",         en: "Medicine compliance",       hi: "दवा अनुपालन" },
};

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function getGapRecords(): GapRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordGap(tag: string) {
  const records = getGapRecords();
  const existing = records.find((r) => r.tag === tag);
  const now = new Date().toISOString();

  if (existing) {
    existing.timesWrong += 1;
    const interval = INTERVAL_DAYS[Math.min(existing.timesWrong - 1, INTERVAL_DAYS.length - 1)];
    existing.lastEncountered = now;
    existing.nextReviewDate = addDays(now, interval);
  } else {
    records.push({
      tag,
      label: GAP_LABELS[tag] ?? { kn: tag, en: tag, hi: tag },
      lastEncountered: now,
      timesWrong: 1,
      nextReviewDate: addDays(now, 1),
    });
  }
  localStorage.setItem(KEY, JSON.stringify(records));
}

export function getDueReviews(): GapRecord[] {
  const now = new Date();
  return getGapRecords().filter((r) => new Date(r.nextReviewDate) <= now);
}

export function markReviewed(tag: string) {
  const records = getGapRecords().filter((r) => r.tag !== tag);
  localStorage.setItem(KEY, JSON.stringify(records));
}
