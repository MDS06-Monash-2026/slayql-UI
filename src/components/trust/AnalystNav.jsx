import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Inbox } from 'lucide-react';
import { fetchReviewCount } from '../../services/api';

// Header for the analyst pages. Two jobs live here: deciding on questions SlayQL was unsure
// about (Review queue, with what is waiting) and settling what business terms mean
// (Definitions). Everyone arrives from the chat, so the way back is always first.
const TABS = [
  { id: 'review', label: 'Review queue', icon: Inbox, hint: 'Questions waiting for an analyst decision' },
  { id: 'definitions', label: 'Definitions', icon: BookOpen, hint: 'What business terms mean, approved once' },
];

export default function AnalystNav({ current, setView, session, openCount: openCountProp }) {
  const [fetched, setFetched] = useState(null);
  useEffect(() => {
    if (openCountProp !== undefined) return;
    fetchReviewCount().then((data) => setFetched(data.open)).catch(() => setFetched(null));
  }, [current, openCountProp]);
  const openCount = openCountProp !== undefined ? openCountProp : fetched;
  const name = session?.user?.name || 'Analyst';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'A';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-[#0f131d]/90">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setView('demo')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Back to chat</span>
        </button>
        <span className="h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <span className="slayql-logo text-[22px] tracking-tight"><span className="slay">Slay</span><span className="ql">QL</span></span>

        <nav aria-label="Analyst pages" className="ml-2 flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
          {TABS.map(({ id, label, icon: Icon, hint }) => {
            const on = current === id;
            return (
              <button
                key={id}
                type="button"
                title={hint}
                aria-current={on ? 'page' : undefined}
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  on ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
                {id === 'review' && openCount > 0 && (
                  <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold tabular-nums text-white">{openCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden text-right sm:block">
            <span className="block text-[13px] font-medium leading-tight text-slate-900 dark:text-slate-100">{name}</span>
            <span className="block text-[11px] leading-tight text-slate-500">{session?.user?.email}</span>
          </span>
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-semibold text-white">
            {session?.user?.avatar_data_url ? <img src={session.user.avatar_data_url} alt="" className="h-full w-full object-cover" /> : initials}
          </span>
        </div>
      </div>
    </header>
  );
}
