import React, { useMemo } from 'react';
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisTick, formatValue, periodLabel, themeFor, toNumber } from './chartTheme';

const MAX_STACK_SERIES = 5;

function ChartTooltip({ active, payload, label, format, theme, partial }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}
    >
      <p style={{ color: theme.textSecondary }}>{periodLabel(label)}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-1 flex items-center gap-2">
          {/* Line key, not a box: identity comes from the mark colour beside the text. */}
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: entry.color || entry.payload?.fill }} />
          <span className="font-semibold tabular-nums">{formatValue(entry.value, format, { compact: false })}</span>
          {payload.length > 1 && <span style={{ color: theme.textSecondary }}>{entry.name}</span>}
        </p>
      ))}
      {partial && String(label) === partial && (
        <p className="mt-1" style={{ color: theme.muted }}>This period may be incomplete.</p>
      )}
    </div>
  );
}

const axisProps = (theme) => ({
  tick: { fill: theme.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: theme.axis },
});

function TrendChart({ panel, data, theme, format }) {
  const accent = theme.series[0];
  const last = data[data.length - 1];
  const Chart = panel.chart === 'area' ? AreaChart : LineChart;
  const Series = panel.chart === 'area' ? Area : Line;
  const endDot = (props) => {
    const { cx, cy, index } = props;
    if (index !== data.length - 1 || cx == null || cy == null) return null;
    const partial = panel.partial && String(last?.x) === panel.partial;
    return (
      <g key="end">
        <circle cx={cx} cy={cy} r={6} fill={theme.surface} />
        <circle cx={cx} cy={cy} r={4} fill={partial ? theme.surface : accent} stroke={accent} strokeWidth={partial ? 2 : 0} />
        <text x={cx - 8} y={cy - 12} textAnchor="end" fontSize={11} fontWeight={600} fill={theme.text}>
          {formatValue(last?.y, format)}{partial ? ' (partial?)' : ''}
        </text>
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 24, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis dataKey="x" {...axisProps(theme)} tickFormatter={periodLabel} minTickGap={24} />
        <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
        <Tooltip
          content={<ChartTooltip format={format} theme={theme} partial={panel.partial} />}
          cursor={{ stroke: theme.axis, strokeWidth: 1 }}
        />
        <Series
          type="monotone"
          dataKey="y"
          name={panel.y}
          stroke={accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={accent}
          fillOpacity={0.1}
          dot={endDot}
          activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2, fill: accent }}
          isAnimationActive={false}
        />
      </Chart>
    </ResponsiveContainer>
  );
}

