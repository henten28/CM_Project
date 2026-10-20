"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfile, type AshaProfile } from "@/lib/profile-store";
import { getDueReviews } from "@/lib/spaced-repetition";
import { startSession } from "@/lib/api-client";

const T = {
  kn: {
    badge: "ಆರೋಗ್ಯ ಶಿಕ್ಷಣ ಅಪ್ • AMR ಜಾಗೃತಿ",
    heroTitle: "AMR ಜಾಗೃತಿ",
    heroSub: "ಕನ್ನಡದಲ್ಲಿ AMR ಶಿಕ್ಷಣ — ASHA ಕಾರ್ಯಕರ್ತೆಯರಿಗಾಗಿ ರಚಿಸಿದ ಸಂವಾದಾತ್ಮಕ ಅಧ್ಯಯನ ಅಪ್",
    roleSelect: "ನಿಮ್ಮ ಪಾತ್ರ ಆಯ್ಕೆ ಮಾಡಿ",
    asha: "ASHA ಕಾರ್ಯಕರ್ತೆ",
    ashaDesc: "ಸಮುದಾಯ AMR ಶಿಕ್ಷಣ ಅಧಿವೇಶನ ನಡೆಸಿ",
    supervisor: "ಮೇಲ್ವಿಚಾರಕ",
    supervisorDesc: "ಅಧಿವೇಶನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಮತ್ತು ಅಂಕಿ-ಅಂಶ ವೀಕ್ಷಿಸಿ",
    topicLabel: "ಇಂದಿನ ಶಿಕ್ಷಣ ವಿಷಯ",
    time: "ಲಭ್ಯ ಸಮಯ (ನಿಮಿಷ)",
    start: "ಅಧಿವೇಶನ ಪ್ರಾರಂಭಿಸಿ →",
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
    times: ["5","10","15"],
    powered: "ಬಹು-ಏಜೆಂಟ್ AI • ಕನ್ನಡ-ಮೊದಲ • NCDC ಮೂಲ",
  },
  en: {
    badge: "Health Education App • AMR Awareness",
    heroTitle: "AMR Jagruti",
    heroSub: "A multi-agent, Kannada-first app helping ASHA workers run interactive AMR education sessions",
    roleSelect: "Select your role",
    asha: "ASHA Worker",
    ashaDesc: "Run a community AMR education session",
    supervisor: "Supervisor",
    supervisorDesc: "View session dashboard and metrics",
    topicLabel: "Today's session topic",
    time: "Available time (minutes)",
    start: "Start Session →",
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
    times: ["5","10","15"],
    powered: "Multi-agent AI • Kannada-first • NCDC-sourced",
  },
  hi: {
    badge: "स्वास्थ्य शिक्षा ऐप • AMR जागरूकता",
    heroTitle: "AMR जागृति",
    heroSub: "ASHA कार्यकर्ताओं के लिए एक बहु-एजेंट, कन्नड़-प्रथम AMR शिक्षा ऐप",
    roleSelect: "अपनी भूमिका चुनें",
    asha: "ASHA कार्यकर्ता",
    ashaDesc: "समुदाय AMR शिक्षा सत्र चलाएं",
    supervisor: "पर्यवेक्षक",
    supervisorDesc: "सत्र डैशबोर्ड और मेट्रिक्स देखें",
    topicLabel: "आज का सत्र विषय",
    time: "उपलब्ध समय (मिनट)",
    start: "सत्र शुरू करें →",
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
    times: ["5","10","15"],
    powered: "बहु-एजेंट AI • कन्नड़-प्रथम • NCDC स्रोत",
  },
};

