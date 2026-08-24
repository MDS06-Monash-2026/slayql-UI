import React, { useMemo, useState } from 'react';
import { GitMerge, KeyRound, Link2 } from 'lucide-react';

export default function ERDiagram({ catalog }) {
  const [hoveredTable, setHoveredTable] = useState(null);
  const entries = Object.entries(catalog?.tables || {});
  const columns = entries.length > 12 ? 4 : 3;
  const nodeWidth = 226;
  const nodeHeight = 164;
  const gapX = 76;
  const gapY = 72;
  const padding = 34;
  const positions = Object.fromEntries(entries.map(([name], index) => [name, {
    x: padding + (index % columns) * (nodeWidth + gapX),
    y: padding + Math.floor(index / columns) * (nodeHeight + gapY),
  }]));
  const width = padding * 2 + columns * nodeWidth + (columns - 1) * gapX;
  const rows = Math.max(1, Math.ceil(entries.length / columns));
  const height = padding * 2 + rows * nodeHeight + (rows - 1) * gapY;
  const relations = useMemo(() => entries.flatMap(([sourceName, table]) => (table.foreign_keys || []).map((fk) => ({ sourceName, ...fk }))), [catalog]);

  if (!entries.length) return <div className="py-20 text-center text-sm text-slate-400">No tables are available for this source.</div>;

  return (
    <div className="er-canvas overflow-auto rounded-lg border border-slate-200 bg-slate-50/70 min-h-[520px]">
      <div className="relative" style={{ width, height }} onMouseLeave={() => setHoveredTable(null)}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <defs>
            <marker id="er-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#818cf8" /></marker>
            <marker id="er-arrow-active" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#4f46e5" /></marker>
          </defs>
          {relations.map((relation, index) => {
            const source = positions[relation.sourceName];
            const target = positions[relation.to_table];
            if (!source || !target) return null;
            const sourceX = source.x + nodeWidth / 2;
            const sourceY = source.y + nodeHeight / 2;
            const targetX = target.x + nodeWidth / 2;
            const targetY = target.y + nodeHeight / 2;
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            const active = !hoveredTable || hoveredTable === relation.sourceName || hoveredTable === relation.to_table;
            const label = `${relation.from_column} FK`;
            return <g key={`${relation.sourceName}-${relation.from_column}-${index}`} className={active ? 'opacity-100' : 'opacity-15'}>
              <path className="er-relation-line" d={`M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`} fill="none" stroke={hoveredTable && active ? '#4f46e5' : '#818cf8'} strokeWidth={hoveredTable && active ? 2.2 : 1.5} markerEnd={hoveredTable && active ? 'url(#er-arrow-active)' : 'url(#er-arrow)'} />
              <g transform={`translate(${midX - 34} ${midY - 9})`}><rect width="68" height="18" rx="4" fill={hoveredTable && active ? '#eef2ff' : '#ffffff'} stroke={hoveredTable && active ? '#a5b4fc' : '#dbe2ea'} /><text x="34" y="12" textAnchor="middle" fontSize="8" fontFamily="ui-monospace, monospace" fill="#64748b">{label.length > 12 ? `${label.slice(0, 11)}...` : label}</text></g>
            </g>;
          })}
        </svg>
        {entries.map(([name, table]) => {
          const position = positions[name];
          const foreignKeys = table.foreign_keys || [];
          const fkColumns = new Set(foreignKeys.map((item) => item.from_column));
          const descriptiveColumns = (table.columns || []).filter((column) => !column.primary_key && !fkColumns.has(column.name));
          const bridge = foreignKeys.length >= 2 && (descriptiveColumns.length <= 2 || /(_items|_map|_links|_bridge|_memberships|_suppliers)$/.test(name));
          const connected = !hoveredTable || hoveredTable === name || relations.some((relation) => (relation.sourceName === hoveredTable && relation.to_table === name) || (relation.to_table === hoveredTable && relation.sourceName === name));
          return (
            <button type="button" key={name} onMouseEnter={() => setHoveredTable(name)} onFocus={() => setHoveredTable(name)} onBlur={() => setHoveredTable(null)} className={`er-table-node absolute rounded-lg border bg-white text-left overflow-hidden transition-all duration-200 ${hoveredTable === name ? 'border-indigo-400 shadow-lg -translate-y-1' : 'border-slate-200 shadow-sm'} ${connected ? 'opacity-100' : 'opacity-35'}`} style={{ left: position.x, top: position.y, width: nodeWidth, height: nodeHeight }}>
              <span className="h-10 px-3 flex items-center justify-between gap-2 bg-slate-100/80 border-b border-slate-200"><span className="font-mono text-xs font-bold text-slate-800 truncate">{name}</span><span className="flex items-center gap-1.5">{bridge && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-50 text-[8px] font-bold text-cyan-700"><GitMerge className="w-2.5 h-2.5" />BRIDGE</span>}{foreignKeys.length > 0 && <Link2 className="w-3.5 h-3.5 text-indigo-500" />}</span></span>
              <span className="block px-3 py-2 space-y-1.5">
                {(table.columns || []).slice(0, 5).map((column) => {
                  const fk = foreignKeys.some((item) => item.from_column === column.name);
                  return <span key={column.name} className="flex items-center justify-between gap-2 text-[10px]"><span className="min-w-0 flex items-center gap-1.5 font-mono text-slate-700 truncate">{column.primary_key && <KeyRound className="w-3 h-3 text-amber-500 shrink-0" />}{fk && !column.primary_key && <Link2 className="w-3 h-3 text-indigo-400 shrink-0" />}{column.name}</span><span className="text-slate-400 truncate">{column.type}</span></span>;
                })}
                {(table.columns || []).length > 5 && <span className="block text-[9px] text-slate-400">+{table.columns.length - 5} columns</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
