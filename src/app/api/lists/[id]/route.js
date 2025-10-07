// src/app/api/lists/[id]/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth';
import bcrypt from 'bcryptjs';

// GET /api/lists/[id] - Get list details with membership info
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

    // Get list with membership info
    const { data: list, error } = await supabase
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
      `)
      .eq('id', id)
      .single();

    if (error || !list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check if user has access to this list
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

    // Get member count
    const { count: memberCount } = await supabase
      .from('list_members')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', id);

    // Get word count for this list
    const { count: wordCount } = await supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', id)
      .is('duplicate_of', null);

    const listData = {
      ...list,
      member_count: memberCount || 0,
      word_count: wordCount || 0,
      is_owner: user ? list.owner_id === user.id : false,
      is_member: false,
      membership_role: null
    };

    if (user) {
      const { data: membership } = await supabase
        .from('list_members')
        .select('role')
        .eq('list_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membership) {
        listData.is_member = true;
        listData.membership_role = membership.role;
      }
    }

    return NextResponse.json({ ok: true, list: listData }, { status: 200 });
  } catch (err) {
    console.error('API GET list error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH /api/lists/[id] - Update list (owner only)
export async function PATCH(req, { params }) {
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

    // Check if user is owner
    const { data: list } = await supabase
      .from('lists')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!list || list.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only owner can update list' }, { status: 403 });
    }

    const { name, description, password, isPublic, customTitle, customSubtitle } = body;

    let updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (isPublic !== undefined) updateData.is_public = isPublic;
    if (customTitle !== undefined) updateData.custom_title = customTitle?.trim() || null;
    if (customSubtitle !== undefined) updateData.custom_subtitle = customSubtitle?.trim() || null;

    if (password !== undefined) {
      if (password && password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      updateData.password_hash = password ? await bcrypt.hash(password, 12) : null;
    }

    const { data, error } = await supabase
      .from('lists')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update list error', error);
      return NextResponse.json({ error: 'Failed to update list' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, list: data }, { status: 200 });
  } catch (err) {
    console.error('PATCH API list error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/lists/[id] - Delete list (owner only)
export async function DELETE(req, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = params;

    // Resolve user authentication
    const authRes = await resolveUserAuth(req, null, { requireAuth: true });
    if (authRes.error) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;

    // Check if user is owner
    const { data: list } = await supabase
      .from('lists')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!list || list.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only owner can delete list' }, { status: 403 });
    }

    const { error } = await supabase
      .from('lists')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete list error', error);
      return NextResponse.json({ error: 'Failed to delete list' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('DELETE API list error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
