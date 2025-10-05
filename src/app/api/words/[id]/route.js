// src/app/api/words/[id]/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function validateWord(word) {
  if (!word) return 'Empty word';
  if (word.length > 20) return 'Word must be 20 characters or fewer';
  if (!/^[-_\p{L}0-9]+$/u.test(word)) return 'Only letters, numbers, hyphen and underscore allowed';
  return null;
}

export async function PATCH(req, { params }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }

  try {
    const { id } = params;
    const body = await req.json();
    const name = (body.name || 'Anonymous').trim().slice(0, 50);
    const word = (body.word || '').trim();
    const v = validateWord(word);
    if (v) return NextResponse.json({ error: v }, { status: 400 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: {} } });
    const lower = word.toLowerCase();

    const { data, error } = await supabase
      .from('words')
      .update({ word, word_lower: lower, name })
      .eq('id', id)
      .select();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || (error.code === '23505')) {
        return NextResponse.json({ error: 'Word already exists' }, { status: 409 });
      }
      console.error('Supabase update error', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data?.[0] ?? null }, { status: 200 });
  } catch (err) {
    console.error('API PATCH error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }

  try {
    const { id } = params;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: {} } });

    const { error } = await supabase.from('words').delete().eq('id', id);

    if (error) {
      console.error('Supabase delete error', error);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }

    // return 204 no content or a JSON ok
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('API DELETE error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
