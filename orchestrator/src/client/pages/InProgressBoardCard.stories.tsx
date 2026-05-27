import type { Story } from "@ladle/react";
import type { ApplicationStage, JobListItem } from "@shared/types.js";
import React from "react";
import {
  InProgressBoardCard,
  type InProgressBoardCardProps,
} from "./InProgressBoardCard";

const JOB_PAGE_LINK_STATE = { jobPageBackTo: "/applications/in-progress" };

const LATEST_EVENT_AT = Math.floor(
  Date.parse("2026-05-20T14:30:00.000Z") / 1000,
);

const makeJob = (overrides: Partial<JobListItem> = {}): JobListItem => ({
  id: "job-1",
  source: "manual",
  sourceJobId: null,
  title: "Backend Engineer",
  employer: "Acme",
  jobUrl: "https://example.com/jobs/1",
  applicationLink: null,
  datePosted: null,
  deadline: null,
  salary: null,
  location: "London, UK",
  status: "in_progress",
  outcome: null,
  closedAt: null,
  suitabilityScore: 82,
  sponsorMatchScore: null,
  appliedDuplicateMatch: null,
  jobType: null,
  jobFunction: null,
  pdfRegenerating: false,
  pdfFreshness: "missing",
  salaryMinAmount: null,
  salaryMaxAmount: null,
  salaryCurrency: null,
  discoveredAt: "2026-01-01T00:00:00.000Z",
  readyAt: null,
  appliedAt: null,
  updatedAt: "2026-05-20T00:00:00.000Z",
  ...overrides,
});

/** Mirrors `getCardLeftAccentClass` in InProgressBoardPage (kept here to avoid touching that file). */
const cardAccentClass = (stage: ApplicationStage) => {
  if (stage === "technical_interview") {
    return "border-l-2 border-l-amber-400/45";
  }
  if (stage === "onsite") {
    return "border-l-2 border-l-amber-400/65";
  }
  if (stage === "offer") {
    return "border-2 border-amber-300/50 shadow-[0_4px_12px_-4px_rgba(251,191,36,0.7)]";
  }
  return "";
};

const noopDrag = () => {};

const BoardCardFrame: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="w-[296px] space-y-2">
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    {children}
  </div>
);

const InteractiveBoardCard: React.FC<
  Omit<InProgressBoardCardProps, "onLogEvent" | "onDragStart" | "onDragEnd">
> = (props) => {
  const [lastAction, setLastAction] = React.useState<string | null>(null);

  return (
    <div className="space-y-2">
      <InProgressBoardCard
        {...props}
        onDragStart={noopDrag}
        onDragEnd={noopDrag}
        onLogEvent={() =>
          setLastAction(`Log event · ${props.job.title} (${props.stage})`)
        }
      />
      {lastAction ? (
        <p className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
          {lastAction}
        </p>
      ) : null}
    </div>
  );
};

const baseCardProps = {
  job: makeJob(),
  stage: "recruiter_screen" as const,
  latestEventAt: LATEST_EVENT_AT,
  jobPageLinkState: JOB_PAGE_LINK_STATE,
  isMoving: false,
};

export const RecruiterScreen: Story = () => (
  <BoardCardFrame label="Recruiter screen">
    <InteractiveBoardCard {...baseCardProps} />
  </BoardCardFrame>
);
RecruiterScreen.storyName = "Recruiter screen";

export const NoStageEvents: Story = () => (
  <BoardCardFrame label="No stage events">
    <InteractiveBoardCard {...baseCardProps} latestEventAt={null} />
  </BoardCardFrame>
);
NoStageEvents.storyName = "No stage events";

export const TechnicalInterview: Story = () => (
  <BoardCardFrame label="Technical interview accent">
    <InteractiveBoardCard
      {...baseCardProps}
      stage="technical_interview"
      cardClassName={cardAccentClass("technical_interview")}
    />
  </BoardCardFrame>
);
TechnicalInterview.storyName = "Technical interview";

export const FinalRound: Story = () => (
  <BoardCardFrame label="Final round accent">
    <InteractiveBoardCard
      {...baseCardProps}
      stage="onsite"
      cardClassName={cardAccentClass("onsite")}
    />
  </BoardCardFrame>
);
FinalRound.storyName = "Final round";

export const Offer: Story = () => (
  <BoardCardFrame label="Offer accent">
    <InteractiveBoardCard
      {...baseCardProps}
      stage="offer"
      job={makeJob({ title: "Staff Platform Engineer" })}
      cardClassName={cardAccentClass("offer")}
    />
  </BoardCardFrame>
);
Offer.storyName = "Offer";

export const ClosedRejected: Story = () => (
  <BoardCardFrame label="Closed · rejected (log event disabled)">
    <InteractiveBoardCard
      {...baseCardProps}
      stage="closed"
      job={makeJob({ outcome: "rejected" })}
    />
  </BoardCardFrame>
);
ClosedRejected.storyName = "Closed · rejected";

export const ClosedWithdrawn: Story = () => (
  <BoardCardFrame label="Closed · withdrawn (log event disabled)">
    <InteractiveBoardCard
      {...baseCardProps}
      stage="closed"
      job={makeJob({
        title: "Product Designer",
        employer: "Northwind",
        outcome: "withdrawn",
      })}
    />
  </BoardCardFrame>
);
ClosedWithdrawn.storyName = "Closed · withdrawn";

export const Moving: Story = () => (
  <BoardCardFrame label="Moving (drag in progress)">
    <InteractiveBoardCard {...baseCardProps} isMoving />
  </BoardCardFrame>
);
Moving.storyName = "Moving";

export const LongTitle: Story = () => (
  <BoardCardFrame label="Long title">
    <InteractiveBoardCard
      {...baseCardProps}
      job={makeJob({
        title:
          "Senior Staff Software Engineer, Developer Productivity and Internal Platforms",
        employer: "Very Long Company Name International Holdings Ltd",
      })}
    />
  </BoardCardFrame>
);
LongTitle.storyName = "Long title";

export const AllStates: Story = () => (
  <div className="flex flex-wrap gap-6">
    <BoardCardFrame label="Recruiter screen">
      <InteractiveBoardCard {...baseCardProps} />
    </BoardCardFrame>
    <BoardCardFrame label="No events">
      <InteractiveBoardCard {...baseCardProps} latestEventAt={null} />
    </BoardCardFrame>
    <BoardCardFrame label="Technical interview">
      <InteractiveBoardCard
        {...baseCardProps}
        stage="technical_interview"
        cardClassName={cardAccentClass("technical_interview")}
      />
    </BoardCardFrame>
    <BoardCardFrame label="Offer">
      <InteractiveBoardCard
        {...baseCardProps}
        stage="offer"
        cardClassName={cardAccentClass("offer")}
      />
    </BoardCardFrame>
    <BoardCardFrame label="Closed">
      <InteractiveBoardCard
        {...baseCardProps}
        stage="closed"
        job={makeJob({ outcome: "rejected" })}
      />
    </BoardCardFrame>
    <BoardCardFrame label="Moving">
      <InteractiveBoardCard {...baseCardProps} isMoving />
    </BoardCardFrame>
  </div>
);
AllStates.storyName = "All states";
