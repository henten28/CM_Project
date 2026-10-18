"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getVisits, addVisit, deleteVisit, visitsToCSV, type Visit } from "@/lib/visit-tracker";
import { getProfile } from "@/lib/profile-store";
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
  const router = useRouter();
  const [lang, setLang] = useState<"kn" | "en" | "hi">("kn");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    familyName: "", village: "", district: "Bengaluru Urban",
    topic: "general", durationMin: 20, outcome: "completed" as Visit["outcome"],
    notes: "", quizScore: 80,
  });

  useEffect(() => {
    setVisits(getVisits());
    const p = getProfile();
    if (p) setLang(p.lang);
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <div>
            <div className="logo-text">AMR ಜಾಗೃತಿ</div>
            <div className={`logo-sub ${fk}`}>{f("ಮನೆ ಭೇಟಿ ಟ್ರ್ಯಾಕರ್", "Visit Tracker", "घर भ्रमण ट्रैकर")}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="lang-toggle">
            {(["kn","en","hi"] as const).map((l) => (
              <button key={l} className={lang === l ? "active" : ""} onClick={() => setLang(l)}>
                {l === "kn" ? "ಕನ್ನಡ" : l === "en" ? "EN" : "हिं"}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push("/")}>← {f("ಮನೆ", "Home", "होम")}</button>
        </div>
      </header>

      <main style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px 40px" }}>
        {/* Actions row */}
        <div className="flex justify-between items-center mb-4">
          <h1 className={`text-lg font-bold text-primary ${fk}`}>
            🏘️ {f("ಮನೆ ಭೇಟಿಗಳು", "Household Visits", "घरेलू दौरे")} ({visits.length})
          </h1>
          <div className="flex gap-2">
            {visits.length > 0 && (
              <button id="export-csv-btn" className="btn btn-outline btn-sm" onClick={handleExport}>
                📥 CSV
              </button>
            )}
            <button id="add-visit-btn" className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
              + {f("ಭೇಟಿ ಸೇರಿಸಿ", "Add Visit", "दौरा जोड़ें")}
            </button>
          </div>
        </div>

        {/* Add Visit Form */}
        {showForm && (
          <div className="card-elevated mb-4 animate-slide">
            <h3 className={`font-bold mb-3 text-primary ${fk}`}>{f("ಹೊಸ ಭೇಟಿ ದಾಖಲಿಸಿ", "Log New Visit", "नया दौरा लॉग करें")}</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              {[
                { label: f("ಕುಟುಂಬ ಹೆಸರು", "Family Name", "परिवार का नाम"), val: form.familyName, key: "familyName" as const, ph: f("ಕುಟುಂಬ ಹೆಸರು", "Family name", "परिवार नाम") },
                { label: f("ಗ್ರಾಮ/ವಾರ್ಡ್", "Village / Ward", "गाँव / वार्ड"), val: form.village, key: "village" as const, ph: f("ಗ್ರಾಮ", "Village", "गाँव") },
              ].map((field) => (
                <div key={field.key}>
                  <label className={`block text-xs font-medium mb-1 text-muted ${fk}`}>{field.label}</label>
                  <input value={field.val} placeholder={field.ph}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)", fontFamily: lang === "kn" ? "var(--font-kannada)" : "inherit" }} />
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className={`block text-xs font-medium mb-1 text-muted ${fk}`}>{f("ಜಿಲ್ಲೆ", "District", "जिला")}</label>
                <select value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)" }}>
                  {KA_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 text-muted ${fk}`}>{f("ವಿಷಯ", "Topic", "विषय")}</label>
                <select value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)", fontFamily: lang === "kn" ? "var(--font-kannada)" : "inherit" }}>
                  {TOPICS.map((t) => <option key={t.value} value={t.value}>{lang === "kn" ? t.kn : lang === "hi" ? t.hi : t.en}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label className={`block text-xs font-medium mb-1 text-muted ${fk}`}>{f("ಸಮಯ (ನಿ.)", "Duration (min)", "समय (मिनट)")}</label>
                <input type="number" value={form.durationMin} min={5} max={90}
                  onChange={(e) => setForm((f) => ({ ...f, durationMin: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "9px 12px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)" }} />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 text-muted ${fk}`}>{f("ಅಂಕ (%)", "Quiz Score (%)", "स्कोर (%)")}</label>
                <input type="number" value={form.quizScore} min={0} max={100}
                  onChange={(e) => setForm((f) => ({ ...f, quizScore: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "9px 12px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)" }} />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 text-muted ${fk}`}>{f("ಫಲಿತಾಂಶ", "Outcome", "परिणाम")}</label>
                <select value={form.outcome} onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value as Visit["outcome"] }))}
                  style={{ width: "100%", padding: "9px 12px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)", fontFamily: lang === "kn" ? "var(--font-kannada)" : "inherit" }}>
                  <option value="completed">{f("ಪೂರ್ಣ", "Completed", "पूर्ण")}</option>
                  <option value="partial">{f("ಅಂಶಶಃ", "Partial", "आंशिक")}</option>
                  <option value="referred">{f("ಉಲ್ಲೇಖ", "Referred", "संदर्भित")}</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className={`block text-xs font-medium mb-1 text-muted ${fk}`}>{f("ಟಿಪ್ಪಣಿಗಳು", "Notes", "नोट्स")}</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={f("ಹೆಚ್ಚುವರಿ ಮಾಹಿತಿ…", "Additional notes…", "अतिरिक्त नोट्स…")}
                style={{ width: "100%", padding: "9px 12px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)", fontFamily: lang === "kn" ? "var(--font-kannada)" : "inherit", resize: "none" }} />
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
          <div className="card text-center" style={{ padding: "40px 20px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🏘️</div>
            <p className={`text-muted ${fk}`}>{f("ಇನ್ನೂ ಯಾವ ಭೇಟಿ ದಾಖಲಿಸಿಲ್ಲ", "No visits logged yet", "अभी तक कोई दौरा लॉग नहीं")}</p>
            <button className="btn btn-primary mt-3" onClick={() => setShowForm(true)}>+ {f("ಮೊದಲ ಭೇಟಿ ಸೇರಿಸಿ", "Add First Visit", "पहला दौरा जोड़ें")}</button>
          </div>
        ) : (
          visits.map((v) => (
            <div key={v.id} className="session-history-item">
              <div className="shi-icon">🏠</div>
              <div className="shi-info">
                <div className={`shi-title ${v.lang === "kn" ? "kn" : ""}`}>{v.familyName} — {v.village}</div>
                <div className="shi-meta">{v.date} · {v.district} · {v.durationMin} min
                  <span className={`badge ${outcomeColor[v.outcome]} ml-2`} style={{ fontSize: "0.68rem" }}>{v.outcome}</span>
                </div>
                {v.notes && <div className="text-xs text-muted mt-1">{v.notes}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {v.quizScore != null && (
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: v.quizScore >= 80 ? "var(--green-700)" : v.quizScore >= 60 ? "var(--amber-700)" : "var(--red-600)" }}>
                    {v.quizScore}%
                  </div>
                )}
                <button onClick={() => handleDelete(v.id)} style={{ fontSize: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", marginTop: 4 }}>🗑️</button>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
