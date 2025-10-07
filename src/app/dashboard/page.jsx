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
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [debouncedDiscoverSearch, setDebouncedDiscoverSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [joiningListId, setJoiningListId] = useState(null);
  const [joinPassword, setJoinPassword] = useState('');

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
      // Fetch user's own lists and lists they can discover
      const [myListsRes, availableListsRes] = await Promise.all([
        fetchWithAuth('/api/lists'),
        fetchWithAuth(`/api/lists?discover=true${discoverSearch ? `&search=${encodeURIComponent(discoverSearch)}` : ''}`)
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
  }, [discoverSearch]);

  useEffect(() => {
    if (session && debouncedDiscoverSearch !== null) {
      fetchLists();
    }
  }, [session, debouncedDiscoverSearch]);

  // Debounce discover search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDiscoverSearch(discoverSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [discoverSearch]);

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

  const handleJoinList = async (listId, isPublic) => {
    if (!isPublic) {
      // For private lists, show password input
      setJoiningListId(listId);
      setJoinPassword('');
      return;
    }

    // For public lists, join immediately
    await performJoin(listId, null);
  };

  const performJoin = async (listId, password) => {
    setStatus(null);
    setJoiningListId(null);
    setJoinPassword('');

    try {
      const body = {};
      if (password) {
        body.password = password;
      }

      const res = await fetchWithAuth(`/api/lists/${listId}/join`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const result = await res.json();
        setStatus({ type: 'success', message: result.message || 'Successfully joined the list!' });

        // Wait a moment for the database to commit, then refresh
        setTimeout(() => {
          fetchLists();
        }, 500);
      } else {
        const error = await res.json();
        setStatus({ type: 'error', message: error.error || `Failed to join list (${res.status})` });
      }
    } catch (err) {
      console.error('Error joining list:', err);
      setStatus({ type: 'error', message: `Network error: ${err.message}` });
    }
  };

  const handlePasswordJoin = () => {
    if (joiningListId && joinPassword) {
      performJoin(joiningListId, joinPassword);
    }
  };

  const handleLeaveList = async (listId) => {
    if (!window.confirm('Are you sure you want to leave this list?')) {
      return;
    }

    setStatus(null);
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/leave`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Successfully left the list!' });
        fetchLists(); // Refresh lists
      } else {
        const error = await res.json();
        setStatus({ type: 'error', message: error.error || 'Failed to leave list' });
      }
    } catch (err) {
      console.error('Error leaving list:', err);
      setStatus({ type: 'error', message: 'Failed to leave list' });
    }
  };

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
                    position: 'relative',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = '#fbbf24';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
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
                    color: '#9ca3af',
                    marginBottom: 16
                  }}>
                    <span>{list.member_count || 0} members</span>
                    <span>{list.word_count || 0} words</span>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewList(list.id);
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        background: '#ffffff',
                        color: '#374151',
                        fontWeight: 500,
                        fontSize: 14,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={e => {
                        e.target.style.background = '#f9fafb';
                        e.target.style.borderColor = '#d1d5db';
                      }}
                      onMouseOut={e => {
                        e.target.style.background = '#ffffff';
                        e.target.style.borderColor = '#e5e7eb';
                      }}
                    >
                      View List
                    </button>

                    {list.is_owner ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Settings functionality would go here
                          }}
                          style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#f3f4f6',
                            color: '#6b7280',
                            fontWeight: 500,
                            fontSize: 14,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={e => e.target.style.background = '#e5e7eb'}
                          onMouseOut={e => e.target.style.background = '#f3f4f6'}
                        >
                          ⚙️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Delete functionality would go here
                          }}
                          style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontWeight: 500,
                            fontSize: 14,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={e => e.target.style.background = '#fecaca'}
                          onMouseOut={e => e.target.style.background = '#fee2e2'}
                        >
                          🗑️
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLeaveList(list.id);
                        }}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#fef2f2',
                          color: '#dc2626',
                          fontWeight: 500,
                          fontSize: 14,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={e => e.target.style.background = '#fecaca'}
                        onMouseOut={e => e.target.style.background = '#fef2f2'}
                      >
                        Leave
                      </button>
                    )}
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
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 16
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
                Public and private lists you can join
              </div>
            </div>
            <div style={{
              display: 'flex',
              gap: 8,
              minWidth: '280px',
              flex: '1',
              maxWidth: '400px'
            }}>
              <input
                value={discoverSearch}
                onChange={(e) => setDiscoverSearch(e.target.value)}
                placeholder="Search lists..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border 0.2s'
                }}
                onFocus={e => e.target.style.border = '1px solid #818cf8'}
                onBlur={e => e.target.style.border = '1px solid #e5e7eb'}
              />
              <button
                onClick={fetchLists}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#f3f4f6',
                  color: '#4b5563',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseOver={e => e.target.style.background = '#e5e7eb'}
                onMouseOut={e => e.target.style.background = '#f3f4f6'}
              >
                Search
              </button>
            </div>
          </div>

          {availableLists.length === 0 ? (
            <div style={{
              padding: 60,
              textAlign: 'center',
              color: '#9ca3af'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                {discoverSearch ? 'No lists found' : 'No lists available'}
              </div>
              <div style={{ fontSize: 14 }}>
                {discoverSearch
                  ? 'Try adjusting your search terms or browse all lists'
                  : 'Be the first to create a list that others can discover!'
                }
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 20
            }}>
              {availableLists
                .filter(list => !myLists.some(myList => myList.id === list.id))
                .map((list) => (
                <div
                  key={list.id}
                  style={{
                    padding: 24,
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    background: '#fff',
                    transition: 'all 0.2s',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: list.is_public ? '#10b981' : '#f59e0b',
                      boxShadow: `0 0 0 2px ${list.is_public ? '#d1fae5' : '#fef3c7'}`
                    }} />
                    <div style={{
                      fontSize: 12,
                      color: list.is_public ? '#059669' : '#92400e',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {list.is_public ? 'Public' : 'Private'}
                    </div>
                  </div>

                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#1a1f36',
                    lineHeight: 1.3
                  }}>
                    {list.name}
                  </h3>

                  {list.description && (
                    <p style={{
                      margin: '0 0 16px 0',
                      color: '#6b7280',
                      fontSize: 14,
                      lineHeight: 1.5
                    }}>
                      {list.description.length > 120
                        ? `${list.description.substring(0, 120)}...`
                        : list.description
                      }
                    </p>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 13,
                    color: '#9ca3af',
                    marginBottom: 20,
                    padding: '8px 0',
                    borderTop: '1px solid #f3f4f6'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      👥 {list.member_count || 0}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      📝 {list.word_count || 0}
                    </span>
                  </div>

                  {joiningListId === list.id ? (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(255, 255, 255, 0.95)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10,
                      borderRadius: 16
                    }}>
                      <div style={{
                        background: '#fff',
                        padding: 24,
                        borderRadius: 12,
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        minWidth: 280
                      }}>
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1f36', marginBottom: 4 }}>
                            Join Private List
                          </div>
                          <div style={{ fontSize: 14, color: '#6b7280' }}>
                            Enter password for "{list.name}"
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="password"
                            value={joinPassword}
                            onChange={(e) => setJoinPassword(e.target.value)}
                            placeholder="Enter password..."
                            style={{
                              flex: 1,
                              padding: '12px 14px',
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                              fontSize: 14,
                              outline: 'none'
                            }}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordJoin()}
                            autoFocus
                          />
                          <button
                            onClick={handlePasswordJoin}
                            disabled={!joinPassword}
                            style={{
                              padding: '12px 16px',
                              borderRadius: 8,
                              border: 'none',
                              background: joinPassword
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : '#e5e7eb',
                              color: joinPassword ? '#fff' : '#9ca3af',
                              fontWeight: 600,
                              fontSize: 14,
                              cursor: joinPassword ? 'pointer' : 'not-allowed',
                              transition: 'all 0.2s'
                            }}
                          >
                            Join
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            setJoiningListId(null);
                            setJoinPassword('');
                          }}
                          style={{
                            width: '100%',
                            marginTop: 12,
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid #e5e7eb',
                            background: '#fff',
                            color: '#6b7280',
                            fontWeight: 500,
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleJoinList(list.id, list.is_public)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 10,
                        border: 'none',
                        background: list.is_public
                          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                          : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={e => e.target.style.transform = 'translateY(-1px)'}
                      onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                    >
                      {list.is_public ? 'Join List' : 'Join with Password'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

