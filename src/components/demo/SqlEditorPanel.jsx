import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Play,
  Edit3,
  RotateCcw,
  BookmarkPlus,
  Loader2,
  Terminal,
} from 'lucide-react';
import { highlightSQLTokens } from '../../utils/sqlHighlighter';

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

  const lines = (sql || '').split('\n');

  return (
    <div className="space-y-2 mb-4">
      {/* IDE-style Code Block */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-[#0f141c] text-slate-100 overflow-hidden shadow-md">
        {/* Toolbar Header */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-[#161c27]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-300 ml-1">query.sql</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded font-medium">
              read-only validated
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-all"
              title="Copy SQL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {onExecuteEditedSql && (
              !isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-300 hover:text-indigo-400 hover:bg-slate-800 text-xs font-medium transition-all"
                  title="Edit SQL"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Edit</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-all"
                  title="Reset original SQL"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )
            )}

            {onSaveQuery && (
              <button
                type="button"
                onClick={() => onSaveQuery(isEditing ? editableSql : sql)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-300 hover:text-emerald-400 hover:bg-slate-800 text-xs font-medium transition-all"
                title="Save to library"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Code Content */}
        <div className="p-3.5 overflow-x-auto bg-[#0f141c]">
          {isEditing ? (
            <textarea
              value={editableSql}
              onChange={(e) => setEditableSql(e.target.value)}
              className="w-full min-h-[140px] bg-[#161c27] p-3 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 outline-none resize-y leading-relaxed focus:ring-2 focus:ring-indigo-500/40"
              placeholder="Type custom SQL here..."
              spellCheck="false"
            />
          ) : (
            <div className="flex font-mono text-xs leading-relaxed select-text">
              {/* Line numbers */}
              <div className="select-none text-slate-600 pr-4 text-right border-r border-slate-800/80 mr-4 font-mono text-[11px]">
                {lines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              {/* Code */}
              <pre className="font-mono text-xs text-slate-200 leading-relaxed overflow-x-auto whitespace-pre flex-1">
                <code>{highlightSQLTokens(sql)}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Edit mode execute bar */}
        {isEditing && (
          <div className="px-3.5 py-2.5 bg-[#161c27] border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">
              Query will be verified against read-only safety guardrails before execution.
            </span>
            <button
              type="button"
              onClick={handleRunEdited}
              disabled={isExecuting || !editableSql.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition-all"
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
