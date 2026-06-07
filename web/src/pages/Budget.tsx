import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtPln, fmtMonth } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface UserInfo { id: number; name: string; role: string }
interface IncomeRecord { userId: number; month: string; brutto: number; netto?: number; bruttoHistory: BruttoEntry[] }
interface BruttoEntry { previousValue: number; newValue: number; effectiveDate: string; reason?: string }
interface Overhead { id: number; name: string; amountPln: number; isOneOff: boolean }
interface Deduction { id: number; userId: number; name: string; amountPln: number; isOneOff: boolean }

function nextMonth() {
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Budget() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [users, setUsers] = useState<UserInfo[]>([]);
  const [incomes, setIncomes] = useState<IncomeRecord[]>([]);
  const [overheads, setOverheads] = useState<Overhead[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [busy, setBusy] = useState(false);

  const [editBrutto, setEditBrutto] = useState<Record<number, { open: boolean; value: string; reason: string }>>({});
  const [nettoInputs, setNettoInputs] = useState<Record<number, string>>({});
  const [showHistory, setShowHistory] = useState<Record<number, boolean>>({});
  const [newOverhead, setNewOverhead] = useState({ name: '', amount: '' });
  const [editOverhead, setEditOverhead] = useState<Record<number, { name: string; amount: string }>>({});
  const [newDeduction, setNewDeduction] = useState<Record<number, { name: string; amount: string }>>({});
  const [editDeduction, setEditDeduction] = useState<Record<number, { name: string; amount: string }>>({});

  const currentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const load = async () => {
    const summary = await api.get<{ users: UserInfo[]; overheads: Overhead[] }>('/dashboard/summary');
    setUsers(summary.users);
    setOverheads(summary.overheads);

    // Load all deductions (admin gets all, user gets own)
    const deds = await api.get<Deduction[]>('/deductions');
    setDeductions(deds);

    const fullIncomes = await Promise.all(
      summary.users.map((u) => api.get<IncomeRecord[]>(`/income/history/${u.id}`).catch(() => []))
    );
    setIncomes(fullIncomes.flat());
  };

  useEffect(() => { load(); }, []);

  const saveBrutto = async (userId: number) => {
    const edit = editBrutto[userId];
    if (!edit?.value) return;
    setBusy(true);
    try {
      await api.post('/income/brutto', { userId, newBrutto: parseFloat(edit.value), reason: edit.reason || null });
      addToast(`Brutto updated. Applies from ${fmtMonth(nextMonth())}.`);
      setEditBrutto((p) => ({ ...p, [userId]: { ...p[userId], open: false } }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveNetto = async (userId: number) => {
    const val = nettoInputs[userId];
    if (!val) return;
    setBusy(true);
    try {
      await api.post('/income/netto', { month: currentMonth(), netto: parseFloat(val), userId });
      addToast('Netto saved', true);
      setNettoInputs((p) => ({ ...p, [userId]: '' }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveOverhead = async (id: number) => {
    const e = editOverhead[id];
    if (!e) return;
    await api.patch(`/overheads/${id}`, { name: e.name, amountPln: parseFloat(e.amount) });
    addToast('Saved. Changes apply from next reset.');
    setEditOverhead((p) => { const n = { ...p }; delete n[id]; return n; });
    await load();
  };

  const deleteOverhead = async (id: number) => {
    await api.delete(`/overheads/${id}`);
    addToast('Saved. Changes apply from next reset.');
    await load();
  };

  const addOverhead = async () => {
    if (!newOverhead.name || !newOverhead.amount) return;
    await api.post('/overheads', { name: newOverhead.name, amountPln: parseFloat(newOverhead.amount) });
    addToast('Saved. Changes apply from next reset.');
    setNewOverhead({ name: '', amount: '' });
    await load();
  };

  const saveDeduction = async (id: number) => {
    const e = editDeduction[id];
    if (!e) return;
    await api.patch(`/deductions/${id}`, { name: e.name, amountPln: parseFloat(e.amount) });
    addToast('Saved. Changes apply from next reset.');
    setEditDeduction((p) => { const n = { ...p }; delete n[id]; return n; });
    await load();
  };

  const deleteDeduction = async (id: number) => {
    await api.delete(`/deductions/${id}`);
    addToast('Saved. Changes apply from next reset.');
    await load();
  };

  const addDeduction = async (userId: number) => {
    const nd = newDeduction[userId];
    if (!nd?.name || !nd?.amount) return;
    await api.post('/deductions', { name: nd.name, amountPln: parseFloat(nd.amount), userId });
    addToast('Saved. Changes apply from next reset.');
    setNewDeduction((p) => ({ ...p, [userId]: { name: '', amount: '' } }));
    await load();
  };

  const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);
  const getIncome = (userId: number) => incomes.find((i) => i.userId === userId && i.month === currentMonth());
  const getDeductions = (userId: number) => deductions.filter((d) => d.userId === userId);

  const canEditNetto = (userId: number) => userId === user?.id || isAdmin;

  const [openSections, setOpenSections] = useState({ income: true, overheads: true, deductions: true });
  const toggleSection = (s: keyof typeof openSections) =>
    setOpenSections(p => ({ ...p, [s]: !p[s] }));

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-8">
      <h1 className="text-xl font-semibold text-brand-900">Budget</h1>

      {/* Section 1 — Income */}
      <section>
        <button onClick={() => toggleSection('income')}
          className="w-full flex items-center justify-between mb-3 sm:cursor-default">
          <h2 className="text-base font-semibold text-brand-900">Income</h2>
          <span className="sm:hidden text-gray-400 text-sm">{openSections.income ? '▲' : '▼'}</span>
        </button>
        {openSections.income && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {users.map((u) => {
            const income = getIncome(u.id);
            const bruttoEdit = editBrutto[u.id];
            const history = incomes.filter((i) => i.userId === u.id);

            return (
              <div key={u.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
                <p className="font-medium">{u.name}</p>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Brutto</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{income ? fmtPln(Number(income.brutto)) : '—'}</span>
                      {isAdmin && (
                        <button onClick={() => setEditBrutto((p) => ({ ...p, [u.id]: { open: !p[u.id]?.open, value: '', reason: '' } }))}
                          className="text-xs text-blue-600 hover:underline">Edit</button>
                      )}
                    </div>
                  </div>
                  {bruttoEdit?.open && (
                    <div className="mt-2 space-y-2">
                      <input type="number" value={bruttoEdit.value}
                        onChange={(e) => setEditBrutto((p) => ({ ...p, [u.id]: { ...p[u.id], value: e.target.value } }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="New brutto" />
                      <input value={bruttoEdit.reason}
                        onChange={(e) => setEditBrutto((p) => ({ ...p, [u.id]: { ...p[u.id], reason: e.target.value } }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Reason (optional)" />
                      <div className="text-xs text-gray-400">Effective from {fmtMonth(nextMonth())} (1st)</div>
                      <div className="flex gap-2">
                        <button onClick={() => saveBrutto(u.id)} disabled={busy}
                          className="flex-1 bg-blue-600 text-white py-1.5 rounded text-sm disabled:opacity-50">Save</button>
                        <button onClick={() => setEditBrutto((p) => ({ ...p, [u.id]: { ...p[u.id], open: false } }))}
                          className="text-sm text-gray-500">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Netto this month</span>
                    <span className="text-sm font-medium">
                      {income?.netto != null ? fmtPln(Number(income.netto)) : <span className="text-amber-600">Not set</span>}
                    </span>
                  </div>
                  {income?.netto == null && canEditNetto(u.id) && (
                    <div className="flex items-center gap-2 mt-1">
                      <input type="number" value={nettoInputs[u.id] ?? ''}
                        onChange={(e) => setNettoInputs((p) => ({ ...p, [u.id]: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Enter netto" />
                      <button onClick={() => saveNetto(u.id)} disabled={busy}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50">Save</button>
                    </div>
                  )}
                </div>

                {history.length > 0 && (
                  <div>
                    <button onClick={() => setShowHistory((p) => ({ ...p, [u.id]: !p[u.id] }))}
                      className="text-xs text-blue-600 hover:underline">
                      {showHistory[u.id] ? 'Hide history' : 'View brutto history'}
                    </button>
                    {showHistory[u.id] && (
                      <div className="mt-2 space-y-1">
                        {history.flatMap((i) => i.bruttoHistory ?? []).map((h, idx) => (
                          <div key={idx} className="text-xs text-gray-500">
                            {h.previousValue != null ? fmtPln(Number(h.previousValue)) : '—'} → {fmtPln(Number(h.newValue))} from {h.effectiveDate}{h.reason ? ` (${h.reason})` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>}
      </section>

      {/* Section 2 — Household overheads */}
      <section>
        <button onClick={() => toggleSection('overheads')}
          className="w-full flex items-center justify-between mb-3 sm:cursor-default">
          <h2 className="text-base font-semibold text-brand-900">Household overheads</h2>
          <span className="sm:hidden text-gray-400 text-sm">{openSections.overheads ? '▲' : '▼'}</span>
        </button>
        {openSections.overheads && <div className="bg-white rounded-2xl shadow-sm border border-brand-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-right px-4 py-2">Monthly</th>
                <th className="text-right px-4 py-2">Per person</th>
                {isAdmin && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {overheads.map((o) => {
                const editing = editOverhead[o.id];
                return (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      {isAdmin && editing ? (
                        <input value={editing.name} onChange={(e) => setEditOverhead((p) => ({ ...p, [o.id]: { ...editing, name: e.target.value } }))}
                          className="border-b border-gray-300 focus:border-blue-500 outline-none text-sm w-40" />
                      ) : (
                        <span>{o.name}{o.isOneOff && <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">One-off</span>}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isAdmin && editing ? (
                        <input type="number" value={editing.amount} onChange={(e) => setEditOverhead((p) => ({ ...p, [o.id]: { ...editing, amount: e.target.value } }))}
                          className="border-b border-gray-300 focus:border-blue-500 outline-none text-sm w-24 text-right" />
                      ) : fmtPln(Number(o.amountPln))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editing ? fmtPln((parseFloat(editing.amount) || 0) / 2) : fmtPln(Number(o.amountPln) / 2)}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {editing ? (
                          <>
                            <button onClick={() => saveOverhead(o.id)} className="text-xs text-blue-600 hover:underline mr-2">Save</button>
                            <button onClick={() => setEditOverhead((p) => { const n = { ...p }; delete n[o.id]; return n; })} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setEditOverhead((p) => ({ ...p, [o.id]: { name: o.name, amount: String(o.amountPln) } }))} className="text-xs text-blue-500 hover:underline mr-2">Edit</button>
                            <button onClick={() => deleteOverhead(o.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="border-t bg-gray-50 font-medium">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right">{fmtPln(totalOverheads)}</td>
                <td className="px-4 py-2 text-right">{fmtPln(totalOverheads / 2)}</td>
                {isAdmin && <td />}
              </tr>
            </tbody>
          </table>
          {isAdmin && (
            <div className="p-4 border-t flex gap-2">
              <input value={newOverhead.name} onChange={(e) => setNewOverhead((p) => ({ ...p, name: e.target.value }))}
                placeholder="Overhead name" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={newOverhead.amount} onChange={(e) => setNewOverhead((p) => ({ ...p, amount: e.target.value }))}
                placeholder="PLN" className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={addOverhead} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700">+ Add</button>
            </div>
          )}
        </div>}
      </section>

      {/* Section 3 — Personal deductions, side by side */}
      <section>
        <button onClick={() => toggleSection('deductions')}
          className="w-full flex items-center justify-between mb-3 sm:cursor-default">
          <h2 className="text-base font-semibold text-brand-900">Personal deductions</h2>
          <span className="sm:hidden text-gray-400 text-sm">{openSections.deductions ? '▲' : '▼'}</span>
        </button>
        {openSections.deductions && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {users.map((u) => {
            const userDeds = getDeductions(u.id);
            const canEdit = u.id === user?.id || isAdmin;
            const nd = newDeduction[u.id] ?? { name: '', amount: '' };

            return (
              <div key={u.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <p className="text-sm font-medium">{u.name}</p>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {userDeds.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-3 text-sm text-gray-400">No deductions.</td></tr>
                    )}
                    {userDeds.map((d) => {
                      const ded = editDeduction[d.id];
                      return (
                        <tr key={d.id} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            {canEdit && ded ? (
                              <input value={ded.name} onChange={(e) => setEditDeduction((p) => ({ ...p, [d.id]: { ...ded, name: e.target.value } }))}
                                className="border-b border-gray-300 focus:border-blue-500 outline-none text-sm w-32" />
                            ) : d.name}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {canEdit && ded ? (
                                <input type="number" value={ded.amount} onChange={(e) => setEditDeduction((p) => ({ ...p, [d.id]: { ...ded, amount: e.target.value } }))}
                                  className="border-b border-gray-300 focus:border-blue-500 outline-none text-sm w-20 text-right" />
                              ) : (
                                <span>{fmtPln(Number(d.amountPln))}</span>
                              )}
                              {canEdit && (ded ? (
                                <>
                                  <button onClick={() => saveDeduction(d.id)} className="text-xs text-blue-600 hover:underline">Save</button>
                                  <button onClick={() => setEditDeduction((p) => { const n = { ...p }; delete n[d.id]; return n; })} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => setEditDeduction((p) => ({ ...p, [d.id]: { name: d.name, amount: String(d.amountPln) } }))} className="text-xs text-blue-500 hover:underline">Edit</button>
                                  <button onClick={() => deleteDeduction(d.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                                </>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {canEdit && (
                  <div className="p-3 border-t flex gap-2">
                    <input value={nd.name}
                      onChange={(e) => setNewDeduction((p) => ({ ...p, [u.id]: { ...nd, name: e.target.value } }))}
                      placeholder="Name" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input type="number" value={nd.amount}
                      onChange={(e) => setNewDeduction((p) => ({ ...p, [u.id]: { ...nd, amount: e.target.value } }))}
                      placeholder="PLN" className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <button onClick={() => addDeduction(u.id)}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">+ Add</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>}
      </section>
    </div>
  );
}
