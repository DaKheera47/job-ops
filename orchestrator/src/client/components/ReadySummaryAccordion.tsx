import type { LucideIcon } from "lucide-react";
import type React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ReadySummaryAccordionProps {
  children: React.ReactNode;
  icon: LucideIcon;
  summary: React.ReactNode;
  value: string;
}

export const ReadySummaryAccordion: React.FC<ReadySummaryAccordionProps> = ({
  children,
  icon: Icon,
  summary,
  value,
}) => {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={value} className="border-none">
        <AccordionTrigger className="cursor-pointer rounded-xl border border-border/40 px-2 py-1 hover:bg-muted/50 hover:no-underline data-[state=open]:rounded-b-none data-[state=open]:bg-muted/10 data-[state=open]:pb-2">
          <div className="flex items-center gap-3 w-full">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-medium text-foreground leading-tight">
                {summary}
              </div>
            </div>
          </div>
        </AccordionTrigger>

        <AccordionContent className="rounded-b-xl border border-border/40 bg-muted/10 pt-4 pl-13">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
