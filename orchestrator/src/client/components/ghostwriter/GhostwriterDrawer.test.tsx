import { createJob } from "@shared/testing/factories.js";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GhostwriterDrawer } from "./GhostwriterDrawer";

const DISPLAY_MODE_STORAGE_KEY = "jobops.ghostwriter.display-mode.v1";

const panelLifecycle = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
}));

vi.mock("@/components/ui/sheet", async () => {
  const ReactModule = await import("react");

  type SheetContextValue = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  const SheetContext = ReactModule.createContext<SheetContextValue | null>(
    null,
  );

  const useSheetContext = () => {
    const context = ReactModule.useContext(SheetContext);
    if (!context) {
      throw new Error("Sheet components must be used within Sheet");
    }
    return context;
  };

  return {
    Sheet: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) => (
      <SheetContext.Provider value={{ open, onOpenChange }}>
        {children}
      </SheetContext.Provider>
    ),
    SheetTrigger: ({ children }: { children: React.ReactElement }) => {
      const { onOpenChange } = useSheetContext();
      return ReactModule.cloneElement(children, {
        onClick: () => onOpenChange(true),
      });
    },
    SheetClose: ({ children }: { children: React.ReactElement }) => {
      const { onOpenChange } = useSheetContext();
      return ReactModule.cloneElement(children, {
        onClick: () => onOpenChange(false),
      });
    },
    SheetContent: ({
      className,
      children,
    }: {
      className?: string;
      children: React.ReactNode;
    }) => {
      const { open } = useSheetContext();
      if (!open) return null;
      return (
        <div data-testid="sheet-content" className={className}>
          {children}
        </div>
      );
    },
    SheetHeader: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SheetTitle: ({ children }: { children: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    SheetDescription: ({ children }: { children: React.ReactNode }) => (
      <p>{children}</p>
    ),
  };
});

vi.mock("./GhostwriterPanel", async () => {
  const ReactModule = await import("react");
  return {
    GhostwriterPanel: () => {
      ReactModule.useEffect(() => {
        panelLifecycle.mounts += 1;
        return () => {
          panelLifecycle.unmounts += 1;
        };
      }, []);

      return <div data-testid="ghostwriter-panel">ghostwriter panel</div>;
    },
  };
});

const createMatchMedia = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

describe("GhostwriterDrawer", () => {
  beforeEach(() => {
    panelLifecycle.mounts = 0;
    panelLifecycle.unmounts = 0;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("opens in drawer mode by default when no preference exists", () => {
    window.matchMedia = createMatchMedia(true) as typeof window.matchMedia;

    render(<GhostwriterDrawer job={createJob()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ghostwriter" }));

    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("lg:w-[50vw]");
    expect(content.className).not.toContain("w-screen");
    expect(
      screen.getByRole("button", { name: "Open Ghostwriter pop-up" }),
    ).toBeInTheDocument();
  });

  it("restores fullscreen mode from localStorage on desktop", () => {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, "fullscreen");
    window.matchMedia = createMatchMedia(true) as typeof window.matchMedia;

    render(<GhostwriterDrawer job={createJob()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ghostwriter" }));

    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("w-screen");
    expect(content.className).toContain("max-w-none");
    expect(
      screen.getByRole("button", { name: "Restore Ghostwriter drawer" }),
    ).toBeInTheDocument();
  });

  it("toggles display mode on desktop and persists the new preference", () => {
    window.matchMedia = createMatchMedia(true) as typeof window.matchMedia;

    render(<GhostwriterDrawer job={createJob()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ghostwriter" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Open Ghostwriter pop-up" }),
    );
    expect(window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY)).toBe(
      "fullscreen",
    );
    expect(screen.getByTestId("sheet-content").className).toContain("w-screen");

    fireEvent.click(
      screen.getByRole("button", { name: "Restore Ghostwriter drawer" }),
    );
    expect(window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY)).toBe(
      "drawer",
    );
    expect(screen.getByTestId("sheet-content").className).toContain(
      "lg:w-[50vw]",
    );
  });

  it("hides mode toggle on mobile and keeps drawer layout", () => {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, "fullscreen");
    window.matchMedia = createMatchMedia(false) as typeof window.matchMedia;

    render(<GhostwriterDrawer job={createJob()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ghostwriter" }));

    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("lg:w-[50vw]");
    expect(content.className).not.toContain("w-screen");
    expect(
      screen.queryByRole("button", { name: "Open Ghostwriter pop-up" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Restore Ghostwriter drawer" }),
    ).not.toBeInTheDocument();
  });

  it("keeps GhostwriterPanel mounted while switching modes", () => {
    window.matchMedia = createMatchMedia(true) as typeof window.matchMedia;

    render(<GhostwriterDrawer job={createJob()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ghostwriter" }));

    expect(screen.getByTestId("ghostwriter-panel")).toBeInTheDocument();
    expect(panelLifecycle.mounts).toBe(1);
    expect(panelLifecycle.unmounts).toBe(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Open Ghostwriter pop-up" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Restore Ghostwriter drawer" }),
    );

    expect(screen.getByTestId("ghostwriter-panel")).toBeInTheDocument();
    expect(panelLifecycle.mounts).toBe(1);
    expect(panelLifecycle.unmounts).toBe(0);
  });
});
