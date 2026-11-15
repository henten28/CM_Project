"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLang, tr } from "@/lib/prefs";
import { useUser } from "@/lib/auth-client";
import { SiteHeader, SiteFooter, PageBanner } from "@/components/SiteChrome";
import { addVisit, deleteVisit, getMySessions, getMyVisits, type MySession, type Visit } from "@/lib/api-client";
import { KA_DISTRICTS } from "@/lib/profile-store";

const TOPICS = [
  { value: "general", kn: "ಸಾಮಾನ್ಯ AMR", en: "General AMR", hi: "सामान्य AMR" },
  { value: "antibiotics", kn: "ಪ್ರತಿಜೀವಕಗಳು", en: "Antibiotics", hi: "एंटीबायोटिक्स" },
  { value: "amr", kn: "AMR ನಿರೋಧ", en: "AMR Resistance", hi: "AMR प्रतिरोध" },
  { value: "prevention", kn: "ಸೋಂಕು ತಡೆ", en: "Prevention", hi: "रोकथाम" },
  { value: "sharing", kn: "ಹಂಚಿಕೊಳ್ಳಬೇಡಿ", en: "Don't Share", hi: "साझा न करें" },
  { value: "case study", kn: "ಕೇಸ್ ಸ್ಟಡಿ", en: "Case Study", hi: "केस अध्ययन" },
];
const TOPIC_IMG: Record<string, string> = { general: "/img/step3.svg", antibiotics: "/img/m1.svg", amr: "/img/m2.svg", prevention: "/img/m6.svg", sharing: "/img/m4.svg", "case study": "/img/m7.svg" };

type Form = { household: string; village: string; district: string; sessionId: string; topic: string; durationMin: number; outcome: Visit["outcome"]; notes: string };

