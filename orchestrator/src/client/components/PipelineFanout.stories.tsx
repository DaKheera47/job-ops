import type { Story } from "@ladle/react";
import {
  EXTRACTOR_SOURCE_METADATA,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
  sourceLabel,
} from "@shared/extractors";
import { Check, Circle, Clock3, Loader2, MapPin, Radio } from "lucide-react";
import type { CSSProperties } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type SearchState = "complete" | "running" | "queued";

interface BoardRun {
  board: string;
  jobs?: number;
  state: SearchState;
}

interface LocationRun {
  boards: BoardRun[];
  location: string;
}

interface TermRun {
  locations: LocationRun[];
  term: string;
}

const pipelineBoardLabels = [...PIPELINE_EXTRACTOR_SOURCE_IDS]
  .sort(
    (left, right) =>
      EXTRACTOR_SOURCE_METADATA[left].order -
      EXTRACTOR_SOURCE_METADATA[right].order,
  )
  .map(sourceLabel);

const baseFanoutFixture: TermRun[] = [
  {
    term: "Senior Engineer",
    locations: [
      {
        location: "London",
        boards: [
          { board: "LinkedIn", state: "complete", jobs: 42 },
          { board: "Indeed", state: "complete", jobs: 31 },
          { board: "Reed", state: "running" },
        ],
      },
      {
        location: "Manchester",
        boards: [
          { board: "LinkedIn", state: "complete", jobs: 18 },
          { board: "Indeed", state: "running" },
          { board: "Reed", state: "queued" },
        ],
      },
      {
        location: "Bristol",
        boards: [
          { board: "LinkedIn", state: "queued" },
          { board: "Indeed", state: "queued" },
          { board: "Reed", state: "queued" },
        ],
      },
      {
        location: "Remote",
        boards: [
          { board: "LinkedIn", state: "complete", jobs: 55 },
          { board: "Indeed", state: "complete", jobs: 24 },
          { board: "Reed", state: "complete", jobs: 14 },
        ],
      },
    ],
  },
  {
    term: "Backend Engineer",
    locations: [
      {
        location: "London",
        boards: [
          { board: "LinkedIn", state: "running" },
          { board: "Indeed", state: "queued" },
          { board: "Reed", state: "queued" },
        ],
      },
      {
        location: "Manchester",
        boards: [
          { board: "LinkedIn", state: "complete", jobs: 21 },
          { board: "Indeed", state: "complete", jobs: 17 },
          { board: "Reed", state: "running" },
        ],
      },
      {
        location: "Bristol",
        boards: [
          { board: "LinkedIn", state: "complete", jobs: 16 },
          { board: "Indeed", state: "running" },
          { board: "Reed", state: "queued" },
        ],
      },
      {
        location: "Remote",
        boards: [
          { board: "LinkedIn", state: "complete", jobs: 33 },
          { board: "Indeed", state: "complete", jobs: 19 },
          { board: "Reed", state: "complete", jobs: 9 },
        ],
      },
    ],
  },
  {
    term: "Platform Engineer",
    locations: [
      {
        location: "London",
        boards: [
          { board: "LinkedIn", state: "running" },
          { board: "Indeed", state: "queued" },
          { board: "Reed", state: "queued" },
        ],
      },
      ...["Manchester", "Bristol", "Remote"].map((location) => ({
        location,
        boards: ["LinkedIn", "Indeed", "Reed"].map((board) => ({
          board,
          state: "queued" as const,
        })),
      })),
    ],
  },
];

const baseBoards = pipelineBoardLabels.slice(0, 3);
const baseFanout = baseFanoutFixture.map((term) => ({
  ...term,
  locations: term.locations.map((location) => ({
    ...location,
    boards: location.boards.map((board, index) => ({
      ...board,
      board: baseBoards[index] ?? board.board,
    })),
  })),
}));

