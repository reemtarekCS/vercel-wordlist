// src/app/api/words/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth'; 

function validateWord(word) {
  if (!word) return 'Empty word';
  if (word.length > 20) return 'Word must be 20 characters or fewer';
  if (!/^[-_\p{L}0-9]+$/u.test(word)) return 'Only letters, numbers, hyphen and underscore allowed';
  return null;
}

export async function GET(req) {
  try {
    const supabase = createSupabaseAdminClient();
    const url = new URL(req.url);

    const name = url.searchParams.get('name');
    const q = url.searchParams.get('q');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    let query = supabase
      .from('words')
      .select('id,word,word_lower,name,name_lower,created_at,updated_at,duplicate_of')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .is('duplicate_of', null);

    if (name) query = query.ilike('name', `%${name}%`);
    if (q) query = query.ilike('word', `%${q}%`);

    const { data, error } = await query;
    if (error) {
      console.error('Supabase GET error', error);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, items: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error('API GET error', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = createSupabaseAdminClient();

    const body = await req.json();
    const word = (body.word || '').trim();
    const v = validateWord(word);
    if (v) return NextResponse.json({ error: v }, { status: 400 });

    // Resolve user (token or name/password). Authentication optional.
    const authRes = await resolveUserAuth(req, body, { requireAuth: false });
    if (authRes.error) return NextResponse.json({ error: authRes.error }, { status: authRes.status });

    const user = authRes.user; // may be null
    let name = (body.name || 'Anonymous').trim().slice(0, 50);
    let name_lower = name.toLowerCase();
    let owner_id = null;

    if (user) {
      // prefer authenticated user's name
      name = user.name;
      name_lower = (user.name_lower || user.name || '').toLowerCase();
      owner_id = user.id;
    } else {
      // require provided name for anonymous submissions
      if (!name || name.toLowerCase() === 'anonymous') {
        return NextResponse.json({ error: 'Missing name for anonymous submitter' }, { status: 400 });
      }
    }

    // enforce per-owner or per-name submission limit
    if (owner_id) {
      const countRes = await supabase
        .from('words')
        .select('id', { head: true, count: 'exact' })
        .eq('owner_id', owner_id)
        .is('duplicate_of', null);

      if (countRes.error) {
        console.error('Supabase count error', countRes.error);
        return NextResponse.json({ error: 'Could not verify submission limit' }, { status: 500 });
      }
      const currentCount = countRes.count || 0;
      if (currentCount >= 20) {
        return NextResponse.json({ error: 'Submission limit reached (20) for this user' }, { status: 403 });
      }
    } else {
      const countRes = await supabase
        .from('words')
        .select('id', { head: true, count: 'exact' })
        .eq('name_lower', name_lower)
        .is('duplicate_of', null);
      if (countRes.error) {
        console.error('Supabase count error', countRes.error);
        return NextResponse.json({ error: 'Could not verify submission limit' }, { status: 500 });
      }
      const currentCount = countRes.count || 0;
      if (currentCount >= 20) {
        return NextResponse.json({ error: 'Submission limit reached (20) for this name' }, { status: 403 });
      }
    }

    const lower = word.toLowerCase();

    // check global duplicate (canonical rows only)
    const { data: existing } = await supabase
      .from('words')
      .select('id')
      .eq('word_lower', lower)
      .is('duplicate_of', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Word already exists' }, { status: 409 });
    }

    const insertObj = { word, word_lower: lower, name, name_lower };
    if (owner_id) insertObj.owner_id = owner_id;

    const { data, error } = await supabase
      .from('words')
      .insert([insertObj])
      .select();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') {
        return NextResponse.json({ error: 'Word already exists' }, { status: 409 });
      }
      console.error('Supabase insert error', error);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, item: data?.[0] ?? null }, { status: 201 });
  } catch (err) {
    console.error('POST API error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
