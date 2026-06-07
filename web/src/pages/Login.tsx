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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-6 text-center">Family Budget</h1>

        {!resetting ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => setResetting(true)}
              className="w-full text-center text-sm text-blue-600 hover:underline"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-gray-600">Enter your email to receive a reset link.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="your@email.com"
            />
            {resetSent && (
              <p className="text-green-600 text-sm">Check your email for a reset link.</p>
            )}
            <button
              type="submit"
              disabled={busy || resetSent}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Send reset link
            </button>
            <button
              type="button"
              onClick={() => { setResetting(false); setResetSent(false); }}
              className="w-full text-center text-sm text-gray-500 hover:underline"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
