import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Database, Loader2, Plus, Search } from 'lucide-react';
import AnalystNav from '../components/trust/AnalystNav';
import DefinitionSuggestions from '../components/trust/DefinitionSuggestions';
import { createDefinition, fetchConnections, fetchDefinitions, updateDefinitionStatus } from '../services/api';
import { getClientCache } from '../services/clientCache';

// Definitions: what each business term means for this data source. Terms that still need a
// meaning come first (that is the job); approved ones read as plain rules; adding one shows the
// rule as a sentence before it is saved.

const EMPTY = { term: '', synonyms: '', table_name: '', column_name: '', filter_sql: '', description: '', approve: true };
const FILTERS = [
  { id: 'approved', label: 'Approved' },
  { id: 'draft', label: 'Drafts' },
  { id: 'retired', label: 'Retired' },
];

function Step({ n, children, count }) {
  return (
    <h2 className="flex items-center text-base font-semibold text-slate-900 dark:text-slate-100">
      <span className="mr-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-semibold text-white">{n}</span>
      {children}
      {typeof count === 'number' && <span className="ml-2 rounded-full bg-slate-100 px-2 py-px text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{count}</span>}
    </h2>
  );
}

function DefinitionCard({ d, canApprove, onStatus }) {
  const approved = d.status === 'approved';
  return (
    <article className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200 hover:shadow-[0_18px_40px_-34px_rgba(49,46,129,0.6)] sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto] sm:items-start sm:gap-5 sm:p-5 dark:border-slate-800 dark:bg-[#121622]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">{d.term}</h3>
          {approved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-px text-[10px] font-semibold text-white">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Approved
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-px text-[10px] font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{d.status}</span>
          )}
        </div>
        {d.synonyms?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {d.synonyms.map((syn) => <span key={syn} className="rounded-md bg-slate-100 px-1.5 py-px text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{syn}</span>)}
          </div>
        )}
      </div>
      <div className="min-w-0 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          Uses rows in <span className="font-mono text-[13px] font-medium text-slate-900 dark:text-slate-100">{d.table_name}</span>
          {d.filter_sql ? <> where <code className="break-words rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-[12px] text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">{d.filter_sql}</code></> : ' (every row)'}
        </p>
        {d.description && <p className="mt-1 text-slate-500 dark:text-slate-400">{d.description}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 sm:flex-col sm:items-end sm:justify-start">
        <span className="whitespace-nowrap">v{d.version}{d.approved_by ? ` · ${d.approved_by.split('@')[0]}` : ''}</span>
        {canApprove && (
          approved ? (
            <button type="button" onClick={() => onStatus(d.id, 'retired')} className="rounded-lg px-2 py-1 font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200">Retire</button>
          ) : d.status !== 'retired' ? (
            <button type="button" onClick={() => onStatus(d.id, 'approved')} className="rounded-lg bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200">Approve</button>
          ) : null
        )}
      </div>
    </article>
  );
}

export default function DefinitionsView({ setView, session }) {
  const [connections, setConnections] = useState(() => getClientCache('connections', 24 * 3600 * 1000) || []);
  const [connectionId, setConnectionId] = useState(() => {
    const cached = getClientCache('connections', 24 * 3600 * 1000) || [];
    return (cached.find((c) => c.is_default) || cached[0])?.id || '';
  });
  const [definitions, setDefinitions] = useState(() => (connectionId ? getClientCache(`definitions:${connectionId}:all`, 24 * 3600 * 1000) : null) || []);
  const [loaded, setLoaded] = useState(Boolean(definitions.length));
  const [filter, setFilter] = useState('approved');
  const [query, setQuery] = useState('');
  const [needCount, setNeedCount] = useState(null);
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

  const load = useCallback(async (force = false) => {
    if (!connectionId) return;
    const cached = getClientCache(`definitions:${connectionId}:all`, 24 * 3600 * 1000);
    if (cached && !force) setDefinitions(cached);
    try {
      setDefinitions(await fetchDefinitions(connectionId, undefined, { force: true }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoaded(true);
    }
  }, [connectionId]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    approved: definitions.filter((d) => d.status === 'approved').length,
    draft: definitions.filter((d) => d.status === 'draft').length,
    retired: definitions.filter((d) => d.status === 'retired').length,
  }), [definitions]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return definitions
      .filter((d) => d.status === filter)
      .filter((d) => !q || [d.term, d.table_name, d.filter_sql, d.description, ...(d.synonyms || [])].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  }, [definitions, filter, query]);

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
      setFilter(form.approve ? 'approved' : 'draft');
      load(true);
    } catch (err) {
      setError(err.status === 403 ? 'Approving needs an owner or analyst. Untick "Approve now" to save a draft.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    setError('');
    try {
      await updateDefinitionStatus(id, status);
      load(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const input = (key, label, props = {}) => (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  );
  const currentConnection = connections.find((c) => c.id === connectionId);

  return (
    <main className="review-page min-h-screen pb-16 dark:bg-[#0b0e16]">
      <AnalystNav current="definitions" setView={setView} session={session} />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6">
        {/* hero */}
        <section className="review-hero relative overflow-hidden rounded-3xl border border-indigo-100/80 px-5 py-5 sm:px-7 dark:border-indigo-500/20">
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Definitions</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-300">
                What each business term means, agreed once. Every answer and report uses the approved meaning instead of guessing.
              </p>
              <label className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl bg-white/80 px-3 py-1.5 text-sm shadow-sm ring-1 ring-white dark:bg-white/5 dark:ring-white/10">
                <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
                <span className="sr-only">Data source</span>
                <select
                  value={connectionId}
                  onChange={(e) => { setConnectionId(e.target.value); setLoaded(false); setDefinitions([]); }}
                  className="min-w-0 max-w-full truncate bg-transparent pr-1 text-sm font-medium text-slate-900 outline-none dark:text-slate-100"
                >
                  {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <dl className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'Approved', value: loaded ? counts.approved : '–', accent: true },
                { label: 'Need a meaning', value: needCount === null ? '–' : needCount },
                { label: 'Drafts', value: loaded ? counts.draft : '–' },
              ].map((stat) => (
                <div key={stat.label} className="min-w-[96px] rounded-2xl bg-white/80 px-3.5 py-2.5 shadow-[0_10px_30px_-20px_rgba(67,56,202,0.6)] ring-1 ring-white backdrop-blur dark:bg-white/5 dark:ring-white/10">
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{stat.label}</dt>
                  <dd className={`text-2xl font-semibold tabular-nums ${stat.accent ? 'bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-violet-300' : 'text-slate-950 dark:text-white'}`}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
        {/* 1. terms that still need a meaning */}
        {canApprove && connectionId && (
          <section className="space-y-3">
            <Step n={1} count={needCount ?? undefined}>Needs a meaning</Step>
            <DefinitionSuggestions key={connectionId} connectionId={connectionId} onApproved={() => load(true)} onCount={setNeedCount} />
          </section>
        )}

        {/* 2. the company's definitions */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Step n={canApprove ? 2 : 1}>Your definitions{currentConnection ? <span className="ml-1.5 hidden text-sm font-normal text-slate-500 sm:inline">for {currentConnection.name}</span> : null}</Step>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-[#121622]">
                <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a term" aria-label="Find a term" className="w-36 bg-transparent text-sm text-slate-900 outline-none placeholder-slate-400 dark:text-slate-100" />
              </label>
              <div role="tablist" aria-label="Status" className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-lg px-3 py-1 text-sm font-medium transition ${filter === f.id ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                  >
                    {f.label} <span className="tabular-nums text-slate-400">{loaded ? counts[f.id] : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {!loaded ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skel h-20 rounded-2xl" />)}</div>
          ) : shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
              {query ? `Nothing matches "${query}".` : filter === 'approved' ? 'No approved definitions yet. Approve a meaning above, or add one on the right.' : `No ${filter === 'draft' ? 'drafts' : 'retired definitions'}.`}
            </p>
          ) : (
            <div className="space-y-2.5">
              {shown.map((d) => <DefinitionCard key={d.id} d={d} canApprove={canApprove} onStatus={setStatus} />)}
            </div>
          )}
        </section>

        </div>

        {/* add a definition: always at hand */}
        <aside className="lg:sticky lg:top-20">
          <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-50px_rgba(49,46,129,0.45)] dark:border-slate-800 dark:bg-[#121622]">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></span>
                Add a definition
              </h2>
              <p className="mt-1 text-xs text-slate-500">For a term SlayQL did not find on its own.</p>
            </div>
            {input('term', 'Term', { required: true, placeholder: 'revenue' })}
            {input('synonyms', 'Also called', { placeholder: 'sales, jualan, hasil' })}
            <div className="grid grid-cols-2 gap-3">
              {input('table_name', 'Table', { required: true, placeholder: 'orders' })}
              {input('column_name', 'Column', { placeholder: 'status' })}
            </div>
            {input('filter_sql', 'Rule (SQL condition)', { placeholder: "status = 'completed'" })}
            {input('description', 'Description', { placeholder: 'Completed orders only' })}

            <p className="rounded-2xl bg-gradient-to-r from-indigo-50 via-violet-50 to-sky-50 px-3.5 py-3 text-xs leading-relaxed text-slate-700 dark:from-indigo-500/10 dark:via-violet-500/10 dark:to-sky-500/10 dark:text-slate-300">
              When someone asks about <b className="text-slate-950 dark:text-white">{form.term || 'this term'}</b>
              {form.synonyms ? <> (or {form.synonyms})</> : null}, SlayQL uses rows in{' '}
              <span className="font-mono text-slate-950 dark:text-white">{form.table_name || 'the table'}</span>
              {form.filter_sql ? <> where <code className="font-mono text-indigo-800 dark:text-indigo-200">{form.filter_sql}</code></> : ' (every row)'}.
            </p>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={form.approve} onChange={(e) => setForm({ ...form, approve: e.target.checked })} className="accent-indigo-600" />
              Approve now {canApprove ? '' : '(needs an owner or analyst)'}
            </label>
            <button type="submit" disabled={busy || !connectionId} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.8)] transition hover:brightness-110 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />} Save definition
            </button>
          </form>
        </aside>
        </div>
      </div>
    </main>
  );
}
