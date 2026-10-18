"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface LLMConfig {
  mode: "mock" | "openai" | "bedrock";
  apiKey: string;
  endpoint: string;
  model: string;
}

const CONFIG_KEY = "amr_llm_config";

function getConfig(): LLMConfig {
  if (typeof window === "undefined") return { mode: "mock", apiKey: "", endpoint: "", model: "" };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : { mode: "mock", apiKey: "", endpoint: "", model: "anthropic.claude-3-sonnet-20240229-v1:0" };
  } catch { return { mode: "mock", apiKey: "", endpoint: "", model: "" }; }
}

function saveConfig(c: LLMConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}

export default function SettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<LLMConfig>({ mode: "mock", apiKey: "", endpoint: "", model: "anthropic.claude-3-sonnet-20240229-v1:0" });
  const [saved, setSaved] = useState(false);

  useEffect(() => { setConfig(getConfig()); }, []);

  function handleSave() {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const inputStyle = { width: "100%", padding: "11px 14px", border: "2px solid var(--border)", borderRadius: 8, fontSize: "0.9rem", background: "var(--surface)", fontFamily: "var(--font-sans)" };

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
        <h1 className="text-xl font-bold text-primary mb-1">⚙️ LLM Configuration</h1>
        <p className="text-sm text-muted mb-4">Configure the AI backend. Use Mock mode for demo (no API key needed).</p>

        {/* Mode selector */}
        <div className="card-elevated mb-4">
          <h3 className="font-bold text-sm mb-3" style={{ color: "var(--primary)" }}>Agent Mode</h3>
          <div className="flex gap-2 mb-4">
            {([["mock", "🎭 Mock", "Demo mode — no API key needed"],
               ["openai", "🤖 OpenAI", "GPT-4o or compatible"],
               ["bedrock", "☁️ AWS Bedrock", "Claude / Titan on AWS"]] as const).map(([val, label, desc]) => (
              <button key={val} id={`mode-${val}`} onClick={() => setConfig((c) => ({ ...c, mode: val }))}
                style={{
                  flex: 1, padding: "12px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                  border: `2px solid ${config.mode === val ? "var(--primary)" : "var(--border)"}`,
                  background: config.mode === val ? "var(--green-50)" : "var(--surface)",
                  transition: "var(--transition)",
                }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: config.mode === val ? "var(--primary)" : "var(--text)" }}>{label}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 3 }}>{desc}</div>
              </button>
            ))}
          </div>

          {config.mode !== "mock" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--primary)" }}>
                  {config.mode === "bedrock" ? "AWS Access Key / Token" : "API Key"}
                </label>
                <input type="password" id="api-key-input" value={config.apiKey} placeholder="sk-... or AWS token"
                  onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))} style={inputStyle} />
              </div>

              {config.mode === "bedrock" && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--primary)" }}>Bedrock Endpoint URL</label>
                  <input id="endpoint-input" value={config.endpoint} placeholder="https://bedrock-runtime.us-east-1.amazonaws.com"
                    onChange={(e) => setConfig((c) => ({ ...c, endpoint: e.target.value }))} style={inputStyle} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--primary)" }}>Model ID</label>
                <select id="model-select" value={config.model} onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))} style={{ ...inputStyle }}>
                  {config.mode === "bedrock" ? (
                    <>
                      <option value="anthropic.claude-3-sonnet-20240229-v1:0">Claude 3 Sonnet (Bedrock)</option>
                      <option value="anthropic.claude-3-haiku-20240307-v1:0">Claude 3 Haiku (Bedrock)</option>
                      <option value="amazon.titan-text-express-v1">Amazon Titan Express</option>
                    </>
                  ) : (
                    <>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}

          {config.mode === "mock" && (
            <div style={{ background: "var(--green-50)", border: "1px solid var(--green-200)", borderRadius: 8, padding: "12px 16px", fontSize: "0.85rem", color: "var(--green-800)" }}>
              ✅ <strong>Mock mode active.</strong> All agents use intelligent simulations. No API calls are made. Perfect for demos and testing.
            </div>
          )}
        </div>

        {/* AWS Credit info */}
        <div className="card mb-4" style={{ fontSize: "0.82rem" }}>
          <h4 className="font-bold mb-2" style={{ color: "var(--primary)" }}>💡 AWS Bedrock Notes</h4>
          <ul style={{ paddingLeft: 16, lineHeight: 1.8, color: "var(--text-muted)" }}>
            <li>Requires an AWS account with Bedrock access enabled</li>
            <li>Recommended: us-east-1 or ap-south-1 region</li>
            <li>Estimated cost: ~$0.003 per session (Claude Haiku)</li>
            <li>Enable model access in the Bedrock console first</li>
          </ul>
        </div>

        <button id="save-settings-btn" className="btn btn-primary btn-full btn-lg" onClick={handleSave}>
          {saved ? "✅ Saved!" : "Save Configuration"}
        </button>
      </main>
    </div>
  );
}
