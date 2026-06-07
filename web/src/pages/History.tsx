import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtCurrency } from '../lib/format';
import AddExpenseModal from '../components/AddExpenseModal';

interface Expense {
  id: number; amountPln: number; originalAmount: number; originalCurrency: string;
  description?: string; date: string; jarId?: number;
  user: { id: number; name: string };
  jar?: { id: number; name: string };
}

interface Jar { id: number; name: string }

export default function History() {
  const [searchParams] = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [jars, setJars] = useState<Jar[]>([]);
  const [loading, setLoading] = useState(true);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [moreFilters, setMoreFilters] = useState(false);

  const defaultFrom = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };
  const defaultTo = () => new Date().toISOString().slice(0, 10);

  const [jarFilter, setJarFilter] = useState<string[]>([]);
  const [personFilter, setPersonFilter] = useState('both');
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(defaultTo());
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [showUncategorised, setShowUncategorised] = useState(searchParams.get('uncategorised') === 'true');

  useEffect(() => {
    api.get<Jar[]>('/jars').then(setJars);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showUncategorised) { params.set('uncategorised', 'true'); }
      else {
        if (jarFilter.length === 1) params.set('jarId', jarFilter[0]);
      }
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo + 'T23:59:59');
      if (minAmount) params.set('minAmount', minAmount);
      if (maxAmount) params.set('maxAmount', maxAmount);
      if (currencyFilter) params.set('currency', currencyFilter);
      params.set('sort', sort);

      const data = await api.get<Expense[]>(`/expenses?${params}`);
      setExpenses(data);
    } finally {
      setLoading(false);
    }
  }, [jarFilter, dateFrom, dateTo, minAmount, maxAmount, currencyFilter, sort, showUncategorised]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">History</h1>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jar</label>
            <select
              value={showUncategorised ? '__uncategorised' : jarFilter[0] ?? ''}
              onChange={(e) => {
                if (e.target.value === '__uncategorised') { setShowUncategorised(true); setJarFilter([]); }
                else { setShowUncategorised(false); setJarFilter(e.target.value ? [e.target.value] : []); }
              }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All jars</option>
              <option value="__uncategorised">Uncategorised</option>
              {jars.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Person</label>
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="both">Both</option>
              <option value="lizaveta">Lizaveta</option>
              <option value="edgar">Edgar</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Sort</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="date_desc">Date newest</option>
              <option value="date_asc">Date oldest</option>
              <option value="amount_desc">Amount high–low</option>
              <option value="amount_asc">Amount low–high</option>
            </select>
          </div>

          <button onClick={() => setMoreFilters(!moreFilters)} className="text-sm text-blue-600 hover:underline self-end pb-1.5">
            {moreFilters ? 'Fewer filters' : 'More filters'}
          </button>
        </div>

        {moreFilters && (
          <div className="flex flex-wrap gap-3 items-end pt-1 border-t">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min amount (PLN)</label>
              <input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max amount (PLN)</label>
              <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28" placeholder="9999.00" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Currency</label>
              <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">All</option>
                {['PLN','USD','EUR','BYN'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Expense list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading && <div className="p-8 text-center text-gray-400">Loading…</div>}
        {!loading && expenses.length === 0 && (
          <div className="p-8 text-center text-gray-400">No expenses found.</div>
        )}
        {!loading && expenses.map((e) => (
          <button key={e.id} onClick={() => setEditExpense(e)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-0 text-left hover:bg-gray-50 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{e.description || '—'}</span>
                {!e.jarId && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Uncategorised</span>}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(e.date).toLocaleDateString('en-GB')} · {e.jar?.name ?? 'No jar'} · {e.user.name}
              </div>
            </div>
            <span className={`text-sm font-medium shrink-0 ${e.amountPln < 0 ? 'text-red-600' : ''}`}>
              {fmtCurrency(e.originalAmount, e.originalCurrency, e.amountPln)}
            </span>
          </button>
        ))}
      </div>

      {editExpense && (
        <AddExpenseModal
          editExpense={{ ...editExpense, date: editExpense.date.slice(0, 10), jarId: editExpense.jarId }}
          onClose={() => setEditExpense(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
