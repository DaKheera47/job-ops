import { describe, expect, it, vi } from "vitest";
import { setupSse } from "./sse";

describe("setupSse", () => {
  it("flushes headers when requested and preserves stream-safe cache control", () => {
    const response = {
      status: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
    };

    setupSse(response as any, {
      cacheControl: "no-cache, no-transform",
      disableBuffering: true,
      flushHeaders: true,
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-cache, no-transform",
    );
    expect(response.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(response.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
    expect(response.flushHeaders).toHaveBeenCalledOnce();
  });
});
