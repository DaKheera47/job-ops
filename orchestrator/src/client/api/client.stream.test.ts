import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

describe("API client SSE streaming", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.__resetApiClientAuthForTests();
  });

  it("propagates handler errors and cancels the stream reader", async () => {
    const encoder = new TextEncoder();
    const cancelSpy = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"started","requestId":"req-1"}\n\n'),
        );
      },
      cancel() {
        cancelSpy();
      },
    });

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as Response);

    await expect(
      api.streamBulkJobAction(
        { action: "skip", jobIds: ["job-1"] },
        {
          onEvent: () => {
            throw new Error("handler exploded");
          },
        },
      ),
    ).rejects.toThrow("handler exploded");

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});
