import { API_BASE, getSessionToken } from './api';

/**
 * Authenticated SSE reader. Fetch streaming keeps the session token in the
 * Authorization header instead of placing it in a URL or browser event log.
 */
export function connectRunEventStream(runId, { onEvent, onError, onComplete }) {
  const controller = new AbortController();
  let closed = false;
  let completed = false;

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
      onEvent?.(data, eventType);
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(eventType)) {
        completed = true;
        onComplete?.(eventType, data);
      }
    } catch (error) {
      onError?.(new Error('The event stream returned an invalid payload.'));
    }
  };

  (async () => {
    try {
      const token = getSessionToken();
      const response = await fetch(`${API_BASE}/agent-runs/${encodeURIComponent(runId)}/events`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`The event stream could not be opened (${response.status}).`);
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
      if (!closed && !completed) throw new Error('The event stream ended before the run completed.');
    } catch (error) {
      if (!closed && error?.name !== 'AbortError') onError?.(error);
    }
  })();

  return {
    close: () => {
      closed = true;
      controller.abort();
    },
  };
}
