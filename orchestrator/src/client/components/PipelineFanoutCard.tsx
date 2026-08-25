import NumberFlow from "@number-flow/react";
import type {
  PipelineFanoutProgress,
  PipelineFanoutRoleProgress,
  PipelinePendingChallenge,
} from "@shared/types";
import { useReducedMotion } from "framer-motion";
import "slot-text/style.css";
import { SlotText } from "slot-text/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PipelineActionRequired } from "./PipelineActionRequired";

const getRoleTotal = (role: PipelineFanoutRoleProgress) =>
  role.complete + role.running + role.check + role.queued;

const combinationSlotOptions = {
  direction: "up" as const,
  stagger: 16,
  duration: 220,
  bounce: 0,
  skipUnchanged: false,
  interrupt: false,
};

const LiveSearchTitle = ({ text }: { text: string }) => {
  const prefersReducedMotion = useReducedMotion();
  const [source = "", role = "", location = ""] = text.split(" · ");
  const label = `Searching ${source} for “${role}” in ${location}`;

  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="contents">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span>Searching</span>
          {prefersReducedMotion ? (
            <span className="inline-block font-bold">{source}</span>
          ) : (
            <SlotText
              className="inline-block font-bold"
              text={source}
              options={combinationSlotOptions}
            />
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span>for</span>
          {prefersReducedMotion ? (
            <span className="inline-block font-bold">“{role}”</span>
          ) : (
            <span className="inline-block font-bold">
              “<SlotText text={role} options={combinationSlotOptions} />”
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span>in</span>
          {prefersReducedMotion ? (
            <span className="inline-block font-bold">{location}</span>
          ) : (
            <SlotText
              className="inline-block font-bold"
              text={location}
              options={combinationSlotOptions}
            />
          )}
        </span>
      </span>
    </span>
  );
};

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
  <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums @lg/fanout:justify-end">
    {role.complete > 0 ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-semibold text-emerald-400">{role.complete}</span>
        <span className="font-sans text-muted-foreground">complete</span>
      </span>
    ) : null}
    {role.running > 0 ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-semibold text-amber-400">{role.running}</span>
        <span className="font-sans text-muted-foreground">running</span>
      </span>
    ) : null}
    {role.check > 0 ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-semibold text-amber-300">{role.check}</span>
        <span className="font-sans text-muted-foreground">check</span>
      </span>
    ) : null}
    {role.queued > 0 ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-semibold text-muted-foreground">
          {role.queued}
        </span>
        <span className="font-sans text-muted-foreground">queued</span>
      </span>
    ) : null}
  </div>
);

