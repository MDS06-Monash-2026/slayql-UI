// Whether a panel's current rows still fit its chart, and what to draw when they do not.
// The limits match backend/app/workbench/chart_rules.py: the agent's choice was checked on the
// period it was built for, but another period or filter can leave a chart too little data
// (one stage for a funnel, two weeks for a trend). Then the panel switches to a form that fits,
// so every panel stays readable.
import { toNumber } from './chartTheme';

const LIMITS = {
  area: { periods: [4, 60] },
  line: { periods: [4, 60] },
  streamgraph: { periods: [6, 60], series: [3, 6] },
  bar: { categories: [2, 15] },
  bar_h: { categories: [2, 12] },
  stacked_bar: { categories: [2, 24], series: [2, 5] },
  donut: { categories: [2, 5] },
  waffle: { categories: [2, 5] },
  treemap: { categories: [6, 30] },
  sunburst: { categories: [2, 8] },
  funnel: { categories: [3, 8] },
  sankey: { links: [3, 40] },
  heatmap: { cells: [16, 144] },
  scatter: { points: [15, 200] },
  boxplot: { categories: [2, 8] },
  waterfall: { periods: [3, 12] },
  bullet: { categories: [1, 10] },
};

const NAMES = {
  bar: 'columns', bar_h: 'a ranking', stacked_bar: 'stacked bars', stat: 'a single figure', table: 'a table', donut: 'a donut',
};

function within([low, high], value) {
  return value >= low && value <= high;
}

export function fitChart(panel) {
  const chart = panel.chart;
  const limits = LIMITS[chart];
  const columns = panel.columns || [];
  const rows = panel.rows || [];
  if (!limits || !rows.length) return { chart, note: '' };
  const xi = columns.indexOf(panel.x);
  const yi = columns.indexOf(panel.y);
  const si = columns.indexOf(panel.series);
  if (xi < 0 || yi < 0) return { chart: 'table', note: 'Shown as a table: the chart columns are missing.' };
  const xs = new Set(rows.map((r) => String(r[xi])));
  const series = si >= 0 ? new Set(rows.map((r) => String(r[si]))) : new Set();
  const n = xs.size;
  const fallback = (next, why) => ({ chart: next, note: `Shown as ${NAMES[next] || next}: ${why}.` });
  const aggregate = n === 1 ? 'stat' : n <= 12 ? 'bar_h' : 'table';

  if (limits.periods && !within(limits.periods, n)) {
    if (n < limits.periods[0]) return fallback(n === 1 ? 'stat' : 'bar', `only ${n} period${n === 1 ? '' : 's'} in this selection`);
    return fallback('table', `${n} periods is too many for this chart`);
  }
  if (chart === 'streamgraph' && !within(limits.series, series.size)) {
    return fallback(series.size >= 2 ? 'stacked_bar' : 'bar', `${series.size} group${series.size === 1 ? '' : 's'} in this selection`);
  }
  if (chart === 'stacked_bar' && series.size < 2) return fallback(aggregate, 'only one group in this selection');
  if (limits.categories && !within(limits.categories, n)) {
    if (chart === 'treemap' && n >= 2) return fallback(n <= 5 ? 'donut' : 'bar_h', `${n} items`);
    if ((chart === 'donut' || chart === 'waffle') && n > 5) return fallback(n <= 12 ? 'bar_h' : 'table', `${n} parts`);
    return fallback(aggregate, `${n} categor${n === 1 ? 'y' : 'ies'} in this selection`);
  }
  if (chart === 'funnel') {
    const values = rows.map((r) => toNumber(r[yi]) || 0);
    if (values.some((v, i) => i > 0 && v > values[i - 1])) return fallback('bar_h', 'the stages do not shrink in order');
  }
  if (chart === 'sankey' && (si < 0 || !within(limits.links, rows.length) || rows.some((r) => String(r[xi]) === String(r[si])))) {
    return fallback(aggregate, 'too few flows to draw');
  }
  if (chart === 'heatmap' && n * Math.max(series.size, 1) < limits.cells[0]) {
    return fallback(series.size >= 2 ? 'stacked_bar' : aggregate, 'too few cells for a heatmap');
  }
  if (chart === 'scatter' && rows.length < limits.points[0]) return fallback(rows.length <= 12 ? 'bar_h' : 'table', `only ${rows.length} points`);
  if (chart === 'boxplot') {
    const counts = {};
    rows.forEach((r) => { counts[r[xi]] = (counts[r[xi]] || 0) + 1; });
    if (Math.min(...Object.values(counts)) < 5) return fallback('bar', 'too few records per group for a spread');
  }
  if (chart === 'bullet' && columns.indexOf(panel.target) < 0) return fallback('bar_h', 'no target in this result');
  return { chart, note: '' };
}
