// src/app/api/lists/[id]/members/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth';

// GET /api/lists/[id]/members - Get list members
export async function GET(req, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = params;

    // Resolve user authentication
    const authRes = await resolveUserAuth(req, null, { requireAuth: false });
    if (authRes.error && authRes.status !== 401) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;

    // Get list details
    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('id, is_public, owner_id')
      .eq('id', id)
      .single();

    if (listError || !list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check if user has access to view members
    if (!list.is_public) {
      if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      // Check if user is owner or member
      const { data: membership } = await supabase
        .from('list_members')
        .select('role')
        .eq('list_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership && list.owner_id !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Get members with user details
    const { data: members, error } = await supabase
      .from('list_members')
      .select(`
        id,
        role,
        joined_at,
        user_id
      `)
      .eq('list_id', id)
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('Supabase get members error', error);
      return NextResponse.json({ error: 'Failed to get members' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, members }, { status: 200 });
  } catch (err) {
    console.error('GET API members error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/lists/[id]/members - Add member (admin/owner only)
export async function POST(req, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = params;
    const body = await req.json();

    // Resolve user authentication
    const authRes = await resolveUserAuth(req, body, { requireAuth: true });
    if (authRes.error) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;
    const { userId, role = 'member' } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if user is admin or owner of the list
    const { data: list } = await supabase
      .from('lists')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!list || list.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only owner can add members' }, { status: 403 });
    }

    // Check if user is already a member
    const { data: existingMembership } = await supabase
      .from('list_members')
      .select('id')
      .eq('list_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMembership) {
      return NextResponse.json({ error: 'User is already a member' }, { status: 400 });
    }

    // Add member
    const { error } = await supabase
      .from('list_members')
      .insert([{
        list_id: id,
        user_id: userId,
        role
      }]);

    if (error) {
      console.error('Supabase add member error', error);
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Member added successfully' }, { status: 200 });
  } catch (err) {
    console.error('POST API members error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
