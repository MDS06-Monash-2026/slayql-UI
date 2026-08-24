import React, { useEffect, useMemo, useRef, useState } from 'react';

const COMPARISON = new Set(['bar', 'grouped_bar', 'stacked_bar', 'normalized_bar', 'diverging_bar', 'lollipop', 'dot_plot', 'bullet', 'waterfall', 'funnel', 'radial_bar']);
const LINES = new Set(['line', 'multi_line', 'step', 'slope', 'bump', 'connected_scatter', 'sparkline', 'timeline', 'gantt']);
const AREAS = new Set(['area', 'stacked_area', 'streamgraph', 'horizon', 'ridgeline']);
const POINTS = new Set(['scatter', 'bubble', 'hexbin', 'strip', 'beeswarm', 'parallel_coordinates']);
const CIRCULAR = new Set(['pie', 'donut', 'sunburst', 'circle_packing', 'radar']);

function inferType(values) {
  if (values.some((value) => typeof value === 'number')) return 'quantitative';
  if (values.some((value) => typeof value === 'string' && /^\d{4}-\d{2}/.test(value))) return 'temporal';
  return 'nominal';
}

function recordsFromResult(result) {
  return (result?.rows || []).slice(0, 200).map((row) => Object.fromEntries((result.columns || []).map((column, index) => [column, row[index]])));
}

function buildSpec(idiom, result, recommendation, colors) {
  const values = recordsFromResult(result);
  const columns = result?.columns || [];
  const types = Object.fromEntries(columns.map((column) => [column, inferType(values.map((row) => row[column]))]));
  const numeric = columns.filter((column) => types[column] === 'quantitative');
  const dimensions = columns.filter((column) => types[column] !== 'quantitative');
  const x = columns.includes(recommendation?.x_field) ? recommendation.x_field : dimensions[0] || columns[0];
  const ys = (recommendation?.y_fields || []).filter((field) => columns.includes(field));
  const y = ys[0] || numeric.find((field) => field !== x) || numeric[0] || columns[1];
  const colorField = dimensions.find((field) => field !== x);
  const base = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: 'container',
    height: 300,
    data: { values },
    config: {
      view: { stroke: null },
      axis: { labelColor: colors.text, titleColor: colors.muted, gridColor: colors.grid, labelFont: colors.font, titleFont: colors.font },
      legend: { labelColor: colors.text, titleColor: colors.muted, labelFont: colors.font, titleFont: colors.font },
      range: { category: colors.palette },
    },
  };
  const tooltip = columns.slice(0, 8).map((field) => ({ field, type: types[field] }));
  const encoding = {
    x: { field: x, type: types[x] || 'nominal', sort: types[x] === 'nominal' ? '-y' : undefined, title: x },
    y: { field: y, type: types[y] || 'quantitative', title: y },
    tooltip,
  };

  if (idiom === 'kpi') return { ...base, height: 180, mark: { type: 'text', fontSize: 52, fontWeight: 700, color: colors.palette[0] }, encoding: { text: { aggregate: 'sum', field: y, type: 'quantitative', format: ',.2f' } } };
  if (idiom === 'histogram' || idiom === 'density') return { ...base, mark: { type: 'bar', color: colors.palette[0], cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 }, encoding: { x: { field: y || x, type: 'quantitative', bin: { maxbins: 22 } }, y: { aggregate: 'count', type: 'quantitative' }, tooltip: [{ field: y || x, bin: true }, { aggregate: 'count', type: 'quantitative' }] } };
  if (idiom === 'boxplot' || idiom === 'violin') return { ...base, mark: { type: 'boxplot', extent: 'min-max', color: colors.palette[0] }, encoding: { x: { field: x, type: types[x] || 'nominal' }, y: { field: y, type: 'quantitative', scale: { zero: false } }, tooltip } };
  if (idiom === 'heatmap' || idiom === 'calendar_heatmap' || idiom === 'correlation_matrix' || idiom === 'mosaic') return { ...base, mark: 'rect', encoding: { x: { field: x, type: types[x] || 'nominal' }, y: { field: colorField || columns[1], type: types[colorField || columns[1]] || 'nominal' }, color: { field: y, type: 'quantitative', scale: { scheme: 'blues' } }, tooltip } };
  if (idiom === 'pie' || idiom === 'donut') return { ...base, width: 360, mark: { type: 'arc', innerRadius: idiom === 'donut' ? 72 : 0, outerRadius: 128, stroke: colors.background }, encoding: { theta: { field: y, type: 'quantitative', stack: true }, color: { field: x, type: 'nominal' }, tooltip } };
  if (idiom === 'treemap' || idiom === 'sunburst' || idiom === 'circle_packing') return { ...base, mark: { type: 'rect', cornerRadius: 4, stroke: colors.background }, encoding: { x: { field: x, type: 'nominal', axis: null }, y: { field: y, type: 'quantitative', stack: 'normalize', axis: null }, color: { field: x, type: 'nominal' }, tooltip } };
  if (idiom === 'small_multiples' && colorField) return { ...base, facet: { field: colorField, type: 'nominal', columns: 3 }, spec: { width: 190, height: 120, mark: { type: 'bar', color: colors.palette[0] }, encoding: { x: { field: x, type: types[x] }, y: { field: y, type: 'quantitative' }, tooltip } } };
  if (idiom === 'network' || idiom === 'sankey' || idiom === 'chord') return { ...base, mark: { type: 'rule', strokeWidth: 2, color: colors.palette[0] }, encoding: { x: { field: x, type: 'nominal' }, x2: { field: colorField || columns[1] }, y: { field: y, type: 'quantitative' }, tooltip } };
  if (CIRCULAR.has(idiom)) return { ...base, mark: { type: 'line', point: true, color: colors.palette[0] }, encoding: { ...encoding, color: colorField ? { field: colorField, type: 'nominal' } : undefined } };
  if (AREAS.has(idiom)) return { ...base, mark: { type: 'area', opacity: 0.74, line: true }, encoding: { ...encoding, color: colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] }, y: { ...encoding.y, stack: idiom === 'stacked_area' || idiom === 'streamgraph' ? 'zero' : null } } };
  if (LINES.has(idiom)) return { ...base, mark: { type: 'line', point: idiom !== 'sparkline', interpolate: idiom === 'step' ? 'step-after' : 'monotone', strokeWidth: 2.5 }, encoding: { ...encoding, color: colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] }, order: idiom === 'bump' ? { field: y, sort: 'descending' } : undefined } };
  if (POINTS.has(idiom)) return { ...base, mark: { type: idiom === 'strip' ? 'tick' : 'point', filled: true, opacity: 0.72, size: idiom === 'bubble' ? 110 : 65 }, encoding: { ...encoding, x: { field: numeric[0] || x, type: types[numeric[0] || x] }, y: { field: numeric[1] || y, type: types[numeric[1] || y] }, color: colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] }, size: idiom === 'bubble' && numeric[2] ? { field: numeric[2], type: 'quantitative' } : undefined } };
  if (COMPARISON.has(idiom)) return { ...base, mark: { type: idiom === 'dot_plot' || idiom === 'lollipop' ? 'point' : 'bar', filled: true, color: colors.palette[0], cornerRadiusTopRight: 4, cornerRadiusBottomRight: 4 }, encoding: { ...encoding, y: { field: x, type: types[x] || 'nominal', sort: '-x' }, x: { field: y, type: 'quantitative' }, color: idiom.includes('stacked') && colorField ? { field: colorField, type: 'nominal' } : { value: colors.palette[0] } } };
  return { ...base, mark: { type: 'bar', color: colors.palette[0] }, encoding };
}

