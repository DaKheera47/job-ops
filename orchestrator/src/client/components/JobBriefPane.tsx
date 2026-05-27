import type { Job, JobBrief } from "@shared/types.js";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

type JobBriefPaneProps = {
  job: Job;
  className?: string;
};

const CARD_ENTER_TRANSITION = { duration: 0.1, ease: "easeOut" } as const;
const BULLET_ENTER_TRANSITION = { duration: 0.1, ease: "easeOut" } as const;
const BULLET_STAGGER_SECONDS = 0.015;
const BULLET_STAGGER_BASE_DELAY = 0.03;
const HIGHLIGHT_X_OFFSET = 6;
const FADE_ONLY_BULLET_SECTIONS = new Set(["Company offers", "They want"]);

export const JobBriefPane: React.FC<JobBriefPaneProps> = ({
  job,
  className,
}) => {
  const brief = parseJobBrief(job.jobBrief);
  const prefersReducedMotion = useReducedMotion();

  const bulletSections = useMemo(() => {
    if (!brief) return [];
    return [
      { title: "Company offers", items: brief.company_offers },
      { title: "They want", items: brief.they_want },
      { title: "Missing or unclear", items: brief.missing_or_unclear },
    ];
  }, [brief]);

  const bulletSectionsWithOffset = useMemo(() => {
    let offset = 0;
    return bulletSections.map((section) => {
      const startIndex = offset;
      offset += section.items.length;
      return { ...section, startIndex };
    });
  }, [bulletSections]);

  if (!brief) {
    return (
      <section
        className={cn(
          "rounded-lg border border-border/45 bg-muted/5 px-4 py-3",
          className,
        )}
      >
        <FitLine job={job} />
        <p className="mt-2 text-xs text-muted-foreground">
          Recalculate match to generate a concise JD brief.
        </p>
      </section>
    );
  }

  return (
    <motion.section
      key={job.id}
      className={cn("@container/brief space-y-8", className)}
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={CARD_ENTER_TRANSITION}
    >
      <p className="text-lg font-bold leading-7 text-foreground">
        {brief.role_summary}
      </p>

      {brief.specifics.length > 0 && (
        <HighlightsSection
          jobId={job.id}
          items={brief.specifics}
          prefersReducedMotion={prefersReducedMotion}
        />
      )}

      <div className="flex flex-col gap-6 @3xl/brief:grid @3xl/brief:grid-cols-3 @3xl/brief:gap-x-4 @3xl/brief:gap-y-6">
        {bulletSectionsWithOffset.map((section) => (
          <BulletSection
            key={section.title}
            jobId={job.id}
            title={section.title}
            items={section.items}
            startIndex={section.startIndex}
            fadeOnly={FADE_ONLY_BULLET_SECTIONS.has(section.title)}
            prefersReducedMotion={prefersReducedMotion}
          />
        ))}
      </div>
    </motion.section>
  );
};

const FitLine: React.FC<{ job: Job }> = ({ job }) => {
  if (!job.suitabilityReason) return null;

  return (
    <div className="flex gap-2 rounded-md border border-primary/15 bg-background/35 p-4 leading-5 text-foreground/85">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/75" />
      <span>
        {job.suitabilityScore != null && (
          <span className="font-semibold tabular-nums">
            {job.suitabilityScore}/100:{" "}
          </span>
        )}
        {job.suitabilityReason}
      </span>
    </div>
  );
};

const HighlightsSection: React.FC<{
  jobId: string;
  items: string[];
  prefersReducedMotion: boolean | null;
}> = ({ jobId, items, prefersReducedMotion }) => (
  <div className="w-full space-y-2">
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Highlights
    </div>
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
          <motion.span
            key={`${jobId}-highlight-${index}-${item}`}
            className="inline-flex items-center whitespace-nowrap rounded-lg border border-border/45 bg-background px-2 py-1 text-foreground shadow-sm"
            initial={
              prefersReducedMotion ? false : { opacity: 0, x: HIGHLIGHT_X_OFFSET }
            }
            animate={{ opacity: 1, x: 0 }}
            transition={{
              ...BULLET_ENTER_TRANSITION,
              delay: prefersReducedMotion
                ? 0
                : BULLET_STAGGER_BASE_DELAY +
                  index * BULLET_STAGGER_SECONDS,
            }}
          >
            <span className="truncate">{item}</span>
          </motion.span>
      ))}
    </div>
  </div>
);

const BulletSection: React.FC<{
  jobId: string;
  title: string;
  items: string[];
  startIndex: number;
  fadeOnly: boolean;
  prefersReducedMotion: boolean | null;
}> = ({
  jobId,
  title,
  items,
  startIndex,
  fadeOnly,
  prefersReducedMotion,
}) => {
  if (items.length === 0) return null;

  const bulletInitial = prefersReducedMotion
    ? false
    : fadeOnly
      ? { opacity: 0 }
      : { opacity: 0, y: 4 };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-1.5 leading-6 text-foreground">
        {items.map((item, index) => (
          <motion.li
            key={`${jobId}-${title}-${index}-${item}`}
            className="flex gap-2"
            initial={bulletInitial}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...BULLET_ENTER_TRANSITION,
              delay: prefersReducedMotion
                ? 0
                : BULLET_STAGGER_BASE_DELAY +
                  (startIndex + index) * BULLET_STAGGER_SECONDS,
            }}
          >
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/45" />
            <span>{item}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
};

export function parseJobBrief(value: string | null): JobBrief | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<JobBrief>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.role_summary !== "string") return null;

    return {
      role_summary: parsed.role_summary,
      they_want: toStringList(parsed.they_want),
      specifics: toStringList(parsed.specifics),
      company_offers: toStringList(parsed.company_offers),
      practical_details: toStringList(parsed.practical_details),
      missing_or_unclear: toStringList(parsed.missing_or_unclear),
      repeated_signals: toStringList(parsed.repeated_signals),
    };
  } catch {
    return null;
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
