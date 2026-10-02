// Colour roles for report charts. The categorical order is the validated
// reference palette (scripts/validate_palette.js passes in both modes against
// these surfaces); light-mode slots 3-5 sit under 3:1 contrast, so every chart
// keeps a legend, tooltips and a table view as relief.
export const CHART_THEME = {
  light: {
    surface: '#ffffff',
    page: '#f7f7f5',
    text: '#0b0b0b',
    textSecondary: '#52514e',
    muted: '#898781',
    grid: '#e8e7e1',
    axis: '#c3c2b7',
    deemphasis: '#cfcdc6',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
    good: '#006300',
    bad: '#b42318',
  },
  dark: {
    surface: '#141925',
    page: '#0b0e16',
    text: '#ffffff',
    textSecondary: '#c3c2b7',
    muted: '#898781',
    grid: '#232a38',
    axis: '#383f4d',
    deemphasis: '#3a4254',
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
    good: '#0ca30c',
    bad: '#f97066',
  },
};

export const themeFor = (isDark) => (isDark ? CHART_THEME.dark : CHART_THEME.light);

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
};

export { toNumber };

// 1,284 / 12.9K / 2.16M, the same rule as backend/app/workbench/insights.py.
export function formatValue(value, format = 'number', { compact = true } = {}) {
  const number = toNumber(value);
  if (number === null) return value === null || value === undefined ? '—' : String(value);
  if (format === 'percent') {
    const shown = Math.abs(number) <= 1 ? number * 100 : number;
    return `${shown.toFixed(1)}%`;
  }
  // No currency symbol: the database does not say which currency it holds.
  const magnitude = Math.abs(number);
  if (compact && magnitude >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (compact && magnitude >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (compact && magnitude >= 1e4) return `${(number / 1e3).toFixed(1)}K`;
  return number.toLocaleString(undefined, { maximumFractionDigits: Number.isInteger(number) ? 0 : 2 });
}

export function axisTick(value, format) {
  const number = toNumber(value);
  if (number === null) return String(value ?? '');
  if (format === 'percent') return formatValue(number, 'percent');
  const magnitude = Math.abs(number);
  if (magnitude >= 1e6) return `${(number / 1e6).toFixed(magnitude >= 1e7 ? 0 : 1)}M`;
  if (magnitude >= 1e3) return `${(number / 1e3).toFixed(magnitude >= 1e4 ? 0 : 1)}K`;
  return number.toLocaleString();
}

// A rise in these is bad news (same list as the backend's UP_IS_BAD).
const UP_IS_BAD = /\b(costs?|discounts?|refund\w*|cancel\w*|returns?|churn|overdue|late|delay\w*|complaints?|cases?|errors?|expenses?|debts?|leak\w*|loss(es)?|lost|hutang)\b/i;
export const upIsBad = (label = '') => UP_IS_BAD.test(label);

// Period labels. YYYY-MM is a month ("Jun 2026"); a YYYY-MM-DD bucket start reads by the
// report's grain: a week "22 Jun", a month "Jun 2026", a quarter "Q2 2026", a year "2026".
export function periodLabel(value, bucket) {
  const text = String(value ?? '');
  const month = /^(\d{4})-(\d{2})$/.exec(text);
  if (month) {
    return new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!day) return text;
  const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  if (bucket === 'year') return String(date.getFullYear());
  if (bucket === 'quarter') return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  if (bucket === 'month' || (!bucket && day[3] === '01' && !/[ T]/.test(text))) {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// One hue, light to dark, for magnitude (heatmap cells, treemap depth).
export const SEQUENTIAL = {
  light: ['#eef2ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#3730a3'],
  dark: ['#1e1b4b', '#312e81', '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#818cf8'],
};

export function sequentialColor(isDark, share) {
  const ramp = isDark ? SEQUENTIAL.dark : SEQUENTIAL.light;
  const index = Math.max(0, Math.min(ramp.length - 1, Math.round(share * (ramp.length - 1))));
  return ramp[index];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// strftime('%w') gives 0-6 from Sunday; show day names when a column is clearly a weekday.
export function categoryLabel(value, column = '') {
  const text = String(value ?? '');
  if (/week_?day|dow|day_of_week/i.test(column) && /^[0-6]$/.test(text)) return WEEKDAYS[Number(text)];
  return text;
}
