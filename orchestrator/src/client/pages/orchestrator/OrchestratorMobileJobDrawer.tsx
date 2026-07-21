import type { Job, JobListItem } from "@shared/types.js";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import type { FilterTab } from "./constants";
import { JobDetailPanel } from "./JobDetailPanel";
import type { SelectedJobLoadState } from "./useOrchestratorData";

interface OrchestratorMobileJobDrawerProps {
  open: boolean;
  activeTab: FilterTab;
  activeJobs: JobListItem[];
  selectedJob: Job | null;
  selectedJobListItem: JobListItem | null;
  selectedJobLoadState: SelectedJobLoadState;
  onOpenChange: (open: boolean) => void;
  onSelectJobId: (jobId: string | null) => void;
  onJobUpdated: () => Promise<void>;
  onPauseRefreshChange: (paused: boolean) => void;
  onRetrySelectedJob: () => void;
}

export const OrchestratorMobileJobDrawer: React.FC<
  OrchestratorMobileJobDrawerProps
> = ({
  open,
  activeTab,
  activeJobs,
  selectedJob,
  selectedJobListItem,
  selectedJobLoadState,
  onOpenChange,
  onSelectJobId,
  onJobUpdated,
  onPauseRefreshChange,
  onRetrySelectedJob,
}) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="max-h-[90vh]">
      <div className="flex items-center justify-between px-4 pt-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Job details
        </div>
        <DrawerClose asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
            Close
          </Button>
        </DrawerClose>
      </div>
      <div className="max-h-[calc(90vh-3.5rem)] overflow-y-auto px-4 pb-6 pt-3">
        <JobDetailPanel
          activeTab={activeTab}
          activeJobs={activeJobs}
          selectedJob={selectedJob}
          selectedJobListItem={selectedJobListItem}
          selectedJobLoadState={selectedJobLoadState}
          onSelectJobId={onSelectJobId}
          onJobUpdated={onJobUpdated}
          onPauseRefreshChange={onPauseRefreshChange}
          onRetrySelectedJob={onRetrySelectedJob}
        />
      </div>
    </DrawerContent>
  </Drawer>
);