const absurdTerms = [
  "Senior Software Engineer",
  "Backend Engineer",
  "Platform Engineer",
  "Staff Engineer",
  "DevOps Engineer",
  "Cloud Engineer",
  "Site Reliability Engineer",
  "Developer Experience Engineer",
];
const absurdLocations = [
  "London",
  "Manchester",
  "Bristol",
  "Edinburgh",
  "Glasgow",
  "Leeds",
  "Birmingham",
  "Cambridge",
  "Oxford",
  "Remote",
];
const absurdBoards = pipelineBoardLabels.slice(0, 7);
const absurdFanout: TermRun[] = absurdTerms.map((term, termIndex) => ({
  term,
  locations: absurdLocations.map((location, locationIndex) => ({
    location,
    boards: absurdBoards.map((board, boardIndex) => {
      const index =
        termIndex * absurdLocations.length * absurdBoards.length +
        locationIndex * absurdBoards.length +
        boardIndex;
      const state: SearchState =
        index < 196 ? "complete" : index < 241 ? "running" : "queued";
      return {
        board,
        state,
        jobs: state === "complete" ? 8 + ((index * 7) % 49) : undefined,
      };
    }),
  })),
}));

const stateMeta = {
  complete: {
    icon: Check,
    label: "Complete",
    className: "text-emerald-400",
  },
  running: {
    icon: Loader2,
    label: "Running",
    className: "text-amber-400",
  },
  queued: {
    icon: Circle,
    label: "Queued",
    className: "text-muted-foreground/50",
  },
} satisfies Record<
  SearchState,
  { className: string; icon: typeof Check; label: string }
>;

type StateCounts = Record<SearchState, number>;

const getFanoutStats = (data: TermRun[]) => {
  const runs = data.flatMap((term) =>
    term.locations.flatMap((location) => location.boards),
  );
  const counts: StateCounts = { complete: 0, running: 0, queued: 0 };
  let jobs = 0;
  for (const run of runs) {
    counts[run.state] += 1;
    jobs += run.jobs ?? 0;
  }
  return { counts, jobs, runs };
};

const StatusIcon = ({ state }: { state: SearchState }) => {
  const { className, icon: Icon, label } = stateMeta[state];
  return (
    <Icon
      aria-label={label}
      className={cn("size-3.5 shrink-0", className, {
        "animate-spin": state === "running",
      })}
    />
  );
};

const StatusSummary = ({ counts }: { counts: StateCounts }) => (
  <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums sm:justify-end">
    <span className="text-emerald-400">{counts.complete}</span>
    <span className="font-sans text-muted-foreground">complete</span>
    <span className="text-muted-foreground/50">·</span>
    <span className="text-amber-400">{counts.running}</span>
    <span className="font-sans text-muted-foreground">running</span>
    <span className="text-muted-foreground/50">·</span>
    <span className="text-muted-foreground">{counts.queued}</span>
    <span className="font-sans text-muted-foreground">queued</span>
  </div>
);

interface FanoutCardProps {
  data: TermRun[];
  results: number;
  unique: number;
}

