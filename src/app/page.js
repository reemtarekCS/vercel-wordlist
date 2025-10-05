// src/app/page.js
'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function Page() {
  // Show helpful dev message if envs are missing
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Missing Supabase configuration</h1>
        <p style={{ color: '#b00' }}>
          Your Supabase environment variables are missing. Please create <code>.env.local</code> in the project root with:
        </p>
        <pre style={{ background: '#f6f6f6', padding: 12 }}>
          {`NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`}
        </pre>
        <p>After adding the file, restart the dev server: <code>npm run dev</code></p>
      </div>
    );
  }

  // safe: envs are present
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const [name, setName] = useState('');
  const [word, setWord] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [words, setWords] = useState([]);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editWord, setEditWord] = useState('');
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const fetchWords = async () => {
    try {
      const { data, error } = await supabase
        .from('words')
        .select('id, word, name, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setWords(data || []);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to fetch list' });
    }
  };

  useEffect(() => {
    fetchWords();

    const channel = supabase
      .channel('public:words')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'words' }, (payload) => {
        setWords((prev) => [payload.new, ...prev].slice(0, 500));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'words' }, (payload) => {
        setWords((prev) => prev.map((p) => (p.id === payload.new.id ? payload.new : p)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'words' }, (payload) => {
        setWords((prev) => prev.filter((p) => p.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateWordClient = (w) => {
    if (!w) return 'Empty word';
    if (w.length > 20) return 'Word must be 20 characters or fewer';
    if (!/^[-_\p{L}0-9]+$/u.test(w)) return 'Only letters, numbers, hyphen and underscore allowed';
    return null;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (loading) return;
    setStatus(null);

    const trimmed = word.trim();
    const v = validateWordClient(trimmed);
    if (v) {
      setStatus({ type: 'error', message: v });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/words', {
        method: 'POST',
        body: JSON.stringify({ name, word: trimmed }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.status === 409) {
        setStatus({ type: 'denied', message: 'Denied — word already exists' });
      } else if (res.status >= 400) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: 'error', message: body.error || 'Insert failed' });
      } else {
        setStatus({ type: 'success', message: 'Added!' });
        setWord('');

        // immediately refresh list after successful add
        await fetchWords();
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Unexpected error' });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditWord(item.word);
    setEditName(item.name || '');
    setStatus(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditWord('');
    setEditName('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const v = validateWordClient(editWord.trim());
    if (v) {
      setStatus({ type: 'error', message: v });
      return;
    }
    setEditLoading(true);
    try {
      const res = await fetch(`/api/words/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, word: editWord.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.status === 409) {
        setStatus({ type: 'denied', message: 'Denied — word already exists' });
      } else if (res.status >= 400) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: 'error', message: body.error || 'Update failed' });
      } else {
        setStatus({ type: 'success', message: 'Updated!' });
        cancelEdit();
        const body = await res.json().catch(() => ({}));
        if (body?.item) {
          setWords((prev) => prev.map((p) => (p.id === body.item.id ? body.item : p)));
        }
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Unexpected error' });
    } finally {
      setEditLoading(false);
    }
  };

  const doDelete = async (id) => {
    const ok = window.confirm('Delete this word? This action cannot be undone.');
    if (!ok) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/words/${id}`, { method: 'DELETE' });
      if (res.status >= 400) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: 'error', message: body.error || 'Delete failed' });
      } else {
        setStatus({ type: 'success', message: 'Deleted' });
        setWords((prev) => prev.filter((p) => p.id !== id));
        if (editingId === id) cancelEdit();
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Unexpected error' });
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Word Checker — shared list</h1>
        <small style={{ color: '#666' }}>One word at a time • 20-char limit</small>
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={50}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd' }}
          />
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Enter one word"
            maxLength={20}
            style={{ width: 220, padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd' }}
          />
          <button disabled={loading} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#111', color: '#fff' }}>
            {loading ? '...' : 'Submit'}
          </button>
        </div>
        {status && (
          <div style={{ padding: 10, borderRadius: 8, background: status.type === 'error' ? '#ffecec' : status.type === 'denied' ? '#fff3cd' : '#ecffe9', color: '#111' }}>
            {status.message}
          </div>
        )}
      </form>

      <section>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Shared list</h2>
        <small style={{ color: '#666' }}>Most recent first — visible to everyone</small>

        <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
          {words.length === 0 && <li style={{ color: '#666' }}>No words yet — be the first!</li>}
          {words.map((w) => (
            <li key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ flex: 1 }}>
                {editingId === w.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={editWord} onChange={(e) => setEditWord(e.target.value)} maxLength={20} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }} />
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="name" maxLength={50} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', width: 140 }} />
                    <button disabled={editLoading} onClick={saveEdit} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#0a84ff', color: '#fff' }}>{editLoading ? '...' : 'Save'}</button>
                    <button onClick={cancelEdit} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff' }}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <strong style={{ textTransform: 'none' }}>{w.word}</strong>
                    <div style={{ fontSize: 12, color: '#666' }}>{w.name || 'Anonymous'}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                {editingId !== w.id && (
                  <>
                    <button onClick={() => startEdit(w)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff' }}>Edit</button>
                    <button onClick={() => doDelete(w.id)} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#ff4d4f', color: '#fff' }}>Delete</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer style={{ marginTop: 18, color: '#999', fontSize: 12 }}>
        <div>Notes: Edits & deletes use server routes (service role). Realtime updates propagate to everyone.</div>
      </footer>
    </div>
  );
}
