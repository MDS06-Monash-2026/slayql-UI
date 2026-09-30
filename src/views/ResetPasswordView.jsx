import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { confirmPasswordReset } from '../services/api';

const input = 'w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

// Where the emailed reset link lands: choose a new password with the one-time token.
export default function ResetPasswordView({ setView }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== again) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
        {done ? (
          <div className="mt-4 space-y-4">
            <p className="flex items-start gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Password changed. Other devices have been signed out.
            </p>
            <button type="button" onClick={() => setView('login')}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
              Sign in
            </button>
          </div>
        ) : !token ? (
          <p className="mt-3 text-sm text-slate-600">
            This page needs the link from your reset email. <button type="button" onClick={() => setView('login')} className="font-semibold text-indigo-600 hover:underline">Ask for a new link</button>.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {[['New password', password, setPassword], ['Type it again', again, setAgain]].map(([label, value, set]) => (
              <label key={label} className="block text-xs font-bold text-slate-700">
                {label}
                <span className="relative mt-1.5 block">
                  <KeyRound className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input type="password" value={value} onChange={(e) => set(e.target.value)} minLength={8} required
                    autoComplete="new-password" placeholder="At least 8 characters" className={input} />
                </span>
              </label>
            ))}
            {error && <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700" role="alert">{error}</p>}
            <button type="submit" disabled={busy || password.length < 8}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save new password
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
