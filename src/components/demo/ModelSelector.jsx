import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check, Sparkles } from 'lucide-react';

export default function ModelSelector({
  models = [],
  selectedModelId,
  onSelectModel,
  disabled = false,
  isDark = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const activeModel = models.find((m) => m.id === selectedModelId) || models[0] || {
    id: 'deepseek/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    description: 'Server execution model for the current test deployment.',
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  const filteredModels = models.filter((model) => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;
    return [model.name, model.id, model.provider, model.description]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(needle));
  });

  const formatPrice = (price) => (price ? `$${Number(price).toFixed(2)}/M` : 'Free');

  const grouped = filteredModels.reduce((acc, m) => {
    const p = m.provider || 'Other';
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button: White in Light mode, Pure Black in Dark mode */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) setSearchQuery('');
        }}
        className={`h-11 inline-flex items-center gap-3 px-3.5 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50 ${
          isDark
            ? 'bg-[#000000] hover:bg-[#0d0d0d] text-white border border-[#27272a] hover:border-[#3f3f46]'
            : 'bg-[#ffffff] hover:bg-slate-50/90 text-slate-900 border border-slate-200/90 hover:border-indigo-300'
        }`}
      >
        <span className="text-left leading-tight min-w-0">
          <span
            className={`block text-[9px] font-bold uppercase tracking-wider ${
              isDark ? 'text-indigo-400' : 'text-indigo-600'
            }`}
          >
            {activeModel.provider || 'AI model'}
          </span>
          <span
            className={`block max-w-[110px] sm:max-w-[180px] truncate font-bold text-[13px] ${
              isDark ? 'text-[#ffffff]' : 'text-slate-900'
            }`}
          >
            {activeModel.name}
          </span>
        </span>

        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            isDark ? 'text-neutral-400' : 'text-slate-400'
          } ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu: White in Light mode, Pure Black in Dark mode */}
      {isOpen && (
        <div
          className={`absolute right-0 mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden slide-in-up transition-all ${
            isDark
              ? 'bg-[#000000] border border-[#27272a] text-white'
              : 'bg-[#ffffff] border border-slate-200 text-slate-900'
          }`}
          style={{ width: 330 }}
        >
          {/* Header */}
          <div
            className={`px-4 py-3 border-b flex items-center justify-between ${
              isDark
                ? 'bg-[#0a0a0a] border-[#27272a]'
                : 'bg-slate-50/90 border-slate-100'
            }`}
          >
            <div>
              <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Choose AI Model
              </p>
              <p className={`text-[10px] ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                Select active inference engine
              </p>
            </div>
            <span
              className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                isDark
                  ? 'bg-[#18181b] text-neutral-300 border border-[#27272a]'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {filteredModels.length} models
            </span>
          </div>

          {/* Search bar */}
          <div
            className={`p-2.5 border-b ${
              isDark ? 'bg-[#000000] border-[#27272a]' : 'bg-white border-slate-100'
            }`}
          >
            <div className="relative">
              <Search
                className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${
                  isDark ? 'text-neutral-500' : 'text-slate-400'
                }`}
              />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Claude, GPT, Gemini..."
                className={`w-full pl-8 pr-3 py-2 rounded-xl text-xs outline-none transition-all ${
                  isDark
                    ? 'bg-[#0f0f11] border border-[#27272a] text-white placeholder-neutral-500 focus:border-indigo-500 focus:bg-[#141417]'
                    : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-400'
                }`}
                aria-label="Search models"
              />
            </div>
          </div>

          {/* Grouped Model List */}
          <div
            className={`max-h-80 overflow-y-auto p-1.5 space-y-1.5 ${
              isDark ? 'bg-[#000000]' : 'bg-white'
            }`}
          >
            {filteredModels.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Search
                  className={`w-5 h-5 mx-auto mb-2 ${
                    isDark ? 'text-neutral-600' : 'text-slate-300'
                  }`}
                />
                <p
                  className={`text-xs font-semibold ${
                    isDark ? 'text-neutral-400' : 'text-slate-600'
                  }`}
                >
                  No matching models
                </p>
              </div>
            ) : (
              Object.entries(grouped).map(([providerName, providerModels]) => (
                <div key={providerName} className="space-y-0.5">
                  <div className="px-2.5 py-1 pt-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isDark ? 'text-neutral-400' : 'text-slate-500'
                      }`}
                    >
                      {providerName}
                    </span>
                  </div>

                  {providerModels.map((model) => {
                    const isSelected = model.id === activeModel.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelectModel(model.id);
                          setIsOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? isDark
                              ? 'bg-[#18181b] border border-[#27272a] shadow-xs'
                              : 'bg-indigo-50/80 border border-indigo-100 shadow-xs'
                            : isDark
                            ? 'hover:bg-[#121214] border border-transparent'
                            : 'hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p
                            className={`text-xs font-bold truncate ${
                              isDark ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {model.name}
                          </p>
                          {model.description && (
                            <p
                              className={`text-[10.5px] truncate leading-tight ${
                                isDark ? 'text-neutral-400' : 'text-slate-500'
                              }`}
                            >
                              {model.description}
                            </p>
                          )}
                          <div
                            className={`flex items-center gap-2 text-[10px] ${
                              isDark ? 'text-neutral-500' : 'text-slate-400'
                            }`}
                          >
                            <span>
                              {model.context_length
                                ? `${(model.context_length / 1000).toFixed(0)}k ctx`
                                : 'Varies'}
                            </span>
                            <span>•</span>
                            <span>{formatPrice(model.input_price)} in</span>
                          </div>
                        </div>

                        {isSelected && (
                          <Check
                            className={`w-4 h-4 shrink-0 ${
                              isDark ? 'text-indigo-400' : 'text-indigo-600'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
