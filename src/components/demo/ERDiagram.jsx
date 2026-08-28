import React, { memo, useMemo, useState, useCallback } from 'react';
import dagre from '@dagrejs/dagre';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Database,
  GitMerge,
  KeyRound,
  Link2,
  Table2,
  X,
  ArrowRight,
  Search,
} from 'lucide-react';

const COMPONENT_GAP = 260;
const CANVAS_PADDING = 90;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// Dedicated harmonious color palettes for each relationship line & label
const RELATION_PALETTES = [
  { id: 'indigo', stroke: '#6366f1', fill: '#4f46e5', lightBg: '#eef2ff', darkBg: '#1e1b4b', lightText: '#4338ca', darkText: '#a5b4fc', borderLight: '#c7d2fe', borderDark: '#3730a3' },
  { id: 'cyan', stroke: '#06b6d4', fill: '#0891b2', lightBg: '#ecfeff', darkBg: '#164e63', lightText: '#0e7490', darkText: '#67e8f9', borderLight: '#a5f3fc', borderDark: '#155e75' },
  { id: 'emerald', stroke: '#10b981', fill: '#059669', lightBg: '#ecfdf5', darkBg: '#064e3b', lightText: '#047857', darkText: '#6ee7b7', borderLight: '#a7f3d0', borderDark: '#065f46' },
  { id: 'violet', stroke: '#8b5cf6', fill: '#7c3aed', lightBg: '#f5f3ff', darkBg: '#2e1065', lightText: '#6d28d9', darkText: '#c4b5fd', borderLight: '#ddd6fe', borderDark: '#5b21b6' },
  { id: 'amber', stroke: '#f59e0b', fill: '#d97706', lightBg: '#fffbeb', darkBg: '#451a03', lightText: '#b45309', darkText: '#fcd34d', borderLight: '#fde68a', borderDark: '#78350f' },
  { id: 'pink', stroke: '#ec4899', fill: '#db2777', lightBg: '#fdf2f8', darkBg: '#500724', lightText: '#be185d', darkText: '#f472b6', borderLight: '#fbcfe8', borderDark: '#831843' },
  { id: 'blue', stroke: '#3b82f6', fill: '#2563eb', lightBg: '#eff6ff', darkBg: '#172554', lightText: '#1d4ed8', darkText: '#93c5fd', borderLight: '#bfdbfe', borderDark: '#1e40af' },
  { id: 'teal', stroke: '#14b8a6', fill: '#0d9488', lightBg: '#f0fdfa', darkBg: '#134e4a', lightText: '#0f766e', darkText: '#5eead4', borderLight: '#99f6e4', borderDark: '#115e59' },
];

function getRelationPalette(index) {
  return RELATION_PALETTES[index % RELATION_PALETTES.length];
}

function tableDimensions(name, table, degree) {
  const columns = table.columns || [];
  const longestColName = columns.reduce((max, c) => Math.max(max, (c.name || '').length), 0);
  const longestColType = columns.reduce((max, c) => Math.max(max, (c.type || '').length), 0);
  const longestTotal = Math.max(name.length + 10, longestColName + longestColType + 12);
  
  // Spacious width to show full table name, column names, and type badges without overlap
  const width = clamp(300 + longestTotal * 5.2 + Math.min(degree, 8) * 4, 320, 480);
  
  // Exact full height: header (50px) + accent strip (4px) + padding (16px) + rows (columns.length * 32px) + buffer (12px)
  const height = 72 + Math.max(1, columns.length) * 32;
  return { width, height };
}

