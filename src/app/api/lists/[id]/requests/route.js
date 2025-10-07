// src/app/api/lists/[id]/requests/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth';

// GET /api/lists/[id]/requests - Get join requests (owner only)
export async function GET(req, { params }) {
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
      return NextResponse.json({ error: 'Only owner can view join requests' }, { status: 403 });
    }

    // Get join requests with user details
    const { data: requests, error } = await supabase
      .from('list_join_requests')
      .select(`
        id,
        message,
        status,
        requested_at,
        user_id
      `)
      .eq('list_id', id)
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('Supabase get requests error', error);
      return NextResponse.json({ error: 'Failed to get join requests' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, requests }, { status: 200 });
  } catch (err) {
    console.error('GET API requests error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
