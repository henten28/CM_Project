"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveProfile, clearProfile, KA_DISTRICTS, type AshaProfile } from "@/lib/profile-store";
import { useLang, getLang } from "@/lib/prefs";
import { SiteHeader, SiteFooter, PageBanner } from "@/components/SiteChrome";
import { tr } from "@/lib/prefs";

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
  const [uiLang, setAppLang] = useLang();  // shared, saved app language
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
    } else {
      setLang(getLang());  // a new profile starts with the language already chosen in the app
    }
  }, []);

  const t = T[uiLang];
  const fontClass = uiLang === "kn" ? "kn" : "";

  function handleSave() {
    if (!name.trim()) return;
    const p = saveProfile({ name: name.trim(), block: block.trim(), district, lang });
    setAppLang(lang);  // the preferred language chosen here becomes the app language
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

  const L = (kn: string, en: string, hi: string) => tr(uiLang, kn, en, hi);

  return (
    <div className="portal portal-page">
      <SiteHeader />
      <PageBanner img="/img/step2.svg" title={t.title}
        sub={profile ? `👋 ${profile.name} · ${profile.block ? profile.block + ", " : ""}${profile.district}` : t.sub} />

      <main className="page-body">
        <div className="profile-grid">
          {/* Form */}
          <div className="card-elevated">
            <h2 className={`card-title ${fontClass}`}>📝 {L("ನಿಮ್ಮ ವಿವರಗಳು", "Your details", "आपका विवरण")}</h2>
            <div className="form-grid">
              {[
                { label: t.name, value: name, onChange: setName, ph: t.namePh, id: "input-name" },
                { label: t.block, value: block, onChange: setBlock, ph: t.blockPh, id: "input-block" },
              ].map((fld) => (
                <div key={fld.id} className="field">
                  <label className={fontClass} htmlFor={fld.id}>{fld.label}</label>
                  <input id={fld.id} className={fontClass} value={fld.value} onChange={(e) => fld.onChange(e.target.value)} placeholder={fld.ph} />
                </div>
              ))}
            </div>
            <div className="field mb-4">
              <label className={fontClass} htmlFor="district-select">{t.district}</label>
              <select id="district-select" value={district} onChange={(e) => setDistrict(e.target.value)}>
                {KA_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field mb-4">
              <label className={fontClass}>{t.lang}</label>
              <div className="lang-choice">
                {([["kn","ಕನ್ನಡ"],["en","English"],["hi","हिंदी"]] as const).map(([l, label]) => (
                  <button key={l} id={`pref-lang-${l}`} onClick={() => setLang(l)}
                    className={`btn btn-sm ${lang === l ? "btn-primary" : "btn-outline"}`}>{label}</button>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Stats (if existing profile) */}
            {profile && (
              <div className="card">
                <h2 className={`card-title ${fontClass}`}>📈 {t.stats}</h2>
                <div className="mini-stats" style={{ marginBottom: 8 }}>
                  <div className="mini-stat"><span className="ms-icon" style={{ background: "#d8f3dc" }}>🎯</span>
                    <div><div className="ms-val">{profile.totalSessions}</div><div className={`ms-label ${fontClass}`}>{t.sessions}</div></div></div>
                  <div className="mini-stat"><span className="ms-icon" style={{ background: "#e3eefc" }}>🏘️</span>
                    <div><div className="ms-val">{profile.totalVisits}</div><div className={`ms-label ${fontClass}`}>{t.visits}</div></div></div>
                </div>
                <div className="text-xs text-muted">{t.since}: {new Date(profile.createdAt).toLocaleDateString("en-IN")}</div>
              </div>
            )}
            <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/step3.svg" alt="" width={64} height={64} />
              <div className={`text-sm ${fontClass}`} style={{ lineHeight: 1.6 }}>
                <strong>{L("ನಿಮ್ಮ ಮಾಹಿತಿ ಈ ಸಾಧನದಲ್ಲೇ ಇರುತ್ತದೆ", "Your details stay on this device", "आपकी जानकारी इसी डिवाइस पर रहती है")}</strong><br />
                <span className="text-muted">{L(
                  "ಹೆಸರು ಮತ್ತು ಬ್ಲಾಕ್ ಅನ್ನು ಸ್ವಾಗತ ಸಂದೇಶ ಮತ್ತು ಪ್ರಮಾಣಪತ್ರಕ್ಕಾಗಿ ಮಾತ್ರ ಬಳಸಲಾಗುತ್ತದೆ.",
                  "Your name and block are only used for the welcome message and the certificate.",
                  "नाम और ब्लॉक केवल स्वागत संदेश और प्रमाण पत्र के लिए उपयोग होते हैं।")}</span>
              </div>
            </div>
            <button className={`btn btn-outline btn-full ${fontClass}`} onClick={() => router.push("/#start")}>
              ▶ {L("ಅಧಿವೇಶನ ಪ್ರಾರಂಭಿಸಿ", "Start a session", "सत्र शुरू करें")}
            </button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
