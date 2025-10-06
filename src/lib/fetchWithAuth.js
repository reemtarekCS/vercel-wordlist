// src/lib/fetchWithAuth.js
import { getSession } from './auth';

export default async function fetchWithAuth(url, opts = {}) {
  const session = getSession();
  const headers = new Headers(opts.headers || {});
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  if (!headers.has('Content-Type') && (opts?.body)) headers.set('Content-Type', 'application/json');
  return fetch(url, { ...opts, headers });
}