export default function LandingPage() {
  const [lang, setLang] = useState<"kn" | "en" | "hi">("kn");
  const [role, setRole] = useState<"asha" | "supervisor" | null>(null);
  const [topic, setTopic] = useState("general");
  const [minutes, setMinutes] = useState("10");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<AshaProfile | null>(null);
  const [dueReviews, setDueReviews] = useState<{ tag: string; label: Record<string,string> }[]>([]);
  const router = useRouter();
  const t = T[lang];
  const fk = lang === "kn" ? "kn" : "";

  useEffect(() => {
    const p = getProfile();
    if (p) { setProfile(p); setLang(p.lang); }
    setDueReviews(getDueReviews());
  }, []);

  async function handleStart() {
    if (role !== "asha") return;
    setLoading(true);
    try {
      // spaced-repetition gaps go to the planning agent as prior gaps
      const data = await startSession({ topic, durationMinutes: Number(minutes) as 5 | 10 | 15, lang,
                                        priorGaps: dueReviews.map((r) => r.tag) });
      router.push(`/session?id=${data.sessionId}&lang=${lang}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not reach the backend");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <div>
            <div className="logo-text">AMR ಜಾಗೃತಿ</div>
            <div className="logo-sub">AMR Jagruti</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="lang-toggle">
            <button id="lang-kn" className={lang==="kn"?"active":""} onClick={()=>setLang("kn")}>ಕನ್ನಡ</button>
            <button id="lang-en" className={lang==="en"?"active":""} onClick={()=>setLang("en")}>EN</button>
            <button id="lang-hi" className={lang==="hi"?"active":""} onClick={()=>setLang("hi")}>हिं</button>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ color: "rgba(255,255,255,0.8)" }} onClick={() => router.push("/profile")}>👤</button>
          <button className="btn btn-ghost btn-sm" style={{ color: "rgba(255,255,255,0.8)" }} onClick={() => router.push("/settings")}>⚙️</button>
        </div>
      </header>

      {/* Hero */}
      <div className="hero-bg">
        <div className="container">
          <div className="hero-badge"><span>🌿</span><span className={fk}>{t.badge}</span></div>
          <h1 className={`hero-title ${fk}`}>{t.heroTitle}</h1>
          <p className={`hero-sub ${fk}`}>{t.heroSub}</p>
          <div className="flex gap-3 mt-6" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { icon: "🤖", label: lang==="kn"?"4 ತಜ್ಞ ಏಜೆಂಟ್":lang==="hi"?"4 विशेषज्ञ एजेंट":"4 Specialist Agents" },
              { icon: "🔤", label: lang==="kn"?"ಕನ್ನಡ-ಮೊದಲ":lang==="hi"?"कन्नड़-प्रथम":"Kannada-first" },
              { icon: "🎙️", label: lang==="kn"?"ಧ್ವನಿ ಬೆಂಬಲ":lang==="hi"?"वॉयस सपोर्ट":"Voice Support" },
              { icon: "📴", label: lang==="kn"?"ಆಫ್‌ಲೈನ್ ಕಾರ್ಯ":lang==="hi"?"ऑफलाइन काम":"Offline Ready" },
            ].map(s=>(
              <div key={s.label} style={{ background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 14px",fontSize:"0.8rem",fontWeight:600,display:"flex",gap:6,alignItems:"center" }}>
                <span>{s.icon}</span><span className={fk}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main style={{ flex:1, padding:"24px 16px 40px" }}>
        <div className="container">

          {/* Profile greeting */}
          {profile ? (
            <div className="card mb-4 animate-fade" style={{ background:"linear-gradient(135deg,var(--green-50),var(--amber-100))", border:"1.5px solid var(--green-600)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-primary ${fk}`}>👋 {t.welcome}, {profile.name}</div>
                  <div className="text-xs text-muted mt-1">{profile.block}, {profile.district} · {lang==="kn"?"ಒಟ್ಟು ಅಧಿವೇಶನ":lang==="hi"?"कुल सत्र":"Sessions"}: {profile.totalSessions}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={()=>router.push("/profile")}>{t.profile} →</button>
              </div>
            </div>
          ) : (
            <div className="card mb-4" style={{ border:"1.5px dashed var(--border)", textAlign:"center", padding:"14px" }}>
              <div className="text-sm text-muted">{t.noProfile}</div>
              <button className="btn btn-primary btn-sm mt-2" onClick={()=>router.push("/profile")}>{t.setupProfile}</button>
            </div>
          )}

          {/* Spaced repetition alert */}
          {dueReviews.length > 0 && (
            <div className="card mb-4 animate-slide" style={{ background:"#fff8e1",border:"1.5px solid var(--amber-500)" }}>
              <div className={`text-sm font-bold mb-2 ${fk}`} style={{ color:"var(--amber-900)" }}>{t.dueReview}</div>
              <div className="flex gap-1" style={{ flexWrap:"wrap" }}>
                {dueReviews.map(r=>(
                  <span key={r.tag} className={`badge badge-amber ${fk}`} onClick={()=>{setRole("asha"); setTopic(r.tag.includes("AMR")||r.tag==="resistance"?"amr":r.tag);}} style={{ cursor:"pointer" }}>
                    {r.label[lang] ?? r.tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Role selection */}
          <h2 className={`text-lg font-bold mb-3 ${fk}`} style={{ color:"var(--primary)" }}>{t.roleSelect}</h2>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:24 }}>
            <button id="role-asha" className={`role-card ${role==="asha"?"selected":""}`} onClick={()=>setRole("asha")}>
              <div className="role-icon">👩‍⚕️</div>
              <div className={`role-title ${fk}`}>{t.asha}</div>
              <div className={`role-desc ${fk}`}>{t.ashaDesc}</div>
            </button>
            <button id="role-supervisor" className={`role-card ${role==="supervisor"?"selected":""}`} onClick={()=>setRole("supervisor")}>
              <div className="role-icon">📊</div>
              <div className={`role-title ${fk}`}>{t.supervisor}</div>
              <div className={`role-desc ${fk}`}>{t.supervisorDesc}</div>
            </button>
          </div>

          {/* ASHA setup */}
          {role==="asha" && (
            <div className="card-elevated animate-fade mb-4">
              <div className="mb-4">
                <label className={`block text-sm font-medium mb-2 ${fk}`} style={{color:"var(--primary)"}} htmlFor="topic-select">{t.topicLabel}</label>
                <select id="topic-select" value={topic} onChange={e=>setTopic(e.target.value)}
                  style={{ width:"100%",padding:"12px 14px",borderRadius:8,border:"2px solid var(--border)",fontSize:"0.95rem",background:"var(--surface)",fontFamily:lang==="kn"?"var(--font-kannada)":"var(--font-sans)" }}>
                  {t.topics.map(tp=><option key={tp.value} value={tp.value}>{tp.label}</option>)}
                </select>
              </div>
              <div className="mb-4">
                <label className={`block text-sm font-medium mb-2 ${fk}`} style={{color:"var(--primary)"}}>{t.time}</label>
                <div className="flex gap-2" style={{ flexWrap:"wrap" }}>
                  {t.times.map(m=>(
                    <button key={m} id={`time-${m}`} onClick={()=>setMinutes(m)}
                      style={{ padding:"8px 16px",borderRadius:8,border:`2px solid ${minutes===m?"var(--primary)":"var(--border)"}`,background:minutes===m?"var(--green-50)":"var(--surface)",color:minutes===m?"var(--primary)":"var(--text)",fontWeight:600,fontSize:"0.9rem",cursor:"pointer",transition:"var(--transition)" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <button id="start-session-btn" className={`btn btn-primary btn-full btn-lg ${fk}`} onClick={handleStart} disabled={loading}>
                {loading?<span className="spinner"/>:t.start}
              </button>
            </div>
          )}

          {role==="supervisor" && (
            <div className="card-elevated animate-fade mb-4">
              <button id="open-dashboard-btn" className={`btn btn-primary btn-full btn-lg ${fk}`} onClick={()=>router.push(`/dashboard?lang=${lang}`)}>{t.dashboard}</button>
            </div>
          )}

          {/* Quick links */}
          <div className="mb-4">
            <h3 className={`text-sm font-bold mb-2 text-muted ${fk}`}>{t.quickLinks}</h3>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
              {[
                { icon:"🏘️",label:t.visits,path:"/visits" },
                { icon:"📊",label:lang==="kn"?"ಡ್ಯಾಶ್‌ಬೋರ್ಡ್":lang==="hi"?"डैशबोर्ड":"Dashboard",path:"/dashboard" },
                { icon:"👤",label:t.profile,path:"/profile" },
                { icon:"⚙️",label:t.settings,path:"/settings" },
              ].map(link=>(
                <button key={link.path} onClick={()=>router.push(link.path)}
                  className="card" style={{ padding:"12px 8px",textAlign:"center",cursor:"pointer",border:"1.5px solid var(--border)" }}>
                  <div style={{ fontSize:"1.4rem",marginBottom:4 }}>{link.icon}</div>
                  <div className={`text-xs font-medium ${fk}`} style={{ color:"var(--primary)" }}>{link.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ background:"var(--amber-100)",border:"1px solid var(--amber-300)",borderRadius:10,padding:"12px 16px",fontSize:"0.8rem",color:"var(--amber-900)",lineHeight:1.5 }}>
            <span className={fk}>{t.disclaimer}</span>
          </div>

          {/* Multi-agent diagram */}
          <div style={{ marginTop:28 }}>
            <h3 className={`text-sm font-bold mb-3 text-muted ${fk}`}>
              🤖 {lang==="kn"?"ಬಹು-ಏಜೆಂಟ್ ಆರ್ಕಿಟೆಕ್ಚರ್":lang==="hi"?"बहु-एजेंट आर्किटेक्चर":"Multi-Agent Architecture"}
            </h3>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              {[
                { icon:"📋", name:{kn:"ಯೋಜನಾ ಏಜೆಂಟ್",en:"Planning Agent",hi:"योजना एजेंट"}, desc:{kn:"ಪಾಠ ಯೋಜನೆ",en:"Lesson planning",hi:"पाठ योजना"} },
                { icon:"🔍", name:{kn:"ಹುಡುಕಾಟ ಏಜೆಂಟ್",en:"Retrieval Agent",hi:"पुनर्प्राप्ति एजेंट"}, desc:{kn:"ವಿಷಯ ಹುಡುಕಾಟ",en:"Content retrieval",hi:"सामग्री खोज"} },
                { icon:"📚", name:{kn:"ಶಿಕ್ಷಕ ಏಜೆಂಟ್",en:"Tutor Agent",hi:"ट्यूटर एजेंट"}, desc:{kn:"ರಸಪ್ರಶ್ನೆ ಮತ್ತು ಕಲಿಕೆ",en:"Quiz & teaching",hi:"प्रश्नोत्तरी और शिक्षण"} },
                { icon:"📝", name:{kn:"ಸಾರಾಂಶ ಏಜೆಂಟ್",en:"Summary Agent",hi:"सारांश एजेंट"}, desc:{kn:"ಸಾರಾಂಶ ಮತ್ತು ಉಲ್ಲೇಖ",en:"Summary & referral",hi:"सारांश और रेफरल"} },
              ].map(a=>(
                <div key={a.name.en} className="card" style={{ padding:"14px 12px" }}>
                  <div style={{ fontSize:"1.3rem",marginBottom:6 }}>{a.icon}</div>
                  <div className={`text-sm font-bold text-primary ${fk}`}>{a.name[lang]}</div>
                  <div className={`text-xs text-muted mt-1 ${fk}`}>{a.desc[lang]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center mt-4" style={{ fontSize:"0.72rem",color:"var(--text-muted)" }}>{t.powered}</div>
        </div>
      </main>
    </div>
  );
}
