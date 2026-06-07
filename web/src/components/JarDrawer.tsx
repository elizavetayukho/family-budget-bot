import { useEffect, useState } from 'react';
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
  openingBalance: number;
}

interface Props {
  jar: JarInfo;
  onClose: () => void;
  onArchived: () => void;
  onRefresh: () => void;
}

export default function JarDrawer({ jar, onClose, onArchived, onRefresh }: Props) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Expense[]>(`/expenses?jarId=${jar.id}`).then(setExpenses);
  }, [jar.id]);

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

      {/* Drawer — slides from right on desktop, slides up from bottom on mobile */}
      <div className="fixed z-40 bg-white shadow-xl flex flex-col
        bottom-0 left-0 right-0 rounded-t-3xl max-h-[90dvh]
        sm:bottom-auto sm:top-0 sm:right-0 sm:left-auto sm:w-96 sm:h-full sm:rounded-none">
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 cursor-pointer" onClick={onClose}>
          <div className="w-10 h-1 bg-brand-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{jar.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl w-11 h-11 flex items-center justify-center">✕</button>
        </div>

        <div className="p-4 border-b space-y-3">
          {/* Combined balance */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total pool</p>
            <div className={`text-2xl font-bold ${jar.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {fmtPln(jar.balance)}
            </div>
            {jar.balance < 0 && (
              <p className="text-xs text-red-500 mt-0.5">{fmtPln(Math.abs(jar.balance))} over — carried to next month</p>
            )}
            <div className="mt-2 h-1.5 bg-brand-100 rounded-full overflow-hidden">
              <div className={`h-1.5 rounded-full ${jar.balance < 0 ? 'bg-red-400' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(100, jar.totalContribution > 0 ? (jar.totalSpending / jar.totalContribution) * 100 : 0)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{fmtPln(jar.totalSpending)} spent of {fmtPln(jar.totalContribution)} total</p>
            {jar.openingBalance !== 0 && (
              <p className={`text-xs mt-1 font-medium ${jar.openingBalance > 0 ? 'text-green-600' : 'text-red-500'}`}>
                Opening balance: {jar.openingBalance > 0 ? '+' : ''}{fmtPln(jar.openingBalance)}
              </p>
            )}
          </div>

          {/* Per-person breakdown */}
          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Your share</p>
            <div className={`text-lg font-semibold ${jar.myBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {fmtPln(jar.myBalance)}
            </div>
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Your contribution this month</span>
                <span className="font-medium text-gray-700">{fmtPln(jar.myContribution)}</span>
              </div>
              <div className="flex justify-between">
                <span>Your share of spending</span>
                <span className="font-medium text-red-500">−{fmtPln(jar.mySpendingShare)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="font-medium text-gray-700">Your remaining share</span>
                <span className={`font-semibold ${jar.myBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmtPln(jar.myBalance)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {expenses.length === 0 && <p className="text-sm text-gray-500">No expenses this month.</p>}
          {expenses.map((e) => (
            <button key={e.id} onClick={() => setEditingExpense(e)}
              className="w-full text-left flex items-center justify-between p-2 rounded hover:bg-brand-50 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description || '—'}</p>
                <p className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString('en-GB')} · {e.user.name}</p>
              </div>
              <span className={`text-sm font-medium shrink-0 ${e.amountPln < 0 ? 'text-red-600' : ''}`}>
                {fmtCurrency(e.originalAmount, e.originalCurrency, e.amountPln)}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t space-y-2">
          <button onClick={() => setAddingExpense(true)}
            className="w-full bg-brand-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-brand-700">
            + Add Expense
          </button>
          {user?.role === 'ADMIN' && !confirmArchive && (
            <button onClick={() => setConfirmArchive(true)}
              className="w-full bg-brand-50 border border-brand-200 text-brand-700 py-3 rounded-xl font-semibold text-sm hover:bg-brand-50">
              Archive jar
            </button>
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
