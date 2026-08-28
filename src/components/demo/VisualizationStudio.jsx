import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart2,
  LineChart as LineIcon,
  PieChart as PieIcon,
  AreaChart as AreaIcon,
  Sparkles,
  ChevronDown,
  Gauge,
  ScatterChart,
  BarChart3,
  Flame,
} from 'lucide-react';

const COMPARISON = new Set(['bar', 'grouped_bar', 'stacked_bar', 'normalized_bar', 'diverging_bar', 'lollipop', 'dot_plot', 'bullet', 'waterfall', 'funnel', 'radial_bar']);
const LINES = new Set(['line', 'multi_line', 'step', 'slope', 'bump', 'connected_scatter', 'sparkline', 'timeline', 'gantt']);
const AREAS = new Set(['area', 'stacked_area', 'streamgraph', 'horizon', 'ridgeline']);
const POINTS = new Set(['scatter', 'bubble', 'hexbin', 'strip', 'beeswarm', 'parallel_coordinates']);
const CIRCULAR = new Set(['pie', 'donut', 'sunburst', 'circle_packing', 'radar']);

const CHART_OPTIONS = [
  { id: 'bar', label: 'Bar Chart', icon: BarChart2 },
  { id: 'line', label: 'Line Chart', icon: LineIcon },
  { id: 'area', label: 'Area Chart', icon: AreaIcon },
  { id: 'pie', label: 'Pie Chart', icon: PieIcon },
  { id: 'donut', label: 'Donut Chart', icon: PieIcon },
  { id: 'kpi', label: 'KPI Summary', icon: Gauge },
  { id: 'scatter', label: 'Scatter Plot', icon: ScatterChart },
  { id: 'histogram', label: 'Histogram', icon: BarChart3 },
  { id: 'heatmap', label: 'Heatmap', icon: Flame },
];

function inferType(values) {
  if (values.some((value) => typeof value === 'number')) return 'quantitative';
  if (values.some((value) => typeof value === 'string' && /^\d{4}-\d{2}/.test(value))) return 'temporal';
  return 'nominal';
}

function recordsFromResult(rows, columns) {
  if (!rows || !columns) return [];
  return rows.slice(0, 300).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]]))
  );
}

