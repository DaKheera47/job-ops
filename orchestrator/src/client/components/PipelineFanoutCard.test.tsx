import type { PipelineFanoutProgress } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PipelineFanoutCard } from "./PipelineFanoutCard";

vi.mock("framer-motion", () => ({ useReducedMotion: () => false }));

const fanout: PipelineFanoutProgress = {
  termCount: 5,
  locationCount: 2,
  sourceCount: 3,
  locations: ["Manchester", "London"],
  sources: ["linkedin", "indeed", "glassdoor"],
  total: 15,
  capacity: 3,
  results: 20,
  unique: 12,
  roles: ["One", "Two", "Three", "Four", "Five"].map((role) => ({
    role,
    complete: 1,
    running: 1,
    queued: 1,
    check: 0,
  })),
};

describe("PipelineFanoutCard", () => {
  it("rolls each part of the live combination independently", () => {
    render(
      <PipelineFanoutCard
        fanout={fanout}
        elapsedSeconds={134}
        currentCombination="linkedin · frontend · edinburgh"
        solvingExtractor={null}
        onSolveChallenge={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Searching frontend in edinburgh on linkedin"),
    ).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("keeps active roles visible and groups queued and done roles", () => {
    render(
      <PipelineFanoutCard
        fanout={{
          ...fanout,
          roles: [
            { role: "Active", complete: 1, running: 1, queued: 1, check: 0 },
            { role: "Queued", complete: 0, running: 0, queued: 3, check: 0 },
            { role: "Done", complete: 3, running: 0, queued: 0, check: 0 },
          ],
        }}
        elapsedSeconds={134}
        solvingExtractor={null}
        onSolveChallenge={vi.fn()}
      />,
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Queued")).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "1 role queued" }));
    fireEvent.click(screen.getByRole("button", { name: "1 role done" }));

    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("delegates browser challenge solving", () => {
    const onSolveChallenge = vi.fn();
    render(
      <PipelineFanoutCard
        fanout={fanout}
        elapsedSeconds={0}
        challenges={[
          {
            extractorId: "gradcracker",
            extractorName: "Gradcracker",
            url: "https://example.com/challenge",
            sources: ["gradcracker"],
          },
        ]}
        solvingExtractor={null}
        onSolveChallenge={onSolveChallenge}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Solve" }));
    expect(onSolveChallenge).toHaveBeenCalledWith("gradcracker");
  });

  it("keeps every busy-role status in the responsive row", () => {
    render(
      <PipelineFanoutCard
        fanout={{
          ...fanout,
          roles: [{ ...fanout.roles[0], check: 1 }, ...fanout.roles.slice(1)],
        }}
        elapsedSeconds={0}
        solvingExtractor={null}
        onSolveChallenge={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("progressbar", {
        name: "One: 1 complete, 1 running, 1 need a check, 1 queued",
      }),
    ).toBeInTheDocument();
  });
});
