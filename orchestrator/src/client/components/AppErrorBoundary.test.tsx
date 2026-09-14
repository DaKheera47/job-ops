import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/client/api/core";
import * as errorToast from "@/client/lib/error-toast";
import {
  AppErrorBoundary,
  buildFatalIssueUrl,
  createFatalErrorSnapshot,
  FatalErrorScreen,
  isOpaqueCrossOriginError,
  sanitizeCrashText,
} from "./AppErrorBoundary";

function renderBoundary(children: React.ReactNode, initialPath = "/settings") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </MemoryRouter>,
  );
}

const ExplodingChild = () => {
  throw new Error("password=super-secret render failed");
};

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(errorToast, "showErrorToast").mockReturnValue("toast-id");
    (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = "1.2.3";
  });

  it("shows a fatal fallback when a child render crashes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const preventDefault = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", preventDefault);

    try {
      renderBoundary(<ExplodingChild />, "/settings#environment");
    } finally {
      window.removeEventListener("error", preventDefault);
    }

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload app/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute(
      "href",
      "/overview",
    );

    const issueLink = screen.getByRole("link", {
      name: /open github issue/i,
    });
    expect(issueLink).toHaveAttribute(
      "href",
      expect.stringContaining(
        "https://github.com/DaKheera47/job-ops/issues/new",
      ),
    );
    expect(decodeURIComponent(issueLink.getAttribute("href") ?? "")).toContain(
      "password=[redacted]",
    );
    expect(
      decodeURIComponent(issueLink.getAttribute("href") ?? ""),
    ).not.toContain("super-secret");

    const details = screen.getByText("Technical details").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Technical details"));
    expect(
      within(details as HTMLElement).getByText(/Version: v1\.2\.3/),
    ).toBeInTheDocument();
  });

  it("calls the reload handler from the fatal screen button", () => {
    const onReload = vi.fn();
    const snapshot = createFatalErrorSnapshot(new Error("boom"), "runtime", {
      route: "/settings",
    });

    render(<FatalErrorScreen snapshot={snapshot} onReload={onReload} />);

    fireEvent.click(screen.getByRole("button", { name: /reload app/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("shows the same fallback for uncaught runtime errors", async () => {
    renderBoundary(<div>Healthy app</div>, "/jobs/ready");

    act(() => {
      window.dispatchEvent(
        new ErrorEvent("error", {
          error: new Error("authorization: Bearer abc.def.ghi runtime failed"),
          message: "authorization: Bearer abc.def.ghi runtime failed",
        }),
      );
    });

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Healthy app")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(/authorization: \[redacted\]/)).toBeInTheDocument();
    expect(screen.queryByText(/abc\.def\.ghi/)).not.toBeInTheDocument();
  });

  it("ignores opaque cross-origin 'Script error.' events without crashing", async () => {
    renderBoundary(<div>Healthy app</div>, "/jobs/discovered/abc123");

    act(() => {
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "Script error.",
          filename: "",
          lineno: 0,
          colno: 0,
          // No `error` object — the browser hides details for cross-origin scripts.
        }),
      );
    });

    expect(screen.getByText("Healthy app")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Something went wrong" }),
    ).not.toBeInTheDocument();
  });

  it("shows the fatal fallback for unhandled promise rejections", async () => {
    renderBoundary(<div>Healthy app</div>, "/overview");
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", {
      value: new Error("token=abc123 rejected"),
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(/token=\[redacted\]/)).toBeInTheDocument();
    expect(screen.queryByText(/abc123/)).not.toBeInTheDocument();
  });

  it.each([
    [
      "reported Chrome extension and OpenPanel frames",
      "TypeError: Failed to fetch\n" +
        "    at fetch (chrome-extension://example-extension/content.js:12:34)\n" +
        "    at P.post (https://openpanel.dev/op1.js:1:456)\n" +
        "    at l.send (https://openpanel.dev/op1.js:1:789)",
    ],
    [
      "OpenPanel-only named and anonymous Chrome frames",
      "TypeError: Failed to fetch\n" +
        "    at x.y (https://openpanel.dev/op1.js:9:102)\n" +
        "    at https://openpanel.dev/op1.js:22:3",
    ],
    [
      "changed Chrome extension ID and offsets",
      "TypeError: Failed to fetch\n" +
        "    at z (chrome-extension://another-extension/injected.js:999:2)\n" +
        "    at q (https://openpanel.dev/op1.js:8:6)",
    ],
    [
      "Firefox frames without an error header",
      "fetch@moz-extension://different-extension/content.js:44:8\n" +
        "b.post@https://openpanel.dev/op1.js:20:90\n" +
        "@https://openpanel.dev/op1.js:30:4",
    ],
    [
      "Safari frames with blank lines",
      "\nfetch@safari-web-extension://other-extension/content.js:71:5\n\n" +
        "c.send@https://openpanel.dev/op1.js:42:11\n",
    ],
    ["a line-only location", "    at https://openpanel.dev/op1.js:27"],
  ])("keeps analytics rejections nonfatal for %s", (_description, stack) => {
    const onClick = vi.fn();
    renderBoundary(
      <button type="button" onClick={onClick}>
        Healthy app
      </button>,
      "/overview",
    );
    const reason = new TypeError("Failed to fetch");
    reason.stack = stack;
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: reason });

    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(screen.getByRole("button", { name: "Healthy app" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Something went wrong" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open github issue/i }),
    ).not.toBeInTheDocument();
    expect(event.defaultPrevented).toBe(false);
    expect(errorToast.showErrorToast).not.toHaveBeenCalled();
    expect(reason.stack).toBe(stack);
  });

  it.each([
    [
      "application frames",
      "    at load (http://localhost:3000/src/app.tsx:10:2)",
    ],
    ["a missing stack", undefined],
    ["an empty stack", ""],
    [
      "extension-only frames",
      "    at fetch (chrome-extension://example-extension/content.js:12:34)",
    ],
    [
      "OpenPanel followed by an application frame",
      "    at P.post (https://openpanel.dev/op1.js:1:2)\n" +
        "    at load (http://localhost:3000/src/app.tsx:10:2)",
    ],
    [
      "an application frame followed by OpenPanel",
      "load@http://localhost:3000/src/app.tsx:10:2\n" +
        "P.post@https://openpanel.dev/op1.js:1:2",
    ],
    [
      "an unrelated script",
      "    at send (https://analytics.example/sdk.js:1:2)",
    ],
    [
      "a lookalike host",
      "    at send (https://openpanel.dev.evil.example/op1.js:1:2)",
    ],
    [
      "another OpenPanel path",
      "    at send (https://openpanel.dev/other.js:1:2)",
    ],
    ["an HTTP URL", "    at send (http://openpanel.dev/op1.js:1:2)"],
    ["a different port", "    at send (https://openpanel.dev:8080/op1.js:1:2)"],
    [
      "OpenPanel with an unknown frame",
      "    at P.post (https://openpanel.dev/op1.js:1:2)\n    unknown frame",
    ],
    [
      "OpenPanel with a native frame",
      "    at P.post (https://openpanel.dev/op1.js:1:2)\n    at fetch (native)",
    ],
    [
      "an unrecognized first line before OpenPanel",
      "unknown frame\n    at P.post (https://openpanel.dev/op1.js:1:2)",
    ],
    ["a bare URL without a frame", "https://openpanel.dev/op1.js:1:2"],
  ])("keeps rejections fatal for %s", async (_description, frames) => {
    renderBoundary(<div>Healthy app</div>, "/overview");
    const reason = new TypeError("Failed to fetch");
    reason.stack = frames ? `TypeError: Failed to fetch\n${frames}` : frames;
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: reason });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Healthy app")).not.toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
    expect(errorToast.showErrorToast).not.toHaveBeenCalled();
  });

  it("does not use an OpenPanel URL in the error message as provenance", async () => {
    renderBoundary(<div>Healthy app</div>, "/overview");
    const reason = new TypeError(
      "Failed to fetch https://openpanel.dev/op1.js",
    );
    reason.stack = `${reason.name}: ${reason.message}`;
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: reason });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    false,
    true,
  ])("keeps API errors recoverable with an OpenPanel stack: %s", async (withOpenPanelStack) => {
    renderBoundary(<div>Healthy app</div>, "/jobs/ready");
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;
    const reason = new ApiClientError("API request failed", { status: 500 });
    if (withOpenPanelStack) {
      reason.stack = "    at send (https://openpanel.dev/op1.js:1:2)";
    }
    Object.defineProperty(event, "reason", { value: reason });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.getByText("Healthy app")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Something went wrong" }),
    ).not.toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
    expect(errorToast.showErrorToast).toHaveBeenCalledWith(
      reason,
      "API request failed",
    );
  });

  it.each([
    null,
    "Failed to fetch https://openpanel.dev/op1.js",
    { stack: "    at send (https://openpanel.dev/op1.js:1:2)" },
  ])("keeps non-Error rejection %j fatal", async (reason) => {
    renderBoundary(<div>Healthy app</div>, "/overview");
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: reason });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
    expect(errorToast.showErrorToast).not.toHaveBeenCalled();
  });

  it("normalizes non-Error promise rejections safely", async () => {
    renderBoundary(<div>Healthy app</div>, "/overview");
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", {
      value: { message: "password=plain-object-secret failed" },
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(/password=\[redacted\]/)).toBeInTheDocument();
    expect(screen.queryByText(/plain-object-secret/)).not.toBeInTheDocument();
  });

  it("builds a sanitized GitHub issue link", () => {
    const snapshot = createFatalErrorSnapshot(
      new Error("apiKey='top-secret' exploded"),
      "runtime",
      {
        componentStack:
          "at Widget (password: hunter2 token=eyJaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc)",
        route: "/settings?tab=security",
      },
    );

    const url = buildFatalIssueUrl(snapshot);
    const issue = new URL(url);
    const decodedTitle = issue.searchParams.get("title") ?? "";
    const decodedBody = issue.searchParams.get("body") ?? "";
    const decoded = `${decodedTitle}\n${decodedBody}`;

    expect(url).toContain("https://github.com/DaKheera47/job-ops/issues/new");
    expect(decoded).toContain("apiKey='[redacted]");
    expect(decoded).toContain("password: [redacted]");
    expect(decoded).toContain("token=[redacted]");
    expect(decoded).not.toContain("top-secret");
    expect(decoded).not.toContain("hunter2");
  });

  it("classifies opaque cross-origin errors, but not real Error events", () => {
    expect(
      isOpaqueCrossOriginError(
        new ErrorEvent("error", { message: "Script error.", filename: "" }),
      ),
    ).toBe(true);
    expect(
      isOpaqueCrossOriginError(
        new ErrorEvent("error", {
          message: "anything",
          filename: "",
        }),
      ),
    ).toBe(true);
    expect(
      isOpaqueCrossOriginError(
        new ErrorEvent("error", {
          message: "Real failure",
          filename: "https://avasar.slotify.dev/app.js",
          error: new Error("Real failure"),
        }),
      ),
    ).toBe(false);
  });

  it("redacts long opaque values", () => {
    const longSecret = "a".repeat(100);

    expect(sanitizeCrashText(`secret=${longSecret}`)).toContain(
      "secret=[redacted]",
    );
    expect(sanitizeCrashText(`value ${longSecret}`)).toContain(
      "[redacted-long-value]",
    );
  });
});
