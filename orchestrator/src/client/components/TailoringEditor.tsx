import type { Job } from "@shared/types.js";
import type React from "react";
import { TailoringWorkspace } from "./tailoring/TailoringWorkspace";

interface TailoringEditorProps {
  job: Job;
  onUpdate: () => void | Promise<void>;
  onDirtyChange?: (isDirty: boolean) => void;
  onRegisterSave?: (save: () => Promise<void>) => void;
  onBeforeGenerate?: () => boolean | Promise<boolean>;
}

export const TailoringEditor: React.FC<TailoringEditorProps> = ({
  job,
  onUpdate,
  onDirtyChange,
  onRegisterSave,
  onBeforeGenerate,
}) => {
  return (
    <TailoringWorkspace
      mode="editor"
      job={job}
      onUpdate={onUpdate}
      onDirtyChange={onDirtyChange}
      onRegisterSave={onRegisterSave}
      onBeforeGenerate={onBeforeGenerate}
    />
  );
};
