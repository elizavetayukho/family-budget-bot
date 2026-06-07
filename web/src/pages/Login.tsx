import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch {
      setError('Wrong email or password.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/reset-password/request', { email });
      setResetSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #EDE9FE 0%, #F5F3FF 50%, #FCE7F3 100%)' }}>
      {/* Decorative blobs */}
      <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, #A78BFA, #7C3AED)' }} />
      <div className="absolute bottom-[-60px] left-[-60px] w-56 h-56 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #EC4899, #A78BFA)' }} />

      <div className="relative bg-white/80 backdrop-blur-md rounded-3xl shadow-[0_2px_16px_0_rgba(124,58,237,0.07)] p-8 w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl gradient-card flex items-center justify-center mb-3">
            <span className="text-white font-bold text-lg">FB</span>
          </div>
          <h1 className="text-xl font-bold text-brand-900">Family Budget</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back</p>
        </div>

        {!resetting ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-brand-50 border border-brand-100 rounded-xl px-4 py-2.5 text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full bg-brand-50 border border-brand-100 rounded-xl px-4 py-2.5 text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent" />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full gradient-card text-white py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 mt-2">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => setResetting(true)}
              className="w-full text-center text-sm text-brand-500 hover:text-brand-700">
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-brand-600">Enter your email to receive a reset link.</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-brand-50 border border-brand-100 rounded-xl px-4 py-2.5 text-sm" placeholder="your@email.com" />
            {resetSent && <p className="text-green-600 text-sm">Check your email for a reset link.</p>}
            <button type="submit" disabled={busy || resetSent}
              className="w-full gradient-card text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50">
              Send reset link
            </button>
            <button type="button" onClick={() => { setResetting(false); setResetSent(false); }}
              className="w-full text-center text-sm text-gray-500 hover:text-brand-700">
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
