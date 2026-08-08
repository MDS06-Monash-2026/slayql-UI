import React, { useState } from 'react';
import { Sparkles, MessageSquare, Zap, Network, Target, Code, Table, BarChart3, Copy, Check, FileCheck2 } from 'lucide-react';
import { MOCK_DATA, SSE_STEPS, SQL_KEYWORDS } from '../mock/mockData';

export default function ChatWorkspace({ onQueryExecuted }) {
  const [queryInput, setQueryInput] = useState('');
  const [running, setRunning] = useState(false);
  const [sseActive, setSseActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [resultsActive, setResultsActive] = useState(false);
  const [activeTab, setActiveTab] = useState('sql');
  const [currentDataset, setCurrentDataset] = useState(null);
  const [copyStatus, setCopyStatus] = useState(false);

  const handleExampleClick = (prompt) => {
    setQueryInput(prompt);
    simulateQuery(prompt);
  };

  const handleRunQuery = () => {
    if (queryInput.trim()) {
      simulateQuery(queryInput);
    }
  };

  const simulateQuery = async (promptText) => {
    if (running) return;
    setRunning(true);
    setResultsActive(false);
    setSseActive(true);
    setCurrentStepIndex(-1);

    const lower = promptText.toLowerCase();
    let data = MOCK_DATA.iot_patents;
    if (lower.includes('station') || lower.includes('temperature') || lower.includes('gsod') || lower.includes('hottest')) data = MOCK_DATA.noaa_gsod;
    else if (lower.includes('blockchain') || lower.includes('category') || lower.includes('categories')) data = MOCK_DATA.blockchain_categories;

    setCurrentDataset(data);

    for (let i = 0; i < SSE_STEPS.length; i++) {
      setCurrentStepIndex(i);
      await new Promise(r => setTimeout(r, SSE_STEPS[i].duration));
    }

    setSseActive(false);
    setResultsActive(true);
    setActiveTab('sql');
    setRunning(false);

    if (onQueryExecuted) {
      onQueryExecuted(data);
    }
  };

  const handleCopySql = () => {
    if (!currentDataset) return;
    navigator.clipboard.writeText(currentDataset.sql).then(() => {
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2000);
    });
  };

  const renderHighlightedSQL = (sql) => {
    if (!sql) return '';

    // Single-pass tokenizer: matching comments/strings/keywords/numbers against the
    // raw SQL text (not against previously-inserted markup) avoids a class like
    // "text-purple-400" being re-matched by the number pattern on a later pass.
    const kwPattern = SQL_KEYWORDS
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const tokenRe = new RegExp(`(--[^\\n]*)|('(?:[^'\\\\]|\\\\.)*')|(\\b(?:${kwPattern})\\b)|(\\b\\d+(?:\\.\\d+)?\\b)`, 'gi');

    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = tokenRe.exec(sql)) !== null) {
      if (match.index > lastIndex) {
        parts.push(sql.slice(lastIndex, match.index));
      }
      const [, comment, str, kw, num] = match;
      if (comment) parts.push(<span key={parts.length} class="sql-cmt text-slate-500 italic">{comment}</span>);
      else if (str) parts.push(<span key={parts.length} class="sql-str text-green-300">{str}</span>);
      else if (kw) parts.push(<span key={parts.length} class="sql-kw text-purple-400">{kw}</span>);
      else if (num) parts.push(<span key={parts.length} class="sql-num text-yellow-300">{num}</span>);
      lastIndex = tokenRe.lastIndex;
    }
    if (lastIndex < sql.length) parts.push(sql.slice(lastIndex));

    return <code class="font-mono whitespace-pre-wrap leading-relaxed block">{parts}</code>;
  };

  const renderSVGChart = (chartData) => {
    if (!chartData) return null;
    const width = 600;
    const height = 220;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const values = chartData.map(d => d.value);
    const maxVal = Math.max(...values);
    const barCount = chartData.length;
    const barGap = 6;
    const barW = Math.max(16, (chartW - (barCount - 1) * barGap) / barCount);

    return (
      <svg class="w-full" viewBox={`0 0 ${width} ${height}`}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const val = Math.round(maxVal * ratio);
            const y = chartH - (ratio * chartH);
            return (
              <g key={idx}>
                <line x1="0" y1={y} x2={chartW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x="-8" y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="sans-serif">
                  {val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}K` : val}
                </text>
              </g>
            );
          })}

          {chartData.map((item, idx) => {
            const x = idx * (barW + barGap);
            const barH = (item.value / maxVal) * chartH;
            const y = chartH - barH;
            return (
              <g key={idx} class="chart-bar">
                <rect x={x} y={y} width={barW} height={barH} fill={item.color || '#4f46e5'} rx="3" ry="3" />
                <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="sans-serif">
                  {item.label.length > 8 ? item.label.slice(0, 8) + '..' : item.label}
                </text>
              </g>
            );
          })}

          <line x1="0" y1="0" x2="0" y2={chartH} stroke="#cbd5e1" strokeWidth="1" />
          <line x1="0" y1={chartH} x2={chartW} y2={chartH} stroke="#cbd5e1" strokeWidth="1" />
        </g>
      </svg>
    );
  };

  return (
    <div class="workspace-container rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-100 overflow-hidden flex flex-col flex-1">

      {/* Suggestions/Examples header */}
      <div class="border-b border-slate-200 bg-slate-50 px-4 py-3 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-medium text-slate-500 mr-1">Try:</span>
          <button
            onClick={() => handleExampleClick(MOCK_DATA.iot_patents.prompt)}
            class="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all"
          >
            📈 IoT Patent Filings by Month
          </button>
          <button
            onClick={() => handleExampleClick(MOCK_DATA.noaa_gsod.prompt)}
            class="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all"
          >
            🌡️ Hottest Dates by Station
          </button>
          <button
            onClick={() => handleExampleClick(MOCK_DATA.blockchain_categories.prompt)}
            class="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all"
          >
            🔗 Multi-Hop Join Reasoning
          </button>
        </div>
      </div>

      {/* Input query field */}
      <div class="px-4 py-4 border-b border-slate-200 bg-white">
        <div class="flex items-start gap-3">
          <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center mt-0.5">
            <MessageSquare class="w-4 h-4 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <textarea
              id="query-input"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleRunQuery();
                }
              }}
              class="w-full text-sm text-slate-800 placeholder-slate-400 bg-transparent border-0 outline-none resize-none leading-relaxed font-medium"
              rows={2}
              placeholder="Ask a question about your database in plain English..."
            />
          </div>
          <button
            onClick={handleRunQuery}
            disabled={running}
            class="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
          >
            <Zap class="w-3.5 h-3.5" />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* SlayQL Thinking — agentic reasoning trace */}
      {sseActive && currentDataset && (
        <div class="px-4 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50/30 to-blue-50/30 space-y-3">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin"></div>
            <span class="text-xs font-semibold text-indigo-700 uppercase tracking-wider">SlayQL Thinking</span>
          </div>

          <div class="space-y-2">
            {SSE_STEPS.map((step, idx) => (
              <div key={idx}>
                <div class={`sse-step flex items-start gap-2.5 text-sm ${idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'active' : 'pending'}`}>
                  <div class={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${idx < currentStepIndex ? 'bg-emerald-500 text-white text-[10px] font-bold' : idx === currentStepIndex ? 'border-2 border-indigo-600 border-t-transparent animate-spin' : 'border-2 border-slate-200 bg-white'}`}>
                    {idx < currentStepIndex ? '✓' : ''}
                  </div>
                  <span class={idx === currentStepIndex ? 'text-indigo-600 font-semibold' : idx < currentStepIndex ? 'text-slate-800' : 'text-slate-400'}>
                    {step.text}
                  </span>
                </div>

                {/* Detail panels revealed once their step completes */}
                {step.detail === 'schema' && idx < currentStepIndex && (
                  <div class="ml-6 mt-1.5 mb-1 p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-xs text-slate-600 space-y-0.5">
                    {currentDataset.schemaTree.map((line, li) => <div key={li}>{line}</div>)}
                  </div>
                )}
                {step.detail === 'graph' && idx < currentStepIndex && (
                  <div class="ml-6 mt-1.5 mb-1 flex items-center gap-2 flex-wrap text-xs">
                    {currentDataset.graphChain.map((node, ni) => (
                      <React.Fragment key={ni}>
                        <span class="px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-mono flex items-center gap-1">
                          {ni === 0 && <Network class="w-3 h-3" />}
                          {node}
                        </span>
                        {ni < currentDataset.graphChain.length - 1 && <span class="text-slate-300">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}
                {step.detail === 'value' && idx < currentStepIndex && (
                  <div class="ml-6 mt-1.5 mb-1 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                    <Target class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      Query entity <strong>"{currentDataset.valueGrounding.phrase}"</strong> matched column <code class="bg-amber-100 px-1 rounded">{currentDataset.valueGrounding.column}</code> in table <code class="bg-amber-100 px-1 rounded">{currentDataset.valueGrounding.table}</code>.
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Panel */}
      {resultsActive && currentDataset && (
        <div class="flex-1 flex flex-col">
          <div class="flex items-center gap-0 border-b border-slate-200 bg-white px-4 pt-3">
            <button
              onClick={() => setActiveTab('sql')}
              class={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-all ${activeTab === 'sql' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Code class="w-3.5 h-3.5" /> SQL Query
            </button>
            <button
              onClick={() => setActiveTab('table')}
              class={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-all ${activeTab === 'table' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Table class="w-3.5 h-3.5" /> Data Table
            </button>
            <button
              onClick={() => setActiveTab('chart')}
              class={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-all ${activeTab === 'chart' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <BarChart3 class="w-3.5 h-3.5" /> Visualization
            </button>
            <div class="ml-auto pb-2 flex items-center gap-2 text-xs">
              <span class="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{currentDataset.time}</span>
              <span class="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">{currentDataset.rows_count}</span>
            </div>
          </div>

          <div class="p-4 flex-1">
            {activeTab === 'sql' && (
              <div class="space-y-3">
                <div class="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 p-4 relative">
                  <button
                    onClick={handleCopySql}
                    class="absolute top-3 right-3 text-slate-400 hover:text-white flex items-center gap-1 text-xs"
                  >
                    {copyStatus ? <Check class="w-3 h-3 text-emerald-400" /> : <Copy class="w-3 h-3" />}
                    <span>{copyStatus ? 'Copied' : 'Copy'}</span>
                  </button>
                  <pre class="overflow-x-auto">
                    {renderHighlightedSQL(currentDataset.sql)}
                  </pre>
                </div>
                <div class="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                  <FileCheck2 class="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Strict Output Contract (QOC) passed:</strong> SQL parsed cleanly from a single fenced code block — no conversational text detected.
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'table' && (
              <div class="rounded-xl border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {currentDataset.headers.map((h, i) => (
                          <th key={i} class="p-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      {currentDataset.rows.map((row, idx) => (
                        <tr key={idx} class="hover:bg-slate-50/50">
                          {row.map((cell, ci) => (
                            <td key={ci} class="p-3 text-slate-600">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'chart' && (
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div class="mb-4">
                  <h4 class="text-sm font-semibold text-slate-800">{currentDataset.chartTitle}</h4>
                  <p class="text-xs text-slate-500 mt-0.5">{currentDataset.chartSubtitle}</p>
                </div>
                {renderSVGChart(currentDataset.chartData)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workspace Empty state */}
      {!resultsActive && !sseActive && (
        <div class="flex-1 flex flex-col items-center justify-center py-16 text-center px-4">
          <div class="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4">
            <Sparkles class="w-7 h-7 text-indigo-500" />
          </div>
          <h3 class="text-base font-semibold text-slate-700">Ready to Explore</h3>
          <p class="mt-1 text-sm text-slate-400 max-w-xs">
            Select one of the example prompts above, or write your own natural language question.
          </p>
        </div>
      )}

    </div>
  );
}
