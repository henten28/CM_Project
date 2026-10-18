// ─────────────────────────────────────────────────────────────────────────────
// AMR Jagruti — Curated Content Library
// Source references: NCDC AMR materials for the public | Karnataka SAMASTA
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = "kn" | "en";

export interface ContentBlock {
  id: string;
  title: { kn: string; en: string };
  body: { kn: string; en: string };
  conceptTags: string[];
  difficulty: "basic" | "intermediate" | "advanced";
  source: string;
  moduleId: string;
  estimatedMinutes: number;
}

export const CONTENT_LIBRARY: ContentBlock[] = [
  // ── Module 1: What are antibiotics? ──────────────────────────────────────
  {
    id: "c001",
    moduleId: "m1",
    title: {
      kn: "ಪ್ರತಿಜೀವಕಗಳು ಎಂದರೇನು?",
      en: "What are antibiotics?",
    },
    body: {
      kn: "ಪ್ರತಿಜೀವಕಗಳು (antibiotics) ಬ್ಯಾಕ್ಟೀರಿಯಾ ಉಂಟುಮಾಡುವ ಸೋಂಕುಗಳನ್ನು ಗುಣಪಡಿಸಲು ವೈದ್ಯರು ಸೂಚಿಸುವ ಔಷಧಗಳು. ಅವು ವೈರಸ್‌ಗಳ ವಿರುದ್ಧ ಕಾರ್ಯ ಮಾಡುವುದಿಲ್ಲ. ಶೀತ, ಜ್ವರ ಅಥವಾ ಮೈಕಟ್ಟು ಇವು ಹೆಚ್ಚಾಗಿ ವೈರಸ್‌ನಿಂದ ಬರುತ್ತವೆ — ಇಂತಹ ಸಂದರ್ಭದಲ್ಲಿ ಪ್ರತಿಜೀವಕ ತೆಗೆದುಕೊಳ್ಳುವ ಅಗತ್ಯವಿಲ್ಲ.",
      en: "Antibiotics are medicines prescribed by doctors to treat infections caused by bacteria. They do NOT work against viruses. Common cold, flu, and most fevers are caused by viruses — antibiotics will not help and should not be taken in such cases.",
    },
    conceptTags: ["antibiotics", "bacteria", "virus", "basic-facts"],
    difficulty: "basic",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 3,
  },
  {
    id: "c002",
    moduleId: "m1",
    title: {
      kn: "ಪ್ರತಿಜೀವಕ vs ಪ್ರತಿ-ವೈರಲ್",
      en: "Antibiotics vs Antivirals",
    },
    body: {
      kn: "ಬ್ಯಾಕ್ಟೀರಿಯಾ ಸೋಂಕು (ಉದಾ: ಗಂಟಲು ನೋವು ಸ್ಟ್ರೆಪ್ಟೋಕಾಕಸ್, ಮೂತ್ರ ಸೋಂಕು, ಭೇದಿ) ಗೆ ಪ್ರತಿಜೀವಕ ಬೇಕು. ವೈರಸ್ ಸೋಂಕು (ಉದಾ: ಶೀತ, COVID-19, ಚಿಕೆನ್‌ಪಾಕ್ಸ್) ಗೆ ಪ್ರತಿಜೀವಕ ಬೇಡ. ಸರಿಯಾದ ರೋಗ ನಿರ್ಣಯ ಮಾಡಿ ನಂತರ ಔಷಧ ತೆಗೆದುಕೊಳ್ಳಿ.",
      en: "Bacterial infections (e.g., strep throat, urinary tract infections, dysentery) require antibiotics. Viral infections (e.g., common cold, COVID-19, chickenpox) do NOT. Always get a proper diagnosis before taking any antibiotic.",
    },
    conceptTags: ["antibiotics", "bacteria", "virus", "diagnosis"],
    difficulty: "basic",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 3,
  },

  // ── Module 2: What is AMR? ────────────────────────────────────────────────
  {
    id: "c003",
    moduleId: "m2",
    title: {
      kn: "ಪ್ರತಿಜೀವಕ ನಿರೋಧ (AMR) ಎಂದರೇನು?",
      en: "What is Antimicrobial Resistance (AMR)?",
    },
    body: {
      kn: "ಪ್ರತಿಜೀವಕ ನಿರೋಧ ಎಂದರೆ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಅಥವಾ ಇತರ ಸೂಕ್ಷ್ಮಾಣುಗಳು ಔಷಧದ ವಿರುದ್ಧ ಹೋರಾಡಿ ಬದುಕಿ ಉಳಿಯುವ ಶಕ್ತಿ ಗಳಿಸಿಕೊಳ್ಳುವುದು. ಇದರಿಂದ ಔಷಧ ಕೆಲಸ ಮಾಡದೇ ಸೋಂಕು ಗುಣವಾಗದೆ ಉಳಿಯಬಹುದು. ಇದು ಜಗತ್ತಿನ ಪ್ರಮುಖ ಆರೋಗ್ಯ ಬಿಕ್ಕಟ್ಟು.",
      en: "Antimicrobial Resistance (AMR) means bacteria or other microbes become able to survive despite being treated with antibiotics. When resistance occurs, the medicines stop working and infections become very difficult or impossible to treat. AMR is recognized as one of the world's biggest public health threats.",
    },
    conceptTags: ["AMR", "resistance", "public-health"],
    difficulty: "basic",
    source: "National Action Plan on AMR 2.0 (2025–29)",
    estimatedMinutes: 4,
  },
  {
    id: "c004",
    moduleId: "m2",
    title: {
      kn: "AMR ಏಕೆ ಹರಡುತ್ತದೆ?",
      en: "Why does AMR spread?",
    },
    body: {
      kn: "AMR ಹರಡಲು ಮುಖ್ಯ ಕಾರಣಗಳು: \n• ಅನಗತ್ಯ ಪ್ರತಿಜೀವಕ ಬಳಕೆ\n• ಅರ್ಧಕ್ಕೇ ಔಷಧ ನಿಲ್ಲಿಸುವುದು\n• ಬೇರೆಯವರಿಗೆ ಔಷಧ ಕೊಡುವುದು ಅಥವಾ ಉಳಿದ ಔಷಧ ಬಳಸುವುದು\n• ಪ್ರಾಣಿಗಳಿಗೆ ಅತಿ ಪ್ರತಿಜೀವಕ ನೀಡುವುದು",
      en: "AMR spreads mainly due to:\n• Using antibiotics when not needed\n• Stopping the antibiotic course early\n• Sharing antibiotics or using leftover medicine\n• Overuse of antibiotics in animals and agriculture",
    },
    conceptTags: ["AMR", "causes", "misuse"],
    difficulty: "intermediate",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 4,
  },

  // ── Module 3: Correct antibiotic use ─────────────────────────────────────
  {
    id: "c005",
    moduleId: "m3",
    title: {
      kn: "ಸರಿಯಾದ ರೀತಿಯಲ್ಲಿ ಪ್ರತಿಜೀವಕ ತೆಗೆದುಕೊಳ್ಳಿ",
      en: "Take antibiotics correctly",
    },
    body: {
      kn: "ವೈದ್ಯರು ಸೂಚಿಸಿದ ಪ್ರಮಾಣ ಮತ್ತು ಸಮಯದಲ್ಲಿ ಔಷಧ ತೆಗೆದುಕೊಳ್ಳಿ. ಸ್ವಲ್ಪ ಚೇತರಿಕೆ ಕಂಡರೂ ಸಹ ವೈದ್ಯರು ಹೇಳಿದ ದಿನಗಳವರೆಗೆ ಔಷಧ ತೆಗೆದುಕೊಳ್ಳಿ. ನಡೆಯದಿದ್ದರೆ ಅಥವಾ ಅಡ್ಡ ಪರಿಣಾಮ ಕಂಡರೆ ವೈದ್ಯರ ಬಳಿ ತೆರಳಿ.",
      en: "Take the antibiotic exactly as prescribed — correct dose, at the correct time. Even if you feel better, complete the full course the doctor prescribed. Do not skip doses. If you experience side effects or do not improve, return to the doctor.",
    },
    conceptTags: ["correct-use", "dosage", "compliance"],
    difficulty: "basic",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 3,
  },
  {
    id: "c006",
    moduleId: "m3",
    title: {
      kn: "ಪೂರ್ಣ ಡೋಸ್ ಏಕೆ ಮುಖ್ಯ?",
      en: "Why completing the full course matters",
    },
    body: {
      kn: "ಔಷಧ ನಡೆಯ ಅರ್ಧಕ್ಕೆ ನಿಲ್ಲಿಸಿದರೆ ಬಲಶಾಲಿ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಉಳಿದು ನಿರೋಧ ಶಕ್ತಿ ಗಳಿಸಬಹುದು. ಮುಂದೆ ಅದೇ ಔಷಧ ಕೆಲಸ ಮಾಡದೇ ಹೋಗಬಹುದು. 'ಜ್ವರ ಇಳಿಯಿತು, ಔಷಧ ನಿಲ್ಲಿಸಿದೆ' ಎಂಬ ಸಾಮಾನ್ಯ ತಪ್ಪು ಮಾಡಬೇಡಿ.",
      en: "Stopping the antibiotic early — even if you feel better — allows the stronger bacteria to survive, adapt, and become resistant. The same medicine may not work the next time you need it. 'Fever is gone so I stopped' is one of the most common and dangerous mistakes.",
    },
    conceptTags: ["full-course", "resistance", "compliance"],
    difficulty: "intermediate",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 4,
  },

  // ── Module 4: Not sharing medicine ───────────────────────────────────────
  {
    id: "c007",
    moduleId: "m4",
    title: {
      kn: "ಔಷಧ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ",
      en: "Never share antibiotics",
    },
    body: {
      kn: "ನಿಮಗೆ ಸೂಚಿಸಿದ ಪ್ರತಿಜೀವಕ ಬೇರೆ ವ್ಯಕ್ತಿಗೆ ಕೊಡಬೇಡಿ. ಪ್ರತಿ ಸೋಂಕು ಬೇರೆ ಬ್ಯಾಕ್ಟೀರಿಯಾದಿಂದ ಬರಬಹುದು; ಬೇರೆ ಔಷಧ ಬೇಕಾಗಬಹುದು. ಉಳಿದ ಔಷಧ ನಂತರ ಬಳಸಲು ಇಟ್ಟುಕೊಳ್ಳಬೇಡಿ — ಆರೋಗ್ಯ ಕೇಂದ್ರದಲ್ಲಿ ಸರಿಯಾಗಿ ವಿಲೇವಾರಿ ಮಾಡಿ.",
      en: "Never give your antibiotic to another person. Each infection may be caused by different bacteria that need different treatment. Do not save leftover antibiotics for later use — return them to a health centre for proper disposal.",
    },
    conceptTags: ["sharing", "leftover", "safe-disposal"],
    difficulty: "basic",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 3,
  },
  {
    id: "c008",
    moduleId: "m4",
    title: {
      kn: "ಔಷಧ ಅಂಗಡಿಯಲ್ಲಿ ಪ್ರತಿಜೀವಕ ತೆಗೆದುಕೊಳ್ಳುವ ಅಪಾಯ",
      en: "Danger of buying antibiotics without prescription",
    },
    body: {
      kn: "ವೈದ್ಯರ ಚೀಟಿ ಇಲ್ಲದೆ ಮೆಡಿಕಲ್ ಅಂಗಡಿಯಿಂದ ಪ್ರತಿಜೀವಕ ಕೊಂಡರೆ ತಪ್ಪು ಔಷಧ, ತಪ್ಪು ಪ್ರಮಾಣ ಸಾಧ್ಯ. ಇದರಿಂದ ಸೋಂಕು ಗುಣವಾಗದೆ ನಿರೋಧ ಶಕ್ತಿ ಹೆಚ್ಚಾಗಬಹುದು. ಸರ್ಕಾರದ ನಿಯಮ ಪ್ರಕಾರ ಪ್ರತಿಜೀವಕ ವೈದ್ಯರ ಚೀಟಿ ಇಲ್ಲದೆ ಮಾರಬಾರದು.",
      en: "Buying antibiotics from a shop without a prescription risks getting the wrong medicine or wrong dose. This may fail to cure the infection and accelerate resistance. By regulation, antibiotics should only be dispensed on a valid doctor's prescription.",
    },
    conceptTags: ["prescription", "self-medication", "regulation"],
    difficulty: "intermediate",
    source: "National Action Plan on AMR 2.0 (2025–29)",
    estimatedMinutes: 4,
  },

  // ── Module 5: When to see a doctor ───────────────────────────────────────
  {
    id: "c009",
    moduleId: "m5",
    title: {
      kn: "ವೈದ್ಯರ ಬಳಿ ಯಾವಾಗ ಹೋಗಬೇಕು?",
      en: "When should you see a doctor?",
    },
    body: {
      kn: "ಈ ಸಂದರ್ಭಗಳಲ್ಲಿ ತಕ್ಷಣ ವೈದ್ಯರ ಬಳಿ ತೆರಳಿ:\n• 3 ದಿನಕ್ಕಿಂತ ಹೆಚ್ಚಾಗಿ ಜ್ವರ ಇದ್ದರೆ\n• ಮಕ್ಕಳಿಗೆ 38°C ಮೇಲೆ ಜ್ವರ\n• ಉಸಿರಾಟ ನೋವು ಅಥವಾ ಕಷ್ಟ\n• ತೊಳೆಯದ ಭೇದಿ ಅಥವಾ ರಕ್ತ\n• ಯಾವುದೇ ಔಷಧಕ್ಕೆ ಹಿಂದಿರುವ ಪ್ರತಿಕ್ರಿಯೆ",
      en: "See a doctor immediately if you have:\n• Fever lasting more than 3 days\n• Fever above 38°C in a child\n• Difficulty breathing or chest pain\n• Severe or bloody diarrhea\n• Any suspected reaction to a medicine\n\nDo not wait — early treatment is always safer.",
    },
    conceptTags: ["when-to-seek-care", "referral", "warning-signs"],
    difficulty: "basic",
    source: "Karnataka SAMASTA platform",
    estimatedMinutes: 3,
  },
  {
    id: "c010",
    moduleId: "m5",
    title: {
      kn: "ASHA ಕಾರ್ಯಕರ್ತೆಯ ಪಾತ್ರ",
      en: "The ASHA worker's role",
    },
    body: {
      kn: "ASHA ಕಾರ್ಯಕರ್ತೆ ಶಿಕ್ಷಣ ನೀಡಬಹುದು ಮತ್ತು ಸೂಕ್ತ ಆರೋಗ್ಯ ಕೇಂದ್ರಕ್ಕೆ ಉಲ್ಲೇಖಿಸಬಹುದು. ಆದರೆ ಔಷಧ ಸೂಚಿಸುವ ಅಧಿಕಾರ ವೈದ್ಯರಿಗೆ ಮಾತ್ರ. AMR ಜಾಗೃತಿ ಸೃಷ್ಟಿಸುವುದೇ ASHA ಕಾರ್ಯಕರ್ತೆಯ ಪ್ರಮುಖ ಕೊಡುಗೆ.",
      en: "An ASHA worker can educate community members and refer them to the appropriate health facility. Only a qualified doctor can prescribe medicines. Raising awareness about AMR is one of the most powerful contributions an ASHA can make.",
    },
    conceptTags: ["ASHA-role", "referral", "education"],
    difficulty: "basic",
    source: "Karnataka SAMASTA platform",
    estimatedMinutes: 3,
  },

  // ── Module 6: Infection prevention ───────────────────────────────────────
  {
    id: "c011",
    moduleId: "m6",
    title: {
      kn: "ಸೋಂಕು ತಡೆಗಟ್ಟಿ — ಪ್ರತಿಜೀವಕ ಅಗತ್ಯ ಕಡಿಮೆ ಮಾಡಿ",
      en: "Prevent infections — reduce antibiotic need",
    },
    body: {
      kn: "ಸೋಂಕು ಬರದಂತೆ ತಡೆದರೆ ಪ್ರತಿಜೀವಕ ಬೇಕಾಗುವುದೇ ಕಡಿಮೆ:\n• ಕೈ ಸರಿಯಾಗಿ ತೊಳೆಯಿರಿ\n• ಶೌಚಾಲಯ ಬಳಸಿ — ಬಯಲು ಶೌಚ ಬೇಡ\n• ಶುದ್ಧ ನೀರು ಕುಡಿಯಿರಿ\n• ಲಸಿಕೆ ನೀಡಿಸಿ (ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ)\n• ಮನೆ-ಸುತ್ತಮುತ್ತ ಸ್ವಚ್ಛತೆ ಕಾಪಾಡಿ",
      en: "Preventing infections means fewer antibiotics are needed:\n• Wash hands properly with soap\n• Use toilets — avoid open defecation\n• Drink clean, safe water\n• Vaccinate on time (children and adults)\n• Maintain cleanliness at home and surroundings",
    },
    conceptTags: ["prevention", "hygiene", "vaccination"],
    difficulty: "basic",
    source: "Karnataka SAMASTA platform",
    estimatedMinutes: 4,
  },
  {
    id: "c012",
    moduleId: "m6",
    title: {
      kn: "ಕೈ ತೊಳೆಯುವ ಸರಿಯಾದ ರೀತಿ",
      en: "Correct handwashing technique",
    },
    body: {
      kn: "6 ಹಂತದಲ್ಲಿ ಕೈ ತೊಳೆಯಿರಿ:\n1. ನೀರಿನಲ್ಲಿ ಕೈ ಒದ್ದೆ ಮಾಡಿ\n2. ಸಾಬೂನು ಹಚ್ಚಿ\n3. 20 ಸೆಕೆಂಡ್ ಕೈ ಉಜ್ಜಿ — ಬೆರಳಿನ ನಡುವೆ, ಉಗುರು ಕೆಳಗೆ\n4. ನೀರಿನಿಂದ ತೊಳೆಯಿರಿ\n5. ಸ್ವಚ್ಛ ಬಟ್ಟೆಯಿಂದ ಒರೆಸಿ\n6. ನಲ್ಲಿ ಮುಚ್ಚಿ (ಬಟ್ಟೆಯಿಂದ)",
      en: "Wash hands in 6 steps:\n1. Wet hands with clean water\n2. Apply soap\n3. Rub for 20 seconds — between fingers, under nails\n4. Rinse thoroughly\n5. Dry with a clean cloth\n6. Turn off tap (using the cloth)\n\nKey moments: before eating, after toilet, before handling food, after touching animals.",
    },
    conceptTags: ["handwashing", "hygiene", "prevention"],
    difficulty: "basic",
    source: "Karnataka SAMASTA platform",
    estimatedMinutes: 3,
  },

  // ── Module 7: AMR scenarios / case studies ────────────────────────────────
  {
    id: "c013",
    moduleId: "m7",
    title: {
      kn: "ಉದಾಹರಣೆ: ರಾಮಣ್ಣನ ಕಥೆ",
      en: "Case study: Ramanna's story",
    },
    body: {
      kn: "ರಾಮಣ್ಣ ಶೀತಕ್ಕೆ ಪ್ರತಿಜೀವಕ ತೆಗೆದುಕೊಂಡರು. 2 ದಿನದಲ್ಲಿ ಚೇತರಿಕೆ ಕಂಡು ಔಷಧ ನಿಲ್ಲಿಸಿದರು. ಉಳಿದ ಮಾತ್ರೆ ಡಬ್ಬಿಯಲ್ಲಿ ಇಟ್ಟರು. ಒಂದು ವಾರದ ನಂತರ ಮೂತ್ರ ಸೋಂಕು ಬಂದಿತು; ಅದೇ ಉಳಿದ ಮಾತ್ರೆ ಬಳಸಿದರು. ಈ ಬಾರಿ ಔಷಧ ಕೆಲಸ ಮಾಡದೆ ಆಸ್ಪತ್ರೆ ಸೇರಬೇಕಾಯಿತು.\n\nಎಲ್ಲಿ ತಪ್ಪಾಯಿತು?",
      en: "Ramanna took an antibiotic for a cold. He felt better in 2 days and stopped the medicine. He kept the remaining tablets. A week later he got a urinary tract infection and used the leftover tablets. This time the medicine didn't work and he had to be hospitalised.\n\nWhere did things go wrong?",
    },
    conceptTags: ["case-study", "misuse", "full-course"],
    difficulty: "intermediate",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 5,
  },
  {
    id: "c014",
    moduleId: "m7",
    title: {
      kn: "ಉದಾಹರಣೆ: ಸಾವಿತ್ರಮ್ಮ ಮತ್ತು ಮಗು",
      en: "Case study: Savithramma and her child",
    },
    body: {
      kn: "ಸಾವಿತ್ರಮ್ಮ ಮಗುವಿಗೆ ಜ್ವರ ಬಂದಾಗ ಅಕ್ಕಪಕ್ಕದ ಮಗು ಬಳಸಿದ ಪ್ರತಿಜೀವಕ ತಂದರು. ಆ ಮಗುವಿಗೆ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಸೋಂಕು ಇತ್ತು; ಇವರ ಮಗುವಿಗೆ ವೈರಸ್ ಜ್ವರ ಇತ್ತು. ಔಷಧ ಬಳಸಿದ ನಂತರ ಮಗುವಿಗೆ ಅಲರ್ಜಿ ಪ್ರತಿಕ್ರಿಯೆ ಬಂತು.\n\nತಡೆಯಬಹುದಾಗಿದ್ದ ಹೇಗೆ?",
      en: "Savithramma's child had a fever. She borrowed an antibiotic from a neighbour whose child had taken it. Her neighbour's child had a bacterial infection; her child had a viral fever. After taking the borrowed medicine, her child had an allergic reaction.\n\nHow could this have been prevented?",
    },
    conceptTags: ["case-study", "sharing", "allergy", "virus"],
    difficulty: "intermediate",
    source: "NCDC AMR Education Materials (public)",
    estimatedMinutes: 5,
  },
  {
    id: "c015",
    moduleId: "m7",
    title: {
      kn: "ಸಮುದಾಯ ನಾಯಕರ ಪಾತ್ರ",
      en: "Role of community leaders in AMR",
    },
    body: {
      kn: "ಗ್ರಾಮ ಪಂಚಾಯತ್, ಶಾಲಾ ಶಿಕ್ಷಕರು, ಸ್ವ-ಸಹಾಯ ಗುಂಪು ನಾಯಕರು — ಎಲ್ಲರೂ AMR ಜಾಗೃತಿಯಲ್ಲಿ ಪಾಲ್ಗೊಳ್ಳಬಹುದು. ASHA ಕಾರ್ಯಕರ್ತೆ ಈ ನಾಯಕರೊಂದಿಗೆ ಕೆಲಸ ಮಾಡಿ ಸಂದೇಶ ಹರಡಬಹುದು.",
      en: "Village panchayat members, school teachers, and self-help group leaders can all participate in AMR awareness. The ASHA worker can partner with these community leaders to amplify the message across the community.",
    },
    conceptTags: ["community", "leadership", "awareness", "ASHA-role"],
    difficulty: "advanced",
    source: "Karnataka SAMASTA platform",
    estimatedMinutes: 4,
  },
];

