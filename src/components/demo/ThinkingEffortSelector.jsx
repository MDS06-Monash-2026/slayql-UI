import React from 'react';

// How thoroughly an answer is checked (backend/app/agent/effort.py). It does not move the
// confidence bar an answer must clear; it changes how much evidence goes into the confidence.
export const THINKING_EFFORT_LEVELS = [
  {
    id: 'minimal',
    label: 'Light',
    hint: '1 query, data checks only. Fastest',
    badgeLight: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    badgeDark: 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
    dotColor: 'bg-emerald-500',
  },
  {
    id: 'low',
    label: 'Standard',
    hint: '2 independent queries compared',
    badgeLight: 'text-sky-700 bg-sky-50 border-sky-200',
    badgeDark: 'text-sky-400 bg-sky-950/60 border-sky-800',
    dotColor: 'bg-sky-500',
  },
  {
    id: 'medium',
    label: 'Thorough',
    hint: '3 independent queries compared. Recommended',
    badgeLight: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    badgeDark: 'text-indigo-400 bg-indigo-950/60 border-indigo-800',
    dotColor: 'bg-indigo-500',
  },
  {
    id: 'high',
    label: 'Deep',
    hint: '3 queries, more repair attempts',
    badgeLight: 'text-purple-700 bg-purple-50 border-purple-200',
    badgeDark: 'text-purple-400 bg-purple-950/60 border-purple-800',
    dotColor: 'bg-purple-500',
  },
  {
    id: 'max',
    label: 'Max',
    hint: '5 queries compared. Slowest, for figures that matter',
    badgeLight: 'text-rose-700 bg-rose-50 border-rose-200',
    badgeDark: 'text-rose-400 bg-rose-950/60 border-rose-800',
    dotColor: 'bg-rose-500',
  },
];

const INDEX_MAP = THINKING_EFFORT_LEVELS.reduce((acc, lvl, i) => {
  acc[lvl.id] = i;
  return acc;
}, {});

export default function ThinkingEffortSelector({ value = 'medium', onChange, disabled = false, isDark = false }) {
  const activeIdx = INDEX_MAP[value] !== undefined ? INDEX_MAP[value] : 0;
  const activeLevel = THINKING_EFFORT_LEVELS[activeIdx];

  const handleSliderChange = (e) => {
    const idx = Number(e.target.value);
    const nextLevel = THINKING_EFFORT_LEVELS[idx];
    if (nextLevel && onChange) {
      onChange(nextLevel.id);
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-2xs select-none transition-colors ${
      isDark
        ? 'bg-[#161c27] border-slate-800 text-slate-300'
        : 'bg-slate-50 border-slate-200/90 text-slate-700'
    }`}>
      <span className="text-[11px] font-semibold" title={activeLevel.hint}>
        Checking:
      </span>

      {/* Badge showing current level: Low, Medium, High, Max */}
      <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold border transition-all flex items-center gap-1 ${
        isDark ? activeLevel.badgeDark : activeLevel.badgeLight
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${activeLevel.dotColor}`} />
        <span>{activeLevel.label}</span>
      </span>

      {/* Slider */}
      <div className="w-16 sm:w-20 relative flex items-center ml-0.5">
        <input
          type="range"
          min="0"
          max={THINKING_EFFORT_LEVELS.length - 1}
          step="1"
          value={activeIdx}
          disabled={disabled}
          onChange={handleSliderChange}
          className="effort-slider w-full cursor-pointer disabled:opacity-50"
          aria-label={`Checking: ${activeLevel.label} (${activeLevel.hint})`}
          title={`Checking: ${activeLevel.label}. ${activeLevel.hint}.`}
        />
      </div>
    </div>
  );
}
