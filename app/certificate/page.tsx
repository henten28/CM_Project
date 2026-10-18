"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CertificateContent() {
  const params = useSearchParams();
  const ashaName = params.get("asha") ?? "ASHA Worker";
  const topic = params.get("topic") ?? "AMR Awareness";
  const score = params.get("score") ?? "—";
  const modules = params.get("modules") ?? "";
  const date = params.get("date") ?? new Date().toISOString().split("T")[0];
  const lang = (params.get("lang") ?? "en") as "kn" | "en" | "hi";

  const labels = {
    kn: { title: "AMR ಶಿಕ್ಷಣ ಪ್ರಮಾಣಪತ್ರ", cert: "ಇದರ ಮೂಲಕ ಖಚಿತ ಮಾಡಲಾಗಿದೆ ತರಬೇತಿ ಪಡೆದಿದ್ದಾರೆ", topic: "ವಿಷಯ", score: "ರಸಪ್ರಶ್ನೆ ಅಂಕ", modules: "ಮಾಡ್ಯೂಲ್‌ಗಳು", date: "ದಿನಾಂಕ", issued: "ಕರ್ನಾಟಕ ಆರೋಗ್ಯ ಇಲಾಖೆ ಮೊಹರು", print: "🖨️ ಮುದ್ರಿಸಿ" },
    en: { title: "AMR Education Certificate", cert: "This certifies that the ASHA worker completed a session on", topic: "Topic", score: "Quiz Score", modules: "Modules", date: "Date", issued: "Karnataka Health Department", print: "🖨️ Print" },
    hi: { title: "AMR शिक्षण प्रमाण पत्र", cert: "यह प्रमाणित करता है कि ASHA कार्यकर्ता ने सत्र पूरा किया", topic: "विषय", score: "प्रश्नोत्तरी स्कोर", modules: "मॉड्यूल", date: "दिनांक", issued: "कर्नाटक स्वास्थ्य विभाग", print: "🖨️ प्रिंट" },
  };
  const L = labels[lang];

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      {/* Print button — hidden in print */}
      <button onClick={() => window.print()} className="btn btn-primary mb-6 no-print">
        {L.print}
      </button>

      {/* Certificate card */}
      <div id="certificate" style={{
        background: "white",
        width: "100%", maxWidth: 600,
        border: "4px solid var(--green-800)",
        borderRadius: 16,
        padding: "40px 48px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
        position: "relative",
        overflow: "hidden",
        fontFamily: lang === "kn" ? "var(--font-kannada)" : "var(--font-sans)",
      }}>
        {/* Decorative corner */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 100, height: 100, background: "var(--green-800)", borderRadius: "0 0 100% 0", opacity: 0.1 }} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 100, height: 100, background: "var(--amber-500)", borderRadius: "100% 0 0 0", opacity: 0.1 }} />

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>🌿</div>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--green-800)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>AMR Jagruti</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--green-900)", margin: 0 }}>{L.title}</h1>
        </div>

        <div style={{ width: "100%", height: 2, background: "linear-gradient(90deg, var(--green-800), var(--amber-500))", marginBottom: 24 }} />

        <p style={{ textAlign: "center", color: "#555", fontSize: "0.9rem", marginBottom: 20 }}>{L.cert}</p>

        {/* ASHA Name */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--green-900)", borderBottom: "2px solid var(--amber-500)", display: "inline-block", padding: "0 24px 6px" }}>
            {ashaName}
          </div>
        </div>

        {/* Details grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          {[
            { label: L.topic, value: topic },
            { label: L.score, value: `${score}%` },
            { label: L.date, value: new Date(date).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }) },
            { label: L.modules, value: modules || "1" },
          ].map((item) => (
            <div key={item.label} style={{ background: "var(--green-50)", borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--green-800)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{item.label}</div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--green-900)" }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ width: "100%", height: 2, background: "var(--border)", marginBottom: 20 }} />

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 4 }}>Source</div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--green-800)" }}>NCDC AMR Materials · SAMASTA</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 4 }}>{L.issued}</div>
            <div style={{ fontSize: "1.4rem" }}>🏥</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          #certificate { box-shadow: none !important; border: 4px solid #2d6a4f !important; }
        }
      `}</style>
    </div>
  );
}

export default function CertificatePage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Loading…</div>}>
      <CertificateContent />
    </Suspense>
  );
}
