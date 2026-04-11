import {
  __resetApiClientAuthForTests,
  setBasicAuthPromptHandler,
} from "@client/api/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToEventSource } from "./sse";

describe("subscribeToEventSource", () => {
  afterEach(() => {
    __resetApiClientAuthForTests();
    vi.restoreAllMocks();
  });

  it("retries with prompted basic auth credentials when the SSE endpoint returns 401", async () => {
    const encoder = new TextEncoder();
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();
    const eventSourceSpy = vi.fn();

    (globalThis as any).EventSource = eventSourceSpy;

    setBasicAuthPromptHandler(async () => ({
      username: "shaheer",
      password: "secret",
    }));

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        body: null,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"step":"crawling","message":"Working"}\n\n',
              ),
            );
            controller.close();
          },
        }),
      } as Response);

    const unsubscribe = subscribeToEventSource("/api/pipeline/progress", {
      onOpen,
      onMessage,
      onError,
    });

    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith({
        step: "crawling",
        message: "Working",
      });
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        Authorization: "Basic c2hhaGVlcjpzZWNyZXQ=",
      },
    });
    expect(onError).not.toHaveBeenCalled();
    expect(eventSourceSpy).not.toHaveBeenCalled();

    unsubscribe();
  });
});
