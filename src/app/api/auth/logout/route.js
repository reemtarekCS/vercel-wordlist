// src/app/api/auth/logout/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import jwt from 'jsonwebtoken';
import { tokenHash, getTokenFromReq } from '@/lib/serverAuth'; 

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;

function ensureKeys() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !AUTH_JWT_SECRET) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, or AUTH_JWT_SECRET');
  }
}

export async function POST(req) {
  try {
    ensureKeys();
    const supabase = createSupabaseAdminClient();

    const token = getTokenFromReq(req);
    if (!token) {
      // Clear cookie client-side; we just return ok
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // try verifying to extract expiry; if invalid, treat expiry as now so blacklist immediately invalidates
    let expiresAt;
    try {
      const payload = jwt.verify(token, AUTH_JWT_SECRET, { ignoreExpiration: false });
      const expSec = payload.exp || Math.floor(Date.now() / 1000) + 60;
      expiresAt = new Date(expSec * 1000).toISOString();
    } catch (err) {
      // invalid or expired token -> blacklist with immediate expiry to deny reuse
      expiresAt = new Date().toISOString();
    }

    // insert token hash into blacklist
    try {
      const hashed = tokenHash(token);
      const { error } = await supabase.from('token_blacklist').insert([{ token_hash: hashed, expires_at: expiresAt }]);
      if (error) {
        console.error('Logout: blacklist insert error', error);
        // still return ok
        return NextResponse.json({ ok: true, warning: 'blacklist insert failed' }, { status: 200 });
      }
    } catch (err) {
      console.error('Logout: unexpected error inserting blacklist', err);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // also clear cookie for good measure in the response
    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.cookies.set('auth_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('Logout error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
