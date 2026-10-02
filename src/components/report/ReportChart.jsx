import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { axisTick, categoryLabel, formatValue, periodLabel, sequentialColor, themeFor, toNumber } from './chartTheme';

const MAX_SERIES = 5;

// One tooltip for every chart: the value leads, the label follows (dataviz interaction rules).
function ChartTooltip({ active, payload, label, format, theme, partial, bucket, labelOf }) {
  if (!active || !payload?.length) return null;
  const shown = labelOf ? labelOf(label, payload[0]?.payload) : periodLabel(label, bucket);
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
      {shown && <p style={{ color: theme.textSecondary }}>{shown}</p>}
      {payload.filter((entry) => entry.dataKey !== 'base').map((entry) => (
        <p key={`${entry.dataKey}-${entry.name}`} className="mt-1 flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: entry.color || entry.payload?.fill }} />
          <span className="font-semibold tabular-nums">{formatValue(entry.value, entry.payload?.format || format, { compact: false })}</span>
          {payload.length > 1 && <span style={{ color: theme.textSecondary }}>{entry.name}</span>}
        </p>
      ))}
      {partial && String(label) === partial && <p className="mt-1" style={{ color: theme.muted }}>This period may be incomplete.</p>}
    </div>
  );
}

const axisProps = (theme) => ({ tick: { fill: theme.muted, fontSize: 11 }, tickLine: false, axisLine: { stroke: theme.axis } });

function Empty({ theme, children }) {
  return <p className="py-10 text-center text-sm" style={{ color: theme.muted }}>{children}</p>;
}

// --- Long-format helpers ---------------------------------------------------------------

function pivot(rows, columns, x, series, y) {
  const xi = columns.indexOf(x);
  const si = columns.indexOf(series);
  const yi = columns.indexOf(y);
  const totals = new Map();
  rows.forEach((r) => totals.set(String(r[si]), (totals.get(String(r[si])) || 0) + (toNumber(r[yi]) || 0)));
  // The largest parts keep their own colour; the tail folds into "Other" (never a generated hue).
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const kept = ranked.slice(0, ranked.length > MAX_SERIES ? MAX_SERIES - 1 : MAX_SERIES);
  const names = ranked.length > kept.length ? [...kept, 'Other'] : kept;
  const byX = new Map();
  rows.forEach((r) => {
    const key = String(r[xi]);
    const name = kept.includes(String(r[si])) ? String(r[si]) : 'Other';
    const entry = byX.get(key) || { x: key };
    entry[name] = (entry[name] || 0) + (toNumber(r[yi]) || 0);
    byX.set(key, entry);
  });
  return { data: [...byX.values()].sort((a, b) => String(a.x).localeCompare(String(b.x), undefined, { numeric: true })), series: names };
}

// --- Trends ----------------------------------------------------------------------------------

