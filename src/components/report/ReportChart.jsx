import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { axisTick, categoryLabel, formatValue, periodLabel, sequentialColor, themeFor, toNumber } from './chartTheme';
import { fitChart } from './chartFit';

const MAX_SERIES = 5;

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTH_ORDER = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function calendarIndex(value) {
  const text = String(value ?? '').trim().toLowerCase().slice(0, 3);
  const day = DAY_ORDER.indexOf(text);
  if (day >= 0) return day;
  const month = MONTH_ORDER.indexOf(text);
  return month >= 0 ? 100 + month : -1;
}

// Weekdays Monday first and months in calendar order; numbers numerically; otherwise A–Z.
function orderValues(a, b) {
  const ca = calendarIndex(a);
  const cb = calendarIndex(b);
  if (ca >= 0 && cb >= 0) return ca - cb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

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
            <span className="line-clamp-2 min-w-0 flex-1 leading-tight" style={{ color: theme.textSecondary }} title={d.x}>{d.x}</span>
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
    const sortKey = (a, b) => {
      // strftime('%w') numbers Sunday 0; show the week from Monday.
      const weekday = (v) => (/week_?day|dow/i.test(panel.x) && /^[0-6]$/.test(String(v)) ? (Number(v) + 6) % 7 : null);
      const wa = weekday(a);
      const wb = weekday(b);
      return wa !== null && wb !== null ? wa - wb : orderValues(a, b);
    };
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

// --- Flows, hierarchies, shares, targets, spread ----------------------------------------------------

// How the mix of a few groups shifts over time: stacked areas around a centre line.
function StreamChart({ panel, rows, columns, theme, format, bucket }) {
  const { data, series } = useMemo(() => pivot(rows, columns, panel.x, panel.series, panel.y), [rows, columns, panel]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} stackOffset="silhouette" margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <XAxis dataKey="x" {...axisProps(theme)} tickFormatter={(v) => periodLabel(v, bucket)} minTickGap={24} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip format={format} theme={theme} bucket={bucket} />} cursor={{ stroke: theme.axis, strokeWidth: 1 }} />
        <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 11, color: theme.textSecondary }} />
        {series.map((name, i) => (
          <Area key={name} type="monotone" dataKey={name} stackId="stream" stroke={theme.surface} strokeWidth={1}
            fill={name === 'Other' ? theme.deemphasis : theme.series[i % theme.series.length]} fillOpacity={0.92} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Two rings: parents inside, their children outside in the parent's colour.
function SunburstChart({ panel, rows, columns, theme, format }) {
  const { parents, children, total } = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const si = columns.indexOf(panel.series);
    const yi = columns.indexOf(panel.y);
    const byParent = new Map();
    rows.forEach((r) => {
      const value = Math.max(0, toNumber(r[yi]) || 0);
      const parent = String(r[xi] ?? '(blank)');
      const entry = byParent.get(parent) || { name: parent, value: 0, kids: new Map() };
      entry.value += value;
      entry.kids.set(String(r[si] ?? '(blank)'), (entry.kids.get(String(r[si] ?? '(blank)')) || 0) + value);
      byParent.set(parent, entry);
    });
    const ranked = [...byParent.values()].sort((a, b) => b.value - a.value);
    const inner = ranked.map((p, i) => ({ name: p.name, value: p.value, fill: i < theme.series.length ? theme.series[i] : theme.deemphasis }));
    const outer = ranked.flatMap((p, i) => [...p.kids.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], j) => ({
      name: `${name}`, parent: p.name, value, fill: inner[i].fill, opacity: 0.85 - (j % 3) * 0.2,
    })));
    return { parents: inner, children: outer, total: inner.reduce((sum, p) => sum + p.value, 0) || 1 };
  }, [panel, rows, columns, theme]);
  const tooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
        <p style={{ color: theme.textSecondary }}>{p.parent ? `${p.parent} › ${p.name}` : p.name}</p>
        <p className="mt-1 font-semibold tabular-nums">{formatValue(p.value, format, { compact: false })} · {Math.round((p.value / total) * 100)}%</p>
      </div>
    );
  };
  return (
    <div className="flex h-full items-center gap-3">
      <div className="h-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={tooltip} />
            <Pie data={parents} dataKey="value" innerRadius="22%" outerRadius="56%" stroke={theme.surface} strokeWidth={2} isAnimationActive={false}>
              {parents.map((p) => <Cell key={p.name} fill={p.fill} />)}
            </Pie>
            <Pie data={children} dataKey="value" innerRadius="59%" outerRadius="92%" stroke={theme.surface} strokeWidth={1.5} isAnimationActive={false}>
              {children.map((c) => <Cell key={`${c.parent}-${c.name}`} fill={c.fill} fillOpacity={c.opacity} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-[38%] space-y-1.5 text-xs">
        {parents.slice(0, 6).map((p) => (
          <li key={p.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.fill }} />
            <span className="line-clamp-2 min-w-0 flex-1 leading-tight" style={{ color: theme.textSecondary }} title={p.name}>{p.name}</span>
            <span className="font-semibold tabular-nums" style={{ color: theme.text }}>{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Flows from sources (left) to targets (right); band width is the value.
function SankeyChart({ panel, rows, columns, theme, format }) {
  const graph = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const si = columns.indexOf(panel.series);
    const yi = columns.indexOf(panel.y);
    const nodes = [];
    const index = new Map();
    const node = (side, name) => {
      const key = `${side}:${name}`;
      if (!index.has(key)) {
        index.set(key, nodes.length);
        nodes.push({ name, side });
      }
      return index.get(key);
    };
    const links = rows
      .map((r) => ({ source: node('s', String(r[xi] ?? '(blank)')), target: node('t', String(r[si] ?? '(blank)')), value: Math.max(0, toNumber(r[yi]) || 0) }))
      .filter((l) => l.value > 0);
    return { nodes, links };
  }, [panel, rows, columns]);
  const NodeShape = ({ x, y, width, height, payload }) => {
    const left = payload.side === 's';
    const color = left ? theme.series[0] : theme.series[1];
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={2} fill={color} />
        <text x={left ? x - 6 : x + width + 6} y={y + height / 2} dy="0.35em" textAnchor={left ? 'end' : 'start'} fontSize={11} fill={theme.textSecondary}>
          {String(payload.name).slice(0, 18)} <tspan fontWeight={600} fill={theme.text}>{formatValue(payload.value, format)}</tspan>
        </text>
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Sankey data={graph} nodeWidth={10} nodePadding={14} margin={{ top: 8, right: 120, bottom: 8, left: 120 }} iterations={32}
        node={<NodeShape />} link={{ stroke: theme.series[0], strokeOpacity: 0.22 }}>
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const item = payload[0].payload?.payload || payload[0].payload;
          const label = item.source && item.target ? `${item.source.name} → ${item.target.name}` : item.name;
          return (
            <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
              <p style={{ color: theme.textSecondary }}>{label}</p>
              <p className="mt-1 font-semibold tabular-nums">{formatValue(item.value, format, { compact: false })}</p>
            </div>
          );
        }} />
      </Sankey>
    </ResponsiveContainer>
  );
}

// A share as 100 squares: one square is one percent (pictogram / waffle).
function WaffleChart({ data, theme, format }) {
  const parts = useMemo(() => {
    const sorted = [...data].filter((d) => d.y > 0).sort((a, b) => b.y - a.y).slice(0, 5);
    const total = sorted.reduce((sum, d) => sum + d.y, 0) || 1;
    const exact = sorted.map((d) => (d.y / total) * 100);
    const squares = exact.map(Math.floor);
    let left = 100 - squares.reduce((a, b) => a + b, 0);
    exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { squares[i] += 1; left -= 1; } });
    return sorted.map((d, i) => ({ ...d, squares: squares[i], share: exact[i], color: theme.series[i % theme.series.length] }));
  }, [data, theme]);
  const cells = parts.flatMap((p) => Array.from({ length: p.squares }, () => p));
  return (
    <div className="flex h-full items-center gap-5">
      <div className="grid aspect-square h-full max-h-48 shrink-0 grid-cols-10 gap-[3px]" role="img" aria-label={parts.map((p) => `${p.x} ${Math.round(p.share)}%`).join(', ')}>
        {cells.map((p, i) => <span key={i} className="rounded-[3px]" style={{ background: p.color }} title={`${p.x}: ${Math.round(p.share)}%`} />)}
      </div>
      <ul className="min-w-[45%] max-w-sm flex-1 space-y-2.5">
        {parts.map((p) => (
          <li key={p.x} className="flex items-baseline gap-2 text-xs" title={p.x}>
            <span className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-sm" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: theme.textSecondary }}>{p.x}</span>
            <span className="text-base font-semibold" style={{ color: theme.text }}>{Math.round(p.share)}%</span>
            <span className="w-14 text-right tabular-nums" style={{ color: theme.muted }}>{formatValue(p.y, format)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Actual against target for each item: a bar, a target tick, and the share reached.
function BulletChart({ panel, rows, columns, theme, format }) {
  const items = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const yi = columns.indexOf(panel.y);
    const ti = columns.indexOf(panel.target);
    return rows.map((r) => ({ label: String(r[xi] ?? ''), actual: toNumber(r[yi]) || 0, target: toNumber(r[ti]) || 0 })).slice(0, 10);
  }, [panel, rows, columns]);
  const peak = Math.max(...items.map((i) => Math.max(i.actual, i.target)), 1) * 1.08;
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {items.map((item) => {
        const reached = item.target ? item.actual / item.target : null;
        return (
          <div key={item.label} className="grid grid-cols-[minmax(0,28%)_1fr_auto] items-center gap-3 text-xs">
            <span className="line-clamp-2 text-right leading-tight" style={{ color: theme.textSecondary }} title={item.label}>{item.label}</span>
            <div className="relative h-5 rounded" style={{ background: theme.grid }}>
              <div className="absolute inset-y-1 left-0 rounded-sm" style={{ width: `${(item.actual / peak) * 100}%`, background: reached !== null && reached < 1 ? theme.series[1] : theme.series[0] }} />
              {item.target > 0 && <div className="absolute -inset-y-0.5 w-0.5 rounded" style={{ left: `${(item.target / peak) * 100}%`, background: theme.text }} title={`Target ${formatValue(item.target, format)}`} />}
            </div>
            <span className="w-28 text-right">
              <b className="font-semibold tabular-nums" style={{ color: theme.text }}>{formatValue(item.actual, format)}</b>
              {reached !== null && <span className="ml-1 tabular-nums" style={{ color: theme.muted }}>{Math.round(reached * 100)}%</span>}
            </span>
          </div>
        );
      })}
      <p className="text-[11px]" style={{ color: theme.muted }}>Bar: actual · line: target · % of target reached</p>
    </div>
  );
}

function quartiles(values) {
  const v = [...values].sort((a, b) => a - b);
  const at = (q) => {
    const pos = (v.length - 1) * q;
    const base = Math.floor(pos);
    return v[base + 1] !== undefined ? v[base] + (pos - base) * (v[base + 1] - v[base]) : v[base];
  };
  const q1 = at(0.25);
  const q3 = at(0.75);
  // Whiskers reach the furthest values within 1.5 × the middle half; the rest are outliers.
  const reach = 1.5 * (q3 - q1);
  const inside = v.filter((x) => x >= q1 - reach && x <= q3 + reach);
  return { min: inside[0], q1, median: at(0.5), q3, max: inside[inside.length - 1], n: v.length, outliers: v.length - inside.length };
}

// The width a chart actually has, so SVG text stays readable instead of being scaled down.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// The spread of values per group: box from the 25th to 75th percentile, line at the median.
function BoxPlot({ panel, rows, columns, theme, format }) {
  const groups = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const yi = columns.indexOf(panel.y);
    const map = new Map();
    rows.forEach((r) => {
      const value = toNumber(r[yi]);
      if (value === null) return;
      const key = String(r[xi] ?? '(blank)');
      map.set(key, [...(map.get(key) || []), value]);
    });
    return [...map.entries()].map(([name, values]) => ({ name, ...quartiles(values) })).sort((a, b) => b.median - a.median).slice(0, 8);
  }, [panel, rows, columns]);
  const [box, measured] = useWidth();
  const W = Math.max(280, measured || 480);
  const H = 240;
  const pad = { l: 52, r: 12, t: 12, b: 36 };
  const low = Math.min(...groups.map((g) => g.min));
  const high = Math.max(...groups.map((g) => g.max));
  const y = (v) => pad.t + (1 - (v - low) / ((high - low) || 1)) * (H - pad.t - pad.b);
  const step = (W - pad.l - pad.r) / Math.max(groups.length, 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => low + t * (high - low));
  return (
    <div ref={box} className="h-full w-full">
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${panel.title}: spread by ${panel.x}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={theme.grid} />
          <text x={pad.l - 6} y={y(t)} dy="0.35em" textAnchor="end" fontSize={10} fill={theme.muted}>{axisTick(t, format)}</text>
        </g>
      ))}
      {groups.map((g, i) => {
        const cx = pad.l + step * (i + 0.5);
        const half = Math.min(28, step * 0.28);
        return (
          <g key={g.name}>
            <title>{`${g.name}: median ${formatValue(g.median, format)}, middle half ${formatValue(g.q1, format)}–${formatValue(g.q3, format)}, ${g.n} records${g.outliers ? `, ${g.outliers} beyond the whiskers` : ''}`}</title>
            <line x1={cx} x2={cx} y1={y(g.max)} y2={y(g.min)} stroke={theme.axis} strokeWidth={1.5} />
            <line x1={cx - half / 2} x2={cx + half / 2} y1={y(g.max)} y2={y(g.max)} stroke={theme.axis} strokeWidth={1.5} />
            <line x1={cx - half / 2} x2={cx + half / 2} y1={y(g.min)} y2={y(g.min)} stroke={theme.axis} strokeWidth={1.5} />
            <rect x={cx - half} y={y(g.q3)} width={half * 2} height={Math.max(2, y(g.q1) - y(g.q3))} rx={3} fill={theme.series[0]} fillOpacity={0.22} stroke={theme.series[0]} strokeWidth={1.5} />
            <line x1={cx - half} x2={cx + half} y1={y(g.median)} y2={y(g.median)} stroke={theme.series[0]} strokeWidth={2.5} />
            <text x={cx} y={H - pad.b + 16} textAnchor="middle" fontSize={11} fill={theme.textSecondary}>{g.name.slice(0, 14)}</text>
            <text x={cx} y={H - pad.b + 29} textAnchor="middle" fontSize={10} fill={theme.muted}>{formatValue(g.median, format)}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

// When a selection leaves one category, the figure itself is the clearest chart.
function StatValue({ data, theme, format }) {
  const total = data.reduce((sum, d) => sum + d.y, 0);
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="text-4xl font-semibold tracking-tight" style={{ color: theme.text }}>{formatValue(total, format)}</span>
      {data.length === 1 && <span className="mt-1 text-sm" style={{ color: theme.textSecondary }}>{data[0].x}</span>}
    </div>
  );
}

function aggregate(points, mode) {
  const groups = new Map();
  points.forEach((p) => {
    const entry = groups.get(p.x) || { raw: p.raw, x: p.x, sum: 0, n: 0 };
    entry.sum += p.y;
    entry.n += 1;
    groups.set(p.x, entry);
  });
  return [...groups.values()].map((g) => ({ raw: g.raw, x: g.x, y: mode === 'mean' ? g.sum / g.n : g.sum })).sort((a, b) => b.y - a.y);
}

const HEIGHTS = { funnel: 240, donut: 240, waffle: 230, sunburst: 260, bullet: null, heatmap: null, bar_h: null, stat: 200 };

export default function ReportChart({ panel: original, isDark = false, height = 260, bucket, selected, onSelect }) {
  const theme = themeFor(isDark);
  const fit = useMemo(() => fitChart(original), [original]);
  const panel = fit.chart === original.chart ? original : { ...original, chart: fit.chart };
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
    // A long-format result drawn as one series (after a fallback) sums its groups; a spread becomes an average.
    if (['bar', 'bar_h', 'donut', 'waffle', 'treemap', 'stat'].includes(panel.chart) && new Set(points.map((p) => p.x)).size < points.length) {
      return aggregate(points, original.chart === 'boxplot' ? 'mean' : 'sum');
    }
    return points;
  }, [columns, rows, panel.x, panel.y, panel.chart, original.chart]);

  if (!rows.length) return <Empty theme={theme}>No records for this period and filters.</Empty>;
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
    case 'streamgraph':
      body = <StreamChart {...props} />;
      break;
    case 'waterfall':
      body = <WaterfallChart {...props} />;
      break;
    case 'donut':
      body = <DonutChart {...props} />;
      break;
    case 'waffle':
      body = <WaffleChart {...props} />;
      break;
    case 'treemap':
      body = <TreemapChart {...props} />;
      break;
    case 'sunburst':
      body = <SunburstChart {...props} />;
      break;
    case 'sankey':
      body = <SankeyChart {...props} />;
      chartHeight = Math.max(220, Math.min(380, new Set(rows.map((r) => r[columns.indexOf(panel.x)])).size * 46 + 40));
      break;
    case 'funnel':
      body = <FunnelChart {...props} />;
      chartHeight = Math.max(160, Math.min(320, data.length * 36 + 16));
      break;
    case 'heatmap':
      body = <HeatmapChart {...props} />;
      chartHeight = Math.max(180, Math.min(380, new Set(rows.map((r) => r[columns.indexOf(panel.series)])).size * 28 + 60));
      break;
    case 'scatter':
      body = <ScatterPlot {...props} />;
      break;
    case 'boxplot':
      body = <BoxPlot {...props} />;
      break;
    case 'bullet':
      body = <BulletChart {...props} />;
      chartHeight = Math.max(140, Math.min(380, rows.length * 34 + 40));
      break;
    case 'stat':
      body = <StatValue {...props} />;
      break;
    case 'table':
      return null;
    default: {
      // Columns with long or many labels read better as horizontal bars.
      const labelChars = data.reduce((sum, d) => sum + String(d.x).length, 0);
      const horizontal = panel.chart === 'bar_h' || data.length > 8 || labelChars > 42;
      body = <CategoryChart {...props} horizontal={horizontal} />;
      if (horizontal) chartHeight = Math.max(160, Math.min(420, data.length * 30 + 40));
    }
  }
  if (!data.length && !['stacked_bar', 'heatmap', 'scatter', 'line', 'streamgraph', 'sunburst', 'sankey', 'boxplot', 'bullet'].includes(panel.chart)) {
    return <Empty theme={theme}>This result has no numeric column to chart.</Empty>;
  }
  return (
    <figure className="m-0" aria-label={`${original.title}: ${panel.chart} chart`}>
      <div style={{ height: chartHeight }}>{body}</div>
      {fit.note && <figcaption className="mt-1.5 text-[11px]" style={{ color: theme.muted }}>{fit.note}</figcaption>}
    </figure>
  );
}
