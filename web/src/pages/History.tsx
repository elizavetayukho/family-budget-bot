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
  const [_personFilter, _setPersonFilter] = useState('both');
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

  const [showFilters, setShowFilters] = useState(false);

  const FilterContent = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jar</label>
          <select value={showUncategorised ? '__uncategorised' : jarFilter[0] ?? ''}
            onChange={(e) => { if (e.target.value === '__uncategorised') { setShowUncategorised(true); setJarFilter([]); } else { setShowUncategorised(false); setJarFilter(e.target.value ? [e.target.value] : []); } }}
            className="border border-brand-200 rounded-xl px-3 py-2 text-sm min-h-[44px]">
            <option value="">All jars</option>
            <option value="__uncategorised">Uncategorised</option>
            {jars.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="border border-brand-200 rounded-xl px-3 py-2 text-sm min-h-[44px]" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="border border-brand-200 rounded-xl px-3 py-2 text-sm min-h-[44px]" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sort</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="border border-brand-200 rounded-xl px-3 py-2 text-sm min-h-[44px]">
            <option value="date_desc">Date newest</option>
            <option value="date_asc">Date oldest</option>
            <option value="amount_desc">Amount high–low</option>
            <option value="amount_asc">Amount low–high</option>
          </select>
        </div>
      </div>
      {moreFilters && (
        <div className="flex flex-wrap gap-3 items-end pt-1 border-t">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min PLN</label>
            <input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)}
              className="border border-brand-200 rounded-xl px-3 py-2 text-sm w-28 min-h-[44px]" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max PLN</label>
            <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)}
              className="border border-brand-200 rounded-xl px-3 py-2 text-sm w-28 min-h-[44px]" placeholder="9999" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Currency</label>
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}
              className="border border-brand-200 rounded-xl px-3 py-2 text-sm min-h-[44px]">
              <option value="">All</option>
              {['PLN','USD','EUR','BYN'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
      <button onClick={() => setMoreFilters(!moreFilters)} className="text-sm text-brand-500 hover:underline">
        {moreFilters ? 'Fewer filters' : 'More filters'}
      </button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-brand-900">History</h1>
        {/* Mobile filter button */}
        <button onClick={() => setShowFilters(true)}
          className="sm:hidden flex items-center gap-1.5 bg-white border border-brand-200 rounded-xl px-3 py-2 text-sm font-medium text-brand-600 min-h-[44px]">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Filters
        </button>
      </div>

      {/* Desktop filter bar */}
      <div className="hidden sm:block bg-white rounded-2xl border border-brand-100 p-4">
        <FilterContent />
      </div>

      {/* Mobile filter bottom sheet */}
      {showFilters && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setShowFilters(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white rounded-t-3xl p-5 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 bg-brand-200 rounded-full cursor-pointer" onClick={() => setShowFilters(false)} />
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-brand-900">Filters</h3>
              <button onClick={() => setShowFilters(false)} className="text-gray-600 text-sm font-medium">Done</button>
            </div>
            <FilterContent />
          </div>
        </>
      )}

      {/* Expense list */}
      <div className="bg-white rounded-2xl border border-brand-100 overflow-hidden">
        {loading && <div className="p-8 text-center text-gray-500">Loading…</div>}
        {!loading && expenses.length === 0 && (
          <div className="p-8 text-center text-gray-500">No expenses found.</div>
        )}
        {!loading && expenses.map((e) => (
          <button key={e.id} onClick={() => setEditExpense(e)}
            className="w-full flex items-start gap-3 px-4 py-3.5 border-b border-brand-50 last:border-0 text-left hover:bg-brand-50 transition-colors min-h-[60px]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-brand-900">
                  {e.jar?.name ?? <span className="text-amber-600">Uncategorised</span>}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(e.date).toLocaleDateString('en-GB')} · {e.user.name}
                </span>
              </div>
              {e.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{e.description}</p>
              )}
            </div>
            <span className={`text-sm font-semibold shrink-0 tabular-nums ${e.amountPln < 0 ? 'text-red-500' : 'text-brand-900'}`}>
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
