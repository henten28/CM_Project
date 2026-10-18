"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveProfile, clearProfile, KA_DISTRICTS, type AshaProfile } from "@/lib/profile-store";

const T = {
  kn: {
    title: "ASHA ಕಾರ್ಯಕರ್ತೆ ಪ್ರೊಫೈಲ್",
    sub: "ಮೊದಲ ಬಾರಿ ಮಾಹಿತಿ ನಮೂದಿಸಿ",
    name: "ಹೆಸರು",
    namePh: "ನಿಮ್ಮ ಹೆಸರು ನಮೂದಿಸಿ",
    block: "ಬ್ಲಾಕ್ / ತಾಲೂಕ",
    blockPh: "ಬ್ಲಾಕ್ ಹೆಸರು",
    district: "ಜಿಲ್ಲೆ",
    lang: "ಆಯ್ಕೆ ಭಾಷೆ",
    save: "ಉಳಿಸಿ ಮುಂದುವರಿಯಿರಿ →",
    saved: "ಪ್ರೊಫೈಲ್ ಉಳಿಸಲಾಗಿದೆ!",
    clear: "ಪ್ರೊಫೈಲ್ ಅಳಿಸಿ",
    stats: "ಅಂಕಿ-ಅಂಶ",
    sessions: "ಒಟ್ಟು ಅಧಿವೇಶನ",
    visits: "ಮನೆ ಭೇಟಿ",
    since: "ಸದಸ್ಯನಾದ ದಿನ",
  },
  en: {
    title: "ASHA Worker Profile",
    sub: "Enter your details to get started",
    name: "Full Name",
    namePh: "Enter your name",
    block: "Block / Taluk",
    blockPh: "Block name",
    district: "District",
    lang: "Preferred Language",
    save: "Save & Continue →",
    saved: "Profile saved!",
    clear: "Clear Profile",
    stats: "Your Stats",
    sessions: "Sessions Conducted",
    visits: "Home Visits",
    since: "Member Since",
  },
  hi: {
    title: "ASHA कार्यकर्ता प्रोफ़ाइल",
    sub: "शुरू करने के लिए अपना विवरण दर्ज करें",
    name: "पूरा नाम",
    namePh: "अपना नाम दर्ज करें",
    block: "ब्लॉक / तालुक",
    blockPh: "ब्लॉक का नाम",
    district: "जिला",
    lang: "पसंदीदा भाषा",
    save: "सहेजें और जारी रखें →",
    saved: "प्रोफ़ाइल सहेजी गई!",
    clear: "प्रोफ़ाइल हटाएं",
    stats: "आपके आँकड़े",
    sessions: "कुल सत्र",
    visits: "घर के दौरे",
    since: "सदस्य बने",
  },
};

