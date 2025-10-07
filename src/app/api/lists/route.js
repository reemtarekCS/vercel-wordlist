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
    const discoverMode = url.searchParams.get('discover') === 'true';
    const searchQuery = url.searchParams.get('search');

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
        custom_subtitle
      `);

    if (publicOnly) {
      query = query.eq('is_public', true);
    } else if (discoverMode) {
      // Discover mode: show all public lists and private lists (but not user's own lists)
      if (user) {
        query = query.neq('owner_id', user.id);
      }
      // For anonymous users, only show public lists
      if (!user) {
        query = query.eq('is_public', true);
      }
    } else if (user) {
      // Show only lists the user owns or is a member of
      // Get lists owned by the user
      const { data: ownedLists } = await supabase
        .from('lists')
        .select('*')
        .eq('owner_id', user.id);

      // Get lists where user is a member (but not owner)
      const { data: memberListsData } = await supabase
        .from('list_members')
        .select('list_id, role')
        .eq('user_id', user.id);

      // Get the actual list data for member lists
      const memberListIds = memberListsData?.map(m => m.list_id) || [];
      let memberLists = [];

      if (memberListIds.length > 0) {
        const { data: listsData } = await supabase
          .from('lists')
          .select('*')
          .in('id', memberListIds)
          .neq('owner_id', user.id); // Exclude lists they own

        memberLists = listsData?.map(list => {
          const membership = memberListsData.find(m => m.list_id === list.id);
          return { ...list, member_role: membership?.role, is_owner: false };
        }) || [];
      }

      // Combine results and add computed fields
      const allLists = [
        ...(ownedLists || []).map(list => ({ ...list, is_owner: true })),
        ...memberLists
      ];

      // Remove duplicates and calculate counts
      const uniqueLists = [];
      for (const list of allLists) {
        if (!uniqueLists.find(l => l.id === list.id)) {
          // Get member count
          const { count: memberCount } = await supabase
            .from('list_members')
            .select('*', { count: 'exact', head: true })
            .eq('list_id', list.id);

          // Get word count
          const { count: wordCount } = await supabase
            .from('words')
            .select('*', { count: 'exact', head: true })
            .eq('list_id', list.id);

          uniqueLists.push({
            ...list,
            member_count: memberCount || 0,
            word_count: wordCount || 0
          });
        }
      }

      return NextResponse.json({ ok: true, lists: uniqueLists }, { status: 200 });
    } else {
      // Show only public lists for anonymous users
      query = query.eq('is_public', true);
    }

    // Apply search filter if provided (only for publicOnly and discoverMode cases)
    if (searchQuery && (publicOnly || discoverMode)) {
      query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase GET lists error', error);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }

    // Add computed fields for member_count and word_count
    const listsWithCounts = await Promise.all((data || []).map(async (list) => {
      const { count: memberCount } = await supabase
        .from('list_members')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);

      const { count: wordCount } = await supabase
        .from('words')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);

      return {
        ...list,
        member_count: memberCount || 0,
        word_count: wordCount || 0
      };
    }));

    return NextResponse.json({ ok: true, lists: listsWithCounts }, { status: 200 });
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
