import type { JobSource } from "@shared/types";
import {
  AnimatePresence,
  motion,
  type TargetAndTransition,
  type Transition,
  useReducedMotion,
} from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sourceLabel } from "@/lib/utils";

const SOURCE_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export interface AutomaticSourcePickerRow {
  source: JobSource;
  selected: boolean;
  status: {
    badgeLabel: string;
    detail: string;
    available: boolean;
  };
}

interface AutomaticSourcePickerCardProps {
  sourceRows: AutomaticSourcePickerRow[];
  selectedSourceRows: AutomaticSourcePickerRow[];
  readySourceRows: AutomaticSourcePickerRow[];
  unavailableSourceRows: AutomaticSourcePickerRow[];
  onSourceToggle: (source: JobSource, checked: boolean) => void;
}

export function AutomaticSourcePickerCard({
  sourceRows,
  selectedSourceRows,
  readySourceRows,
  unavailableSourceRows,
  onSourceToggle,
}: AutomaticSourcePickerCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const sourceMotionTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: SOURCE_MOTION_EASE };
  const sourceSectionInitial = prefersReducedMotion
    ? false
    : { opacity: 0, y: -8 };
  const sourceSectionAnimate = { opacity: 1, y: 0 };
  const sourceRowInitial = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 0, y: 8, scale: 0.985 };
  const sourceRowExit = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: -6, scale: 0.985 };
  const availableCount = sourceRows.filter(
    (row) => row.status.available,
  ).length;

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="sources" className="border-b-0">
            <AccordionTrigger
              aria-label="Review and edit sources"
              className="gap-4 py-2 hover:no-underline"
            >
              <motion.div
                layout
                transition={sourceMotionTransition}
                className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <motion.div
                  layout
                  transition={sourceMotionTransition}
                  className="min-w-0 space-y-1"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {selectedSourceRows.length === 0
                      ? "Choose sources for this run"
                      : `${selectedSourceRows.length} source${selectedSourceRows.length === 1 ? "" : "s"} selected`}
                  </p>
                </motion.div>
                <motion.div
                  layout
                  transition={sourceMotionTransition}
                  className="flex shrink-0 flex-wrap gap-2"
                >
                  <Badge variant="outline" className="rounded-full">
                    {selectedSourceRows.length} selected
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {availableCount} available
                  </Badge>
                  {unavailableSourceRows.length > 0 ? (
                    <Badge variant="outline" className="rounded-full">
                      {unavailableSourceRows.length} unavailable
                    </Badge>
                  ) : null}
                </motion.div>
              </motion.div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <motion.div
                initial={sourceSectionInitial}
                animate={sourceSectionAnimate}
                transition={sourceMotionTransition}
                className="space-y-5"
              >
                <SourceGroup
                  label="Selected"
                  rows={selectedSourceRows}
                  transition={sourceMotionTransition}
                  rowInitial={sourceRowInitial}
                  rowAnimate={sourceSectionAnimate}
                  rowExit={sourceRowExit}
                  selected
                  onSourceToggle={onSourceToggle}
                />
                <SourceGroup
                  label="Available"
                  rows={readySourceRows}
                  transition={sourceMotionTransition}
                  rowInitial={sourceRowInitial}
                  rowAnimate={sourceSectionAnimate}
                  rowExit={sourceRowExit}
                  onSourceToggle={onSourceToggle}
                />
                <UnavailableSourceGroup
                  rows={unavailableSourceRows}
                  transition={sourceMotionTransition}
                  rowInitial={sourceRowInitial}
                  rowAnimate={sourceSectionAnimate}
                  rowExit={sourceRowExit}
                />
              </motion.div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

interface SourceGroupProps {
  label: string;
  rows: AutomaticSourcePickerRow[];
  selected?: boolean;
  transition: Transition;
  rowInitial: TargetAndTransition;
  rowAnimate: TargetAndTransition;
  rowExit: TargetAndTransition;
  onSourceToggle: (source: JobSource, checked: boolean) => void;
}

function SourceGroup({
  label,
  rows,
  selected = false,
  transition,
  rowInitial,
  rowAnimate,
  rowExit,
  onSourceToggle,
}: SourceGroupProps) {
  if (rows.length === 0) return null;

  return (
    <motion.div layout transition={transition} className="space-y-2">
      <motion.p
        layout
        transition={transition}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
      >
        {label}
      </motion.p>
      <motion.div
        layout
        transition={transition}
        className="grid gap-2 md:grid-cols-2"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) => (
            <motion.div
              key={row.source}
              layout
              initial={rowInitial}
              animate={rowAnimate}
              exit={rowExit}
              transition={transition}
            >
              <Button
                type="button"
                variant="ghost"
                aria-label={sourceLabel[row.source]}
                aria-pressed={selected}
                title={
                  selected
                    ? "Included in this run."
                    : "Available for this location setup."
                }
                className={
                  selected
                    ? "flex h-auto w-full items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-3 text-left text-foreground transition-colors duration-200 hover:bg-primary/15"
                    : "flex h-auto w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-left text-foreground transition-colors duration-200 hover:bg-muted/40"
                }
                onClick={() => onSourceToggle(row.source, !selected)}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {sourceLabel[row.source]}
                  </span>
                </span>
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

interface UnavailableSourceGroupProps {
  rows: AutomaticSourcePickerRow[];
  transition: Transition;
  rowInitial: TargetAndTransition;
  rowAnimate: TargetAndTransition;
  rowExit: TargetAndTransition;
}

function UnavailableSourceGroup({
  rows,
  transition,
  rowInitial,
  rowAnimate,
  rowExit,
}: UnavailableSourceGroupProps) {
  if (rows.length === 0) return null;

  return (
    <motion.div layout transition={transition} className="space-y-2">
      <motion.p
        layout
        transition={transition}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
      >
        Currently unavailable
      </motion.p>
      <motion.div
        layout
        transition={transition}
        className="grid gap-2 md:grid-cols-2"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) => (
            <motion.div
              key={row.source}
              layout
              initial={rowInitial}
              animate={rowAnimate}
              exit={rowExit}
              transition={transition}
            >
              <Button
                type="button"
                variant="ghost"
                disabled
                aria-label={sourceLabel[row.source]}
                title={row.status.detail}
                className="flex h-auto w-full items-start justify-between gap-3 rounded-xl border border-border/50 bg-transparent px-3 py-3 text-left text-foreground/80 disabled:pointer-events-none disabled:opacity-100"
              >
                <span className="min-w-0 space-y-1">
                  <span className="block text-sm font-semibold">
                    {sourceLabel[row.source]}
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                    {row.status.detail}
                  </span>
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                >
                  {row.status.badgeLabel}
                </Badge>
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
