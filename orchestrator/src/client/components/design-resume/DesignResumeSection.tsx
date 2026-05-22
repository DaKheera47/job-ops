import { GripVertical } from "lucide-react";
import type React from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type DesignResumeSectionProps = {
  value: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  badge?: string;
  dragHandleProps?: {
    onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
    onDragEnd: () => void;
  };
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  isDragging?: boolean;
  isDragTarget?: boolean;
};

export function DesignResumeSection({
  value,
  title,
  subtitle,
  children,
  badge,
  dragHandleProps,
  onDragOver,
  onDrop,
  isDragging,
  isDragTarget,
}: DesignResumeSectionProps) {
  return (
    <AccordionItem
      value={value}
      className={cn(
        "group overflow-hidden rounded-xl border border-border/60 bg-card/40 px-0 transition-[border-color,background-color,opacity]",
        isDragging && "opacity-50",
        isDragTarget && "border-primary/50 bg-primary/5",
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center">
        {dragHandleProps && (
          <button
            type="button"
            draggable
            {...dragHandleProps}
            className="flex h-12 w-8 cursor-grab touch-none items-center justify-center text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing pl-2"
            aria-label={`Drag ${title} to reorder`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <AccordionTrigger
          className={cn(
            "py-3 text-left hover:no-underline flex-1",
            dragHandleProps ? "pl-2 pr-4" : "px-4",
          )}
        >
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
      </div>
      <AccordionContent className="px-4 pb-4 pt-0">{children}</AccordionContent>
    </AccordionItem>
  );
}
