// src/app/api/lists/[id]/requests/[requestId]/route.js
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resolveUserAuth } from '@/lib/serverAuth';

// PATCH /api/lists/[id]/requests/[requestId] - Approve or reject request (owner only)
export async function PATCH(req, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id, requestId } = params;
    const body = await req.json();

    // Resolve user authentication
    const authRes = await resolveUserAuth(req, body, { requireAuth: true });
    if (authRes.error) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const user = authRes.user;
    const { action } = body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be approve or reject' }, { status: 400 });
    }

    // Check if user is owner
    const { data: list } = await supabase
      .from('lists')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!list || list.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only owner can manage join requests' }, { status: 403 });
    }

    // Get the request
    const { data: request } = await supabase
      .from('list_join_requests')
      .select('id, user_id, status')
      .eq('id', requestId)
      .eq('list_id', id)
      .single();

    if (!request) {
      return NextResponse.json({ error: 'Join request not found' }, { status: 404 });
    }

    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Request has already been processed' }, { status: 400 });
    }

    if (action === 'approve') {
      // Add user as member
      const { error: memberError } = await supabase
        .from('list_members')
        .insert([{
          list_id: id,
          user_id: request.user_id,
          role: 'member'
        }]);

      if (memberError) {
        console.error('Supabase approve request error', memberError);
        return NextResponse.json({ error: 'Failed to approve request' }, { status: 500 });
      }
    }

    // Update request status
    const { error: updateError } = await supabase
      .from('list_join_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        responded_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Supabase update request error', updateError);
      return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `Request ${action}d successfully`
    }, { status: 200 });
  } catch (err) {
    console.error('PATCH API request error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
