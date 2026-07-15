import type { Story } from "@ladle/react";
import {
  EXTRACTOR_SOURCE_METADATA,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
  sourceLabel,
} from "@shared/extractors";
import { Radio, TriangleAlert } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface RoleProgress {
  check?: number;
  complete: number;
  queued: number;
  role: string;
  running: number;
}

interface FanoutFixture {
  browserCheck?: { source: string };
  capacity: number;
  jobBoards: number;
  locations: number;
  results: number;
  roles: RoleProgress[];
  unique: number;
}

const pipelineBoardLabels = [...PIPELINE_EXTRACTOR_SOURCE_IDS]
  .sort(
    (left, right) =>
      EXTRACTOR_SOURCE_METADATA[left].order -
      EXTRACTOR_SOURCE_METADATA[right].order,
  )
  .map(sourceLabel);

const baseRoles: RoleProgress[] = [
  { role: "Senior Engineer", complete: 6, running: 2, queued: 4 },
  { role: "Backend Engineer", complete: 6, running: 4, queued: 2 },
  { role: "Platform Engineer", complete: 0, running: 1, queued: 11 },
];

const absurdRoles: RoleProgress[] = [
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

const baseFixture: FanoutFixture = {
  roles: baseRoles,
  locations: 4,
  jobBoards: 3,
  results: 299,
  unique: 214,
  capacity: 7,
};

const absurdFixture: FanoutFixture = {
  roles: absurdRoles,
  locations: 10,
  jobBoards: 7,
  results: 5824,
  unique: 3102,
  capacity: 45,
};

const getRoleTotal = (role: RoleProgress) =>
  role.complete + role.running + (role.check ?? 0) + role.queued;

const formatNumber = (value: number) => value.toLocaleString("en-GB");

const Segment = ({
  className,
  count,
  total,
}: {
  className: string;
  count: number;
  total: number;
}) =>
  count > 0 ? (
    <span
      className={cn("h-full", className)}
      style={{ width: `${(count / total) * 100}%` }}
    />
  ) : null;

const RoleStatus = ({ role }: { role: RoleProgress }) => (
  <div className="flex flex-wrap items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums">
    {role.complete > 0 ? (
      <>
        <span className="font-semibold text-emerald-400">{role.complete}</span>
        <span className="font-sans text-muted-foreground">complete</span>
      </>
    ) : null}
    {role.running > 0 ? (
      <>
        <span className="font-semibold text-amber-400">{role.running}</span>
        <span className="font-sans text-muted-foreground">running</span>
      </>
    ) : null}
    {(role.check ?? 0) > 0 ? (
      <>
        <span className="font-semibold text-amber-300">{role.check}</span>
        <span className="font-sans text-muted-foreground">check</span>
      </>
    ) : null}
    {role.queued > 0 ? (
      <>
        <span className="font-semibold text-muted-foreground">
          {role.queued}
        </span>
        <span className="font-sans text-muted-foreground">queued</span>
      </>
    ) : null}
  </div>
);

const RoleRow = ({ role }: { role: RoleProgress }) => {
  const total = getRoleTotal(role);
  return (
    <div className="grid min-h-16 gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.6fr)_minmax(14rem,1.2fr)] sm:items-center">
      <span className="text-xs font-semibold">{role.role}</span>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${role.role}: ${role.complete} complete, ${role.running} running, ${role.check ?? 0} need a check, ${role.queued} queued`}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={role.complete}
      >
        <Segment
          className="bg-emerald-400"
          count={role.complete}
          total={total}
        />
        <Segment className="bg-amber-500" count={role.running} total={total} />
        <Segment
          className="bg-amber-300"
          count={role.check ?? 0}
          total={total}
        />
      </div>
      <RoleStatus role={role} />
    </div>
  );
};

const FanoutCard = ({ fixture }: { fixture: FanoutFixture }) => {
  const boardCount = Math.min(pipelineBoardLabels.length, fixture.jobBoards);
  const searchesPerRole = fixture.locations * boardCount;
  const combinations = fixture.roles.length * searchesPerRole;
  const complete = fixture.roles.reduce((sum, role) => sum + role.complete, 0);
  const checks = fixture.roles.reduce(
    (sum, role) => sum + (role.check ?? 0),
    0,
  );
  const running =
    checks + fixture.roles.reduce((sum, role) => sum + role.running, 0);
  const queued = fixture.roles.reduce((sum, role) => sum + role.queued, 0);
  const visibleRoles = fixture.roles.slice(0, 4);
  const remainingRoles = fixture.roles.slice(4);

  return (
    <Card className="w-full max-w-6xl overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="gap-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Pipeline fanout</span>
            <Badge
              variant="outline"
              className="gap-1.5 font-mono text-[10px] uppercase tracking-wider"
            >
              <Radio className="size-3 text-amber-400" />
              Live
            </Badge>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            02:14 elapsed
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            Searching {combinations} combinations
          </CardTitle>
          <CardDescription className="text-base">
            <strong className="text-foreground">{fixture.roles.length}</strong>{" "}
            roles ×{" "}
            <strong className="text-foreground">{fixture.locations}</strong>{" "}
            locations ×{" "}
            <strong className="text-foreground">{boardCount}</strong> job boards
          </CardDescription>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
              <span className="font-semibold text-emerald-400">{complete}</span>
              <span className="font-sans text-muted-foreground">complete</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-semibold text-amber-400">{running}</span>
              <span className="font-sans text-muted-foreground">running</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-semibold text-muted-foreground">
                {queued}
              </span>
              <span className="font-sans text-muted-foreground">queued</span>
            </div>
            <div className="flex items-baseline gap-2 font-mono text-xs tabular-nums">
              <span className="font-semibold">
                {formatNumber(fixture.results)}
              </span>
              <span className="font-sans text-muted-foreground">results</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-semibold">
                {formatNumber(fixture.unique)}
              </span>
              <span className="font-sans text-muted-foreground">unique</span>
            </div>
          </div>
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${complete} complete, ${running} running, ${queued} queued`}
            aria-valuemax={combinations}
            aria-valuemin={0}
            aria-valuenow={complete}
          >
            <Segment
              className="bg-emerald-400"
              count={complete}
              total={combinations}
            />
            <Segment
              className="bg-amber-500"
              count={running}
              total={combinations}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 border-t p-4 sm:p-5">
        {fixture.browserCheck ? (
          <Alert
            variant="warning"
            className="flex flex-col gap-3 pr-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <TriangleAlert />
            <div className="min-w-0 flex-1">
              <AlertTitle>
                {fixture.browserCheck.source} needs a quick browser check
              </AlertTitle>
              <AlertDescription>
                One search is paused. Everything else is still running.
              </AlertDescription>
            </div>
            <Button size="sm">Open now</Button>
          </Alert>
        ) : null}

        <section className="overflow-hidden rounded-xl border">
          <div className="flex flex-col gap-1 border-b px-4 py-4">
            <h2 className="text-sm font-semibold">Progress by role</h2>
            <p className="text-xs text-muted-foreground">
              A compact view of where the fanout has reached.
            </p>
          </div>

          {visibleRoles.map((role) => (
            <RoleRow key={role.role} role={role} />
          ))}

          {remainingRoles.length > 0 ? (
            <Accordion type="single" collapsible>
              <AccordionItem value="queued-roles" className="border-b-0">
                <AccordionTrigger className="min-h-14 px-4 py-3 hover:bg-muted/30 hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-2 font-normal">
                    <span>{remainingRoles.length} more roles queued</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatNumber(
                        remainingRoles.reduce(
                          (sum, role) => sum + getRoleTotal(role),
                          0,
                        ),
                      )}{" "}
                      searches
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-0">
                  {remainingRoles.map((role) => (
                    <RoleRow key={role.role} role={role} />
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
        </section>
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-4 border-t p-4 text-xs text-muted-foreground sm:px-5">
        <span>
          {fixture.capacity} searches run at once. Queued searches start
          automatically.
        </span>
        {fixture.browserCheck ? null : (
          <Button variant="outline" size="sm">
            Demo browser check
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

const StoryFrame = ({ fixture }: { fixture: FanoutFixture }) => (
  <main className="min-h-screen bg-background p-2 text-foreground sm:p-4">
    <FanoutCard fixture={fixture} />
  </main>
);

export const LiveFanout: Story = () => <StoryFrame fixture={baseFixture} />;
LiveFanout.storyName = "Live fanout · base";

export const AbsurdFanout: Story = () => <StoryFrame fixture={absurdFixture} />;
AbsurdFanout.storyName = "Live fanout · 560 combinations";

export const BrowserCheckNeeded: Story = () => (
  <StoryFrame
    fixture={{
      ...absurdFixture,
      browserCheck: { source: pipelineBoardLabels[0] ?? "Job board" },
    }}
  />
);
BrowserCheckNeeded.storyName = "Browser check needed";
