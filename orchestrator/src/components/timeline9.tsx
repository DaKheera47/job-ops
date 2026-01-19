// https://www.shadcnblocks.com/block/timeline9

import * as React from "react";

import { cn } from "@/lib/utils";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type TimelineEntry = {
  date: string;
  title: string;
  content: React.ReactNode;
  dotClassName?: string;
};

const timelineData: TimelineEntry[] = [
  {
    date: "1956",
    title: "The Birth of AI",
    content: (
      <p>
        The term 'Artificial Intelligence' was coined at the Dartmouth Conference, marking the
        official beginning of AI as a field. John McCarthy, Marvin Minsky, Nathaniel Rochester,
        and Claude Shannon organized this seminal event, setting the stage for decades of research
        and development.
      </p>
    ),
  },
  {
    date: "1966-1973",
    title: "Early Optimism and First AI Winter",
    content: (
      <p>
        The early years saw significant optimism with programs like ELIZA (the first chatbot) and
        SHRDLU (a natural language understanding system). However, by the early 1970s, funding
        dried up as researchers faced the limitations of early computing power and the complexity
        of human intelligence.
      </p>
    ),
  },
  {
    date: "1980-1987",
    title: "Expert Systems and Revival",
    content: (
      <p>
        AI experienced a revival with the development of expert systems like MYCIN (for medical
        diagnosis) and DENDRAL (for chemical analysis). These systems used rule-based approaches to
        mimic human decision-making in specific domains, leading to renewed interest and funding in
        AI research.
      </p>
    ),
  },
  {
    date: "1997",
    title: "Deep Blue Defeats Chess Champion",
    content: (
      <p>
        IBM's Deep Blue became the first computer system to defeat a reigning world chess champion,
        Garry Kasparov, in a six-game match. This milestone demonstrated AI's potential to
        outperform humans in complex strategic games and captured the public's imagination.
      </p>
    ),
  },
];

interface Timeline9Props {
  className?: string;
  title?: string;
  entries?: TimelineEntry[];
  showTitle?: boolean;
  compact?: boolean;
}

const Timeline9 = ({
  className,
  title = "The History of Artificial Intelligence",
  entries = timelineData,
  showTitle = true,
  compact = false,
}: Timeline9Props) => {
  return (
    <section className={cn(compact ? "w-full" : "bg-background py-32", className)}>
      <div className={cn(compact ? "w-full" : "container")}>
        {showTitle && (
          <h1 className="mb-20 text-center text-3xl font-bold tracking-tighter text-foreground sm:text-6xl">
            {title}
          </h1>
        )}
        <div className={cn("relative", compact ? "w-full" : "mx-auto max-w-4xl")}>
          <Separator
            orientation="vertical"
            className={cn("absolute left-2 bg-muted", compact ? "top-3" : "top-4")}
          />
          {entries.map((entry, index) => (
            <div key={index} className={cn("relative pl-7", compact ? "mb-3" : "mb-10")}>
              <div
                className={cn(
                  "absolute left-0 flex size-3 items-center justify-center rounded-full",
                  entry.dotClassName ?? "bg-foreground",
                  compact ? "top-2" : "top-3.5"
                )}
              />
              <h4
                className={cn(
                  "rounded-xl tracking-tight",
                  compact
                    ? "text-[13px] font-semibold text-foreground/90"
                    : "py-2 text-xl font-bold xl:mb-4 xl:px-3"
                )}
              >
                {entry.title}
              </h4>

              <h5
                className={cn(
                  "rounded-xl tracking-tight text-muted-foreground",
                  compact ? "text-[10px] -mt-0.5" : "text-md top-3 -left-34 xl:absolute"
                )}
              >
                {entry.date}
              </h5>

              <Card
                className={cn(
                  "my-2 border-none shadow-none",
                  compact && "border border-border/50 bg-muted/10"
                )}
              >
                <CardContent className={cn(compact ? "px-3 py-1.5" : "px-0 xl:px-2")}>
                  <div
                    className={cn(
                      compact ? "text-xs text-muted-foreground/80 leading-relaxed" : "prose text-foreground dark:prose-invert"
                    )}
                  >
                    {entry.content}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export { Timeline9 };
