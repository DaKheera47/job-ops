import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { TriangleAlert } from "lucide-react";

export interface PipelineFanoutRoleProgress {
  check?: number;
  complete: number;
  queued: number;
  role: string;
  running: number;
}

export interface PipelineFanoutFixture {
  browserCheck?: { source: string };
  capacity: number;
  jobBoards: number;
  locations: number;
  results: number;
  roles: PipelineFanoutRoleProgress[];
  unique: number;
}

const getRoleTotal = (role: PipelineFanoutRoleProgress) =>
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

const RoleStatus = ({ role }: { role: PipelineFanoutRoleProgress }) => (
  <div className="flex flex-nowrap items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums">
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

const RoleRow = ({ role }: { role: PipelineFanoutRoleProgress }) => {
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

export const PipelineFanoutCard = ({
  fixture,
}: {
  fixture: PipelineFanoutFixture;
}) => {
  const combinations =
    fixture.roles.length * fixture.locations * fixture.jobBoards;
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
        <div className="flex flex-col gap-2">
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            Searching {combinations} combinations
            <span className="font-mono text-xs tabular-nums text-muted-foreground ml-3">
              (02:14 elapsed)
            </span>
          </CardTitle>
          <CardDescription className="text-base">
            <strong className="text-foreground">{fixture.roles.length}</strong>{" "}
            roles ×{" "}
            <strong className="text-foreground">{fixture.locations}</strong>{" "}
            locations ×{" "}
            <strong className="text-foreground">{fixture.jobBoards}</strong> job
            boards
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
          <div
            key={challenge.extractorId}
            className="flex items-center justify-between rounded-md border border-orange-500/20 bg-orange-500/10 p-3"
          >
            <div className="flex items-center gap-2 text-sm text-orange-400">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{challenge.extractorName}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
              disabled={solvingExtractor === challenge.extractorId}
              onClick={() => handleSolveChallenge(challenge.extractorId)}
            >
              {solvingExtractor === challenge.extractorId ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Solving…
                </>
              ) : (
                "Solve"
              )}
            </Button>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border">
          <div className="flex flex-col gap-1 border-b px-4 py-4">
            <h2 className="text-sm font-semibold">Progress by role</h2>
          </div>

          {visibleRoles.map((role) => (
            <RoleRow key={role.role} role={role} />
          ))}

          {remainingRoles.length > 0 ? (
            <Accordion type="single" collapsible>
              <AccordionItem value="queued-roles" className="border-b-0">
                <AccordionTrigger className="min-h-14 px-4 py-3 hover:bg-muted/30 hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-2 text-sm font-semibold">
                    <span>{remainingRoles.length} more roles queued</span>
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
    </Card>
  );
};
