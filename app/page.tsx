"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProfile, type AshaProfile } from "@/lib/profile-store";
import { getDueReviews } from "@/lib/spaced-repetition";
import { getDashboardSessions, getContentLibrary } from "@/lib/api-client";
import { useLang, tr } from "@/lib/prefs";
import { SiteHeader, SiteFooter, KeyMessageTicker } from "@/components/SiteChrome";

const T = {
  kn: {
    badge: "ಆರೋಗ್ಯ ಶಿಕ್ಷಣ ಅಪ್ • AMR ಜಾಗೃತಿ",
    heroTitle: "AMR ಜಾಗೃತಿ",
    heroSub: "ಕನ್ನಡದಲ್ಲಿ AMR ಶಿಕ್ಷಣ — ASHA ಕಾರ್ಯಕರ್ತೆಯರಿಗಾಗಿ ರಚಿಸಿದ ಸಂವಾದಾತ್ಮಕ ಅಧ್ಯಯನ ಅಪ್",
    roleSelect: "ನಿಮ್ಮ ಪಾತ್ರ ಆಯ್ಕೆ ಮಾಡಿ",
    asha: "ASHA ಕಾರ್ಯಕರ್ತೆ",
    ashaDesc: "ಮರುಬಳಕೆ ಮಾಡಬಹುದಾದ AMR ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ ಮತ್ತು ಪರಿಶೀಲಿಸಿ",
    supervisor: "ಮೇಲ್ವಿಚಾರಕ",
    supervisorDesc: "ಅಧಿವೇಶನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಮತ್ತು ಅಂಕಿ-ಅಂಶ ವೀಕ್ಷಿಸಿ",
    topicLabel: "ಇಂದಿನ ರಸಪ್ರಶ್ನೆ ವಿಷಯ",
    time: "ಪ್ರಶ್ನೆಗಳ ಸಂಖ್ಯೆ",
    start: "ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ →",
    dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ತೆರೆಯಿರಿ →",
    disclaimer: "⚕️ ಈ ಅಪ್ ಶಿಕ್ಷಣ ಸಾಧನ ಮಾತ್ರ. ಔಷಧ ಸೂಚಿಸಲ್ಲ, ರೋಗ ನಿರ್ಣಯ ಮಾಡಲ್ಲ.",
    profile: "ಪ್ರೊಫೈಲ್",
    noProfile: "ಪ್ರೊಫೈಲ್ ಇಲ್ಲ",
    setupProfile: "ಪ್ರೊಫೈಲ್ ಸ್ಥಾಪಿಸಿ",
    welcome: "ಸ್ವಾಗತ",
    dueReview: "📚 ಈ ವಿಷಯ ಪುನರಾವಲೋಕನ ಸಮಯ:",
    quickLinks: "ತ್ವರಿತ ಲಿಂಕ್‌ಗಳು",
    visits: "ಮನೆ ಭೇಟಿ",
    settings: "ಸೆಟ್ಟಿಂಗ್ಸ್",
    topics: [
      { value: "general", label: "ಸಾಮಾನ್ಯ AMR ಅರಿವು" },
      { value: "antibiotics", label: "ಪ್ರತಿಜೀವಕಗಳು ಎಂದರೇನು?" },
      { value: "amr", label: "AMR / ಪ್ರತಿಜೀವಕ ನಿರೋಧ" },
      { value: "prevention", label: "ಸೋಂಕು ತಡೆಗಟ್ಟುವಿಕೆ" },
      { value: "sharing", label: "ಔಷಧ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ" },
      { value: "case study", label: "ಕೇಸ್ ಸ್ಟಡಿ" },
    ],
    times: ["3","5","7","10"],
    powered: "ಬಹು-ಏಜೆಂಟ್ AI • ಕನ್ನಡ-ಮೊದಲ • NCDC ಮೂಲ",
  },
  en: {
    badge: "Health Education App • AMR Awareness",
    heroTitle: "AMR Jagruti",
    heroSub: "A multi-agent, Kannada-first app helping ASHA workers run interactive AMR education sessions",
    roleSelect: "Select your role",
    asha: "ASHA Worker",
    ashaDesc: "Prepare and review a reusable AMR quiz",
    supervisor: "Supervisor",
    supervisorDesc: "View session dashboard and metrics",
    topicLabel: "Today's quiz topic",
    time: "Number of questions",
    start: "Build Quiz →",
    dashboard: "Open Dashboard →",
    disclaimer: "⚕️ This app is an education tool only. It does not diagnose, prescribe, or suggest medicines.",
    profile: "Profile",
    noProfile: "No profile",
    setupProfile: "Setup Profile",
    welcome: "Welcome",
    dueReview: "📚 Topics due for review:",
    quickLinks: "Quick Links",
    visits: "Home Visits",
    settings: "Settings",
    topics: [
      { value: "general", label: "General AMR Awareness" },
      { value: "antibiotics", label: "What are antibiotics?" },
      { value: "amr", label: "AMR / Antimicrobial Resistance" },
      { value: "prevention", label: "Infection Prevention" },
      { value: "sharing", label: "Don't share medicines" },
      { value: "case study", label: "Case Studies" },
    ],
    times: ["3","5","7","10"],
    powered: "Multi-agent AI • Kannada-first • NCDC-sourced",
  },
  hi: {
    badge: "स्वास्थ्य शिक्षा ऐप • AMR जागरूकता",
    heroTitle: "AMR जागृति",
    heroSub: "ASHA कार्यकर्ताओं के लिए एक बहु-एजेंट, कन्नड़-प्रथम AMR शिक्षा ऐप",
    roleSelect: "अपनी भूमिका चुनें",
    asha: "ASHA कार्यकर्ता",
    ashaDesc: "दोबारा उपयोग योग्य AMR प्रश्नोत्तरी तैयार करें और जांचें",
    supervisor: "पर्यवेक्षक",
    supervisorDesc: "सत्र डैशबोर्ड और मेट्रिक्स देखें",
    topicLabel: "आज की प्रश्नोत्तरी का विषय",
    time: "प्रश्नों की संख्या",
    start: "प्रश्नोत्तरी बनाएं →",
    dashboard: "डैशबोर्ड खोलें →",
    disclaimer: "⚕️ यह ऐप केवल एक शिक्षा उपकरण है। यह दवाएं नहीं लिखता या निदान नहीं करता।",
    profile: "प्रोफ़ाइल",
    noProfile: "कोई प्रोफ़ाइल नहीं",
    setupProfile: "प्रोफ़ाइल सेटअप",
    welcome: "स्वागत",
    dueReview: "📚 समीक्षा के लिए विषय:",
    quickLinks: "त्वरित लिंक",
    visits: "घर दौरे",
    settings: "सेटिंग्स",
    topics: [
      { value: "general", label: "सामान्य AMR जागरूकता" },
      { value: "antibiotics", label: "एंटीबायोटिक्स क्या हैं?" },
      { value: "amr", label: "AMR / रोगाणुरोधी प्रतिरोध" },
      { value: "prevention", label: "संक्रमण रोकथाम" },
      { value: "sharing", label: "दवाएं साझा न करें" },
      { value: "case study", label: "केस अध्ययन" },
    ],
    times: ["3","5","7","10"],
    powered: "बहु-एजेंट AI • कन्नड़-प्रथम • NCDC स्रोत",
  },
};

