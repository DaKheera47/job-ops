import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppErrorBoundary,
  buildFatalIssueUrl,
  createFatalErrorSnapshot,
  FatalErrorScreen,
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
