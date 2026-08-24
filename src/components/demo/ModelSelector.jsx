import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Search, Zap, Check } from 'lucide-react';

export default function ModelSelector({ models, selectedModelId, onSelectModel, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const activeModel = models.find((m) => m.id === selectedModelId) || models[0] || {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'High accuracy SQL compiler with schema reasoning',
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

  const legacyModelIds = new Set([
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'google/gemini-2.0-flash-001',
    'deepseek/deepseek-chat',
    'deepseek/deepseek-r1',
    'meta-llama/llama-3.3-70b-instruct',
    'openai/gpt-4o-mini',
  ]);
  const visibleModels = models.filter((model) => !legacyModelIds.has(model.id) || model.id === selectedModelId);
  const filteredModels = visibleModels.filter((model) => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;
    return [model.name, model.id, model.provider, model.description]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(needle));
  });

  const formatPrice = (price) => (price ? `$${Number(price).toFixed(2)}/M` : 'Free');

  const getProviderColor = (provider) => {
    switch (provider?.toLowerCase()) {
      case 'anthropic':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'openai':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'deepseek':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'meta':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'google':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) setSearchQuery('');
        }}
        className="h-11 inline-flex items-center gap-2.5 px-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80 text-xs font-semibold text-slate-800 shadow-sm transition-all disabled:opacity-50"
      >
        <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <Cpu className="w-3.5 h-3.5 text-indigo-600" />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[9px] font-semibold text-indigo-600">{activeModel.provider || 'AI model'}</span>
          <span className="block max-w-[82px] sm:max-w-[165px] truncate text-slate-900 font-bold">{activeModel.name}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-slate-200/90 shadow-2xl z-50 overflow-hidden slide-in-up">
          <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900">Choose a model</p>
              <p className="text-[10px] text-slate-500">Live OpenRouter catalog</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              <Zap className="w-3 h-3" /> Live
            </span>
          </div>

          <div className="p-2 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search Claude, GPT, Gemini, Llama..."
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                aria-label="Search models"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 px-0.5">
              {filteredModels.length} model{filteredModels.length === 1 ? '' : 's'} available
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-1">
            {filteredModels.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Search className="w-5 h-5 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No matching models</p>
                <p className="text-[10px] text-slate-400 mt-1">Try a provider or model family.</p>
              </div>
            ) : filteredModels.map((model) => {
              const isSelected = model.id === activeModel.id;
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelectModel(model.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-start justify-between ${
                    isSelected ? 'bg-indigo-50/70 text-indigo-950' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="space-y-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{model.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getProviderColor(model.provider)}`}>
                        {model.provider}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">{model.description}</p>
                    <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400">
                      <span>{model.context_length ? `${(model.context_length / 1000).toFixed(0)}k context` : 'Context varies'}</span>
                      <span>•</span>
                      <span>{formatPrice(model.input_price)} in</span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