function VisitsContent() {
  const [lang] = useLang();
  const f = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);
  const fk = lang === "kn" ? "kn" : "";
  const user = useUser();
  const linkSession = useSearchParams().get("session") ?? "";

  const [visits, setVisits] = useState<Visit[]>([]);
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [showForm, setShowForm] = useState(Boolean(linkSession));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blank = (district = "Mysuru"): Form => ({ household: "", village: "", district, sessionId: linkSession, topic: "general", durationMin: 10, outcome: "completed", notes: "" });
  const [form, setForm] = useState<Form>(blank());

  useEffect(() => {
    getMyVisits().then(setVisits).catch((e) => setError(String(e instanceof Error ? e.message : e)));
    getMySessions().then(setSessions).catch(() => setSessions([]));
  }, []);
  // default the district to the ASHA's own
  useEffect(() => {
    const district = user?.district;
    if (district) Promise.resolve().then(() => setForm((x) => (x.household || x.village ? x : { ...x, district })));
  }, [user?.district]);

  const linked = sessions.find((s) => s.id === form.sessionId) ?? null;
  const usable = sessions.filter((s) => s.state === "COMPLETED" || s.state === "IN_PROGRESS" || s.state === "SAFETY_HOLD");
  const topicLabel = (v: string) => { const t = TOPICS.find((x) => x.value === v); return t ? tr(lang, t.kn, t.en, t.hi) : v; };

  async function handleAdd() {
    setBusy(true); setError(null);
    try {
      const v = await addVisit({
        household: form.household, village: form.village, district: form.district, outcome: form.outcome, notes: form.notes,
        ...(form.sessionId ? { sessionId: form.sessionId } : { topic: form.topic, durationMin: form.durationMin, lang }),
      });
      setVisits((prev) => [v, ...prev]);
      setShowForm(false);
      setForm(blank(user?.district || "Mysuru"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the visit"); }
    finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteVisit(id); setVisits((prev) => prev.filter((v) => v.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete"); }
  }

  function handleExport() {
    const headers = ["ID", "Household", "Village", "District", "Topic", "Language", "Date", "Duration(min)", "Outcome", "Score(%)", "Session", "Notes"];
    const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
    const rows = visits.map((v) => [v.id, q(v.household), q(v.village), q(v.district), q(v.topic), v.lang, v.date, v.durationMin, v.outcome, v.quizScore ?? "", v.sessionId ?? "", q(v.notes)]);
    const blob = new Blob([[headers, ...rows].map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `amr-visits-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const outcomeColor = { completed: "badge-green", partial: "badge-amber", referred: "badge-sky" };
  const outcomeLabel = { completed: f("ಪೂರ್ಣ", "Completed", "पूर्ण"), partial: f("ಅಂಶಶಃ", "Partial", "आंशिक"), referred: f("ಉಲ್ಲೇಖ", "Referred", "संदर्भित") };
  const stats = useMemo(() => {
    const families = new Set(visits.map((v) => `${v.household.trim().toLowerCase()}|${v.village.trim().toLowerCase()}`)).size;
    const scored = visits.filter((v) => v.quizScore !== null);
    const avg = scored.length ? Math.round(scored.reduce((n, v) => n + (v.quizScore ?? 0), 0) / scored.length) : null;
    return { families, avg, referred: visits.filter((v) => v.outcome === "referred").length };
  }, [visits]);
  const scoreStyle = (n: number) => ({ background: n >= 80 ? "var(--green-50)" : n >= 60 ? "#fff3cd" : "var(--red-100)", color: n >= 80 ? "var(--green-800)" : n >= 60 ? "var(--amber-900)" : "var(--red-600)" });

  return (
    <div className="portal portal-page">
      <SiteHeader />
      <PageBanner img="/img/m5.svg" title={f("ಮನೆ ಭೇಟಿಗಳು", "Household Visits", "घरेलू दौरे")}
        sub={f("ಪ್ರತಿ ಭೇಟಿಯನ್ನು ದಾಖಲಿಸಿ. ಅಧಿವೇಶನಕ್ಕೆ ಜೋಡಿಸಿದರೆ, ಕುಟುಂಬದ ರಸಪ್ರಶ್ನೆ ಅಂಕ ಅದರಿಂದಲೇ ಬರುತ್ತದೆ. ನಿಮ್ಮ ಮೇಲ್ವಿಚಾರಕರಿಗೆ ಕಾಣುತ್ತದೆ.",
               "Log each visit. Link it to the session you ran and the household's quiz score is taken from that session. Your supervisor can see your visits.",
               "हर दौरा दर्ज करें। सत्र से जोड़ने पर परिवार का स्कोर उसी सत्र से आता है। आपके पर्यवेक्षक इसे देख सकते हैं।")}>
        {visits.length > 0 && <button id="export-csv-btn" className="btn btn-outline" onClick={handleExport}>📥 CSV</button>}
        <button id="add-visit-btn" className={`btn btn-primary ${fk}`} onClick={() => setShowForm(!showForm)}>+ {f("ಭೇಟಿ ಸೇರಿಸಿ", "Add Visit", "दौरा जोड़ें")}</button>
      </PageBanner>

      <main className="page-body">
        <div className="mini-stats">
          {[
            { icon: "🏘️", bg: "#e3eefc", val: visits.length, label: f("ಒಟ್ಟು ಭೇಟಿಗಳು", "Visits logged", "कुल दौरे") },
            { icon: "👪", bg: "#fde2e4", val: stats.families, label: f("ಕುಟುಂಬಗಳು", "Households reached", "परिवार") },
            { icon: "🧠", bg: "#d8f3dc", val: stats.avg === null ? "—" : `${stats.avg}%`, label: f("ಸರಾಸರಿ ಕುಟುಂಬ ಅಂಕ", "Avg household quiz score", "औसत परिवार स्कोर") },
            { icon: "🏥", bg: "#fff3cd", val: stats.referred, label: f("ಉಲ್ಲೇಖಿಸಿದ", "Referred", "संदर्भित") },
          ].map((m) => (
            <div key={m.label} className="mini-stat">
              <span className="ms-icon" style={{ background: m.bg }}>{m.icon}</span>
              <div><div className="ms-val">{m.val}</div><div className={`ms-label ${fk}`}>{m.label}</div></div>
            </div>
          ))}
        </div>

        {error && <div className="login-error mb-4" role="alert">{error}</div>}

        {showForm && (
          <div className="card-elevated mb-4 animate-slide">
            <h2 className={`card-title ${fk}`}>📝 {f("ಹೊಸ ಭೇಟಿ ದಾಖಲಿಸಿ", "Log New Visit", "नया दौरा लॉग करें")}</h2>
            <div className="form-grid">
              <div className="field">
                <label className={fk} htmlFor="visit-family">{f("ಕುಟುಂಬ (ಹೆಸರು ಅಥವಾ ಸಂಕೇತ)", "Household (name or code)", "परिवार (नाम या कोड)")}</label>
                <input id="visit-family" className={fk} value={form.household} maxLength={100} placeholder={f("ಉದಾ. ಮನೆ 12", "e.g. House 12", "जैसे घर 12")}
                  onChange={(e) => setForm((x) => ({ ...x, household: e.target.value }))} />
              </div>
              <div className="field">
                <label className={fk} htmlFor="visit-village">{f("ಗ್ರಾಮ/ವಾರ್ಡ್", "Village / Ward", "गाँव / वार्ड")}</label>
                <input id="visit-village" className={fk} value={form.village} maxLength={100} placeholder={f("ಗ್ರಾಮ", "Village", "गाँव")}
                  onChange={(e) => setForm((x) => ({ ...x, village: e.target.value }))} />
              </div>
              <div className="field">
                <label className={fk} htmlFor="visit-district">{f("ಜಿಲ್ಲೆ", "District", "जिला")}</label>
                <select id="visit-district" value={form.district} onChange={(e) => setForm((x) => ({ ...x, district: e.target.value }))}>
                  {KA_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="field mb-3">
              <label className={fk} htmlFor="visit-session">{f("ಈ ಭೇಟಿಯಲ್ಲಿ ನಡೆಸಿದ ಅಧಿವೇಶನ", "Session run during this visit", "इस दौरे में चलाया गया सत्र")}</label>
              <select id="visit-session" value={form.sessionId} onChange={(e) => setForm((x) => ({ ...x, sessionId: e.target.value }))}>
                <option value="">{f("ಅಧಿವೇಶನ ನಡೆಸಿಲ್ಲ (ಅಂಕ ಇಲ್ಲ)", "No session run (no quiz score)", "कोई सत्र नहीं (स्कोर नहीं)")}</option>
                {usable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })} · {topicLabel(s.topic)} · {s.durationMin} min
                    {s.quizScore !== null ? ` · ${s.quizScore}%` : ""}
                  </option>
                ))}
              </select>
              <p className={`text-xs text-muted mt-1 ${fk}`}>{linked
                ? f(`ಕುಟುಂಬ ಒಟ್ಟಿಗೆ ಉತ್ತರಿಸಿದ ರಸಪ್ರಶ್ನೆಯ ಅಂಕ: ${linked.quizScore ?? "—"}%. ವಿಷಯ ಮತ್ತು ಸಮಯ ಅಧಿವೇಶನದಿಂದ ಬರುತ್ತವೆ.`,
                    `Quiz score the household earned together in this session: ${linked.quizScore ?? "—"}%. Topic and duration come from the session.`,
                    `इस सत्र में परिवार का स्कोर: ${linked.quizScore ?? "—"}%। विषय और समय सत्र से आते हैं।`)
                : f("ಕುಟುಂಬ ಅಧಿವೇಶನದಲ್ಲಿ ಒಟ್ಟಿಗೆ ರಸಪ್ರಶ್ನೆ ಉತ್ತರಿಸುತ್ತದೆ; ಅಂಕವನ್ನು ಕೈಯಿಂದ ಬರೆಯಲಾಗುವುದಿಲ್ಲ.",
                    "The household answers the checkpoint quiz together during a session; the score is never typed in by hand.",
                    "परिवार सत्र में मिलकर प्रश्नोत्तरी देता है; स्कोर हाथ से नहीं भरा जाता।")}</p>
            </div>

            <div className="form-grid">
              {!linked && <>
                <div className="field">
                  <label className={fk} htmlFor="visit-topic">{f("ವಿಷಯ", "Topic", "विषय")}</label>
                  <select id="visit-topic" className={fk} value={form.topic} onChange={(e) => setForm((x) => ({ ...x, topic: e.target.value }))}>
                    {TOPICS.map((t) => <option key={t.value} value={t.value}>{tr(lang, t.kn, t.en, t.hi)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className={fk} htmlFor="visit-duration">{f("ಸಮಯ (ನಿ.)", "Duration (min)", "समय (मिनट)")}</label>
                  <input id="visit-duration" type="number" value={form.durationMin} min={1} max={240} onChange={(e) => setForm((x) => ({ ...x, durationMin: Number(e.target.value) }))} />
                </div>
              </>}
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
              <textarea id="visit-notes" className={fk} value={form.notes} rows={2} maxLength={1000} style={{ resize: "none" }}
                onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} placeholder={f("ಹೆಚ್ಚುವರಿ ಮಾಹಿತಿ (ವೈದ್ಯಕೀಯ ವಿವರ ಬೇಡ)…", "Additional notes (no medical details)…", "अतिरिक्त नोट्स (चिकित्सा विवरण नहीं)…")} />
            </div>
            <div className="flex gap-2">
              <button id="submit-visit-btn" className={`btn btn-primary flex-1 ${fk}`} onClick={handleAdd} disabled={busy || !form.household.trim() || !form.village.trim()}>
                {busy ? <span className="spinner" /> : f("ದಾಖಲಿಸಿ", "Log Visit", "दर्ज करें")}
              </button>
              <button className={`btn btn-ghost ${fk}`} onClick={() => setShowForm(false)}>{f("ರದ್ದು", "Cancel", "रद्द करें")}</button>
            </div>
          </div>
        )}

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
                <img src={TOPIC_IMG[v.topic] ?? "/img/step3.svg"} alt="" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{v.household} · {v.village}</h3>
                  <div className={`vc-meta ${fk}`}>{topicLabel(v.topic)}</div>
                  <div className="vc-meta">📅 {v.date} · 📍 {v.district} · ⏱ {v.durationMin} min</div>
                  <div className="flex gap-2 mt-2 items-center" style={{ flexWrap: "wrap" }}>
                    <span className={`badge ${outcomeColor[v.outcome]} ${fk}`}>{outcomeLabel[v.outcome]}</span>
                    {v.quizScore !== null && <span className="score-pill" style={scoreStyle(v.quizScore)} title={f("ಅಧಿವೇಶನದಿಂದ", "From the session", "सत्र से")}>{v.quizScore}%</span>}
                    {v.sessionId && <a className="text-xs" style={{ color: "var(--primary)" }} href={`/session?id=${encodeURIComponent(v.sessionId)}`}>{f("ಅಧಿವೇಶನ ನೋಡಿ", "View session", "सत्र देखें")}</a>}
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

export default function VisitsPage() {
  return <Suspense fallback={<div className="portal portal-page"><main className="page-body">Loading…</main></div>}><VisitsContent /></Suspense>;
}
