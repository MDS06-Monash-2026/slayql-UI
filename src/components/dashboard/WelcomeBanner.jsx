import React from 'react';
import { Sparkles } from 'lucide-react';

export default function WelcomeBanner({ userName = 'Jane' }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
                'Good evening';

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">
          {greeting}, {userName}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
          Ask your database anything.
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 max-w-lg leading-relaxed">
          Turn natural-language questions into SQL, execute queries, and explore
          your data — without manually writing complex SQL.
        </p>
      </div>

      {/* Decorative icon */}
      <div className="hidden sm:flex flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 items-center justify-center">
        <Sparkles className="w-5 h-5 text-indigo-500" />
      </div>
    </div>
  );
}
