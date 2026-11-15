"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBanner, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { homeFor, login } from "@/lib/auth-client";
import { useLang, tr } from "@/lib/prefs";

// demo accounts created by the backend on first run (SEED_DEMO_USERS); shown here for the prototype demo only
const DEMO = [
  { username: "asha", password: "asha123", label: "ASHA worker (Savitha)" },
  { username: "asha2", password: "asha123", label: "ASHA worker (Rekha)" },
  { username: "supervisor", password: "super123", label: "Supervisor" },
];

function LoginContent() {
  const [lang] = useLang();
  const L = (kn: string, en: string, hi: string) => tr(lang, kn, en, hi);
  const fk = lang === "kn" ? "kn" : "";
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const user = await login(username, password);
      // only follow a same-site path, and only one this role may open (proxy.ts redirects otherwise)
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role);
      router.push(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="portal portal-page">
      <SiteHeader />
      <PageBanner img="/img/step2.svg" title={L("ಸೈನ್ ಇನ್", "Sign in", "साइन इन")}
        sub={L("ASHA ಕಾರ್ಯಕರ್ತೆಯರು ಮತ್ತು ಮೇಲ್ವಿಚಾರಕರಿಗೆ. ಕುಟುಂಬದ ಸದಸ್ಯರಿಗೆ ಖಾತೆ ಬೇಕಿಲ್ಲ.",
               "For ASHA workers and supervisors. Household members do not need an account.",
               "ASHA कार्यकर्ताओं और पर्यवेक्षकों के लिए। परिवार के सदस्यों को खाते की ज़रूरत नहीं।")} />
      <main className="page-body">
        <div className="login-wrap">
          <form className="card-elevated login-card" onSubmit={submit}>
            <h2 className={fk}>{L("ನಿಮ್ಮ ಖಾತೆಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ", "Sign in to your account", "अपने खाते में साइन इन करें")}</h2>
            {next && <div className={`notice-bar ${fk}`}>{L("ಈ ಪುಟ ತೆರೆಯಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.", "Please sign in to open that page.", "वह पेज खोलने के लिए साइन इन करें।")}</div>}
            <label className={`field ${fk}`}>{L("ಬಳಕೆದಾರ ಹೆಸರು", "Username", "यूज़रनेम")}
              <input id="login-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={40} />
            </label>
            <label className={`field ${fk}`}>{L("ಪಾಸ್‌ವರ್ಡ್", "Password", "पासवर्ड")}
              <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={200} />
            </label>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button id="login-submit" className="btn btn-primary btn-full" disabled={busy || !username || !password}>
              {busy ? <span className="spinner" /> : L("ಸೈನ್ ಇನ್", "Sign in", "साइन इन")}
            </button>
            <div className="demo-accounts">
              {L("ಡೆಮೊ ಖಾತೆಗಳು (ಮಾದರಿ ಮಾತ್ರ):", "Demo accounts (prototype only):", "डेमो खाते (केवल प्रोटोटाइप):")}
              <div>
                {DEMO.map((d) => (
                  <button key={d.username} type="button" onClick={() => { setUsername(d.username); setPassword(d.password); }}>
                    {d.label} · {d.username} / {d.password}
                  </button>
                ))}
              </div>
            </div>
          </form>

          <div className="role-cards">
            <div className="role-card">
              <span className="rc-icon">👩‍⚕️</span>
              <div><h3 className={fk}>{L("ASHA ಕಾರ್ಯಕರ್ತೆ", "ASHA worker", "ASHA कार्यकर्ता")}</h3>
                <p className={fk}>{L("ಮನೆ ಅಧಿವೇಶನ ನಡೆಸಿ, ರಸಪ್ರಶ್ನೆ ಸಿದ್ಧಪಡಿಸಿ ಮತ್ತು ಭೇಟಿಗಳನ್ನು ದಾಖಲಿಸಿ.",
                  "Run household sessions, prepare quizzes and log visits.",
                  "घर पर सत्र चलाएं, प्रश्नोत्तरी बनाएं और दौरे दर्ज करें।")}</p></div>
            </div>
            <div className="role-card">
              <span className="rc-icon">🧑‍💼</span>
              <div><h3 className={fk}>{L("ಮೇಲ್ವಿಚಾರಕ", "Supervisor", "पर्यवेक्षक")}</h3>
                <p className={fk}>{L("ಎಲ್ಲಾ ASHA ಅಧಿವೇಶನಗಳು, ಭೇಟಿಗಳು ಮತ್ತು ರೆಫರಲ್ ಕಾರ್ಯಗಳನ್ನು ನೋಡಿ.",
                  "See every ASHA's sessions, visits and referral tasks.",
                  "सभी ASHA के सत्र, दौरे और रेफरल कार्य देखें।")}</p></div>
            </div>
            <Link href="/quiz" className="role-card">
              <span className="rc-icon">🏠</span>
              <div><h3 className={fk}>{L("ಕುಟುಂಬದ ಸದಸ್ಯರು", "Household member", "परिवार के सदस्य")}</h3>
                <p className={fk}>{L("ಖಾತೆ ಬೇಕಿಲ್ಲ. ASHA ಕೊಟ್ಟ ರಸಪ್ರಶ್ನೆ ಲಿಂಕ್ ತೆರೆಯಿರಿ ಅಥವಾ ಇಲ್ಲಿ ಪ್ರಕಟಿತ ರಸಪ್ರಶ್ನೆ ಆಯ್ಕೆ ಮಾಡಿ →",
                  "No account needed. Open the quiz link your ASHA shared, or pick a published quiz here →",
                  "खाते की ज़रूरत नहीं। ASHA का दिया लिंक खोलें या यहां प्रकाशित प्रश्नोत्तरी चुनें →")}</p></div>
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="portal portal-page"><main className="page-body">Loading…</main></div>}><LoginContent /></Suspense>;
}
