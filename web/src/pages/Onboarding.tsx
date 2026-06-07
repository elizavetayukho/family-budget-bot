import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface Deduction { name: string; amount: string }
interface JarAlloc { id: number; name: string; percent: string; openingBalanceLiz: string; openingBalanceEdgar: string }

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Step 1 — Lizaveta's income
  const [lizBrutto, setLizBrutto] = useState('');
  const [lizNetto, setLizNetto] = useState('');
  // Step 2 — Edgar's income
  const [edgarBrutto, setEdgarBrutto] = useState('');
  const [edgarNetto, setEdgarNetto] = useState('');
  // Step 3 — Overheads
  const [foodAmount, setFoodAmount] = useState('2000');
  const [extraOverheads, setExtraOverheads] = useState<{ name: string; amount: string }[]>([]);
  // Step 4 — Lizaveta's deductions
  const [deductions, setDeductions] = useState<Deduction[]>([
    { name: 'University savings', amount: '300' },
    { name: 'IKZE', amount: '200' },
  ]);
  // Step 5 — Jar allocations
  const [jars, setJars] = useState<JarAlloc[]>([]);
  const [jarsLoaded, setJarsLoaded] = useState(false);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow p-8 max-w-sm text-center">
          <p className="text-gray-600">Setup in progress. You'll get access once Lizaveta completes setup.</p>
        </div>
      </div>
    );
  }

  const totalPercent = jars.reduce((s, j) => s + (parseFloat(j.percent) || 0), 0);

  const loadJars = async () => {
    if (jarsLoaded) return;
    const data = await api.get<{ id: number; name: string; percent: number; isPersonal: boolean; isFood: boolean }[]>('/jars');
    setJars(data.filter((j) => !j.isPersonal && !j.isFood).map((j) => ({ id: j.id, name: j.name, percent: String(j.percent), openingBalanceLiz: '', openingBalanceEdgar: '' })));
    setJarsLoaded(true);
  };

  const currentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const handleFinish = async () => {
    setBusy(true);
    try {
      const month = currentMonth();
      const summary = await api.get<{ users: { id: number; role: string }[] }>('/dashboard/summary');
      const users = summary.users;
      const lizId = users.find((u) => u.role === 'ADMIN')!.id;
      const edgarId = users.find((u) => u.role === 'USER')!.id;

      // Set brutto + netto for current month directly (setup endpoint)
      if (lizBrutto) await api.post('/income/setup', {
        userId: lizId, month,
        brutto: parseFloat(lizBrutto),
        netto: lizNetto ? parseFloat(lizNetto) : null,
      });
      if (edgarBrutto) await api.post('/income/setup', {
        userId: edgarId, month,
        brutto: parseFloat(edgarBrutto),
        netto: edgarNetto ? parseFloat(edgarNetto) : null,
      });

      // Food overhead already seeded; update if changed
      const overheads = await api.get<{ id: number; name: string }[]>('/overheads');
      const foodOverhead = overheads.find((o) => o.name === 'Food');
      if (foodOverhead) {
        await api.patch(`/overheads/${foodOverhead.id}`, { amountPln: parseFloat(foodAmount) });
      }
      for (const o of extraOverheads) {
        if (o.name && o.amount) await api.post('/overheads', { name: o.name, amountPln: parseFloat(o.amount) });
      }

      // Deductions for Lizaveta — delete existing and recreate
      const existingDeds = await api.get<{ id: number }[]>('/deductions');
      for (const d of existingDeds) await api.delete(`/deductions/${d.id}`);
      for (const d of deductions) {
        if (d.name && d.amount) await api.post('/deductions', { name: d.name, amountPln: parseFloat(d.amount) });
      }

      // Jar percentages + opening balances
      for (const j of jars) {
        await api.patch(`/jars/${j.id}`, {
          percent: parseFloat(j.percent) || 0,
          openingBalanceLiz: j.openingBalanceLiz !== '' ? parseFloat(j.openingBalanceLiz) || 0 : 0,
          openingBalanceEdgar: j.openingBalanceEdgar !== '' ? parseFloat(j.openingBalanceEdgar) || 0 : 0,
        });
      }

      onComplete?.();
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-lg">
        <div className="mb-6">
          <p className="text-xs text-gray-400 mb-1">Step {step} of 5</p>
          <div className="flex gap-1">
            {[1,2,3,4,5].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Lizaveta's income</h2>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Brutto (PLN) *</label>
              <input type="number" value={lizBrutto} onChange={(e) => setLizBrutto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 8000" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Netto this month (optional)</label>
              <input type="number" value={lizNetto} onChange={(e) => setLizNetto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 5800" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(2)} disabled={!lizBrutto}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Edgar's income</h2>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Brutto (PLN) *</label>
              <input type="number" value={edgarBrutto} onChange={(e) => setEdgarBrutto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 7000" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Netto this month (optional)</label>
              <input type="number" value={edgarNetto} onChange={(e) => setEdgarNetto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 5000" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(1)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm">Back</button>
              <button onClick={() => setStep(3)} disabled={!edgarBrutto}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Household overheads</h2>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Food (PLN/month) *</label>
              <input type="number" value={foodAmount} onChange={(e) => setFoodAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            {extraOverheads.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input value={o.name} onChange={(e) => setExtraOverheads((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Name" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <input type="number" value={o.amount} onChange={(e) => setExtraOverheads((prev) => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  placeholder="PLN" className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => setExtraOverheads((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => setExtraOverheads((p) => [...p, { name: '', amount: '' }])}
              className="text-blue-600 text-sm hover:underline">+ Add overhead</button>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(2)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm">Back</button>
              <button onClick={() => setStep(4)} disabled={!foodAmount}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Lizaveta's personal deductions</h2>
            <p className="text-sm text-gray-500">These reduce Lizaveta's discretionary income before jar allocations.</p>
            {deductions.map((d, i) => (
              <div key={i} className="flex gap-2">
                <input value={d.name} onChange={(e) => setDeductions((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Name" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <input type="number" value={d.amount} onChange={(e) => setDeductions((prev) => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  placeholder="PLN" className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => setDeductions((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => setDeductions((p) => [...p, { name: '', amount: '' }])}
              className="text-blue-600 text-sm hover:underline">+ Add deduction</button>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(3)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm">Back</button>
              <button onClick={async () => { await loadJars(); setStep(5); }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Jar allocations</h2>
            <p className="text-sm text-gray-500">Set the % of each person's discretionary income that goes into each shared jar.</p>
            {jars.map((j, i) => (
              <div key={j.id} className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium">{j.name}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" value={j.percent} min="0" max="100" step="0.5"
                      onChange={(e) => setJars((prev) => prev.map((x, k) => k === i ? { ...x, percent: e.target.value } : x))}
                      className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right" />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 pl-1">Carry-forward from before the app — positive = surplus, negative = overspend.</p>
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-xs text-gray-500 w-20">Lizaveta</span>
                  <input type="number" value={j.openingBalanceLiz} step="0.01" placeholder="0"
                    onChange={(e) => setJars((prev) => prev.map((x, k) => k === i ? { ...x, openingBalanceLiz: e.target.value } : x))}
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right" />
                  <span className="text-xs text-gray-400">PLN</span>
                </div>
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-xs text-gray-500 w-20">Edgar</span>
                  <input type="number" value={j.openingBalanceEdgar} step="0.01" placeholder="0"
                    onChange={(e) => setJars((prev) => prev.map((x, k) => k === i ? { ...x, openingBalanceEdgar: e.target.value } : x))}
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right" />
                  <span className="text-xs text-gray-400">PLN</span>
                </div>
              </div>
            ))}
            <div className={`text-sm font-medium pt-1 ${totalPercent > 100 ? 'text-red-600' : 'text-gray-700'}`}>
              Total allocated: {totalPercent.toFixed(2)}% of discretionary
              {totalPercent > 100 && <span className="block text-red-600">Total exceeds 100% — your Personal jar would be negative.</span>}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(4)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm">Back</button>
              <button onClick={handleFinish} disabled={busy || totalPercent > 100}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Go to Dashboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