function buildComponents(names, adjacency) {
  const unseen = new Set(names);
  const components = [];
  while (unseen.size) {
    const first = unseen.values().next().value;
    const queue = [first];
    const component = [];
    unseen.delete(first);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const neighbor of adjacency[current]) {
        if (unseen.has(neighbor)) {
          unseen.delete(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function layoutConnectedComponent(names, adjacency, dimensions, degrees) {
  const ordered = [...names].sort((left, right) => (
    degrees[right] - degrees[left]
    || dimensions[right].height - dimensions[left].height
    || left.localeCompare(right)
  ));
  const root = ordered[0];
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: 'TB',
    ranker: 'tight-tree',
    nodesep: 90,
    ranksep: 160,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const name of names) graph.setNode(name, dimensions[name]);

  const visited = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const parent = queue.shift();
    const children = [...adjacency[parent]]
      .filter((name) => names.includes(name) && !visited.has(name))
      .sort((left, right) => degrees[right] - degrees[left] || left.localeCompare(right));
    for (const child of children) {
      visited.add(child);
      queue.push(child);
      graph.setEdge(parent, child);
    }
  }

  dagre.layout(graph);
  const positions = {};
  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;
  for (const name of names) {
    const point = graph.node(name);
    const x = point.x - dimensions[name].width / 2;
    const y = point.y - dimensions[name].height / 2;
    positions[name] = { x, y };
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + dimensions[name].width);
    maxY = Math.max(maxY, y + dimensions[name].height);
  }
  for (const name of names) {
    positions[name] = { x: positions[name].x - minX, y: positions[name].y - minY };
  }
  const layoutWidth = maxX - minX;
  positions[root].x = (layoutWidth - dimensions[root].width) / 2;
  return { positions, width: layoutWidth, height: maxY - minY, root };
}

function edgeHandles(source, target) {
  const sourceCenter = {
    x: source.position.x + source.width / 2,
    y: source.position.y + source.height / 2,
  };
  const targetCenter = {
    x: target.position.x + target.width / 2,
    y: target.position.y + target.height / 2,
  };
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  if (Math.abs(deltaY) >= Math.abs(deltaX) * 0.6) {
    return deltaY >= 0
      ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
      : { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
  }
  return deltaX >= 0
    ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
    : { sourceHandle: 'source-left', targetHandle: 'target-right' };
}

function buildDiagram(catalog) {
  const entries = Object.entries(catalog?.tables || {});
  const tableMap = Object.fromEntries(entries);
  const names = entries.map(([name]) => name);
  const relations = entries.flatMap((([sourceName, table]) => (table.foreign_keys || [])
    .filter((foreignKey) => tableMap[foreignKey.to_table])
    .map((foreignKey, index) => ({
      id: `${sourceName}-${foreignKey.from_column}-${foreignKey.to_table}-${foreignKey.to_column}-${index}`,
      sourceName,
      paletteIndex: index,
      ...foreignKey,
    }))));

  const adjacency = Object.fromEntries(names.map((name) => [name, new Set()]));
  for (const relation of relations) {
    if (relation.sourceName !== relation.to_table) {
      adjacency[relation.sourceName].add(relation.to_table);
      adjacency[relation.to_table].add(relation.sourceName);
    }
  }

  const degrees = Object.fromEntries(names.map((name) => [name, adjacency[name].size]));
  const maximumDegree = Math.max(0, ...Object.values(degrees));
  const hubThreshold = Math.max(3, Math.ceil(maximumDegree * 0.55));
  const dimensions = Object.fromEntries(entries.map(([name, table]) => [name, tableDimensions(name, table, degrees[name])]));
  const components = buildComponents(names, adjacency)
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
  const connectedComponents = components.filter((component) => component.length > 1);
  const isolatedNames = components.filter((component) => component.length === 1).flat();
  const positions = {};
  const componentByTable = {};
  let connectedRight = CANVAS_PADDING;
  let secondaryY = CANVAS_PADDING;

  connectedComponents.forEach((component, index) => {
    const layout = layoutConnectedComponent(component, adjacency, dimensions, degrees);
    const offsetX = index === 0 ? CANVAS_PADDING : connectedRight + COMPONENT_GAP;
    const offsetY = index === 0 ? CANVAS_PADDING : secondaryY;
    for (const name of component) {
      positions[name] = {
        x: layout.positions[name].x + offsetX,
        y: layout.positions[name].y + offsetY,
      };
      componentByTable[name] = index;
    }
    connectedRight = Math.max(connectedRight, offsetX + layout.width);
    if (index > 0) secondaryY += layout.height + COMPONENT_GAP / 2;
  });

  const isolatedX = connectedComponents.length ? connectedRight + COMPONENT_GAP : CANVAS_PADDING;
  let isolatedY = CANVAS_PADDING;
  for (const name of isolatedNames.sort((left, right) => left.localeCompare(right))) {
    positions[name] = { x: isolatedX, y: isolatedY };
    isolatedY += dimensions[name].height + 60;
    componentByTable[name] = -1;
  }

  const nodes = entries.map(([name, table]) => {
    const foreignKeys = table.foreign_keys || [];
    const foreignKeyColumns = new Set(foreignKeys.map((item) => item.from_column));
    const descriptiveColumns = (table.columns || []).filter((column) => !column.primary_key && !foreignKeyColumns.has(column.name));
    const bridge = foreignKeys.length >= 2 && (
      descriptiveColumns.length <= 3
      || /(_items|_map|_links|_bridge|_memberships|_suppliers|_addresses|_benefits)$/i.test(name)
    );
    const isolated = degrees[name] === 0;
    const hub = !isolated && degrees[name] >= hubThreshold;
    const role = isolated ? 'isolated' : hub ? 'hub' : bridge ? 'bridge' : 'related';
    return {
      id: name,
      type: 'tableNode',
      position: positions[name] || { x: CANVAS_PADDING, y: CANVAS_PADDING },
      width: dimensions[name].width,
      height: dimensions[name].height,
      data: { name, table, degree: degrees[name], role, bridge },
      style: { width: dimensions[name].width, height: dimensions[name].height },
      draggable: false,
    };
  });

  const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const edges = relations.map((relation, rIdx) => {
    const source = nodeById[relation.sourceName];
    const target = nodeById[relation.to_table];
    const handles = edgeHandles(source, target);
    const palette = getRelationPalette(rIdx);

    return {
      id: relation.id,
      source: relation.sourceName,
      target: relation.to_table,
      fromColumn: relation.from_column,
      toColumn: relation.to_column,
      ...handles,
      type: 'smoothstep',
      animated: true,
      className: 'er-animated-edge',
      label: `${relation.from_column} → ${relation.to_column}`,
      palette,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: palette.stroke,
      },
      style: {
        stroke: palette.stroke,
        strokeWidth: 1.8,
      },
    };
  });

  return {
    nodes,
    edges,
    adjacency,
    componentByTable,
    signature: `${catalog?.database_name || 'database'}:${names.sort().join('|')}`,
  };
}

const HANDLE_POSITIONS = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
];

