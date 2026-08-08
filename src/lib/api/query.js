/**
 * SlayQL — Query API Service
 *
 * All functions are structured so they can be replaced with real
 * fetch() / EventSource calls to the FastAPI backend without changing
 * the call sites in components.
 *
 * POST /api/query/generate  → generateSql(prompt)
 * POST /api/query/execute   → executeQuery(sql, dbId)
 *
 * SSE stream shape (future):
 *   data: { type: "step", stepId: "schema", text: "...", done: false }
 *   data: { type: "sql",  sql: "SELECT ..." }
 *   data: { type: "done" }
 */

import { MOCK_DATA, SSE_STEPS } from '../../mock/mockData';

// ─── Helpers ────────────────────────────────────────────────────────────────

function pickDataset(prompt) {
  const lower = prompt.toLowerCase();
  if (
    lower.includes('station') ||
    lower.includes('temperature') ||
    lower.includes('gsod') ||
    lower.includes('hottest')
  ) return MOCK_DATA.noaa_gsod;
  if (
    lower.includes('blockchain') ||
    lower.includes('category') ||
    lower.includes('categories')
  ) return MOCK_DATA.blockchain_categories;
  return MOCK_DATA.iot_patents;
}

// ─── generateSql ─────────────────────────────────────────────────────────────
/**
 * Simulates streaming SQL generation via SSE.
 *
 * @param {string} prompt - Natural language question
 * @param {{ onStep: (step, index, total) => void, onSql: (dataset) => void }} callbacks
 * @returns {Promise<object>} - Resolves with the full dataset when complete
 *
 * Future: replace body with:
 *   const es = new EventSource(`/api/query/generate?prompt=${encodeURIComponent(prompt)}`);
 *   es.onmessage = (e) => { ... dispatch callbacks based on e.data.type }
 */
export async function generateSql(prompt, { onStep, onSql } = {}) {
  const dataset = pickDataset(prompt);

  for (let i = 0; i < SSE_STEPS.length; i++) {
    if (onStep) onStep(SSE_STEPS[i], i, SSE_STEPS.length);
    await new Promise((r) => setTimeout(r, SSE_STEPS[i].duration));
  }

  if (onSql) onSql(dataset);
  return dataset;
}

// ─── executeQuery ─────────────────────────────────────────────────────────────
/**
 * Simulates executing the generated SQL against the connected database.
 *
 * @param {string} sql
 * @param {string} dbId
 * @returns {Promise<{ headers: string[], rows: any[][], time: string, rowCount: number }>}
 *
 * Future: replace body with:
 *   return fetch('/api/query/execute', { method: 'POST', body: JSON.stringify({ sql, dbId }) }).then(r => r.json());
 */
export async function executeQuery(sql, dbId) {
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

  // Find the matching dataset by matching SQL content
  const ds = Object.values(MOCK_DATA).find((d) => d.sql === sql) || MOCK_DATA.iot_patents;
  return {
    headers: ds.headers,
    rows: ds.rows,
    time: ds.time,
    rowCount: ds.rows.length,
    chartData: ds.chartData,
    chartTitle: ds.chartTitle,
    chartSubtitle: ds.chartSubtitle,
  };
}
