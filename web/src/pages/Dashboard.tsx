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
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      {/* Month heading */}
      <h1 className="text-xl font-semibold text-gray-800">{fmtMonth(state.month)}</h1>

      {/* Reset summary card */}
      {resetCard && !resetDismissed && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start justify-between">
          <div>
            <p className="font-medium text-blue-800 text-sm">
              {resetCard.month} wrapped.{' '}
              {resetCard.carryForwards.map((c, i) => (
                <span key={i}>
                  {c.name} <span className={c.amount > 0 ? 'text-green-700' : 'text-red-600'}>
                    {c.amount > 0 ? '+' : ''}{c.amount.toFixed(2)} PLN carried forward
                  </span>
                  {i < resetCard.carryForwards.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </p>
          </div>
          <button onClick={() => { setResetDismissed(true); localStorage.setItem('resetDismissed', new Date().toISOString().slice(0, 7)); }}
            className="text-blue-400 hover:text-blue-600 ml-4">✕</button>
        </div>
      )}

      {/* Uncategorised prompt */}
      {state.uncategorisedCount > 0 && (
        <Link to="/history?uncategorised=true"
          className="block bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 hover:bg-amber-100">
          {state.uncategorisedCount} expense{state.uncategorisedCount > 1 ? 's' : ''} need a jar →
        </Link>
      )}

      {/* Income strip */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <button onClick={() => setIncomeExpanded(!incomeExpanded)}
          className="w-full flex items-center justify-between p-4 text-left">
          <div className="flex gap-8">
            <div>
              <span className="text-xs text-gray-500">Lizaveta</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{fmtPln(state.lizaveta.income)}</span>
                {(state.lizaveta.incomeSource === 'estimated' || state.lizaveta.incomeSource === 'brutto') && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    {state.lizaveta.incomeSource === 'estimated' ? 'Estimated' : 'Based on brutto (first month)'}
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500">Edgar</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{fmtPln(state.edgar.income)}</span>
                {(state.edgar.incomeSource === 'estimated' || state.edgar.incomeSource === 'brutto') && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    {state.edgar.incomeSource === 'estimated' ? 'Estimated' : 'Based on brutto'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="text-gray-400 text-sm">{incomeExpanded ? '▲' : '▼'}</span>
        </button>

        {(isEstimated || isBrutto) && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <input type="number" value={nettoInput} onChange={(e) => setNettoInput(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36" placeholder="Enter netto" />
            <span className="text-sm text-gray-500">PLN</span>
            <button onClick={saveNetto} disabled={savingNetto || !nettoInput}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              Save
            </button>
          </div>
        )}

        {incomeExpanded && (
          <div className="px-4 pb-4 border-t pt-3 grid grid-cols-2 gap-4 text-sm">
            {([['Lizaveta', state.lizaveta], ['Edgar', state.edgar]] as [string, PersonResult][]).map(([name, p]) => (
              <div key={name}>
                <p className="font-medium text-gray-700 mb-2">{name}</p>
                <div className="space-y-1 text-gray-600">
                  <div className="flex justify-between"><span>Income</span><span>{fmtPln(p.income)}</span></div>
                  <div className="flex justify-between"><span>Overheads (50%)</span><span className="text-red-500">−{fmtPln(p.overheadShare)}</span></div>
                  {p.personalDeductions > 0 && <div className="flex justify-between"><span>Personal deductions</span><span className="text-red-500">−{fmtPln(p.personalDeductions)}</span></div>}
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Discretionary</span><span>{fmtPln(p.discretionary)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add expense button */}
      <div className="flex justify-end">
        <button onClick={() => setShowExpense(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add expense
        </button>
      </div>

      {/* Shared jar cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {state.sharedJars.map((jar) => (
          <button key={jar.id} onClick={() => setActiveJar(jar)}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-left hover:shadow-md transition-shadow">
            <p className="text-sm font-medium text-gray-700">{jar.name}</p>
            <p className={`text-xl font-bold mt-1 ${jar.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {fmtPln(jar.balance)}
            </p>
            {jar.balance < 0 && (
              <p className="text-xs text-red-500 mt-0.5">over — carried to next month</p>
            )}
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-1.5 rounded-full ${jar.balance < 0 ? 'bg-red-400' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(100, jar.totalContribution > 0 ? (jar.totalSpending / jar.totalContribution) * 100 : 0)}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{fmtPln(jar.totalSpending)} of {fmtPln(jar.totalContribution)}</p>
            {jar.carryForward !== 0 && (
              <p className={`text-xs mt-1 font-medium ${jar.carryForward > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {jar.carryForward > 0 ? '+' : ''}{fmtPln(jar.carryForward)} from last month
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Personal jar */}
      <div className="bg-gray-900 rounded-xl p-4 text-white">
        <p className="text-sm text-gray-400">Personal jar</p>
        <p className="text-2xl font-bold mt-1">{fmtPln(requesterPerson.personalJarBalance)}</p>
        <p className="text-xs text-gray-500 mt-1">Only visible to you</p>
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
