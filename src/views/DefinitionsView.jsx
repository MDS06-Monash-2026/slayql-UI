import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2, Plus } from 'lucide-react';
import AnalystNav from '../components/trust/AnalystNav';
import DefinitionSuggestions from '../components/trust/DefinitionSuggestions';
import { createDefinition, fetchConnections, fetchDefinitions, updateDefinitionStatus } from '../services/api';

const EMPTY = { term: '', synonyms: '', table_name: '', column_name: '', filter_sql: '', description: '', approve: true };

export default function DefinitionsView({ setView, session }) {
  const [connections, setConnections] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [definitions, setDefinitions] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canApprove = ['owner', 'analyst'].includes(session?.user?.access_role);

  useEffect(() => {
    fetchConnections().then((list) => {
      setConnections(list);
      setConnectionId((current) => current || (list.find((c) => c.is_default) || list[0])?.id || '');
    }).catch((err) => setError(err.message));
  }, []);

  const load = useCallback(async () => {
    if (!connectionId) return;
    try {
      setDefinitions(await fetchDefinitions(connectionId));
    } catch (err) {
      setError(err.message);
    }
  }, [connectionId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createDefinition(connectionId, {
        ...form,
        column_name: form.column_name || null,
        synonyms: form.synonyms.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.status === 403 ? 'Approving needs an admin account. Untick "Approve now" to save a draft.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    setError('');
    try {
      await updateDefinitionStatus(id, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const field = (key, label, props = {}) => (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
      {label}
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
    </label>
  );

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0b0e16]">
      <AnalystNav current="definitions" setView={setView} session={session} />
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Definitions</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">What each business term means, who approved it, and which version SlayQL uses.</p>
          </div>
          <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        {canApprove && <DefinitionSuggestions key={connectionId} connectionId={connectionId} onApproved={load} />}

        <table className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm dark:border-slate-800 dark:bg-[#121622] dark:text-slate-200">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
            <tr><th className="p-3">Term</th><th className="p-3">Rule</th><th className="p-3">Version</th><th className="p-3">Status</th><th className="p-3">Approved by</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {definitions.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={6}>No definitions yet.</td></tr>}
            {definitions.map((d) => (
              <tr key={d.id}>
                <td className="p-3 font-semibold">{d.term}{d.synonyms?.length ? <span className="block text-xs font-normal text-slate-500">also: {d.synonyms.join(', ')}</span> : null}</td>
                <td className="p-3"><span className="font-mono text-xs">{d.table_name}{d.filter_sql ? ` WHERE ${d.filter_sql}` : ''}</span>{d.description && <span className="block text-xs text-slate-500">{d.description}</span>}</td>
                <td className="p-3">v{d.version}</td>
                <td className="p-3">{d.status === 'approved' ? <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300"><BadgeCheck className="h-4 w-4" /> Approved</span> : d.status}</td>
                <td className="p-3 text-xs">{d.approved_by || '—'}</td>
                <td className="p-3 text-right">
                  {d.status !== 'approved' && <button type="button" onClick={() => setStatus(d.id, 'approved')} className="rounded-lg border px-2 py-1 text-xs">Approve</button>}
                  {d.status === 'approved' && <button type="button" onClick={() => setStatus(d.id, 'retired')} className="rounded-lg border px-2 py-1 text-xs">Retire</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 dark:border-slate-800 dark:bg-[#121622]">
          <h2 className="text-lg font-semibold text-slate-900 sm:col-span-2 dark:text-slate-100">New definition</h2>
          {field('term', 'Term', { required: true, placeholder: 'revenue' })}
          {field('synonyms', 'Synonyms (comma separated)', { placeholder: 'sales, jualan, hasil' })}
          {field('table_name', 'Table', { required: true, placeholder: 'orders' })}
          {field('column_name', 'Filtered column (optional)', { placeholder: 'status' })}
          <div className="sm:col-span-2">{field('filter_sql', 'Filter (SQL condition, tested before saving)', { placeholder: "status = 'completed'" })}</div>
          <div className="sm:col-span-2">{field('description', 'Plain-language description')}</div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.approve} onChange={(e) => setForm({ ...form, approve: e.target.checked })} /> Approve now (admin)
          </label>
          <div className="sm:text-right">
            <button type="submit" disabled={busy || !connectionId} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save definition
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
