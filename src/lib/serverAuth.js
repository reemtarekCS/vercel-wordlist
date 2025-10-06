// src/lib/serverAuth.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;
const TOKEN_BLACKLIST_SECRET = process.env.TOKEN_BLACKLIST_SECRET || AUTH_JWT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL');
}
if (!AUTH_JWT_SECRET) {
  console.warn('AUTH_JWT_SECRET not set. Token verification will be disabled.');
}

const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: {} } });

export function tokenHash(token) {
  // HMAC-SHA256 using a secret (recommended vs plain sha256)
  return crypto.createHmac('sha256', TOKEN_BLACKLIST_SECRET || '').update(token).digest('hex');
}

export function getTokenFromReq(req) {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

  // Try cookie fallback
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...rest] = c.split('=');
      return [k.trim(), decodeURIComponent((rest || []).join('=').trim())];
    })
  );
  return cookies['auth_token'] || null;
}

/**
 * Verify token and return user row { id, name, name_lower } or null.
 */
export async function verifyTokenAndGetUser(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  if (!AUTH_JWT_SECRET) return null;

  // Check token blacklist by hash, only active entries (expires_at > now)
  try {
    const th = tokenHash(token);
    const now = new Date().toISOString();
    const { data: black, error: blackErr } = await supabaseService
      .from('token_blacklist')
      .select('token_hash, expires_at')
      .eq('token_hash', th)
      .gt('expires_at', now)
      .maybeSingle();
    if (blackErr) {
      console.warn('Blacklist check error', blackErr);
    } else if (black) {
      return null;
    }
  } catch (err) {
    console.warn('Blacklist check unexpected error', err);
  }

  let payload;
  try {
    payload = jwt.verify(token, AUTH_JWT_SECRET);
  } catch (err) {
    return null;
  }
  const userId = payload.sub;
  if (!userId) return null;

  try {
    const { data: user, error } = await supabaseService
      .from('users')
      .select('id,name,name_lower')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('User lookup error', error);
      return null;
    }
    return user || null;
  } catch (err) {
    console.warn('User lookup unexpected error', err);
    return null;
  }
}

/**
 * Verify name+password fallback (returns user or null).
 */
export async function verifyNamePassword(name, password) {
  if (!name || !password) return null;
  try {
    const lower = name.toLowerCase();
    const { data, error } = await supabaseService
      .from('users')
      .select('id,name,name_lower,password_hash')
      .eq('name_lower', lower)
      .maybeSingle();
    if (error) {
      console.warn('verifyNamePassword db error', error);
      return null;
    }
    if (!data) return null;
    const ok = await bcrypt.compare(String(password), data.password_hash);
    if (!ok) return null;
    return { id: data.id, name: data.name, name_lower: data.name_lower };
  } catch (err) {
    console.warn('verifyNamePassword unexpected error', err);
    return null;
  }
}

/**
 * Resolve authenticated user: token first, then fallback to body.name+body.password.
 * Options: { requireAuth } - if true and no valid auth found, return { error, status }.
 * Returns { user } or { error, status }.
 */
export async function resolveUserAuth(req, body = {}, { requireAuth = false } = {}) {
  const tokenUser = await verifyTokenAndGetUser(req);
  if (tokenUser) return { user: tokenUser };

  const name = (body.name || '').trim();
  const password = body.password?.toString?.() || '';
  if (!name || !password) {
    if (requireAuth) return { error: 'Authentication required', status: 401 };
    return { user: null };
  }

  const user = await verifyNamePassword(name, password);
  if (!user) return { error: 'Invalid credentials', status: 401 };
  return { user };
}
