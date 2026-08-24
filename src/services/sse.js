/**
 * SlayQL SSE Stream Manager
 * Listens to versioned backend Server-Sent Events and dispatches typed callbacks.
 */

export function connectRunEventStream(runId, { onEvent, onError, onComplete }) {
  const eventSource = new EventSource(`/api/v1/agent-runs/${runId}/events`);
  let isCompleted = false;

  const eventTypes = [
    'run.accepted',
    'stream.ready',
    'stage.started',
    'stage.evidence',
    'stage.completed',
    'stage.failed',
    'provider.request_started',
    'provider.connected',
    'provider.first_delta',
    'provider.request_completed',
    'provider.completed',
    'provider.usage_finalized',
    'sql.candidate_ready',
    'sql.validation_started',
    'sql.validation_check',
    'sql.validation_completed',
    'sql.ready',
    'execution.started',
    'execution.columns',
    'execution.rows',
    'execution.truncated',
    'execution.completed',
    'execution.failed',
    'visualization.started',
    'visualization.recommended',
    'visualization.not_recommended',
    'run.completed',
    'run.failed',
    'run.cancelled',
  ];

  const handleParsedData = (type, rawData) => {
    try {
      const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      if (onEvent) onEvent(data, type);

      if (type === 'run.completed' || type === 'run.failed' || type === 'run.cancelled') {
        isCompleted = true;
        eventSource.close();
        if (onComplete) onComplete(type, data);
      }
    } catch (err) {
      console.error('Error parsing SSE event payload:', err, rawData);
    }
  };

  eventTypes.forEach((type) => {
    eventSource.addEventListener(type, (e) => {
      handleParsedData(type, e.data);
    });
  });

  // Also listen for default SSE message events
  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      const type = data.type || 'message';
      handleParsedData(type, data);
    } catch (err) {
      console.warn('Unhandled SSE message:', e.data);
    }
  };

  eventSource.onerror = (err) => {
    if (!isCompleted) {
      console.warn('SSE connection interrupted:', err);
      if (onError) onError(err);
    }
  };

  return {
    close: () => {
      isCompleted = true;
      eventSource.close();
    },
  };
}

