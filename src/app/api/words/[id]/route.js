// src/app/api/words/[id]/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabaseServer';
import bcrypt from 'bcryptjs';
import { resolveUserAuth } from '../../../../lib/serverAuth';

function validateWord(word) {
  if (!word) return 'Empty word';
  if (word.length > 20) return 'Word must be 20 characters or fewer';
  if (!/^[-_\p{L}0-9]+$/u.test(word)) return 'Only letters, numbers, hyphen and underscore allowed';
  return null;
}

export async function GET(req, { params }) {
  try {
    const { id } = params;
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from('words')
      .select('id,word,word_lower,name,name_lower,owner_id,created_at,updated_at,duplicate_of')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Supabase GET single error', error);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ ok: true, item: data }, { status: 200 });
  } catch (err) {
    console.error('API GET single error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const { id } = params;
    const supabase = createSupabaseAdminClient();

    const body = await req.json();

    // Authentication required (token or name+password)
    const authRes = await resolveUserAuth(req, body, { requireAuth: true });
    if (authRes.error) return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    const user = authRes.user;

    // fetch existing row to verify owner
    const { data: existing, error: fetchErr } = await supabase
      .from('words')
      .select('id,owner_id,word_lower,name_lower')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      console.error('Supabase fetch error', fetchErr);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // ownership check (owner_id preferred)
    const isOwner =
      (existing.owner_id && String(existing.owner_id) === String(user.id)) ||
      (!existing.owner_id && existing.name_lower === (user.name_lower || user.name.toLowerCase()));
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden: not the owner' }, { status: 403 });
    }

    const newWord = (body.word || '').trim();
    const newName = (body.name_new || '').trim();

    const updates = {};
    if (newName) {
      updates.name = newName;
      updates.name_lower = newName.toLowerCase();
    }
    if (newWord) {
      const v = validateWord(newWord);
      if (v) return NextResponse.json({ error: v }, { status: 400 });

      const lower = newWord.toLowerCase();
      // check duplicates
      const { data: dup } = await supabase
        .from('words')
        .select('id')
        .eq('word_lower', lower)
        .is('duplicate_of', null)
        .maybeSingle();

      if (dup && String(dup.id) !== String(id)) {
        return NextResponse.json({ error: 'Word already exists' }, { status: 409 });
      }

      updates.word = newWord;
      updates.word_lower = lower;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error: updateErr } = await supabase.from('words').update(updates).eq('id', id).select();
    if (updateErr) {
      const msg = (updateErr.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || updateErr.code === '23505') {
        return NextResponse.json({ error: 'Word already exists' }, { status: 409 });
      }
      console.error('Supabase update error', updateErr);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data?.[0] ?? null }, { status: 200 });
  } catch (err) {
    console.error('API PATCH error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = params;
    const supabase = createSupabaseAdminClient();

    const body = await req.json();

    const authRes = await resolveUserAuth(req, body, { requireAuth: true });
    if (authRes.error) return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    const user = authRes.user;

    const { data: existing, error: fetchErr } = await supabase
      .from('words')
      .select('id,owner_id,name_lower')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      console.error('Supabase fetch error', fetchErr);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isOwner =
      (existing.owner_id && String(existing.owner_id) === String(user.id)) ||
      (!existing.owner_id && existing.name_lower === (user.name_lower || user.name.toLowerCase()));
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden: not the owner' }, { status: 403 });
    }

    const { error: delErr } = await supabase.from('words').delete().eq('id', id);
    if (delErr) {
      console.error('Supabase delete error', delErr);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('API DELETE error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
