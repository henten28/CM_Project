"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getHealth, type Health } from "@/lib/api-client";

// old versions of this page stored API keys / AWS tokens in the browser; remove them
const LEGACY_KEY = "amr_llm_config";

export default function SettingsPage() {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

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
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <div><div className="logo-text">AMR ಜಾಗೃತಿ</div><div className="logo-sub">Settings</div></div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push("/")}>← Home</button>
      </header>

      <main style={{ maxWidth: 540, margin: "0 auto", padding: "28px 16px" }}>
        <h1 className="text-xl font-bold text-primary mb-1">⚙️ Backend connection</h1>
        <p className="text-sm text-muted mb-4">
          All agents run on the AMR Jagruti backend. AWS credentials are configured on the server only and are never entered or stored in this app.
        </p>

        <div className="card-elevated mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm" style={{ color: "var(--primary)" }}>Status</h3>
            <span id="backend-status" className={`badge ${health === null ? "badge-amber" : up ? "badge-green" : "badge-red"}`}>
              {health === null ? "Checking…" : up ? "● Connected" : "● Unreachable"}
            </span>
          </div>

          {up && (
            <div>
              <div style={row}><span className="text-muted">Agent mode</span>
                <strong>{health?.mock ? "🎭 Mock (no AWS credentials on server)" : "☁️ Amazon Bedrock"}</strong></div>
              <div style={row}><span className="text-muted">AWS region</span><strong id="aws-region">{health?.region ?? "—"}</strong></div>
              <div style={{ ...row, borderBottom: "none" }}><span className="text-muted">Model</span>
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
            {checking ? <span className="spinner" /> : "↻ Check again"}
          </button>
          {checkedAt && <div className="text-xs text-muted mt-1 text-center">Last checked {checkedAt}</div>}
        </div>

        <div className="card mb-4" style={{ fontSize: "0.82rem" }}>
          <h4 className="font-bold mb-2" style={{ color: "var(--primary)" }}>💡 Changing the region or model</h4>
          <ul style={{ paddingLeft: 16, lineHeight: 1.8, color: "var(--text-muted)" }}>
            <li>Set <code>AWS_REGION</code> and <code>BEDROCK_MODEL</code> in <code>backend/.env</code>, then restart the backend</li>
            <li>Credentials come from <code>aws configure</code>, <code>AWS_PROFILE</code> or an IAM role on the server</li>
            <li>Without credentials the backend runs in mock mode with rule-based agents</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
