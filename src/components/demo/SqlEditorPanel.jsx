import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Play,
  Edit3,
  RotateCcw,
  ShieldCheck,
  BookmarkPlus,
  Loader2,
} from 'lucide-react';
import { SQL_KEYWORDS } from '../../mock/mockData';

function highlightSQL(sql) {
  if (!sql) return '';
  const kwPattern = SQL_KEYWORDS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const tokenRe = new RegExp(
    `(--[^\\n]*)|('(?:[^'\\\\]|\\\\.)*')|(\\b(?:${kwPattern})\\b)|(\\b\\d+(?:\\.\\d+)?\\b)`,
    'gi'
  );
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = tokenRe.exec(sql)) !== null) {
    if (match.index > lastIndex) parts.push(sql.slice(lastIndex, match.index));
    const [, comment, str, kw, num] = match;
    if (comment) parts.push(<span key={parts.length} className="sql-comment text-slate-400 italic">{comment}</span>);
    else if (str) parts.push(<span key={parts.length} className="sql-str text-emerald-700 font-mono font-medium">{str}</span>);
    else if (kw) parts.push(<span key={parts.length} className="sql-kw text-indigo-600 font-bold font-mono">{kw}</span>);
    else if (num) parts.push(<span key={parts.length} className="sql-num text-amber-700 font-mono font-semibold">{num}</span>);
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < sql.length) parts.push(sql.slice(lastIndex));
  return <code className="font-mono whitespace-pre-wrap leading-relaxed block text-xs text-slate-800">{parts}</code>;
}

export default function SqlEditorPanel({
  sql,
  validationChecks = [],
  onExecuteEditedSql,
  onSaveQuery,
  isExecuting,
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableSql, setEditableSql] = useState(sql || '');

  useEffect(() => {
    setEditableSql(sql || '');
  }, [sql]);

  const handleCopy = () => {
    navigator.clipboard.writeText(isEditing ? editableSql : sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRunEdited = () => {
    if (onExecuteEditedSql && editableSql.trim()) {
      onExecuteEditedSql(editableSql.trim());
    }
  };

  const handleReset = () => {
    setEditableSql(sql);
    setIsEditing(false);
  };

  return (
    <div className="space-y-2 mb-4">
      {/* Minimalist Code Block (AI Studio / Claude Desktop style) */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 overflow-hidden shadow-xs">
        {/* Toolbar Header */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-200/70 bg-slate-100/50">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold text-slate-600">sql (sqlite3)</span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
              read-only validated
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 text-xs font-medium transition-all"
              title="Copy SQL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-medium transition-all"
                title="Edit SQL"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 text-xs font-medium transition-all"
                title="Reset original SQL"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            {onSaveQuery && (
              <button
                type="button"
                onClick={() => onSaveQuery(isEditing ? editableSql : sql)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs font-medium transition-all"
                title="Save to library"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-emerald-600" />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Code Content */}
        <div className="p-3.5 overflow-x-auto text-slate-800 bg-white">
          {isEditing ? (
            <textarea
              value={editableSql}
              onChange={(e) => setEditableSql(e.target.value)}
              className="w-full min-h-[140px] bg-slate-50 p-2.5 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 outline-none resize-y leading-relaxed focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Type custom SQL here..."
              spellCheck="false"
            />
          ) : (
            <pre className="font-mono text-xs text-slate-800 leading-relaxed">{highlightSQL(sql)}</pre>
          )}
        </div>

        {/* Edit mode execute bar */}
        {isEditing && (
          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-500">
              Query will be verified against read-only safety guardrails before execution.
            </span>
            <button
              type="button"
              onClick={handleRunEdited}
              disabled={isExecuting || !editableSql.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition-all"
            >
              {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Run Custom SQL</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
