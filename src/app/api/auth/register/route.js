// src/app/api/auth/register/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import bcrypt from 'bcryptjs';

function ensureKeys() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL');
  }
}

function validateName(name) {
  if (!name || !name.trim()) return 'Name required';
  if (name.trim().length > 50) return 'Name must be 50 characters or fewer';
  return null;
}

function validatePassword(pw) {
  if (!pw) return 'Password required';
  if (pw.length < 6) return 'Password must be at least 6 characters';
  return null;
}

export async function POST(req) {
  try {
    ensureKeys();
    const supabase = createSupabaseAdminClient();

    const body = await req.json();
    const name = (body.name || '').trim();
    const password = (body.password || '').toString();

    const nErr = validateName(name);
    if (nErr) return NextResponse.json({ error: nErr }, { status: 400 });
    const pErr = validatePassword(password);
    if (pErr) return NextResponse.json({ error: pErr }, { status: 400 });

    const nameLower = name.toLowerCase();
    const { data: existing, error: findErr } = await supabase
      .from('users')
      .select('id')
      .eq('name_lower', nameLower)
      .maybeSingle();

    if (findErr) {
      console.error('User find error', findErr);
      return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ error: 'Name already registered' }, { status: 409 });
    }

    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    const { data: inserted, error: insertErr } = await supabase
      .from('users')
      .insert([{ name, name_lower: nameLower, password_hash: hash }])
      .select();

    if (insertErr) {
      console.error('User insert error', insertErr);
      return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: { id: inserted[0].id, name: inserted[0].name } }, { status: 201 });
  } catch (err) {
    console.error('Register error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
