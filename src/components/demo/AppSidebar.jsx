import React, { useMemo, useState } from 'react';
import {
  BookOpen, Bookmark, ChevronDown, ChevronsUpDown, Coins, Database, Layers, LogOut, Moon, PanelLeftClose, PanelLeftOpen,
  Plus, Search, ShieldCheck, Sun, Trash2, UserRound, X,
} from 'lucide-react';
import AnalystAnswers from '../trust/AnalystAnswers';
import { fetchReviewItems } from '../../services/api';

// The workspace sidebar, in the pattern of modern chat apps (Claude, ChatGPT, Gemini): a new-chat
// button and chat search at the top, a short list of places, history as the main content grouped
// by date, and the account at the bottom. Collapsed on desktop it becomes an icon rail rather than
// disappearing; on small screens it is an overlay drawer.

function groupByDate(items) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const day = 86400000;
  const groups = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Previous 30 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const item of items) {
    const when = new Date(item.updated_at || item.created_at || 0).getTime();
    const index = when >= startOfToday.getTime() ? 0
      : when >= startOfToday.getTime() - day ? 1
      : when >= startOfToday.getTime() - 7 * day ? 2
      : when >= startOfToday.getTime() - 30 * day ? 3 : 4;
    groups[index].items.push(item);
  }
  return groups.filter((g) => g.items.length);
}

function RailButton({ icon: Icon, label, onClick, active, buttonRef, ...rest }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${active ? 'bg-slate-200/80 text-slate-900' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
      {...rest}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}

function NavRow({ icon: Icon, label, onClick, count, buttonRef, ...rest }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
      {...rest}
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count !== null && <span className="text-[11px] tabular-nums text-slate-400">{count}</span>}
    </button>
  );
}

