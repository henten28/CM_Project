import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMR Jagruti — ASHA-Led AMR Education",
  description:
    "A Kannada-first, multi-agent learning app that helps ASHA workers run interactive Antimicrobial Resistance education sessions in their communities.",
  keywords: ["AMR", "ASHA", "Kannada", "antibiotic resistance", "Karnataka", "health education"],
  openGraph: {
    title: "AMR Jagruti",
    description: "ASHA-led AMR education — Kannada first",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="kn">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#2d6a4f" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{__html:`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(){});
            });
          }
        `}} />
      </body>
    </html>
  );
}