const RoleRow = ({ role }: { role: PipelineFanoutRoleProgress }) => {
  const total = getRoleTotal(role);
  return (
    <div className="flex min-h-20 flex-col gap-3 border-b px-4 py-4 last:border-b-0">
      <div className="flex flex-col gap-2 @lg/fanout:flex-row @lg/fanout:items-center @lg/fanout:justify-between">
        <span className="text-xs font-semibold">{role.role}</span>
        <RoleStatus role={role} />
      </div>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${role.role}: ${role.complete} complete, ${role.running} running, ${role.check} need a check, ${role.queued} queued`}
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
        <Segment className="bg-amber-300" count={role.check} total={total} />
      </div>
    </div>
  );
};

export interface PipelineFanoutCardProps {
  fanout: PipelineFanoutProgress;
  elapsedSeconds: number;
  currentCombination?: string;
  challenges?: PipelinePendingChallenge[];
  solvingExtractor: string | null;
  onSolveChallenge: (extractorId: string) => void;
}

const formatElapsed = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export const PipelineFanoutCard = ({
  fanout,
  elapsedSeconds,
  currentCombination,
  challenges = [],
  solvingExtractor,
  onSolveChallenge,
}: PipelineFanoutCardProps) => {
  const complete = fanout.roles.reduce((sum, role) => sum + role.complete, 0);
  const checks = fanout.roles.reduce((sum, role) => sum + role.check, 0);
  const running =
    checks + fanout.roles.reduce((sum, role) => sum + role.running, 0);
  const queued = fanout.roles.reduce((sum, role) => sum + role.queued, 0);
  const doneRoles = fanout.roles.filter(
    (role) => role.complete === getRoleTotal(role),
  );
  const queuedRoles = fanout.roles.filter(
    (role) => role.queued === getRoleTotal(role),
  );
  const activeRoles = fanout.roles.filter(
    (role) => !doneRoles.includes(role) && !queuedRoles.includes(role),
  );

  return (
    <Card className="@container/fanout w-full max-w-6xl overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="gap-5 p-4 @lg/fanout:p-6 @3xl/fanout:p-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 @lg/fanout:flex-row @lg/fanout:items-start @lg/fanout:justify-between">
            <CardTitle className="min-w-0 text-2xl tracking-tight">
              {currentCombination ? (
                <LiveSearchTitle text={currentCombination} />
              ) : (
                "Searching jobs"
              )}
            </CardTitle>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatElapsed(elapsedSeconds)} elapsed
            </span>
          </div>
          <CardDescription className="text-base">
            <strong className="text-foreground">{fanout.termCount}</strong>{" "}
            roles ·{" "}
            <strong className="text-foreground">{fanout.locationCount}</strong>{" "}
            locations ·{" "}
            <strong className="text-foreground">{fanout.sourceCount}</strong>{" "}
            job boards ·{" "}
            <strong className="text-foreground">{fanout.total}</strong>{" "}
            combinations
          </CardDescription>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 @xl/fanout:flex-row @xl/fanout:items-end @xl/fanout:justify-between">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <span className="font-semibold text-emerald-400">
                  {complete}
                </span>
                <span className="font-sans text-muted-foreground">
                  complete
                </span>
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <span className="font-semibold text-amber-400">{running}</span>
                <span className="font-sans text-muted-foreground">running</span>
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <span className="font-semibold text-muted-foreground">
                  {queued}
                </span>
                <span className="font-sans text-muted-foreground">queued</span>
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-2 font-mono text-xs tabular-nums">
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <NumberFlow
                  className="font-semibold"
                  value={fanout.results}
                  locales="en-GB"
                  isolate
                />
                <span className="font-sans text-muted-foreground">results</span>
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <NumberFlow
                  className="font-semibold"
                  value={fanout.unique}
                  locales="en-GB"
                  isolate
                />
                <span className="font-sans text-muted-foreground">unique</span>
              </span>
            </div>
          </div>
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${complete} complete, ${running} running, ${queued} queued`}
            aria-valuemax={fanout.total}
            aria-valuemin={0}
            aria-valuenow={complete}
          >
            <Segment
              className="bg-emerald-400"
              count={complete}
              total={fanout.total}
            />
            <Segment
              className="bg-amber-500"
              count={running}
              total={fanout.total}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 border-t p-3 @lg/fanout:p-4 @3xl/fanout:p-5">
        {challenges.map((challenge) => (
          <PipelineActionRequired
            key={challenge.extractorId}
            title={challenge.extractorName}
            description="Complete the browser check to continue this job board."
            actionLabel="Solve"
            pendingLabel="Solving…"
            pending={solvingExtractor === challenge.extractorId}
            onAction={() => onSolveChallenge(challenge.extractorId)}
          />
        ))}

        <section className="overflow-hidden rounded-xl border">
          <div className="flex flex-col gap-1 border-b px-4 py-4">
            <h2 className="text-sm font-semibold">Progress by role</h2>
          </div>

          {activeRoles.map((role) => (
            <RoleRow key={role.role} role={role} />
          ))}

          {queuedRoles.length > 0 || doneRoles.length > 0 ? (
            <Accordion type="multiple">
              {queuedRoles.length > 0 ? (
                <AccordionItem value="queued-roles" className="last:border-b-0">
                  <AccordionTrigger className="min-h-14 px-4 py-3 hover:bg-muted/30 hover:no-underline">
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-2 text-sm font-semibold">
                      <span>
                        {queuedRoles.length}{" "}
                        {queuedRoles.length === 1 ? "role" : "roles"} queued
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    {queuedRoles.map((role) => (
                      <RoleRow key={role.role} role={role} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ) : null}

              {doneRoles.length > 0 ? (
                <AccordionItem value="done-roles" className="last:border-b-0">
                  <AccordionTrigger className="min-h-14 px-4 py-3 hover:bg-muted/30 hover:no-underline">
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-2 text-sm font-semibold">
                      <span>
                        {doneRoles.length}{" "}
                        {doneRoles.length === 1 ? "role" : "roles"} done
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    {doneRoles.map((role) => (
                      <RoleRow key={role.role} role={role} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ) : null}
            </Accordion>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
};