function TrendChart({ panel, data, theme, format, bucket }) {
  const accent = theme.series[0];
  const last = data[data.length - 1];
  const Chart = panel.chart === 'area' ? AreaChart : LineChart;
  const Series = panel.chart === 'area' ? Area : Line;
  const endDot = ({ cx, cy, index }) => {
    if (index !== data.length - 1 || cx == null || cy == null) return null;
    return (
      <g key="end">
        <circle cx={cx} cy={cy} r={6} fill={theme.surface} />
        <circle cx={cx} cy={cy} r={4} fill={accent} />
        <text x={cx - 8} y={cy - 12} textAnchor="end" fontSize={11} fontWeight={600} fill={theme.text}>{formatValue(last?.y, format)}</text>
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 24, right: 16, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id={`fill-${panel.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis dataKey="x" {...axisProps(theme)} tickFormatter={(v) => periodLabel(v, bucket)} minTickGap={24} />
        <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
        <Tooltip content={<ChartTooltip format={format} theme={theme} partial={panel.partial} bucket={bucket} />} cursor={{ stroke: theme.axis, strokeWidth: 1 }} />
        <Series type="monotone" dataKey="y" name={panel.y} stroke={accent} strokeWidth={2} strokeLinecap="round"
          fill={`url(#fill-${panel.id})`} fillOpacity={1} dot={endDot}
          activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2, fill: accent }} isAnimationActive={false} />
      </Chart>
    </ResponsiveContainer>
  );
}

function MultiLineChart({ panel, rows, columns, theme, format, bucket }) {
  const { data, series } = useMemo(() => pivot(rows, columns, panel.x, panel.series, panel.y), [rows, columns, panel]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis dataKey="x" {...axisProps(theme)} tickFormatter={(v) => periodLabel(v, bucket)} minTickGap={24} />
        <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
        <Tooltip content={<ChartTooltip format={format} theme={theme} bucket={bucket} />} cursor={{ stroke: theme.axis, strokeWidth: 1 }} />
        <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, color: theme.textSecondary }} />
        {series.map((name, i) => (
          <Line key={name} type="monotone" dataKey={name} stroke={name === 'Other' ? theme.deemphasis : theme.series[i % theme.series.length]}
            strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// How each period rose or fell from the one before: floating bars on an invisible base.
function WaterfallChart({ data, theme, format, bucket }) {
  const steps = useMemo(() => data.map((point, i) => {
    if (i === 0) return { x: point.x, base: 0, size: point.y, delta: point.y, kind: 'start', value: point.y };
    const before = data[i - 1].y;
    const delta = point.y - before;
    return { x: point.x, base: Math.min(before, point.y), size: Math.abs(delta), delta, kind: delta >= 0 ? 'up' : 'down', value: point.y };
  }), [data]);
  const fill = (kind) => (kind === 'start' ? theme.series[0] : kind === 'up' ? theme.good : theme.bad);
  const tooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const step = payload[0].payload;
    return (
      <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
        <p style={{ color: theme.textSecondary }}>{periodLabel(label, bucket)}</p>
        <p className="mt-1 font-semibold tabular-nums">{formatValue(step.value, format, { compact: false })}</p>
        {step.kind !== 'start' && (
          <p style={{ color: step.delta >= 0 ? theme.good : theme.bad }}>{step.delta >= 0 ? '+' : '−'}{formatValue(Math.abs(step.delta), format)} from the period before</p>
        )}
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={steps} margin={{ top: 12, right: 8, bottom: 4, left: 4 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis dataKey="x" {...axisProps(theme)} tickFormatter={(v) => periodLabel(v, bucket)} minTickGap={16} />
        <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
        <Tooltip content={tooltip} cursor={{ fill: theme.grid, fillOpacity: 0.5 }} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="size" stackId="w" radius={[3, 3, 3, 3]} maxBarSize={28} isAnimationActive={false}>
          {steps.map((s) => <Cell key={s.x} fill={fill(s.kind)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// --- Categories ------------------------------------------------------------------------------

function CategoryChart({ panel, data, theme, format, horizontal, selected, onSelect }) {
  const accent = theme.series[0];
  const active = selected?.length ? new Set(selected) : null;
  const highlight = panel.highlight;
  const fills = data.map((d) => {
    if (active) return active.has(String(d.raw)) ? accent : theme.deemphasis;
    return !highlight || String(d.x) === highlight ? accent : theme.deemphasis;
  });
  const labelWidth = Math.min(170, Math.max(60, ...data.map((d) => String(d.x).length * 6.2)));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} barCategoryGap="28%"
        margin={{ top: horizontal ? 4 : 20, right: horizontal ? 52 : 8, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke={theme.grid} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps(theme)} tickFormatter={(v) => axisTick(v, format)} />
            <YAxis type="category" dataKey="x" {...axisProps(theme)} width={labelWidth} interval={0}
              tickFormatter={(v) => (String(v).length > 26 ? `${String(v).slice(0, 25)}…` : v)} />
          </>
        ) : (
          <>
            <XAxis dataKey="x" {...axisProps(theme)} interval={0} />
            <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
          </>
        )}
        <Tooltip content={<ChartTooltip format={format} theme={theme} labelOf={(l) => l} />} cursor={{ fill: theme.grid, fillOpacity: 0.5 }} />
        <Bar dataKey="y" name={panel.y} maxBarSize={24} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false}
          onClick={onSelect ? (d) => onSelect(String(d.raw)) : undefined} cursor={onSelect ? 'pointer' : undefined}>
          {data.map((d, i) => <Cell key={String(d.x)} fill={fills[i]} />)}
          {data.length <= 12 && (
            <LabelList dataKey="y" position={horizontal ? 'right' : 'top'} formatter={(v) => formatValue(v, format)}
              style={{ fill: theme.textSecondary, fontSize: 11, fontWeight: 500 }} />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StackedChart({ panel, rows, columns, theme, format, bucket }) {
  const { data, series } = useMemo(() => pivot(rows, columns, panel.x, panel.series, panel.y), [rows, columns, panel]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis dataKey="x" {...axisProps(theme)} tickFormatter={(v) => periodLabel(v, bucket)} minTickGap={12} />
        <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
        <Tooltip content={<ChartTooltip format={format} theme={theme} bucket={bucket} />} cursor={{ fill: theme.grid, fillOpacity: 0.5 }} />
        <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 11, color: theme.textSecondary }} />
        {series.map((name, i) => (
          <Bar key={name} dataKey={name} stackId="stack" fill={name === 'Other' ? theme.deemphasis : theme.series[i % theme.series.length]}
            stroke={theme.surface} strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Part of a whole, at most six parts, with the total in the hole and a value list beside it.
function DonutChart({ data, theme, format, selected, onSelect }) {
  const parts = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.y - a.y);
    if (sorted.length <= 6) return sorted;
    const rest = sorted.slice(5).reduce((sum, d) => sum + d.y, 0);
    return [...sorted.slice(0, 5), { x: 'Other', raw: null, y: rest }];
  }, [data]);
  const total = parts.reduce((sum, d) => sum + Math.max(0, d.y), 0) || 1;
  const active = selected?.length ? new Set(selected) : null;
  const color = (d, i) => (d.x === 'Other' ? theme.deemphasis : theme.series[i % theme.series.length]);
  return (
    <div className="flex h-full items-center gap-3">
      <div className="relative h-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip format={format} theme={theme} labelOf={(_, p) => p?.x} />} />
            <Pie data={parts} dataKey="y" nameKey="x" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke={theme.surface} strokeWidth={2}
              isAnimationActive={false} onClick={onSelect ? (d) => d.raw != null && onSelect(String(d.raw)) : undefined}>
              {parts.map((d, i) => (
                <Cell key={d.x} fill={color(d, i)} fillOpacity={active && !active.has(String(d.raw)) ? 0.25 : 1} cursor={onSelect && d.raw != null ? 'pointer' : undefined} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold" style={{ color: theme.text }}>{formatValue(total, format)}</span>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: theme.muted }}>Total</span>
        </div>
      </div>
      <ul className="w-[44%] space-y-1.5 text-xs">
        {parts.map((d, i) => (
          <li key={d.x} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(d, i) }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: theme.textSecondary }} title={d.x}>{d.x}</span>
            <span className="font-semibold tabular-nums" style={{ color: theme.text }}>{Math.round((Math.max(0, d.y) / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TreemapChart({ data, theme, format, selected, onSelect }) {
  const nodes = useMemo(() => [...data].filter((d) => d.y > 0).sort((a, b) => b.y - a.y).slice(0, 20)
    .map((d, i) => ({ ...d, name: d.x, size: d.y, fill: i < theme.series.length ? theme.series[i] : theme.deemphasis })), [data, theme]);
  const active = selected?.length ? new Set(selected) : null;
  const total = nodes.reduce((sum, d) => sum + d.size, 0) || 1;
  const Content = ({ x, y, width, height, name, size, fill, raw }) => {
    if (width <= 0 || height <= 0) return null;
    const fits = width > 54 && height > 30;
    return (
      <g onClick={onSelect && raw != null ? () => onSelect(String(raw)) : undefined} style={{ cursor: onSelect ? 'pointer' : undefined }}>
        <rect x={x} y={y} width={width} height={height} rx={4} fill={fill} fillOpacity={active && !active.has(String(raw)) ? 0.25 : 0.92} stroke={theme.surface} strokeWidth={2} />
        {fits && (
          <>
            <text x={x + 8} y={y + 17} fontSize={11} fontWeight={600} fill="#fff">{String(name).slice(0, Math.floor(width / 7))}</text>
            <text x={x + 8} y={y + 31} fontSize={10} fill="rgba(255,255,255,0.85)">{formatValue(size, format)} · {Math.round((size / total) * 100)}%</text>
          </>
        )}
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap data={nodes} dataKey="size" nameKey="name" isAnimationActive={false} content={<Content />}>
        <Tooltip content={<ChartTooltip format={format} theme={theme} labelOf={(_, p) => p?.name} />} />
      </Treemap>
    </ResponsiveContainer>
  );
}

// Stages in process order, each bar centred and sized by its count, with the share kept from the first stage.
function FunnelChart({ data, theme, format }) {
  const peak = Math.max(...data.map((d) => d.y), 1);
  const total = data.reduce((sum, d) => sum + Math.max(0, d.y), 0) || 1;
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      {data.slice(0, 8).map((d, i) => (
        <div key={d.x} className="group grid grid-cols-[minmax(0,32%)_1fr_auto] items-center gap-3 text-xs" title={`${d.x}: ${formatValue(d.y, format, { compact: false })}`}>
          <span className="truncate text-right" style={{ color: theme.textSecondary }}>{d.x}</span>
          <div className="flex justify-center">
            <div className="h-7 rounded-md transition group-hover:brightness-110"
              style={{ width: `${Math.max(4, (d.y / peak) * 100)}%`, background: theme.series[0], opacity: 1 - i * 0.09 }} />
          </div>
          <span className="w-24 text-right">
            <b className="font-semibold tabular-nums" style={{ color: theme.text }}>{formatValue(d.y, format)}</b>
            <span className="ml-1 tabular-nums" style={{ color: theme.muted }}>{Math.round((d.y / total) * 100)}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// A grid of cells, darker for more (one hue). Rows are the series column, columns the x column.
function HeatmapChart({ panel, rows, columns, theme, format, isDark, bucket }) {
  const [hover, setHover] = useState(null);
  const { xs, ys, cells, peak } = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const si = columns.indexOf(panel.series);
    const yi = columns.indexOf(panel.y);
    const map = new Map();
    rows.forEach((r) => {
      const key = `${r[xi]}\u0000${r[si]}`;
      map.set(key, (map.get(key) || 0) + (toNumber(r[yi]) || 0));
    });
    const sortKey = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
    const xValues = [...new Set(rows.map((r) => String(r[xi])))].sort(sortKey).slice(0, 14);
    const yValues = [...new Set(rows.map((r) => String(r[si])))].sort(sortKey).slice(0, 12);
    return { xs: xValues, ys: yValues, cells: map, peak: Math.max(...map.values(), 1) };
  }, [panel, rows, columns]);
  const label = (v) => categoryLabel(periodLabel(v, bucket), panel.x);
  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: `minmax(64px,auto) repeat(${xs.length}, minmax(0,1fr))` }}>
        <span />
        {xs.map((x) => <span key={x} className="truncate text-center text-[10px]" style={{ color: theme.muted }}>{label(x)}</span>)}
        {ys.map((y) => (
          <React.Fragment key={y}>
            <span className="truncate pr-2 text-right text-[11px] leading-6" style={{ color: theme.textSecondary }} title={y}>{y}</span>
            {xs.map((x) => {
              const value = cells.get(`${x}\u0000${y}`) || 0;
              const on = hover && hover.x === x && hover.y === y;
              return (
                <span key={x} className="min-h-6 rounded-[3px]"
                  style={{ background: value ? sequentialColor(isDark, value / peak) : theme.grid, outline: on ? `2px solid ${theme.text}` : 'none' }}
                  onMouseEnter={() => setHover({ x, y, value })} onMouseLeave={() => setHover(null)}
                  title={`${y} · ${label(x)}: ${formatValue(value, format, { compact: false })}`} />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: theme.muted }}>
        <span>{hover ? <><b style={{ color: theme.text }}>{formatValue(hover.value, format, { compact: false })}</b> · {hover.y} · {label(hover.x)}</> : 'Hover a cell for its value'}</span>
        <span className="flex items-center gap-1">Less
          {[0.05, 0.3, 0.55, 0.8, 1].map((s) => <span key={s} className="h-2.5 w-4 rounded-sm" style={{ background: sequentialColor(isDark, s) }} />)}
          More</span>
      </div>
    </div>
  );
}

function ScatterPlot({ panel, rows, columns, theme, format }) {
  const data = useMemo(() => {
    const li = columns.indexOf(panel.label);
    const xi = columns.indexOf(panel.x);
    const yi = columns.indexOf(panel.y);
    return rows.map((r) => ({ name: String(r[li] ?? ''), x: toNumber(r[xi]), y: toNumber(r[yi]) })).filter((p) => p.x !== null && p.y !== null);
  }, [panel, rows, columns]);
  const top = new Set([...data].sort((a, b) => b.y - a.y).slice(0, 3).map((p) => p.name));
  const tooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
        <p className="font-semibold">{p.name}</p>
        <p style={{ color: theme.textSecondary }}>{panel.x}: <b style={{ color: theme.text }}>{formatValue(p.x, 'number', { compact: false })}</b></p>
        <p style={{ color: theme.textSecondary }}>{panel.y}: <b style={{ color: theme.text }}>{formatValue(p.y, format, { compact: false })}</b></p>
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 16, right: 16, bottom: 18, left: 4 }}>
        <CartesianGrid stroke={theme.grid} />
        <XAxis type="number" dataKey="x" name={panel.x} {...axisProps(theme)} tickFormatter={(v) => axisTick(v, 'number')}
          label={{ value: panel.x, position: 'insideBottom', offset: -10, fill: theme.muted, fontSize: 11 }} />
        <YAxis type="number" dataKey="y" name={panel.y} {...axisProps(theme)} axisLine={false} width={52} tickFormatter={(v) => axisTick(v, format)} />
        <ZAxis range={[70, 70]} />
        <Tooltip content={tooltip} cursor={{ stroke: theme.axis, strokeDasharray: '0' }} />
        <Scatter data={data} fill={theme.series[0]} stroke={theme.surface} strokeWidth={2} isAnimationActive={false}>
          <LabelList dataKey="name" position="top" offset={8}
            content={({ x, y, value }) => (top.has(value) ? <text x={x} y={y - 6} textAnchor="middle" fontSize={10} fill={theme.textSecondary}>{String(value).slice(0, 18)}</text> : null)} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

const HEIGHTS = { bar_h: null, funnel: 240, donut: 240, heatmap: null };

export default function ReportChart({ panel, isDark = false, height = 260, bucket, selected, onSelect }) {
  const theme = themeFor(isDark);
  const columns = panel.columns || [];
  const rows = panel.rows || [];
  const format = panel.format || 'number';
  const data = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const yi = columns.indexOf(panel.y);
    if (xi < 0 || yi < 0) return [];
    const points = rows
      .map((r) => ({ raw: r[xi], x: r[xi] === null || r[xi] === undefined ? '(blank)' : categoryLabel(r[xi], panel.x), y: toNumber(r[yi]) }))
      .filter((p) => p.y !== null);
    if (['line', 'area', 'waterfall'].includes(panel.chart)) points.sort((a, b) => String(a.x).localeCompare(String(b.x)));
    return points;
  }, [columns, rows, panel.x, panel.y, panel.chart]);

  if (!rows.length) return <Empty theme={theme}>No rows for this period.</Empty>;
  const props = { panel, theme, format, bucket, isDark, rows, columns, data, selected, onSelect: panel.filter_id ? onSelect : undefined };
  let body;
  let chartHeight = HEIGHTS[panel.chart] === undefined ? height : HEIGHTS[panel.chart] || height;
  switch (panel.chart) {
    case 'stacked_bar':
      body = panel.series ? <StackedChart {...props} /> : <CategoryChart {...props} />;
      break;
    case 'line':
      body = panel.series ? <MultiLineChart {...props} /> : <TrendChart {...props} />;
      break;
    case 'area':
      body = <TrendChart {...props} />;
      break;
    case 'waterfall':
      body = <WaterfallChart {...props} />;
      break;
    case 'donut':
      body = <DonutChart {...props} />;
      break;
    case 'treemap':
      body = <TreemapChart {...props} />;
      break;
    case 'funnel':
      body = <FunnelChart {...props} />;
      chartHeight = Math.max(160, Math.min(320, data.length * 36 + 16));
      break;
    case 'heatmap':
      if (!panel.series) return <Empty theme={theme}>This heatmap needs a second dimension. Use the table view.</Empty>;
      body = <HeatmapChart {...props} />;
      chartHeight = Math.max(180, Math.min(380, new Set(rows.map((r) => r[columns.indexOf(panel.series)])).size * 28 + 60));
      break;
    case 'scatter':
      body = <ScatterPlot {...props} />;
      break;
    default:
      body = <CategoryChart {...props} horizontal={panel.chart === 'bar_h'} />;
      if (panel.chart === 'bar_h') chartHeight = Math.max(160, Math.min(420, data.length * 30 + 40));
  }
  if (!data.length && !['stacked_bar', 'heatmap', 'scatter', 'line'].includes(panel.chart)) {
    return <Empty theme={theme}>This result has no numeric column to chart. Use the table view.</Empty>;
  }
  return (
    <figure className="m-0" style={{ height: chartHeight }} aria-label={`${panel.title}: ${panel.chart} chart`}>
      {body}
    </figure>
  );
}
