"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getContentLibrary, pick, type ContentLibrary } from "@/lib/api-client";
import { useLang, useTextSize, tr, type Lang } from "@/lib/prefs";

const NAV: { href: string; label: [string, string, string] }[] = [
  { href: "/", label: ["ಮುಖಪುಟ", "Home", "होम"] },
  { href: "/learn", label: ["ಕಲಿಕೆ", "Learn", "सीखें"] },
  { href: "/visits", label: ["ಮನೆ ಭೇಟಿ", "Home Visits", "घर दौरे"] },
  { href: "/dashboard", label: ["ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", "Dashboard", "डैशबोर्ड"] },
  { href: "/profile", label: ["ಪ್ರೊಫೈಲ್", "Profile", "प्रोफ़ाइल"] },
  { href: "/settings", label: ["ಸೆಟ್ಟಿಂಗ್ಸ್", "Settings", "सेटिंग्स"] },
];

// white utility bar + green navigation bar, as on government health portals
export function SiteHeader() {
  const [lang, setLang] = useLang();
  const [size, setSize] = useTextSize();
  const path = usePathname();
  const t = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);

  return (
    <header className="site-header">
      <div className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="AMR Jagruti home">
            <span className="brand-mark">A</span>
            <span>
              <span className="brand-name">AMR ಜಾಗೃತಿ <span className="brand-name-en">AMR Jagruti</span></span>
              <span className={`brand-tag ${lang === "kn" ? "kn" : ""}`}>{t("ASHA ನೇತೃತ್ವದ AMR ಶಿಕ್ಷಣ", "ASHA-led AMR education", "ASHA के नेतृत्व में AMR शिक्षा")}</span>
            </span>
          </Link>
          <div className="topbar-tools">
            <div className="seg" role="group" aria-label={t("ಅಕ್ಷರ ಗಾತ್ರ", "Text size", "अक्षर आकार")}>
              {(["sm", "md", "lg"] as const).map((s) => (
                <button key={s} id={`text-${s}`} aria-pressed={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}
                  title={s === "sm" ? "Smaller text" : s === "md" ? "Normal text" : "Larger text"}>
                  {s === "sm" ? "A−" : s === "md" ? "A" : "A+"}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Language">
              {(["kn", "en", "hi"] as Lang[]).map((l) => (
                <button key={l} id={`lang-${l}`} aria-pressed={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                  {l === "kn" ? "ಕನ್ನಡ" : l === "en" ? "English" : "हिंदी"}
                </button>
              ))}
            </div>
            <Link href="/#start" className="pill-btn hide-sm">{t("ASHA ಕಾರ್ಯಕರ್ತೆ", "ASHA Worker", "ASHA कार्यकर्ता")}</Link>
            <Link href="/dashboard" className="pill-btn hide-sm">{t("ಮೇಲ್ವಿಚಾರಕ", "Supervisor", "पर्यवेक्षक")}</Link>
          </div>
        </div>
      </div>
      <nav className="navbar" aria-label="Main">
        <div className="navbar-inner">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`nav-link ${active ? "active" : ""} ${lang === "kn" ? "kn" : ""}`} aria-current={active ? "page" : undefined}>
                {t(...n.label)}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

// scrolling strip of reviewed key messages (the explanations from the approved quiz bank)
export function KeyMessageTicker() {
  const [lang] = useLang();
  const [lib, setLib] = useState<ContentLibrary | null>(null);
  useEffect(() => { getContentLibrary().then(setLib).catch(() => setLib(null)); }, []);
  if (!lib || lib.keyMessages.length === 0) return null;
  const items = lib.keyMessages.map((m) => pick(m.text, lang));
  return (
    <div className="ticker" aria-label={tr(lang, "ಮುಖ್ಯ ಸಂದೇಶಗಳು", "Key messages", "मुख्य संदेश")}>
      <span className="ticker-label">{tr(lang, "ಮುಖ್ಯ ಸಂದೇಶ", "Key messages", "मुख्य संदेश")}</span>
      <div className="ticker-window">
        {/* the list is repeated once so the loop is seamless; the copy is hidden from screen readers */}
        <div className={`ticker-track ${lang === "kn" ? "kn" : ""}`}>
          {items.map((m, i) => <span key={i}>💊 {m}</span>)}
          {items.map((m, i) => <span key={`d${i}`} aria-hidden="true">💊 {m}</span>)}
        </div>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const [lang] = useLang();
  const t = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);
  const fk = lang === "kn" ? "kn" : "";
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <div className="footer-brand"><span className="brand-mark">A</span> AMR ಜಾಗೃತಿ</div>
          <p className={fk}>{t(
            "ASHA ಕಾರ್ಯಕರ್ತೆಯರು ಮನೆ ಭೇಟಿಯ ಸಮಯದಲ್ಲಿ ಚಿಕ್ಕ AMR ಶಿಕ್ಷಣ ಅಧಿವೇಶನ ನಡೆಸಲು ಸಹಾಯ ಮಾಡುವ ಕನ್ನಡ-ಮೊದಲ ಅಪ್.",
            "A Kannada-first app that helps ASHA workers run short AMR education sessions during household visits.",
            "एक कन्नड़-प्रथम ऐप जो ASHA कार्यकर्ताओं को घर के दौरों में छोटे AMR शिक्षा सत्र चलाने में मदद करता है।")}</p>
        </div>
        <div>
          <h4 className={fk}>{t("ತ್ವರಿತ ಲಿಂಕ್‌ಗಳು", "Quick links", "त्वरित लिंक")}</h4>
          {NAV.map((n) => <Link key={n.href} href={n.href} className={fk}>{t(...n.label)}</Link>)}
        </div>
        <div>
          <h4 className={fk}>{t("ವಿಷಯ ಮೂಲಗಳು", "Content sources", "सामग्री स्रोत")}</h4>
          <span>NCDC AMR Education Materials</span>
          <span>National Action Plan on AMR 2.0 (2025–29)</span>
          <span>Karnataka SAMASTA platform</span>
        </div>
        <div>
          <h4 className={fk}>{t("ಸಹಾಯವಾಣಿ", "Helplines", "हेल्पलाइन")}</h4>
          <a href="tel:104" className={fk}>📞 104 · {t("ಆರೋಗ್ಯ ಸಹಾಯವಾಣಿ", "Health helpline", "स्वास्थ्य हेल्पलाइन")}</a>
          <a href="tel:108" className={fk}>🚑 108 · {t("ತುರ್ತು ಆಂಬ್ಯುಲೆನ್ಸ್", "Emergency ambulance", "आपातकालीन एम्बुलेंस")}</a>
        </div>
      </div>
      <div className={`footer-bottom ${fk}`}>
        {t("⚕️ ಈ ಅಪ್ ಶಿಕ್ಷಣ ಸಾಧನ ಮಾತ್ರ. ಔಷಧ ಸೂಚಿಸಲ್ಲ, ರೋಗ ನಿರ್ಣಯ ಮಾಡಲ್ಲ.",
           "⚕️ This app is an education tool only. It does not diagnose, prescribe, or suggest medicines.",
           "⚕️ यह ऐप केवल एक शिक्षा उपकरण है। यह दवाएं नहीं लिखता या निदान नहीं करता।")}
        <br />
        {t("ಶೈಕ್ಷಣಿಕ ಮಾದರಿ · ಕಂಪ್ಯೂಟಿಂಗ್ ಇನ್ ಮೆಡಿಸಿನ್ · ಅಧಿಕೃತ ಸರ್ಕಾರಿ ಸೇವೆ ಅಲ್ಲ",
           "Academic prototype · Computing in Medicine · Not an official government service",
           "शैक्षणिक प्रोटोटाइप · कंप्यूटिंग इन मेडिसिन · आधिकारिक सरकारी सेवा नहीं")}
      </div>
    </footer>
  );
}

// illustrated title banner used at the top of inner pages
export function PageBanner({ img, title, sub, children }: { img: string; title: string; sub?: string; children?: React.ReactNode }) {
  const [lang] = useLang();
  const fk = lang === "kn" ? "kn" : "";
  return (
    <section className="page-banner">
      <div className="wrap page-banner-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" className="page-banner-img" />
        <div className="page-banner-text">
          <h1 className={fk}>{title}</h1>
          {sub && <p className={fk}>{sub}</p>}
        </div>
        {children && <div className="page-banner-actions">{children}</div>}
      </div>
    </section>
  );
}
