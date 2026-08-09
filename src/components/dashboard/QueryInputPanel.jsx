import React, { useRef, useEffect } from 'react';
import { Send, Loader2, Database, ChevronDown } from 'lucide-react';

export default function QueryInputPanel({
  value,
  onChange,
  onSubmit,
  queryState,     // 'idle' | 'generating' | 'generated' | 'executing' | 'success' | 'error'
  dbStatus,
  onManageDatabases,
  setActiveDatabase,
}) {
  const textareaRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const dropdownRef = useRef(null);
  const isLoading = queryState === 'generating' || queryState === 'executing';
  const canSubmit = value.trim().length > 0 && !isLoading;

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);
  
  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
    // Shift+Enter → natural newline (default browser behaviour)
  };

  const handleDbSelect = (dbId) => {
    if (setActiveDatabase) setActiveDatabase(dbId);
    setDropdownOpen(false);
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-2">
      
      {/* Database Selector Pill / Dropdown */}
      <div className="flex justify-start px-2 relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <Database className="w-3.5 h-3.5 text-indigo-500" />
          {dbStatus?.name || 'Select Database'}
          <ChevronDown className="w-3 h-3 text-slate-400 ml-1" />
        </button>
        
        {dropdownOpen && (
          <div className="absolute bottom-full left-2 mb-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden animate-fade-in-up">
            <div className="py-1">
              <button onClick={() => handleDbSelect('sqlite')} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                Spider2 / SQLite
              </button>
              <button onClick={() => handleDbSelect('bigquery')} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                BigQuery
              </button>
              <button onClick={() => handleDbSelect('snowflake')} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                Snowflake
              </button>
            </div>
            <div className="border-t border-slate-100 py-1">
              <button onClick={() => { setDropdownOpen(false); if (onManageDatabases) onManageDatabases(); }} className="w-full text-left px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:bg-slate-50 hover:text-slate-900 transition-colors">
                Manage Databases →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="relative bg-white border-2 border-slate-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 rounded-2xl shadow-sm transition-all overflow-hidden flex flex-col">
        
        <div className="flex items-end p-2 gap-2 relative">
          <textarea
            ref={textareaRef}
            id="query-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask a question about your database..."
            disabled={isLoading}
            className="flex-1 resize-none text-base text-slate-800 placeholder-slate-400 bg-transparent border-0 outline-none leading-relaxed py-2 pl-3 max-h-48 overflow-y-auto disabled:opacity-50"
            style={{ overflow: 'hidden' }}
          />

          <button
            onClick={() => onSubmit()}
            disabled={!canSubmit}
            className={[
              'flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-all',
              canSubmit
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed',
            ].join(' ')}
            aria-label="Generate SQL"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>
        
        {/* Footer info inside the input box (like ChatGPT's "ChatGPT can make mistakes") */}
        <div className="px-4 pb-2 text-center">
           <p className="text-[10px] text-slate-400">
             <kbd className="px-1 py-0.5 rounded bg-slate-50 border border-slate-200 font-mono text-[9px] mr-0.5">Enter</kbd> to submit &nbsp;·&nbsp;
             <kbd className="px-1 py-0.5 rounded bg-slate-50 border border-slate-200 font-mono text-[9px] mr-0.5">Shift + Enter</kbd> for new line
           </p>
        </div>
      </div>
    </div>
  );
}
