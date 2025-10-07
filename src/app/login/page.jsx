'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setMsg(null);
    if (!name.trim()) return setMsg({ type: 'error', text: 'Name required' });
    if (!password) return setMsg({ type: 'error', text: 'Password required' });
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: 'error', text: body.error || 'Invalid credentials' });
      } else {
        // save token locally (temporary) and redirect
        saveSession(body.token, body.user?.name || name.trim());
        router.push('/dashboard');
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: 'Network or server error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', minHeight: '100vh', background: 'linear-gradient(135deg, #fef3c7 0%, #fde047 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <main style={{ maxWidth: 460, width: '100%', background: '#fff', padding: 40, borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#92400e', fontSize: 32, fontWeight: 700, boxShadow: '0 4px 12px rgba(251, 191, 36, 0.4)' }}>S</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#1a1f36', marginBottom: 8 }}>Welcome Back</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 15 }}>Sign in to The S Lists</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'grid', gap: 18 }}>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 14, marginBottom: 8, color: '#374151', fontWeight: 600 }}>Username</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={50}
              autoComplete="username"
              aria-label="Name"
              suppressHydrationWarning
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', width: '100%', fontSize: 15, outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
              onFocus={e => { e.target.style.border = '1px solid #fbbf24'; e.target.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.15)' }}
              onBlur={e => { e.target.style.border = '1px solid #e5e7eb'; e.target.style.boxShadow = 'none' }}
            />
          </label>

          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 14, marginBottom: 8, color: '#374151', fontWeight: 600 }}>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              type="password"
              autoComplete="current-password"
              aria-label="Password"
              suppressHydrationWarning
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', width: '100%', fontSize: 15, outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
              onFocus={e => { e.target.style.border = '1px solid #fbbf24'; e.target.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.15)' }}
              onBlur={e => { e.target.style.border = '1px solid #e5e7eb'; e.target.style.boxShadow = 'none' }}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <button
              aria-busy={loading}
              disabled={loading}
              type="submit"
              style={{ padding: '14px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #fde047 0%, #fbbf24 100%)', color: '#92400e', border: 'none', cursor: loading ? 'default' : 'pointer', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(251, 191, 36, 0.4)', transition: 'all 0.2s' }}
              onMouseOver={e => { if (!loading) e.target.style.transform = 'translateY(-2px)' }}
              onMouseOut={e => e.target.style.transform = 'translateY(0)'}
            >
              {loading ? 'Signing in…' : 'Login'}
            </button>
            <button type="button" onClick={() => router.push('/register')} style={{ padding: '14px 16px', borderRadius: 10, border: 'none', background: '#f3f4f6', color: '#6b7280', cursor: 'pointer', fontWeight: 600, fontSize: 15, transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#e5e7eb'} onMouseOut={e => e.target.style.background = '#f3f4f6'}>
              Create Account
            </button>
          </div>

          <div aria-live="polite" style={{ minHeight: 28, marginTop: 8 }}>
            {msg && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4', color: msg.type === 'error' ? '#dc2626' : '#16a34a', border: `1px solid ${msg.type === 'error' ? '#fecaca' : '#bbf7d0'}`, fontSize: 14, fontWeight: 500 }}>
                {msg.text}
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
