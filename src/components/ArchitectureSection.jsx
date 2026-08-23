import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageCircle, Search, Network, Target, Repeat,
  FileCheck2, PlayCircle, BarChart3,
  X, ChevronLeft, ChevronRight,
  Activity, Clock, Cpu, CheckCircle2, Database,
  Shield, Layers, ArrowRight, Zap, ArrowDown
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   Architecture node definitions
   ═══════════════════════════════════════════════════════════════════ */
const ARCH_NODES = [
  {
    id: 'nl-input',
    label: 'NL Input Layer',
    sublabel: 'Natural Language Processing',
    icon: MessageCircle,
    color: '#334155',
    colorLight: '#f8fafc',
    colorBorder: '#e2e8f0',
    badge: 'Gateway',
    status: 'operational',
    telemetry: [
      { label: 'Avg tokens', value: '48', unit: 'tokens', icon: Cpu },
      { label: 'Parse latency', value: '12', unit: 'ms', icon: Clock },
      { label: 'Req/min', value: '240', unit: '/min', icon: Activity },
      { label: 'Uptime', value: '99.98', unit: '%', icon: CheckCircle2 },
    ],
    description: '• Accepts raw natural language questions\n• Tokenization + language detection\n• Intent classification before forwarding to semantic engine',
    dataFlow: ['User Browser', 'NL Input Layer', 'Semantic Retrieval'],
  },
  {
    id: 'semantic-retrieval',
    label: 'Semantic Retrieval Engine',
    sublabel: 'BGE-Large Embeddings · Cosine Similarity',
    icon: Search,
    color: '#4f46e5',
    colorLight: '#eef2ff',
    colorBorder: '#c7d2fe',
    badge: 'ML Core',
    status: 'operational',
    telemetry: [
      { label: 'Embedding dims', value: '1024', unit: 'dims', icon: Layers },
      { label: 'Latency', value: '38', unit: 'ms', icon: Clock },
      { label: 'Candidate cols', value: '12–40', unit: 'cols', icon: Database },
      { label: 'Recall@10', value: '91.4', unit: '%', icon: CheckCircle2 },
    ],
    description: '• BGE-Large dense vector embeddings\n• Cosine similarity over all schema columns\n• Returns top 12–40 candidate columns ranked by semantic proximity',
    dataFlow: ['NL Input', 'BGE-Large Encoder', 'Graph Reasoner'],
  },
  {
    id: 'graph-reasoner',
    label: 'Graph Schema Reasoner',
    sublabel: 'Relevance-Based Propagation (RBP)',
    icon: Network,
    color: '#2563eb',
    colorLight: '#eff6ff',
    colorBorder: '#bfdbfe',
    badge: 'Graph Engine',
    status: 'operational',
    telemetry: [
      { label: 'Walk depth', value: '3', unit: 'hops', icon: Network },
      { label: 'Bridge tables', value: '2.4', unit: 'avg', icon: Database },
      { label: 'RBP latency', value: '55', unit: 'ms', icon: Clock },
      { label: 'Recall gain', value: '+18', unit: '%', icon: Activity },
    ],
    description: '• Random-walk RBP traverses the FK graph\n• Recovers bridge tables dense retrieval misses\n• Ensures multi-hop join paths are included in context',
    dataFlow: ['Semantic Retrieval', 'FK Graph Walk (RBP)', 'Value Grounding'],
  },
  {
    id: 'value-grounding',
    label: 'Value Grounding',
    sublabel: 'BM25 Column-Value Index',
    icon: Target,
    color: '#d97706',
    colorLight: '#fffbeb',
    colorBorder: '#fde68a',
    badge: 'Retrieval',
    status: 'operational',
    telemetry: [
      { label: 'Index size', value: '2.1', unit: 'GB', icon: Database },
      { label: 'BM25 latency', value: '22', unit: 'ms', icon: Clock },
      { label: 'Value matches', value: '1–3', unit: '/query', icon: Target },
      { label: 'Precision', value: '94.7', unit: '%', icon: CheckCircle2 },
    ],
    description: '• BM25 inverted index over all column values\n• Maps string literals → exact table-column location\n• Prevents hallucinated column references',
    dataFlow: ['Graph Reasoner', 'BM25 Value Index', 'Agentic Explorer'],
  },
  {
    id: 'agentic-explorer',
    label: 'Agentic Explorer',
    sublabel: 'Interactive Turn-by-Turn Early Exit (IT-EE)',
    icon: Repeat,
    color: '#7c3aed',
    colorLight: '#f5f3ff',
    colorBorder: '#ddd6fe',
    badge: 'Agentic',
    status: 'operational',
    telemetry: [
      { label: 'Avg turns', value: '2.7', unit: 'turns', icon: Repeat },
      { label: 'Early exit rate', value: '68', unit: '%', icon: Zap },
      { label: 'Token savings', value: '31', unit: '%', icon: Cpu },
      { label: 'Latency', value: '420', unit: 'ms', icon: Clock },
    ],
    description: '• LLM requests additional schema context turn-by-turn\n• IT-EE monitors schema-candidate stability\n• Exits early once relevant columns stabilise — saves tokens',
    dataFlow: ['Value Grounding', 'Schema Refinement Loop', 'SQL Compiler'],
  },
  {
    id: 'sql-compiler',
    label: 'SQL Compiler',
    sublabel: 'Strict Output Contracts (QOC)',
    icon: FileCheck2,
    color: '#059669',
    colorLight: '#ecfdf5',
    colorBorder: '#a7f3d0',
    badge: 'Compiler',
    status: 'operational',
    telemetry: [
      { label: 'QOC pass rate', value: '97.2', unit: '%', icon: Shield },
      { label: 'Gen latency', value: '680', unit: 'ms', icon: Clock },
      { label: 'Retry rate', value: '2.8', unit: '%', icon: Activity },
      { label: 'Avg SQL length', value: '14', unit: 'lines', icon: FileCheck2 },
    ],
    description: '• Enforces Strict Output Contracts (QOC)\n• SQL must appear in a single fenced code block\n• Rejects & retries conversational output — eliminates silent parse failures',
    dataFlow: ['Agentic Explorer', 'LLM (GPT-4o) + QOC', 'Execution Voter'],
  },
  {
    id: 'execution-voter',
    label: 'Execution & Voter',
    sublabel: 'Pairwise Majority Consistency Voting',
    icon: PlayCircle,
    color: '#0284c7',
    colorLight: '#f0f9ff',
    colorBorder: '#bae6fd',
    badge: 'Executor',
    status: 'operational',
    telemetry: [
      { label: 'Candidates', value: '3', unit: '/query', icon: PlayCircle },
      { label: 'Consistency', value: '91.5', unit: '%', icon: CheckCircle2 },
      { label: 'Exec latency', value: '310', unit: 'ms', icon: Clock },
      { label: 'DB connections', value: '3', unit: 'active', icon: Database },
    ],
    description: '• 3 candidate SQL statements executed against real DB\n• Pairwise consistency voting selects majority result\n• Reduces single-point LLM errors',
    dataFlow: ['SQL Compiler', 'BigQuery / SQLite / Snowflake', 'Answer Visualizer'],
  },
  {
    id: 'answer-viz',
    label: 'Answer Visualizer',
    sublabel: 'SQL · Table · Chart Output',
    icon: BarChart3,
    color: '#6d28d9',
    colorLight: '#faf5ff',
    colorBorder: '#e9d5ff',
    badge: 'Output',
    status: 'operational',
    telemetry: [
      { label: 'Render latency', value: '18', unit: 'ms', icon: Clock },
      { label: 'Chart types', value: '4', unit: 'types', icon: BarChart3 },
      { label: 'Avg result rows', value: '6.2', unit: 'rows', icon: Database },
      { label: 'Satisfaction', value: '4.6', unit: '/ 5.0', icon: CheckCircle2 },
    ],
    description: '• Three parallel output views: SQL · Table · Chart\n• Syntax-highlighted executable SQL\n• Paginated data table + auto-generated chart',
    dataFlow: ['Execution Voter', 'Answer Renderer', 'User Browser'],
  },
];

