import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface Jar { id: number; name: string }
interface User { id: number; name: string }
interface Props {
  preselectedJarId?: number;
  editExpense?: {
    id: number; amountPln: number; originalAmount: number; originalCurrency: string;
    description?: string; date: string; jarId?: number;
  };
  onClose: () => void;
  onSaved: () => void;
}

const CURRENCIES = ['PLN', 'USD', 'EUR', 'BYN'];

export default function AddExpenseModal({ preselectedJarId, editExpense, onClose, onSaved }: Props) {
  const { addToast } = useToast();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [jars, setJars] = useState<Jar[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logAsUserId, setLogAsUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState(editExpense ? String(editExpense.originalAmount) : '');
  const [currency, setCurrency] = useState(editExpense?.originalCurrency ?? 'PLN');
  const [jarId, setJarId] = useState<number | null>(
    editExpense?.jarId ?? preselectedJarId ?? null
  );
  const [description, setDescription] = useState(editExpense?.description ?? '');
  const [date, setDate] = useState(
    editExpense ? editExpense.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [manualRate, setManualRate] = useState('');
  const [rateError, setRateError] = useState('');
  const [fetchedRate, setFetchedRate] = useState<number | null>(null);
  const [rateNeeded, setRateNeeded] = useState(false);
  const [noJarWarning, setNoJarWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Jar[]>('/jars').then(setJars);
    if (isAdmin) {
      api.get<{ users: User[] }>('/dashboard/summary').then(r => setUsers(r.users));
    }
  }, [isAdmin]);

  useEffect(() => {
    if (currency === 'PLN') { setRateNeeded(false); setRateError(''); return; }
    if (currency === 'BYN') { setRateNeeded(true); setRateError('No live BYN rate. Enter rate manually:'); return; }

    setRateNeeded(false);
    api.get<Record<string, { rate: number | null; error?: string }>>('/rates').then((rates) => {
      const r = rates[currency];
      if (r?.rate) { setFetchedRate(r.rate); setRateNeeded(false); }
      else { setRateNeeded(true); setRateError(`Couldn't fetch rate. Enter manually:`); }
    }).catch(() => { setRateNeeded(true); setRateError(`Couldn't fetch rate. Enter manually:`); });
  }, [currency]);

  const resolvedRate = (): number | null => {
    if (currency === 'PLN') return 1;
    if (manualRate) return parseFloat(manualRate);
    return fetchedRate;
  };

  const handleSave = async () => {
    const rate = resolvedRate();
    if (currency !== 'PLN' && !rate) { setError('Enter the exchange rate first.'); return; }

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { setError('Enter a valid amount.'); return; }

    if (!jarId && !noJarWarning) { setNoJarWarning(true); return; }

    setBusy(true);
    setError('');
    try {
      const amountPln = currency === 'PLN' ? amountNum : amountNum * rate!;
      const payload = {
        amountPln, originalAmount: amountNum, originalCurrency: currency,
        exchangeRate: currency !== 'PLN' ? rate : null,
        isManualRate: currency !== 'PLN' && !!manualRate,
        jarId: jarId ?? null, description: description || null, date,
        ...(isAdmin && logAsUserId ? { userId: logAsUserId } : {}),
      };

      if (editExpense) {
        await api.patch(`/expenses/${editExpense.id}`, payload);
        addToast('Expense updated', true);
      } else {
        await api.post('/expenses', payload);
        addToast('Expense saved', true);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editExpense) return;
    setBusy(true);
    try {
      await api.delete(`/expenses/${editExpense.id}`);
      addToast('Expense deleted', true);
      onSaved();
      onClose();
    } catch {
      setError("Couldn't delete. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 relative overflow-y-auto max-h-[96dvh] sm:max-h-[90vh]">
        {/* Mobile drag handle */}
        <div className="sm:hidden w-10 h-1 bg-brand-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-4">{editExpense ? 'Edit expense' : 'Add expense'}</h2>

        <div className="space-y-4">
          {isAdmin && !editExpense && users.length > 0 && (
            <div>
              <label className="block text-sm text-gray-500 font-medium mb-1.5">Log as</label>
              <div className="flex gap-2">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setLogAsUserId(logAsUserId === u.id ? null : u.id)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      logAsUserId === u.id
                        ? 'bg-brand-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-brand-200 hover:border-brand-400'
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
              {logAsUserId && (
                <p className="text-xs text-brand-600 mt-1">
                  Logging as {users.find(u => u.id === logAsUserId)?.name}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-gray-500 font-medium mb-1.5">Amount *</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="0.01"
                className="w-full border border-brand-200 rounded-lg px-3 py-3 text-base sm:text-sm" placeholder="0.00" inputMode="decimal" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 font-medium mb-1.5">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="border border-brand-200 rounded-xl px-3 py-2.5 text-sm">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {rateNeeded && (
            <div>
              <p className="text-sm font-medium text-amber-700 mb-1.5">{rateError}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">1 {currency} =</span>
                <input type="number" value={manualRate} onChange={(e) => setManualRate(e.target.value)}
                  className="w-28 border border-brand-200 rounded-lg px-3 py-3 text-base sm:text-sm" placeholder="0.00" inputMode="decimal" />
                <span className="text-sm text-gray-600">PLN</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-500 font-medium mb-1.5">Jar (optional)</label>
            <select value={jarId ?? ''} onChange={(e) => setJarId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-brand-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="">No jar</option>
              {jars.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-500 font-medium mb-1.5">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-brand-200 rounded-xl px-3 py-2.5 text-sm" placeholder="What was this for?" />
          </div>

          <div>
            <label className="block text-sm text-gray-500 font-medium mb-1.5">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-brand-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>

          {noJarWarning && !jarId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              This will be saved as uncategorised. You can assign a jar later.
              <div className="flex gap-2 mt-2">
                <button onClick={handleSave} disabled={busy} className="bg-amber-600 text-white px-3 py-1 rounded text-sm hover:bg-amber-700 disabled:opacity-50">
                  Save anyway
                </button>
                <button onClick={() => setNoJarWarning(false)} className="text-amber-700 text-sm hover:underline">Go back</button>
              </div>
            </div>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {!noJarWarning && (
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 border border-brand-200 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} disabled={busy}
                className="flex-1 bg-brand-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {editExpense && (
            <button onClick={handleDelete} disabled={busy}
              className="w-full text-red-500 text-sm hover:underline pt-1">
              Delete expense
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
