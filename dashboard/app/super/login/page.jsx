'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SuperLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/super/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login gagal');
      localStorage.setItem('super_token', data.token);
      router.push('/super');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Mono', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card { background: #111118; border: 1px solid #222230; border-radius: 16px; padding: 48px; width: 100%; max-width: 420px; }
        .badge { display: inline-block; background: #ff3c3c22; border: 1px solid #ff3c3c55; color: #ff6b6b; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; padding: 4px 12px; border-radius: 4px; margin-bottom: 24px; }
        h1 { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 6px; }
        .sub { color: #555; font-size: 13px; margin-bottom: 36px; }
        label { display: block; color: #666; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
        input { width: 100%; background: #0d0d14; border: 1px solid #222230; border-radius: 8px; padding: 12px 16px; color: #fff; font-family: 'DM Mono', monospace; font-size: 14px; outline: none; transition: border-color 0.2s; }
        input:focus { border-color: #ff3c3c66; }
        .field { margin-bottom: 20px; }
        .error { background: #ff3c3c15; border: 1px solid #ff3c3c44; color: #ff6b6b; font-size: 13px; padding: 10px 14px; border-radius: 8px; margin-bottom: 20px; }
        button { width: 100%; background: #ff3c3c; color: #fff; border: none; border-radius: 8px; padding: 14px; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; transition: opacity 0.2s, transform 0.1s; letter-spacing: 0.5px; margin-top: 8px; }
        button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .back { text-align: center; margin-top: 20px; color: #444; font-size: 12px; }
        .back a { color: #666; text-decoration: none; }
        .back a:hover { color: #ff6b6b; }
      `}</style>

      <div className="card">
        <div className="badge">⚡ SUPER ADMIN</div>
        <h1>Control Panel</h1>
        <p className="sub">Akses khusus pengelola platform</p>

        {error && <div className="error">⚠️ {error}</div>}

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="super@admin.com"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Authenticating...' : 'MASUK →'}
          </button>
        </form>

        <div className="back">
          <a href="/login">← Kembali ke Admin Login</a>
        </div>
      </div>
    </div>
  );
}