// src/app/api/auth/login/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verifyNamePassword } from '@/lib/serverAuth'; 

const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;

function ensureKeys() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !AUTH_JWT_SECRET) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, or AUTH_JWT_SECRET');
  }
}

export async function POST(req) {
  try {
    ensureKeys();

    const body = await req.json();
    const name = (body.name || '').trim();
    const password = (body.password || '').toString();

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 });

    // verify credentials
    const user = await verifyNamePassword(name, password);
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    // sign JWT (sub=user.id)
    const payload = { sub: user.id, name: user.name };
    const token = jwt.sign(payload, AUTH_JWT_SECRET, { expiresIn: '7d' });

    // set HttpOnly cookie and return token for backward compatibility
    const res = NextResponse.json({ ok: true, token, user: { id: user.id, name: user.name } }, { status: 200 });
    res.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch (err) {
    console.error('Login error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
