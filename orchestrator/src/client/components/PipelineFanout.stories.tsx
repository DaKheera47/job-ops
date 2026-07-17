import type { Story } from "@ladle/react";
import { PIPELINE_EXTRACTOR_SOURCE_IDS, sourceLabel } from "@shared/extractors";
import type {
  PipelineFanoutProgress,
  PipelineFanoutRoleProgress,
  PipelinePendingChallenge,
  PipelineProgressState,
} from "@shared/types";
import { useEffect, useState } from "react";
import { PipelineProgressCard } from "./PipelineProgressCard";

const locations = [
  "Manchester",
  "London",
  "Leeds",
  "Birmingham",
  "Bristol",
  "Edinburgh",
  "Glasgow",
  "Liverpool",
  "Sheffield",
  "Remote",
];
const sources = [
  ...PIPELINE_EXTRACTOR_SOURCE_IDS.filter((source) => source === "linkedin"),
  ...PIPELINE_EXTRACTOR_SOURCE_IDS.filter((source) => source !== "linkedin"),
];

const baseRoles: PipelineFanoutRoleProgress[] = [
  { role: "Frontend Engineer", complete: 6, running: 2, check: 0, queued: 4 },
  { role: "Backend Engineer", complete: 6, running: 4, check: 0, queued: 2 },
  { role: "Platform Engineer", complete: 0, running: 1, check: 0, queued: 11 },
];

const absurdRoles: PipelineFanoutRoleProgress[] = [
  {
    role: "Frontend Engineer",
    complete: 70,
    running: 0,
    check: 0,
    queued: 0,
  },
  { role: "Backend Engineer", complete: 56, running: 14, check: 0, queued: 0 },
  { role: "Platform Engineer", complete: 42, running: 18, check: 1, queued: 9 },
  { role: "Staff Engineer", complete: 28, running: 12, check: 0, queued: 30 },
  { role: "DevOps Engineer", complete: 0, running: 0, check: 0, queued: 70 },
  { role: "Cloud Engineer", complete: 0, running: 0, check: 0, queued: 70 },
  {
    role: "Site Reliability Engineer",
    complete: 0,
    running: 0,
    check: 0,
    queued: 70,
  },
  {
    role: "Developer Experience Engineer",
    complete: 0,
    running: 0,
    check: 0,
    queued: 70,
  },
];

const baseFanout: PipelineFanoutProgress = {
  termCount: 3,
  locationCount: 4,
  sourceCount: 3,
  locations: locations.slice(0, 4),
  sources: sources.slice(0, 3),
  total: 36,
  capacity: 3,
  results: 299,
  unique: 214,
  roles: baseRoles,
};

const absurdFanout: PipelineFanoutProgress = {
  termCount: 8,
  locationCount: 10,
  sourceCount: 7,
  locations,
  sources: sources.slice(0, 7),
  total: 560,
  capacity: 3,
  results: 5824,
  unique: 3102,
  roles: absurdRoles,
};

const progressFixture: PipelineProgressState = {
  step: "importing",
  message: "Adding discovered jobs to your workspace…",
  detail: "Checking existing jobs and preserving your saved decisions.",
  crawlingSource: null,
  crawlingSourcesCompleted: 7,
  crawlingSourcesTotal: 7,
  crawlingTermsProcessed: 8,
  crawlingTermsTotal: 8,
  crawlingListPagesProcessed: 42,
  crawlingListPagesTotal: 42,
  crawlingJobCardsFound: 5824,
  crawlingJobPagesEnqueued: 3102,
  crawlingJobPagesSkipped: 0,
  crawlingJobPagesProcessed: 3102,
  jobsDiscovered: 3102,
  jobsScored: 0,
  jobsProcessed: 0,
  totalToProcess: 240,
};

const stageProgress = (
  step: PipelineProgressState["step"],
  message: string,
  overrides: Partial<PipelineProgressState> = {},
): PipelineProgressState => ({
  ...progressFixture,
  ...overrides,
  step,
  message,
});

