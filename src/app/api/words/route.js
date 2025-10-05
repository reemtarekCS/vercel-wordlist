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

export async function POST(req) {
  try {
    const body = await req.json();
    const name = (body.name || 'Anonymous').trim().slice(0, 50);
    const word = (body.word || '').trim();
    const v = validateWord(word);
    if (v) return NextResponse.json({ error: v }, { status: 400 });

    // create server-side supabase client with service-role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      // don't leak headers
      global: { headers: {} },
    });

    const lower = word.toLowerCase();

    const { data, error } = await supabase
      .from('words')
      .insert([{ word, word_lower: lower, name }])
      .select();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || (error.code === '23505')) {
        return NextResponse.json({ error: 'Word already exists' }, { status: 409 });
      }
      console.error('Supabase insert error', error);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data?.[0] ?? null }, { status: 201 });
  } catch (err) {
    console.error('API error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
