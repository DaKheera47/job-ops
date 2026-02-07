/**
 * Manual job import flow (paste JD -> infer -> review -> import).
 */

import { FileText } from "lucide-react";
import type React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ManualImportFlow } from "./ManualImportFlow";

interface ManualImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (jobId: string) => void | Promise<void>;
}

export const ManualImportSheet: React.FC<ManualImportSheetProps> = ({
  open,
  onOpenChange,
  onImported,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-hidden">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </span>
              Manual Import
            </SheetTitle>
            <SheetDescription>
              Paste a job description, review the AI draft, then import the
              role.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 min-h-0 flex-1">
            <ManualImportFlow
              active={open}
              onImported={onImported}
              onClose={() => onOpenChange(false)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
