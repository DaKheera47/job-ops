import type { VisaSponsorStatusResponse } from "@shared/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { VisaSponsorsPage } from "./VisaSponsorsPage";

vi.mock("../api", () => ({
  getVisaSponsorStatus: vi.fn(),
  searchVisaSponsors: vi.fn(),
  getVisaSponsorOrganization: vi.fn(),
  updateVisaSponsorList: vi.fn(),
}));

vi.mock("../hooks/useVersionCheck", () => ({
  useVersionCheck: () => ({
    version: "v0.10.0",
    updateAvailable: false,
    latestVersion: null,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const status: VisaSponsorStatusResponse = {
  providers: [
    {
      providerId: "uk",
      countryKey: "united kingdom",
      lastUpdated: null,
      csvPath: null,
      totalSponsors: 0,
      isUpdating: false,
      nextScheduledUpdate: null,
      error: null,
    },
  ],
};

const renderPage = () =>
  renderWithQueryClient(
    <MemoryRouter initialEntries={["/visa-sponsors"]}>
      <VisaSponsorsPage />
    </MemoryRouter>,
  );

const installMatchMediaMock = () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe("VisaSponsorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMatchMediaMock();
    vi.mocked(api.getVisaSponsorStatus).mockResolvedValue(status);
    vi.mocked(api.searchVisaSponsors).mockResolvedValue({
      results: [],
      query: "",
      total: 0,
    });
    vi.mocked(api.getVisaSponsorOrganization).mockResolvedValue([]);
  });

  it("shows an error toast without crashing when sponsor list update fails", async () => {
    vi.mocked(api.updateVisaSponsorList).mockRejectedValue(
      new Error(
        "Could not find Worker and Temporary Worker CSV link on gov.uk page",
      ),
    );

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /update sponsor list/i }),
    );

    await waitFor(() => {
      expect(api.updateVisaSponsorList).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Could not find Worker and Temporary Worker CSV link on gov.uk page",
      );
    });
    expect(screen.getByText("Visa Sponsors")).toBeInTheDocument();
  });
});
