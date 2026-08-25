import React, { useState, useEffect } from 'react';

export const THINKING_EFFORT_LEVELS = [
  { id: 'minimal', label: 'Minimal', color: '#ef4444', text: 'Fastest response' },
  { id: 'low',     label: 'Low',     color: '#f59e0b', text: 'Quick analysis' },
  { id: 'medium',  label: 'Balanced', color: '#6366f1', text: 'Balanced reasoning' },
  { id: 'high',    label: 'Thorough', color: '#8b5cf6', text: 'Deep exploration' },
  { id: 'max',     label: 'Max',     color: '#7c3aed', text: 'Maximum depth' },
];

const INDEX_MAP = THINKING_EFFORT_LEVELS.reduce((acc, lvl, i) => {
  acc[lvl.id] = i; return acc;
}, {});

export default function ThinkingEffortSelector({ value, onChange, disabled = false }) {
  const [isHolding, setIsHolding] = useState(false);
  const activeIdx = INDEX_MAP[value] ?? 0;
  const activeLevel = THINKING_EFFORT_LEVELS[activeIdx];

  // Travel range math:
  // bar width: 104px, padding: 3px each side, knob size: 16px
  // available travel distance = 104 - 6 - 16 = 82px
  const knobLeft = 3 + (activeIdx / (THINKING_EFFORT_LEVELS.length - 1)) * 82;

  useEffect(() => {
    if (!isHolding) return;
    const handleRelease = () => setIsHolding(false);
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchend', handleRelease);
    return () => {
      window.removeEventListener('mouseup', handleRelease);
      window.removeEventListener('touchend', handleRelease);
    };
  }, [isHolding]);

  return (
    <div
      className="relative flex flex-col items-center justify-center select-none"
      style={{ width: 104 }}
    >
      {/* Floating Animated Bubble Tooltip — ONLY visible when holding to move */}
      <div
        className="absolute pointer-events-none transition-all duration-150"
        style={{
          bottom: '100%',
          left: `clamp(18px, ${knobLeft + 8}px, 86px)`,
          transform: isHolding ? 'translateX(-50%) scale(1)' : 'translateX(-50%) scale(0.85)',
          opacity: isHolding ? 1 : 0,
          marginBottom: 7,
        }}
      >
        <div
          className="text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-md whitespace-nowrap relative flex items-center gap-1"
          style={{
            backgroundColor: activeLevel.color,
            boxShadow: `0 0 12px ${activeLevel.color}77`,
          }}
        >
          <span>{activeLevel.label}</span>
          <span
            className="absolute left-1/2 -translate-x-1/2 top-full"
            style={{
              width: 0,
              height: 0,
              borderLeft: '3.5px solid transparent',
              borderRight: '3.5px solid transparent',
              borderTop: `3.5px solid ${activeLevel.color}`,
            }}
          />
        </div>
      </div>

      {/* Encapsulating Capsule Bar */}
      <div
        className="relative w-[104px] h-[22px] rounded-full p-[3px] border border-slate-200/90 dark:border-slate-700/90 shadow-2xs flex items-center cursor-pointer transition-all hover:border-slate-300 dark:hover:border-slate-600"
        style={{
          background: 'linear-gradient(90deg, rgba(239,68,68,0.18) 0%, rgba(245,158,11,0.18) 25%, rgba(99,102,241,0.22) 65%, rgba(139,92,246,0.28) 100%)',
        }}
        title={`Thinking effort: ${activeLevel.label} (${activeLevel.text})`}
      >
        {/* Subtle track gradient line inside capsule */}
        <div
          className="absolute inset-x-2.5 h-[3px] rounded-full opacity-60 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, #ef4444, #f59e0b, #6366f1, #8b5cf6)',
          }}
        />

        {/* Encapsulated Sliding Circle / Thumb */}
        <div
          className="absolute w-[16px] h-[16px] rounded-full bg-white dark:bg-slate-100 shadow-sm border border-slate-200/90 dark:border-slate-600 pointer-events-none transition-all duration-100 flex items-center justify-center"
          style={{
            left: `${knobLeft}px`,
            boxShadow: isHolding
              ? `0 1px 6px rgba(0,0,0,0.25), 0 0 8px ${activeLevel.color}`
              : `0 1px 4px rgba(0,0,0,0.15), 0 0 5px ${activeLevel.color}66`,
            transform: isHolding ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          <span
            className="w-[6px] h-[6px] rounded-full transition-colors duration-150"
            style={{ backgroundColor: activeLevel.color }}
          />
        </div>

        {/* Invisible native range input for smooth drag & keyboard accessibility */}
        <input
          type="range"
          min={0}
          max={THINKING_EFFORT_LEVELS.length - 1}
          step={1}
          value={activeIdx}
          onMouseDown={() => setIsHolding(true)}
          onTouchStart={() => setIsHolding(true)}
          onKeyDown={() => setIsHolding(true)}
          onKeyUp={() => setTimeout(() => setIsHolding(false), 800)}
          onBlur={() => setIsHolding(false)}
          onChange={(e) => {
            setIsHolding(true);
            onChange(THINKING_EFFORT_LEVELS[Number(e.target.value)].id);
          }}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label={`Thinking effort level: ${activeLevel.label}`}
        />
      </div>
    </div>
  );
}
