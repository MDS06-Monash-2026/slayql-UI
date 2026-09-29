import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import AnalystNav from '../components/trust/AnalystNav';
import LearningPanel from '../components/trust/LearningPanel';
import TrustBadge from '../components/trust/TrustBadge';
import { fetchCalibration, fetchConnections, fetchReviewItems, resolveReviewItem } from '../services/api';

const SOURCE_LABELS = { handoff: 'Handed off', clarify: 'Needed clarification', flag: 'Flagged by a user' };

function ReviewItem({ item, onResolved }) {
  const [mode, setMode] = useState(null);
  const [correctedSql, setCorrectedSql] = useState(item.sql || '');
  const [note, setNote] = useState('');
  const [saveVerified, setSaveVerified] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verification = item.verification || {};
  const findings = verification.findings || [];

  const resolve = async (resolution) => {
    setBusy(true);
    setError('');
    try {
      await resolveReviewItem(item.id, {
        resolution,
        note,
        correctedSql: resolution === 'corrected' ? correctedSql : null,
        saveVerifiedQuery: resolution !== 'dismissed' && saveVerified,
      });
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121622]">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{SOURCE_LABELS[item.source] || item.source}</span>
        {verification.outcome && <TrustBadge outcome={verification.outcome} size="sm" />}
        <span className="text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
      </div>
      <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{item.question}</p>
      {item.note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">User note: {item.note}</p>}
      {findings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 dark:text-slate-300">
          {findings.map((f, i) => <li key={i}><b>{f.title}.</b> {f.detail}</li>)}
        </ul>
      )}
      {(verification.clarify_options || []).length > 0 && (
        <ul className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          {verification.clarify_options.map((o) => <li key={o.label}>{o.label}: <span className="font-mono">{o.preview}</span></li>)}
        </ul>
      )}
      {item.sql && <pre className="mt-2 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{item.sql}</pre>}

      {item.status === 'open' ? (
        <div className="mt-3 space-y-2">
          {mode === 'correct' && (
            <textarea value={correctedSql} onChange={(e) => setCorrectedSql(e.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900" />
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the record (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={saveVerified} onChange={(e) => setSaveVerified(e.target.checked)} />
            Save as a verified query, so this question is answered with this SQL next time
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {mode === 'correct' ? (
              <button type="button" disabled={busy} onClick={() => resolve('corrected')} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save correction
              </button>
            ) : (
              <>
                <button type="button" disabled={busy || !item.sql} onClick={() => resolve('confirmed')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  <Check className="h-4 w-4" /> Answer is right
                </button>
                <button type="button" onClick={() => setMode('correct')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold">
                  <Pencil className="h-4 w-4" /> Correct the SQL
                </button>
              </>
            )}
            <button type="button" disabled={busy} onClick={() => resolve('dismissed')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
              <X className="h-4 w-4" /> Dismiss
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {item.resolution} by {item.reviewed_by || 'an analyst'}{item.resolution_note ? `: ${item.resolution_note}` : ''}
        </p>
      )}
    </li>
  );
}

export default function ReviewQueueView({ setView, session }) {
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchReviewItems(status));
    } catch (err) {
      setError(err.status === 401 || err.status === 403 ? 'The review queue needs the analyst or owner role. Ask an owner of your organisation.' : err.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const [connections, setConnections] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [calibration, setCalibration] = useState(null);

  useEffect(() => {
    fetchConnections().then((list) => {
      setConnections(list);
      setConnectionId((current) => current || (list.find((c) => c.is_default) || list[0])?.id || '');
    }).catch(() => {});
  }, []);

  const loadCalibration = useCallback(() => {
    if (!connectionId) return;
    fetchCalibration(connectionId).then(setCalibration).catch(() => setCalibration(null));
  }, [connectionId]);

  useEffect(() => { loadCalibration(); }, [loadCalibration]);

  const handleResolved = () => {
    load();
    loadCalibration();
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0b0e16]">
      <AnalystNav current="review" setView={setView} session={session} />
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Review queue</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Questions SlayQL was not sure about, or that someone flagged. Each arrives with its SQL and checks.</p>
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        {!error && (
          <LearningPanel status={calibration} connections={connections} connectionId={connectionId} onConnectionChange={setConnectionId} />
        )}
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p> : (
          items.length === 0 ? <p className="text-slate-500">Nothing here.</p> : (
            <ul className="space-y-3">{items.map((item) => <ReviewItem key={item.id} item={item} onResolved={handleResolved} />)}</ul>
          )
        )}
      </div>
    </main>
  );
}