/* ─── Tier labels ───────────────────────────────────────────────── */
const TIER_MAP = {
  'nl-input':            { tier: 'Input',      tierColor: '#475569', tierBg: '#f8fafc' },
  'semantic-retrieval':  { tier: 'Retrieval',  tierColor: '#4f46e5', tierBg: '#eef2ff' },
  'graph-reasoner':      { tier: 'Retrieval',  tierColor: '#4f46e5', tierBg: '#eef2ff' },
  'value-grounding':     { tier: 'Retrieval',  tierColor: '#d97706', tierBg: '#fffbeb' },
  'agentic-explorer':    { tier: 'Generation', tierColor: '#7c3aed', tierBg: '#f5f3ff' },
  'sql-compiler':        { tier: 'Generation', tierColor: '#059669', tierBg: '#ecfdf5' },
  'execution-voter':     { tier: 'Execution',  tierColor: '#0284c7', tierBg: '#f0f9ff' },
  'answer-viz':          { tier: 'Output',     tierColor: '#6d28d9', tierBg: '#faf5ff' },
};

/* ─── Slide-over Drawer component ───────────────────────────────────── */
function NodeDrawer({ node, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const Icon = node.icon;

  // Close on ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="backdrop-enter fixed inset-0 bg-slate-900/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="drawer-enter fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl"
        style={{ width: 'min(520px, 92vw)' }}
        role="dialog"
        aria-label={`${node.label} details`}
      >
        {/* Drawer header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 flex-shrink-0"
          style={{ background: node.colorLight }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0"
            style={{ background: node.color + '20', borderColor: node.colorBorder }}>
            <Icon className="w-5 h-5" style={{ color: node.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 leading-tight">{node.label}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: node.color + '20', color: node.color }}>{node.badge}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{node.sublabel}</p>
          </div>
          <button onClick={onClose} aria-label="Close drawer"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Status */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200 text-xs font-semibold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 telemetry-pulse" />
            Operational
          </div>

          {/* Live telemetry */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Live Telemetry
            </p>
            <div className="grid grid-cols-2 gap-3">
              {node.telemetry.map((m, i) => {
                const TIcon = m.icon;
                return (
                  <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm telemetry-count" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TIcon className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{m.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-slate-900 tabular-nums">{m.value}</span>
                      <span className="text-xs text-slate-400">{m.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Data flow */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Data Flow Pathway</p>
            <div className="flex items-center gap-2 flex-wrap">
              {node.dataFlow.map((step, i) => (
                <React.Fragment key={i}>
                  <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border font-mono"
                    style={step === node.label || (i === 1 && node.dataFlow.length === 3)
                      ? { background: node.color, color: '#fff', borderColor: node.color }
                      : { background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }}>
                    {step}
                  </span>
                  {i < node.dataFlow.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">How It Works</p>
            <ul className="space-y-1.5">
              {node.description.split('\n').map((line, i) => (
                <li key={i} className="text-sm text-slate-600 leading-relaxed">{line}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Drawer footer — node navigation */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button onClick={onPrev} disabled={!hasPrev}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-30 disabled:pointer-events-none">
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <span className="text-xs text-slate-400">{ARCH_NODES.findIndex(n => n.id === node.id) + 1} / {ARCH_NODES.length}</span>
          <button onClick={onNext} disabled={!hasNext}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-30 disabled:pointer-events-none">
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Animated arrow between nodes ──────────────────────────────── */
function FlowArrow({ color = '#c7d2fe', isActive = false, horizontal = false }) {
  if (horizontal) {
    return (
      <div className="flex items-center justify-center" style={{ minWidth: 40 }}>
        <div
          className="relative flex items-center"
          style={{ width: 40, height: 24 }}
        >
          <div
            className="absolute inset-y-0 my-auto"
            style={{
              left: 0, right: 12, height: 2,
              background: isActive
                ? `linear-gradient(90deg, ${color}, ${color}cc)`
                : 'linear-gradient(90deg, #e2e8f0, #cbd5e1)',
              borderRadius: 2,
              transition: 'background 0.3s ease',
            }}
          />
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2"
            style={{
              width: 0, height: 0,
              borderLeft: `8px solid ${isActive ? color : '#cbd5e1'}`,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              transition: 'border-color 0.3s ease',
            }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center" style={{ height: 32 }}>
      <div className="relative flex flex-col items-center" style={{ width: 24, height: 32 }}>
        <div
          style={{
            width: 2, flex: 1,
            background: isActive
              ? `linear-gradient(to bottom, ${color}, ${color}cc)`
              : 'linear-gradient(to bottom, #e2e8f0, #cbd5e1)',
            borderRadius: 2,
            transition: 'background 0.3s ease',
          }}
        />
        <div
          style={{
            width: 0, height: 0,
            borderTop: `8px solid ${isActive ? color : '#cbd5e1'}`,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            transition: 'border-color 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

/* ─── Single architecture node card ─────────────────────────────── */
function ArchNode({ node, idx, isOpen, hoveredId, onOpen, onHover, onLeave }) {
  const Icon = node.icon;
  const tier = TIER_MAP[node.id];
  const isHighlighted = isOpen || hoveredId === node.id;

  return (
    <button
      id={`arch-node-${node.id}`}
      onClick={() => onOpen(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={onLeave}
      className="arch-node-card node-active w-full flex items-center gap-3.5 px-4 py-4 rounded-2xl border text-left group"
      style={isHighlighted ? {
        background: node.colorLight,
        borderColor: node.colorBorder,
        boxShadow: `0 0 0 2px ${node.color}40, 0 8px 32px -4px ${node.color}30`,
        transform: 'translateY(-2px)',
        '--node-accent': node.color,
      } : {
        background: '#ffffff',
        borderColor: '#e2e8f0',
        boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
        '--node-accent': node.color,
      }}
      aria-haspopup="dialog"
      aria-pressed={isOpen}
    >
      {/* Step circle */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border transition-all duration-200"
        style={isHighlighted
          ? { background: node.color, color: '#fff', borderColor: node.color }
          : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }}>
        {idx + 1}
      </div>

      {/* Icon */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all duration-200"
        style={isHighlighted
          ? { background: node.color + '22', borderColor: node.colorBorder }
          : { background: '#f8fafc', borderColor: '#e2e8f0' }}>
        <Icon className="w-4 h-4 transition-colors duration-200" style={{ color: isHighlighted ? node.color : '#94a3b8' }} />
      </div>

      {/* Labels */}
      <div className="flex-1 min-w-0 text-left">
        <p className={`text-sm font-bold truncate transition-colors duration-200 ${isHighlighted ? 'text-slate-900' : 'text-slate-700'}`}>{node.label}</p>
        <p className="text-[11px] text-slate-400 truncate">{node.sublabel}</p>
      </div>

      {/* Tier badge + status dot */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="hidden sm:inline tag-pill"
          style={isHighlighted
            ? { background: node.color + '22', color: node.color, border: `1px solid ${node.colorBorder}` }
            : { background: tier.tierBg, color: tier.tierColor, border: `1px solid ${tier.tierColor}20` }}>
          {tier.tier}
        </span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 telemetry-pulse flex-shrink-0" />
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main ArchitectureSection
   ═══════════════════════════════════════════════════════════════════ */
export default function ArchitectureSection() {
  const [openNodeId, setOpenNodeId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const sectionRef = React.useRef(null);

  const openNode = ARCH_NODES.find(n => n.id === openNodeId);
  const openIdx  = ARCH_NODES.findIndex(n => n.id === openNodeId);

  const handleClose = useCallback(() => setOpenNodeId(null), []);
  const handlePrev  = useCallback(() => { if (openIdx > 0) setOpenNodeId(ARCH_NODES[openIdx - 1].id); }, [openIdx]);
  const handleNext  = useCallback(() => { if (openIdx < ARCH_NODES.length - 1) setOpenNodeId(ARCH_NODES[openIdx + 1].id); }, [openIdx]);
  const handleHover = useCallback((id) => setHoveredId(id), []);
  const handleLeave = useCallback(() => setHoveredId(null), []);

  /* Scroll-reveal */
  React.useEffect(() => {
    if (!sectionRef.current) return;
    const els = sectionRef.current.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.08 }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* Split nodes into two columns of 4 */
  const col1 = ARCH_NODES.slice(0, 4); // nodes 1-4
  const col2 = ARCH_NODES.slice(4, 8); // nodes 5-8

  /* Cross-column arrow: is active when node 4 or 5 is highlighted */
  const crossActive = hoveredId === 'value-grounding' || hoveredId === 'agentic-explorer'
    || openNodeId === 'value-grounding' || openNodeId === 'agentic-explorer';

  return (
    <section id="architecture" ref={sectionRef} className="py-16 lg:py-24 bg-white border-t border-slate-200 relative overflow-hidden">
      {/* Background dot grid */}
      <div className="section-dot-bg absolute inset-0 pointer-events-none opacity-25" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-b from-indigo-50/60 via-blue-50/20 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-12 reveal">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600" />
            </span>
            Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            How SlayQL Works
          </h2>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl mx-auto">
            Click any system node to explore real-time telemetry, data flow pathways, and operational details.
          </p>
        </div>

        {/* Tier legend */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mb-10 reveal reveal-delay-1">
          {[['Input','#475569'],['Retrieval','#4f46e5'],['Generation','#7c3aed'],['Execution','#0284c7'],['Output','#6d28d9']].map(([t, c]) => (
            <span key={t} className="tag-pill" style={{ background: c + '18', color: c, border: `1px solid ${c}30` }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
              {t}
            </span>
          ))}
        </div>

        {/* ── Two-column flow diagram ── */}
        <div className="reveal reveal-delay-2 flex flex-col lg:flex-row items-start justify-center gap-6 lg:gap-0">

          {/* Column 1: nodes 1–4 (top to bottom) */}
          <div className="flex flex-col items-stretch w-full lg:w-80 xl:w-96">
            {col1.map((node, i) => (
              <div key={node.id}>
                <ArchNode
                  node={node}
                  idx={ARCH_NODES.indexOf(node)}
                  isOpen={node.id === openNodeId}
                  hoveredId={hoveredId}
                  onOpen={setOpenNodeId}
                  onHover={handleHover}
                  onLeave={handleLeave}
                />
                {/* Down arrow between nodes in col1 */}
                {i < col1.length - 1 && (
                  <FlowArrow
                    color={node.color}
                    isActive={hoveredId === node.id || hoveredId === col1[i + 1].id
                      || openNodeId === node.id || openNodeId === col1[i + 1].id}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Cross-column connector: stepped orthogonal arrow from col1 Node 4 (bottom-left) UP to col2 Node 5 (top-right) */}
          <div className="hidden lg:flex items-center justify-center self-stretch px-2 relative" style={{ width: 70 }}>
            <svg className="w-full h-[368px] overflow-visible pointer-events-none">
              <defs>
                <marker
                  id="arrowhead-4to5"
                  markerWidth="10"
                  markerHeight="10"
                  refX="8"
                  refY="5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 8 5, 0 10"
                    fill={crossActive ? '#7c3aed' : '#cbd5e1'}
                    className="transition-colors duration-300"
                  />
                </marker>
              </defs>

              {/* Glowing back line when active */}
              {crossActive && (
                <path
                  d="M 0 334 H 22 Q 28 334 28 328 V 40 Q 28 34 34 34 H 59"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="6"
                  strokeOpacity="0.2"
                />
              )}

              {/* Main solid orthogonal arrow line */}
              <path
                d="M 0 334 H 22 Q 28 334 28 328 V 40 Q 28 34 34 34 H 59"
                fill="none"
                stroke={crossActive ? '#7c3aed' : '#cbd5e1'}
                strokeWidth="2"
                markerEnd="url(#arrowhead-4to5)"
                className="transition-colors duration-300"
              />
            </svg>
          </div>

          {/* Column 2: nodes 5–8 (top to bottom) */}
          <div className="flex flex-col items-stretch w-full lg:w-80 xl:w-96">
            {/* On mobile, show a down-arrow bridge between col1 bottom and col2 top */}
            <div className="lg:hidden">
              <FlowArrow color="#d97706" isActive={crossActive} />
            </div>
            {col2.map((node, i) => (
              <div key={node.id}>
                <ArchNode
                  node={node}
                  idx={ARCH_NODES.indexOf(node)}
                  isOpen={node.id === openNodeId}
                  hoveredId={hoveredId}
                  onOpen={setOpenNodeId}
                  onHover={handleHover}
                  onLeave={handleLeave}
                />
                {/* Down arrow between nodes in col2 */}
                {i < col2.length - 1 && (
                  <FlowArrow
                    color={node.color}
                    isActive={hoveredId === node.id || hoveredId === col2[i + 1].id
                      || openNodeId === node.id || openNodeId === col2[i + 1].id}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex justify-center mt-8 reveal">
          <div className="glass-card flex items-center gap-2.5 text-xs text-slate-500 px-5 py-2.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 telemetry-pulse" />
            <span className="font-semibold text-slate-700">All 8 nodes operational</span>
            <span className="text-slate-300">·</span>
            <span>Hover or click any node to inspect live telemetry</span>
          </div>
        </div>

      </div>

      {/* Slide-over drawer */}
      {openNode && (
        <NodeDrawer
          key={openNode.id}
          node={openNode}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
          hasPrev={openIdx > 0}
          hasNext={openIdx < ARCH_NODES.length - 1}
        />
      )}
    </section>
  );
}
