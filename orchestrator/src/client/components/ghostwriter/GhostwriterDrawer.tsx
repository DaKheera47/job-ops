import type { Job } from "@shared/types";
import { PanelRightOpen } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { GhostwriterPanel } from "./GhostwriterPanel";

type GhostwriterDrawerProps = {
  job: Job | null;
  triggerClassName?: string;
};

export const GhostwriterDrawer: React.FC<GhostwriterDrawerProps> = ({
  job,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-8 gap-1.5 text-xs", triggerClassName)}
          disabled={!job}
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Ghostwriter
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-none lg:w-[50vw] xl:w-[40vw] 2xl:w-[30vw]"
      >
        <div className="border-b border-border/50 p-4 ">
          <SheetHeader className="space-y-2">
            <SheetTitle>Ghostwriter</SheetTitle>
            <SheetDescription>
              The Ghostwriter will use the context of this job and your resume,
              along with your writing style to help you craft the perfect
              message.
            </SheetDescription>
          </SheetHeader>
        </div>

        {job && (
          <div className="flex min-h-0 flex-1 p-4 pt-0">
            <GhostwriterPanel job={job} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
