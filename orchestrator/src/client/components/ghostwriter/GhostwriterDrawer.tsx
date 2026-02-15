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
    <Sheet
      open={open}
      onOpenChange={setOpen}
    >
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={!job}
        >
          <PanelRightOpen className='h-3.5 w-3.5' />
          Ghostwriter
        </Button>
      </SheetTrigger>

      <SheetContent
        side='right'
        className='w-full p-0 sm:max-w-none lg:w-[50vw] xl:w-[40vw] 2xl:w-[30vw]'
      >
        <div className="h-full overflow-y-auto p-4">
          <SheetHeader>
            <SheetTitle>Ghostwriter</SheetTitle>
            <SheetDescription>
              The Ghostwriter will use the context of this job and your resume,
              along with your writing style to help you craft the perfect
              message.
            </SheetDescription>
          </SheetHeader>
          {job && (
            <div className="mt-4">
              <GhostwriterPanel job={job} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
