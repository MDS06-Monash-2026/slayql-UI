import React from 'react';
import { Bell, ChevronRight, Menu } from 'lucide-react';

const SECTION_LABELS = {
  home: 'Workspace',
  history: 'Query History',
  databases: 'Databases',
  explorer: 'Data Explorer',
  results: 'Query Results',
  docs: 'Documentation',
  settings: 'Settings',
  help: 'Help & Support',
};

export default function DashboardHeader({ dbStatus, activeSection, onMobileMenuToggle }) {
  const isConnected = dbStatus?.status === 'connected';

  return (
    <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 z-10">

      {/* Mobile hamburger */}
      <button
        onClick={onMobileMenuToggle}
        className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all -ml-1"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm min-w-0" aria-label="Breadcrumb">
        <span className="text-slate-400 font-medium hidden sm:inline">Workspace</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline flex-shrink-0" />
        <span className="text-slate-800 font-semibold truncate">
          {SECTION_LABELS[activeSection] ?? 'Workspace'}
        </span>
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">

        {/* DB connection badge */}
        {dbStatus && (
          <div className={[
            'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium',
            isConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-600',
          ].join(' ')}>
            <span className={[
              'w-1.5 h-1.5 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-red-500',
            ].join(' ')} />
            {dbStatus.name}
          </div>
        )}

        {/* Notification bell */}
        <button
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {/* Unread dot */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center cursor-pointer">
          <span className="text-xs font-bold text-white">JD</span>
        </div>
      </div>
    </header>
  );
}
