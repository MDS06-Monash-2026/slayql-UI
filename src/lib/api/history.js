/**
 * SlayQL — Query History API Service
 *
 * GET  /api/query/history         → getHistory()
 * POST /api/query/history/:id/delete → deleteHistoryItem(id)
 * POST /api/query/history/save    → saveQuery(queryData)
 */

// ─── In-memory store (simulates a real history backend) ─────────────────────

let MOCK_HISTORY = [
  {
    id: 'hist-001',
    prompt: 'How many IoT-related patent applications were filed each month from 2008 to 2022?',
    sql: 'SELECT FORMAT_DATE(\'%Y-%m\', filing_date) AS month, COUNT(DISTINCT publication_number) AS applications FROM `patents-public-data.patents.publications` ...',
    rowCount: 178,
    executionTimeMs: 1900,
    status: 'success',
    database: 'Spider2 / SQLite',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),   // 12 min ago
    saved: false,
  },
  {
    id: 'hist-002',
    prompt: 'What are the top 3 dates in October 2009 with highest average temperature for station 723758?',
    sql: 'SELECT FORMAT_DATE(\'%Y-%m-%d\', ...) AS date, temp AS avg_temp FROM `bigquery-public-data.noaa_gsod.gsod2009` ...',
    rowCount: 3,
    executionTimeMs: 640,
    status: 'success',
    database: 'Spider2 / SQLite',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    saved: true,
  },
  {
    id: 'hist-003',
    prompt: "Which technology categories had the most patent filings mentioning 'blockchain' in their abstract?",
    sql: 'SELECT m.technology_category, COUNT(DISTINCT p.publication_number) AS filings ...',
    rowCount: 6,
    executionTimeMs: 2300,
    status: 'success',
    database: 'Spider2 / SQLite',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // yesterday
    saved: false,
  },
  {
    id: 'hist-004',
    prompt: 'Show monthly revenue breakdown by region for Q1 2024',
    sql: 'SELECT region, DATE_TRUNC(\'month\', order_date) AS month, SUM(revenue) FROM orders ...',
    rowCount: 24,
    executionTimeMs: 820,
    status: 'success',
    database: 'Spider2 / SQLite',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    saved: true,
  },
];

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Returns the recent query history, newest first.
 * Future: return fetch('/api/query/history').then(r => r.json())
 */
export async function getHistory() {
  await new Promise((r) => setTimeout(r, 60));
  return [...MOCK_HISTORY];
}

/**
 * Adds a new query to the in-memory history store.
 * Future: return fetch('/api/query/history/save', { method: 'POST', body: JSON.stringify(data) })
 */
export function addToHistory(queryData) {
  const item = {
    id: `hist-${Date.now()}`,
    prompt: queryData.prompt,
    sql: queryData.sql,
    rowCount: queryData.rows?.length ?? 0,
    executionTimeMs: parseFloat(queryData.time) * 1000 || 0,
    status: 'success',
    database: 'Spider2 / SQLite',
    createdAt: new Date().toISOString(),
    saved: false,
  };
  MOCK_HISTORY = [item, ...MOCK_HISTORY];
  return item;
}

/**
 * Deletes a history item by id.
 * Future: return fetch(`/api/query/history/${id}`, { method: 'DELETE' })
 */
export function deleteHistoryItem(id) {
  MOCK_HISTORY = MOCK_HISTORY.filter((h) => h.id !== id);
}

/**
 * Toggles saved state for a history item.
 */
export function toggleSaved(id) {
  MOCK_HISTORY = MOCK_HISTORY.map((h) =>
    h.id === id ? { ...h, saved: !h.saved } : h
  );
  return MOCK_HISTORY.find((h) => h.id === id);
}

// ─── Date formatting helper ───────────────────────────────────────────────────

export function formatRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}
