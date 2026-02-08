import type { Job } from "@shared/types.js";
import type React from "react";
import { TailoringWorkspace } from "../tailoring/TailoringWorkspace";

interface TailorModeProps {
  job: Job;
  onBack: () => void;
  onFinalize: () => void;
  isFinalizing: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  variant?: "discovered" | "ready";
}

export const TailorMode: React.FC<TailorModeProps> = ({
  job,
  onBack,
  onFinalize,
  isFinalizing,
  onDirtyChange,
  variant = "discovered",
}) => {
  return (
    <TailoringWorkspace
      mode="tailor"
      job={job}
      onBack={onBack}
      onFinalize={onFinalize}
      isFinalizing={isFinalizing}
      onDirtyChange={onDirtyChange}
      variant={variant}
    />
  );
};
