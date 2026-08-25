import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { BarChart2, LineChart as LineIcon, PieChart as PieIcon, AreaChart as AreaIcon, Sparkles, ChevronDown, Gauge } from 'lucide-react';

const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316'];

const CHART_OPTIONS = [
  { id: 'bar', label: 'Bar Chart', icon: BarChart2 },
  { id: 'line', label: 'Line Chart', icon: LineIcon },
  { id: 'area', label: 'Area Chart', icon: AreaIcon },
  { id: 'pie', label: 'Pie Chart', icon: PieIcon },
  { id: 'kpi', label: 'KPI', icon: Gauge },
];

function formatMetricLabel(str) {
  if (!str) return '';
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function VisualizationStudio({
  chartRecommendation,
  recommendation,
  columns = [],
  columnTypes = [],
  rows = [],
  isLoading = false,
  isDark = false,
}) {
  const rec = chartRecommendation || recommendation;
  const [chartType, setChartType] = useState('bar');

  // Dark-aware chart tokens
  const gridColor = isDark ? '#2d3442' : '#f1f5f9';
  const axisColor = isDark ? '#64748b' : '#64748b';
  const axisLineColor = isDark ? '#323844' : '#e2e8f0';
  const tooltipBg = isDark ? '#1b1f27' : '#ffffff';
  const tooltipBorder = isDark ? '#323844' : '#e2e8f0';
  const tooltipColor = isDark ? '#f8fafc' : '#0f172a';
  const legendColor = isDark ? '#94a3b8' : '#64748b';
  const cursorFill = isDark ? '#2a303b' : '#f8fafc';

  useEffect(() => {
    if (rec?.type) {
      setChartType(rec.type);
    }
  }, [rec]);

  // Derive chart data series
  const data = useMemo(() => {
    if (rec?.data && Array.isArray(rec.data) && rec.data.length > 0) {
      return rec.data;
    }
    if (!rows.length || !columns.length) return [];

    // Fallback: build chart items from raw rows
    const dimIdx = 0;
    const numCols = [];
    columns.forEach((col, idx) => {
      if (idx !== dimIdx) {
        numCols.push({ name: col, idx });
      }
    });

    if (numCols.length === 0 && columns.length > 1) {
      numCols.push({ name: columns[1], idx: 1 });
    }

    // Keep the fallback aligned with the backend recommendation: one clear
    // primary metric instead of a crowded multi-series chart.
    const primaryNumCol = numCols[0];
    return rows.slice(0, 30).map((r) => {
      const item = { name: String(r[dimIdx] ?? '') };
      if (primaryNumCol) {
        const val = parseFloat(r[primaryNumCol.idx]);
        item[primaryNumCol.name] = !isNaN(val) ? val : r[primaryNumCol.idx];
      }
      return item;
    });
  }, [rec, rows, columns]);

  // Derive metrics list
  const metrics = useMemo(() => {
    if (rec?.metric_keys && Array.isArray(rec.metric_keys) && rec.metric_keys.length > 0) {
      return rec.metric_keys;
    }
    if (data.length > 0) {
      return Object.keys(data[0]).filter((k) => k !== 'name');
    }
    return [];
  }, [rec, data]);

  const title =
    rec?.title ||
    (columns.length >= 2
      ? `${formatMetricLabel(columns[1])} by ${formatMetricLabel(columns[0])}`
      : 'Query Results Visualization');
  const isRecommendedView = !rec?.type || chartType === rec.type;

  // If no recommendation and no rows
  if (!rec && rows.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-500" />
        <p className="text-sm font-semibold text-slate-700">No chart data available</p>
        <p className="text-xs text-slate-400 mt-1">Run a query to generate automated visualizations.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4">
      {/* Studio Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {rec && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isRecommendedView ? 'bg-indigo-50 text-indigo-700 border-indigo-200/60' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                <Sparkles className="w-2.5 h-2.5" />
                {isRecommendedView ? (rec?.mode === 'gemini' ? 'Gemini recommended' : 'Recommended') : 'Custom view'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {rec?.recommendation_reason || (rec ? 'Auto-profiled based on returned data shape' : 'Interactive chart view')}
          </p>
          {rec?.model && (
            <p className="mt-1 text-[10px] font-mono text-slate-400">
              {rec.model}{rec.idiom ? ` / ${rec.idiom}` : ''}
            </p>
          )}
        </div>

        {/* Keep the backend recommendation as the default, with alternatives
            available without competing for attention in the primary view. */}
        <div className="flex items-center gap-2">
          <label htmlFor="chart-type" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            View as
          </label>
          <div className="relative">
            <select
              id="chart-type"
              value={chartType}
              onChange={(event) => setChartType(event.target.value)}
              className="appearance-none min-w-[142px] pl-3 pr-8 py-2 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
            >
              {CHART_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}{rec?.type === opt.id ? ' (recommended)' : ''}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-80 pt-2">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs">
            No plottable numeric data found for chart visualization.
          </div>
        ) : chartType === 'kpi' ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{formatMetricLabel(metrics[0] || title)}</p>
              <p className="mt-2 text-5xl font-semibold text-slate-950">{String(data[0]?.[metrics[0]] ?? '')}</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: axisLineColor }} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: axisLineColor }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${tooltipBorder}`,
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    fontSize: 12,
                    backgroundColor: tooltipBg,
                    color: tooltipColor,
                  }}
                  cursor={{ fill: cursorFill }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10, color: legendColor }} />
                {metrics.map((metric, idx) => (
                  <Bar
                    key={metric}
                    dataKey={metric}
                    fill={PALETTE[idx % PALETTE.length]}
                    radius={[4, 4, 0, 0]}
                    name={formatMetricLabel(metric)}
                  />
                ))}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: axisLineColor }} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: axisLineColor }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${tooltipBorder}`,
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    fontSize: 12,
                    backgroundColor: tooltipBg,
                    color: tooltipColor,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10, color: legendColor }} />
                {metrics.map((metric, idx) => (
                  <Line
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    stroke={PALETTE[idx % PALETTE.length]}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: PALETTE[idx % PALETTE.length] }}
                    activeDot={{ r: 6 }}
                    name={formatMetricLabel(metric)}
                  />
                ))}
              </LineChart>
            ) : chartType === 'area' ? (
              <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: axisLineColor }} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: axisLineColor }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${tooltipBorder}`, fontSize: 12, backgroundColor: tooltipBg, color: tooltipColor }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10, color: legendColor }} />
                {metrics.map((metric, idx) => (
                  <Area
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    stroke={PALETTE[idx % PALETTE.length]}
                    fill={PALETTE[idx % PALETTE.length]}
                    fillOpacity={0.2}
                    name={formatMetricLabel(metric)}
                  />
                ))}
              </AreaChart>
            ) : (
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey={metrics[0] || 'value'}
                  nameKey="name"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${tooltipBorder}`, fontSize: 12, backgroundColor: tooltipBg, color: tooltipColor }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10, color: legendColor }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
