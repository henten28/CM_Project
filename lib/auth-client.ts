"use client";

// Who is signed in, for showing the right menus. The token itself is in an httpOnly cookie that this code never
// sees; access is enforced by proxy.ts (pages) and the backend (every API call).

import { useEffect, useState } from "react";

export type Role = "asha" | "supervisor";
export interface User { username: string; name: string; role: Role; district: string; block: string; }

let cached: Promise<User | null> | null = null;
const listeners = new Set<(u: User | null) => void>();

function fetchMe(): Promise<User | null> {
  return fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<User>) : null))
    .catch(() => null);
}

export function getUser(): Promise<User | null> {
  if (!cached) cached = fetchMe();
  return cached;
}

function publish(u: User | null) {
  cached = Promise.resolve(u);
  listeners.forEach((fn) => fn(u));
}

/** user is undefined while loading, null when signed out */
export function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getUser().then((u) => { if (live) setUser(u); });
    listeners.add(setUser);
    return () => { live = false; listeners.delete(setUser); };
  }, []);
  return user;
}

export async function login(username: string, password: string): Promise<User> {
  const res = await fetch("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(res.status === 401 ? "Wrong username or password" :
      res.status === 503 ? "The server is not reachable. Is the backend running?" : (data.detail ?? "Sign-in failed"));
  }
  publish(data.user as User);
  return data.user as User;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  publish(null);
}

export const homeFor = (role: Role) => (role === "supervisor" ? "/dashboard" : "/");
