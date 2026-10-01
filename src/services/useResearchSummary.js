import { useEffect, useState } from 'react';
import { fetchEvalSummary } from './arena';

// The landing page reads the measured results once and shares them between sections.
let pending = null;

export function useResearchSummary() {
  const [state, setState] = useState({ summary: null, error: '' });
  useEffect(() => {
    let alive = true;
    if (!pending) pending = fetchEvalSummary().catch((err) => { pending = null; throw err; });
    pending
      .then((summary) => alive && setState({ summary, error: '' }))
      .catch((err) => alive && setState({ summary: null, error: err.message || 'Results are not available right now.' }));
    return () => { alive = false; };
  }, []);
  return state;
}

export const pct = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  const scaled = Math.round(value * 100 * 10 ** digits) / 10 ** digits;
  return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled}%`;
};
