"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { getHealth, type Health } from "@/lib/api-client";
import { useLang, useTextSize, tr, type Lang } from "@/lib/prefs";
import { SiteHeader, SiteFooter, PageBanner } from "@/components/SiteChrome";

// old versions of this page stored API keys / AWS tokens in the browser; remove them
const LEGACY_KEY = "amr_llm_config";

export default function SettingsPage() {
  const [lang, setLang] = useLang();
  const [size, setSize] = useTextSize();
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const L = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);
  const fk = lang === "kn" ? "kn" : "";

  // state is only set in promise callbacks, which is what the react-hooks lint rule expects
  const check = useCallback(() => {
    return getHealth()
      .catch((e): Health => ({ ok: false, reachable: false, error: e instanceof Error ? e.message : "request failed" }))
      .then((h) => { setHealth(h); setChecking(false); setCheckedAt(new Date().toLocaleTimeString()); });
  }, []);

  useEffect(() => {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage may be blocked */ }
    check();
  }, [check]);

  const up = health?.reachable === true;
  const row = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "0.88rem" } as const;

  return (
    <div className="portal portal-page">
      <SiteHeader />
      <PageBanner img="/img/step1.svg" title={L("ಸೆಟ್ಟಿಂಗ್ಸ್", "Settings", "सेटिंग्स")}
        sub={L("ಭಾಷೆ, ಅಕ್ಷರ ಗಾತ್ರ ಮತ್ತು ಬ್ಯಾಕೆಂಡ್ ಸಂಪರ್ಕ.", "Language, text size and the backend connection.", "भाषा, अक्षर आकार और बैकएंड कनेक्शन।")} />
      <main className="page-body" style={{ maxWidth: 760 }}>

        <div className="card mb-4" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/quiz-builder">Prepare and review quiz batches →</Link>
          <Link className="btn btn-outline" href="/quiz">Browse published quizzes →</Link>
          <Link className="btn btn-outline" href="/agent-session">Optional agent-led learning sessions →</Link>
        </div>

        {/* Display preferences: saved in this browser and used on every page */}
        <div className="card-elevated mb-4">
          <h3 className={`font-bold text-sm mb-3 ${fk}`} style={{ color: "var(--primary)" }}>{L("ಪ್ರದರ್ಶನ", "Display", "प्रदर्शन")}</h3>
          <div style={row}>
            <span className={`text-muted ${fk}`}>{L("ಭಾಷೆ", "Language", "भाषा")}</span>
            <div className="seg">
              {(["kn", "en", "hi"] as Lang[]).map((l) => (
                <button key={l} id={`settings-lang-${l}`} aria-pressed={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                  {l === "kn" ? "ಕನ್ನಡ" : l === "en" ? "English" : "हिंदी"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...row, borderBottom: "none" }}>
            <span className={`text-muted ${fk}`}>{L("ಅಕ್ಷರ ಗಾತ್ರ", "Text size", "अक्षर आकार")}</span>
            <div className="seg">
              {(["sm", "md", "lg"] as const).map((s) => (
                <button key={s} aria-pressed={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>{s === "sm" ? "A−" : s === "md" ? "A" : "A+"}</button>
              ))}
            </div>
          </div>
          <p className={`text-xs text-muted mt-2 ${fk}`}>{L(
            "ಈ ಆಯ್ಕೆಗಳು ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಉಳಿಯುತ್ತವೆ ಮತ್ತು ಎಲ್ಲಾ ಪುಟಗಳಿಗೂ ಅನ್ವಯಿಸುತ್ತವೆ.",
            "These choices are saved in this browser and apply on every page.",
            "ये विकल्प इस ब्राउज़र में सहेजे जाते हैं और हर पेज पर लागू होते हैं।")}</p>
        </div>

        {/* Backend connection */}
        <div className="card-elevated mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-bold text-sm ${fk}`} style={{ color: "var(--primary)" }}>{L("ಬ್ಯಾಕೆಂಡ್ ಸಂಪರ್ಕ", "Backend connection", "बैकएंड कनेक्शन")}</h3>
            <span id="backend-status" className={`badge ${health === null ? "badge-amber" : up ? "badge-green" : "badge-red"}`}>
              {health === null ? "Checking…" : up ? "● Connected" : "● Unreachable"}
            </span>
          </div>
          <p className={`text-sm text-muted mb-3 ${fk}`}>{L(
            "ಎಲ್ಲಾ ಏಜೆಂಟ್‌ಗಳು ಬ್ಯಾಕೆಂಡ್‌ನಲ್ಲಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತವೆ. ಒದಗಿಸುವವರ ರುಜುವಾತುಗಳನ್ನು ಸರ್ವರ್‌ನಲ್ಲಿ ಮಾತ್ರ ಹೊಂದಿಸಿ; ಈ ಆಪ್‌ನಲ್ಲಿ ನಮೂದಿಸಬೇಡಿ.",
            "All agents run on the AMR Jagruti backend. Configure provider credentials on the server only; never enter them in this app.",
            "सभी एजेंट बैकएंड पर चलते हैं। प्रदाता के क्रेडेंशियल केवल सर्वर पर सेट करें; इस ऐप में कभी दर्ज न करें।")}</p>

          {up && (
            <div>
              <div style={row}><span className="text-muted">{L("ಒದಗಿಸುವವರು", "Provider", "प्रदाता")}</span>
                <strong>{health?.provider === "bedrock" ? "Amazon Bedrock" : health?.provider === "openai" ? "OpenAI" : "—"}</strong></div>
              <div style={row}><span className="text-muted">{L("ಸ್ಥಿತಿ", "Mode", "मोड")}</span>
                <strong>{health?.mock ? "🎭 Mock mode" : health?.configured ? "Live configured" : "Not configured"}</strong></div>
              {health?.provider === "bedrock" && <div style={row}><span className="text-muted">{L("AWS ಪ್ರದೇಶ", "AWS region", "AWS क्षेत्र")}</span><strong id="aws-region">{health.region ?? "—"}</strong></div>}
              <div style={{ ...row, borderBottom: "none" }}><span className="text-muted">{L("ಮಾದರಿ", "Model", "मॉडल")}</span>
                <strong style={{ fontSize: "0.8rem", wordBreak: "break-all", textAlign: "right", marginLeft: 12 }}>{health?.model ?? "—"}</strong></div>
            </div>
          )}

          {health !== null && !up && (
            <div style={{ background: "var(--red-100)", border: "1px solid var(--red-600)", borderRadius: 8, padding: "12px 16px", fontSize: "0.85rem" }}>
              The backend did not respond{health.error ? ` (${health.error})` : ""}. Start it with
              <code style={{ display: "block", marginTop: 6 }}>cd backend && uvicorn main:app --reload --port 8000</code>
            </div>
          )}

          <button id="recheck-btn" className="btn btn-outline btn-full mt-3" onClick={() => { setChecking(true); check(); }} disabled={checking}>
            {checking ? <span className="spinner" /> : `↻ ${L("ಮತ್ತೆ ಪರಿಶೀಲಿಸಿ", "Check again", "फिर से जांचें")}`}
          </button>
          {checkedAt && <div className="text-xs text-muted mt-1 text-center">{L("ಕೊನೆಯ ಪರಿಶೀಲನೆ", "Last checked", "अंतिम जांच")} {checkedAt}</div>}
        </div>

        <div className="card mb-4" style={{ fontSize: "0.82rem" }}>
          <h4 className="font-bold mb-2" style={{ color: "var(--primary)" }}>💡 Provider setup</h4>
          <ul style={{ paddingLeft: 16, lineHeight: 1.8, color: "var(--text-muted)" }}>
            <li>Set <code>LLM_PROVIDER</code>, model and mock settings in <code>backend/.env</code>, then restart the backend.</li>
            <li>For OpenAI, set <code>OPENAI_API_KEY</code> on the server. The key is never entered in this app. See <a href="https://developers.openai.com/api/docs/models/gpt-6-luna" target="_blank" rel="noreferrer">GPT-6 Luna model docs</a>.</li>
            <li>For Bedrock, set <code>LLM_PROVIDER=bedrock</code>; credentials come from <code>aws configure</code>, <code>AWS_PROFILE</code> or an IAM role on the server. Set <code>AWS_REGION</code> there.</li>
            <li>With the default auto mock mode and no OpenAI key, planning uses the local rule-based agent. Connected only confirms that the backend responds; it does not check provider access.</li>
          </ul>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
