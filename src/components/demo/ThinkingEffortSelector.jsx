import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Check, ChevronDown } from 'lucide-react';

export const THINKING_EFFORT_LEVELS = [
  { id: 'minimal', label: 'Minimal', bars: 1 },
  { id: 'low', label: 'Low', bars: 2 },
  { id: 'medium', label: 'Medium', bars: 3 },
  { id: 'high', label: 'High', bars: 4 },
  { id: 'max', label: 'Max', bars: 5 },
];

export default function ThinkingEffortSelector({ value, onChange, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const activeLevel = THINKING_EFFORT_LEVELS.find((level) => level.id === value)
    || THINKING_EFFORT_LEVELS[0];

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        className="h-7 min-w-7 inline-flex items-center justify-center gap-1.5 rounded-lg px-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40 transition-colors"
        title={`Thinking effort: ${activeLevel.label}`}
        aria-label={`Thinking effort: ${activeLevel.label}`}
        aria-expanded={isOpen}
      >
        <BrainCircuit className="w-3.5 h-3.5" />
        <span className="hidden sm:inline text-[11px] font-semibold">{activeLevel.label}</span>
        <ChevronDown className={`hidden sm:block w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl z-50">
          {THINKING_EFFORT_LEVELS.map((level) => {
            const selected = level.id === activeLevel.id;
            return (
              <button
                key={level.id}
                type="button"
                onClick={() => {
                  onChange(level.id);
                  setIsOpen(false);
                }}
                className={`w-full h-8 px-2 flex items-center justify-between rounded-md text-xs font-medium transition-colors ${
                  selected
                    ? 'bg-amber-50 text-amber-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{level.label}</span>
                <span className="flex items-end gap-0.5 h-3" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((bar) => (
                    <span
                      key={bar}
                      className={`w-1 ${bar <= level.bars ? 'bg-amber-500' : 'bg-slate-200'}`}
                      style={{ height: `${3 + bar * 1.5}px` }}
                    />
                  ))}
                  {selected && <Check className="w-3.5 h-3.5 ml-1 text-amber-700" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
