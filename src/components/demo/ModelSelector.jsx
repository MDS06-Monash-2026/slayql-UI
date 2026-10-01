import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

// Company logos (LobeHub icons, MIT). The model's own company is shown, never the gateway.
const COMPANY = {
  OpenAI: { logo: '/logos/models/openai.svg', mono: true },
  DeepSeek: { logo: '/logos/models/deepseek-color.svg' },
  'Zhipu AI': { logo: '/logos/models/zhipu-color.svg' },
  'Moonshot AI': { logo: '/logos/models/kimi.svg', mono: true },
};
const COMPANY_ORDER = ['OpenAI', 'Zhipu AI', 'Moonshot AI', 'DeepSeek'];
const TAG_LABEL = { default: 'Default', deep: 'Deep thinking', fast: 'Fast' };

function CompanyLogo({ company, isDark, size = 'h-5 w-5' }) {
  const info = COMPANY[company];
  if (!info) {
    return <span className={`${size} flex items-center justify-center rounded bg-slate-200 text-[10px] font-bold text-slate-600`}>{(company || '?')[0]}</span>;
  }
  return <img src={info.logo} alt="" aria-hidden="true" className={`${size} shrink-0 object-contain ${info.mono && isDark ? 'invert' : ''}`} />;
}

const price = (value) => (value ? `$${Number(value) < 1 ? Number(value).toFixed(2) : Number(value).toFixed(Number(value) % 1 ? 2 : 0)}` : '–');

export default function ModelSelector({ models = [], selectedModelId, onSelectModel, disabled = false, isDark = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const available = models.filter((m) => m.is_available !== false);
  const activeModel = available.find((m) => m.id === selectedModelId) || available[0] || models[0] || { id: '', name: 'Default model', provider: '' };

  // A saved choice that is no longer available (or unknown) switches to the default.
  useEffect(() => {
    if (available.length && !available.some((m) => m.id === selectedModelId)) onSelectModel(available[0].id);
  }, [available, selectedModelId, onSelectModel]);

  useEffect(() => {
    if (!isOpen) return undefined;
    searchRef.current?.focus();
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setIsOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [isOpen]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (m) => !needle || [m.name, m.id, m.provider, m.description].filter(Boolean).some((v) => v.toLowerCase().includes(needle));
    const byCompany = {};
    for (const m of models.filter(match)) (byCompany[m.provider || 'Other'] ||= []).push(m);
    for (const list of Object.values(byCompany)) list.sort((a, b) => Number(b.is_available !== false) - Number(a.is_available !== false));
    return Object.entries(byCompany).sort(([a], [b]) => {
      const ia = COMPANY_ORDER.indexOf(a); const ib = COMPANY_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [models, query]);

  const tone = {
    panel: isDark ? 'border-slate-700 bg-[#171c2b] text-slate-100' : 'border-slate-200 bg-white text-slate-900',
    muted: isDark ? 'text-slate-400' : 'text-slate-500',
    strong: isDark ? 'text-slate-100' : 'text-slate-900',
    hover: isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50',
    selected: isDark ? 'bg-indigo-500/15' : 'bg-indigo-50',
    tag: isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="relative inline-block text-left" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setIsOpen((v) => !v); setQuery(''); }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-3 shadow-sm transition disabled:opacity-50 ${
          isDark ? 'border-slate-700 bg-[#171c2b] hover:border-slate-600' : 'border-slate-200/90 bg-white hover:border-slate-300'
        }`}
      >
        <CompanyLogo company={activeModel.provider} isDark={isDark} />
        <span className={`max-w-[120px] truncate text-[13px] font-semibold sm:max-w-[180px] ${tone.strong}`}>{activeModel.name}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${tone.muted} ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className={`absolute left-0 z-50 mt-2 w-[min(370px,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] slide-in-up ${tone.panel}`}>
          <div className="p-2">
            <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}>
              <Search className={`h-4 w-4 ${tone.muted}`} aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models"
                aria-label="Search models"
                className={`min-w-0 flex-1 bg-transparent text-[13px] outline-none ${tone.strong} ${isDark ? 'placeholder-slate-500' : 'placeholder-slate-400'}`}
              />
            </label>
          </div>

          <div className="max-h-[420px] overflow-y-auto px-2 pb-2" role="listbox" aria-label="Models">
            {groups.length === 0 && <p className={`px-3 py-6 text-center text-[13px] ${tone.muted}`}>No matching models</p>}
            {groups.map(([company, list]) => (
              <div key={company} className="pt-2">
                <p className={`flex items-center gap-2 px-2 pb-1 text-[11px] font-medium ${tone.muted}`}>
                  <CompanyLogo company={company} isDark={isDark} size="h-3.5 w-3.5" />
                  {company}
                </p>
                {list.map((model) => {
                  const unavailable = model.is_available === false;
                  const selected = model.id === activeModel.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-disabled={unavailable}
                      disabled={unavailable}
                      onClick={() => { onSelectModel(model.id); setIsOpen(false); }}
                      className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition ${selected ? tone.selected : unavailable ? 'cursor-not-allowed opacity-50' : tone.hover}`}
                    >
                      <span className="mt-0.5"><CompanyLogo company={model.provider} isDark={isDark} size="h-6 w-6" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-[13px] font-semibold ${tone.strong}`}>{model.name}</span>
                          {unavailable
                            ? <span className={`rounded-md px-1.5 py-px text-[10px] font-medium ${tone.tag}`}>Unavailable</span>
                            : (model.tags || []).filter((t) => TAG_LABEL[t]).map((t) => (
                              <span key={t} className={`rounded-md px-1.5 py-px text-[10px] font-medium ${t === 'default' ? (isDark ? 'bg-indigo-500/20 text-indigo-200' : 'bg-indigo-100 text-indigo-700') : tone.tag}`}>{TAG_LABEL[t]}</span>
                            ))}
                        </span>
                        {model.description && <span className={`mt-0.5 block truncate text-xs ${tone.muted}`}>{model.description}</span>}
                        <span className={`mt-0.5 block text-[11px] tabular-nums ${tone.muted}`}>
                          {price(model.input_price)} in · {price(model.output_price)} out per million tokens
                        </span>
                      </span>
                      {selected && <Check className={`mt-1 h-4 w-4 shrink-0 ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
