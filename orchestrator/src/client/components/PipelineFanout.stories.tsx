import type { Story } from "@ladle/react";
import { PIPELINE_EXTRACTOR_SOURCE_IDS, sourceLabel } from "@shared/extractors";
import type {
  PipelineFanoutProgress,
  PipelineFanoutRoleProgress,
  PipelinePendingChallenge,
} from "@shared/types";
import { useEffect, useState } from "react";
import { PipelineFanoutCard } from "./PipelineFanoutCard";

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
  total: 560,
  capacity: 3,
  results: 5824,
  unique: 3102,
  roles: absurdRoles,
};

const noop = () => {};
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
    <PipelineFanoutCard
      fanout={fanout}
      elapsedSeconds={134}
      currentCombination={`${source} × ${role} × ${location}`}
      challenges={challenges}
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
