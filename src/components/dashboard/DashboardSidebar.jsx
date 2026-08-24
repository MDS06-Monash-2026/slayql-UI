import React, { useState } from 'react';
import {
  Home, Clock, Database,
  LayoutGrid, BookOpen,
  Settings, HelpCircle, LogOut,
  ChevronLeft, ChevronRight, Zap,
  X,
} from 'lucide-react';

// ─── Navigation config ────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    items: [
      { id: 'home',      icon: Home,     label: 'Home' },
      { id: 'history',   icon: Clock,    label: 'Query History' },
      { id: 'databases', icon: Database, label: 'Databases' },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      { id: 'explorer', icon: LayoutGrid, label: 'Data Explorer' },
      { id: 'docs',     icon: BookOpen,   label: 'Documentation' },
    ],
  },
];

const BOTTOM_NAV = [
  { id: 'settings', icon: Settings,   label: 'Settings' },
  { id: 'help',     icon: HelpCircle, label: 'Help & Support' },
];

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({ item, active, collapsed, onClick }) {
  return (
    <button
      onClick={() => onClick(item.id)}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={[
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left',
        active
          ? 'bg-indigo-50 text-indigo-700 shadow-sm'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
      ].join(' ')}
    >
      <item.icon
        className={[
          'flex-shrink-0 w-4 h-4 transition-colors',
          active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600',
        ].join(' ')}
      />
      {!collapsed && (
        <span className="truncate">{item.label}</span>
      )}
      {active && !collapsed && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0" />
      )}
    </button>
  );
}

// ─── DashboardSidebar ─────────────────────────────────────────────────────────

export default function DashboardSidebar({
  activeSection,
  onSectionChange,
  isCollapsed,
  onToggle,
  setView,
  mobileOpen,
  onMobileClose,
}) {
  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* Logo & Brand */}
      <div className={[
        'flex items-center border-b border-slate-100 flex-shrink-0',
        isCollapsed ? 'justify-center px-2 py-4' : 'gap-3 px-4 py-4',
      ].join(' ')}>
        <div className="flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden shadow-sm flex items-center justify-center">
          <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <span className="text-sm font-bold tracking-tight text-slate-900 block">SlayQL</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Workspace</span>
          </div>
        )}
        {!isCollapsed && (
          <button
            onClick={onToggle}
            className="ml-auto p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex-shrink-0"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapsed expand button */}
      {isCollapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mt-2 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" role="navigation" aria-label="Workspace navigation">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-3' : ''}>
            {section.heading && !isCollapsed && (
              <p className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {section.heading}
              </p>
            )}
            {section.heading && isCollapsed && (
              <div className="my-2 mx-3 border-t border-slate-100" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  active={activeSection === item.id}
                  collapsed={isCollapsed}
                  onClick={(id) => {
                    onSectionChange(id);
                    if (onMobileClose) onMobileClose();
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: settings + user */}
      <div className="flex-shrink-0 border-t border-slate-100 px-2 py-3 space-y-0.5">
        {BOTTOM_NAV.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={activeSection === item.id}
            collapsed={isCollapsed}
            onClick={onSectionChange}
          />
        ))}

        {/* Divider */}
        <div className="my-2 mx-1 border-t border-slate-100" />

        {/* User Profile Row */}
        {isCollapsed ? (
          <button
            onClick={() => setView('landing')}
            title="Log out"
            className="w-full flex justify-center p-2.5 rounded-lg hover:bg-red-50 transition-all group"
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-all cursor-default">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">JD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">Jane Doe</p>
              <p className="text-[10px] text-slate-400 truncate">jane@example.com</p>
            </div>
            <button
              onClick={() => setView('landing')}
              title="Log out"
              className="flex-shrink-0 p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={[
          'hidden md:flex flex-col bg-white border-r border-slate-200 flex-shrink-0',
          'transition-all duration-200 ease-in-out',
          isCollapsed ? 'w-14' : 'w-60',
        ].join(' ')}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile Drawer Backdrop ──────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-enter"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile Drawer ───────────────────────────────────────────────── */}
      <aside
        className={[
          'md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col',
          'transition-transform duration-200 ease-in-out',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900">SlayQL</span>
          </div>
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-all"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SidebarContent />
        </div>
      </aside>
    </>
  );
}
