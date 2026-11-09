"use client";

import { useEffect, useMemo, useState } from "react";
import { getContentLibrary, pick, voiceLang, type ContentLibrary } from "@/lib/api-client";
import { useLang, tr } from "@/lib/prefs";
import { SiteHeader, SiteFooter, KeyMessageTicker, PageBanner } from "@/components/SiteChrome";

// Learning library: every approved lesson, browsable and listenable outside a session
export default function LearnPage() {
  const [lang] = useLang();
  const [lib, setLib] = useState<ContentLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moduleId, setModuleId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [speaking, setSpeaking] = useState<string | null>(null);
  const fk = lang === "kn" ? "kn" : "";
  const L = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);

  useEffect(() => {
    getContentLibrary().then(setLib).catch((e) => setError(e instanceof Error ? e.message : "backend unreachable"));
    return () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); };
  }, []);

  // search both reviewed languages so Kannada and English queries both work
  const blocks = useMemo(() => {
    if (!lib) return [];
    const q = query.trim().toLowerCase();
    return lib.modules
      .filter((m) => moduleId === "all" || m.id === moduleId)
      .flatMap((m) => m.blocks.map((b) => ({ ...b, module: m })))
      .filter((b) => !q || [b.title.kn, b.title.en, b.body.kn, b.body.en, ...b.conceptTags].join(" ").toLowerCase().includes(q));
  }, [lib, moduleId, query]);

  function listen(id: string, text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speaking === id) { setSpeaking(null); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLang(lang === "kn" ? "kn" : "en");  // reviewed text exists in kn and en only
    u.rate = 0.9;
    u.onend = () => setSpeaking(null);
    window.speechSynthesis.speak(u);
    setSpeaking(id);
  }

  return (
    <div className="portal portal-page">
      <SiteHeader />
      <KeyMessageTicker />
      <main>
        <PageBanner img="/img/m7.svg" title={L("ಕಲಿಕಾ ಗ್ರಂಥಾಲಯ", "Learning library", "सीखने की लाइब्रेरी")}
          sub={L("ಎಲ್ಲಾ ಅನುಮೋದಿತ ಪಾಠಗಳು, ಅವುಗಳ ಮೂಲದೊಂದಿಗೆ. ಯಾವುದನ್ನಾದರೂ ಕೇಳಲು 🔊 ಒತ್ತಿ.",
                 "Every approved lesson with its source. Press 🔊 to hear any of them.",
                 "सभी स्वीकृत पाठ, उनके स्रोत के साथ। किसी को भी सुनने के लिए 🔊 दबाएं।") + (lang === "hi" ? " समीक्षित हिंदी सामग्री अभी उपलब्ध नहीं है, इसलिए पाठ अंग्रेज़ी में दिखाए जाते हैं।" : "")} />

        <div className="page-body">
          {error && <div className="card mb-4" style={{ background: "var(--red-100)", borderColor: "var(--red-600)" }}>⚠️ {L("ಬ್ಯಾಕೆಂಡ್ ತಲುಪಲಾಗಲಿಲ್ಲ", "Could not reach the backend", "बैकएंड तक नहीं पहुंच सके")}: {error}</div>}
          {!lib && !error && <div className="text-center text-muted" style={{ padding: 40 }}><span className="spinner" /></div>}

          {lib && (
            <>
              <div className="lib-filters" role="tablist">
                <button id="lib-all" role="tab" aria-selected={moduleId === "all"} className={`lib-chip ${moduleId === "all" ? "on" : ""} ${fk}`} onClick={() => setModuleId("all")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/img/step1.svg" alt="" />{L("ಎಲ್ಲಾ", "All", "सभी")}
                </button>
                {lib.modules.map((m) => (
                  <button key={m.id} id={`lib-${m.id}`} role="tab" aria-selected={moduleId === m.id} className={`lib-chip ${moduleId === m.id ? "on" : ""} ${fk}`} onClick={() => setModuleId(m.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/img/${m.id}.svg`} alt="" />{pick(m.title, lang)}
                  </button>
                ))}
              </div>
              <input id="lib-search" className={`lib-search ${fk}`} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={L("ಪಾಠಗಳಲ್ಲಿ ಹುಡುಕಿ…", "Search lessons…", "पाठों में खोजें…")} aria-label={L("ಹುಡುಕಿ", "Search", "खोजें")} />
              <div className="text-xs text-muted mb-3">
                {blocks.length} {L("ಪಾಠಗಳು", "lessons", "पाठ")} · {L("ವಿಷಯ ಆವೃತ್ತಿ", "content version", "सामग्री संस्करण")} {lib.contentVersion}
              </div>

              <div className="lib-grid">
                {blocks.map((b) => {
                  const title = pick(b.title, lang), body = pick(b.body, lang);
                  return (
                    <article key={b.id} className="lib-card" id={`block-${b.id}`}>
                      <div className="lib-card-head">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/img/${b.module.id}.svg`} alt="" />
                        <div style={{ flex: 1 }}>
                          <div className={`text-xs text-muted ${fk}`}>{pick(b.module.title, lang)}</div>
                          <h3 className={fk}>{title}</h3>
                        </div>
                        <button className="btn btn-outline btn-sm" aria-label={L("ಕೇಳಿ", "Listen", "सुनें")} onClick={() => listen(b.id, `${title}. ${body}`)}>
                          {speaking === b.id ? "⏹" : "🔊"}
                        </button>
                      </div>
                      <p className={fk}>{body}</p>
                      <div className="lib-meta">
                        <span className="badge badge-green">⏱ {b.estimatedMinutes} {L("ನಿ.", "min", "मिनट")}</span>
                        <span className="badge badge-neutral">{b.difficulty}</span>
                        {b.conceptTags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                      </div>
                      <div className="cb-source">📚 {b.source} ({b.sourceId} · v{b.version})</div>
                    </article>
                  );
                })}
              </div>
              {blocks.length === 0 && <p className={`text-center text-muted ${fk}`} style={{ padding: 30 }}>{L("ಯಾವ ಪಾಠವೂ ಸಿಗಲಿಲ್ಲ.", "No lessons match.", "कोई पाठ नहीं मिला।")}</p>}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
