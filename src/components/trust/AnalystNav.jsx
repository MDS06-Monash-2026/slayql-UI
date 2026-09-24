import React, { useEffect, useState } from 'react';
import { fetchReviewCount } from '../../services/api';

const LINKS = [
  { id: 'demo', label: 'Ask' },
  { id: 'review', label: 'Review queue' },
  { id: 'definitions', label: 'Definitions' },
  { id: 'databases', label: 'Database Lab' },
];

export default function AnalystNav({ current, setView, session }) {
  const [openCount, setOpenCount] = useState(null);
  useEffect(() => {
    fetchReviewCount().then((data) => setOpenCount(data.open)).catch(() => setOpenCount(null));
  }, [current]);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-[#0f131d]">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-3 font-bold text-indigo-600">SlayQL</span>
        {LINKS.map((link) => (
          <button key={link.id} type="button" onClick={() => setView(link.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${current === link.id ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            {link.label}
            {link.id === 'review' && openCount ? <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{openCount}</span> : null}
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-500">{session?.user?.email}</span>
    </nav>
  );
}
