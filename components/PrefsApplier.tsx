"use client";

import { useEffect } from "react";
import { useLang, useTextSize } from "@/lib/prefs";

// keeps <html lang> and the text-size attribute in sync with the saved preferences
export default function PrefsApplier() {
  const [lang] = useLang();
  const [size] = useTextSize();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.textSize = size;
  }, [lang, size]);
  return null;
}
