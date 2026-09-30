import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Send, Trash2, X } from 'lucide-react';
import {
  createReportSchedule,
  deleteReportSchedule,
  fetchReportSchedules,
  getStoredSession,
  sendReportScheduleNow,
} from '../../services/api';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const field = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

// Email a report every week. Each delivery re-runs and re-checks every figure on that day's data, without AI.
export default function ScheduleEmail({ connectionId, report, onClose }) {
  const [recipients, setRecipients] = useState(() => getStoredSession()?.user?.email || '');
  const [weekday, setWeekday] = useState(0);
  const [hour, setHour] = useState(8);
  const [schedules, setSchedules] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetchReportSchedules()
      .then((list) => setSchedules(list.filter((s) => s.connection_id === connectionId)))
      .catch(() => {});
  }, [connectionId]);

  useEffect(() => { load(); }, [load]);

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
    const list = recipients.split(/[,;\s]+/).map((r) => r.trim()).filter(Boolean);
    const created = await createReportSchedule({ connectionId, report, recipients: list, weekday, hour });
    setNotice(`Scheduled: ${created.when}. Send a test to see what arrives.`);
    load();
  });

  const sendNow = (schedule) => run(schedule.id, async () => {
    const result = await sendReportScheduleNow(schedule.id);
    setNotice(result.status);
    load();
  });

  const remove = (schedule) => run(schedule.id, async () => {
    await deleteReportSchedule(schedule.id);
    load();
  });

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 print:hidden dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden="true" /> Email this report every week
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Each email re-runs every figure on that day&apos;s data and checks it again. No AI is used. Figures that fail their checks are held back for your analyst.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[16rem] flex-1 flex-col text-xs font-semibold text-slate-700 dark:text-slate-300">
          Send to (comma separated)
          <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="finance@company.com.my" className={`mt-1 font-normal ${field}`} />
        </label>
        <label className="flex flex-col text-xs font-semibold text-slate-700 dark:text-slate-300">
          Every
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={`mt-1 font-normal ${field}`}>
            {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold text-slate-700 dark:text-slate-300">
          At (Malaysia time)
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={`mt-1 font-normal ${field}`}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
          </select>
        </label>
        <button type="button" onClick={create} disabled={Boolean(busy) || !recipients.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Schedule
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {notice && <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400" aria-live="polite">{notice}</p>}

      {schedules.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{schedule.title}</p>
                <p className="text-slate-500 dark:text-slate-400">
                  {schedule.when} to {schedule.recipients.join(', ')}
                  {schedule.last_status ? ` · Last: ${schedule.last_status}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => sendNow(schedule)} disabled={Boolean(busy)} title="Send it now to check what arrives"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {busy === schedule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test now
              </button>
              <button type="button" onClick={() => remove(schedule)} disabled={Boolean(busy)} title="Stop sending"
                className="rounded p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
