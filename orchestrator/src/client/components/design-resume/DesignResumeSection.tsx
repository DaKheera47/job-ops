import type React from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type DesignResumeSectionProps = {
  value: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  badge?: string;
};

export function DesignResumeSection({
  value,
  title,
  subtitle,
  children,
  badge,
}: DesignResumeSectionProps) {
  return (
    <AccordionItem
      value={value}
      className="overflow-hidden rounded-xl border border-border/60 bg-card/40 px-0"
    >
      <AccordionTrigger className="px-4 py-3 text-left hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-4">
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              {subtitle}
            </p>
          </div>
          {badge ? (
            <div className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] uppercase text-muted-foreground h-full">
              {badge}
            </div>
          ) : null}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-0">{children}</AccordionContent>
    </AccordionItem>
  );
}
