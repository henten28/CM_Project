// ─────────────────────────────────────────────────────────────────────────────
// App-wide preferences: language and text size.
// Stored once in localStorage and shared by every page, so a choice made on
// one page holds everywhere (and in other tabs) until the user changes it.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";

export type Lang = "kn" | "en" | "hi";
export type TextSize = "sm" | "md" | "lg";

const LANG_KEY = "amr_lang";
const SIZE_KEY = "amr_text_size";
const PROFILE_KEY = "amr_jagruti_profile";  // see lib/profile-store.ts
const EVENT = "amr-prefs";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: keep in-memory only */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);  // changes made in other tabs
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

export function getLang(): Lang {
  const saved = read(LANG_KEY);
  if (saved === "kn" || saved === "en" || saved === "hi") return saved;
  // first visit: fall back to the profile's preferred language, then Kannada
  try {
    const p = JSON.parse(read(PROFILE_KEY) ?? "null");
    if (p?.lang === "kn" || p?.lang === "en" || p?.lang === "hi") return p.lang;
  } catch { /* ignore a malformed profile */ }
  return "kn";
}

export function setLang(lang: Lang) { write(LANG_KEY, lang); }

export function getTextSize(): TextSize {
  const s = read(SIZE_KEY);
  return s === "sm" || s === "lg" ? s : "md";
}

export function setTextSize(size: TextSize) { write(SIZE_KEY, size); }

// server render always uses the defaults; the client snapshot replaces them on hydration
export function useLang(): [Lang, (l: Lang) => void] {
  return [useSyncExternalStore(subscribe, getLang, () => "kn" as Lang), setLang];
}

export function useTextSize(): [TextSize, (s: TextSize) => void] {
  return [useSyncExternalStore(subscribe, getTextSize, () => "md" as TextSize), setTextSize];
}

// pick a string for the current language; Hindi falls back to English when missing
export function tr(lang: Lang, kn: string, en: string, hi = ""): string {
  return lang === "kn" ? kn : lang === "hi" ? (hi || en) : en;
}
