import React, { useMemo } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Format inline markdown tokens: bold, italic, inline code, links, strikethrough.
 */
function renderInlineMarkdown(text, isDark) {
  if (!text) return null;

  // Tokenize regex for inline elements
  const tokenRegex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[\s\S]+?\*|`[^`\n]+`|~~[\s\S]+?~~|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Bold + Italic: ***text***
    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      const inner = part.slice(3, -3);
      return (
        <strong key={index} className="font-bold italic">
          {renderInlineMarkdown(inner, isDark)}
        </strong>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>
          {renderInlineMarkdown(inner, isDark)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return <em key={index} className="italic">{renderInlineMarkdown(inner, isDark)}</em>;
    }

    // Inline Code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <code
          key={index}
          className={`px-1.5 py-0.5 rounded-md text-[12px] font-mono font-medium border ${
            isDark
              ? 'bg-slate-800/90 text-indigo-300 border-slate-700'
              : 'bg-indigo-50/90 text-indigo-800 border-indigo-200/70'
          }`}
        >
          {inner}
        </code>
      );
    }

    // Strikethrough: ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return <del key={index} className="line-through opacity-70">{renderInlineMarkdown(inner, isDark)}</del>;
    }

    // Link: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, linkText, linkUrl] = linkMatch;
      return (
        <a
          key={index}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
        >
          {linkText}
        </a>
      );
    }

    return part;
  });
}

function CodeBlock({ code, language, isDark }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`my-3 rounded-xl border overflow-hidden font-mono text-xs ${
      isDark ? 'bg-[#0f141c] border-slate-800 text-slate-200' : 'bg-slate-900 border-slate-800 text-slate-100'
    }`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/70 border-b border-slate-700/50 text-[11px] text-slate-400">
        <span className="font-semibold lowercase">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto whitespace-pre leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MarkdownContent({ content, isDark = false, className = '' }) {
  const renderedBlocks = useMemo(() => {
    if (!content) return null;

    const raw = String(content);
    const lines = raw.split(/\r?\n/);
    const blocks = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Fenced Code Block
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        blocks.push({
          type: 'code',
          language: lang,
          code: codeLines.join('\n'),
        });
        continue;
      }

      // Markdown Table (| Header 1 | Header 2 |)
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines = [line];
        i++;
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }

        if (tableLines.length >= 2) {
          const headerRow = tableLines[0]
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());
          // check if second line is separator (---|---|---)
          const isSeparator = /^[\s|:-]+$/.test(tableLines[1]);
          const dataRows = (isSeparator ? tableLines.slice(2) : tableLines.slice(1)).map((r) =>
            r
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim())
          );

          blocks.push({
            type: 'table',
            headers: headerRow,
            rows: dataRows,
          });
          continue;
        }
      }

      // Headings
      if (/^#{1,6}\s+/.test(line)) {
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          blocks.push({
            type: 'heading',
            level: match[1].length,
            text: match[2],
          });
          i++;
          continue;
        }
      }

      // Blockquotes
      if (line.startsWith('> ') || line === '>') {
        const quoteLines = [line.replace(/^>\s?/, '')];
        i++;
        while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        blocks.push({
          type: 'blockquote',
          text: quoteLines.join('\n'),
        });
        continue;
      }

      // Unordered list (* item or - item)
      if (/^(\*|-)\s+/.test(line)) {
        const items = [line.replace(/^(\*|-)\s+/, '')];
        i++;
        while (i < lines.length && /^(\*|-)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^(\*|-)\s+/, ''));
          i++;
        }
        blocks.push({
          type: 'ul',
          items,
        });
        continue;
      }

      // Ordered list (1. item)
      if (/^\d+\.\s+/.test(line)) {
        const items = [line.replace(/^\d+\.\s+/, '')];
        i++;
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ''));
          i++;
        }
        blocks.push({
          type: 'ol',
          items,
        });
        continue;
      }

      // Empty line (Paragraph break)
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Standard Paragraph
      const pLines = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].trim().startsWith('|') &&
        !/^#{1,6}\s+/.test(lines[i]) &&
        !lines[i].startsWith('> ') &&
        !/^(\*|-)\s+/.test(lines[i]) &&
        !/^\d+\.\s+/.test(lines[i])
      ) {
        pLines.push(lines[i]);
        i++;
      }

      blocks.push({
        type: 'paragraph',
        text: pLines.join('\n'),
      });
    }

    return blocks;
  }, [content]);

  if (!renderedBlocks || renderedBlocks.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2.5 text-sm leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-800'} ${className}`}>
      {renderedBlocks.map((block, idx) => {
        if (block.type === 'heading') {
          const Tag = `h${Math.min(block.level + 1, 6)}`;
          const headingClasses =
            block.level === 1
              ? 'text-lg font-bold mt-4 mb-2'
              : block.level === 2
              ? 'text-base font-bold mt-3.5 mb-1.5'
              : 'text-sm font-bold mt-2.5 mb-1';
          return (
            <Tag key={idx} className={`${headingClasses} ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>
              {renderInlineMarkdown(block.text, isDark)}
            </Tag>
          );
        }

        if (block.type === 'code') {
          return <CodeBlock key={idx} code={block.code} language={block.language} isDark={isDark} />;
        }

        if (block.type === 'table') {
          return (
            <div key={idx} className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={isDark ? 'bg-slate-800/70 text-slate-200' : 'bg-slate-100/90 text-slate-800'}>
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-3.5 py-2 font-bold border-b border-slate-200 dark:border-slate-700">
                        {renderInlineMarkdown(h, isDark)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={`border-b last:border-0 transition-colors ${
                        isDark
                          ? 'border-slate-800/70 hover:bg-slate-800/40 text-slate-300'
                          : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3.5 py-2">
                          {renderInlineMarkdown(cell, isDark)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={idx}
              className={`my-2 pl-3.5 py-1.5 border-l-3 rounded-r-lg text-xs italic leading-relaxed ${
                isDark
                  ? 'border-indigo-500/70 bg-indigo-950/30 text-slate-300'
                  : 'border-indigo-500/80 bg-indigo-50/60 text-slate-700'
              }`}
            >
              {renderInlineMarkdown(block.text, isDark)}
            </blockquote>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={idx} className="my-2 space-y-1.5 pl-5 list-disc marker:text-indigo-500">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-relaxed">
                  {renderInlineMarkdown(item, isDark)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={idx} className="my-2 space-y-1.5 pl-5 list-decimal marker:font-semibold marker:text-indigo-500">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-relaxed">
                  {renderInlineMarkdown(item, isDark)}
                </li>
              ))}
            </ol>
          );
        }

        // Standard Paragraph
        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineMarkdown(block.text, isDark)}
          </p>
        );
      })}
    </div>
  );
}
