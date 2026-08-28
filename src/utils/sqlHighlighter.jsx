import React from 'react';

const SQL_KEYWORDS = [
  'GROUP BY', 'ORDER BY', 'PRIMARY KEY', 'FOREIGN KEY',
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN',
  'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'ON', 'HAVING', 'LIMIT', 'OFFSET',
  'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'DISTINCT',
  'WITH', 'UNION', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC',
  'BY', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'VIEW',
  'INDEX', 'EXISTS', 'SET', 'VALUES', 'INTO', 'OVER', 'PARTITION BY',
];

const SQL_FUNCTIONS = [
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'ROUND', 'COALESCE', 'NULLIF',
  'CAST', 'STRFTIME', 'DATE', 'DATETIME', 'TIME', 'JULIANDAY', 'UPPER',
  'LOWER', 'SUBSTR', 'SUBSTRING', 'LENGTH', 'TRIM', 'LTRIM', 'RTRIM',
  'REPLACE', 'IFNULL', 'TOTAL', 'ABS', 'RANDOM', 'CHAR', 'HEX',
  'DATE_TRUNC', 'EXTRACT', 'INTERVAL', 'FORMAT_DATE', 'UNNEST',
];

export function highlightSQLTokens(sql) {
  if (!sql) return '';

  const kwPattern = SQL_KEYWORDS.slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const fnPattern = SQL_FUNCTIONS.slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const tokenRe = new RegExp(
    `(--[^\\n]*|/\\*[\\s\\S]*?\\*/)|('(?:[^'\\\\]|\\\\.)*')|(\\b(?:${kwPattern})\\b)|(\\b(?:${fnPattern})\\b)(?=\\s*\\()|(\\b\\d+(?:\\.\\d+)?\\b)|([(),;=<>!+\\-*/])`,
    'gi'
  );

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenRe.exec(sql)) !== null) {
    if (match.index > lastIndex) {
      parts.push(sql.slice(lastIndex, match.index));
    }
    const [, comment, str, kw, fn, num, op] = match;

    if (comment) {
      parts.push(<span key={parts.length} className="sql-comment text-slate-500 dark:text-slate-400 italic">{comment}</span>);
    } else if (str) {
      parts.push(<span key={parts.length} className="sql-str text-emerald-800 dark:text-emerald-300 font-mono font-semibold">{str}</span>);
    } else if (kw) {
      parts.push(<span key={parts.length} className="sql-kw text-indigo-800 dark:text-indigo-300 font-bold font-mono">{kw}</span>);
    } else if (fn) {
      parts.push(<span key={parts.length} className="sql-fn text-sky-800 dark:text-sky-300 font-bold font-mono">{fn}</span>);
    } else if (num) {
      parts.push(<span key={parts.length} className="sql-num text-amber-800 dark:text-amber-300 font-mono font-bold">{num}</span>);
    } else if (op) {
      parts.push(<span key={parts.length} className="sql-op text-slate-600 dark:text-slate-400 font-mono font-medium">{op}</span>);
    }
    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < sql.length) {
    parts.push(sql.slice(lastIndex));
  }

  return parts;
}
