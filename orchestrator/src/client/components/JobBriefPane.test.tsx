import { createJob } from "@shared/testing/factories.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobBriefPane } from "./JobBriefPane";

describe("JobBriefPane", () => {
  it("renders the UI-ready brief fields", () => {
    const job = createJob({
      suitabilityScore: 82,
      suitabilityReason: "Good fit because the stack matches.",
      jobBrief: JSON.stringify({
        role_summary: "Build internal workflow tools.",
        they_want: ["TypeScript", "React"],
        specifics: ["Node.js", "PostgreSQL"],
        company_offers: ["Mentorship"],
        practical_details: ["Salary: Not stated"],
        missing_or_unclear: ["Sponsorship not stated"],
        repeated_signals: ["Collaboration"],
      }),
    });

    render(<JobBriefPane job={job} />);

    expect(screen.getByText("Build internal workflow tools.")).toBeVisible();
    expect(screen.getByText("TypeScript")).toBeVisible();
    expect(screen.getByText("React")).toBeVisible();
    expect(screen.getByText("Node.js")).toBeVisible();
    expect(screen.getByText("PostgreSQL")).toBeVisible();
    expect(screen.getByText("Mentorship")).toBeVisible();
    expect(screen.queryByText("Salary: Not stated")).not.toBeInTheDocument();
    expect(screen.getByText("Sponsorship not stated")).toBeVisible();
    expect(screen.queryByText("Collaboration")).not.toBeInTheDocument();
  });

  it("falls back when the brief is missing", () => {
    render(
      <JobBriefPane
        job={createJob({
          jobBrief: null,
          suitabilityReason: "Fallback fit reason.",
        })}
      />,
    );

    expect(screen.getByText("Fallback fit reason.")).toBeVisible();
    expect(
      screen.getByText("Recalculate match to generate a concise JD brief."),
    ).toBeVisible();
  });

  it("does not render empty sections", () => {
    const job = createJob({
      jobBrief: JSON.stringify({
        role_summary: "Maintain data pipelines.",
        they_want: [],
        specifics: [],
        company_offers: [],
        practical_details: ["Location: London"],
        missing_or_unclear: [],
        repeated_signals: [],
      }),
    });

    render(<JobBriefPane job={job} />);

    expect(screen.getByText("Maintain data pipelines.")).toBeVisible();
    expect(screen.queryByText("They want")).not.toBeInTheDocument();
    expect(screen.queryByText("Highlights")).not.toBeInTheDocument();
    expect(screen.queryByText("Practical details")).not.toBeInTheDocument();
    expect(screen.queryByText("Location: London")).not.toBeInTheDocument();
  });
});
