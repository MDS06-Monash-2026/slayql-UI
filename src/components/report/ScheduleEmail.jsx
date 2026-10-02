import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CalendarDays, Check, Loader2, Mail, Newspaper, Send, Trash2, X } from 'lucide-react';
import {
  createReportSchedule,
  deleteReportSchedule,
  fetchReportSchedules,
  getStoredSession,
  previewReportSchedule,
  sendReportScheduleNow,
} from '../../services/api';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CADENCES = [
  { id: 'weekly', label: 'Weekly', Icon: CalendarDays, hint: 'Covers the Monday-to-Sunday week that just ended' },
  { id: 'monthly', label: 'Monthly', Icon: CalendarClock, hint: 'Covers the calendar month that just ended' },
];

function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}

// Schedule a report as a newspaper-style email edition. Each send re-runs and re-checks every figure
// for the period that just ended, without AI.
export default function ScheduleEmail({ connectionId, report, onClose }) {
  const [cadence, setCadence] = useState(report?.period?.grain === 'month' ? 'monthly' : 'weekly');
  const [weekday, setWeekday] = useState(0);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(8);
  const [recipients, setRecipients] = useState(() => [getStoredSession()?.user?.email].filter(Boolean));
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetchReportSchedules().then((list) => setSchedules(list.filter((s) => s.connection_id === connectionId))).catch(() => {});
  }, [connectionId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      previewReportSchedule(connectionId, { report, cadence, weekday, dayOfMonth, hour })
        .then((data) => { if (!cancelled) setPreview(data); })
        .catch((err) => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [connectionId, report, cadence, weekday, dayOfMonth, hour]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addRecipient = (value) => {
    const parts = value.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);
    const valid = parts.filter((p) => EMAIL.test(p) && !recipients.includes(p));
    if (valid.length) setRecipients([...recipients, ...valid].slice(0, 10));
    setDraft(parts.filter((p) => !EMAIL.test(p)).join(' '));
  };

  const run = async (key, action) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      setError(err.status === 403 ? 'Only an owner or analyst can schedule report emails.' : err.message);
    } finally {
      setBusy('');
    }
  };

  const create = () => run('create', async () => {
    const list = draft.trim() ? [...recipients, ...draft.split(/[,;\s]+/).filter((p) => EMAIL.test(p))] : recipients;
    const created = await createReportSchedule({ connectionId, report, recipients: list, cadence, weekday, dayOfMonth, hour });
    setNotice(`Scheduled: ${created.when}. Send a test to see what arrives.`);
    load();
  });

  const field = 'h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-label="Automate this report">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#121622]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><Newspaper className="h-5 w-5" /></span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Automate this report</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Delivered as a newspaper-style brief. Every figure is re-run and re-checked for the period that just ended. No AI, no credits.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[380px_minmax(0,1fr)] lg:overflow-hidden">
          <div className="space-y-5 border-b border-slate-200 p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-slate-800">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">How often</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {CADENCES.map(({ id, label, Icon, hint }) => {
                  const on = cadence === id;
                  return (
                    <button key={id} type="button" onClick={() => setCadence(id)} aria-pressed={on}
                      className={`rounded-2xl border p-3 text-left transition ${on ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-500/15' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700'}`}>
                      <span className="flex items-center justify-between">
                        <Icon className={`h-4 w-4 ${on ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400'}`} />
                        {on && <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />}
                      </span>
                      <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {cadence === 'weekly' ? (
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Send on</legend>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day, index) => (
                    <button key={day} type="button" onClick={() => setWeekday(index)} aria-pressed={weekday === index}
                      className={`rounded-lg py-2 text-xs font-semibold transition ${weekday === index ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                      {day}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">Monday is best: the edition covers the full week before.</p>
              </fieldset>
            ) : (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Send on the</span>
                <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className={`mt-2 w-full ${field}`}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)} of each month</option>)}
                </select>
                <p className="mt-1.5 text-[11px] text-slate-500">The 1st is best: the edition covers the full month before.</p>
              </label>
            )}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">At (Malaysia time)</span>
              <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={`mt-2 w-full ${field}`}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
              </select>
            </label>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Send to</span>
              <div className="mt-2 flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 p-1.5 focus-within:border-indigo-500 dark:border-slate-700">
                {recipients.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 py-1 pl-2 pr-1 text-xs font-medium text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">
                    {r}
                    <button type="button" onClick={() => setRecipients(recipients.filter((x) => x !== r))} className="rounded p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-500/25" aria-label={`Remove ${r}`}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft && addRecipient(draft)}
                  onKeyDown={(e) => { if (['Enter', ',', ' '].includes(e.key)) { e.preventDefault(); addRecipient(draft); } }}
                  placeholder={recipients.length ? 'Add another' : 'name@company.com.my'}
                  className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none dark:text-slate-100" />
              </div>
            </div>

            {error && <p className="rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
            {notice && <p className="rounded-xl bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" aria-live="polite">{notice}</p>}

            <button type="button" onClick={create} disabled={Boolean(busy) || (!recipients.length && !draft.trim())}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.8)] transition hover:brightness-110 disabled:opacity-50">
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Schedule {cadence} edition
            </button>

            {schedules.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Already scheduled for this data source</p>
                <ul className="mt-2 space-y-2">
                  {schedules.map((s) => (
                    <li key={s.id} className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-700">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{s.title}</p>
                          <p className="text-slate-500 dark:text-slate-400">{s.when}</p>
                          <p className="truncate text-slate-500 dark:text-slate-400">To {s.recipients.join(', ')}</p>
                          {s.last_status && <p className="mt-0.5 text-slate-500">Last: {s.last_status}</p>}
                        </div>
                        <button type="button" onClick={() => run(s.id, async () => { setNotice((await sendReportScheduleNow(s.id)).status); load(); })} disabled={Boolean(busy)} title="Send a test now"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50 dark:hover:bg-slate-800">
                          {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                        <button type="button" onClick={() => run(s.id, async () => { await deleteReportSchedule(s.id); load(); })} disabled={Boolean(busy)} title="Stop sending"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/15"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex min-h-[520px] flex-col bg-slate-100/70 dark:bg-[#0b0e16]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-5 py-3 text-xs dark:border-slate-800 dark:bg-[#121622]">
              {preview ? (
                <>
                  <span className="text-slate-500">Next edition <b className="font-semibold text-slate-900 dark:text-white">{preview.next_send_label}</b></span>
                  <span className="text-slate-500">Covers <b className="font-semibold text-slate-900 dark:text-white">{preview.period?.label}</b>{preview.period?.prev_label ? ` · vs ${preview.period.prev_label}` : ''}</span>
                  {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />}
                </>
              ) : <span className="inline-flex items-center gap-2 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing the preview…</span>}
            </div>
            {preview?.period?.note && <p className="bg-amber-50 px-5 py-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{preview.period.note}</p>}
            <div className="min-h-0 flex-1 p-3">
              {preview ? (
                <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700">
                  <p className="truncate border-b border-slate-100 px-4 py-2 text-xs text-slate-600"><b className="text-slate-900">Subject:</b> {preview.subject}</p>
                  <iframe title="Email preview" srcDoc={preview.html} sandbox="" className={`min-h-[460px] w-full flex-1 bg-white transition-opacity ${previewing ? 'opacity-60' : ''}`} />
                </div>
              ) : <div className="skel h-full min-h-[460px] rounded-2xl" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
