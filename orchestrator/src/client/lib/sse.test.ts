import {
  __resetApiClientAuthForTests,
  __setLegacyAuthCredentialsForTests,
} from "@client/api/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToEventSource } from "./sse";

const { redirectToSignIn } = vi.hoisted(() => ({
  redirectToSignIn: vi.fn(),
}));

vi.mock("./auth-navigation", () => ({
  redirectToSignIn,
}));

describe("subscribeToEventSource", () => {
  afterEach(() => {
    __resetApiClientAuthForTests();
    vi.restoreAllMocks();
    redirectToSignIn.mockReset();
  });

  it("retries with a bearer token after silently upgrading legacy credentials", async () => {
    const encoder = new TextEncoder();
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();

    __setLegacyAuthCredentialsForTests({
      username: "shaheer",
      password: "secret",
    });

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
        text: async () =>
          JSON.stringify({
            ok: true,
            data: { token: "stream-token", expiresIn: 86400 },
          }),
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

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer stream-token",
      },
    });
    expect(onError).not.toHaveBeenCalled();
    expect(redirectToSignIn).not.toHaveBeenCalled();

    unsubscribe();
  });
});