// picture for each session topic (original illustrations in public/img)
const TOPIC_IMG: Record<string, string> = {
  general: "/img/step3.svg", antibiotics: "/img/m1.svg", amr: "/img/m2.svg",
  prevention: "/img/m6.svg", sharing: "/img/m4.svg", "case study": "/img/m7.svg",
};

export default function LandingPage() {
  const [lang] = useLang();  // shared, saved preference; changed from the header
  const [topic, setTopic] = useState("general");
  const [questionCount, setQuestionCount] = useState("5");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<AshaProfile | null>(null);
  const [dueReviews, setDueReviews] = useState<{ tag: string; label: Record<string,string> }[]>([]);
  const [stats, setStats] = useState<{ sessions: number; completed: number; avg: number; lessons: number } | null>(null);
  const router = useRouter();
  const t = T[lang];
  const fk = lang === "kn" ? "kn" : "";
  const L = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);

  useEffect(() => {
    // profile and review reminders live in this browser (localStorage); the language no longer comes from here
    setProfile(getProfile());
    setDueReviews(getDueReviews());
  }, []);

  useEffect(() => {
    // live figures for the statistics strip; the strip hides itself if the backend is down
    Promise.all([getDashboardSessions(), getContentLibrary()]).then(([s, lib]) => {
      const done = s.filter((x) => x.sessionCompleted);
      setStats({
        sessions: s.length, completed: done.length,
        avg: done.length ? Math.round(done.reduce((n, x) => n + x.quizScore, 0) / done.length) : 0,
        lessons: lib.modules.reduce((n, m) => n + m.blocks.length, 0),
      });
    }).catch(() => setStats(null));
  }, []);

  function handleStart() {
    setLoading(true);
    router.push(`/quiz-builder?topic=${encodeURIComponent(topic)}&lang=${lang}&questionCount=${questionCount}`);
  }

  const badges = [
    { cls: "fb1", icon: "🔤", bg: "#e3eefc", label: L("ಕನ್ನಡ-ಮೊದಲ", "Kannada-first", "कन्नड़-प्रथम") },
    { cls: "fb2", icon: "🎙️", bg: "#fde2e4", label: L("ಧ್ವನಿ ಬೆಂಬಲ", "Voice support", "वॉयस सपोर्ट") },
    { cls: "fb3", icon: "🛡️", bg: "#d8f3dc", label: L("ಸುರಕ್ಷತಾ ಪರಿಶೀಲನೆ", "Safety-checked", "सुरक्षा जांच") },
    { cls: "fb4", icon: "🤖", bg: "#fff3cd", label: L("4 ತಜ್ಞ ಏಜೆಂಟ್", "4 specialist agents", "4 विशेषज्ञ एजेंट") },
  ];

  const steps = [
    { c: "#6a4c93", img: "/img/step1.svg", title: L("ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ", "Prepare a quiz", "प्रश्नोत्तरी तैयार करें"),
      text: L("ಆಯ್ದ ವಿಷಯಕ್ಕೆ ಮೂಲಗಳ ಆಧಾರದ ಮೇಲೆ ಪ್ರಶ್ನೆಗಳ ಬ್ಯಾಚ್ ರಚಿಸಿ.",
              "Generate a source-grounded batch of questions for the selected topic.",
              "चुने हुए विषय के लिए स्रोत-आधारित प्रश्नों का सेट बनाएं।") },
    { c: "#e07a2f", img: "/img/step2.svg", title: L("ASHA ಪರಿಶೀಲನೆ", "ASHA reviews", "ASHA समीक्षा"),
      text: L("ಪ್ರಕಟಿಸುವ ಮೊದಲು ಎಲ್ಲಾ ಪ್ರಶ್ನೆಗಳು, ಉತ್ತರಗಳು ಮತ್ತು ವಿವರಣೆಗಳನ್ನು ಒಟ್ಟಿಗೆ ಪರಿಶೀಲಿಸಿ.",
              "Review all questions, answer keys and explanations together before publishing.",
              "प्रकाशित करने से पहले सभी प्रश्न, उत्तर और व्याख्या एक साथ जांचें।") },
    { c: "#1d3557", img: "/img/step3.svg", title: L("ಪ್ರಕಟಿಸಿ", "Publish a version", "संस्करण प्रकाशित करें"),
      text: L("ಅನುಮೋದಿತ ರಸಪ್ರಶ್ನೆ ಮರುಬಳಕೆಗಾಗಿ ಆವೃತ್ತಿಯಾಗಿ ಉಳಿಯುತ್ತದೆ.",
              "The approved quiz is saved as a reusable published version.",
              "स्वीकृत प्रश्नोत्तरी दोबारा उपयोग के लिए प्रकाशित संस्करण के रूप में सहेजी जाती है।") },
    { c: "#2d6a4f", img: "/img/step4.svg", title: L("ಕಲಿಯುವವರ ಪ್ರಯತ್ನ", "Learner attempt", "सीखने वाले का प्रयास"),
      text: L("ಕಲಿಯುವವರು ಎಲ್ಲಾ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸುತ್ತಾರೆ; ಸರ್ವರ್ ಅಂಕ ಮತ್ತು ವಿವರಣೆಗಳನ್ನು ತೋರಿಸುತ್ತದೆ.",
              "Learners answer the full set; the server grades it and shows explanations.",
              "सीखने वाले सभी प्रश्नों के उत्तर देते हैं; सर्वर जांचकर व्याख्या दिखाता है।") },
  ];

  const services = [
    { href: "/#start", img: "/img/step3.svg", title: L("ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ", "Prepare a quiz", "प्रश्नोत्तरी तैयार करें"),
      text: L("ಪ್ರಶ್ನೆಗಳ ಸಂಪೂರ್ಣ ಬ್ಯಾಚ್ ಪರಿಶೀಲಿಸಿ ಪ್ರಕಟಿಸಿ.", "Review the full question batch and publish it for reuse.", "सभी प्रश्नों की समीक्षा करके पुनः उपयोग के लिए प्रकाशित करें।") },
    { href: "/quiz", img: "/img/m7.svg", title: L("ಪ್ರಕಟಿತ ರಸಪ್ರಶ್ನೆಗಳು", "Published quizzes", "प्रकाशित प्रश्नोत्तरी"),
      text: L("ಪ್ರಕಟಿತ ಆವೃತ್ತಿಯನ್ನು ಆಯ್ಕೆ ಮಾಡಿ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿ.", "Choose a published version and attempt every question.", "प्रकाशित संस्करण चुनें और सभी प्रश्नों के उत्तर दें।") },
    { href: "/learn", img: "/img/m7.svg", title: L("ಕಲಿಕಾ ಗ್ರಂಥಾಲಯ", "Learning library", "सीखने की लाइब्रेरी"),
      text: L("ಎಲ್ಲಾ ಅನುಮೋದಿತ ಪಾಠಗಳನ್ನು ನೋಡಿ ಮತ್ತು ಕೇಳಿ.", "Browse every approved lesson and listen to it.", "सभी स्वीकृत पाठ देखें और सुनें।") },
    { href: "/visits", img: "/img/m5.svg", title: L("ಮನೆ ಭೇಟಿ", "Household visits", "घर दौरे"),
      text: L("ಭೇಟಿ ನೀಡಿದ ಕುಟುಂಬಗಳು ಮತ್ತು ವಿಷಯಗಳನ್ನು ದಾಖಲಿಸಿ.", "Log families visited and topics covered.", "जिन परिवारों से मिले और विषय दर्ज करें।") },
    { href: "/dashboard", img: "/img/step4.svg", title: L("ಮೇಲ್ವಿಚಾರಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", "Supervisor dashboard", "पर्यवेक्षक डैशबोर्ड"),
      text: L("ಅಧಿವೇಶನಗಳು, ರೆಫರಲ್ ಕಾರ್ಯಗಳು ಮತ್ತು ಮೌಲ್ಯಮಾಪನ ಫಲಿತಾಂಶ.", "Sessions, referral tasks and evaluation results.", "सत्र, रेफरल कार्य और मूल्यांकन परिणाम।") },
    { href: "/profile", img: "/img/step2.svg", title: L("ನನ್ನ ಪ್ರೊಫೈಲ್", "My profile", "मेरी प्रोफ़ाइल"),
      text: L("ನಿಮ್ಮ ಹೆಸರು, ಬ್ಲಾಕ್ ಮತ್ತು ಜಿಲ್ಲೆ.", "Your name, block and district.", "आपका नाम, ब्लॉक और जिला।") },
  ];

  return (
    <div className="portal">
      <SiteHeader />
      <KeyMessageTicker />
      <main>
        {/* Hero */}
        <section className="hero2">
          <div className="wrap hero2-grid">
            <div>
              <span className="chip"><span>🌿</span><span className={fk}>{t.badge}</span></span>
              <h1 className={fk}>{L("ಒಂದೊಂದೇ ಮನೆಯಲ್ಲಿ AMR ಅರಿವು", "Bridging the AMR awareness gap, one household at a time", "हर घर तक AMR जागरूकता")}</h1>
              <p className={fk}>{t.heroSub}</p>
              <div className="hero2-cta">
                <a href="#start" className={`btn btn-primary btn-lg ${fk}`}>{t.start}</a>
                <Link href="/learn" className={`btn btn-outline btn-lg ${fk}`}>📚 {L("ಕಲಿಕಾ ಗ್ರಂಥಾಲಯ", "Learning library", "सीखने की लाइब्रेरी")}</Link>
                <Link href="/quiz" className={`btn btn-outline btn-lg ${fk}`}>✅ {L("ಪ್ರಕಟಿತ ರಸಪ್ರಶ್ನೆಗಳು", "Published quizzes", "प्रकाशित प्रश्नोत्तरी")}</Link>
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

        {/* Prepare a reusable quiz */}
        <section id="start" className="section">
          <div className="wrap">
            <h2 className={`section-title ${fk}`}>{L("ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ", "Prepare a quiz", "प्रश्नोत्तरी तैयार करें")}</h2>
            <p className={`section-sub ${fk}`}>{t.ashaDesc}</p>
            <div className="start-panel">
              <div className="card-elevated">
                <label className={`block text-sm font-bold mb-3 ${fk}`} style={{ color: "var(--primary)" }}>{t.topicLabel}</label>
                <div className="topic-grid" role="radiogroup" aria-label={t.topicLabel}>
                  {t.topics.map((tp) => (
                    <button key={tp.value} id={`topic-${tp.value.replace(" ", "-")}`} role="radio" aria-checked={topic === tp.value}
                      className={`topic-card ${topic === tp.value ? "on" : ""} ${fk}`} onClick={() => setTopic(tp.value)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={TOPIC_IMG[tp.value]} alt="" />{tp.label}
                    </button>
                  ))}
                </div>
                <label className={`block text-sm font-bold mt-4 mb-2 ${fk}`} style={{ color: "var(--primary)" }}>{t.time}</label>
                <div className="flex gap-2">
                  {t.times.map((m) => (
                    <button key={m} id={`count-${m}`} aria-pressed={questionCount === m} className={`time-btn ${questionCount === m ? "on" : ""}`} onClick={() => setQuestionCount(m)}>{m}</button>
                  ))}
                </div>
                <button id="start-quiz-btn" className={`btn btn-primary btn-full btn-lg mt-4 ${fk}`} onClick={handleStart} disabled={loading}>
                  {loading ? <span className="spinner" /> : t.start}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {profile ? (
                  <div className="card" style={{ background: "linear-gradient(135deg,var(--green-50),var(--amber-100))", border: "1.5px solid var(--green-600)" }}>
                    <div className={`font-bold text-primary ${fk}`}>👋 {t.welcome}, {profile.name}</div>
                    <div className="text-xs text-muted mt-1">{profile.block}, {profile.district} · {L("ಒಟ್ಟು ಅಧಿವೇಶನ", "Sessions", "कुल सत्र")}: {profile.totalSessions}</div>
                  </div>
                ) : (
                  <div className="card" style={{ border: "1.5px dashed var(--border)", textAlign: "center" }}>
                    <div className={`text-sm text-muted ${fk}`}>{t.noProfile}</div>
                    <Link href="/profile" className={`btn btn-primary btn-sm mt-2 ${fk}`}>{t.setupProfile}</Link>
                  </div>
                )}
                {dueReviews.length > 0 && (
                  <div className="card" style={{ background: "#fff8e1", border: "1.5px solid var(--amber-500)" }}>
                    <div className={`text-sm font-bold mb-2 ${fk}`} style={{ color: "var(--amber-900)" }}>{t.dueReview}</div>
                    <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                      {dueReviews.map((r) => (
                        <span key={r.tag} className={`badge badge-amber ${fk}`} style={{ cursor: "pointer" }}
                          onClick={() => setTopic(r.tag.includes("AMR") || r.tag === "resistance" ? "amr" : r.tag)}>
                          {r.label[lang] ?? r.tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="card">
                  <div className={`font-bold text-sm mb-2 ${fk}`} style={{ color: "var(--primary)" }}>📊 {t.supervisor}</div>
                  <div className={`text-sm text-muted mb-3 ${fk}`}>{t.supervisorDesc}</div>
                  <Link id="open-dashboard-btn" href="/dashboard" className={`btn btn-outline btn-full ${fk}`}>{t.dashboard}</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How a session works */}
        <section className="section alt">
          <div className="wrap">
            <h2 className={`section-title ${fk}`}>{L("ಅಧಿವೇಶನ ಹೇಗೆ ನಡೆಯುತ್ತದೆ", "How a session works", "सत्र कैसे चलता है")}</h2>
            <p className={`section-sub ${fk}`}>{L("ನಾಲ್ಕು ತಜ್ಞ ಏಜೆಂಟ್‌ಗಳು; ಸುರಕ್ಷತಾ ನಿಯಂತ್ರಕ ಪ್ರತಿ ಹಂತದಲ್ಲೂ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ.",
              "Four specialist agents, with a safety controller watching every step.",
              "चार विशेषज्ञ एजेंट, और हर चरण पर सुरक्षा नियंत्रक।")}</p>
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

        {/* Services */}
        <section className="section">
          <div className="wrap">
            <h2 className={`section-title ${fk}`}>{L("ನೀವು ಏನು ಮಾಡಬಹುದು", "What you can do", "आप क्या कर सकते हैं")}</h2>
            <p className={`section-sub ${fk}`}>{t.disclaimer}</p>
            <div className="services">
              {services.map((s) => (
                <Link key={s.href} href={s.href} className="service-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.img} alt="" />
                  <h3 className={fk}>{s.title}</h3>
                  <p className={fk}>{s.text}</p>
                  <span className="go">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Live statistics */}
        {stats && (
          <section className="section alt" id="stats">
            <div className="wrap">
              <h2 className={`section-title ${fk}`}>{L("ಒಂದು ನೋಟದಲ್ಲಿ", "At a glance", "एक नज़र में")}</h2>
              <p className={`section-sub ${fk}`}>{L("ಈ ಅಪ್‌ನ ನೇರ ಅಂಕಿ-ಅಂಶಗಳು", "Live figures from this app", "इस ऐप के लाइव आंकड़े")}</p>
              <div className="stat-band">
                {[
                  [stats.sessions, L("ನಡೆಸಿದ ಅಧಿವೇಶನ", "Sessions run", "चलाए गए सत्र")],
                  [stats.completed, L("ಪೂರ್ಣಗೊಂಡ ಅಧಿವೇಶನ", "Sessions completed", "पूर्ण सत्र")],
                  [`${stats.avg}%`, L("ಸರಾಸರಿ ರಸಪ್ರಶ್ನೆ ಅಂಕ", "Average quiz score", "औसत प्रश्नोत्तरी स्कोर")],
                  [stats.lessons, L("ಅನುಮೋದಿತ ಪಾಠಗಳು", "Approved lessons", "स्वीकृत पाठ")],
                ].map(([n, l]) => (
                  <div key={String(l)} className="stat-box"><div className="n">{n}</div><div className={`l ${fk}`}>{l}</div></div>
                ))}
              </div>
            </div>
          </section>
        )}

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
