import type { Job, JobBrief } from "@shared/types.js";
import { Sparkles } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

type JobBriefPaneProps = {
  job: Job;
  className?: string;
};

export const JobBriefPane: React.FC<JobBriefPaneProps> = ({
  job,
  className,
}) => {
  const brief = parseJobBrief(job.jobBrief);

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
    <section className={cn("space-y-4", className)}>
      <p className="text-lg font-bold leading-7 text-foreground border-border p-4 rounded-lg bg-muted/50 flex items-center gap-2">
        {brief.role_summary}
      </p>

      <div className="grid gap-y-6 gap-x-2 lg:grid-cols-2">
        <BulletSection title="Company offers" items={brief.company_offers} />
        <BulletSection title="They want" items={brief.they_want} />
        <BulletSection
          title="Missing or unclear"
          items={brief.missing_or_unclear}
        />

        {brief.specifics.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Highlights
            </div>
            <div className="flex flex-wrap gap-1.5">
              {brief.specifics.map((item) => (
                <span
                  key={item}
                  className="whitespace-nowrap inline-flex items-center text-foreground bg-muted/50 rounded-lg px-2 py-1"
                >
                  <span className="truncate">{item}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
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

const BulletSection: React.FC<{ title: string; items: string[] }> = ({
  title,
  items,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-1.5 leading-6 text-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/45" />
            <span>{item}</span>
          </li>
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
