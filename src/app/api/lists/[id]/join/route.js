// src/app/api/lists/[id]/join/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth';
import bcrypt from 'bcryptjs';

// POST /api/lists/[id]/join - Join a list or request to join
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
    const { password } = body;

    // Get list details
    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('id, name, is_public, password_hash, owner_id')
      .eq('id', id)
      .single();

    if (listError || !list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check if already a member
    const { data: existingMembership } = await supabase
      .from('list_members')
      .select('id')
      .eq('list_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMembership) {
      return NextResponse.json({ error: 'Already a member of this list' }, { status: 400 });
    }

    // Check if there's a pending request
    const { data: existingRequest } = await supabase
      .from('list_join_requests')
      .select('id')
      .eq('list_id', id)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      return NextResponse.json({ error: 'Join request already pending' }, { status: 400 });
    }

    // Handle public lists vs private lists
    if (list.is_public) {
      // Public list - join immediately
      const { error: joinError } = await supabase
        .from('list_members')
        .insert([{
          list_id: id,
          user_id: user.id,
          role: 'member'
        }]);

      if (joinError) {
        console.error('Supabase join list error', joinError);
        return NextResponse.json({ error: 'Failed to join list' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: 'Successfully joined the list' }, { status: 200 });
    } else {
      // Private list - need password or request approval

      // If password provided, verify it
      if (password && list.password_hash) {
        const isValidPassword = await bcrypt.compare(password, list.password_hash);
        if (!isValidPassword) {
          return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
        }

        // Password correct - join immediately
        const { error: joinError } = await supabase
          .from('list_members')
          .insert([{
            list_id: id,
            user_id: user.id,
            role: 'member'
          }]);

        if (joinError) {
          console.error('Supabase join list error', joinError);
          return NextResponse.json({ error: 'Failed to join list' }, { status: 500 });
        }

        return NextResponse.json({ ok: true, message: 'Successfully joined the list' }, { status: 200 });
      } else {
        // No password or no password set - create join request
        const { error: requestError } = await supabase
          .from('list_join_requests')
          .insert([{
            list_id: id,
            user_id: user.id,
            message: body.message || null
          }]);

        if (requestError) {
          console.error('Supabase create join request error', requestError);
          return NextResponse.json({ error: 'Failed to create join request' }, { status: 500 });
        }

        return NextResponse.json({ ok: true, message: 'Join request sent to list owner' }, { status: 200 });
      }
    }
  } catch (err) {
    console.error('POST API join list error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
