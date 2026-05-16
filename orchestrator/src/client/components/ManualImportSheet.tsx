/**
 * Manual job import flow (paste JD -> infer -> review -> import).
 */

import type { ManualJobDraft } from "@shared/types.js";
import { FileText } from "lucide-react";
import type React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ManualImportFlow,
  type ManualImportResult,
  type ManualImportTrackingSource,
} from "./ManualImportFlow";

interface ManualImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: ManualImportResult) => void | Promise<void>;
  initialDraft?: ManualJobDraft | null;
  initialSource?: ManualImportTrackingSource | null;
  initialSourceHost?: string | null;
}

export const ManualImportSheet: React.FC<ManualImportSheetProps> = ({
  open,
  onOpenChange,
  onImported,
  initialDraft,
  initialSource,
  initialSourceHost,
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
              initialDraft={initialDraft}
              initialSource={initialSource}
              initialSourceHost={initialSourceHost}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
