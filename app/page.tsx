"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getProfile, type AshaProfile } from "@/lib/profile-store";
import { getDueReviews } from "@/lib/spaced-repetition";
import { getMySessions, startSession, type MySession } from "@/lib/api-client";
import { useUser } from "@/lib/auth-client";
import { useLang, tr } from "@/lib/prefs";
import { SiteHeader, SiteFooter, KeyMessageTicker } from "@/components/SiteChrome";

const TOPICS: { value: string; kn: string; en: string; hi: string; img: string }[] = [
  { value: "general", kn: "ಸಾಮಾನ್ಯ AMR ಅರಿವು", en: "General AMR awareness", hi: "सामान्य AMR जागरूकता", img: "/img/step3.svg" },
  { value: "antibiotics", kn: "ಪ್ರತಿಜೀವಕಗಳು ಎಂದರೇನು?", en: "What are antibiotics?", hi: "एंटीबायोटिक्स क्या हैं?", img: "/img/m1.svg" },
  { value: "amr", kn: "AMR / ಪ್ರತಿಜೀವಕ ನಿರೋಧ", en: "AMR / resistance", hi: "AMR / प्रतिरोध", img: "/img/m2.svg" },
  { value: "prevention", kn: "ಸೋಂಕು ತಡೆಗಟ್ಟುವಿಕೆ", en: "Infection prevention", hi: "संक्रमण रोकथाम", img: "/img/m6.svg" },
  { value: "sharing", kn: "ಔಷಧ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ", en: "Don't share medicines", hi: "दवाएं साझा न करें", img: "/img/m4.svg" },
  { value: "case study", kn: "ಕೇಸ್ ಸ್ಟಡಿ", en: "Case studies", hi: "केस अध्ययन", img: "/img/m7.svg" },
];
const DURATIONS = [5, 10, 15] as const;

const STATE_LABEL: Record<string, [string, string, string]> = {
  AWAITING_APPROVAL: ["ಅನುಮೋದನೆ ಬಾಕಿ", "Awaiting approval", "अनुमोदन बाकी"],
  IN_PROGRESS: ["ನಡೆಯುತ್ತಿದೆ", "In progress", "जारी"],
  SAFETY_HOLD: ["ಸುರಕ್ಷತಾ ತಡೆ", "Safety hold", "सुरक्षा रोक"],
  COMPLETED: ["ಪೂರ್ಣ", "Completed", "पूर्ण"],
};

