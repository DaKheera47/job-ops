import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInPage } from "./SignInPage";

vi.mock("@client/api", () => ({
  hasAuthenticatedSession: vi.fn(() => false),
  restoreAuthSessionFromLegacyCredentials: vi.fn(async () => false),
  signInWithCredentials: vi.fn(async () => undefined),
}));

import {
  hasAuthenticatedSession,
  restoreAuthSessionFromLegacyCredentials,
  signInWithCredentials,
} from "@client/api";

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasAuthenticatedSession).mockReturnValue(false);
    vi.mocked(restoreAuthSessionFromLegacyCredentials).mockResolvedValue(false);
    vi.mocked(signInWithCredentials).mockResolvedValue(undefined);
  });

  it("signs in and returns to the requested next route", async () => {
    render(
      <MemoryRouter initialEntries={["/sign-in?next=%2Fjobs%2Fready"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/jobs/ready" element={<div>ready-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(restoreAuthSessionFromLegacyCredentials).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signInWithCredentials).toHaveBeenCalledWith("admin", "secret");
      expect(screen.getByText("ready-page")).toBeInTheDocument();
    });
  });
});
