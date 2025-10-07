// src/app/api/lists/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth';
import bcrypt from 'bcryptjs';

function validateListData(data) {
  if (!data.name || !data.name.trim()) return 'List name is required';
  if (data.name.length > 100) return 'List name must be 100 characters or fewer';
  if (data.description && data.description.length > 500) return 'Description must be 500 characters or fewer';
  if (data.customTitle && data.customTitle.length > 200) return 'Custom title must be 200 characters or fewer';
  if (data.customSubtitle && data.customSubtitle.length > 1000) return 'Custom subtitle must be 1000 characters or fewer';
  if (data.password && data.password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

// GET /api/lists - Get user's lists or public lists
export async function GET(req) {
  try {
    const supabase = createSupabaseAdminClient();
    const url = new URL(req.url);

    // Resolve user authentication
    const authRes = await resolveUserAuth(req, null, { requireAuth: false });
    if (authRes.error && authRes.status !== 401) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;
    const publicOnly = url.searchParams.get('public') === 'true';

    let query = supabase
      .from('lists')
      .select(`
        id,
        name,
        description,
        is_public,
        owner_id,
        created_at,
        updated_at,
        custom_title,
        custom_subtitle,
        list_members!inner(role)
      `);

    if (publicOnly) {
      query = query.eq('is_public', true);
    } else if (user) {
      // Show only lists the user owns or is a member of
      // First get the user's memberships, then filter lists accordingly
      const { data: memberships } = await supabase
        .from('list_members')
        .select('list_id')
        .eq('user_id', user.id);

      const memberListIds = memberships?.map(m => m.list_id) || [];

      if (memberListIds.length > 0) {
        // User is a member of some lists - show their lists and owned lists
        query = query.or(`owner_id.eq.${user.id},id.in.(${memberListIds.join(',')})`);
      } else {
        // User is not a member of any lists - show only lists they own
        query = query.eq('owner_id', user.id);
      }
    } else {
      // Show only public lists for anonymous users
      query = query.eq('is_public', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase GET lists error', error);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lists: data || [] }, { status: 200 });
  } catch (err) {
    console.error('API GET lists error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/lists - Create a new list
export async function POST(req) {
  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json();

    const validation = validateListData(body);
    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }

    // Resolve user authentication
    const authRes = await resolveUserAuth(req, body, { requireAuth: true });
    if (authRes.error) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;
    const { name, description, password, isPublic = true, customTitle, customSubtitle } = body;

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    const insertData = {
      name: name.trim(),
      description: description?.trim() || null,
      is_public: isPublic,
      owner_id: user.id,
      password_hash: passwordHash,
      custom_title: customTitle?.trim() || null,
      custom_subtitle: customSubtitle?.trim() || null
    };

    const { data, error } = await supabase
      .from('lists')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Supabase create list error', error);
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
    }

    // Add creator as owner
    const { error: memberError } = await supabase
      .from('list_members')
      .insert([{
        list_id: data.id,
        user_id: user.id,
        role: 'owner'
      }]);

    if (memberError) {
      console.error('Failed to add list owner:', memberError);
      // Don't fail the entire operation if adding owner fails
      // The list was created successfully
    }

    return NextResponse.json({ ok: true, list: data }, { status: 201 });
  } catch (err) {
    console.error('POST API lists error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
