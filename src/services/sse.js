import { API_BASE, getSessionToken } from './api';

/**
 * Authenticated SSE reader. Fetch streaming keeps the session token in the
 * Authorization header instead of placing it in a URL or browser event log.
 */
function openEventStream(request, { onCreated, onEvent, onError, onComplete }, { expectsCreated = false } = {}) {
  const controller = new AbortController();
  let closed = false;
  let completed = false;
  let flushTimer = null;
  let pendingEvents = [];
  let startedSettled = false;
  let resolveStarted;
  let rejectStarted;
  const started = new Promise((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });

  const flushEvents = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const batch = pendingEvents;
    pendingEvents = [];
    batch.forEach(({ data, eventType }) => onEvent?.(data, eventType));
    batch.forEach(({ data, eventType }) => {
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(eventType)) {
        completed = true;
        onComplete?.(eventType, data);
      }
    });
  };

  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flushEvents, 50);
  };

  const dispatchBlock = (block) => {
    if (!block || block.startsWith(':')) return;
    let eventType = 'message';
    const dataLines = [];
    block.split(/\r?\n/).forEach((line) => {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    });
    if (dataLines.length === 0) return;
    try {
      const data = JSON.parse(dataLines.join('\n'));
      if (eventType === 'run.created') {
        const runData = data?.payload || {};
        if (!startedSettled) {
          startedSettled = true;
          resolveStarted(runData);
        }
        onCreated?.(runData, data);
        return;
      }
      pendingEvents.push({ data, eventType });
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(eventType)) {
        flushEvents();
      } else {
        scheduleFlush();
      }
    } catch (error) {
      onError?.(new Error('The event stream returned an invalid payload.'));
    }
  };

  (async () => {
    try {
      const response = await request(controller.signal);
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || `The event stream could not be opened (${response.status}).`);
      }
      if (!expectsCreated && !startedSettled) {
        startedSettled = true;
        resolveStarted(null);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!closed && !completed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        blocks.forEach(dispatchBlock);
      }
      if (buffer.trim()) dispatchBlock(buffer.trim());
      if (pendingEvents.length > 0) flushEvents();
      if (!closed && expectsCreated && !startedSettled) {
        throw new Error('The event stream ended before the run was created.');
      }
      if (!closed && !completed) throw new Error('The event stream ended before the run completed.');
    } catch (error) {
      if (!startedSettled) {
        startedSettled = true;
        rejectStarted(error);
      }
      if (!closed && error?.name !== 'AbortError') onError?.(error);
    }
  })();

  return {
    started,
    close: () => {
      closed = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushTimer = null;
      pendingEvents = [];
      if (!startedSettled) {
        startedSettled = true;
        resolveStarted(null);
      }
      controller.abort();
    },
  };
}

export function connectRunEventStream(runId, handlers) {
  const token = getSessionToken();
  return openEventStream(
    (signal) => fetch(`${API_BASE}/agent-runs/${encodeURIComponent(runId)}/events`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    }),
    handlers,
  );
}

export function connectNewRunEventStream(
  { question, modelId, connectionId, conversationId, thinkingEffort },
  handlers,
) {
  const token = getSessionToken();
  return openEventStream(
    (signal) => fetch(`${API_BASE}/agent-runs/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        question,
        model_id: modelId,
        connection_id: connectionId,
        conversation_id: conversationId || null,
        thinking_effort: thinkingEffort || 'minimal',
      }),
      signal,
    }),
    handlers,
    { expectsCreated: true },
  );
}