export const MODULES = [
  { id: "m1", title: { kn: "ಪ್ರತಿಜೀವಕಗಳು ಏನು?", en: "What are antibiotics?" }, icon: "💊", estimatedMinutes: 6 },
  { id: "m2", title: { kn: "AMR ಎಂದರೇನು?", en: "What is AMR?" }, icon: "🦠", estimatedMinutes: 8 },
  { id: "m3", title: { kn: "ಸರಿಯಾದ ಬಳಕೆ", en: "Correct use" }, icon: "✅", estimatedMinutes: 7 },
  { id: "m4", title: { kn: "ಹಂಚಿಕೊಳ್ಳಬೇಡಿ", en: "Don't share" }, icon: "🚫", estimatedMinutes: 7 },
  { id: "m5", title: { kn: "ಯಾವಾಗ ವೈದ್ಯರ ಬಳಿ?", en: "When to seek care" }, icon: "🏥", estimatedMinutes: 6 },
  { id: "m6", title: { kn: "ಸೋಂಕು ತಡೆ", en: "Infection prevention" }, icon: "🧼", estimatedMinutes: 7 },
  { id: "m7", title: { kn: "ಕೇಸ್ ಸ್ಟಡಿ", en: "Case studies" }, icon: "📖", estimatedMinutes: 10 },
];

export function getBlocksByModule(moduleId: string): ContentBlock[] {
  return CONTENT_LIBRARY.filter((b) => b.moduleId === moduleId);
}

export function searchBlocks(tags: string[], lang: Lang = "kn"): ContentBlock[] {
  if (!tags.length) return CONTENT_LIBRARY.slice(0, 3);
  return CONTENT_LIBRARY.filter((b) =>
    tags.some((t) => b.conceptTags.includes(t))
  );
}
