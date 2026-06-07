import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtPln as _fmtPln } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface Jar {
  id: number; name: string; percent: number; status: string;
  archivedAt?: string; isPersonal: boolean; isFood: boolean;
}

export default function Jars() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [jars, setJars] = useState<Jar[]>([]);
  const [archived, setArchived] = useState<Jar[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editPercents, setEditPercents] = useState<Record<number, string>>({});
  const [editNames, setEditNames] = useState<Record<number, string>>({});
  const [confirmArchive, setConfirmArchive] = useState<number | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [newJar, setNewJar] = useState({ name: '', percent: '' });
  const [addingJar, setAddingJar] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [active, arch] = await Promise.all([
      api.get<Jar[]>('/jars'),
      api.get<Jar[]>('/jars/archived'),
    ]);
    setJars(active);
    setArchived(arch);
    const percents: Record<number, string> = {};
    const names: Record<number, string> = {};
    active.forEach((j) => { percents[j.id] = String(j.percent); names[j.id] = j.name; });
    setEditPercents(percents);
    setEditNames(names);
  };

  useEffect(() => { load(); }, []);

  const sharedJars = jars.filter((j) => !j.isPersonal && !j.isFood);
  const totalPercent = sharedJars.reduce((s, j) => s + (parseFloat(editPercents[j.id] ?? '0') || 0), 0);

  const saveAllocations = async () => {
    setBusy(true);
    try {
      for (const j of sharedJars) {
        await api.patch(`/jars/${j.id}`, {
          name: editNames[j.id] ?? j.name,
          percent: parseFloat(editPercents[j.id] ?? '0') || 0,
        });
      }
      addToast('Saved. Changes apply from next reset.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const doAddJar = async () => {
    if (!newJar.name.trim()) return;
    setBusy(true);
    try {
      await api.post('/jars', { name: newJar.name.trim(), percent: parseFloat(newJar.percent) || 0 });
      addToast('Saved. Changes apply from next reset.');
      setNewJar({ name: '', percent: '' });
      setAddingJar(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const doArchive = async (id: number) => {
    await api.post(`/jars/${id}/archive`);
    addToast('Jar archived. Balance moves to Personal at next reset.', true);
    setConfirmArchive(null);
    await load();
  };

  const doRestore = async (id: number) => {
    await api.post(`/jars/${id}/restore`);
    addToast('Jar restored.');
    setConfirmRestore(null);
    await load();
  };

  const doDelete = async (id: number) => {
    await api.delete(`/jars/${id}`);
    await load();
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jars</h1>
        {isAdmin && (
          <button onClick={() => setAddingJar(!addingJar)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + Add jar
          </button>
        )}
      </div>

      {addingJar && isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Jar name</label>
            <input value={newJar.name} onChange={(e) => setNewJar((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Clothing" autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="w-28">
            <label className="block text-xs text-gray-500 mb-1">% of discretionary</label>
            <input type="number" value={newJar.percent} onChange={(e) => setNewJar((p) => ({ ...p, percent: e.target.value }))}
              placeholder="0" min="0" max="100" step="0.5"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={doAddJar} disabled={busy || !newJar.name.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setAddingJar(false); setNewJar({ name: '', percent: '' }); }}
            className="text-sm text-gray-500 hover:text-gray-700 pb-0.5">
            Cancel
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <span className={`text-sm font-medium ${totalPercent > 100 ? 'text-red-600' : 'text-gray-700'}`}>
            Total allocated: {totalPercent.toFixed(2)}% of discretionary
          </span>
          {totalPercent > 100 && (
            <span className="text-xs text-red-600">Total exceeds 100% — your Personal jar would be negative.</span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b">
            <tr>
              <th className="text-left px-4 py-2">Jar</th>
              <th className="text-right px-4 py-2">%</th>
              {isAdmin && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {jars.filter((j) => !j.isPersonal).map((j) => {
              const isConfirming = confirmArchive === j.id;
              return (
                <React.Fragment key={j.id}>
                  <tr className="border-b last:border-0">
                    <td className="px-4 py-2">
                      {isAdmin && !j.isFood && !j.isPersonal ? (
                        <input value={editNames[j.id] ?? j.name}
                          onChange={(e) => setEditNames((p) => ({ ...p, [j.id]: e.target.value }))}
                          className="border-b border-gray-200 focus:border-blue-500 outline-none w-40 text-sm" />
                      ) : (
                        <span>{j.name}</span>
                      )}
                      {j.isFood && <span className="ml-2 text-xs text-gray-400">Fixed 2 000 PLN</span>}
                      {j.isPersonal && <span className="ml-2 text-xs text-gray-400">Remainder</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isAdmin && !j.isFood && !j.isPersonal ? (
                        <input type="number" value={editPercents[j.id] ?? ''} min="0" max="100" step="0.5"
                          onChange={(e) => setEditPercents((p) => ({ ...p, [j.id]: e.target.value }))}
                          className="w-16 text-right border-b border-gray-200 focus:border-blue-500 outline-none text-sm" />
                      ) : (
                        <span>{j.isPersonal ? 'Remainder' : j.isFood ? '—' : `${j.percent}%`}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right">
                        {!j.isPersonal && !j.isFood && (
                          <button onClick={() => setConfirmArchive(j.id)}
                            className="text-xs text-gray-400 hover:text-red-500">Archive</button>
                        )}
                      </td>
                    )}
                  </tr>
                  {isConfirming && (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 bg-amber-50">
                        <p className="text-sm text-amber-800">
                          Archiving {j.name}. Remaining balance will move to your Personal jar at next reset. Past transactions stay in history.
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => doArchive(j.id)}
                            className="bg-amber-600 text-white px-3 py-1 rounded text-sm">Archive jar</button>
                          <button onClick={() => setConfirmArchive(null)} className="text-amber-700 text-sm">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {isAdmin && (
          <div className="p-4 border-t flex justify-end">
            <button onClick={saveAllocations} disabled={busy || totalPercent > 100}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save allocations'}
            </button>
          </div>
        )}
      </div>

      {/* Archived jars */}
      {archived.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <button onClick={() => setShowArchived(!showArchived)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-600">
            <span>Archived jars ({archived.length})</span>
            <span>{showArchived ? '▲' : '▼'}</span>
          </button>
          {showArchived && (
            <div className="border-t">
              {archived.map((j) => (
                <div key={j.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{j.name}</p>
                    <p className="text-xs text-gray-400">Archived {j.archivedAt ? new Date(j.archivedAt).toLocaleDateString('en-GB') : '—'}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      {confirmRestore === j.id ? (
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-gray-600">Restore {j.name}? Resumes from next reset.</span>
                          <button onClick={() => doRestore(j.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Restore jar</button>
                          <button onClick={() => setConfirmRestore(null)} className="text-xs text-gray-500">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setConfirmRestore(j.id)}
                            className="text-xs text-blue-600 hover:underline">Restore</button>
                          <button onClick={() => doDelete(j.id)}
                            className="text-xs text-red-400 hover:text-red-600">Delete jar</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
