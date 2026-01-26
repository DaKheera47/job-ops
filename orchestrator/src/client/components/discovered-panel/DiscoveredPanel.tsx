import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Job } from "../../../shared/types";
import * as api from "../../api";
import { useRescoreJob } from "../../hooks/useRescoreJob";
import { DecideMode } from "./DecideMode";
import { EmptyState } from "./EmptyState";
import { ProcessingState } from "./ProcessingState";
import { TailorMode } from "./TailorMode";

type PanelMode = "decide" | "tailor";

interface DiscoveredPanelProps {
  job: Job | null;
  onJobUpdated: () => void | Promise<void>;
  onJobMoved: (jobId: string) => void;
}

export const DiscoveredPanel: React.FC<DiscoveredPanelProps> = ({
  job,
  onJobUpdated,
  onJobMoved,
}) => {
  const [mode, setMode] = useState<PanelMode>("decide");
  const [isSkipping, setIsSkipping] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const { isRescoring, rescoreJob } = useRescoreJob(onJobUpdated);

  useEffect(() => {
    setMode("decide");
    setIsSkipping(false);
    setIsFinalizing(false);
  }, []);

  const handleSkip = async () => {
    if (!job) return;
    try {
      setIsSkipping(true);
      await api.skipJob(job.id);
      toast.message("Job skipped");
      onJobMoved(job.id);
      await onJobUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to skip job";
      toast.error(message);
    } finally {
      setIsSkipping(false);
    }
  };

  const handleFinalize = async () => {
    if (!job) return;
    try {
      setIsFinalizing(true);
      await api.processJob(job.id);

      toast.success("Job moved to Ready", {
        description: "Your tailored PDF has been generated.",
      });

      onJobMoved(job.id);
      await onJobUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to finalize job";
      toast.error(message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleRescore = () => rescoreJob(job?.id);

  if (!job) {
    return <EmptyState />;
  }

  if (job.status === "processing") {
    return <ProcessingState />;
  }

  return (
    <div className="h-full">
      {mode === "decide" ? (
        <DecideMode
          job={job}
          onTailor={() => setMode("tailor")}
          onSkip={handleSkip}
          isSkipping={isSkipping}
          onRescore={handleRescore}
          isRescoring={isRescoring}
          onCheckSponsor={async () => {
            await api.checkSponsor(job.id);
            await onJobUpdated();
          }}
        />
      ) : (
        <TailorMode
          job={job}
          onBack={() => setMode("decide")}
          onFinalize={handleFinalize}
          isFinalizing={isFinalizing}
        />
      )}
    </div>
  );
};

export default DiscoveredPanel;