function HomeContent() {
  const [lang] = useLang();
  const L = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);
  const fk = lang === "kn" ? "kn" : "";
  const user = useUser();
  const router = useRouter();
  const denied = useSearchParams().get("denied");
  const isAsha = user?.role === "asha";

  const [topic, setTopic] = useState("general");
  const [duration, setDuration] = useState<5 | 10 | 15>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AshaProfile | null>(null);
  const [dueReviews, setDueReviews] = useState<{ tag: string; label: Record<string, string> }[]>([]);
  const [mine, setMine] = useState<MySession[] | null>(null);

  useEffect(() => {
    // profile extras and review reminders stay in this browser (localStorage), read after the first render
    Promise.resolve().then(() => { setProfile(getProfile()); setDueReviews(getDueReviews()); });
  }, []);

  useEffect(() => {
    if (isAsha) getMySessions().then(setMine).catch(() => setMine([]));
  }, [isAsha]);

  async function handleStart() {
    setLoading(true); setError(null);
    try {
      // earlier quiz gaps go to the planning agent, which puts them first
      const data = await startSession({ topic, durationMinutes: duration, lang, priorGaps: dueReviews.map((r) => r.tag) });
      router.push(`/session?id=${encodeURIComponent(data.sessionId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session");
      setLoading(false);
    }
  }

  const topicLabel = (value: string) => {
    const t = TOPICS.find((x) => x.value === value);
    return t ? tr(lang, t.kn, t.en, t.hi) : value;
  };
  const done = (mine ?? []).filter((s) => s.state === "COMPLETED");
  const scored = done.filter((s) => s.quizScore !== null);
  const avg = scored.length ? Math.round(scored.reduce((n, s) => n + (s.quizScore ?? 0), 0) / scored.length) : null;

  const badges = [
    { cls: "fb1", icon: "🔤", bg: "#e3eefc", label: L("ಕನ್ನಡ-ಮೊದಲ", "Kannada-first", "कन्नड़-प्रथम") },
    { cls: "fb2", icon: "🎙️", bg: "#fde2e4", label: L("ಧ್ವನಿ ಬೆಂಬಲ", "Voice support", "वॉयस सपोर्ट") },
    { cls: "fb3", icon: "🛡️", bg: "#d8f3dc", label: L("ಸುರಕ್ಷತಾ ಪರಿಶೀಲನೆ", "Safety-checked", "सुरक्षा जांच") },
    { cls: "fb4", icon: "🤖", bg: "#fff3cd", label: L("4 ತಜ್ಞ ಏಜೆಂಟ್", "4 specialist agents", "4 विशेषज्ञ एजेंट") },
  ];

  // Figure 1 of the proposal
  const steps = [
    { c: "#6a4c93", img: "/img/step1.svg", title: L("ಯೋಜನಾ ಏಜೆಂಟ್", "Planning agent", "योजना एजेंट"),
      text: L("ವಿಷಯ, ಸಮಯ ಮತ್ತು ಹಿಂದಿನ ಕೊರತೆಗಳಿಗೆ ತಕ್ಕಂತೆ ಅನುಮೋದಿತ ಪಾಠಗಳಿಂದ ಯೋಜನೆ ರಚಿಸುತ್ತದೆ.",
              "Builds a lesson plan from approved lessons for the topic, time and earlier gaps.",
              "विषय, समय और पिछली कमियों के अनुसार स्वीकृत पाठों से योजना बनाता है।") },
    { c: "#e07a2f", img: "/img/step2.svg", title: L("ASHA ಪರಿಶೀಲನೆ", "ASHA reviews", "ASHA समीक्षा"),
      text: L("ASHA ಕಾರ್ಯಕರ್ತೆ ಯೋಜನೆಯನ್ನು ಅನುಮೋದಿಸುತ್ತಾರೆ ಅಥವಾ ತಿರಸ್ಕರಿಸುತ್ತಾರೆ.",
              "The ASHA worker approves or rejects the plan before anything is taught.",
              "कुछ भी सिखाने से पहले ASHA योजना को स्वीकृत या अस्वीकार करती हैं।") },
    { c: "#1d3557", img: "/img/step3.svg", title: L("ಶಿಕ್ಷಕ + ಹುಡುಕಾಟ ಏಜೆಂಟ್", "Tutor + retrieval agents", "ट्यूटर + पुनर्प्राप्ति एजेंट"),
      text: L("ಪಾಠ ಮತ್ತು ರಸಪ್ರಶ್ನೆ; ತಪ್ಪು ಉತ್ತರಗಳಿಗೆ ಅನುಮೋದಿತ ಪುನರ್ಬಲನ. ಅಂಕ ಸ್ಥಿರ ನಿಯಮಗಳಿಂದ.",
              "Lesson and checkpoint quiz; wrong answers get approved reinforcement. Fixed rules score.",
              "पाठ और प्रश्नोत्तरी; गलत उत्तरों पर स्वीकृत सामग्री। स्कोर तय नियमों से।") },
    { c: "#2d6a4f", img: "/img/step4.svg", title: L("ಸಾರಾಂಶ ಏಜೆಂಟ್", "Summary agent", "सारांश एजेंट"),
      text: L("ಕಲಿತದ್ದು, ಉಳಿದ ಕೊರತೆಗಳು ಮತ್ತು ಮುಂದಿನ ಭೇಟಿಯ ಸಲಹೆ ಮೇಲ್ವಿಚಾರಕರಿಗೆ ತಲುಪುತ್ತದೆ.",
              "What was learned, open gaps and a next-visit suggestion reach the supervisor.",
              "क्या सीखा, बची कमियां और अगली मुलाकात का सुझाव पर्यवेक्षक तक पहुंचता है।") },
  ];

  return (
    <div className="portal">
      <SiteHeader />
      <KeyMessageTicker />
      <main>
        {denied && (
          <div className="wrap" style={{ paddingTop: 16 }}>
            <div className={`notice-bar ${fk}`} role="alert">
              {L("ಆ ಪುಟ ನಿಮ್ಮ ಪಾತ್ರಕ್ಕೆ ಲಭ್ಯವಿಲ್ಲ.", "That page is not available for your role.", "वह पेज आपकी भूमिका के लिए उपलब्ध नहीं है।")} ({denied})
            </div>
          </div>
        )}

        {/* Hero */}
        <section className="hero2">
          <div className="wrap hero2-grid">
            <div>
              <span className="chip"><span>🌿</span><span className={fk}>{L("ಆರೋಗ್ಯ ಶಿಕ್ಷಣ ಅಪ್ • AMR ಜಾಗೃತಿ", "Health education app • AMR awareness", "स्वास्थ्य शिक्षा ऐप • AMR जागरूकता")}</span></span>
              <h1 className={fk}>{L("ಒಂದೊಂದೇ ಮನೆಯಲ್ಲಿ AMR ಅರಿವು", "Bridging the AMR awareness gap, one household at a time", "हर घर तक AMR जागरूकता")}</h1>
              <p className={fk}>{L("ASHA ಕಾರ್ಯಕರ್ತೆಯರು ಮನೆ ಭೇಟಿಯಲ್ಲಿ ಚಿಕ್ಕ, ಸಂವಾದಾತ್ಮಕ AMR ಅಧಿವೇಶನ ನಡೆಸಲು ಸಹಾಯ ಮಾಡುವ ಬಹು-ಏಜೆಂಟ್, ಕನ್ನಡ-ಮೊದಲ ಅಪ್.",
                "A multi-agent, Kannada-first app that helps ASHA workers run short, interactive AMR sessions during household visits.",
                "एक बहु-एजेंट, कन्नड़-प्रथम ऐप जो ASHA कार्यकर्ताओं को घर के दौरों में छोटे AMR सत्र चलाने में मदद करता है।")}</p>
              <div className="hero2-cta">
                {isAsha ? (
                  <a href="#start" className={`btn btn-primary btn-lg ${fk}`}>{L("ಅಧಿವೇಶನ ಪ್ರಾರಂಭಿಸಿ →", "Start a session →", "सत्र शुरू करें →")}</a>
                ) : user === null ? (
                  <Link href="/login" className={`btn btn-primary btn-lg ${fk}`}>{L("ASHA / ಮೇಲ್ವಿಚಾರಕ ಸೈನ್ ಇನ್", "ASHA / supervisor sign in", "ASHA / पर्यवेक्षक साइन इन")}</Link>
                ) : null}
                <Link href="/quiz" className={`btn btn-outline btn-lg ${fk}`}>✅ {L("ರಸಪ್ರಶ್ನೆ ತೆಗೆದುಕೊಳ್ಳಿ", "Take a quiz", "प्रश्नोत्तरी दें")}</Link>
                <Link href="/learn" className={`btn btn-outline btn-lg ${fk}`}>📚 {L("ಕಲಿಕಾ ಗ್ರಂಥಾಲಯ", "Learning library", "सीखने की लाइब्रेरी")}</Link>
              </div>
            </div>
            <div className="hero-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/hero.svg" alt={L("ಮನೆಗೆ ಭೇಟಿ ನೀಡಿದ ASHA ಕಾರ್ಯಕರ್ತೆ", "An ASHA worker visiting a mother and child at home", "घर पर मां और बच्चे से मिलती ASHA कार्यकर्ता")} />
              {badges.map((b) => (
                <div key={b.cls} className={`float-badge ${b.cls} ${fk}`}><span className="fb-icon" style={{ background: b.bg }}>{b.icon}</span>{b.label}</div>
              ))}
            </div>
          </div>
        </section>

        {/* ASHA: start a household session */}
        {isAsha && (
          <section id="start" className="section">
            <div className="wrap">
              <h2 className={`section-title ${fk}`}>{L("ಮನೆ ಅಧಿವೇಶನ ಪ್ರಾರಂಭಿಸಿ", "Start a household session", "घर पर सत्र शुरू करें")}</h2>
              <p className={`section-sub ${fk}`}>{L("ವಿಷಯ ಮತ್ತು ಸಮಯ ಆಯ್ಕೆ ಮಾಡಿ. ಭಾಷೆಯನ್ನು ಮೇಲಿನ ಪಟ್ಟಿಯಲ್ಲಿ ಬದಲಾಯಿಸಿ.",
                "Pick a topic and how long you have. Change the language from the bar at the top.",
                "विषय और समय चुनें। भाषा ऊपर की पट्टी से बदलें।")}</p>
              <div className="start-panel">
                <div className="card-elevated">
                  <label className={`block text-sm font-bold mb-3 ${fk}`} style={{ color: "var(--primary)" }}>{L("ಇಂದಿನ ವಿಷಯ", "Today's topic", "आज का विषय")}</label>
                  <div className="topic-grid" role="radiogroup" aria-label="Topic">
                    {TOPICS.map((tp) => (
                      <button key={tp.value} id={`topic-${tp.value.replace(" ", "-")}`} role="radio" aria-checked={topic === tp.value}
                        className={`topic-card ${topic === tp.value ? "on" : ""} ${fk}`} onClick={() => setTopic(tp.value)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tp.img} alt="" />{tr(lang, tp.kn, tp.en, tp.hi)}
                      </button>
                    ))}
                  </div>
                  <label className={`block text-sm font-bold mt-4 mb-2 ${fk}`} style={{ color: "var(--primary)" }}>{L("ಲಭ್ಯ ಸಮಯ (ನಿಮಿಷ)", "Time available (minutes)", "उपलब्ध समय (मिनट)")}</label>
                  <div className="flex gap-2">
                    {DURATIONS.map((m) => (
                      <button key={m} id={`time-${m}`} aria-pressed={duration === m} className={`time-btn ${duration === m ? "on" : ""}`} onClick={() => setDuration(m)}>{m}</button>
                    ))}
                  </div>
                  {error && <div className="login-error mt-3" role="alert">{error}</div>}
                  <button id="start-session-btn" className={`btn btn-primary btn-full btn-lg mt-4 ${fk}`} onClick={handleStart} disabled={loading}>
                    {loading ? <span className="spinner" /> : L("ಅಧಿವೇಶನ ಪ್ರಾರಂಭಿಸಿ →", "Start session →", "सत्र शुरू करें →")}
                  </button>
                  <p className={`text-xs text-muted mt-2 ${fk}`}>{L("ಯೋಜನಾ ಏಜೆಂಟ್ ಪಾಠ ಯೋಜನೆ ಸಿದ್ಧಪಡಿಸುತ್ತದೆ; ನೀವು ಅನುಮೋದಿಸಿದ ನಂತರವೇ ಪಾಠ ಆರಂಭ.",
                    "The planning agent drafts a lesson plan; teaching starts only after you approve it.",
                    "योजना एजेंट पाठ योजना बनाता है; आपकी स्वीकृति के बाद ही पढ़ाई शुरू होती है।")}</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="card" style={{ background: "linear-gradient(135deg,var(--green-50),var(--amber-100))", border: "1.5px solid var(--green-600)" }}>
                    <div className={`font-bold text-primary ${fk}`}>👋 {L("ಸ್ವಾಗತ", "Welcome", "स्वागत")}, {user?.name}</div>
                    <div className="text-xs text-muted mt-1">
                      {[profile?.block || user?.block, profile?.district || user?.district].filter(Boolean).join(", ")}
                      {mine && <> · {L("ಅಧಿವೇಶನ", "Sessions", "सत्र")}: {mine.length} · {L("ಪೂರ್ಣ", "Completed", "पूर्ण")}: {done.length}{avg !== null && <> · {L("ಸರಾಸರಿ", "Avg", "औसत")} {avg}%</>}</>}
                    </div>
                  </div>
                  {dueReviews.length > 0 && (
                    <div className="card" style={{ background: "#fff8e1", border: "1.5px solid var(--amber-500)" }}>
                      <div className={`text-sm font-bold mb-2 ${fk}`} style={{ color: "var(--amber-900)" }}>📚 {L("ಪುನರಾವಲೋಕನ ಬಾಕಿ (ಯೋಜನೆಗೆ ಸೇರಿಸಲಾಗುತ್ತದೆ):", "Due for review (added to the plan):", "समीक्षा बाकी (योजना में जोड़ा जाएगा):")}</div>
                      <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                        {dueReviews.map((r) => <span key={r.tag} className={`badge badge-amber ${fk}`}>{r.label[lang] ?? r.tag}</span>)}
                      </div>
                    </div>
                  )}
                  <div className="card">
                    <div className={`font-bold text-sm mb-2 ${fk}`} style={{ color: "var(--primary)" }}>🕘 {L("ನನ್ನ ಇತ್ತೀಚಿನ ಅಧಿವೇಶನಗಳು", "My recent sessions", "मेरे हाल के सत्र")}</div>
                    {mine === null ? <span className="spinner" /> : mine.length === 0 ? (
                      <p className={`text-sm text-muted ${fk}`}>{L("ಇನ್ನೂ ಯಾವ ಅಧಿವೇಶನವೂ ಇಲ್ಲ.", "No sessions yet.", "अभी कोई सत्र नहीं।")}</p>
                    ) : (
                      <ul className="recent-list">
                        {mine.slice(0, 5).map((s) => (
                          <li key={s.id}>
                            <Link href={`/session?id=${encodeURIComponent(s.id)}`}>
                              <span className={fk}>{topicLabel(s.topic)}</span>
                              <span className="text-xs text-muted"> · {s.durationMin} min · {tr(lang, ...(STATE_LABEL[s.state] ?? [s.state, s.state, s.state]))}{s.quizScore !== null ? ` · ${s.quizScore}%` : ""}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="card">
                    <div className={`font-bold text-sm mb-2 ${fk}`} style={{ color: "var(--primary)" }}>📝 {L("ಹಂಚಿಕೊಳ್ಳಲು ರಸಪ್ರಶ್ನೆ", "A quiz to share", "साझा करने के लिए प्रश्नोत्तरी")}</div>
                    <div className={`text-sm text-muted mb-3 ${fk}`}>{L("ಮೂಲ ದಾಖಲೆಗಳಿಂದ AI ರಸಪ್ರಶ್ನೆ ರಚಿಸಿ, ಪರಿಶೀಲಿಸಿ, ಪ್ರಕಟಿಸಿ ಮತ್ತು ಲಿಂಕ್ ಕುಟುಂಬಗಳಿಗೆ ಕಳುಹಿಸಿ.",
                      "Have the AI draft a quiz from source documents, review it, publish it and send the link to households.",
                      "स्रोत दस्तावेज़ों से AI प्रश्नोत्तरी बनवाएं, जांचें, प्रकाशित करें और लिंक परिवारों को भेजें।")}</div>
                    <Link href="/quiz-builder" className={`btn btn-outline btn-full ${fk}`}>{L("ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ →", "Prepare a quiz →", "प्रश्नोत्तरी बनाएं →")}</Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Signed out: who uses the app */}
        {user === null && (
          <section id="start" className="section">
            <div className="wrap">
              <h2 className={`section-title ${fk}`}>{L("ಯಾರಿಗಾಗಿ?", "Who is it for?", "किसके लिए?")}</h2>
              <div className="services" style={{ marginTop: 20 }}>
                <Link href="/login?next=/" className="service-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/img/step1.svg" alt="" />
                  <h3 className={fk}>👩‍⚕️ {L("ASHA ಕಾರ್ಯಕರ್ತೆ", "ASHA worker", "ASHA कार्यकर्ता")}</h3>
                  <p className={fk}>{L("ಸೈನ್ ಇನ್ ಮಾಡಿ ಮನೆ ಅಧಿವೇಶನ ನಡೆಸಿ, ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ, ಭೇಟಿ ದಾಖಲಿಸಿ.", "Sign in to run household sessions, prepare quizzes and log visits.", "साइन इन करके सत्र चलाएं, प्रश्नोत्तरी बनाएं, दौरे दर्ज करें।")}</p>
                  <span className="go">→</span>
                </Link>
                <Link href="/login?next=/dashboard" className="service-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/img/step4.svg" alt="" />
                  <h3 className={fk}>🧑‍💼 {L("ಮೇಲ್ವಿಚಾರಕ", "Supervisor", "पर्यवेक्षक")}</h3>
                  <p className={fk}>{L("ಸೈನ್ ಇನ್ ಮಾಡಿ ಎಲ್ಲಾ ಅಧಿವೇಶನಗಳು, ಭೇಟಿಗಳು ಮತ್ತು ರೆಫರಲ್‌ಗಳನ್ನು ನೋಡಿ.", "Sign in to see all sessions, visits and referrals.", "साइन इन करके सभी सत्र, दौरे और रेफरल देखें।")}</p>
                  <span className="go">→</span>
                </Link>
                <Link href="/quiz" className="service-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/img/m5.svg" alt="" />
                  <h3 className={fk}>🏠 {L("ಕುಟುಂಬದ ಸದಸ್ಯರು", "Household member", "परिवार के सदस्य")}</h3>
                  <p className={fk}>{L("ಖಾತೆ ಬೇಕಿಲ್ಲ: ASHA ಕೊಟ್ಟ ರಸಪ್ರಶ್ನೆ ತೆಗೆದುಕೊಳ್ಳಿ ಅಥವಾ ಪಾಠಗಳನ್ನು ಓದಿ.", "No account needed: take the quiz your ASHA shared, or read the lessons.", "खाते की ज़रूरत नहीं: ASHA की दी प्रश्नोत्तरी दें या पाठ पढ़ें।")}</p>
                  <span className="go">→</span>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* How a session works (proposal Figure 1) */}
        <section className="section alt">
          <div className="wrap">
            <h2 className={`section-title ${fk}`}>{L("ಅಧಿವೇಶನ ಹೇಗೆ ನಡೆಯುತ್ತದೆ", "How a session works", "सत्र कैसे चलता है")}</h2>
            <p className={`section-sub ${fk}`}>{L("ನಾಲ್ಕು ತಜ್ಞ ಏಜೆಂಟ್‌ಗಳು; ಸ್ಥಿರ ನಿಯಮಗಳ ಸುರಕ್ಷತಾ ನಿಯಂತ್ರಕ ಪ್ರತಿ ಪ್ರಶ್ನೆಯನ್ನು ಮೊದಲು ಪರಿಶೀಲಿಸುತ್ತದೆ.",
              "Four specialist agents. A fixed-rule safety controller checks every question first, and personal medical questions get a fixed referral message.",
              "चार विशेषज्ञ एजेंट। तय नियमों वाला सुरक्षा नियंत्रक हर प्रश्न पहले जांचता है।")}</p>
            <div className="steps4">
              {steps.map((s, i) => (
                <div key={s.img} className="step4" style={{ ["--c" as string]: s.c }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="step4-num"><img src={s.img} alt="" /><b>{i + 1}</b></div>
                  <h3 className={fk}>{s.title}</h3>
                  <p className={fk}>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Helplines */}
        <section className="section">
          <div className="wrap">
            <h2 className={`section-title ${fk}`}>{L("ತಕ್ಷಣ ಸಹಾಯ ಬೇಕೆ?", "Need help now?", "अभी मदद चाहिए?")}</h2>
            <div className="help-grid" style={{ marginTop: 24 }}>
              <a href="tel:104" className="help-card h104"><span className="num">104</span><span className={fk}>{L("ಆರೋಗ್ಯ ಸಹಾಯವಾಣಿ", "Health helpline", "स्वास्थ्य हेल्पलाइन")}</span></a>
              <a href="tel:108" className="help-card h108"><span className="num">108</span><span className={fk}>{L("ತುರ್ತು ಆಂಬ್ಯುಲೆನ್ಸ್", "Emergency ambulance", "आपातकालीन एम्बुलेंस")}</span></a>
              <div className={`help-card note ${fk}`}>{L(
                "ವ್ಯಕ್ತಿಗತ ಅಥವಾ ತುರ್ತು ಆರೋಗ್ಯ ಪ್ರಶ್ನೆಗಳಿಗೆ ಅಪ್ ಉತ್ತರಿಸುವುದಿಲ್ಲ. 104 ಗೆ ಕರೆ ಮಾಡಿ, ತುರ್ತು ಸಂದರ್ಭದಲ್ಲಿ 108, ಅಥವಾ ANM ಅವರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
                "The app does not answer personal or urgent health questions. Call 104, or 108 in an emergency, or contact the ANM.",
                "व्यक्तिगत या तत्काल स्वास्थ्य प्रश्नों का उत्तर ऐप नहीं देता। 104 पर कॉल करें, आपात स्थिति में 108, या ANM से संपर्क करें।")}</div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function LandingPage() {
  return <Suspense fallback={<div className="portal"><main className="page-body">Loading…</main></div>}><HomeContent /></Suspense>;
}