export default function VegaWorkbenchChart({ idiom = 'bar', result, recommendation, palette = 'indigo', font = 'Inter' }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const colors = useMemo(() => ({
    background: '#ffffff', text: '#334155', muted: '#64748b', grid: '#e2e8f0', font,
    palette: palette === 'emerald' ? ['#059669', '#0ea5e9', '#f59e0b', '#e11d48', '#7c3aed'] : palette === 'sunset' ? ['#e11d48', '#f59e0b', '#7c3aed', '#0ea5e9', '#059669'] : ['#4f46e5', '#0ea5e9', '#059669', '#f59e0b', '#e11d48'],
  }), [palette, font]);
  const spec = useMemo(() => buildSpec(idiom, result, recommendation, colors), [idiom, result, recommendation, colors]);

  useEffect(() => {
    if (!containerRef.current || !(result?.rows || []).length) return undefined;
    let view;
    let cancelled = false;
    setError('');
    import('vega-embed')
      .then(({ default: vegaEmbed }) => {
        if (cancelled || !containerRef.current) return null;
        return vegaEmbed(containerRef.current, spec, { actions: false, renderer: 'canvas' });
      })
      .then((instance) => { if (instance) view = instance.view; })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; if (view) view.finalize(); };
  }, [spec, result]);

  if (!(result?.rows || []).length) return <div className="h-64 flex items-center justify-center text-xs text-slate-400">Run a query to visualize its result.</div>;
  return <div className="w-full min-w-0">{error ? <p className="text-xs text-red-600 p-4">{error}</p> : <div ref={containerRef} className="w-full" />}</div>;
}
