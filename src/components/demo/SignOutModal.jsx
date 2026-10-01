import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Sign-out confirmation in the style of modern chat apps: one calm question, the account it
// applies to, and two clear choices. Escape or a click outside cancels; Cancel has focus first,
// so pressing Enter by accident never signs anyone out.
export default function SignOutModal({ isOpen, onClose, onConfirm, user }) {
  const cancelRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) { setBusy(false); return undefined; }
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const name = user?.name || 'Demo user';
  const email = user?.email || '';
  const initials = user?.avatar_initials
    || name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
    || 'U';

  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="signout-title"
        aria-describedby="signout-description"
        className="w-full max-w-[400px] rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-24px_rgba(15,23,42,0.45)] slide-in-up"
      >
        <h2 id="signout-title" className="text-lg font-semibold tracking-tight text-slate-950">Sign out of SlayQL?</h2>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-semibold text-white">
            {user?.avatar_data_url ? <img src={user.avatar_data_url} alt="" className="h-full w-full object-cover" /> : initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
            {email && <span className="block truncate text-xs text-slate-500">{email}</span>}
          </span>
        </div>

        <p id="signout-description" className="mt-4 text-sm leading-relaxed text-slate-600">
          Your chats, saved queries and database connections stay saved. Sign in again to pick up where you left off.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}
