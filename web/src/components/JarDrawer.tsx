import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtPln, fmtCurrency } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import AddExpenseModal from './AddExpenseModal';

interface Expense {
  id: number; amountPln: number; originalAmount: number; originalCurrency: string;
  description?: string; date: string; jarId?: number;
  user: { id: number; name: string };
  jar?: { id: number; name: string };
}

interface JarInfo {
  id: number; name: string; balance: number; percent: number;
  totalContribution: number; totalSpending: number;
  myContribution: number; mySpendingShare: number; myBalance: number;
  openingBalance: number; isPersonal: boolean;
}

interface Props {
  jar: JarInfo;
  onClose: () => void;
  onArchived: () => void;
  onRefresh: () => void;
}

interface Transfer {
  id: number;
  fromUser: { id: number; name: string };
  toUser: { id: number; name: string };
  amountPln: number;
  note?: string;
  date: string;
}

interface TopUp {
  id: number;
  user: { id: number; name: string };
  amountPln: number;
  note?: string;
  date: string;
}

export default function JarDrawer({ jar, onClose, onArchived, onRefresh }: Props) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [topUps, setTopUps] = useState<TopUp[]>([]);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpNote, setTopUpNote] = useState('');
  const [topUpUserId, setTopUpUserId] = useState<number | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferFromMe, setTransferFromMe] = useState(true); // true = me→other, false = other→me (admin only)
  const [otherUser, setOtherUser] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareExpanded, setShareExpanded] = useState(false);

  const month = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const loadData = () => {
    api.get<Expense[]>(`/expenses?jarId=${jar.id}`).then(setExpenses);
    api.get<Transfer[]>(`/transfers?jarId=${jar.id}&month=${month}`).then(setTransfers);
    api.get<TopUp[]>(`/top-ups?jarId=${jar.id}&month=${month}`).then(setTopUps);
  };

  useEffect(() => {
    loadData();
    if (!user?.id) return;
    api.get<{ users: { id: number; name: string; role: string }[] }>('/dashboard/summary')
      .then(s => {
        const other = s.users.find(u => u.id !== user.id);
        if (other) setOtherUser({ id: other.id, name: other.name });
      });
  }, [jar.id, user?.id]);

  const handleTransfer = async () => {
    if (!otherUser || !transferAmount || parseFloat(transferAmount) <= 0) return;
    setBusy(true);
    try {
      const fromId = transferFromMe ? user!.id : otherUser.id;
      const toId = transferFromMe ? otherUser.id : user!.id;
      await api.post('/transfers', {
        fromUserId: fromId,
        toUserId: toId,
        jarId: jar.id,
        amountPln: parseFloat(transferAmount),
        note: transferNote || null,
      });
      const fromName = transferFromMe ? 'your' : `${otherUser.name}'s`;
      addToast(`Transferred ${fmtPln(parseFloat(transferAmount))} from ${fromName} share`, true);
      setShowTransfer(false);
      setTransferAmount('');
      setTransferNote('');
      setTransferFromMe(true);
      loadData();
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleTopUp = async () => {
    if (!topUpAmount || parseFloat(topUpAmount) <= 0) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        jarId: jar.id,
        amountPln: parseFloat(topUpAmount),
        note: topUpNote || null,
      };
      if (topUpUserId && user?.role === 'ADMIN') body.userId = topUpUserId;
      await api.post('/top-ups', body);
      addToast(`Added ${fmtPln(parseFloat(topUpAmount))} to ${jar.name}`, true);
      setShowTopUp(false);
      setTopUpAmount('');
      setTopUpNote('');
      setTopUpUserId(null);
      loadData();
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTopUp = async (id: number) => {
    setBusy(true);
    try {
      await api.delete(`/top-ups/${id}`);
      loadData();
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    setBusy(true);
    try {
      await api.post(`/jars/${jar.id}/archive`);
      addToast('Jar archived. Balance moves to Personal at next reset.', true);
      onArchived();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} />

      {/* Drawer — full height on mobile, right panel on desktop */}
      <div className="fixed z-40 bg-white shadow-xl flex flex-col
        inset-0 sm:inset-auto sm:top-0 sm:right-0 sm:bottom-0 sm:w-96">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-base font-semibold text-brand-900">{jar.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl w-10 h-10 flex items-center justify-center">✕</button>
        </div>

        {/* Compact info strip — two numbers side by side, expandable breakdown */}
        <div className="border-b">
          {/* Summary row */}
          <div className="px-4 py-3 flex items-center gap-6">
            <div className="flex-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Pool</p>
              <span className={`text-xl font-bold tabular-nums ${jar.balance < 0 ? 'text-red-600' : 'text-brand-900'}`}>
                {fmtPln(jar.balance)}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Your share</p>
              <span className={`text-xl font-bold tabular-nums ${jar.myBalance < 0 ? 'text-red-600' : 'text-brand-900'}`}>
                {fmtPln(jar.myBalance)}
              </span>
            </div>
            <button onClick={() => setShareExpanded(v => !v)}
              className="text-gray-400 hover:text-brand-600 text-xs font-medium flex items-center gap-1 shrink-0">
              {shareExpanded ? '▲' : '▼'}
            </button>
          </div>

          {/* Progress bar always visible */}
          <div className="px-4 pb-2">
            <div className="h-1.5 bg-brand-100 rounded-full overflow-hidden">
              <div className={`h-1.5 rounded-full transition-all ${jar.balance < 0 ? 'bg-red-400' : 'bg-brand-500'}`}
                style={{ width: `${Math.min(100, jar.totalContribution > 0 ? (jar.totalSpending / jar.totalContribution) * 100 : 0)}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{fmtPln(jar.totalSpending)} spent of {fmtPln(jar.totalContribution)}</p>
          </div>

          {/* Expandable breakdown */}
          {shareExpanded && (
            <div className="px-4 pb-3 border-t pt-3 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Your contribution</span>
                <span className="font-medium text-gray-700">{fmtPln(jar.myContribution)}</span>
              </div>
              <div className="flex justify-between">
                <span>Your spending</span>
                <span className="font-medium text-red-500">−{fmtPln(jar.mySpendingShare)}</span>
              </div>
              {jar.openingBalance !== 0 && (
                <div className="flex justify-between">
                  <span>Opening balance</span>
                  <span className={`font-medium ${jar.openingBalance > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {jar.openingBalance > 0 ? '+' : ''}{fmtPln(jar.openingBalance)}
                  </span>
                </div>
              )}
              {jar.balance < 0 && (
                <p className="text-red-400 pt-1">{fmtPln(Math.abs(jar.balance))} over — carried to next month</p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Transfers this month */}
          {transfers.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transfers</p>
              {transfers.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-xl bg-brand-50 mb-1">
                  <div className="text-xs">
                    <span className="font-semibold text-brand-900">{t.fromUser.name}</span>
                    <span className="text-gray-500"> → </span>
                    <span className="font-semibold text-brand-900">{t.toUser.name}</span>
                    {t.note && <span className="text-gray-500"> · {t.note}</span>}
                  </div>
                  <span className="text-sm font-semibold text-brand-700">{fmtPln(Number(t.amountPln))}</span>
                </div>
              ))}
            </div>
          )}

          {/* Transfer form */}
          {showTransfer && otherUser && (
            <div className="bg-brand-50 rounded-2xl p-3 mb-3 space-y-2">
              <p className="text-xs font-semibold text-brand-900">Transfer share</p>
              {user?.role === 'ADMIN' && (
                <div className="flex gap-2">
                  <button onClick={() => setTransferFromMe(true)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${transferFromMe ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-brand-200 hover:bg-brand-50'}`}>
                    My share → {otherUser.name}
                  </button>
                  <button onClick={() => setTransferFromMe(false)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${!transferFromMe ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-brand-200 hover:bg-brand-50'}`}>
                    {otherUser.name} → My share
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="number" inputMode="decimal" value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)}
                  placeholder="Amount PLN" min="0" step="0.01"
                  className="flex-1 bg-white border border-brand-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <input value={transferNote} onChange={e => setTransferNote(e.target.value)}
                placeholder="Note (optional)" maxLength={80}
                className="w-full bg-white border border-brand-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <div className="flex gap-2">
                <button onClick={handleTransfer} disabled={busy || !transferAmount || parseFloat(transferAmount) <= 0}
                  className="flex-1 bg-brand-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  {busy ? 'Sending…' : `Transfer ${transferAmount ? fmtPln(parseFloat(transferAmount)) : ''}`}
                </button>
                <button onClick={() => { setShowTransfer(false); setTransferAmount(''); setTransferNote(''); setTransferFromMe(true); }}
                  className="px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-white border border-brand-200">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Top-ups this month */}
          {topUps.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Extra contributions</p>
              {topUps.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-xl bg-green-50 mb-1">
                  <div className="text-xs flex-1 min-w-0">
                    <span className="font-semibold text-green-900">{t.user.name}</span>
                    {t.note && <span className="text-gray-500"> · {t.note}</span>}
                    <span className="text-gray-400 ml-1">· {new Date(t.date).toLocaleDateString('en-GB')}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-green-700">+{fmtPln(Number(t.amountPln))}</span>
                    {(t.user.id === user?.id || user?.role === 'ADMIN') && (
                      <button onClick={() => handleDeleteTopUp(t.id)} disabled={busy}
                        className="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top-up form */}
          {showTopUp && (
            <div className="bg-green-50 rounded-2xl p-3 mb-3 space-y-2">
              <p className="text-xs font-semibold text-green-900">Add extra contribution to {jar.name}</p>
              {user?.role === 'ADMIN' && otherUser && (
                <div className="flex gap-2">
                  <button onClick={() => setTopUpUserId(null)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${topUpUserId === null ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-green-200 hover:bg-green-50'}`}>
                    Mine
                  </button>
                  <button onClick={() => setTopUpUserId(otherUser.id)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${topUpUserId !== null ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-green-200 hover:bg-green-50'}`}>
                    {otherUser.name}'s
                  </button>
                </div>
              )}
              <input type="number" inputMode="decimal" value={topUpAmount}
                onChange={e => setTopUpAmount(e.target.value)}
                placeholder="Amount PLN" min="0" step="0.01"
                className="w-full bg-white border border-green-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input value={topUpNote} onChange={e => setTopUpNote(e.target.value)}
                placeholder="Note — e.g. cash reimbursement (optional)" maxLength={80}
                className="w-full bg-white border border-green-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <div className="flex gap-2">
                <button onClick={handleTopUp} disabled={busy || !topUpAmount || parseFloat(topUpAmount) <= 0}
                  className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {busy ? 'Saving…' : `Add ${topUpAmount ? fmtPln(parseFloat(topUpAmount)) : ''}`}
                </button>
                <button onClick={() => { setShowTopUp(false); setTopUpAmount(''); setTopUpNote(''); setTopUpUserId(null); }}
                  className="px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-white border border-green-200">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {expenses.length === 0 && transfers.length === 0 && topUps.length === 0 && (
            <p className="text-sm text-gray-500">No activity this month.</p>
          )}
          {expenses.map((e) => (
            <button key={e.id} onClick={() => setEditingExpense(e)}
              className="w-full text-left flex items-center justify-between p-2 rounded-lg hover:bg-brand-50 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description || '—'}</p>
                <p className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString('en-GB')} · {e.user.name}</p>
              </div>
              <span className={`text-sm font-medium shrink-0 ${e.amountPln < 0 ? 'text-red-600' : ''}`}>
                {fmtCurrency(e.originalAmount, e.originalCurrency, e.amountPln)}
              </span>
            </button>
          ))}

          {/* Full history link */}
          <Link to={`/history?jarId=${jar.id}`} onClick={onClose}
            className="flex items-center justify-center gap-1 py-2 text-xs font-medium text-brand-500 hover:text-brand-700 transition-colors">
            View full history →
          </Link>
        </div>

        {/* Footer — primary action full-width, secondary actions in a compact row */}
        <div className="p-3 border-t space-y-2">
          <button onClick={() => setAddingExpense(true)}
            className="w-full bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors">
            + Add expense
          </button>
          {/* Secondary actions row */}
          {!showTopUp && !showTransfer && (
            <div className="flex gap-2">
              {!showTopUp && (
                <button onClick={() => { setShowTopUp(true); setShowTransfer(false); }}
                  className="flex-1 bg-green-50 border border-green-200 text-green-700 py-2 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors">
                  + Contribution
                </button>
              )}
              {!jar.isPersonal && otherUser && (
                <button onClick={() => { setShowTransfer(true); setShowTopUp(false); }}
                  className="flex-1 bg-brand-50 border border-brand-200 text-brand-700 py-2 rounded-xl text-xs font-semibold hover:bg-brand-100 transition-colors">
                  Transfer
                </button>
              )}
              {user?.role === 'ADMIN' && (
                <button onClick={() => setConfirmArchive(true)}
                  className="bg-brand-50 border border-brand-200 text-brand-700 py-2 px-3 rounded-xl text-xs font-semibold hover:bg-brand-100 transition-colors">
                  Archive
                </button>
              )}
            </div>
          )}
          {confirmArchive && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800">
              Archiving {jar.name}. Remaining balance of {fmtPln(jar.balance)} will move to your Personal jar at next reset. Past transactions stay in history.
              <div className="flex gap-2 mt-2">
                <button onClick={handleArchive} disabled={busy}
                  className="bg-amber-600 text-white px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">Archive jar</button>
                <button onClick={() => setConfirmArchive(false)} className="text-amber-700 text-sm hover:underline">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {addingExpense && (
        <AddExpenseModal
          preselectedJarId={jar.id}
          onClose={() => setAddingExpense(false)}
          onSaved={() => { api.get<Expense[]>(`/expenses?jarId=${jar.id}`).then(setExpenses); onRefresh(); }}
        />
      )}
      {editingExpense && (
        <AddExpenseModal
          editExpense={{ ...editingExpense, date: editingExpense.date.slice(0, 10), jarId: editingExpense.jarId }}
          onClose={() => setEditingExpense(null)}
          onSaved={() => { api.get<Expense[]>(`/expenses?jarId=${jar.id}`).then(setExpenses); onRefresh(); }}
        />
      )}
    </>
  );
}
