interface EventSourceSubscriptionHandlers<T> {
  onOpen?: () => void;
  onMessage: (payload: T) => void;
  onError?: () => void;
}

export function subscribeToEventSource<T>(
  url: string,
  handlers: EventSourceSubscriptionHandlers<T>,
): () => void {
  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
    handlers.onOpen?.();
  };

  eventSource.onmessage = (event) => {
    try {
      handlers.onMessage(JSON.parse(event.data) as T);
    } catch {
      // Ignore malformed events to keep stream resilient.
    }
  };

  eventSource.onerror = () => {
    handlers.onError?.();
  };

  return () => {
    eventSource.close();
  };
}
