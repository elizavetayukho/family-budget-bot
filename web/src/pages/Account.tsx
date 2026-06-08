import { useState } from 'react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  const [linkCode, setLinkCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const res = await api.post<{ code: string }>('/account/telegram/generate-code');
      setLinkCode(res.code);
    } finally {
      setGenerating(false);
    }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetting(true);
    try {
      await api.post('/auth/reset-password/request', { email: user?.email });
      setResetSent(true);
    } finally {
      setResetting(false);
    }
  };

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-brand-100 p-5 space-y-3"
      style={{boxShadow:'0 2px 16px 0 rgba(124,58,237,0.07)'}}>
      {children}
    </div>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{children}</h2>
  );

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
      <h1 className="text-xl font-bold text-brand-900">Account</h1>

      <Card>
        <SectionTitle>Profile</SectionTitle>
        <div className="text-sm">
          <div className="flex justify-between py-2.5 border-b border-brand-50">
            <span className="text-gray-500">Name</span>
            <span className="font-semibold text-brand-900">{user?.name}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-gray-500">Email</span>
            <span className="font-semibold text-brand-900">{user?.email}</span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Telegram</SectionTitle>
        <p className="text-sm text-gray-600">Generate a 6-digit code and send it to the Family Budget bot to link your account.</p>
        {linkCode ? (
          <div className="flex items-center gap-4">
            <span className="text-4xl font-mono font-bold tracking-widest text-brand-700">{linkCode}</span>
            <button onClick={generateCode} className="text-sm text-gray-500 hover:text-brand-700 underline min-h-[44px]">
              Regenerate
            </button>
          </div>
        ) : (
          <button onClick={generateCode} disabled={generating}
            className="bg-brand-600 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 min-h-[44px] transition-colors">
            {generating ? 'Generating…' : 'Generate code'}
          </button>
        )}
      </Card>

      <Card>
        <SectionTitle>Sign out</SectionTitle>
        <button onClick={handleLogout}
          className="bg-red-50 text-red-600 border border-red-200 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-red-100 min-h-[44px] transition-colors w-full sm:w-auto">
          Sign out of Family Budget
        </button>
      </Card>

      <Card>
        <SectionTitle>Password</SectionTitle>
        {!resetSent ? (
          <form onSubmit={sendReset}>
            <button type="submit" disabled={resetting}
              className="bg-brand-50 text-brand-700 border border-brand-200 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-brand-100 disabled:opacity-50 min-h-[44px] transition-colors">
              {resetting ? 'Sending…' : 'Send password reset email'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-green-600 font-medium">Check your email for a reset link.</p>
        )}
      </Card>
    </div>
  );
}
