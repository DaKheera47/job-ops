import { ManualImportFlow } from "@client/components/ManualImportFlow";
import type { AppSettings, JobSource } from "@shared/types";
import type React from "react";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutomaticRunTab } from "./AutomaticRunTab";
import type { AutomaticRunValues } from "./automatic-run";
import type { RunMode } from "./run-mode";

interface RunModeModalProps {
  open: boolean;
  mode: RunMode;
  settings: AppSettings | null;
  enabledSources: JobSource[];
  pipelineSources: JobSource[];
  onToggleSource: (source: JobSource, checked: boolean) => void;
  onSetPipelineSources: (sources: JobSource[]) => void;
  isPipelineRunning: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: RunMode) => void;
  onSaveAndRunAutomatic: (values: AutomaticRunValues) => Promise<void>;
  onManualImported: (jobId: string) => Promise<void>;
}

export const RunModeModal: React.FC<RunModeModalProps> = ({
  open,
  mode,
  settings,
  enabledSources,
  pipelineSources,
  onToggleSource,
  onSetPipelineSources,
  isPipelineRunning,
  onOpenChange,
  onModeChange,
  onSaveAndRunAutomatic,
  onManualImported,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Run jobs
            </SheetTitle>
            <SheetDescription>
              Choose Automatic pipeline run or Manual import.
            </SheetDescription>
          </SheetHeader>

          <Separator className="my-4" />

          <Tabs
            value={mode}
            onValueChange={(value) => onModeChange(value as RunMode)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="automatic">Automatic</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="automatic" className="min-h-0 flex-1">
              <AutomaticRunTab
                open={open}
                settings={settings}
                enabledSources={enabledSources}
                pipelineSources={pipelineSources}
                onToggleSource={onToggleSource}
                onSetPipelineSources={onSetPipelineSources}
                isPipelineRunning={isPipelineRunning}
                onSaveAndRun={onSaveAndRunAutomatic}
              />
            </TabsContent>

            <TabsContent value="manual" className="min-h-0 flex-1">
              <ManualImportFlow
                active={open && mode === "manual"}
                onImported={onManualImported}
                onClose={() => onOpenChange(false)}
              />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};
