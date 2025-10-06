// src/app/api/words/search/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function ensureKeys() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL');
  }
}

async function findUserByName(supabase, name) {
  const lower = name.toLowerCase();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, name_lower, password_hash')
    .eq('name_lower', lower)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function POST(req) {
  try {
    ensureKeys();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const name = (body.name || '').trim();
    const password = (body.password || '').toString();

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 });

    const user = await findUserByName(supabase, name);
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    // return canonical rows for that user
    const { data, error } = await supabase
      .from('words')
      .select('id,word,name,owner_id,created_at,updated_at')
      .eq('owner_id', user.id)
      .is('duplicate_of', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase search error', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error('SEARCH API error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
