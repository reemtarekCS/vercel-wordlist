// src/app/api/lists/[id]/leave/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth';

// POST /api/lists/[id]/leave - Leave a list
export async function POST(req, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = params;

    // Resolve user authentication
    const authRes = await resolveUserAuth(req, null, { requireAuth: true });
    if (authRes.error) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;

    // Check if user is a member
    const { data: membership } = await supabase
      .from('list_members')
      .select('role')
      .eq('list_id', id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this list' }, { status: 400 });
    }

    // Prevent owner from leaving (they should delete the list instead)
    const { data: list } = await supabase
      .from('lists')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (list && list.owner_id === user.id) {
      return NextResponse.json({ error: 'Owner cannot leave the list. Delete it instead.' }, { status: 400 });
    }

    // Remove membership
    const { error } = await supabase
      .from('list_members')
      .delete()
      .eq('list_id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Supabase leave list error', error);
      return NextResponse.json({ error: 'Failed to leave list' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Successfully left the list' }, { status: 200 });
  } catch (err) {
    console.error('POST API leave list error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