const FanoutCard = ({ data, results, unique }: FanoutCardProps) => {
  const { counts, jobs, runs } = getFanoutStats(data);
  const locations = data[0]?.locations.length ?? 0;
  const boardNames =
    data[0]?.locations[0]?.boards.map((board) => board.board) ?? [];
  const jobBoards = boardNames.length;
  const combinations = runs.length;

  return (
    <Card className="w-full max-w-6xl overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="gap-6 p-5 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Pipeline fanout</span>
            <Badge
              variant="outline"
              className="gap-1.5 font-mono text-[10px] uppercase tracking-wider"
            >
              <Radio className="size-3 text-amber-400" />
              Live
            </Badge>
          </div>
          <div className="font-mono text-xs tabular-nums text-muted-foreground">
            02:14 elapsed
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            Searching {combinations} combinations
          </CardTitle>
          <CardDescription className="text-base">
            {data.length} roles × {locations} locations × {jobBoards} job boards
          </CardDescription>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <StatusSummary counts={counts} />
            <div className="flex items-baseline gap-2 font-mono text-sm tabular-nums">
              <span className="font-semibold text-foreground">{results}</span>
              <span className="font-sans text-muted-foreground">results</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-semibold text-foreground">{unique}</span>
              <span className="font-sans text-muted-foreground">unique</span>
            </div>
          </div>
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${counts.complete} complete, ${counts.running} running, ${counts.queued} queued`}
            aria-valuemax={combinations}
            aria-valuemin={0}
            aria-valuenow={counts.complete}
          >
            <div
              className="bg-emerald-500"
              style={{ width: `${(counts.complete / combinations) * 100}%` }}
            />
            <div
              className="bg-amber-500"
              style={{ width: `${(counts.running / combinations) * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(["complete", "running", "queued"] as const).map((state) => (
              <div key={state} className="flex items-center gap-2 text-xs">
                <StatusIcon state={state} />
                <span className="text-muted-foreground">
                  {stateMeta[state].label} ({counts[state]})
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div
          className="hidden gap-2 overflow-x-auto border-y bg-muted/20 px-6 py-3 text-xs font-medium text-muted-foreground sm:grid sm:[grid-template-columns:var(--fanout-columns)]"
          style={
            {
              "--fanout-columns": `minmax(12rem, 1fr) repeat(${jobBoards}, minmax(7rem, .8fr))`,
            } as CSSProperties
          }
        >
          <span>Location</span>
          {boardNames.map((board) => (
            <span key={board}>{board}</span>
          ))}
        </div>

        <Accordion type="multiple" defaultValue={[data[0].term]}>
          {data.map((term) => {
            const termRuns = term.locations.flatMap(
              (location) => location.boards,
            );
            const termComplete = termRuns.filter(
              (run) => run.state === "complete",
            ).length;
            const termCounts = {
              complete: termComplete,
              running: termRuns.filter((run) => run.state === "running").length,
              queued: termRuns.filter((run) => run.state === "queued").length,
            };

            return (
              <AccordionItem key={term.term} value={term.term}>
                <AccordionTrigger className="min-h-16 gap-4 px-4 py-3 text-left hover:bg-muted/30 hover:no-underline sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="truncate">{term.term}</span>
                    <StatusSummary counts={termCounts} />
                  </span>
                </AccordionTrigger>

                <AccordionContent className="pb-4">
                  <div className="mx-4 overflow-hidden rounded-lg border bg-muted/10 sm:mx-6">
                    {term.locations.map((location) => (
                      <div
                        key={location.location}
                        className="grid grid-cols-1 gap-3 border-b px-4 py-3 text-xs last:border-b-0 sm:items-center sm:[grid-template-columns:var(--fanout-columns)]"
                        style={
                          {
                            "--fanout-columns": `minmax(10rem, 1fr) repeat(${jobBoards}, minmax(7rem, .8fr))`,
                          } as CSSProperties
                        }
                      >
                        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" />
                          <span className="truncate">{location.location}</span>
                        </div>
                        {location.boards.map((board) => (
                          <div
                            key={board.board}
                            className="flex min-w-0 items-center gap-1.5 font-mono tabular-nums"
                            title={`${board.board}: ${stateMeta[board.state].label}`}
                          >
                            <StatusIcon state={board.state} />
                            <span className="text-muted-foreground sm:hidden">
                              {board.board}
                            </span>
                            <span className="truncate text-muted-foreground">
                              {board.jobs === undefined
                                ? stateMeta[board.state].label
                                : `${board.jobs} jobs`}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>

      <Separator />

      <CardFooter className="flex gap-2 p-4 text-xs text-muted-foreground sm:px-6">
        <Clock3 className="size-3.5 shrink-0" />
        <span>
          Live branch results: {jobs} found so far, before deduplication.
        </span>
      </CardFooter>
    </Card>
  );
};

export const LiveFanout: Story = () => (
  <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
    <FanoutCard data={baseFanout} results={299} unique={214} />
  </main>
);

LiveFanout.storyName = "Live fanout";

export const AbsurdFanout: Story = () => (
  <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
    <FanoutCard data={absurdFanout} results={5824} unique={3102} />
  </main>
);

AbsurdFanout.storyName = "Absurd fanout · 560 combinations";
