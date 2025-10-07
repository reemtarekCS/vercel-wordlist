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
    const listId = url.searchParams.get('list_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    // Resolve user authentication for access control
    const authRes = await resolveUserAuth(req, null, { requireAuth: false });
    if (authRes.error && authRes.status !== 401) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;

    let query = supabase
      .from('words')
      .select('id,word,word_lower,name,name_lower,created_at,updated_at,duplicate_of,list_id')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .is('duplicate_of', null);

    // Filter by list if specified
    if (listId) {
      query = query.eq('list_id', listId);

      // Check if user has access to this list (if it's not public)
      if (user) {
        const { data: list } = await supabase
          .from('lists')
          .select('is_public, owner_id')
          .eq('id', listId)
          .single();

        if (list && !list.is_public) {
          // Check if user is owner or member
          const { data: membership } = await supabase
            .from('list_members')
            .select('role')
            .eq('list_id', listId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!membership && (!list || list.owner_id !== user.id)) {
            return NextResponse.json({ error: 'Access denied to this list' }, { status: 403 });
          }
        }
      } else {
        // Anonymous users can only access public lists
        const { data: list } = await supabase
          .from('lists')
          .select('is_public')
          .eq('id', listId)
          .single();

        if (!list || !list.is_public) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }
    } else if (user) {
      // If no list specified and user is logged in, get words from lists they're members of
      const { data: memberships } = await supabase
        .from('list_members')
        .select('list_id')
        .eq('user_id', user.id);

      if (memberships && memberships.length > 0) {
        const listIds = memberships.map(m => m.list_id);
        query = query.in('list_id', listIds);
      } else {
        // User is not a member of any lists
        return NextResponse.json({ ok: true, items: [] }, { status: 200 });
      }
    } else {
      // Anonymous users with no list specified - return empty
      return NextResponse.json({ ok: true, items: [] }, { status: 200 });
    }

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
    const listId = body.list_id;

    const v = validateWord(word);
    if (v) return NextResponse.json({ error: v }, { status: 400 });

    if (!listId) {
      return NextResponse.json({ error: 'List ID is required' }, { status: 400 });
    }

    // Resolve user (token or name/password). Authentication required for list submissions.
    const authRes = await resolveUserAuth(req, body, { requireAuth: true });
    if (authRes.error) return NextResponse.json({ error: authRes.error }, { status: authRes.status });

    const user = authRes.user;
    let name = user.name;
    let name_lower = (user.name_lower || user.name || '').toLowerCase();
    let owner_id = user.id;

    // Check if user has access to the list
    const { data: list } = await supabase
      .from('lists')
      .select('id, is_public, owner_id')
      .eq('id', listId)
      .single();

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check if user is owner or member of the list
    const { data: membership } = await supabase
      .from('list_members')
      .select('role')
      .eq('list_id', listId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership && list.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied to this list' }, { status: 403 });
    }

    // Check per-list submission limit (20 words per user per list)
    const countRes = await supabase
      .from('words')
      .select('id', { head: true, count: 'exact' })
      .eq('owner_id', owner_id)
      .eq('list_id', listId)
      .is('duplicate_of', null);

    if (countRes.error) {
      console.error('Supabase count error', countRes.error);
      return NextResponse.json({ error: 'Could not verify submission limit' }, { status: 500 });
    }
    const currentCount = countRes.count || 0;
    if (currentCount >= 20) {
      return NextResponse.json({ error: 'Submission limit reached (20) for this user in this list' }, { status: 403 });
    }

    const lower = word.toLowerCase();

    // Check for duplicates within the same list only
    const { data: existing } = await supabase
      .from('words')
      .select('id')
      .eq('word_lower', lower)
      .eq('list_id', listId)
      .is('duplicate_of', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Word already exists in this list' }, { status: 409 });
    }

    const insertObj = {
      word,
      word_lower: lower,
      name,
      name_lower,
      owner_id,
      list_id: listId
    };

    const { data, error } = await supabase
      .from('words')
      .insert([insertObj])
      .select();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') {
        return NextResponse.json({ error: 'Word already exists in this list' }, { status: 409 });
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
