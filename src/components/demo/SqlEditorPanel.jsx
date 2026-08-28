import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Play,
  Edit3,
  RotateCcw,
  BookmarkPlus,
  Loader2,
} from 'lucide-react';
import { highlightSQLTokens } from '../../utils/sqlHighlighter';

export default function SqlEditorPanel({
  sql,
  validationChecks = [],
  onExecuteEditedSql,
  onSaveQuery,
  isExecuting,
  isDark = false,
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
      <div
        className={`rounded-2xl border overflow-hidden shadow-xs transition-all ${
          isDark
            ? 'border-slate-800 bg-[#0f141c] text-slate-100 shadow-md'
            : 'border-slate-300/90 bg-white text-slate-900 shadow-xs'
        }`}
      >
        {/* Toolbar Header */}
        <div
          className={`flex items-center justify-between px-3.5 py-2 border-b ${
            isDark ? 'border-slate-800 bg-[#161c27]' : 'border-slate-200 bg-slate-100/90'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/80'
              }`}
              title="Copy SQL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {onExecuteEditedSql && (
              !isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    isDark
                      ? 'text-slate-300 hover:text-indigo-400 hover:bg-slate-800'
                      : 'text-slate-700 hover:text-indigo-700 hover:bg-slate-200/80'
                  }`}
                  title="Edit SQL"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Edit</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReset}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    isDark
                      ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                      : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/80'
                  }`}
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
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isDark
                    ? 'text-slate-300 hover:text-emerald-400 hover:bg-slate-800'
                    : 'text-slate-700 hover:text-emerald-700 hover:bg-slate-200/80'
                }`}
                title="Save to library"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-emerald-600" />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Code Content */}
        <div className={`p-3.5 overflow-x-auto ${isDark ? 'bg-[#0f141c]' : 'bg-slate-50/60'}`}>
          {isEditing ? (
            <textarea
              value={editableSql}
              onChange={(e) => setEditableSql(e.target.value)}
              className={`w-full min-h-[140px] p-3 rounded-xl text-xs font-mono outline-none resize-y leading-relaxed border focus:ring-2 focus:ring-indigo-500/40 ${
                isDark
                  ? 'bg-[#161c27] text-slate-100 border-slate-700'
                  : 'bg-white text-slate-900 border-slate-300'
              }`}
              placeholder="Type custom SQL here..."
              spellCheck="false"
            />
          ) : (
            <div className="flex font-mono text-xs leading-relaxed select-text">
              {/* Line numbers */}
              <div
                className={`select-none pr-4 text-right border-r mr-4 font-mono text-[11px] font-medium ${
                  isDark ? 'text-slate-600 border-slate-800' : 'text-slate-500 border-slate-300/80'
                }`}
              >
                {lines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              {/* Code */}
              <pre
                className={`font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre flex-1 ${
                  isDark ? 'text-slate-200' : 'text-slate-900 font-medium'
                }`}
              >
                <code>{highlightSQLTokens(sql)}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Edit mode execute bar */}
        {isEditing && (
          <div
            className={`px-3.5 py-2.5 border-t flex items-center justify-between text-xs ${
              isDark ? 'bg-[#161c27] border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
