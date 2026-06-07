import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, Cell,
} from 'recharts';
import { api } from '../lib/api';
import { fmtPln } from '../lib/format';

interface AnalyticsData {
  dateFrom: string;
  dateTo: string;
  spendingByJar: { jarId: number; jarName: string; total: number; count: number }[];
  spendingByMonth: Record<string, number | string>[];
  allJarNames: string[];
  spendingByPerson: { userId: number; name: string; total: number; count: number }[];
  spendingByCurrency: { currency: string; totalOriginal: number; totalPln: number; count: number }[];
  monthlySummary: { month: string; income: number; spent: number; saved: number }[];
  carryForwardHistory: { month: string; jars: { name: string; amount: number }[] }[];
}

const JAR_COLORS = ['#7C3AED','#A78BFA','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444','#8B5CF6'];

type Preset = '1m' | '3m' | '6m' | '1y' | 'custom';

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' });
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-brand-100 p-5 space-y-4"
    style={{boxShadow:'0 2px 16px 0 rgba(124,58,237,0.07)'}}>
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
    {children}
  </div>
);

const MetricCard = ({ label, value, sub, color = 'text-brand-900' }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="bg-brand-50 rounded-2xl p-4">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
    <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-brand-100 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-brand-900 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{fmtPln(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>('6m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const getDateRange = (p: Preset) => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    if (p === '1m') return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), dateTo: to };
    if (p === '3m') return { dateFrom: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10), dateTo: to };
    if (p === '6m') return { dateFrom: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10), dateTo: to };
    if (p === '1y') return { dateFrom: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), dateTo: to };
    return { dateFrom: customFrom, dateTo: customTo };
  };

  const load = async (p: Preset = preset) => {
    setLoading(true);
    const range = getDateRange(p);
    if (!range.dateFrom) { setLoading(false); return; }
    try {
      const result = await api.get<AnalyticsData>(
        `/analytics?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`
      );
      setData(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const presets: { key: Preset; label: string }[] = [
    { key: '1m', label: 'This month' },
    { key: '3m', label: '3 months' },
    { key: '6m', label: '6 months' },
    { key: '1y', label: 'This year' },
    { key: 'custom', label: 'Custom' },
  ];

  const totalSpent = data?.spendingByJar.reduce((s, j) => s + j.total, 0) ?? 0;
  const totalTransactions = data?.spendingByJar.reduce((s, j) => s + j.count, 0) ?? 0;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header + date range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand-900">Analytics</h1>
        <div className="flex flex-wrap gap-2 items-center">
          {presets.map(p => (
            <button key={p.key} onClick={() => { setPreset(p.key); if (p.key !== 'custom') load(p.key); }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors min-h-[36px] ${
                preset === p.key ? 'bg-brand-600 text-white' : 'bg-white border border-brand-200 text-gray-600 hover:bg-brand-50'
              }`}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-brand-50 border border-brand-200 rounded-xl px-3 py-1.5 text-sm" />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-brand-50 border border-brand-200 rounded-xl px-3 py-1.5 text-sm" />
              <button onClick={() => load('custom')}
                className="bg-brand-600 text-white px-4 py-1.5 rounded-xl text-sm font-semibold hover:bg-brand-700">
                Apply
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-gray-500">Loading analytics…</div>
      )}

      {!loading && data && (
        <>
          {/* Top metric cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Total spent" value={fmtPln(totalSpent)} sub={`${totalTransactions} transactions`} />
            <MetricCard
              label="Avg per month"
              value={fmtPln(data.monthlySummary.length > 0 ? totalSpent / data.monthlySummary.length : 0)}
            />
            {data.spendingByPerson.map(p => (
              <MetricCard key={p.userId} label={p.name} value={fmtPln(p.total)} sub={`${p.count} expenses`} />
            ))}
          </div>

          {/* Row 1: Spending by jar (horizontal bar) + by person */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="sm:col-span-2">
              <Card title="Spending by jar">
                {data.spendingByJar.length === 0 ? (
                  <p className="text-sm text-gray-500">No data for this period.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.spendingByJar.length * 44)}>
                    <BarChart data={data.spendingByJar} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EDE9FE" />
                      <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(1)}k`} tick={{ fontSize: 11, fill: '#6B7280' }} />
                      <YAxis type="category" dataKey="jarName" width={100} tick={{ fontSize: 12, fill: '#1E1B4B', fontWeight: 500 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="total" name="Spent" radius={[0, 6, 6, 0]}>
                        {data.spendingByJar.map((_, i) => (
                          <Cell key={i} fill={JAR_COLORS[i % JAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

            <Card title="By currency">
              {data.spendingByCurrency.length === 0 ? (
                <p className="text-sm text-gray-500">No data.</p>
              ) : (
                <div className="space-y-3">
                  {data.spendingByCurrency.map((c, i) => {
                    const pct = totalSpent > 0 ? (c.totalPln / totalSpent) * 100 : 0;
                    return (
                      <div key={c.currency}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-semibold text-brand-900">{c.currency}</span>
                          <span className="text-gray-500">{fmtPln(c.totalPln)}</span>
                        </div>
                        <div className="h-2 bg-brand-100 rounded-full overflow-hidden">
                          <div className="h-2 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: JAR_COLORS[i % JAR_COLORS.length] }} />
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{c.count} transactions · {pct.toFixed(1)}%</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Row 2: Monthly trend */}
          <Card title="Monthly spending trend">
            {data.spendingByMonth.length === 0 ? (
              <p className="text-sm text-gray-500">No data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.spendingByMonth.map(d => ({ ...d, month: monthLabel(d.month as string) }))}
                  margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDE9FE" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(1)}k`} tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {data.allJarNames.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} name={name}
                      stroke={JAR_COLORS[i % JAR_COLORS.length]} strokeWidth={2}
                      dot={{ r: 3, fill: JAR_COLORS[i % JAR_COLORS.length] }}
                      activeDot={{ r: 5 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Row 3: Monthly summary table */}
          <Card title="Monthly summary">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-brand-100">
                    <th className="text-left py-2 pr-4">Month</th>
                    <th className="text-right py-2 px-4">Income</th>
                    <th className="text-right py-2 px-4">Spent</th>
                    <th className="text-right py-2 pl-4">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthlySummary.map((m, i) => (
                    <tr key={m.month} className={`border-b border-brand-50 ${i % 2 === 0 ? '' : 'bg-brand-50/30'}`}>
                      <td className="py-2.5 pr-4 font-medium text-brand-900">{monthLabel(m.month)}</td>
                      <td className="py-2.5 px-4 text-right text-gray-600">{fmtPln(m.income)}</td>
                      <td className="py-2.5 px-4 text-right text-gray-600">{fmtPln(m.spent)}</td>
                      <td className={`py-2.5 pl-4 text-right font-semibold tabular-nums ${m.saved < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {m.saved >= 0 ? '+' : ''}{fmtPln(m.saved)}
                      </td>
                    </tr>
                  ))}
                  {data.monthlySummary.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-center text-gray-500">No data for this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Row 4: Carry-forward history */}
          {data.carryForwardHistory.length > 0 && (
            <Card title="Carry-forward history">
              <div className="space-y-3">
                {data.carryForwardHistory.map(m => (
                  <div key={m.month}>
                    <p className="text-xs font-semibold text-gray-500 mb-1">{monthLabel(m.month)}</p>
                    <div className="flex flex-wrap gap-2">
                      {m.jars.map(j => (
                        <span key={j.name}
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            j.amount > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
                          }`}>
                          {j.name} {j.amount > 0 ? '+' : ''}{fmtPln(j.amount)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
