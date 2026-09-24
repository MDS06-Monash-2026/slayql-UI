import { API_BASE, getSessionToken } from './api';

async function call(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/arena${path}`, {
    method,
    headers,
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

export const createArenaSession = (cardCount = 4) => call('/sessions', { method: 'POST', body: { card_count: cardCount }, auth: true });
export const joinArena = (code, nickname, consent) => call(`/sessions/${code}/join`, { method: 'POST', body: { nickname, consent } });
export const voteArena = (code, token, vote) => call(`/sessions/${code}/vote`, { method: 'POST', body: { token, ...vote } });
export const askArena = (code, token, question) => call(`/sessions/${code}/stump`, { method: 'POST', body: { token, question } });
export const hostArena = (code, hostToken, action, extra = {}) => call(`/sessions/${code}/host/${action}`, { method: 'POST', body: { host_token: hostToken, ...extra } });
export const fetchEvalSummary = () => call('/eval-summary');
export const arenaExportUrl = (code, hostToken) => `${API_BASE}/arena/sessions/${code}/export.csv?host_token=${encodeURIComponent(hostToken)}`;

// Live game state over SSE, with a polling fallback when streaming is unavailable.
export function subscribeArena(code, { token = '', hostToken = '' } = {}, onState, onError) {
  const query = new URLSearchParams();
  if (token) query.set('token', token);
  if (hostToken) query.set('host_token', hostToken);
  let closed = false;
  let pollTimer = null;

  const poll = async () => {
    if (closed) return;
    try {
      onState(await call(`/sessions/${code}/state?${query}`));
    } catch (error) {
      onError?.(error);
    }
    pollTimer = setTimeout(poll, 2000);
  };

  let source = null;
  if (typeof EventSource !== 'undefined') {
    source = new EventSource(`${API_BASE}/arena/sessions/${code}/stream?${query}`);
    source.addEventListener('state', (event) => onState(JSON.parse(event.data)));
    source.onerror = () => {
      if (source && source.readyState === EventSource.CLOSED && !pollTimer) poll();
    };
  } else {
    poll();
  }
  return () => {
    closed = true;
    source?.close();
    if (pollTimer) clearTimeout(pollTimer);
  };
}
