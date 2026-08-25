import React, { memo, useMemo, useState } from 'react';
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
import { GitMerge, KeyRound, Link2 } from 'lucide-react';

const MAX_VISIBLE_COLUMNS = 12;
const COMPONENT_GAP = 180;
const CANVAS_PADDING = 60;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function tableDimensions(name, table, degree) {
  const columns = table.columns || [];
  const longestField = columns.reduce(
    (length, column) => Math.max(length, `${column.name || ''} ${column.type || ''}`.length),
    name.length,
  );
  const width = clamp(210 + Math.max(0, longestField - 20) * 4 + Math.min(degree, 8) * 3, 218, 320);
  const visibleColumns = Math.min(columns.length, MAX_VISIBLE_COLUMNS);
  const overflowRow = columns.length > MAX_VISIBLE_COLUMNS ? 20 : 0;
  const height = 48 + visibleColumns * 22 + overflowRow;
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
    nodesep: 58,
    ranksep: 118,
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
  if (Math.abs(deltaY) >= Math.abs(deltaX) * 0.55) {
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
  const relations = entries.flatMap(([sourceName, table]) => (table.foreign_keys || [])
    .filter((foreignKey) => tableMap[foreignKey.to_table])
    .map((foreignKey, index) => ({
      id: `${sourceName}-${foreignKey.from_column}-${foreignKey.to_table}-${foreignKey.to_column}-${index}`,
      sourceName,
      ...foreignKey,
    })));
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
    isolatedY += dimensions[name].height + 46;
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
  const edges = relations.map((relation) => {
    const source = nodeById[relation.sourceName];
    const target = nodeById[relation.to_table];
    const handles = edgeHandles(source, target);
    return {
      id: relation.id,
      source: relation.sourceName,
      target: relation.to_table,
      ...handles,
      type: 'smoothstep',
      label: `${relation.from_column} -> ${relation.to_column}`,
      // Colours are set at render time via displayEdges (isDark-aware)
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#64748b' },
      style: { stroke: '#94a3b8', strokeWidth: 1.4 },
      labelStyle: { fill: '#475569', fontSize: 9, fontFamily: 'ui-monospace, monospace' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 3,
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

const TableNode = memo(function TableNode({ data }) {
  const { name, table, degree, role, bridge, isDark } = data;
  const columns = table.columns || [];
  const foreignKeyColumns = new Set((table.foreign_keys || []).map((item) => item.from_column));

  // Border styles — kept vivid so they show on both light and dark canvases
  const roleBorder = {
    hub: 'border-indigo-500',
    bridge: 'border-cyan-500',
    isolated: 'border-amber-500 border-dashed',
    related: isDark ? 'border-slate-600' : 'border-slate-300',
  };
  const roleLabels = { hub: 'HUB', bridge: 'BRIDGE', isolated: 'ISOLATED' };

  const cardBg = isDark ? '#20242d' : '#ffffff';
  const headerBg = isDark ? '#1b1f27' : 'rgba(241,245,249,0.9)';
  const headerBorder = isDark ? '#323844' : '#e2e8f0';
  const nameColor = isDark ? '#e2e8f0' : '#1e293b';
  const colNameColor = isDark ? '#cbd5e1' : '#334155';
  const colTypeColor = isDark ? '#64748b' : '#94a3b8';
  const overflowColor = isDark ? '#475569' : '#94a3b8';
  const degreeColor = isDark ? '#94a3b8' : '#64748b';

  const roleBadgeCls = {
    isolated: isDark ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-50 text-amber-700',
    bridge: isDark ? 'bg-cyan-900/50 text-cyan-300' : 'bg-cyan-50 text-cyan-700',
    hub: isDark ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-50 text-indigo-700',
  };

  return (
    <div
      className={`w-full h-full rounded-md border-2 overflow-hidden shadow-sm ${roleBorder[role]}`}
      style={{ backgroundColor: cardBg }}
    >
      {HANDLE_POSITIONS.flatMap(([id, position]) => [
        <Handle key={`source-${id}`} id={`source-${id}`} type="source" position={position} className="!w-1.5 !h-1.5 !border-0 !bg-slate-400 !opacity-0" />,
        <Handle key={`target-${id}`} id={`target-${id}`} type="target" position={position} className="!w-1.5 !h-1.5 !border-0 !bg-slate-400 !opacity-0" />,
      ])}
      {/* Table heading */}
      <div
        className="h-11 px-3 flex items-center justify-between gap-2"
        style={{ backgroundColor: headerBg, borderBottom: `1px solid ${headerBorder}` }}
      >
        <span className="min-w-0 font-mono text-xs font-bold truncate" style={{ color: nameColor }} title={name}>{name}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {roleLabels[role] && (
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${roleBadgeCls[role] || ''}`}>
              {roleLabels[role]}
            </span>
          )}
          {bridge && role !== 'bridge' && <GitMerge className="w-3 h-3 text-cyan-500" />}
          {degree > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold" style={{ color: degreeColor }}>
              <Link2 className="w-3 h-3" />{degree}
            </span>
          )}
        </span>
      </div>
      {/* Column rows */}
      <div className="px-3 py-2 space-y-1">
        {columns.slice(0, MAX_VISIBLE_COLUMNS).map((column) => {
          const foreignKey = foreignKeyColumns.has(column.name);
          return (
            <div key={column.name} className="h-[18px] flex items-center justify-between gap-3 text-[10px]">
              <span className="min-w-0 flex items-center gap-1.5 font-mono truncate" style={{ color: colNameColor }} title={column.name}>
                {column.primary_key && <KeyRound className="w-3 h-3 text-amber-500 shrink-0" />}
                {foreignKey && !column.primary_key && <Link2 className="w-3 h-3 text-indigo-400 shrink-0" />}
                <span className="truncate">{column.name}</span>
              </span>
              <span className="max-w-[42%] truncate" style={{ color: colTypeColor }} title={column.type}>{column.type}</span>
            </div>
          );
        })}
        {columns.length > MAX_VISIBLE_COLUMNS && (
          <div className="h-[18px] text-[9px]" style={{ color: overflowColor }}>+{columns.length - MAX_VISIBLE_COLUMNS} columns</div>
        )}
      </div>
    </div>
  );
});

const nodeTypes = { tableNode: TableNode };

export default function ERDiagram({ catalog, isDark = false }) {
  const [hoveredTable, setHoveredTable] = useState(null);
  const diagram = useMemo(() => buildDiagram(catalog), [catalog]);
  const displayNodes = useMemo(() => diagram.nodes.map((node) => {
    const related = !hoveredTable
      || node.id === hoveredTable
      || diagram.adjacency[hoveredTable]?.has(node.id);
    return {
      ...node,
      style: { ...node.style, opacity: related ? 1 : 0.2 },
      // Pass isDark into node data so TableNode can read it
      data: { ...node.data, isDark },
    };
  }), [diagram, hoveredTable, isDark]);

  // Dark-aware edge tokens
  const edgeDefaultStroke = isDark ? '#475569' : '#94a3b8';
  const edgeActiveStroke = '#4f46e5';
  const edgeLabelFill = isDark ? '#94a3b8' : '#475569';
  const edgeLabelBgFill = isDark ? '#20242d' : '#ffffff';
  const edgeLabelBgOpacity = isDark ? 0.95 : 0.92;

  const displayEdges = useMemo(() => diagram.edges.map((edge) => {
    const active = !hoveredTable || edge.source === hoveredTable || edge.target === hoveredTable;
    return {
      ...edge,
      hidden: Boolean(hoveredTable && !active),
      style: {
        ...edge.style,
        stroke: hoveredTable && active ? edgeActiveStroke : edgeDefaultStroke,
        strokeWidth: hoveredTable && active ? 2.2 : 1.4,
      },
      markerEnd: { ...edge.markerEnd, color: hoveredTable && active ? edgeActiveStroke : (isDark ? '#64748b' : '#64748b') },
      labelStyle: { fill: edgeLabelFill, fontSize: 9, fontFamily: 'ui-monospace, monospace' },
      labelBgStyle: { fill: edgeLabelBgFill, fillOpacity: edgeLabelBgOpacity },
    };
  }), [diagram, hoveredTable, isDark, edgeDefaultStroke, edgeLabelFill, edgeLabelBgFill, edgeLabelBgOpacity]);

  if (!diagram.nodes.length) {
    return <div className="py-20 text-center text-sm text-slate-400">No tables are available for this source.</div>;
  }

  // Dark-aware canvas and minimap tokens
  const canvasBg = isDark ? '#171a21' : '#f8fafc';
  const canvasBorder = isDark ? '#323844' : '#e2e8f0';
  const dotColor = isDark ? '#2d3442' : '#cbd5e1';
  const minimapMask = isDark ? 'rgba(23,26,33,0.82)' : 'rgba(241,245,249,0.78)';
  const minimapBg = isDark ? '#12151b' : '#ffffff';
  const minimapBorder = isDark ? '#323844' : '#e2e8f0';
  const legendBg = isDark ? 'rgba(27,31,39,0.97)' : 'rgba(255,255,255,0.95)';
  const legendBorder = isDark ? '#323844' : '#e2e8f0';

  return (
    <div
      className="relative h-[clamp(560px,72vh,860px)] overflow-hidden rounded-md border"
      style={{ backgroundColor: canvasBg, borderColor: canvasBorder }}
    >
      {/* Legend */}
      <div
        className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md px-2 py-1.5 shadow-sm"
        style={{ background: legendBg, border: `1px solid ${legendBorder}` }}
      >
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-400">
          <span className="w-2 h-2 rounded-sm border-2 border-indigo-500" />Hub
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-cyan-400">
          <span className="w-2 h-2 rounded-sm border-2 border-cyan-500" />Bridge
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400">
          <span className="w-2 h-2 rounded-sm border-2 border-dashed border-amber-500" />Isolated
        </span>
      </div>

      <ReactFlow
        key={diagram.signature}
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.14, minZoom: 0.08, maxZoom: 1, duration: 450 }}
        minZoom={0.08}
        maxZoom={2.5}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        onNodeMouseEnter={(_, node) => setHoveredTable(node.id)}
        onNodeMouseLeave={() => setHoveredTable(null)}
        onPaneClick={() => setHoveredTable(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={dotColor} />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          nodeColor={(node) =>
            node.data.role === 'isolated' ? '#f59e0b'
            : node.data.role === 'hub' ? '#6366f1'
            : node.data.role === 'bridge' ? '#06b6d4'
            : isDark ? '#475569' : '#94a3b8'
          }
          maskColor={minimapMask}
          style={{ backgroundColor: minimapBg, border: `1px solid ${minimapBorder}` }}
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          style={isDark ? { backgroundColor: '#20242d', border: '1px solid #323844', boxShadow: 'none' } : undefined}
        />
      </ReactFlow>
    </div>
  );
}
