// src/app/dashboard/lists/[id]/page.jsx
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getSession, clearSession } from '../../../../lib/auth';
import fetchWithAuth from '../../../../lib/fetchWithAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function ListView() {
  const router = useRouter();
  const params = useParams();
  const listId = params.id;

  const [session, setSession] = useState(() => getSession());
  const [list, setList] = useState(null);
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

  const [settingsLoading, setSettingsLoading] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    customTitle: '',
    customSubtitle: ''
  });
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  // Memoize the client so it's stable across renders
  const supabase = useMemo(() => createClient(SUPABASE_URL, SUPABASE_ANON_KEY), []);

  const fetchWords = useCallback(async (q = '') => {
    if (!listId) return;

    setLoadingWords(true);
    setStatus(null);
    try {
      const url = q
        ? `/api/words?q=${encodeURIComponent(q)}&limit=500&list_id=${listId}`
        : `/api/words?limit=500&list_id=${listId}`;
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
  }, [listId]);

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
      .channel(`list:${listId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'words',
        filter: `list_id=eq.${listId}`
      }, (payload) => {
        const item = payload.new;
        if (item?.duplicate_of) return;
        setWords((prev) => [item, ...prev].slice(0, 500));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'words',
        filter: `list_id=eq.${listId}`
      }, (payload) => {
        const item = payload.new;
        if (item?.duplicate_of) {
          setWords((prev) => prev.filter((p) => p.id !== item.id));
          return;
        }
        setWords((prev) => prev.map((p) => (p.id === item.id ? item : p)));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'words',
        filter: `list_id=eq.${listId}`
      }, (payload) => {
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
  }, [supabase, listId]);

  // fetch my items using name query param (server provides `name` filter)
  const fetchMy = useCallback(async () => {
    if (!session?.name) return;
    setSearching(true);
    setStatus(null);
    try {
      const url = `/api/words?name=${encodeURIComponent(session.name)}&limit=500&list_id=${listId}`;
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
  }, [session?.name, listId]);

  useEffect(() => {
    if (session?.name) {
      fetchMy();
    }
  }, [session?.name, fetchMy]);

  // Initialize settings form when list data is loaded
  useEffect(() => {
    if (list) {
      setSettingsForm({
        customTitle: list.custom_title || '',
        customSubtitle: list.custom_subtitle || ''
      });
    }
  }, [list]);

  // Fetch list details
  useEffect(() => {
    if (listId && session) {
      fetch(`/api/lists/${listId}`)
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            setList(data.list);
          } else {
            setStatus({ type: 'error', message: data.error || 'Failed to load list' });
          }
        })
        .catch(err => {
          console.error('Error fetching list:', err);
          setStatus({ type: 'error', message: 'Failed to load list' });
        });
    }
  }, [listId, session]);

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

  const handleLogout = () => {
    clearSession();
    setSession(null);
    router.push('/login');
  };

  const handleDeleteList = async () => {
    if (!window.confirm(`Are you sure you want to delete "${list.name}"? This action cannot be undone and will remove all words in the list.`)) {
      return;
    }

    setStatus({ type: 'info', message: 'Deleting list...' });
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'List deleted successfully!' });
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        const error = await res.json();
        setStatus({ type: 'error', message: error.error || 'Failed to delete list' });
      }
    } catch (err) {
      console.error('Error deleting list:', err);
      setStatus({ type: 'error', message: 'Network error' });
    }
  };

  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    setStatus(null);

    try {
      const res = await fetchWithAuth(`/api/lists/${listId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          customTitle: settingsForm.customTitle.trim() || null,
          customSubtitle: settingsForm.customSubtitle.trim() || null
        }),
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'List settings updated!' });
        setShowSettings(false);
        // Refresh list data
        const listRes = await fetch(`/api/lists/${listId}`);
        const listData = await listRes.json();
        if (listData.ok) {
          setList(listData.list);
        }
      } else {
        const error = await res.json();
        setStatus({ type: 'error', message: error.error || 'Failed to update settings' });
      }
    } catch (err) {
      console.error('Error updating settings:', err);
      setStatus({ type: 'error', message: 'Failed to update settings' });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSettingsCancel = () => {
    setShowSettings(false);
    setSettingsForm({
      customTitle: list.custom_title || '',
      customSubtitle: list.custom_subtitle || ''
    });
  };

  const submitWord = async (e) => {
    e?.preventDefault();
    if (!newWord.trim()) return setStatus({ type: 'error', message: 'Word required' });
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetchWithAuth('/api/words', {
        method: 'POST',
        body: JSON.stringify({ word: newWord.trim(), list_id: listId }),
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

  if (!session) {
    return <div />;
  }

  if (!list) {
    return (
      <div style={{
        padding: '32px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: 1200,
        margin: '0 auto',
        background: '#fafbfc',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <div>Loading list...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '32px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      maxWidth: 1200,
      margin: '0 auto',
      background: '#fafbfc',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={handleBackToDashboard}
            style={{
              padding: '8px',
              borderRadius: 8,
              border: 'none',
              background: '#ffffff',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 16,
              transition: 'all 0.2s'
            }}
            onMouseOver={e => e.target.style.background = '#f3f4f6'}
            onMouseOut={e => e.target.style.background = '#ffffff'}
          >
            ← Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#92400e',
              fontSize: 20,
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(251, 191, 36, 0.25)'
            }}>
              S
            </div>
            <div>
              <h1 style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 700,
                color: '#1a1f36',
                letterSpacing: '-0.02em'
              }}>
                {list.name}
              </h1>
              <div style={{
                color: '#6b7280',
                marginTop: 2,
                fontSize: 14
              }}>
                {list.is_public ? 'Public List' : 'Private List'} • {list.member_count || 0} members • {list.word_count || 0} words
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 14, fontWeight: 500 }}>
            {session?.name || ''}
          </div>
          {list?.is_owner && (
            <>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#f3f4f6',
                  color: '#6b7280',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.target.style.background = '#e5e7eb'}
                onMouseOut={e => e.target.style.background = '#f3f4f6'}
              >
                ⚙️ Settings
              </button>
              <button
                onClick={handleDeleteList}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#fee2e2',
                  color: '#dc2626',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.target.style.background = '#fecaca'}
                onMouseOut={e => e.target.style.background = '#fee2e2'}
              >
                🗑️ Delete List
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#ffffff',
              color: '#6b7280',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => e.target.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)'}
            onMouseOut={e => e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Status message */}
      {status && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 12,
          marginBottom: 24,
          background: status.type === 'error' || status.type === 'denied' ? '#fef2f2' : status.type === 'info' ? '#eff6ff' : '#f0fdf4',
          border: `1px solid ${status.type === 'error' || status.type === 'denied' ? '#fecaca' : status.type === 'info' ? '#bfdbfe' : '#bbf7d0'}`,
          color: status.type === 'error' || status.type === 'denied' ? '#dc2626' : status.type === 'info' ? '#1d4ed8' : '#16a34a',
          fontWeight: 500,
          fontSize: 14,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
        }}>
          {status.message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: 24 }}>
        {/* left: list words */}
        <div style={{
          background: '#fff',
          border: 'none',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20
          }}>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: '#1a1f36'
              }}>
                Words in {list.name}
              </h2>
              <div style={{
                color: '#9ca3af',
                fontSize: 13,
                marginTop: 4
              }}>
                Most recent first
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search..."
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border 0.2s',
                  width: 160
                }}
                onFocus={e => e.target.style.border = '1px solid #818cf8'}
                onBlur={e => e.target.style.border = '1px solid #e5e7eb'}
              />
              <button
                onClick={() => fetchWords(globalFilter)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#f3f4f6',
                  color: '#4b5563',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.target.style.background = '#e5e7eb'}
                onMouseOut={e => e.target.style.background = '#f3f4f6'}
              >
                Apply
              </button>
            </div>
          </div>

          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            maxHeight: 580,
            overflow: 'auto'
          }}>
            {loadingWords && (
              <li style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>
                Loading...
              </li>
            )}
            {!loadingWords && words.length === 0 && (
              <li style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>
                No words yet
              </li>
            )}
            {!loadingWords && words.map((w) => (
              <li key={w.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 0',
                borderBottom: '1px solid #f3f4f6',
                transition: 'background 0.2s'
              }}>
                <div>
                  <div style={{
                    fontWeight: 600,
                    color: '#1a1f36',
                    fontSize: 15,
                    marginBottom: 4
                  }}>
                    {w.word}
                  </div>
                  <div style={{
                    color: '#9ca3af',
                    fontSize: 13
                  }}>
                    {w.name} • {w.created_at ? new Date(w.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : '—'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* right: my submissions and submit form */}
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Submit word form */}
          <div style={{
            background: '#fff',
            border: 'none',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <h2 style={{
              marginTop: 0,
              fontSize: 20,
              fontWeight: 600,
              color: '#1a1f36',
              marginBottom: 16
            }}>
              {list.custom_title || 'Submit a Word'}
            </h2>
            <form onSubmit={submitWord} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="Type a word..."
                maxLength={20}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  fontSize: 15,
                  outline: 'none',
                  transition: 'all 0.2s',
                  fontWeight: 500
                }}
                onFocus={e => {
                  e.target.style.border = '1px solid #fbbf24';
                  e.target.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.15)';
                }}
                onBlur={e => {
                  e.target.style.border = '1px solid #e5e7eb';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="submit"
                disabled={submitting || !newWord.trim()}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: submitting || !newWord.trim()
                    ? '#e5e7eb'
                    : 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: submitting || !newWord.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: submitting || !newWord.trim()
                    ? 'none'
                    : '0 2px 8px rgba(251, 191, 36, 0.4)'
                }}
                onMouseOver={e => {
                  if (!submitting && newWord.trim()) e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={e => e.target.style.transform = 'translateY(0)'}
              >
                {submitting ? 'Submitting...' : 'Submit Word'}
              </button>
            </form>
            <div style={{
              marginTop: 12,
              color: '#9ca3af',
              fontSize: 12,
              lineHeight: 1.5
            }}>
              {list.custom_subtitle || 'Max 20 characters. Only letters, numbers, hyphen and underscore.'}
            </div>
          </div>

          <div style={{
            background: '#fff',
            border: 'none',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <h2 style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: '#1a1f36'
              }}>
                My Submissions
              </h2>
              <button
                onClick={fetchMy}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#f3f4f6',
                  color: '#6b7280',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.target.style.background = '#e5e7eb'}
                onMouseOut={e => e.target.style.background = '#f3f4f6'}
              >
                Refresh
              </button>
            </div>
            <div style={{
              color: '#9ca3af',
              fontSize: 13,
              marginBottom: 16
            }}>
              Edit or delete your submissions
            </div>

            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: 0
            }}>
              {searching && (
                <li style={{ padding: 12, color: '#6b7280', fontSize: 14 }}>
                  Loading...
                </li>
              )}
              {!searching && myItems.length === 0 && (
                <li style={{ padding: 12, color: '#9ca3af', fontSize: 14 }}>
                  No submissions yet
                </li>
              )}
              {myItems.map((it) => (
                <li key={it.id} style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid #f3f4f6'
                }}>
                  <div style={{ flex: 1 }}>
                    {editingId === it.id ? (
                      <div style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap'
                      }}>
                        <input
                          value={editWord}
                          onChange={(e) => setEditWord(e.target.value)}
                          maxLength={20}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                            flex: 1,
                            minWidth: 140,
                            fontSize: 14,
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={saveEdit}
                          disabled={editLoading}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
                            color: '#92400e',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: editLoading ? 'default' : 'pointer'
                          }}
                        >
                          {editLoading ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#f3f4f6',
                            color: '#6b7280',
                            fontWeight: 500,
                            fontSize: 14,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          fontWeight: 600,
                          color: '#1a1f36',
                          fontSize: 15,
                          marginBottom: 4
                        }}>
                          {it.word}
                        </div>
                        <div style={{
                          color: '#9ca3af',
                          fontSize: 12
                        }}>
                          {it.created_at ? new Date(it.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '—'}
                        </div>
                      </>
                    )}
                  </div>

                  {editingId !== it.id && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => startEdit(it)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 7,
                          border: 'none',
                          background: '#f3f4f6',
                          color: '#6b7280',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={e => e.target.style.background = '#e5e7eb'}
                        onMouseOut={e => e.target.style.background = '#f3f4f6'}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => doDelete(it.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 7,
                          border: 'none',
                          background: '#fee2e2',
                          color: '#dc2626',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={e => e.target.style.background = '#fecaca'}
                        onMouseOut={e => e.target.style.background = '#fee2e2'}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
            border: 'none',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)'
          }}>
            <h3 style={{
              marginTop: 0,
              fontSize: 16,
              fontWeight: 600,
              color: '#92400e',
              marginBottom: 12
            }}>
              List Info
            </h3>
            <div style={{
              color: '#92400e',
              fontSize: 14,
              marginBottom: 6,
              opacity: 0.8
            }}>
              Signed in as
            </div>
            <div style={{
              color: '#78350f',
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 16
            }}>
              {session?.name}
            </div>
            <div style={{
              color: '#92400e',
              fontSize: 14,
              marginBottom: 6,
              opacity: 0.8
            }}>
              Your role
            </div>
            <div style={{
              color: '#78350f',
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 16
            }}>
              {list.is_owner ? 'Owner' : 'Member'}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 32,
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24
            }}>
              <h2 style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 600,
                color: '#1a1f36'
              }}>
                List Settings
              </h2>
              <button
                onClick={handleSettingsCancel}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: 4
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSettingsSubmit} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20
            }}>
              {/* Custom Title */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1a1f36',
                  marginBottom: 8
                }}>
                  Custom Title (above submit button)
                </label>
                <input
                  type="text"
                  value={settingsForm.customTitle}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    customTitle: e.target.value
                  }))}
                  placeholder="Enter custom title (or leave empty for default)"
                  maxLength={200}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    fontSize: 15,
                    outline: 'none',
                    transition: 'all 0.2s',
                    fontWeight: 500
                  }}
                  onFocus={e => {
                    e.target.style.border = '1px solid #fbbf24';
                    e.target.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.15)';
                  }}
                  onBlur={e => {
                    e.target.style.border = '1px solid #e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <div style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  marginTop: 4
                }}>
                  {settingsForm.customTitle.length}/200 characters
                </div>
              </div>

              {/* Custom Subtitle */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1a1f36',
                  marginBottom: 8
                }}>
                  Custom Subtitle (below submit button)
                </label>
                <textarea
                  value={settingsForm.customSubtitle}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    customSubtitle: e.target.value
                  }))}
                  placeholder="Enter custom subtitle (or leave empty for default)"
                  maxLength={1000}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    fontSize: 15,
                    outline: 'none',
                    transition: 'all 0.2s',
                    fontWeight: 500,
                    resize: 'vertical'
                  }}
                  onFocus={e => {
                    e.target.style.border = '1px solid #fbbf24';
                    e.target.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.15)';
                  }}
                  onBlur={e => {
                    e.target.style.border = '1px solid #e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <div style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  marginTop: 4
                }}>
                  {settingsForm.customSubtitle.length}/1000 characters
                </div>
              </div>

              {/* Buttons */}
              <div style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                marginTop: 16
              }}>
                <button
                  type="button"
                  onClick={handleSettingsCancel}
                  disabled={settingsLoading}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    background: '#ffffff',
                    color: '#6b7280',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: settingsLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsLoading}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 10,
                    border: 'none',
                    background: settingsLoading
                      ? '#e5e7eb'
                      : 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
                    color: settingsLoading ? '#9ca3af' : '#92400e',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: settingsLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: settingsLoading
                      ? 'none'
                      : '0 2px 8px rgba(251, 191, 36, 0.4)'
                  }}
                >
                  {settingsLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
