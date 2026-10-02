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
  ChevronLeft,
  ChevronRight,
  Table2,
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
  // Months and weeks ("2026-01", "2026-W03") are evenly spaced periods, not exact moments.
  if (values.every((value) => typeof value !== 'string' || /^\d{4}-(\d{2}|W\d{2})$/.test(value))) {
    if (values.some((value) => typeof value === 'string')) return 'ordinal';
  }
  if (values.some((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) return 'temporal';
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
        labelLimit: 90,
        labelOverlap: 'greedy',
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
      axis: types[x] === 'ordinal' ? { labelAngle: values.length > 12 ? -35 : 0, labelOverlap: 'greedy' } : types[x] === 'nominal' ? {
        labelAngle: values.length > 8 ? -35 : 0,
        labelLimit: 90,
        labelOverlap: 'greedy',
      } : undefined,
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
        text: { aggregate: 'sum', field: y, type: 'quantitative', format: ',.2~f' },
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
        interpolate: idiom === 'step' ? 'step-after' : 'linear',
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
  onSwitchToTable,
}) {
  const rec = chartRecommendation || recommendation;
  const options = useMemo(() => {
    const ids = new Set(CHART_OPTIONS.map((o) => o.id));
    const fromServer = (rec?.options || []).filter((o) => ids.has(o.type));
    if (fromServer.length) return fromServer;
    if (rows.length === 1) return [{ type: 'kpi', label: 'KPI', reason: 'A single value is clearest as a headline number.' }];
    const first = rec?.type || rec?.idiom || 'bar';
    return ['bar', 'line', 'area'].includes(first) ? [first, ...['bar', 'line', 'area'].filter((t) => t !== first)].map((type) => ({ type, label: CHART_OPTIONS.find((o) => o.id === type).label.replace(' Chart', '') }))
      : [{ type: first, label: (CHART_OPTIONS.find((o) => o.id === first)?.label || first) }];
  }, [rec, rows.length]);
  const [chartType, setChartType] = useState('bar');
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    setChartType(options[0]?.type || rec?.type || rec?.idiom || 'bar');
  }, [rec, options]);

  const colors = useMemo(() => ({
    background: isDark ? '#121622' : '#ffffff',
    text: isDark ? '#cbd5e1' : '#334155',
    muted: isDark ? '#94a3b8' : '#64748b',
    grid: isDark ? '#2d3442' : '#e2e8f0',
    palette: isDark
      ? ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c']
      : ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316'],
  }), [isDark]);

  // Data Zoom / Windowing configuration
  const isPagingApplicable = rows.length > 15 && chartType !== 'kpi' && chartType !== 'histogram';
  const [windowSize, setWindowSize] = useState(15);
  const [startIndex, setStartIndex] = useState(0);

  // Reset startIndex when rows change or chartType changes
  useEffect(() => {
    setStartIndex(0);
  }, [rows, chartType]);

  const isPaged = isPagingApplicable && windowSize < rows.length;
  const maxStartIndex = Math.max(0, rows.length - windowSize);
  const endIndex = isPaged ? Math.min(startIndex + windowSize, rows.length) : rows.length;

  const visibleRows = useMemo(() => {
    if (!isPaged) return rows;
    return rows.slice(startIndex, endIndex);
  }, [rows, isPaged, startIndex, endIndex]);

  const handlePrev = () => {
    setStartIndex((prev) => Math.max(0, prev - windowSize));
  };

  const handleNext = () => {
    setStartIndex((prev) => Math.min(maxStartIndex, prev + windowSize));
  };

  const spec = useMemo(() => {
    if (!visibleRows.length || !columns.length || chartType === 'kpi') return null;
    return buildVegaSpec(chartType, visibleRows, columns, rec, colors, isDark);
  }, [chartType, visibleRows, columns, rec, colors, isDark]);

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
    <div className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition-all ${
      isDark ? 'bg-[#121622] border-slate-800 text-slate-100' : 'bg-white border-slate-200/90 text-slate-900'
    }`}>
      {/* Header: what is shown, why, and only the charts that suit this result */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className={`truncate text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{title}</h3>
          <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <Sparkles className={`h-3 w-3 shrink-0 ${isDark ? 'text-indigo-300' : 'text-indigo-500'}`} aria-hidden="true" />
            {options.find((o) => o.type === chartType)?.reason || rec?.recommendation_reason || 'Chosen from the shape of the result.'}
          </p>
        </div>
        {options.length > 1 && (
          <div role="radiogroup" aria-label="Chart type" className={`inline-flex shrink-0 rounded-xl p-1 ${isDark ? 'bg-slate-800/80' : 'bg-slate-100'}`}>
            {options.map((option, index) => {
              const Icon = CHART_OPTIONS.find((o) => o.id === option.type)?.icon || BarChart2;
              const active = chartType === option.type;
              return (
                <button
                  key={option.type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={option.reason}
                  onClick={() => setChartType(option.type)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? isDark ? 'bg-slate-950 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                      : isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {option.label}
                  {index === 0 && <span className={`rounded px-1 text-[9px] font-semibold ${isDark ? 'bg-indigo-500/20 text-indigo-200' : 'bg-indigo-50 text-indigo-600'}`}>Best</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Exploration Toolbar: Window info, Quick presets & View all in Table */}
      {chartType !== 'kpi' && (rows.length > 15 || onSwitchToTable) && (
        <div className={`flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl text-xs border ${
          isDark ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50/90 border-slate-200/80'
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            {isPaged ? (
              <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Showing <span className="font-semibold text-indigo-500 dark:text-indigo-400">{startIndex + 1}–{endIndex}</span> of {rows.length} items
              </span>
            ) : (
              <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Showing all {rows.length} items
              </span>
            )}

            {/* Presets */}
            {rows.length > 15 && (
              <div className="flex items-center gap-1 sm:ml-1">
                {[10, 20, 50].filter((n) => n < rows.length).map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setWindowSize(size);
                      setStartIndex(0);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                      windowSize === size && isPaged
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : isDark
                        ? 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Top {size}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setWindowSize(rows.length);
                    setStartIndex(0);
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                    !isPaged
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isDark
                      ? 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All
                </button>
              </div>
            )}
          </div>

          {onSwitchToTable && (
            <button
              onClick={onSwitchToTable}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                isDark
                  ? 'bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-300 border-indigo-800/60'
                  : 'bg-indigo-50 hover:bg-indigo-100/90 text-indigo-700 border-indigo-200/80'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>View all in Table ({rows.length})</span>
            </button>
          )}
        </div>
      )}

      {/* Chart canvas (a KPI is a native headline card) */}
      <div className={`w-full flex items-center justify-center ${chartType === 'kpi' ? '' : 'min-h-[300px] pt-2'}`}>
        {chartType === 'kpi' && visibleRows.length > 0 ? (
          <div className="grid w-full gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            {columns.map((column, index) => {
              const value = visibleRows[0][index];
              if (typeof value !== 'number') return null;
              return (
                <div key={column} className={`rounded-2xl px-5 py-4 ${isDark ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{column.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</p>
                  <p className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${isDark ? 'text-white' : 'text-slate-950'}`}>
                    {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
              );
            })}
          </div>
        ) : error ? (
          <p className="text-xs text-rose-500 p-4">{error}</p>
        ) : !visibleRows.length ? (
          <p className="text-xs text-slate-400">No plottable rows returned.</p>
        ) : (
          <div ref={containerRef} className="w-full overflow-x-auto" />
        )}
      </div>

      {/* Data Zoom Scrubber / Slider (Only when paged) */}
      {isPaged && (
        <div className={`pt-2 border-t flex items-center gap-3 px-1 ${
          isDark ? 'border-slate-800' : 'border-slate-100'
        }`}>
          <button
            onClick={handlePrev}
            disabled={startIndex === 0}
            title="Previous items"
            className={`p-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
              isDark
                ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                : 'border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-slate-400 font-mono">
              <span>1</span>
              <span className="text-slate-500 dark:text-slate-400 font-sans font-medium text-[11px]">
                Drag to explore window ({startIndex + 1}–{endIndex})
              </span>
              <span>{rows.length}</span>
            </div>
            <input
              type="range"
              min={0}
              max={maxStartIndex}
              step={1}
              value={startIndex}
              onChange={(e) => setStartIndex(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-hidden"
            />
          </div>

          <button
            onClick={handleNext}
            disabled={endIndex >= rows.length}
            title="Next items"
            className={`p-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
              isDark
                ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                : 'border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
