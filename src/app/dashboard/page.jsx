// src/app/dashboard/page.jsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, clearSession } from '../../lib/auth';
import fetchWithAuth from '../../lib/fetchWithAuth';

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState(() => getSession());
  const [myLists, setMyLists] = useState([]);
  const [availableLists, setAvailableLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  const fetchLists = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      // Fetch user's own lists and public lists they can join
      const [myListsRes, availableListsRes] = await Promise.all([
        fetchWithAuth('/api/lists'),
        fetchWithAuth('/api/lists?public=true')
      ]);

      if (myListsRes.ok) {
        const myListsData = await myListsRes.json();
        setMyLists(myListsData.lists || []);
      }

      if (availableListsRes.ok) {
        const availableData = await availableListsRes.json();
        setAvailableLists(availableData.lists || []);
      }
    } catch (err) {
      console.error('Error fetching lists:', err);
      setStatus({ type: 'error', message: 'Failed to load lists' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchLists();
    }
  }, [session, fetchLists]);

  const handleLogout = () => {
    clearSession();
    setSession(null);
    router.push('/login');
  };

  const handleCreateList = () => {
    router.push('/dashboard/create-list');
  };

  const handleViewList = (listId) => {
    router.push(`/dashboard/lists/${listId}`);
  };

  const handleJoinList = async (listId) => {
    setStatus(null);
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/join`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Successfully joined the list!' });
        fetchLists(); // Refresh lists
      } else {
        const error = await res.json();
        setStatus({ type: 'error', message: error.error || 'Failed to join list' });
      }
    } catch (err) {
      console.error('Error joining list:', err);
      setStatus({ type: 'error', message: 'Failed to join list' });
    }
  };

  if (!session) {
    return <div />;
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
        <div>
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
                Dashboard
              </h1>
              <div style={{
                color: '#6b7280',
                marginTop: 2,
                fontSize: 14
              }}>
                Manage your word lists
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 14, fontWeight: 500 }}>
            {session?.name || ''}
          </div>
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
          background: status.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${status.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: status.type === 'error' ? '#dc2626' : '#16a34a',
          fontWeight: 500,
          fontSize: 14,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
        }}>
          {status.message}
        </div>
      )}

      <div style={{ display: 'grid', gap: 24 }}>
        {/* My Lists Section */}
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
                My Lists
              </h2>
              <div style={{
                color: '#9ca3af',
                fontSize: 13,
                marginTop: 4
              }}>
                Lists you own or are a member of
              </div>
            </div>
            <button
              onClick={handleCreateList}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
                color: '#92400e',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(251, 191, 36, 0.4)'
              }}
              onMouseOver={e => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={e => e.target.style.transform = 'translateY(0)'}
            >
              Create List
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
              Loading your lists...
            </div>
          ) : myLists.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              color: '#9ca3af',
              background: '#f9fafb',
              borderRadius: 12
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                No lists yet
              </div>
              <div style={{ marginBottom: 20 }}>
                Create your first list or join an existing one to get started!
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16
            }}>
              {myLists.map((list) => (
                <div
                  key={list.id}
                  style={{
                    padding: 20,
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    background: '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = '#fbbf24';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => handleViewList(list.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: list.is_owner ? '#fbbf24' : '#10b981'
                    }} />
                    <div style={{
                      fontSize: 12,
                      color: list.is_owner ? '#92400e' : '#059669',
                      fontWeight: 600
                    }}>
                      {list.is_owner ? 'OWNER' : 'MEMBER'}
                    </div>
                  </div>

                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#1a1f36'
                  }}>
                    {list.name}
                  </h3>

                  {list.description && (
                    <p style={{
                      margin: '0 0 12px 0',
                      color: '#6b7280',
                      fontSize: 14,
                      lineHeight: 1.4
                    }}>
                      {list.description}
                    </p>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                    color: '#9ca3af'
                  }}>
                    <span>{list.member_count || 0} members</span>
                    <span>{list.word_count || 0} words</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Lists Section */}
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
                Discover Lists
              </h2>
              <div style={{
                color: '#9ca3af',
                fontSize: 13,
                marginTop: 4
              }}>
                Public lists you can join
              </div>
            </div>
          </div>

          {availableLists.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              color: '#9ca3af'
            }}>
              No public lists available to join at the moment.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16
            }}>
              {availableLists
                .filter(list => !myLists.some(myList => myList.id === list.id))
                .map((list) => (
                <div
                  key={list.id}
                  style={{
                    padding: 20,
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    background: '#fff'
                  }}
                >
                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#1a1f36'
                  }}>
                    {list.name}
                  </h3>

                  {list.description && (
                    <p style={{
                      margin: '0 0 12px 0',
                      color: '#6b7280',
                      fontSize: 14,
                      lineHeight: 1.4
                    }}>
                      {list.description}
                    </p>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                    color: '#9ca3af',
                    marginBottom: 16
                  }}>
                    <span>{list.member_count || 0} members</span>
                    <span>{list.word_count || 0} words</span>
                  </div>

                  <button
                    onClick={() => handleJoinList(list.id)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={e => e.target.style.transform = 'translateY(-1px)'}
                    onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                  >
                    Join List
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
