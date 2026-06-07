import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Account() {
  const { user } = useAuth();
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

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Account</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-medium">Profile</h2>
        <div className="text-sm text-gray-600">
          <div className="flex justify-between py-1 border-b"><span>Name</span><span className="font-medium">{user?.name}</span></div>
          <div className="flex justify-between py-1"><span>Email</span><span className="font-medium">{user?.email}</span></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-medium">Telegram account link</h2>
        <p className="text-sm text-gray-500">Generate a 6-digit code and send it to the Family Budget Telegram bot.</p>
        {linkCode ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl font-mono font-bold tracking-widest text-blue-600">{linkCode}</span>
            <button onClick={generateCode} className="text-sm text-gray-500 hover:underline">Regenerate</button>
          </div>
        ) : (
          <button onClick={generateCode} disabled={generating}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {generating ? 'Generating…' : 'Generate code'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-medium">Password reset</h2>
        {!resetSent ? (
          <form onSubmit={sendReset} className="flex gap-2">
            <button type="submit" disabled={resetting}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
              {resetting ? 'Sending…' : 'Send reset email'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-green-600">Check your email for a reset link.</p>
        )}
      </div>
    </div>
  );
}
