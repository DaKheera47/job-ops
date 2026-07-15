import type { Story } from "@ladle/react";
import {
  EXTRACTOR_SOURCE_METADATA,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
  sourceLabel,
} from "@shared/extractors";
import {
  PipelineFanoutCard,
  type PipelineFanoutFixture,
  type PipelineFanoutRoleProgress,
} from "./PipelineFanoutCard";

const pipelineBoardLabels = [...PIPELINE_EXTRACTOR_SOURCE_IDS]
  .sort(
    (left, right) =>
      EXTRACTOR_SOURCE_METADATA[left].order -
      EXTRACTOR_SOURCE_METADATA[right].order,
  )
  .map(sourceLabel);

const baseRoles: PipelineFanoutRoleProgress[] = [
  { role: "Senior Engineer", complete: 6, running: 2, queued: 4 },
  { role: "Backend Engineer", complete: 6, running: 4, queued: 2 },
  { role: "Platform Engineer", complete: 0, running: 1, queued: 11 },
];

const absurdRoles: PipelineFanoutRoleProgress[] = [
  {
    role: "Senior Software Engineer",
    complete: 70,
    running: 0,
    queued: 0,
  },
  { role: "Backend Engineer", complete: 56, running: 14, queued: 0 },
  {
    role: "Platform Engineer",
    complete: 42,
    running: 18,
    check: 1,
    queued: 9,
  },
  { role: "Staff Engineer", complete: 28, running: 12, queued: 30 },
  { role: "DevOps Engineer", complete: 0, running: 0, queued: 70 },
  { role: "Cloud Engineer", complete: 0, running: 0, queued: 70 },
  {
    role: "Site Reliability Engineer",
    complete: 0,
    running: 0,
    queued: 70,
  },
  {
    role: "Developer Experience Engineer",
    complete: 0,
    running: 0,
    queued: 70,
  },
];

const baseFixture: PipelineFanoutFixture = {
  roles: baseRoles,
  locations: 4,
  jobBoards: 3,
  results: 299,
  unique: 214,
  capacity: 7,
};

const absurdFixture: PipelineFanoutFixture = {
  roles: absurdRoles,
  locations: 10,
  jobBoards: 7,
  results: 5824,
  unique: 3102,
  capacity: 45,
};

export const LiveFanout: Story = () => (
  <PipelineFanoutCard fixture={baseFixture} />
);
LiveFanout.storyName = "Live fanout · base";

export const AbsurdFanout: Story = () => (
  <PipelineFanoutCard fixture={absurdFixture} />
);
AbsurdFanout.storyName = "Live fanout · 560 combinations";

export const BrowserCheckNeeded: Story = () => (
  <PipelineFanoutCard
    fixture={{
      ...absurdFixture,
      browserCheck: { source: pipelineBoardLabels[0] ?? "Job board" },
    }}
  />
);
BrowserCheckNeeded.storyName = "Browser check needed";
