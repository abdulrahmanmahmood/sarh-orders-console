'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('agent@sarh.local');
  const [password, setPassword] = useState('SarhDemo2026!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!response.ok) throw new Error('Invalid email or password.');
      router.replace('/orders');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Login failed.'); }
    finally { setLoading(false); }
  }

  return <main className="shell"><form className="card form" onSubmit={submit}><p className="eyebrow">SARH Operations</p><h1>Sign in</h1>
    <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
    {error && <p className="error">{error}</p>}<button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
  </form></main>;
}

