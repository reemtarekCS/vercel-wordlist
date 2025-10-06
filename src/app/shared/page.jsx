'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getSession, clearSession } from '../../lib/auth';
import fetchWithAuth from '../../lib/fetchWithAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function SharedPage() {
  const router = useRouter();
  const [session, setSession] = useState(()=> getSession()); // initial session
  useEffect(() => {
    // redirect to login if not signed in
    if (!session) router.push('/login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return <div style={{ padding: 24 }}>Missing Supabase env vars.</div>;
  }

  // memoize the client so it's stable across renders
  const supabase = useMemo(() => createClient(SUPABASE_URL, SUPABASE_ANON_KEY), []);

  const [words, setWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');
  const debouncedFilterRef = useRef('');
  const debounceTimer = useRef(null);

  const [myItems, setMyItems] = useState([]);
  const [searching, setSearching] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editWord, setEditWord] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const [newWord, setNewWord] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [status, setStatus] = useState(null);

  const fetchWords = useCallback(async (q = '') => {
    setLoadingWords(true);
    setStatus(null);
    try {
      const url = q ? `/api/words?q=${encodeURIComponent(q)}&limit=500` : '/api/words?limit=500';
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: 'error', message: body.error || `Failed (${res.status})` });
        setWords([]);
      } else {
        const body = await res.json();
        setWords(Array.isArray(body.items) ? body.items : []);
      }
    } catch (err) {
      console.error('fetchWords', err);
      setStatus({ type: 'error', message: 'Network error' });
      setWords([]);
    } finally {
      setLoadingWords(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debouncedFilterRef.current = globalFilter;
      fetchWords(globalFilter);
    }, 500);
    return () => clearTimeout(debounceTimer.current);
  }, [globalFilter, fetchWords]);

  useEffect(() => {
    // initial fetch
    fetchWords(debouncedFilterRef.current || '');

    // realtime subscription
    const channel = supabase
      .channel('public:words')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'words' }, (payload) => {
        const item = payload.new;
        if (item?.duplicate_of) return;
        setWords((prev) => [item, ...prev].slice(0, 500));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'words' }, (payload) => {
        const item = payload.new;
        if (item?.duplicate_of) {
          setWords((prev) => prev.filter((p) => p.id !== item.id));
          return;
        }
        setWords((prev) => prev.map((p) => (p.id === item.id ? item : p)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'words' }, (payload) => {
        setWords((prev) => prev.filter((p) => p.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      try {
        channel.unsubscribe();
      } catch (e) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, fetchWords]);

  // fetch my items using name query param (server provides `name` filter)
  const fetchMy = useCallback(async () => {
    const s = getSession();
    if (!s || !s.name) return;
    setSearching(true);
    setStatus(null);
    try {
      const url = `/api/words?name=${encodeURIComponent(s.name)}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: 'error', message: body.error || `Search failed (${res.status})` });
        setMyItems([]);
      } else {
        const body = await res.json();
        setMyItems(Array.isArray(body.items) ? body.items : []);
      }
    } catch (err) {
      console.error('fetchMy', err);
      setStatus({ type: 'error', message: 'Network error' });
      setMyItems([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => { fetchMy(); }, [fetchMy]);

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditWord(item.word);
    setStatus(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditWord('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editWord.trim()) return setStatus({ type: 'error', message: 'Word required' });
    setEditLoading(true);
    setStatus(null);
    try {
      const res = await fetchWithAuth(`/api/words/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ word: editWord.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) setStatus({ type: 'denied', message: 'Word exists' });
        else setStatus({ type: 'error', message: body.error || `Update failed (${res.status})` });
      } else {
        setStatus({ type: 'success', message: 'Updated' });
        cancelEdit();
        await fetchWords(debouncedFilterRef.current || '');
        await fetchMy();
      }
    } catch (err) {
      console.error('saveEdit', err);
      setStatus({ type: 'error', message: 'Network error' });
    } finally {
      setEditLoading(false);
    }
  };

  const doDelete = async (id) => {
    if (!window.confirm('Delete this word?')) return;
    setStatus(null);
    try {
      const res = await fetchWithAuth(`/api/words/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({}), // server expects body for name/password fallback; token will be used primarily
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ type: 'error', message: body.error || `Delete failed (${res.status})` });
      } else {
        setStatus({ type: 'success', message: 'Deleted' });
        await fetchWords(debouncedFilterRef.current || '');
        await fetchMy();
        if (editingId === id) cancelEdit();
      }
    } catch (err) {
      console.error('doDelete', err);
      setStatus({ type: 'error', message: 'Network error' });
    }
  };

  const handleLogout = () => { clearSession(); setSession(null); router.push('/login'); };

  const submitWord = async (e) => {
    e?.preventDefault();
    if (!newWord.trim()) return setStatus({ type: 'error', message: 'Word required' });
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetchWithAuth('/api/words', {
        method: 'POST',
        body: JSON.stringify({ word: newWord.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) setStatus({ type: 'denied', message: 'Word already exists' });
        else if (res.status === 403) setStatus({ type: 'denied', message: body.error || 'Submission limit reached' });
        else setStatus({ type: 'error', message: body.error || `Submit failed (${res.status})` });
      } else {
        setStatus({ type: 'success', message: 'Word submitted!' });
        setNewWord('');
        await fetchWords(debouncedFilterRef.current || '');
        await fetchMy();
      }
    } catch (err) {
      console.error('submitWord', err);
      setStatus({ type: 'error', message: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', maxWidth: 1200, margin: '0 auto', background: '#fafbfc', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#92400e', fontSize: 20, fontWeight: 700, boxShadow: '0 2px 8px rgba(251, 191, 36, 0.25)' }}>S</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#1a1f36', letterSpacing: '-0.02em' }}>Soul's List</h1>
              <div style={{ color: '#6b7280', marginTop: 2, fontSize: 14 }}>Collaborative Word Collection</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 14, fontWeight: 500 }}>{session?.name || ''}</div>
          <button onClick={handleLogout} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ffffff', color: '#6b7280', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)'} onMouseOut={e => e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'}>Logout</button>
        </div>
      </header>

      {status && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 12,
          marginBottom: 24,
          background: status.type === 'error' || status.type === 'denied' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${status.type === 'error' || status.type === 'denied' ? '#fecaca' : '#bbf7d0'}`,
          color: status.type === 'error' || status.type === 'denied' ? '#dc2626' : '#16a34a',
          fontWeight: 500,
          fontSize: 14,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
        }}>
          {status.message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: 24 }}>
        {/* left: global list */}
        <div style={{ background: '#fff', border: 'none', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#1a1f36' }}>All Words</h2>
              <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>Most recent first</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search..." style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', transition: 'border 0.2s', width: 160 }} onFocus={e => e.target.style.border = '1px solid #818cf8'} onBlur={e => e.target.style.border = '1px solid #e5e7eb'} />
              <button onClick={() => fetchWords(globalFilter)} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#f3f4f6', color: '#4b5563', fontWeight: 500, cursor: 'pointer', fontSize: 14, transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#e5e7eb'} onMouseOut={e => e.target.style.background = '#f3f4f6'}>Apply</button>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 580, overflow: 'auto' }}>
            {loadingWords && <li style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>Loading...</li>}
            {!loadingWords && words.length === 0 && <li style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>No words yet</li>}
            {!loadingWords && words.map((w) => (
              <li key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1f36', fontSize: 15, marginBottom: 4 }}>{w.word}</div>
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>
                    {w.name} • {w.created_at ? new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* right: my submissions */}
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Submit word form */}
          <div style={{ background: '#fff', border: 'none', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)' }}>
            <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 600, color: '#1a1f36', marginBottom: 16 }}>Submit a Word</h2>
            <form onSubmit={submitWord} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="Type a word..."
                maxLength={20}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 15, outline: 'none', transition: 'all 0.2s', fontWeight: 500 }}
                onFocus={e => { e.target.style.border = '1px solid #fbbf24'; e.target.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.15)' }}
                onBlur={e => { e.target.style.border = '1px solid #e5e7eb'; e.target.style.boxShadow = 'none' }}
              />
              <button
                type="submit"
                disabled={submitting || !newWord.trim()}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: submitting || !newWord.trim() ? '#e5e7eb' : 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: submitting || !newWord.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: submitting || !newWord.trim() ? 'none' : '0 2px 8px rgba(251, 191, 36, 0.4)'
                }}
                onMouseOver={e => { if (!submitting && newWord.trim()) e.target.style.transform = 'translateY(-1px)' }}
                onMouseOut={e => e.target.style.transform = 'translateY(0)'}
              >
                {submitting ? 'Submitting...' : 'Submit Word'}
              </button>
            </form>
            <div style={{ marginTop: 12, color: '#9ca3af', fontSize: 12, lineHeight: 1.5 }}>
              Max 20 characters. Only letters, numbers, hyphen and underscore.
            </div>
          </div>

          <div style={{ background: '#fff', border: 'none', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#1a1f36' }}>My Submissions</h2>
              <button onClick={fetchMy} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#f3f4f6', color: '#6b7280', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#e5e7eb'} onMouseOut={e => e.target.style.background = '#f3f4f6'}>Refresh</button>
            </div>
            <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>Edit or delete your submissions</div>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {searching && <li style={{ padding: 12, color: '#6b7280', fontSize: 14 }}>Loading...</li>}
              {!searching && myItems.length === 0 && <li style={{ padding: 12, color: '#9ca3af', fontSize: 14 }}>No submissions yet</li>}
              {myItems.map((it) => (
                <li key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ flex: 1 }}>
                    {editingId === it.id ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input value={editWord} onChange={(e) => setEditWord(e.target.value)} maxLength={20} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', flex: 1, minWidth: 140, fontSize: 14, outline: 'none' }} />
                        <button onClick={saveEdit} disabled={editLoading} style={{ padding: '8px 14px', borderRadius: 8, background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)', color: '#92400e', border: 'none', fontWeight: 600, fontSize: 14, cursor: editLoading ? 'default' : 'pointer' }}>{editLoading ? '...' : 'Save'}</button>
                        <button onClick={cancelEdit} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#f3f4f6', color: '#6b7280', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, color: '#1a1f36', fontSize: 15, marginBottom: 4 }}>{it.word}</div>
                        <div style={{ color: '#9ca3af', fontSize: 12 }}>{it.created_at ? new Date(it.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                      </>
                    )}
                  </div>

                  {editingId !== it.id && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(it)} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#f3f4f6', color: '#6b7280', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#e5e7eb'} onMouseOut={e => e.target.style.background = '#f3f4f6'}>Edit</button>
                      <button onClick={() => doDelete(it.id)} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#fecaca'} onMouseOut={e => e.target.style.background = '#fee2e2'}>Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)', border: 'none', borderRadius: 16, padding: 24, boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)' }}>
            <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 600, color: '#92400e', marginBottom: 12 }}>Account</h3>
            <div style={{ color: '#92400e', fontSize: 14, marginBottom: 6, opacity: 0.8 }}>Signed in as</div>
            <div style={{ color: '#78350f', fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{session?.name}</div>
            <div style={{ marginTop: 16, padding: 12, background: 'rgba(255,255,255,0.3)', borderRadius: 8, color: '#92400e', fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>✨ Pro Tips</div>
              <div>• Changes sync in real-time</div>
              <div>• Use search to find words globally</div>
              <div>• Max 20 words per user</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
