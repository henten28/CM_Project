"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/prefs";
import { SiteHeader, SiteFooter, PageBanner } from "@/components/SiteChrome";
import { getVisits, addVisit, deleteVisit, visitsToCSV, type Visit } from "@/lib/visit-tracker";
import { KA_DISTRICTS } from "@/lib/profile-store";

const TOPICS = [
  { value: "general", kn: "ಸಾಮಾನ್ಯ AMR", en: "General AMR", hi: "सामान्य AMR" },
  { value: "antibiotics", kn: "ಪ್ರತಿಜೀವಕಗಳು", en: "Antibiotics", hi: "एंटीबायोटिक्स" },
  { value: "amr", kn: "AMR ನಿರೋಧ", en: "AMR Resistance", hi: "AMR प्रतिरोध" },
  { value: "prevention", kn: "ಸೋಂಕು ತಡೆ", en: "Prevention", hi: "रोकथाम" },
  { value: "sharing", kn: "ಹಂಚಿಕೊಳ್ಳಬೇಡಿ", en: "Don't Share", hi: "साझा न करें" },
  { value: "case study", kn: "ಕೇಸ್ ಸ್ಟಡಿ", en: "Case Study", hi: "केस अध्ययन" },
];

export default function VisitsPage() {
  const [lang] = useLang();  // shared, saved preference; changed from the site header
  const [visits, setVisits] = useState<Visit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    familyName: "", village: "", district: "Bengaluru Urban",
    topic: "general", durationMin: 20, outcome: "completed" as Visit["outcome"],
    notes: "", quizScore: 80,
  });

  useEffect(() => {
    setVisits(getVisits());
  }, []);

  function f(kn: string, en: string, hi: string) {
    return lang === "kn" ? kn : lang === "hi" ? hi : en;
  }
  const fk = lang === "kn" ? "kn" : "";

  function handleAdd() {
    const topic = TOPICS.find((t) => t.value === form.topic);
    const v = addVisit({
      ...form,
      lang,
      topicLabel: topic ? (lang === "kn" ? topic.kn : lang === "hi" ? topic.hi : topic.en) : form.topic,
      date: new Date().toISOString().split("T")[0],
    });
    setVisits((prev) => [v, ...prev]);
    setShowForm(false);
    setForm({ familyName: "", village: "", district: "Bengaluru Urban", topic: "general", durationMin: 20, outcome: "completed", notes: "", quizScore: 80 });
  }

  function handleDelete(id: string) {
    deleteVisit(id);
    setVisits((prev) => prev.filter((v) => v.id !== id));
  }

  function handleExport() {
    const csv = visitsToCSV(visits);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `amr-visits-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const outcomeColor = { completed: "badge-green", partial: "badge-amber", referred: "badge-sky" };
  const outcomeLabel = { completed: f("ಪೂರ್ಣ", "Completed", "पूर्ण"), partial: f("ಅಂಶಶಃ", "Partial", "आंशिक"), referred: f("ಉಲ್ಲೇಖ", "Referred", "संदर्भित") };
  // topic picture for each visit (original illustrations in public/img)
  const topicImg: Record<string, string> = { general: "/img/step3.svg", antibiotics: "/img/m1.svg", amr: "/img/m2.svg", prevention: "/img/m6.svg", sharing: "/img/m4.svg", "case study": "/img/m7.svg" };
  const families = new Set(visits.map((v) => `${v.familyName.trim().toLowerCase()}|${v.village.trim().toLowerCase()}`)).size;
  const scored = visits.filter((v) => v.quizScore != null);
  const avgScore = scored.length ? Math.round(scored.reduce((n, v) => n + (v.quizScore ?? 0), 0) / scored.length) : null;
  const referred = visits.filter((v) => v.outcome === "referred").length;
  const scoreStyle = (n: number) => ({ background: n >= 80 ? "var(--green-50)" : n >= 60 ? "#fff3cd" : "var(--red-100)", color: n >= 80 ? "var(--green-800)" : n >= 60 ? "var(--amber-900)" : "var(--red-600)" });

  return (
    <div className="portal portal-page">
      <SiteHeader />
      <PageBanner img="/img/m5.svg" title={f("ಮನೆ ಭೇಟಿಗಳು", "Household Visits", "घरेलू दौरे")}
        sub={f("ನೀವು ಭೇಟಿ ನೀಡಿದ ಪ್ರತಿ ಕುಟುಂಬ, ಕಲಿಸಿದ ವಿಷಯ ಮತ್ತು ಫಲಿತಾಂಶವನ್ನು ದಾಖಲಿಸಿ. ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಯುತ್ತದೆ.",
               "Log each family you visit, the topic you covered and the outcome. Saved on this device.",
               "हर परिवार का दौरा, सिखाया गया विषय और परिणाम दर्ज करें। इस डिवाइस पर सहेजा जाता है।")}>
        {visits.length > 0 && <button id="export-csv-btn" className="btn btn-outline" onClick={handleExport}>📥 CSV</button>}
        <button id="add-visit-btn" className={`btn btn-primary ${fk}`} onClick={() => setShowForm(!showForm)}>+ {f("ಭೇಟಿ ಸೇರಿಸಿ", "Add Visit", "दौरा जोड़ें")}</button>
      </PageBanner>

      <main className="page-body">
        <div className="mini-stats">
          {[
            { icon: "🏘️", bg: "#e3eefc", val: visits.length, label: f("ಒಟ್ಟು ಭೇಟಿಗಳು", "Visits logged", "कुल दौरे") },
            { icon: "👪", bg: "#fde2e4", val: families, label: f("ಕುಟುಂಬಗಳು", "Families reached", "परिवार") },
            { icon: "🧠", bg: "#d8f3dc", val: avgScore === null ? "—" : `${avgScore}%`, label: f("ಸರಾಸರಿ ಅಂಕ", "Average quiz score", "औसत स्कोर") },
            { icon: "🏥", bg: "#fff3cd", val: referred, label: f("ಉಲ್ಲೇಖಿಸಿದ", "Referred", "संदर्भित") },
          ].map((m) => (
            <div key={m.label} className="mini-stat">
              <span className="ms-icon" style={{ background: m.bg }}>{m.icon}</span>
              <div><div className="ms-val">{m.val}</div><div className={`ms-label ${fk}`}>{m.label}</div></div>
            </div>
          ))}
        </div>

        {/* Add visit form */}
        {showForm && (
          <div className="card-elevated mb-4 animate-slide">
            <h2 className={`card-title ${fk}`}>📝 {f("ಹೊಸ ಭೇಟಿ ದಾಖಲಿಸಿ", "Log New Visit", "नया दौरा लॉग करें")}</h2>
            <div className="form-grid">
              <div className="field">
                <label className={fk} htmlFor="visit-family">{f("ಕುಟುಂಬ ಹೆಸರು", "Family Name", "परिवार का नाम")}</label>
                <input id="visit-family" className={fk} value={form.familyName} placeholder={f("ಕುಟುಂಬ ಹೆಸರು", "Family name", "परिवार नाम")}
                  onChange={(e) => setForm((x) => ({ ...x, familyName: e.target.value }))} />
              </div>
              <div className="field">
                <label className={fk} htmlFor="visit-village">{f("ಗ್ರಾಮ/ವಾರ್ಡ್", "Village / Ward", "गाँव / वार्ड")}</label>
                <input id="visit-village" className={fk} value={form.village} placeholder={f("ಗ್ರಾಮ", "Village", "गाँव")}
                  onChange={(e) => setForm((x) => ({ ...x, village: e.target.value }))} />
              </div>
              <div className="field">
                <label className={fk} htmlFor="visit-district">{f("ಜಿಲ್ಲೆ", "District", "जिला")}</label>
                <select id="visit-district" value={form.district} onChange={(e) => setForm((x) => ({ ...x, district: e.target.value }))}>
                  {KA_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label className={fk} htmlFor="visit-topic">{f("ವಿಷಯ", "Topic", "विषय")}</label>
                <select id="visit-topic" className={fk} value={form.topic} onChange={(e) => setForm((x) => ({ ...x, topic: e.target.value }))}>
                  {TOPICS.map((t) => <option key={t.value} value={t.value}>{lang === "kn" ? t.kn : lang === "hi" ? t.hi : t.en}</option>)}
                </select>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className={fk} htmlFor="visit-duration">{f("ಸಮಯ (ನಿ.)", "Duration (min)", "समय (मिनट)")}</label>
                <input id="visit-duration" type="number" value={form.durationMin} min={5} max={90} onChange={(e) => setForm((x) => ({ ...x, durationMin: Number(e.target.value) }))} />
              </div>
              <div className="field">
                <label className={fk} htmlFor="visit-score">{f("ಅಂಕ (%)", "Quiz Score (%)", "स्कोर (%)")}</label>
                <input id="visit-score" type="number" value={form.quizScore} min={0} max={100} onChange={(e) => setForm((x) => ({ ...x, quizScore: Number(e.target.value) }))} />
              </div>
              <div className="field">
                <label className={fk} htmlFor="visit-outcome">{f("ಫಲಿತಾಂಶ", "Outcome", "परिणाम")}</label>
                <select id="visit-outcome" className={fk} value={form.outcome} onChange={(e) => setForm((x) => ({ ...x, outcome: e.target.value as Visit["outcome"] }))}>
                  <option value="completed">{outcomeLabel.completed}</option>
                  <option value="partial">{outcomeLabel.partial}</option>
                  <option value="referred">{outcomeLabel.referred}</option>
                </select>
              </div>
            </div>
            <div className="field mb-4">
              <label className={fk} htmlFor="visit-notes">{f("ಟಿಪ್ಪಣಿಗಳು", "Notes", "नोट्स")}</label>
              <textarea id="visit-notes" className={fk} value={form.notes} rows={2} style={{ resize: "none" }}
                onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} placeholder={f("ಹೆಚ್ಚುವರಿ ಮಾಹಿತಿ…", "Additional notes…", "अतिरिक्त नोट्स…")} />
            </div>
            <div className="flex gap-2">
              <button id="submit-visit-btn" className={`btn btn-primary flex-1 ${fk}`} onClick={handleAdd} disabled={!form.familyName.trim() || !form.village.trim()}>
                {f("ದಾಖಲಿಸಿ", "Log Visit", "दर्ज करें")}
              </button>
              <button className={`btn btn-ghost ${fk}`} onClick={() => setShowForm(false)}>{f("ರದ್ದು", "Cancel", "रद्द करें")}</button>
            </div>
          </div>
        )}

        {/* Visit list */}
        {visits.length === 0 ? (
          !showForm && (
            <div className="empty-state">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/hero.svg" alt="" />
              <p className={`text-muted ${fk}`}>{f("ಇನ್ನೂ ಯಾವ ಭೇಟಿ ದಾಖಲಿಸಿಲ್ಲ", "No visits logged yet", "अभी तक कोई दौरा लॉग नहीं")}</p>
              <button className={`btn btn-primary mt-3 ${fk}`} onClick={() => setShowForm(true)}>+ {f("ಮೊದಲ ಭೇಟಿ ಸೇರಿಸಿ", "Add First Visit", "पहला दौरा जोड़ें")}</button>
            </div>
          )
        ) : (
          <div className="visit-grid">
            {visits.map((v) => (
              <div key={v.id} className="visit-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={topicImg[v.topic] ?? "/img/step3.svg"} alt="" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className={v.lang === "kn" ? "kn" : ""}>{v.familyName} · {v.village}</h3>
                  <div className={`vc-meta ${v.lang === "kn" ? "kn" : ""}`}>{v.topicLabel}</div>
                  <div className="vc-meta">📅 {v.date} · 📍 {v.district} · ⏱ {v.durationMin} min</div>
                  <div className="flex gap-2 mt-2 items-center" style={{ flexWrap: "wrap" }}>
                    <span className={`badge ${outcomeColor[v.outcome]} ${fk}`}>{outcomeLabel[v.outcome]}</span>
                    {v.quizScore != null && <span className="score-pill" style={scoreStyle(v.quizScore)}>{v.quizScore}%</span>}
                  </div>
                  {v.notes && <div className="vc-meta mt-1">{v.notes}</div>}
                </div>
                <button className="icon-btn" aria-label={f("ಅಳಿಸಿ", "Delete", "हटाएं")} onClick={() => handleDelete(v.id)}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