export default function AppSidebar({
  theme, setTheme, open, setOpen, session, userName, avatarInitials, creditBalance, canReview,
  onNewChat, setView, onOpenCatalog, tableCount, onOpenSaved, savedCount,
  history, activeId, onOpenChat, loadingId, onDeleteChat, deletingId, isRunning,
  profileOpen, setProfileOpen, onSignOut,
}) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => localStorage.getItem('slayql_sidebar_more') === 'true');
  const toggleMore = () => setMoreOpen((v) => { localStorage.setItem('slayql_sidebar_more', String(!v)); return !v; });
  const dark = theme === 'dark';
  // On phones the drawer closes after choosing something, so you land on what you picked.
  const thenClose = (fn) => (...args) => {
    fn(...args);
    if (!window.matchMedia('(min-width: 768px)').matches) setOpen(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? history.filter((h) => (h.prompt || h.title || '').toLowerCase().includes(q)) : history;
  }, [history, query]);
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const avatar = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-semibold text-white">
      {session?.user?.avatar_data_url ? <img src={session.user.avatar_data_url} alt="" className="h-full w-full object-cover" /> : avatarInitials}
    </span>
  );

  const profileMenu = profileOpen && (
    <div className={`absolute bottom-full left-2 right-2 z-50 mb-2 overflow-hidden rounded-2xl border p-1.5 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] slide-in-up ${dark ? 'border-slate-700 bg-[#171c2b]' : 'border-slate-200 bg-white'} ${open ? '' : 'w-64 right-auto left-2'}`}>
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
        <p className="truncate text-xs text-slate-500">{session?.user?.email || 'Demo workspace'}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <Coins className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          <span className="tabular-nums">{Number(creditBalance || 0).toLocaleString()}</span> credits
        </p>
      </div>
      <div className={`my-1 h-px ${dark ? 'bg-slate-700' : 'bg-slate-100'}`} />
      {[
        { icon: UserRound, label: 'Profile settings', action: () => setView('profile') },
        { icon: Database, label: 'Database management', action: () => setView('databases') },
        { icon: dark ? Sun : Moon, label: dark ? 'Light appearance' : 'Dark appearance', action: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')), keepOpen: true },
      ].map(({ icon: Icon, label, action, keepOpen }) => (
        <button
          key={label}
          type="button"
          onClick={() => { if (!keepOpen) setProfileOpen(false); action(); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 transition hover:bg-slate-100"
        >
          <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /> {label}
        </button>
      ))}
      <div className={`my-1 h-px ${dark ? 'bg-slate-700' : 'bg-slate-100'}`} />
      <button
        type="button"
        onClick={() => { setProfileOpen(false); onSignOut(); }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-rose-600 transition hover:bg-rose-50"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
      </button>
    </div>
  );

  // ── Collapsed: icon rail (desktop only) ──
  if (!open) {
    return (
      <aside className={`relative z-30 hidden h-[100dvh] w-[60px] shrink-0 flex-col items-center border-r py-3 md:sticky md:top-0 md:flex ${dark ? 'border-slate-800 bg-[#121622]' : 'border-slate-200/80 bg-[#f9fafb]'}`}>
        <RailButton icon={PanelLeftOpen} label="Open sidebar (Ctrl+B)" onClick={() => setOpen(true)} />
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <RailButton icon={Plus} label="New chat" onClick={onNewChat} />
          <RailButton icon={Search} label="Search chats" onClick={() => { setOpen(true); setSearchOpen(true); }} />
        </div>
        <div className={`my-3 h-px w-8 ${dark ? 'bg-slate-800' : 'bg-slate-200'}`} />
        <div className="flex flex-col items-center gap-1.5">
          <RailButton icon={Database} label="AI Database Lab" onClick={() => setView('databases')} />
          <RailButton icon={Bookmark} label="Saved queries" onClick={onOpenSaved} />
          <RailButton icon={Layers} label="Schema catalog" onClick={onOpenCatalog} />
          <RailButton icon={BookOpen} label="Definitions" onClick={() => setView('definitions')} />
          {canReview && <RailButton icon={ShieldCheck} label="Review queue" onClick={() => setView('review')} />}
        </div>
        <div className="relative mt-auto">
          <button type="button" onClick={() => setProfileOpen(!profileOpen)} aria-label="Account" title={userName} className="rounded-full transition hover:ring-4 hover:ring-indigo-100">
            {avatar}
          </button>
          {profileMenu}
        </div>
      </aside>
    );
  }

  // ── Expanded ──
  return (
    <>
      <button type="button" onClick={() => setOpen(false)} className="fixed inset-0 z-20 bg-slate-950/30 md:hidden" aria-label="Close sidebar" />
      <aside className={`fixed inset-y-0 left-0 z-30 flex h-[100dvh] w-[272px] shrink-0 flex-col border-r md:sticky md:top-0 ${dark ? 'border-slate-800 bg-[#121622]' : 'border-slate-200/80 bg-[#f9fafb]'}`}>
        {/* brand + collapse */}
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <span className="slayql-logo px-1.5 text-[22px] tracking-tight"><span className="slay">Slay</span><span className="ql">QL</span></span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title="Close sidebar (Ctrl+B)"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        {/* new chat + search */}
        <div className="space-y-1 px-3">
          <button
            type="button"
            onClick={thenClose(onNewChat)}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-900 transition hover:bg-slate-100"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></span>
            New chat
          </button>
          {searchOpen ? (
            <label className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setSearchOpen(false); } }}
                placeholder="Search chats"
                aria-label="Search chats"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-900 placeholder-slate-400 outline-none"
              />
              <button type="button" onClick={() => { setQuery(''); setSearchOpen(false); }} aria-label="Close search" className="rounded p-0.5 text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </label>
          ) : (
            <NavRow icon={Search} label="Search chats" onClick={() => setSearchOpen(true)} />
          )}
        </div>

        {/* places */}
        <nav className="mt-2 space-y-0.5 px-3" aria-label="Workspace">
          <NavRow icon={Database} label="AI Database Lab" onClick={thenClose(() => setView('databases'))} />
          <NavRow icon={Bookmark} label="Saved queries" count={savedCount} onClick={thenClose(onOpenSaved)} />
          <NavRow icon={BookOpen} label="Definitions" onClick={thenClose(() => setView('definitions'))} />
          {canReview && <NavRow icon={ShieldCheck} label="Review queue" onClick={thenClose(() => setView('review'))} onMouseEnter={() => fetchReviewItems('open').catch(() => {})} onFocus={() => fetchReviewItems('open').catch(() => {})} />}
          <AnalystAnswers enabled={Boolean(session)} />
          <button
            type="button"
            onClick={toggleMore}
            aria-expanded={moreOpen}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            {moreOpen ? 'Less' : 'More'}
          </button>
          {moreOpen && (
            <div className="space-y-0.5">
              <NavRow icon={Layers} label="Schema catalog" count={tableCount} onClick={thenClose(onOpenCatalog)} />
            </div>
          )}
        </nav>

        {/* history: the main content, grouped by date */}
        <div className={`relative mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-3 pb-6 [mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)] ${dark ? 'border-slate-800' : 'border-slate-200/70'}`}>
          {history.length === 0 ? (
            <p className="px-2.5 pt-3 text-[13px] text-slate-400">Your chats will appear here.</p>
          ) : groups.length === 0 ? (
            <p className="px-2.5 pt-3 text-[13px] text-slate-400">No chats match "{query}".</p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="pt-2">
                <p className={`sticky top-0 z-[1] px-2.5 pb-1 pt-1 text-[11px] font-medium text-slate-400 ${dark ? 'bg-[#121622]' : 'bg-[#f9fafb]'}`}>{group.label}</p>
                <ul className="space-y-px">
                  {group.items.map((chat) => {
                    const active = activeId === chat.id;
                    return (
                      <li key={chat.id} className="group relative">
                        <button
                          type="button"
                          onClick={thenClose(() => onOpenChat(chat.id))}
                          disabled={isRunning}
                          title={chat.prompt}
                          className={`flex w-full items-center rounded-lg py-1.5 pl-2.5 pr-8 text-left text-[13px] transition ${
                            active
                              ? dark ? 'bg-slate-800 text-white' : 'bg-slate-200/70 text-slate-950'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">{chat.prompt}</span>
                          {loadingId === chat.id && <span className="ml-2 h-1.5 w-1.5 shrink-0 animate-ping rounded-full bg-indigo-500" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteChat(chat); }}
                          disabled={deletingId === chat.id}
                          aria-label={`Delete chat: ${chat.prompt}`}
                          title="Delete chat"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                        >
                          <Trash2 className={`h-3.5 w-3.5 ${deletingId === chat.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* account */}
        <div className={`relative border-t p-2 ${dark ? 'border-slate-800' : 'border-slate-200/80'}`}>
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            aria-expanded={profileOpen}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-100"
          >
            {avatar}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-slate-900">{userName}</span>
              <span className="block truncate text-[11px] text-slate-500">{session?.user?.email || 'Demo workspace'}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </button>
          {profileMenu}
        </div>
      </aside>
    </>
  );
}
