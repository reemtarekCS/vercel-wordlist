// src/lib/auth.js
export const SESSION_KEY = 'wc_session_v1';

export function saveSession(token, name) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, name }));
  } catch (e) {}
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

export function getSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.token) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}