export default function ProfilePage() {
  const router = useRouter();
  const [uiLang, setUiLang] = useState<"kn" | "en" | "hi">("kn");
  const [profile, setProfile] = useState<AshaProfile | null>(null);
  const [name, setName] = useState("");
  const [block, setBlock] = useState("");
  const [district, setDistrict] = useState("Bengaluru Urban");
  const [lang, setLang] = useState<"kn" | "en" | "hi">("kn");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = getProfile();
    if (p) {
      setProfile(p);
      setName(p.name);
      setBlock(p.block);
      setDistrict(p.district);
      setLang(p.lang);
      setUiLang(p.lang);
    }
  }, []);

  const t = T[uiLang];
  const fontClass = uiLang === "kn" ? "kn" : "";

  function handleSave() {
    if (!name.trim()) return;
    const p = saveProfile({ name: name.trim(), block: block.trim(), district, lang });
    setProfile(p);
    setSaved(true);
    setTimeout(() => { setSaved(false); router.push("/"); }, 1200);
  }

  function handleClear() {
    if (confirm("Clear your profile?")) {
      clearProfile();
      setProfile(null);
      setName(""); setBlock(""); setDistrict("Bengaluru Urban"); setLang("kn");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <div>
            <div className="logo-text">AMR ಜಾಗೃತಿ</div>
            <div className="logo-sub">Profile</div>
          </div>
        </div>
        <div className="lang-toggle">
          {(["kn","en","hi"] as const).map((l) => (
            <button key={l} id={`ui-lang-${l}`} className={uiLang === l ? "active" : ""} onClick={() => setUiLang(l)}>
              {l === "kn" ? "ಕನ್ನಡ" : l === "en" ? "EN" : "हिं"}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "28px 16px" }}>
        {/* Avatar */}
        <div className="text-center mb-4">
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--green-700), var(--green-900))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2.2rem", margin: "0 auto 12px",
          }}>👩‍⚕️</div>
          <h1 className={`text-xl font-bold text-primary ${fontClass}`}>{t.title}</h1>
          <p className={`text-sm text-muted mt-1 ${fontClass}`}>{t.sub}</p>
        </div>

        {/* Stats (if existing profile) */}
        {profile && (
          <div className="card mb-4">
            <h3 className={`font-bold text-sm text-primary mb-3 ${fontClass}`}>{t.stats}</h3>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-val">{profile.totalSessions}</div>
                <div className={`stat-label ${fontClass}`}>{t.sessions}</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{profile.totalVisits}</div>
                <div className={`stat-label ${fontClass}`}>{t.visits}</div>
              </div>
            </div>
            <div className="text-xs text-muted mt-3 text-center">
              {t.since}: {new Date(profile.createdAt).toLocaleDateString("en-IN")}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="card-elevated">
          {[
            { label: t.name, value: name, onChange: setName, ph: t.namePh, id: "input-name" },
            { label: t.block, value: block, onChange: setBlock, ph: t.blockPh, id: "input-block" },
          ].map((f) => (
            <div key={f.id} className="mb-4">
              <label className={`block text-sm font-medium mb-1 text-primary ${fontClass}`} htmlFor={f.id}>{f.label}</label>
              <input id={f.id} value={f.value} onChange={(e) => f.onChange(e.target.value)}
                placeholder={f.ph}
                style={{ width: "100%", padding: "11px 14px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.95rem", fontFamily: uiLang === "kn" ? "var(--font-kannada)" : "inherit", background: "var(--surface)" }} />
            </div>
          ))}

          <div className="mb-4">
            <label className={`block text-sm font-medium mb-1 text-primary ${fontClass}`} htmlFor="district-select">{t.district}</label>
            <select id="district-select" value={district} onChange={(e) => setDistrict(e.target.value)}
              style={{ width: "100%", padding: "11px 14px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.95rem", background: "var(--surface)" }}>
              {KA_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 text-primary ${fontClass}`}>{t.lang}</label>
            <div className="flex gap-2">
              {([["kn","ಕನ್ನಡ"],["en","English"],["hi","हिंदी"]] as const).map(([l, label]) => (
                <button key={l} id={`pref-lang-${l}`} onClick={() => setLang(l)}
                  className={`btn btn-sm flex-1 ${lang === l ? "btn-primary" : "btn-outline"}`}>{label}</button>
              ))}
            </div>
          </div>

          <button id="save-profile-btn" className={`btn btn-primary btn-full btn-lg ${fontClass}`} onClick={handleSave} disabled={!name.trim()}>
            {saved ? `✅ ${t.saved}` : t.save}
          </button>

          {profile && (
            <button className="btn btn-ghost btn-sm w-full mt-2 text-danger" onClick={handleClear}>{t.clear}</button>
          )}
        </div>

        <button className="btn btn-ghost btn-full mt-3" onClick={() => router.push("/")}>← {uiLang === "kn" ? "ಮನೆಗೆ" : uiLang === "hi" ? "होम" : "Home"}</button>
      </main>
    </div>
  );
}
