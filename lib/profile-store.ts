// ─────────────────────────────────────────────────────────────────────────────
// ASHA Worker Profile — localStorage-backed
// ─────────────────────────────────────────────────────────────────────────────

export interface AshaProfile {
  id: string;
  name: string;
  block: string;
  district: string;
  lang: "kn" | "en" | "hi";
  createdAt: string;
  totalSessions: number;
  totalVisits: number;
}

const KEY = "amr_jagruti_profile";

export function getProfile(): AshaProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(data: Omit<AshaProfile, "id" | "createdAt" | "totalSessions" | "totalVisits">): AshaProfile {
  const existing = getProfile();
  const profile: AshaProfile = {
    id: existing?.id ?? `asha-${Date.now()}`,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    totalSessions: existing?.totalSessions ?? 0,
    totalVisits: existing?.totalVisits ?? 0,
    ...data,
  };
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}

export function incrementSessions() {
  const p = getProfile();
  if (!p) return;
  saveProfile({ ...p, totalSessions: p.totalSessions + 1 });
}

export function incrementVisits() {
  const p = getProfile();
  if (!p) return;
  saveProfile({ ...p, totalVisits: p.totalVisits + 1 });
}

export function clearProfile() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

export const KA_DISTRICTS = [
  "Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban",
  "Bidar","Chamarajanagar","Chikkaballapur","Chikkamagaluru","Chitradurga",
  "Dakshina Kannada","Davanagere","Dharwad","Gadag","Hassan",
  "Haveri","Kalaburagi","Kodagu","Kolar","Koppal",
  "Mandya","Mysuru","Raichur","Ramanagara","Shivamogga",
  "Tumakuru","Udupi","Uttara Kannada","Vijayapura","Yadgir",
];