function CategoryChart({ panel, data, theme, format, horizontal }) {
  const accent = theme.series[0];
  const highlight = panel.highlight;
  const fills = data.map((d) => (!highlight || String(d.x) === highlight ? accent : theme.deemphasis));
  const labelWidth = Math.min(170, Math.max(60, ...data.map((d) => String(d.x).length * 6.2)));
  const showLabels = data.length <= 12;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: horizontal ? 4 : 20, right: horizontal ? 48 : 8, bottom: 4, left: 4 }}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke={theme.grid} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps(theme)} tickFormatter={(v) => axisTick(v, format)} />
            <YAxis type="category" dataKey="x" {...axisProps(theme)} width={labelWidth} interval={0}
              tickFormatter={(v) => (String(v).length > 26 ? `${String(v).slice(0, 25)}…` : v)} />
          </>
        ) : (
          <>
            <XAxis dataKey="x" {...axisProps(theme)} interval={0} tickFormatter={periodLabel} />
            <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
          </>
        )}
        <Tooltip content={<ChartTooltip format={format} theme={theme} />} cursor={{ fill: theme.grid, fillOpacity: 0.5 }} />
        <Bar
          dataKey="y"
          name={panel.y}
          maxBarSize={24}
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          isAnimationActive={false}
        >
          {data.map((d, i) => <Cell key={String(d.x)} fill={fills[i]} />)}
          {showLabels && (
            <LabelList
              dataKey="y"
              position={horizontal ? 'right' : 'top'}
              formatter={(v) => formatValue(v, format)}
              style={{ fill: theme.textSecondary, fontSize: 11, fontWeight: 500 }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StackedChart({ panel, rows, columns, theme, format }) {
  const { data, series } = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const si = columns.indexOf(panel.series);
    const yi = columns.indexOf(panel.y);
    const totals = new Map();
    rows.forEach((r) => totals.set(String(r[si]), (totals.get(String(r[si])) || 0) + (toNumber(r[yi]) || 0)));
    // Largest parts keep their own colour; the tail folds into "Other" (never a generated sixth hue).
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    const kept = ranked.slice(0, ranked.length > MAX_STACK_SERIES ? MAX_STACK_SERIES - 1 : MAX_STACK_SERIES);
    const names = ranked.length > kept.length ? [...kept, 'Other'] : kept;
    const byX = new Map();
    rows.forEach((r) => {
      const key = String(r[xi]);
      const name = kept.includes(String(r[si])) ? String(r[si]) : 'Other';
      const entry = byX.get(key) || { x: key };
      entry[name] = (entry[name] || 0) + (toNumber(r[yi]) || 0);
      byX.set(key, entry);
    });
    return { data: [...byX.values()].sort((a, b) => String(a.x).localeCompare(String(b.x))), series: names };
  }, [panel, rows, columns]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis dataKey="x" {...axisProps(theme)} tickFormatter={periodLabel} />
        <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={(v) => axisTick(v, format)} />
        <Tooltip content={<ChartTooltip format={format} theme={theme} />} cursor={{ fill: theme.grid, fillOpacity: 0.5 }} />
        <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 11, color: theme.textSecondary }} />
        {series.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="stack"
            fill={name === 'Other' ? theme.deemphasis : theme.series[i % theme.series.length]}
            stroke={theme.surface}
            strokeWidth={2}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ReportChart({ panel, isDark = false, height = 260 }) {
  const theme = themeFor(isDark);
  const columns = panel.columns || [];
  const rows = panel.rows || [];
  const format = panel.format || 'number';
  const data = useMemo(() => {
    const xi = columns.indexOf(panel.x);
    const yi = columns.indexOf(panel.y);
    if (xi < 0 || yi < 0) return [];
    const points = rows
      .map((r) => ({ x: r[xi] === null || r[xi] === undefined ? '(blank)' : String(r[xi]), y: toNumber(r[yi]) }))
      .filter((p) => p.y !== null);
    if (panel.chart === 'line' || panel.chart === 'area') points.sort((a, b) => a.x.localeCompare(b.x));
    return points;
  }, [columns, rows, panel.x, panel.y, panel.chart]);

  if (!rows.length) {
    return <p className="py-10 text-center text-sm" style={{ color: theme.muted }}>No rows for this question.</p>;
  }
  let body;
  if (panel.chart === 'stacked_bar' && panel.series) {
    body = <StackedChart panel={panel} rows={rows} columns={columns} theme={theme} format={format} />;
  } else if (!data.length) {
    return <p className="py-10 text-center text-sm" style={{ color: theme.muted }}>This result has no numeric column to chart. Use the table view.</p>;
  } else if (panel.chart === 'line' || panel.chart === 'area') {
    body = <TrendChart panel={panel} data={data} theme={theme} format={format} />;
  } else {
    body = <CategoryChart panel={panel} data={data} theme={theme} format={format} horizontal={panel.chart === 'bar_h'} />;
  }
  const chartHeight = panel.chart === 'bar_h' ? Math.max(160, Math.min(420, data.length * 30 + 40)) : height;
  return (
    <figure className="m-0" style={{ height: chartHeight }} aria-label={`${panel.title}: chart`}>
      {body}
    </figure>
  );
}