// Beautiful, spacious, overlap-free Table Node component (NO SCROLL, Full Display of ALL columns)
const TableNode = memo(function TableNode({ data }) {
  const { name, table, degree, role, bridge, isDark, isSelected, isDimmed } = data;
  const columns = table.columns || [];
  const foreignKeyColumns = new Set((table.foreign_keys || []).map((item) => item.from_column));

  // Role top accent gradient bar & border
  const roleStyles = {
    hub: {
      bar: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600',
      border: isDark ? 'border-indigo-500/80 shadow-indigo-500/10' : 'border-indigo-400 shadow-indigo-500/10',
      badge: isDark ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/80' : 'bg-indigo-50 text-indigo-700 border-indigo-200',
      tag: 'HUB',
    },
    bridge: {
      bar: 'bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500',
      border: isDark ? 'border-cyan-500/80 shadow-cyan-500/10' : 'border-cyan-400 shadow-cyan-500/10',
      badge: isDark ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80' : 'bg-cyan-50 text-cyan-700 border-cyan-200',
      tag: 'BRIDGE',
    },
    isolated: {
      bar: 'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500',
      border: isDark ? 'border-amber-500/80 border-dashed' : 'border-amber-400 border-dashed',
      badge: isDark ? 'bg-amber-950/80 text-amber-300 border-amber-700/80' : 'bg-amber-50 text-amber-700 border-amber-200',
      tag: 'STANDALONE',
    },
    related: {
      bar: isDark ? 'bg-gradient-to-r from-slate-700 to-slate-800' : 'bg-gradient-to-r from-slate-300 to-slate-400',
      border: isDark ? 'border-slate-700/80' : 'border-slate-200/90',
      badge: isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200',
      tag: null,
    },
  };

  const currentRole = roleStyles[role] || roleStyles.related;

  return (
    <div
      className={`w-full rounded-xl border transition-all duration-200 select-none group flex flex-col ${
        isSelected
          ? 'ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/20 ' + currentRole.border
          : currentRole.border
      } ${
        isDark ? 'bg-[#151922] text-slate-100' : 'bg-white text-slate-900'
      } ${isDimmed ? 'opacity-25' : 'opacity-100'}`}
    >
      {/* Hidden ReactFlow Connection Handles */}
      {HANDLE_POSITIONS.flatMap(([id, position]) => [
        <Handle key={`source-${id}`} id={`source-${id}`} type="source" position={position} className="!w-2 !h-2 !border-0 !bg-transparent !opacity-0" />,
        <Handle key={`target-${id}`} id={`target-${id}`} type="target" position={position} className="!w-2 !h-2 !border-0 !bg-transparent !opacity-0" />,
      ])}

      {/* Top Role Accent Strip */}
      <div className={`h-1.5 w-full shrink-0 ${currentRole.bar}`} />

      {/* Table Card Header */}
      <div className={`px-3.5 py-2.5 flex items-center justify-between gap-2 border-b shrink-0 ${
        isDark ? 'bg-[#1b202c] border-slate-800' : 'bg-slate-50/90 border-slate-100'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
            role === 'hub' ? 'bg-indigo-500/20 text-indigo-400' :
            role === 'bridge' ? 'bg-cyan-500/20 text-cyan-400' :
            role === 'isolated' ? 'bg-amber-500/20 text-amber-400' :
            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
          }`}>
            <Table2 className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-mono text-xs font-bold truncate leading-tight tracking-tight" title={name}>
              {name}
            </h3>
            <p className="text-[9.5px] text-slate-400 dark:text-slate-500 truncate leading-none mt-0.5">
              {table.row_count_estimate ? `${Number(table.row_count_estimate).toLocaleString()} rows` : `${columns.length} columns`}
            </p>
          </div>
        </div>

        {/* Header Badges & Degree Count */}
        <div className="flex items-center gap-1.5 shrink-0">
          {currentRole.tag && (
            <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase tracking-wider border ${currentRole.badge}`}>
              {currentRole.tag}
            </span>
          )}
          {bridge && role !== 'bridge' && (
            <span title="Bridge entity">
              <GitMerge className="w-3 h-3 text-cyan-400 shrink-0" />
            </span>
          )}
          {degree > 0 && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
              isDark ? 'bg-slate-800/80 text-slate-400 border-slate-700/60' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`} title={`${degree} active relationship link(s)`}>
              <Link2 className="w-2.5 h-2.5 text-indigo-400" />
              <span>{degree}</span>
            </span>
          )}
        </div>
      </div>

      {/* Columns List - FULL DISPLAY of ALL columns, NO SCROLL, Strictly Overlap-Free */}
      <div className="p-2 space-y-1">
        {columns.map((column) => {
          const isPk = Boolean(column.primary_key);
          const isFk = foreignKeyColumns.has(column.name);

          return (
            <div
              key={column.name}
              className={`h-7 px-2.5 rounded-lg flex items-center justify-between gap-3 text-[11px] transition-colors ${
                isPk 
                  ? (isDark ? 'bg-amber-950/20 border border-amber-900/30 text-amber-200' : 'bg-amber-50/60 border border-amber-200/60 text-amber-900') :
                isFk 
                  ? (isDark ? 'bg-indigo-950/20 border border-indigo-900/30 text-indigo-200' : 'bg-indigo-50/60 border border-indigo-200/60 text-indigo-900') :
                (isDark ? 'hover:bg-slate-800/40 text-slate-300' : 'hover:bg-slate-50 text-slate-700')
              }`}
            >
              {/* Left: Column Icon + Name */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isPk && (
                  <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Primary Key" />
                )}
                {isFk && !isPk && (
                  <Link2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" title="Foreign Key Reference" />
                )}
                {!isPk && !isFk && (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                )}
                <span className="font-mono text-[11px] font-medium truncate" title={column.name}>
                  {column.name}
                </span>
              </div>

              {/* Right: Data Type Badge (shrink-0 prevents overlap) */}
              <span
                className={`shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded border leading-none ${
                  isDark
                    ? 'bg-slate-800/90 text-slate-400 border-slate-700/60'
                    : 'bg-slate-100 text-slate-500 border-slate-200/80'
                }`}
                title={column.type}
              >
                {column.type || 'TEXT'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}, (prev, next) => (
  prev.data.name === next.data.name &&
  prev.data.isDark === next.data.isDark &&
  prev.data.isSelected === next.data.isSelected &&
  prev.data.isDimmed === next.data.isDimmed
));

const nodeTypes = { tableNode: TableNode };

export default function ERDiagram({ catalog, isDark = false }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const diagram = useMemo(() => buildDiagram(catalog), [catalog]);

  const activeEdgeId = selectedEdge;
  const activeTableId = selectedTable;
  const activeEdgeObj = useMemo(() => activeEdgeId ? diagram.edges.find((e) => e.id === activeEdgeId) : null, [diagram.edges, activeEdgeId]);

  const queryNormalized = searchQuery.trim().toLowerCase();
  const isSearching = Boolean(queryNormalized);

  // Search matches summary
  const searchResults = useMemo(() => {
    if (!queryNormalized) return { tables: [], edges: [] };

    const matchingTables = diagram.nodes.filter((node) => {
      if (node.id.toLowerCase().includes(queryNormalized)) return true;
      return (node.data.table.columns || []).some((col) => col.name.toLowerCase().includes(queryNormalized));
    });

    const matchingEdges = diagram.edges.filter((edge) => {
      return edge.source.toLowerCase().includes(queryNormalized)
        || edge.target.toLowerCase().includes(queryNormalized)
        || (edge.fromColumn && edge.fromColumn.toLowerCase().includes(queryNormalized))
        || (edge.toColumn && edge.toColumn.toLowerCase().includes(queryNormalized));
    });

    return { tables: matchingTables, edges: matchingEdges };
  }, [diagram, queryNormalized]);

  const hasActiveFocus = Boolean(activeEdgeId || activeTableId || isSearching);

  // Nodes display logic with memoized isolation & search filter
  const displayNodes = useMemo(() => diagram.nodes.map((node) => {
    let isConnected = true;
    let isSelected = false;

    if (isSearching) {
      const matchesName = node.id.toLowerCase().includes(queryNormalized);
      const matchesColumn = (node.data.table.columns || []).some((col) => col.name.toLowerCase().includes(queryNormalized));
      isConnected = matchesName || matchesColumn;
      isSelected = matchesName;
    } else if (activeEdgeObj) {
      isConnected = node.id === activeEdgeObj.source || node.id === activeEdgeObj.target;
      isSelected = isConnected;
    } else if (activeTableId) {
      isConnected = node.id === activeTableId || diagram.adjacency[activeTableId]?.has(node.id);
      isSelected = node.id === activeTableId;
    }

    return {
      ...node,
      zIndex: isSelected ? 30 : 10,
      style: {
        ...node.style,
        zIndex: isSelected ? 30 : 10,
      },
      data: {
        ...node.data,
        isDark,
        isSelected,
        isDimmed: hasActiveFocus && !isConnected,
      },
    };
  }), [diagram, activeEdgeObj, activeTableId, isSearching, queryNormalized, hasActiveFocus, isDark]);

  // Edges display logic: selected stands out brilliantly, others are lighter/dimmed
  const displayEdges = useMemo(() => diagram.edges.map((edge) => {
    let isActive = false;

    if (isSearching) {
      isActive = edge.source.toLowerCase().includes(queryNormalized)
        || edge.target.toLowerCase().includes(queryNormalized)
        || (edge.fromColumn && edge.fromColumn.toLowerCase().includes(queryNormalized))
        || (edge.toColumn && edge.toColumn.toLowerCase().includes(queryNormalized));
    } else if (activeEdgeId) {
      isActive = edge.id === activeEdgeId;
    } else if (activeTableId) {
      isActive = edge.source === activeTableId || edge.target === activeTableId;
    }

    const { palette } = edge;

    if (hasActiveFocus) {
      if (isActive) {
        // Selected / Active Relationship: STANDS OUT BRILLIANTLY
        return {
          ...edge,
          className: 'er-animated-edge er-active-edge',
          zIndex: 2,
          style: {
            ...edge.style,
            stroke: palette.stroke,
            strokeWidth: 3.6,
            opacity: 1,
          },
          markerEnd: {
            ...edge.markerEnd,
            width: 20,
            height: 20,
            color: palette.stroke,
          },
          labelStyle: {
            fill: isDark ? palette.darkText : palette.lightText,
            fontSize: 10.5,
            fontWeight: 800,
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          },
          labelBgStyle: {
            fill: isDark ? palette.darkBg : palette.lightBg,
            stroke: palette.stroke,
            strokeWidth: 2,
            fillOpacity: 1,
          },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 6,
        };
      } else {
        // Other Relationships: LIGHTER / FAINT / DIMMED COLOR
        const dimmedStroke = isDark ? '#2e384d' : '#cbd5e1';
        return {
          ...edge,
          className: 'er-animated-edge er-dimmed-edge',
          zIndex: 1,
          style: {
            ...edge.style,
            stroke: dimmedStroke,
            strokeWidth: 1.2,
            opacity: 0.12,
          },
          markerEnd: {
            ...edge.markerEnd,
            width: 12,
            height: 12,
            color: dimmedStroke,
          },
          labelStyle: {
            fill: isDark ? '#475569' : '#94a3b8',
            fontSize: 9,
            fontWeight: 500,
            opacity: 0.2,
            fontFamily: 'ui-monospace, monospace',
          },
          labelBgStyle: {
            fill: isDark ? '#151922' : '#f8fafc',
            stroke: 'transparent',
            strokeWidth: 0,
            fillOpacity: 0.2,
          },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 3,
        };
      }
    }

    // Default Unfocused State: All Relationships Vibrant & Animated
    return {
      ...edge,
      className: 'er-animated-edge',
      zIndex: 1,
      style: {
        ...edge.style,
        stroke: palette.stroke,
        strokeWidth: 1.8,
        opacity: 0.85,
      },
      markerEnd: {
        ...edge.markerEnd,
        width: 16,
        height: 16,
        color: palette.stroke,
      },
      labelStyle: {
        fill: isDark ? palette.darkText : palette.lightText,
        fontSize: 9.5,
        fontWeight: 700,
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      },
      labelBgStyle: {
        fill: isDark ? palette.darkBg : palette.lightBg,
        stroke: isDark ? palette.borderDark : palette.borderLight,
        strokeWidth: 1,
        fillOpacity: 0.95,
      },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
    };
  }), [diagram, activeEdgeId, activeTableId, isSearching, queryNormalized, hasActiveFocus, isDark]);

  const handleEdgeClick = useCallback((_, edge) => {
    setSelectedTable(null);
    setSelectedEdge((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  const handleNodeClick = useCallback((_, node) => {
    setSelectedEdge(null);
    setSelectedTable((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedEdge(null);
    setSelectedTable(null);
  }, []);

  if (!diagram.nodes.length) {
    return (
      <div className="h-72 flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-slate-400 dark:text-slate-500">
        <Database className="w-8 h-8 mb-2 opacity-60" />
        <p className="text-xs font-semibold">No schema tables available for this data source.</p>
      </div>
    );
  }

  // Dark-aware canvas tokens
  const canvasBg = isDark ? '#0d1117' : '#f8fafc';
  const canvasBorder = isDark ? '#1f293d' : '#e2e8f0';
  const dotColor = isDark ? '#252d3d' : '#cbd5e1';
  const minimapMask = isDark ? 'rgba(13,17,23,0.85)' : 'rgba(248,250,252,0.85)';
  const minimapBg = isDark ? '#151922' : '#ffffff';
  const minimapBorder = isDark ? '#2a3447' : '#e2e8f0';
  const legendBg = isDark ? 'rgba(21,25,34,0.95)' : 'rgba(255,255,255,0.95)';
  const legendBorder = isDark ? '#2a3447' : '#e2e8f0';

  return (
    <div
      className="relative h-[clamp(580px,75vh,900px)] overflow-hidden rounded-2xl border shadow-xs transition-colors"
      style={{ backgroundColor: canvasBg, borderColor: canvasBorder }}
    >
      {/* Top-Left Quick Search to find tables and relationships fast */}
      <div className="absolute left-4 top-4 z-20 w-64 sm:w-80">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-md backdrop-blur-md transition-all ${
          isDark 
            ? 'bg-[#151922]/95 border-slate-700/80 text-slate-100 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20' 
            : 'bg-white/95 border-slate-200 text-slate-800 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 shadow-sm'
        }`}>
          <Search className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('');
            }}
            placeholder="Quick search tables & FKs..."
            className="w-full bg-transparent text-xs outline-none placeholder-slate-400 dark:placeholder-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded flex items-center justify-center shrink-0 transition-colors"
              title="Clear search (Esc)"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Quick Search Autocomplete Results Dropdown */}
        {isSearching && (
          <div className={`mt-1.5 max-h-64 overflow-y-auto rounded-xl border shadow-2xl backdrop-blur-md p-1.5 animate-in fade-in slide-in-from-top-1 duration-150 ${
            isDark 
              ? 'bg-[#151922]/98 border-slate-700/80 text-slate-200 divide-y divide-slate-800' 
              : 'bg-white/98 border-slate-200 text-slate-800 divide-y divide-slate-100'
          }`}>
            {/* Matching Tables Section */}
            {searchResults.tables.length > 0 && (
              <div className="py-1">
                <p className="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Tables ({searchResults.tables.length})
                </p>
                {searchResults.tables.slice(0, 6).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      setSelectedEdge(null);
                      setSelectedTable(node.id);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                      isDark ? 'hover:bg-slate-800/80 text-slate-200' : 'hover:bg-indigo-50/80 text-slate-800'
                    }`}
                  >
                    <span className="font-mono font-bold flex items-center gap-1.5 truncate">
                      <Table2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate">{node.id}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                      {node.data.table.columns?.length || 0} cols
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Matching Relationships Section */}
            {searchResults.edges.length > 0 && (
              <div className="py-1">
                <p className="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Relationships ({searchResults.edges.length})
                </p>
                {searchResults.edges.slice(0, 6).map((edge) => (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => {
                      setSelectedTable(null);
                      setSelectedEdge(edge.id);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                      isDark ? 'hover:bg-slate-800/80 text-slate-200' : 'hover:bg-indigo-50/80 text-slate-800'
                    }`}
                  >
                    <span className="font-mono text-[11px] flex items-center gap-1 truncate">
                      <Link2 className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span className="font-semibold">{edge.source}.{edge.fromColumn}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                      <span className="font-semibold">{edge.target}.{edge.toColumn}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {searchResults.tables.length === 0 && searchResults.edges.length === 0 && (
              <div className="py-3 text-center text-xs text-slate-400">
                No matching tables or relationships found.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Legend with Relationship Flow indicator */}
      <div
        className="absolute right-4 top-4 z-10 hidden sm:flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 shadow-md backdrop-blur-md transition-colors"
        style={{ background: legendBg, border: `1px solid ${legendBorder}` }}
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 dark:text-indigo-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-indigo-500 to-purple-500" />
          Hub Table
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-cyan-500 to-teal-500" />
          Bridge Table
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
          <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-amber-500 bg-amber-500/20" />
          Standalone
        </span>
        <span className="text-slate-300 dark:text-slate-700 font-light">|</span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="w-4 h-0.5 bg-indigo-500 animate-pulse" />
          Click line to isolate
        </span>
      </div>

      {/* Selected Relationship Inspector Card */}
      {activeEdgeObj && (
        <div
          className="absolute left-4 bottom-4 z-20 flex items-center gap-3 rounded-xl px-3.5 py-2.5 shadow-xl backdrop-blur-md border animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{
            background: isDark ? 'rgba(21,25,34,0.96)' : 'rgba(255,255,255,0.96)',
            borderColor: activeEdgeObj.palette.stroke,
          }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
            style={{ backgroundColor: activeEdgeObj.palette.fill }}
          >
            <Link2 className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                {activeEdgeObj.source}
              </span>
              <span className="text-[10px] font-mono text-indigo-500">
                .{activeEdgeObj.fromColumn}
              </span>
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                {activeEdgeObj.target}
              </span>
              <span className="text-[10px] font-mono text-emerald-500">
                .{activeEdgeObj.toColumn}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              Foreign Key Relationship (Active Path Isolated)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedEdge(null)}
            className="w-6 h-6 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors ml-2"
            title="Clear isolation (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <ReactFlow
        key={diagram.signature}
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements
        fitView
        fitViewOptions={{ padding: 0.16, minZoom: 0.08, maxZoom: 1, duration: 450 }}
        minZoom={0.08}
        maxZoom={2.5}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        onEdgeClick={handleEdgeClick}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color={dotColor} />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          nodeColor={(node) =>
            node.data.role === 'isolated' ? '#f59e0b'
            : node.data.role === 'hub' ? '#6366f1'
            : node.data.role === 'bridge' ? '#06b6d4'
            : isDark ? '#3b4252' : '#cbd5e1'
          }
          maskColor={minimapMask}
          style={{ backgroundColor: minimapBg, border: `1px solid ${minimapBorder}`, borderRadius: '12px' }}
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          style={isDark ? { backgroundColor: '#151922', border: '1px solid #2a3447', borderRadius: '10px', boxShadow: 'none' } : { borderRadius: '10px' }}
        />
      </ReactFlow>
    </div>
  );
}
