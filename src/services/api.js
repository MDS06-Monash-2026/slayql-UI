const API_BASE = '/api/v1';

export function getSessionToken() {
  return localStorage.getItem('slayql_session_token') || '';
}

export function setSessionToken(token) {
  if (token) {
    localStorage.setItem('slayql_session_token', token);
  } else {
    localStorage.removeItem('slayql_session_token');
  }
}

export function getStoredSession() {
  const data = localStorage.getItem('slayql_session_data');
  return data ? JSON.parse(data) : null;
}

export function setStoredSession(session) {
  if (session) {
    localStorage.setItem('slayql_session_data', JSON.stringify(session));
    if (session.token) setSessionToken(session.token);
  } else {
    localStorage.removeItem('slayql_session_data');
    setSessionToken('');
  }
}

function getAuthHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// --- Auth Endpoints ---

export async function loginOrganization({ email, organization_name, is_reviewer = false, role = 'Admin' }) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, organization_name, is_reviewer, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Authentication failed' }));
    throw new Error(err.detail || 'Sign in failed');
  }
  const session = await res.json();
  setStoredSession(session);
  return session;
}

export async function fetchSession() {
  const token = getSessionToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/session`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token ? data : null;
  } catch (err) {
    return null;
  }
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
  } finally {
    setStoredSession(null);
  }
}

export async function fetchProfile() {
  const res = await fetch(`${API_BASE}/profile`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function updateProfile(fields) {
  const res = await fetch(`${API_BASE}/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update profile' }));
    throw new Error(err.detail || 'Failed to update profile');
  }
  return res.json();
}

export async function uploadProfileAvatar(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/profile/avatar`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to upload profile photo' }));
    throw new Error(err.detail || 'Failed to upload profile photo');
  }
  return res.json();
}

export async function fetchCredits() {
  const res = await fetch(`${API_BASE}/credits`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error('Failed to load credits');
  return res.json();
}

export async function addCredits(amount = 100) {
  const res = await fetch(`${API_BASE}/credits/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error('Failed to add credits');
  return res.json();
}

// --- Data & Agent API Endpoints ---

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchModels({ query = '' } = {}) {
  const params = query ? `?q=${encodeURIComponent(query)}` : '';
  const res = await fetch(`${API_BASE}/models${params}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error('Failed to load models');
  return res.json();
}

export async function fetchConnections() {
  const res = await fetch(`${API_BASE}/connections`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error('Failed to load database connections');
  return res.json();
}

export async function createConnection({ name, provider, engine = 'sqlite', mode = 'direct', connection_string = '', credentials = {}, description = '' }) {
  const res = await fetch(`${API_BASE}/connections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ name, provider: provider || engine, engine, mode, connection_string, credentials, description }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create database connection' }));
    throw new Error(err.detail || 'Connection creation failed');
  }
  return res.json();
}

export async function uploadConnection({ name, file, description = '' }) {
  const form = new FormData();
  form.append('name', name);
  form.append('description', description);
  form.append('file', file);
  const res = await fetch(`${API_BASE}/connections/upload`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to upload database' }));
    throw new Error(err.detail || 'Database upload failed');
  }
  return res.json();
}

export async function testConnection(connectionId) {
  const res = await fetch(`${API_BASE}/connections/${connectionId}/test`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error('Connection test failed');
  return res.json();
}

export async function deleteConnection(connectionId) {
  const res = await fetch(`${API_BASE}/connections/${connectionId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to delete connection' }));
    throw new Error(err.detail || 'Delete failed');
  }
  return res.json();
}

export async function fetchCatalog(connectionId = 'sqlite_demo') {
  const res = await fetch(`${API_BASE}/connections/${connectionId}/catalog`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error('Failed to load schema catalog');
  return res.json();
}

export async function createCustomTable(connectionId, { table_name, description = '', columns, foreign_keys = [], initial_rows = [] }) {
  const res = await fetch(`${API_BASE}/connections/${connectionId}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      table_name,
      description,
      columns,
      foreign_keys,
      initial_rows,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create table' }));
    throw new Error(err.detail || 'Table creation failed');
  }
  return res.json();
}

export async function dropCustomTable(connectionId, tableName) {
  const res = await fetch(`${API_BASE}/connections/${connectionId}/tables/${tableName}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error('Failed to drop table');
  return res.json();
}

async function workbenchRequest(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Workbench request failed' }));
    throw new Error(err.detail || 'Workbench request failed');
  }
  return res.json();
}

export async function fetchChartIdioms() {
  const res = await fetch(`${API_BASE}/workbench/chart-idioms`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error('Failed to load visualization catalog');
  return res.json();
}

export function executeWorkbenchQuery(connectionId, sql) {
  return workbenchRequest(`/connections/${connectionId}/workbench/query`, { sql, connection_id: connectionId });
}

export function assistWorkbenchSql(connectionId, { instruction, sql, cursor_position }) {
  return workbenchRequest(`/connections/${connectionId}/workbench/ai/sql`, { instruction, sql, cursor_position });
}

export function recommendWorkbenchVisualization(connectionId, { question, result }) {
  return workbenchRequest(`/connections/${connectionId}/workbench/ai/visualization`, { question, result });
}

export function generateWorkbenchDashboard(connectionId, { preference, result }) {
  return workbenchRequest(`/connections/${connectionId}/workbench/ai/dashboard`, { preference, result });
}

export function inspectWorkbenchHealth(connectionId) {
  return workbenchRequest(`/connections/${connectionId}/workbench/ai/health`);
}

export async function createAgentRun({ question, modelId, connectionId = 'sqlite_demo' }) {
  const res = await fetch(`${API_BASE}/agent-runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      question,
      model_id: modelId,
      connection_id: connectionId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create run' }));
    throw new Error(err.detail || 'Failed to create run');
  }
  return res.json();
}

export async function cancelAgentRun(runId) {
  const res = await fetch(`${API_BASE}/agent-runs/${runId}/cancel`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
  });
  return res.json();
}

export async function executeCustomSql(runId, sql, connectionId = 'sqlite_demo') {
  const res = await fetch(`${API_BASE}/agent-runs/${runId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ sql, connection_id: connectionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Execution error' }));
    throw new Error(err.detail || 'Execution failed');
  }
  return res.json();
}

export async function fetchHistory() {
  const res = await fetch(`${API_BASE}/history`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function deleteHistory(historyId) {
  const res = await fetch(`${API_BASE}/history/${encodeURIComponent(historyId)}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to delete chat' }));
    throw new Error(err.detail || 'Failed to delete chat');
  }
  return res.json();
}

export async function fetchSavedQueries() {
  const res = await fetch(`${API_BASE}/saved-queries`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function saveQuery({ name, description, prompt, sql }) {
  const res = await fetch(`${API_BASE}/saved-queries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ name, description, prompt, sql }),
  });
  if (!res.ok) throw new Error('Failed to save query');
  return res.json();
}
