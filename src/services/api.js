import { cachedRequest, clearClientCache, invalidateClientCache } from './clientCache';

// Same-origin is correct for the VPS Caddy deployment. Vercel needs the
// public API prefix because its frontend and the API are hosted separately.
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || '/api/v1'
).trim().replace(/\/+$/, '');

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
  clearClientCache();
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

async function passwordResetCall(path, body) {
  const res = await fetch(`${API_BASE}/auth/password-reset/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'The request failed. Try again.');
  return data;
}

/** Email a one-time reset link (the reply is the same whether or not the account exists). */
export function requestPasswordReset(email) {
  return passwordResetCall('request', { email });
}

export function confirmPasswordReset(token, password) {
  return passwordResetCall('confirm', { token, password });
}

export async function loginOrganization({ email, password, organization_name, is_reviewer = false, role = null }) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `role` is a job title only; access roles are granted by organisation owners.
    body: JSON.stringify({ email, password, organization_name, is_reviewer, role }),
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
  return cachedRequest(`models:${query}`, async () => {
    const res = await fetch(`${API_BASE}/models${params}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to load models');
    return res.json();
  }, 10 * 60 * 1000);
}

export async function fetchConnections({ force = false } = {}) {
  return cachedRequest('connections', async () => {
    const res = await fetch(`${API_BASE}/connections`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to load database connections');
    return res.json();
  }, 30 * 60 * 1000, { force });
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
  const data = await res.json();
  invalidateClientCache('connections');
  return data;
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
  const data = await res.json();
  invalidateClientCache('connections');
  return data;
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
  const data = await res.json();
  invalidateClientCache('connections');
  invalidateClientCache(`catalog:${connectionId}`);
  invalidateClientCache(`explore:${connectionId}`);
  return data;
}

export async function updateConnection(connectionId, { name, description, connection_string = '', credentials = {} }) {
  const res = await fetch(`${API_BASE}/connections/${connectionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ name, description, connection_string, credentials }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update database connection' }));
    throw new Error(err.detail || 'Connection update failed');
  }
  const data = await res.json();
  invalidateClientCache('connections');
  invalidateClientCache(`catalog:${connectionId}`);
  invalidateClientCache(`explore:${connectionId}`);
  return data;
}

export async function replaceConnectionFile(connectionId, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/connections/${connectionId}/file`, {
    method: 'PUT',
    headers: { ...getAuthHeaders() },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to replace database file' }));
    throw new Error(err.detail || 'Database replacement failed');
  }
  const data = await res.json();
  invalidateClientCache('connections');
  invalidateClientCache(`catalog:${connectionId}`);
  invalidateClientCache(`explore:${connectionId}`);
  return data;
}

export async function fetchCatalog(connectionId, { force = false } = {}) {
  if (!connectionId) throw new Error('A database connection must be selected');
  return cachedRequest(`catalog:${connectionId}`, async () => {
    const res = await fetch(`${API_BASE}/connections/${connectionId}/catalog`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to load schema catalog');
    return res.json();
  }, 30 * 60 * 1000, { force });
}

export async function refreshConnectionCatalog(connectionId) {
  if (!connectionId) throw new Error('A database connection must be selected');
  const res = await fetch(`${API_BASE}/connections/${connectionId}/catalog/refresh`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to refresh schema catalog' }));
    throw new Error(err.detail || 'Schema refresh failed');
  }
  const data = await res.json();
  invalidateClientCache(`catalog:${connectionId}`);
  invalidateClientCache(`explore:${connectionId}`);
  invalidateClientCache('connections');
  return data;
}

export async function fetchExploreSuggestions(connectionId, { force = false } = {}) {
  if (!connectionId) return { suggestions: [] };
  return cachedRequest(`explore:${connectionId}`, async () => {
    const res = await fetch(`${API_BASE}/connections/${connectionId}/explore-suggestions`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to generate exploration suggestions');
    return res.json();
  }, 30 * 60 * 1000, { force });
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
  const data = await res.json();
  invalidateClientCache(`catalog:${connectionId}`);
  invalidateClientCache(`explore:${connectionId}`);
  invalidateClientCache('connections');
  return data;
}

export async function dropCustomTable(connectionId, tableName) {
  const res = await fetch(`${API_BASE}/connections/${connectionId}/tables/${tableName}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error('Failed to drop table');
  const data = await res.json();
  invalidateClientCache(`catalog:${connectionId}`);
  invalidateClientCache(`explore:${connectionId}`);
  invalidateClientCache('connections');
  return data;
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
  return cachedRequest('chart-idioms', async () => {
    const res = await fetch(`${API_BASE}/workbench/chart-idioms`, { headers: { ...getAuthHeaders() } });
    if (!res.ok) throw new Error('Failed to load visualization catalog');
    return res.json();
  }, 30 * 60 * 1000);
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

// --- Trusted reports: every figure is a checked query on the full data ---

/** Build a report, calling onEvent for each streamed event (stage, plan, item, report). */
export async function streamReport(connectionId, { question, title = '' }, onEvent, { signal } = {}) {
  const res = await fetch(`${API_BASE}/connections/${encodeURIComponent(connectionId)}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ question, title }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.detail || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line));
      newline = buffer.indexOf('\n');
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

/** Re-run a saved report's checked SQL on current data (no AI, no credits). */
export function refreshReport(connectionId, report) {
  return jsonRequest(`/connections/${encodeURIComponent(connectionId)}/reports/refresh`, { method: 'POST', body: { report } });
}

/** Reports saved on the server for this data source (newest first, without bodies). */
export function fetchSavedReports(connectionId) {
  return jsonRequest(`/connections/${encodeURIComponent(connectionId)}/saved-reports`);
}

/** Save a report; pass the id of an existing saved report to update it. */
export function saveReportToServer(connectionId, report, id = null) {
  return jsonRequest(`/connections/${encodeURIComponent(connectionId)}/saved-reports`, { method: 'POST', body: { report, id } });
}

export function fetchSavedReport(reportId) {
  return jsonRequest(`/saved-reports/${encodeURIComponent(reportId)}`);
}

export function deleteSavedReport(reportId) {
  return jsonRequest(`/saved-reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' });
}

/** Ready-made report packs this data source supports (e.g. the weekly distributor pack). */
export function fetchReportTemplates(connectionId) {
  return jsonRequest(`/connections/${encodeURIComponent(connectionId)}/report-templates`);
}

/** Build a report pack on current data. Its figures are written in advance, so no AI is used. */
export function runReportTemplate(connectionId, templateId) {
  return jsonRequest(`/connections/${encodeURIComponent(connectionId)}/report-templates/${encodeURIComponent(templateId)}`, { method: 'POST' });
}

export function fetchReportSchedules() {
  return jsonRequest('/report-schedules');
}

export function createReportSchedule({ connectionId, report, recipients, weekday, hour }) {
  return jsonRequest('/report-schedules', {
    method: 'POST',
    body: { connection_id: connectionId, report, recipients, weekday, hour },
  });
}

export function deleteReportSchedule(scheduleId) {
  return jsonRequest(`/report-schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' });
}

export function sendReportScheduleNow(scheduleId) {
  return jsonRequest(`/report-schedules/${encodeURIComponent(scheduleId)}/send`, { method: 'POST' });
}

/** Change one figure, or add one, from a plain-language instruction. */
export function reviseReportItem(connectionId, { report, instruction, item = null, kind = 'panel' }) {
  return jsonRequest(`/connections/${encodeURIComponent(connectionId)}/reports/revise`, {
    method: 'POST',
    body: { report, instruction, item, kind },
  });
}

export function inspectWorkbenchHealth(connectionId) {
  return workbenchRequest(`/connections/${connectionId}/workbench/ai/health`);
}

export async function createAgentRun({ question, modelId, connectionId, conversationId, thinkingEffort }) {
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
      conversation_id: conversationId || null,
      thinking_effort: thinkingEffort || 'medium',
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

export async function executeCustomSql(runId, sql, connectionId) {
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

export async function fetchConversations({ force = false } = {}) {
  return cachedRequest('conversations', async () => {
    const res = await fetch(`${API_BASE}/conversations`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) return [];
    return res.json();
  }, 5 * 60 * 1000, { force });
}

export async function fetchConversation(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load conversation' }));
    throw new Error(err.detail || 'Failed to load conversation');
  }
  return res.json();
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to delete conversation' }));
    throw new Error(err.detail || 'Failed to delete conversation');
  }
  invalidateClientCache('conversations');
  return res.json();
}

export async function reportChatMessage(messageId, { category = 'incorrect_or_unhelpful', note = '' } = {}) {
  const res = await fetch(`${API_BASE}/chat-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ message_id: messageId, category, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to report response' }));
    throw new Error(err.detail || 'Failed to report response');
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

// --- Trust layer: clarifications, review queue and approved definitions ---

async function jsonRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...getAuthHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.detail || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export function fetchTrustSettings() {
  return jsonRequest('/trust/settings');
}

export function chooseClarification(runId, optionIndex) {
  return jsonRequest(`/agent-runs/${runId}/clarify`, { method: 'POST', body: { option_index: optionIndex } });
}

export function fetchReviewItems(status = 'open') {
  return jsonRequest(`/review-items?status=${encodeURIComponent(status)}`);
}

export function fetchReviewCount() {
  return jsonRequest('/review-items/count');
}

export function resolveReviewItem(itemId, { resolution, note = '', correctedSql = null, saveVerifiedQuery = false }) {
  return jsonRequest(`/review-items/${itemId}/resolve`, {
    method: 'POST',
    body: { resolution, note, corrected_sql: correctedSql, save_verified_query: saveVerifiedQuery },
  });
}

export function fetchMembers() {
  return jsonRequest('/organization/members');
}

export function updateMemberRole(userId, accessRole) {
  return jsonRequest(`/organization/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { access_role: accessRole } });
}

export function fetchCalibration(connectionId) {
  return jsonRequest(`/connections/${encodeURIComponent(connectionId)}/calibration`);
}

export function fetchDefinitions(connectionId, status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return jsonRequest(`/connections/${connectionId}/definitions${query}`);
}

export function createDefinition(connectionId, definition) {
  return jsonRequest(`/connections/${connectionId}/definitions`, { method: 'POST', body: definition });
}

export function updateDefinitionStatus(definitionId, status) {
  return jsonRequest(`/definitions/${definitionId}`, { method: 'PATCH', body: { status } });
}

// Questions I asked that an analyst has answered, corrected or dismissed.
export function fetchMyAnswers() {
  return jsonRequest('/my-answers');
}

export function fetchMyAnswerResult(itemId) {
  return jsonRequest(`/my-answers/${itemId}/result`);
}

export function fetchDefinitionSuggestions(connectionId) {
  return jsonRequest(`/connections/${connectionId}/definitions/suggestions`);
}

// "Always use this": make a clarify choice the company's approved definition.
export function saveClarificationAsDefinition(runId, optionIndex) {
  return jsonRequest(`/agent-runs/${runId}/clarify/${optionIndex}/definition`, { method: 'POST' });
}
