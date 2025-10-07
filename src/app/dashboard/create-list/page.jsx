// src/app/dashboard/create-list/page.jsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import fetchWithAuth from '../../../lib/fetchWithAuth';

export default function CreateList() {
  const router = useRouter();
  const session = getSession();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    password: '',
    isPublic: true,
    customTitle: '',
    customSubtitle: ''
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // Redirect if not authenticated
  if (!session) {
    router.push('/login');
    return <div />;
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setStatus({ type: 'error', message: 'List name is required' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetchWithAuth('/api/lists', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          password: formData.password || undefined,
          isPublic: formData.isPublic,
          customTitle: formData.customTitle.trim() || undefined,
          customSubtitle: formData.customSubtitle.trim() || undefined
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/lists/${data.list.id}`);
      } else {
        const error = await res.json();
        setStatus({ type: 'error', message: error.error || 'Failed to create list' });
      }
    } catch (err) {
      console.error('Error creating list:', err);
      setStatus({ type: 'error', message: 'Failed to create list' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push('/dashboard');
  };

  return (
    <div style={{
      padding: '32px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      maxWidth: 600,
      margin: '0 auto',
      background: '#fafbfc',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 32,
        gap: 16
      }}>
        <button
          onClick={handleCancel}
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
          ← Back
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
              Create List
            </h1>
            <div style={{
              color: '#6b7280',
              marginTop: 2,
              fontSize: 14
            }}>
              Set up your new word list
            </div>
          </div>
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

      {/* Create List Form */}
      <div style={{
        background: '#fff',
        border: 'none',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* List Name */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#1a1f36',
              marginBottom: 8
            }}>
              List Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter a name for your list"
              maxLength={100}
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
              {formData.name.length}/100 characters
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#1a1f36',
              marginBottom: 8
            }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe your list (optional)"
              maxLength={500}
              rows={4}
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
              {formData.description.length}/500 characters
            </div>
          </div>

          {/* Custom Title */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#1a1f36',
              marginBottom: 8
            }}>
              Custom Title (optional)
            </label>
            <input
              type="text"
              value={formData.customTitle}
              onChange={(e) => handleInputChange('customTitle', e.target.value)}
              placeholder="Custom title above submit button"
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
              {formData.customTitle.length}/200 characters • Leave empty for default "Submit a Word"
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
              Custom Subtitle (optional)
            </label>
            <textarea
              value={formData.customSubtitle}
              onChange={(e) => handleInputChange('customSubtitle', e.target.value)}
              placeholder="Custom subtitle below submit button"
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
              {formData.customSubtitle.length}/1000 characters • Leave empty for default help text
            </div>
          </div>

          {/* Privacy Settings */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#1a1f36',
              marginBottom: 8
            }}>
              Privacy
            </label>
            <div style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer'
              }}>
                <input
                  type="radio"
                  name="privacy"
                  checked={formData.isPublic}
                  onChange={() => handleInputChange('isPublic', true)}
                />
                <div>
                  <div style={{ fontWeight: 500, color: '#1a1f36' }}>Public</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Anyone can join</div>
                </div>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer'
              }}>
                <input
                  type="radio"
                  name="privacy"
                  checked={!formData.isPublic}
                  onChange={() => handleInputChange('isPublic', false)}
                />
                <div>
                  <div style={{ fontWeight: 500, color: '#1a1f36' }}>Private</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Password required or approval needed</div>
                </div>
              </label>
            </div>
          </div>

          {/* Password (only show if private) */}
          {!formData.isPublic && (
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#1a1f36',
                marginBottom: 8
              }}>
                Password (Optional)
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Set a password for your list"
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
                Leave empty to require approval for join requests
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            marginTop: 16
          }}>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                color: '#6b7280',
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => !loading && (e.target.style.background = '#f9fafb')}
              onMouseOut={e => e.target.style.background = '#ffffff'}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                background: loading || !formData.name.trim()
                  ? '#e5e7eb'
                  : 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)',
                color: loading || !formData.name.trim() ? '#9ca3af' : '#92400e',
                fontWeight: 600,
                fontSize: 15,
                cursor: loading || !formData.name.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: loading || !formData.name.trim()
                  ? 'none'
                  : '0 2px 8px rgba(251, 191, 36, 0.4)'
              }}
              onMouseOver={e => {
                if (!loading && formData.name.trim()) {
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseOut={e => e.target.style.transform = 'translateY(0)'}
            >
              {loading ? 'Creating...' : 'Create List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
