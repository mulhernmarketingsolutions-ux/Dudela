// Cookie + session helpers shared between the member-area API routes and the
// gated .astro pages themselves. Session tokens live in D1 (see lib/db.ts);
// this file just owns the cookie plumbing so every route sets/reads/clears
// them the same way.

import { getMemberBySessionToken, isAdminSessionValid, type DbEnv, type Member } from "./db";

export const SESSION_COOKIE = "dudela_session";
export const ADMIN_SESSION_COOKIE = "dudela_admin_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Astro's `cookies` (AstroCookies) has the same get/set/delete shape whether
// it comes from an API route's APIContext or a page's Astro global — typed
// loosely here to match the rest of the codebase's `(locals as any)` style
// rather than fighting Astro's generated types across both call sites.
type CookieJar = {
  get: (name: string) => { value: string } | undefined;
  set: (name: string, value: string, opts?: Record<string, unknown>) => void;
  delete: (name: string, opts?: Record<string, unknown>) => void;
};

export function setSessionCookie(cookies: CookieJar, token: string) {
  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    domain: ".thedudelaco.com",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(cookies: CookieJar) {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

export function setAdminSessionCookie(cookies: CookieJar, token: string) {
  cookies.set(ADMIN_SESSION_COOKIE, token, {
    path: "/",
    domain: ".thedudelaco.com",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearAdminSessionCookie(cookies: CookieJar) {
  cookies.delete(ADMIN_SESSION_COOKIE, { path: "/" });
}

// Used at the top of every gated member page/route. Returns the logged-in
// member, or null if there's no valid session — callers redirect to
// /member/login in the null case.
export async function getAuthedMember(cookies: CookieJar, env: DbEnv): Promise<Member | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getMemberBySessionToken(env, token);
}

export async function isAdminAuthed(cookies: CookieJar, env: DbEnv): Promise<boolean> {
  const token = cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  return isAdminSessionValid(env, token);
}
