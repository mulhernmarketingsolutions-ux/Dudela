// Cookie + session helpers shared between the member-area API routes and the
// gated .astro pages themselves. Session tokens live in D1 (see lib/db.ts);
// this file just owns the cookie plumbing so every route sets/reads/clears
// them the same way.

import { getMemberBySessionToken, getMemberById, isAdminSessionValid, type DbEnv, type Member } from "./db";

export const SESSION_COOKIE = "dudela_session";
export const ADMIN_SESSION_COOKIE = "dudela_admin_session";
// Admin-only "preview as a subscriber" mode (see /admin's Preview panel and
// /api/admin/preview.ts) — a separate cookie from the real member session,
// so it never gets mixed up with (or lets anyone forge) an actual login.
export const PREVIEW_MEMBER_COOKIE = "dudela_preview_member";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const PREVIEW_MAX_AGE_SECONDS = 6 * 60 * 60; // 6 hours — a working session, not a standing login

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

export function setPreviewMemberCookie(cookies: CookieJar, memberId: string) {
  cookies.set(PREVIEW_MEMBER_COOKIE, memberId, {
    path: "/",
    domain: ".thedudelaco.com",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: PREVIEW_MAX_AGE_SECONDS,
  });
}

export function clearPreviewMemberCookie(cookies: CookieJar) {
  cookies.delete(PREVIEW_MEMBER_COOKIE, { path: "/" });
}

// The member whose eyes we're actually rendering the page through. Almost
// always just getAuthedMember's real session — the one exception is an
// admin using "Preview as a subscriber" (see /admin), which layers a
// separate, short-lived, admin-only cookie on top so Mike or John can see
// exactly what a given member sees without logging out of their own admin
// session or logging into a separate member account. Preview requires a
// *currently valid admin session* on every call (not just at the moment
// the cookie was set) — logging out of admin silently ends the preview too.
//
// Deliberately NOT used by the write-side API routes (reactions, comments,
// community notes, ask-a-question) — those still call getAuthedMember
// directly, so an admin in preview-only mode (no real member session) gets
// a clean 401 rather than being able to post as someone else's account.
export async function getViewingMember(
  cookies: CookieJar,
  env: DbEnv
): Promise<{ member: Member; isPreview: boolean } | null> {
  const previewId = cookies.get(PREVIEW_MEMBER_COOKIE)?.value;
  if (previewId && (await isAdminAuthed(cookies, env))) {
    const previewed = await getMemberById(env, previewId);
    if (previewed) return { member: previewed, isPreview: true };
  }
  const member = await getAuthedMember(cookies, env);
  if (!member) return null;
  return { member, isPreview: false };
}