const noop = () => {};
const FanoutStory = ({
  fanout,
  challenges,
}: {
  fanout: PipelineFanoutProgress;
  challenges?: PipelinePendingChallenge[];
}) => {
  const [combination, setCombination] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setCombination((current) => current + 1),
      1400,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  const source = sources[combination % fanout.sourceCount];
  const role = fanout.roles[combination % fanout.termCount]?.role
    .replace(/ engineer$/i, "")
    .toLowerCase();
  const location = locations[combination % fanout.locationCount]?.toLowerCase();

  return (
    <PipelineProgressCard
      progress={stageProgress(
        challenges ? "challenge_required" : "crawling",
        challenges
          ? "One job board needs a quick browser check."
          : "Searching across every configured combination…",
        { fanout, pendingChallenges: challenges },
      )}
      elapsedSeconds={134}
      currentCombination={`${source} × ${role} × ${location}`}
      solvingExtractor={null}
      onSolveChallenge={noop}
    />
  );
};

const browserChallenge: PipelinePendingChallenge = {
  extractorId: PIPELINE_EXTRACTOR_SOURCE_IDS[0],
  extractorName: sourceLabel(PIPELINE_EXTRACTOR_SOURCE_IDS[0]),
  url: "https://example.com/challenge",
  sources: [PIPELINE_EXTRACTOR_SOURCE_IDS[0]],
};

export const LiveFanout: Story = () => <FanoutStory fanout={baseFanout} />;
LiveFanout.storyName = "Live fanout · base";

export const AbsurdFanout: Story = () => <FanoutStory fanout={absurdFanout} />;
AbsurdFanout.storyName = "Live fanout · 560 combinations";

export const BrowserCheckNeeded: Story = () => (
  <FanoutStory fanout={absurdFanout} challenges={[browserChallenge]} />
);
BrowserCheckNeeded.storyName = "Browser check needed";

export const Connecting: Story = () => (
  <PipelineProgressCard
    progress={stageProgress("idle", "Connecting to pipeline progress…", {
      detail: undefined,
    })}
  />
);
Connecting.storyName = "Stage · connecting";

export const Importing: Story = () => (
  <PipelineProgressCard progress={progressFixture} elapsedSeconds={168} />
);
Importing.storyName = "Stage · importing";

export const Scoring: Story = () => (
  <PipelineProgressCard
    progress={stageProgress(
      "scoring",
      "Ranking discovered jobs against your profile…",
      {
        detail: "1,860 of 3,102 jobs scored.",
        jobsScored: 1860,
      },
    )}
    elapsedSeconds={246}
  />
);
Scoring.storyName = "Stage · scoring";

export const Processing: Story = () => (
  <PipelineProgressCard
    progress={stageProgress(
      "processing",
      "Preparing the strongest matches for review…",
      {
        detail: "Generating tailored application materials for 240 jobs.",
        jobsScored: 3102,
        jobsProcessed: 118,
      },
    )}
    elapsedSeconds={318}
  />
);
Processing.storyName = "Stage · processing";

export const Completed: Story = () => (
  <PipelineProgressCard
    progress={stageProgress("completed", "Your search finished successfully.", {
      detail: "3,102 unique jobs discovered and 240 applications prepared.",
      jobsScored: 3102,
      jobsProcessed: 240,
    })}
    elapsedSeconds={402}
  />
);
Completed.storyName = "Stage · complete";

export const Cancelled: Story = () => (
  <PipelineProgressCard
    progress={stageProgress(
      "cancelled",
      "Search stopped. Everything found so far has been kept.",
      {
        detail: "You can start another run whenever you are ready.",
        jobsScored: 1860,
      },
    )}
    elapsedSeconds={211}
  />
);
Cancelled.storyName = "Stage · cancelled";

export const Failed: Story = () => (
  <PipelineProgressCard
    progress={stageProgress("failed", "The pipeline could not continue.", {
      detail: "Jobs imported before the failure are still available.",
      error: "The scoring service stopped responding after several retries.",
      jobsScored: 1860,
    })}
    elapsedSeconds={211}
  />
);
Failed.storyName = "Stage · failed";

export const ConfigurationRequired: Story = () => (
  <PipelineProgressCard
    progress={stageProgress(
      "configuration_required",
      "Scoring is paused until an LLM provider is configured.",
      {
        detail: "Your discovered jobs are safe and ready to resume.",
        error: "Add an API key in Settings, then restart scoring.",
        jobsScored: 1860,
      },
    )}
    elapsedSeconds={211}
    onResumeScoring={noop}
  />
);
ConfigurationRequired.storyName = "Stage · configuration required";
