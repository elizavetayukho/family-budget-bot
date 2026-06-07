import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtPln, fmtMonth } from '../lib/format';
import { useToast } from '../context/ToastContext';
import AddExpenseModal from '../components/AddExpenseModal';
import JarDrawer from '../components/JarDrawer';

interface PersonResult {
  userId: number; name: string; income: number; incomeSource: string;
  overheadShare: number; personalDeductions: number; discretionary: number;
  jarContributions: Record<number, number>; personalJarBalance: number;
}

interface JarBalance {
  id: number; name: string; percent: number; isPersonal: boolean; isFood: boolean;
  balance: number; totalContribution: number; totalSpending: number; carryForward: number;
  myContribution: number; mySpendingShare: number; myBalance: number;
  openingBalance: number;
}

interface DashboardState {
  month: string; lizaveta: PersonResult; edgar: PersonResult;
  sharedJars: JarBalance[]; uncategorisedCount: number;
}

interface Snapshot { month: string; carryForwards: { name: string; amount: number }[] }

export default function Dashboard() {
  const { addToast } = useToast();
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExpense, setShowExpense] = useState(false);
  const [activeJar, setActiveJar] = useState<JarBalance | null>(null);
  const [incomeExpanded, setIncomeExpanded] = useState(false);
  const [nettoInput, setNettoInput] = useState('');
  const [savingNetto, setSavingNetto] = useState(false);
  const [resetCard, setResetCard] = useState<Snapshot | null>(null);
  const [resetDismissed, setResetDismissed] = useState(
    () => localStorage.getItem('resetDismissed') === new Date().toISOString().slice(0, 7)
  );

  const load = useCallback(async () => {
    try {
      const data = await api.get<DashboardState>('/dashboard');
      setState(data);

      // Check for reset summary card
      const snapRes = await api.get<{ id: number; month: string }[]>('/history/snapshots').catch(() => []);
      if (snapRes.length > 0) {
        const latest = snapRes[0];
        if (latest.month !== data.month) {
          const snap = await api.get<Snapshot & { carryForwards: { jarId: number; amount: number; name: string }[] }>(`/history/snapshots/${latest.month}`).catch(() => null);
          if (snap) {
            const nonZero = snap.carryForwards.filter((c) => Number(c.amount) !== 0);
            if (nonZero.length > 0) setResetCard({ month: snap.month, carryForwards: nonZero.map((c) => ({ name: c.name, amount: Number(c.amount) })) });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveNetto = async () => {
    if (!nettoInput) return;
    setSavingNetto(true);
    try {
      await api.post('/income/netto', { netto: parseFloat(nettoInput) });
      addToast('Netto saved', true);
      setNettoInput('');
      load();
    } finally {
      setSavingNetto(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!state) return <div className="p-8 text-red-500">Failed to load dashboard.</div>;

  const requesterPerson = state.lizaveta; // will show the correct person based on JWT
  const isEstimated = requesterPerson.incomeSource === 'estimated';
  const isBrutto = requesterPerson.incomeSource === 'brutto';

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
      {/* Month heading + Add expense (desktop only — FAB handles mobile) */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-brand-900">{fmtMonth(state.month)}</h1>
        <button onClick={() => setShowExpense(true)}
          className="hidden sm:block bg-brand-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-brand-700 transition-colors">
          + Add expense
        </button>
      </div>

      {/* Mobile FAB */}
      <button onClick={() => setShowExpense(true)}
        className="sm:hidden fixed bottom-20 right-4 z-30 w-14 h-14 gradient-card rounded-full shadow-lg flex items-center justify-center text-white text-2xl font-light"
        aria-label="Add expense">
        +
      </button>

      {/* Reset summary card */}
      {resetCard && !resetDismissed && (
        <div className="bg-brand-100 rounded-2xl p-4 flex items-start justify-between">
          <p className="text-sm text-brand-700 font-medium">
            {resetCard.month} wrapped.{' '}
            {resetCard.carryForwards.map((c, i) => (
              <span key={i}>
                {c.name} <span className={c.amount > 0 ? 'text-green-700' : 'text-red-500'}>
                  {c.amount > 0 ? '+' : ''}{c.amount.toFixed(2)} PLN
                </span>
                {i < resetCard.carryForwards.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
          <button onClick={() => { setResetDismissed(true); localStorage.setItem('resetDismissed', new Date().toISOString().slice(0, 7)); }}
            className="text-gray-500 hover:text-brand-700 ml-4 shrink-0">✕</button>
        </div>
      )}

      {/* Uncategorised prompt */}
      {state.uncategorisedCount > 0 && (
        <Link to="/history?uncategorised=true"
          className="block bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          ⚠ {state.uncategorisedCount} expense{state.uncategorisedCount > 1 ? 's' : ''} need a jar →
        </Link>
      )}

      {/* Income strip */}
      <div className="bg-white rounded-2xl" style={{boxShadow:"0 2px 16px 0 rgba(124,58,237,0.07)"}}>
        <button onClick={() => setIncomeExpanded(!incomeExpanded)}
          className="w-full flex items-center justify-between p-5 text-left">
          <div className="flex gap-10">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lizaveta</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-brand-900">{fmtPln(state.lizaveta.income)}</span>
                {(state.lizaveta.incomeSource === 'estimated' || state.lizaveta.incomeSource === 'brutto') && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {state.lizaveta.incomeSource === 'estimated' ? 'Estimated' : 'Brutto'}
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Edgar</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-brand-900">{fmtPln(state.edgar.income)}</span>
                {(state.edgar.incomeSource === 'estimated' || state.edgar.incomeSource === 'brutto') && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {state.edgar.incomeSource === 'estimated' ? 'Estimated' : 'Brutto'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="text-gray-400 text-sm">{incomeExpanded ? '▲' : '▼'}</span>
        </button>

        {(isEstimated || isBrutto) && (
          <div className="px-4 sm:px-5 pb-4 flex items-center gap-2">
            <input type="number" inputMode="decimal" value={nettoInput} onChange={(e) => setNettoInput(e.target.value)}
              className="bg-brand-50 border border-brand-200 rounded-xl px-3 py-2.5 text-base sm:text-sm flex-1 sm:flex-none sm:w-36 focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="Enter netto" />
            <span className="text-sm text-gray-500">PLN</span>
            <button onClick={saveNetto} disabled={savingNetto || !nettoInput}
              className="bg-brand-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 min-h-[44px]">
              Save
            </button>
          </div>
        )}

        {incomeExpanded && (
          <div className="px-5 pb-5 border-t border-brand-50 pt-4 grid grid-cols-2 gap-6 text-sm">
            {([['Lizaveta', state.lizaveta], ['Edgar', state.edgar]] as [string, PersonResult][]).map(([name, p]) => (
              <div key={name}>
                <p className="font-semibold text-brand-900 mb-2">{name}</p>
                <div className="space-y-1 text-gray-500">
                  <div className="flex justify-between"><span>Income</span><span className="text-brand-900 font-medium">{fmtPln(p.income)}</span></div>
                  <div className="flex justify-between"><span>Overheads (50%)</span><span className="text-red-400">−{fmtPln(p.overheadShare)}</span></div>
                  {p.personalDeductions > 0 && <div className="flex justify-between"><span>Deductions</span><span className="text-red-400">−{fmtPln(p.personalDeductions)}</span></div>}
                  <div className="flex justify-between font-semibold border-t border-brand-100 pt-1 text-brand-900"><span>Discretionary</span><span>{fmtPln(p.discretionary)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared jar cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {state.sharedJars.map((jar, idx) => {
          const spendPct = jar.totalContribution > 0 ? Math.min(100, (jar.totalSpending / jar.totalContribution) * 100) : 0;
          const isFeatured = idx === 0;
          return (
            <button key={jar.id} onClick={() => setActiveJar(jar)}
              className={`rounded-2xl p-5 text-left transition-all hover:shadow-lg ${
                isFeatured ? 'gradient-card text-white' : 'card'
              }`}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isFeatured ? 'text-white' : 'text-xs font-semibold text-gray-500 uppercase tracking-wide'}`}>
                {jar.name}
              </p>
              <p className={`text-2xl font-bold tabular-nums ${jar.balance < 0 ? (isFeatured ? 'text-red-200' : 'text-red-500') : (isFeatured ? 'text-white' : 'text-brand-900')}`}>
                {fmtPln(jar.balance)}
              </p>
              {jar.balance < 0 && (
                <p className={`text-xs mt-0.5 ${isFeatured ? 'text-red-200' : 'text-red-400'}`}>over — carried forward</p>
              )}
              <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${isFeatured ? 'bg-white/20' : 'bg-brand-100'}`}>
                <div className={`h-1.5 rounded-full transition-all ${jar.balance < 0 ? 'bg-red-400' : (isFeatured ? 'bg-white' : 'bg-brand-500')}`}
                  style={{ width: `${spendPct}%` }} />
              </div>
              <p className={`text-xs mt-2 ${isFeatured ? 'text-white/90' : 'text-gray-500'}`}>
                Your share: <span className={isFeatured ? 'text-white font-medium' : (jar.myBalance < 0 ? 'text-red-400 font-medium' : 'text-brand-600 font-medium')}>{fmtPln(jar.myBalance)}</span>
              </p>
              {jar.carryForward !== 0 && (
                <p className={`text-xs mt-1 font-medium ${jar.carryForward > 0 ? (isFeatured ? 'text-green-200' : 'text-green-600') : (isFeatured ? 'text-red-200' : 'text-red-400')}`}>
                  {jar.carryForward > 0 ? '+' : ''}{fmtPln(jar.carryForward)} from last month
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Personal jar */}
      <div className="gradient-card rounded-2xl p-5 text-white">
        <p className="text-xs font-medium text-white uppercase tracking-wide mb-1">Personal jar</p>
        <p className="text-3xl font-bold tabular-nums text-white">{fmtPln(requesterPerson.personalJarBalance)}</p>
        <p className="text-xs text-white/80 mt-1">Only visible to you</p>
      </div>

      {showExpense && (
        <AddExpenseModal onClose={() => setShowExpense(false)} onSaved={load} />
      )}

      {activeJar && (
        <JarDrawer
          jar={activeJar}
          onClose={() => setActiveJar(null)}
          onArchived={() => { setActiveJar(null); load(); }}
          onRefresh={load}
        />
      )}
    </div>
  );
}