function buildVegaSpec(idiom, rows, columns, recommendation, colors, isDark) {
  const values = recordsFromResult(rows, columns);
  const types = Object.fromEntries(
    columns.map((column) => [column, inferType(values.map((row) => row[column]))])
  );
  const numeric = columns.filter((column) => types[column] === 'quantitative');
  const dimensions = columns.filter((column) => types[column] !== 'quantitative');

  const x = columns.includes(recommendation?.x_field)
    ? recommendation.x_field
    : dimensions[0] || columns[0] || 'x';
  const ys = (recommendation?.y_fields || []).filter((field) => columns.includes(field));
  const y = ys[0] || numeric.find((field) => field !== x) || numeric[0] || columns[1] || 'y';
  const colorField = dimensions.find((field) => field !== x);

  const base = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: 'container',
    height: 300,
    background: 'transparent',
    data: { values },
    config: {
      view: { stroke: null },
      axis: {
        labelColor: colors.text,
        titleColor: colors.muted,
        gridColor: colors.grid,
        labelFont: 'Inter, system-ui, sans-serif',
        titleFont: 'Inter, system-ui, sans-serif',
        labelFontSize: 11,
        titleFontSize: 12,
      },
      legend: {
        labelColor: colors.text,
        titleColor: colors.muted,
        labelFont: 'Inter, system-ui, sans-serif',
        titleFont: 'Inter, system-ui, sans-serif',
        labelFontSize: 11,
      },
      range: { category: colors.palette },
    },
  };

  const tooltip = columns.slice(0, 8).map((field) => ({ field, type: types[field] }));
  const encoding = {
    x: {
      field: x,
      type: types[x] || 'nominal',
      sort: types[x] === 'nominal' ? '-y' : undefined,
      title: x,
    },
    y: {
      field: y,
      type: types[y] || 'quantitative',
      title: y,
    },
    tooltip,
  };

  if (idiom === 'kpi') {
    return {
      ...base,
      height: 200,
      mark: {
        type: 'text',
        fontSize: 48,
        fontWeight: 700,
        color: colors.palette[0],
      },
      encoding: {
        text: { aggregate: 'sum', field: y, type: 'quantitative', format: ',.2f' },
      },
    };
  }

  if (idiom === 'histogram' || idiom === 'density') {
    return {
      ...base,
      mark: { type: 'bar', color: colors.palette[0], cornerRadiusTopLeft: 4, cornerRadiusTopRight: 4 },
      encoding: {
        x: { field: y || x, type: 'quantitative', bin: { maxbins: 20 } },
        y: { aggregate: 'count', type: 'quantitative' },
        tooltip: [{ field: y || x, bin: true }, { aggregate: 'count', type: 'quantitative' }],
      },
    };
  }

  if (idiom === 'boxplot' || idiom === 'violin') {
    return {
      ...base,
      mark: { type: 'boxplot', extent: 'min-max', color: colors.palette[0] },
      encoding: {
        x: { field: x, type: types[x] || 'nominal' },
        y: { field: y, type: 'quantitative', scale: { zero: false } },
        tooltip,
      },
    };
  }

  if (idiom === 'heatmap' || idiom === 'calendar_heatmap' || idiom === 'correlation_matrix') {
    return {
      ...base,
      mark: 'rect',
      encoding: {
        x: { field: x, type: types[x] || 'nominal' },
        y: { field: colorField || columns[1] || x, type: types[colorField || columns[1] || x] || 'nominal' },
        color: { field: y, type: 'quantitative', scale: { scheme: isDark ? 'viridis' : 'blues' } },
        tooltip,
      },
    };
  }

  if (idiom === 'pie' || idiom === 'donut') {
    return {
      ...base,
      height: 320,
      mark: {
        type: 'arc',
        innerRadius: idiom === 'donut' ? 68 : 0,
        outerRadius: 120,
        stroke: colors.background,
      },
      encoding: {
        theta: { field: y, type: 'quantitative', stack: true },
        color: { field: x, type: 'nominal' },
        tooltip,
      },
    };
  }

  if (CIRCULAR.has(idiom)) {
    return {
      ...base,
      mark: { type: 'line', point: true, color: colors.palette[0] },
      encoding: {
        ...encoding,
        color: colorField ? { field: colorField, type: 'nominal' } : undefined,
      },
    };
  }

  if (AREAS.has(idiom)) {
    return {
      ...base,
      mark: { type: 'area', opacity: 0.65, line: { color: colors.palette[0], strokeWidth: 2 } },
      encoding: {
        ...encoding,
        color: colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] },
        y: { ...encoding.y, stack: idiom === 'stacked_area' ? 'zero' : null },
      },
    };
  }

  if (LINES.has(idiom)) {
    return {
      ...base,
      mark: {
        type: 'line',
        point: true,
        interpolate: idiom === 'step' ? 'step-after' : 'monotone',
        strokeWidth: 2.5,
      },
      encoding: {
        ...encoding,
        color: colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] },
      },
    };
  }

  if (POINTS.has(idiom) || idiom === 'scatter') {
    return {
      ...base,
      mark: { type: 'point', filled: true, opacity: 0.75, size: 70 },
      encoding: {
        ...encoding,
        x: { field: numeric[0] || x, type: types[numeric[0] || x] || 'nominal' },
        y: { field: numeric[1] || y, type: types[numeric[1] || y] || 'quantitative' },
        color: colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] },
      },
    };
  }

  // Default Comparison / Bar
  return {
    ...base,
    mark: {
      type: 'bar',
      color: colors.palette[0],
      cornerRadiusTopLeft: 4,
      cornerRadiusTopRight: 4,
    },
    encoding: {
      ...encoding,
      color: idiom.includes('stacked') && colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] },
    },
  };
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
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (rec?.type || rec?.idiom) {
      setChartType(rec.type || rec.idiom);
    }
  }, [rec]);

  const colors = useMemo(() => ({
    background: isDark ? '#121622' : '#ffffff',
    text: isDark ? '#cbd5e1' : '#334155',
    muted: isDark ? '#94a3b8' : '#64748b',
    grid: isDark ? '#2d3442' : '#e2e8f0',
    palette: isDark
      ? ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c']
      : ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316'],
  }), [isDark]);

  const spec = useMemo(() => {
    if (!rows.length || !columns.length) return null;
    return buildVegaSpec(chartType, rows, columns, rec, colors, isDark);
  }, [chartType, rows, columns, rec, colors, isDark]);

  useEffect(() => {
    if (!containerRef.current || !spec) return undefined;
    let view;
    let cancelled = false;
    setError('');

    import('vega-embed')
      .then(({ default: vegaEmbed }) => {
        if (cancelled || !containerRef.current) return null;
        return vegaEmbed(containerRef.current, spec, {
          actions: false,
          renderer: 'canvas',
        });
      })
      .then((instance) => {
        if (instance) view = instance.view;
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      if (view) view.finalize();
    };
  }, [spec]);

  const title =
    rec?.title ||
    (columns.length >= 2
      ? `${columns[1]} by ${columns[0]}`
      : 'Query Results Visualization');

  const isRecommendedView = !rec?.type && !rec?.idiom ? true : (chartType === (rec?.type || rec?.idiom));

  if (!rec && rows.length === 0) {
    return (
      <div className={`py-12 text-center rounded-2xl border transition-all ${
        isDark ? 'bg-[#121622] border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
      }`}>
        <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-500" />
        <p className="text-sm font-semibold">No chart data available</p>
        <p className="text-xs text-slate-400 mt-1">Run a query to generate automated Vega-Lite visualizations.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border shadow-xs p-5 space-y-4 transition-all ${
      isDark ? 'bg-[#121622] border-slate-800 text-slate-100' : 'bg-white border-slate-200/90 text-slate-900'
    }`}>
      {/* Studio Header & Controls */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${
        isDark ? 'border-slate-800' : 'border-slate-100'
      }`}>
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{title}</h3>
            {rec && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                isRecommendedView
                  ? isDark
                    ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
                  : isDark
                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}>
                <Sparkles className="w-2.5 h-2.5" />
                {isRecommendedView ? (rec?.mode === 'gemini' ? 'Gemini recommended' : 'Vega-Lite recommended') : 'Custom view'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {rec?.recommendation_reason || (rec ? 'Auto-profiled Vega-Lite specification' : 'Interactive visualization')}
          </p>
        </div>

        {/* Idiom Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="vega-chart-type" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            View as
          </label>
          <div className="relative">
            <select
              id="vega-chart-type"
              value={chartType}
              onChange={(event) => setChartType(event.target.value)}
              className={`appearance-none min-w-[150px] pl-3 pr-8 py-2 rounded-xl text-xs font-semibold outline-none transition-all border ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200 focus:border-indigo-500'
                  : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
              }`}
            >
              {CHART_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}{(rec?.type === opt.id || rec?.idiom === opt.id) ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Vega-Lite Chart Canvas */}
      <div className="w-full min-h-[300px] flex items-center justify-center pt-2">
        {error ? (
          <p className="text-xs text-rose-500 p-4">{error}</p>
        ) : !rows.length ? (
          <p className="text-xs text-slate-400">No plottable rows returned.</p>
        ) : (
          <div ref={containerRef} className="w-full overflow-x-auto" />
        )}
      </div>
    </div>
  );
}
